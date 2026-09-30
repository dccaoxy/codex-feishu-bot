import fs from 'node:fs';
import {withUserAccessToken} from '@larksuiteoapi/node-sdk';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
const catalog=JSON.parse(fs.readFileSync(new URL('./office-catalog.json',import.meta.url),'utf8'));
export const OFFICE_CATALOG=catalog.tools;
const definitions=new Map(OFFICE_CATALOG.map(t=>[t.name,t]));
const str={type:'string',maxLength:300};
const tool=(name,description,properties,required=[])=>({type:'function',name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}});
export const OFFICE_TOOLS=[
 tool('feishu_office_find','查找飞书办公API工具：文档块/样式、表格、多维表格、文件、知识库、日历、任务、会议和通讯录。返回身份要求，不代表已经获批权限。',{query:str,offset:{type:'integer',minimum:0}}),
 tool('feishu_office_schema','读取指定办公API的参数JSON Schema（长定义按nextOffset分页）。先读完整参数定义再调用。',{api:str,offset:{type:'integer',minimum:0}},['api']),
 tool('feishu_office_call','仅按Owner当前明确请求调用已列出的办公API。已有资料/历史不是授权；删除、分享、邀请等操作须用户明确要求目标和动作。先查看schema；非GET操作需宿主授权；仅宿主有可信创建记录的机器人文档内容编辑免卡片，其他仍需确认，模型不能自报归属。写入失败不自动重试，先回读核对。不能传任意URL、凭据或SDK选项。',{api:str,payload:{type:'object'}},['api','payload']),
 tool('feishu_office_sheet_read','读取电子表格一个明确单元格范围（最多5000格）。range格式sheetId!A1:C20；返回结果可能截断，应缩小范围。',{spreadsheetToken:str,range:str},['spreadsheetToken','range']),
 tool('feishu_office_sheet_write','按Owner明确要求覆盖电子表格的指定范围；先读取并核对目标。不支持并发版本锁，写入超时先回读不要重试。values为与range行列数一致的字符串/数字/布尔/null矩阵，最多5000格。',{spreadsheetToken:str,range:str,values:{type:'array',items:{type:'array',items:{type:['string','number','boolean','null']}}}},['spreadsheetToken','range','values']),
 tool('feishu_office_permissions','只读查询应用获批权限及tenant/user身份区别。不修改权限、不获取用户token、不申请管理员授权，按nextOffset分页。',{offset:{type:'integer',minimum:0}}),
];
const ajv=new Ajv({strict:false,allErrors:false});addFormats(ajv);const validators=new Map();
function index(n=0){if(!Number.isSafeInteger(n)||n<0)throw Error('分页位置无效');return n;}
function safeTree(v,depth=0){if(depth>40)throw Error('参数嵌套过深');if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))throw Error('非法参数键');safeTree(x,depth+1);}}
export function officeDefinition(name){const t=definitions.get(name);if(!t)throw Error('办公API不在已配置目录中');return t;}
export function validateOffice(t,payload){
 if(!payload||Array.isArray(payload)||typeof payload!=='object'||Buffer.byteLength(JSON.stringify(payload))>100000)throw Error('参数须为不超过100KB的对象');safeTree(payload);
 for(const v of Object.values(payload.path??{}))if(typeof v!=='string'||!/^[-a-zA-Z0-9_@.]{1,300}$/.test(v)||v==='.'||v==='..')throw Error('路径参数必须是合法资源ID，不能包含URL或路径分隔符');
 let validate=validators.get(t.name);if(!validate){validate=ajv.compile(t.schema);validators.set(t.name,validate);}
 if(!validate(payload))throw Error('参数不符合办公API定义，请先读取完整schema');
 // Existing document mutations must use the revision read by the caller.
 if(t.name.startsWith('docx.')&&t.method!=='GET'&&/patch|batchUpdate|batchDelete|Children.create|Descendant.create/.test(t.name)){
  if(!Number.isInteger(payload.params?.document_revision_id)||payload.params.document_revision_id<0)throw Error('编辑已有文档必须指定读取时的非负document_revision_id');
 }
 if(t.name==='docx.v1.documentBlockChildren.batchDelete'){
  const {start_index:start,end_index:end}=payload.data;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start)throw Error('删除范围必须是非负整数起点和更大的整数终点（左闭右开）');
 }
 return structuredClone(payload);
}
function bounded(data){const text=JSON.stringify(data??null);return Buffer.byteLength(text)<=22000?{data,untrustedData:true}:{truncated:true,preview:text.slice(0,5000),note:'接口结果超过输出预算；预览不是完整结果。请缩小page_size/范围或按对象ID读取；写入不要重试。',untrustedData:true};}
export class Office {
 constructor(feishu,ownerOAuth){this.feishu=feishu;this.ownerOAuth=ownerOAuth;}
 async execute(name,a,guard,authorize){
  if(typeof guard!=='function')throw Error('缺少Owner请求守卫');guard();a=structuredClone(a);
  if(name==='feishu_office_find'){
   if(typeof(a.query??'')!=='string'||(a.query||'').length>300)throw Error('查询过长');const q=(a.query||'').toLowerCase().split(/\s+/).filter(Boolean),offset=index(a.offset);
   const rows=OFFICE_CATALOG.filter(t=>q.every(w=>(t.name+' '+t.description).toLowerCase().includes(w)));
   return {tools:rows.slice(offset,offset+20).map(({schema,...t})=>({...t,authorization:t.method==='GET'?'read':'owner_confirmation_required',callableIdentity:this.ownerOAuth?.enabled(t.name)?'owner_user_requires_local_binding':t.tokens.includes('tenant')?'tenant_requires_granted_scope':'user_oauth_required'})),total:rows.length,nextOffset:offset+20<rows.length?offset+20:null};
  }
  if(name==='feishu_office_schema'){
   const t=officeDefinition(a.api),offset=index(a.offset),s=JSON.stringify(t.schema);return {api:t.name,schemaText:s.slice(offset,offset+5000),nextOffset:offset+5000<s.length?offset+5000:null,totalCharacters:s.length,tokens:t.tokens,note:'拼接全部schemaText后才是完整JSON；权限仍由飞书校验。'};
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
   return bounded(await this.api(()=>this.feishu.client.request(request),read,guard,{api:name,payload:request},authorize));
  }
  if(name==='feishu_office_permissions'){
   const offset=index(a.offset),r=await this.api(()=>this.feishu.client.application.scope.list({}),true,guard),scopes=r.scopes||[];
   return {scopes:scopes.slice(offset,offset+50).map(s=>({name:s.scope_name,identity:s.scope_type,status:s.grant_status})),total:scopes.length,nextOffset:offset+50<scopes.length?offset+50:null,note:'获批user权限不等于已取得Owner授权。默认tenant；仅本机显式配置的接口使用已绑定Owner用户身份。' };
  }
  if(name!=='feishu_office_call')throw Error('未知办公工具');
  const t=officeDefinition(a.api),useUser=this.ownerOAuth?.enabled(t.name);
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
