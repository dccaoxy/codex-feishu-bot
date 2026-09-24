import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const clip = (x, n = 12000) => typeof x === 'string' ? x.slice(0,n) : '';
export function parseGroupMessage(m) {
  let c; const limitations = [], attachments = []; let text = '';
  try { c = JSON.parse(m.content); if (!c || typeof c !== 'object') throw new Error(); }
  catch { return {text:'', attachments, limitations:['内容 JSON 无法解析']}; }
  if (m.message_type === 'text') text = typeof c.text==='string'?c.text:'';
  else if (m.message_type === 'post') {
    const p = c.content ? c : (c.zh_cn || c.en_us || Object.values(c)[0]);
    if (!Array.isArray(p?.content)) limitations.push('富文本无法解析');
    else {
      text = clip(p.title) + '\n';
      for (const row of p.content) {
        if (!Array.isArray(row)) { limitations.push('富文本行无法解析'); continue; }
        for (const node of row) {
          if (['text','a','at'].includes(node?.tag)) text += (node.text || node.user_name || '') + (node.tag === 'a' ? ` (${clip(node.href,1000)})` : '');
          else if (node?.tag === 'img') attachments.push({type:'image',key:clip(node.image_key,256)});
          else limitations.push('未解析的富文本节点');
        }
        text += '\n';
      }
    }
  } else if (['image','file','audio','media','sticker'].includes(m.message_type)) {
    attachments.push({type:m.message_type,key:clip(c.file_key || c.image_key,256),name:clip(c.file_name,300),duration:Number.isFinite(c.duration)?c.duration:null});
  } else limitations.push('不支持的消息类型；未解析正文');
  if (attachments.length) limitations.push('附件仅保存引用，未下载或识别内容');

  return {text,resources:resourceReferences(m.content),attachments:attachments.slice(0,30),limitations:[...new Set(limitations)]};
}
export function resourceReferences(content) {
  const refs=new Map();
  for(const match of content.matchAll(/https:\/\/[a-zA-Z0-9.-]+\/(?:docx|docs|base|wiki|sheets)\/[a-zA-Z0-9]+(?:\?[^\s"<>\\]*)?/g)) {
    const u=new URL(match[0]);if(!/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname))continue;
    const [,type,id]=u.pathname.split('/');refs.set(u.href,{type,id,url:u.href,state:'reference_only',currentContentFetched:false});
  }
  return [...refs.values()];
}
export class GroupMessageStore {
  constructor(dir, retentionDays=null) {
    fs.mkdirSync(dir,{recursive:true,mode:0o700}); this.retentionDays=retentionDays; this.dir=dir;
    const file=path.join(dir,'groups.sqlite'); this.db=new DatabaseSync(file); fs.chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS messages(chat TEXT NOT NULL,id TEXT NOT NULL,sender TEXT NOT NULL,sender_type TEXT NOT NULL,time INTEGER NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,metadata TEXT NOT NULL,parent TEXT,root TEXT,thread TEXT,state TEXT NOT NULL,PRIMARY KEY(chat,id));
      CREATE INDEX IF NOT EXISTS group_time ON messages(chat,time,id);
      CREATE INDEX IF NOT EXISTS group_sender ON messages(chat,sender,time);
      CREATE TABLE IF NOT EXISTS documents(chat TEXT,id TEXT,PRIMARY KEY(chat,id));
      CREATE TABLE IF NOT EXISTS stopped(chat TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS recalls(chat TEXT,id TEXT,PRIMARY KEY(chat,id));
      CREATE TABLE IF NOT EXISTS history_sync(chat TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'partial', checkpoint TEXT, boundary TEXT, anchor TEXT, target_anchor TEXT, initial_complete INTEGER NOT NULL DEFAULT 0,last_reconciled_at TEXT,last_live_at TEXT);
      CREATE TABLE IF NOT EXISTS group_threads(chat TEXT PRIMARY KEY, thread_id TEXT, state TEXT NOT NULL DEFAULT 'new', cursor INTEGER NOT NULL DEFAULT 0, pending_cursor INTEGER, error TEXT);
      CREATE TABLE IF NOT EXISTS raw_messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,chat TEXT NOT NULL,id TEXT NOT NULL,content TEXT NOT NULL,UNIQUE(chat,id));
      INSERT OR IGNORE INTO raw_messages(chat,id,content) SELECT chat,id,'' FROM messages ORDER BY time,id;`);
    const syncColumns=new Set(this.db.prepare('PRAGMA table_info(history_sync)').all().map(x=>x.name));
    for(const field of ['oldest_message','newest_message'])if(!syncColumns.has(field))this.db.exec(`ALTER TABLE history_sync ADD COLUMN ${field} TEXT`);
    this.db.exec(`UPDATE history_sync SET oldest_message=(SELECT id FROM messages m WHERE m.chat=history_sync.chat ORDER BY time,id LIMIT 1),newest_message=anchor WHERE initial_complete=1 AND oldest_message IS NULL;`);
    // An accepted request is never replayed after a crash, even if no output was observed.
    this.db.exec("UPDATE messages SET state='uncertain' WHERE state IN ('queued','running','sending')"); this.prune();
  }
  stopped(chat) { return Boolean(this.db.prepare('SELECT 1 FROM stopped WHERE chat=?').get(chat)); }
  ingest(event, mentioned) {
    const m=event.message, sender=event.sender; const time=Number(m.create_time);
    if (!Number.isSafeInteger(time) || time < this.lowerBound() || time > Date.now()+300000) return false;
    if (this.stopped(m.chat_id) || this.db.prepare('SELECT 1 FROM recalls WHERE chat=? AND id=?').get(m.chat_id,m.message_id)) return false;
    const p=parseGroupMessage(m);
    const inserted=this.db.prepare('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(m.chat_id,m.message_id,sender.sender_id?.open_id || sender.sender_id?.app_id || '',sender.sender_type,time,m.message_type,p.text,JSON.stringify(p),m.parent_id||null,m.root_id||null,m.thread_id||null,mentioned?'queued':'recorded').changes===1;
    this.db.prepare('INSERT OR IGNORE INTO raw_messages(chat,id,content) VALUES(?,?,?)').run(m.chat_id,m.message_id,m.content);
    this.db.prepare("UPDATE raw_messages SET content=? WHERE chat=? AND id=? AND content=''").run(m.content,m.chat_id,m.message_id);
    return inserted;
  }
  read(chat,id,offset=0) {
    if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid text offset');
    const r=this.get(chat,id);if(!r||this.stopped(chat)||r.time<this.lowerBound())return null;
    return {messageId:id,time:new Date(r.time).toISOString(),text:r.text.slice(offset,offset+4000),nextOffset:offset+4000<r.text.length?offset+4000:null,limitations:JSON.parse(r.metadata).limitations};
  }
  claimLive(chat,id) {if(this.stopped(chat))return false;return this.db.prepare("UPDATE messages SET state='queued' WHERE chat=? AND id=? AND state='recorded'").run(chat,id).changes===1;}
  mark(chat,id,state) { this.db.prepare('UPDATE messages SET state=? WHERE chat=? AND id=?').run(state,chat,id); }
  get(chat,id) { return this.db.prepare('SELECT * FROM messages WHERE chat=? AND id=?').get(chat,id); }
  result(rows) {
    let remaining=24000;const result=[];
    for(const r of rows){
      const meta=JSON.parse(r.metadata);
      const item={messageId:r.id,sender:r.sender,time:new Date(r.time).toISOString(),type:r.kind,text:r.text.slice(0,2000),parentId:r.parent,rootId:r.root,threadId:r.thread,sequence:r.seq,resources:(meta.resources||[]).slice(0,8),attachments:meta.attachments.slice(0,4),limitations:meta.limitations,truncated:r.text.length>2000||meta.attachments.length>4||(meta.resources||[]).length>8};
      const size=JSON.stringify(item).length;if(size>remaining)break;remaining-=size;result.push(item);
    }
    return result;
  }
  search(chat, {start,end,sender,keyword='',limit=30,offset=0}={}) {
    if(this.stopped(chat)) return [];
    if (!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>Number.MAX_SAFE_INTEGER||typeof keyword!=='string'||keyword.length>200) throw new Error('检索参数无效');
    const lower = this.lowerBound();
    if([start,end].some(x=>x!==undefined&&(typeof x!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(x))))throw new Error('时间须包含时区');
    const from=start===undefined?lower:Date.parse(start), to=end===undefined?Date.now():Date.parse(end);
    if (!Number.isFinite(from)||!Number.isFinite(to)||from>to|| (sender!==undefined&&typeof sender!=='string')) throw new Error('时间或发送者无效');
    return this.result(this.db.prepare('SELECT * FROM messages WHERE chat=? AND time>=? AND time<=? AND (? IS NULL OR sender=?) AND instr(lower(text),lower(?))>0 ORDER BY time DESC,id DESC LIMIT ? OFFSET ?').all(chat,Math.max(from,lower),to,sender??null,sender??null,keyword,limit,offset));
  }
  context(chat,id,radius=3) {
    if(!Number.isInteger(radius)||radius<0||radius>10) throw new Error('上下文范围必须为0–10');
    const r=this.get(chat,id); if(!r||this.stopped(chat)||r.time<this.lowerBound()) return [];
    const before=this.db.prepare('SELECT * FROM messages WHERE chat=? AND (time<? OR (time=? AND id<?)) ORDER BY time DESC,id DESC LIMIT ?').all(chat,r.time,r.time,id,radius).reverse();
    const after=this.db.prepare('SELECT * FROM messages WHERE chat=? AND (time>? OR (time=? AND id>?)) ORDER BY time,id LIMIT ?').all(chat,r.time,r.time,id,radius);
    return this.result([...before,r,...after].filter(x=>x.time>=this.lowerBound()));
  }
  recall(chat,id) { this.db.prepare('INSERT OR IGNORE INTO recalls VALUES(?,?)').run(chat,id); this.db.prepare('DELETE FROM messages WHERE chat=? AND id=?').run(chat,id); this.db.prepare('DELETE FROM raw_messages WHERE chat=? AND id=?').run(chat,id); this.invalidateThread(chat); }
  leave(chat) { this.db.prepare('INSERT OR IGNORE INTO stopped VALUES(?)').run(chat); this.db.prepare('DELETE FROM messages WHERE chat=?').run(chat); this.db.prepare('DELETE FROM documents WHERE chat=?').run(chat); this.db.prepare('DELETE FROM raw_messages WHERE chat=?').run(chat);this.db.prepare('DELETE FROM history_sync WHERE chat=?').run(chat);this.invalidateThread(chat); }
  addDocument(chat,id) { this.db.prepare('INSERT OR IGNORE INTO documents VALUES(?,?)').run(chat,id); }
  hasDocument(chat,id) { return Boolean(this.db.prepare('SELECT 1 FROM documents WHERE chat=? AND id=?').get(chat,id)); }
  lowerBound() { return this.retentionDays===null?0:Date.now()-this.retentionDays*86400000; }
  sync(chat) { this.db.prepare('INSERT OR IGNORE INTO history_sync(chat) VALUES(?)').run(chat); return this.db.prepare('SELECT * FROM history_sync WHERE chat=?').get(chat); }
  setSync(chat, patch) { this.sync(chat); const keys=Object.keys(patch);if(keys.some(k=>!['state','checkpoint','boundary','anchor','target_anchor','initial_complete','last_reconciled_at','last_live_at','oldest_message','newest_message'].includes(k)))throw new Error('Invalid sync field');this.db.prepare(`UPDATE history_sync SET ${keys.map(k=>k+'=?').join(',')} WHERE chat=?`).run(...keys.map(k=>patch[k]),chat); }
  thread(chat) {this.db.prepare('INSERT OR IGNORE INTO group_threads(chat) VALUES(?)').run(chat);return this.db.prepare('SELECT * FROM group_threads WHERE chat=?').get(chat);}
  setThread(chat,patch) {this.thread(chat);const keys=Object.keys(patch);if(keys.some(k=>!['thread_id','state','cursor','pending_cursor','error'].includes(k)))throw new Error('Invalid thread field');this.db.prepare(`UPDATE group_threads SET ${keys.map(k=>k+'=?').join(',')} WHERE chat=?`).run(...keys.map(k=>patch[k]),chat);}
  invalidateThread(chat) {this.setThread(chat,{state:'invalidated',cursor:0,pending_cursor:null});this.onInvalidate?.(chat);}
  changes(chat,after=0,limit=15) {
    if(!Number.isSafeInteger(after)||after<0||!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Invalid cursor');
    if(this.stopped(chat))return {messages:[],cursor:after,hasMore:false};
    const rows=this.db.prepare('SELECT m.*,r.seq FROM raw_messages r JOIN messages m ON m.chat=r.chat AND m.id=r.id WHERE r.chat=? AND r.seq>? AND m.time>=? ORDER BY r.seq LIMIT ?').all(chat,after,this.lowerBound(),limit);
    const messages=this.result(rows),cursor=messages.at(-1)?.sequence??after;
    return {messages,cursor,hasMore:Boolean(this.db.prepare('SELECT 1 FROM raw_messages WHERE chat=? AND seq>? LIMIT 1').get(chat,cursor))};
  }
  coverage(chat) {const h=this.sync(chat);const b=this.db.prepare('SELECT COUNT(*) count,MIN(time) oldest,MAX(time) newest FROM messages WHERE chat=?').get(chat);return {...b,historicalSync:h.state,initialComplete:Boolean(h.initial_complete),lastReconciledAt:h.last_reconciled_at,oldestSyncedMessage:h.oldest_message,newestSyncedMessage:h.newest_message,retentionDays:this.retentionDays};}
  prune() { if(this.retentionDays!==null)for(const r of this.db.prepare('SELECT DISTINCT chat FROM messages WHERE time<?').all(this.lowerBound()))this.invalidateThread(r.chat); this.db.prepare('DELETE FROM messages WHERE time<?').run(this.lowerBound()); this.db.exec('DELETE FROM raw_messages WHERE NOT EXISTS(SELECT 1 FROM messages m WHERE m.chat=raw_messages.chat AND m.id=raw_messages.id); PRAGMA wal_checkpoint(TRUNCATE)'); }
  close() { if(this.db.isOpen)this.db.close(); }
}
