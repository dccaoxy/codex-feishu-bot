import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseFD,level,verifiedLimit,appendBounded} from '../scripts/fd-telemetry.mjs';
test('FD totals count numeric descriptors only and discard paths and endpoints',()=>{
 const r=parseFD('p123\nfcwd\ntDIR\nf0\ntCHR\nf1\ntPIPE\nf22\ntIPv4\nf23\ntunix\nf24\ntREG\nn/private/secret\nf25\ntKQUEUE\n');
 assert.equal(r.total,6);assert.deepEqual(r.categories,{socket:2,pipe:1,regular:1,other:2});assert.ok(!JSON.stringify(r).includes('secret'));
});
test('thresholds use validated actual limit; missing observations stay unknown',()=>{
 assert.equal(level(2047,4096),'normal');assert.equal(level(2048,4096),'warning');assert.equal(level(2868,4096),'snapshot');assert.equal(level(3277,4096),'critical');assert.equal(level(null,4096),'unknown');assert.equal(level(20,null),'unknown');
 const r={pid:12,start:'stamp',soft:4096,hard:8192};assert.equal(verifiedLimit(r,12,'stamp').soft,4096);assert.equal(verifiedLimit(r,13,'stamp'),null);assert.equal(verifiedLimit(r,12,'new-start'),null);assert.equal(verifiedLimit(null,12,'stamp'),null);
});
test('local telemetry logs are bounded and private',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'telemetry-'));
 try{const f=path.join(dir,'sample');fs.writeFileSync(f,'x'.repeat(5*1024*1024+1));appendBounded(f,{fdTotal:20});assert.ok(fs.existsSync(f+'.1'));assert.equal(JSON.parse(fs.readFileSync(f)).fdTotal,20);assert.equal(fs.statSync(f).mode&0o777,0o600);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('threshold crossings save bounded sanitized evidence and do not repeatedly alert',async()=>{
 const {sample}=await import('../scripts/fd-telemetry.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thresholds-'));
 let n=50;const fake=async()=>({at:new Date().toISOString(),pid:42,fdTotal:n,fdLimit:{soft:100},level:level(n,100),details:[{fd:3,type:'PIPE'}]});
 try{
  await sample({},'',dir,fake);await sample({},'',dir,fake);
  assert.equal(fs.readFileSync(path.join(dir,'alerts.jsonl'),'utf8').trim().split('\n').length,1);
  assert.ok(!fs.existsSync(path.join(dir,'snapshots.jsonl')));
  n=70;await sample({},'',dir,fake);n=80;await sample({},'',dir,fake);
  assert.equal(fs.readFileSync(path.join(dir,'snapshots.jsonl'),'utf8').trim().split('\n').length,2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'latest.json'))).level,'critical');
  assert.equal(fs.statSync(dir).mode&0o777,0o700);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('loaded count paginates and ignores server requests without answering',async()=>{
 const {WebSocketServer}=await import('ws');const {loadedCount}=await import('../scripts/fd-telemetry.mjs');
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));let decisions=0;
 server.on('connection',socket=>socket.on('message',raw=>{const m=JSON.parse(raw);if(!m.method){decisions++;return;}if(m.method==='initialized')return;
 socket.send(JSON.stringify({id:m.id,method:'item/commandExecution/requestApproval',params:{}}));
 const result=m.method==='initialize'?{}:m.params.cursor?{data:['c'],nextCursor:null}:{data:['a','b'],nextCursor:'next'};socket.send(JSON.stringify({id:m.id,result}));}));
 try{assert.equal(await loadedCount('ws://127.0.0.1:'+server.address().port),3);assert.equal(decisions,0);}finally{for(const c of server.clients)c.terminate();await new Promise(r=>server.close(r));}
});
test('unsupported loaded API remains unknown, not zero',async()=>{
 const {WebSocketServer}=await import('ws');const {loadedCount}=await import('../scripts/fd-telemetry.mjs');
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));
 server.on('connection',s=>s.on('message',raw=>{const m=JSON.parse(raw);if(m.id)s.send(JSON.stringify({id:m.id,error:{code:-32601,message:'unsupported'}}));}));
 try{assert.equal(await loadedCount('ws://127.0.0.1:'+server.address().port),null);}finally{for(const c of server.clients)c.terminate();await new Promise(r=>server.close(r));}
});
