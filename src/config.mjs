import { ownerAccessConfig } from './owner-access.mjs';
import { gatewayConfig } from './owner-gateway.mjs';
import { groupConfig } from './group-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function loadConfig(filename = path.join(ROOT, 'config.local.json'), requireCredentials = true) {
  if (!fs.existsSync(filename)) throw new Error('找不到 config.local.json，请复制 config.example.json 并填写配置。');
  const c = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if(c.ownerOAuth!==undefined){
    const o=c.ownerOAuth;
    if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.enabled!=='boolean'||!Array.isArray(o.apis)||o.apis.length>219||new Set(o.apis).size!==o.apis.length||o.apis.some(a=>typeof a!=='string'||!/^[-a-zA-Z0-9.]{1,150}$/.test(a))||Object.keys(o).some(k=>!['enabled','apis'].includes(k)))throw Error('ownerOAuth仅接受enabled和明确的Office API名单；凭据不得放在配置中');
  }
  c.groups = groupConfig(c.groups);
  c.ownerAccess = ownerAccessConfig(c.ownerAccess);
  c.ownerGateway = gatewayConfig(c.ownerGateway);
  const base = path.dirname(path.resolve(filename));
  if (!c.feishu || !c.codex) throw new Error('配置必须包含 feishu 和 codex。');
  for (const key of ['appId', 'appSecret', 'ownerOpenId']) {
    if (typeof c.feishu[key] !== 'string') throw new Error(`feishu.${key} 必须是字符串。`);
  }
  if (requireCredentials && (!c.feishu.appId.trim() || !c.feishu.appSecret.trim())) {
    throw new Error('请先在 config.local.json 填写飞书 appId 和 appSecret。');
  }
  if (c.feishu.appId && !/^cli_[0-9a-fA-F]{16}$/.test(c.feishu.appId)) throw new Error('飞书 appId 格式应为 cli_ 加 16 位十六进制字符。');
  if (typeof c.codex.binary !== 'string' || !c.codex.binary) throw new Error('请填写 codex.binary。');
  if (typeof c.codex.cwd !== 'string' || !c.codex.cwd) throw new Error('请填写 codex.cwd。');
  if(c.codex.isolatedBinary!==undefined && (typeof c.codex.isolatedBinary!=='string'||!path.isAbsolute(c.codex.isolatedBinary)))throw Error('isolatedBinary 必须是绝对路径');
  // Legacy read/work flags do not override the connected Owner thread.
  for(const key of ['allowExternalThreadRead','externalThreadPermission','sandbox','approvalPolicy'])delete c.codex[key];
  if (c.codex.appServerUrl) {
    let u;
    try { u = new URL(c.codex.appServerUrl); } catch { throw new Error('appServerUrl 必须是本机 WebSocket 地址。'); }
    if (u.protocol !== 'ws:' || !['127.0.0.1', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('appServerUrl 仅允许无凭据的本机 ws://127.0.0.1 或 ws://[::1] 地址。');
  }
  if (c.codex.appServerSocket && (typeof c.codex.appServerSocket !== 'string' || !path.isAbsolute(c.codex.appServerSocket))) throw new Error('appServerSocket 必须是本机 socket 的绝对路径。');
  if (c.codex.appServerUrl && c.codex.appServerSocket) throw new Error('appServerUrl 与 appServerSocket 只能配置一个。');
  if (!Number.isFinite(c.streamIntervalMs) || c.streamIntervalMs < 500) throw new Error('streamIntervalMs 不能小于 500。');
  if (!Number.isFinite(c.maxAttachmentMB) || c.maxAttachmentMB < 1 || c.maxAttachmentMB > 30) throw new Error('maxAttachmentMB 必须为 1–30。');
  c.codex.cwd = path.resolve(base, c.codex.cwd);
  c.storageDir = path.resolve(base, c.storageDir || './data');
  fs.mkdirSync(c.codex.cwd, { recursive: true, mode: 0o700 });
  fs.mkdirSync(c.storageDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(filename, 0o600);
  return c;
}
