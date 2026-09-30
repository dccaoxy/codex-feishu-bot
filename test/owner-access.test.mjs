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
test('recall interrupts only the matching active owner group run',async t=>{const {bot,event}=setup(t);bot.onMessage(event);const calls=[];bot.rpc.request=async(m,p)=>{calls.push([m,p]);};bot.endRun=r=>{r.ending=true;};const r={officeOwner:bot.owner,chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1'])};bot.runs.set('t',r);await bot.cancelOwnerGroup('group','other');assert.equal(calls.length,0);await bot.cancelOwnerGroup('group','m1');assert.deepEqual(calls,[['turn/interrupt',{threadId:'t',turnId:'turn'}]]);assert.equal(r.ownerCancelled,true);});
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
test('private recall is checked without requiring an Owner group channel marker',async t=>{
 const {bot,store}=setup(t);assert.equal(bot.ownerMessageCancelled('private','m'),false);
 store.enqueue('m','private',{kind:'message',user:'owner',message:{chat_type:'p2p',chat_id:'private',message_id:'m'}});
 await bot.cancelOwnerGroup('private','m');
 assert.equal(store.get('ownerChannel:private'),undefined);assert.equal(bot.ownerMessageCancelled('private','m'),true);
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
 const r={officeOwner:bot.owner,chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1']),card:'existing',sequence:0,flush:Promise.resolve()};bot.runs.set('t',r);
 bot.prompts.set('token',{chat:'group',thread:'t',turn:'turn',id:3,expires:Date.now()+10000,method:'item/commandExecution/requestApproval'});
 const cancelled=bot.cancelOwnerGroup('group','m1');await assert.rejects(bot.action('group',{token:'token',decision:'accept'}));assert.equal(bot.prompts.has('token'),false);assert.deepEqual(decisions,[]);release();await cancelled;await r.finishPromise;assert.equal(finished[0][0],'existing');
});
for(const entry of ['command','tool','final'])test(`actual ${entry} entry cannot send queued files after revoke`,async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);bot.available=true;const f=new Feishu(config,()=>{});bot.feishu=f;fs.writeFileSync(path.join(config.codex.cwd,'test.txt'),'synthetic');let release;f.queue=new Promise(r=>{release=r;});const calls=[];
 f.client={im:{v1:{file:{create:async()=>{calls.push('upload');return {data:{file_key:'f'}};}},message:{create:async()=>{calls.push('send');return {};}}}}};
 const r={officeOwner:bot.owner,chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1']),messages:new Map([['x',{text:'x'.repeat(11000)}]]),card:'card',sequence:0,flush:Promise.resolve()};bot.runs.set('t',r);bot.rpc.respond=()=>{};f.update=async()=>{};f.finish=async()=>{};
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
 const r={officeOwner:bot.owner,chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1']),sequence:0,flush:Promise.resolve()};bot.runs.set('t',r);bot.runs.set('other',{chat:'private',thread:'other'});
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
import {Documents} from '../src/documents.mjs';
function toolRun(bot){const r={officeOwner:bot.owner,chat:'group',thread:'t',turn:'turn',sourceIds:new Set(['m1']),flush:Promise.resolve(),sequence:0};bot.runs.set('t',r);bot.available=true;return r;}
function toolCall(bot,tool,args={}){return bot.serverRequest({id:41,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool,arguments:args}});}
for(const tool of ['feishu_thread_read','feishu_threads_search','owner_groups','aegpc_repository_approval'])for(const reason of ['recall','revoke','leave'])test(`${tool} await result discarded after ${reason}`,async t=>{
 const {bot,config,event,groups}=setup(t);bot.onMessage(event);toolRun(bot);let opened,release;const opening=new Promise(r=>{opened=r;});const read=()=>{opened();return new Promise(r=>{release=r;});};bot.history.read=read;bot.history.search=read;bot.ownerGroups={execute:read};bot.repositoryApproval.execute=read;bot.rpc.request=async()=>{};const responses=[];bot.rpc.respond=(...a)=>responses.push(a);
 const pending=toolCall(bot,tool,{threadId:'private'});await opening;if(reason==='recall')await bot.cancelOwnerGroup('group','m1');else if(reason==='revoke')config.ownerAccess.enabled=false;else groups.closed=true;release({text:'synthetic-private-history'});await pending;assert.deepEqual(responses,[]);
});
for(const reason of ['recall','revoke','leave'])test(`document patch queued before ${reason} never reaches SDK`,async t=>{
 const {bot,config,event,groups}=setup(t);bot.onMessage(event);toolRun(bot);const f=new Feishu(config,()=>{});bot.feishu=f;bot.documents=new Documents(f,()=>bot.owner);let release;f.queue=new Promise(r=>{release=r;});const calls=[],responses=[];f.client={docx:{documentBlock:{patch:async()=>{calls.push('patch');return {data:{document_revision_id:2}};}}}};bot.rpc.request=async()=>{};bot.rpc.respond=(...a)=>responses.push(a);
 const pending=toolCall(bot,'feishu_doc_update_text',{documentId:'doc1',blockId:'block1',text:'synthetic',revisionId:1});await new Promise(r=>setImmediate(r));if(reason==='recall')await bot.cancelOwnerGroup('group','m1');else if(reason==='revoke')config.ownerAccess.enabled=false;else groups.closed=true;release();await pending;assert.deepEqual(calls,[]);assert.deepEqual(responses,[]);
});
for(const stopAfter of ['convert','create','insert','permission',null])test(`document creation stage fencing after ${stopAfter}`,async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);toolRun(bot);const f=new Feishu(config,()=>{});bot.feishu=f;bot.documents=new Documents(f,()=>bot.owner);const calls=[],responses=[];
 const stage=(name,result)=>async()=>{calls.push(name);if(name===stopAfter)config.ownerAccess.enabled=false;return {data:result};};
 f.client={docx:{document:{convert:stage('convert',{blocks:[{block_id:'b',block_type:2}],first_level_block_ids:['b']}),create:stage('create',{document:{document_id:'doc1'}})},documentBlockDescendant:{create:stage('insert',{})}},drive:{permissionMember:{create:stage('permission',{})}}};bot.rpc.respond=(...a)=>responses.push(a);
 await toolCall(bot,'feishu_doc_create',{title:'synthetic',content:'synthetic'});const all=['convert','create','insert','permission'];assert.deepEqual(calls,stopAfter?all.slice(0,all.indexOf(stopAfter)+1):all);assert.equal(responses.length,stopAfter?0:1);if(!stopAfter)assert.equal(responses[0][1].success,true);
});
test('cancelled owner tool does not suppress concurrent private tool response',async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);toolRun(bot);bot.runs.set('private-thread',{chat:'private',thread:'private-thread',turn:'private-turn'});let release,opened;const opening=new Promise(r=>{opened=r;});bot.history.read=()=>{opened();return new Promise(r=>{release=r;});};bot.history.search=async()=>({text:'private-valid'});const responses=[];bot.rpc.respond=(...a)=>responses.push(a);
 const pending=toolCall(bot,'feishu_thread_read',{threadId:'private'});await opening;config.ownerAccess.enabled=false;await bot.serverRequest({id:42,method:'item/tool/call',params:{threadId:'private-thread',turnId:'private-turn',tool:'feishu_threads_search',arguments:{}}});release({text:'cancelled'});await pending;assert.deepEqual(responses.map(x=>x[0]),[42]);
});
for(const tool of ['feishu_thread_read','feishu_threads_search','owner_groups','aegpc_repository_approval'])test(`${tool} valid run responds exactly once unchanged`,async t=>{
 const {bot,event}=setup(t);bot.onMessage(event);toolRun(bot);let calls=0;const expected={text:'synthetic-authorized'};const read=async()=>{calls++;return expected;};bot.history.read=read;bot.history.search=read;bot.ownerGroups={execute:read};bot.repositoryApproval.execute=read;const responses=[];bot.rpc.respond=(...a)=>responses.push(a);await toolCall(bot,tool,{});assert.equal(calls,1);assert.equal(responses.length,1);assert.deepEqual(JSON.parse(responses[0][1].contentItems[0].text),expected);
});
test('Documents explicit guard fences queued SDK without command or tool async context',async t=>{
 const {bot,config,event}=setup(t);bot.onMessage(event);const run=toolRun(bot),f=new Feishu(config,()=>{}),docs=new Documents(f,()=>bot.owner);let release;f.queue=new Promise(r=>{release=r;});let writes=0;f.client={docx:{documentBlock:{patch:async()=>{writes++;return {};}}}};
 const pending=docs.execute('feishu_doc_update_text',{documentId:'doc1',blockId:'block1',text:'synthetic',revisionId:1},bot.ownerEffectGuard('group',run));const rejected=assert.rejects(pending);config.ownerAccess.enabled=false;release();await rejected;assert.equal(writes,0);
});
const localTools=['feishu_thread_read','feishu_threads_search','owner_groups',...['status','message','search','context','changes','daily_digest','topics','topic_read','send'].map(n=>'owner_group_'+n),'aegpc_repository_approval',...['create','read','append','update_text','format_text','permissions'].map(n=>'feishu_doc_'+n),'feishu_send_file',...['find','schema','call','permissions','sheet_read','sheet_write'].map(n=>'feishu_office_'+n)];
for(const tool of localTools)for(const turnId of ['old-turn','',undefined,42])test(`${tool} rejects invalid request turn ${String(turnId)}`,async t=>{
 const {bot,event}=setup(t);bot.onMessage(event);toolRun(bot);let calls=0;const call=async()=>{calls++;return {};};bot.history.read=call;bot.history.search=call;bot.ownerGroups={execute:call};bot.repositoryApproval.execute=call;bot.documents.execute=call;bot.office.execute=call;bot.requestOfficeApproval=async()=>({check(){},consume(){}});bot.sendFile=call;bot.rpc.respond=call;bot.rpc.reject=call;
 await bot.serverRequest({id:51,method:'item/tool/call',params:{threadId:'t',turnId,tool,arguments:{}}});assert.equal(calls,0);
});
for(const tool of localTools)test(`${tool} result discarded if turn switches during await`,async t=>{
 const {bot,event}=setup(t);bot.onMessage(event);const run=toolRun(bot);let opened,release;const opening=new Promise(r=>{opened=r;});const call=()=>{opened();return new Promise(r=>{release=r;});};bot.history.read=call;bot.history.search=call;bot.ownerGroups={execute:call};bot.repositoryApproval.execute=call;bot.documents.execute=call;bot.office.execute=call;bot.requestOfficeApproval=async()=>({check(){},consume(){}});bot.sendFile=call;const responses=[];bot.rpc.respond=(...a)=>responses.push(a);
 const pending=toolCall(bot,tool);await opening;run.turn='next-turn';release({text:'synthetic'});await pending;assert.deepEqual(responses,[]);
});
for(const tool of localTools)test(`${tool} current turn executes and responds once`,async t=>{
 const {bot,event}=setup(t);bot.onMessage(event);toolRun(bot);let calls=0;const call=async()=>{calls++;return {value:'synthetic'};};bot.history.read=call;bot.history.search=call;bot.ownerGroups={execute:call};bot.repositoryApproval.execute=call;bot.documents.execute=call;bot.office.execute=call;bot.requestOfficeApproval=async()=>({check(){},consume(){}});bot.sendFile=call;const responses=[];bot.rpc.respond=(...a)=>responses.push(a);await toolCall(bot,tool);assert.equal(calls,1);assert.equal(responses.length,1);assert.equal(responses[0][1].success,true);
});
for(const stage of ['queue','response'])test(`office tools invalidate captured Owner identity at ${stage}`,async t=>{
 const {bot,event,config}=setup(t);bot.onMessage(event);const run=toolRun(bot);let validOwner=bot.owner,network=0;const responses=[];bot.rpc.respond=(...a)=>responses.push(a);
 bot.office.feishu={client:{drive:{v1:{file:{list:async()=>{network++;if(stage==='response')bot.owner='changed';return {private:'must-not-return'};}}}}},call:async(fn,retry,g)=>{if(stage==='queue')bot.owner='changed';g();return fn();}};
 assert.equal(run.officeOwner,validOwner);await toolCall(bot,'feishu_office_call',{api:'drive.v1.file.list',payload:{}});assert.equal(network,stage==='queue'?0:1);assert.ok(!JSON.stringify(responses).includes('must-not-return'));
});
for(const cancel of ['revoke','recall'])test(`queued office mutation is blocked by real Feishu queue after ${cancel}`,async t=>{
 const {bot,event,config,groups}=setup(t);bot.onMessage(event);toolRun(bot);const f=new Feishu(config,()=>{});bot.office.feishu=f;bot.requestOfficeApproval=async()=>({check(){},consume(){}});let release;f.queue=new Promise(r=>{release=r;});let calls=0;f.client={request:async()=>{calls++;return {data:{}};}};bot.rpc.respond=()=>{};bot.rpc.request=async()=>{};
 const pending=toolCall(bot,'feishu_office_sheet_write',{spreadsheetToken:'sheet',range:'tab!A1:A1',values:[['fixture']]});await new Promise(r=>setTimeout(r,5));
 if(cancel==='revoke')groups.policy.allowedGroup=()=>false;else await bot.cancelOwnerGroup('group','m1');
 release();await pending;assert.equal(calls,0);
});
function officeFixture(t){
 const s=setup(t);s.bot.onMessage(s.event);s.store.mark('m1','done');const run=toolRun(s.bot),sent=[],writes=[];
 s.bot.feishu.interactive=async(chat,title,text,buttons)=>{sent.push({chat,title,text,buttons});return {message_id:'approval-card'};};s.bot.feishu.replaceInteractive=async()=>{};s.bot.feishu.text=async()=>{};
 s.bot.office.feishu={client:{drive:{v1:{file:{delete:async payload=>{writes.push(payload);return {deleted:true};}}}}},call:async(fn,retry,g)=>{g();return fn();}};
 s.bot.rpc.respond=()=>{};s.bot.rpc.request=async()=>{};
 return {...s,run,sent,writes};
}
const deletion=()=>({api:'drive.v1.file.delete',payload:{params:{type:'docx'},path:{file_token:'exactTarget'}}});
async function officePending(s,id=41,args=deletion()){
 const promise=s.bot.serverRequest({id,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_office_call',arguments:args}});
 await new Promise(r=>setImmediate(r));return {promise,token:s.sent.at(-1)?.buttons[0].value.token};
}
async function confirmOffice(s,token,user='owner',decision='accept'){
 const reply=s.bot.onAction({operator:{open_id:user},context:{open_chat_id:'group'},action:{value:{token,decision}}});
 if(reply.toast.type==='info')await s.bot.drain('group');return reply;
}
test('history-induced deletion proposal requires real Owner callback; exact confirmed operation runs once',async t=>{
 const s=officeFixture(t),p=await officePending(s);assert.equal(s.writes.length,0);assert.match(s.sent[0].text,/drive.v1.file.delete/);assert.match(s.sent[0].text,/exactTarget/);assert.match(s.sent[0].text,/m1/);
 assert.equal((await confirmOffice(s,p.token,'member')).toast.type,'error');assert.equal(s.writes.length,0);
 await assert.rejects(s.bot.action('group',{token:p.token,decision:'accept'}),/原Owner/);assert.equal(s.writes.length,0);
 await confirmOffice(s,p.token);await p.promise;assert.equal(s.writes.length,1);assert.equal(s.writes[0].path.file_token,'exactTarget');
 await confirmOffice(s,p.token);await officePending(s,42);assert.equal(s.writes.length,1);assert.equal(s.sent.length,1);
});
test('changing caller payload after displaying proposal cannot change approved operation',async t=>{
 const s=officeFixture(t),args=deletion(),p=await officePending(s,41,args);args.api='task.v2.task.delete';args.payload.path.file_token='changed';
 await confirmOffice(s,p.token);await p.promise;assert.equal(s.writes[0].path.file_token,'exactTarget');
 const changed=await officePending(s,43,{...deletion(),payload:{params:{type:'docx'},path:{file_token:'otherTarget'}}});assert.equal(s.writes.length,1);assert.equal(s.sent.length,2);
 await confirmOffice(s,p.token);assert.equal(s.writes.length,1);await confirmOffice(s,changed.token,'owner','decline');await changed.promise;assert.equal(s.writes.length,1);
});
for(const reason of ['recall','revoke','owner','turn','steer','ended','sourceChanged','expired'])test(`office consent invalid after ${reason}`,async t=>{
 const s=officeFixture(t),p=await officePending(s);
 if(reason==='recall')await s.bot.cancelOwnerGroup('group','m1');
 if(reason==='revoke')s.config.ownerAccess.enabled=false;
 if(reason==='owner')s.bot.owner='someoneElse';
 if(reason==='turn')s.run.turn='later';
 if(reason==='steer')s.run.sourceIds.add('later-message');
 if(reason==='ended')s.run.ending=true;
 if(reason==='sourceChanged')s.store.db.prepare("UPDATE inbox SET payload='{}' WHERE id='m1'").run();
 if(reason==='expired'){const old=Date.now;Date.now=()=>old()+11*60*1000;t.after(()=>{Date.now=old;});}
 await confirmOffice(s,p.token);for(const token of [...s.bot.prompts.keys()])s.bot.clearPrompt(token);await p.promise;assert.equal(s.writes.length,0);
});
test('approved queued office write is blocked when authorization is revoked before transport',async t=>{
 const s=officeFixture(t);let release,queued;const entered=new Promise(r=>queued=r);s.bot.office.feishu.call=async(fn,retry,g)=>{queued();await new Promise(r=>release=r);g();return fn();};
 const p=await officePending(s);await confirmOffice(s,p.token);await entered;s.config.ownerAccess.enabled=false;release();await p.promise;assert.equal(s.writes.length,0);
});
test('office confirmation fails closed without trusted source message and on oversized review payload',async t=>{
 const s=officeFixture(t);s.run.sourceIds.clear();const p=await officePending(s);await p.promise;assert.equal(s.sent.length,0);assert.equal(s.writes.length,0);
 s.run.sourceIds.add('m1');await assert.rejects(s.bot.requestOfficeApproval(s.run,55,{api:'write',payload:'x'.repeat(9000)},()=>{}),/过长/);assert.equal(s.sent.length,0);
});
test('a parallel duplicate tool call cannot create a second permit',async t=>{const s=officeFixture(t),p=await officePending(s);const duplicate=await officePending(s,42);await duplicate.promise;assert.equal(s.sent.length,1);assert.equal(s.writes.length,0);await confirmOffice(s,p.token);await p.promise;assert.equal(s.writes.length,1);});
test('trusted current slash confirmation works, quoted or synthetic confirmation cannot',async t=>{
 const s=officeFixture(t),p=await officePending(s);await assert.rejects(s.bot.command('group','/approve '+p.token,'fake',{user:'owner',message:{message_id:'fake'}}),/原Owner/);assert.equal(s.writes.length,0);
 const message={...s.event.message,message_id:'approval-message',content:JSON.stringify({text:'@_user_1 /approve '+p.token})};s.bot.onMessage({...s.event,message});await s.bot.drain('group');await p.promise;assert.equal(s.writes.length,1);
});
test('private Owner office confirmation is scoped to its source message and account',async t=>{
 const s=officeFixture(t);s.store.set('ownerChannel:group','');s.bot.ownerAccess=null;
 s.store.db.prepare('UPDATE inbox SET payload=? WHERE id=?').run(JSON.stringify({kind:'message',user:'owner',message:{...s.event.message,chat_type:'p2p'},content:{text:'only read'}}),'m1');
 const p=await officePending(s);assert.equal(s.writes.length,0);await confirmOffice(s,p.token,'member');assert.equal(s.writes.length,0);await confirmOffice(s,p.token);await p.promise;assert.equal(s.writes.length,1);
});
test('approval of markup-containing payload displays escaped full JSON and never executes before confirmation',async t=>{
 const s=officeFixture(t),pending=s.bot.requestOfficeApproval(s.run,55,{api:'fixture.write',payload:{text:'```\n[spoof](https://example.com) <b>'}},()=>{});await new Promise(r=>setImmediate(r));
 assert.match(s.sent[0].text,/\\u0060/);assert.match(s.sent[0].text,/\\u003c/);const token=s.sent[0].buttons[0].value.token;const denied=assert.rejects(pending);await confirmOffice(s,token,'owner','decline');await denied;
});
test('office consent is rechecked at final RPC delivery after tool completion',async t=>{
 const s=officeFixture(t),responses=[];s.bot.rpc.respond=(...args)=>responses.push(args);
 s.bot.office.execute=async(name,args,guard,authorize)=>{const permit=await authorize({api:'fixture.write',payload:{target:'x'}});permit.consume();s.run.sourceIds.add('new-message');return {private:'must-not-deliver'};};
 const p=await officePending(s);await confirmOffice(s,p.token);await p.promise;assert.equal(responses.length,0);
});

function privateOfficeFixture(t){
 const s=officeFixture(t);s.store.set('ownerChannel:group','');s.run.chat='private';
 s.store.db.prepare("DELETE FROM inbox WHERE id='m1'").run();
 s.event={...s.event,message:{...s.event.message,chat_type:'p2p',chat_id:'private',mentions:[],content:JSON.stringify({text:'delete exactTarget'})}};
 s.bot.onMessage(s.event);s.store.mark('m1','done');
 return s;
}
async function privateConfirm(s,token){
 s.bot.onAction({operator:{open_id:'owner'},context:{open_chat_id:'private'},action:{value:{token,decision:'accept'}}});
 await s.bot.drain('private');
}
for(const method of ['button','slash'])test(`production recall invalidates private office consent before ${method}`,async t=>{
 const s=privateOfficeFixture(t),p=await officePending(s),interrupts=[];s.bot.rpc.request=async(...a)=>interrupts.push(a);
 await s.bot.cancelOwnerGroup('private','m1');
 assert.equal(s.store.db.prepare("SELECT state FROM inbox WHERE id='m1'").get().state,'cancelled');
 assert.equal(s.bot.prompts.has(p.token),false);assert.equal(s.run.ownerCancelled,true);
 if(method==='button')await privateConfirm(s,p.token);
 else{s.bot.onMessage({...s.event,message:{...s.event.message,message_id:'confirm',content:JSON.stringify({text:'/approve '+p.token})}});await s.bot.drain('private');}
 await p.promise;await s.run.finishPromise;assert.equal(s.writes.length,0);
 assert.ok(interrupts.some(([m])=>m==='turn/interrupt'));
});
test('private recall after approval prevents queued SDK write',async t=>{
 const s=privateOfficeFixture(t);let release,entered;const queued=new Promise(r=>entered=r);
 s.bot.office.feishu.call=async(fn,retry,g)=>{entered();await new Promise(r=>release=r);g();return fn();};
 const p=await officePending(s);await privateConfirm(s,p.token);await queued;
 await s.bot.cancelOwnerGroup('private','m1');release();await p.promise;await s.run.finishPromise;assert.equal(s.writes.length,0);
});
test('unrelated private recall and untrusted recall leave pending consent intact',async t=>{
 const s=privateOfficeFixture(t),p=await officePending(s);
 s.bot.onMessage({...s.event,message:{...s.event.message,message_id:'unrelated'}});s.store.mark('unrelated','done');
 for(const id of [undefined,'missing','unrelated'])await s.bot.cancelOwnerGroup('private',id);
 s.store.enqueue('foreign','private',{kind:'message',user:'member',message:{...s.event.message,message_id:'foreign'}});s.store.mark('foreign','done');
 await s.bot.cancelOwnerGroup('private','foreign');await s.bot.cancelOwnerGroup('other','m1');
 assert.equal(s.run.ownerCancelled,undefined);assert.equal(s.bot.prompts.has(p.token),true);
 await privateConfirm(s,p.token);await p.promise;assert.equal(s.writes.length,1);
});
