// Isolated protocol probe: local synthetic provider, no credentials, no model
// service, and no Feishu. Not a production launcher or a complete tool adapter.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {CodexClient} from '../src/codex.mjs';
import {GROUP_STARTUP_CONFIG,groupThreadParams} from '../src/group-model.mjs';
import {OwnerRuntime} from '../test/fixtures/owner-runtime-prototype.mjs';

const binary=process.env.OWNER_CODEX_BINARY||'/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
assert.equal(execFileSync(binary,['--version'],{encoding:'utf8'}).trim(),'codex-cli 0.160.0');
const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'owner-probe-')));
const project=path.join(dir,'project'),outside=path.join(dir,'outside');fs.mkdirSync(project);fs.mkdirSync(outside);
fs.writeFileSync(path.join(dir,'config.toml'),GROUP_STARTUP_CONFIG);
const executor=new OwnerRuntime({roots:[project],protectedPaths:[path.join(dir,'config.toml')]});
const context={owner:'fixture',request:'fixture-request',thread:'pending',turn:'pending',check(){}};
const calls=[
  {name:'exec_command',arguments:{cmd:'printf FORBIDDEN'}},
  {name:'apply_patch',arguments:{patch:'FORBIDDEN'}},
  {name:'request_permissions',arguments:{permissions:{file_system:{write:[outside]}}}},
  {name:'mcp__fixture__write',arguments:{path:path.join(outside,'forbidden')}},
  {name:'owner_runtime_probe',arguments:{}},
];
const payloads=[];let count=0,resolveDone,rejectDone;
const done=new Promise((r,j)=>{resolveDone=r;rejectDone=j;});done.catch(()=>{});
const server=http.createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    try {
      const data=JSON.parse(body);payloads.push(data);
      if(count===calls.length){resolveDone(data);res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":{"message":"intentional probe end"}}');return;}
      const call=calls[count++],item={type:'function_call',id:`fc${count}`,call_id:`call${count}`,name:call.name,arguments:JSON.stringify(call.arguments)};
      res.writeHead(200,{'Content-Type':'text/event-stream'});
      for(const event of [{type:'response.created',response:{id:`r${count}`}},{type:'response.output_item.added',output_index:0,item},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:`r${count}`,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('data: '+JSON.stringify(event)+'\n\n');
      res.end();
    } catch(e){rejectDone(e);res.writeHead(500);res.end();}
  });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const rpc=new CodexClient(binary,{cwd:dir,env:{PATH:process.env.PATH,CODEX_HOME:dir,TMPDIR:dir}});
let timeout,executions=0;
try {
  rpc.on('request',m=>{void(async()=>{
    if(m.method!=='item/tool/call'||m.params.tool!=='owner_runtime_probe'){rpc.reject(m.id,'probe tool unavailable');return;}
    assert.equal(m.params.threadId,context.thread);context.turn=m.params.turnId;executions++;
    const inside=executor.prepare({operation:'write',path:path.join(project,'inside'),content:'INSIDE'},context);
    assert.equal(inside.requiresApproval,false);assert.equal((await executor.execute(inside.id,context)).state,'completed');
    const target=path.join(outside,'approved');const external=executor.prepare({operation:'write',path:target,content:'APPROVED'},context);
    assert.equal(external.requiresApproval,true);await assert.rejects(executor.execute(external.id,context),/approval/);assert.equal(fs.existsSync(target),false);
    // Synthetic Human-side decision, never exposed as a dynamic model tool.
    executor.approve(external.id,context);assert.equal((await executor.execute(external.id,context)).state,'completed');
    const denied=executor.prepare({operation:'write',path:path.join(outside,'denied'),content:'NO'},context);executor.deny(denied.id,context);
    await assert.rejects(executor.shell('printf no > other',project,context));
    rpc.respond(m.id,{success:true,contentItems:[{type:'inputText',text:'OWNER_EXECUTOR_PROBE_OK'}]});
  })().catch(rejectDone);});
  await rpc.start();
  const params=groupThreadParams(project,[{name:'owner_runtime_probe',description:'Synthetic executor probe',inputSchema:{type:'object',properties:{},additionalProperties:false}}],'gpt-5.4');
  params.modelProvider='probe';params.config.model_providers={probe:{name:'Offline probe',base_url:`http://127.0.0.1:${server.address().port}/v1`,wire_api:'responses',requires_openai_auth:false,request_max_retries:0,stream_max_retries:0}};
  const started=await rpc.request('thread/start',params);context.thread=started.thread.id;
  await rpc.request('turn/start',{threadId:context.thread,environments:[],input:[{type:'text',text:'run synthetic probe',text_elements:[]}]});
  const data=await Promise.race([done,new Promise((_,j)=>{timeout=setTimeout(()=>j(Error('probe timed out')),30000);})]);
  const outputs=data.input.filter(i=>i.type==='function_call_output');assert.equal(outputs.length,calls.length);
  for(const output of outputs.slice(0,-1))assert.match(output.output,/unsupported|unknown|not found|not available/i);
  assert.match(outputs.at(-1).output,/OWNER_EXECUTOR_PROBE_OK/);assert.equal(executions,1);
  const names=[];const flatten=t=>{if(t.type==='namespace')for(const x of t.tools||[])flatten(x);else names.push(t.name);};for(const tool of data.tools||[])flatten(tool);
  assert.ok(names.every(n=>['owner_runtime_probe','request_user_input','list','read'].includes(n)),JSON.stringify(names));
  assert.equal(fs.readFileSync(path.join(project,'inside'),'utf8'),'INSIDE');assert.equal(fs.readFileSync(path.join(outside,'approved'),'utf8'),'APPROVED');
  assert.equal(fs.existsSync(path.join(outside,'denied')),false);assert.equal(fs.existsSync(path.join(outside,'forbidden')),false);
  console.log('PASS: isolated Codex 0.160.0 rejects four raw tools; one host tool enforces direct/approved/denied operations. No real model or Feishu used.');
} finally {
  clearTimeout(timeout);executor.close();await rpc.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});
}
