import {randomUUID,createHash} from 'node:crypto';
import {localDate,nextDate,dayStart,validDate,validateKnowledge} from './knowledge-schema.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class KnowledgeStore {
  constructor(raw){this.raw=raw;this.db=raw.db;this.db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_jobs(chat TEXT,date TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,error TEXT,PRIMARY KEY(chat,date));
    CREATE TABLE IF NOT EXISTS daily_digests(chat TEXT,date TEXT,status TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT,coverage TEXT NOT NULL,generated_at TEXT,PRIMARY KEY(chat,date));
    CREATE TABLE IF NOT EXISTS digest_revisions(chat TEXT,date TEXT,revision INTEGER,status TEXT,payload TEXT,generated_at TEXT,PRIMARY KEY(chat,date,revision));
    CREATE TABLE IF NOT EXISTS knowledge_topics(chat TEXT,topic_id TEXT,title TEXT,status TEXT,payload TEXT,version INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(chat,topic_id));
    CREATE TABLE IF NOT EXISTS topic_revisions(chat TEXT,topic_id TEXT,version INTEGER,date TEXT,digest_revision INTEGER,status TEXT,payload TEXT,source_ids TEXT,generated_at TEXT,PRIMARY KEY(chat,topic_id,version));
    CREATE TABLE IF NOT EXISTS knowledge_schedule(chat TEXT PRIMARY KEY,timezone TEXT NOT NULL,next_date TEXT,last_successful_day TEXT,current_job TEXT,error TEXT,next_model_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS knowledge_identity(chat TEXT,date TEXT,position INTEGER,topic_id TEXT,source_ids TEXT NOT NULL,PRIMARY KEY(chat,date,position));
    UPDATE knowledge_jobs SET status='pending',error='interrupted' WHERE status='running';
    UPDATE knowledge_schedule SET current_job=NULL;
  `);}
  changed(chat,id){
    // Conservative dependency invalidation: later digests can incorporate earlier
    // topics. Remove derived bodies immediately; replay all days, preserving only
    // stable IDs and revision audit metadata. Raw rows are never changed here.
    this.onInvalidate?.(chat);
    if(!this.db.prepare('SELECT 1 FROM daily_digests WHERE chat=? LIMIT 1').get(chat))return;
    if(id&&!this.db.prepare('SELECT 1 FROM topic_revisions WHERE chat=? AND EXISTS(SELECT 1 FROM json_each(source_ids) WHERE value=?) LIMIT 1').get(chat,id)&&!this.db.prepare('SELECT 1 FROM daily_digests WHERE chat=? AND EXISTS(SELECT 1 FROM json_each(payload,\'$.source_message_ids\') WHERE value=?) LIMIT 1').get(chat,id))return;
    this.db.prepare("UPDATE daily_digests SET status='dirty',payload=NULL WHERE chat=?").run(chat);
    this.db.prepare("UPDATE digest_revisions SET status='invalid',payload=NULL WHERE chat=?").run(chat);
    this.db.prepare("UPDATE knowledge_topics SET status='dirty',title='',payload=NULL WHERE chat=?").run(chat);
    this.db.prepare("UPDATE topic_revisions SET status='invalid',payload=NULL WHERE chat=?").run(chat);
    this.db.prepare("UPDATE knowledge_jobs SET status='pending',attempts=0,next_attempt=0,error=NULL WHERE chat=?").run(chat);
    this.db.prepare('UPDATE knowledge_schedule SET next_date=(SELECT MIN(date) FROM knowledge_jobs WHERE chat=?),last_successful_day=NULL WHERE chat=?').run(chat,chat);
  }
  inserted(chat,time){
    const s=this.db.prepare('SELECT * FROM knowledge_schedule WHERE chat=?').get(chat);if(!s)return;
    const date=localDate(time,s.timezone);
    if(date<s.next_date){
      this.db.prepare("INSERT OR IGNORE INTO knowledge_jobs(chat,date,status) VALUES(?,?,'pending')").run(chat,date);
      this.db.prepare('UPDATE knowledge_schedule SET next_date=? WHERE chat=?').run(date,chat);
      this.onInvalidate?.(chat);
    }
    if(this.db.prepare('SELECT 1 FROM daily_digests WHERE chat=? AND date>=? LIMIT 1').get(chat,date))this.changed(chat);
  }
  leave(chat){for(const t of ['knowledge_jobs','daily_digests','digest_revisions','knowledge_topics','topic_revisions','knowledge_schedule','knowledge_identity'])this.db.prepare(`DELETE FROM ${t} WHERE chat=?`).run(chat);this.onInvalidate?.(chat);}
  prepare(chat,timezone,due){
    let s=this.db.prepare('SELECT * FROM knowledge_schedule WHERE chat=?').get(chat);
    if(s&&s.timezone!==timezone)throw Error('knowledge_timezone_changed_requires_reset');
    if(!s){const first=this.db.prepare('SELECT MIN(time) t FROM messages WHERE chat=?').get(chat).t;if(first===null)return null;this.db.prepare('INSERT INTO knowledge_schedule(chat,timezone,next_date) VALUES(?,?,?)').run(chat,timezone,localDate(first,timezone));s=this.db.prepare('SELECT * FROM knowledge_schedule WHERE chat=?').get(chat);}
    if(!s.next_date||s.next_date>due)return null;
    this.db.prepare("INSERT OR IGNORE INTO knowledge_jobs(chat,date,status) VALUES(?,?,'pending')").run(chat,s.next_date);
    return this.db.prepare('SELECT * FROM knowledge_jobs WHERE chat=? AND date=?').get(chat,s.next_date);
  }
  snapshot(chat,date,c){
    const start=dayStart(date,c.timezone),end=dayStart(nextDate(date),c.timezone),h=this.raw.sync(chat);
    if(!h.initial_complete||h.state!=='complete'||!Number.isFinite(Date.parse(h.last_reconciled_at))||Date.parse(h.last_reconciled_at)<end)throw Error('knowledge_history_incomplete');
    if(this.raw.lowerBound()>start)throw Error('knowledge_retention_incomplete');
    const size=this.db.prepare('SELECT COUNT(*) n,COALESCE(SUM(length(text)+length(metadata)+length(id)+length(sender)),0) chars FROM messages WHERE chat=? AND time>=? AND time<?').get(chat,start,end);
    if(size.n>c.maxMessages||size.chars>c.maxInputChars)throw Error('knowledge_input_limit');
    const rows=this.db.prepare('SELECT id,time,sender,kind,text,metadata FROM messages WHERE chat=? AND time>=? AND time<? ORDER BY time,id LIMIT ?').all(chat,start,end,c.maxMessages+1);
    if(rows.length>c.maxMessages)throw Error('knowledge_input_limit');
    if(rows.some(m=>!this.raw.visible(chat,m.id)))throw Error('knowledge_pending_source');
    const messages=rows.map(r=>({id:r.id,time:new Date(r.time).toISOString(),sender:r.sender,type:r.kind,text:r.text,resources:JSON.parse(r.metadata).resources||[],limitations:JSON.parse(r.metadata).limitations}));
    const topics=this.db.prepare("SELECT * FROM knowledge_topics WHERE chat=? AND status='valid' ORDER BY topic_id LIMIT 51").all(chat).map(r=>({...JSON.parse(r.payload),topic_id:r.topic_id,version:r.version}));
    if(topics.length>50)throw Error('knowledge_topic_limit');
    const input={date,timezone:c.timezone,messages,topics};
    if(JSON.stringify(input).length>c.maxInputChars)throw Error('knowledge_input_limit');
    return {input,fingerprint:hash(input),coverage:{status:'complete',start:new Date(start).toISOString(),end:new Date(end).toISOString(),last_reconciled_at:h.last_reconciled_at,messageCount:messages.length,scope:'API-visible raw messages; attachments/reference content not fetched'}};
  }
  commit(chat,date,c,snapshot,text,now){
    const out=validateKnowledge(text,snapshot.input);
    this.db.exec('BEGIN IMMEDIATE');
    try{
      if(this.raw.stopped(chat)||this.snapshot(chat,date,c).fingerprint!==snapshot.fingerprint)throw Error('knowledge_input_changed');
      if(this.db.prepare('SELECT status FROM knowledge_jobs WHERE chat=? AND date=?').get(chat,date)?.status!=='running')throw Error('knowledge_job_changed');
      const at=new Date(now).toISOString(),revision=(this.db.prepare('SELECT revision FROM daily_digests WHERE chat=? AND date=?').get(chat,date)?.revision||0)+1;
      this.db.prepare('INSERT INTO daily_digests VALUES(?,?,?,?,?,?,?) ON CONFLICT(chat,date) DO UPDATE SET status=excluded.status,revision=excluded.revision,payload=excluded.payload,coverage=excluded.coverage,generated_at=excluded.generated_at').run(chat,date,out.digest.status,revision,JSON.stringify(out.digest),JSON.stringify(snapshot.coverage),at);
      this.db.prepare('INSERT INTO digest_revisions VALUES(?,?,?,?,?,?)').run(chat,date,revision,'valid',JSON.stringify(out.digest),at);
      for(const [i,t] of out.topics.entries()){
        const candidates=this.db.prepare('SELECT topic_id,source_ids FROM knowledge_identity WHERE chat=? AND date=?').all(chat,date).filter(row=>JSON.parse(row.source_ids).some(id=>t.source_message_ids.includes(id)));
        const previousId=candidates.length===1?candidates[0].topic_id:null;
        const topicId=t.topic_id||previousId||randomUUID();
        // Replayed new topics reuse ID only if it is not already materialized.
        if(!t.topic_id&&this.db.prepare("SELECT 1 FROM knowledge_topics WHERE chat=? AND topic_id=? AND status='valid'").get(chat,topicId))throw Error('knowledge_identity_conflict');
        const old=this.db.prepare('SELECT * FROM knowledge_topics WHERE chat=? AND topic_id=?').get(chat,topicId),version=(old?.version||0)+1;
        const firstSeen=old?.payload?JSON.parse(old.payload).first_seen_at:snapshot.input.messages.filter(m=>t.source_message_ids.includes(m.id)).map(m=>m.time).sort()[0]||at;
        const payload={...t,topic_id:topicId,first_seen_at:firstSeen,last_updated_at:at,version};
        this.db.prepare('INSERT INTO knowledge_topics VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(chat,topic_id) DO UPDATE SET title=excluded.title,status=excluded.status,payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at').run(chat,topicId,t.title,'valid',JSON.stringify(payload),version,old?.created_at||at,at);
        this.db.prepare('INSERT INTO topic_revisions VALUES(?,?,?,?,?,?,?,?,?)').run(chat,topicId,version,date,revision,'valid',JSON.stringify(payload),JSON.stringify(t.source_message_ids),at);
        this.db.prepare('INSERT OR REPLACE INTO knowledge_identity VALUES(?,?,?,?,?)').run(chat,date,i,topicId,JSON.stringify(t.source_message_ids));
      }
      this.db.prepare("UPDATE knowledge_jobs SET status='completed',error=NULL WHERE chat=? AND date=?").run(chat,date);
      this.db.prepare('UPDATE knowledge_schedule SET last_successful_day=?,next_date=?,current_job=NULL,error=NULL WHERE chat=?').run(date,nextDate(date),chat);
      this.db.exec('COMMIT');return out;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  sourceStatus(chat,ids){const missing=ids.filter(id=>!this.raw.get(chat,id));return {status:missing.length?'partial_unavailable':'available',unavailable_source_message_ids:missing,note:'模型派生资料，不是原始事实；消息来源可用不表示附件内容已读取。'};}
  list(chat,keyword='',offset=0){if(typeof keyword!=='string'||keyword.length>200||!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid knowledge query');return this.db.prepare("SELECT topic_id,title,version,updated_at FROM knowledge_topics WHERE chat=? AND status='valid' AND instr(lower(title),lower(?))>0 ORDER BY updated_at DESC,topic_id LIMIT 20 OFFSET ?").all(chat,keyword,offset);}
  read(chat,id){if(typeof id!=='string'||id.length>100)throw Error('Invalid topic');const r=this.db.prepare("SELECT * FROM knowledge_topics WHERE chat=? AND topic_id=? AND status='valid'").get(chat,id);if(!r)return null;const state=JSON.parse(r.payload);const revisions=this.db.prepare('SELECT version,date,digest_revision,status,source_ids,generated_at FROM topic_revisions WHERE chat=? AND topic_id=? ORDER BY version DESC LIMIT 5').all(chat,id).map(r=>({...r,source_ids:JSON.parse(r.source_ids).slice(0,10),source_count:JSON.parse(r.source_ids).length}));return {state,revisions,provenance:this.sourceStatus(chat,state.source_message_ids)};}
  daily(chat,date){if(!validDate(date))throw Error('Invalid date');const r=this.db.prepare("SELECT * FROM daily_digests WHERE chat=? AND date=? AND status IN ('complete','no_material_content')").get(chat,date);if(!r)return null;const digest=JSON.parse(r.payload);return {...r,payload:undefined,digest,coverage:JSON.parse(r.coverage),provenance:this.sourceStatus(chat,digest.source_message_ids)};}
}
