// Native, opt-in experiment for Issue #33. NOT a production execution mode.
// Uses a disposable APFS image, no model, credentials, Feishu, or existing service.
// It demonstrates transactional-workspace primitives, not complete isolation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {OwnerRuntime} from '../test/fixtures/owner-runtime-prototype.mjs';

if(process.platform!=='darwin')throw Error('This opt-in experiment requires macOS');
const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'issue33-volume-')));
const image=path.join(base,'request.sparseimage');
const mount=path.join(base,'mount'),readback=path.join(base,'readback');
fs.mkdirSync(mount);fs.mkdirSync(readback);
let mounted=null,runtime=null;
const hdi=args=>execFileSync('/usr/bin/hdiutil',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
try {
  hdi(['create','-size','128m','-fs','APFS','-type','SPARSE','-volname','Issue33IsolatedTest',image]);
  mounted=mount; // Attach can succeed before its response is lost.
  hdi(['attach','-nobrowse','-noautoopen','-mountpoint',mount,image]);
  const host=path.join(base,'host'),copy=path.join(mount,'copy');
  fs.writeFileSync(host,'HOST');
  assert.notEqual(fs.statSync(host).dev,fs.statSync(mount).dev);
  assert.throws(()=>fs.linkSync(host,path.join(mount,'alias')),e=>e.code==='EXDEV');
  fs.copyFileSync(host,copy);fs.writeFileSync(copy,'COPY');
  assert.equal(fs.readFileSync(host,'utf8'),'HOST');

  runtime=new OwnerRuntime({roots:[mount],protectedPaths:[image]});
  const context={owner:'fixture',request:'fixture',thread:'fixture',turn:'fixture',check(){}};
  const report=path.join(mount,'attempts.json');
  const childCode=`const fs=require('node:fs');setTimeout(()=>{
    const outcome={host:'allowed',image:'allowed'};
    try{fs.writeFileSync(${JSON.stringify(host)},'ESCAPE');}catch(e){outcome.host=e.code;}
    try{fs.appendFileSync(${JSON.stringify(image)},'ESCAPE');}catch(e){outcome.image=e.code;}
    fs.writeFileSync(${JSON.stringify(report)},JSON.stringify(outcome));
    fs.writeFileSync(${JSON.stringify(copy)},'DETACHED COPY');
  },200);`;
  const script=path.join(mount,'spawn.cjs');
  fs.writeFileSync(script,`const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{detached:true,stdio:'ignore'});c.unref();`);
  const result=await runtime.shell(quote(process.execPath)+' '+quote(script),mount,context);
  assert.equal(result.code,0);
  // Simulate cancellation: discard the host commit capability, never copy back.
  // This does NOT claim close() kills detached descendants.
  runtime.close();runtime=null;
  await new Promise(resolve=>setTimeout(resolve,600));
  assert.equal(fs.readFileSync(copy,'utf8'),'DETACHED COPY');
  const attempts=JSON.parse(fs.readFileSync(report,'utf8'));
  assert.ok(['EPERM','EACCES'].includes(attempts.host));
  assert.ok(['EPERM','EACCES'].includes(attempts.image));
  assert.equal(fs.readFileSync(host,'utf8'),'HOST');

  // A successful ordinary detach is a prerequisite for this experiment's
  // read-only view. No forced unmount or assumption that it revokes processes.
  hdi(['detach',mount]);mounted=null;
  mounted=readback;
  hdi(['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',readback,image]);
  assert.equal(fs.readFileSync(path.join(readback,'copy'),'utf8'),'DETACHED COPY');
  assert.throws(()=>fs.writeFileSync(path.join(readback,'copy'),'NO'),e=>e.code==='EROFS');
  assert.equal(fs.readFileSync(host,'utf8'),'HOST');
  console.log('PASS: separate volume rejects cross-volume hard links; detached child only changed staging; host unchanged; successful detach/read-only remount rejects writes. No host commit or production integration tested.');
} finally {
  runtime?.close();
  // Track even an uncertain attach. If unmount fails, retain the directory rather than recursively
  // deleting a mounted filesystem. The thrown error reports the cleanup failure.
  if(mounted)hdi(['detach',mounted]);
  fs.rmSync(base,{recursive:true,force:true});
}
