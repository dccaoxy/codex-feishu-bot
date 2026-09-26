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
 const closed=[];bot.feishu.finish=async id=>closed.push(id);
 const work=bot.run('group',[{type:'text',text:'test'}],'m1');await opening;
 const run=bot.runs.get('t');await bot.cancelOwnerGroup('group','m1');release('card');await work;await run.finishPromise;
 assert.equal(calls.includes('turn/start'),false);assert.equal(run.timer,undefined);assert.equal(bot.runs.size,0);assert.deepEqual(closed,['card']);
});
test('ordinary private execution does not depend on owner inbox cancellation storage',t=>{
 const {bot}=setup(t);bot.store={get:()=>null};assert.equal(bot.ownerMessageCancelled('private','m'),false);
});
test('existing owner resource and group document commands keep their original route',t=>{
 const {bot,event}=setup(t);
 for(const command of ['/owner query students {}','/group-doc document']){event.message.content=JSON.stringify({text:'@_user_1 '+command});assert.equal(bot.ownerAccess.routes(event),false);}
 event.message.content=JSON.stringify({text:'@_user_1 inspect files'});assert.equal(bot.ownerAccess.routes(event),true);
});

import {Feishu} from '../src/feishu.mjs';
for(const reason of ['recall','revoke','leave'])test(`queued file upload is fenced after ${reason}`,async t=>{
 const {bot,config,event,groups}=setup(t);bot.onMessage(event);const f=new Feishu(config,()=>{});bot.feishu=f;fs.writeFileSync(path.join(config.codex.cwd,'test.txt'),'synthetic');
 let release;f.queue=new Promise(r=>{release=r;});const calls=[];f.client={im:{v1:{file:{create:async()=>{calls.push('upload');return {data:{file_key:'f'}};}},message:{create:async()=>{calls.push('send');return {};}}}}};
 const pending=bot.sendFile('group','test.txt',bot.ownerEffectGuard('group',null,'m1'));const rejected=assert.rejects(pending);
 if(reason==='recall')await bot.cancelOwnerGroup('group','m1');else if(reason==='revoke')config.ownerAccess.enabled=false;else groups.closed=true;
 release();await rejected;assert.deepEqual(calls,[]);
});
test('upload completed but queued message remains fenced, normal file sends exactly once',async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);const f=new Feishu(config,()=>{});bot.feishu=f;fs.writeFileSync(path.join(config.codex.cwd,'test.txt'),'synthetic');
 let uploaded,release;const gate=new Promise(r=>{uploaded=r;});const calls=[];
 f.client={im:{v1:{file:{create:async()=>{calls.push('upload');uploaded();await new Promise(r=>{release=r;});return {data:{file_key:'f'}};}},message:{create:async()=>{calls.push('send');return {};}}}}};
 const pending=bot.sendFile('group','test.txt',bot.ownerEffectGuard('group',null,'m1'));const rejected=assert.rejects(pending);await gate;await bot.cancelOwnerGroup('group','m1');release();await rejected;assert.deepEqual(calls,['upload']);
 event.message.message_id='m2';bot.onMessage(event);f.client.im.v1.file.create=async()=>{calls.push('upload');return {data:{file_key:'f'}};};await bot.sendFile('group','test.txt',bot.ownerEffectGuard('group',null,'m2'));assert.deepEqual(calls,['upload','upload','send']);
});
test('interrupt wait immediately invalidates old approval and closes existing card',async t=>{
 const {bot,event}=setup(t);bot.onMessage(event);const decisions=[],finished=[];let release;
 bot.rpc.request=()=>new Promise(r=>{release=r;});bot.rpc.respond=(...a)=>decisions.push(a);bot.feishu.finish=async(...a)=>finished.push(a);
 const r={chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1']),card:'existing',sequence:0,flush:Promise.resolve()};bot.runs.set('t',r);
 bot.prompts.set('token',{chat:'group',thread:'t',turn:'turn',id:3,expires:Date.now()+10000,method:'item/commandExecution/requestApproval'});
 const cancelled=bot.cancelOwnerGroup('group','m1');await assert.rejects(bot.action('group',{token:'token',decision:'accept'}));assert.equal(bot.prompts.has('token'),false);assert.deepEqual(decisions,[]);release();await cancelled;await r.finishPromise;assert.equal(finished[0][0],'existing');
});
for(const entry of ['command','tool','final'])test(`actual ${entry} entry cannot send queued files after revoke`,async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);bot.available=true;const f=new Feishu(config,()=>{});bot.feishu=f;fs.writeFileSync(path.join(config.codex.cwd,'test.txt'),'synthetic');let release;f.queue=new Promise(r=>{release=r;});const calls=[];
 f.client={im:{v1:{file:{create:async()=>{calls.push('upload');return {data:{file_key:'f'}};}},message:{create:async()=>{calls.push('send');return {};}}}}};
 const r={chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1']),messages:new Map([['x',{text:'x'.repeat(11000)}]]),card:'card',sequence:0,flush:Promise.resolve()};bot.runs.set('t',r);bot.rpc.respond=()=>{};f.update=async()=>{};f.finish=async()=>{};
 const pending=entry==='command'?bot.command('group','/send test.txt','m1'):entry==='tool'?bot.serverRequest({id:1,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_send_file',arguments:{path:'test.txt'}}}):bot.finishRun(r,'completed');
 const settled=pending.catch(()=>{});await new Promise(resolve=>setImmediate(resolve));config.ownerAccess.enabled=false;release();await settled;assert.deepEqual(calls,[]);
});
for(const failure of [false,true])test(`late card on leave closes without old result; cleanup failure=${failure}`,async t=>{
 const {bot,store,event,config,groups}=setup(t);bot.onMessage(event);bot.available=true;config.streamIntervalMs=60000;store.updateChat('group',{thread:'t'});store.set('tools:t',bot.toolVersion);bot.loaded.add('t');let opened,release;const opening=new Promise(r=>{opened=r;});const closed=[],sent=[];
 bot.feishu.stream=()=>{opened();return new Promise(r=>{release=r;});};bot.feishu.finish=async id=>{closed.push(id);if(failure)throw Error('synthetic close failure');};bot.feishu.text=async()=>sent.push('text');bot.rpc.request=async()=>{throw Error('no turn allowed');};
 const work=bot.run('group',[{type:'text',text:'test'}],'m1');await opening;const r=bot.runs.get('t');groups.closed=true;await bot.cancelOwnerGroup('group');release('late-card');await work;await r.finishPromise;assert.deepEqual(closed,['late-card']);assert.deepEqual(sent,[]);assert.equal(r.timer,undefined);assert.equal(bot.runs.size,0);
});
test('send retry rechecks authorization before invoking transport again',async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);const f=new Feishu(config,()=>{});let attempts=0;f.client={im:{v1:{message:{create:async()=>{attempts++;config.ownerAccess.enabled=false;return {code:230020};}}}}};
 await assert.rejects(f.send('group','file',{file_key:'synthetic'},undefined,bot.ownerEffectGuard('group',null,'m1')));assert.equal(attempts,1);
});
test('failed interrupt cannot restore old approval or tool authority and leaves other run intact',async t=>{
 const {bot,event}=setup(t);bot.onMessage(event);bot.available=true;const decisions=[];bot.rpc.respond=(...a)=>decisions.push(a);bot.rpc.request=async()=>{throw Error('interrupt timeout');};
 const r={chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1']),sequence:0,flush:Promise.resolve()};bot.runs.set('t',r);bot.runs.set('other',{chat:'private',thread:'other'});
 bot.prompts.set('token',{chat:'group',thread:'t',id:1,expires:Date.now()+10000});bot.prompts.set('other-token',{chat:'private',thread:'other',id:2,expires:Date.now()+10000});await bot.cancelOwnerGroup('group','m1');
 assert.notEqual(bot.onAction({operator:{open_id:'owner'},context:{open_chat_id:'group'},action:{value:{token:'token',decision:'accept'}}}).toast.content,'已收到，正在处理。');await assert.rejects(bot.action('group',{token:'token',decision:'accept'}));
 await bot.serverRequest({id:3,method:'item/tool/call',params:{threadId:'t',tool:'feishu_send_file',arguments:{path:'test.txt'}}});await r.finishPromise;assert.deepEqual(decisions,[]);assert.ok(bot.prompts.has('other-token'));assert.ok(bot.runs.has('other'));
});
for(const command of ['/read private-thread','/threads','/status'])for(const reason of ['recall','revoke','leave'])test(`${command} queued output blocked after ${reason}`,async t=>{
 const {bot,config,event,groups}=setup(t);bot.onMessage(event);bot.available=true;const f=new Feishu(config,()=>{});bot.feishu=f;let release;f.queue=new Promise(r=>{release=r;});const sent=[];f.client={im:{v1:{message:{create:async x=>{sent.push(x);return {};}}}}};bot.history.read=async()=>({text:'synthetic-private-history'});bot.history.search=async()=>({threads:[{id:'private-thread',title:'synthetic-private-history'}]});
 const result=bot.command('group',command,'m1').catch(()=>{});await new Promise(r=>setImmediate(r));if(reason==='recall')await bot.cancelOwnerGroup('group','m1');else if(reason==='revoke')config.ownerAccess.enabled=false;else groups.closed=true;release();await result;assert.deepEqual(sent,[]);
});
for(const command of ['/read private-thread','/threads','/status'])test(`${command} authorized output still delivered once`,async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);bot.available=true;const f=new Feishu(config,()=>{});bot.feishu=f;const sent=[];f.client={im:{v1:{message:{create:async x=>{sent.push(JSON.parse(x.data.content).text);return {};}}}}};bot.history.read=async()=>({text:'synthetic-private-history'});bot.history.search=async()=>({threads:[{id:'private-thread',title:'synthetic-private-history'}]});await bot.command('group',command,'m1');assert.equal(sent.length,1);assert.ok(sent[0].includes(command==='/status'?'工作目录':'synthetic-private-history'));
});
test('reference retains trusted source through real message command and run',async t=>{
 const {bot,store,event}=setup(t);event.message.content=JSON.stringify({text:'@_user_1 /reference private-thread summarize'});bot.onMessage(event);bot.available=true;bot.history.read=async()=>({text:'synthetic'});let received;bot.run=async(...args)=>{received=args;};const source=JSON.parse(store.pending()[0].payload);await bot.message('group',source);assert.equal(received[2],'m1');assert.equal(received[3],source);
});
test('reference recalled during history read never starts a turn',async t=>{
 const {bot,store,event}=setup(t);event.message.content=JSON.stringify({text:'@_user_1 /reference private-thread summarize'});bot.onMessage(event);bot.available=true;let release,opened;const opening=new Promise(r=>{opened=r;});bot.history.read=()=>{opened();return new Promise(r=>{release=r;});};let runs=0;bot.run=async()=>runs++;
 const result=bot.message('group',JSON.parse(store.pending()[0].payload));const rejected=assert.rejects(result);await opening;await bot.cancelOwnerGroup('group','m1');release({text:'synthetic'});await rejected;assert.equal(runs,0);
});
test('missing owner group source ID fails closed without SQLite binding error',t=>{
 const {bot,event}=setup(t);bot.onMessage(event);assert.equal(bot.ownerMessageCancelled('group',undefined),true);assert.throws(bot.ownerEffectGuard('group'),/取消|失效/);
});
for(const pathKind of ['history','controller','error'])test(`loss of authority during ${pathKind} await cannot publish result or error`,async t=>{
 const {bot,store,config,event}=setup(t);event.message.content=JSON.stringify({text:'@_user_1 /read private-thread'});bot.onMessage(event);bot.available=true;const f=new Feishu(config,()=>{});bot.feishu=f;const sent=[];f.client={im:{v1:{message:{create:async x=>{sent.push(x);return {};}}}}};let release,opened;const opening=new Promise(r=>{opened=r;});
 const wait=()=>{opened();return new Promise(r=>{release=r;});};bot.history.read=async()=>{await wait();if(pathKind==='error')throw Error('synthetic-private-history');return {text:'synthetic-private-history'};};
 if(pathKind==='controller'){bot.controller.status=async()=>{await wait();return {title:'synthetic-private-history',id:'t',cwd:'synthetic-private-directory'};};store.binding=()=>({source:'work'});}
 const result=pathKind==='error'?bot.drain('group'):bot.command('group',pathKind==='controller'?'/status':'/read private-thread','m1').catch(()=>{});
 await opening;config.ownerAccess.enabled=false;release();await result;assert.deepEqual(sent,[]);
});
test('reference real turn owns original ID and recall invalidates it while interrupt waits',async t=>{
 const {bot,store,event,config}=setup(t);event.message.content=JSON.stringify({text:'@_user_1 /reference private-thread summarize'});bot.onMessage(event);bot.available=true;config.streamIntervalMs=60000;store.updateChat('group',{thread:'t'});store.set('tools:t',bot.toolVersion);bot.loaded.add('t');bot.history.read=async()=>({text:'synthetic'});bot.feishu.stream=async()=> 'card';bot.feishu.finish=async()=>{};let release;const calls=[];
 bot.rpc.request=async(method,p)=>{calls.push([method,p]);if(method==='turn/interrupt')return new Promise(r=>{release=r;});return {turn:{id:'turn'}};};
 await bot.message('group',JSON.parse(store.pending()[0].payload));const run=bot.runs.get('t');assert.equal(calls[0][1].clientUserMessageId,'m1');assert.deepEqual([...run.sourceIds],['m1']);
 const cancelled=bot.cancelOwnerGroup('group','m1');assert.equal(run.ownerCancelled,true);assert.equal(run.ending,true);release();await cancelled;await run.finishPromise;assert.equal(calls[1][0],'turn/interrupt');assert.equal(bot.runs.size,0);
});
test('concurrent command guards stay isolated and cleanup can close a cancelled card',async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);const f=new Feishu(config,()=>{});const sent=[],closed=[];let release;f.queue=new Promise(r=>{release=r;});f.client={im:{v1:{message:{create:async x=>{sent.push(x.data.receive_id);return {};}}}},cardkit:{v1:{card:{settings:async x=>{closed.push(x.path.card_id);return {};}}}}};
 const owner=f.withGuard(bot.ownerEffectGuard('group',null,'m1'),()=>f.text('group','synthetic')).catch(()=>{});const privateWork=f.withGuard(()=>{},()=>f.text('private','safe'));
 config.ownerAccess.enabled=false;release();await Promise.all([owner,privateWork]);assert.deepEqual(sent,['private']);await f.effects.run(()=>{throw Error('cancelled');},()=>f.finish('card',1,'已停止'));assert.deepEqual(closed,['card']);
});
