import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';

// Initial bootstrap binds the real selected SDK bytes. An existing project's
// standards choice requires explicit review; never silently replace it.
export async function bindStandardsLock(path, expected) {
  let existing;
  try { existing = await readFile(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing !== undefined) {
    assert.deepEqual(existing, expected, 'existing standards.lock differs from the selected SDK; review the standards change explicitly');
  } else {
    await writeFile(path, expected, {flag: 'wx'});
  }
}
