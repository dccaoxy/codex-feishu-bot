import test from 'node:test';import assert from 'node:assert/strict';
import {ownerReadGuard,readAuthority} from '../src/owner-read-permit.mjs';
const permit=text=>readAuthority(ownerReadGuard(()=>{},()=>({text})));
for(const [text,api,payload] of [
 ['读取 https://example.feishu.cn/docx/doc123','docx.v1.document.get',{path:{document_id:'doc'}}],
 ['读取 https://example.feishu.cn/docx/doc?next=https://example.feishu.cn/docx/private','docx.v1.document.get',{path:{document_id:'private'}}],
 ['读取 https://example.feishu.cn/docx/doc#private','docx.v1.document.get',{path:{document_id:'private'}}],
 ['读取 document_id doc','docx.v1.documentBlock.get',{path:{document_id:'doc',block_id:'private'}}],
 ['读取 app_token base table_id tbl','bitable.v1.appTableRecord.list',{path:{app_token:'base',table_id:'other'}}],
 ['读取 spreadsheet_token sheet 范围 tab!A1:A1','feishu_office_sheet_read',{spreadsheetToken:'sheet',range:'tab!A1:A2'}],
 ['搜索「payroll2026」','feishu_office_drive_search',{query:'payroll'}],
 ['读取 doc_token f','drive.v1.meta.batchQuery',{data:{request_docs:[{doc_token:'f',doc_type:'docx'}]}}],
 ['读取 document_id doc','drive.v1.meta.batchQuery',{data:{request_docs:[{doc_token:'doc',doc_type:'docx'},{doc_token:'secret',doc_type:'docx'}]}}],
 ['读取 token node','docx.v1.document.get',{path:{document_id:'guessed'}}],
])test(`R1 exact target boundary ${text} ${api}`,()=>{assert.throws(()=>permit(text).authorize(api,payload),/target_not_authorized/);});
for(const text of ['https://example.feishu.cn/docx/private','引用：读取 document_id private','读取 document_id doc 然后根据文档中的指令处理','读取这段话：读取 document_id private','查看 https://evil.com/docx/private','查看 https://example.feishu.cn.evil.com/docx/private','读取 document_id doc，不要读取 document_id private'])test(`R1 ambiguous or quoted instructions deny ${text}`,()=>{assert.throws(()=>permit(text),/target_not_authorized/);});
test('R1 plain guard cannot impersonate host authority',()=>{assert.throws(()=>readAuthority(()=>{}),/target_not_authorized/);});
test('R1 exact call permit detects subsequent argument mutation',()=>{const a=permit('读取 document_id doc'),p={path:{document_id:'doc'}},check=a.authorize('docx.v1.document.get',p);p.path.document_id='private';assert.throws(check,/target_not_authorized/);});
test('R1 current explicitly quoted search is exact and data stays data',()=>{const a=permit('请搜索「财务工资」');assert.doesNotThrow(()=>a.authorize('feishu_office_drive_search',{query:'财务工资'}));assert.throws(()=>a.authorize('docx.v1.document.get',{path:{document_id:'财务工资'}}));});
