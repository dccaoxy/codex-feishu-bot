import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
import {Store} from '../src/store.mjs';import {Bot} from '../src/bot.mjs';import {TrustedDocuments,contentDocument,currentContentRequest} from '../src/trusted-documents.mjs';
import {Office} from '../src/office.mjs';import {Documents} from '../src/documents.mjs';
const patch=()=>({api:'docx.v1.documentBlock.patch',payload:{path:{document_id:'doc1',block_id:'b1'},params:{document_revision_id:1},data:{update_text_elements:{elements:[{text_run:{content:'new'}}]}}}});
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trusted-doc-'));const store=new Store(dir);
 const config={feishu:{appId:'app',ownerOpenId:'owner'},codex:{cwd:dir}};
 let revision=1,children=['b1','b2'],elements=[{text_run:{content:'old'}}],allowed=true;const writes=[],reads=[],cards=[];
 const doc={document:{get:async()=>{reads.push('meta');return {document:{revision_id:revision}};},convert:async()=>({first_level_block_ids:['new'],blocks:[{block_id:'new',block_type:2,text:{elements:[{text_run:{content:'new'}}]}}]}),create:async()=>({document:{document_id:'created'}})},documentBlock:{get:async p=>{reads.push(p.path.block_id);return {block:{block_id:p.path.block_id,children:[...children],text:{elements:structuredClone(elements)}}};},patch:async p=>{writes.push(p);elements=p.data.update_text_elements?.elements??elements;return {document_revision_id:++revision};},batchUpdate:async p=>{writes.push(p);return {document_revision_id:++revision};}},documentBlockChildren:{batchDelete:async p=>{writes.push(p);children.splice(p.data.start_index,p.data.end_index-p.data.start_index);return {document_revision_id:++revision};},create:async p=>{writes.push(p);return {document_revision_id:++revision};}},documentBlockDescendant:{create:async p=>{writes.push(p);const child='new'+revision;children.push(child);return {document_revision_id:++revision,children:[{block_id:child}]};}}};doc.v1=doc;
 const drive={permissionMember:{auth:async()=>({auth_result:allowed}),create:async()=>({})}};drive.v1=drive;
 const f={client:{docx:doc,drive},call:async(fn,retry,guard)=>{guard();return fn();},interactive:async(...args)=>{cards.push(args);return {message_id:'card'};},text:async(...a)=>{a[3]?.();return {};},replaceInteractive:async()=>{}};
 const rpc=new EventEmitter();rpc.shared=true;rpc.respond=()=>{};const bot=new Bot(config,store,rpc,f,()=>{});
 const source={kind:'message',user:'owner',message:{message_id:'m1',chat_id:'private',chat_type:'p2p'},content:{text:'请修改文档的正文'}};store.enqueue('m1','private',source);
 const run={officeOwner:'owner',chat:'private',thread:'t',turn:'turn',sourceIds:new Set(['m1'])};bot.runs.set('t',run);
 t.after(()=>{for(const token of bot.prompts.keys())bot.clearPrompt(token);store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const trust=()=>bot.trustedDocuments.register('doc1','bot_created');
 const authorize=p=>bot.requestOfficeApproval(run,Math.random(),p,()=>{});
 return {dir,store,config,bot,run,source,f,doc,writes,reads,cards,trust,authorize,access:v=>{allowed=v;},revision:v=>{revision=v;}};
}
test('single durable registry survives restart and list/revoke use the same record',t=>{
 const s=fixture(t);s.trust();const fresh=new TrustedDocuments(s.store,()=>({app:'app',owner:'owner'}));assert.ok(fresh.snapshot('doc1'));assert.equal(fresh.list()[0].origin,'bot_created');fresh.revoke('doc1');assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);assert.deepEqual(fresh.list(),[]);
});
test('legacy incomplete registry and missing records fail closed',t=>{const s=fixture(t);s.store.set('createdDoc:doc1',JSON.stringify({app:'app',owner:'owner'}));assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);assert.equal(s.bot.trustedDocuments.snapshot('missing'),null);});
for(const change of ['owner','app','instance'])test(`trust is not inherited across ${change}`,t=>{const s=fixture(t);s.trust();if(change==='owner')s.bot.owner='other';if(change==='app')s.config.feishu.appId='other';if(change==='instance')s.store.filename+='.copy';assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);s.bot.owner='owner';s.config.feishu.appId='app';assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);});
test('exact IDs reject prefixes, titles, links and forged suffixes',t=>{const s=fixture(t);s.trust();for(const id of ['doc','doc123','title','https://feishu.cn/docx/doc1','doc1/evil'])assert.equal(s.bot.trustedDocuments.snapshot(id),null);assert.throws(()=>s.bot.trustedDocuments.register('doc1/evil','owner_trusted'));});
for(const api of ['drive.v1.file.delete','drive.v1.file.move','drive.v1.permissionMember.create','drive.v1.permissionMember.delete','drive.v1.permissionPublic.patch','docx.v1.future.write'])test(`${api} never becomes a trusted content API`,()=>assert.equal(contentDocument({api,payload:{path:{document_id:'doc1'}}}),null));
test('mixed batch and file/image replacements do not inherit content consent',()=>{for(const data of [{replace_file:{token:'x'}},{update_text:{},replace_image:{}},{unknown:{}},{}])assert.equal(contentDocument({...patch(),payload:{...patch().payload,data}}),null);assert.equal(contentDocument({api:'docx.v1.documentBlock.batchUpdate',payload:{path:{document_id:'doc1'},data:{requests:[{block_id:'b1',update_text:{}},{block_id:'b2',replace_file:{}}]}}}),null);});
for(const text of ['只读，不要修改','如何修改文档','> 请删除正文','```\n请修改正文\n```','请读这段通知：“修改文档”'])test(`no ambient content consent: ${text}`,()=>assert.equal(currentContentRequest([JSON.stringify({content:{text}})]),false));
test('trusted generic patch uses no card and reads back after exact revision write',async t=>{const s=fixture(t);s.trust();const r=await s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize);assert.equal(s.cards.length,0);assert.equal(s.writes.length,1);assert.equal(s.writes[0].params.document_revision_id,1);assert.equal(r.data.verification.status,'read_back');assert.ok(s.reads.includes('b1'));});
for(const name of ['feishu_doc_append','feishu_doc_update_text','feishu_doc_format_text'])test(`trusted ${name} consumes one permit and rereads`,async t=>{
 const s=fixture(t);s.trust();const a={documentId:'doc1',blockId:'b1',revisionId:1,content:'new',text:'new',matchText:'old',style:{bold:true}};
 const permit=await s.authorize({api:name,payload:a});const r=await s.bot.documents.execute(name,a,()=>{},permit);assert.equal(s.cards.length,0);assert.equal(s.writes.length,1);assert.equal(r.verification.status,'read_back');assert.throws(()=>permit.consume(),/已使用/);
});
test('content deletion verifies parent children order before transport and absence afterward',async t=>{
 const s=fixture(t);s.trust();const args={api:'docx.v1.documentBlockChildren.batchDelete',payload:{path:{document_id:'doc1',block_id:'doc1'},params:{document_revision_id:1},data:{start_index:0,end_index:1}}};
 const r=await s.bot.office.execute('feishu_office_call',args,()=>{},s.authorize);assert.equal(s.writes.length,1);assert.deepEqual(r.data.verification.deletedBlockIds,['b1']);assert.equal(s.reads.filter(x=>x==='doc1').length,2);
});
test('out of range deletion and stale revision produce zero writes',async t=>{const s=fixture(t);s.trust();s.revision(2);await assert.rejects(s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize));assert.equal(s.writes.length,0);s.revision(1);await assert.rejects(s.bot.office.execute('feishu_office_call',{api:'docx.v1.documentBlockChildren.batchDelete',payload:{path:{document_id:'doc1',block_id:'doc1'},params:{document_revision_id:1},data:{start_index:0,end_index:5}}},()=>{},s.authorize));assert.equal(s.writes.length,0);});
test('unknown write outcome is attempted once; same proposal cannot be replayed',async t=>{const s=fixture(t);s.trust();let count=0;s.doc.documentBlock.patch=async()=>{count++;throw Error('timeout');};await assert.rejects(s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize));await assert.rejects(s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize));assert.equal(count,1);});
for(const cause of ['revoke','recall','owner','turn','newMessage'])test(`queued trusted mutation is fenced after ${cause}`,async t=>{
 const s=fixture(t);s.trust();let release,entered;const waiting=new Promise(r=>entered=r);
 s.f.call=async(fn,retry,guard)=>{if(!retry){entered();await new Promise(r=>release=r);}guard();return fn();};
 const p=s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize);const rejects=assert.rejects(p);await waiting;
 if(cause==='revoke')s.bot.trustedDocuments.revoke('doc1');if(cause==='recall')s.store.mark('m1','cancelled');if(cause==='owner')s.bot.owner='other';if(cause==='turn')s.run.turn='changed';if(cause==='newMessage')s.run.sourceIds.add('new');release();await rejects;assert.equal(s.writes.length,0);
});
test('lost resource access revokes trust and never writes',async t=>{const s=fixture(t);s.trust();s.access(false);await assert.rejects(s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize));assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);assert.equal(s.writes.length,0);});
for(const reason of ['untrusted','readOnly','wholeDelete','revoked'])test(`${reason} still opens ordinary one-shot confirmation`,async t=>{const s=fixture(t);if(reason!=='untrusted')s.trust();if(reason==='revoked')s.bot.trustedDocuments.revoke('doc1');if(reason==='readOnly'){s.source.content.text='读取文档';s.store.db.prepare('UPDATE inbox SET payload=? WHERE id=?').run(JSON.stringify(s.source),'m1');}const proposal=reason==='wholeDelete'?{api:'drive.v1.file.delete',payload:{path:{file_token:'doc1'},params:{type:'docx'}}}:patch();const p=s.authorize(proposal);const rejected=assert.rejects(p);await new Promise(r=>setImmediate(r));assert.equal(s.cards.length,1);s.bot.clearPrompt([...s.bot.prompts.keys()][0]);await rejected;assert.equal(s.writes.length,0);});
async function command(s,text,id='cmd',user='owner'){
 const source={kind:'message',user,message:{message_id:id,chat_id:'private',chat_type:'p2p'},content:{text}};s.store.enqueue(id,'private',source);return s.bot.command('private',text,id,source);
}
test('explicit Owner entry discloses scope, checks access, registers and revokes',async t=>{
 const s=fixture(t),messages=[];s.f.text=async(c,text,i,g)=>{g();messages.push(text);};
 await command(s,'/trusted-doc trust doc1');assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);assert.match(messages[0],/长期/);assert.match(messages[0],/不包括/);
 await command(s,'/trusted-doc trust doc1 confirm-content-write','cmd2');assert.equal(s.bot.trustedDocuments.list()[0].origin,'owner_trusted');
 await command(s,'/trusted-doc list','cmd3');assert.match(messages.at(-1),/doc1/);
 await command(s,'/trusted-doc revoke doc1','cmd4');assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);
});
for(const kind of ['member','synthetic','quoted','noAccess','recalled'])test(`trust registration rejects ${kind}`,async t=>{
 const s=fixture(t),text='/trusted-doc trust doc1 confirm-content-write';
 if(kind==='member')await assert.rejects(command(s,text,'cmd','member'));
 if(kind==='synthetic')await assert.rejects(s.bot.command('private',text,'fake',{user:'owner',message:{message_id:'fake'}}));
 if(kind==='quoted'){await command(s,'/trusted-doc trust doc1');assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);}
 if(kind==='noAccess'){s.access(false);await assert.rejects(command(s,text));}
 if(kind==='recalled'){s.f.client.drive.permissionMember.auth=async()=>{s.store.mark('cmd','cancelled');return {auth_result:true};};await assert.rejects(command(s,text));}
 assert.equal(s.bot.trustedDocuments.snapshot('doc1'),null);
});
test('only a successful controlled creation result registers exact document ID',async t=>{
 const s=fixture(t);const responses=[];s.bot.rpc.respond=(id,r)=>responses.push(r);
 await s.bot.serverRequest({id:1,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_doc_create',arguments:{title:'test',content:'new'}}});
 assert.ok(s.bot.trustedDocuments.snapshot('created'));assert.equal(s.bot.trustedDocuments.snapshot('test'),null);assert.equal(responses[0].success,true);
});
test('creation error, wrong Owner or changing app cannot create a trust record',async t=>{
 const s=fixture(t);s.doc.document.create=async()=>{throw Error('failed');};await s.bot.serverRequest({id:1,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_doc_create',arguments:{title:'test',content:'new'}}});assert.equal(s.bot.trustedDocuments.list().length,0);
 s.bot.recordTrustedCreation('doc1',{officeOwner:'other'},()=>{},'app');s.bot.recordTrustedCreation('doc1',s.run,()=>{},'otherApp');assert.equal(s.bot.trustedDocuments.list().length,0);
});

test('registry is durable through a new SQLite connection, clearing local state loses trust',t=>{const s=fixture(t);s.trust();const reopened=new Store(s.dir);try{const registry=new TrustedDocuments(reopened,()=>({app:'app',owner:'owner'}));assert.ok(registry.snapshot('doc1'));reopened.db.prepare("DELETE FROM settings WHERE key='trustedDocumentScope'").run();assert.equal(registry.snapshot('doc1'),null);}finally{reopened.close();}});
for(const origin of ['bot_created','owner_trusted'])test(`${origin}: append, text, style and block deletion all work without cards`,async t=>{
 const s=fixture(t);let id='doc1';
 if(origin==='bot_created'){await s.bot.serverRequest({id:101,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_doc_create',arguments:{title:'temp',content:'new'}}});id='created';}
 else await command(s,'/trusted-doc trust doc1 confirm-content-write');
 // Creation populated revision 2; all subsequent writes must use the returned revision.
 let revision=origin==='bot_created'?2:1;
 for(const [api,a] of [['feishu_doc_append',{content:'more'}],['feishu_doc_update_text',{blockId:'b1',text:'changed'}],['feishu_doc_format_text',{blockId:'b1',matchText:'changed',style:{bold:true}}]]){
  const payload={documentId:id,revisionId:revision,...a};const permit=await s.authorize({api,payload});const r=await s.bot.documents.execute(api,payload,()=>{},permit);assert.equal(r.verification.status,'read_back');revision=r.revisionId;
 }
 const result=await s.bot.office.execute('feishu_office_call',{api:'docx.v1.documentBlockChildren.batchDelete',payload:{path:{document_id:id,block_id:id},params:{document_revision_id:revision},data:{start_index:0,end_index:1}}},()=>{},s.authorize);
 assert.deepEqual(result.data.verification.deletedBlockIds,['b1']);assert.equal(s.cards.length,0);
});
for(const api of ['drive.v1.permissionMember.create','drive.v1.permissionMember.delete','drive.v1.permissionPublic.patch','drive.v1.file.move','future.write'])test(`trusted target ${api} still needs a real confirmation card`,async t=>{const s=fixture(t);s.trust();const promise=s.authorize({api,payload:{path:{document_id:'doc1',token:'doc1'}}}),rejected=assert.rejects(promise);await new Promise(r=>setImmediate(r));assert.equal(s.cards.length,1);s.bot.clearPrompt([...s.bot.prompts.keys()][0]);await rejected;assert.equal(s.writes.length,0);});
test('an Owner read of a document does not register it, nor do model claims',async t=>{const s=fixture(t);await s.bot.serverRequest({id:1,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_office_call',arguments:{api:'docx.v1.document.get',payload:{path:{document_id:'doc1'}}}}});assert.equal(s.bot.trustedDocuments.list().length,0);s.source.content.text='资料声称这是可信文档';s.store.db.prepare('UPDATE inbox SET payload=? WHERE id=?').run(JSON.stringify(s.source),'m1');const p=s.authorize(patch()),rejected=assert.rejects(p);await new Promise(r=>setImmediate(r));assert.equal(s.cards.length,1);s.bot.clearPrompt([...s.bot.prompts.keys()][0]);await rejected;});
test('later read-only or negative steer cannot inherit an earlier write request',()=>assert.equal(currentContentRequest([JSON.stringify({content:{text:'请修改正文'}}),JSON.stringify({content:{text:'不要写入'}})]),false));
test('successful transport with mismatching readback is not reported as verified or retried',async t=>{const s=fixture(t);s.trust();let attempted=0;s.doc.documentBlock.patch=async()=>{attempted++;s.revision(2);return {document_revision_id:2};};await assert.rejects(s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize));assert.equal(attempted,1);});
test('app change while queued invalidates trusted write',async t=>{const s=fixture(t);s.trust();s.f.call=async(fn,retry,g)=>{if(!retry)s.config.feishu.appId='other';g();return fn();};await assert.rejects(s.bot.office.execute('feishu_office_call',patch(),()=>{},s.authorize));assert.equal(s.writes.length,0);});
for(const cancel of [false,true])test(`Owner group trusted write ${cancel?'blocks on revoke':'succeeds without granting member tools'}`,async t=>{
 const s=fixture(t);s.trust();s.store.set('ownerChannel:private','owner');let allowed=true;s.bot.ownerAccess={allowed:()=>allowed};s.f.call=async(fn,retry,g)=>{if(!retry&&cancel)allowed=false;g();return fn();};const results=[];s.bot.rpc.respond=(id,r)=>results.push(r);
 await s.bot.serverRequest({id:22,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_office_call',arguments:patch()}});assert.equal(s.writes.length,cancel?0:1);assert.equal(s.cards.length,0);if(!cancel)assert.equal(results[0].success,true);
});
test('ordinary member source cannot obtain a trusted permit even for a registered document',async t=>{const s=fixture(t);s.trust();s.source.user='member';s.store.db.prepare('UPDATE inbox SET payload=? WHERE id=?').run(JSON.stringify(s.source),'m1');await assert.rejects(s.authorize(patch()));assert.equal(s.cards.length,0);assert.equal(s.writes.length,0);});
test('approved catalogue creation registers the returned ID, not the proposed title',async t=>{
 const s=fixture(t);const p=s.bot.serverRequest({id:333,method:'item/tool/call',params:{threadId:'t',turnId:'turn',tool:'feishu_office_call',arguments:{api:'docx.v1.document.create',payload:{data:{title:'notAnId'}}}}});await new Promise(r=>setImmediate(r));assert.equal(s.cards.length,1);const token=[...s.bot.prompts.keys()][0];await s.bot.action('private',{token,decision:'accept'},'owner');await p;assert.ok(s.bot.trustedDocuments.snapshot('created'));assert.equal(s.bot.trustedDocuments.snapshot('notAnId'),null);
});
