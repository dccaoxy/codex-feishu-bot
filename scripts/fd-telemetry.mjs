// Read-only, bounded macOS telemetry. No task resume, model calls or decisions.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function command(bin,args){try{return {ok:true,text:execFileSync(bin,args,{encoding:'utf8',timeout:5000,maxBuffer:8*1024*1024,env:{...process.env,LC_ALL:'C'}})};}catch{return {ok:false,text:''};}}
export function parseFD(text){
  const records=[];let current;
  for(const line of text.split('\n')){
    if(line.startsWith('f')){current=/^f\d+$/.test(line)?{fd:Number(line.slice(1)),type:'unknown'}:null;if(current)records.push(current);}
    else if(current&&line.startsWith('t'))current.type=line.slice(1);
  }
  const categories={socket:0,pipe:0,regular:0,other:0};
  for(const r of records){const key=['IPv4','IPv6','unix','sock'].includes(r.type)?'socket':r.type==='PIPE'?'pipe':r.type==='REG'?'regular':'other';categories[key]++;}
  return {total:records.length,categories,records};
}
export function level(total,limit){if(!Number.isFinite(limit)||limit<=0||!Number.isFinite(total))return 'unknown';const r=total/limit;return r>=.8?'critical':r>=.7?'snapshot':r>=.5?'warning':'normal';}
export function verifiedLimit(record,pid,start){return record?.pid===pid&&record?.start===start&&Number.isFinite(record.soft)&&record.soft>0?{soft:record.soft,hard:record.hard,source:'wrapper-at-exec'}:null;}
function readJSON(p){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}}
export function appendBounded(file,value){
  if(fs.existsSync(file)&&fs.statSync(file).size>5*1024*1024){fs.renameSync(file,file+'.1');}
  fs.appendFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});fs.chmodSync(file,0o600);
}
export async function loadedCount(url){
  let socket,timer;
  try{return await new Promise((resolve)=>{
    let seq=0,pending,method='',count=0,pages=0;const cursors=new Set();
    let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);if(socket)socket.onmessage=null;resolve(value);};
    timer=setTimeout(()=>finish(null),3000);socket=new WebSocket(url);
    const request=(m,params)=>{method=m;pending=++seq;socket.send(JSON.stringify({id:pending,method:m,params}));};
    socket.onopen=()=>request('initialize',{clientInfo:{name:'fd_telemetry',version:'1.0'},capabilities:{experimentalApi:true}});
    socket.onerror=()=>finish(null);socket.onclose=()=>finish(null);
    socket.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.method||m.id!==pending)return;if(m.error)return finish(null);
      if(method==='initialize'){socket.send(JSON.stringify({method:'initialized',params:{}}));request('thread/loaded/list',{limit:100});return;}
      if(!Array.isArray(m.result?.data))return finish(null);count+=m.result.data.length;
      const cursor=m.result.nextCursor;if(!cursor)return finish(count);
      if(++pages>=100||cursors.has(cursor))return finish(null);cursors.add(cursor);request('thread/loaded/list',{limit:100,cursor});
    }catch{finish(null);}};
  });}catch{return null;}finally{clearTimeout(timer);if(socket){socket.onerror=()=>{};socket.close();}}
}
export async function collect(env,recordFile){
  const at=new Date().toISOString(),port=new URL(env.url).port;
  const listener=command('/usr/sbin/lsof',['-t','-nP','-iTCP:'+port,'-sTCP:LISTEN']);
  const pids=[...new Set(listener.text.trim().split(/\s+/).filter(Boolean))];
  if(!listener.ok||pids.length!==1||!/^\d+$/.test(pids[0]))return {at,status:'unavailable',reason:'listener-unavailable'};
  const pid=Number(pids[0]);
  const start=command('/bin/ps',['-p',String(pid),'-o','lstart=']).text.trim();
  const raw=command('/usr/sbin/lsof',['-nP','-a','-p',String(pid),'-Fft']);
  const parsed=raw.ok?parseFD(raw.text):null;
  const memory=command('/bin/ps',['-p',String(pid),'-o','rss=']);
  const processes=command('/bin/ps',['-axo','ppid=']);
  const conn=command('/usr/sbin/lsof',['-nP','-a','-p',String(pid),'-iTCP:'+port,'-sTCP:ESTABLISHED','-Ff']);
  // lsof exits 1 both for no matches and failures: retain unknown rather than infer zero.
  const connections=conn.ok?conn.text.split('\n').filter(l=>/^f\d+$/.test(l)).length:null;
  const limit=verifiedLimit(readJSON(recordFile),pid,start);
  const loadedThreads=await loadedCount(env.url);
  const endStart=command('/bin/ps',['-p',String(pid),'-o','lstart=']).text.trim();
  if(!start||endStart!==start)return {at,status:'unavailable',reason:'process-changed-during-sample'};
  return {at,pid,start,status:raw.ok?'ok':'partial',fdTotal:parsed?.total??null,fdLimit:limit,fdCategories:parsed?.categories??null,rssKiB:memory.ok&&/^\d+$/.test(memory.text.trim())?Number(memory.text):null,childProcesses:processes.ok?processes.text.split('\n').filter(l=>Number(l.trim())===pid).length:null,connections,loadedThreads,level:level(parsed?.total,limit?.soft),details:parsed?.records??[]};
}
export async function sample(env,recordFile,out,collector=collect){
  fs.mkdirSync(out,{recursive:true,mode:0o700});fs.chmodSync(out,0o700);
  const row=await collector(env,recordFile);const {details,...summary}=row;
  const previous=readJSON(path.join(out,'latest.json'));
  appendBounded(path.join(out,'samples.jsonl'),summary);
  fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify(summary,null,2),{mode:0o600});
  const raised=['warning','snapshot','critical'].includes(row.level)&&(previous?.level!==row.level||previous?.pid!==row.pid);
  if(raised){const alert={...summary,message:row.level==='critical'?'CRITICAL: shared runtime FD >= 80%; inspect local evidence before continuing.':'Shared runtime FD threshold reached; detailed observation enabled.'};appendBounded(path.join(out,'alerts.jsonl'),alert);console.error(JSON.stringify(alert));}
  // Numeric descriptor and type only: no filenames, endpoints, arguments or message contents.
  if(['snapshot','critical'].includes(row.level)&&(raised||!previous?.at||Date.parse(row.at)-Date.parse(readJSON(path.join(out,'snapshot-latest.json'))?.at||0)>=600000)){
    const detail={...summary,details};appendBounded(path.join(out,'snapshots.jsonl'),detail);fs.writeFileSync(path.join(out,'snapshot-latest.json'),JSON.stringify(detail),{mode:0o600});
  }
  return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [envFile,recordFile,out]=process.argv.slice(2);
  if(!envFile||!recordFile||!out)throw new Error('Usage: fd-telemetry.mjs environment.json limits.json output-directory');
  const env=readJSON(envFile);const url=new URL(env.url);if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1')throw new Error('Local shared server required');
  await sample(env,recordFile,out);
  // One-shot launchd sampler: ensure timed-out sockets cannot keep the observer alive.
  process.exit(0);
}
