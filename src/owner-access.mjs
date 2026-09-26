// Authority comes from the authenticated event envelope, never message text.
export function ownerAccessConfig(value = {}) {
  const c = {enabled:false, inheritRuntimeDefaults:false, ...value};
  if (typeof c.enabled !== 'boolean' || typeof c.inheritRuntimeDefaults !== 'boolean') throw Error('Owner Access 配置无效');
  return c;
}
export class OwnerAccess {
  constructor(config, groups, owner) {this.config=config;this.groups=groups;this.owner=owner;}
  allowed(chat) {return this.config.ownerAccess?.enabled === true && !this.groups.closed && this.groups.policy.allowedGroup(chat) && !this.groups.store.stopped(chat);}
  accepts(data) {
    const d=data?.event||data,m=d?.message;
    return Boolean(m?.chat_type==='group' && d.sender?.sender_type==='user' && d.sender.sender_id?.open_id && d.sender.sender_id.open_id===this.owner() && this.allowed(m.chat_id) && this.groups.policy.mayRespond(d) && Number(m.create_time)>=this.groups.liveSince);
  }
  routes(data) {
    if(!this.accepts(data))return false;
    const m=(data.event||data).message;
    // Existing explicit gateway/document commands keep their proven group path.
    try {const text=this.stripMention(m,JSON.parse(m.content)).text||'';return !/^\/(owner|group-doc)(?:\s|$)/.test(text);}
    catch{return false;}
  }
  stripMention(message, content) {
    if(message.message_type!=='text')return content;
    let text=String(content.text||'');
    for(const mention of message.mentions||[]) if(mention.id?.open_id===this.groups.policy.botId && typeof mention.key==='string' && mention.key) text=text.split(mention.key).join('');
    return {...content,text:text.trim()};
  }
}
