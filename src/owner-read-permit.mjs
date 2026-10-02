// Host-only authority. Neither model arguments nor tool results can mint it.
import {readError} from './owner-office-read-policy.mjs';
const authorities=new WeakMap();
const collectionDerived=new WeakMap();
const deny=()=>{throw readError('target_not_authorized');};
const children={document_id:['block_id'],spreadsheet_token:['sheet_id','range'],app_token:['table_id','view_id','record_id','form_id'],space_id:['parent_node_token'],token:[],folder_token:[],doc_token:[]};
const types={docx:'document_id',wiki:'token',sheets:'spreadsheet_token',base:'app_token',file:'doc_token','drive/folder':'folder_token'};
export function readTarget(url){
 let u;try{u=new URL(url);}catch{return null;}
 if(u.protocol!=='https:'||!/(^|\.)feishu\.cn$/.test(u.hostname)||u.username||u.password||u.port)return null;
 const m=/^\/(docx|wiki|sheets|base|file|drive\/folder)\/([a-zA-Z0-9_-]{1,200})\/?$/.exec(u.pathname);
 return m?{key:types[m[1]],value:m[2],type:m[1]}:null;
}
// Intentionally narrow, deterministic parsing. Ambiguous prose asks for a target,
// never falls back to an LLM or turns a quoted/history/document link into consent.
function parse(text){
 if(typeof text!=='string'||text.length>6000||/[\n\r`<>]/.test(text))return null;
 text=text.trim().replace(/^(?:请|麻烦|帮我|请帮我)\s*/u,'');
 const search=/^(?:搜索|检索|search)\s*(?:云文档\s*)?[「“"]([^」”"\n]{1,200})[」”"]\s*[。.!！]?$/iu.exec(text);
 if(search)return {query:search[1],grants:[]};
 if(/^(?:列出|查看|list)\s*(?:我可访问的)?(?:知识库|wiki spaces)\s*[。.!！]?$/iu.test(text))return {spaces:true,grants:[]};
 const head=/^(?:读取|查看|读一下|read)\s*(?:(?:文档|电子表格|多维表格|文件夹|文件|知识库)\s*)?/iu.exec(text);
 if(!head)return null;
 let rest=text.slice(head[0].length).trim().replace(/[。.!！]$/u,'').trim();const grants=[];let current;
 // Explicit targets and named subresources only; reject all unparsed prose.
 while(rest){
  rest=rest.replace(/^[\s,，、;；]+/u,'');if(!rest)break;
  const url=/^https:\/\/[^\s,，、;；]+/u.exec(rest);
  if(url){const target=readTarget(url[0]);if(!target)return null;current={root:target.key,values:{[target.key]:target.value}};grants.push(current);rest=rest.slice(url[0].length);continue;}
  const field=/^(document_id|spreadsheet_token|app_token|folder_token|doc_token|space_id|token|block_id|sheet_id|table_id|view_id|record_id|form_id|parent_node_token|range|范围)\s*[:=：]?\s*([a-zA-Z0-9_!:-]+)(?=$|[\s,，、;；])/u.exec(rest);
  if(!field)return null;
  const key=field[1]==='范围'?'range':field[1],value=field[2];
  if(Object.hasOwn(children,key)){current={root:key,values:{[key]:value}};grants.push(current);}
  else {
   if(!current||!children[current.root].includes(key)||Object.hasOwn(current.values,key))return null;
   if(['view_id','record_id','form_id'].includes(key)&&!current.values.table_id)return null;
   current.values[key]=value;
  }
  rest=rest.slice(field[0].length);
 }
 return grants.length?{grants}:null;
}
// getSource must return trusted current inbox text, never a model supplied summary.
// Its complete snapshot includes source IDs, actor, payload and cancellation state.
export function ownerReadGuard(guard,getSource,collection=null){
 guard();const original=getSource(),snapshot=JSON.stringify(original),intent=parse(original.text);
 const check=()=>{guard();if(JSON.stringify(getSource())!==snapshot)deny();collection?.check();};
 check();authorities.set(check,{intent:collection?{grants:collection.grants}:intent,check,collection});return check;
}
export function readAuthority(guard){
 const authority=authorities.get(guard);if(!authority)deny();authority.check();
 const intent=authority.intent;if(!intent)deny();
 const collection=authority.collection;
 if(collection&&!collectionDerived.has(collection))collectionDerived.set(collection,[]);
 const derived=collection?collectionDerived.get(collection):[];
 const calls=new WeakMap();
 const match=(root,selectors,metadata=false)=>{
  for(const g of [...intent.grants,...derived])if(g.root===root&&
   Object.entries(selectors).every(([key,value])=>typeof value==='string'&&g.values[key]===value)&&
   (metadata||Object.keys(g.values).every(key=>Object.hasOwn(selectors,key)))){
    // A repeated URL can have several independent source messages. Bind this
    // call to one still-live source; never swap it after the call has started.
    try{g.check?.();return g;}catch{}
   }
  return null;
 };
 function authorize(api,p){
  authority.check();let ok=false;const used=[];
  const select=(...args)=>{const g=match(...args);if(g)used.push(g);return Boolean(g);};
  // A folder/node in the mirror is not permission to discover further roots.
  if(collection&&['drive.v1.file.list','feishu_office_drive_search','wiki.v2.space.list','wiki.v2.space.get','wiki.v2.spaceNode.list'].includes(api))deny();
  if(api==='feishu_office_drive_search')ok=intent.query===p.query;
  else if(api==='feishu_office_sheet_read')ok=select('spreadsheet_token',{spreadsheet_token:p.spreadsheetToken,range:p.range});
  else if(api==='wiki.v2.space.list')ok=intent.spaces===true;
  else if(api==='drive.v1.meta.batchQuery')ok=Array.isArray(p.data?.request_docs)&&p.data.request_docs.length>0&&p.data.request_docs.every(d=>{
   const root={file:'doc_token',folder:'folder_token',docx:'document_id',sheet:'spreadsheet_token',bitable:'app_token'}[d.doc_type];
   return root&&select(root,{[root]:d.doc_token},true);
  });
  else {
   const root=api.startsWith('docx.')?'document_id':api.startsWith('sheets.')?'spreadsheet_token':api.startsWith('bitable.')?'app_token':api==='wiki.v2.space.getNode'?'token':api.startsWith('wiki.')?'space_id':api==='drive.v1.file.list'?'folder_token':null;
   const selectors={};
   for(const [key,value] of Object.entries({...p.path,...p.params}))if((key===root||/(?:_id|_token)$/.test(key))&&!['page_token','document_revision_id'].includes(key))selectors[key]=value;
   const metadata=['docx.v1.document.get','sheets.v3.spreadsheet.get','bitable.v1.app.get','wiki.v2.space.get'].includes(api);
   ok=Boolean(root&&Object.hasOwn(selectors,root)&&select(root,selectors,metadata));
  }
  if(!ok)deny();
  // One immutable call permit, rechecked at every wait and before delivery.
  const serialized=JSON.stringify(p),permit=()=>{authority.check();for(const g of used)g.check?.();if(JSON.stringify(p)!==serialized)deny();};
  calls.set(permit,{api,used});permit();return permit;
 }
 return {check:authority.check,authorize,collectionPage(offset){
  authority.check();if(!collection)deny();return collection.page(offset);
 },resolveWiki(data,permit){
  authority.check();const call=calls.get(permit);if(call?.api!=='wiki.v2.space.getNode')deny();permit();
  const n=data?.node,key={docx:'document_id',sheet:'spreadsheet_token',bitable:'app_token',file:'doc_token'}[n?.obj_type];
  if(!key||!/^[a-zA-Z0-9_-]{1,200}$/.test(n.obj_token))return;
  for(const source of call.used){
   const extra=source.wikiSelectors||{};
   if(Object.keys(extra).some(k=>!children[key].includes(k)))continue;
   if(n.node_token!==undefined&&n.node_token!==source.values.token)deny();
   const values={[key]:n.obj_token,...extra};
   // Only this exact node response can map its canonical object. No response
   // body, secondary link or unrelated resource can mint a new grant.
   if(!derived.some(g=>g.origin===source&&JSON.stringify(g.values)===JSON.stringify(values))){
    if(derived.length>=2000)deny();
    derived.push({root:key,values,origin:source,check:source.check,provenance:source.provenance?{...source.provenance,viaWiki:source.values.token,resourceType:n.obj_type,resourceId:n.obj_token}:undefined});
   }
  }
 }};
}
