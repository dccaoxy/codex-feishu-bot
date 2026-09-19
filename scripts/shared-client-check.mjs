// Real App Server + real Bot controller, simulated peer/UI. NOT a Desktop UI test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {loadConfig} from '../src/config.mjs';
import {CodexClient} from '../src/codex.mjs';
import {Bot} from '../src/bot.mjs';
import {Store} from '../src/store.mjs';
const c=loadConfig();if(c.codex.externalThreadPermission!=='work'||!c.codex.appServerUrl)throw new Error('Requires the configured local Work WebSocket server.');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-clients-')),store=new Store(dir);
const a=new CodexClient(c.codex.binary,{url:c.codex.appServerUrl}),b=new CodexClient(c.codex.binary,{url:c.codex.appServerUrl});
const output=[],requests=[],resolved=[],events=[];let id;
const ui={text:async(chat,text)=>output.push(text),stream:async()=>null,interactive:async()=>{},finish:async()=>{},update:async()=>{}};
const bot=new Bot({...c,storageDir:dir,streamIntervalMs:1000},store,b,ui,()=>{});
a.on('request',m=>requests.push(m));a.on('notification',m=>{events.push(m);if(m.method==='serverRequest/resolved')resolved.push(m.params.requestId);});
async function until(f,label,ms=60000){const end=Date.now()+ms;while(Date.now()<end){if(await f())return;await delay(100);}throw new Error('Timed out: '+label);}
async function complete(turn){await until(async()=>{const r=await bot.controller.turns(id);return r.data.some(t=>t.id===turn&&t.status!=='inProgress');},'turn completed');await until(()=>!bot.runs.has(id),'bot result delivered');}
const text=s=>[{type:'text',text:s}];
try{
  await a.start();await b.start();
  id=(await a.request('thread/start',{cwd:dir,sandbox:'read-only',approvalPolicy:'on-request',developerInstructions:'This is a disposable integration test. If the user says APPROVAL_PROBE, call exec_command exactly once with command /usr/bin/printf SHARED_APPROVAL_PROBE and sandbox_permissions=require_escalated, justification=双客户端审批测试，仅输出标记，无文件修改. Do not retry denied commands. Otherwise obey the short text request without tools.'})).thread.id;
  const warm=(await a.request('turn/start',{threadId:id,input:text('只回复 READY。')})).turn.id;await complete(warm);
  await bot.command('lab','/attach '+id);
  let turn=(await a.request('turn/start',{threadId:id,input:text('只回复 PEER_TO_BOT_OK。')})).turn.id;
  await complete(turn);assert.ok(output.some(x=>x.includes('PEER_TO_BOT_OK')));
  await bot.run('lab',text('只回复 BOT_TO_PEER_OK。'));turn=store.binding('lab').active_turn;await complete(turn);
  assert.ok(events.some(e=>e.method==='item/completed'&&e.params.item?.text?.includes('BOT_TO_PEER_OK')));
  turn=(await a.request('turn/start',{threadId:id,input:text('逐行输出 1 到 5000，每个数字一行，不使用工具。')})).turn.id;
  await until(()=>bot.runs.get(id)?.turn===turn,'peer turn observation');
  await bot.run('lab',text('追加：每行数字后增加点号，仍继续输出。'));
  assert.equal(store.binding('lab').active_turn,turn);await bot.command('lab','/stop');await complete(turn);
  assert.ok(events.some(e=>e.method==='turn/completed'&&e.params.turn.id===turn&&e.params.turn.status==='interrupted'));
  console.log('PASS bidirectional same-thread results + active steer/interrupt using real Bot and simulated peer/UI');
  // First approval is declined by the peer; the bot's already displayed action must expire.
  turn=(await a.request('turn/start',{threadId:id,input:text('APPROVAL_PROBE')})).turn.id;
  await until(()=>requests.some(m=>m.params.turnId===turn)&&bot.prompts.size,'approval delivered to both clients');
  let m=requests.find(m=>m.params.turnId===turn),token=[...bot.prompts.keys()][0];
  assert.equal(m.method,'item/commandExecution/requestApproval');assert.ok(["/bin/zsh -lc '/usr/bin/printf SHARED_APPROVAL_PROBE'","/bin/bash -lc '/usr/bin/printf SHARED_APPROVAL_PROBE'",'/usr/bin/printf SHARED_APPROVAL_PROBE'].includes(m.params.command),'Only the exact harmless probe command may be answered');
  a.respond(m.id,{decision:'decline'});await until(()=>!bot.prompts.has(token),'peer resolved bot prompt');
  await assert.rejects(bot.action('lab',{token,decision:'accept'}),/失效/);await complete(turn);
  console.log('PASS peer decline invalidates bot card; stale accept rejected');
  // Second harmless approval is accepted through Bot.action; a late peer decline must not rerun it.
  turn=(await a.request('turn/start',{threadId:id,input:text('APPROVAL_PROBE：新的一次独立测试，仅执行已指定的 printf。')})).turn.id;
  await until(()=>requests.some(m=>m.params.turnId===turn)&&bot.prompts.size,'second approval');
  m=requests.find(m=>m.params.turnId===turn);assert.ok(["/bin/zsh -lc '/usr/bin/printf SHARED_APPROVAL_PROBE'","/bin/bash -lc '/usr/bin/printf SHARED_APPROVAL_PROBE'",'/usr/bin/printf SHARED_APPROVAL_PROBE'].includes(m.params.command),'Only the exact harmless probe command may be answered');token=[...bot.prompts.keys()][0];
  await bot.action('lab',{token,decision:'accept'});await until(()=>resolved.includes(m.id),'bot resolution visible to peer');
  a.respond(m.id,{decision:'decline'});await complete(turn);
  const history=(await bot.controller.turns(id)).data.find(t=>t.id===turn);
  const commands=history.items.filter(i=>i.type==='commandExecution');
  assert.equal(commands.length,1);assert.equal(commands[0].exitCode,0);
  console.log('PASS bot accept resolves peer request; late peer decline does not rerun command (one printf, exit 0)');
}finally{
  await bot.close();
  if(id){try{const s=await bot.controller.inspect(id);if(s.turn)await a.request('turn/interrupt',{threadId:id,turnId:s.turn});await delay(500);await a.request('thread/archive',{threadId:id});}catch{console.error('Disposable test thread cleanup incomplete.');}}
  await b.close();await a.close();store.close();fs.rmSync(dir,{recursive:true,force:true});
}
