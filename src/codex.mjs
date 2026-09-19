import WebSocket from 'ws';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class RpcError extends Error {
  constructor(method, error) { super(`${method}: ${error.message}`); this.code = error.code; }
}
export class CodexClient extends EventEmitter {
  constructor(binary, { timeoutMs = 60000, args = ['app-server'], url = null, socketPath = null } = {}) {
    super(); this.url = url; this.socketPath = socketPath; this.shared = Boolean(url || socketPath); this.binary = binary; this.args = args; this.timeoutMs = timeoutMs; this.pending = new Map(); this.next = 1;
  }
  async start() {
    if (this.proc || this.socket) return;
    if (this.shared) {
      const socket = this.socket = new WebSocket(this.socketPath ? 'ws://localhost/' : this.url, {perMessageDeflate:false, ...(this.socketPath ? {createConnection:() => net.connect(this.socketPath)} : {})});
      socket.addEventListener('message', e => this.receive(e.data));
      socket.addEventListener('close', () => this.fail(new Error('共享 Codex 连接已关闭')));
      socket.addEventListener('error', () => this.fail(new Error('共享 Codex 连接失败')));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.close(); reject(new Error('共享 Codex 连接超时')); }, this.timeoutMs);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once:true});
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('共享 Codex 连接失败')); }, {once:true});
      });
      return this.initialize();
    }
    // Do not inherit the bot's credentials if the caller supplied them in environment variables.
    const env = { ...process.env };
    delete env.FEISHU_APP_SECRET; delete env.FEISHU_APP_ID;
    this.proc = spawn(this.binary, this.args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    this.proc.on('error', e => this.fail(e));
    this.proc.on('exit', (code, signal) => this.fail(new Error(`Codex 进程退出 (${code ?? signal})`)));
    // Never log raw stderr: local configuration or tool output may contain credentials.
    this.proc.stderr.on('data', () => {});
    this.proc.stdin.on('error', e => this.fail(e));
    this.lines = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    this.lines.on('line', line => this.receive(line));
    return this.initialize();
  }
  receive(line) {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.method) this.emit(m.id !== undefined ? 'request' : 'notification', m);
    else if (this.pending.has(m.id)) {
      const p = this.pending.get(m.id); this.pending.delete(m.id); clearTimeout(p.timer);
      m.error ? p.reject(new RpcError(p.method, m.error)) : p.resolve(m.result);
    }
  }
  async initialize() {
    const result = await this.request('initialize', {
      clientInfo: { name: 'feishu_codex_local', title: '飞书本地 Codex', version: '0.1.0' },
      capabilities: { experimentalApi: true, mcpServerOpenaiFormElicitation: true },
    });
    this.write({ method: 'initialized' });
    return result;
  }
  write(message) {
    if (this.shared) {
      if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('共享 Codex 未连接。');
      this.socket.send(JSON.stringify(message)); return;
    }
    if (!this.proc || this.proc.stdin.destroyed) throw new Error('Codex 未连接，请重启机器人。');
    this.proc.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}, timeoutMs = this.timeoutMs) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 响应超时；未自动重试，避免重复执行。`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.write({ id, method, params }); } catch (e) {
        clearTimeout(timer); this.pending.delete(id); reject(e);
      }
    });
  }
  respond(id, result) { this.write({ id, result }); }
  reject(id, message) { this.write({ id, error: { code: -32601, message } }); }
  fail(error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
    this.emit('disconnected', error);
  }
  async close() {
    if (this.socket) {
      const socket = this.socket; this.socket = null;
      this.fail(new Error('共享 Codex 连接已关闭'));
      socket.close(); return;
    }
    const proc = this.proc;
    if (!proc) return;
    this.proc = null; this.lines?.close();
    this.fail(new Error('Codex 连接已关闭'));
    proc.stdin.end();
    if (proc.exitCode === null && proc.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 3000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  }
}
