import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {OwnerRuntime} from './fixtures/owner-runtime-prototype.mjs';

function fixture(t) {
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'owner-runtime-')));
  const project=path.join(base,'project'),outside=path.join(base,'outside');fs.mkdirSync(project);fs.mkdirSync(outside);
  const protectedFile=path.join(project,'config.json');fs.writeFileSync(protectedFile,'protected');
  const runtime=new OwnerRuntime({roots:[project],protectedPaths:[protectedFile]});
  const context={owner:'fixture-owner',request:'fixture-request',thread:'fixture-thread',turn:'fixture-turn',check(){}};
  t.after(()=>{runtime.close();fs.rmSync(base,{recursive:true,force:true});});
  return {base,project,outside,protectedFile,runtime,context};
}
const native=(name,fn)=>test(name,{skip:process.platform!=='darwin'},fn);

native('independent worker creates modifies and deletes project file without approval',async t=>{
  const f=fixture(t),target=path.join(f.project,'file');
  for(const operation of [{operation:'write',path:target,content:'one'},{operation:'write',path:target,content:'two'},{operation:'delete',path:target}]) {
    const p=f.runtime.prepare(operation,f.context);assert.equal(p.requiresApproval,false);
    assert.deepEqual(await f.runtime.execute(p.id,f.context),{state:'completed'});
  }
  assert.equal(fs.existsSync(target),false);
});
for(const action of ['create','modify','delete'])native(`external ${action} requires and consumes one operation approval`,async t=>{
  const f=fixture(t),target=path.join(f.outside,'file');if(action!=='create')fs.writeFileSync(target,'original');
  const operation=action==='delete'?{operation:'delete',path:target}:{operation:'write',path:target,content:'changed'};
  const p=f.runtime.prepare(operation,f.context);assert.equal(p.requiresApproval,true);
  await assert.rejects(f.runtime.execute(p.id,f.context),/approval/);
  assert.equal(action==='create'?fs.existsSync(target):fs.readFileSync(target,'utf8'),action==='create'?false:'original');
  f.runtime.approve(p.id,f.context);assert.deepEqual(await f.runtime.execute(p.id,f.context),{state:'completed'});
  await assert.rejects(f.runtime.execute(p.id,f.context),/pending/);
  assert.equal(action==='delete'?fs.existsSync(target):fs.readFileSync(target,'utf8'),action==='delete'?false:'changed');
});
native('denial prevents another target or tool in the same request',async t=>{
  const f=fixture(t),target=path.join(f.outside,'file'),p=f.runtime.prepare({operation:'write',path:target,content:'no'},f.context);
  f.runtime.deny(p.id,f.context);
  await assert.rejects(f.runtime.execute(p.id,f.context));
  assert.throws(()=>f.runtime.prepare({operation:'write',path:path.join(f.project,'other'),content:'no'},f.context));
  await assert.rejects(f.runtime.shell('touch other',f.project,f.context));
  assert.equal(fs.existsSync(target),false);assert.equal(fs.existsSync(path.join(f.project,'other')),false);
  const fresh={...f.context,request:'fresh'};const q=f.runtime.prepare({operation:'write',path:target,content:'yes'},fresh);
  f.runtime.approve(q.id,fresh);assert.equal((await f.runtime.execute(q.id,fresh)).state,'completed');
});
native('symlink outside needs approval; changed link invalidates the prepared operation',async t=>{
  const f=fixture(t),a=path.join(f.outside,'a'),b=path.join(f.outside,'b'),link=path.join(f.project,'link');fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');fs.symlinkSync(a,link);
  const p=f.runtime.prepare({operation:'write',path:link,content:'changed'},f.context);assert.equal(p.requiresApproval,true);assert.deepEqual(p.targets,[a]);
  f.runtime.approve(p.id,f.context);fs.unlinkSync(link);fs.symlinkSync(b,link);
  await assert.rejects(f.runtime.execute(p.id,f.context),/changed/);assert.equal(fs.readFileSync(a,'utf8'),'A');assert.equal(fs.readFileSync(b,'utf8'),'B');
});
native('rename outside binds both paths and requires one approval',async t=>{
  const f=fixture(t),a=path.join(f.project,'a'),b=path.join(f.outside,'b');fs.writeFileSync(a,'A');
  const p=f.runtime.prepare({operation:'rename',path:a,destination:b},f.context);assert.deepEqual(p.targets,[a,b]);assert.equal(p.requiresApproval,true);
  f.runtime.approve(p.id,f.context);assert.equal((await f.runtime.execute(p.id,f.context)).state,'completed');assert.equal(fs.existsSync(a),false);assert.equal(fs.readFileSync(b,'utf8'),'A');
});
for(const reason of ['owner','request','thread','turn','recall'])native(`prepared operation invalid after ${reason}`,async t=>{
  const f=fixture(t),target=path.join(f.outside,'file'),p=f.runtime.prepare({operation:'write',path:target,content:'no'},f.context);
  f.runtime.approve(p.id,f.context);if(reason==='recall')f.context.check=()=>{throw Error('recalled');};else f.context[reason]='different';
  await assert.rejects(f.runtime.execute(p.id,f.context));assert.equal(fs.existsSync(target),false);
});
native('protected configuration cannot be changed even with operation approval',async t=>{
  const f=fixture(t);assert.throws(()=>f.runtime.prepare({operation:'write',path:f.protectedFile,content:'no'},f.context),/protected/);
  const r=await f.runtime.shell('printf no > config.json',f.project,f.context);assert.notEqual(r.code,0);assert.equal(fs.readFileSync(f.protectedFile,'utf8'),'protected');
});
native('sandboxed shell reads outside and writes inside but cannot follow an outside symlink',async t=>{
  const f=fixture(t),target=path.join(f.outside,'file');fs.writeFileSync(target,'original');fs.symlinkSync(f.outside,path.join(f.project,'link'));
  const good=await f.runtime.shell('cat link/file; printf yes > inside; rm inside',f.project,f.context);assert.equal(good.code,0);assert.equal(good.stdout,'original');
  const bad=await f.runtime.shell('printf no > link/file',f.project,f.context);assert.notEqual(bad.code,0);assert.equal(fs.readFileSync(target,'utf8'),'original');
});
native('changed project-root identity and hard-linked file fail closed',async t=>{
  const f=fixture(t),a=path.join(f.project,'a'),b=path.join(f.outside,'b');fs.writeFileSync(a,'A');fs.linkSync(a,b);
  assert.throws(()=>f.runtime.prepare({operation:'write',path:a,content:'no'},f.context),/singly-linked/);
  fs.renameSync(f.project,f.project+'-old');fs.mkdirSync(f.project);
  await assert.rejects(f.runtime.shell('printf no > file',f.project,f.context),/root changed/);
});

native('source changes, expiry and caller mutation do not change approved operation',async t=>{
  const f=fixture(t),target=path.join(f.outside,'file');fs.writeFileSync(target,'original');
  const input={operation:'write',path:target,content:'approved'},p=f.runtime.prepare(input,f.context);input.content='substituted';
  f.runtime.approve(p.id,f.context);assert.equal((await f.runtime.execute(p.id,f.context)).state,'completed');assert.equal(fs.readFileSync(target,'utf8'),'approved');
  const q=f.runtime.prepare({operation:'delete',path:target},f.context);fs.writeFileSync(target,'concurrent edit');
  assert.throws(()=>f.runtime.approve(q.id,f.context),/changed/);assert.equal(fs.readFileSync(target,'utf8'),'concurrent edit');
  const r=f.runtime.prepare({operation:'delete',path:target},f.context),now=Date.now();t.mock.method(Date,'now',()=>now+600001);
  assert.throws(()=>f.runtime.approve(r.id,f.context),/expired/);assert.equal(fs.existsSync(target),true);
});
native('worker refuses a symlink swap after host preflight',async t=>{
  const f=fixture(t),a=path.join(f.outside,'a'),b=path.join(f.outside,'b');fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');
  const p=f.runtime.prepare({operation:'write',path:a,content:'no'},f.context);f.runtime.approve(p.id,f.context);
  let checks=0;f.context.check=()=>{if(++checks===2){fs.unlinkSync(a);fs.symlinkSync(b,a);}};
  const result=await f.runtime.execute(p.id,f.context);assert.equal(result.state,'not_executed');assert.equal(fs.readFileSync(b,'utf8'),'B');
  await assert.rejects(f.runtime.execute(p.id,f.context),/pending/);
});
native('unknown operation result is not replayable through a new operation',async t=>{
  const f=fixture(t),a=path.join(f.outside,'a'),b=path.join(f.outside,'b');fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');
  const p=f.runtime.prepare({operation:'rename',path:a,destination:b},f.context);f.runtime.approve(p.id,f.context);
  // Invalidate during spawn to exercise the uncertain-outcome path.
  let calls=0;f.context.check=()=>{if(++calls>=3)throw Error('withdrawn');};
  const result=await f.runtime.execute(p.id,f.context);assert.equal(result.state,'unknown');
  f.context.check=()=>{};
  assert.throws(()=>f.runtime.prepare({operation:'write',path:b,content:'retry'},f.context),/no longer executable/);
});
native('request cancellation terminates an active ordinary shell',async t=>{
  const f=fixture(t);let active=true;f.context.check=()=>{if(!active)throw Error('cancelled');};
  const pending=f.runtime.shell('sleep 1; printf late > late-file',f.project,f.context);
  setTimeout(()=>{active=false;},30);const r=await pending;assert.equal(r.state,'unknown');
  assert.equal(fs.existsSync(path.join(f.project,'late-file')),false);
});

// These two tests intentionally reproduce limitations; passing means the gap
// was observed, NOT that the prototype satisfies the Issue's security contract.
native('KNOWN GAP: detached child writes after supervised shell has exited',async t=>{
  const f=fixture(t),script=path.join(f.project,'spawn.cjs'),target=path.join(f.project,'escaped');
  const childCode="setTimeout(()=>require('node:fs').writeFileSync("+JSON.stringify(target)+",'escaped'),300)";
  fs.writeFileSync(script,`const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{detached:true,stdio:'ignore'}); c.unref();`);
  const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const r=await f.runtime.shell(shellQuote(process.execPath)+' '+shellQuote(script),f.project,f.context);
  assert.equal(r.code,0);assert.equal(fs.existsSync(target),false);
  f.runtime.close();
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(fs.readFileSync(target,'utf8'),'escaped','known detached-process gap must be reassessed if no longer reproducible');
});
native('KNOWN GAP: Shell writes through a pre-existing project hard link',async t=>{
  const f=fixture(t),target=path.join(f.outside,'external'),alias=path.join(f.project,'alias');
  fs.writeFileSync(target,'original');fs.linkSync(target,alias);
  const r=await f.runtime.shell('printf changed > alias',f.project,f.context);
  assert.equal(r.code,0);assert.equal(fs.readFileSync(target,'utf8'),'changed');
});
