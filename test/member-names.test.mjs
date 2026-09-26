import test from 'node:test';
import assert from 'node:assert/strict';
import {memberNames} from '../src/member-names.mjs';
function fixture(get){return {call:async(fn,retry,guard)=>{guard();return fn();},client:{im:{v1:{chatMembers:{get}}}}};}
const item=(id,name)=>({member_id_type:'open_id',member_id:id,name});
test('member lookup paginates exact IDs, retains same-name identities and flags conflicting names',async()=>{
 const calls=[];const f=fixture(async x=>{calls.push(x);return calls.length===1?{items:[item('u1','Alex'),item('u2','Alex'),item('other','Private')],has_more:true,page_token:'next'}:{items:[item('u1','Changed'),item('u3','Sam')],has_more:false};});
 const r=await memberNames(f,'group',new Set(['u1','u2','u3']),()=>{});
 assert.equal(r.status,'complete');assert.deepEqual([...r.names.keys()],['u1','u2','u3']);assert.deepEqual([...r.conflicts],['u1']);assert.equal(calls[1].params.page_token,'next');assert.ok(calls.every(x=>x.path.chat_id==='group'&&x.params.member_id_type==='open_id'));
});
test('large legitimate pages work; security-limited results never claim completeness',async()=>{
 const items=Array.from({length:150},(_,i)=>item('u'+i,'Person'));
 for(const security of [false,true]){const r=await memberNames(fixture(async()=>({items,has_more:false,trigger_security_conf_limit:security})),'g',new Set(['u149']),()=>{});assert.equal(r.names.get('u149'),'Person');assert.equal(r.status,security?'partial':'complete');}
});
test('API errors and malformed pages fail safely without exposing errors',async()=>{
 for(const get of [async()=>{throw Error('private credentials');},async()=>({items:null})]){const r=await memberNames(fixture(get),'g',new Set(['u']),()=>{});assert.equal(r.status,'unavailable');assert.equal(r.names.size,0);assert.ok(!JSON.stringify(r).includes('credentials'));}
});
test('pagination and member budgets stop loops and ignore wrong ID types or unbounded names',async()=>{
 for(const mode of ['loop','pages','members']){let count=0;const r=await memberNames(fixture(async()=>{count++;return {items:mode==='members'?Array.from({length:10001},(_,i)=>item('u'+i,'P')):[{...item('u','Wrong'),member_id_type:'user_id'},item('u','x'.repeat(201))],has_more:true,page_token:mode==='loop'?'repeat':String(count)};}),'g',new Set(['u','u10000']),()=>{});assert.equal(r.status,'partial');assert.equal(r.names.size,0);assert.equal(count,mode==='pages'?20:mode==='loop'?2:1);}
});
test('revocation at queue boundary and after API await prevents later pages and results',async()=>{
 let live=true,calls=0;const guard=()=>{if(!live)throw Error('revoked');};const f=fixture(async()=>{calls++;live=false;return {items:[item('u','Name')],has_more:true,page_token:'next'};});
 await assert.rejects(memberNames(f,'g',new Set(['u']),guard),/revoked/);assert.equal(calls,1);
 calls=0;await assert.rejects(memberNames(f,'g',new Set(['u']),guard),/revoked/);assert.equal(calls,0);
});
