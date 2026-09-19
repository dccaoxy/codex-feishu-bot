import { loadConfig } from '../src/config.mjs';
import { CodexClient } from '../src/codex.mjs';
import { TOOLS } from '../src/history.mjs';

// A real local protocol check, no model invocation and no Feishu requests.
const config = loadConfig(undefined, false);
const rpc = new CodexClient(config.codex.binary, {url: config.codex.appServerUrl, socketPath: config.codex.appServerSocket});
try {
  await rpc.start();
  const r = await rpc.request('thread/start', { cwd: config.codex.cwd, ephemeral: true,
    sandbox: 'read-only', approvalPolicy: 'on-request', dynamicTools: TOOLS });
  if (!r.thread?.id) throw new Error('No thread ID returned');
  const loaded = await rpc.request('thread/loaded/list', {});
  if (!loaded.data.includes(r.thread.id)) throw new Error('Ephemeral thread not loaded');
  console.log('✓ Real Codex initialize / model-independent ephemeral thread / dynamic tools registration passed.');
} finally { await rpc.close(); }
