// No raw SDK errors, URLs supplied by a model, headers or response bodies enter
// diagnostics. This module never logs. The direct arm has one fixed GET route.
import {classifyReadError,readError} from './owner-office-read-policy.mjs';
const number=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max?v:null;
export async function readDeadline(work,timeoutMs,diagnostic,check){
 const controller=new AbortController();let expired=false,timer;
 const active=()=>{if(expired)throw readError('timeout');};
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();reject(readError('timeout'));},timeoutMs);});
 const wait=p=>Promise.race([p,deadline]);
 try{return await wait(work(wait,active,controller.signal));}
 catch(e){
  check();const error=classifyReadError(e);
  if(error.readCode==='scope_missing')diagnostic.scope='missing';
  error.diagnostic={...diagnostic,httpStatus:number(e?.response?.status??diagnostic.httpStatus,100,599),feishuCode:number(e?.feishuCode??e?.response?.data?.code??diagnostic.feishuCode,0,999999999)};
  throw error;
 }finally{clearTimeout(timer);}
}
export async function directDocx(api,payload,token,fetcher,signal,diagnostic){
 if(api!=='docx.v1.documentBlock.list')throw readError('user_identity_unsupported');
 const id=payload.path?.document_id;if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id))throw readError('invalid_request');
 const url=new URL(`https://open.feishu.cn/open-apis/docx/v1/documents/${id}/blocks`);
 for(const [k,v] of Object.entries(payload.params||{}))url.searchParams.set(k,String(v));
 diagnostic.outbound=true;
 const response=await fetcher(url,{method:'GET',headers:{Authorization:`Bearer ${token}`},signal,redirect:'error'});
 diagnostic.httpStatus=response.status;
 // Read a bounded response even when content-length is missing or dishonest.
 let size=0;const chunks=[],reader=response.body?.getReader();if(!reader)throw readError('unknown');
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024)throw readError('response_too_large');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw readError('unknown');}
 diagnostic.feishuCode=number(data?.code,0,999999999);
 if(!response.ok||data?.code){const error=new Error('Official read failed');error.feishuCode=diagnostic.feishuCode;error.response={status:response.status};throw error;}
 return data;
}
export function compareReadDiagnostics(a,b){
 if(a.status==='success'&&b.status==='success')return 'both_succeeded';
 if(b.status==='success'&&a.status!=='success'){
  if(a.reason==='target_not_authorized')return 'local_permit';
  return a.identity==='tenant'?'identity_routing':'api_path_difference';
 }
 const reasons=[a.reason,b.reason];
 if(reasons.includes('target_not_authorized'))return 'local_permit';
 if(reasons.includes('scope_missing'))return 'scope';
 if(reasons.includes('user_identity_unsupported')||reasons.includes('api_not_allowed'))return 'api_capability';
 if(reasons.includes('reauthorization_required'))return 'token_unavailable';
 if(reasons.includes('timeout'))return 'timeout';
 if(reasons.includes('resource_denied'))return 'resource_permission';
 return 'unknown';
}
