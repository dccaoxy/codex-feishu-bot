// Real shared-server Work check. Uses disposable threads and short model calls;
// sends no Feishu messages and never attaches a user's existing thread.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {loadConfig} from '../src/config.mjs';
import {CodexClient} from '../src/codex.mjs';
import {Store} from '../src/store.mjs';
import {ThreadController} from '../src/thread-controller.mjs';

const config=loadConfig(undefined,false);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feishu-work-check-'));
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
const url=process.argv.includes('--unix') ? null : `ws://127.0.0.1:${port}`;
const socketPath=url ? null : path.join(fs.realpathSync(dir),'server.sock');
const daemon=spawn(config.codex.binary,['app-server','--listen',url || 'unix://'+socketPath],{stdio:'ignore',env:{...process.env,FEISHU_APP_ID:'',FEISHU_APP_SECRET:''}});
const a=new CodexClient(config.codex.binary,{url,socketPath,timeoutMs:15000}),b=new CodexClient(config.codex.binary,{url,socketPath,timeoutMs:15000});
const store=new Store(dir),ids=[];
const controller=new ThreadController({...config,codex:{...config.codex,externalThreadPermission:'work',appServerUrl:url,appServerSocket:socketPath}},store,b);
const calls=[];const request=b.request.bind(b);b.request=(method,params,...rest)=>{calls.push({method,params});return request(method,params,...rest);};
a.on('request',m=>a.reject(m.id,'Test does not authorize tools'));
b.on('request',m=>b.reject(m.id,'Test does not authorize tools'));
async function waitIdle(id, turnId) {
  for(let i=0;i<120;i++) {const r=await controller.turns(id);const t=turnId?r.data.find(t=>t.id===turnId):r.data[0];if(t && t.status!=='inProgress')return;await delay(500);}
  throw new Error('Test turn did not become idle');
}
try {
  for(let i=0;i<100;i++) {
    const ready=await new Promise(resolve=>{const s=socketPath ? net.connect(socketPath) : net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));});
    if(ready)break;if(daemon.exitCode!==null)throw new Error('Test server exited');await delay(50);
  }
  await a.start();await b.start();
  const {thread}=await a.request('thread/start',{cwd:dir,sandbox:'read-only',approvalPolicy:'on-request',
    developerInstructions:'This is a disposable protocol test. Do not call tools or modify files. Follow only the short output request.'});
  ids.push(thread.id);
  const first=await a.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'仅回复 WORK_TEST_OK。不要使用工具。'}]});
  await waitIdle(thread.id,first.turn.id);
  await controller.attach('test-chat',thread.id);
  assert.equal(store.chat('test-chat').thread,thread.id);
  const sent=await controller.send('test-chat',[{type:'text',text:'请输出从 1 到 1000 的数字，每个数字一行。不要使用工具。'}]);
  assert.equal(sent.kind,'start');
  const active=await controller.status('test-chat');assert.equal(active.status,'active');
  const raced=await a.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'保持当前要求。'}]});
  assert.equal(raced.turn.id,active.turn,'shared server must coalesce a racing start into the active turn');
  const steered=await controller.send('test-chat',[{type:'text',text:'改为仅回复 STEER_OK。'}]);
  assert.equal(steered.kind,'steer');assert.equal(steered.turnId,active.turn);
  const fork=await controller.fork('test-chat');ids.push(fork.id);assert.notEqual(fork.id,thread.id);
  await controller.attach('test-chat',thread.id);
  await controller.interrupt('test-chat');await waitIdle(thread.id);
  const starts=calls.filter(c=>c.method==='turn/start');assert.equal(starts.length,1);
  assert.equal(starts[0].params.threadId,thread.id);
  controller.disconnected();assert.equal(store.binding('test-chat').status,'unknown');
  await controller.status('test-chat');controller.detach('test-chat');assert.equal(store.binding('test-chat'),undefined);
  console.log('PASS: shared-client same-thread resume/start/steer/fork/interrupt and persisted binding; no Feishu messages.');
} finally {
  for(const id of ids) {
    try {const s=await controller.inspect(id);if(s.status==='active'&&s.turn)await a.request('turn/interrupt',{threadId:id,turnId:s.turn});await waitIdle(id);await a.request('thread/archive',{threadId:id});}catch{console.error('A disposable test thread could not be archived.');}
  }
  await b.close();await a.close();daemon.kill('SIGTERM');store.close();fs.rmSync(dir,{recursive:true,force:true});
}
