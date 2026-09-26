// Explicit opt-in: sends two real test results to the paired owner's latest single chat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {loadConfig} from '../src/config.mjs';
import {CodexClient} from '../src/codex.mjs';
import {Bot} from '../src/bot.mjs';
import {Store} from '../src/store.mjs';
import {Feishu} from '../src/feishu.mjs';
if(!process.argv.includes('--send'))throw new Error('This test sends real Feishu messages; use --send only with authorization.');
const c=loadConfig();assert.equal(c.codex.externalThreadPermission,'work');assert.ok(c.codex.appServerUrl);
const db=new DatabaseSync(path.join(c.storageDir,'state.sqlite'),{readOnly:true});
const owner=c.feishu.ownerOpenId||db.prepare("SELECT value FROM settings WHERE key='owner'").get()?.value;
assert.ok(owner);const chat=db.prepare("SELECT chat FROM inbox WHERE json_extract(payload,'$.user')=? AND json_extract(payload,'$.message.chat_type')='p2p' ORDER BY received DESC LIMIT 1").get(owner)?.chat;db.close();assert.ok(chat,'No verified owner chat available.');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feishu-live-work-')),store=new Store(dir),opts={url:c.codex.appServerUrl};
const a=new CodexClient(c.codex.binary,opts),b=new CodexClient(c.codex.binary,opts),feishu=new Feishu(c);
let sent=0,finished=0,id;const send=feishu.send.bind(feishu);feishu.send=async(...args)=>{const r=await send(...args);sent++;return r;};const finish=feishu.finish.bind(feishu);feishu.finish=async(...args)=>{const r=await finish(...args);finished++;return r;};
const errors=[];const bot=new Bot({...c,storageDir:dir},store,b,feishu,s=>errors.push(s));
a.on('request',m=>a.reject(m.id,'This test authorizes no tools'));
async function done(turn){for(let i=0;i<120;i++){await delay(500);const page=await bot.controller.turns(id);if(page.data.some(t=>t.id===turn&&t.status!=='inProgress')&&!bot.runs.has(id))return;}throw new Error('Test did not finish');}
try{
await a.start();await b.start();id=(await a.request('thread/start',{cwd:dir,sandbox:'read-only',approvalPolicy:'on-request',developerInstructions:'Only reply with requested test text. Do not call tools.'})).thread.id;
let turn=(await a.request('turn/start',{threadId:id,input:[{type:'text',text:'只回复 READY'}]})).turn.id;await done(turn);
await bot.controller.attach(chat,id);
turn=(await a.request('turn/start',{threadId:id,input:[{type:'text',text:'只回复：联调自动测试 1：共享服务器 → 飞书结果回传成功。此为协议客户端测试，Desktop 尚待人工启动，无需回复。'}]})).turn.id;await done(turn);
await bot.run(chat,[{type:'text',text:'只回复：联调自动测试 2：Bot → 同一 Thread 继续工作成功。此测试输入来自本地脚本，飞书收消息和按钮点击仍待人工验收，无需回复。'}]);turn=store.binding(chat).active_turn;await done(turn);
assert.ok(sent>=2);assert.equal(finished,2);assert.equal(errors.length,0);console.log('PASS: two real Feishu streamed cards created, updated and finished; input was local harness, not real inbound Feishu or Desktop UI.');
}finally{await bot.close();if(id){try{const s=await bot.controller.inspect(id);if(s.turn)await a.request('turn/interrupt',{threadId:id,turnId:s.turn});await delay(500);await a.request('thread/archive',{threadId:id});}catch{console.error('Test cleanup incomplete.');}}await b.close();await a.close();feishu.close();store.close();fs.rmSync(dir,{recursive:true,force:true});}
