import {knowledgeThreadParams} from '../src/knowledge-worker.mjs';
const knowledge=process.argv.includes('--knowledge');
// Offline protocol probe: a local fake provider requests adversarial built-ins.
// No account credentials and no real model call. Tests the installed binary.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {CodexClient} from '../src/codex.mjs';import {groupThreadParams,GROUP_CODEX_VERSION,GROUP_STARTUP_CONFIG} from '../src/group-model.mjs';import {GROUP_TOOLS} from '../src/group-assistant.mjs';
const binary=process.env.GROUP_CODEX_BINARY||'/Applications/ChatGPT.app/Contents/Resources/codex';
assert.equal(execFileSync(binary,['--version'],{encoding:'utf8'}).trim(),GROUP_CODEX_VERSION);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'group-probe-'));fs.mkdirSync(path.join(root,'work'));
fs.writeFileSync(path.join(root,'config.toml'),GROUP_STARTUP_CONFIG);
const sentinel=path.join(root,'private.txt');fs.writeFileSync(sentinel,'PRIVATE_SENTINEL_MUST_NOT_REACH_MODEL');
const calls=[
 {namespace:'skills',name:'list',args:{authority:{kind:'orchestrator'}}},
 {namespace:'skills',name:'list',args:{authority:{kind:'executor'}}},
 {namespace:'skills',name:'read',args:{package:root,resource:sentinel}},
 {name:'exec_command',args:{cmd:`cat ${sentinel}`}},
 {name:'read_file',args:{path:sentinel}},
 {name:'owner_groups',args:{}},
 {name:'owner_group_send',args:{group:'forged',text:'UNAUTHORIZED_SEND'}},
 ...(!knowledge?[{name:'group_search',args:{keyword:'probe'}}]:[]),
 ...(knowledge?[{name:'owner_thread_read',args:{threadId:'private'}},{name:'owner_data_query',args:{resourceId:'private'}},{name:'request_permissions',args:{permissions:{file_system:{read:[sentinel]}}}},{name:'group_search',args:{chat:'other'}},{name:'mcp__github__create_issue',args:{}}]:[]),
];
let resolveRequest,rejectRequest,count=0;let seen=new Promise((r,j)=>{resolveRequest=r;rejectRequest=j;});const payloads=[];
const server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{try{
 const v=JSON.parse(body);payloads.push(v);
 if(count<calls.length){const c=calls[count++];res.writeHead(200,{'Content-Type':'text/event-stream'});const item={type:'function_call',id:`fc${count}`,call_id:`call${count}`,name:c.name,...(c.namespace?{namespace:c.namespace}:{}),arguments:JSON.stringify(c.args)};
 for(const e of [{type:'response.created',response:{id:`resp${count}`}},{type:'response.output_item.added',output_index:0,item},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:`resp${count}`,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('data: '+JSON.stringify(e)+'\n\n');res.end();return;}
 resolveRequest(v);
 }catch(e){rejectRequest(e);}res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":{"message":"intentional end of isolation probe"}}');});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let rpc=new CodexClient(binary,{cwd:root,env:{PATH:process.env.PATH,HOME:root,CODEX_HOME:root,TMPDIR:root}});let timer;
try{
 rpc.on('request',m=>{if(!knowledge&&m.method==='item/tool/call'&&m.params.tool==='group_search')rpc.respond(m.id,{contentItems:[{type:'inputText',text:'GROUP_ALLOWED_TOOL_OK'}],success:true});else rpc.reject(m.id,'Group scope denies this request');});
 await rpc.start();const p=knowledge?knowledgeThreadParams(path.join(root,'work'),process.env.GROUP_MODEL||'gpt-5.4'):groupThreadParams(path.join(root,'work'),GROUP_TOOLS,process.env.GROUP_MODEL||'gpt-5.4');p.modelProvider='probe';
 p.config.model_providers={probe:{name:'Local isolation probe',base_url:`http://127.0.0.1:${server.address().port}/v1`,wire_api:'responses',requires_openai_auth:false,request_max_retries:0,stream_max_retries:0}};
 const r=await rpc.request('thread/start',p);await rpc.request('turn/start',{threadId:r.thread.id,environments:[],input:[{type:'text',text:'list group messages',text_elements:[]}]});
 const body=await Promise.race([seen,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('No provider request captured')),30000);})]);
 const names=[];function collect(t,prefix=''){if(t.type==='namespace')for(const x of t.tools||[])collect(x,t.name+'.');else names.push(prefix+(t.name||t.type));}for(const t of body.tools||[])collect(t);
 const allowed=new Set([...(knowledge?[]:['group_search','group_context','group_changes','group_message']),'request_user_input','skills.list','skills.read']);
 assert.equal(names.includes('group_search'),!knowledge);assert.ok(names.every(n=>allowed.has(n)),`Unexpected tools: ${names.filter(n=>!allowed.has(n)).join(',')}`);
 const outputs=body.input.filter(x=>x.type==='function_call_output');assert.equal(outputs.length,calls.length);
 assert.deepEqual(JSON.parse(outputs[0].output).skills,[]);assert.deepEqual(JSON.parse(outputs[1].output).skills,[]);
 assert.match(outputs[2].output,/error|invalid|not found|not available|unknown|failed/i);
 for(const [i,x] of outputs.entries()){if(calls[i].name==='group_search'&&!knowledge)assert.match(x.output,/GROUP_ALLOWED_TOOL_OK/);else if(i>=3)assert.match(x.output,/unsupported|not found|unknown/i);}
 assert.ok(!JSON.stringify(payloads).includes('PRIVATE_SENTINEL_MUST_NOT_REACH_MODEL'));
 if(!knowledge){
 // Restart the process and resume the persisted thread, then repeat all attacks.
 await rpc.close();count=0;seen=new Promise((r,j)=>{resolveRequest=r;rejectRequest=j;});
 rpc=new CodexClient(binary,{cwd:root,env:{PATH:process.env.PATH,HOME:root,CODEX_HOME:root,TMPDIR:root}});
 rpc.on('request',m=>{if(!knowledge&&m.method==='item/tool/call'&&m.params.tool==='group_search')rpc.respond(m.id,{contentItems:[{type:'inputText',text:'GROUP_ALLOWED_TOOL_OK'}],success:true});else rpc.reject(m.id,'Group scope denies this request');});
 await rpc.start();
 const resumed=await rpc.request('thread/resume',{threadId:r.thread.id,cwd:p.cwd,config:p.config,approvalPolicy:'never',sandbox:'read-only',excludeTurns:true});
 assert.equal(resumed.thread.id,r.thread.id);
 await rpc.request('turn/start',{threadId:r.thread.id,environments:[],input:[{type:'text',text:'repeat isolation check after restart',text_elements:[]}]});
 const again=await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Resume probe timed out')),30000).unref())]);
 const resumedNames=[];function gather(t,prefix=''){if(t.type==='namespace')for(const x of t.tools||[])gather(x,t.name+'.');else resumedNames.push(prefix+(t.name||t.type));}for(const t of again.tools||[])gather(t);
 assert.ok(resumedNames.includes('group_search'));assert.ok(resumedNames.every(n=>allowed.has(n)),JSON.stringify(resumedNames));
 const resumedOutputs=again.input.filter(x=>x.type==='function_call_output').slice(-calls.length);
 assert.equal(resumedOutputs.length,calls.length);for(const x of resumedOutputs.slice(0,2)){if(x.output.startsWith('{'))assert.deepEqual(JSON.parse(x.output).skills,[]);else assert.match(x.output,/unsupported|not found|unknown/i);}
 assert.match(resumedOutputs[2].output,/error|invalid|not found|not available|unknown|failed|unsupported/i);for(const [i,x] of resumedOutputs.entries()){if(calls[i].name==='group_search')assert.match(x.output,/GROUP_ALLOWED_TOOL_OK/);else if(i>=3)assert.match(x.output,/unsupported|not found|unknown/i);}
 assert.ok(!JSON.stringify(payloads).includes('PRIVATE_SENTINEL_MUST_NOT_REACH_MODEL'));
 }
 console.log(JSON.stringify({knowledge, persistentResume:!knowledge,version:GROUP_CODEX_VERSION,tools:names,adversarialCalls:calls.length*(knowledge?1:2),result:'PASS: empty skill authorities; private file/shell attempts rejected'},null,2));
}finally{clearTimeout(timer);await rpc.close();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
