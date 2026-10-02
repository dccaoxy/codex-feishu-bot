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
for(const text of ['读取 range tab!A1:A1 spreadsheet_token s','读取 document_id doc range tab!A1:A1','读取 app_token base view_id v table_id t','读取 app_token base table_id t table_id u','读取 spreadsheet_token s range tab!A1:A1 range tab!B1:B1'])test(`R2 ambiguous or incompatible grouping refuses ${text}`,()=>{assert.throws(()=>permit(text),/target_not_authorized/);});
for(const [text,api,p] of [
 ['读取 document_id doc block_id b','docx.v1.document.rawContent',{path:{document_id:'doc'}}],
 ['读取 app_token base table_id t view_id v','bitable.v1.appTableRecord.list',{path:{app_token:'base',table_id:'t'}}],
 ['读取 spreadsheet_token s sheet_id a, spreadsheet_token s range b!B2:B2','feishu_office_sheet_read',{spreadsheetToken:'s',range:'a!B2:B2'}],
 ['读取 space_id a parent_node_token x, space_id b parent_node_token y','wiki.v2.spaceNode.list',{path:{space_id:'a'},params:{parent_node_token:'y'}}],
])test(`R2 cannot omit constraints or recombine same-root grants ${api}`,()=>{assert.throws(()=>permit(text).authorize(api,p),/target_not_authorized/);});
test('R2 explicit repeated same root preserves independent full tuples',()=>{
 const a=permit('读取 app_token base table_id t view_id v, app_token base table_id u view_id w');
 for(const [table,view,ok] of [['t','v',true],['u','w',true],['t','w',false],['u','v',false]]){const f=()=>a.authorize('bitable.v1.appTableView.get',{path:{app_token:'base',table_id:table,view_id:view}});if(ok)assert.doesNotThrow(f);else assert.throws(f);}
});

function collectionFixture(grants){
 let live=true;const source={text:'读取新羽群里的所有飞书文档'},collection={grants,check(){if(!live)throw Error('collection revoked');},page(){return {total:grants.length};}};
 return {collection,source,revoke(){live=false;},authority:()=>readAuthority(ownerReadGuard(()=>{},()=>source,collection))};
}
const cg=(root,values,extra={})=>({root,values,check(){},provenance:{chat:'groupA',messageId:'source',resourceType:'docx',resourceId:values[root]},...extra});
test('collection uses exact roots without accepting body references or unrelated resources',()=>{
 const f=collectionFixture([cg('document_id',{document_id:'doc123'})]),a=f.authority();
 assert.doesNotThrow(()=>a.authorize('docx.v1.document.get',{path:{document_id:'doc123'}}));
 for(const id of ['doc','bodyLink','otherGroup'])assert.throws(()=>a.authorize('docx.v1.document.get',{path:{document_id:id}}),/target_not_authorized/);
});
test('collection source is bound at call time, duplicate live origin cannot replace a recalled pending origin',()=>{
 let one=true;const f=collectionFixture([cg('document_id',{document_id:'doc'},{check(){if(!one)throw Error('source recalled');}}),cg('document_id',{document_id:'doc'})]);
 const a=f.authority(),pending=a.authorize('docx.v1.document.get',{path:{document_id:'doc'}});one=false;
 assert.throws(pending,/recalled/);assert.doesNotThrow(()=>f.authority().authorize('docx.v1.document.get',{path:{document_id:'doc'}}));
});
test('collection recalls do not invalidate unrelated resource calls; global revocation does',()=>{
 let live=true;const f=collectionFixture([cg('document_id',{document_id:'a'},{check(){if(!live)throw Error('recalled');}}),cg('document_id',{document_id:'b'})]);
 const a=f.authority(),keep=a.authorize('docx.v1.document.get',{path:{document_id:'b'}});live=false;
 assert.doesNotThrow(keep);assert.throws(()=>a.authorize('docx.v1.document.get',{path:{document_id:'a'}}));f.revoke();assert.throws(keep);
});
test('collection blocks folder discovery, global searches and Wiki space enumeration',()=>{
 const f=collectionFixture([cg('folder_token',{folder_token:'folder'}),cg('token',{token:'wiki'}),cg('space_id',{space_id:'space'})]),a=f.authority();
 for(const [api,p] of [
  ['drive.v1.file.list',{params:{folder_token:'folder'}}],['feishu_office_drive_search',{query:'private'}],
  ['wiki.v2.space.list',{}],['wiki.v2.space.get',{path:{space_id:'space'}}],['wiki.v2.spaceNode.list',{path:{space_id:'space'}}]
 ])assert.throws(()=>a.authorize(api,p),/target_not_authorized/);
 assert.doesNotThrow(()=>a.authorize('drive.v1.meta.batchQuery',{data:{request_docs:[{doc_token:'folder',doc_type:'folder'}]}}));
});
test('collection full tuples cannot combine Base tables/views or Sheet ranges',()=>{
 const f=collectionFixture([cg('app_token',{app_token:'a',table_id:'ta',view_id:'va'}),cg('app_token',{app_token:'b',table_id:'tb',view_id:'vb'}),cg('spreadsheet_token',{spreadsheet_token:'sa',range:'a!A1:A2'}),cg('spreadsheet_token',{spreadsheet_token:'sb',range:'b!B1:B2'})]),a=f.authority();
 for(const base of ['a','b'])for(const table of ['a','b'])for(const view of ['a','b']){
  const call=()=>a.authorize('bitable.v1.appTableRecord.list',{path:{app_token:base,table_id:'t'+table},params:{view_id:'v'+view}});
  if(base===table&&table===view)assert.doesNotThrow(call);else assert.throws(call,/target_not_authorized/);
 }
 for(const sheet of ['a','b'])for(const range of ['a','b']){
  const call=()=>a.authorize('feishu_office_sheet_read',{spreadsheetToken:'s'+sheet,range:range==='a'?'a!A1:A2':'b!B1:B2'});
  if(sheet===range)assert.doesNotThrow(call);else assert.throws(call,/target_not_authorized/);
 }
});
test('collection Wiki mapping is exact, root-local, shared across tools and revoked with its origin',()=>{
 let live=true;const f=collectionFixture([cg('token',{token:'wiki'},{wikiSelectors:{table_id:'table',view_id:'view'},check(){if(!live)throw Error('recalled');}})]),a=f.authority();
 const p=a.authorize('wiki.v2.space.getNode',{params:{token:'wiki'}});
 assert.throws(()=>a.resolveWiki({node:{obj_type:'bitable',obj_token:'base'}},()=>{}),/target_not_authorized/);
 a.resolveWiki({node:{node_token:'wiki',obj_type:'bitable',obj_token:'base'}},p);
 const b=f.authority(),valid=b.authorize('bitable.v1.appTableRecord.list',{path:{app_token:'base',table_id:'table'},params:{view_id:'view'}});
 for(const payload of [{path:{app_token:'other',table_id:'table'},params:{view_id:'view'}},{path:{app_token:'base',table_id:'table'}},{path:{app_token:'base',table_id:'other'},params:{view_id:'view'}}])assert.throws(()=>b.authorize('bitable.v1.appTableRecord.list',payload));
 live=false;assert.throws(valid,/recalled/);assert.throws(()=>f.authority().authorize('bitable.v1.app.get',{path:{app_token:'base'}}));
});
test('collection Wiki mismatched response or incompatible selectors cannot mint a broader grant',()=>{
 const f=collectionFixture([cg('token',{token:'wiki'},{wikiSelectors:{table_id:'t'}})]),a=f.authority(),p=a.authorize('wiki.v2.space.getNode',{params:{token:'wiki'}});
 assert.throws(()=>a.resolveWiki({node:{node_token:'other',obj_type:'bitable',obj_token:'base'}},p));
 a.resolveWiki({node:{node_token:'wiki',obj_type:'docx',obj_token:'doc'}},p);
 assert.throws(()=>a.authorize('docx.v1.document.get',{path:{document_id:'doc'}}));
});
