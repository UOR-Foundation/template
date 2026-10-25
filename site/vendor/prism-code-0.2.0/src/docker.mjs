/**
 * Delegation of the compiling commands to the digest-pinned SDK image named by
 * the project's `prismpm.lock`. The invocation is the one
 * UOR-Foundation/template's `bootstrap.yml` uses, minus the Docker socket and
 * Buildx lines, which only `build` needs. Pure functions here; `bin/` spawns.
 */
import { fail } from './errors.mjs';

/** The template's admission test for an immutable SDK image reference. */
export const SDK_IMAGE_PATTERN = /^[a-z0-9.-]+(:[0-9]{1,5})?\/[a-z0-9./_-]+@sha256:[0-9a-f]{64}$/;

export const CONTAINER_HOME = '/tmp/prismpm-home';
export const WINDOWS_WORKDIR = '/work';

/** Read `sdk_image` from a `prismpm.lock` text and admit only an immutable reference. */
export function sdkImageFromLock(lockText) {
  let image;
  try {
    image = JSON.parse(lockText).sdk_image;
  } catch {
    const match = /"sdk_image"\s*:\s*"([^"]*)"/.exec(lockText);
    image = match ? match[1] : undefined;
  }
  if (typeof image !== 'string' || !SDK_IMAGE_PATTERN.test(image)) {
    fail('lock.image', 'prismpm.lock does not select an immutable SDK image', { image });
  }
  return image;
}

/**
 * Build the `docker run` argument list for one `prismpm` command.
 *
 * `cwd` is the project directory. On POSIX hosts it is mounted at the same
 * path so paths in diagnostics match the host; on Windows it is mounted at
 * `/work`. `uid`/`gid` are omitted when unknown (Windows).
 */
export function dockerArguments({
  image,
  cwd,
  command,
  args = [],
  uid = null,
  gid = null,
  platform = process.platform,
  build = false,
  dockerSocket = '/var/run/docker.sock',
  dockerSocketGid = null,
}) {
  if (!SDK_IMAGE_PATTERN.test(image)) fail('lock.image', `not an immutable SDK image: ${image}`);
  const workdir = platform === 'win32' ? WINDOWS_WORKDIR : cwd;
  const out = ['run', '--rm'];
  if (uid !== null && gid !== null && uid >= 0 && gid >= 0) out.push('--user', `${uid}:${gid}`);
  if (build && dockerSocketGid !== null) out.push('--group-add', String(dockerSocketGid));
  out.push('--tmpfs', '/tmp:rw,exec,nosuid,size=2g');
  out.push('--volume', `${cwd}:${workdir}`);
  if (build) out.push('--volume', `${dockerSocket}:${dockerSocket}`);
  out.push('--workdir', workdir);
  out.push('--env', `HOME=${CONTAINER_HOME}`);
  out.push('--env', 'PRISMPM_EPHEMERAL_HOME=1');
  if (build) out.push('--env', `SDK_IMAGE=${image}`);
  out.push(image, 'prismpm', command, ...args);
  return out;
}

/** Commands this CLI delegates to the image, and whether they need the Docker socket. */
export const DELEGATED = Object.freeze({
  check: { build: false },
  build: { build: true },
  verify: { build: true },
  conformance: { build: false },
  inspect: { build: false },
  'export-browser': { build: false },
  'lock': { build: false },
  'template': { build: false },
});
