// Owner-only enrichment. Current display names are not historical/legal identity.
export async function memberNames(feishu,chat,ids,guard){
  const names=new Map(),conflicts=new Set(),seen=new Set();let cursor,status='partial',scanned=0;
  guard();
  try {
    for(let page=0;page<20;page++){
      const data=await feishu.call(()=>{guard();return feishu.client.im.v1.chatMembers.get({path:{chat_id:chat},params:{member_id_type:'open_id',page_size:100,...(cursor?{page_token:cursor}:{})}});},false,guard);
      guard();
      if(!Array.isArray(data?.items))throw Error('Invalid member page');
      // Feishu may return more than page_size for members joining together.
      for(const item of data.items.slice(0,10000-scanned)){
        if(item.member_id_type && item.member_id_type!=='open_id')continue;
        const id=item.member_id,name=item.name;
        if(!ids.has(id)||typeof name!=='string'||!name.trim()||Buffer.byteLength(name)>200)continue;
        if(names.has(id)&&names.get(id)!==name)conflicts.add(id);else names.set(id,name);
      }
      scanned+=data.items.length;
      if(data.trigger_security_conf_limit||scanned>10000)break;
      if(data.has_more===false){status='complete';break;}
      if(scanned>=10000)break;
      if(data.has_more!==true||typeof data.page_token!=='string'||!data.page_token||data.page_token.length>2000||seen.has(data.page_token))break;
      cursor=data.page_token;seen.add(cursor);
    }
  }catch{guard();status='unavailable';}
  guard();
  return {names,conflicts,status};
}
