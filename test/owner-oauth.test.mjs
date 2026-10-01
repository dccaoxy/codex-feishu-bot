import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {CredentialVault,KeychainKey,OwnerOAuth,binding,tokenRecord,verifyOwner,oauthJson,TOKEN_URL,USER_URL} from '../src/owner-oauth.mjs';
import {startOwnerAuthorization} from '../src/owner-oauth-callback.mjs';
import {Office} from '../src/office.mjs';
const api='task.v2.task.list',scopes=['offline_access','task:task:read'];
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-oauth-')),key=randomBytes(32);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const config={storageDir:dir,feishu:{appId:'fixture-app',appSecret:'fixture-secret'},ownerOAuth:{enabled:true,apis:[api]}};
 let owner='fixture-owner';const getOwner=()=>owner;
 const vault=new CredentialVault(dir,{keychain:{create:async()=>key,read:async()=>key}});
 const tokens={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:7200,refresh_token_expires_in:604800,scope:scopes.join(' ')};
 const record=()=>({version:1,binding:binding(config,owner),generation:'generation-1',allowedApis:[api],...tokenRecord(tokens,scopes),refreshPending:false});
 return {dir,key,config,vault,tokens,getOwner,setOwner:x=>owner=x,record};
}
async function stored(t){const f=fixture(t);await f.vault.initialize();f.vault.write(f.key,f.record());return f;}
test('vault stores encrypted credentials with private modes and authenticates storage location',async t=>{
 const f=await stored(t),raw=fs.readFileSync(f.vault.file,'utf8');assert.ok(!raw.includes('fixture-access'));assert.ok(!raw.includes('fixture-refresh'));
 assert.equal(fs.statSync(f.vault.directory).mode&0o777,0o700);assert.equal(fs.statSync(f.vault.file).mode&0o777,0o600);assert.equal(f.vault.read(f.key).generation,'generation-1');
 const modified=JSON.parse(raw);modified.tag=Buffer.alloc(16).toString('base64');fs.writeFileSync(f.vault.file,JSON.stringify(modified));assert.throws(()=>f.vault.read(f.key));
});
for(const target of ['file','directory'])test(`vault refuses exposed ${target}`,async t=>{const f=await stored(t);fs.chmodSync(f.vault[target],0o755);assert.throws(()=>f.vault.read(f.key));});
test('vault refuses symlink credentials',async t=>{const f=await stored(t);const original=f.vault.file+'.original';fs.renameSync(f.vault.file,original);fs.symlinkSync(original,f.vault.file);assert.throws(()=>f.vault.read(f.key));assert.throws(()=>f.vault.write(f.key,f.record()));});
test('keychain creation never puts a key in process argv or widens access',async()=>{
 let saved,calls=[];const k=new KeychainKey('/fixture',async(args,input)=>{calls.push(args);if(input){assert.ok(!input.includes(' -A'));assert.ok(!input.includes(' -U'));saved=input.match(/-w ([a-f0-9]{64})/)[1];return '';}return saved;});
 const key=await k.create();assert.equal(key.toString('hex'),saved);assert.equal(JSON.stringify(calls).includes(saved),false);
});
test('scope trimming or invalid lifetime is rejected without trusting defaults',()=>{
 const good={access_token:'a',refresh_token:'b',scope:scopes.join(' '),expires_in:120,refresh_token_expires_in:3600};
 for(const delta of [{refresh_token:''},{scope:'offline_access'},{expires_in:0},{expires_in:'7200'},{refresh_token_expires_in:Infinity}])assert.throws(()=>tokenRecord({...good,...delta},scopes));
});
test('wrong Owner login is rejected',async()=>{await assert.rejects(verifyOwner('fixture','expected',async()=>json({code:0,data:{open_id:'other'}})),/不是当前绑定/);});
test('HTTP errors and response bodies are never exposed',async()=>{
 await assert.rejects(oauthJson(TOKEN_URL,{},async()=>{throw Error('fixture-secret');}),e=>!e.message.includes('fixture-secret'));
 await assert.rejects(oauthJson(TOKEN_URL,{},async()=>json({code:20037,error_description:'fixture-secret'})),e=>!e.message.includes('fixture-secret'));
 await assert.rejects(oauthJson(TOKEN_URL,{},async()=>new Response('x'.repeat(70000))));
});
test('healthy access does not refresh and no credentials appear in lease identity',async t=>{
 const f=await stored(t);let calls=0;const p=new OwnerOAuth(f.config,f.getOwner,{vault:f.vault,fetcher:async()=>{calls++;throw Error();}});
 const lease=await p.lease(api,()=>{});assert.equal(await lease.access(),'fixture-access');assert.equal(calls,0);assert.ok(!JSON.stringify(lease.identity).includes('fixture-'));
});
for(const change of ['owner','app','policy','generation','disabled','api'])test(`lease invalidates on ${change}`,async t=>{
 const f=await stored(t),p=new OwnerOAuth(f.config,f.getOwner,{vault:f.vault}),lease=await p.lease(api,()=>{});
 if(change==='owner')f.setOwner('other');if(change==='app')f.config.feishu.appId='other';if(change==='policy')f.config.ownerOAuth.enabled=false;
 if(['generation','disabled','api'].includes(change)){const r=f.vault.read(f.key);if(change==='generation')r.generation='new';if(change==='disabled')r.disabled=true;if(change==='api')r.allowedApis=[];f.vault.write(f.key,r);}
 assert.throws(lease.check);await assert.rejects(lease.access());
});
test('parallel callers refresh once, rotate both tokens and bind the resulting user',async t=>{
 const f=await stored(t);let count=0;f.vault.write(f.key,{...f.record(),expiresAt:0});
 const fetcher=async(url,options)=>{if(url===USER_URL)return json({code:0,data:{open_id:f.getOwner()}});assert.equal(url,TOKEN_URL);assert.equal(options.redirect,'error');count++;assert.equal(JSON.parse(options.body).refresh_token,'fixture-refresh');return json({code:0,...f.tokens,access_token:'new-access',refresh_token:'new-refresh'});};
 const p=new OwnerOAuth(f.config,f.getOwner,{vault:f.vault,fetcher}),a=await p.lease(api,()=>{}),b=await p.lease(api,()=>{});
 assert.deepEqual(await Promise.all([a.access(),b.access()]),['new-access','new-access']);assert.equal(count,1);assert.equal(f.vault.read(f.key).refreshToken,'new-refresh');
});
test('unknown refresh outcome is fail closed and never reuses the refresh token',async t=>{
 const f=await stored(t);let calls=0;f.vault.write(f.key,{...f.record(),expiresAt:0});const p=new OwnerOAuth(f.config,f.getOwner,{vault:f.vault,fetcher:async()=>{calls++;throw Error('unknown');}});
 const l=await p.lease(api,()=>{});await assert.rejects(l.access());await assert.rejects(l.access());assert.equal(calls,1);assert.equal(f.vault.read(f.key).refreshPending,true);
});
test('withdrawal while refresh is waiting blocks later identity read and credential delivery',async t=>{
 const f=await stored(t);f.vault.write(f.key,{...f.record(),expiresAt:0});let valid=true,release,started;const began=new Promise(r=>started=r);let count=0;
 const p=new OwnerOAuth(f.config,f.getOwner,{vault:f.vault,fetcher:async()=>{count++;started();await new Promise(r=>release=r);return json({code:0,...f.tokens});}});
 const l=await p.lease(api,()=>{if(!valid)throw Error('withdrawn');}),pending=l.access();await began;valid=false;release();await assert.rejects(pending);assert.equal(count,1);
});
test('cross-process vault lock refuses concurrent use and is not stolen',async t=>{const f=await stored(t);await f.vault.locked(async()=>{await assert.rejects(f.vault.locked(async()=>{}));});});
function officeFixture(){let transfers=0,options,proposed,valid=true;const guard=()=>{if(!valid)throw Error('withdrawn');};const lease={identity:{kind:'owner-user',binding:'fixture-binding',generation:'1'},check:guard,access:async()=> 'fixture-user-token'};
 const provider={enabled:()=>true,lease:async()=>lease};const feishu={client:{task:{v2:{task:{list:async(p,o)=>{transfers++;options=o;return {items:[]};},delete:async(p,o)=>{transfers++;options=o;return {};}}}}},call:async(fn,retry,check)=>{check();return fn();}};
 const office=new Office(feishu,provider);const authorize=async p=>{proposed=p;return {check:guard,consume:guard};};
 return {office,lease,feishu,guard,authorize,withdraw:()=>valid=false,state:()=>({transfers,options,proposed})};}
test('user-only read uses request scoped SDK user token and never rewrites tenant client',async()=>{const f=officeFixture();await f.office.execute('feishu_office_call',{api,payload:{}},f.guard);assert.equal(f.state().transfers,1);assert.ok(f.state().options.lark);assert.equal(f.feishu.client.userAccessToken,undefined);});
test('user write still requires a host permit and binds identity in exact proposal',async()=>{
 const f=officeFixture(),a={api:'task.v2.task.delete',payload:{path:{task_guid:'target'}}};
 await assert.rejects(f.office.execute('feishu_office_call',a,f.guard),/宿主一次性授权/);assert.equal(f.state().transfers,0);
 await f.office.execute('feishu_office_call',a,f.guard,f.authorize);assert.equal(f.state().proposed.identity.kind,'owner-user');assert.equal(f.state().transfers,1);
});
test('waiting for a user credential cannot start a withdrawn write',async()=>{
 const f=officeFixture();let release,started;const began=new Promise(r=>started=r);f.lease.access=async()=>{started();await new Promise(r=>release=r);return 'fixture';};
 const pending=f.office.execute('feishu_office_call',{api:'task.v2.task.delete',payload:{path:{task_guid:'target'}}},f.guard,f.authorize);await began;f.withdraw();release();await assert.rejects(pending);assert.equal(f.state().transfers,0);
});
test('user transport error never falls back to tenant or replays a write',async()=>{
 const f=officeFixture();let calls=0;f.feishu.client.task.v2.task.delete=async()=>{calls++;throw Error('token-secret');};await assert.rejects(f.office.execute('feishu_office_call',{api:'task.v2.task.delete',payload:{path:{task_guid:'x'}}},f.guard,f.authorize),e=>!e.message.includes('token-secret'));assert.equal(calls,1);
});
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function callbackFixture(t,fetcher){
 const f=fixture(t),p=await port();const flow=await startOwnerAuthorization({config:f.config,getOwner:f.getOwner,policy:{apis:[api],scopes},vault:f.vault,fetcher,port:p});t.after(flow.close);
 const request=async(suffix)=>fetch(`http://localhost:${p}${suffix}`,{redirect:'manual'});
 const start=await request(new URL(flow.url).pathname),url=new URL(start.headers.get('location'));
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.has('client_secret'),false);
 return {...f,flow,request,state:url.searchParams.get('state'),challenge:url.searchParams.get('code_challenge')};
}
test('callback rejects invalid/duplicate state with zero exchange',async t=>{
 let calls=0;const f=await callbackFixture(t,async()=>{calls++;throw Error();});
 for(const q of ['state=wrong&code=fixture',`state=${f.state}&state=${f.state}&code=fixture`])assert.equal((await f.request('/oauth/feishu/callback?'+q)).status,400);
 assert.equal(calls,0);assert.equal(fs.existsSync(f.vault.file),false);
});
test('callback validates Owner, stores encrypted grant, strips code and consumes code once',async t=>{
 let calls=0;const f=await callbackFixture(t,async(url,opts)=>{calls++;if(url===USER_URL)return json({code:0,data:{open_id:'fixture-owner'}});assert.equal(url,'https://open.feishu.cn/open-apis/authen/v2/oauth/token');assert.equal(opts.headers['Content-Type'],'application/json; charset=utf-8');const payload=JSON.parse(opts.body);assert.equal(createHash('sha256').update(payload.code_verifier).digest('base64url'),f.challenge);assert.equal(payload.code,'fixture-code');return json({code:0,access_token:'callback-access',refresh_token:'callback-refresh',scope:scopes.join(' '),expires_in:7200,refresh_token_expires_in:604800});});
 const callback=`/oauth/feishu/callback?state=${f.state}&code=fixture-code`,r=await f.request(callback);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/done');await f.flow.done;
 assert.equal((await f.request(callback)).status,400);assert.equal(calls,2);assert.equal(f.vault.read(f.key).binding,binding(f.config,f.getOwner()));
});
test('wrong browser account cannot overwrite an existing Owner grant',async t=>{
 const f=await callbackFixture(t,async url=>url===USER_URL?json({code:0,data:{open_id:'intruder'}}):json({code:0,access_token:'x',refresh_token:'y',scope:scopes.join(' '),expires_in:7200,refresh_token_expires_in:604800}));
 f.vault.write(f.key,f.record());await f.request(`/oauth/feishu/callback?state=${f.state}&code=fixture`);await assert.rejects(f.flow.done);assert.equal(f.vault.read(f.key).accessToken,'fixture-access');
});
