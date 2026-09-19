// Read-only load probe against the shared lab; no resume, model calls or Feishu.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {CodexClient} from '../src/codex.mjs';
const env=JSON.parse(fs.readFileSync(new URL('../data/shared-lab/environment.json',import.meta.url)));
const port=new URL(env.url).port;
const pid=execFileSync('/usr/sbin/lsof',['-t','-iTCP:'+port,'-sTCP:LISTEN'],{encoding:'utf8'}).trim();
assert.match(pid,/^\d+$/);
function fds(){const s=execFileSync('/usr/sbin/lsof',['-nP','-a','-p',pid,'-Ff'],{encoding:'utf8'});return s.split('\n').filter(l=>/^f\d+$/.test(l)).length;}
const log=new URL('../data/shared-lab/server.error.log',import.meta.url),before=fs.statSync(log).size;
let reads=0;const samples=[];
for(let batch=0;batch<6;batch++){
  const clients=[];
  try{
    for(let i=0;i<40;i++){const c=new CodexClient(env.binary,{url:env.url,timeoutMs:10000});clients.push(c);await c.start();}
    const peak=fds();
    const page=await clients[0].request('thread/list',{limit:10});
    for(const c of clients)for(const t of page.data){await c.request('thread/read',{threadId:t.id,includeTurns:false});reads++;}
    for(const c of clients)await c.close();clients.length=0;
    await delay(1500);samples.push({batch:batch+1,peak,settled:fds()});console.log(JSON.stringify(samples.at(-1)));
  }finally{await Promise.allSettled(clients.map(c=>c.close()));}
}
const growth=samples.at(-1).settled-samples[0].settled;
const added=fs.readFileSync(log).subarray(before).toString();
assert.ok(!added.includes('Too many open files'),'new EMFILE errors');assert.ok(growth<=8,'settled descriptors grew by more than 8');
const result={at:new Date().toISOString(),connections:240,reads,samples,growth,newEmfile:0,scope:'read-only connections/history; not long-running model/Desktop tool workload'};
fs.writeFileSync(new URL('../data/shared-lab/resource-check.json',import.meta.url),JSON.stringify(result,null,2),{mode:0o600});console.log('PASS '+JSON.stringify(result));
