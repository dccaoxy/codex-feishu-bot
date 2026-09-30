import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GroupModel,GROUP_CODEX_VERSION} from '../src/group-model.mjs';

for(const [label,version] of [
  ['previous release','codex-cli 0.158.0-alpha.2.1'],
  ['unverified future release','codex-cli 999.0.0'],
  ['verified version with extra text',`${GROUP_CODEX_VERSION} unverified-build`],
])test(`unverified Group runtime rejects ${label} before creating a home or starting RPC`,async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'group-version-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const binary=path.join(dir,'codex'),started=path.join(dir,'rpc-started');
  fs.writeFileSync(binary,`#!/usr/bin/env node\nif(process.argv[2]==='--version')console.log(${JSON.stringify(version)});else{require('node:fs').writeFileSync(${JSON.stringify(started)},'started');process.exit(1);}\n`,{mode:0o700});
  let bindings=0,writes=0,calls=0;
  const store={dir,stopped:()=>false,thread:()=>{bindings++;return {state:'new'};},setThread:()=>{writes++;}};
  const model=new GroupModel({codex:{binary}},store);
  t.after(()=>model.close());
  await assert.rejects(model.run('test',[],async()=>{calls++;},undefined,'test-group'),/群模型版本未经隔离验证/);
  assert.equal(fs.existsSync(path.join(dir,'threads')),false);
  assert.equal(fs.existsSync(started),false);
  assert.equal(bindings,0);assert.equal(writes,0);assert.equal(calls,0);assert.equal(model.active.size,0);
});
