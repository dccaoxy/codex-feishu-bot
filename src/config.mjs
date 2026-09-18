import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function loadConfig(filename = path.join(ROOT, 'config.local.json'), requireCredentials = true) {
  if (!fs.existsSync(filename)) throw new Error('找不到 config.local.json，请复制 config.example.json 并填写配置。');
  const c = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const base = path.dirname(path.resolve(filename));
  if (!c.feishu || !c.codex) throw new Error('配置必须包含 feishu 和 codex。');
  for (const key of ['appId', 'appSecret', 'ownerOpenId']) {
    if (typeof c.feishu[key] !== 'string') throw new Error(`feishu.${key} 必须是字符串。`);
  }
  if (requireCredentials && (!c.feishu.appId.trim() || !c.feishu.appSecret.trim())) {
    throw new Error('请先在 config.local.json 填写飞书 appId 和 appSecret。');
  }
  if (c.feishu.appId && !/^cli_[0-9a-fA-F]{16}$/.test(c.feishu.appId)) throw new Error('飞书 appId 格式应为 cli_ 加 16 位十六进制字符。');
  if (!['workspace-write', 'read-only'].includes(c.codex.sandbox)) throw new Error('sandbox 只支持 workspace-write / read-only。');
  if (!['on-request', 'untrusted'].includes(c.codex.approvalPolicy)) throw new Error('approvalPolicy 只支持 on-request / untrusted。');
  if (typeof c.codex.binary !== 'string' || !c.codex.binary) throw new Error('请填写 codex.binary。');
  if (typeof c.codex.cwd !== 'string' || !c.codex.cwd) throw new Error('请填写 codex.cwd。');
  if (typeof c.codex.allowExternalThreadRead !== 'boolean') throw new Error('allowExternalThreadRead 必须是布尔值。');
  if (!Number.isFinite(c.streamIntervalMs) || c.streamIntervalMs < 500) throw new Error('streamIntervalMs 不能小于 500。');
  if (!Number.isFinite(c.maxAttachmentMB) || c.maxAttachmentMB < 1 || c.maxAttachmentMB > 30) throw new Error('maxAttachmentMB 必须为 1–30。');
  c.codex.cwd = path.resolve(base, c.codex.cwd);
  c.storageDir = path.resolve(base, c.storageDir || './data');
  fs.mkdirSync(c.codex.cwd, { recursive: true, mode: 0o700 });
  fs.mkdirSync(c.storageDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(filename, 0o600);
  return c;
}
