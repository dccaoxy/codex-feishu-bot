import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
import {Bot} from '../src/bot.mjs';import {Store} from '../src/store.mjs';import {GroupMessageStore} from '../src/group-store.mjs';
import {OwnerAccess} from '../src/owner-access.mjs';import {OwnerGroupGateway} from '../src/owner-group-gateway.mjs';
import {OwnerOfficeReader} from '../src/owner-office-read.mjs';import {Documents} from '../src/documents.mjs';
const url='https://example.feishu.cn/docx/doc';
async function fixture(t,{type='text',collection=false,mention=false,user='owner',chat=mention?'group':'private',at='bot',trusted='bot',stage}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-ingress-'));const store=new Store(dir),mirror=new GroupMessageStore(path.join(dir,'mirror'),null);
 const config={storageDir:dir,streamIntervalMs:60000,feishu:{ownerOpenId:'owner',appId:'fixture',appSecret:'fixture'},codex:{cwd:dir},groups:{enabled:true,allowedChatIds:['group']},ownerAccess:{enabled:true},ownerOAuth:{enabled:true,apis:[]}};
 let entered,release;const waiting=new Promise(r=>entered=r);let paused=false;const calls=[],responses=[],protocol=[];
 const pause=async point=>{if(stage===point&&!paused){paused=true;entered();await new Promise(r=>release=r);}};
 const sdk=api=>async(payload,options)=>{assert.ok(options?.lark);calls.push({api,payload});await pause('response');return {document:{revision_id:1},items:[],has_more:false};};
 const transport={stream:async()=> 'card',text:async()=>{},finish:async()=>{},client:{im:{v1:{chat:{get:async()=>({name:'Fixture'})}}},docx:{v1:{document:{get:sdk('get')},documentBlock:{list:sdk('blocks')}}}},call:async(fn,_retry,g)=>{await pause('queue');g?.();return fn();}};
 const rpc=new EventEmitter();rpc.shared=true;rpc.request=async(method,p)=>{protocol.push(method);if(method==='turn/start')return {turn:{id:'turn'}};if(method==='thread/read')return {thread:{id:'thread',turns:[]}};return {};};rpc.respond=(id,result)=>responses.push({id,result});
 const bot=new Bot(config,store,rpc,transport,()=>{});bot.schedule=()=>{};bot.available=true;
 const groups={store:mirror,closed:false,liveSince:0,policy:{botId:'bot',allowedGroup:c=>c==='group',mayRespond:d=>d.message.mentions?.some(x=>x.id?.open_id==='bot')}};
 mirror.setSync('group',{state:'complete',initial_complete:1});mirror.ingest({sender:{sender_type:'user',sender_id:{open_id:'speaker'}},message:{chat_id:'group',message_id:'mirror',message_type:'text',create_time:String(Date.now()),content:JSON.stringify({text:url})}},false);
 bot.ownerAccess=new OwnerAccess(config,groups,()=>bot.owner);bot.ownerGroups=new OwnerGroupGateway(config,store,groups,transport,()=>bot.owner);
 const provider={enabled:()=>true,lease:async(_api,g)=>({check:g,access:async()=> 'fixture-user'})},reader=new OwnerOfficeReader(transport,provider);bot.office.reader=reader;bot.office.ownerOAuth=provider;bot.documents=new Documents(transport,()=>bot.owner,reader);
 store.updateChat(chat,{thread:'thread'});store.set('tools:thread',bot.toolVersion);bot.loaded.add('thread');
 t.after(()=>{for(const r of bot.runs.values())clearInterval(r.timer);store.close();mirror.close();fs.rmSync(dir,{recursive:true,force:true});});
 const text=collection?'读取 Fixture群里的所有飞书文档':`读取 ${url}`;
 const content=type==='text'?{text:(mention?'@_user_1 ':'')+text}:{zh_cn:{title:'',content:[...(mention?[[{tag:'at',user_id:at},{tag:'text',text:' '+text}]]:[[{tag:'text',text}]])]}};
 const event={sender:{sender_type:'user',sender_id:{open_id:user}},message:{chat_id:chat,chat_type:chat==='private'?'p2p':'group',message_id:'request',create_time:String(Date.now()),message_type:type,content:JSON.stringify(content),mentions:mention?[{key:'@_user_1',id:{open_id:trusted}}]:[]}};
 bot.onMessage(event);const row=store.pending()[0];if(row){store.mark('request','processing');await bot.message(chat,JSON.parse(row.payload));}
 let seq=0;const call=async(tool,args)=>{const id=++seq;await bot.serverRequest({id,method:'item/tool/call',params:{threadId:'thread',turnId:'turn',tool,arguments:args}});return responses.find(r=>r.id===id)?.result;};
 return {bot,store,mirror,groups,config,calls,protocol,waiting,arm:point=>stage=point,release:()=>release(),row,call,read:()=>call('feishu_doc_read',{documentId:'doc'}),collection};
}
// Without mention: Owner private chat. With bot mention: authorized Owner group.
// Unmentioned group messages are separately asserted to remain unauthorized.
for(const type of ['text','post'])for(const collection of [false,true])for(const mention of [false,true])test(`matrix ${type}/${collection?'collection':'single'}/${mention?'bot-at-group':'no-at-private'}`,async t=>{
 const f=await fixture(t,{type,collection,mention});assert.ok(f.row);assert.ok(f.protocol.includes('turn/start'));
 if(collection){const listed=await f.call('feishu_office_collection',{});assert.equal(listed?.success,true);const data=JSON.parse(listed.contentItems[0].text);assert.equal(data.total,1);const r=await f.call('feishu_office_read_resources',{urls:data.resources.map(x=>x.url)});assert.equal(r?.success,true);assert.equal(JSON.parse(r.contentItems[0].text).results[0].completion,'complete');}
 else assert.equal((await f.read())?.success,true);
 assert.deepEqual(f.calls.map(c=>c.api),['get','blocks']);
});
for(const options of [{user:'member',mention:true},{chat:'group',mention:false},{mention:true,trusted:'other'},{type:'post',mention:true,at:'other'},{type:'post',mention:true,at:'bot',trusted:'other'}])test(`ingress rejection ${JSON.stringify(options)}`,async t=>{
 const f=await fixture(t,options);assert.notEqual((await f.read())?.success,true);assert.equal(f.calls.length,0);
});
for(const change of ['recall','source','owner','mirror-recall'])test(`post collection queued rejects ${change}`,async t=>{
 const f=await fixture(t,{type:'post',collection:true,mention:true});const listed=await f.call('feishu_office_collection',{});assert.equal(listed?.success,true);
 if(change==='recall')f.store.mark('request','cancelled');if(change==='source')f.store.db.prepare('UPDATE inbox SET payload=? WHERE id=?').run('{}','request');if(change==='owner')f.bot.owner='other';if(change==='mirror-recall')f.mirror.recall('group','mirror');
 assert.notEqual((await f.read())?.success,true);assert.equal(f.calls.length,0);
});
for(const stage of ['queue','response'])for(const change of ['recall','mention','owner'])test(`post bot-at collection ${change} during ${stage} stays fenced`,async t=>{
 const f=await fixture(t,{type:'post',collection:true,mention:true});assert.equal((await f.call('feishu_office_collection',{}))?.success,true);
 f.arm(stage);const pending=f.read();await f.waiting;
 if(change==='recall')f.store.mark('request','cancelled');
 if(change==='owner')f.bot.owner='other';
 if(change==='mention'){const d=JSON.parse(f.store.db.prepare('SELECT payload FROM inbox WHERE id=?').get('request').payload);d.message.mentions=[];f.store.db.prepare('UPDATE inbox SET payload=? WHERE id=?').run(JSON.stringify(d),'request');}
 f.release();assert.notEqual((await pending)?.success,true);assert.equal(f.calls.length,stage==='queue'?0:1);
});
