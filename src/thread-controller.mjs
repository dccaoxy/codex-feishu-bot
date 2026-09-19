import { externalPermission } from './config.mjs';

// Work is deliberately limited to a live, shared App Server. Disk metadata from
// a different server cannot prove that a thread is idle.
export class ThreadController {
  constructor(config, store, rpc) {
    this.config = config; this.store = store; this.rpc = rpc;
    this.loaded = new Set(); this.busy = new Set();
  }
  permission() { return externalPermission(this.config); }
  requireWork() {
    if (this.permission() !== 'work') throw new Error('外部会话操作需要 externalThreadPermission=work。');
    if (!(this.config.codex.appServerUrl && this.rpc.url === this.config.codex.appServerUrl) && !(this.config.codex.appServerSocket && this.rpc.socketPath === this.config.codex.appServerSocket)) throw new Error('Work 必须连接目标会话所在的共享 App Server。');
  }
  async exclusive(id, fn) {
    if (this.busy.has(id)) throw new Error('该会话有操作进行中，请稍后重试。');
    this.busy.add(id);
    try { return await fn(); } finally { this.busy.delete(id); }
  }
  async inspect(id) {
    if (!id || typeof id !== 'string') throw new Error('请指定完整会话 ID 或列表编号。');
    const {thread:t} = await this.rpc.request('thread/read', {threadId:id,includeTurns:false});
    if (!t || t.id !== id) throw new Error('Codex 返回的会话身份不匹配。');
    const state = {id, title:t.name || '未命名', cwd:t.cwd || '', status:t.status?.type || 'unknown', turn:null, direct:t.canAcceptDirectInput === true};
    if (['idle','active'].includes(state.status)) {
      const page = await this.turns(id,1);
      if (!Array.isArray(page.data) || page.data.some(t => !['completed','interrupted','failed','inProgress'].includes(t.status))) throw new Error('无法可靠取得会话回合状态。');
      const active = page.data.filter(t => t.status === 'inProgress');
      if (active?.length === 1 && active[0].id) { state.status = 'active'; state.turn = active[0].id; }
    }
    return state;
  }
  async turns(id, limit = 8) {
    try { return await this.rpc.request('thread/turns/list',{threadId:id,limit,sortDirection:'desc',itemsView:'full'}); }
    catch(e) {
      if (e.code !== -32601) throw e;
      const r = await this.rpc.request('thread/read',{threadId:id,includeTurns:true});
      if (r.thread?.id !== id || !Array.isArray(r.thread.turns)) throw new Error('无法可靠取得会话回合状态。');
      return {data:r.thread.turns.slice(-limit).reverse()};
    }
  }
  writable(s) {
    if (!['idle','active'].includes(s.status) || !s.direct || !s.cwd || (s.status === 'active' && !s.turn)) {
      throw new Error('无法确认目标会话可写状态。请在同一共享 App Server 打开会话后重试；未执行写操作。');
    }
  }
  async resume(id) {
    this.requireWork();
    let state = await this.inspect(id); this.writable(state);
    if (!this.loaded.has(id)) {
      // No cwd/model/instructions/approval overrides: preserve the original thread.
      const r = await this.rpc.request('thread/resume',{threadId:id,excludeTurns:true});
      if (r.thread?.id !== id) throw new Error('恢复会话返回了不同 ID，已停止。');
      this.loaded.add(id);
      state = await this.inspect(id); this.writable(state);
    }
    return state;
  }
  async attach(chat, id) {
    this.requireWork();
    return this.exclusive(id, async () => {
      const state = await this.resume(id);
      this.store.bindThread(chat,state);
      return state;
    });
  }
  detach(chat) { this.store.detachThread(chat); }
  async status(chat) {
    const b = this.store.binding(chat); if (!b) return null;
    if (this.permission() === 'off') throw new Error('外部读取已关闭，请 /detach。');
    const s = await this.inspect(b.thread); this.store.updateBinding(chat,s); return s;
  }
  target(chat) {
    this.requireWork(); const b = this.store.binding(chat);
    if (!b || this.store.chat(chat).thread !== b.thread) throw new Error('请先 /attach 绑定外部会话。');
    return b.thread;
  }
  async send(chat, input, clientUserMessageId, before = async () => {}) {
    const id = this.target(chat);
    return this.exclusive(id, async () => {
      const s = await this.resume(id); this.store.updateBinding(chat,s);
      await before(s);
      // Re-read after UI work; never issue turn/start on a known active turn.
      const current = await this.inspect(id); this.writable(current);
      if (current.status === 'active') {
        const r = await this.rpc.request('turn/steer',{threadId:id,expectedTurnId:current.turn,input,clientUserMessageId});
        const turnId = r.turnId || current.turn;
        this.store.updateBinding(chat,{...current,status:'active',turn:turnId});
        return {kind:'steer',turnId};
      }
      const r = await this.rpc.request('turn/start',{threadId:id,input,clientUserMessageId});
      if (!r.turn?.id) throw new Error('Codex 未返回 Turn ID；状态不确定，请先 /thread，勿自动重试。');
      this.store.updateBinding(chat,{...current,status:'active',turn:r.turn.id});
      return {kind:'start',turnId:r.turn.id};
    });
  }
  async interrupt(chat) {
    const id = this.target(chat);
    return this.exclusive(id,async () => {
      const s = await this.resume(id); this.store.updateBinding(chat,s);
      if (s.status === 'idle') return false;
      await this.rpc.request('turn/interrupt',{threadId:id,turnId:s.turn}); return true;
    });
  }
  async fork(chat) {
    const id = this.target(chat);
    return this.exclusive(id,async () => {
      const s = await this.resume(id);
      const r = await this.rpc.request('thread/fork',{threadId:id,excludeTurns:true,deferGoalContinuation:true,
        ...(s.status === 'active' ? {beforeTurnId:s.turn} : {})});
      if (!r.thread?.id || r.thread.id === id) throw new Error('分支返回无效会话，绑定未改变。');
      let target;
      try { target = await this.inspect(r.thread.id); this.writable(target); }
      catch { throw new Error(`分支已创建：${r.thread.id}，但无法确认其状态；原绑定保留，请先检查该分支，勿重复创建。`); }
      this.store.bindThread(chat,target,'external-fork'); this.loaded.add(target.id);
      return target;
    });
  }
  disconnected() { this.loaded.clear(); this.store.invalidateBindings(); }
}
