import { randomUUID } from 'node:crypto';

// Reuse PR #19's keyspace: one authority, never infer trust from titles or links.
export function exactDocumentId(id) { return typeof id==='string' && /^[a-zA-Z0-9]{1,300}$/.test(id); }
const updates=new Set(['update_text_elements','update_text_style','update_text','update_table_property','insert_table_row','insert_table_column','delete_table_rows','delete_table_columns','merge_table_cells','unmerge_table_cells']);
export function contentDocument(proposal) {
 const {api,payload:p}=proposal??{};if(!p)return null;
 if(['feishu_doc_append','feishu_doc_update_text','feishu_doc_format_text'].includes(api))return exactDocumentId(p.documentId)?p.documentId:null;
 const id=p.path?.document_id;if(!exactDocumentId(id))return null;
 if(['docx.v1.documentBlockChildren.create','docx.v1.documentBlockDescendant.create','docx.v1.documentBlockChildren.batchDelete'].includes(api))return id;
 const valid=o=>o&&Object.keys(o).some(k=>updates.has(k))&&Object.keys(o).every(k=>k==='block_id'||updates.has(k));
 if(api==='docx.v1.documentBlock.patch'&&valid(p.data))return id;
 if(api==='docx.v1.documentBlock.batchUpdate'&&p.data?.requests?.length&&p.data.requests.every(valid))return id;
 return null;
}
// Ambiguous/read-only/quoted instructions fall back to the ordinary confirmation.
export function currentContentRequest(sources) {
 const text=sources.map(raw=>{
  const value=JSON.parse(raw).content?.text;return typeof value==='string'?value.replace(/```[\s\S]*?```/g,'').replace(/^\s*>.*$/gm,'').replace(/[“「][\s\S]*?[”」]/g,'').replace(/"[^"]*"/g,''):'';
 }).join('\n');
 if(/不要|勿|仅查询|只读|如何|怎么|能否|是否|总结|分析|解释|翻译|读取|查看|转述|引用|原文|[?？]|吗|can you|how to|do not|don't|\b(read|summarize|explain|quote|what|why)\b/i.test(text))return false;
 return /修改|编辑|追加|添加|补充|替换|删除|删掉|移除|去掉|标红|加粗|斜体|下划线|改成|改为|更新|写入|append|edit|update|replace|remove|delete|bold|underline|italic/i.test(text);
}
export class TrustedDocuments {
 constructor(store,identity){this.store=store;this.identity=identity;}
 scope(){
  const {app,owner}=this.identity();if(!app||!owner||!this.store.filename)return null;
  const principal=JSON.stringify([app,owner,this.store.filename]);
  let s;try{s=JSON.parse(this.store.get('trustedDocumentScope'));}catch{}
  if(s?.principal!==principal||typeof s.instance!=='string'||!s.instance){s={principal,instance:randomUUID()};this.store.set('trustedDocumentScope',JSON.stringify(s));}
  return {app,owner,instance:s.instance};
 }
 register(id,origin){
  if(!exactDocumentId(id)||!['bot_created','owner_trusted'].includes(origin))throw Error('可信文档登记参数无效');
  const scope=this.scope();if(!scope)throw Error('缺少应用或Owner身份，无法登记');
  const record={version:2,documentId:id,origin,trustedWrite:true,...scope,registeredAt:new Date().toISOString(),generation:randomUUID()};
  this.store.set('createdDoc:'+id,JSON.stringify(record));return record;
 }
 snapshot(id){
  if(!exactDocumentId(id))return null;const scope=this.scope();if(!scope)return null;
  const raw=this.store.get('createdDoc:'+id);let r;try{r=JSON.parse(raw);}catch{return null;}
  return r?.version===2&&r.documentId===id&&r.trustedWrite===true&&['bot_created','owner_trusted'].includes(r.origin)&&Object.entries(scope).every(([k,v])=>r[k]===v)?raw:null;
 }
 revoke(id){if(!exactDocumentId(id))throw Error('请提供精确文档ID');this.store.set('createdDoc:'+id,JSON.stringify({version:2,documentId:id,trustedWrite:false,revokedAt:new Date().toISOString()}));}
 list(){return this.store.db.prepare("SELECT key FROM settings WHERE key GLOB 'createdDoc:*' ORDER BY key").all().flatMap(({key})=>{const raw=this.snapshot(key.slice(11));return raw?[JSON.parse(raw)]:[];});}
}
