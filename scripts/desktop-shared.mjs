// Local, opt-in Phase 2 lab. No credentials or machine paths are committed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadConfig} from '../src/config.mjs';
import {CodexClient} from '../src/codex.mjs';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'data','shared-lab'), stateFile=path.join(dir,'environment.json');
const runtime=path.join(os.homedir(),'Library','Application Support','codex-feishu-shared-lab');
function installWrapper(){fs.mkdirSync(runtime,{recursive:true,mode:0o700});fs.copyFileSync(path.join(root,'scripts/limit-exec.sh'),path.join(runtime,'limit-exec.sh'));fs.chmodSync(path.join(runtime,'limit-exec.sh'),0o700);}
const domain=`gui/${process.getuid()}`,label='io.codex.feishu-shared-lab';
const plist=path.join(os.homedir(),'Library','LaunchAgents',label+'.plist');
const configFile=path.join(root,'config.local.json'),backup=path.join(dir,'config.before-work.json');
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function run(bin,args,optional=false){const r=spawnSync(bin,args,{encoding:'utf8'});if(!optional&&r.status!==0)throw new Error(`${path.basename(bin)} ${args[0]} failed (${r.status})`);return r;}
function desktopRunning(env){return run('/bin/ps',['-axo','comm=']).stdout.split('\n').some(s=>s.trim()===env.desktop);}
function save(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.chmodSync(file,0o600);}
function idleBot(config){const file=path.join(config.storageDir,'state.sqlite');if(!fs.existsSync(file))return;const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare("SELECT COUNT(*) n FROM runs WHERE state='running'").get().n||db.prepare("SELECT COUNT(*) n FROM inbox WHERE state IN ('pending','processing')").get().n)throw new Error('机器人有活动任务或排队输入，请完成后再切换。');}finally{db.close();}}
async function health(env){const c=new CodexClient(env.binary,{url:env.url,timeoutMs:3000});try{await c.start();const a=await c.request('account/read');if(!a.account)throw new Error('共享服务尚未登录');return true;}finally{await c.close();}}
const command=process.argv[2]||'status';
if(process.platform!=='darwin')throw new Error('此本地联调脚本仅支持 macOS。');
if(command==='setup'){
  const c=loadConfig();idleBot(c);
  if(fs.existsSync(stateFile))throw new Error('联调环境已存在，请 status 检查；不会覆盖原始备份。');
  const binary='/Applications/ChatGPT.app/Contents/Resources/codex';
  if(!fs.existsSync(binary))throw new Error('未找到 Desktop bundled Codex。');
  const port=4517,url=`ws://127.0.0.1:${port}`;
  await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.copyFileSync(configFile,backup,fs.constants.COPYFILE_EXCL);fs.chmodSync(backup,0o600);
  const env={url,binary,desktop:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',createdAt:new Date().toISOString()};save(stateFile,env);
  installWrapper();
  const args=['/bin/sh',path.join(runtime,'limit-exec.sh'),path.join(runtime,'server.nofile'),binary,'-c','features.code_mode_host=true','app-server','--listen',url];
  const p=`<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a=>`<string>${xml(a)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(os.homedir())}</string><key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(os.homedir())}</string><key>PATH</key><string>${xml(process.env.PATH)}</string></dict><key>SoftResourceLimits</key><dict><key>NumberOfFiles</key><integer>4096</integer></dict><key>HardResourceLimits</key><dict><key>NumberOfFiles</key><integer>8192</integer></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>${xml(path.join(dir,'server.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(dir,'server.error.log'))}</string></dict></plist>`;
  fs.writeFileSync(plist,p,{mode:0o600});run('/bin/launchctl',['bootstrap',domain,plist]);
  let ready=false;for(let i=0;i<20;i++){try{await health(env);ready=true;break;}catch{await delay(500);}}
  if(!ready)throw new Error('共享服务器未就绪，机器人配置未切换；可执行 rollback。');
  const raw=JSON.parse(fs.readFileSync(configFile));raw.codex.externalThreadPermission='work';raw.codex.appServerUrl=url;delete raw.codex.appServerSocket;raw.codex.binary=binary;save(configFile,raw);
  run(process.execPath,[path.join(root,'scripts/service.mjs'),'restart']);
  console.log('Shared App Server 与飞书机器人已配置并启动：'+url);
}else if(command==='repair-limits'){
  const env=JSON.parse(fs.readFileSync(stateFile));
  // Refuse to restart a server with any clients, including an active Desktop.
  const connections=run('/usr/sbin/lsof',['-nP','-iTCP:'+new URL(env.url).port,'-sTCP:ESTABLISHED'],true);
  if(connections.status!==1 || connections.stdout.trim())throw new Error('共享服务仍有连接或无法确认空闲；请先退出共享客户端，不会强制重启。');
  const raw=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',plist]).stdout);
  if(raw.Label!==label)throw new Error('服务身份不匹配');
  installWrapper();raw.WorkingDirectory=os.homedir();
  raw.ProgramArguments=['/bin/sh',path.join(runtime,'limit-exec.sh'),path.join(runtime,'server.nofile'),env.binary,'-c','features.code_mode_host=true','app-server','--listen',env.url];
  delete raw.Program;
  raw.SoftResourceLimits={...raw.SoftResourceLimits,NumberOfFiles:4096};
  raw.HardResourceLimits={...raw.HardResourceLimits,NumberOfFiles:8192};
  const temp=path.join(dir,'service.updated.plist');save(temp,raw);run('/usr/bin/plutil',['-convert','xml1',temp]);
  fs.copyFileSync(plist,path.join(dir,'service.before-limits.plist'));
  run('/bin/launchctl',['bootout',domain,plist]);fs.copyFileSync(temp,plist);fs.chmodSync(plist,0o600);
  run('/bin/launchctl',['bootstrap',domain,plist]);
  let ready=false;for(let i=0;i<30;i++){try{await health(env);ready=true;break;}catch{await delay(500);}}
  if(!ready)throw new Error('服务未就绪，机器人未修改；检查共享服务日志。');
  if(fs.readFileSync(path.join(runtime,'server.nofile'),'utf8').trim()!=='4096')throw new Error('实际资源限制未确认');
  console.log('共享服务已修复并重启：实际 soft nofile=4096；机器人配置未改动。');
}else if(command==='launch-desktop'){
  const env=JSON.parse(fs.readFileSync(stateFile));await health(env);
  if(desktopRunning(env))throw new Error('请先用 ⌘Q 完全退出 Desktop，再双击启动脚本。脚本不会强制终止正在运行的任务。');
  const log=fs.openSync(path.join(dir,'desktop.log'),'a',0o600);
  const child=spawn('/bin/sh',[path.join(root,'scripts/limit-exec.sh'),path.join(dir,'desktop.nofile'),env.desktop],{detached:true,stdio:['ignore',log,log],env:{...process.env,CODEX_APP_SERVER_WS_URL:env.url,CODEX_APP_SERVER_FORCE_CLI:'0'}});child.unref();fs.closeSync(log);
  console.log('Desktop 已按共享 WebSocket 配置启动；请在任务内继续验收。');
}else if(command==='rollback'){
  const c=loadConfig();idleBot(c);
  if(!fs.existsSync(backup))throw new Error('没有配置备份。');
  // Keep server alive: Desktop may still be using it. Stop it only after Desktop exits.
  fs.copyFileSync(backup,configFile);fs.chmodSync(configFile,0o600);
  run(process.execPath,[path.join(root,'scripts/service.mjs'),'restart']);
  console.log('机器人配置已恢复。共享服务仍保留，避免中断 Desktop；退出共享 Desktop 后可运行 stop-server。');
}else if(command==='stop-server'){
  const env=JSON.parse(fs.readFileSync(stateFile));
  if(desktopRunning(env))throw new Error('请先退出 Desktop。');
  const c=loadConfig();if(c.codex.appServerUrl===env.url)throw new Error('请先 rollback 恢复机器人配置。');
  run('/bin/launchctl',['bootout',domain,plist]);fs.unlinkSync(plist);console.log('共享服务已停止，原始备份保留。');
}else if(command==='status'){
  const env=JSON.parse(fs.readFileSync(stateFile));await health(env);console.log('共享服务握手和登录通过：'+env.url);
  const c=loadConfig();console.log('机器人连接该地址：'+(c.codex.appServerUrl===env.url));
}else throw new Error('用法：desktop-shared.mjs setup|repair-limits|status|launch-desktop|rollback|stop-server');
