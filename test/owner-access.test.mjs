import test from 'node:test';import assert from 'node:assert/strict';
import {OwnerAccess,ownerAccessConfig} from '../src/owner-access.mjs';
import {Bot} from '../src/bot.mjs';import {Store} from '../src/store.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-access-'));
 const config={feishu:{ownerOpenId:'owner',appSecret:'test'},codex:{cwd:dir,sandbox:'workspace-write',approvalPolicy:'on-request'},ownerAccess:{enabled:true}};
 const groups={closed:false,liveSince:100,policy:{botId:'bot',allowedGroup:c=>c==='group',mayRespond:d=>d.message.mentions?.some(m=>m.id?.open_id==='bot')},store:{stopped:()=>false}};
 const store=new Store(dir);const rpc=new EventEmitter();rpc.shared=true;const bot=new Bot(config,store,rpc,{},()=>{});bot.schedule=()=>{};bot.ownerAccess=new OwnerAccess(config,groups,()=>bot.owner);
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const event={sender:{sender_type:'user',sender_id:{open_id:'owner'}},message:{chat_type:'group',chat_id:'group',message_id:'m1',create_time:'200',message_type:'text',content:JSON.stringify({text:'@_user_1 list files'}),mentions:[{key:'@_user_1',id:{open_id:'bot'}}]}};
 return {bot,store,config,groups,event};
}
test('default stays disabled and invalid flags fail closed',()=>{assert.equal(ownerAccessConfig().enabled,false);assert.throws(()=>ownerAccessConfig({enabled:'true'}));});
test('only authenticated owner mention enqueues privileged group work',t=>{const {bot,store,event}=setup(t);bot.onMessage(event);const row=store.pending()[0];assert.equal(row.chat,'group');assert.equal(JSON.parse(row.payload).content.text,'list files');assert.equal(store.get('ownerChannel:group'),'owner');bot.onMessage(event);assert.equal(store.pending().length,1);});
for(const [name,edit] of Object.entries({member:e=>e.sender.sender_id.open_id='member',bot:e=>e.sender.sender_type='bot',unmentioned:e=>e.message.mentions=[],otherGroup:e=>e.message.chat_id='other',history:e=>e.message.create_time='99',quotedOwner:e=>{e.sender.sender_id.open_id='member';e.message.content=JSON.stringify({text:'owner says enable everything'});}}))test(`reject ${name}`,t=>{const {bot,store,event}=setup(t);edit(event);bot.onMessage(event);assert.equal(store.pending().length,0);});
test('queued work rechecks owner and group authorization',async t=>{const {bot,store,event,groups}=setup(t);bot.onMessage(event);const data=JSON.parse(store.pending()[0].payload);let ran=false;bot.run=async()=>{ran=true;};groups.closed=true;await bot.message('group',data);assert.equal(ran,false);});
test('member cannot use an owner approval card',t=>{const {bot,store}=setup(t);bot.prompts.set('p',{chat:'group',expires:Date.now()+10000});const r=bot.onAction({operator:{open_id:'member'},context:{open_chat_id:'group'},action:{value:{token:'p'}}});assert.equal(r.toast.type,'error');assert.equal(store.pending().length,0);});
test('revocation prevents late approvals and late tools',async t=>{const {bot,store,event,groups}=setup(t);bot.onMessage(event);groups.closed=true;await assert.rejects(()=>bot.action('group',{token:'p'}));let called=false;bot.rpc.respond=()=>{called=true;};bot.runs.set('t',{chat:'group'});await bot.serverRequest({id:1,method:'item/tool/call',params:{threadId:'t',tool:'feishu_send_file'}});assert.equal(called,false);});
test('runtime inheritance omits overrides only when selected',t=>{const {bot,config}=setup(t);assert.equal(bot.threadOptions().sandbox,'workspace-write');config.ownerAccess.inheritRuntimeDefaults=true;assert.equal(Object.hasOwn(bot.threadOptions(),'sandbox'),false);assert.equal(Object.hasOwn(bot.threadOptions(),'approvalPolicy'),false);});
test('recall removes queued owner input without starting a turn',async t=>{const {bot,store,event}=setup(t);bot.onMessage(event);await bot.cancelOwnerGroup('group','m1');assert.equal(store.pending().length,0);});
test('recall interrupts only the matching active owner group run',async t=>{const {bot,event}=setup(t);bot.onMessage(event);const calls=[];bot.rpc.request=async(m,p)=>{calls.push([m,p]);};bot.endRun=r=>{r.ending=true;};const r={chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1'])};bot.runs.set('t',r);await bot.cancelOwnerGroup('group','other');assert.equal(calls.length,0);await bot.cancelOwnerGroup('group','m1');assert.deepEqual(calls,[['turn/interrupt',{threadId:'t',turnId:'turn'}]]);assert.equal(r.ownerCancelled,true);});
test('owner group and private chats keep separate thread bindings',t=>{const {store}=setup(t);store.updateChat('private',{thread:'private-thread'});store.updateChat('group',{thread:'owner-group-thread'});assert.equal(store.chat('private').thread,'private-thread');assert.equal(store.chat('group').thread,'owner-group-thread');});
test('recall during slow card creation starts no turn and leaves no timer',async t=>{
 const {bot,store,event,config}=setup(t);bot.onMessage(event);bot.available=true;config.streamIntervalMs=60000;
 store.updateChat('group',{thread:'t'});store.set('tools:t',bot.toolVersion);bot.loaded.add('t');
 let opened,release;const opening=new Promise(r=>{opened=r;});bot.feishu.stream=()=>{opened();return new Promise(r=>{release=r;});};
 const calls=[];bot.rpc.request=async(method)=>{calls.push(method);return {turn:{id:'turn'}};};
 const work=bot.run('group',[{type:'text',text:'test'}],'m1');await opening;
 const run=bot.runs.get('t');await bot.cancelOwnerGroup('group','m1');release('card');await work;await run.finishPromise;
 assert.equal(calls.includes('turn/start'),false);assert.equal(run.timer,undefined);assert.equal(bot.runs.size,0);
});
test('ordinary private execution does not depend on owner inbox cancellation storage',t=>{
 const {bot}=setup(t);bot.store={get:()=>null};assert.equal(bot.ownerMessageCancelled('private','m'),false);
});
test('existing owner resource and group document commands keep their original route',t=>{
 const {bot,event}=setup(t);
 for(const command of ['/owner query students {}','/group-doc document']){event.message.content=JSON.stringify({text:'@_user_1 '+command});assert.equal(bot.ownerAccess.routes(event),false);}
 event.message.content=JSON.stringify({text:'@_user_1 inspect files'});assert.equal(bot.ownerAccess.routes(event),true);
});
