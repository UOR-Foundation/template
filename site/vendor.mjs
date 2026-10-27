// Vendors the exact prism-code release the try page runs, so the page loads
// every byte from its own origin. `node vendor.mjs` re-creates the copy;
// `node vendor.mjs --check` fails if the committed copy differs from npm.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.2.0';
const INTEGRITY = 'sha512-LBjO3WVy0ZHiWUjgAveUJoT6Fz7u+Oh0IEQyNXldX76jFMkOU44wnL0tp46Xx4/p1QLh8gItYGVRIvaPSW/a8g==';

const here = dirname(fileURLToPath(import.meta.url));
const vendor = `vendor/prism-code-${VERSION}`;

function files(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, base, out);
    else out.push([relative(base, path).split(sep).join('/'), readFileSync(path)]);
  }
  return out;
}

const scratch = mkdtempSync(join(tmpdir(), 'prism-code-'));
try {
  const windows = process.platform === 'win32';
  const [{ filename }] = JSON.parse(
    execFileSync(windows ? 'npm.cmd' : 'npm', ['pack', `prism-code@${VERSION}`, '--json', '--pack-destination', scratch], {
      encoding: 'utf8',
      shell: windows,
    }),
  );
  const tarball = join(scratch, filename);
  const actual = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
  if (actual !== INTEGRITY) throw new Error(`prism-code@${VERSION} tarball is ${actual}, expected ${INTEGRITY}`);
  execFileSync('tar', ['-xzf', filename], { cwd: scratch });
  const pkg = join(scratch, 'package');

  // Published path (relative to site/) -> bytes.
  const expected = new Map();
  for (const [name, bytes] of files(join(pkg, 'src'))) expected.set(`${vendor}/src/${name}`, bytes);
  expected.set(`${vendor}/LICENSE`, readFileSync(join(pkg, 'LICENSE')));
  expected.set('Calculator.holo', readFileSync(join(pkg, 'fixtures', 'Calculator.holo')));

  if (process.argv.includes('--check')) {
    const present = new Set(files(join(here, vendor)).map(([name]) => `${vendor}/${name}`));
    for (const [path, bytes] of expected) {
      let have = null;
      try {
        have = readFileSync(join(here, path));
      } catch {}
      if (!have || !have.equals(bytes)) throw new Error(`${path} differs from prism-code@${VERSION}`);
      present.delete(path);
    }
    present.delete('Calculator.holo');
    if (present.size) throw new Error(`unexpected files in ${vendor}: ${[...present].join(', ')}`);
    console.log(`site/ matches prism-code@${VERSION} (${expected.size} files)`);
  } else {
    rmSync(join(here, vendor), { recursive: true, force: true });
    for (const [path, bytes] of expected) {
      mkdirSync(dirname(join(here, path)), { recursive: true });
      writeFileSync(join(here, path), bytes);
    }
    console.log(`vendored prism-code@${VERSION}: ${expected.size} files`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
