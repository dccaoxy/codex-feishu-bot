import assert from 'node:assert/strict';

// Match transport call IDs first, then expectations by namespace/name. The
// adversarial call list may grow or results may arrive in a different order.
export function assertProbeOutputs(calls, outputs, {knowledge = false} = {}) {
  assert.equal(outputs.length, calls.length);
  const pending = new Map(calls.map((call, i) => [`call${i + 1}`, call]));
  for (const output of outputs) {
    const call = pending.get(output.call_id);
    assert.ok(call, 'Unexpected or duplicate probe output');
    pending.delete(output.call_id);
    assert.equal(typeof output.output, 'string');
    if (call.namespace === 'skills' && call.name === 'list') {
      if (output.output.trimStart().startsWith('{')) assert.deepEqual(JSON.parse(output.output).skills, []);
      else assert.match(output.output, /unsupported|not found|unknown/i);
    } else if (call.namespace === 'skills' && call.name === 'read') {
      assert.match(output.output, /error|invalid|not found|not available|unknown|failed|unsupported/i);
    } else if (!call.namespace && call.name === 'group_search' && !knowledge) {
      assert.match(output.output, /GROUP_ALLOWED_TOOL_OK/);
    } else {
      assert.match(output.output, /unsupported|not found|unknown/i);
    }
  }
  assert.equal(pending.size, 0);
}
