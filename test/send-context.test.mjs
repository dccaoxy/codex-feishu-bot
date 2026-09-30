import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {History} from '../src/history.mjs';
import {SendContext} from '../src/send-context.mjs';

function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'send-context-'));
  let store=new Store(dir),context=new SendContext(store);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  const c=(id,text='整理资料',extra={})=>({type:'p2p',chat:'private',thread:'thread',user:'owner',id,text,...extra});
  const record=c=>{
    const p={kind:'message',user:c.user,message:{message_id:c.id,chat_id:c.chat,chat_type:c.type,message_type:'text',content:JSON.stringify({text:c.text})},content:{text:c.text}};
    store.enqueue(c.id,c.chat,p);store.mark(c.id,'done');store.addThread(c.thread,'task');store.updateChat(c.chat,{thread:c.thread});return c;
  };
  const history=(id,answer='文档 https://feishu.cn/docx/doc1',extra={})=>({sourceThreadId:'thread',order:'newest_first',turns:[{status:'completed',messages:[{role:'user',clientId:id,text:'untrusted model wrapper'},{role:'assistant',text:answer,truncated:false}]}],...extra});
  return {get store(){return store;},get context(){return context;},c,record,history,restart(){store.close();store=new Store(dir);context=new SendContext(store);}};
}

test('completed host references survive restart with only the latest four exact task turns',t=>{
  const f=setup(t);
  for(let i=0;i<6;i++){const c=f.record(f.c('m'+i,'request '+i));assert.equal(f.context.remember(c,'answer '+i),true);}
  f.restart();const current=f.c('new','把这个文档发过去');
  assert.deepEqual(f.context.recent(current).map(r=>r.id),['m2','m3','m4','m5']);
  assert.equal(f.context.recent(current)[0].request,'request 2');
  for(const extra of [{user:'other'},{chat:'other'},{thread:'other'}])assert.deepEqual(f.context.recent({...current,...extra}),[]);
});

test('source identity must be a durable matching Owner message, never a matching string',t=>{
  const f=setup(t),c=f.record(f.c('m1'));
  for(const extra of [{id:'missing'},{user:'other'},{chat:'other'},{type:'group'},{text:'forged request'}])assert.equal(f.context.remember({...c,...extra},'answer'),false);
  assert.deepEqual(f.context.recent(c),[]);
});

for(const state of ['cancelled','failed','uncertain'])test('ineligible source state is never restored: '+state,t=>{
  const f=setup(t),c=f.record(f.c('m1'));f.store.mark(c.id,state);
  assert.equal(f.context.restore(c,f.history(c.id)),0);assert.deepEqual(f.context.recent(c),[]);
});

test('recall of any steering source invalidates the entire derived answer after restart',t=>{
  const f=setup(t),first=f.record(f.c('m1','整理文档')),last=f.record(f.c('m2','使用这个标题'));
  assert.equal(f.context.remember({...last,sourceIds:new Set([first.id,last.id])},'文档 https://feishu.cn/docx/doc1'),true);
  f.restart();assert.equal(f.context.recent(last).length,1);f.store.mark(first.id,'cancelled');
  assert.deepEqual(f.context.recent(last),[]);
});

test('inbox payload mutation of an earlier steering source invalidates saved evidence',t=>{
  const f=setup(t),first=f.record(f.c('m1')),last=f.record(f.c('m2'));
  f.context.remember({...last,sourceIds:[first.id,last.id]},'answer');
  const p=JSON.parse(f.store.db.prepare('SELECT payload FROM inbox WHERE id=?').get(first.id).payload);p.content.text='different evidence';
  f.store.db.prepare('UPDATE inbox SET payload=? WHERE id=?').run(JSON.stringify(p),first.id);
  assert.deepEqual(f.context.recent(last),[]);
});

test('oversized references are omitted whole without truncating possible document identities',t=>{
  const f=setup(t),c=f.record(f.c('m1'));
  assert.equal(f.context.remember(c,'x'.repeat(12001)),false);
  assert.equal(f.context.remember(c,'字'.repeat(12000)),false);
  const long=f.record(f.c('long','x'.repeat(6001)));assert.equal(f.context.remember(long,'answer'),false);
  for(let i=0;i<4;i++)f.context.remember(f.record(f.c('r'+i)),'字'.repeat(3000));
  const rows=f.context.recent(c);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.id),['r2','r3']);
  assert.ok(Buffer.byteLength(JSON.stringify(rows))<24000);assert.ok(rows.every(r=>r.answer==='字'.repeat(3000)));
});

test('restoration uses exact clientId and inbox original text instead of model wrappers',t=>{
  const f=setup(t),c=f.record(f.c('m1','查阅 FY26 AEG 新羽计划群'));
  assert.equal(f.context.restore(c,f.history(c.id)),1);
  assert.deepEqual(f.context.recent(c),[{id:'m1',sourceIds:['m1'],request:c.text,answer:'文档 https://feishu.cn/docx/doc1'}]);
  assert.equal(f.context.restore(c,f.history('missing')),0);
});

for(const mismatch of ['source_thread','current_thread','not_owned','external_binding'])test('restoration cannot import another or external task: '+mismatch,t=>{
  const f=setup(t),c=f.record(f.c('m1')),h=f.history(c.id);
  if(mismatch==='source_thread')h.sourceThreadId='other';
  if(mismatch==='current_thread')f.store.updateChat(c.chat,{thread:'other'});
  if(mismatch==='not_owned')f.store.db.prepare('DELETE FROM threads WHERE id=?').run(c.thread);
  if(mismatch==='external_binding')f.store.bindThread(c.chat,{id:c.thread,title:'external',cwd:'/tmp',status:'idle'});
  assert.equal(f.context.restore(c,h),0);assert.deepEqual(f.context.recent(c),[]);
});

for(const invalid of ['missing_client','another_owner','another_chat','multiple_users','unfinished','truncated_answer'])test('legacy history with insufficient provenance is skipped: '+invalid,t=>{
  const f=setup(t),c=f.record(f.c('m1')),h=f.history(c.id),turn=h.turns[0];
  if(invalid==='missing_client')delete turn.messages[0].clientId;
  if(invalid==='another_owner'){const other=f.record(f.c('other','same request',{user:'other'}));turn.messages[0].clientId=other.id;}
  if(invalid==='another_chat'){const other=f.record(f.c('other','same request',{chat:'other'}));turn.messages[0].clientId=other.id;}
  if(invalid==='multiple_users')turn.messages.unshift({...turn.messages[0]});
  if(invalid==='unfinished')turn.status='inProgress';
  if(invalid==='truncated_answer')turn.messages[1].truncated=true;
  assert.equal(f.context.restore(c,h),0);assert.deepEqual(f.context.recent(c),[]);
});

test('history restore preserves chronology and does not weaken a host-recorded source set',t=>{
  const f=setup(t),first=f.record(f.c('m1')),last=f.record(f.c('m2'));
  f.context.remember({...last,sourceIds:[first.id,last.id]},'full host answer');
  assert.equal(f.context.restore(last,f.history(last.id,'less complete RPC answer')),0);
  assert.deepEqual(f.context.recent(last)[0].sourceIds,['m1','m2']);assert.equal(f.context.recent(last)[0].answer,'full host answer');
});

for(const missing of ['truncated_answer','missing_client','multiple_users'])test('restoration preserves the latest host records when RPC loses newest evidence: '+missing,t=>{
  const f=setup(t),records=[];
  for(let i=1;i<=8;i++){
    const c=f.record(f.c('m'+i,'request '+i));records.push(c);
    if(i>=5)f.context.remember(c,'host answer '+i+(i===8?'x'.repeat(6000):''));
  }
  const c=f.c('current'),before=f.context.recent(c);
  assert.deepEqual(before.map(r=>r.id),['m5','m6','m7','m8']);
  const turns=records.toReversed().map(r=>f.history(r.id,'RPC answer '+r.id).turns[0]);
  if(missing==='truncated_answer')turns[0].messages[1].truncated=true;
  if(missing==='missing_client')delete turns[0].messages[0].clientId;
  if(missing==='multiple_users')turns[0].messages.unshift({...turns[0].messages[0]});
  assert.equal(f.context.restore(c,f.history('',undefined,{turns})),0);
  assert.deepEqual(f.context.recent(c),before);
});

test('restoration can recover legacy history after all host references become invalid',t=>{
  const f=setup(t),old=f.record(f.c('old')),valid=f.record(f.c('legacy'));
  f.context.remember(old,'obsolete host answer');f.store.mark(old.id,'cancelled');
  assert.equal(f.context.restore(f.c('current'),f.history(valid.id,'legacy answer')),1);
  assert.deepEqual(f.context.recent(f.c('current')).map(r=>r.id),['legacy']);
});

test('explicit tool upgrade migrates only this Owner and chat references to the new task',t=>{
  const f=setup(t),old=f.record(f.c('m1'));f.context.remember(old,'old answer');
  const next=f.record(f.c('m2','继续',{thread:'upgraded'}));
  assert.equal(f.context.migrate({...next,user:'other'},old.thread),0);
  assert.equal(f.context.migrate({...next,chat:'other'},old.thread),0);
  assert.equal(f.context.migrate(next,old.thread),1);assert.equal(f.context.recent(next)[0].answer,'old answer');
  f.store.mark(old.id,'cancelled');assert.deepEqual(f.context.recent(next),[]);
});

test('retention limits the persistent context count without changing inbox data',t=>{
  const f=setup(t);
  for(let i=0;i<105;i++)f.context.remember(f.record(f.c('m'+i,'request',{thread:'thread'+i})),'answer');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM owner_send_context').get().n,100);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM inbox').get().n,105);
  assert.deepEqual(f.context.recent(f.c('new','query',{thread:'thread0'})),[]);
});

test('History exposes client IDs only to the explicit host recovery path and flags clipped answers',async t=>{
  const f=setup(t);f.store.addThread('thread','task');
  const rpc={request:async()=>({data:[{id:'turn',status:'completed',items:[{type:'userMessage',id:'server-id',clientId:'m1',content:[{type:'text',text:'request'}]},{type:'agentMessage',text:'x'.repeat(5001)}]}]})};
  const history=new History(rpc,f.store),plain=await history.read('thread'),internal=await history.read('thread',undefined,true);
  assert.equal(Object.hasOwn(plain.turns[0].messages[0],'clientId'),false);assert.equal(Object.hasOwn(plain.turns[0].messages[1],'truncated'),false);
  assert.equal(internal.turns[0].messages[0].clientId,'m1');assert.equal(internal.turns[0].messages[1].truncated,true);
});
