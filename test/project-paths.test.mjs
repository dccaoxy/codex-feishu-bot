import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectRoots,canonicalWritePath,classifyProjectWrite} from '../src/project-paths.mjs';
import {fileReview} from '../src/file-review.mjs';

// Real filesystem classification only. No assertion here claims to guard the
// App Server's later filesystem operation against check/use races.
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-paths-'));
 const root=path.join(dir,'project'),outside=path.join(dir,'project-other');
 fs.mkdirSync(root);fs.mkdirSync(outside);
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return {root,outside,roots:projectRoots([root])};
}
test('real filesystem classifies new and existing project targets and rejects sibling prefix',t=>{
 const {root,outside,roots}=fixture(t);
 fs.writeFileSync(path.join(root,'file'),'fixture');
 for(const target of [path.join(root,'file'),path.join(root,'new/nested/file')])assert.equal(classifyProjectWrite(target,roots).requiresApproval,false);
 assert.equal(classifyProjectWrite(path.join(outside,'file'),roots).requiresApproval,true);
 assert.throws(()=>canonicalWritePath(root+'/../project-other/file'));
 assert.throws(()=>canonicalWritePath(path.join(root,'file/child')));
});
test('real symlink outside project requires approval, dangling link fails closed',t=>{
 const {root,outside,roots}=fixture(t);
 fs.symlinkSync(outside,path.join(root,'link'));
 const result=classifyProjectWrite(path.join(root,'link/new/file'),roots);
 assert.equal(result.requiresApproval,true);assert.equal(result.target,path.join(fs.realpathSync(outside),'new/file'));
 fs.symlinkSync(path.join(outside,'missing'),path.join(root,'dangling'));
 assert.throws(()=>classifyProjectWrite(path.join(root,'dangling'),roots));
});
test('move snapshots classify both source and destination, including outside deletion',t=>{
 const {root,outside,roots}=fixture(t),source=path.join(root,'source'),dest=path.join(outside,'dest');
 fs.writeFileSync(source,'fixture');
 const review=fileReview([{path:source,kind:{type:'update',movePath:dest},diff:'fixture'}],roots);
 assert.deepEqual(review.map(x=>[x.operation,x.requiresApproval]),[['move-source',false],['move-destination',true]]);
 assert.equal(fileReview([{path:dest,kind:{type:'delete'},diff:'fixture'}],roots)[0].requiresApproval,true);
});
test('replacement of a symlink changes the next snapshot; replacement of root is rejected',t=>{
 const {root,outside,roots}=fixture(t),link=path.join(root,'link'),inside=path.join(root,'inside');
 fs.mkdirSync(inside);fs.symlinkSync(inside,link);assert.equal(classifyProjectWrite(path.join(link,'new'),roots).requiresApproval,false);
 fs.unlinkSync(link);fs.symlinkSync(outside,link);assert.equal(classifyProjectWrite(path.join(link,'new'),roots).requiresApproval,true);
 fs.renameSync(root,root+'-old');fs.symlinkSync(outside,root);assert.throws(()=>classifyProjectWrite(path.join(root,'new'),roots),/已变化/);
});
