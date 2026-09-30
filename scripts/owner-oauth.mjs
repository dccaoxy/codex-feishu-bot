// One-time local operator utility; never expose a login/token tool to the model.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {CredentialVault,OwnerOAuth,binding} from '../src/owner-oauth.mjs';
import {startOwnerAuthorization} from '../src/owner-oauth-callback.mjs';
import {OFFICE_CATALOG} from '../src/office.mjs';
const argv=process.argv.slice(2),arg=k=>{const i=argv.indexOf(k);return i<0?undefined:argv[i+1];};
async function main(){
 const mode=argv[0],filename=arg('--config');if(!['authorize','status','refresh-check'].includes(mode)||!filename)throw Error('用法：node scripts/owner-oauth.mjs authorize|status|refresh-check --config <本地配置> --policy <本地策略JSON>');
 const readConfig=()=>{const c=JSON.parse(fs.readFileSync(filename,'utf8'));c.storageDir=path.resolve(path.dirname(path.resolve(filename)),c.storageDir||'data');return c;};
 const config=readConfig();
 const owner=()=>{const c=readConfig();if(c.feishu.appId!==config.feishu.appId||c.feishu.appSecret!==config.feishu.appSecret||c.storageDir!==config.storageDir)throw Error('应用配置已变化');if(c.feishu.ownerOpenId)return c.feishu.ownerOpenId;const db=new DatabaseSync(path.join(config.storageDir,'state.sqlite'),{readOnly:true});try{return db.prepare("SELECT value FROM settings WHERE key='owner'").get()?.value||'';}finally{db.close();}};
 binding(config,owner());const vault=new CredentialVault(config.storageDir);
 if(mode==='status'){
  const r=vault.read(await vault.unlock());console.log(JSON.stringify({bound:r.binding===binding(config,owner()),disabled:!!r.disabled,refreshPending:!!r.refreshPending,accessExpired:r.expiresAt<=Date.now(),refreshExpired:r.refreshExpiresAt<=Date.now(),scopeCount:r.scopes?.length,apiCount:r.allowedApis?.length}));return;
 }
 if(mode==='refresh-check'){
  const r=vault.read(await vault.unlock());config.ownerOAuth={enabled:true,apis:r.allowedApis};
  const provider=new OwnerOAuth(config,owner,{vault});const lease=await provider.lease(r.allowedApis[0],()=>{});await lease.access();console.log('Owner 用户凭据可用（未执行办公 API）；不会输出凭据。');return;
 }
 const policy=JSON.parse(fs.readFileSync(arg('--policy'),'utf8'));
 if(!Array.isArray(policy.apis)||!policy.apis.length||new Set(policy.apis).size!==policy.apis.length||policy.apis.some(a=>!OFFICE_CATALOG.some(t=>t.name===a&&t.tokens.includes('user'))))throw Error('策略必须明确列出支持user身份的固定Office接口');
 if(!Array.isArray(policy.scopes)||!policy.scopes.includes('offline_access')||policy.scopes.length>200||new Set(policy.scopes).size!==policy.scopes.length||policy.scopes.some(s=>typeof s!=='string'||!/^[-a-zA-Z0-9_.:]+$/.test(s)))throw Error('策略必须明确列出去重的用户scope及offline_access');
 const flow=await startOwnerAuthorization({config,getOwner:owner,policy,vault});
 process.once('SIGINT',flow.close);process.once('SIGTERM',flow.close);
 if(argv.includes('--no-open'))console.log('本机授权入口：'+flow.url);
 else {const browser=spawn('/usr/bin/open',[flow.url],{stdio:'ignore'});browser.on('error',flow.close);}
 console.log(argv.includes('--no-open') ? '请在本机浏览器打开上方地址，由当前Owner本人点击授权；10分钟内有效。' : '已请求本机浏览器打开飞书授权页。请由当前Owner本人点击授权；10分钟内有效。');
 await flow.done;console.log('Owner授权绑定已保存并核对。现有服务、配置和群权限未修改；Office接入仍须单独启用已验证版本。');
}
main().catch(()=>{console.error('本机Owner OAuth操作未完成。请检查本机账号、回调端口、权限、策略及钥匙串；未输出底层错误或凭据。');process.exitCode=1;});
