import * as lark from '@larksuiteoapi/node-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const quietLogger = { error() {}, warn() {}, info() {}, debug() {}, trace() {} };
export function safeError(e) {
  // SDK errors can embed Authorization and request bodies; never stringify the error object.
  if (e?.response) return `飞书请求失败（HTTP ${e.response.status || '未知'}，API ${e.response.data?.code || '未知'}）：${String(e.response.data?.msg || '').slice(0,300)}`;
  return String(e?.message || '未知错误').slice(0,700);
}
export function chunks(text, maxBytes = 12000) {
  const out = []; let part = '', bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > maxBytes) { out.push(part); part = ''; bytes = 0; }
    part += char; bytes += size;
  }
  if (part) out.push(part);
  return out;
}
export function card(title, text, buttons = [], streaming = false) {
  return {
    schema: '2.0',
    config: { update_multi: true, streaming_mode: streaming, summary: { content: title.slice(0,80) } },
    header: { title: { tag: 'plain_text', content: title.slice(0,80) }, template: 'blue' },
    body: { elements: [
      { tag: 'markdown', content: text || '正在处理…', element_id: 'answer' },
      ...buttons.map(b => ({ tag: 'button', text: { tag: 'plain_text', content: b.label },
        type: b.primary ? 'primary' : 'default', behaviors: b.url ? [{ type: 'open_url', default_url: b.url }] : [{ type: 'callback', value: b.value }] })),
    ] },
  };
}
export class Feishu {
  constructor(config, log = console.log) {
    this.config = config; this.log = log; this.queue = Promise.resolve(); this.lastCall = 0;
    lark.defaultHttpInstance.defaults.timeout = 30000;
    this.client = new lark.Client({ appId: config.feishu.appId, appSecret: config.feishu.appSecret,
      appType: lark.AppType.SelfBuild, domain: lark.Domain.Feishu, logger: quietLogger });
  }
  async call(fn, retry = true, guard = () => {}) {
    const work = async () => {
      for (let attempt = 0; ; attempt++) {
        await delay(Math.max(0, 300 - (Date.now() - this.lastCall)));
        this.lastCall = Date.now();
        try {
          guard();
          const r = await fn();
          if (r?.code) {
            const e = new Error(`飞书 API ${r.code}: ${String(r.msg || '').slice(0,200)}`); e.feishuCode = r.code; throw e;
          }
          return r?.data ?? r;
        } catch (e) {
          const transient = e.feishuCode === 230020 || e.feishuCode === 99991400 ||
            e.response?.status === 429 || e.response?.status >= 500 || ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(e.code);
          if (!retry || !transient || attempt >= 2) throw e;
          await delay(1000 * 2 ** attempt);
        }
      }
    };
    const result = this.queue.then(work); this.queue = result.catch(() => {}); return result;
  }
  async send(chat, type, content, uuid = randomUUID(), guard) {
    return this.call(() => this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { receive_id: chat, msg_type: type, content: JSON.stringify(content), uuid },
    }), true, guard);
  }
  async text(chat, text, id, guard) {
    let i = 0;
    for (const part of chunks(text)) await this.send(chat, 'text', { text: part }, id ? `${id}-${i++}`.slice(0,50) : undefined, guard);
  }
  async interactive(chat, title, text, buttons) { return this.send(chat, 'interactive', card(title, text, buttons)); }
  async replaceInteractive(messageId, title, text) {
    return this.call(() => this.client.im.v1.message.patch({
      path: { message_id: messageId }, data: { content: JSON.stringify(card(title, text)) },
    }));
  }
  async stream(chat, title) {
    const result = await this.call(() => this.client.cardkit.v1.card.create({
      data: { type: 'card_json', data: JSON.stringify(card(title, '正在处理…', [], true)) },
    }), false);
    if (!result?.card_id) throw new Error('飞书未返回 card_id。请检查卡片权限。');
    await this.send(chat, 'interactive', { type: 'card', data: { card_id: result.card_id } });
    return result.card_id;
  }
  async update(cardId, text, sequence, guard) {
    const data = { content: text || '正在处理…', sequence, uuid: randomUUID() };
    return this.call(() => this.client.cardkit.v1.cardElement.content({
      path: { card_id: cardId, element_id: 'answer' }, data,
    }), true, guard);
  }
  async finish(cardId, sequence, summary = '已完成') {
    const data = { settings: JSON.stringify({ config: { streaming_mode: false, summary: { content: summary } } }), sequence, uuid: randomUUID() };
    return this.call(() => this.client.cardkit.v1.card.settings({ path: { card_id: cardId }, data }));
  }
  async download(messageId, key, type, target) {
    const result = await this.call(() => this.client.im.v1.messageResource.get({
      path: { message_id: messageId, file_key: key }, params: { type },
    }));
    const max = this.config.maxAttachmentMB * 1024 * 1024;
    let bytes = 0;
    const limiter = new Transform({ transform(chunk, _, done) {
      bytes += chunk.length;
      done(bytes > max ? new Error('附件超过本地配置的大小限制。') : null, chunk);
    } });
    try {
      await pipeline(result.getReadableStream(), limiter, fs.createWriteStream(target, { mode: 0o600 }));
    } catch (e) { fs.rmSync(target, { force: true }); throw e; }
    return target;
  }
  async upload(chat, filename, guard) {
    const size = fs.statSync(filename).size;
    if (!size || size > 30 * 1024 * 1024) throw new Error('返回文件必须大于 0 且不超过 30 MB。');
    const result = await this.call(() => this.client.im.v1.file.create({
      data: { file_type: 'stream', file_name: path.basename(filename), file: fs.createReadStream(filename) },
    }), false, guard);
    if (!result?.file_key) throw new Error('上传文件失败，未收到 file_key。');
    return this.send(chat, 'file', { file_key: result.file_key }, undefined, guard);
  }
  start(onMessage, onAction, groupEvents = {}) {
    const dispatcher = new lark.EventDispatcher({ logger: quietLogger }).register({
      'im.message.receive_v1': onMessage,
      'card.action.trigger': onAction,
      ...groupEvents,
    });
    this.ws = new lark.WSClient({ appId: this.config.feishu.appId, appSecret: this.config.feishu.appSecret,
      domain: lark.Domain.Feishu, logger: quietLogger, autoReconnect: true,
      onReady: () => this.log('飞书长连接已建立。'),
      onError: () => this.log('飞书长连接异常；请检查凭证、网络和订阅配置。SDK 将按策略重连。'),
      onReconnected: () => this.log('飞书长连接已恢复。'),
    });
    return this.ws.start({ eventDispatcher: dispatcher });
  }
  close() { this.ws?.close(); }
}
