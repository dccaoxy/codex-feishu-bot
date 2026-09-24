import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GroupMessageStore,parseGroupMessage } from '../src/group-store.mjs';
import { GroupAssistant } from '../src/group-assistant.mjs';
import { groupConfig,GroupPolicy } from '../src/group-policy.mjs';
import { groupThreadParams } from '../src/group-model.mjs';
const now=Date.now();
const event=(id,chat='oc_A',text='库存10台',mention=false,sender='member',time=now)=>({sender:{sender_type:'user',sender_id:{open_id:sender}},message:{chat_type:'group',chat_id:chat,message_id:id,create_time:String(time),message_type:'text',content:JSON.stringify({text}),mentions:mention?[{key:'@bot',id:{open_id:'bot'}}]:[]}});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'group-test-'));const store=new GroupMessageStore(dir);t.after(()=>{try{store.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});});return {store,dir};}
test('group configuration default off, validates allowlists and retention',()=>{
 assert.equal(groupConfig().enabled,false);assert.throws(()=>groupConfig({allowedChatIds:['*']}));assert.throws(()=>groupConfig({retentionDays:0}));assert.throws(()=>groupConfig({documentIds:{oc_B:['doc']}}));
});
test('group-scoped keyword, sender, time and context retrieval; no private or cross-group lookup',t=>{
 const {store}=fixture(t);store.ingest(event('a'),false);store.ingest(event('b','oc_A','资金','owner', 'owner',now+1),false);store.ingest(event('c','oc_B','秘密'),false);
 assert.equal(store.search('oc_A',{keyword:'库存'}).length,1);
 assert.equal(store.search('oc_A',{sender:'nobody'}).length,0);
 assert.equal(store.search('oc_A',{start:new Date(now-1000).toISOString(),end:new Date(now+1000).toISOString(),sender:'owner'}).length,1);
 assert.equal(store.context('oc_A','c').length,0);assert.equal(store.context('oc_A','a').length,2);assert.throws(()=>store.search('oc_A',{start:'invalid'}));
});
test('dedupe and restart keep history, never replay accepted @ requests',t=>{
 const {store,dir}=fixture(t);assert.equal(store.ingest(event('a','oc_A','test',true),true),true);assert.equal(store.ingest(event('a'),true),false);store.mark('oc_A','a','sending');store.close();
 const reopened=new GroupMessageStore(dir);assert.equal(reopened.get('oc_A','a').state,'uncertain');assert.equal(reopened.ingest(event('a'),true),false);reopened.close();
});
test('recall tombstones prevent redelivery; leave erases messages and blocks future work',t=>{
 const {store}=fixture(t);store.recall('oc_A','a');assert.equal(store.ingest(event('a'),true),false);store.ingest(event('b'),false);store.leave('oc_A');assert.equal(store.search('oc_A').length,0);assert.equal(store.ingest(event('c'),false),false);
});
test('retention rejects historical replays and results stay bounded',t=>{
 const {store}=fixture(t);assert.equal(store.ingest(event('old','oc_A','old',true,'owner',now-31*86400000),true),false);
 for(let i=0;i<40;i++)store.ingest(event('a'+i,'oc_A','x'.repeat(12000)),false);
 assert.ok(JSON.stringify(store.search('oc_A',{limit:50})).length<32000);
});
test('rich text and attachment limits are explicit, malformed content never invented',()=>{
 assert.match(parseGroupMessage({message_type:'image',content:'{"image_key":"test"}'}).limitations.join(''),/未下载/);
 assert.equal(parseGroupMessage({message_type:'post',content:'bad'}).text,'');
 assert.match(parseGroupMessage({message_type:'post',content:'{}'}).limitations.join(''),/无法解析/);
 assert.equal(parseGroupMessage({message_type:'post',content:JSON.stringify({zh_cn:{title:'标题',content:[[{tag:'text',text:'内容'}]]}})}).text.trim(),'标题\n内容');
});
test('ordinary and unauthorized events make zero model calls and zero replies; exact mention and dedupe',async t=>{
 const {store}=fixture(t);let calls=0,replies=0;
 const f={call:fn=>fn(),client:{im:{v1:{message:{reply:async()=>{replies++;}}}}}};
 const g=new GroupAssistant({storageDir:'unused',groups:{enabled:true,allowedChatIds:['oc_A']}},f,()=> 'owner','bot',{store,model:{run:async()=>{calls++;return 'ok';},close:async()=>{}}});t.after(()=>g.close());
 g.onMessage(event('outside','oc_B','x',true));g.onMessage(event('plain'));g.onMessage(event('fake','oc_A','@bot hi',false));
 const wrong=event('other','oc_A','hi',true);wrong.message.mentions[0].id.open_id='other';g.onMessage(wrong);
 assert.equal(calls,0);assert.equal(replies,0);assert.equal(store.get('oc_B','outside'),undefined);assert.ok(store.get('oc_A','plain'));
 g.onMessage(event('at','oc_A','@bot test',true));g.onMessage(event('at','oc_A','@bot test',true));await g.jobs.get('oc_A').done;
 assert.equal(calls,1);assert.equal(replies,1);
});
test('members and owner cannot route private or management tools; model cannot change group scope',async t=>{
 const {store}=fixture(t);const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A'],documentIds:{oc_A:['doc']}}},{},()=> 'owner','bot',{store,model:{close:async()=>{}}});t.after(()=>g.close());const signal=new AbortController().signal;
 for(const sender of ['member','owner'])for(const tool of ['feishu_thread_read','exec_command','approve','attach','github_merge'])await assert.rejects(g.execute('oc_A',sender,tool,{},signal));
 await assert.rejects(g.execute('oc_A','member','group_search',{chat:'oc_B'},signal));
 assert.equal(g.policy.mayUseTool('feishu_doc_append','member','oc_A','doc'),false);
 assert.equal(g.policy.mayUseTool('feishu_doc_append','owner','oc_A','other'),false);
});
test('RPC params remove execution environments, plugins, MCP, memory and shell authority',()=>{
 const p=groupThreadParams('/tmp/example',[]);assert.deepEqual(p.environments,[]);assert.deepEqual(p.selectedCapabilityRoots,[]);assert.equal(p.ephemeral,true);assert.equal(p.approvalPolicy,'never');assert.equal(p.config.features.shell_tool,false);assert.equal(p.config.features.apps,false);assert.equal(p.config.features.plugins,false);assert.equal(p.config.features.multi_agent,false);assert.equal(p.config.features.skip_host_skill_discovery,true);assert.deepEqual(p.config.mcp_servers,{});
});
test('bot-authored @ does not execute; /attach is never passed to model',async t=>{
 const {store}=fixture(t);let calls=0;const f={call:fn=>fn(),client:{im:{v1:{message:{reply:async()=>{}}}}}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A']}},f,()=> 'owner','bot',{store,model:{run:async()=>{calls++;},close:async()=>{}}});t.after(()=>g.close());
 const bot=event('botmsg','oc_A','@bot hello',true);bot.sender.sender_type='bot';g.onMessage(bot);assert.equal(g.jobs.size,0);
 g.onMessage(event('command','oc_A','@bot /attach private',true));await g.jobs.get('oc_A').done;assert.equal(calls,0);
});
test('ambiguous reply failure has no retry or later replay',async t=>{
 const {store}=fixture(t);let attempts=0;const f={call:fn=>fn(),client:{im:{v1:{message:{reply:async()=>{attempts++;throw new Error('timeout');}}}}}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A']}},f,()=> 'owner','bot',{store,log:()=>{},model:{run:async()=> 'ok',close:async()=>{}}});t.after(()=>g.close());
 const e=event('timeout','oc_A','@bot test',true);g.onMessage(e);await g.jobs.get('oc_A').done;g.onMessage(e);assert.equal(attempts,1);assert.equal(g.jobs.size,0);
});
test('leave during model work aborts worker, removes sources, and sends no answer',async t=>{
 const {store}=fixture(t);let replies=0,started;const ready=new Promise(r=>started=r);
 const f={call:fn=>fn(),client:{im:{v1:{message:{reply:async()=>{replies++;}}}}}};
 const model={run:async(q,tools,execute,signal)=>{started();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return 'late';},close:async()=>{}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A']}},f,()=> 'owner','bot',{store,model});t.after(()=>g.close());g.onMessage(event('leave','oc_A','@bot test',true));const job=g.jobs.get('oc_A');await ready;g.onLeave({chat_id:'oc_A'});await job.done;assert.equal(replies,0);assert.equal(store.search('oc_A').length,0);
});
test('explicit document writes are owner-only and cannot cross group authorization',async t=>{
 const {store}=fixture(t);let writes=0;const f={call:fn=>fn(),client:{docx:{documentBlock:{patch:async()=>{writes++;return {document_revision_id:2};}}}}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A','oc_B'],documentIds:{oc_A:['doc']}}},f,()=> 'owner','bot',{store,model:{close:async()=>{}}});t.after(()=>g.close());
 const cmd='/group-doc update doc block 1\nnew';await g.documentCommand('oc_A','member',cmd);await g.documentCommand('oc_B','owner',cmd);assert.equal(writes,0);
 await g.documentCommand('oc_A','owner',cmd);assert.equal(writes,1);store.leave('oc_A');await assert.rejects(g.documentCommand('oc_A','owner',cmd));assert.equal(writes,1);
});
test('cancellation between document conversion and creation prevents write',async t=>{
 const {store}=fixture(t);const ctrl=new AbortController();let writes=0;
 const f={call:fn=>fn(),client:{docx:{document:{convert:async()=>{ctrl.abort();return {blocks:[{block_type:2}],first_level_block_ids:['b']};},create:async()=>{writes++;}}}}};
 const g=new GroupAssistant({groups:{enabled:true,allowedChatIds:['oc_A']}},f,()=> 'owner','bot',{store,model:{close:async()=>{}}});t.after(()=>g.close());await assert.rejects(g.documentCommand('oc_A','owner','/group-doc create title\ntext',ctrl.signal));assert.equal(writes,0);
});
