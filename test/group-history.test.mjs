import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {GroupMessageStore,resourceReferences} from '../src/group-store.mjs';import {GroupHistory} from '../src/group-history.mjs';import {GroupAssistant} from '../src/group-assistant.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-test-'));const store=new GroupMessageStore(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});return {store,dir};}
const item=(id,text='资料',chat='oc_A')=>({chat_id:chat,message_id:id,create_time:String(Date.now()-10000),msg_type:'text',body:{content:JSON.stringify({text})},sender:{id:'member',sender_type:'user'}});
const event=(id,text,mention=false)=>({sender:{sender_type:'user',sender_id:{open_id:'member'}},message:{chat_id:'oc_A',chat_type:'group',message_id:id,create_time:String(Date.now()),message_type:'text',content:JSON.stringify({text}),mentions:mention?[{key:'@bot',id:{open_id:'bot'}}]:[]}});
function api(list){return {call:fn=>fn(),client:{im:{v1:{message:{list}}}}};}
test('full paginated history commits checkpoint, resumes crash, overlaps live without duplicating',async t=>{
 const {store,dir}=fixture(t);let fail=true,pages=[];
 const f=api(async({params:p})=>{pages.push(p.page_token||'first');if(!p.page_token)return {items:[item('3'),item('2')],has_more:true,page_token:'older'};if(fail)throw Error('offline');return {items:[item('1')],has_more:false};});
 store.ingest(event('2','资料'),false);let h=new GroupHistory(store,f,()=>true);await assert.rejects(h.reconcile('oc_A'));assert.equal(store.sync('oc_A').checkpoint,'older');assert.equal(store.sync('oc_A').state,'failed');
 store.close();const restarted=new GroupMessageStore(dir);fail=false;h=new GroupHistory(restarted,f,()=>true);await h.reconcile('oc_A');assert.deepEqual(pages,['first','older','older']);assert.equal(restarted.coverage('oc_A').count,3);assert.equal(restarted.sync('oc_A').state,'complete');restarted.close();
});
test('catchup scans past merely live records, stops only at confirmed anchor and never queues old mentions',async t=>{
 const {store}=fixture(t);let pages=0;const h=new GroupHistory(store,api(async()=>({items:[item('base')],has_more:false})),()=>true);await h.reconcile('oc_A');store.ingest(event('live','普通'),false);
 h.feishu=api(async({params:p})=>{pages++;return !p.page_token?{items:[item('new','@bot 执行'),item('live')],has_more:true,page_token:'p'}:{items:[item('gap'),item('base')],has_more:true,page_token:'not-needed'};});
 await h.reconcile('oc_A');assert.equal(pages,2);assert.equal(store.coverage('oc_A').count,4);assert.equal(store.get('oc_A','new').state,'recorded');assert.equal(store.sync('oc_A').anchor,'new');
});
test('same-page cursor and wrong-chat items fail closed without advancing checkpoint',async t=>{
 const {store}=fixture(t);const h=new GroupHistory(store,api(async()=>({items:[item('x','secret','oc_B')],has_more:false})),()=>true);await assert.rejects(h.reconcile('oc_A'));assert.equal(store.coverage('oc_A').count,0);assert.equal(store.coverage('oc_B').count,0);
});
test('1000 ordinary messages persist with no turns; first @ can retrieve early fact, context stays bounded',async t=>{
 const {store}=fixture(t);let turns=0,replies=0;
 const f={call:fn=>fn(),client:{im:{v1:{message:{reply:async()=>replies++}}}}};
 const model={run:async(q,tools,execute,signal,chat)=>{turns++;assert.equal(chat,'oc_A');assert.ok(q.length<40000);const r=await execute('group_search',{keyword:'独特事实'});assert.equal(r.messages[0].text,'独特事实库存123');return '123';},close:async()=>{}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A']}},f,()=> 'owner','bot',{store,model});t.after(()=>g.close());
 for(let i=0;i<1000;i++)g.onMessage(event('m'+i,i===0?'独特事实库存123':'x'.repeat(200)));
 assert.equal(turns,0);g.onMessage(event('ask','@bot 查询独特事实',true));await g.jobs.get('oc_A').done;assert.equal(turns,1);assert.equal(replies,1);assert.equal(store.coverage('oc_A').count,1001);assert.ok(store.thread('oc_A').cursor<1001);
 assert.equal(store.changes('oc_B').messages.length,0);
});
test('raw long message retained without clipping; resource reference cannot grant authority',t=>{
 const {store}=fixture(t);const text='x'.repeat(15000)+' https://example.feishu.cn/base/ABC?table=tbl123';store.ingest(event('long',text),false);assert.equal(store.get('oc_A','long').text,text);assert.equal(store.hasDocument('oc_A','ABC'),false);assert.equal(resourceReferences(JSON.stringify({text}))[0].type,'base');assert.equal(resourceReferences('https://feishu.cn.evil.test/docx/ABC').length,0);assert.ok(store.search('oc_A')[0].truncated);assert.ok(store.db.prepare('SELECT content FROM raw_messages').get().content.includes(text));
});
test('recall invalidates durable model context, deletion removes raw content; leave blocks reconciliation',async t=>{
 const {store}=fixture(t);store.ingest(event('x','secret'),false);store.setThread('oc_A',{thread_id:'group-thread',cursor:1});store.recall('oc_A','x');assert.equal(store.thread('oc_A').state,'invalidated');assert.equal(store.db.prepare('SELECT COUNT(*) c FROM raw_messages').get().c,0);store.leave('oc_A');let calls=0;await new GroupHistory(store,api(async()=>calls++),()=>true).reconcile('oc_A');assert.equal(calls,0);
});

test('history-first live race responds once; delayed old live mention stays recorded',async t=>{
 const {store}=fixture(t);let calls=0;const f={call:fn=>fn(),client:{im:{v1:{message:{reply:async()=>{}}}}}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A']}},f,()=> 'owner','bot',{store,model:{run:async()=>{calls++;return 'ok';},close:async()=>{}}});t.after(()=>g.close());
 const e=event('race','@bot hi',true);store.ingest(e,false);g.onMessage(e);await g.jobs.get('oc_A').done;g.onMessage(e);assert.equal(calls,1);
 const old=event('old-live','@bot old',true);old.message.create_time=String(g.liveSince-1000);g.onMessage(old);assert.equal(g.jobs.size,0);assert.equal(store.get('oc_A','old-live').state,'recorded');
});

test('durable group bindings and cursors survive database restart without cross-group reads',t=>{
 const {store,dir}=fixture(t);store.ingest(event('a','private-to-A'),false);
 const b=event('b','private-to-B');b.message.chat_id='oc_B';store.ingest(b,false);
 store.setThread('oc_A',{thread_id:'thread-A',state:'idle',cursor:1});store.setThread('oc_B',{thread_id:'thread-B',state:'idle',cursor:2});store.close();
 const reopened=new GroupMessageStore(dir);try{assert.equal(reopened.thread('oc_A').thread_id,'thread-A');assert.equal(reopened.thread('oc_B').thread_id,'thread-B');assert.equal(reopened.thread('oc_A').cursor,1);assert.equal(reopened.read('oc_A','b'),null);assert.equal(reopened.search('oc_B',{keyword:'private-to-A'}).length,0);}finally{reopened.close();}
});
test('deleted history entry without body tombstones local content; long text remains fully paginatable',async t=>{
 const {store}=fixture(t);const long='内容'.repeat(10000);store.ingest(event('long',long),false);let text='',offset=0;do{const p=store.read('oc_A','long',offset);text+=p.text;offset=p.nextOffset;}while(offset!==null);assert.equal(text,long);
 await new GroupHistory(store,api(async()=>({items:[{message_id:'long',deleted:true}],has_more:false})),()=>true).reconcile('oc_A');assert.equal(store.read('oc_A','long'),null);assert.equal(store.sync('oc_A').state,'complete');assert.equal(store.ingest(event('long',long),false),false);
});
