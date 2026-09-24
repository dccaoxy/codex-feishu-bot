import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const clip = (x, n = 12000) => typeof x === 'string' ? x.slice(0,n) : '';
export function parseGroupMessage(m) {
  let c; const limitations = [], attachments = []; let text = '';
  try { c = JSON.parse(m.content); if (!c || typeof c !== 'object') throw new Error(); }
  catch { return {text:'', attachments, limitations:['内容 JSON 无法解析']}; }
  if (m.message_type === 'text') text = clip(c.text);
  else if (m.message_type === 'post') {
    const p = c.content ? c : (c.zh_cn || c.en_us || Object.values(c)[0]);
    if (!Array.isArray(p?.content)) limitations.push('富文本无法解析');
    else {
      text = clip(p.title) + '\n';
      for (const row of p.content.slice(0,200)) {
        if (!Array.isArray(row)) { limitations.push('富文本行无法解析'); continue; }
        for (const node of row.slice(0,100)) {
          if (['text','a','at'].includes(node?.tag)) text += clip(node.text || node.user_name,2000) + (node.tag === 'a' ? ` (${clip(node.href,1000)})` : '');
          else if (node?.tag === 'img') attachments.push({type:'image',key:clip(node.image_key,256)});
          else limitations.push('未解析的富文本节点');
        }
        text += '\n'; if (text.length > 12000) break;
      }
    }
  } else if (['image','file','audio','media','sticker'].includes(m.message_type)) {
    attachments.push({type:m.message_type,key:clip(c.file_key || c.image_key,256),name:clip(c.file_name,300),duration:Number.isFinite(c.duration)?c.duration:null});
  } else limitations.push('不支持的消息类型；未解析正文');
  if (attachments.length) limitations.push('附件仅保存引用，未下载或识别内容');
  if (text.length >= 12000 || m.content.length > 64000) limitations.push('长内容已截断');
  return {text:clip(text),attachments:attachments.slice(0,30),limitations:[...new Set(limitations)]};
}
export class GroupMessageStore {
  constructor(dir, retentionDays=30) {
    fs.mkdirSync(dir,{recursive:true,mode:0o700}); this.retentionDays=retentionDays;
    const file=path.join(dir,'groups.sqlite'); this.db=new DatabaseSync(file); fs.chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS messages(chat TEXT NOT NULL,id TEXT NOT NULL,sender TEXT NOT NULL,sender_type TEXT NOT NULL,time INTEGER NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,metadata TEXT NOT NULL,parent TEXT,root TEXT,thread TEXT,state TEXT NOT NULL,PRIMARY KEY(chat,id));
      CREATE INDEX IF NOT EXISTS group_time ON messages(chat,time,id);
      CREATE INDEX IF NOT EXISTS group_sender ON messages(chat,sender,time);
      CREATE TABLE IF NOT EXISTS documents(chat TEXT,id TEXT,PRIMARY KEY(chat,id));
      CREATE TABLE IF NOT EXISTS stopped(chat TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS recalls(chat TEXT,id TEXT,PRIMARY KEY(chat,id));`);
    // An accepted request is never replayed after a crash, even if no output was observed.
    this.db.exec("UPDATE messages SET state='uncertain' WHERE state IN ('queued','running','sending')"); this.prune();
  }
  stopped(chat) { return Boolean(this.db.prepare('SELECT 1 FROM stopped WHERE chat=?').get(chat)); }
  ingest(event, mentioned) {
    const m=event.message, sender=event.sender; const time=Number(m.create_time);
    if (!Number.isSafeInteger(time) || time < Date.now()-this.retentionDays*86400000 || time > Date.now()+300000) return false;
    if (this.stopped(m.chat_id) || this.db.prepare('SELECT 1 FROM recalls WHERE chat=? AND id=?').get(m.chat_id,m.message_id)) return false;
    const p=parseGroupMessage(m);
    return this.db.prepare('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(m.chat_id,m.message_id,sender.sender_id?.open_id || '',sender.sender_type,time,m.message_type,p.text,JSON.stringify(p),m.parent_id||null,m.root_id||null,m.thread_id||null,mentioned?'queued':'recorded').changes===1;
  }
  mark(chat,id,state) { this.db.prepare('UPDATE messages SET state=? WHERE chat=? AND id=?').run(state,chat,id); }
  get(chat,id) { return this.db.prepare('SELECT * FROM messages WHERE chat=? AND id=?').get(chat,id); }
  result(rows) {
    let remaining=24000;const result=[];
    for(const r of rows){
      const meta=JSON.parse(r.metadata);
      const item={messageId:r.id,sender:r.sender,time:new Date(r.time).toISOString(),type:r.kind,text:r.text.slice(0,2000),parentId:r.parent,rootId:r.root,threadId:r.thread,attachments:meta.attachments.slice(0,4),limitations:meta.limitations,truncated:r.text.length>2000||meta.attachments.length>4};
      const size=JSON.stringify(item).length;if(size>remaining)break;remaining-=size;result.push(item);
    }
    return result;
  }
  search(chat, {start,end,sender,keyword='',limit=30,offset=0}={}) {
    if(this.stopped(chat)) return [];
    if (!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>10000||typeof keyword!=='string'||keyword.length>200) throw new Error('检索参数无效');
    const lower = Date.now()-this.retentionDays*86400000;
    if([start,end].some(x=>x!==undefined&&(typeof x!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(x))))throw new Error('时间须包含时区');
    const from=start===undefined?lower:Date.parse(start), to=end===undefined?Date.now():Date.parse(end);
    if (!Number.isFinite(from)||!Number.isFinite(to)||from>to|| (sender!==undefined&&typeof sender!=='string')) throw new Error('时间或发送者无效');
    return this.result(this.db.prepare('SELECT * FROM messages WHERE chat=? AND time>=? AND time<=? AND (? IS NULL OR sender=?) AND instr(lower(text),lower(?))>0 ORDER BY time DESC,id DESC LIMIT ? OFFSET ?').all(chat,Math.max(from,lower),to,sender??null,sender??null,keyword,limit,offset));
  }
  context(chat,id,radius=3) {
    if(!Number.isInteger(radius)||radius<0||radius>10) throw new Error('上下文范围必须为0–10');
    const r=this.get(chat,id); if(!r||this.stopped(chat)||r.time<Date.now()-this.retentionDays*86400000) return [];
    const before=this.db.prepare('SELECT * FROM messages WHERE chat=? AND (time<? OR (time=? AND id<?)) ORDER BY time DESC,id DESC LIMIT ?').all(chat,r.time,r.time,id,radius).reverse();
    const after=this.db.prepare('SELECT * FROM messages WHERE chat=? AND (time>? OR (time=? AND id>?)) ORDER BY time,id LIMIT ?').all(chat,r.time,r.time,id,radius);
    return this.result([...before,r,...after].filter(x=>x.time>=Date.now()-this.retentionDays*86400000));
  }
  recall(chat,id) { this.db.prepare('INSERT OR IGNORE INTO recalls VALUES(?,?)').run(chat,id); this.db.prepare('DELETE FROM messages WHERE chat=? AND id=?').run(chat,id); }
  leave(chat) { this.db.prepare('INSERT OR IGNORE INTO stopped VALUES(?)').run(chat); this.db.prepare('DELETE FROM messages WHERE chat=?').run(chat); this.db.prepare('DELETE FROM documents WHERE chat=?').run(chat); }
  addDocument(chat,id) { this.db.prepare('INSERT OR IGNORE INTO documents VALUES(?,?)').run(chat,id); }
  hasDocument(chat,id) { return Boolean(this.db.prepare('SELECT 1 FROM documents WHERE chat=? AND id=?').get(chat,id)); }
  prune() { this.db.prepare('DELETE FROM messages WHERE time<?').run(Date.now()-this.retentionDays*86400000); this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); }
  close() { if(this.db.isOpen)this.db.close(); }
}
