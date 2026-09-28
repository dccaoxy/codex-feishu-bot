import test from 'node:test';
import assert from 'node:assert/strict';
import {Documents,documentId} from '../src/documents.mjs';
function setup(){
 const calls=[];
 const method=(name,result)=>async payload=>{calls.push({name,payload});return structuredClone(result);};
 const feishu={call:async(fn,retry)=>{calls.push({retry});return fn();},client:{docx:{document:{convert:method('convert',{first_level_block_ids:['table'],blocks:[{block_id:'table',block_type:31,table:{property:{merge_info:[],row_size:1,column_size:1}}}]}),create:method('create',{document:{document_id:'doc1'}})},documentBlockDescendant:{create:method('insert',{document_revision_id:2})}},drive:{permissionMember:{create:method('share',{})}}}};
 return {d:new Documents(feishu,()=> 'owner'),feishu,calls};
}
test('create strips read-only table data and shares only to owner without notification',async()=>{
 const {d,calls}=setup(); const r=await d.execute('feishu_doc_create',{title:'标题',content:'|a|'});
 assert.equal(r.contentWritten,true);assert.equal(r.ownerCanEdit,true);
 assert.equal(calls.find(c=>c.name==='insert').payload.data.descendants[0].table.property.merge_info,undefined);
 assert.equal(calls.find(c=>c.name==='share').payload.data.member_id,'owner');
 assert.equal(calls.find(c=>c.name==='share').payload.params.need_notification,false);
 assert.equal(calls.filter(c=>c.retry===false).length,3);
});
test('partial create retains document ID and accurately reports write or sharing failures',async()=>{
 const {d,feishu}=setup();feishu.client.docx.documentBlockDescendant.create=async()=>{throw new Error('write failure');};
 feishu.client.drive.permissionMember.create=async()=>{throw new Error('share failure');};
 const r=await d.execute('feishu_doc_create',{title:'标题',content:'text'});
 assert.equal(r.documentId,'doc1');assert.equal(r.contentWritten,false);assert.equal(r.ownerCanEdit,false);
 assert.match(r.contentError,/write failure/);assert.match(r.permissionError,/share failure/);
});
test('images reject before document creation, and only docx links accepted',async()=>{
 const {d,feishu,calls}=setup();feishu.client.docx.document.convert=async()=>({blocks:[{block_type:27}],first_level_block_ids:['image']});
 await assert.rejects(d.execute('feishu_doc_create',{title:'图片',content:'image'}),/图片/);
 assert.ok(!calls.some(c=>c.name==='create'));
 assert.equal(documentId('https://example.feishu.cn/docx/abc123'),'abc123');
 assert.throws(()=>documentId('https://evil.example/docx/abc123'));
 assert.throws(()=>documentId('https://example.feishu.cn/wiki/abc123'));
});
function formatting(elements){let patch;const f={call:async(fn,retry,g)=>{g();return fn();},client:{docx:{document:{get:async()=>({document:{revision_id:2}})},documentBlock:{get:async()=>({block:{text:{elements}}}),patch:async p=>{patch=p;return {document_revision_id:3};}}}}};return {f,d:new Documents(f,()=> 'owner'),patch:()=>patch};}
const permit={check(){},consume(){}};
const formatArgs={documentId:'doc',blockId:'block',matchText:'姓名',revisionId:2,style:{bold:true,textColor:1}};
test('exact formatting spans runs, preserves original text, links, mentions and unrelated style',async()=>{
 const input=[{text_run:{content:'🙂姓',text_element_style:{italic:true,link:{url:'https://example.com'}}}},{text_run:{content:'名和姓名'}},{mention_user:{user_id:'fixture'}},{text_run:{content:''}}];
 const {d,patch}=formatting(input);const r=await d.execute('feishu_doc_format_text',formatArgs,()=>{},permit);assert.equal(r.matched,2);assert.equal(patch().params.document_revision_id,2);
 const es=patch().data.update_text_elements.elements;assert.equal(es.map(e=>e.text_run?.content??'@').join(''),'🙂姓名和姓名@');assert.equal(es[0].text_run.text_element_style.bold,undefined);assert.equal(es[1].text_run.text_element_style.bold,true);assert.equal(es[1].text_run.text_element_style.italic,true);assert.equal(es[1].text_run.text_element_style.link.url,'https://example.com');assert.deepEqual(es.at(-2),input[2]);assert.deepEqual(es.at(-1),input[3]);assert.equal(input[0].text_run.content,'🙂姓');
});
test('missing match, stale revision and invalid styles leave document untouched',async()=>{
 for(const a of [{...formatArgs,matchText:'不存在'},{...formatArgs,revisionId:1},{...formatArgs,style:{textColor:8}},{...formatArgs,style:{other:true}}]){const {d,patch}=formatting([{text_run:{content:'姓名'}}]);await assert.rejects(d.execute('feishu_doc_format_text',a,()=>{},permit));assert.equal(patch(),undefined);}
});
test('formatting revocation during block read prevents mutation',async()=>{const {d,f,patch}=formatting([]);let valid=true;f.client.docx.documentBlock.get=async()=>{valid=false;return {block:{text:{elements:[{text_run:{content:'姓名'}}]}}};};await assert.rejects(d.execute('feishu_doc_format_text',formatArgs,()=>{if(!valid)throw Error('revoked');},permit),/revoked/);assert.equal(patch(),undefined);});
