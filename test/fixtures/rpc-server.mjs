import { createInterface } from 'node:readline';
const send = obj => process.stdout.write(JSON.stringify(obj) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'test' } });
  if (m.method === 'echo') setTimeout(() => send({ id: m.id, result: m.params }), m.params.delay || 0);
  if (m.method === 'error') send({ id: m.id, error: { code: -1, message: 'test error' } });
  if (m.method === 'emit') {
    send({ method: 'item/started', params: { threadId: 't' } });
    send({ id: 'server-1', method: 'item/tool/call', params: {} });
    send({ id: m.id, result: {} });
  }
  if (m.method === 'exit') process.exit(1);
});
