import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { CodexClient } from './codex.mjs';
import { Feishu } from './feishu.mjs';
import { Bot } from './bot.mjs';

async function main() {
  const doctor = process.argv.includes('--doctor');
  const config = loadConfig(undefined, !doctor);
  if (process.argv.includes('--pair')) {
    const code = process.argv[process.argv.indexOf('--pair')+1];
    if (!code || !/^[0-9a-f]{10}$/i.test(code)) throw new Error('用法：node src/main.mjs --pair 飞书收到的配对码');
    if (config.feishu.ownerOpenId) throw new Error('配置已经指定 ownerOpenId，无需配对。');
    const s = new Store(config.storageDir);
    try { s.approvePair(code); console.log('已确认配对。运行中的机器人会自动加载绑定，无需重启。'); }
    finally { s.close(); }
    return;
  }
  if (doctor) {
    const rpc = new CodexClient(config.codex.binary, {url: config.codex.appServerUrl, socketPath: config.codex.appServerSocket});
    try {
      await rpc.start();
      const account = await rpc.request('account/read', {});
      const models = await rpc.request('model/list', { limit: 100 });
      console.log('✓ Codex App Server 握手成功');
      console.log(account.account ? '✓ 已检测到 Codex 登录状态' : '✗ Codex 未登录，请运行 codex login');
      console.log(`✓ 可用模型数：${models.data.length}`);
      console.log(`✓ 工作目录：${config.codex.cwd}`);
      console.log(config.feishu.appId && config.feishu.appSecret ? '✓ 飞书凭证已填写（未联网验证）' : '待填写：config.local.json 的 feishu.appId / appSecret');
      console.log('诊断不会发起模型任务，也不会给飞书发送消息。');
      if (!account.account) process.exitCode = 1;
    } finally { await rpc.close(); }
    return;
  }
  const lock = path.join(config.storageDir, 'bot.lock');
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); alive = true; } catch (err) { if (err.code !== 'ESRCH') alive = true; }
    }
    if (alive) throw new Error(`已有机器人实例运行（PID ${pid}）。`);
    fs.unlinkSync(lock); fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  }
  const store = new Store(config.storageDir), rpc = new CodexClient(config.codex.binary, {url: config.codex.appServerUrl, socketPath: config.codex.appServerSocket}), feishu = new Feishu(config);
  const bot = new Bot(config, store, rpc, feishu);
  let shuttingDown = false;
  // A live shell without its Codex child cannot serve requests. Exit so launchd can
  // replace the whole process; during an intentional shutdown this listener is inert.
  rpc.on('disconnected', error => {
    if (shuttingDown) return;
    console.error(`Codex 后端连接中断，正在交给系统重启：${bot.redact(error)}`);
    process.exitCode = 1;
    void shutdown();
  });
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    await bot.close(); feishu.close(); await rpc.close();
    // In-flight work retains a recovery marker. Exit only after the store has stopped being used.
    if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock);
    process.exit(process.exitCode || 0);
  }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  process.on('uncaughtException', e => { console.error(bot.redact(e)); process.exitCode = 1; void shutdown(); });
  process.on('unhandledRejection', e => { console.error(bot.redact(e)); process.exitCode = 1; void shutdown(); });
  try {
    await rpc.start();
    const account = await rpc.request('account/read', {});
    if (!account.account) throw new Error('请先运行 codex login 登录。');
    console.log('Codex 已连接。');
    if (!bot.owner) console.log(`首次配对：私聊机器人发送任意文字，它会返回配对码。把码告诉本机 Codex 助手确认。\n也可在 15 分钟内私聊发送 /pair ${bot.pairCode} 直接配对。`);
    else console.log('已加载绑定账号，只接收该账号的单聊消息。');
    await bot.recover();
    bot.ownerTimer = setInterval(() => bot.refreshOwner(),1000);
    await feishu.start(data => bot.onMessage(data), data => bot.onAction(data));
    console.log('机器人启动中。请保持电脑联网且不休眠。按 Ctrl+C 停止。');
  } catch (e) { console.error(bot.redact(e)); process.exitCode = 1; await shutdown(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
