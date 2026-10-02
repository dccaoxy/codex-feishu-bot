import {createHash} from 'node:crypto';
import {readTarget} from './owner-read-permit.mjs';
import {readError} from './owner-office-read-policy.mjs';

const allTypes=['docx','wiki','sheets','base','file','drive/folder'];
const limits={rows:5000,bytes:8*1024*1024,resources:1000,urlBytes:2048};
const denied=()=>{throw readError('target_not_authorized');};
const incomplete=()=>{throw new Error('群链接集合超过读取预算或存在无法完整解析的来源；本次未建立完整集合，请缩小群消息范围后重试。');};
const norm=value=>value.normalize('NFKC').replace(/\s+/gu,'').toLowerCase();
const digest=value=>createHash('sha256').update(value).digest('hex');
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);

// This is intentionally a complete request grammar, not a search for permission
// words in quoted messages, URLs, conditional requests, or document contents.
export function parseCollectionRequest(text){
 if(typeof text!=='string'||text.length>1000||/[\n\r`<>]/u.test(text))return null;
 const value=text.trim().replace(/^(?:请帮我|麻烦你|请|麻烦|帮我)\s*/u,'').replace(/[。.!！]$/u,'').trim();
 const m=/^(?:读取|查看|读一下|read)\s*(.+?)(?:里面|里|中|内)(?:的)?\s*(?:全部|所有)(?:的)?\s*(.+)$/iu.exec(value);
 if(!m)return null;
 let groupLabel=m[1].trim(),typeText=m[2].trim();
 const quoted=/^(?:「([^」]+)」|“([^”]+)”|"([^"]+)")$/u.exec(groupLabel);
 if(quoted)groupLabel=quoted[1]||quoted[2]||quoted[3];
 if(!groupLabel||groupLabel.length>200||!/[\p{L}\p{N}]/u.test(groupLabel)||/[\n\r:：,，;；、/\\?!？!“”「」"'`<>]/u.test(groupLabel))return null;
 if(/(?:不要|别|如果|假如|引用|这段|那个|这个|刚才|任意|所有|全部|以及|和|与|或者)/u.test(groupLabel))return null;
 typeText=typeText.replace(/(?:[，,]\s*|\s+)包括\s*(?:多维表格|Bitable|电子表格)(?:和多维表格)?$/iu,'');
 const core=typeText.replace(/\s*(?:资源)?链接$/u,'').trim();
 let types;
 if(/^(?:(?:飞书|Office)\s*(?:文档|资源)|文档|Office)$/iu.test(core))types=allTypes;
 else if(/^(?:Docx|飞书\s*Docx|云文档)$/iu.test(core))types=['docx'];
 else if(/^(?:Wiki|知识库(?:文档|页面|节点)?)$/iu.test(core))types=['wiki'];
 else if(/^(?:Sheet|Sheets|电子表格)$/iu.test(core))types=['sheets'];
 else if(/^(?:Bitable|Base|多维表格)$/iu.test(core))types=['base'];
 else if(/^(?:Drive|云盘(?:文件|资源)?|文件)$/iu.test(core))types=['file','drive/folder'];
 else return null;
 return {groupLabel,types:[...types]};
}

function groupMatches(label,directory){
 const value=norm(label),withoutGroup=value.replace(/群(?:聊)?$/u,'');
 const exact=directory.filter(g=>[norm(g.displayName),g.reference].includes(value)||norm(g.displayName)===withoutGroup);
 if(exact.length)return exact;
 // The entire supplied label must be a unique substring of a trusted name.
 // Never guess a suffix of a longer unknown label or use a model's candidate.
 if([...withoutGroup].length<2||withoutGroup===value)return [];
 return directory.filter(g=>norm(g.displayName).includes(withoutGroup));
}

function messageStrings(kind,raw){
 let content;try{content=JSON.parse(raw);}catch{incomplete();}
 if(!content||typeof content!=='object')incomplete();
 if(kind==='text'){if(typeof content.text!=='string')incomplete();return [{value:content.text,href:false}];}
 if(kind!=='post')return [];
 const posts=Array.isArray(content.content)?[content]:Object.entries(content).filter(([locale,p])=>/^[a-z]{2}_[a-z]{2}$/u.test(locale)&&p&&typeof p==='object'&&Array.isArray(p.content)).map(([,p])=>p);
 if(!posts.length)incomplete();
 const values=[];
 for(const post of posts){
  if(typeof post.title==='string')values.push({value:post.title,href:false});
  for(const row of post.content){
   if(!Array.isArray(row))incomplete();
   for(const node of row){
    if(!node||typeof node!=='object')incomplete();
    if((node.tag==='text'||node.tag==='a')&&typeof node.text==='string')values.push({value:node.text,href:false});
    if(node.tag==='a'&&typeof node.href==='string')values.push({value:node.href,href:true});
   }
  }
 }
 return values;
}

function selectors(url,type){
 const values={},aliases={table:'table_id',table_id:'table_id',view:'view_id',view_id:'view_id',record:'record_id',record_id:'record_id',form:'form_id',form_id:'form_id',sheet:'sheet_id',sheet_id:'sheet_id',range:'range',block_id:'block_id'};
 const permitted={docx:['block_id'],base:['table_id','view_id','record_id','form_id'],sheets:['sheet_id','range'],wiki:['table_id','view_id','record_id','form_id','sheet_id','range','block_id'],file:[],'drive/folder':[]}[type];
 for(const [key,value] of url.searchParams){
  const field=aliases[key];if(!field)continue;
  if(!permitted.includes(field)||Object.hasOwn(values,field)||!value||value.length>200)denied();
  if(field!=='range'&&!identifier(value))denied();
  values[field]=value;
 }
 if(['view_id','record_id','form_id'].some(key=>values[key])&&!values.table_id)denied();
 if(values.range){
  const m=/^(?:([a-zA-Z0-9_-]{1,100})!)?([A-Z]{1,3}[1-9][0-9]{0,6}:[A-Z]{1,3}[1-9][0-9]{0,6})$/.exec(values.range);
  if(!m||(!m[1]&&!values.sheet_id)||(m[1]&&values.sheet_id&&m[1]!==values.sheet_id))denied();
  values.range=`${m[1]||values.sheet_id}!${m[2]}`;
  // Range already binds its sheet; retaining a second selector would require
  // callers to pass an incompatible extra sheet_id to the fixed range API.
  delete values.sheet_id;
 }
 if(type==='wiki'&&[Boolean(values.table_id),Boolean(values.sheet_id||values.range),Boolean(values.block_id)].filter(Boolean).length>1)denied();
 return values;
}

function links(kind,raw){
 const found=new Map();
 for(const field of messageStrings(kind,raw)){
  // Consume whole URLs, including queries/fragments, so a nested URL is never
  // extracted as a second resource. Chinese prose punctuation can separate
  // adjacent links only before the URL has entered a query or fragment.
  // Structured href is one atomic URL, never text containing several URLs.
  // In text, quotes/brackets within a query must not restart URL discovery.
  const spans=field.href?[field.value.trim()]:[...field.value.matchAll(/https?:\/\/\S+/giu)].map(m=>m[0]);
  for(const span of spans){
   const candidates=field.href?[span]:[];let remaining=field.href?'':span;
   while(remaining){
    const punctuation=/[，。；！？、：]/u.exec(remaining),query=remaining.search(/[?#]/u);
    if(!punctuation||(query!==-1&&query<punctuation.index)){candidates.push(remaining);break;}
    candidates.push(remaining.slice(0,punctuation.index));
    const rest=remaining.slice(punctuation.index+punctuation[0].length),next=/https?:\/\//iu.exec(rest);
    remaining=next?rest.slice(next.index):'';
   }
   for(const rawCandidate of candidates){
    const candidate=field.href?rawCandidate:rawCandidate.replace(/[。，；！？,.!?;)\]}"'`“”‘’「」『』【】<>]+$/u,'');
    if(Buffer.byteLength(candidate)>limits.urlBytes)incomplete();
    const target=readTarget(candidate);if(!target)continue;
    const url=new URL(candidate),extra=selectors(url,target.type);
    const values={ [target.key]:target.value,...(target.type==='wiki'?{}:extra) };
    const key=JSON.stringify([target.type,values,extra]);
    found.set(key,{root:target.key,values,url:candidate,type:target.type,id:target.value,...(target.type==='wiki'?{wikiSelectors:extra}:{})});
   }
  }
 }
 return [...found.values()];
}

export async function createReadCollection(text,gateway,context,guard){
 const request=parseCollectionRequest(text);if(!request)return null;
 guard();if(!gateway||!context||context.text!==text)denied();gateway.authorize(context);
 const directory=await gateway.directory(context);guard();gateway.authorize(context);
 const matches=groupMatches(request.groupLabel,directory);if(matches.length!==1)denied();
 const group=matches[0],store=gateway.groups.store,cache=gateway.cache.get(group.chat);
 if(!cache||cache.name!==group.displayName)denied();
 const name=group.displayName,allowlistSnapshot=JSON.stringify(gateway.config.groups.allowedChatIds);
 const check=()=>{
  guard();gateway.authorize(context);
  if(context.text!==text||JSON.stringify(gateway.config.groups.allowedChatIds)!==allowlistSnapshot||!gateway.allowed(group.chat)||gateway.cache.get(group.chat)?.name!==name)denied();
  // A later fetched directory may reveal a newly ambiguous name/alias.
  const current=gateway.config.groups.allowedChatIds.filter(chat=>gateway.allowed(chat)).flatMap(chat=>{
   const c=gateway.cache.get(chat);return c?[{chat,displayName:c.name,reference:directory.find(g=>g.chat===chat)?.reference||''}]:[];
  });
  const now=groupMatches(request.groupLabel,current);if(now.length!==1||now[0].chat!==group.chat)denied();
 };
 check();
 const rows=store.db.prepare(`SELECT m.chat,m.id,m.kind,m.time,m.state,r.content FROM messages m JOIN raw_messages r ON r.chat=m.chat AND r.id=m.id WHERE m.chat=? AND m.time>=? AND m.kind IN ('text','post') ORDER BY m.time,m.id LIMIT ?`).all(group.chat,store.lowerBound(),limits.rows+1);
 if(rows.length>limits.rows)incomplete();
 const grants=[];let bytes=0;
 const valid=row=>row&&row.time>=store.lowerBound()&&!['queued','queue_full','cancelled'].includes(row.state)&&store.visible(group.chat,row.id);
 const sourceHash=row=>digest(JSON.stringify([row.kind,row.time,row.content]));
 const readSource=store.db.prepare('SELECT m.chat,m.id,m.kind,m.time,m.state,r.content FROM messages m JOIN raw_messages r ON r.chat=m.chat AND r.id=m.id WHERE m.chat=? AND m.id=?');
 for(const row of rows){
  if(!valid(row))continue;
  bytes+=Buffer.byteLength(row.content);if(bytes>limits.bytes)incomplete();
  const original=sourceHash(row);
  for(const entry of links(row.kind,row.content)){
   if(!request.types.includes(entry.type))continue;
   if(grants.length>=limits.resources)incomplete();
   const provenance=Object.freeze({chat:group.chat,messageId:row.id,resourceType:entry.type,resourceId:entry.id});
   const sourceCheck=()=>{check();const current=readSource.get(group.chat,row.id);if(!valid(current)||sourceHash(current)!==original)denied();};
   grants.push(Object.freeze({root:entry.root,values:Object.freeze(entry.values),url:entry.url,check:sourceCheck,provenance,...(entry.wikiSelectors?{wikiSelectors:Object.freeze(entry.wikiSelectors)}:{})}));
  }
 }
 check();Object.freeze(grants);
 return Object.freeze({check,grants,page(offset=0){
  check();if(!Number.isSafeInteger(offset)||offset<0||offset>grants.length)throw readError('invalid_request');
  const resources=grants.slice(offset,offset+10).map((g,i)=>{
   g.check();
   return {index:offset+i,state:'permitted',url:g.url,root:g.root,values:g.values,provenance:g.provenance,...(g.wikiSelectors?{wikiSelectors:g.wikiSelectors}:{})};
  });
  const result={resources,total:grants.length,nextOffset:offset+10<grants.length?offset+10:null,group:{reference:group.reference,displayName:name},scope:'frozen_current_local_mirror',untrustedData:true,note:'仅本次Owner请求冻结的当前群本地消息镜像链接集合；不代表完整历史或资源正文已读取。元数据、目录和正文读取仍受各自范围及OAuth权限限制。'};
  if(Buffer.byteLength(JSON.stringify(result))>24000)incomplete();
  return result;
 }});
}
