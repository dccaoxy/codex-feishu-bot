import fs from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
const catalog=JSON.parse(fs.readFileSync(new URL('./office-catalog.json',import.meta.url),'utf8'));
export const OFFICE_CATALOG=catalog.tools;
const definitions=new Map(OFFICE_CATALOG.map(t=>[t.name,t]));
const ajv=new Ajv({strict:false,allErrors:false});addFormats(ajv);const validators=new Map();
export function index(n=0){if(!Number.isSafeInteger(n)||n<0)throw Error('分页位置无效');return n;}
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
