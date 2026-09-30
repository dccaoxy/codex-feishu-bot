// Host-recorded conversation references, never a reusable sending permission.
// Source identity comes from the durable Feishu inbox, not text matching or an LLM.
import {createHash} from 'node:crypto';
const MAX_TURNS=4,MAX_CONTEXTS=100,MAX_BYTES=24000;
const key=c=>[c.user,c.chat,c.thread];
const validContext=c=>c&&['p2p','group'].includes(c.type)&&['user','chat','thread','id'].every(k=>typeof c[k]==='string'&&c[k]);

export class SendContext {
  constructor(store){
    this.store=store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS owner_send_context (
      owner TEXT NOT NULL,chat TEXT NOT NULL,thread TEXT NOT NULL,id TEXT NOT NULL,
      source_ids TEXT NOT NULL,source_hashes TEXT NOT NULL,request TEXT NOT NULL,answer TEXT NOT NULL,
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,UNIQUE(owner,chat,thread,id));`);
  }
  sourceRecord(c,id){
    if(!validContext(c)||typeof id!=='string'||!id)return null;
    const row=this.store.db.prepare('SELECT payload,state FROM inbox WHERE chat=? AND id=?').get(c.chat,id);
    if(!row||!['pending','processing','done'].includes(row.state))return null;
    let p;try{p=JSON.parse(row.payload);}catch{return null;}
    const m=p?.message;
    if(p?.kind!=='message'||p.user!==c.user||m?.chat_type!==c.type||m.chat_id!==c.chat||m.message_id!==id||m.message_type!=='text'||typeof p.content?.text!=='string')return null;
    return {text:p.content.text.trim(),hash:createHash('sha256').update(row.payload).digest('hex')};
  }
  source(c,id){return this.sourceRecord(c,id)?.text??null;}
  validated(c,row){
    let ids,hashes;try{ids=JSON.parse(row.source_ids);hashes=JSON.parse(row.source_hashes);}catch{return null;}
    if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||!ids.includes(row.id))return null;
    if(!Array.isArray(hashes)||hashes.length!==ids.length||this.source(c,row.id)!==row.request||ids.some((id,i)=>this.sourceRecord(c,id)?.hash!==hashes[i]))return null;
    if(!row.request||row.request.length>6000||typeof row.answer!=='string'||!row.answer||row.answer.length>12000)return null;
    return {id:row.id,sourceIds:ids,request:row.request,answer:row.answer};
  }
  recent(c){
    if(!validContext(c))return [];
    const rows=this.store.db.prepare('SELECT * FROM owner_send_context WHERE owner=? AND chat=? AND thread=? ORDER BY sequence DESC LIMIT ?').all(...key(c),MAX_TURNS);
    const out=[];let bytes=0;
    for(const row of rows){
      const entry=this.validated(c,row);
      if(!entry){this.store.db.prepare('DELETE FROM owner_send_context WHERE sequence=?').run(row.sequence);continue;}
      const size=Buffer.byteLength(JSON.stringify(entry));
      if(bytes+size>MAX_BYTES)break;
      bytes+=size;out.push(entry);
    }
    return out.reverse();
  }
  remember(c,answer){
    if(!validContext(c)||typeof c.text!=='string'||typeof answer!=='string')return false;
    if(c.sourceIds!==undefined&&!Array.isArray(c.sourceIds)&&!(c.sourceIds instanceof Set))return false;
    const ids=c.sourceIds===undefined?[c.id]:Array.from(c.sourceIds);
    const row={id:c.id,source_ids:JSON.stringify(ids),source_hashes:JSON.stringify(ids.map(id=>this.sourceRecord(c,id)?.hash??null)),request:c.text.trim(),answer};
    const entry=this.validated(c,row);
    if(!entry||Buffer.byteLength(JSON.stringify(entry))>MAX_BYTES)return false;
    this.store.db.prepare('INSERT OR REPLACE INTO owner_send_context(owner,chat,thread,id,source_ids,source_hashes,request,answer) VALUES(?,?,?,?,?,?,?,?)').run(...key(c),row.id,row.source_ids,row.source_hashes,row.request,row.answer);
    this.store.db.prepare('DELETE FROM owner_send_context WHERE owner=? AND chat=? AND thread=? AND sequence NOT IN (SELECT sequence FROM owner_send_context WHERE owner=? AND chat=? AND thread=? ORDER BY sequence DESC LIMIT ?)').run(...key(c),...key(c),MAX_TURNS);
    // Bound both stored history and the number of private task contexts.
    this.store.db.prepare('DELETE FROM owner_send_context WHERE (owner,chat,thread) NOT IN (SELECT owner,chat,thread FROM owner_send_context GROUP BY owner,chat,thread ORDER BY MAX(sequence) DESC LIMIT ?)').run(MAX_CONTEXTS);
    return true;
  }
  restore(c,history){
    if(!validContext(c)||history?.sourceThreadId!==c.thread||!this.store.ownThread(c.thread)||this.store.chat(c.chat).thread!==c.thread||this.store.binding(c.chat))return 0;
    // Host completion records are more complete than the bounded RPC view.
    // Importing older turns one by one could evict a newer host record whose
    // RPC copy is clipped, lacks a client ID, or contains multiple user inputs.
    if(this.recent(c).length)return 0;
    let count=0;
    // Only this thread's bounded completed turns are eligible. Multiple user
    // inputs cannot be safely reconstructed without every source's identity.
    const turns=(Array.isArray(history.turns)?history.turns:[]).slice(0,8);
    if(history.order==='newest_first')turns.reverse();
    for(const turn of turns){
      if(turn.status!=='completed'||!Array.isArray(turn.messages))continue;
      const users=turn.messages.filter(m=>m.role==='user'),answers=turn.messages.filter(m=>m.role==='assistant');
      if(users.length!==1||!answers.length)continue;
      const id=users[0].clientId,answer=answers.at(-1);
      if(typeof id!=='string'||!id||answer.truncated===true||typeof answer.text!=='string')continue;
      if(this.store.db.prepare('SELECT 1 FROM owner_send_context WHERE owner=? AND chat=? AND thread=? AND id=?').get(...key(c),id))continue;
      const text=this.source(c,id);if(text===null)continue;
      if(this.remember({...c,id,text,sourceIds:[id]},answer.text))count++;
    }
    return count;
  }
  migrate(c,fromThread){
    if(!validContext(c)||typeof fromThread!=='string'||!fromThread||fromThread===c.thread||this.store.chat(c.chat).thread!==c.thread||!this.store.ownThread(c.thread)||!this.store.ownThread(fromThread)||this.store.binding(c.chat))return 0;
    let count=0;
    for(const row of this.recent({...c,thread:fromThread}))if(this.remember({...c,id:row.id,text:row.request,sourceIds:row.sourceIds},row.answer))count++;
    return count;
  }
}
