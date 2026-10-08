import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {randomBytes} from 'node:crypto';import {Client} from '@larksuiteoapi/node-sdk';
import {OwnerOAuth,CredentialVault,binding,tokenRecord} from '../src/owner-oauth.mjs';
import {OWNER_READ_APIS,OWNER_READ_SPECIAL,readError} from '../src/owner-office-read-policy.mjs';
import {OwnerOfficeReader,boundedRead} from '../src/owner-office-read.mjs';
import {Office,OFFICE_TOOLS,officeDefinition} from '../src/office.mjs';import {Documents} from '../src/documents.mjs';
import {GROUP_TOOLS} from '../src/group-assistant.mjs';import {loadConfig} from '../src/config.mjs';
import {ownerReadGuard} from '../src/owner-read-permit.mjs';
const fixtureText='读取 document_id doc, document_id doc block_id block, document_id private, token wiki, token node, space_id 123, folder_token folder, doc_token file, spreadsheet_token sheet, spreadsheet_token sheet sheet_id tab, spreadsheet_token sheet range tab!A1:B2, app_token base, app_token base table_id table, app_token base table_id table view_id view, app_token base table_id table record_id record, app_token base table_id table form_id form';
const trusted=(text=fixtureText,g=()=>{})=>ownerReadGuard(g,()=>({text}));
const guard=trusted();
const apiGuard=api=>trusted(api==='feishu_office_drive_search'?'搜索「requested topic」':api==='wiki.v2.space.list'?'列出知识库':fixtureText);
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-read-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const key=randomBytes(32);
 const apis=Object.keys(OWNER_READ_APIS),scopes=['offline_access',...new Set(Object.values(OWNER_READ_APIS).flatMap(r=>r.scopes))];
 const config={feishu:{appId:'fixture-app',appSecret:'fixture-secret',ownerOpenId:'owner'},codex:{cwd:dir,binary:'codex',sandbox:'read-only',approvalPolicy:'on-request'},storageDir:dir,ownerOAuth:{enabled:true,apis}};
 let owner='owner';const vault=new CredentialVault(dir,{keychain:{create:async()=>key,read:async()=>key}});await vault.initialize();
 const record={binding:binding(config,owner),generation:'1',allowedApis:apis,...tokenRecord({access_token:'fixture-uat',refresh_token:'fixture-refresh',expires_in:7200,refresh_token_expires_in:604800,scope:scopes.join(' ')},scopes)};vault.write(key,record);
 const calls=[],client={},outputs=new Map([['drive.v1.meta.batchQuery',p=>({metas:p.data.request_docs})]]);
 for(const api of apis.filter(a=>!OWNER_READ_SPECIAL.includes(a))){let p=client;const parts=api.split('.');for(const k of parts.slice(0,-1))p=p[k]??={};p[parts.at(-1)]=async(payload,opts)=>{calls.push({api,payload,opts});const output=outputs.get(api);return typeof output==='function'?output(payload):output??{items:[{id:'fixture'}],has_more:true,page_token:'next'};};}
 client.request=async(payload,opts)=>{calls.push({api:'request',payload,opts});return {values:[[1]],has_more:false};};
 const f={client,call:async(fn,_retry,g)=>{g();return fn();}};const oauth=new OwnerOAuth(config,()=>owner,{vault});const office=new Office(f,oauth),reader=office.reader;
 return {dir,key,config,vault,record,calls,outputs,client,f,oauth,office,reader,setOwner:x=>owner=x};
}
const payloads={
 'docx.v1.document.get':{path:{document_id:'doc'}},
 'docx.v1.document.rawContent':{path:{document_id:'doc'}},
 'docx.v1.documentBlock.list':{path:{document_id:'doc'}},
 'docx.v1.documentBlock.get':{path:{document_id:'doc',block_id:'block'}},
 'docx.v1.documentBlockChildren.get':{path:{document_id:'doc',block_id:'block'}},
 'wiki.v2.space.get':{path:{space_id:'123'}},'wiki.v2.space.list':{},
 'wiki.v2.space.getNode':{params:{token:'wiki'}},'wiki.v2.spaceNode.list':{path:{space_id:'123'}},
 'drive.v1.file.list':{params:{folder_token:'folder'}},
 'drive.v1.meta.batchQuery':{data:{request_docs:[{doc_token:'file',doc_type:'file'}]}},
 'sheets.v3.spreadsheet.get':{path:{spreadsheet_token:'sheet'}},
 'sheets.v3.spreadsheetSheet.get':{path:{spreadsheet_token:'sheet',sheet_id:'tab'}},
 'sheets.v3.spreadsheetSheet.query':{path:{spreadsheet_token:'sheet'}},
 'bitable.v1.app.get':{path:{app_token:'base'}},
 'bitable.v1.appTable.list':{path:{app_token:'base'}},
 'bitable.v1.appTableField.list':{path:{app_token:'base',table_id:'table'}},
 'bitable.v1.appTableView.list':{path:{app_token:'base',table_id:'table'}},
 'bitable.v1.appTableView.get':{path:{app_token:'base',table_id:'table',view_id:'view'}},
 'bitable.v1.appTableRecord.list':{path:{app_token:'base',table_id:'table'}},
 'bitable.v1.appTableRecord.get':{path:{app_token:'base',table_id:'table',record_id:'record'}},
 'bitable.v1.appTableForm.get':{path:{app_token:'base',table_id:'table',form_id:'form'}},
 'bitable.v1.appTableFormField.list':{path:{app_token:'base',table_id:'table',form_id:'form'}},
 'feishu_office_sheet_read':{spreadsheetToken:'sheet',range:'tab!A1:B2'},
 'feishu_office_drive_search':{query:'requested topic',count:5,offset:0},
};
for(const [api,payload] of Object.entries(payloads))test(`${api} uses only scoped Owner user identity`,async t=>{
 const f=await fixture(t);const r=await f.reader.session(apiGuard(api)).call(api,payload);assert.equal(r.identity,'owner-user');assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].opts.lark[Reflect.ownKeys(f.calls[0].opts.lark)[0]],'fixture-uat');assert.equal(JSON.stringify(r).includes('fixture-uat'),false);
});
test('fixed policy matches fixed SDK, contains no write or permission endpoints',()=>{
 const client=new Client({appId:'fixture',appSecret:'fixture',logger:{info(){},error(){},warn(){},debug(){},trace(){}}});
 assert.deepEqual(Object.keys(OWNER_READ_APIS).sort(),Object.keys(payloads).sort());
 for(const [api,rule] of Object.entries(OWNER_READ_APIS)){
  assert.ok(rule.scopes.every(s=>/:read(?:only)?$|:retrieve$/.test(s)||(['docx.v1.document.get','docx.v1.document.rawContent','docx.v1.documentBlock.list','docx.v1.documentBlock.get','docx.v1.documentBlockChildren.get'].includes(api)&&s==='docx:document')||(api==='wiki.v2.space.getNode'&&s==='wiki:wiki')));
  if(OWNER_READ_SPECIAL.includes(api))continue;const def=officeDefinition(api);assert.ok(def.tokens.includes('user'));assert.ok(def.method==='GET'||api==='drive.v1.meta.batchQuery');assert.equal(typeof api.split('.').reduce((v,k)=>v[k],client),'function');
 }
});
test('local policy accepts only fixed dedicated read aliases, no new scopes configured automatically',async t=>{const f=await fixture(t);const filename=path.join(f.dir,'config.json');fs.writeFileSync(filename,JSON.stringify({...JSON.parse(fs.readFileSync(new URL('../config.example.json',import.meta.url))),...f.config,feishu:{appId:'',appSecret:'',ownerOpenId:''}}));assert.deepEqual(loadConfig(filename,false).ownerOAuth,f.config.ownerOAuth);});
for(const change of ['no-provider','api-unlisted','grant-missing','scope-missing','sdk-missing'])test(`fail closed before transport: ${change}`,async t=>{
 const f=await fixture(t),api='wiki.v2.space.getNode';
 if(change==='no-provider')f.reader.oauth=undefined;if(change==='api-unlisted')f.config.ownerOAuth.apis=[];
 if(change==='grant-missing')f.vault.write(f.key,{...f.record,allowedApis:[]});if(change==='scope-missing')f.vault.write(f.key,{...f.record,scopes:['offline_access']});
 if(change==='sdk-missing')delete f.client.wiki.v2.space.getNode;
 await assert.rejects(f.reader.session(guard).call(api,payloads[api]));assert.equal(f.calls.length,0);
});
for(const stage of ['queue','unlock','access','response'])for(const change of ['recalled','owner','disabled','reauthorized','scope'])test(`${change} during ${stage} discards read; zero tenant fallback`,async t=>{
 const f=await fixture(t),api='docx.v1.document.get';let active=true;const g=trusted(fixtureText,()=>{if(!active)throw Error('withdrawn');});
 const invalidate=()=>{if(change==='recalled')active=false;if(change==='owner')f.setOwner('other');if(change==='disabled')f.config.ownerOAuth.enabled=false;if(change==='reauthorized')f.vault.write(f.key,{...f.record,generation:'new'});if(change==='scope')f.vault.write(f.key,{...f.record,scopes:[]});};
 if(stage==='queue')f.f.call=async(fn)=>{invalidate();return fn();};
 if(stage==='unlock'){const unlock=f.vault.unlock.bind(f.vault);f.vault.unlock=async()=>{const key=await unlock();invalidate();return key;};}
 if(stage==='access'){const locked=f.vault.locked.bind(f.vault);f.vault.locked=async fn=>{invalidate();return locked(fn);};}
 if(stage==='response')f.outputs.set(api,()=>{invalidate();return {secret:'MUST_NOT_RETURN'};});
 await assert.rejects(f.office.execute('feishu_office_call',{api,payload:payloads[api]},g));assert.equal(f.calls.length,stage==='response'?1:0);
});
test('reauthorization between multiple calls cannot combine grants',async t=>{const f=await fixture(t),s=f.reader.session(guard);await s.call('wiki.v2.space.getNode',payloads['wiki.v2.space.getNode']);f.vault.write(f.key,{...f.record,generation:'new'});await assert.rejects(s.call('docx.v1.document.get',payloads['docx.v1.document.get']));assert.equal(f.calls.length,1);});
test('dedicated document read and generic Office call share scope and user route',async t=>{
 const f=await fixture(t);f.outputs.set('docx.v1.document.get',{document:{revision_id:3}});const docs=new Documents(f.f,()=> 'owner',f.reader);
 const r=await docs.execute('feishu_doc_read',{documentId:'doc'},guard);assert.equal(r.identity,'owner-user');assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>c.opts.lark[Reflect.ownKeys(c.opts.lark)[0]]==='fixture-uat'));
 f.vault.write(f.key,{...f.record,scopes:['offline_access']});await assert.rejects(docs.execute('feishu_doc_read',{documentId:'doc'},guard),/scope_missing/);assert.equal(f.calls.length,2);
});
test('sheet dedicated read uses fixed URL/user token and write stays on existing consent path',async t=>{
 const f=await fixture(t);const r=await f.office.execute('feishu_office_sheet_read',payloads.feishu_office_sheet_read,guard);assert.equal(r.identity,'owner-user');assert.equal(f.calls[0].payload.method,'GET');
 await assert.rejects(f.office.execute('feishu_office_sheet_write',{...payloads.feishu_office_sheet_read,values:[[1,2],[3,4]]},guard),/宿主一次性授权/);assert.equal(f.calls.length,1);
});
for(const [api,payload] of [
 ['drive.v1.file.list',{}],['drive.v1.file.list',{params:{folder_token:'folder',page_size:51}}],
 ['bitable.v1.appTableRecord.list',{path:{app_token:'base',table_id:'table'},params:{page_size:500}}],
 ['feishu_office_sheet_read',{spreadsheetToken:'s',range:'tab!A:Z'}],['feishu_office_sheet_read',{spreadsheetToken:'s',range:'tab!A1:Z500'}],
 ['feishu_office_drive_search',{query:'x',count:50,offset:150}],['feishu_office_drive_search',{query:'x',url:'https://evil'}],
 ['docx.v1.document.get',{path:{document_id:'a/../b'}}],['drive.v1.file.delete',{path:{file_token:'file'},params:{type:'docx'}}],
 ['drive.v1.media.batchGetTmpDownloadUrl',{}],
])test(`bounded input rejected ${api} ${JSON.stringify(payload)}`,async t=>{const f=await fixture(t);await assert.rejects(f.reader.session(guard).call(api,payload));assert.equal(f.calls.length,0);});
test('Drive and Bitable single page returns cursors, does not crawl subsequent pages',async t=>{for(const api of ['drive.v1.file.list','bitable.v1.appTableRecord.list']){const f=await fixture(t);const r=await f.reader.session(guard).call(api,{...payloads[api],params:{...payloads[api].params,page_token:'current',page_size:2}});assert.equal(f.calls.length,1);assert.equal(r.nextCursor,'next');assert.equal(r.requestedCursor,'current');}});
for(const [type,expected] of [['docx','docx.v1.documentBlock.list'],['sheet','sheets.v3.spreadsheet.get'],['bitable','bitable.v1.app.get'],['file','drive.v1.meta.batchQuery'],['slides',null]])test(`Wiki ${type} resolves token and reports metadata/content accurately`,async t=>{
 const f=await fixture(t);f.outputs.set('wiki.v2.space.getNode',{node:{obj_type:type,obj_token:'real'}});f.outputs.set('docx.v1.document.get',{document:{revision_id:1}});
 const {results:[r]}=await f.reader.resources(['https://example.feishu.cn/wiki/node'],guard);
 assert.equal(r.status,expected?'success':'failed');if(expected){assert.equal(f.calls.at(-1).api,expected);assert.ok(JSON.stringify(f.calls.at(-1).payload).includes('real'));assert.equal(r.metadataOnly,type!=='docx');}else assert.equal(f.calls.length,1);
});
test('batch reports per-item partial failure without exposing raw error/token or losing successful item',async t=>{
 const f=await fixture(t);f.outputs.set('docx.v1.document.get',()=>{const e=Error('fixture-uat');e.feishuCode=1770032;throw e;});
 const r=await f.reader.resources(['https://example.feishu.cn/base/base','https://example.feishu.cn/docx/private','https://example.feishu.cn/share/base/formid'],guard);
 assert.deepEqual(r.results.map(x=>x.status),['success','failed','failed']);assert.equal(r.results[1].reason,'resource_denied');assert.ok(!JSON.stringify(r).includes('fixture-uat'));
});
test('unknown share-form does not guess a backing Bitable; known form uses fixed API',async t=>{const f=await fixture(t);const r=await f.reader.resources(['https://example.feishu.cn/share/base/abc','https://example.feishu.cn/base/base?form=opaque'],guard);assert.equal(f.calls.length,0);assert.ok(r.results.every(x=>x.status==='failed'));await f.reader.session(guard).call('bitable.v1.appTableForm.get',payloads['bitable.v1.appTableForm.get']);assert.equal(f.calls.length,1);});
test('revocation aborts whole batch including preceding successful private result',async t=>{const f=await fixture(t);let valid=true;f.outputs.set('bitable.v1.app.get',()=>{valid=false;return {private:'private'};});await assert.rejects(f.reader.resources(['https://example.feishu.cn/base/base','https://example.feishu.cn/wiki/wiki'],trusted(fixtureText,()=>{if(!valid)throw Error('withdrawn');})),/withdrawn/);assert.equal(f.calls.length,1);});
test('oversized response retains explicit partial flag/current/next cursors within byte budget',()=>{const r=boundedRead({data:{text:'中'.repeat(30000)},hasMore:true,nextCursor:'next',requestedCursor:'current',identity:'owner-user'});assert.equal(r.truncated,true);assert.equal(r.nextCursor,'next');assert.equal(r.requestedCursor,'current');assert.ok(Buffer.byteLength(JSON.stringify(r))<24000);});
test('new tools excluded from Group schema; reader without Owner provider refuses',async()=>{for(const tool of OFFICE_TOOLS)assert.ok(!GROUP_TOOLS.some(g=>g.name===tool.name));const reader=new OwnerOfficeReader({});await assert.rejects(reader.session(guard).call('docx.v1.document.get',payloads['docx.v1.document.get']),/api_not_allowed/);});
for(const [code,expected] of [[99991672,'scope_missing'],[131006,'resource_denied'],[99991663,'reauthorization_required'],[123456,'unknown']])test(`safe error classification ${code}`,async t=>{const f=await fixture(t);f.outputs.set('docx.v1.document.get',()=>{const e=Error('fixture-uat');e.feishuCode=code;throw e;});await assert.rejects(f.reader.session(guard).call('docx.v1.document.get',payloads['docx.v1.document.get']),e=>e.readCode===expected&&!e.message.includes('fixture-uat'));assert.equal(f.calls.length,1);});

test('actual pinned SDK serializes user Authorization on both SDK method and fixed request routes',async t=>{
 const f=await fixture(t),requests=[];
 const client=new Client({appId:'fixture',appSecret:'fixture',logger:{info(){},error(){},warn(){},debug(){},trace(){}},httpInstance:{request:async r=>{requests.push(r);return {code:0,data:{ok:true}};}}});
 f.f.client=client;
 await f.reader.session(guard).call('docx.v1.document.get',payloads['docx.v1.document.get']);
 await f.reader.session(guard).call('feishu_office_sheet_read',payloads.feishu_office_sheet_read);
 await f.reader.session(apiGuard('feishu_office_drive_search')).call('feishu_office_drive_search',payloads.feishu_office_drive_search);
 assert.equal(requests.length,3);assert.ok(requests.every(r=>r.headers.Authorization==='Bearer fixture-uat'));assert.ok(requests.every(r=>!r.url.includes('tenant_access_token')));
});
import {OWNER_READ_GUARD} from '../src/owner-office-read.mjs';
test('result delivery guard survives generic, dedicated, batch and truncation paths',async t=>{
 for(const route of ['generic','document','batch','huge']){
  const f=await fixture(t);f.outputs.set('docx.v1.document.get',{document:{revision_id:1}});if(route==='huge')f.outputs.set('docx.v1.document.get',{text:'中'.repeat(30000)});
  let r;if(route==='document')r=await new Documents(f.f,()=> 'owner',f.reader).execute('feishu_doc_read',{documentId:'doc'},guard);
  else if(route==='batch')r=await f.reader.resources(['https://example.feishu.cn/base/base'],guard);
  else r=await f.office.execute('feishu_office_call',{api:'docx.v1.document.get',payload:payloads['docx.v1.document.get']},guard);
  assert.equal(typeof r[OWNER_READ_GUARD],'function');f.vault.write(f.key,{...f.record,generation:'new'});assert.throws(()=>r[OWNER_READ_GUARD]());assert.ok(!JSON.stringify(r).includes('fixture-uat'));
 }
});
test('huge multibyte cursors and batch payload stay within 24KB, explicitly incomplete',async t=>{
 const f=await fixture(t);f.outputs.set('bitable.v1.app.get',{huge:'中'.repeat(30000),page_token:'中'.repeat(30000),has_more:true});
 const r=await f.reader.resources(Array(5).fill('https://example.feishu.cn/base/base'),guard);assert.ok(Buffer.byteLength(JSON.stringify(r))<24000);assert.ok(r.results.every(x=>x.truncated&&x.cursorUnavailable&&x.metadataOnly));
});

test('Drive HTTP success with per-resource failure is not reported as a successful resource read',async t=>{
 const f=await fixture(t);f.outputs.set('drive.v1.meta.batchQuery',{metas:[],failed_list:[{token:'file',code:970003}]});
 const r=await f.reader.resources(['https://example.feishu.cn/file/file'],guard);assert.equal(r.results[0].status,'failed');assert.equal(r.results[0].reason,'resource_denied');
 const call=await f.office.execute('feishu_office_call',{api:'drive.v1.meta.batchQuery',payload:payloads['drive.v1.meta.batchQuery']},guard);assert.equal(call.partial,true);
});

for(const scope of ['docx:document:readonly','docx:document'])test(`rawContent accepts existing alternative grant ${scope} without authorization changes`,async t=>{
 const f=await fixture(t),api='docx.v1.document.rawContent';
 const record={...f.record,scopes:['offline_access',scope]};f.vault.write(f.key,record);
 f.outputs.set(api,{content:'synthetic text'});
 await f.office.execute('feishu_office_call',{api,payload:payloads[api]},trusted('读取 document_id doc'));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].api,api);
 assert.equal(f.calls[0].opts.lark[Reflect.ownKeys(f.calls[0].opts.lark)[0]],'fixture-uat');
 assert.deepEqual(f.vault.read(f.key),record);
 await assert.rejects(f.reader.session(trusted('读取 document_id doc')).call('docx.v1.document.create',{data:{title:'denied'}}));
 assert.equal(f.calls.length,1);
});
for(const scopes of [[],['docx:document:write'],['docs:doc'],['wiki:wiki:readonly']])test(`rawContent rejects unrelated scopes ${scopes}`,async t=>{
 const f=await fixture(t),api='docx.v1.document.rawContent';f.vault.write(f.key,{...f.record,scopes});
 await assert.rejects(f.reader.session(guard).call(api,payloads[api]),e=>e.readCode==='scope_missing');assert.equal(f.calls.length,0);
});
test('rawContent equivalent grant is rechecked before transport',async t=>{
 const f=await fixture(t),api='docx.v1.document.rawContent';f.vault.write(f.key,{...f.record,scopes:['docx:document']});
 f.f.call=async fn=>{f.vault.write(f.key,{...f.record,scopes:[]});return fn();};
 await assert.rejects(f.reader.session(guard).call(api,payloads[api]),e=>e.readCode==='scope_missing');assert.equal(f.calls.length,0);
});

const docxReads=['docx.v1.document.get','docx.v1.documentBlock.list','docx.v1.documentBlock.get','docx.v1.documentBlockChildren.get'];
for(const api of docxReads)for(const scope of ['docx:document','docx:document:readonly',null])test(`${api} exact alternative scope ${scope}`,async t=>{
 const f=await fixture(t),record={...f.record,scopes:scope?[scope]:['docs:doc']};f.vault.write(f.key,record);
 const work=()=>f.reader.session(guard).call(api,payloads[api]);
 if(scope){const r=await work();assert.equal(r.identity,'owner-user');assert.equal(f.calls.length,1);assert.equal(f.calls[0].opts.lark[Reflect.ownKeys(f.calls[0].opts.lark)[0]],'fixture-uat');}
 else{await assert.rejects(work(),e=>e.readCode==='scope_missing');assert.equal(f.calls.length,0);}
 assert.deepEqual(f.vault.read(f.key),record);
});
for(const scope of ['docx:document','docx:document:readonly'])test(`dedicated read and both diagnostic arms accept ${scope}`,async t=>{
 const f=await fixture(t);f.vault.write(f.key,{...f.record,scopes:[scope]});f.outputs.set('docx.v1.document.get',{document:{revision_id:3}});
 const docs=new Documents(f.f,()=> 'owner',f.reader);await docs.execute('feishu_doc_read',{documentId:'doc'},guard);
 assert.deepEqual(f.calls.map(c=>c.api),['docx.v1.document.get','docx.v1.documentBlock.list']);
 let direct=0;f.reader.fetcher=async(url,options)=>{direct++;assert.equal(url.pathname,'/open-apis/docx/v1/documents/doc/blocks');assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer fixture-uat');return new Response(JSON.stringify({code:0,data:{items:[],has_more:false}}));};
 const r=await f.reader.diagnose('https://example.feishu.cn/docx/doc',guard);assert.equal(r.classification,'both_succeeded');assert.equal(r.A.scope,'granted');assert.equal(r.B.scope,'granted');assert.equal(direct,1);assert.equal(f.calls.length,3);
 f.vault.write(f.key,{...f.record,scopes:[]});const denied=await f.reader.diagnose('https://example.feishu.cn/docx/doc',guard);assert.equal(denied.classification,'scope');assert.equal(denied.A.outbound,false);assert.equal(denied.B.outbound,false);assert.equal(direct,1);assert.equal(f.calls.length,3);
});

for(const scope of ['wiki:node:read','wiki:wiki:readonly','wiki:wiki'])test(`Wiki dedicated and Office read accept existing ${scope} without changing grants`,async t=>{
 const f=await fixture(t),record={...f.record,scopes:[scope,'docx:document']};f.vault.write(f.key,record);
 f.outputs.set('wiki.v2.space.getNode',{node:{obj_type:'docx',obj_token:'resolved'}});f.outputs.set('docx.v1.document.get',{document:{revision_id:3}});
 const docs=new Documents(f.f,()=> 'owner',f.reader),g=()=>trusted('读取 https://example.feishu.cn/wiki/node');
 const r=await docs.execute('feishu_doc_read',{documentId:'https://example.feishu.cn/wiki/node'},g());assert.equal(r.documentId,'resolved');assert.equal(r.identity,'owner-user');
 const officeGuard=g();await f.office.execute('feishu_office_call',{api:'wiki.v2.space.getNode',payload:{params:{token:'node'}}},officeGuard);
 await f.office.execute('feishu_office_call',{api:'docx.v1.documentBlock.list',payload:{path:{document_id:'resolved'}}},officeGuard);
 assert.equal(f.calls.length,5);assert.ok(f.calls.every(c=>c.opts.lark[Reflect.ownKeys(c.opts.lark)[0]]==='fixture-uat'));assert.deepEqual(f.vault.read(f.key),record);
 await assert.rejects(f.reader.session(g()).call('wiki.v2.spaceNode.create',{path:{space_id:'123'},data:{obj_type:'docx'}}));assert.equal(f.calls.length,5);
 f.vault.write(f.key,{...record,scopes:['docx:document']});
 await assert.rejects(docs.execute('feishu_doc_read',{documentId:'https://example.feishu.cn/wiki/node'},g()),e=>e.readCode==='scope_missing');assert.equal(f.calls.length,5);
});
test('Wiki equivalent grant is rechecked before transport',async t=>{
 const f=await fixture(t);f.vault.write(f.key,{...f.record,scopes:['wiki:wiki']});
 f.f.call=async fn=>{f.vault.write(f.key,{...f.record,scopes:['wiki:wiki:write']});return fn();};
 await assert.rejects(f.reader.session(trusted('读取 token node')).call('wiki.v2.space.getNode',{params:{token:'node'}}),e=>e.readCode==='scope_missing');assert.equal(f.calls.length,0);
});
