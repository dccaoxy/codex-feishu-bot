// Explicit synthetic model acceptance; no Feishu connection or production store.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {GroupMessageStore} from '../src/group-store.mjs';import {KnowledgeScheduler} from '../src/knowledge-scheduler.mjs';
if(!process.argv.includes('--run-model'))throw Error('Requires --run-model; invokes the real model on synthetic data only');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'knowledge-real-')),raw=new GroupMessageStore(root);
const config={codex:{binary:process.env.GROUP_CODEX_BINARY||'/Applications/ChatGPT.app/Contents/Resources/codex',model:process.env.GROUP_MODEL||''},groups:{enabled:true,allowedChatIds:['oc_synthetic'],knowledge:{enabled:true}}};
let now=Date.parse('2026-09-23T04:00:00+08:00');
const scheduler=new KnowledgeScheduler(config,raw,{allowed:()=>true,busy:()=>false,clock:()=>now,log:console.log});
const add=(id,date,text)=>raw.ingest({sender:{sender_type:'user',sender_id:{open_id:'synthetic-member'}},message:{chat_id:'oc_synthetic',message_id:id,create_time:String(Date.parse(date+'T12:00:00+08:00')),message_type:'text',content:JSON.stringify({text})}},false);
try{
 raw.setSync('oc_synthetic',{state:'complete',initial_complete:1,last_reconciled_at:'2026-09-23T00:00:00Z'});
 add('source-day1','2026-09-20','库存盘点主题：今天核实商品甲库存300台。决定每周复核库存；责任人和时间尚未确定，需要下次讨论。');
 add('source-day2','2026-09-21','延续昨天库存盘点主题：今天核实商品甲库存250台，这是出售50台后的更新，不是否认昨天300台。每周复核库存的决定保持不变。');
 await scheduler.tick();const first=raw.knowledge.list('oc_synthetic');assert(first.length>0,'day1 topic missing');const id=first[0].topic_id;
 const d1=raw.knowledge.daily('oc_synthetic','2026-09-20');assert(d1?.digest.reported_facts.length,'day1 fact missing');assert(d1.digest.decisions.length||d1.digest.actions.length||d1.digest.open_questions.length,'decision/action/question missing');
 now+=61000;await scheduler.tick();const d2=raw.knowledge.daily('oc_synthetic','2026-09-21');assert(d2,'day2 failed');const topic=raw.knowledge.read('oc_synthetic',id);assert.equal(topic.state.version,2,'same topic not updated');assert(topic.state.key_changes.length,'change history missing');assert.equal(topic.revisions.length,2);
 assert(raw.get('oc_synthetic','source-day1'));assert(raw.get('oc_synthetic','source-day2'));
 console.log(JSON.stringify({realModel:true,syntheticOnly:true,days:2,sameTopic:true,revisions:2,reported_facts:d1.digest.reported_facts.length,decisions:d1.digest.decisions.length,actions:d1.digest.actions.length,openQuestions:d1.digest.open_questions.length,sourceTrace:true,groupUserThreadCount:raw.db.prepare('SELECT COUNT(*) n FROM group_threads').get().n,result:'PASS'},null,2));
}catch(e){console.error(JSON.stringify(raw.db.prepare('SELECT date,status,error FROM knowledge_jobs').all()));throw e;}
finally{await scheduler.close();raw.close();fs.rmSync(root,{recursive:true,force:true});}
