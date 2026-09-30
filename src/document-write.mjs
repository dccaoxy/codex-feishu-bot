import { exactDocumentId } from './trusted-documents.mjs';
export async function documentAccess(feishu,id,guard) {
 if(!exactDocumentId(id))throw Error('请提供精确文档ID');
 for(const action of ['view','edit']){
  guard();const r=await feishu.call(()=>{guard();return feishu.client.drive.permissionMember.auth({path:{token:id},params:{type:'docx',action}});},true,guard);guard();
  if(r?.auth_result!==true){const e=Error('文档阅读或编辑权限不可用');e.code='DOCUMENT_ACCESS_DENIED';throw e;}
 }
}
async function read(feishu,fn,guard){guard();const r=await feishu.call(()=>{guard();return fn();},true,guard);guard();return r;}
export async function prepareDocumentWrite(feishu,proposal,guard){
 const p=proposal.payload,id=p.documentId??p.path?.document_id,path={document_id:id},revision=p.revisionId??p.params?.document_revision_id;
 if(!exactDocumentId(id)||!Number.isSafeInteger(revision)||revision<0)throw Error('内容写入必须指定精确文档ID和读取时版本');
 const doc=feishu.client.docx;
 const meta=await read(feishu,()=>doc.document.get({path}),guard);
 if(meta.document?.revision_id!==revision)throw Error('文档版本已变化，请重新读取，不自动写入');
 const context={id,revision,blocks:[],proposal,inserting:['feishu_doc_append','docx.v1.documentBlockChildren.create','docx.v1.documentBlockDescendant.create'].includes(proposal.api)};
 if(proposal.api==='docx.v1.documentBlockChildren.batchDelete'){
  const parent=p.path.block_id;
  const {block}=await read(feishu,()=>doc.documentBlock.get({path:{...path,block_id:parent},params:{document_revision_id:revision}}),guard);
  const ids=block?.children,{start_index:start,end_index:end}=p.data;
  if(!Array.isArray(ids)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>ids.length||ids.some(x=>!exactDocumentId(x))||new Set(ids).size!==ids.length)throw Error('无法核对父块顺序和明确删除范围');
  if(block.block_id!==parent)throw Error('父块身份不一致');
  context.deleted=ids.slice(start,end);context.expectedChildren=ids.filter((_,i)=>i<start||i>=end);context.blocks=[parent];
 }else if(proposal.api==='feishu_doc_append')context.blocks=[p.parentBlockId??id];
 else if(p.blockId||p.path?.block_id)context.blocks=[p.blockId??p.path.block_id];
 else if(p.data?.requests)context.blocks=[...new Set(p.data.requests.map(x=>x.block_id))];
 if(context.blocks.length>50||(p.data?.children?.length??0)>50||(p.data?.children_id?.length??0)>50)throw Error('请拆分为最多50个顶层内容块的修改');
 if(context.blocks.some(x=>!exactDocumentId(x)))throw Error('缺少明确内容块ID');
 if(!context.deleted)for(const blockId of context.blocks){
  const r=await read(feishu,()=>doc.documentBlock.get({path:{...path,block_id:blockId},params:{document_revision_id:revision}}),guard);
  if(r.block?.block_id!==blockId)throw Error('写前无法核对目标块');
 }
 if(proposal.api==='feishu_doc_update_text')context.expectedElements=[{text_run:{content:p.text}}];
 if(proposal.api==='docx.v1.documentBlock.patch')context.expectedElements=p.data?.update_text_elements?.elements;
 return context;
}
export async function verifyDocumentWrite(feishu,context,result,guard){
 const {id,revision}=context,doc=feishu.client.docx,path={document_id:id};
 const meta=await read(feishu,()=>doc.document.get({path}),guard),after=meta.document?.revision_id,reported=result?.document_revision_id;
 if(!Number.isSafeInteger(after)||after<=revision||(Number.isSafeInteger(reported)&&after!==reported))throw Error('写入已返回，但回读版本无法确定；不要自动重试，请重新核对');
 const inserted=(result?.children??[]).map(x=>x.block_id);
 if(context.inserting&&(!inserted.length||inserted.some(id=>!exactDocumentId(id))))throw Error('追加已返回但缺少可回读的新块ID；不要自动重试');
 const ids=[...new Set([...context.blocks,...inserted].filter(Boolean))];
 const blocks=[];
 for(const id of ids.slice(0,50)){
  const r=await read(feishu,()=>doc.documentBlock.get({path:{...path,block_id:id},params:{document_revision_id:after}}),guard);
  if(r.block?.block_id!==id)throw Error('写后回读缺少目标块；不要重试写入');blocks.push(r.block);
 }
 if(context.inserting){const children=blocks[0]?.children;if(!Array.isArray(children)||inserted.some(id=>!children.includes(id)))throw Error('追加后父块与返回的新块不一致；不要自动重试');}
 if(context.deleted){const children=blocks[0]?.children;if(!Array.isArray(children)||JSON.stringify(children)!==JSON.stringify(context.expectedChildren))throw Error('删除后回读不一致；不要重试写入');}
 if(context.expectedElements){
  const actual=Object.values(blocks[0]??{}).find(v=>v&&Array.isArray(v.elements))?.elements;
  if(!includesValue(actual,context.expectedElements))throw Error('写入后文字或样式与预期不一致；不要自动重试');
 }
 // Return observations, not an assertion that arbitrary rich content is semantically correct.
 return {status:'read_back',revisionId:after,blockIds:ids.slice(0,50),deletedBlockIds:context.deleted??[],truncated:ids.length>50,note:'已回读目标版本；复杂表格/格式的视觉效果仍需核对。'};
}

function includesValue(actual,expected){if(Array.isArray(expected))return Array.isArray(actual)&&actual.length===expected.length&&expected.every((v,i)=>includesValue(actual[i],v));if(expected&&typeof expected==='object')return actual&&typeof actual==='object'&&Object.entries(expected).every(([k,v])=>includesValue(actual[k],v));return actual===expected;}
