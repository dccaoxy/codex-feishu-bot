import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { CodexClient } from '../src/codex.mjs';
import { TOOLS } from '../src/history.mjs';

// Explicit live integration check: uses one short model turn and archives its test thread.
const docsMode=process.argv.includes('--docs');
const toolName=docsMode?'feishu_doc_read':'feishu_threads_search';
const config = loadConfig(undefined, false);
const rpc = new CodexClient(config.codex.binary, {url: config.codex.appServerUrl, socketPath: config.codex.appServerSocket});
let threadId, forkId, called = false, result = '', timer;
try {
  await rpc.start();
  const models = await rpc.request('model/list', {limit:100});
  const model = models.data.find(m=>m.isDefault) || models.data[0];
  const effort = model.supportedReasoningEfforts.find(e=>e.reasoningEffort==='low')?.reasoningEffort || model.defaultReasoningEffort;
  const r = await rpc.request('thread/start', {cwd:config.codex.cwd, sandbox:'read-only', approvalPolicy:'on-request',
    dynamicTools:TOOLS, model:model.model, developerInstructions:'这是本地协议集成测试。仅调用指定的只读工具，不访问文件或外部服务。'});
  threadId=r.thread.id;
  await rpc.request('thread/name/set',{threadId,name:'[测试] 飞书机器人协议验证'});
  rpc.on('request', m=>{
    if(m.method==='item/tool/call' && m.params.tool===toolName) {
      called=true;
      rpc.respond(m.id,{success:true,contentItems:[{type:'inputText',text:'{"threads":[],"note":"测试成功"}'}]});
    } else rpc.reject(m.id,'Test only supports feishu_threads_search');
  });
  const completed=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error('Live turn timed out')),90000);
    rpc.on('notification',m=>{
      if(m.params?.threadId!==threadId)return;
      if(m.method==='item/completed'&&m.params.item.type==='agentMessage')result=m.params.item.text;
      if(m.method==='turn/completed') {
        clearTimeout(timer);
        m.params.turn.status==='completed'?resolve():reject(new Error(`Turn ${m.params.turn.status}: ${m.params.turn.error?.message || ''}`));
      }
    });
  });
  // Attach handler immediately so a request failure cannot leave an unhandled timeout rejection.
  completed.catch(()=>{});
  await rpc.request('turn/start',{threadId,input:[{type:'text',text:docsMode?'请调用 feishu_doc_read，documentId 为 testDocument。这是模拟工具路由测试。完成后只回复“验证通过”。':'请调用 feishu_threads_search，query 为“验证”。完成后只回复“验证通过”。'}],effort});
  await completed;
  assert.ok(called,'Model did not invoke dynamic tool'); assert.ok(result,'No assistant result');
  const history=await rpc.request('thread/read',{threadId,includeTurns:true});
  assert.ok(history.thread.turns.length>0,'No persisted history');
  const fork=await rpc.request('thread/fork',{threadId,cwd:config.codex.cwd,sandbox:'read-only',approvalPolicy:'on-request',excludeTurns:true,deferGoalContinuation:true});
  forkId=fork.thread.id;
  await rpc.request('thread/unsubscribe',{threadId});
  await rpc.request('thread/resume',{threadId,cwd:config.codex.cwd,sandbox:'read-only',approvalPolicy:'on-request',excludeTurns:true});
  console.log('✓ Real model turn / dynamic tool round-trip / final events / persisted history / fork / resume passed.');
} finally {
  clearTimeout(timer);
  for(const id of [forkId,threadId].filter(Boolean)) {
    try {await rpc.request('thread/archive',{threadId:id});}catch{}
  }
  await rpc.close();
}
