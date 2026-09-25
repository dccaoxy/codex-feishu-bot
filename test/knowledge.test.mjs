import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {GroupMessageStore} from '../src/group-store.mjs';
import {KnowledgeScheduler} from '../src/knowledge-scheduler.mjs';
import {GroupAssistant} from '../src/group-assistant.mjs';
import {knowledgeConfig,dayStart,lastDueDay,validateKnowledge} from '../src/knowledge-schema.mjs';
import {knowledgeThreadParams} from '../src/knowledge-worker.mjs';
const event=(id,text='库存300',day='2026-09-20',chat='oc_A')=>({sender:{sender_type:'user',sender_id:{open_id:'owner'}},message:{chat_id:chat,message_id:id,create_time:String(Date.parse(day+'T10:00:00+08:00')),message_type:'text',content:JSON.stringify({text})}});
const item=(text,ids=['m1'])=>({text,source_message_ids:ids});
const blank=()=>({verified_facts:[],plans:[],decisions:[],viewpoints:[],actions:[],open_questions:[],resources:[]});
const output=(ids=['m1'],old=null)=>({digest:{status:'complete',summary:'库存讨论',reported_facts:[item('库存300',ids)],...blank(),topics:['库存'],source_message_ids:ids},topics:[{topic_id:old,title:'库存',current_summary:'库存300',reported_facts:[item('库存300',ids)],key_changes:[],...blank(),conflicts:[],source_message_ids:ids}]});
function fixture(t,{worker,knowledge={},busy=()=>false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'knowledge-'));let raw=new GroupMessageStore(dir),now=Date.parse('2026-09-22T03:00:00+08:00');
 const c={groups:{enabled:true,allowedChatIds:['oc_A'],knowledge:{enabled:true,...knowledge}}};
 const calls=[];worker??={run:async input=>{calls.push(input);return JSON.stringify(output(input.messages.map(x=>x.id),input.topics[0]?.topic_id||null));},close:async()=>{}};
 const scheduler=new KnowledgeScheduler(c,raw,{allowed:chat=>c.groups.allowedChatIds.includes(chat),busy,worker,clock:()=>now});
 raw.setSync('oc_A',{state:'complete',initial_complete:1,last_reconciled_at:'2026-09-22T00:00:00Z'});
 t.after(async()=>{await scheduler.close();raw.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,raw,scheduler,c,calls,now:()=>now,advance:n=>now+=n};
}
test('knowledge disabled by default; timezone schedule/DST validation',()=>{
 assert.equal(knowledgeConfig().enabled,false);assert.throws(()=>knowledgeConfig({timezone:'invalid'}));assert.throws(()=>knowledgeConfig({dailyAt:'24:00'}));assert.throws(()=>knowledgeConfig({dailyAt:'12:60'}));assert.throws(()=>knowledgeConfig({maxDaysPerCycle:99}));
 const c=knowledgeConfig();assert.equal(lastDueDay(Date.parse('2026-09-22T01:59:00+08:00'),c),'2026-09-20');assert.equal(lastDueDay(Date.parse('2026-09-22T02:00:00+08:00'),c),'2026-09-21');
 assert.equal(dayStart('2026-03-09','America/New_York')-dayStart('2026-03-08','America/New_York'),23*3600000);
 assert.equal(dayStart('2026-11-02','America/New_York')-dayStart('2026-11-01','America/New_York'),25*3600000);
});
test('structured categories preserved, raw unchanged, daily commit/revisions idempotent',async t=>{
 const x=fixture(t,{worker:{run:async()=>{const o=output();o.digest.decisions=[item('决定明天盘点')];o.digest.viewpoints=[item('甲认为应补货')];o.digest.actions=[{text:'盘点',owner:null,deadline:null,source_message_ids:['m1']}];o.digest.open_questions=[item('数量待核验')];return JSON.stringify(o);}}});x.raw.ingest(event('m1'),false);const before=x.raw.get('oc_A','m1');await x.scheduler.tick();
 const d=x.raw.knowledge.daily('oc_A','2026-09-20');assert.equal(d.digest.actions[0].owner,null);assert.equal(d.digest.decisions.length,1);assert.equal(d.digest.viewpoints.length,1);assert.equal(d.digest.open_questions.length,1);assert.deepEqual(x.raw.get('oc_A','m1'),before);
 await x.scheduler.tick();await x.scheduler.tick();assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20').revision,1);assert.equal(x.raw.db.prepare('SELECT count(*) n FROM topic_revisions').get().n,1);
});
test('no material day produces no invented topic; empty days skip model with bounded catchup',async t=>{
 const x=fixture(t,{worker:{run:async()=>JSON.stringify({digest:{...output().digest,status:'no_material_content',summary:'只有问候',reported_facts:[],topics:[],source_message_ids:['m1']},topics:[]})}});x.raw.ingest(event('m1','你好'),false);await x.scheduler.tick();assert.equal(x.raw.knowledge.list('oc_A').length,0);assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20').status,'no_material_content');
});
test('multi-day catchup chronological and one model per cycle; persisted same topic identity/title/revisions',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);x.raw.ingest(event('m2','库存250','2026-09-21'),false);
 await x.scheduler.tick();assert.equal(x.calls.length,1);const first=x.raw.knowledge.list('oc_A')[0].topic_id;
 x.scheduler.worker.run=async input=>{x.calls.push(input);const o=output(['m2'],first);o.topics[0]={...o.topics[0],title:'库存变化',current_summary:'最新250，此前300',reported_facts:[item('库存250',['m2'])],key_changes:[item('300更新为250',['m1','m2'])],source_message_ids:['m1','m2']};return JSON.stringify(o);};
 x.advance(61000);await x.scheduler.tick();assert.deepEqual(x.calls.map(x=>x.date),['2026-09-20','2026-09-21']);assert.equal(x.raw.knowledge.list('oc_A')[0].topic_id,first);assert.equal(x.raw.knowledge.read('oc_A',first).state.version,2);assert.equal(x.raw.knowledge.read('oc_A',first).revisions.length,2);
 assert.match(x.raw.db.prepare('SELECT payload FROM topic_revisions WHERE version=1').get().payload,/300/);
});
test('partial/failed or stale history cannot generate complete digest',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);for(const state of ['partial','failed','syncing']){x.raw.setSync('oc_A',{state});x.advance(3600000);await x.scheduler.tick();}assert.equal(x.calls.length,0);assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20'),null);
 x.raw.setSync('oc_A',{state:'complete',last_reconciled_at:'2026-09-19T00:00:00Z'});x.advance(3600000);await x.scheduler.tick();assert.equal(x.calls.length,0);
});
test('conflicting claims retain both sources and old version; forged sources/IDs/schema fail closed',()=>{
 const input={messages:[{id:'m1'},{id:'m2'}],topics:[]};const o=output(['m1','m2']);o.topics[0].reported_facts=[];o.topics[0].conflicts=[{text:'库存250与300冲突',status:'unresolved',source_message_ids:['m1','m2']}];assert.equal(validateKnowledge(JSON.stringify(o),input).topics[0].conflicts[0].status,'unresolved');
 for(const mutate of [o=>o.digest.reported_facts[0].source_message_ids=['other-chat'],o=>o.topics[0].topic_id='foreign-topic',o=>o.topics[0].conflicts[0].status='resolved',o=>o.digest.extra='shell',o=>o.digest.status='no_material_content',o=>o.topics[0].source_message_ids=['other-chat']]){const n=structuredClone(o);mutate(n);assert.throws(()=>validateKnowledge(JSON.stringify(n),input));}
 assert.throws(()=>validateKnowledge('not JSON',input));assert.throws(()=>validateKnowledge('x'.repeat(128001),input));
});
test('new topic has new ID, previous facts cannot silently disappear',()=>{
 const old=output().topics[0];old.topic_id='existing';const input={messages:[{id:'m2'}],topics:[old]};const o=output(['m2'],'existing');assert.throws(()=>validateKnowledge(JSON.stringify(o),input),/lost_sources/);o.topics[0].source_message_ids=['m1','m2'];o.topics[0].reported_facts=[item('库存250',['m2'])];assert.throws(()=>validateKnowledge(JSON.stringify(o),input),/lost_fact/);
 o.topics[0].topic_id=null;assert.doesNotThrow(()=>validateKnowledge(JSON.stringify(o),input));
});
test('recall invalidates immediately, redacts derived copies, rebuild excludes withdrawn source',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);await x.scheduler.tick();const id=x.raw.knowledge.list('oc_A')[0].topic_id;x.raw.recall('oc_A','m1');assert.equal(x.raw.knowledge.read('oc_A',id),null);assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20'),null);assert.equal(x.raw.db.prepare('SELECT payload FROM topic_revisions').get().payload,null);
 x.advance(61000);await x.scheduler.tick();assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20').status,'no_material_content');assert.equal(x.raw.get('oc_A','m1'),undefined);
});
test('late history dirties earlier knowledge, retains topic identity during replay',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);await x.scheduler.tick();const id=x.raw.knowledge.list('oc_A')[0].topic_id;x.raw.ingest(event('m2'),false);assert.equal(x.raw.knowledge.list('oc_A').length,0);x.advance(61000);await x.scheduler.tick();assert.equal(x.raw.knowledge.list('oc_A')[0].topic_id,id);assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20').revision,2);
});
test('leave deletes all raw/knowledge/worker state and denies late commit',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);await x.scheduler.tick();x.raw.leave('oc_A');for(const table of ['messages','raw_messages','daily_digests','digest_revisions','knowledge_topics','topic_revisions','knowledge_jobs','knowledge_identity','knowledge_schedule'])assert.equal(x.raw.db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);await x.scheduler.tick();assert.equal(x.calls.length,1);
});
test('retention retains topic but marks original provenance unavailable',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);await x.scheduler.tick();const id=x.raw.knowledge.list('oc_A')[0].topic_id;x.raw.retentionDays=1;assert.equal(x.raw.knowledge.read('oc_A',id).provenance.status,'partial_unavailable');x.raw.prune();const result=x.raw.knowledge.read('oc_A',id);assert.equal(result.provenance.status,'partial_unavailable');assert.deepEqual(result.provenance.unavailable_source_message_ids,['m1']);
});
test('large inputs and malformed models bounded, retries stop across cycles, no partial commit',async t=>{
 const x=fixture(t,{knowledge:{maxMessages:1}});x.raw.ingest(event('m1'),false);x.raw.ingest(event('m2'),false);for(let i=0;i<6;i++){await x.scheduler.tick();x.advance(3600000);}assert.equal(x.calls.length,0);assert.equal(x.raw.db.prepare('SELECT status FROM knowledge_jobs').get().status,'blocked');assert.equal(x.raw.knowledge.list('oc_A').length,0);
});
test('worker failure remains isolated and bounded; restart recovers incomplete without duplicate revision',async t=>{
 const x=fixture(t,{worker:{run:async()=>'{broken'}});x.raw.ingest(event('m1'),false);await x.scheduler.tick();assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20'),null);assert(x.raw.get('oc_A','m1'));
 x.raw.db.prepare("UPDATE knowledge_jobs SET status='running'").run();x.raw.close();const r=new GroupMessageStore(x.dir);x.raw.db=r.db;x.raw.knowledge=r.knowledge;
 assert.equal(r.db.prepare('SELECT status FROM knowledge_jobs').get().status,'pending');r.close();
});
test('worker params have no tools/environments/Owner capability and ephemeral context',()=>{
 const p=knowledgeThreadParams('/isolated','model');assert.equal(p.ephemeral,true);assert.deepEqual(p.dynamicTools,[]);assert.deepEqual(p.environments,[]);assert.deepEqual(p.selectedCapabilityRoots,[]);assert.equal(p.approvalPolicy,'never');assert.equal(p.config.features.shell_tool,false);assert.equal(p.config.features.request_permissions_tool,false);assert.deepEqual(p.config.mcp_servers,{});assert.match(p.baseInstructions,/不可信/);
});
const until=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,5));}throw Error('timeout');};
test('background preempted by realtime FIFO; raw ingestion and reply continue, private resources absent',async t=>{
 let started=false,aborted=false;const x=fixture(t,{worker:{run:(input,signal)=>new Promise((_,reject)=>{started=true;assert(!JSON.stringify(input).includes('ownerReference'));signal.addEventListener('abort',()=>{aborted=true;reject(Error('abort'));},{once:true});})}});x.raw.ingest(event('m1'),false);const work=x.scheduler.tick();await until(()=>started);
 const replies=[];const g=new GroupAssistant(x.c,{call:fn=>fn(),client:{im:{v1:{message:{reply:async r=>replies.push(r)}}}}},()=> 'owner','bot',{store:x.raw,model:{run:async()=> 'ok',close:async()=>{},invalidate:()=>{}},knowledgeWorker:{run:async()=>''},log:()=>{}});
 // Use the assistant's real preemption link for the already running scheduler.
 await g.knowledge.close();g.knowledge=x.scheduler;
 const e=event('live');Object.assign(e.message,{chat_type:'group',create_time:String(Date.now()+1),mentions:[{key:'@bot',id:{open_id:'bot'}}]});g.onMessage(e);await work;await until(()=>replies.length===1);assert(aborted);assert(x.raw.get('oc_A','live'));assert.equal(x.raw.knowledge.list('oc_A').length,0);await g.close();
});
test('read tools scoped to current group; persisted old task fallback, disabled denies',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);await x.scheduler.tick();const id=x.raw.knowledge.list('oc_A')[0].topic_id;
 const g=new GroupAssistant(x.c,{},()=> 'owner','bot',{store:x.raw,model:{close:async()=>{}},knowledgeWorker:{},log:()=>{}});const sig=new AbortController().signal;
 assert.equal((await g.execute('oc_A','member','group_topic_read',{topicId:id},sig)).state.topic_id,id);
 x.c.groups.allowedChatIds.push('oc_B');assert.equal(await g.execute('oc_B','member','group_topic_read',{topicId:id},sig),null);
 assert.equal((await g.execute('oc_A','member','group_message',{messageId:'topic:'+id},sig)).state.topic_id,id);
 assert((await g.execute('oc_A','member','group_search',{keyword:'库存'},sig)).derivedTopics.length);
 g.policy.config.knowledge.enabled=false;await assert.rejects(g.execute('oc_A','owner','group_topic_read',{topicId:id},sig));await g.close();
});
test('separate new topic persists different ID, scheduler throttles repeated calls',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);x.raw.ingest(event('m2','新主题','2026-09-21'),false);await x.scheduler.tick();const id=x.raw.knowledge.list('oc_A')[0].topic_id;await x.scheduler.tick();assert.equal(x.calls.length,1);
 x.scheduler.worker.run=async()=>JSON.stringify(output(['m2']));x.advance(61000);await x.scheduler.tick();const ids=x.raw.knowledge.list('oc_A').map(t=>t.topic_id);assert.equal(ids.length,2);assert(ids.includes(id));
});
test('restart after committed date neither replays model nor duplicates revisions',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);await x.scheduler.tick();await x.scheduler.close();x.raw.close();
 const raw=new GroupMessageStore(x.dir);const scheduler=new KnowledgeScheduler(x.c,raw,{allowed:()=>true,busy:()=>false,worker:{run:async()=>{throw Error('must not regenerate');}},clock:()=>x.now()+61000});
 await scheduler.tick();assert.equal(raw.db.prepare('SELECT count(*) n FROM topic_revisions').get().n,1);assert.equal(raw.knowledge.daily('oc_A','2026-09-20').revision,1);await scheduler.close();raw.close();
});
test('pre-commit new input fails closed and does not write half a digest',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);x.scheduler.worker.run=async()=>{x.raw.ingest(event('new-arrival'),false);return JSON.stringify(output());};await x.scheduler.tick();assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20'),null);assert.equal(x.raw.knowledge.list('oc_A').length,0);
});
test('recall during first worker aborts even without existing knowledge',async t=>{
 let entered=false,aborted=false;const x=fixture(t,{worker:{run:(_input,signal)=>new Promise((_,reject)=>{entered=true;signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));});})}});x.raw.ingest(event('m1'),false);const pending=x.scheduler.tick();await until(()=>entered);x.raw.recall('oc_A','m1');await pending;assert(aborted);assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20'),null);
});
test('snapshot character budget rejects a single oversized message rather than clipping',async t=>{
 const x=fixture(t,{knowledge:{maxInputChars:1000}});x.raw.ingest(event('m1','x'.repeat(4000)),false);await x.scheduler.tick();assert.equal(x.calls.length,0);assert.equal(x.raw.db.prepare('SELECT error FROM knowledge_jobs').get().error,'knowledge_input_limit');
});
test('disabled knowledge calls no background model; realtime busy defers without consuming retry',async t=>{
 const a=fixture(t,{knowledge:{enabled:false}});a.raw.ingest(event('m1'),false);await a.scheduler.tick();assert.equal(a.calls.length,0);
 const b=fixture(t,{busy:()=>true});b.raw.ingest(event('m1'),false);await b.scheduler.tick();assert.equal(b.calls.length,0);assert.equal(b.raw.db.prepare('SELECT count(*) n FROM knowledge_jobs').get().n,0);
});
test('invalid repeated model output becomes blocked, successful retries do not retain partial data',async t=>{
 let calls=0;const x=fixture(t,{worker:{run:async()=>{calls++;return '{bad';}}});x.raw.ingest(event('m1'),false);for(let i=0;i<6;i++){await x.scheduler.tick();x.advance(3600000);}assert.equal(calls,3);assert.equal(x.raw.db.prepare('SELECT status FROM knowledge_jobs').get().status,'blocked');assert.equal(x.raw.db.prepare('SELECT count(*) n FROM digest_revisions').get().n,0);
});
test('resource references and action deadlines remain explicit data, no external fetch',()=>{
 const o=output();o.digest.resources=[{text:'动态表格',url:'https://example.test/base/ref',source_message_ids:['m1']}];o.digest.actions=[{text:'确认数量',owner:null,deadline:null,source_message_ids:['m1']}];const v=validateKnowledge(JSON.stringify(o),{messages:[{id:'m1',resources:[{url:'https://example.test/base/ref'}]}],topics:[]});assert.equal(v.digest.resources.length,1);assert.equal(v.digest.actions[0].deadline,null);
});
test('older offline history arriving after initial partial scan is not skipped',async t=>{
 const x=fixture(t);x.raw.ingest(event('later','晚消息','2026-09-21'),false);x.raw.setSync('oc_A',{state:'partial'});await x.scheduler.tick();
 x.raw.ingest(event('older','早消息','2026-09-19'),false);x.raw.setSync('oc_A',{state:'complete'});x.advance(3600000);await x.scheduler.tick();assert.equal(x.calls[0].date,'2026-09-19');assert(x.raw.knowledge.daily('oc_A','2026-09-19'));
});
test('missing reconciliation timestamp fails closed despite complete flag',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);x.raw.setSync('oc_A',{last_reconciled_at:null});await x.scheduler.tick();assert.equal(x.calls.length,0);
});
test('retention-truncated days are skipped with explicit error, never formal complete digest',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);x.raw.lowerBound=()=>Date.parse('2026-09-20T09:00:00+08:00');await x.scheduler.tick();assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20'),null);const job=x.raw.db.prepare('SELECT * FROM knowledge_jobs').get();assert.equal(job.status,'skipped');assert.equal(job.error,'knowledge_retention_incomplete');
});

test('chat claims cannot become verified evidence in either digest or topic',()=>{
 const input={messages:[{id:'m1'}],topics:[]};
 for(const target of ['digest','topic']){
  const o=output();(target==='digest'?o.digest:o.topics[0]).verified_facts=[item('机器人报告已重启，不等于系统验证')];
  assert.throws(()=>validateKnowledge(JSON.stringify(o),input),/knowledge_schema/);
 }
 const o=output();o.digest.plans=[item('剩余批次下次运行继续')];o.digest.actions=[{text:'重启后告诉我',owner:null,deadline:null,source_message_ids:['m1']}];
 assert.deepEqual(validateKnowledge(JSON.stringify(o),input).digest.decisions,[]);
 const legacy=output();legacy.digest.facts=legacy.digest.reported_facts;delete legacy.digest.reported_facts;
 assert.throws(()=>validateKnowledge(JSON.stringify(legacy),input),/knowledge_schema/);
});
test('legacy fact compatibility preserves revision bytes, IDs, recall and idempotency',async t=>{
 const x=fixture(t);x.raw.ingest(event('m1'),false);await x.scheduler.tick();const id=x.raw.knowledge.list('oc_A')[0].topic_id;
 for(const [table,key] of [['daily_digests','facts'],['digest_revisions','facts'],['knowledge_topics','confirmed_facts'],['topic_revisions','confirmed_facts']]){
  const row=x.raw.db.prepare(`SELECT payload FROM ${table}`).get();const old=JSON.parse(row.payload);old[key]=old.reported_facts;delete old.reported_facts;delete old.verified_facts;delete old.plans;
  x.raw.db.prepare(`UPDATE ${table} SET payload=?`).run(JSON.stringify(old));
 }
 const before=x.raw.db.prepare('SELECT payload FROM topic_revisions').get().payload;
 const read=x.raw.knowledge.read('oc_A',id);assert.equal(read.state.reported_facts.length,1);assert.deepEqual(read.state.verified_facts,[]);assert.equal(read.state.confirmed_facts,undefined);
 assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20').digest.facts,undefined);
 assert.equal(x.raw.knowledge.snapshot('oc_A','2026-09-20',knowledgeConfig()).input.topics[0].reported_facts.length,1);
 await x.scheduler.tick();assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20').revision,1);assert.equal(x.raw.db.prepare('SELECT payload FROM topic_revisions').get().payload,before);
 x.raw.recall('oc_A','m1');assert.equal(x.raw.knowledge.read('oc_A',id),null);assert.equal(x.raw.db.prepare('SELECT payload FROM topic_revisions').get().payload,null);
});

test('assistant waits for history reconciliation before knowledge tick, including failed groups',async()=>{
 let release;const gate=new Promise(r=>release=r);const calls=[];
 const fake={policy:{config:{allowedChatIds:['A','B']}},store:{thread:()=>({state:'new'})},model:{},drain:()=>{},history:{reconcile:async chat=>{calls.push('sync:'+chat);await gate;if(chat==='B')throw Error('offline');calls.push('complete:A');}},knowledge:{tick:async()=>calls.push('knowledge')}};
 try{GroupAssistant.prototype.start.call(fake);await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['sync:A','sync:B']);release();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['sync:A','sync:B','complete:A','knowledge']);}
 finally{clearInterval(fake.queueTimer);clearInterval(fake.historyTimer);release();}
});

for(const terminal of ['queue_full','cancelled'])test(`terminal ${terminal} does not block catch-up or expose hidden raw after restart`,async t=>{
 const x=fixture(t);const a=event('a','VISIBLE_A'),b=event('b','HIDDEN_TERMINAL');
 x.raw.ingest(a,false);assert.equal(x.raw.enqueue(a,1),'queued');
 if(terminal==='queue_full'){x.raw.ingest(b,false);assert.equal(x.raw.enqueue(b,1),'queue_full');x.raw.mark('oc_A','a','done');}
 else{x.raw.cancelQueued('oc_A');x.raw.ingest(event('visible','VISIBLE_A'),false);}
 x.raw.ingest(event('tomorrow','NEXT_DAY','2026-09-21'),false);
 const rawBefore=x.raw.db.prepare('SELECT * FROM raw_messages ORDER BY seq').all();
 assert.equal(x.raw.pending().length,0);await x.scheduler.tick();
 const first=x.raw.knowledge.daily('oc_A','2026-09-20');assert(first,'terminal request blocked day');
 assert.equal(first.coverage.status,'filtered');assert.equal(first.coverage.excludedMessageCounts[terminal],1);
 const topic=x.raw.knowledge.read('oc_A',x.raw.knowledge.list('oc_A')[0].topic_id);assert.deepEqual(topic.revisions[0].coverage,first.coverage);
 assert(!JSON.stringify(first).includes('HIDDEN_TERMINAL'));assert(!JSON.stringify(topic).includes('HIDDEN_TERMINAL'));
 assert.equal(x.calls[0].messages.length,1);assert(!JSON.stringify(x.calls).includes(terminal==='queue_full'?'HIDDEN_TERMINAL':'"id":"a"'));
 assert.equal(x.raw.visible('oc_A',terminal==='queue_full'?'b':'a'),false);
 assert.deepEqual(x.raw.db.prepare('SELECT * FROM raw_messages ORDER BY seq').all(),rawBefore);
 await x.scheduler.close();const restarted=new GroupMessageStore(x.dir);const scheduler=new KnowledgeScheduler(x.c,restarted,{allowed:()=>true,busy:()=>false,clock:()=>x.now()+3600000,worker:{run:async input=>JSON.stringify(output(input.messages.map(m=>m.id))),close:async()=>{}}});
 try{await scheduler.tick();assert(restarted.knowledge.daily('oc_A','2026-09-21'));assert.equal(restarted.db.prepare('SELECT COUNT(*) n FROM digest_revisions WHERE date=?').get('2026-09-20').n,1);assert.equal(restarted.visible('oc_A',terminal==='queue_full'?'b':'a'),false);assert.deepEqual(restarted.db.prepare('SELECT * FROM raw_messages ORDER BY seq').all(),rawBefore);}finally{await scheduler.close();restarted.close();}
});

test('genuinely queued source waits without publishing and proceeds after normal completion',async t=>{
 const x=fixture(t),e=event('waiting','PENDING_BODY');x.raw.ingest(e,false);x.raw.enqueue(e,1);
 for(let i=0;i<6;i++){await x.scheduler.tick();x.advance(3600000);}
 assert.equal(x.calls.length,0);assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20'),null);
 assert.equal(x.raw.db.prepare('SELECT error FROM knowledge_jobs').get().error,'knowledge_pending_source');
 x.raw.mark('oc_A','waiting','done');await x.scheduler.tick();assert.equal(x.calls.length,1);assert.equal(x.raw.knowledge.daily('oc_A','2026-09-20').coverage.status,'complete');
});
test('all hidden terminal sources advance with explicit zero-input coverage, not fabricated completeness',async t=>{
 const x=fixture(t),e=event('hidden','NEVER_SEND_TO_WORKER');x.raw.ingest(e,false);x.raw.enqueue(e,1);x.raw.cancelQueued('oc_A');
 x.raw.ingest(event('next','VISIBLE_NEXT','2026-09-21'),false);await x.scheduler.tick();
 const d=x.raw.knowledge.daily('oc_A','2026-09-20');assert.equal(d.status,'no_material_content');assert.equal(d.coverage.status,'filtered');assert.equal(d.coverage.messageCount,0);assert.equal(d.coverage.totalMessageCount,1);assert(x.raw.knowledge.daily('oc_A','2026-09-21'));assert.equal(x.raw.read('oc_A','hidden'),null);assert(x.raw.db.prepare('SELECT content FROM raw_messages WHERE id=?').get('hidden').content.includes('NEVER_SEND'));
 assert(!JSON.stringify(x.calls).includes('NEVER_SEND'));
});
test('active recall cancels queued source, restart catch-up excludes both and keeps cancelled raw',async t=>{
 const x=fixture(t),controller=new AbortController();
 const g=new GroupAssistant({...x.c,storageDir:x.dir},{},()=> 'owner','bot',{store:x.raw,model:{close:async()=>{},invalidate:()=>{}},knowledgeWorker:{close:async()=>{}}});
 const active=event('active','RECALLED_BODY'),queued=event('queued','CANCELLED_BODY');
 for(const e of [active,queued]){x.raw.ingest(e,false);x.raw.enqueue(e,10);}
 x.raw.mark('oc_A','active','running');x.raw.setThread('oc_A',{state:'running',thread_id:'fake'});g.jobs.set('oc_A',{controller});
 g.onRecall({chat_id:'oc_A',message_id:'active'});assert(controller.signal.aborted);assert.equal(x.raw.requestState('oc_A','queued'),'cancelled');assert.equal(x.raw.get('oc_A','active'),undefined);
 g.jobs.clear();clearInterval(g.timer);await g.knowledge.close();await x.scheduler.close();
 const raw=new GroupMessageStore(x.dir),calls=[];const scheduler=new KnowledgeScheduler(x.c,raw,{allowed:()=>true,busy:()=>false,clock:x.now,worker:{run:async input=>{calls.push(input);return JSON.stringify(output(input.messages.map(m=>m.id)));},close:async()=>{}}});
 try{raw.ingest(event('next','SAFE_NEXT','2026-09-21'),false);await scheduler.tick();assert.equal(raw.knowledge.daily('oc_A','2026-09-20').coverage.excludedMessageCounts.cancelled,1);assert(raw.knowledge.daily('oc_A','2026-09-21'));assert(!JSON.stringify(calls).includes('RECALLED_BODY'));assert(!JSON.stringify(calls).includes('CANCELLED_BODY'));assert.equal(raw.read('oc_A','queued'),null);assert(raw.db.prepare('SELECT content FROM raw_messages WHERE id=?').get('queued'));}finally{await scheduler.close();raw.close();}
});
