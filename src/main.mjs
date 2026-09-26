import { OwnerAccess } from './owner-access.mjs';
import {OwnerGroupGateway} from './owner-group-gateway.mjs';
import { GroupAssistant } from './group-assistant.mjs';
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
      console.log(`群助手：${config.groups.enabled ? '启用' : '关闭'}；授权群数量：${config.groups.allowedChatIds.length}；启用前运行 npm run group:check 验证受限工具。`);
      console.log(`Owner Gateway：${config.ownerGateway.enabled ? '启用' : '关闭'}；授权数据源：${config.ownerGateway.resources.length}；私人任务读取：${config.ownerGateway.privateThreads ? '启用' : '关闭'}。`);
      console.log(`群知识：${config.groups.knowledge.enabled?'启用':'关闭'}；时区 ${config.groups.knowledge.timezone}，每日 ${config.groups.knowledge.dailyAt}；启用前运行 npm run knowledge:check。`);
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
  let groups;
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
    await groups?.close();
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
    else console.log('已加载单聊绑定账号；群聊使用独立授权策略。');
    bot.ownerTimer = setInterval(() => bot.refreshOwner(),1000);
    if (config.groups.enabled) {
      const info = await feishu.call(() => feishu.client.request({method:'GET',url:'/open-apis/bot/v3/info'}));
      if (!info.bot?.open_id) throw new Error('无法确认机器人身份，群聊未启用');
      groups = new GroupAssistant(config,feishu,() => bot.owner,info.bot.open_id,{rpc});
      bot.ownerAccess = new OwnerAccess(config,groups,()=>bot.owner);
      bot.setOwnerGroups(new OwnerGroupGateway(config,store,groups,feishu,()=>config.feishu.ownerOpenId||store.get('owner')||''));
    }
    await bot.recover();
    await feishu.start(data => {
      if ((data.event || data).message?.chat_type === 'group') {
        const ownerRequest=bot.ownerAccess?.routes(data);
        groups?.onMessage(data,{recordOnly:ownerRequest});
        if(ownerRequest)return bot.onMessage(data);
        return;
      }
      return bot.onMessage(data);
    }, data => bot.onAction(data), groups ? {
      'im.message.recalled_v1': data => {groups.onRecall(data);const d=data.event||data;void bot.cancelOwnerGroup(d.chat_id,d.message_id).catch(e=>console.error(bot.redact(e)));},
      'im.chat.member.bot.deleted_v1': data => {groups.onLeave(data);const d=data.event||data;void bot.cancelOwnerGroup(d.chat_id).catch(e=>console.error(bot.redact(e)));},
    } : {});
    groups?.start();
    console.log('机器人启动中。请保持电脑联网且不休眠。按 Ctrl+C 停止。');
  } catch (e) { console.error(bot.redact(e)); process.exitCode = 1; await shutdown(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
