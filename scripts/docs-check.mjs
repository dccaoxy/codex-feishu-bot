import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { Feishu } from '../src/feishu.mjs';
import { Store } from '../src/store.mjs';
import { Documents } from '../src/documents.mjs';
const config=loadConfig();
const store=new Store(config.storageDir);
const docs=new Documents(new Feishu(config),()=>config.feishu.ownerOpenId || store.get('owner'));
try {
  const created=await docs.execute('feishu_doc_create',{title:'Codex 飞书文档功能验证',content:'# 功能验证\n\n**粗体**、*斜体*、[飞书开放平台](https://open.feishu.cn)\n\n- 无序列表\n- 第二项\n\n1. 有序列表\n2. 第二项\n\n> 引用内容\n\n```js\nconst status = "ok";\n```\n\n| 功能 | 状态 |\n| --- | --- |\n| 原生表格 | 验证中 |'});
  fs.writeFileSync(path.join(config.storageDir,'docs-check.json'),JSON.stringify(created,null,2),{mode:0o600});
  console.log(JSON.stringify(created));
  if(!created.contentWritten) throw new Error('正文写入未完成');
  const read=await docs.execute('feishu_doc_read',{documentId:created.documentId});
  console.log(JSON.stringify({read:true,blockTypes:[...new Set(read.blocks.map(b=>b.block_type))]}));
  const text=read.blocks.find(b=>b.block_type===2);
  if(text) console.log(JSON.stringify(await docs.execute('feishu_doc_update_text',{documentId:created.documentId,blockId:text.block_id,text:'文本更新验证成功。',revisionId:read.document.revision_id})));
  console.log(JSON.stringify(await docs.execute('feishu_doc_append',{documentId:created.documentId,content:'## 追加验证\n\n追加内容验证成功。'})));
  console.log(JSON.stringify(await docs.execute('feishu_doc_permissions',{documentId:created.documentId})));
} catch(e) { console.error(e.message); process.exitCode=1; }
finally { store.close(); }
