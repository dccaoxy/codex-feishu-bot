import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProbeOutputs} from '../scripts/group-probe-assertions.mjs';
const calls=[
 ...['feishu_office_diagnose_document','feishu_office_collection','feishu_office_read_resources','feishu_office_drive_search','feishu_office_sheet_read'].map(name=>({name})),
 {namespace:'skills',name:'list'}, {namespace:'skills',name:'list'},
 {namespace:'skills',name:'read'}, {name:'exec_command'}, {name:'group_search'},
 {namespace:'forged',name:'list'}, {namespace:'forged',name:'group_search'},
];
function outputs(knowledge){return calls.map((c,i)=>({call_id:`call${i+1}`,output:c.namespace==='skills'?(c.name==='list'?' {"skills":[]}':'invalid resource'):c.name==='group_search'&&!c.namespace&&!knowledge?'GROUP_ALLOWED_TOOL_OK':'unknown tool'}));}
for(const knowledge of [false,true])for(const phase of ['initial','resumed'])test(`${knowledge?'Knowledge':'Group'} ${phase} matches namespaced calls after new prefixes`,()=>{
 const out=outputs(knowledge);assertProbeOutputs(calls,out,{knowledge});assertProbeOutputs(calls,[...out].reverse(),{knowledge});
 for(const i of [0,5,6,7,8,10,11]){const bad=structuredClone(out);bad[i].output=i===5||i===6?' {"skills":["private"]}':'PRIVATE_CONTENT';assert.throws(()=>assertProbeOutputs(calls,bad,{knowledge}));}
 if(knowledge){const bad=structuredClone(out);bad[9].output='GROUP_ALLOWED_TOOL_OK';assert.throws(()=>assertProbeOutputs(calls,bad,{knowledge}));}
});
test('probe rejects missing, duplicate and unknown output identities',()=>{
 const out=outputs(false);assert.throws(()=>assertProbeOutputs(calls,out.slice(1)));
 for(const id of ['call1','unknown']){const bad=structuredClone(out);bad[1].call_id=id;assert.throws(()=>assertProbeOutputs(calls,bad));}
});
