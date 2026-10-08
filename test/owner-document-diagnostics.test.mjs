import test from 'node:test';
import assert from 'node:assert/strict';
import {OwnerOfficeReader,OWNER_READ_GUARD} from '../src/owner-office-read.mjs';
import {ownerReadGuard} from '../src/owner-read-permit.mjs';
import {readError} from '../src/owner-office-read-policy.mjs';
import {compareReadDiagnostics} from '../src/owner-read-diagnostics.mjs';
import {Documents} from '../src/documents.mjs';
import {Feishu} from '../src/feishu.mjs';
const url='https://example.feishu.cn/docx/doc';
function fixture({timeoutMs=1000,source='读取 document_id doc, token wiki, document_id second'}={}){
 let text=source,live=true,leaseError,transportError,fetchError,hang=false,leases=0,calls=0,directCalls=0,release;
 const check=()=>{if(!live)throw Error('revoked');},guard=ownerReadGuard(check,()=>({text}));
 const client={docx:{v1:{document:{get:async()=>({document:{revision_id:1}})},documentBlock:{list:async(p,opts)=>{
  calls++;assert.equal(opts.lark[Reflect.ownKeys(opts.lark)[0]],'synthetic-secret');
  if(hang)await new Promise(r=>release=r);if(transportError)throw transportError;
  return {items:[{text:'PRIVATE_BODY'}],has_more:false};
 }}}},wiki:{v2:{space:{getNode:async()=>({node:{node_token:'wiki',obj_type:'docx',obj_token:'doc'}})}}}};
 const feishu={client,call:async(fn,retry,g)=>{assert.equal(retry,false);g();const r=await fn();g();return r.data??r;}};
 const oauth={enabled:()=>true,lease:async(api,g)=>{leases++;g();if(leaseError)throw leaseError;return {check:g,access:async()=>{g();return 'synthetic-secret';}};}};
 const fetcher=async(u,o)=>{directCalls++;assert.equal(u.origin,'https://open.feishu.cn');assert.equal(u.pathname,'/open-apis/docx/v1/documents/doc/blocks');assert.equal(o.headers.Authorization,'Bearer synthetic-secret');assert.equal(o.redirect,'error');if(fetchError)throw fetchError;return new Response(JSON.stringify({code:0,data:{items:[{text:'PRIVATE_DIRECT_BODY'}]}}),{status:200});};
 const reader=new OwnerOfficeReader(feishu,oauth,{timeoutMs,fetcher});
 return {reader,guard,feishu,oauth,counts:()=>({leases,calls,directCalls}),change:x=>text=x,revoke:()=>live=false,setLease:e=>leaseError=e,setError:e=>transportError=e,setFetchError:e=>fetchError=e,setHang:()=>hang=true,release:()=>release?.()};
}
test('A/B uses the same exact document and user identity, returns no body or secret',async()=>{
 const f=fixture(),r=await f.reader.diagnose(url,f.guard);
 assert.equal(r.classification,'both_succeeded');assert.equal(r.documentId,'doc');assert.equal(r.B.httpStatus,200);assert.equal(r.B.outbound,true);
 assert.equal(r.A.identity,'owner-user');assert.equal(r.A.scope,'granted');
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_|synthetic-secret/);assert.equal(f.counts().directCalls,1);
});
test('SDK denial versus direct success is a path difference, never a fabricated ACL diagnosis',async()=>{
 const f=fixture();f.setError({response:{status:403,data:{code:1770032,msg:'synthetic-secret PRIVATE_BODY'}}});
 const r=await f.reader.diagnose(url,f.guard);assert.equal(r.classification,'api_path_difference');assert.equal(r.A.httpStatus,403);assert.equal(r.A.feishuCode,1770032);assert.equal(r.B.status,'success');assert.doesNotMatch(JSON.stringify(r),/PRIVATE_|synthetic-secret/);
});
test('historical tenant 403 versus user success classifies identity routing',()=>{
 assert.equal(compareReadDiagnostics({identity:'tenant',status:'failed',reason:'resource_denied'},{identity:'owner-user',status:'success'}),'identity_routing');
});
for(const [reason,classification] of [['scope_missing','scope'],['reauthorization_required','token_unavailable'],['api_not_allowed','api_capability'],['user_identity_unsupported','api_capability']])test(`A/B ${reason}: no body transport`,async()=>{
 const f=fixture();f.setLease(readError(reason));const r=await f.reader.diagnose(url,f.guard);
 assert.equal(r.classification,classification);assert.equal(r.A.outbound,false);assert.equal(r.B.outbound,false);assert.equal(f.counts().calls+f.counts().directCalls,0);
});
test('both user paths denied retain actual HTTP/code without token fallback',async()=>{
 const f=fixture(),error={response:{status:403,data:{code:1770032}}};f.setError(error);f.setFetchError(error);
 const r=await f.reader.diagnose(url,f.guard);assert.equal(r.classification,'resource_permission');assert.equal(r.A.identity,r.B.identity);assert.equal(f.counts().calls,1);assert.equal(f.counts().directCalls,1);
});
test('unknown 403 stays unknown',async()=>{
 const f=fixture(),error={response:{status:403,data:{code:999999}}};f.setError(error);f.setFetchError(error);
 const r=await f.reader.diagnose(url,f.guard);assert.equal(r.classification,'unknown');assert.equal(r.B.httpStatus,403);
});
test('model guessed target is denied for both arms before OAuth',async()=>{
 const f=fixture({source:'读取 document_id other'}),r=await f.reader.diagnose(url,f.guard);
 assert.equal(r.classification,'local_permit');assert.deepEqual(f.counts(),{leases:0,calls:0,directCalls:0});
});
test('Wiki resolves exact object once and both arms use its Docx ID',async()=>{
 const f=fixture(),r=await f.reader.diagnose('https://example.feishu.cn/wiki/wiki',f.guard);
 assert.equal(r.wiki.objType,'docx');assert.equal(r.wiki.objToken,'doc');assert.equal(r.classification,'both_succeeded');
});
test('legacy document tool supports Wiki and uses user for node, metadata and body',async()=>{
 const f=fixture(),r=await new Documents(f.feishu,()=> 'owner',f.reader).execute('feishu_doc_read',{documentId:'https://example.feishu.cn/wiki/wiki'},f.guard);
 assert.equal(r.documentId,'doc');assert.equal(r.wiki.objToken,'doc');assert.equal(r.identity,'owner-user');assert.equal(f.counts().leases,3);
});
test('unsupported Wiki target has no Docx outbound and no guessed ID',async()=>{
 const f=fixture();f.feishu.client.wiki.v2.space.getNode=async()=>({node:{obj_type:'bitable',obj_token:'base'}});
 const r=await f.reader.diagnose('https://example.feishu.cn/wiki/wiki',f.guard);assert.equal(r.reason,'unsupported_resource');assert.equal(f.counts().calls+f.counts().directCalls,0);
});
for(const path of ['share/base/form/shared','base/base'])test(`diagnostic rejects unsupported path ${path}`,async()=>{
 const f=fixture();await assert.rejects(f.reader.diagnose('https://example.feishu.cn/'+path,f.guard),/unsupported_resource/);assert.equal(f.counts().leases,0);
});
test('timeout is incomplete, not 403; late SDK result never becomes this response',async()=>{
 const f=fixture({timeoutMs:20});f.setHang();const r=await f.reader.resources([url],f.guard);
 assert.equal(r.results[0].reason,'timeout');assert.equal(r.results[0].completion,'incomplete');assert.equal(r.results[0].diagnostics.at(-1).httpStatus,null);f.release();assert.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY/);
});
test('queue timeout prevents a later outbound request',async()=>{
 const f=fixture({timeoutMs:20});let start;f.feishu.call=(fn,retry,g)=>new Promise(resolve=>{start=async()=>{try{g();resolve(await fn());}catch(e){resolve(e);}};});
 const r=await f.reader.resources([url],f.guard);assert.equal(r.results[0].reason,'timeout');await start();assert.equal(f.counts().calls,0);
});
test('multiple resources independently report success, denial and timeout',async()=>{
 const f=fixture({timeoutMs:20,source:'读取 document_id doc, document_id denied, document_id slow'});
 f.feishu.client.docx.v1.documentBlock.list=async p=>{if(p.path.document_id==='denied')throw {feishuCode:1770032};if(p.path.document_id==='slow')return new Promise(()=>{});return {items:[],has_more:false};};
 const r=await f.reader.resources([url,'https://example.feishu.cn/docx/denied','https://example.feishu.cn/docx/slow'],f.guard);
 assert.deepEqual(r.results.map(x=>x.reason??x.status),['success','resource_denied','timeout']);assert.deepEqual(r.results.map(x=>x.resourceId),['doc','denied','slow']);
});
for(const change of ['steer','owner'])test(`diagnostic ${change} while awaiting API invalidates results`,async()=>{
 const f=fixture();f.setHang();const p=f.reader.diagnose(url,f.guard);while(!f.counts().calls)await new Promise(r=>setTimeout(r,1));
 change==='steer'?f.change('停止'):f.revoke();f.release();await assert.rejects(p);assert.equal(f.counts().directCalls,0);
});
test('successful diagnostic keeps live delivery guard',async()=>{
 const f=fixture(),r=await f.reader.diagnose(url,f.guard);f.revoke();assert.throws(()=>r[OWNER_READ_GUARD]());
});
test('actual SDK adapter evidence records HTTP status and user header, with no tenant token request',async()=>{
 const f=fixture(),transport=new Feishu({feishu:{appId:'fixture',appSecret:'fixture'}});let requests=0;
 transport.client.httpInstance.defaults.adapter=async config=>{requests++;assert.equal(config.headers.Authorization,'Bearer synthetic-secret');assert.match(config.url,/\/docx\/v1\/documents\/doc\/blocks$/);return {data:{code:0,data:{items:[]}},status:200,headers:{},config};};
 const r=await new OwnerOfficeReader(transport,f.oauth).session(f.guard).call('docx.v1.documentBlock.list',{path:{document_id:'doc'}});
 assert.equal(requests,1);assert.equal(r.diagnostic.httpStatus,200);assert.equal(r.diagnostic.outbound,true);assert.equal(r.diagnostic.feishuCode,0);
});

test('a successful SDK read plus direct denial is a path difference, not an overall resource ACL diagnosis',async()=>{
 const f=fixture();f.setFetchError({response:{status:403,data:{code:1770032}}});
 const r=await f.reader.diagnose(url,f.guard);assert.equal(r.A.status,'success');assert.equal(r.classification,'api_path_difference');
});
test('SDK timeout aborts the actual transport, without retrying',async()=>{
 const f=fixture(),transport=new Feishu({feishu:{appId:'fixture',appSecret:'fixture'}});let requests=0,aborted=0;
 transport.client.httpInstance.defaults.adapter=config=>new Promise((resolve,reject)=>{requests++;config.signal.addEventListener('abort',()=>{aborted++;reject({code:'ERR_CANCELED'});},{once:true});});
 const reader=new OwnerOfficeReader(transport,f.oauth,{timeoutMs:30});
 await assert.rejects(reader.session(f.guard).call('docx.v1.documentBlock.list',{path:{document_id:'doc'}}),e=>e.readCode==='timeout'&&e.diagnostic.outbound&&e.diagnostic.httpStatus===null);
 assert.equal(requests,1);assert.equal(aborted,1);
});

test('five Wiki resources use flat independent lease guards, not exponential source validation',async()=>{
 const f=fixture();let checks=0;const guard=ownerReadGuard(()=>{},()=>{checks++;return {text:'读取 token wiki'};});
 const r=await f.reader.resources(Array(5).fill('https://example.feishu.cn/wiki/wiki'),guard);
 assert.equal(r.results.length,5);assert.ok(r.results.every(x=>x.status==='success'));assert.equal(f.counts().leases,15);
 assert.ok(checks<10000,`source checks must stay bounded: ${checks}`);
});
