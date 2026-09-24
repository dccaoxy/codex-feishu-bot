import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {GroupAssistant} from '../src/group-assistant.mjs';
import {GroupMessageStore} from '../src/group-store.mjs';
import {groupConfig} from '../src/group-policy.mjs';
const event=(id,chat='oc_A',text=id,sender='owner')=>({sender:{sender_type:'user',sender_id:{open_id:sender}},message:{chat_type:'group',chat_id:chat,message_id:id,create_time:String(Date.now()),message_type:'text',content:JSON.stringify({text:'@bot '+text}),mentions:[{key:'@bot',id:{open_id:'bot'}}]}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await pause(5);}throw Error('timeout');}
function fixture(t,{dir,limit=10,modelFail=false,sendFail=false}={}){
 const ownDir=!dir;dir??=fs.mkdtempSync(path.join(os.tmpdir(),'queue-'));const store=new GroupMessageStore(dir),calls=[],replies=[],releases=[];let owner='owner';
 const model={run:async(q,tools,exec,signal,chat)=>{
  const input=JSON.parse(q);const previous=store.thread(chat).thread_id;store.setThread(chat,{thread_id:previous||'persistent-'+chat,state:'running'});
  calls.push({chat,input,thread:store.thread(chat).thread_id});
  await new Promise(resolve=>{releases.push(resolve);if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});
  if(modelFail)throw Error('uncertain');if(!signal.aborted)store.setThread(chat,{state:'idle'});return input.request;
 },close:async()=>{},invalidate:()=>{}};
 const f={call:fn=>Promise.resolve().then(fn),client:{im:{v1:{message:{reply:async r=>{replies.push(r.path.message_id);if(sendFail)throw Error('ambiguous');}}}}}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A','oc_B','oc_C'],queueLimit:limit},ownerGateway:{enabled:true,privateThreads:true}},f,()=>owner,'bot',{store,model,rpc:{request:async()=>({data:[]})},log:()=>{}});
 t.after(async()=>{if(!g.closed)await g.close();if(ownDir)fs.rmSync(dir,{recursive:true,force:true});});
 return {g,store,dir,calls,replies,releases,send:(...a)=>g.onMessage(event(...a)),owner:v=>owner=v};
}
test('queue bounds validate default 10 and hard max 20',()=>{assert.equal(groupConfig().queueLimit,10);for(const n of [0,21,1.5])assert.throws(()=>groupConfig({queueLimit:n}));});
test('A/B/C FIFO same persistent task, one distinct reply each, duplicate deduped',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B');x.send('C');x.send('B');
 assert.equal(x.store.queueDepth('oc_A'),2);assert.equal(x.store.get('oc_A','B').state,'queued');
 x.releases[0]();await until(()=>x.calls.length===2);assert.equal(x.calls[1].input.request,'B');assert.equal(x.store.queueDepth('oc_A'),1);
 x.releases[1]();await until(()=>x.calls.length===3);x.releases[2]();await until(()=>x.g.jobs.size===0);
 assert.deepEqual(x.replies,['A','B','C']);assert.deepEqual(x.calls.map(c=>c.thread),Array(3).fill('persistent-oc_A'));
});
test('two global workers, third group waits and starts when slot freed',async t=>{
 const x=fixture(t);x.send('A');x.send('B','oc_B');x.send('C','oc_C');await until(()=>x.calls.length===2);
 assert.equal(x.store.get('oc_C','C').state,'queued');assert.equal(x.g.jobs.size,2);x.releases[0]();await until(()=>x.calls.length===3);assert.equal(x.calls[2].chat,'oc_C');
});
test('queued recall does not abort A, never starts or replies B, hides pending from tools',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B');assert.equal(x.store.read('oc_A','B'),null);assert.ok(!x.store.search('oc_A').some(m=>m.messageId==='B'));
 x.g.onRecall({chat_id:'oc_A',message_id:'B'});assert.equal(x.g.jobs.get('oc_A').controller.signal.aborted,false);x.releases[0]();await until(()=>x.g.jobs.size===0);
 assert.deepEqual(x.replies,['A']);assert.equal(x.calls.length,1);x.send('B');assert.equal(x.g.jobs.size,0);
});
test('duplicate queued recall during and after A does not invalidate its persistent task',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B');
 const recall={chat_id:'oc_A',message_id:'B'};x.g.onRecall(recall);x.g.onRecall(recall);
 assert.equal(x.g.jobs.get('oc_A').controller.signal.aborted,false);
 x.releases[0]();await until(()=>x.g.jobs.size===0);x.g.onRecall(recall);
 assert.equal(x.store.thread('oc_A').state,'idle');assert.deepEqual(x.replies,['A']);
 x.send('C');await until(()=>x.calls.length===2);assert.equal(x.calls[1].thread,x.calls[0].thread);
 x.releases[1]();await until(()=>x.g.jobs.size===0);assert.deepEqual(x.replies,['A','C']);
});
for(const cause of ['recall-running','leave','allowlist'])test(cause+' cancels active and pending, no next model',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B');
 if(cause==='recall-running')x.g.onRecall({chat_id:'oc_A',message_id:'A'});
 if(cause==='leave')x.g.onLeave({chat_id:'oc_A'});
 if(cause==='allowlist'){x.g.policy.config.allowedChatIds=[];x.g.drain();}
 await until(()=>x.g.jobs.size===0);assert.equal(x.calls.length,1);assert.equal(x.replies.length,0);assert.equal(x.store.queueDepth('oc_A'),0);
});
test('close preserves queued, active becomes uncertain and restart barrier blocks following',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-restart-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const x=fixture(t,{dir});x.send('A');await until(()=>x.calls.length===1);x.send('B');await x.g.close();
 const y=fixture(t,{dir});assert.equal(y.store.requestState('oc_A','A'),'uncertain');assert.equal(y.store.requestState('oc_A','B'),'queued');y.g.drain();await pause(10);assert.equal(y.calls.length,0);
});
test('definitely queued live request recovers, history-only mention does not',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-safe-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const s=new GroupMessageStore(dir);const e=event('saved');s.ingest(e,false);s.enqueue(e,10);s.ingest(event('history'),false);s.close();
 const x=fixture(t,{dir});x.g.drain();await until(()=>x.calls.length===1);x.releases[0]();await until(()=>x.g.jobs.size===0);assert.deepEqual(x.replies,['saved']);assert.equal(x.store.get('oc_A','history').state,'recorded');
});
for(const state of ['running','sending'])test('crash '+state+' never replayed or passed by queued successor',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-crash-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const s=new GroupMessageStore(dir);
 for(const id of ['A','B']){const e=event(id);s.ingest(e,false);s.enqueue(e,10);}s.mark('oc_A','A',state);s.close();
 const x=fixture(t,{dir});x.g.drain();assert.equal(x.store.requestState('oc_A','A'),'uncertain');assert.equal(x.calls.length,0);assert.equal(x.store.queueDepth('oc_A'),1);
});
test('full queue rejects, prompts once, duplicates cannot insert or notify twice',async t=>{
 const x=fixture(t,{limit:1});x.send('A');await until(()=>x.calls.length===1);x.send('B');x.send('C');x.send('C');await until(()=>x.replies.length===1);
 assert.equal(x.store.get('oc_A','C').state,'queue_full');assert.deepEqual(x.replies,['C']);assert.equal(x.store.queueDepth('oc_A'),1);
});
test('ordinary, historical and delayed old live @ do not enqueue',async t=>{
 const x=fixture(t);const plain=event('plain');plain.message.mentions=[];x.g.onMessage(plain);const old=event('old');old.message.create_time='1';x.g.onMessage(old);x.store.ingest(event('history'),false);x.g.drain();assert.equal(x.calls.length,0);assert.equal(x.store.pending().length,0);
});
test('Owner requests share FIFO and Owner change denies at dispatch',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B','oc_A','/owner search title');x.owner('new-owner');x.releases[0]();await until(()=>x.g.jobs.size===0);
 assert.equal(x.calls.length,1);assert.equal(x.store.requestState('oc_A','B'),'failed');
});
test('Owner request uses FIFO normally and keeps same task',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B','oc_A','/owner search title');x.send('C');x.releases[0]();await until(()=>x.calls.length===2);assert.ok(x.calls[1].input.ownerReference);x.releases[1]();await until(()=>x.calls.length===3);x.releases[2]();await until(()=>x.g.jobs.size===0);assert.deepEqual(x.replies,['A','B','C']);
});
for(const opts of [{modelFail:true},{sendFail:true}])test('ambiguous model/send failure blocks following without retry '+JSON.stringify(opts),async t=>{
 const x=fixture(t,opts);x.send('A');await until(()=>x.calls.length===1);x.send('B');x.releases[0]();await until(()=>x.g.jobs.size===0);assert.equal(x.store.requestState('oc_A','A'),'uncertain');assert.equal(x.store.requestState('oc_A','B'),'queued');x.g.drain();assert.equal(x.calls.length,1);
});
test('new request after recall may rebuild invalidated context, without replaying old queue',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B');x.g.onRecall({chat_id:'oc_A',message_id:'A'});await until(()=>x.g.jobs.size===0);x.send('C');await until(()=>x.calls.length===2);x.releases[1]();await until(()=>x.g.jobs.size===0);assert.deepEqual(x.replies,['C']);
});
test('queued Owner read fails if private scope disabled before dispatch',async t=>{
 const x=fixture(t);x.send('A');await until(()=>x.calls.length===1);x.send('B','oc_A','/owner read ref');x.g.gateway.config.privateThreads=false;x.releases[0]();await until(()=>x.g.jobs.size===0);assert.equal(x.calls.length,1);assert.equal(x.store.requestState('oc_A','B'),'failed');
});
