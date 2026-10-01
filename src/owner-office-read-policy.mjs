import fs from 'node:fs';
const policy=JSON.parse(fs.readFileSync(new URL('./owner-office-read-policy.json',import.meta.url),'utf8'));
export const OWNER_READ_APIS=Object.freeze(Object.fromEntries(Object.entries(policy.apis).map(([k,v])=>[k,Object.freeze({...v,scopes:Object.freeze(v.scopes)})])));
export const OWNER_READ_SPECIAL=['feishu_office_sheet_read','feishu_office_drive_search'];
const messages={
 target_not_authorized:'当前可信Owner请求未明确授权这个读取目标；请明确提供资源链接/ID、单元格范围或搜索关键词，不会使用历史或资料中的指令。',
 scope_missing:'Owner 用户只读 scope 不足；需要本人重新授权，不会自动扩权。',
 api_not_allowed:'接口不在当前 Owner 只读身份白名单或本地授权范围内。',
 user_identity_unsupported:'固定 SDK/API 不支持该用户身份读取。',
 resource_denied:'飞书拒绝当前用户访问该资源。',
 unsupported_resource:'资源类型无法可靠识别或当前未支持。',
 reauthorization_required:'Owner 授权不可用或刷新失败；需要本机检查或重新授权。',
 api_not_exposed:'客户端可见不代表 API 可读取；当前接口未开放此内容。',
 unknown:'读取失败，原因尚不能确定；未自动切换身份。',
 invalid_request:'只读参数无效或超过单次读取范围。',
};
export class OwnerReadError extends Error{constructor(code){super(`[${code}] ${messages[code]||messages.unknown}`);this.readCode=code;}}
export function readError(code){return new OwnerReadError(code);}
export function classifyReadError(e){
 if(e instanceof OwnerReadError)return e;
 const code=e?.feishuCode??e?.response?.data?.code;
 if(code===970002)return readError('unsupported_resource');
 if([99991672,99991679].includes(code))return readError('scope_missing');
 if([99991663,99991664,99991668].includes(code))return readError('reauthorization_required');
 if([91403,131006,1770032,1254302,970003].includes(code))return readError('resource_denied');
 // An unrecognised HTTP 403 can also be a scope/tenant policy failure; do not guess.
 return readError('unknown');
}
