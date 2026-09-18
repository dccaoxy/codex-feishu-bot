import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Bot } from '../src/bot.mjs';
import { Store } from '../src/store.mjs';
import { CodexClient } from '../src/codex.mjs';
import { History } from '../src/history.mjs';
import { chunks, card, Feishu } from '../src/feishu.mjs';
import * as lark from '@larksuiteoapi/node-sdk';
import { quietLogger } from '../src/feishu.mjs';
import { Readable } from 'node:stream';

class FakeRpc extends EventEmitter {
  calls = []; responses = []; count = 0;
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start' || method === 'thread/fork') return { thread: { id: `t${++this.count}` } };
    if (method === 'turn/start') return { turn: { id: 'turn1' } };
    if (method === 'thread/turns/list') return { data: [{ id: 'turn0', status: 'completed', items: [
      { type: 'userMessage', content: [{ type: 'text', text: '旧问题' }] },
      { type: 'agentMessage', text: '旧结论' }, { type: 'reasoning', content: ['private'] },
    ] }], nextCursor: 'older' };
    if (method === 'model/list') return { data: [{ model: 'test-model', displayName: 'Test', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] };
    return {};
  }
  respond(id, result) { this.responses.push({ id, result }); }
  reject(id, message) { this.responses.push({ id, error: message }); }
}
class FakeFeishu {
  messages = []; updates = []; finishes = []; uploads = [];
  async text(chat, text) { this.messages.push({ chat,text }); }
  async interactive(chat, title, text, buttons) { this.messages.push({ chat,title,text,buttons }); }
  async stream() { return 'card1'; }
  async update(id,text,sequence) { this.updates.push({ id,text,sequence }); }
  async finish(id,sequence,summary) { this.finishes.push({ id,sequence,summary }); }
  async upload(chat,file) { this.uploads.push({ chat,file }); }
  async download(id,key,type,target) { fs.writeFileSync(target,'fake'); return target; }
}
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'feishu-bot-test-'));
  const config = { feishu: { appId: 'id', appSecret: 'very-secret', ownerOpenId: 'owner' },
    codex: { cwd: path.join(dir,'workspace'), sandbox: 'workspace-write', approvalPolicy: 'on-request', allowExternalThreadRead: false },
    storageDir: dir, streamIntervalMs: 100000, maxAttachmentMB: 1 };
  fs.mkdirSync(config.codex.cwd);
  const store = new Store(dir), rpc = new FakeRpc(), feishu = new FakeFeishu();
  const bot = new Bot(config,store,rpc,feishu,() => {});
  t.after(async () => {
    await bot.close();
    await Promise.all([...bot.runs.values()].map(r => r.finishPromise || r.flush));
    store.close(); fs.rmSync(dir,{recursive:true,force:true});
  });
  return { bot,store,rpc,feishu,dir,config };
}
function message(id,text,user='owner',chatType='p2p') {
  return { sender: { sender_type: 'user', sender_id: { open_id:user } },
    message: { message_id:id, chat_id:'chat', chat_type:chatType, message_type:'text', content:JSON.stringify({text}) } };
}
async function settled(bot) {
  for (let i=0; i<100 && bot.draining.size; i++) await delay(5);
  assert.equal(bot.draining.size,0,'inbox did not drain');
}

test('RPC handles out-of-order replies, errors, events, timeout and process death', async () => {
  const rpc = new CodexClient(process.execPath,{ args:['test/fixtures/rpc-server.mjs'],timeoutMs:500 });
  try {
    await rpc.start();
    const [a,b] = await Promise.all([rpc.request('echo',{value:1,delay:30}),rpc.request('echo',{value:2})]);
    assert.equal(a.value,1); assert.equal(b.value,2);
    await assert.rejects(rpc.request('error'),/test error/);
    let events=0, requests=0;
    rpc.on('notification',()=>events++); rpc.on('request',()=>requests++);
    await rpc.request('emit'); assert.equal(events,1); assert.equal(requests,1);
    await assert.rejects(rpc.request('silent',{},10),/超时/);
    await assert.rejects(rpc.request('exit'),/退出/);
    assert.equal(rpc.pending.size,0);
  } finally { await rpc.close(); }
});

test('duplicate message ID executes once; other users/groups are ignored', async t => {
  const {bot,rpc,store} = setup(t);
  bot.onMessage(message('m1','你好')); bot.onMessage(message('m1','你好'));
  bot.onMessage(message('m2','你好','stranger')); bot.onMessage(message('m3','你好','owner','group'));
  await settled(bot);
  assert.equal(rpc.calls.filter(c=>c.method==='turn/start').length,1);
  assert.equal(store.pending().length,0);
});

test('pairing requires local code, binds once, persists owner', async t => {
  const {bot,store} = setup(t); bot.owner='';
  bot.onMessage(message('1','/pair wrong','stranger')); assert.equal(bot.owner,'');
  bot.onMessage(message('2',`/pair ${bot.pairCode}`,'me'));
  assert.equal(bot.owner,'me'); assert.equal(store.get('owner'),'me'); assert.equal(bot.pairCode,'');
});

test('chat-issued pairing requires local approval, expires, and hot-loads owner', async t => {
  const {bot,store,rpc,config,feishu}=setup(t); config.feishu.ownerOpenId=''; bot.owner='';
  bot.onMessage(message('p1','你好','me'));
  assert.equal(bot.owner,''); assert.equal(rpc.calls.length,0);
  const p=store.db.prepare('SELECT * FROM pairing WHERE user=?').get('me');
  assert.match(feishu.messages.at(-1).text,new RegExp(p.code));
  assert.equal(store.requestPair('me','chat'),null);
  assert.throws(()=>store.approvePair('0000000000'),/无效/);
  assert.throws(()=>store.approvePair(p.code,p.expires+1),/过期/);
  store.approvePair(p.code); bot.refreshOwner();
  assert.equal(bot.owner,'me'); assert.match(feishu.messages.at(-1).text,/配对成功/);
  assert.throws(()=>store.approvePair(p.code),/已绑定/);
  bot.onMessage(message('p2','开始','me')); await settled(bot);
  assert.equal(rpc.calls.filter(c=>c.method==='turn/start').length,1);
});

test('new messages steer active turn and switching is blocked until completion', async t => {
  const {bot,rpc} = setup(t);
  await bot.run('chat',[{type:'text',text:'开始'}]);
  await bot.run('chat',[{type:'text',text:'补充'}]);
  assert.equal(rpc.calls.at(-1).method,'turn/steer');
  assert.equal(rpc.calls.at(-1).params.expectedTurnId,'turn1');
  await assert.rejects(bot.command('chat','/new'),/仍在执行/);
  await bot.command('chat','/stop'); assert.equal(rpc.calls.at(-1).method,'turn/interrupt');
});

test('history read is read-only, scoped, paginated, excludes reasoning', async t => {
  const {store,rpc} = setup(t); store.addThread('t1','设计方案');
  const history = new History(rpc,store,false);
  await assert.rejects(history.read('outside'),/不属于机器人/);
  const r = await history.read('t1');
  assert.equal(r.nextCursor,'older'); assert.equal(r.turns[0].messages.length,2);
  assert.ok(!JSON.stringify(r).includes('private'));
  assert.ok(!rpc.calls.some(c=>c.method==='thread/resume'||c.method==='turn/start'));
});

test('natural-language history tool returns scoped data to current turn', async t => {
  const {bot,rpc,store} = setup(t); store.addThread('old','先前方案');
  await bot.run('chat',[{type:'text',text:'参考先前方案'}]);
  await bot.serverRequest({id:9,method:'item/tool/call',params:{threadId:'t1',tool:'feishu_threads_search',arguments:{query:'先前'}}});
  assert.equal(rpc.responses.at(-1).result.success,true);
  assert.match(rpc.responses.at(-1).result.contentItems[0].text,/先前方案/);
});

test('approval is bound to chat, one-shot, preserves rejection', async t => {
  const {bot,rpc,feishu} = setup(t);
  await bot.run('chat',[{type:'text',text:'开始'}]);
  await bot.serverRequest({id:10,method:'item/commandExecution/requestApproval',params:{threadId:'t1',command:'echo test'}});
  const value = feishu.messages.at(-1).buttons[1].value;
  await assert.rejects(bot.action('wrong-chat',value),/失效/);
  await bot.action('chat',value);
  assert.deepEqual(rpc.responses.at(-1),{id:10,result:{decision:'decline'}});
  await assert.rejects(bot.action('chat',value),/失效/);
});

test('multi-question clarification waits for every answer', async t => {
  const {bot,rpc,feishu} = setup(t);
  await bot.run('chat',[{type:'text',text:'开始'}]);
  await bot.serverRequest({id:11,method:'item/tool/requestUserInput',params:{threadId:'t1',questions:[
    {id:'q1',question:'颜色',options:[{label:'蓝色'}]}, {id:'q2',question:'尺寸',options:[]},
  ]}});
  const token = [...bot.prompts.keys()][0];
  await bot.action('chat',{token,question:'q1',answer:'蓝色'}); assert.equal(rpc.responses.length,0);
  await bot.command('chat',`/answer ${token} q2 A4`);
  assert.deepEqual(rpc.responses.at(-1).result,{answers:{q1:{answers:['蓝色']},q2:{answers:['A4']}}});
});

test('stale card callback cannot affect another turn or user', async t => {
  const {bot,rpc,feishu} = setup(t);
  await bot.run('chat',[{type:'text',text:'开始'}]);
  await bot.serverRequest({id:12,method:'item/commandExecution/requestApproval',params:{threadId:'t1',command:'echo'}});
  const value = feishu.messages.at(-1).buttons[0].value;
  assert.equal(bot.onAction({operator:{open_id:'stranger'},context:{open_chat_id:'chat'},action:{value}}).toast.type,'error');
  bot.notification({method:'serverRequest/resolved',params:{threadId:'t1',requestId:12}});
  assert.match(bot.onAction({operator:{open_id:'owner'},context:{open_chat_id:'chat'},action:{value}}).toast.content,/过期/);
  assert.equal(rpc.responses.length,0);
});

test('stream final is authoritative and clears active state', async t => {
  const {bot,feishu} = setup(t);
  await bot.run('chat',[{type:'text',text:'开始'}]);
  const r=bot.runs.get('t1');
  bot.notification({method:'item/agentMessage/delta',params:{threadId:'t1',itemId:'a',delta:'草稿'}});
  await bot.flushRun(r);
  bot.notification({method:'item/completed',params:{threadId:'t1',item:{id:'a',type:'agentMessage',phase:'final_answer',text:'最终结果'}}});
  bot.notification({method:'turn/completed',params:{threadId:'t1',turn:{id:'turn1',status:'completed'}}});
  await r.finishPromise;
  assert.equal(feishu.updates.at(-1).text,'最终结果'); assert.equal(feishu.finishes.at(-1).summary,'已完成');
  assert.equal(bot.runs.size,0);
  assert.ok(feishu.finishes.at(-1).sequence > feishu.updates.at(-1).sequence);
});

test('missing streaming permission falls back to final text', async t => {
  const {bot,feishu}=setup(t); feishu.stream=async()=>{throw new Error('forbidden');};
  await bot.run('chat',[{type:'text',text:'开始'}]);
  const r=bot.runs.get('t1'); r.messages.set('a',{text:'纯文字结果',phase:'final_answer'});
  bot.endRun(r,'completed'); await r.finishPromise;
  assert.equal(feishu.messages.at(-1).text,'纯文字结果');
});

test('delivery failure before model start leaves no stuck active run', async t => {
  const {bot,rpc,feishu}=setup(t);
  feishu.stream=feishu.text=async()=>{throw new Error('offline');};
  await assert.rejects(bot.run('chat',[{type:'text',text:'开始'}]),/offline/);
  assert.equal(bot.runs.size,0); assert.ok(!rpc.calls.some(c=>c.method==='turn/start'));
});

test('oversized answer is returned as complete artifact', async t => {
  const {bot,feishu}=setup(t);
  await bot.run('chat',[{type:'text',text:'开始'}]); const r=bot.runs.get('t1');
  const full='中文'.repeat(7000); r.messages.set('a',{text:full,phase:'final_answer'});
  bot.endRun(r,'completed'); await r.finishPromise;
  assert.equal(feishu.uploads.length,1); assert.equal(fs.readFileSync(feishu.uploads[0].file,'utf8'),full);
});

test('export refuses traversal and symlinks escaping workspace', async t => {
  const {bot,dir,config,feishu}=setup(t);
  const secret=path.join(dir,'secret'); fs.writeFileSync(secret,'secret');
  fs.symlinkSync(secret,path.join(config.codex.cwd,'link'));
  await assert.rejects(bot.sendFile('chat','../secret'),/只能发送/);
  await assert.rejects(bot.sendFile('chat','link'),/只能发送/);
  const file=path.join(config.codex.cwd,'result.txt'); fs.writeFileSync(file,'hello');
  await bot.sendFile('chat',file); assert.equal(feishu.uploads.length,1);
});

test('restart marks uncertain work and never repeats a model call', async t => {
  const {bot,store,rpc}=setup(t);
  store.enqueue('old','chat',{}); store.mark('old','processing');
  store.saveRun({thread:'old-thread',chat:'chat',state:'running',card:'old-card',sequence:4});
  await bot.recover(); assert.equal(rpc.calls.length,0);
  assert.equal(store.uncertain().length,0); assert.equal(store.unfinished().length,0);
});

test('UTF-8 chunks preserve text and stay within byte budget',()=>{
  const text='中文😀\\\n'.repeat(10000), parts=chunks(text,10000);
  assert.equal(parts.join(''),text); assert.ok(parts.every(p=>Buffer.byteLength(p)<=10000));
  assert.equal(card('title','text',[{label:'同意',value:{token:'a'}}]).body.elements[1].behaviors[0].type,'callback');
});

test('Feishu send retries retain the same dedup UUID',async()=>{
  const f=Object.create(Feishu.prototype); f.queue=Promise.resolve(); f.lastCall=0;
  const seen=[]; let n=0;
  f.client={im:{v1:{message:{create:async p=>{seen.push(p.data.uuid); if(n++===0) return {code:230020,msg:'limited'}; return {code:0,data:{message_id:'m'}};}}}}};
  assert.equal((await f.send('chat','text',{text:'hi'},'stable')).message_id,'m');
  assert.deepEqual(seen,['stable','stable']);
});

test('official Feishu dispatcher normalizes v2 message and card callback envelopes',async t=>{
  const {bot,rpc,feishu}=setup(t);
  const dispatcher=new lark.EventDispatcher({logger:quietLogger}).register({
    'im.message.receive_v1':d=>bot.onMessage(d), 'card.action.trigger':d=>bot.onAction(d),
  });
  await dispatcher.invoke({schema:'2.0',header:{event_type:'im.message.receive_v1',event_id:'event1'},event:message('sdk-message','开始')},{needCheck:false});
  await settled(bot);
  assert.equal(rpc.calls.filter(c=>c.method==='turn/start').length,1);
  await bot.serverRequest({id:13,method:'item/commandExecution/requestApproval',params:{threadId:'t1',command:'echo test'}});
  const value=feishu.messages.at(-1).buttons[0].value;
  const ack=await dispatcher.invoke({schema:'2.0',header:{event_type:'card.action.trigger',event_id:'event2'},event:{
    operator:{open_id:'owner'},context:{open_chat_id:'chat',open_message_id:'cardmsg'},action:{value},
  }},{needCheck:false});
  assert.equal(ack.toast.type,'info'); await settled(bot);
  assert.equal(rpc.responses.at(-1).result.decision,'accept');
});

test('attachment streaming limit removes partial downloaded file',async t=>{
  const {dir}=setup(t); const f=Object.create(Feishu.prototype);
  f.config={maxAttachmentMB:1}; f.call=async fn=>fn();
  f.client={im:{v1:{messageResource:{get:async()=>({getReadableStream:()=>Readable.from([Buffer.alloc(1024*1024+1)])})}}}};
  const target=path.join(dir,'too-big');
  await assert.rejects(f.download('m','key','file',target),/大小限制/);
  assert.equal(fs.existsSync(target),false);
});

test('model selection rejects unknown models and resets incompatible effort',async t=>{
  const {bot,store}=setup(t);
  store.updateChat('chat',{effort:'ultra'});
  await assert.rejects(bot.command('chat','/model unknown'),/模型不可用/);
  await bot.command('chat','/model test-model');
  assert.equal(store.chat('chat').model,'test-model'); assert.equal(store.chat('chat').effort,'low');
});

test('MCP form requires explicit submit, validates typed fields, and is chat-bound and one-shot', async t => {
  const {bot,rpc} = setup(t);
  await bot.run('chat',[{type:'text',text:'test'}]);
  await bot.serverRequest({id:901,method:'mcpServer/elicitation/request',params:{threadId:'t1',serverName:'test',mode:'form',message:'Allow operation?',requestedSchema:{type:'object',properties:{allow:{type:'boolean'},count:{type:'integer',minimum:1}},required:['allow','count']}}});
  const token = [...bot.prompts.keys()][0];
  await assert.rejects(bot.action('other',{token,decision:'accept'}));
  await assert.rejects(bot.action('chat',{token,decision:'accept'}),/必填/);
  await assert.rejects(bot.action('chat',{token,question:'allow',answer:'yes'}));
  await bot.action('chat',{token,question:'allow',answer:'false'});
  await assert.rejects(bot.action('chat',{token,question:'count',answer:'0'}));
  await bot.action('chat',{token,question:'count',answer:'2'});
  assert.equal(rpc.responses.length,0);
  await bot.action('chat',{token,decision:'accept'});
  assert.deepEqual(rpc.responses.at(-1),{id:901,result:{action:'accept',content:{allow:false,count:2}}});
  await assert.rejects(bot.action('chat',{token,decision:'accept'}));
});

test('MCP URL confirmation and decline use correct response shapes; unsafe and native requests fail closed', async t => {
  const {bot,rpc} = setup(t);
  await bot.run('chat',[{type:'text',text:'test'}]);
  let id=910;
  const request = async params => bot.serverRequest({id:++id,method:'mcpServer/elicitation/request',params:{threadId:'t1',serverName:'test',message:'Authorize',...params}});
  await request({mode:'url',url:'https://example.com/auth',elicitationId:'x'});
  await bot.action('chat',{token:[...bot.prompts.keys()][0],decision:'accept'});
  assert.deepEqual(rpc.responses.at(-1).result,{action:'accept',content:null});
  await request({mode:'form',requestedSchema:{type:'object',properties:{}}});
  await bot.action('chat',{token:[...bot.prompts.keys()][0],decision:'decline'});
  assert.deepEqual(rpc.responses.at(-1).result,{action:'decline',content:null});
  for (const params of [{mode:'url',url:'javascript:alert(1)'},{mode:'openai/userVerification',challenge:'private'},{mode:'form',requestedSchema:{type:'object',properties:{password:{type:'string'}}}}]) {
    const before = rpc.responses.length;
    await request(params);
    assert.equal(rpc.responses.length,before+1);
    assert.deepEqual(rpc.responses.at(-1).result,{action:'decline',content:null});
    assert.equal(bot.prompts.size,0);
  }
});

test('legacy conversations migrate once with history reference and all new tools', async t => {
  const {bot,store,rpc}=setup(t);
  store.addThread('legacy','旧任务'); store.updateChat('chat',{thread:'legacy'});
  await bot.run('chat',[{type:'text',text:'继续'}]);
  const start=rpc.calls.find(c=>c.method==='thread/start');
  assert.ok(start.params.dynamicTools.some(t=>t.name==='feishu_doc_create'));
  const turn=rpc.calls.find(c=>c.method==='turn/start');
  assert.match(turn.params.input[0].text,/legacy/);
  assert.match(turn.params.input[0].text,/旧结论/);
  assert.ok(store.ownThread('legacy'));
  assert.equal(store.get(`tools:${store.chat('chat').thread}`),'docs-v1');
});

test('extended MCP forms validate named enums, arrays, nested data and format before submit', async t=>{
  const {bot,rpc}=setup(t);await bot.run('chat',[{type:'text',text:'test'}]);
  await bot.serverRequest({id:1001,method:'mcpServer/elicitation/request',params:{threadId:'t1',serverName:'test',mode:'openai/form',message:'确认',requestedSchema:{type:'object',properties:{choice:{type:'string',oneOf:[{const:'yes',title:'同意'},{const:'no',title:'拒绝'}]},values:{type:'array',items:{type:'string',enum:['a','b']},minItems:1}},required:['choice','values']}}});
  const token=[...bot.prompts.keys()][0];
  await bot.action('chat',{token,question:'choice',answer:'invalid'});
  await bot.action('chat',{token,question:'values',answer:'["a"]'});
  await assert.rejects(bot.action('chat',{token,decision:'accept'}),/表单/);
  await bot.action('chat',{token,question:'choice',answer:'yes'});
  await bot.action('chat',{token,decision:'accept'});
  assert.deepEqual(rpc.responses.at(-1).result.content,{choice:'yes',values:['a']});
});
