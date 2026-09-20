import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {ThreadController} from '../src/thread-controller.mjs';
import {Bot} from '../src/bot.mjs';
import {loadConfig,externalPermission} from '../src/config.mjs';

class Rpc extends EventEmitter {
  url='ws://127.0.0.1:9999'; calls=[]; responses=[]; state='idle'; turn='active-turn'; direct=true; failResume=false;
  async request(method,params) {
    this.calls.push({method,params});
    const thread={id:params.threadId || 'forked',name:'外部',cwd:'/original/project',canAcceptDirectInput:this.direct,status:{type:this.state}};
    if(method==='thread/read') return {thread};
    if(method==='thread/resume') {if(this.failResume)throw new Error('resume failed');return {thread};}
    if(method==='thread/turns/list') return {data:this.state==='active'?[{id:this.turn,status:'inProgress',items:[]}]:[],nextCursor:null};
    if(method==='turn/start') {this.state='active';return {turn:{id:this.turn}};}
    if(method==='turn/steer') return {turnId:this.turn};
    if(method==='thread/fork') return {thread:{id:'forked'}};
    return {};
  }
  respond(id,result){this.responses.push({id,result});}
  reject(id,error){this.responses.push({id,error});}
}
function setup(t,permission='work') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feishu-work-'));
  const store=new Store(dir),rpc=new Rpc();
  const config={feishu:{appId:'',appSecret:'',ownerOpenId:'owner'},codex:{binary:'codex',cwd:dir,sandbox:'read-only',approvalPolicy:'on-request',externalThreadPermission:permission,appServerUrl:rpc.url},storageDir:dir,streamIntervalMs:100000,maxAttachmentMB:1};
  const controller=new ThreadController(config,store,rpc);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,store,rpc,config,controller};
}
test('read cannot attach or write; Work requires the shared transport',async t=>{
  const {controller,rpc,config}=setup(t,'read');
  await assert.rejects(controller.attach('chat','external'),/work/);
  assert.equal(rpc.calls.length,0);
  config.codex.externalThreadPermission='work';rpc.url=null;
  await assert.rejects(controller.attach('chat','external'),/共享/);
  assert.equal(rpc.calls.length,0);
});
test('idle attach resumes original ID without overriding settings and sends to same thread',async t=>{
  const {controller,store,rpc}=setup(t);
  store.addThread('bot','Bot');store.updateChat('chat',{thread:'bot'});
  await controller.attach('chat','external');
  assert.deepEqual(rpc.calls.find(c=>c.method==='thread/resume').params,{threadId:'external',excludeTurns:true});
  assert.equal(store.binding('chat').source,'external');
  await controller.send('chat',[{type:'text',text:'continue'}],'m');
  assert.deepEqual(rpc.calls.at(-1).params,{threadId:'external',input:[{type:'text',text:'continue'}],clientUserMessageId:'m'});
  controller.detach('chat');assert.equal(store.chat('chat').thread,'bot');
  assert.ok(!rpc.calls.some(c=>c.method==='thread/start'));
});
test('active send steers exact turn; interrupt uses same target; no second turn starts',async t=>{
  const {controller,rpc}=setup(t);rpc.state='active';await controller.attach('chat','external');
  await controller.send('chat',[{type:'text',text:'extra'}]);
  assert.equal(rpc.calls.at(-1).method,'turn/steer');
  assert.equal(rpc.calls.at(-1).params.expectedTurnId,'active-turn');
  await controller.interrupt('chat');
  assert.deepEqual(rpc.calls.at(-1),{method:'turn/interrupt',params:{threadId:'external',turnId:'active-turn'}});
  assert.ok(!rpc.calls.some(c=>c.method==='turn/start'));
});
test('status is rechecked after UI delay and active work is steered',async t=>{
  const {controller,rpc}=setup(t);await controller.attach('chat','external');
  await controller.send('chat',[],undefined,async()=>{rpc.state='active';});
  assert.equal(rpc.calls.at(-1).method,'turn/steer');
});
test('unknown/unloaded/noninteractive states and failed resume fail closed',async t=>{
  const {controller,rpc,store}=setup(t);
  for(const state of ['notLoaded','systemError','unknown']){
    rpc.state=state;await assert.rejects(controller.attach('chat','external'),/无法确认/);
  }
  rpc.state='idle';rpc.direct=false;await assert.rejects(controller.attach('chat','external'),/无法确认/);
  rpc.direct=true;rpc.failResume=true;await assert.rejects(controller.attach('chat','external'),/resume failed/);
  assert.equal(store.binding('chat'),undefined);
  assert.ok(!rpc.calls.some(c=>c.method.startsWith('turn/')));
});
test('active without reliable turn ID refuses writes',async t=>{
  const {controller,rpc}=setup(t);rpc.state='active';rpc.turn=null;
  await assert.rejects(controller.attach('chat','external'),/无法确认/);
  assert.ok(!rpc.calls.some(c=>c.method==='thread/resume'));
});
test('fork uses separate ID, excludes in-progress turn, and keeps Work source',async t=>{
  const {controller,rpc,store}=setup(t);rpc.state='active';await controller.attach('chat','external');
  await controller.fork('chat');
  assert.equal(store.chat('chat').thread,'forked');assert.equal(store.binding('chat').source,'external-fork');
  assert.equal(store.ownThread('forked'),undefined);
  assert.deepEqual(rpc.calls.find(c=>c.method==='thread/fork').params,{threadId:'external',excludeTurns:true,deferGoalContinuation:true,beforeTurnId:'active-turn'});
  assert.ok(!rpc.calls.some(c=>c.method==='turn/start'||c.method==='turn/interrupt'));
});
test('binding survives reopening; recovery invalidates cached state without RPC replay',async t=>{
  const {controller,rpc,store,dir,config}=setup(t);await controller.attach('chat','external');
  const reopened=new Store(dir),freshRpc=new Rpc();
  try{const fresh=new ThreadController(config,reopened,freshRpc);fresh.disconnected();
    assert.equal(reopened.binding('chat').thread,'external');assert.equal(reopened.binding('chat').status,'unknown');
    assert.equal(freshRpc.calls.length,0);await fresh.send('chat',[]);
    assert.equal(freshRpc.calls.find(c=>c.method==='turn/start').params.threadId,'external');
  }finally{reopened.close();}
});
test('same thread cannot be attached to two chats or receive overlapping local operations',async t=>{
  const {controller,store,rpc}=setup(t);await controller.attach('one','external');
  await assert.rejects(controller.attach('two','external'),/其他/);
  let release;const gate=new Promise(r=>{release=r;});
  const pending=controller.send('one',[],undefined,()=>gate);
  await assert.rejects(controller.send('one',[]),/操作进行中/);release();await pending;
  assert.equal(store.binding('two'),undefined);assert.equal(rpc.calls.filter(c=>c.method==='turn/start').length,1);
});
test('configuration keeps legacy read/off, accepts Work and rejects Full and remote endpoints',t=>{
  const {dir,config}=setup(t);const file=path.join(dir,'config.json');
  const load=c=>{fs.writeFileSync(file,JSON.stringify(c));return loadConfig(file,false);};
  for(const value of [true,false]){
    const c=structuredClone(config);delete c.codex.externalThreadPermission;c.codex.allowExternalThreadRead=value;
    assert.equal(externalPermission(load(c)),value?'read':'off');
  }
  assert.equal(externalPermission(load(config)),'work');
  const full=structuredClone(config);full.codex.externalThreadPermission='full';assert.throws(()=>load(full),/Full/);
  const remote=structuredClone(config);remote.codex.appServerUrl='ws://example.com:9999';assert.throws(()=>load(remote),/本机/);
  const isolated=structuredClone(config);delete isolated.codex.appServerUrl;assert.throws(()=>load(isolated),/共享/);
});
test('Bot Work commands cannot compact, change models or migrate external history to new thread',async t=>{
  const {config,store,rpc}=setup(t);const messages=[];
  const feishu={text:async(c,text)=>messages.push(text),stream:async()=>null,finish:async()=>{},update:async()=>{}};
  const bot=new Bot(config,store,rpc,feishu,()=>{});
  try{
    await bot.command('chat','/attach external');
    await assert.rejects(bot.command('chat','/compact'),/管理权限/);
    await assert.rejects(bot.command('chat','/model other'),/原模型/);
    await bot.run('chat',[{type:'text',text:'continue'}]);
    assert.equal(rpc.calls.find(c=>c.method==='turn/start').params.threadId,'external');
    assert.ok(!rpc.calls.some(c=>['thread/start','thread/compact/start','thread/name/set'].includes(c.method)));
    await bot.command('chat','/detach');assert.equal(store.binding('chat'),undefined);
    assert.ok(!rpc.calls.some(c=>c.method==='turn/interrupt'));
  }finally{await bot.close();}
});
test('Bot recovery keeps external binding but drops uncertain and queued external input',async t=>{
  const {config,store,rpc,controller}=setup(t);await controller.attach('chat','external');
  store.enqueue('queued','chat',{});store.enqueue('inflight','chat',{});store.mark('inflight','processing');
  rpc.calls=[];const bot=new Bot(config,store,rpc,{text:async()=>{}},()=>{});
  try{await bot.recover();assert.equal(rpc.calls.length,0);assert.equal(store.pending().length,0);assert.equal(store.binding('chat').thread,'external');}finally{await bot.close();}
});
test('live turn history overrides lagging idle metadata',async t=>{
  const {controller,rpc}=setup(t);
  const request=rpc.request.bind(rpc);
  rpc.request=async(m,p)=>m==='thread/turns/list'?{data:[{id:'live',status:'inProgress'}]}:request(m,p);
  await controller.attach('chat','external');await controller.send('chat',[]);
  assert.equal(rpc.calls.at(-1).method,'turn/steer');assert.equal(rpc.calls.at(-1).params.expectedTurnId,'live');
});
test('only unsupported pagination falls back; general protocol errors stop writes',async t=>{
  const {controller,rpc}=setup(t);let unsupported=true;
  const request=rpc.request.bind(rpc);
  rpc.request=async(m,p)=>{
    if(m==='thread/turns/list'){const e=new Error('unavailable');e.code=unsupported?-32601:-32000;throw e;}
    const result=await request(m,p);if(m==='thread/read')result.thread.turns=[];return result;
  };
  await controller.attach('chat','external');unsupported=false;
  await assert.rejects(controller.send('chat',[]),/unavailable/);
  assert.ok(!rpc.calls.some(c=>c.method==='turn/start'));
});
test('permission downgrade prevents writes on an existing attachment',async t=>{
  const {controller,rpc,config}=setup(t);await controller.attach('chat','external');rpc.calls=[];
  config.codex.externalThreadPermission='read';
  for(const operation of [()=>controller.send('chat',[]),()=>controller.interrupt('chat'),()=>controller.fork('chat'),()=>controller.resume('external')])await assert.rejects(operation(),/work/);
  assert.equal(rpc.calls.length,0);controller.detach('chat');
});
test('reattach and fork preserve an empty previous binding for detach',async t=>{
  const {controller,store}=setup(t);
  await controller.attach('chat','external');await controller.fork('chat');
  await controller.attach('chat','external');controller.detach('chat');
  assert.equal(store.chat('chat').thread,null);
});
test('completion during dispatch cannot finalize the old turn before the new turn ID arrives',async t=>{
  const {config,store,rpc}=setup(t);
  const bot=new Bot(config,store,rpc,{text:async()=>{},stream:async()=>null},()=>{});
  bot.controller.send=async(chat,input,key,before)=>{
    await before({id:'external',turn:'old',title:'test'});
    bot.notification({method:'turn/completed',params:{threadId:'external',turn:{id:'old',status:'completed'}}});
    await bot.refreshExternalRun(bot.runs.get('external'));
    assert.equal(bot.runs.get('external').ending,false);
    return {kind:'start',turnId:'new'};
  };
  try{
    await bot.runExternal('chat',[]);
    const r=bot.runs.get('external');assert.equal(r.turn,'new');assert.equal(r.dispatching,false);assert.equal(r.ending,false);
  }finally{await bot.close();}
});
test('a new turn from the other client is observed after an idle attachment',async t=>{
  const {config,store,rpc,controller}=setup(t);rpc.shared=true;await controller.attach('chat','external');
  let release;const gate=new Promise(r=>release=r);const finished=[];
  const bot=new Bot(config,store,rpc,{stream:async()=>{await gate;return 'card';},text:async()=>{},update:async()=>{},finish:async()=>finished.push(true)},()=>{});
  try{
    bot.notification({method:'turn/started',params:{threadId:'external',turn:{id:'desktop-turn'}}});
    const run=bot.runs.get('external');assert.equal(run.turn,'desktop-turn');
    bot.notification({method:'turn/completed',params:{threadId:'external',turn:{id:'desktop-turn',status:'completed'}}});
    assert.equal(run.ending,false);release();await new Promise(r=>setImmediate(r));await run.finishPromise;
    assert.equal(run.ending,true);assert.equal(finished.length,1);assert.equal(bot.runs.size,0);
  }finally{release();await bot.close();}
});
test('shared desktop tool requests are not rejected by the Feishu observer',async t=>{
  const {config,store,rpc}=setup(t);rpc.shared=true;
  const bot=new Bot(config,store,rpc,{},()=>{});bot.runs.set('external',{external:true,chat:'chat',turn:'turn'});
  try{await bot.serverRequest({id:123,method:'item/tool/call',params:{threadId:'external',tool:'desktop_owned_tool',arguments:{}}});assert.equal(rpc.responses.length,0);}finally{await bot.close();}
});
test('approval resolved by another client invalidates the Feishu action',async t=>{
  const {config,store,rpc}=setup(t);rpc.shared=true;const messages=[];
  const bot=new Bot(config,store,rpc,{text:async(c,s)=>messages.push(s),interactive:async()=>{}},()=>{});bot.runs.set('external',{external:true,chat:'chat',turn:'turn'});
  try{
    await bot.serverRequest({id:17,method:'item/commandExecution/requestApproval',params:{threadId:'external',turnId:'turn',command:'printf test'}});
    const token=[...bot.prompts.keys()][0];assert.ok(token);
    bot.notification({method:'serverRequest/resolved',params:{requestId:17}});
    await assert.rejects(bot.action('chat',{token,decision:'accept'}),/失效/);assert.equal(rpc.responses.length,0);assert.equal(messages.length,1);
  }finally{await bot.close();}
});
test('detaching a shared observer does not deny the other client approval',async t=>{
  const {config,store,rpc,controller}=setup(t);rpc.shared=true;await controller.attach('chat','external');
  const bot=new Bot(config,store,rpc,{text:async()=>{},interactive:async()=>{}},()=>{});
  bot.runs.set('external',{external:true,chat:'chat',thread:'external',turn:'t',sequence:0,text:'',flush:Promise.resolve()});
  try{await bot.serverRequest({id:18,method:'item/commandExecution/requestApproval',params:{threadId:'external',turnId:'t',command:'printf test'}});await bot.command('chat','/detach');assert.equal(bot.prompts.size,0);assert.equal(rpc.responses.length,0);}finally{await bot.close();}
});
test('shared observer presentation failures never decide the peer approval (R1)',async t=>{
  const {config,store,rpc}=setup(t);rpc.shared=true;
  const bot=new Bot(config,store,rpc,{interactive:async()=>{throw new Error('offline');},text:async()=>{}},()=>{});
  bot.runs.set('external',{external:true,chat:'chat',turn:'turn'});
  try{
    for(const [method,params] of [
      ['item/commandExecution/requestApproval',{command:'printf test'}],
      ['mcpServer/elicitation/request',{mode:'form',requestedSchema:{type:'string'}}],
      ['item/tool/requestUserInput',{questions:[{id:'secret',isSecret:true}]}],
      ['unknown/interaction',{}],
    ]){await bot.serverRequest({id:1,method,params:{threadId:'external',turnId:'turn',...params}});assert.equal(rpc.responses.length,0);assert.equal(bot.prompts.size,0);}
  }finally{await bot.close();}
});
test('slow card A does not lose next turn B output or approval (R2)',async t=>{
  const {config,store,rpc,controller}=setup(t);rpc.shared=true;await controller.attach('chat','external');
  let release;const gate=new Promise(r=>release=r);let count=0;const updates=[];
  const bot=new Bot(config,store,rpc,{stream:async()=>{const n=++count;if(n===1)await gate;return 'card'+n;},update:async(c,text)=>updates.push([c,text]),finish:async()=>{},text:async()=>{},interactive:async()=>{}},()=>{});
  try{
    bot.notification({method:'turn/started',params:{threadId:'external',turn:{id:'A'}}});
    const a=bot.runs.get('external');
    bot.notification({method:'turn/completed',params:{threadId:'external',turn:{id:'A',status:'completed'}}});
    bot.notification({method:'turn/started',params:{threadId:'external',turn:{id:'B'}}});
    bot.notification({method:'item/completed',params:{threadId:'external',turnId:'B',item:{id:'msg',type:'agentMessage',text:'B_RESULT'}}});
    await bot.serverRequest({id:99,method:'item/commandExecution/requestApproval',params:{threadId:'external',turnId:'B',command:'printf test'}});
    const token=[...bot.prompts.keys()][0];assert.equal(bot.prompts.get(token).turn,'B');
    release();await new Promise(r=>setImmediate(r));await a.finishPromise;
    assert.equal(bot.runs.get('external').turn,'B');assert.ok(bot.prompts.has(token));
    const b=bot.runs.get('external');bot.notification({method:'turn/completed',params:{threadId:'external',turn:{id:'B',status:'completed'}}});await b.finishPromise;
    assert.equal(updates.filter(([c,text])=>c==='card2'&&text.includes('B_RESULT')).length,1);assert.equal(bot.runs.size,0);
  }finally{release();await bot.close();}
});
test('detach during card creation closes late card exactly once (R3)',async t=>{
  const {config,store,rpc,controller}=setup(t);rpc.shared=true;await controller.attach('chat','external');
  let release;const gate=new Promise(r=>release=r),closed=[];
  const bot=new Bot(config,store,rpc,{stream:async()=>{await gate;return 'late';},finish:async c=>closed.push(c),text:async()=>{}},()=>{});
  try{bot.notification({method:'turn/started',params:{threadId:'external',turn:{id:'A'}}});const a=bot.runs.get('external');await bot.command('chat','/detach');release();await new Promise(r=>setImmediate(r));assert.deepEqual(closed,['late']);assert.equal(bot.runs.size,0);assert.equal(a.timer,undefined);assert.equal(rpc.responses.length,0);assert.ok(!rpc.calls.some(c=>c.method==='turn/interrupt'));}finally{release();await bot.close();}
});

test('resolved approval cards close even when their initial send finishes late',async t=>{
  const {config,store,rpc}=setup(t);rpc.shared=true;
  let release;const edits=[];
  const bot=new Bot(config,store,rpc,{interactive:()=>new Promise(r=>release=r),text:async()=>{},replaceInteractive:async(...a)=>edits.push(a)},()=>{});
  bot.runs.set('external',{external:true,chat:'chat',thread:'external',turn:'t'});
  try{
    const send=bot.serverRequest({id:91,method:'item/permissions/requestApproval',params:{threadId:'external',turnId:'t',permissions:{}}});
    const token=[...bot.prompts.keys()][0];
    bot.notification({method:'serverRequest/resolved',params:{requestId:91}});
    release({message_id:'late-card'});await send;
    assert.equal(edits.length,1);assert.equal(edits[0][0],'late-card');assert.match(edits[0][1],/已由客户端处理/);
    await assert.rejects(bot.action('chat',{token,decision:'accept'}),/失效/);
    assert.equal(rpc.responses.length,0);
  }finally{await bot.close();}
});
test('card update failure cannot replay a locally approved permission request',async t=>{
  const {config,store,rpc}=setup(t);rpc.shared=true;let updates=0;
  const bot=new Bot(config,store,rpc,{interactive:async()=>({message_id:'card'}),text:async()=>{},replaceInteractive:async()=>{updates++;throw Error('offline');}},()=>{});
  bot.runs.set('external',{external:true,chat:'chat',thread:'external',turn:'t'});
  try{
    const permissions={fileSystem:{write:['/test-only']}};
    await bot.serverRequest({id:92,method:'item/permissions/requestApproval',params:{threadId:'external',turnId:'t',permissions}});
    const token=[...bot.prompts.keys()][0];await bot.action('chat',{token,decision:'accept'});
    assert.equal(updates,1);assert.deepEqual(rpc.responses,[{id:92,result:{permissions,scope:'turn'}}]);
    await assert.rejects(bot.action('chat',{token,decision:'accept'}),/失效/);assert.equal(rpc.responses.length,1);
  }finally{await bot.close();}
});
