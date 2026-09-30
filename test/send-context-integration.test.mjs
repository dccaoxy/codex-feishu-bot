import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {Bot} from '../src/bot.mjs';
import {Store} from '../src/store.mjs';
import {GroupMessageStore} from '../src/group-store.mjs';
import {OwnerGroupGateway} from '../src/owner-group-gateway.mjs';

const DOC='https://example.feishu.cn/docx/syntheticDoc1';
const REQUEST='把这个文档发到新羽群里去';
const SOURCE_TEXT='整理新羽统计文档';
const ANSWER=`《新羽群讨论统计》 ${DOC}`;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const event=(id,text,user='owner')=>({kind:'message',user,message:{chat_id:'private',message_id:id,chat_type:'p2p',message_type:'text',content:JSON.stringify({text})},content:{text}});

class Rpc extends EventEmitter {
  calls=[];responses=[];count=0;history=[];historyGate=null;
  async request(method,params){
    this.calls.push({method,params});
    if(method==='thread/start')return {thread:{id:`new-thread-${++this.count}`}};
    if(method==='turn/start')return {turn:{id:`turn-${++this.count}`}};
    if(method==='thread/turns/list'){
      this.historyGate?.entered.resolve();
      if(this.historyGate)await this.historyGate.release.promise;
      return {data:this.history,nextCursor:null};
    }
    return {};
  }
  respond(id,result){this.responses.push({id,result});}
  reject(id,error){this.responses.push({id,error});}
}

function fixture(t,{migration=false,answer=ANSWER}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'send-context-integration-'));
  const config={storageDir:dir,feishu:{appId:'synthetic-app',appSecret:'synthetic-secret',ownerOpenId:'owner'},
    codex:{cwd:dir,sandbox:'read-only',approvalPolicy:'on-request',allowExternalThreadRead:false},
    groups:{enabled:true,allowedChatIds:['group-xinyu','group-other']},streamIntervalMs:60000};
  const f={dir,config,names:{'group-xinyu':'FY26 AEG新羽计划','group-other':'机器人们'},sent:[],assessments:[],notices:[],docReads:[],nextTool:0};
  // This deterministic assessor checks the integration envelope only. It is
  // not the production classifier and makes no natural-language quality claim.
  f.assess=async(_,input)=>{
    f.assessments.push(input);
    const refs=input.resolvedReferences;
    const hasEvidence=input.recentTurns.some(r=>r.request===SOURCE_TEXT&&r.answer===ANSWER);
    return hasEvidence&&refs?.referenceOnly===true&&refs.groups.length===1&&refs.groups[0]===input.proposed.target&&
      refs.documents.length===1&&refs.documents[0]==='syntheticDoc1'&&!refs.ambiguities.length?
      {decision:'send',target:input.proposed.target}:{decision:'clarify',target:null};
  };
  const open=()=>{
    f.store=new Store(dir);f.groupStore=new GroupMessageStore(path.join(dir,'groups'),null);
    f.groups={store:f.groupStore,closed:false};f.rpc=new Rpc();
    f.rpc.history=[{id:'old-turn',status:'completed',items:[
      {type:'userMessage',clientId:'source-message',content:[{type:'text',text:SOURCE_TEXT}]},
      {type:'agentMessage',text:answer},
    ]}];
    f.feishu={async text(chat,text){f.notices.push({chat,text});},async stream(){return 'synthetic-card';},async update(){},async finish(){},
      async call(fn){return (await fn()).data;},
      client:{im:{v1:{chat:{get:async({path:p})=>({data:{name:f.names[p.chat_id]}})},message:{create:async args=>{f.sent.push(args);return {data:{message_id:`out-${f.sent.length}`}};}}}},
        docx:{document:{get:async({path:p})=>{f.docReads.push(p.document_id);return {data:{document:{document_id:p.document_id}}};}}}}};
    f.bot=new Bot(config,f.store,f.rpc,f.feishu,()=>{});
    f.gateway=new OwnerGroupGateway(config,f.store,f.groups,f.feishu,()=>f.bot.owner,(...args)=>f.assess(...args));
    f.bot.setOwnerGroups(f.gateway);
  };
  open();
  for(const chat of config.groups.allowedChatIds)f.groupStore.setSync(chat,{state:'complete',initial_complete:1});
  const prior=event('source-message',SOURCE_TEXT);
  f.store.enqueue(prior.message.message_id,'private',prior);f.store.mark(prior.message.message_id,'done');
  f.store.addThread('old-thread','新羽统计');f.store.updateChat('private',{thread:'old-thread'});
  f.store.set('tools:old-thread',migration?'previous-tool-version':f.bot.toolVersion);
  f.accept=(id='current-message',text=REQUEST)=>{
    const source=event(id,text);f.store.enqueue(id,'private',source);f.gateway.accept('private',id);return source;
  };
  f.start=async(source=f.accept())=>{
    await f.bot.run('private',[{type:'text',text:source.content.text}],source.message.message_id,source);
    return f.bot.runs.get(f.store.chat('private').thread);
  };
  f.tool=async(run,tool,args={})=>{
    const id=++f.nextTool;
    await f.bot.serverRequest({id,method:'item/tool/call',params:{threadId:run.thread,turnId:run.turn,tool,arguments:args}});
    const response=f.rpc.responses.find(r=>r.id===id);
    assert.ok(response?.result,'current tool request must receive a result');
    return {...response.result,value:JSON.parse(response.result.contentItems[0].text)};
  };
  f.send=async run=>{
    const listed=await f.tool(run,'owner_groups');assert.equal(listed.success,true);
    const target=listed.value.groups.find(g=>g.displayName===f.names['group-xinyu']);assert.ok(target);
    return f.tool(run,'owner_group_send',{group:target.reference,text:DOC});
  };
  f.restart=async()=>{await f.bot.close();f.store.close();f.groupStore.close();open();};
  t.after(async()=>{await f.bot.close();f.store.close();f.groupStore.close();fs.rmSync(dir,{recursive:true,force:true});});
  return f;
}

for(const mode of ['upgrade','restart'])test(`${mode}: real Bot restores trusted document references and sends the unique group alias once`,async t=>{
  const f=fixture(t,{migration:mode==='upgrade'});
  if(mode==='restart')await f.restart();
  const run=await f.start();assert.ok(run);
  const input=f.rpc.calls.find(c=>c.method==='turn/start').params.input;
  if(mode==='upgrade'){
    assert.notEqual(run.thread,'old-thread');assert.ok(JSON.stringify(input).includes(DOC));
    assert.ok(!JSON.stringify(input).includes('source-message'),'source IDs stay host-side');
  }else{
    assert.equal(run.thread,'old-thread');assert.equal(f.rpc.calls.filter(c=>c.method==='thread/start').length,0);
  }
  assert.deepEqual(f.gateway.sendContext.recent(run.groupContext).map(r=>({request:r.request,answer:r.answer})),[{request:SOURCE_TEXT,answer:ANSWER}]);
  const first=await f.send(run);assert.equal(first.success,true);assert.equal(first.value.status,'sent');
  const second=await f.send(run);assert.equal(second.success,true);assert.equal(second.value.alreadyHandled,true);
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].data.receive_id,'group-xinyu');
  assert.deepEqual(JSON.parse(f.sent[0].data.content),{text:DOC});assert.ok(f.assessments.length>=1);
  assert.deepEqual(f.assessments[0].resolvedReferences.documents,['syntheticDoc1']);
  assert.equal(f.assessments[0].currentOwnerRequest,REQUEST);
});

test('completed Bot reply is remembered durably and survives a fresh gateway without another history read',async t=>{
  const f=fixture(t),source=f.accept('current-message','继续整理文档');
  const run=await f.start(source);
  run.messages.set('final',{phase:'final_answer',text:ANSWER});
  f.bot.endRun(run,'completed');await run.finishPromise;
  f.store.mark(source.message.message_id,'done');
  await f.restart();
  const next=await f.start(f.accept('next-message'));
  assert.equal(f.rpc.calls.filter(c=>c.method==='thread/turns/list').length,0);
  assert.ok(f.gateway.sendContext.recent(next.groupContext).some(r=>r.id==='current-message'&&r.answer===ANSWER));
  const result=await f.send(next);assert.equal(result.success,true);assert.equal(f.sent.length,1);
});

for(const mode of ['upgrade','restart'])for(const invalidation of ['recall','owner','new-request','binding'])test(`${mode}: ${invalidation} during history recovery starts no turn and sends nothing`,{timeout:2000},async t=>{
  const f=fixture(t,{migration:mode==='upgrade'});
  if(mode==='restart')await f.restart();
  const gate={entered:deferred(),release:deferred()};f.rpc.historyGate=gate;
  const source=f.accept();
  const pending=f.start(source);
  const outcome=pending.then(()=>({}),error=>({error}));
  await gate.entered.promise;
  if(invalidation==='recall'){
    await f.bot.cancelOwnerGroup('private',source.message.message_id);
    assert.equal(f.store.db.prepare('SELECT state FROM inbox WHERE id=?').get(source.message.message_id).state,'cancelled');
  }
  if(invalidation==='owner')f.bot.owner='different-owner';
  if(invalidation==='new-request')f.accept('newer-message','不要发送');
  if(invalidation==='binding')f.store.bindThread('private',{id:'external-thread',title:'其他任务',cwd:f.dir,status:'idle',turn:null});
  gate.release.resolve();await outcome;
  assert.equal(f.rpc.calls.filter(c=>c.method==='turn/start').length,0);
  assert.equal(f.rpc.calls.filter(c=>c.method==='thread/start').length,0,'recovery must fail before an upgraded thread is created');
  assert.equal(f.bot.runs.size,0);assert.equal(f.sent.length,0);assert.equal(f.assessments.length,0);
});

for(const ambiguity of ['group','document'])test(`restored ${ambiguity} ambiguity cannot be resolved by the proposed target or content`,async t=>{
  const f=fixture(t,{migration:true,answer:ambiguity==='document'?`${ANSWER}\n《另一个文档》 https://example.feishu.cn/docx/syntheticDoc2`:ANSWER});
  if(ambiguity==='group')f.names['group-other']='FY27 新羽计划';
  let assessed=0;f.assess=async(_,input)=>{assessed++;return {decision:'send',target:input.proposed.target};};
  const run=await f.start(),result=await f.send(run);
  assert.equal(result.success,false);assert.match(result.value.error,/歧义/);
  assert.equal(assessed,0);assert.equal(f.sent.length,0);assert.equal(f.docReads.length,0);
});

test('restored unique references remain data and cannot bypass an independent assessor denial',async t=>{
  const f=fixture(t,{migration:true});let assessed=0;
  f.assess=async(_,input)=>{assessed++;assert.equal(input.resolvedReferences.groups.length,1);assert.deepEqual(input.resolvedReferences.documents,['syntheticDoc1']);return {decision:'deny',target:null};};
  const run=await f.start(),result=await f.send(run);
  assert.equal(result.success,false);assert.equal(assessed,1);assert.equal(f.sent.length,0);
});
