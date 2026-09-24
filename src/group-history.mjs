// History only transports records. It never dispatches mentions or starts a model turn.
export class GroupHistory {
  constructor(store,feishu,allowed,log=()=>{}) {this.store=store;this.feishu=feishu;this.allowed=allowed;this.log=log;this.running=new Map();this.closed=false;}
  reconcile(chat) {
    if(this.running.has(chat))return this.running.get(chat);
    const job=this.scan(chat).finally(()=>this.running.delete(chat));this.running.set(chat,job);return job;
  }
  async scan(chat) {
    if(this.closed||!this.allowed(chat)||this.store.stopped(chat))return;
    let h=this.store.sync(chat);
    if(!h.boundary)this.store.setSync(chat,{state:'syncing',boundary:String(Math.floor(Date.now()/1000)+1),checkpoint:null,target_anchor:null});
    else this.store.setSync(chat,{state:'syncing'});
    try {
      while(!this.closed&&this.allowed(chat)&&!this.store.stopped(chat)) {
        h=this.store.sync(chat);
        const d=await this.feishu.call(()=>this.feishu.client.im.v1.message.list({params:{container_id_type:'chat',container_id:chat,sort_type:'ByCreateTimeDesc',page_size:50,end_time:h.boundary,...(h.checkpoint?{page_token:h.checkpoint}:{})}}));
        if(this.closed||!this.allowed(chat)||this.store.stopped(chat))return;
        if(!Array.isArray(d.items))throw new Error('Missing history page');
        if(d.has_more&&(!d.page_token||d.page_token===h.checkpoint))throw new Error('Non advancing history cursor');
        // A live-event row is NOT proof of a continuous synced range. Only the
        // anchor from a fully committed prior scan can terminate reconciliation.
        const overlap=Boolean(h.initial_complete&&h.anchor&&d.items.some(x=>x.message_id===h.anchor));
        this.store.db.exec('BEGIN IMMEDIATE');
        try {
          for(const m of d.items) {
            if(m.chat_id&&m.chat_id!==chat)throw new Error('Wrong history chat');
            if(!m.message_id)throw new Error('Malformed history item');
            if(m.deleted){this.store.recall(chat,m.message_id);continue;}
            if(!m.msg_type||!m.body?.content)throw new Error('Malformed history item');
            this.store.ingest({sender:{sender_type:m.sender?.sender_type||'system',sender_id:{open_id:m.sender?.id||''}},message:{chat_id:chat,message_id:m.message_id,create_time:m.create_time,message_type:m.msg_type,content:m.body.content,parent_id:m.parent_id,root_id:m.root_id,thread_id:m.thread_id}},false);
          }
          if(d.items.length)this.store.setSync(chat,{...(!h.initial_complete?{oldest_message:d.items.at(-1).message_id}:{}),newest_message:h.target_anchor||d.items[0].message_id});
          const target=h.target_anchor||d.items[0]?.message_id||h.anchor;
          if(!d.has_more||overlap)this.store.setSync(chat,{state:'complete',initial_complete:1,anchor:target,checkpoint:null,boundary:null,target_anchor:null,last_reconciled_at:new Date().toISOString()});
          else this.store.setSync(chat,{state:'syncing',checkpoint:d.page_token,target_anchor:target});
          this.store.db.exec('COMMIT');
        }catch(e){this.store.db.exec('ROLLBACK');throw e;}
        if(!d.has_more||overlap)return this.store.coverage(chat);
      }
      if(!this.store.stopped(chat))this.store.setSync(chat,{state:'partial'});
    }catch {if(!this.store.stopped(chat))this.store.setSync(chat,{state:'failed'});this.log('群历史同步未完成；保留分页断点，未执行旧交互');throw new Error('Group history incomplete');}
  }
  async close(){this.closed=true;await Promise.allSettled([...this.running.values()]);}
}
