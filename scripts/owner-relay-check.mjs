// Isolated native protocol check. No model/Feishu call or production connection.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import {CodexClient} from '../src/codex.mjs';
const binary=process.env.OWNER_CODEX_BINARY||'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-relay-'));
fs.writeFileSync(path.join(dir,'config.toml'),'approval_policy = "on-request"\nsandbox_mode = "read-only"\n');
const rpc=new CodexClient(binary,{cwd:dir,env:{PATH:process.env.PATH,CODEX_HOME:dir,TMPDIR:dir}});
const server=http.createServer((req,res)=>{
 req.resume();req.on('end',()=>{
  const item={type:'message',id:'msg',role:'assistant',content:[{type:'output_text',text:'synthetic relay fixture'}]};
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  for(const event of [{type:'response.created',response:{id:'fixture'}},{type:'response.output_item.added',output_index:0,item},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('data: '+JSON.stringify(event)+'\n\n');
  res.end();
 });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let timer;
try {
 await rpc.start();
 for(const overrides of [{},{sandbox:'workspace-write'}]) {
 const started=await rpc.request('thread/start',{cwd:dir,...overrides,model:'gpt-5.4',modelProvider:'fixture',config:{model_providers:{fixture:{name:'Offline fixture',base_url:`http://127.0.0.1:${server.address().port}/v1`,wire_api:'responses',requires_openai_auth:false}}}});
 assert.equal(started.approvalPolicy,'on-request');assert.equal(started.sandbox.type,overrides.sandbox?'workspaceWrite':'readOnly');
 const completed=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('synthetic turn timed out')),30000);rpc.on('notification',m=>{if(m.method==='turn/completed' && m.params.threadId===started.thread.id)resolve(m);});});
 await rpc.request('turn/start',{threadId:started.thread.id,input:[{type:'text',text:'fixture',text_elements:[]}]});
 const result=await completed;clearTimeout(timer);assert.equal(result.params.turn.status,'completed');
 const resumed=await rpc.request('thread/resume',{threadId:started.thread.id,excludeTurns:true});
 assert.equal(resumed.thread.id,started.thread.id);
 assert.deepEqual(resumed.approvalPolicy,started.approvalPolicy);
 assert.deepEqual(resumed.sandbox,started.sandbox);
 assert.deepEqual(resumed.approvalsReviewer,started.approvalsReviewer);
 }
 console.log('PASS: native runtime defaults inherited; same loaded Thread resumed without permission or reviewer overrides. Local synthetic provider only; no real model/Feishu call.');
} finally {clearTimeout(timer);await rpc.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
