import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {GroupMessageStore} from '../src/group-store.mjs';import {GroupAssistant} from '../src/group-assistant.mjs';import {GroupModel} from '../src/group-model.mjs';
const chat='oc_Test';const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cleanup-')),store=new GroupMessageStore(dir);const model=new GroupModel({},store);const root=path.join(dir,'threads',createHash('sha256').update(chat).digest('hex'));fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'context'),'sensitive prior context');store.setThread(chat,{thread_id:'prior',state:'idle'});let replies=0;const f={call:fn=>fn(),client:{im:{v1:{message:{reply:async()=>{replies++;}}}}}};const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:[chat]}},f,()=> 'owner','bot',{store,model,log:()=>{}});t.after(async()=>{await g.close();fs.rmSync(dir,{recursive:true,force:true});});return {g,store,model,root,dir,replies:()=>replies};}
function send(g,text){g.onMessage({sender:{sender_type:'user',sender_id:{open_id:'owner'}},message:{chat_type:'group',chat_id:chat,message_id:'request',create_time:String(Date.now()),message_type:'text',content:JSON.stringify({text}),mentions:[{key:'@bot',id:{open_id:'bot'}}]}});return g.jobs.get(chat);}
for(const action of ['leave','recall','retention'])test(`active document ${action} removes real persistent directory after work settles`,async t=>{
 const {g,store,root,replies}=fixture(t);const entered=deferred(),release=deferred();let writes=0;
 g.feishu.client.docx={document:{convert:async()=>{entered.resolve();await release.promise;return {blocks:[{block_type:2}],first_level_block_ids:['b']};},create:async()=>{writes++;}}};
 const job=send(g,'@bot /group-doc create title\nbody');await entered.promise;
 if(action==='leave')g.onLeave({chat_id:chat});else if(action==='recall')g.onRecall({chat_id:chat,message_id:'request'});else{store.db.prepare('UPDATE messages SET time=0').run();store.retentionDays=1;store.prune();}
 assert.ok(job.controller.signal.aborted);assert.ok(fs.existsSync(root));release.resolve();await job.done;assert.equal(fs.existsSync(root),false);assert.equal(writes,0);assert.equal(replies(),0);assert.equal(store.thread(chat).state,'invalidated');
});
test('slash command recalled before dispatch still cleans real directory',async t=>{const {g,root,replies}=fixture(t);const job=send(g,'@bot /attach private');g.onRecall({chat_id:chat,message_id:'request'});await job.done;assert.equal(fs.existsSync(root),false);assert.equal(replies(),0);});
for(const action of ['leave','recall'])test(`active model ${action} waits for simulated RPC close before directory removal`,async t=>{
 const {g,model,root,replies}=fixture(t);const entered=deferred(),closing=deferred(),closed=deferred();let rpcClosed=false;
 model.run=async(q,tools,execute,signal)=>{entered.resolve();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));closing.resolve();await closed.promise;rpcClosed=true;return 'late';};
 const invalidate=model.invalidate.bind(model);model.invalidate=c=>{assert.equal(rpcClosed,true);invalidate(c);};
 const job=send(g,'@bot hello');await entered.promise;if(action==='leave')g.onLeave({chat_id:chat});else g.onRecall({chat_id:chat,message_id:'request'});await closing.promise;assert.ok(fs.existsSync(root));closed.resolve();await job.done;assert.equal(fs.existsSync(root),false);assert.equal(replies(),0);
});
for(const action of ['leave','recall'])test(`idle ${action} immediately removes directory and stopped group stays blocked after reopen`,async t=>{
 const {g,store,root,dir}=fixture(t);if(action==='leave')g.onLeave({chat_id:chat});else g.onRecall({chat_id:chat,message_id:'old'});assert.equal(fs.existsSync(root),false);assert.equal(store.thread(chat).state,'invalidated');
 if(action==='leave'){await g.close();const reopened=new GroupMessageStore(dir);try{assert.equal(reopened.stopped(chat),true);assert.equal(reopened.read(chat,'old'),null);await assert.rejects(new GroupModel({},reopened).run('',[],()=>{},new AbortController().signal,chat),/Missing group binding/);assert.equal(fs.existsSync(root),false);}finally{reopened.close();}}
});
