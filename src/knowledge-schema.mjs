import Ajv from 'ajv';
export function knowledgeConfig(v={}) {
  const c={enabled:false,timezone:'Asia/Shanghai',dailyAt:'02:00',maxDaysPerCycle:2,maxMessages:500,maxInputChars:80000,...v};
  if(typeof c.enabled!=='boolean'||typeof c.timezone!=='string'||!/^\d{2}:\d{2}$/.test(c.dailyAt)||c.dailyAt>'23:59'||Number(c.dailyAt.slice(3))>59)throw Error('Knowledge schedule invalid');
  try{new Intl.DateTimeFormat('en-US',{timeZone:c.timezone}).format();}catch{throw Error('Knowledge timezone invalid');}
  for(const [key,min,max] of [['maxDaysPerCycle',1,5],['maxMessages',1,1000],['maxInputChars',1000,120000]])if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw Error('Knowledge limit invalid');
  return c;
}
export function localDate(ms,timezone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ms).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
export function nextDate(day,n=1){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function validDate(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
// First instant of a local date, including 23/25-hour DST days (no fixed UTC offset).
export function dayStart(day,timezone){if(!validDate(day))throw Error('Invalid date');let lo=Date.parse(day+'T00:00:00Z')-36*3600000,hi=lo+72*3600000;while(hi-lo>1){const mid=Math.floor((hi+lo)/2);if(localDate(mid,timezone)<day)lo=mid;else hi=mid;}return hi;}
export function lastDueDay(now,c){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:c.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));return nextDate(localDate(now,c.timezone),`${p.hour}:${p.minute}`>=c.dailyAt?-1:-2);}
const string={type:'string',minLength:1,maxLength:2000};
const sources={type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:1000,uniqueItems:true};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const item=object({text:string,source_message_ids:sources});
const items={type:'array',items:item,maxItems:40};
const action=object({text:string,owner:{type:['string','null'],maxLength:200},deadline:{type:['string','null'],maxLength:200},source_message_ids:sources});
const resource=object({text:string,url:{type:'string',maxLength:2000,pattern:'^https://'},source_message_ids:sources});
const common={plans:items,decisions:items,viewpoints:items,actions:{type:'array',items:action,maxItems:40},open_questions:items,resources:{type:'array',items:resource,maxItems:40}};
export const KNOWLEDGE_SCHEMA=object({digest:object({status:{enum:['complete','no_material_content']},summary:{type:'string',maxLength:4000},reported_facts:items,verified_facts:{type:'array',maxItems:0},...common,topics:{type:'array',items:{type:'string',minLength:1,maxLength:200},maxItems:20},source_message_ids:{...sources,minItems:0}}),topics:{type:'array',maxItems:20,items:object({topic_id:{type:['string','null'],maxLength:100},title:{type:'string',minLength:1,maxLength:200},current_summary:string,reported_facts:items,verified_facts:{type:'array',maxItems:0},key_changes:items,...common,conflicts:{type:'array',maxItems:40,items:object({text:string,status:{const:'unresolved'},source_message_ids:{...sources,minItems:2}})},source_message_ids:sources})}});
const validate=new Ajv({strict:false}).compile(KNOWLEDGE_SCHEMA);
export function validateKnowledge(text,input){
  if(typeof text!=='string'||text.length>128000)throw Error('knowledge_output_limit');
  let out;try{out=JSON.parse(text);}catch{throw Error('knowledge_json');}if(!validate(out))throw Error('knowledge_schema');
  const dayIds=new Set(input.messages.map(m=>m.id));const allIds=new Set([...dayIds,...input.topics.flatMap(t=>t.source_message_ids)]);
  const walk=(value,allowed)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value))return value.forEach(v=>walk(v,allowed));if(value.source_message_ids?.some(id=>!allowed.has(id)))throw Error('knowledge_source');for(const [k,v] of Object.entries(value))if(k!=='source_message_ids')walk(v,allowed);};
  walk(out.digest,dayIds);walk(out.topics,allIds);
  const urls=new Set([...input.messages.flatMap(m=>(m.resources||[]).map(r=>r.url)),...input.topics.flatMap(t=>t.resources.map(r=>r.url))]);
  if([...out.digest.resources,...out.topics.flatMap(t=>t.resources)].some(r=>!urls.has(r.url)))throw Error('knowledge_resource');
  if(out.digest.status==='complete'&&!out.digest.source_message_ids.length)throw Error('knowledge_missing_sources');
  const covered=new Set(out.digest.source_message_ids);walkCoverage(out.digest,covered);
  if(out.digest.status==='no_material_content'&&(out.topics.length||out.digest.topics.length||['reported_facts','verified_facts','plans','decisions','viewpoints','actions','open_questions','resources'].some(k=>out.digest[k].length)))throw Error('knowledge_empty');
  const seen=new Set();
  for(const t of out.topics){
    if(t.topic_id!==null){if(seen.has(t.topic_id)||!input.topics.some(x=>x.topic_id===t.topic_id))throw Error('knowledge_topic');seen.add(t.topic_id);}
    if(JSON.stringify(t).length>18000)throw Error('knowledge_topic_output_limit');
    if(t.source_message_ids.some(id=>dayIds.has(id)&&!covered.has(id)))throw Error('knowledge_digest_lineage');
    walkCoverage(t,new Set(t.source_message_ids));
    if(!t.source_message_ids.some(id=>dayIds.has(id)))throw Error('knowledge_no_daily_source');
    // An update cannot silently erase old evidence. Changes/conflicts and the
    // append-only revision chain preserve it, rather than overwrite history.
    const old=input.topics.find(x=>x.topic_id===t.topic_id);
    if(old&&old.conflicts.some(f=>!t.conflicts.some(n=>n.text===f.text&&f.source_message_ids.every(id=>n.source_message_ids.includes(id)))))throw Error('knowledge_lost_conflict');
    if(old&&old.source_message_ids.some(id=>!t.source_message_ids.includes(id)))throw Error('knowledge_lost_sources');
    if(old&&old.reported_facts.some(f=>!t.reported_facts.some(n=>n.text===f.text)&&!t.key_changes.some(n=>f.source_message_ids.every(id=>n.source_message_ids.includes(id)))&&!t.conflicts.some(n=>f.source_message_ids.every(id=>n.source_message_ids.includes(id)))))throw Error('knowledge_lost_fact');
  }
  return out;
}
function walkCoverage(value,ids){if(!value||typeof value!=='object')return;if(Array.isArray(value))return value.forEach(v=>walkCoverage(v,ids));if(value.source_message_ids?.some(id=>!ids.has(id)))throw Error('knowledge_source_union');for(const [k,v]of Object.entries(value))if(k!=='source_message_ids')walkCoverage(v,ids);}

// Read compatibility only: preserve stored revision bytes and identity. Legacy
// chat-derived facts are reports, never independently verified evidence.
export function readKnowledgePayload(payload){
 const value=typeof payload==='string'?JSON.parse(payload):structuredClone(payload);
 if(!value)return value;
 value.reported_facts=[...(value.reported_facts||[]),...(value.facts||[]),...(value.confirmed_facts||[])];
 delete value.facts;delete value.confirmed_facts;
 value.verified_facts=[];value.plans??=[];
 return value;
}
