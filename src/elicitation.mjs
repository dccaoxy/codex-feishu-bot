import Ajv from 'ajv';
import addFormats from 'ajv-formats';
const ajv = new Ajv({strict:false, strictSchema:true, allErrors:true, validateFormats:true, useDefaults:false, coerceTypes:false});
addFormats(ajv);
ajv.addKeyword({keyword:'enumNames',schemaType:'array',valid:true});
function sensitive(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.format === 'password' || value.isSecret || value.writeOnly) return true;
  if (/password|secret|credential|密码|密钥/i.test(value.title || '')) return true;
  if (value.properties && Object.keys(value.properties).some(k=>/password|secret|token|credential|密码|密钥/i.test(k))) return true;
  return Object.values(value).some(v=>typeof v==='object' && sensitive(v));
}
export function formFields(schema) {
  if (!schema || schema.type !== 'object' || !schema.properties || sensitive(schema)) throw new Error('不支持此表单结构或包含敏感字段');
  const fields=Object.entries(schema.properties);
  if(fields.length>12 || fields.some(([k])=> !/^[\w-]+$/.test(k) || ['__proto__','constructor','prototype'].includes(k))) throw new Error('表单字段无效');
  ajv.compile(schema); // Fail before rendering malformed or unresolved schemas.
  return fields;
}
export function validateForm(schema, answers) {
  const validate=ajv.compile(schema);
  if(!validate(answers)) throw new Error('表单未满足要求：'+ajv.errorsText(validate.errors).slice(0,500));
}
export function fieldOptions(field) {
  if(field.enum) return field.enum.map((v,i)=>({value:v,label:field.enumNames?.[i] ?? String(v)}));
  if(field.oneOf?.every(o=>Object.hasOwn(o,'const'))) return field.oneOf.map(o=>({value:o.const,label:o.title || String(o.const)}));
  return field.type==='boolean' ? [{value:true,label:'是 / true'},{value:false,label:'否 / false'}] : [];
}
export function parseField(schema, answer) {
  const raw = String(answer ?? '');
  let value = raw;
  if (['object','array'].includes(schema.type) || !schema.type) {
    try { value=JSON.parse(raw); } catch { throw new Error('请输入有效 JSON，例如多选 ["选项一","选项二"]'); }
  } else if (schema.type === 'boolean') {
    if (!['true','false'].includes(raw)) throw new Error('请选 true 或 false');
    value = raw === 'true';
  } else if (['number','integer'].includes(schema.type)) {
    value = raw.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) throw new Error('请输入有效数字');
    if ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)) throw new Error('数字超出允许范围');
  } else if (raw.length > 12000 || (schema.minLength !== undefined && [...raw].length < schema.minLength) || (schema.maxLength !== undefined && [...raw].length > schema.maxLength)) throw new Error('文本长度不符合要求');
  if (schema.enum && !schema.enum.includes(value)) throw new Error('请使用给出的选项');
  return value;
}
export function authorizationUrl(raw) {
  const url = new URL(raw);
  if (!['https:','http:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) || url.username || url.password) throw new Error('不支持此授权链接');
  return url.href;
}
