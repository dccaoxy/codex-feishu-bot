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
