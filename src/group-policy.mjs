// Group authority comes only from local configuration and the event sender, never model arguments.
export function groupConfig(value = {}) {
  const c = { enabled: false, allowedChatIds: [], retentionDays: 30, documentIds: {}, ...value };
  if (typeof c.enabled !== 'boolean' || !Array.isArray(c.allowedChatIds) || c.allowedChatIds.some(x => typeof x !== 'string' || !/^oc_[a-zA-Z0-9]+$/.test(x))) throw new Error('groups.allowedChatIds 必须是群 ID 列表');
  if (!Number.isInteger(c.retentionDays) || c.retentionDays < 1 || c.retentionDays > 365) throw new Error('groups.retentionDays 必须为 1–365');
  if (!c.documentIds || typeof c.documentIds !== 'object' || Array.isArray(c.documentIds) || Object.entries(c.documentIds).some(([chat,ids]) => !c.allowedChatIds.includes(chat) || !Array.isArray(ids) || ids.some(id => !/^[a-zA-Z0-9]+$/.test(id)))) throw new Error('groups.documentIds 必须是授权群到 docx ID 列表的映射');
  return c;
}
export class GroupPolicy {
  constructor(config, owner, botId) { this.config = groupConfig(config); this.owner = owner; this.botId = botId; }
  allowedGroup(chat) { return this.config.enabled && this.config.allowedChatIds.includes(chat); }
  actorRole(sender) { return sender && sender === this.owner() ? 'owner' : 'member'; }
  mayRespond(event) { return event.sender?.sender_type === 'user' && Boolean(this.botId) && Array.isArray(event.message?.mentions) && event.message.mentions.some(m => m?.id?.open_id === this.botId); }
  mayUseTool(name, sender, chat, documentId) {
    if (!this.allowedGroup(chat)) return false;
    if (['group_search', 'group_context'].includes(name)) return true;
    return this.actorRole(sender) === 'owner' && ['feishu_doc_read','feishu_doc_append','feishu_doc_update_text','feishu_doc_permissions'].includes(name) && this.config.documentIds[chat]?.includes(documentId);
  }
}
