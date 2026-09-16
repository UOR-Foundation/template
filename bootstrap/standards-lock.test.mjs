import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {bindStandardsLock} from './standards-lock.mjs';

test('absent standards lock receives exact SDK bytes and matching bytes remain unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'template-standards-lock-'));
  try {
    const path = join(directory, 'standards.lock');
    const expected = Buffer.from('synthetic SDK standards bytes\n');
    await bindStandardsLock(path, expected);
    assert.deepEqual(await readFile(path), expected);
    await bindStandardsLock(path, expected);
    assert.deepEqual(await readFile(path), expected);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('different project standards bytes are rejected without replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'template-standards-lock-'));
  try {
    const path = join(directory, 'standards.lock');
    const existing = Buffer.from('a different project standards choice');
    await writeFile(path, existing);
    await assert.rejects(() => bindStandardsLock(path, Buffer.from('selected SDK standards')),
      /review the standards change explicitly/);
    assert.deepEqual(await readFile(path), existing);
  } finally { await rm(directory, {recursive: true, force: true}); }
});
