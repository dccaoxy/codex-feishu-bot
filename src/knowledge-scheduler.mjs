import {knowledgeConfig,lastDueDay,nextDate} from './knowledge-schema.mjs';
import {KnowledgeWorker} from './knowledge-worker.mjs';
const empty=()=>JSON.stringify({digest:{status:'no_material_content',summary:'',facts:[],decisions:[],viewpoints:[],actions:[],open_questions:[],resources:[],topics:[],source_message_ids:[]},topics:[]});
export class KnowledgeScheduler {
  constructor(config,raw,{allowed,busy,worker,clock=Date.now,log=()=>{}}){
    this.config=knowledgeConfig(config.groups?.knowledge);this.raw=raw;this.store=raw.knowledge;this.allowed=allowed;this.busy=busy;this.clock=clock;this.log=log;this.closed=false;
    this.chats=()=>config.groups.allowedChatIds;
    this.worker=worker||(this.config.enabled?new KnowledgeWorker(config,raw.dir+'/knowledge-worker'):null);
    this.store.onInvalidate=chat=>{if(this.active?.chat===chat)this.active.controller.abort();};
  }
  start(){if(!this.config.enabled)return;this.timer=setInterval(()=>{void this.tick();},60000);this.timer.unref();void this.tick();}
  preempt(){this.active?.controller.abort();}
  tick(){if(this.pending)return this.pending;this.pending=this.cycle().catch(()=>this.log('后台知识调度失败；群消息处理不受影响')).finally(()=>{this.pending=null;});return this.pending;}
  async cycle(){
    if(this.closed||!this.config.enabled||this.busy())return;
    if((this.raw.db.prepare('SELECT MAX(next_model_at) n FROM knowledge_schedule').get().n||0)>this.clock())return;
    let processed=0;
    for(const chat of this.chats()){
      if(!this.allowed(chat)||this.raw.stopped(chat))continue;
      while(processed<this.config.maxDaysPerCycle&&!this.closed&&!this.busy()){
        let job;try{job=this.store.prepare(chat,this.config.timezone,lastDueDay(this.clock(),this.config));}catch{this.log('知识时区发生变化，需要本机人工重建');break;}
        if(!job||job.status==='blocked'||job.next_attempt>this.clock())break;
        if(job.attempts>=3){this.raw.db.prepare("UPDATE knowledge_jobs SET status='blocked',error='knowledge_retry_limit' WHERE chat=? AND date=?").run(chat,job.date);break;}
        const controller=new AbortController();this.active={chat,controller};let snapshot;
        try{
          snapshot=this.store.snapshot(chat,job.date,this.config);
          this.raw.db.prepare("UPDATE knowledge_jobs SET status='running',attempts=attempts+1 WHERE chat=? AND date=?").run(chat,job.date);
          this.raw.db.prepare('UPDATE knowledge_schedule SET current_job=?,error=NULL WHERE chat=?').run(job.date,chat);
          processed++;
          if(snapshot.input.messages.length)this.raw.db.prepare('UPDATE knowledge_schedule SET next_model_at=? WHERE chat=?').run(this.clock()+60000,chat);
          const text=snapshot.input.messages.length?await this.worker.run(snapshot.input,controller.signal):empty();
          if(controller.signal.aborted||this.closed||this.busy()||!this.allowed(chat)||this.raw.stopped(chat))throw Error('knowledge_deferred');
          this.store.commit(chat,job.date,this.config,snapshot,text,this.clock());
        }catch(e){
          const defer=controller.signal.aborted||this.busy()||this.closed;
          const attempts=job.attempts+(!defer?1:0);
          const known=/^knowledge_[a-z_]+$/.test(e.message)?e.message:'knowledge_worker_failed';
          // Incomplete coverage is not a model failure. Other failures have a
          // bounded retry budget, persisted across restarts; never tight-loop.
          const wait=known==='knowledge_history_incomplete'||known==='knowledge_pending_source';
          if(known==='knowledge_retention_incomplete'){
            this.raw.db.prepare("UPDATE knowledge_jobs SET status='skipped',error=? WHERE chat=? AND date=?").run(known,chat,job.date);
            this.raw.db.prepare('UPDATE knowledge_schedule SET next_date=?,current_job=NULL,error=? WHERE chat=?').run(nextDate(job.date),known,chat);
            processed++;break;
          }
          this.raw.db.prepare('UPDATE knowledge_jobs SET status=?,attempts=?,next_attempt=?,error=? WHERE chat=? AND date=?').run(!defer&&!wait&&attempts>=3?'blocked':'pending',wait?job.attempts:attempts,this.clock()+60000*(2**Math.min(attempts,5)),defer?'deferred':known,chat,job.date);
          this.raw.db.prepare('UPDATE knowledge_schedule SET current_job=NULL,error=? WHERE chat=?').run(defer?'deferred':known,chat);
          if(!defer)this.log('后台知识整理延后或失败；保留原始消息，未发布半成品');
          if(snapshot?.input.messages.length)return;
          break;
        }finally{this.active=null;}
        // Only one model call per minute, including multi-day catch-up. A cycle
        // can advance empty days cheaply up to the configured day cap.
        if(snapshot?.input.messages.length)return;
      }
    }
  }
  async close(){this.closed=true;clearInterval(this.timer);this.preempt();await this.worker?.close?.();await this.pending;}
}
