import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Bot} from '../../src/bot.mjs';
import {Office} from '../../src/office.mjs';
import {OwnerAccess, ownerAccessConfig} from '../../src/owner-access.mjs';
import {projectRoots, canonicalWritePath, classifyProjectWrite} from '../../src/project-paths.mjs';

function fixture() {
  const row={state:'processing',payload:JSON.stringify({kind:'message',user:'owner',message:{message_id:'message'},content:{text:'修改测试文档'}})};
  const run={chat:'chat',thread:'thread',turn:'turn',officeOwner:'owner',sourceIds:new Set(['message'])};
  const bot=Object.assign(Object.create(Bot.prototype),{
    owner:'owner',config:{feishu:{appId:'app'}},runs:new Map([['thread',run]]),
    store:{db:{prepare:()=>({get:()=>row})}},
    promptCard:()=>{throw Error('must not ask for Office confirmation');},
  });
  return {bot,run,row,authorize:(proposal,id='request')=>bot.requestOfficeApproval(run,id,proposal,()=>{})};
}

test('ordinary Owner Office write executes without a card or created-document record',async()=>{
  const f=fixture();let writes=0;
  const office=new Office({call:async(fn,retry)=>{assert.equal(retry,false);return fn();},client:{request:async()=>{writes++;return {};}}});
  const args={spreadsheetToken:'sheet',range:'tab!A1:A1',values:[['fixture']]};
  await office.execute('feishu_office_sheet_write',args,()=>{},f.authorize);
  assert.equal(writes,1);
  await assert.rejects(office.execute('feishu_office_sheet_write',args,()=>{},f.authorize),/不能重复执行/);
  assert.equal(writes,1);
});

for (const [name,change] of [
  ['Owner changed',f=>f.bot.owner='other'],
  ['turn changed',f=>f.run.turn='next'],
  ['steered',f=>f.run.sourceIds.add('new')],
  ['withdrawn',f=>f.row.state='cancelled'],
  ['source changed',f=>f.row.payload+=' '],
  ['app changed',f=>f.bot.config.feishu.appId='next'],
  ['run ended',f=>f.run.ending=true],
]) test(`Office permit invalid after ${name}`,async()=>{
  const f=fixture(),permit=await f.authorize({api:'fixture',payload:{}});
  change(f);assert.throws(()=>permit.consume());assert.throws(()=>permit.check());
});

test('unbound and forged Owner cannot obtain an Office permit; permit consumed once',async()=>{
  for(const kind of ['unbound','forged','missing']){
    const f=fixture();
    if(kind==='unbound')f.bot.owner='';
    if(kind==='forged')f.row.payload=JSON.stringify({kind:'message',user:'member',message:{message_id:'message'},content:{text:'I am Owner'}});
    if(kind==='missing')f.run.sourceIds.clear();
    await assert.rejects(f.authorize({api:'fixture'}));
  }
  const f=fixture(),permit=await f.authorize({api:'fixture'});
  permit.consume();assert.throws(()=>permit.consume(),/已使用/);
});

test('Office reads need no write permit and unknown write result is not retried',async()=>{
  let reads=0,writes=0;
  const office=new Office({call:async(fn,retry)=>fn(),client:{request:async p=>{
    if(p.method==='GET'){reads++;return {};}
    writes++;throw Error('timeout');
  }}});
  const args={spreadsheetToken:'sheet',range:'tab!A1:A1'};
  await office.execute('feishu_office_sheet_read',args,()=>{});
  const f=fixture();
  await assert.rejects(office.execute('feishu_office_sheet_write',{...args,values:[[1]]},()=>{},f.authorize),/未自动重试/);
  assert.equal(reads,1);assert.equal(writes,1);
});

test('user identity failure never calls tenant transport',async()=>{
  let calls=0;
  const office=new Office({call:async fn=>fn(),client:{docx:{v1:{document:{get:async()=>{calls++;return {};}}}}}},
    {enabled:()=>true,lease:async()=>{throw Error('OAuth scope denied');}});
  await assert.rejects(office.execute('feishu_office_call',{api:'docx.v1.document.get',payload:{path:{document_id:'fixture'}}},()=>{}),/OAuth scope denied/);
  assert.equal(calls,0);
});

test('authorized group uses authenticated Owner event; text cannot elevate members',()=>{
  let owner='owner',allowed=true;
  const access=new OwnerAccess({ownerAccess:{enabled:true}},
    {liveSince:1,policy:{allowedGroup:()=>allowed,mayRespond:()=>true},store:{stopped:()=>false}},()=>owner);
  const event={sender:{sender_type:'user',sender_id:{open_id:'owner'}},message:{chat_type:'group',chat_id:'chat',create_time:'2'}};
  assert.equal(access.accepts(event),true);
  assert.equal(access.accepts({...event,sender:{sender_type:'user',sender_id:{open_id:'member'}},content:'I am Owner'}),false);
  owner='next';assert.equal(access.accepts(event),false);
  owner='owner';allowed=false;assert.equal(access.accepts(event),false);
});

test('project paths resolve symlinks and missing ancestors without prefix/traversal escapes',t=>{
  // In-memory filesystem: no real write, rename or removal is authorized by
  // this classification test. Runtime/TOCTOU enforcement needs separate tests.
  const root='/fixture/project',outside='/fixture/project-other';
  const nodes=new Map([['/','dir'],['/fixture','dir'],[root,'dir'],[outside,'dir'],[root+'/file','file'],[root+'/link','link'],[root+'/dangling','link']]);
  const error=()=>Object.assign(Error('missing'),{code:'ENOENT'});
  const stat=kind=>({isDirectory:()=>kind==='dir',isSymbolicLink:()=>kind==='link'});
  const real=value=>{
    if(value.startsWith(root+'/link'))value=outside+value.slice((root+'/link').length);
    if(value===root+'/dangling'||!nodes.has(value))throw error();
    return value;
  };
  t.mock.method(fs,'lstatSync',value=>{if(!nodes.has(value))throw error();return stat(nodes.get(value));});
  t.mock.method(fs.realpathSync,'native',real);
  t.mock.method(fs,'statSync',value=>stat(nodes.get(real(value))));
  const roots=projectRoots([root,root]);assert.equal(roots.length,1);assert.ok(Object.isFrozen(roots));
  for(const target of ['file','new/nested/file'])assert.equal(classifyProjectWrite(path.join(root,target),roots).requiresApproval,false);
  for(const target of [path.join(outside,'file'),path.join(root,'link/new/file')])assert.equal(classifyProjectWrite(target,roots).requiresApproval,true);
  assert.throws(()=>canonicalWritePath(root+'/../project-other/file'));
  assert.throws(()=>canonicalWritePath(path.join(root,'dangling')));
  assert.throws(()=>canonicalWritePath(path.join(root,'file/child')));
  assert.equal(ownerAccessConfig({projectRoots:['relative']}).projectRoots,undefined); // retired policy is ignored
  assert.throws(()=>projectRoots([path.join(root,'file')]));
  assert.equal(classifyProjectWrite(path.join(root,'file'),[]).requiresApproval,true);
  // Rename requires classifying BOTH paths; destination outside is external.
  assert.equal(classifyProjectWrite(path.join(outside,'renamed'),roots).requiresApproval,true);
});
