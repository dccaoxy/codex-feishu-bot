import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {GroupMessageStore} from '../src/group-store.mjs';
import {OwnerGroupGateway} from '../src/owner-group-gateway.mjs';
import {parseCollectionRequest,createReadCollection} from '../src/owner-read-collection.mjs';

const office=id=>`https://example.feishu.cn/docx/${id}`;
const request='读取新羽群里的所有飞书文档';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-collection-')),store=new Store(dir),messages=new GroupMessageStore(path.join(dir,'groups'),null);
 const config={groups:{enabled:true,allowedChatIds:['a','b'],knowledge:{enabled:true}},ownerAccess:{enabled:false}};
 const groups={store:messages,closed:false},names={a:'FY26 AEG新羽计划',b:'财务群',secret:'未授权群'};
 let owner='owner',live=true,seq=0;
 const feishu={call:fn=>fn(),client:{im:{v1:{chat:{get:async({path:p})=>({name:names[p.chat_id]})}}}}};
 const gateway=new OwnerGroupGateway(config,store,groups,feishu,()=>owner);
 for(const chat of ['a','b','secret'])messages.setSync(chat,{state:'complete',initial_complete:1});
 const add=(chat,id,text,kind='text',time=Date.now())=>messages.ingest({sender:{sender_type:'user',sender_id:{open_id:'speaker'}},message:{chat_id:chat,message_id:id,message_type:kind,create_time:String(time),content:JSON.stringify(kind==='text'?{text}:text)}},false);
 function context(text=request,overrides={}){
  const id='request'+(++seq),d={kind:'message',user:overrides.user||owner,content:{text},message:{chat_id:'private',chat_type:overrides.type||'p2p',message_id:id,message_type:'text'}};
  store.enqueue(id,'private',d);gateway.accept('private',id);
  return gateway.context(d,'owner-thread',()=>live);
 }
 const create=async(text=request)=>{const c=context(text);return createReadCollection(text,gateway,c,()=>{});};
 t.after(()=>{store.close();messages.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,store,messages,groups,config,gateway,feishu,names,add,context,create,setOwner:value=>owner=value,setLive:value=>live=value};
}

for(const text of [request,'读取 FY26 AEG新羽计划群里所有的飞书文档链接，包括多维表格','请读取「FY26 AEG新羽计划」中全部Office资源','查看新羽群里面的全部文档链接'])test(`collection request is explicit and complete: ${text}`,()=>{
 const p=parseCollectionRequest(text);assert.ok(p);assert.deepEqual(p.types,['docx','wiki','sheets','base','file','drive/folder']);
});
for(const [label,types] of [['Docx',['docx']],['Wiki',['wiki']],['Sheet',['sheets']],['多维表格',['base']],['Drive',['file','drive/folder']]])test(`collection type filter ${label}`,()=>{assert.deepEqual(parseCollectionRequest(`读取新羽群里的所有${label}`).types,types);});
for(const text of ['不要读取新羽群里的所有飞书文档','如果有需要读取新羽群里的所有飞书文档','引用：读取新羽群里的所有飞书文档','读取新羽群里的所有飞书文档，然后发送到财务群','读取新羽群里的所有飞书文档\n读取财务群里的所有飞书文档','读取所有飞书文档','读取这个群里的所有飞书文档','读取新羽群和财务群里的所有飞书文档','读取新羽群里的部分飞书文档','> 读取新羽群里的所有飞书文档'])test(`unsupported collection prose does not mint authority: ${text}`,()=>{assert.equal(parseCollectionRequest(text),null);});

test('24 group mirror links require one Owner request, retain exact provenance, and page without bodies',async t=>{
 const f=fixture(t);for(let i=0;i<24;i++)f.add('a','source'+i,`ordinary text ${office('doc'+i)}`);
 f.add('b','foreign',office('notInCollection'));f.add('secret','secret',office('secretDocument'));
 const snapshot=()=>['messages','raw_messages','group_requests','group_threads'].map(table=>JSON.stringify(f.messages.db.prepare('SELECT * FROM '+table).all()));const before=snapshot();
 const c=await f.create();assert.equal(c.grants.length,24);assert.equal(c.page().resources.length,10);assert.equal(c.page(10).resources.length,10);assert.equal(c.page(20).resources.length,4);assert.equal(c.page(20).nextOffset,null);
 assert.ok(c.grants.every(g=>g.provenance.chat==='a'&&g.provenance.messageId.startsWith('source')&&g.provenance.resourceType==='docx'&&g.provenance.resourceId===g.values.document_id));
 assert.ok(c.grants.every(g=>Object.isFrozen(g)&&Object.isFrozen(g.values)&&Object.isFrozen(g.provenance)));assert.deepEqual(snapshot(),before);
 assert.ok(!JSON.stringify(c.page()).includes('ordinary text'));assert.ok(!JSON.stringify(c.page()).includes('notInCollection'));
});

test('all actual text and post URL fields are considered, not only eight preview links or JSON metadata',async t=>{
 const f=fixture(t);f.add('a','many',Array.from({length:24},(_,i)=>office('m'+i)).join(' '));
 f.add('a','post',{zh_cn:{title:'Title '+office('title'),content:[[{tag:'a',text:'Click',href:office('href')},{tag:'text',text:office('body')},{tag:'img',image_key:office('notAnImageURL')},{tag:'at',user_name:office('notAUserURL')}]],hidden:office('notAHiddenURL')},metadata:{text:office('notMetadata'),href:office('notMetadataHref')}},'post');
 const ids=(await f.create()).grants.map(g=>g.provenance.resourceId);assert.equal(ids.length,27);for(const id of ['title','href','body'])assert.ok(ids.includes(id));assert.ok(!ids.some(id=>id.startsWith('not')));
});

const localePost=id=>({title:'resource '+office(id),content:[[{tag:'a',text:'resource',href:office(id)}]]});
const brokenLocales=[
 ['null branch',null],['array branch',[]],['string branch',office('lost')],['missing content',{}],
 ['string content',{content:office('lost')}],['object content',{content:{text:office('lost')}}],
 ['non-array row',{content:[office('lost')]}],['null node',{content:[[null]]}],
 ['array node',{content:[[[office('lost')]]]}],['missing node tag',{content:[[{text:office('lost')}]]}],
 ['invalid text node',{content:[[{tag:'text',text:{url:office('lost')}}]]}],
 ['invalid link href',{content:[[{tag:'a',text:'resource',href:{url:office('lost')}}]]}],
 ['invalid title',{title:{url:office('lost')},content:[]}]
];
for(const [label,broken] of brokenLocales)test(`mixed locales reject the entire collection: ${label}`,async t=>{
 const f=fixture(t);f.add('a','earlier',office('earlier'));
 f.add('a','mixed',{en_us:localePost('valid'),zh_cn:broken},'post');
 await assert.rejects(f.create(),/未建立完整集合/);
});
test('multiple valid locales contribute all references regardless of language order',async t=>{
 const f=fixture(t);f.add('a','multi',{zh_cn:localePost('chinese'),en_us:localePost('english'),ja_jp:localePost('japanese')},'post');
 const c=await f.create();assert.deepEqual(c.grants.map(g=>g.provenance.resourceId),['chinese','english','japanese']);
 assert.ok(c.grants.every(g=>g.provenance.messageId==='multi'));
});
for(const [label,payload] of [
 ['both valid',{...localePost('top'),en_us:localePost('locale')}],
 ['broken top',{content:office('lost'),en_us:localePost('locale')}],
 ['broken locale',{...localePost('top'),zh_cn:null}]
])test(`mixed top-level and locale layouts reject the entire collection: ${label}`,async t=>{
 const f=fixture(t);f.add('a','mixed',payload,'post');await assert.rejects(f.create(),/未建立完整集合/);
});
test('single top-level post and empty valid locale remain supported',async t=>{
 const f=fixture(t);f.add('a','top',localePost('top'),'post');f.add('a','locales',{zh_cn:{content:[]},en_us:localePost('english')},'post');
 assert.deepEqual((await f.create()).grants.map(g=>g.provenance.resourceId).sort(),['english','top']);
});

test('only complete normalized paths count; query/fragment nested URLs and forged hosts do not add grants',async t=>{
 const f=fixture(t);f.add('a','urls',`${office('root')}?next=${office('nested')}#${office('fragment')} ${office('other')}。 https://example.feishu.cn.evil.test/docx/evil https://evil.test/?u=${office('bad')} ${office('suffix')}/forged https://user:pass@example.feishu.cn/docx/credentials https://example.feishu.cn:443/docx/defaultport`);
 const ids=(await f.create()).grants.map(g=>g.provenance.resourceId);assert.deepEqual(ids,['root','other','defaultport']);
});

for(const punctuation of ['，','。','；','！','？','、','：'])test(`adjacent resource links separated by Chinese ${punctuation} remain separate`,async t=>{
 const f=fixture(t);f.add('a','adjacent',`${office('first')}${punctuation}${office('second')}${punctuation}另一个链接${office('third')}`);
 assert.deepEqual((await f.create()).grants.map(g=>g.provenance.resourceId),['first','second','third']);
});
for(const suffix of ['?next=','?text=前缀，','#next=','#前缀，'])test(`Chinese punctuation inside query/fragment cannot mint nested URLs: ${suffix}`,async t=>{
 const f=fixture(t);f.add('a','atomic',`${office('root')}${suffix}${office('nested')}，${office('anotherNested')}`);
 assert.deepEqual((await f.create()).grants.map(g=>g.provenance.resourceId),['root']);
});
test('after a Chinese separator the next complete URL owns its entire query and fragment',async t=>{
 const f=fixture(t);f.add('a','mixed',`${office('first')}，${office('second')}?next=${office('nested')}；${office('alsoNested')}#${office('fragment')}`);
 assert.deepEqual((await f.create()).grants.map(g=>g.provenance.resourceId),['first','second']);
});
for(const suffix of ['?next="https://example.feishu.cn/docx/nested"',"?next='https://example.feishu.cn/docx/nested'",'?next=“https://example.feishu.cn/docx/nested”','#next="https://example.feishu.cn/docx/nested"','?next=<https://example.feishu.cn/docx/nested>','?next=正文，https://example.feishu.cn/docx/nested'])test(`structured href is one URL atom: ${suffix}`,async t=>{
 const f=fixture(t);f.add('a','href',{zh_cn:{content:[[{tag:'a',text:'document',href:office('root')+suffix}]]}},'post');
 assert.deepEqual((await f.create()).grants.map(g=>g.provenance.resourceId),['root']);
});
for(const href of [`${office('first')}，${office('second')}`,`not-a-url ${office('nested')}`,`javascript:open('${office('nested')}')`,`https://evil.test/?next="${office('nested')}"`])test(`invalid or non-Office href cannot expose embedded Office URL: ${href}`,async t=>{
 const f=fixture(t);f.add('a','href',{zh_cn:{content:[[{tag:'a',text:'document',href}]]}},'post');assert.equal((await f.create()).grants.length,0);
});
for(const suffix of ['?next="https://example.feishu.cn/docx/nested"',"?next='https://example.feishu.cn/docx/nested'",'?next=“https://example.feishu.cn/docx/nested”','#next="https://example.feishu.cn/docx/nested"','?next=<https://example.feishu.cn/docx/nested>'])test(`quotes or brackets in text URL cannot start secondary discovery: ${suffix}`,async t=>{
 const f=fixture(t);f.add('a','text',office('root')+suffix);assert.deepEqual((await f.create()).grants.map(g=>g.provenance.resourceId),['root']);
});
test('ordinary quoted and Markdown-wrapped text links still identify their exact roots',async t=>{
 const f=fixture(t);f.add('a','text',`“${office('quoted')}” [文档](${office('markdown')}) <${office('angle')}>`);assert.deepEqual((await f.create()).grants.map(g=>g.provenance.resourceId),['quoted','markdown','angle']);
});

test('resource type filters exclude other types and retain Drive file/folder metadata roots',async t=>{
 const f=fixture(t);for(const type of ['docx','wiki','sheets','base','file','drive/folder'])f.add('a',type,`https://example.feishu.cn/${type}/resource`);
 assert.deepEqual((await f.create('读取新羽群里所有Docx')).grants.map(g=>g.root),['document_id']);
 assert.deepEqual((await f.create('读取新羽群里所有Drive')).grants.map(g=>g.root).sort(),['doc_token','folder_token']);
});

test('each trusted URL retains its complete root and child tuple, including Wiki constraints',async t=>{
 const f=fixture(t);f.add('a','tuples','https://example.feishu.cn/base/baseA?table=tableA&view=viewA https://example.feishu.cn/base/baseB?table=tableB&view=viewB https://example.feishu.cn/sheets/sheetA?sheet=tabA&range=A1:B2 https://example.feishu.cn/sheets/sheetB?range=tabB!D3:E4 https://example.feishu.cn/wiki/wikiA?table=tableA&view=viewA');
 const rows=(await f.create()).grants;assert.deepEqual(rows[0].values,{app_token:'baseA',table_id:'tableA',view_id:'viewA'});assert.deepEqual(rows[1].values,{app_token:'baseB',table_id:'tableB',view_id:'viewB'});
 assert.deepEqual(rows[2].values,{spreadsheet_token:'sheetA',range:'tabA!A1:B2'});assert.deepEqual(rows[3].values,{spreadsheet_token:'sheetB',range:'tabB!D3:E4'});assert.deepEqual(rows[4].values,{token:'wikiA'});assert.deepEqual(rows[4].wikiSelectors,{table_id:'tableA',view_id:'viewA'});
});
for(const url of ['base/b?view=v','base/b?table=a&table=b','base/b?table=a&table_id=a','base/b?range=tab!A1:A2','sheets/s?sheet=a&range=b!A1:A2','sheets/s?range=A1:B2','wiki/w?table=t&sheet=s','wiki/w?table=t&view=v&view=w'])test(`ambiguous URL restrictions fail closed ${url}`,async t=>{const f=fixture(t);f.add('a','bad','https://example.feishu.cn/'+url);await assert.rejects(f.create(),/target_not_authorized/);});

test('unrelated free IDs, document references and later arrivals cannot expand a frozen collection',async t=>{
 const f=fixture(t);f.add('a','initial',`${office('root')} table_id tableFromProse https://example.feishu.cn/base/baseA`);
 const c=await f.create();f.add('a','late',office('late'));f.add('b','sameid',office('root'));
 assert.deepEqual(c.grants.map(g=>g.values),[{document_id:'root'},{app_token:'baseA'}]);assert.equal(c.grants.length,2);assert.ok(c.grants.every(g=>g.provenance.chat==='a'));
});

test('same URL in separate messages retains separate revocation dependencies',async t=>{
 const f=fixture(t);f.add('a','first',office('doc'));f.add('a','second',office('doc'));const c=await f.create();assert.equal(c.grants.length,2);
 f.messages.recall('a','first');assert.doesNotThrow(c.check);assert.throws(c.grants.find(g=>g.provenance.messageId==='first').check);assert.doesNotThrow(c.grants.find(g=>g.provenance.messageId==='second').check);
});

test('source recall invalidates only its grant; page delivery rechecks every displayed source',async t=>{
 const f=fixture(t);for(let i=0;i<11;i++)f.add('a','msg'+String(i).padStart(2,'0'),office('d'+i), 'text',Date.now()+i);
 const c=await f.create(),page=c.page(0);assert.equal(page.resources.length,10);f.messages.recall('a','msg00');assert.doesNotThrow(c.check);assert.throws(c.grants[0].check);assert.doesNotThrow(c.grants[10].check);assert.throws(()=>c.page(0));assert.equal(c.page(10).resources.length,1);
});

for(const mutation of ['raw changed','hidden','retained out','source removed'])test(`source grant invalidation: ${mutation}`,async t=>{
 const f=fixture(t);f.add('a','source',office('doc'));const c=await f.create();
 if(mutation==='raw changed')f.messages.db.prepare('UPDATE raw_messages SET content=? WHERE chat=? AND id=?').run(JSON.stringify({text:office('other')}),'a','source');
 if(mutation==='hidden')f.messages.db.prepare("INSERT INTO group_requests(chat,id,event,state) VALUES('a','source','{}','queued')").run();
 if(mutation==='retained out')f.messages.retentionDays=-1;
 if(mutation==='source removed')f.messages.db.prepare("DELETE FROM messages WHERE chat='a' AND id='source'").run();
 assert.throws(c.grants[0].check);
});

for(const mutation of ['owner','lifecycle','steer','group revoked','group stopped','groups closed','name changed','alias ambiguous'])test(`collection scope invalidation: ${mutation}`,async t=>{
 const f=fixture(t);f.add('a','source',office('doc'));const c=await f.create();
 if(mutation==='owner')f.setOwner('other');if(mutation==='lifecycle')f.setLive(false);if(mutation==='steer')f.gateway.accept('private','newer');if(mutation==='group revoked')f.config.groups.allowedChatIds=['b'];if(mutation==='group stopped')f.messages.leave('a');if(mutation==='groups closed')f.groups.closed=true;
 if(mutation==='name changed')f.gateway.cache.set('a',{name:'另一个群',at:Date.now()});if(mutation==='alias ambiguous')f.gateway.cache.set('b',{name:'新羽其他计划',at:Date.now()});
 assert.throws(c.check);assert.throws(c.grants[0].check);assert.throws(()=>c.page());
});

test('untrusted contexts, message mismatch, strangers and ordinary group callers cannot mint collections',async t=>{
 const f=fixture(t);f.add('a','source',office('doc'));
 for(const overrides of [{user:'stranger'},{type:'group'}])await assert.rejects(createReadCollection(request,f.gateway,f.context(request,overrides),()=>{}));
 const c=f.context();await assert.rejects(createReadCollection(request,f.gateway,{...c},()=>{}));await assert.rejects(createReadCollection(request,f.gateway,f.context('different'),()=>{}));
 assert.equal(await createReadCollection('读取 document_id doc',null,null,()=>{throw Error('unused');}),null);
});

test('group labels must resolve uniquely in current trusted directory, never by unknown-prefix suffix guessing',async t=>{
 const f=fixture(t);f.add('a','source',office('doc'));f.names.b='FY26 AEG新羽计划';await assert.rejects(f.create());
 f.names.b='财务群';f.gateway.cache.clear();await assert.rejects(f.create('读取未知新羽群里所有文档'));await assert.rejects(f.create('读取未知群里所有文档'));
 f.gateway.cache.clear();assert.equal((await f.create('读取 FY26 AEG新羽计划群里所有文档')).grants.length,1);
});

test('directory wait cannot resurrect revoked lifecycle authority',async t=>{
 const f=fixture(t);let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r),original=f.feishu.client.im.v1.chat.get;
 f.feishu.client.im.v1.chat.get=async p=>{entered();await gate;return original(p);};
 const pending=f.create();await waiting;f.setLive(false);release();await assert.rejects(pending);
});

test('hidden requests and unsupported payload fields are excluded before deriving resources',async t=>{
 const f=fixture(t);f.add('a','hidden',office('hidden'));f.messages.db.prepare("INSERT INTO group_requests(chat,id,event,state) VALUES('a','hidden','{}','queued')").run();
 f.add('a','file',{file_name:office('notText'),file_key:'file'},'file');assert.equal((await f.create()).grants.length,0);
});

test('resource budget overflow rejects the whole collection instead of granting a truncated prefix',async t=>{
 const f=fixture(t);f.add('a','too-many',Array.from({length:1001},(_,i)=>office('many'+i)).join(' '));await assert.rejects(f.create(),/未建立完整集合/);
});
test('raw byte budget overflow rejects before any resource is returned',async t=>{
 const f=fixture(t);f.add('a','too-large','x'.repeat(8*1024*1024)+office('end'));await assert.rejects(f.create(),/未建立完整集合/);
});
test('row budget overflow rejects even if each source has only one short link',async t=>{
 const f=fixture(t),db=f.messages.db,now=Date.now(),row=db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'),raw=db.prepare('INSERT INTO raw_messages(chat,id,content) VALUES(?,?,?)');
 db.exec('BEGIN');for(let i=0;i<5001;i++){row.run('a','r'+i,'speaker','user',now,'text','x','{}',null,null,null,'recorded');raw.run('a','r'+i,JSON.stringify({text:'x'}));}db.exec('COMMIT');await assert.rejects(f.create(),/未建立完整集合/);
});

for(const kind of ['text','post'])test(`plain ${kind} URL followed immediately by Chinese prose preserves exact ID`,async t=>{
 const f=fixture(t),text=office('doc123')+'请大家查看';
 f.add('a','source',kind==='text'?text:{zh_cn:{content:[[{tag:'text',text}]]}},kind);
 assert.deepEqual((await f.create()).grants.map(g=>g.values.document_id),['doc123']);
});
for(const suffix of ['/中文','%E4%B8%AD','-suffix/中文'])test(`invalid path is not repaired at Chinese text: ${suffix}`,async t=>{
 const f=fixture(t);f.add('a','source',office('doc123')+suffix);assert.equal((await f.create()).grants.length,0);
});
test('atomic href with adjacent Chinese is not repaired',async t=>{
 const f=fixture(t);f.add('a','source',{zh_cn:{content:[[{tag:'a',text:'link',href:office('doc123')+'中文'}]]}},'post');assert.equal((await f.create()).grants.length,0);
});
test('shared entries are visible but never grants; pagination and recall still apply',async t=>{
 const f=fixture(t);for(let i=0;i<11;i++)f.add('a','share'+i,`https://example.feishu.cn/share/base/${i%2?'form/':''}shr${i}`);
 f.add('a','doc',office('readable'));f.add('b','foreign','https://example.feishu.cn/share/base/foreign');
 const c=await f.create();assert.equal(c.grants.length,1);assert.equal(c.page().total,12);
 const entries=[...c.page().resources,...c.page(10).resources];
 const unsupported=entries.filter(e=>e.state==='unsupported');assert.equal(unsupported.length,11);
 assert.ok(unsupported.every(e=>e.reason==='unsupported_shared_resource_path'&&!e.root&&!e.values&&e.provenance.chat==='a'));
 f.messages.db.prepare("UPDATE messages SET state='cancelled' WHERE id='share0'").run();assert.throws(()=>c.page(),/target_not_authorized/);
});
for(const tail of ['?next=中文https://example.feishu.cn/docx/nested','#中文https://example.feishu.cn/docx/nested'])test(`Chinese query/fragment never splits nested target ${tail}`,async t=>{
 const f=fixture(t);f.add('a','source',office('root')+tail);assert.deepEqual((await f.create()).grants.map(g=>g.values.document_id),['root']);
});
for(const url of ['https://example.feishu.cn.evil.test/share/base/shr','https://user:pass@example.feishu.cn/share/base/shr','https://example.feishu.cn/share/base/shr/evil','https://evil.test/?next=https://example.feishu.cn/share/base/shr'])test(`forged shared entry is not inventoried ${url}`,async t=>{
 const f=fixture(t);f.add('a','source',url);assert.equal((await f.create()).page().total,0);
});
test('shared entries deduplicate rich text fields and obey type filtering',async t=>{
 const f=fixture(t),url='https://example.feishu.cn/share/base/form/shr';f.add('a','source',{zh_cn:{content:[[{tag:'a',text:url,href:url}]]}},'post');
 assert.equal((await f.create()).page().total,1);assert.equal((await f.create('读取新羽群里的所有Docx')).page().total,0);
});

for(const kind of ['text','post'])for(const second of ['docx/second','share/base/form/shared'])test(`Chinese prose preserves next ${second} in ${kind}`,async t=>{
 const f=fixture(t),text=office('first')+'请继续看https://example.feishu.cn/'+second;
 f.add('a','source',kind==='text'?text:{zh_cn:{content:[[{tag:'text',text}]]}},kind);
 const c=await f.create(),rows=c.page().resources;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.provenance.messageId==='source'));
 assert.equal(rows[1].state,second.startsWith('share')?'unsupported':'permitted');
});
for(const kind of ['text','post'])for(const delimiter of ['?next=中文','#中文'])test(`continued text does not split second URL ${delimiter} atom in ${kind}`,async t=>{
 const f=fixture(t),text=office('first')+'继续看'+office('second')+delimiter+office('nested')+'继续'+office('alsoNested');
 f.add('a','source',kind==='text'?text:{zh_cn:{content:[[{tag:'text',text}]]}},kind);
 assert.deepEqual((await f.create()).grants.map(g=>g.values.document_id),['first','second']);
});
test('three Chinese separated roots including unsupported share preserve remaining text',async t=>{
 const f=fixture(t);f.add('a','source',office('first')+'请看https://example.feishu.cn/share/base/shared再看'+office('last'));
 assert.equal((await f.create()).page().total,3);
});
test('href containing Chinese and another URL remains atomic',async t=>{
 const f=fixture(t);f.add('a','source',{zh_cn:{content:[[{tag:'a',text:'link',href:office('first')+'请看'+office('second')}]]}},'post');assert.equal((await f.create()).page().total,0);
});
