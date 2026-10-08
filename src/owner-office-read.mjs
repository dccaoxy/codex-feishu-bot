import {readTarget,readAuthority} from './owner-read-permit.mjs';
import {withUserAccessToken} from '@larksuiteoapi/node-sdk';
import {officeDefinition,validateOffice} from './office-schema.mjs';
import {OWNER_READ_APIS,readError,classifyReadError,OwnerReadError} from './owner-office-read-policy.mjs';
import {readDeadline,directDocx,compareReadDiagnostics} from './owner-read-diagnostics.mjs';
export const OWNER_READ_GUARD=Symbol('owner-read-guard');
function guarded(result,check){return Object.defineProperty(result,OWNER_READ_GUARD,{value:check});}
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v);
export function sheetRange(token,range){
 const m=typeof range==='string'&&/^[-a-zA-Z0-9_]{1,100}!([A-Z]{1,3})([1-9][0-9]{0,6}):([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(range);
 if(!id(token)||!m)throw readError('invalid_request');
 const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),rows=Number(m[4])-Number(m[2])+1,cols=col(m[3])-col(m[1])+1;
 if(rows<1||cols<1||rows*cols>5000)throw readError('invalid_request');
}
export function boundedRead(result,budget=22000){
 const {data,...rest}=result;
 for(const key of ['nextCursor','requestedCursor'])if(typeof rest[key]==='string'&&rest[key].length>Math.min(2000,Math.floor(budget/12))){rest[key]=null;rest.cursorUnavailable=true;}
 const safe={...rest,data};
 if(Buffer.byteLength(JSON.stringify(safe))<=budget)return guarded({...safe,untrustedData:true},result[OWNER_READ_GUARD]||(()=>{}));
 // Preserve continuation outside the preview. Never claim the truncated page is complete.
 const preview=JSON.stringify(data??null).slice(0,Math.floor(budget/12));
 return guarded({...rest,preview,truncated:true,untrustedData:true,note:'结果超过预算，当前页不完整；缩小page_size或明确范围后重读当前页，不要跳过未返回内容。'},result[OWNER_READ_GUARD]||(()=>{}));
}
function pagination(data,payload){
 const more=data?.has_more===true;
 return {hasMore:more,nextCursor:more&&typeof(data?.page_token??data?.next_page_token)==='string'?(data.page_token??data.next_page_token):null,...(typeof payload?.params?.page_token==='string'?{requestedCursor:payload.params.page_token}:{})};
}
// Constructed only in the Owner Bot; never given to Group Assistant / Knowledge.
export class OwnerOfficeReader{
 constructor(feishu,oauth,{timeoutMs=15000,fetcher=fetch}={}){this.feishu=feishu;this.oauth=oauth;this.timeoutMs=timeoutMs;this.fetcher=fetcher;}
 collection(guard,offset=0){
  const authority=readAuthority(guard),check=()=>{authority.check();authority.collectionPage(offset);};
  const page=authority.collectionPage(offset);check();return guarded({...page,untrustedData:true},check);
 }
 session(guard,{direct=false}={}){
  if(typeof guard!=='function')throw readError('api_not_allowed');
  const authority=readAuthority(guard);
  const checks=[authority.check],check=()=>{guard();for(const c of checks)c();};
  return {check,call:async(api,input,directCall=direct)=>{
   const diagnostic={api,identity:'owner-user',scope:'not_checked',httpStatus:null,feishuCode:null,stage:'permit',outbound:false};
   return readDeadline(async(wait,active,signal)=>{
   check();const permit=authority.authorize(api,input);checks.push(permit);diagnostic.sources=authority.sources(permit);diagnostic.stage='api';const rule=OWNER_READ_APIS[api];if(!rule)throw readError('api_not_allowed');
   if(!this.oauth?.enabled(api))throw readError('api_not_allowed');
   let payload,fn;
   if(api==='feishu_office_sheet_read'){
    if(!input||Object.keys(input).some(k=>!['spreadsheetToken','range'].includes(k)))throw readError('invalid_request');
    sheetRange(input.spreadsheetToken,input.range);payload=structuredClone(input);
    fn=options=>this.feishu.client.request({url:`/open-apis/sheets/v2/spreadsheets/${payload.spreadsheetToken}/values/${encodeURIComponent(payload.range)}`,method:'GET'},options);
   }else if(api==='feishu_office_drive_search'){
    if(!input||Object.keys(input).some(k=>!['query','offset','count'].includes(k))||typeof input.query!=='string'||!input.query.trim()||input.query.length>200)throw readError('invalid_request');
    const {offset=0,count=20}=input;if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||offset<0||count<1||count>50||offset+count>=200)throw readError('invalid_request');
    payload={search_key:input.query,count,offset};
    fn=options=>this.feishu.client.request({url:'/open-apis/suite/docs-api/search/object',method:'POST',data:payload},options);
   }else{
    const t=officeDefinition(api);if(!t.tokens.includes('user'))throw readError('user_identity_unsupported');
    payload=validateOffice(t,input);
    if(payload.params?.user_id_type && payload.params.user_id_type!=='open_id')throw readError('invalid_request');
    if(rule.page){payload.params??={};payload.params.page_size??=20;if(!Number.isSafeInteger(payload.params.page_size)||payload.params.page_size<1||payload.params.page_size>50)throw readError('invalid_request');}
    if(payload.params?.page_token!==undefined&&(typeof payload.params.page_token!=='string'||payload.params.page_token.length>2000))throw readError('invalid_request');
    // Feishu ignores pagination at Drive root; require a concrete folder for a bounded listing.
    if(api==='drive.v1.file.list'&&!id(payload.params?.folder_token))throw readError('invalid_request');
    if(api==='drive.v1.meta.batchQuery'){
     if(!payload.data.request_docs.length||payload.data.request_docs.length>20||payload.data.request_docs.some(d=>!id(d.doc_token)))throw readError('invalid_request');
    }
    const parts=t.sdkName.split('.');let parent=this.feishu.client;for(const k of parts.slice(0,-1))parent=parent?.[k];
    const method=parent?.[parts.at(-1)];if(typeof method!=='function')throw readError('user_identity_unsupported');
    fn=options=>method.call(parent,payload,options);
   }
   if(directCall){fn=token=>directDocx(api,payload,token,this.fetcher,signal,diagnostic);}
   let lease;diagnostic.stage='scope_token';
   const previous=checks.slice(),leaseGuard=()=>{guard();for(const c of previous)c();};
   try{lease=await wait(this.oauth.lease(api,leaseGuard,rule.scopes));}catch(e){check();throw e instanceof OwnerReadError?e:readError('reauthorization_required');}
   checks.push(lease.check);check();active();diagnostic.scope='granted';diagnostic.stage='queue';
   let data;
   try{
    data=await wait(this.feishu.call(async()=>{
     check();active();diagnostic.stage='token';let token;
     try{token=await wait(lease.access());}catch(e){check();throw e instanceof OwnerReadError?e:readError('reauthorization_required');}
     check();active();diagnostic.stage='request';
     const send=()=>fn(directCall?token:withUserAccessToken(token));
     return wait(!directCall&&this.feishu.observeRead?this.feishu.observeRead(diagnostic,()=>{check();active();},signal,send):send());
    },false,()=>{check();active();}));check();active();diagnostic.stage='response';
   }catch(e){check();throw e;}
   if(api==='wiki.v2.space.getNode')authority.resolveWiki(data,permit);
   return guarded({data,sources:authority.sources(permit),diagnostic:{...diagnostic},...(api==='drive.v1.meta.batchQuery'?{partial:Boolean(data?.failed_list?.length)}:{}),identity:'owner-user',...pagination(data,payload),...(api==='feishu_office_drive_search'?{nextOffset:data?.has_more&&payload.offset+payload.count<199?payload.offset+payload.count:null}:{} )},check);
   },this.timeoutMs,diagnostic,check);
  }};
 }
 async diagnose(url,guard){
  if(typeof url!=='string'||url.length>1000)throw readError('invalid_request');
  const target=readTarget(url);if(!target||!['docx','wiki'].includes(target.type))throw readError('unsupported_resource');
  const session=this.session(guard);session.check();let documentId=target.value,wiki;
  if(target.type==='wiki'){
   try{const r=await session.call('wiki.v2.space.getNode',{params:{token:target.value}});
    wiki={node:target.value,objType:['docx','doc','sheet','bitable','file'].includes(r.data?.node?.obj_type)?r.data.node.obj_type:'unsupported',objToken:id(r.data?.node?.obj_token)?r.data.node.obj_token:null,diagnostic:r.diagnostic};
    if(wiki.objType!=='docx'||!id(wiki.objToken))return guarded({url,wiki,reason:'unsupported_resource',untrustedData:true},session.check);
    documentId=wiki.objToken;
   }catch(e){session.check();const error=classifyReadError(e);return guarded({url,reason:error.readCode,diagnostic:error.diagnostic,untrustedData:true},session.check);}
  }
  const payload={path:{document_id:documentId},params:{page_size:20}},arms=[];
  // Use the same authority instance for derived Wiki grants outside collections.
  for(const direct of [false,true]){
   try{const r=await session.call('docx.v1.documentBlock.list',payload,direct);arms.push({status:'success',...r.diagnostic});}
   catch(e){session.check();const error=classifyReadError(e);arms.push({status:'failed',reason:error.readCode,...error.diagnostic});}
  }
  session.check();return guarded({url,documentId,wiki,A:arms[0],B:arms[1],classification:compareReadDiagnostics(...arms),untrustedData:true,note:'A为当前SDK读取路径，B为同ID的官方blocks直接只读请求；均受当前Owner目标、scope和生命周期约束。未返回或记录正文；不自动重试或切换tenant。'},session.check);
 }
 async resources(urls,guard){
  if(!Array.isArray(urls)||!urls.length||urls.length>5)throw readError('invalid_request');
  const session=this.session(guard),results=[];
  for(let i=0;i<urls.length;i++){
   session.check();let metadata,resourceType,resourceId;const diagnostics=[];
   try{
    if(typeof urls[i]!=='string'||urls[i].length>1000)throw readError('invalid_request');
    const u=new URL(urls[i]);if(u.protocol!=='https:'||!/(^|\.)feishu\.cn$/.test(u.hostname)||u.username||u.password||u.port)throw readError('unsupported_resource');
    const m=/^\/(docx|wiki|sheets|base|file|drive\/folder)\/([a-zA-Z0-9_-]+)\/?$/.exec(u.pathname);
    if(!m)throw readError('unsupported_resource');let type=m[1],token=m[2];
    if(type==='wiki'){
     const r=await session.call('wiki.v2.space.getNode',{params:{token}});metadata=r.data;diagnostics.push(r.diagnostic);
     type=r.data?.node?.obj_type;token=r.data?.node?.obj_token;
     if(!id(token))throw readError('unsupported_resource');
    }
    resourceType=type;resourceId=token;let read;
    if(type==='docx'){
     const meta=await session.call('docx.v1.document.get',{path:{document_id:token}});metadata={...metadata,document:meta.data.document};diagnostics.push(meta.diagnostic);
     read=await session.call('docx.v1.documentBlock.list',{path:{document_id:token},params:{page_size:20,document_revision_id:meta.data.document.revision_id}});
    }else if(['sheet','sheets'].includes(type))read=await session.call('sheets.v3.spreadsheet.get',{path:{spreadsheet_token:token}});
    else if(['bitable','base'].includes(type)){
     if(u.searchParams.has('form'))throw readError('api_not_exposed'); // Share-form tokens are not table/view identifiers.
     read=await session.call('bitable.v1.app.get',{path:{app_token:token}});
    }else if(['file','drive/folder'].includes(type)){
     read=await session.call('drive.v1.meta.batchQuery',{data:{request_docs:[{doc_token:token,doc_type:type==='file'?'file':'folder'}]}});
     if(read.data?.failed_list?.length)throw classifyReadError({feishuCode:read.data.failed_list[0].code});
     if(!read.data?.metas?.some(m=>m.doc_token===token||m.request_doc_info?.doc_token===token))throw readError('unknown');
    }
    else throw readError('unsupported_resource');
    const metadataOnly=type!=='docx',content=boundedRead({...read,data:{metadata,content:read.data}},3500);
    results.push({index:i,url:urls[i],resourceId,status:'success',resourceType:type,metadataOnly,completion:content.truncated?'output_truncated':read.hasMore?'page_pending':metadataOnly?'metadata_only':'complete',diagnostics:[...diagnostics,read.diagnostic],...content});
   }catch(e){session.check();const error=classifyReadError(e);results.push({index:i,url:urls[i],resourceType,resourceId,status:'failed',completion:'incomplete',diagnostics:[...diagnostics,...(error.diagnostic?[error.diagnostic]:[])],reason:error.readCode,message:error.message,...(metadata?{metadataOnly:true,...boundedRead({data:metadata},1800)}:{})});}
  }
  session.check();return guarded({results,untrustedData:true,note:'仅本次指定资源；元数据/截断结果不代表已读正文。表格须明确range，多维表格须指定table并分页；未知表单不猜测。'},session.check);
 }
}
