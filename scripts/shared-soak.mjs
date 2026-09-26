// Short real-model soak. Only disposable threads; no Feishu messages/production config changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {CodexClient} from '../src/codex.mjs';
import {collect} from './fd-telemetry.mjs';
import {ThreadController} from '../src/thread-controller.mjs';
const turns=(rpc,id)=>new ThreadController({},null,rpc).turns(id);
const env=JSON.parse(fs.readFileSync(new URL('../data/shared-lab/environment.json',import.meta.url)));
const record=path.join(os.homedir(),'Library/Application Support/codex-feishu-shared-lab/server.nofile.json');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-soak-'));
const out=new URL('../data/shared-lab/soak-'+Date.now()+'.json',import.meta.url);
const result={started:new Date().toISOString(),scope:'short protocol/model soak; not Desktop/Feishu UI, sleep/wake or overnight',samples:[],turns:0,toolCalls:0,reconnects:0,cleanupErrors:0};
const ids=[];let a,b;
const make=async()=>{const c=new CodexClient(env.binary,{url:env.url,timeoutMs:10000});c.on('request',m=>{if(!ids.includes(m.params?.threadId))return;try{c.reject(m.id,'Soak does not grant approvals or handle client tools');}catch{}});try{await c.start();return c;}catch(e){await c.close();throw e;}};
async function snapshot(phase){const {details,...s}=await collect(env,record);result.samples.push({...s,phase});fs.writeFileSync(out,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({phase,fd:s.fdTotal,rss:s.rssKiB,level:s.level}));if(s.level==='critical')throw new Error('critical resource threshold');}
async function turn(c,id,prompt){const t=(await c.request('turn/start',{threadId:id,input:[{type:'text',text:prompt}]})).turn.id;const deadline=Date.now()+90000;while(Date.now()<deadline){const r=await turns(c,id);const row=r.data.find(x=>x.id===t);if(row&&row.status!=='inProgress'){if(row.status!=='completed')throw new Error('soak turn did not complete: '+row.status+' '+JSON.stringify(row.error));result.turns++;const cmds=row.items.filter(i=>i.type==='commandExecution');if(cmds.some(x=>x.exitCode!==0))throw new Error('tool did not succeed');result.toolCalls+=cmds.length;return;}await delay(1000);}throw new Error('soak turn timeout');}
try{
 await snapshot('baseline');a=await make();b=await make();
 for(let cycle=0;cycle<3;cycle++){
  const id=(await a.request('thread/start',{cwd:dir,sandbox:'read-only',approvalPolicy:'on-request',developerInstructions:'Disposable stability test. Execute only the requested harmless printf command, without escalated permissions, file edits, web or MCP calls. Do not retry failures.'})).thread.id;ids.push(id);
  await turn(a,id,'使用本地命令工具执行 /usr/bin/printf SOAK_OK，然后回复 OK。不要写文件，不要申请额外权限。');
  await b.request('thread/resume',{threadId:id});
  await turn(b,id,'只回复 SECOND_OK，不使用工具。');
  await snapshot('cycle-'+(cycle+1));await b.close();b=null;await delay(1000);await snapshot('disconnected-'+(cycle+1));b=await make();result.reconnects++;
  await delay(60000);
 }
 await a.close();a=null;await b.close();b=null;await delay(60000);await snapshot('settled');
 result.finished=new Date().toISOString();result.status=result.toolCalls>=3?'short-soak-completed':'incomplete-tool-coverage';if(result.toolCalls<3)process.exitCode=1;
}catch(e){console.error(String(e.message).replaceAll(dir,'<test-directory>'));result.status='failed';result.finished=new Date().toISOString();process.exitCode=1;}
finally{
 if(!a)try{a=await make();}catch{}
 for(const id of ids)try{const r=await turns(a,id);for(const t of r.data||[])if(t.status==='inProgress')await a.request('turn/interrupt',{threadId:id,turnId:t.id});await a.request('thread/archive',{threadId:id});}catch{result.cleanupErrors++;}
 await a?.close();await b?.close();await delay(2000);try{await snapshot('after-cleanup');}catch{result.status='failed';process.exitCode=1;}fs.rmSync(dir,{recursive:true,force:true});if(result.cleanupErrors){result.status='cleanup-incomplete';process.exitCode=1;}fs.writeFileSync(out,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({status:result.status,turns:result.turns,toolCalls:result.toolCalls,reconnects:result.reconnects,cleanupErrors:result.cleanupErrors}));
}
