import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('limit wrapper raises inherited soft limit and preserves spaced arguments',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'limit test '));
  try{const record=path.join(dir,'record');const r=spawnSync('/bin/sh',['-c','ulimit -S -n 256; exec /bin/sh "$@"','sh',path.resolve('scripts/limit-exec.sh'),record,'/bin/sh','-c','printf "%s:%s" "$(ulimit -S -n)" "$1"','sh','space value'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'4096:space value');assert.equal(fs.readFileSync(record,'utf8').trim(),'4096');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
