import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {projectRoots,canonicalWritePath,classifyProjectWrite} from '../../src/project-paths.mjs';

// TEST FIXTURE ONLY: incomplete execution-boundary experiment.
// Detached descendants and pre-existing hard links defeat parts of this policy.
// Never import this into production or treat it as an Owner authority boundary.
const quote=JSON.stringify;
const within=(root,target)=>target===root || target.startsWith(root+path.sep);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function stamp(target) {
  try {
    const s=fs.lstatSync(target,{bigint:true});
    if(!s.isFile() || s.nlink!==1n)throw Error('operation requires a regular, singly-linked file');
    return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String);
  } catch(e) {if(e.code==='ENOENT')return null;throw e;}
}
function directoryStamp(target) {
  const s=fs.statSync(target,{bigint:true});
  if(!s.isDirectory())throw Error('project root is not a directory');
  return [String(s.dev),String(s.ino)];
}
function parents(target) {
  const result=[];
  for(let p=path.dirname(target);;p=path.dirname(p)){result.push(p);if(p===path.dirname(p))break;}
  return result;
}
function binding(context) {
  if(typeof context?.check!=='function')throw Error('missing trusted request guard');
  context.check();
  const values=['owner','request','thread','turn'].map(k=>context[k]);
  if(values.some(x=>typeof x!=='string'||!x))throw Error('missing trusted request identity');
  return JSON.stringify(values);
}

// No imports from writable project files and no caller-supplied executable code.
// The worker runs under a fresh OS policy granting only these concrete paths.
const worker=String.raw`
const fs=require('node:fs');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);
process.stdin.on('end',()=>{
 let changed=false;
 try {
  const a=JSON.parse(input), stamps=p=>{
   try {const s=fs.lstatSync(p,{bigint:true});if(!s.isFile()||s.nlink!==1n)throw Error('unsafe file');return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String);}
   catch(e){if(e.code==='ENOENT')return null;throw e;}
  };
  for(const t of a.targets)if(JSON.stringify(stamps(t.path))!==JSON.stringify(t.stamp))throw Error('target changed');
  const t=a.targets[0];
  if(a.operation==='write'){
   const flags=fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW|(t.stamp?0:fs.constants.O_CREAT|fs.constants.O_EXCL);
   const fd=fs.openSync(t.path,flags,0o600);
   try {
    if(t.stamp){const s=fs.fstatSync(fd,{bigint:true});if(JSON.stringify([s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String))!==JSON.stringify(t.stamp)||s.nlink!==1n)throw Error('target changed');}
    changed=true;fs.ftruncateSync(fd,0);const bytes=Buffer.from(a.content,'utf8');let offset=0;
    while(offset<bytes.length){const n=fs.writeSync(fd,bytes,offset,bytes.length-offset,offset);if(n<=0)throw Error('short write');offset+=n;}
    fs.fsyncSync(fd);
   }finally{fs.closeSync(fd);}
  }else if(a.operation==='delete'){changed=true;fs.unlinkSync(t.path);}
  else if(a.operation==='rename'){changed=true;fs.renameSync(t.path,a.targets[1].path);}
  else throw Error('invalid operation');
  process.stdout.write(JSON.stringify({state:'completed'}));
 }catch(e){process.stdout.write(JSON.stringify({state:changed?'unknown':'not_executed',error:'operation failed'}));process.exitCode=1;}
});`;

export class OwnerRuntime {
  #roots; #rootStamps; #protected; #pending=new Map(); #denied=new Set(); #active=new Set(); #closed=false;
  constructor({roots,protectedPaths=[]}) {
    if(process.platform!=='darwin')throw Error('Owner runtime prototype requires macOS Seatbelt');
    this.#roots=projectRoots(roots);
    this.#rootStamps=this.#roots.map(directoryStamp);
    this.#protected=Object.freeze(protectedPaths.flatMap(p=>{
      if(!path.isAbsolute(p))throw Error('protected paths must be absolute');
      return [path.normalize(p),canonicalWritePath(p)];
    }));
  }
  #check(context,expected) {
    if(this.#closed || binding(context)!==expected || this.#denied.has(expected))throw Error('request is no longer executable');
    for(const [i,root] of this.#roots.entries()) {
      if(fs.realpathSync.native(root)!==root || JSON.stringify(directoryStamp(root))!==JSON.stringify(this.#rootStamps[i]))throw Error('project root changed');
    }
  }
  #targets(operation) {
    return [operation.path,...(operation.operation==='rename'?[operation.destination]:[])].map(p=>{
      const c=classifyProjectWrite(p,this.#roots);
      if(this.#protected.some(x=>within(x,c.target)||within(c.target,x)||within(x,path.normalize(p))))throw Error('runtime configuration is protected');
      return {path:c.target,original:p,requiresApproval:c.requiresApproval,stamp:stamp(c.target)};
    });
  }
  prepare(operation,context) {
    const owner=binding(context);this.#check(context,owner);
    if(!operation||!['write','delete','rename'].includes(operation.operation)||Object.keys(operation).some(k=>!['operation','path','destination','content'].includes(k)))throw Error('invalid operation');
    if(operation.operation==='write' && (typeof operation.content!=='string'||Buffer.byteLength(operation.content)>1024*1024))throw Error('write content must be at most 1 MiB');
    if(operation.operation!=='rename' && operation.destination!==undefined)throw Error('unexpected destination');
    if(operation.operation!=='write' && operation.content!==undefined)throw Error('unexpected content');
    const copy=structuredClone(operation),targets=this.#targets(copy);
    if(copy.operation!=='write'&&!targets[0].stamp)throw Error('source does not exist');
    if(targets.length===2&&targets[0].path===targets[1].path)throw Error('rename targets must differ');
    if(this.#pending.size>=32)throw Error('too many pending operations');
    const id=randomUUID(),approval=targets.some(t=>t.requiresApproval),hash=digest({copy,targets});
    this.#pending.set(id,{owner,copy,targets,hash,expires:Date.now()+600000,approval,approved:false});
    return Object.freeze({id,operation:copy.operation,targets:Object.freeze(targets.map(t=>t.path)),requiresApproval:approval,digest:hash});
  }
  #current(id,context) {
    const p=this.#pending.get(id);if(!p)throw Error('operation is no longer pending');
    this.#check(context,p.owner);
    if(Date.now()>p.expires||digest({copy:p.copy,targets:this.#targets(p.copy)})!==p.hash){this.#pending.delete(id);throw Error('operation changed or expired');}
    return p;
  }
  approve(id,context) {const p=this.#current(id,context);if(p.approved)throw Error('approval already consumed');p.approved=true;}
  deny(id,context) {
    const p=this.#current(id,context);this.#denyOwner(p.owner);
  }
  #denyOwner(owner) {
    this.#denied.add(owner);
    for(const [key,value] of this.#pending)if(value.owner===owner)this.#pending.delete(key);
    for(const a of this.#active)if(a.owner===owner)this.#kill(a.child);
  }
  #profile(targets,exact) {
    const grants=targets.map(p=>`(allow file-write* (${exact?'literal':'subpath'} ${quote(p)}))`);
    const protectedRules=this.#protected.flatMap(p=>[
      `(deny file-write* (literal ${quote(p)}) (subpath ${quote(p)}))`,
      ...parents(p).map(a=>`(deny file-write-unlink (literal ${quote(a)}))`),
    ]);
    const rootRules=this.#roots.flatMap(p=>[p,...parents(p)].map(a=>`(deny file-write-unlink (literal ${quote(a)}))`));
    return ['(version 1)','(deny default)','(allow file-read*)','(allow process-exec)','(allow process-fork)',
      // Experimental syscall filter. It does NOT stop detached posix_spawn;
      // the regression below records that observed limitation explicitly.
      '(deny syscall-unix (syscall-number 82) (syscall-number 147))',
      '(allow signal (target same-sandbox))','(allow process-info* (target same-sandbox))','(allow sysctl-read)',
      '(allow file-write-data (literal \"/dev/null\"))',...grants,...protectedRules,...rootRules].join('\n');
  }
  #kill(child){try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
  async #spawn(executable,args,input,profile,cwd,context,owner) {
    this.#check(context,owner);
    return new Promise((resolve,reject)=>{
      const child=spawn('/usr/bin/sandbox-exec',['-p',profile,executable,...args],{
        cwd,detached:true,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'},stdio:['pipe','pipe','pipe'],
      });
      const active={child,owner};this.#active.add(active);
      let stdout='',stderr='',cancelled=false,overflow=false;
      const collect=key=>chunk=>{if(key==='stdout')stdout+=chunk;else stderr+=chunk;if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)>1024*1024){overflow=true;this.#kill(child);}};
      child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));child.stdin.on('error',()=>{});
      const timer=setInterval(()=>{try{this.#check(context,owner);}catch{cancelled=true;this.#kill(child);}},10);
      const timeout=setTimeout(()=>{cancelled=true;this.#kill(child);},30000);
      const cleanup=()=>{clearInterval(timer);clearTimeout(timeout);this.#active.delete(active);};
      child.once('error',e=>{cleanup();reject(e);});
      child.once('exit',()=>this.#kill(child));
      child.once('close',(code,signal)=>{
        cleanup();try{this.#check(context,owner);}catch{cancelled=true;}
        if(cancelled||overflow)resolve({state:'unknown',error:overflow?'output limit exceeded':'request ended during execution'});
        else resolve({code,signal,stdout,stderr});
      });
      try{this.#check(context,owner);child.stdin.end(input);}catch{cancelled=true;this.#kill(child);}
    });
  }
  async execute(id,context) {
    const p=this.#current(id,context);if(p.approval&&!p.approved)throw Error('external write needs operation approval');
    // Consume before spawn. Process/transport failure never restores a permit.
    this.#pending.delete(id);
    const r=await this.#spawn(process.execPath,['-e',worker],JSON.stringify({...p.copy,targets:p.targets}),this.#profile(p.targets.map(t=>t.path),true),path.dirname(p.targets[0].path),context,p.owner);
    let result;
    try{result=r.state?r:JSON.parse(r.stdout);}catch{result={state:'unknown',error:'worker outcome unavailable'};}
    if(result.state==='unknown')this.#denyOwner(p.owner);
    return result;
  }
  async shell(command,cwd,context) {
    const owner=binding(context);this.#check(context,owner);
    if(typeof command!=='string'||Buffer.byteLength(command)>100000)throw Error('invalid command');
    if(!path.isAbsolute(cwd))throw Error('cwd must be absolute');
    const result=await this.#spawn('/bin/sh',['-c',command],'',this.#profile(this.#roots,false),cwd,context,owner);
    if(result.state==='unknown')this.#denyOwner(owner);
    return result;
  }
  close(){this.#closed=true;this.#pending.clear();for(const a of this.#active)this.#kill(a.child);}
}
