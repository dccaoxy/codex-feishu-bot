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
import {OwnerAccess} from '../src/owner-access.mjs';
import {OwnerOfficeReader} from '../src/owner-office-read.mjs';
import {OWNER_READ_APIS,OWNER_READ_SPECIAL,readError} from '../src/owner-office-read-policy.mjs';
import {Documents} from '../src/documents.mjs';

const request='读取 FY26 AEG新羽计划群里所有的飞书文档链接，包括多维表格';
const link=(type,id,query='')=>`https://example.feishu.cn/${type}/${id}${query}`;
const event=(id,text,user='owner',chat='private',type='p2p')=>({kind:'message',user,content:{text},message:{chat_id:chat,message_id:id,chat_type:type,message_type:'text',content:JSON.stringify({text})}});
const sentinel='PRIVATE_COLLECTION_BODY';

// Real inbox, GroupMessageStore raw mirror, OwnerGroupGateway, Bot dispatcher,
// Office and Reader. Only OAuth and external SDK transport are simulated.
function fixture(t,{text=request,user='owner',stage,groupOwner=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-collection-integration-'));
 const store=new Store(dir),groupStore=new GroupMessageStore(path.join(dir,'groups'),null);
 const config={storageDir:dir,feishu:{ownerOpenId:'owner',appId:'fixture-app',appSecret:'fixture-secret'},groups:{enabled:true,allowedChatIds:['a','b']},ownerAccess:{enabled:true},ownerOAuth:{enabled:true,apis:Object.keys(OWNER_READ_APIS)},codex:{cwd:dir,sandbox:'read-only',approvalPolicy:'on-request'}};
 const names={a:'FY26 AEG新羽计划',b:'其他项目',foreign:'未授权群'},calls=[],responses=[],outputs=new Map();
 let entered,release,paused=false,leases=0,accesses=0,blockedApi='',leaseError;
 const waiting=new Promise(r=>entered=r);
 const pause=async point=>{if(stage===point&&!paused){paused=true;entered();await new Promise(r=>release=r);}};
 const client={im:{v1:{chat:{get:async p=>({name:names[p.path.chat_id]})}}}};
 const sdk=api=>async(payload,options)=>{
  assert.ok(options?.lark,'Owner readonly SDK request must carry request-scoped user identity');
  calls.push({api,payload:structuredClone(payload)});await pause('response');
  const output=outputs.get(api);if(output instanceof Error)throw output;
  return typeof output==='function'?output(payload):output??{document:{document_id:payload.path?.document_id,revision_id:1},items:[{text:sentinel}],text:sentinel,values:[[sentinel]],has_more:false};
 };
 for(const api of Object.keys(OWNER_READ_APIS).filter(x=>!OWNER_READ_SPECIAL.includes(x))){
  let node=client;const keys=api.split('.');for(const key of keys.slice(0,-1))node=node[key]??={};node[keys.at(-1)]=sdk(api);
 }
 client.request=sdk('request');
 const transport={client,call:async(fn,retry,g)=>{if(g){await pause('queue');g();}return fn();}};
 const rpc=new EventEmitter();rpc.shared=true;rpc.request=async()=>({});rpc.respond=(id,result)=>responses.push({id,result});rpc.reject=(id,error)=>responses.push({id,error});
 const bot=new Bot(config,store,rpc,transport,()=>{});bot.schedule=()=>{};
 const groups={store:groupStore,closed:false,liveSince:0,policy:{botId:'bot',allowedGroup:c=>config.groups.allowedChatIds.includes(c)}};
 const gateway=new OwnerGroupGateway(config,store,groups,transport,()=>bot.owner);bot.ownerGroups=gateway;bot.ownerAccess=new OwnerAccess(config,groups,()=>bot.owner);
 const provider={enabled:api=>api!==blockedApi,lease:async(api,g)=>{leases++;g();await pause('lease');g();if(leaseError)throw leaseError;return {check:g,access:async()=>{accesses++;await pause('access');g();return 'fixture-user-token';}};}};
 const reader=new OwnerOfficeReader(transport,provider);bot.office.reader=reader;bot.office.ownerOAuth=provider;bot.documents=new Documents(transport,()=>bot.owner,reader);
 const original=bot.office.execute.bind(bot.office);bot.office.execute=async(...args)=>{const result=await original(...args);await pause('delivery');return result;};
 for(const chat of Object.keys(names))groupStore.setSync(chat,{state:'complete',initial_complete:1});
 const current=event('request',text,user,groupOwner?'a':'private',groupOwner?'group':'p2p');
 store.enqueue(current.message.message_id,current.message.chat_id,current);store.mark('request','processing');gateway.accept(current.message.chat_id,'request');
 if(groupOwner)store.set('ownerChannel:a','owner');
 const run={officeOwner:'owner',chat:current.message.chat_id,thread:'thread',turn:'turn',sourceIds:new Set(['request']),sequence:0,flush:Promise.resolve()};
 run.groupContext=gateway.context(current,run.thread,()=>!run.ending&&!run.ownerCancelled);bot.runs.set(run.thread,run);
 function add(chat,id,text,kind='text'){
  groupStore.ingest({sender:{sender_type:'user',sender_id:{open_id:'speaker'}},message:{chat_id:chat,message_id:id,message_type:kind,create_time:String(Date.now()-1000),content:kind==='text'?JSON.stringify({text}):JSON.stringify(text)}},false);
 }
 let seq=0;
 async function call(tool,args={}){const id=++seq;await bot.serverRequest({id,method:'item/tool/call',params:{threadId:run.thread,turnId:run.turn,tool,arguments:args}});const response=responses.find(r=>r.id===id);return response?{...response.result,data:JSON.parse(response.result.contentItems[0].text)}:null;}
 const office=(api,payload)=>call('feishu_office_call',{api,payload});
 const read=id=>office('docx.v1.document.rawContent',{path:{document_id:id}});
 function change(kind){
  if(kind==='source-recall')groupStore.recall('a','source');
  else if(kind==='group-revoke')config.groups.allowedChatIds=['b'];
  else if(kind==='group-leave')groupStore.leave('a');
  else if(kind==='owner-change')bot.owner='other-owner';
  else if(kind==='request-recall')store.mark('request','cancelled');
  else if(kind==='turn-end')run.ending=true;
  else if(kind==='steer'){
   const next=event('next','读取 其他项目群里的所有飞书文档');store.enqueue('next',run.chat,{...next,message:{...next.message,chat_id:run.chat}});run.sourceIds.add('next');gateway.accept(run.chat,'next');
  }
 }
 t.after(()=>{store.close();groupStore.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {bot,store,groupStore,config,gateway,groups,names,run,calls,responses,outputs,add,call,office,read,change,waiting,release:()=>release(),counts:()=>({calls:calls.length,leases,accesses}),blockApi:api=>blockedApi=api,failLease:e=>leaseError=e};
}

test('collection dispatch reads 24 mirrored Docx without pasting URLs and pages exact provenance',async t=>{
 const f=fixture(t);for(let i=0;i<24;i++)f.add('a',`message${i}`,link('docx',`doc${i}`));
 f.add('b','other',link('docx','otherDoc'));f.add('foreign','foreign',link('docx','foreignDoc'));
 const listed=[];let offset=0;
 do{const r=await f.call('feishu_office_collection',{offset});assert.equal(r.success,true);assert.equal(r.data.total,24);listed.push(...r.data.resources);offset=r.data.nextOffset;}while(offset!==null);
 assert.equal(listed.length,24);assert.equal(new Set(listed.map(r=>r.provenance.resourceId)).size,24);
 assert.ok(listed.every(r=>r.provenance.chat==='a'&&r.provenance.resourceType==='docx'&&/^message\d+$/.test(r.provenance.messageId)));
 assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
 for(let i=0;i<listed.length;i+=5){const r=await f.call('feishu_office_read_resources',{urls:listed.slice(i,i+5).map(r=>r.url)});assert.equal(r.success,true);assert.ok(r.data.results.every(r=>r.status==='success'&&r.identity==='owner-user'));}
 assert.equal(f.calls.length,48);assert.equal((await f.read('otherDoc')).success,false);assert.equal((await f.read('foreignDoc')).success,false);assert.equal(f.calls.length,48);
});

for(const text of ['读取新羽群里的所有飞书文档',request])test(`collection is automatic for existing document tool: ${text}`,async t=>{
 const f=fixture(t,{text});f.add('a','source',link('docx','doc'));
 const result=await f.call('feishu_doc_read',{documentId:'doc'});assert.equal(result.success,true);assert.equal(result.data.identity,'owner-user');assert.equal(f.calls.length,2);
});

test('authenticated Owner group request shares collection route without granting ordinary members',async t=>{
 const f=fixture(t,{groupOwner:true});f.add('a','source',link('docx','doc'));assert.equal((await f.read('doc')).success,true);
});
for(const user of ['member',''])test(`model cannot claim current Owner through source actor ${user||'missing'}`,async t=>{
 const f=fixture(t,{user});f.add('a','source',link('docx','doc'));await f.call('feishu_office_collection',{owner:'owner'});await f.read('doc');assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
});

for(const text of ['读取财务群里的所有飞书文档','以下是历史消息：读取新羽群里的所有飞书文档','不要读取新羽群里的所有飞书文档'])test(`collection fails closed without trusted explicit group request: ${text}`,async t=>{
 const f=fixture(t,{text});f.add('a','source',link('docx','doc'));assert.equal((await f.read('doc')).success,false);assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
});
test('duplicate trusted group display names and aliases cannot select a collection',async t=>{
 const f=fixture(t,{text:'读取新羽群里的所有飞书文档'});f.names.b=f.names.a;f.add('a','source',link('docx','doc'));assert.equal((await f.read('doc')).success,false);assert.equal(f.calls.length,0);
});

test('frozen collection cannot gain later mirror messages or document-body secondary links',async t=>{
 const f=fixture(t);f.add('a','source',link('docx','doc'));f.outputs.set('docx.v1.document.rawContent',{text:link('docx','secondary')});
 assert.equal((await f.read('doc')).success,true);f.add('a','later',link('docx','laterDoc'));
 const list=await f.call('feishu_office_collection');assert.equal(list.data.total,1);
 for(const id of ['laterDoc','secondary'])assert.equal((await f.read(id)).success,false);assert.equal(f.calls.length,1);
});
test('raw rich text href and links beyond clipped message previews retain trustworthy provenance',async t=>{
 const f=fixture(t);f.add('a','source',{zh_cn:{title:'resources',content:[[{tag:'text',text:'x'.repeat(15000)},{tag:'a',text:'document',href:link('docx','doc')}]]}},'post');
 assert.equal((await f.read('doc')).success,true);assert.equal((await f.call('feishu_office_collection')).data.resources[0].provenance.messageId,'source');
});
const collectionPost=id=>({title:'resources',content:[[{tag:'a',text:'document',href:link('docx',id)}]]});
const malformedCollectionPosts=[
 ['locale string content',{zh_cn:collectionPost('legit'),en_us:{content:'damaged'}}],
 ['null locale branch',{zh_cn:collectionPost('legit'),en_us:null}],
 ['locale object row',{zh_cn:collectionPost('legit'),en_us:{content:[{tag:'text',text:'damaged'}]}}],
 ['locale null node',{zh_cn:collectionPost('legit'),en_us:{content:[[null]]}}],
 ['locale array node',{zh_cn:collectionPost('legit'),en_us:{content:[[[]]]}}],
 ['top-level post mixed with valid locale',{...collectionPost('legit'),en_us:collectionPost('secondary')}],
 ['top-level post mixed with damaged locale',{...collectionPost('legit'),en_us:null}],
];
for(const [name,post] of malformedCollectionPosts)test(`collection rich-text rejects complete snapshot for ${name}`,async t=>{
 const f=fixture(t);f.add('a','source',post,'post');f.add('a','other-valid-source',link('docx','otherValid'));
 const page=await f.call('feishu_office_collection');assert.equal(page.success,false);assert.equal(page.data.resources,undefined);assert.match(page.data.error,/无法完整解析/);
 for(const id of ['legit','otherValid']){const result=await f.read(id);assert.equal(result.success,false);assert.match(result.data.error,/无法完整解析/);}
 assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
 assert.ok(!JSON.stringify(f.responses).includes(sentinel));
});
for(const [name,post,ids] of [
 ['all valid locale branches',{zh_cn:collectionPost('docZh'),en_us:collectionPost('docEn')},['docZh','docEn']],
 ['single valid top-level post',collectionPost('docTop'),['docTop']],
])test(`collection rich-text accepts ${name} without losing resources`,async t=>{
 const f=fixture(t);f.add('a','source',post,'post');const page=await f.call('feishu_office_collection');
 assert.equal(page.success,true);assert.equal(page.data.total,ids.length);assert.deepEqual(page.data.resources.map(x=>x.provenance.resourceId).sort(),[...ids].sort());
 assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
 for(const id of ids)assert.equal((await f.read(id)).success,true);
 assert.deepEqual(f.counts(),{calls:ids.length,leases:ids.length,accesses:ids.length});
});
for(const kind of ['text','post'])test(`nested quoted URL in ${kind} query cannot become a collection read target`,async t=>{
 const f=fixture(t),url=link('docx','root',`?next="${link('docx','nested')}"`);
 f.add('a','source',kind==='text'?url:{zh_cn:{title:'resources',content:[[{tag:'a',text:'document',href:url}]]}},kind);
 const page=await f.call('feishu_office_collection');assert.equal(page.success,true);assert.deepEqual(page.data.resources.map(r=>r.provenance.resourceId),['root']);
 assert.equal((await f.read('nested')).success,false);assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
 assert.equal((await f.read('root')).success,true);assert.equal(f.calls.length,1);
});

for(const stage of ['lease','queue','access','response','delivery'])for(const change of ['source-recall','group-revoke','group-leave','owner-change','request-recall','steer','turn-end'])test(`collection ${change} at ${stage} fences SDK and private output`,async t=>{
 const f=fixture(t,{stage});f.add('a','source',link('docx','doc'));const pending=f.read('doc');await f.waiting;f.change(change);f.release();await pending;
 assert.equal(f.calls.length,['response','delivery'].includes(stage)?1:0);assert.ok(!JSON.stringify(f.responses).includes(sentinel));
 if(['owner-change','turn-end'].includes(change))assert.equal(f.responses.length,0);
});

test('source recall invalidates that exact resource while unrelated frozen resource remains usable',async t=>{
 const f=fixture(t);f.add('a','source',link('docx','revoked'));f.add('a','kept',link('docx','kept'));await f.call('feishu_office_collection');f.groupStore.recall('a','source');
 assert.equal((await f.read('revoked')).success,false);assert.equal((await f.read('kept')).success,true);assert.equal(f.calls.length,1);
});

for(let i=0;i<2;i++)for(let j=0;j<2;j++)test(`collection Sheet token/range URL tuple ${i}/${j} stays bound`,async t=>{
 const f=fixture(t);for(let n=0;n<2;n++)f.add('a',`s${n}`,link('sheets',`sheet${n}`,`?sheet=tab${n}&range=${n?'B2:B2':'A1:A1'}`));
 const r=await f.call('feishu_office_sheet_read',{spreadsheetToken:`sheet${i}`,range:`tab${j}!${j?'B2:B2':'A1:A1'}`});assert.equal(r.success,i===j);assert.equal(f.calls.length,i===j?1:0);
});
for(let i=0;i<2;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++)test(`collection Bitable app/table/view URL tuple ${i}/${j}/${k} stays bound`,async t=>{
 const f=fixture(t);for(let n=0;n<2;n++)f.add('a',`b${n}`,link('base',`base${n}`,`?table=tbl${n}&view=view${n}`));
 const r=await f.office('bitable.v1.appTableView.get',{path:{app_token:`base${i}`,table_id:`tbl${j}`,view_id:`view${k}`}});const allowed=i===j&&j===k;assert.equal(r.success,allowed);assert.equal(f.calls.length,allowed?1:0);
});

test('root-only Base and Sheet allow metadata but cannot mint guessed table or range',async t=>{
 const f=fixture(t);f.add('a','base',link('base','base'));f.add('a','sheet',link('sheets','sheet'));
 const metadata=await f.call('feishu_office_read_resources',{urls:[link('base','base'),link('sheets','sheet')]});assert.ok(metadata.data.results.every(r=>r.status==='success'&&r.metadataOnly));assert.equal(f.calls.length,2);
 assert.equal((await f.office('bitable.v1.appTableRecord.list',{path:{app_token:'base',table_id:'guessed'}})).success,false);
 assert.equal((await f.call('feishu_office_sheet_read',{spreadsheetToken:'sheet',range:'guessed!A1:A1'})).success,false);assert.equal(f.calls.length,2);
});

test('only canonical Wiki mapping is inherited, across tools, and source recall revokes derived root',async t=>{
 const f=fixture(t);f.add('a','source',link('wiki','wiki'));
 f.outputs.set('wiki.v2.space.getNode',{node:{node_token:'wiki',obj_type:'docx',obj_token:'canonical'},body:link('docx','secondary')});
 assert.equal((await f.office('wiki.v2.space.getNode',{params:{token:'wiki'}})).success,true);assert.equal((await f.read('canonical')).success,true);assert.equal((await f.read('secondary')).success,false);
 f.groupStore.recall('a','source');assert.equal((await f.read('canonical')).success,false);assert.equal(f.calls.length,2);
});
test('Wiki Bitable query selectors remain tied to canonical object and cannot be swapped',async t=>{
 const f=fixture(t);for(let n=0;n<2;n++)f.add('a',`w${n}`,link('wiki',`wiki${n}`,`?table=tbl${n}&view=view${n}`));
 f.outputs.set('wiki.v2.space.getNode',p=>({node:{node_token:p.params.token,obj_type:'bitable',obj_token:p.params.token==='wiki0'?'base0':'base1'}}));
 for(let n=0;n<2;n++)assert.equal((await f.office('wiki.v2.space.getNode',{params:{token:`wiki${n}`}})).success,true);
 assert.equal((await f.office('bitable.v1.appTableView.get',{path:{app_token:'base0',table_id:'tbl0',view_id:'view0'}})).success,true);
 for(const path of [{app_token:'base0',table_id:'tbl1',view_id:'view1'},{app_token:'base0',table_id:'tbl0',view_id:'view1'}])assert.equal((await f.office('bitable.v1.appTableView.get',{path})).success,false);
 assert.equal(f.calls.length,3);
});

for(const [api,payload] of [['drive.v1.file.list',{params:{folder_token:'folder'}}],['wiki.v2.space.list',{}],['wiki.v2.spaceNode.list',{path:{space_id:'123'}}]])test(`collection cannot discover new roots with ${api}`,async t=>{
 const f=fixture(t);f.add('a','source',link('drive/folder','folder')+' '+link('wiki','wiki'));assert.equal((await f.office(api,payload)).success,false);assert.equal(f.calls.length,0);
});
test('collection cannot convert mirrored search keywords into Owner Drive search',async t=>{
 const f=fixture(t);f.add('a','source',link('docx','doc')+' 搜索「payroll」');assert.equal((await f.call('feishu_office_drive_search',{query:'payroll'})).success,false);assert.equal(f.calls.length,0);
});
for(const failure of ['disabled-api','scope','user-denied'])test(`collection ${failure} cannot fall back to tenant`,async t=>{
 const f=fixture(t);f.add('a','source',link('docx','doc'));
 if(failure==='disabled-api')f.blockApi('docx.v1.document.rawContent');
 if(failure==='scope')f.failLease(readError('scope_missing'));
 if(failure==='user-denied')f.outputs.set('docx.v1.document.rawContent',Object.assign(Error('private SDK error'),{feishuCode:1770032}));
 assert.equal((await f.read('doc')).success,false);assert.equal(f.calls.length,failure==='user-denied'?1:0);assert.ok(!JSON.stringify(f.responses).includes('fixture-user-token'));
});

test('Chinese adjacent Docx gets exact authority while shared tokens cannot reach OAuth or SDK',async t=>{
 const f=fixture(t);f.add('a','source',link('docx','doc123')+'请查看');f.add('a','share',link('share/base','shr123'));
 const page=await f.call('feishu_office_collection');assert.equal(page.success,true);assert.equal(page.data.total,2);
 assert.equal(page.data.resources.filter(r=>r.state==='unsupported').length,1);
 assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
 const denied=await f.office('bitable.v1.app.get',{path:{app_token:'shr123'}});assert.equal(denied.success,false);
 assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
 assert.equal((await f.read('doc123')).success,true);assert.equal((await f.read('doc12')).success,false);
 f.groupStore.recall('a','source');assert.equal((await f.read('doc123')).success,false);
});
for(const change of ['source-recall','group-revoke','owner-change','request-recall','steer'])test(`unsupported shared inventory lifecycle ${change}`,async t=>{
 const f=fixture(t);f.add('a','source',link('share/base/form','shared'));
 const page=await f.call('feishu_office_collection');assert.equal(page.success,true);assert.equal(page.data.resources[0].state,'unsupported');assert.equal(page.data.resources[0].provenance.resourceId,null);
 f.change(change);const after=await f.call('feishu_office_collection');
 assert.ok(!after?.success||!JSON.stringify(after.data).includes('/share/base/form/shared'));
 assert.deepEqual(f.counts(),{calls:0,leases:0,accesses:0});
});
