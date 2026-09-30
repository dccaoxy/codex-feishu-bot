// These are reference candidates, never permission to send. The current Owner
// request still needs independent semantic assessment and all lifecycle guards.

// Parse evidence and proposed links identically, without scanning inside a URL's
// query/fragment. Only the complete, case-sensitive docx path token is identity.
export function feishuDocumentIds(text){
  return (text.match(/https?:\/\/[^\s<>"'`“”‘’「」『』【】]+/giu)||[]).flatMap(matched=>{
    // Consume bracketed query values as part of this URL, then trim closing
    // prose/Markdown delimiters. Do not discover their nested URLs as evidence.
    let url;try{url=new URL(matched.replace(/[。，；！？,.!?;)\]}]+$/u,''));}catch{return [null];}
    if(!/(^|\.)feishu\.cn$/.test(url.hostname))return [];
    return [url.protocol==='https:'&&!url.username&&!url.password&&!url.port ? /^\/docx\/([a-zA-Z0-9]+)\/?$/.exec(url.pathname)?.[1]||null : null];
  });
}

const unique=items=>[...new Set(items)];
const text=value=>typeof value==='string'?value:'';
const normalize=value=>text(value).normalize('NFKC').replace(/\s+/gu,'').toLowerCase();
const documentTitles=value=>[...value.matchAll(/《([^》\n]{1,200})》/gu)].map(m=>m[1].trim());
const documentPointer=/(?:这个|那个|这份|那份|这篇|那篇|刚才的?|刚刚的?|上述|上面的?|前面的?)\s*(?:文档|链接|表格|报告)/u;
const groupPointer=/(?:这个|那个|刚才的?|刚刚的?|上述|上面的?|前面的?)群/u;

function groupReferenceText(value){
  const raw=text(value),characters=raw.split('');
  // Document labels and URL contents are not mentions of a destination group.
  // Mask before whitespace normalization, with a non-word separator so the
  // remaining text cannot accidentally join into a new alias across a link.
  const spans=[...raw.matchAll(/《[^》\n]{1,200}》/gu),
    ...raw.matchAll(/\[[^\]\n]{1,200}\]\(https?:\/\/[^\s]+?\)/giu),
    ...raw.matchAll(/https?:\/\/[^\s<>"'`“”‘’「」『』【】]+/giu)];
  for(const span of spans)for(let i=span.index;i<span.index+span[0].length;i++)characters[i]='\uFFFC';
  return normalize(characters.join(''));
}

function groupMentions(value,groups){
  const request=groupReferenceText(value),occurrences=[];
  for(const g of groups){
    for(const name of [normalize(g.displayName),g.reference]){
      if(!name)continue;
      let start=0;
      while((start=request.indexOf(name,start))!==-1){
        const end=start+name.length;
        if(!(/[a-z0-9]$/u.test(name)&&/[a-z0-9]/u.test(request[end]||'')) && !(/^[a-z0-9]/u.test(name)&&/[a-z0-9]/u.test(request[start-1]||'')))occurrences.push({reference:g.reference,match:request.slice(start,end),start,end});
        start=end;
      }
    }
  }
  // An exact longer name is not an additional mention of a shorter name it
  // contains. Equal names retain both references and therefore stay ambiguous.
  const exact=occurrences.filter(x=>!occurrences.some(y=>y.start<=x.start&&y.end>=x.end&&y.end-y.start>x.end-x.start));
  const aliases=[];
  for(const marker of request.matchAll(/群|同学/gu)){
    const prefix=/[\p{Script=Han}a-z0-9_-]+$/u.exec(request.slice(0,marker.index))?.[0]||'';
    if(/(?:这个|那个|刚才的?|刚刚的?|上述|上面的?|前面的?)$/u.test(prefix))continue;
    const chars=[...prefix].slice(-200);let longest=0,matches=[];
    // The mention must actually occur in the Owner text and in a directory
    // name. No hand-written alias map, phonetic guesses or proposed target.
    for(let i=0;i<chars.length-1;i++){
      const alias=chars.slice(i).join('');
      for(const g of groups){
        if(!normalize(g.displayName).includes(alias))continue;
        if(alias.length>longest){longest=alias.length;matches=[];}
        if(alias.length===longest)matches.push({reference:g.reference,match:alias+marker[0],kind:'alias',start:marker.index-alias.length,end:marker.index+marker[0].length});
      }
    }
    aliases.push(...matches);
  }
  return [...exact.map(({reference,match,start,end})=>({reference,match,start,end,kind:'name'})),...aliases];
}

function documentEvidence(value,source){
  const ids=unique(feishuDocumentIds(value).filter(Boolean));
  const rows=ids.map(documentId=>({documentId,source,titles:[]}));
  const title=(id,label)=>{const row=rows.find(r=>r.documentId===id);if(row&&label.trim())row.titles.push(label.trim());};
  // Labels are data, not verified titles. Only associate a label when its
  // local link identity is explicit; never map one title to every nearby URL.
  for(const m of value.matchAll(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s]+?)\)/gu)){
    const linked=feishuDocumentIds(m[2]).filter(Boolean);
    if(linked.length===1)title(linked[0],m[1].replace(/^《|》$/gu,''));
  }
  for(const line of value.split('\n')){
    const linked=unique(feishuDocumentIds(line).filter(Boolean)),labels=documentTitles(line);
    if(linked.length===1&&labels.length===1)title(linked[0],labels[0]);
  }
  return rows.map(r=>({...r,titles:unique(r.titles)}));
}

export function resolveSendReferences(input){
  const request=text(input.currentOwnerRequest),recent=Array.isArray(input.recentTurns)?input.recentTurns:[];
  const directory=Array.isArray(input.groups)?input.groups.filter(g=>typeof g.reference==='string'&&typeof g.displayName==='string'):[];
  const groupRequest=groupReferenceText(request);
  let mentions=groupMentions(request,directory).map(g=>({...g,source:'current_request'})),usedPrevious=false;
  // A current explicit but unresolved group label cannot silently inherit a
  // different earlier group. A pronoun may use the latest Owner mention.
  if(!mentions.length&&(!/群|同学/u.test(groupRequest)||groupPointer.test(groupRequest))){
    usedPrevious=true;
    for(let i=recent.length-1;i>=0&&!mentions.length;i--)mentions=groupMentions(text(recent[i]?.request),directory).map(g=>({...g,source:`recent_turn_${i}_user`}));
    if(!mentions.length&&directory.some(g=>g.reference===input.recentTarget))mentions=[{reference:input.recentTarget,source:'recent_target',kind:'selection'}];
  }
  const groups=unique(mentions.map(g=>g.reference));
  const current=documentEvidence(request,'current_request');
  const older=recent.flatMap((turn,i)=>[...documentEvidence(text(turn?.request),`recent_turn_${i}_user`),...documentEvidence(text(turn?.answer),`recent_turn_${i}_assistant`)]);
  const labels=documentTitles(request),all=[...current,...older];
  let docs;
  if(current.length)docs=current;
  else if(labels.length)docs=all.filter(d=>d.titles.some(t=>labels.includes(t)));
  else docs=all;
  const documents=unique(docs.map(d=>d.documentId)),ambiguities=[];
  // Several separately named groups may describe source and destination. Only
  // one mention mapping to different directory entries is intrinsically ambiguous.
  const sharedMention=mentions.some(a=>mentions.some(b=>a.reference!==b.reference&&a.source===b.source&&a.start===b.start&&a.end===b.end));
  if(sharedMention||(usedPrevious&&groupPointer.test(groupRequest)&&groups.length>1))ambiguities.push('group');
  // Multiple source links in a summary are not a singular document reference.
  if(documents.length>1&&(documentPointer.test(request)||labels.length===1))ambiguities.push('document');
  return {referenceOnly:true,groups,documents,ambiguities,sources:{
    groups:mentions.map(({reference,source,kind,start,end})=>({reference,source,kind,...(start!==undefined?{normalizedSpan:[start,end]}:{})})),
    documents:docs.map(({documentId,source})=>({documentId,source})),
  }};
}
