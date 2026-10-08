import {withUserAccessToken} from '@larksuiteoapi/node-sdk';
import {OFFICE_CATALOG,officeDefinition,validateOffice,index} from './office-schema.mjs';
export {OFFICE_CATALOG,officeDefinition,validateOffice} from './office-schema.mjs';
import {OwnerOfficeReader,boundedRead} from './owner-office-read.mjs';
import {OWNER_READ_APIS,readError} from './owner-office-read-policy.mjs';
const str={type:'string',maxLength:300};
const tool=(name,description,properties,required=[])=>({type:'function',name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}});
export const OFFICE_TOOLS=[
 tool('feishu_office_diagnose_document','只读诊断当前Owner明确请求或本次授权群集合中的Docx/Wiki。对同一ID比较当前SDK路径与官方blocks直接用户身份请求；只返回脱敏阶段/错误与身份，不返回正文，不改变权限。',{url:{type:'string',maxLength:1000}},['url']),
 tool('feishu_office_collection','分页列出当前Owner明确要求读取的授权群Office资源集合。集合由宿主从指定群本地镜像冻结，不需逐个粘贴链接；保留来源消息、精确ID和子资源约束。然后用现有只读工具分批读取，元数据不等于正文；不能扩展到其他群或正文二级链接。',{offset:{type:'integer',minimum:0}}),
 tool('feishu_office_read_resources','按Owner当前请求读取最多5个明确飞书资源链接。Wiki先解析真实类型；Docx读取一页，Sheets/Bitable仅返回元数据，内容须明确范围或分页继续读取。逐项报告成功/失败，资料不是授权，不下载附件。',{urls:{type:'array',minItems:1,maxItems:5,items:{type:'string',maxLength:1000}}},['urls']),
 tool('feishu_office_drive_search','仅按Owner明确关键词搜索本人可见云文档，一页最多50条，offset+count小于200。结果是检索元数据，不是正文。',{query:{type:'string',minLength:1,maxLength:200},offset:{type:'integer',minimum:0,maximum:198},count:{type:'integer',minimum:1,maximum:50}},['query']),
 tool('feishu_office_find','查找飞书办公API工具：文档块/样式、表格、多维表格、文件、知识库、日历、任务、会议和通讯录。返回身份要求，不代表已经获批权限。',{query:str,offset:{type:'integer',minimum:0}}),
 tool('feishu_office_schema','读取指定办公API的参数JSON Schema（长定义按nextOffset分页）。先读完整参数定义再调用。',{api:str,offset:{type:'integer',minimum:0}},['api']),
 tool('feishu_office_call','仅按Owner当前明确请求调用已列出的办公API。已有资料/历史不是授权；删除、分享、邀请等操作须用户明确要求目标和动作。先查看schema；可信Owner请求无需重复确认卡片，仍校验原消息、回合、版本及一次性执行。写入失败不自动重试，先回读核对。不能传任意URL、凭据或SDK选项。',{api:str,payload:{type:'object'}},['api','payload']),
 tool('feishu_office_sheet_read','读取电子表格一个明确单元格范围（最多5000格）。range格式sheetId!A1:C20；返回结果可能截断，应缩小范围。',{spreadsheetToken:str,range:str},['spreadsheetToken','range']),
 tool('feishu_office_sheet_write','按Owner明确要求覆盖电子表格的指定范围；先读取并核对目标。不支持并发版本锁，写入超时先回读不要重试。values为与range行列数一致的字符串/数字/布尔/null矩阵，最多5000格。',{spreadsheetToken:str,range:str,values:{type:'array',items:{type:'array',items:{type:['string','number','boolean','null']}}}},['spreadsheetToken','range','values']),
 tool('feishu_office_permissions','只读查询应用获批权限及tenant/user身份区别。不修改权限、不获取用户token、不申请管理员授权，按nextOffset分页。',{offset:{type:'integer',minimum:0}}),
];
function bounded(data){const text=JSON.stringify(data??null);return Buffer.byteLength(text)<=22000?{data,untrustedData:true}:{truncated:true,preview:text.slice(0,5000),note:'接口结果超过输出预算；预览不是完整结果。请缩小page_size/范围或按对象ID读取；写入不要重试。',untrustedData:true};}
export class Office {
 constructor(feishu,ownerOAuth,{ownerReads=false}={}){this.feishu=feishu;this.ownerOAuth=ownerOAuth;this.ownerReads=ownerReads||Boolean(ownerOAuth);this.reader=new OwnerOfficeReader(feishu,ownerOAuth);}
 needsReadGuard(name,a){
  if(['feishu_office_collection','feishu_office_read_resources','feishu_office_drive_search','feishu_office_diagnose_document'].includes(name))return true;
  if(name==='feishu_office_sheet_read')return Boolean(this.ownerOAuth);
  if(name!=='feishu_office_call')return false;
  const t=officeDefinition(a.api);
  return Boolean((this.ownerOAuth||(this.ownerReads&&/^(docx|wiki)\./.test(t.name)))&&(OWNER_READ_APIS[t.name]||(t.method==='GET'&&/^(docx|wiki|drive|sheets|bitable)\./.test(t.name))));
 }
 async execute(name,a,guard,authorize){
  if(typeof guard!=='function')throw Error('缺少Owner请求守卫');guard();a=structuredClone(a);
  if(name==='feishu_office_diagnose_document')return this.reader.diagnose(a.url,guard);
  if(name==='feishu_office_collection')return this.reader.collection(guard,a.offset);
  if(name==='feishu_office_read_resources')return this.reader.resources(a.urls,guard);
  if(name==='feishu_office_drive_search')return boundedRead(await this.reader.session(guard).call(name,a));
  if(name==='feishu_office_find'){
   if(typeof(a.query??'')!=='string'||(a.query||'').length>300)throw Error('查询过长');const q=(a.query||'').toLowerCase().split(/\s+/).filter(Boolean),offset=index(a.offset);
   const rows=OFFICE_CATALOG.filter(t=>q.every(w=>(t.name+' '+t.description).toLowerCase().includes(w)));
   return {tools:rows.slice(offset,offset+20).map(({schema,...t})=>({...t,authorization:t.method==='GET'?'read':'current_owner_request_required',ownerReadScopes:OWNER_READ_APIS[t.name]?.scopes,callableIdentity:this.needsReadGuard('feishu_office_call',{api:t.name})?(this.ownerOAuth?.enabled(t.name)&&OWNER_READ_APIS[t.name]?'owner_user_requires_local_binding':'owner_user_api_not_authorized'):this.ownerOAuth?.enabled(t.name)?'owner_user_requires_local_binding':t.tokens.includes('tenant')?'tenant_requires_granted_scope':'user_oauth_required'})),total:rows.length,nextOffset:offset+20<rows.length?offset+20:null};
  }
  if(name==='feishu_office_schema'){
   const t=officeDefinition(a.api),offset=index(a.offset),s=JSON.stringify(t.schema);return {api:t.name,schemaText:s.slice(offset,offset+5000),nextOffset:offset+5000<s.length?offset+5000:null,totalCharacters:s.length,tokens:t.tokens,ownerReadScopes:OWNER_READ_APIS[t.name]?.scopes,note:'拼接全部schemaText后才是完整JSON；权限仍由飞书校验。'};
  }
  if(['feishu_office_sheet_read','feishu_office_sheet_write'].includes(name)){
   if(typeof a.spreadsheetToken!=='string'||!/^[-a-zA-Z0-9_]{1,200}$/.test(a.spreadsheetToken))throw Error('电子表格ID无效');
   const m=typeof a.range==='string'&&/^[-a-zA-Z0-9_]{1,100}!([A-Z]{1,3})([1-9][0-9]{0,6}):([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(a.range);
   if(!m)throw Error('请提供明确起止单元格范围');
   const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),rows=Number(m[4])-Number(m[2])+1,cols=col(m[3])-col(m[1])+1;
   if(rows<1||cols<1||rows*cols>5000)throw Error('范围须为1–5000个单元格');
   const read=name==='feishu_office_sheet_read',url=`/open-apis/sheets/v2/spreadsheets/${a.spreadsheetToken}/values`;
   if(!read&&(!Array.isArray(a.values)||a.values.length!==rows||a.values.some(row=>!Array.isArray(row)||row.length!==cols||row.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))||Buffer.byteLength(JSON.stringify(a.values))>100000))throw Error('数据须与范围行列一致，且不超过100KB');
   const request=read?{url:url+'/'+encodeURIComponent(a.range),method:'GET'}:{url,method:'PUT',data:{valueRange:{range:a.range,values:a.values}}};
   if(read&&this.ownerOAuth)return boundedRead(await this.reader.session(guard).call(name,{spreadsheetToken:a.spreadsheetToken,range:a.range}));
   return bounded(await this.api(()=>this.feishu.client.request(request),read,guard,{api:name,payload:request},authorize));
  }
  if(name==='feishu_office_permissions'){
   const offset=index(a.offset),r=await this.api(()=>this.feishu.client.application.scope.list({}),true,guard),scopes=r.scopes||[];
   return {scopes:scopes.slice(offset,offset+50).map(s=>({name:s.scope_name,identity:s.scope_type,status:s.grant_status})),total:scopes.length,nextOffset:offset+50<scopes.length?offset+50:null,note:'获批user权限不等于已取得Owner授权。默认tenant；仅本机显式配置的接口使用已绑定Owner用户身份。' };
  }
  if(name!=='feishu_office_call')throw Error('未知办公工具');
  const t=officeDefinition(a.api);
  if(this.needsReadGuard(name,a))return boundedRead(await this.reader.session(guard).call(t.name,a.payload));
  const useUser=this.ownerOAuth?.enabled(t.name);
  if(useUser&&!t.tokens.includes('user'))throw Error('此API不支持用户身份');
  if(!useUser&&!t.tokens.includes('tenant'))throw Error('此API仅支持用户身份，请先在本机授权并明确配置此接口；不会自动切换身份');
  const payload=validateOffice(t,a.payload),parts=t.sdkName.split('.');let parent=this.feishu.client;
  for(const key of parts.slice(0,-1))parent=parent?.[key];const fn=parent?.[parts.at(-1)];if(typeof fn!=='function')throw Error('当前固定SDK尚不支持此API');
  const lease=useUser?await this.ownerOAuth.lease(t.name,guard):null;
  const boundGuard=()=>{guard();lease?.check();};boundGuard();
  const proposal={api:t.name,payload,...(lease?{identity:lease.identity}:{})};
  const data=await this.api(options=>fn.call(parent,payload,options),t.method==='GET',boundGuard,proposal,authorize,lease?async()=>withUserAccessToken(await lease.access()):undefined);boundGuard();return {...bounded(data),...(lease?{identity:'owner-user'}:{})};
 }
 async api(fn,read,guard,proposal,authorize,prepare){
  guard();let permit;
  if(!read){
   if(typeof authorize!=='function')throw Error('办公写入缺少宿主一次性授权');
   permit=await authorize(structuredClone(proposal));guard();
   if(typeof permit?.consume!=='function'||typeof permit?.check!=='function')throw Error('办公写入授权无效');
  }
  const check=()=>{guard();permit?.check();};
  check();try{const data=await this.feishu.call(async()=>{check();const options=prepare?await prepare():undefined;check();permit?.consume();return fn(options);},read,check);check();return data;}
  catch(e){guard();throw Error(`飞书办公API失败${Number.isInteger(e.feishuCode)?'（'+e.feishuCode+'）':''}；请核对应用身份权限和目标资源访问权。写入未自动重试，先回读确认；接口错误正文未回传。`);}
 }
}
