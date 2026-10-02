// Owner-only local OAuth. No chat login, automatic scope expansion or tenant fallback.
import fs from 'node:fs';
import {readError} from './owner-office-read-policy.mjs';
import path from 'node:path';
import {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {spawn} from 'node:child_process';
export const REDIRECT_URI='http://localhost:18923/oauth/feishu/callback';
export const AUTHORIZE_URL='https://accounts.feishu.cn/open-apis/authen/v1/authorize';
export const TOKEN_URL='https://open.feishu.cn/open-apis/authen/v2/oauth/token';
export const USER_URL='https://open.feishu.cn/open-apis/authen/v1/user_info';
const fail=()=>Error('Owner OAuth 不可用；请在本机检查授权状态，勿提交凭据。');
export const hash=s=>createHash('sha256').update(s).digest('hex');
function privatePath(p,directory=false){
 const s=fs.lstatSync(p);if(s.isSymbolicLink()||!(directory?s.isDirectory():s.isFile())||(s.mode&0o077)||s.uid!==process.getuid())throw fail();
 return s;
}
function command(args,input){return new Promise((resolve,reject)=>{
 const child=spawn('/usr/bin/security',args,{stdio:['pipe','pipe','pipe']});let out='',size=0;
 const timer=setTimeout(()=>{child.kill();reject(fail());},15000);timer.unref();
 child.stdout.on('data',b=>{size+=b.length;if(size>8192){child.kill();return;}out+=b;});
 child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(fail());});
 child.on('close',code=>{clearTimeout(timer);code===0&&size<=8192?resolve(out.trim()):reject(fail());});
 child.stdin.on('error',()=>{});child.stdin.end(input);
});}
export class KeychainKey {
 constructor(directory,run=command){this.service='codex-feishu-owner-oauth-'+hash(directory).slice(0,24);this.run=run;}
 async read(){
  const value=await this.run(['find-generic-password','-s',this.service,'-a','owner-oauth','-w']);
  if(!/^[0-9a-f]{64}$/.test(value))throw fail();return Buffer.from(value,'hex');
 }
 async create(){
  const value=randomBytes(32).toString('hex');
  // Secret is supplied on stdin, never process arguments, environment or logs.
  // No -A and no -U: do not widen Keychain access or overwrite an existing key.
  await this.run(['-i'],`add-generic-password -s ${this.service} -a owner-oauth -w ${value}\n`);
  const saved=await this.read();if(saved.toString('hex')!==value)throw fail();return saved;
 }
}
export class CredentialVault {
 constructor(storageDir,{keychain}={}){
  this.directory=path.join(path.resolve(storageDir),'owner-oauth');this.file=path.join(this.directory,'credentials.enc');
  this.keychain=keychain||new KeychainKey(this.directory);
 }
 async initialize(){
  if(fs.existsSync(this.directory)){privatePath(this.directory,true);return this.keychain.read();}
  fs.mkdirSync(this.directory,{mode:0o700});return this.keychain.create();
 }
 snapshot(){privatePath(this.directory,true);const s=privatePath(this.file);if(s.size>65536)throw fail();return hash(fs.readFileSync(this.file));}
 async unlock(){privatePath(this.directory,true);return this.keychain.read();}
 read(key){
  privatePath(this.directory,true);const s=privatePath(this.file);if(s.size>65536)throw fail();
  try{const e=JSON.parse(fs.readFileSync(this.file,'utf8'));
   const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));decipher.setAAD(Buffer.from(this.directory));decipher.setAuthTag(Buffer.from(e.tag,'base64'));
   return JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data,'base64')),decipher.final()]).toString());
  }catch{throw fail();}
 }
 write(key,record){
  privatePath(this.directory,true);if(fs.existsSync(this.file))privatePath(this.file);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(this.directory));
  const data=Buffer.concat([cipher.update(JSON.stringify(record)),cipher.final()]);if(data.length>50000)throw fail();
  const tmp=path.join(this.directory,randomUUID()+'.tmp');let fd;
  try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,this.file);}
  finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch{}}
 }
 async locked(fn){
  privatePath(this.directory,true);const lock=path.join(this.directory,'lock');
  try{fs.mkdirSync(lock,{mode:0o700});}catch{throw Error('Owner OAuth 正在使用或锁未清理；不会并发刷新，请在本机检查。');}
  try{return await fn();}finally{fs.rmdirSync(lock);}
 }
}
export function binding(config,owner){
 if(!config.feishu?.appId||!owner)throw fail();
 return hash(JSON.stringify([config.feishu.appId,owner,fs.realpathSync(config.storageDir)]));
}
export async function oauthJson(url,options={},fetcher=fetch){
 try{
  const response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw fail();
  const reader=response.body.getReader();let size=0;const parts=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw fail();}parts.push(value);}
  const data=JSON.parse(Buffer.concat(parts).toString());if(data.code!==0)throw fail();return data;
 }catch{throw fail();}
}
export async function exchange(config,fields,fetcher=fetch){
 return oauthJson(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({...fields,client_id:config.feishu.appId,client_secret:config.feishu.appSecret})},fetcher);
}
export function tokenRecord(data,expectedScopes,now=Date.now()){
 const scopes=typeof data.scope==='string'?data.scope.split(/\s+/).filter(Boolean):[];
 if(!expectedScopes.every(s=>scopes.includes(s))||!scopes.includes('offline_access')||
 ![data.access_token,data.refresh_token].every(x=>typeof x==='string'&&x.length>0&&x.length<=16384)||
 ![data.expires_in,data.refresh_token_expires_in].every(x=>Number.isFinite(x)&&x>60&&x<=366*86400))throw fail();
 return {accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:now+data.expires_in*1000,refreshExpiresAt:now+data.refresh_token_expires_in*1000,scopes};
}
export async function verifyOwner(accessToken,owner,fetcher=fetch){
 const r=await oauthJson(USER_URL,{headers:{Authorization:'Bearer '+accessToken}},fetcher);
 if(r.data?.open_id!==owner)throw Error('登录账号不是当前绑定的 Owner，未保存用户授权。');
}
export class OwnerOAuth {
 constructor(config,getOwner,{vault,fetcher=fetch,now=Date.now}={}){this.config=config;this.getOwner=getOwner;this.vault=vault||new CredentialVault(config.storageDir);this.fetcher=fetcher;this.now=now;this.serial=Promise.resolve();}
 enabled(api){return this.config.ownerOAuth?.enabled===true&&this.config.ownerOAuth.apis?.includes(api);}
 async lease(api,guard,requiredScopes=[]){
  guard();if(!this.enabled(api))throw fail();
  const owner=this.getOwner(),id=binding(this.config,owner),policy=JSON.stringify(this.config.ownerOAuth);
  const snapshot=this.vault.snapshot?.();
  const key=await this.vault.unlock();guard();if(snapshot!==undefined&&this.vault.snapshot()!==snapshot)throw fail();
  const current=this.vault.read(key),generation=current.generation;
  const check=()=>{
   guard();if(!this.enabled(api)||JSON.stringify(this.config.ownerOAuth)!==policy||binding(this.config,this.getOwner())!==id)throw fail();
   const r=this.vault.read(key);if(requiredScopes.length&&!requiredScopes.some(s=>r.scopes?.includes(s)))throw readError('scope_missing');if(!generation||r.binding!==id||r.generation!==generation||r.disabled||!r.allowedApis?.includes(api))throw fail();
  };
  check();
  return {identity:{kind:'owner-user',binding:id,generation},check,access:async()=>{
   const job=this.serial.catch(()=>{}).then(()=>this.vault.locked(async()=>{
    check();let record=this.vault.read(key);
    if(record.refreshPending)throw fail();
    if(record.expiresAt>this.now()+60000)return record.accessToken;
    if(!(record.refreshExpiresAt>this.now()+60000))throw fail();
    // Crash or unknown network outcome must not reuse a one-time refresh token.
    this.vault.write(key,{...record,refreshPending:true});
    const started=this.now();const response=await exchange(this.config,{grant_type:'refresh_token',refresh_token:record.refreshToken,scope:record.scopes.join(' ')},this.fetcher);
    check();const next=tokenRecord(response,record.scopes,started);
    await verifyOwner(next.accessToken,owner,this.fetcher);check();
    record={...record,...next,refreshPending:false};this.vault.write(key,record);return record.accessToken;
   }));this.serial=job;const token=await job;check();return token;
  }};
 }
}
