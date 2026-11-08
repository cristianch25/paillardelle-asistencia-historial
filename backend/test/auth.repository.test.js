import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';

test('el repositorio usa únicamente SELECT parametrizado sin interpolar credenciales', async () => {
  const calls = [];
  const repository = createAuthRepository(() => ({
    async execute(sql, values) {
      calls.push({ sql, values });
      return [[]];
    },
  }));
  const username = "' OR 1=1 --";
  assert.equal(await repository.findByUsername(username), null);
  assert.equal(await repository.findById('9007199254740993'), null);
  for (const call of calls) {
    assert.match(call.sql, /^SELECT /);
    assert.match(call.sql, /FROM usuarios WHERE (usuario|id) = \? LIMIT 1$/);
    assert.equal(call.sql.includes(username), false);
  }
  assert.deepEqual(calls[0].values, [username]);
  assert.deepEqual(calls[1].values, ['9007199254740993']);
  assert.equal(calls[1].sql.includes('password_hash'), false);
});
