import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Bot} from '../../src/bot.mjs';
import {fileReview,isReadOnlyPermissionRequest} from '../../src/file-review.mjs';

function paths(t) {
  let destination='/outside';
  const dirs=new Set(['/','/project','/outside','/other']);
  t.mock.method(fs,'lstatSync',p=>{
    if(dirs.has(p))return {isDirectory:()=>true,isSymbolicLink:()=>false};
    if(p==='/project/link')return {isDirectory:()=>false,isSymbolicLink:()=>true};
    throw Object.assign(Error('missing'),{code:'ENOENT'});
  });
  t.mock.method(fs.realpathSync,'native',p=>p==='/project/link'?destination:p);
  t.mock.method(fs,'statSync',p=>({isDirectory:()=>dirs.has(p)}));
  return {retarget:()=>destination='/other'};
}
function fixture(t,{shared=false,external=false}={}) {
  const responses=[],cards=[],messages=[];
  const row={state:'processing',payload:JSON.stringify({kind:'message',user:'owner',message:{message_id:'source'}})};
  const run={chat:'chat',thread:'thread',turn:'turn',officeOwner:'owner',sourceIds:new Set(['source']),external};
  const bot=Object.assign(Object.create(Bot.prototype),{
    config:{ownerAccess:{projectRoots:['/project']}},owner:'owner',available:true,closed:false,
    runs:new Map([['thread',run]]),prompts:new Map(),
    store:{get:()=>'',binding:()=>({thread:'thread'}),db:{prepare:sql=>({get:()=>sql.startsWith('SELECT 1')?(row.state==='cancelled'?{1:1}:undefined):row})}},
    rpc:{shared,respond:(id,result)=>responses.push({id,result})},
    feishu:{text:async(_chat,text)=>messages.push(text),interactive:async(...args)=>{cards.push(args);return {};},replaceInteractive:async()=>{}},
  });
  t.after(()=>{for(const token of [...bot.prompts.keys()])bot.clearPrompt(token);});
  const request={id:1,method:'item/fileChange/requestApproval',params:{threadId:'thread',turnId:'turn',itemId:'patch'}};
  const setChanges=changes=>bot.rememberFileDetails(run,{turnId:'turn',item:{id:'patch',changes}});
  setChanges([{path:'/project/link/file',kind:{type:'update'},diff:'-old\n+new'}]);
  return {bot,run,row,responses,cards,messages,request,setChanges};
}

test('file review classifies both rename paths and rejects unknown operations',t=>{
  paths(t);
  const result=fileReview([{path:'/project/source',kind:{type:'update',movePath:'/outside/destination'},diff:'patch'}],['/project']);
  assert.deepEqual(result.map(r=>[r.operation,r.requiresApproval]),[['move-source',false],['move-destination',true]]);
  for(const type of ['add','update','delete'])assert.equal(fileReview([{path:'/project/link/file',kind:{type},diff:'patch'}],['/project'])[0].requiresApproval,true);
  assert.throws(()=>fileReview([{path:'/project/file',kind:{type:'unknown'},diff:''}],['/project']));
  assert.throws(()=>fileReview([{path:'/project/file',kind:{type:'delete',movePath:'/outside/file'},diff:''}],['/project']));
});

test('no file write capability is classified as a read-only permission request',()=>{
  for(const permissions of [{fileSystem:{write:['/outside']}},{fileSystem:{write:['/project']}},{filesystem:{write:['/outside']}},{fileSystem:{write:'all'}},{futureGrant:true},null])assert.equal(isReadOnlyPermissionRequest(permissions),false);
  for(const permissions of [{},{fileSystem:{read:['/outside'],write:[]}},{network:{enabled:true}}])assert.equal(isReadOnlyPermissionRequest(permissions),true);
});

for(const external of [false,true])test(`native file permissions are relayed for explicit approval (${external?'shared':'owned'})`,async t=>{
  const f=fixture(t,{shared:external,external});
  await f.bot.serverRequest({id:3,method:'item/permissions/requestApproval',params:{threadId:'thread',turnId:'turn',permissions:{fileSystem:{write:['/outside']}}}});
  assert.equal(f.cards.length,1);assert.equal(f.bot.prompts.size,1);assert.deepEqual(f.responses,[]);
  await f.bot.action('chat',{token:[...f.bot.prompts.keys()][0],decision:'accept'},'owner');
  assert.deepEqual(f.responses,[{id:3,result:{permissions:{fileSystem:{write:['/outside']}},scope:'turn'}}]);
});

test('a stale write-permission card cannot grant a turn capability',async t=>{
  const f=fixture(t);
  f.bot.prompts.set('old',{id:4,method:'item/permissions/requestApproval',params:{permissions:{fileSystem:{write:['/outside']}}},chat:'chat',thread:'thread',expires:Date.now()+10000});
  await assert.rejects(f.bot.action('chat',{token:'old',decision:'accept'},'owner'),/身份及回合/);
  assert.deepEqual(f.responses,[]);
});

test('file card relays native target and operation; approval is consumed once',async t=>{
  paths(t);const f=fixture(t);
  await f.bot.serverRequest(f.request);
  assert.equal(f.cards.length,1);assert.match(f.cards[0][2],/\/project\/link\/file/);assert.match(f.cards[0][2],/update/);
  const token=[...f.bot.prompts.keys()][0];
  await f.bot.action('chat',{token,decision:'accept'},'owner');
  await assert.rejects(f.bot.action('chat',{token,decision:'accept'},'owner'));
  await f.bot.serverRequest(f.request);
  assert.equal(f.cards.length,1);
  assert.deepEqual(f.responses,[{id:1,result:{decision:'accept'}}]);
  assert.deepEqual(f.messages,['已批准本次文件变更请求。']);
});

test('non-Owner cannot answer a native approval',async t=>{
 const f=fixture(t);await f.bot.serverRequest(f.request);
 await assert.rejects(f.bot.action('chat',{token:[...f.bot.prompts.keys()][0],decision:'accept'},'member'));
 assert.deepEqual(f.responses,[]);
});
test('native file approval does not inspect projectRoots or resolve symlinks',async t=>{
  const p=paths(t),f=fixture(t);await f.bot.serverRequest(f.request);p.retarget();f.bot.config.ownerAccess.projectRoots=['/elsewhere'];
  await f.bot.action('chat',{token:[...f.bot.prompts.keys()][0],decision:'accept'},'owner');
  assert.deepEqual(f.responses,[{id:1,result:{decision:'accept'}}]);
});

test('rejected file request cannot be replayed with the same request ID',async t=>{
  paths(t);const f=fixture(t);await f.bot.serverRequest(f.request);
  const token=[...f.bot.prompts.keys()][0];
  await f.bot.action('chat',{token,decision:'decline'},'owner');
  f.setChanges([{path:'/project/different',kind:{type:'add'},diff:'new'}]);
  await f.bot.serverRequest(f.request);
  assert.equal(f.cards.length,1);
  assert.deepEqual(f.responses,[{id:1,result:{decision:'decline'}}]);
  assert.deepEqual(f.messages,['已拒绝本次文件变更请求。']);
});

for(const [name,change] of [
  ['Owner',f=>f.bot.owner='other'],
  ['turn',f=>f.run.turn='next'],
  ['steer',f=>f.run.sourceIds.add('next')],
  ['withdrawal',f=>f.row.state='cancelled'],
  ['patch',f=>f.setChanges([{path:'/outside/other',kind:{type:'delete'},diff:'different'}])],
])test(`file approval invalid after ${name} changes`,async t=>{
  const p=paths(t),f=fixture(t);await f.bot.serverRequest(f.request);
  const token=[...f.bot.prompts.keys()][0];change(f,p);
  await assert.rejects(f.bot.action('chat',{token,decision:'accept'},'owner'));
  assert.ok(f.responses.every(r=>r.result.decision!=='accept'));
});

test('transport uncertainty consumes file approval without retry',async t=>{
  paths(t);const f=fixture(t);await f.bot.serverRequest(f.request);
  const token=[...f.bot.prompts.keys()][0];let calls=0;
  f.bot.rpc.respond=()=>{calls++;throw Error('connection lost');};
  await assert.rejects(f.bot.action('chat',{token,decision:'accept'},'owner'),/connection lost/);
  assert.equal(f.bot.prompts.size,0);
  await assert.rejects(f.bot.action('chat',{token,decision:'accept'},'owner'));
  assert.equal(calls,1);
});

test('lost shared observation closes its card without answering for the peer',async t=>{
  paths(t);const f=fixture(t,{shared:true,external:true});await f.bot.serverRequest(f.request);
  const token=[...f.bot.prompts.keys()][0];f.bot.runs.delete('thread');
  await assert.rejects(f.bot.action('chat',{token,decision:'accept'},'owner'));
  assert.equal(f.bot.prompts.size,0);assert.deepEqual(f.responses,[]);
});
