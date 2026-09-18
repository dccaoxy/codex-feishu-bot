import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export class Store {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const filename = path.join(dir, 'state.sqlite');
    this.db = new DatabaseSync(filename);
    fs.chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pairing (code TEXT PRIMARY KEY, user TEXT UNIQUE NOT NULL,
        chat TEXT NOT NULL, expires INTEGER NOT NULL, lastSent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, thread TEXT, model TEXT, effort TEXT);
      CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, chat TEXT NOT NULL, payload TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', received INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (thread TEXT PRIMARY KEY, chat TEXT NOT NULL, turn TEXT, card TEXT,
        state TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', sequence INTEGER NOT NULL DEFAULT 0);`);
  }
  get(key) { return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value; }
  set(key, value) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, value); }
  requestPair(user, chat, now = Date.now()) {
    if (this.get('owner')) return null;
    this.db.prepare('DELETE FROM pairing WHERE expires<=?').run(now);
    const existing = this.db.prepare('SELECT * FROM pairing WHERE user=?').get(user);
    if (existing) {
      if (now - existing.lastSent < 30000) return null;
      this.db.prepare('UPDATE pairing SET lastSent=? WHERE user=?').run(now,user);
      return existing;
    }
    if (this.db.prepare('SELECT COUNT(*) AS n FROM pairing').get().n >= 50) return null;
    const code = randomBytes(5).toString('hex').toUpperCase();
    this.db.prepare('INSERT INTO pairing VALUES (?,?,?,?,?)').run(code,user,chat,now+15*60*1000,now);
    return {code,user,chat};
  }
  approvePair(code, now = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.get('owner')) throw new Error('机器人已绑定账号，不能用配对码覆盖。');
      const p = this.db.prepare('SELECT * FROM pairing WHERE code=? AND expires>?').get(code.toUpperCase(),now);
      if (!p) throw new Error('配对码无效或已过期，请重新私聊机器人获取。');
      this.set('owner',p.user); this.set('pairNotice',JSON.stringify({user:p.user,chat:p.chat}));
      this.db.exec('DELETE FROM pairing; COMMIT');
      return p;
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  chat(id) {
    this.db.prepare('INSERT OR IGNORE INTO chats(id) VALUES (?)').run(id);
    return this.db.prepare('SELECT * FROM chats WHERE id=?').get(id);
  }
  updateChat(id, fields) {
    this.chat(id);
    for (const key of ['thread', 'model', 'effort']) {
      if (Object.hasOwn(fields, key)) this.db.prepare(`UPDATE chats SET ${key}=? WHERE id=?`).run(fields[key], id);
    }
  }
  addThread(id, title) { this.db.prepare('INSERT OR REPLACE INTO threads VALUES (?,?,?)').run(id, title, Date.now()); }
  ownThread(id) { return this.db.prepare('SELECT * FROM threads WHERE id=?').get(id); }
  threads(query = '') {
    return this.db.prepare('SELECT * FROM threads ORDER BY updated DESC').all().filter(t => t.title.includes(query) || t.id.includes(query));
  }
  enqueue(id, chat, payload) {
    return this.db.prepare('INSERT OR IGNORE INTO inbox(id,chat,payload,received) VALUES (?,?,?,?)')
      .run(id, chat, JSON.stringify(payload), Date.now()).changes > 0;
  }
  pending() { return this.db.prepare("SELECT * FROM inbox WHERE state='pending' ORDER BY received, rowid").all(); }
  mark(id, state) { this.db.prepare('UPDATE inbox SET state=? WHERE id=?').run(state, id); }
  saveRun(r) {
    this.db.prepare('INSERT OR REPLACE INTO runs(thread,chat,turn,card,state,text,sequence) VALUES (?,?,?,?,?,?,?)')
      .run(r.thread, r.chat, r.turn || null, r.card || null, r.state, r.text || '', r.sequence || 0);
  }
  unfinished() { return this.db.prepare("SELECT * FROM runs WHERE state='running'").all(); }
  uncertain() { return this.db.prepare("SELECT * FROM inbox WHERE state='processing'").all(); }
  close() { this.db.close(); }
}
