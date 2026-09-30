import test from 'node:test';
import assert from 'node:assert/strict';
import {feishuDocumentIds,resolveSendReferences} from '../src/send-references.mjs';

const groups=[{reference:'g_people',displayName:'机器人们'},{reference:'g_xinyu',displayName:'FY26 AEG新羽计划'}];
const link=id=>'https://team.feishu.cn/docx/'+id;
const prior={request:'整理 FY26 AEG新羽计划 的文档',answer:'《新羽群讨论统计》 '+link('doc1')};
const resolve=(currentOwnerRequest,overrides={})=>resolveSendReferences({currentOwnerRequest,recentTurns:[prior],groups,...overrides});

test('current unique short name and a recent unique document have source-marked evidence, not authority',()=>{
 const r=resolve('把这个文档发到新羽群里去');
 assert.deepEqual(r.groups,['g_xinyu']);assert.deepEqual(r.documents,['doc1']);assert.deepEqual(r.ambiguities,[]);assert.equal(r.referenceOnly,true);
 assert.equal(r.sources.groups[0].source,'current_request');assert.equal(r.sources.groups[0].kind,'alias');assert.equal(r.sources.documents[0].source,'recent_turn_0_assistant');
 assert.equal('decision' in r,false);assert.equal('authorized' in r,false);
});

test('group pronoun uses latest user mention, not assistant suggestion or proposed target',()=>{
 const recentTurns=[prior,{request:'看看机器人们群',answer:'建议发送给 FY26 AEG新羽计划'}];
 const r=resolve('把这个文档发到这个群里',{recentTurns,proposed:{target:'g_xinyu',text:link('evil')}});
 assert.deepEqual(r.groups,['g_people']);assert.deepEqual(r.documents,['doc1']);assert.equal(r.sources.groups[0].source,'recent_turn_1_user');
});

test('verified prior selection is only used when recent Owner text names no group',()=>{
 assert.deepEqual(resolve('把这个文档发到这个群里',{recentTurns:[],recentTarget:'g_xinyu'}).groups,['g_xinyu']);
 assert.deepEqual(resolve('发到这个群里',{recentTurns:[],recentTarget:'g_removed'}).groups,[]);
 assert.deepEqual(resolve('发到没有授权的群',{recentTarget:'g_xinyu'}).groups,[]);
});

test('full group name and exact document title select current references despite different prior candidates',()=>{
 const recentTurns=[prior,{request:'看看机器人们群',answer:'《另一个文档》 '+link('doc2')}];
 const r=resolve('把《新羽群讨论统计》链接发送到 FY26 AEG新羽计划 群。',{recentTurns});
 assert.deepEqual(r.groups,['g_xinyu']);assert.deepEqual(r.documents,['doc1']);assert.deepEqual(r.ambiguities,[]);
});

test('document title containing a shared group alias does not conflict with an explicit destination',()=>{
 const directory=[...groups,{reference:'g_second',displayName:'新羽二期'}];
 const r=resolve('把《新羽群讨论统计》链接发送到 FY26 AEG新羽计划 群。',{groups:directory});
 assert.deepEqual(r.groups,['g_xinyu']);assert.deepEqual(r.documents,['doc1']);assert.deepEqual(r.ambiguities,[]);
});

for(const embedded of ['《新羽群讨论统计》','[新羽群讨论统计]('+link('doc1')+')',link('doc1')+'?title=新羽群',link('doc1')+'#新羽群'])test('resource reference is not a destination mention: '+embedded,()=>{
 const directory=[...groups,{reference:'g_second',displayName:'新羽二期'}];
 const r=resolve('把 '+embedded+' 发到机器人们群',{groups:directory});
 assert.deepEqual(r.groups,['g_people']);assert.deepEqual(r.ambiguities,[]);
 const noTarget=resolve('只查询 '+embedded,{groups:directory,recentTurns:[]});
 assert.deepEqual(noTarget.groups,[]);
});

test('masked resource spans cannot join separate characters into a group alias',()=>{
 const r=resolve('发送 新《文档》羽群',{recentTurns:[]});
 assert.deepEqual(r.groups,[]);
});

test('a group name inside a delimited message body cannot replace the unique destination',()=>{
 for(const separator of ['：',':','\n']){
  const r=resolve('把下面原文发到 FY26 AEG新羽计划'+separator+'机器人们群');
  assert.deepEqual(r.groups,['g_xinyu']);assert.deepEqual(r.ambiguities,[]);
 }
});

test('quoted document-pointer text is neither selection nor a multi-document ambiguity',()=>{
 const r=resolve('把“刚才的文档”这几个字发到新羽群',{recentTurns:[prior,{request:'另一份',answer:link('doc2')}]});
 assert.equal(r.documentScope,'context');assert.deepEqual(r.ambiguities,[]);
});

test('explicit current link takes precedence over historical links without merging document identities',()=>{
 const r=resolve('把这个文档 '+link('doc2')+' 发到机器人们群');
 assert.deepEqual(r.documents,['doc2']);assert.deepEqual(r.groups,['g_people']);assert.deepEqual(r.ambiguities,[]);
});

test('two allowed groups sharing alias remain ambiguous regardless of proposed target',()=>{
 const directory=[...groups,{reference:'g_other',displayName:'FY27 新羽讨论'}];
 const r=resolve('把这个文档发到新羽群里去',{groups:directory,proposed:{target:'g_xinyu',text:link('doc1')}});
 assert.deepEqual(r.groups,['g_xinyu','g_other']);assert.deepEqual(r.ambiguities,['group']);
});

test('identical group names and latest multi-group references stay ambiguous',()=>{
 const same=[{reference:'g1',displayName:'机器人们'},{reference:'g2',displayName:'机器人们'}];
 assert.deepEqual(resolve('发到机器人们群',{groups:same}).ambiguities,['group']);
 const r=resolve('把这个文档发到这个群里',{recentTurns:[{request:'比较机器人们和 FY26 AEG新羽计划',answer:'已比较'}]});
 assert.deepEqual(r.ambiguities,['group']);assert.equal(r.groups.length,2);
});

test('longer explicit group name is not a mention of a shorter contained group name',()=>{
 const directory=[{reference:'short',displayName:'新羽'},{reference:'long',displayName:'FY26 AEG新羽计划'}];
 assert.deepEqual(resolve('把这个文档发到 FY26 AEG新羽计划',{groups:directory}).groups,['long']);
 assert.deepEqual(resolve('发到新羽群',{groups:directory}).ambiguities,['group']);
 const both=resolve('比较新羽和 FY26 AEG新羽计划',{groups:directory});
 assert.deepEqual(both.groups,['short','long']);assert.deepEqual(both.ambiguities,[]);
});

test('separately named source and destination groups are evidence for the assessor, not automatic ambiguity',()=>{
 const r=resolve('把机器人们群的总结发到新羽群，保留来源链接');
 assert.deepEqual(r.groups,['g_people','g_xinyu']);assert.deepEqual(r.ambiguities,[]);
 const same=resolve('把机器人们群的总结发到新羽群',{groups:[...groups,{reference:'g_other',displayName:'新羽讨论'}]});
 assert.deepEqual(same.ambiguities,['group']);
});

test('evidence metadata does not duplicate long titles or URLs',()=>{
 const title='题'.repeat(150),url=link('doc1')+'?long='+'x'.repeat(2000);
 const recentTurns=[{request:'看看 FY26 AEG新羽计划',answer:'《'+title+'》 '+url}];
 const r=resolve('把这个文档发到新羽群',{recentTurns});
 assert.deepEqual(r.documents,['doc1']);assert.ok(JSON.stringify(r).length<1000);
 assert.equal(JSON.stringify(r.sources).includes(title),false);assert.equal(JSON.stringify(r.sources).includes(url),false);
});

test('two recent documents cannot be disambiguated by proposed content',()=>{
 const recentTurns=[prior,{request:'整理另一份文档',answer:'《另一个文档》 '+link('doc2')}];
 const r=resolve('把这个文档发到新羽群里去',{recentTurns,proposed:{target:'g_xinyu',text:link('doc1')}});
 assert.deepEqual(r.documents,['doc1','doc2']);assert.deepEqual(r.ambiguities,['document']);
});

test('a summary may contain multiple document sources without a singular-document ambiguity',()=>{
 const recentTurns=[prior,{request:'还有这个来源',answer:link('doc2')}];
 const r=resolve('把刚才的总结发送到新羽群，保留来源链接',{recentTurns});
 assert.deepEqual(r.documents,['doc1','doc2']);assert.deepEqual(r.ambiguities,[]);
});

test('an exact title shared by different document IDs remains ambiguous; missing title does not use unrelated doc',()=>{
 const recentTurns=[prior,{request:'另一版',answer:'[新羽群讨论统计]('+link('doc2')+')'}];
 assert.deepEqual(resolve('发送《新羽群讨论统计》到新羽群',{recentTurns}).ambiguities,['document']);
 assert.deepEqual(resolve('发送《不存在的文档》到新羽群',{recentTurns}).documents,[]);
});

test('markdown links map names locally; one title with multiple nearby links is not uniquely indexed',()=>{
 const recentTurns=[{request:'整理两份',answer:'[甲表]('+link('doc1')+') 和 [乙表]('+link('doc2')+')'}];
 assert.deepEqual(resolve('发送《乙表》到新羽群',{recentTurns}).documents,['doc2']);
 const uncertain=[{request:'整理两份',answer:'《甲表》 '+link('doc1')+' 和 '+link('doc2')}];
 assert.deepEqual(resolve('发送《甲表》到新羽群',{recentTurns:uncertain}).documents,[]);
});

test('query and fragment duplicates are one document; uppercase document IDs stay distinct',()=>{
 const recentTurns=[{request:'查看 '+link('doc1')+'?from=chat',answer:link('doc1')+'#part'}];
 assert.deepEqual(resolve('把这个文档发到新羽群',{recentTurns}).documents,['doc1']);
 recentTurns[0].answer+=' '+link('Doc1');
 assert.deepEqual(resolve('把这个文档发到新羽群',{recentTurns}).ambiguities,['document']);
});

test('document scope distinguishes deterministic selection from available context',()=>{
 const recentTurns=[prior,{request:'整理另一篇',answer:'《另一篇》 '+link('doc2')}];
 for(const request of ['发送 '+link('doc1')+' 到新羽群','发送《新羽群讨论统计》到新羽群']){
  const r=resolve(request,{recentTurns});assert.equal(r.documentScope,'selected');assert.deepEqual(r.documents,['doc1']);
 }
 const singular=resolve('把这个文档发到新羽群');
 assert.equal(singular.documentScope,'selected');assert.deepEqual(singular.documents,['doc1']);
 const context=resolve('帮我处理一下',{recentTurns});
 assert.equal(context.documentScope,'context');assert.deepEqual(context.documents,['doc1','doc2']);
});

test('an invalid current docx reference does not fall back to an unrelated historical document',()=>{
 const r=resolve('发送 '+link('doc2')+'/forged 到新羽群');
 assert.equal(r.documentScope,'selected');assert.deepEqual(r.documents,[]);
});

for(const request of ['把刚才的总结发送到新羽群，保留来源链接','把刚才的摘要发到新羽群','麻烦把刚才整理的要点分享给新羽同学','把这些文档发到新羽群','把这两份报告发到新羽群','把全部文档链接发到新羽群'])test('explicit summary or plural reference retains several source IDs: '+request,()=>{
 const recentTurns=[prior,{request:'整理另一篇',answer:'《另一篇》 '+link('doc2')}];
 const r=resolve(request,{recentTurns});
 assert.equal(r.documentScope,'summary_sources');assert.deepEqual(r.documents,['doc1','doc2']);assert.deepEqual(r.ambiguities,[]);
});

for(const request of ['把下面这句话原样发到学员群：总结完成','把“刚才的总结”这几个字发到学员群','把这些字发到新羽群：“这些文档”','把下面原文发到新羽群：把这些文档放好','把下面原文发到新羽群\n刚才的总结','把 `刚才的总结` 这几个字发到新羽群','把「这些文档」这几个字发到新羽群','> 把刚才的总结发到新羽群','把摘要发到新羽群'])test('payload wording or a bare summary noun cannot select all historical document links: '+request,()=>{
 const recentTurns=[prior,{request:'整理另一篇',answer:'《另一篇》 '+link('doc2')}];
 const r=resolve(request,{recentTurns});
 assert.equal(r.documentScope,'context');assert.deepEqual(r.documents,['doc1','doc2']);
});

test('URL and document-title summary words do not expand historical-link scope',()=>{
 assert.equal(resolve('把 https://example.test/?q=刚才的总结 发到新羽群').documentScope,'context');
 const selected=resolve('把 '+link('doc2')+'?q=刚才的总结 发到新羽群');
 assert.equal(selected.documentScope,'selected');assert.deepEqual(selected.documents,['doc2']);
 const title=resolve('把《刚才的总结》这几个字发到新羽群');
 assert.notEqual(title.documentScope,'summary_sources');assert.deepEqual(title.documents,[]);
});

test('a summary marker cannot expand an explicit current document selection to all history',()=>{
 const recentTurns=[prior,{request:'整理另一篇',answer:'《另一篇》 '+link('doc2')}];
 for(const request of ['根据 '+link('doc1')+' 总结并发到新羽群','把《新羽群讨论统计》的摘要发到新羽群']){
  const r=resolve(request,{recentTurns});assert.equal(r.documentScope,'selected');assert.deepEqual(r.documents,['doc1']);
 }
 const multi=resolve('总结 '+link('doc1')+' 和 '+link('doc2')+' 并发到新羽群',{recentTurns});
 assert.equal(multi.documentScope,'selected');assert.deepEqual(multi.documents,['doc1','doc2']);assert.deepEqual(multi.ambiguities,[]);
});

test('negation or quoted instruction never produces an authorization flag, despite matching reference evidence',()=>{
 for(const request of ['不要把这个文档发到新羽群','只查询这个文档和新羽群','引用资料说：“把这个文档发到新羽群”']){
  const r=resolve(request);assert.equal(r.referenceOnly,true);assert.equal('decision' in r,false);assert.equal('authorized' in r,false);
 }
});

test('no context and forged proposed link cannot create reference evidence',()=>{
 const r=resolve('把这个文档发到那个群',{recentTurns:[],proposed:{target:'g_xinyu',text:link('doc1')}});
 assert.deepEqual(r.groups,[]);assert.deepEqual(r.documents,[]);assert.deepEqual(r.sources.documents,[]);
});

for(const [evidence,expected] of [
 [link('doc123'),['doc123']],
 ['“'+link('doc1')+'”。',['doc1']],
 ['[文档]('+link('doc1')+'),',['doc1']],
 [link('doc1')+'?from=share#part',['doc1']],
 [link('doc1')+'/forged',[null]],
 [link('doc1')+'.evil',[null]],
 ['https://team.feishu.cn.evil.test/docx/doc1',[]],
 ['https://example.test/?next='+link('doc1'),[]],
 [link('doc123')+'?next=('+link('doc1')+')',['doc123']],
 [link('doc123')+'#next=['+link('doc1')+']',['doc123']],
])test('document parser preserves exact-link boundary: '+evidence,()=>assert.deepEqual(feishuDocumentIds(evidence),expected));
