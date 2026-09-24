import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {OwnerGateway,queryResource} from '../src/owner-gateway.mjs';
import {GroupAssistant} from '../src/group-assistant.mjs';
import {GroupMessageStore} from '../src/group-store.mjs';
import {Feishu} from '../src/feishu.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await delay(5);}throw Error('condition not reached');}
function setup(t,{messages=[],secret='KNOWN_SECRET_BOUNDARY',blocked=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-review-')),store=new GroupMessageStore(dir),inputs=[],sent=[];
 let owner='owner',release;const f=Object.create(Feishu.prototype);f.lastCall=0;f.queue=blocked?new Promise(r=>release=r):Promise.resolve();
 f.client={im:{v1:{message:{reply:async r=>{sent.push(r);return {code:0,data:{}};}}}}};
 const rpc={request:async method=>method==='thread/read'?{thread:{name:'test'}}:{data:[{items:messages}]}};
 const model={run:async input=>{inputs.push(input);return JSON.stringify(JSON.parse(input).ownerReference);},close:async()=>{},invalidate:()=>{}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_test']},ownerGateway:{enabled:true,privateThreads:true},feishu:{appSecret:secret}},f,()=>owner,'bot',{store,model,rpc,log:()=>{}});
 t.after(async()=>{release?.();if(!g.closed)await g.close();fs.rmSync(dir,{recursive:true,force:true});});
 const start=()=>{g.onMessage({sender:{sender_type:'user',sender_id:{open_id:'owner'}},message:{chat_type:'group',chat_id:'oc_test',message_id:'request',create_time:String(Date.now()),message_type:'text',content:JSON.stringify({text:'@bot /owner read ref'}),mentions:[{key:'@bot',id:{open_id:'bot'}}]}});return g.jobs.get('oc_test').done;};
 return {g,store,inputs,sent,start,release,changeOwner:()=>owner='other'};
}
for(const action of ['owner','allowlist','recall','leave','close','resource-grant'])test('queued transport rechecks '+action,async t=>{
 const x=setup(t,{blocked:true,messages:[{type:'agentMessage',text:'private reference'}]});
 const done=x.start();await until(()=>x.store.get('oc_test','request')?.state==='sending');
 let closing;
 if(action==='owner')x.changeOwner();
 if(action==='resource-grant')x.g.gateway.config.privateThreads=false;
 if(action==='allowlist')x.g.policy.config.allowedChatIds=[];
 if(action==='recall')x.g.onRecall({chat_id:'oc_test',message_id:'another-message'});
 if(action==='leave')x.g.onLeave({chat_id:'oc_test'});
 if(action==='close')closing=x.g.close();
 x.release();await done;if(closing)await closing;
 assert.equal(x.sent.length,0);
 if(!closing)assert.notEqual(x.store.get('oc_test','request')?.state,'done');
});
test('full-message redaction precedes clipping in gateway, model and transport',async t=>{
 const pem=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
 assert.ok(pem.length>1500);
 const secret='KNOWN_SECRET_BOUNDARY';
 const texts=[pem,'x'.repeat(1490)+secret,pem.slice(0,1600),...Array(10).fill('z'.repeat(1500)),pem];
 const x=setup(t,{messages:texts.map(text=>({type:'agentMessage',text})),secret});
 const direct=await x.g.gateway.execute('owner_thread_read',{threadId:'ref'},{explicit:true,sender:'owner',chat:'oc_test'});
 assert.equal(direct.partial,true);
 assert.equal(direct.turns[0].messages.reduce((n,m)=>n+m.text.length,0),12000);
 await x.start();assert.equal(x.sent.length,1);
 for(const output of [JSON.stringify(direct),...x.inputs,JSON.stringify(x.sent)]){
  assert.ok(!output.includes('BEGIN PRIVATE KEY'));assert.ok(!output.includes(pem.split('\n')[1]));assert.ok(!output.includes('KNOWN_SECR'));
 }
});
for(const mode of ['deadline','abort'])test('running native aggregation killed and reaped on '+mode,async t=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'owner-native-'))),file=path.join(dir,'large.db');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const db=new DatabaseSync(file);db.exec(`CREATE TABLE rows(a,b,c); WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<${mode==='deadline'?20000000:4000000}) INSERT INTO rows SELECT x%31,x%37,x FROM n`);db.close();
 const resource={path:file,permissions:['read','compute'],tables:{rows:['a','b','c']}};
 const controller=new AbortController();let pid,started=false,abortTime;
 const begin=Date.now();
 await assert.rejects(queryResource(resource,{table:'rows',groupBy:['a','b'],metrics:[{op:'sum',column:'c'}]},controller.signal,mode==='deadline'?undefined:5000,{onStarted:p=>{pid=p;started=true;if(mode==='abort')setTimeout(()=>{process.kill(pid,0);abortTime=Date.now();controller.abort();},50);}}));
 assert.equal(started,true);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
 const elapsed=Date.now()-(abortTime??begin);if(mode==='deadline')assert.ok(elapsed>=2000);assert.ok(elapsed<(mode==='deadline'?3000:1000),'cleanup took '+elapsed+'ms');
 const reopened=new DatabaseSync(file);reopened.exec('PRAGMA busy_timeout=1; BEGIN EXCLUSIVE; ROLLBACK');reopened.close();
 t.diagnostic(mode+' complete with process reaped and exclusive DB lock available: '+elapsed+'ms');
});
