// Extract only the current trusted inbox input. Older sources remain identity,
// payload and recall dependencies, never contributors to the current intent.
export function ownerReadIntentText(data,botId) {
  const content=data.content;
  if(data.message.message_type==='text'&&typeof content?.text==='string')return content.text;
  if(data.message.message_type!=='post'||!content||typeof content!=='object')throw Error('当前读取来源无效');
  const post=content.content?content:(content.zh_cn||content.en_us||Object.values(content)[0]);
  if(!post||!Array.isArray(post.content)||(post.title!==undefined&&typeof post.title!=='string'))throw Error('当前读取来源无效');
  const lines=[];
  if(post.title)lines.push(post.title);
  for(const row of post.content){
    if(!Array.isArray(row))throw Error('当前读取来源无效');
    let line='';
    for(const node of row){
      if(node?.tag==='text'&&typeof node.text==='string')line+=node.text;
      else if(node?.tag==='a'&&typeof node.href==='string')line+=node.href;
      else if(node?.tag==='at'&&botId&&node.user_id===botId&&data.message.mentions?.some(m=>m.id?.open_id===botId))continue;
      else throw Error('当前读取来源无效');
    }
    if(line.trim())lines.push(line);
  }
  // Keep paragraph boundaries: quoted/history/conditional multi-line content
  // must not be flattened into a fresh command by the read-intent parser.
  return lines.join('\n').trim();
}

