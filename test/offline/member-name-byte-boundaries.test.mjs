import test from 'node:test';
import assert from 'node:assert/strict';
import {memberNames} from '../../src/member-names.mjs';

// Entire transport is synthetic; no SDK client or live Feishu connection.
async function lookup(names) {
  const ids = names.map((_, i) => `synthetic_member_${i}`);
  let calls = 0;
  const feishu = {
    call: async (fn, retry, guard) => { guard(); return fn(); },
    client: {im: {v1: {chatMembers: {get: async request => {
      calls++;
      assert.deepEqual(request, {
        path: {chat_id: 'synthetic_group'},
        params: {member_id_type: 'open_id', page_size: 100},
      });
      return {
        items: names.map((name, i) => ({member_id_type: 'open_id', member_id: ids[i], name})),
        has_more: false,
      };
    }}}}},
  };
  const result = await memberNames(feishu, 'synthetic_group', new Set(ids), () => {});
  assert.equal(calls, 1);
  assert.equal(result.status, 'complete');
  assert.deepEqual([...result.conflicts], []);
  return {result, ids};
}

for (const [label, accepted, rejected] of [
  ['ASCII', 'A'.repeat(200), 'A'.repeat(201)],
  ['CJK plus ASCII', '名'.repeat(66) + 'ab', '名'.repeat(67)],
  ['supplementary-plane characters', '😀'.repeat(50), '😀'.repeat(50) + 'a'],
]) {
  test(`memberNames accepts exactly 200 UTF-8 bytes and ignores overflow: ${label}`, async () => {
    assert.equal(Buffer.byteLength(accepted, 'utf8'), 200);
    assert.equal(Buffer.byteLength(rejected, 'utf8'), 201);
    const {result, ids} = await lookup([accepted, rejected]);
    assert.equal(result.names.get(ids[0]), accepted);
    assert.equal(result.names.has(ids[1]), false);
    assert.equal(result.names.get(ids[1]), undefined);
    assert.deepEqual([...result.names], [[ids[0], accepted]]);
  });
}

test('memberNames ignores empty and whitespace-only display names', async () => {
  const {result, ids} = await lookup(['', '   ', '\t\r\n', '\u3000\u00a0']);
  for (const id of ids) {
    assert.equal(result.names.has(id), false);
    assert.equal(result.names.get(id), undefined);
  }
  assert.equal(result.names.size, 0);
});

test('memberNames preserves surrounding whitespace and original Unicode spelling', async () => {
  const name = ' \t名 e\u0301 😀\u3000\n';
  assert.ok(Buffer.byteLength(name, 'utf8') <= 200);
  assert.notEqual(name, name.trim());
  assert.notEqual(name, name.normalize('NFC'));
  const {result, ids} = await lookup([name]);
  assert.equal(result.names.get(ids[0]), name);
  assert.deepEqual([...result.names], [[ids[0], name]]);
});

test('memberNames counts surrounding whitespace in the UTF-8 byte limit', async () => {
  const accepted = ' ' + '名'.repeat(66) + '\t';
  const rejected = accepted + ' ';
  assert.equal(Buffer.byteLength(accepted, 'utf8'), 200);
  assert.equal(Buffer.byteLength(rejected, 'utf8'), 201);
  assert.equal(Buffer.byteLength(rejected.trim(), 'utf8'), 198);
  const {result, ids} = await lookup([accepted, rejected]);
  assert.equal(result.names.get(ids[0]), accepted);
  assert.equal(result.names.has(ids[1]), false);
  assert.equal(result.names.get(ids[1]), undefined);
  assert.deepEqual([...result.names], [[ids[0], accepted]]);
});
