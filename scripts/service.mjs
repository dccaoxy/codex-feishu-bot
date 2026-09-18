import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const LABEL = 'io.codex.feishu-bot';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uid = process.getuid();
const domain = `gui/${uid}`;
const service = `${domain}/${LABEL}`;
const launchAgents = path.join(os.homedir(), 'Library', 'LaunchAgents');
const plist = path.join(launchAgents, `${LABEL}.plist`);
const dataDir = path.join(root, 'data');
const stdout = path.join(dataDir, 'service.log');
const stderr = path.join(dataDir, 'service.error.log');

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function launchctl(args, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync('/bin/launchctl', args, {
    encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error((result.stderr || result.stdout || `launchctl ${args[0]} 失败`).trim());
  }
  return result;
}

function serviceState() {
  const result = launchctl(['print', service], { allowFailure: true, capture: true });
  if (result.status !== 0) return null;
  const output = result.stdout;
  return {
    output,
    state: /\bstate = ([^\n]+)/.exec(output)?.[1]?.trim() || 'unknown',
    pid: /\bpid = (\d+)/.exec(output)?.[1] || null,
    lastExit: /\blast exit code = ([^\n]+)/.exec(output)?.[1]?.trim() || null,
  };
}

function printStatus() {
  const state = serviceState();
  if (!state) {
    console.log('自动启动服务未安装或未加载。');
    return false;
  }
  console.log(`服务：${LABEL}`);
  console.log(`状态：${state.state}`);
  console.log(`进程：${state.pid || '正在等待启动'}`);
  if (state.lastExit) console.log(`上次退出：${state.lastExit}`);
  console.log(`运行日志：${stdout}`);
  console.log(`错误日志：${stderr}`);
  return state.state === 'running' && Boolean(state.pid);
}

async function install() {
  const config = path.join(root, 'config.local.json');
  if (!fs.existsSync(config)) throw new Error('缺少 config.local.json，请先完成机器人配置。');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) throw new Error(`需要 Node.js 24 或更高版本，当前为 ${process.version}。`);

  fs.mkdirSync(launchAgents, { recursive: true, mode: 0o700 });
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const node = fs.realpathSync(process.execPath);
  const executable = path.join(root, 'src', 'main.mjs');
  const pathValue = [path.dirname(node), path.join(os.homedir(), '.local', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':');
  const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(node)}</string><string>${xml(executable)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>${xml(os.homedir())}</string>
    <key>PATH</key><string>${xml(pathValue)}</string>
    <key>FEISHU_CODEX_SERVICE</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>Umask</key><integer>63</integer>
  <key>StandardOutPath</key><string>${xml(stdout)}</string>
  <key>StandardErrorPath</key><string>${xml(stderr)}</string>
</dict></plist>
`;

  launchctl(['bootout', domain, plist], { allowFailure: true, capture: true });
  fs.writeFileSync(plist, contents, { mode: 0o600 });
  fs.chmodSync(plist, 0o600);
  launchctl(['bootstrap', domain, plist]);
  launchctl(['enable', service]);
  await delay(1500);
  if (!printStatus()) {
    let message = '服务已安装，但进程尚未保持运行。';
    if (fs.existsSync(stderr)) {
      const recent = fs.readFileSync(stderr, 'utf8').split('\n').filter(Boolean).slice(-8).join('\n');
      if (recent) message += `\n最近错误：\n${recent}`;
    }
    throw new Error(message);
  }
  console.log('机器人已交给 macOS 守护；登录后自动启动，退出后自动重启。');
}

async function restart() {
  if (!serviceState()) throw new Error('自动启动服务尚未安装，请先运行 npm run service:install。');
  launchctl(['kickstart', '-k', service]);
  await delay(1500);
  if (!printStatus()) throw new Error('服务重启后未进入运行状态，请检查错误日志。');
}

function uninstall() {
  launchctl(['bootout', domain, plist], { allowFailure: true, capture: true });
  if (fs.existsSync(plist)) fs.unlinkSync(plist);
  console.log('自动启动服务已停用并移除；配置、会话和日志均保留。');
}

const command = process.argv[2] || 'status';
try {
  if (command === 'install') await install();
  else if (command === 'restart') await restart();
  else if (command === 'status') process.exitCode = printStatus() ? 0 : 1;
  else if (command === 'uninstall') uninstall();
  else throw new Error('用法：node scripts/service.mjs install|status|restart|uninstall');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
