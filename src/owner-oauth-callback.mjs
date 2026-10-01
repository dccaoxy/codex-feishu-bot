import http from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {AUTHORIZE_URL,REDIRECT_URI,binding,exchange,tokenRecord,verifyOwner} from './owner-oauth.mjs';
export async function startOwnerAuthorization({config,getOwner,policy,vault,fetcher=fetch,port=18923,timeoutMs=600000}){
 const owner=getOwner(),bound=binding(config,owner),key=await vault.initialize();
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url'),startPath='/start/'+randomBytes(24).toString('hex');
 const redirect=port===18923?REDIRECT_URI:`http://localhost:${port}/oauth/feishu/callback`;
 const url=new URL(AUTHORIZE_URL);url.search=new URLSearchParams({client_id:config.feishu.appId,response_type:'code',redirect_uri:redirect,scope:policy.scopes.join(' '),state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'consent'});
 let used=false,finished=false,timer,resolve,reject;
 const done=new Promise((r,j)=>{resolve=r;reject=j;});done.catch(()=>{});
 const check=()=>{if(finished||getOwner()!==owner||binding(config,getOwner())!==bound)throw Error('本机授权已失效');};
 const reply=(res,status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(text);};
 const finish=(error)=>{if(finished)return;finished=true;clearTimeout(timer);server.close();error?reject(error):resolve({bound:true,scopeCount:policy.scopes.length});};
 const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'||req.headers.host!==`localhost:${port}`){reply(res,400,'请求无效');return;}
  const request=new URL(req.url,'http://localhost');
  if(request.pathname===startPath&&!used&&!finished){res.writeHead(302,{Location:url.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return;}
  if(request.pathname==='/done'){reply(res,200,'Owner 授权已保存。可以关闭此页。');return;}
  if(request.pathname!=='/oauth/feishu/callback'){reply(res,404,'不存在');return;}
  const states=request.searchParams.getAll('state'),codes=request.searchParams.getAll('code'),s=states[0]||'';
  if(used||finished||states.length!==1||Buffer.byteLength(s)!==Buffer.byteLength(state)||!timingSafeEqual(Buffer.from(s),Buffer.from(state))){reply(res,400,'授权校验失败，请使用本机发起的授权页面');return;}
  used=true;
  if(request.searchParams.has('error')||codes.length!==1||!codes[0]||codes[0].length>4096){reply(res,400,'授权已取消或无效');finish(Error('用户未完成飞书授权'));return;}
  try{
   check();const started=Date.now();const data=await exchange(config,{grant_type:'authorization_code',code:codes[0],redirect_uri:redirect,code_verifier:verifier,scope:policy.scopes.join(' ')},fetcher);
   check();const tokens=tokenRecord(data,policy.scopes,started);await verifyOwner(tokens.accessToken,owner,fetcher);check();
   await vault.locked(async()=>{check();vault.write(key,{version:1,binding:bound,generation:randomUUID(),allowedApis:policy.apis,...tokens,refreshPending:false,authorizedAt:Date.now()});});
   // Remove the authorization code from the final visible address before any status read.
   res.writeHead(303,{Location:'/done','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
   // Serve the landing page before closing, without retaining a long-running callback server.
   finished=true;clearTimeout(timer);resolve({bound:true,scopeCount:tokens.scopes.length});
   setTimeout(()=>server.close(),3000).unref();
  }catch{reply(res,400,'授权未保存。请在本机检查账号、权限或授权状态；不要复制授权码。');finish(Error('Owner 授权未保存；账号、权限或交换校验未通过'));}
 });
 await new Promise((r,j)=>{server.once('error',()=>j(Error('本机回调端口不可用；没有启动授权')));server.listen(port,'127.0.0.1',r);});
 server.requestTimeout=20000;server.headersTimeout=10000;
 timer=setTimeout(()=>finish(Error('本机授权等待超时')),timeoutMs);timer.unref();
 return {url:`http://localhost:${port}${startPath}`,done,close:()=>finish(Error('本机授权已取消'))};
}
