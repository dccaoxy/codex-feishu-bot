import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {Client} from '@larksuiteoapi/node-sdk';
import {Office,OFFICE_CATALOG,OFFICE_TOOLS,validateOffice,officeDefinition} from '../src/office.mjs';
import {TOOLS} from '../src/history.mjs';
const guard=()=>{};
function setup(){const calls=[],client={drive:{file:{list:async p=>{calls.push(p);return {files:['example']};}}},task:{v2:{task:{create:async p=>{calls.push(p);return {task:{guid:'id'}};}}}},request:async p=>{calls.push(p);return {valueRange:{values:[[1]]}};}};const f={client,call:async(fn,retry,g)=>{calls.push({retry});g();return fn();}};client.drive.v1={file:client.drive.file};return {o:new Office(f),f,calls};}
test('pinned catalogue schemas compile and SDK methods resolve; Owner registration contains all office functions',()=>{
 const ajv=new Ajv({strict:false});addFormats(ajv);const client=new Client({appId:'fixture',appSecret:'fixture'});
 assert.equal(OFFICE_CATALOG.length,219);assert.equal(new Set(OFFICE_CATALOG.map(t=>t.name)).size,219);
 for(const t of OFFICE_CATALOG){ajv.compile(t.schema);assert.equal(typeof t.sdkName.split('.').reduce((a,k)=>a?.[k],client),'function',t.name);assert.ok(t.tokens.length);}
 for(const t of OFFICE_TOOLS)assert.ok(TOOLS.some(x=>x.name===t.name));
});
test('catalogue and complete schema can be paged deterministically',async()=>{
 const {o}=setup(),all=[];let offset=0;do{const r=await o.execute('feishu_office_find',{offset},guard);all.push(...r.tools);offset=r.nextOffset;assert.ok(Buffer.byteLength(JSON.stringify(r))<24000);}while(offset!==null);
 assert.deepEqual(all.map(x=>x.name),OFFICE_CATALOG.map(x=>x.name));
 let text='';offset=0;do{const r=await o.execute('feishu_office_schema',{api:all[0].name,offset},guard);text+=r.schemaText;offset=r.nextOffset;assert.ok(Buffer.byteLength(JSON.stringify(r))<24000);}while(offset!==null);
 assert.deepEqual(JSON.parse(text),OFFICE_CATALOG[0].schema);
});
test('unknown APIs, user-only APIs and malformed or injected parameters cannot call transport',async()=>{
 const {o,calls}=setup();for(const a of [{api:'constructor',payload:{}},{api:OFFICE_CATALOG.find(x=>!x.tokens.includes('tenant')).name,payload:{}},{api:'drive.v1.file.list',payload:{url:'https://example.com',headers:{Authorization:'x'}}},{api:'drive.v1.file.list',payload:JSON.parse('{"__proto__":{"x":1}}')}])await assert.rejects(o.execute('feishu_office_call',a,guard));
 for(const value of ['../files','a/b','a?type=docx','%2e%2e','..','https://example.com'])assert.throws(()=>validateOffice(officeDefinition('docx.v1.document.get'),{path:{document_id:value}}));
 assert.equal(calls.length,0);
});
test('document mutation requires a concrete revision',()=>{
 for(const n of [-1,undefined])assert.throws(()=>validateOffice(officeDefinition('docx.v1.documentBlock.patch'),{path:{document_id:'doc',block_id:'block'},params:{document_revision_id:n},data:{update_text_elements:{elements:[{text_run:{content:'hi'}}]}}}));
});
test('read retries permitted; write retries disabled, with sanitized transport failures',async()=>{
 const {o,f,calls}=setup();await o.execute('feishu_office_call',{api:'drive.v1.file.list',payload:{}},guard);assert.equal(calls[0].retry,true);
 f.client.drive.file.list=async()=>{throw Error('credential-secret');};await assert.rejects(o.execute('feishu_office_call',{api:'drive.v1.file.list',payload:{}},guard),e=>!e.message.includes('credential-secret'));
 f.client.task={v2:{task:{create:async()=>{throw Error('credential-secret');}}}};
 await assert.rejects(o.execute('feishu_office_call',{api:'task.v2.task.create',payload:{data:{summary:'fixture'}}},guard));assert.equal(calls.at(-1).retry,false);
});
test('revocation in queue blocks transport and revocation in flight discards output',async()=>{
 for(const stage of ['queue','flight']){const {o,f,calls}=setup();let valid=true;const g=()=>{if(!valid)throw Error('revoked');};
 if(stage==='queue')f.call=async fn=>{valid=false;return fn();};else f.client.drive.file.list=async()=>{valid=false;return {private:'secret'};};
 await assert.rejects(o.execute('feishu_office_call',{api:'drive.v1.file.list',payload:{}},g),/revoked/);assert.ok(!calls.some(x=>x.params));}
});
test('oversize UTF8 output is explicitly partial and bounded',async()=>{const {o,f}=setup();f.client.drive.file.list=async()=>({text:'中'.repeat(50000)});const r=await o.execute('feishu_office_call',{api:'drive.v1.file.list',payload:{}},guard);assert.equal(r.truncated,true);assert.ok(Buffer.byteLength(JSON.stringify(r))<24000);assert.equal(r.data,undefined);});
test('sheet reads and writes use only fixed routes, exact range and no write retry',async()=>{
 const {o,calls}=setup();await o.execute('feishu_office_sheet_read',{spreadsheetToken:'sheet',range:'tab!A1:B2'},guard);assert.equal(calls[1].url,'/open-apis/sheets/v2/spreadsheets/sheet/values/tab!A1%3AB2');assert.equal(calls[0].retry,true);
 await o.execute('feishu_office_sheet_write',{spreadsheetToken:'sheet',range:'tab!A1:B2',values:[[1,'hi'],[null,true]]},guard);assert.equal(calls[2].retry,false);assert.equal(calls[3].method,'PUT');
 const before=calls.length;for(const a of [{spreadsheetToken:'../evil',range:'tab!A1:B2',values:[[1,2],[3,4]]},{spreadsheetToken:'sheet',range:'tab!A1:Z1000000',values:[]},{spreadsheetToken:'sheet',range:'tab!B2:A1',values:[]},{spreadsheetToken:'sheet',range:'tab!A1:B2',values:[[1]]}])await assert.rejects(o.execute('feishu_office_sheet_write',a,guard));assert.equal(calls.length,before);
});
test('the generated tenant executor never accepts identity overrides',()=>{for(const t of OFFICE_CATALOG)assert.equal(t.schema.properties?.useUAT,undefined);});
test('permission listing is compact, paginated, and separates granted identity from user login',async()=>{const {o,f}=setup();f.client.application={scope:{list:async()=>({scopes:Array.from({length:51},(_,i)=>({scope_name:'scope'+i,scope_type:i%2?'tenant':'user',grant_status:1,ignored:'hidden'}))})}};const a=await o.execute('feishu_office_permissions',{},guard),b=await o.execute('feishu_office_permissions',{offset:a.nextOffset},guard);assert.equal(a.scopes.length,50);assert.equal(b.scopes.length,1);assert.equal(b.nextOffset,null);assert.equal(a.scopes[0].identity,'user');assert.equal(a.scopes[0].ignored,undefined);});
