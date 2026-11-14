/**
 * prism-code/node — Node-only conveniences: open an application from a path and
 * serve its view with the `/_hologram/intent` endpoint a HOLOVIEW page posts to
 * (hologram-live `hologram-view-surface`: `application.invoke`, at most 16
 * outputs).
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadArchive, loadClosure } from './index.mjs';
import { fail } from './errors.mjs';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.holo': 'application/octet-stream',
};

function toPath(source) {
  if (source instanceof URL) return fileURLToPath(source);
  if (typeof source === 'string' && source.startsWith('file:')) return fileURLToPath(source);
  return resolve(source);
}

/** Read a closure directory into a file map (regular files at the top level only). */
export async function readClosureDirectory(directory) {
  const files = new Map();
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    if ((await stat(path)).isFile()) files.set(name, new Uint8Array(await readFile(path)));
  }
  return files;
}

/** Open a `.holo` file or a closure directory. */
export async function fromFile(source, options = {}) {
  const path = toPath(source);
  const info = await stat(path).catch(() => fail('load.path', `${path} does not exist`));
  if (info.isDirectory()) {
    const files = await readClosureDirectory(path);
    let model = options.model ?? null;
    if (typeof model === 'string') model = JSON.parse(await readFile(toPath(model), 'utf8'));
    return loadClosure(files, (name) => import(pathToFileURL(join(path, name)).href), { model });
  }
  return loadArchive(new Uint8Array(await readFile(path)));
}

const INTENT_VERSION = 1;
const INTENT_NAME = 'application.invoke';
const MAX_INTENT_OUTPUTS = 16;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();

function readBody(request, limit) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/**
 * Serve `app.view` as static files and answer `POST /_hologram/intent` by
 * dispatching the payload. Resolves to `{ server, url, close }`.
 */
export async function serve(app, { port = 0, host = '127.0.0.1' } = {}) {
  const files = app.view.files;
  const entry = app.view.entry ?? 'index.html';
  const bodyLimit = 65536 + (app.limits?.request ?? 65536);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'POST' && url.pathname === '/_hologram/intent') {
      let outputs;
      try {
        const body = JSON.parse((await readBody(request, bodyLimit)).toString('utf8'));
        if (body.version !== INTENT_VERSION || body.name !== INTENT_NAME || typeof body.payload !== 'string') {
          throw new Error('not an application.invoke intent');
        }
        const result = await app.dispatch(encoder.encode(body.payload));
        outputs = [decoder.decode(result)].slice(0, MAX_INTENT_OUTPUTS);
      } catch (error) {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ version: INTENT_VERSION, error: String(error.message ?? error) }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ version: INTENT_VERSION, outputs }));
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const name = url.pathname === '/' ? entry : decodeURIComponent(url.pathname.slice(1));
    const content = files.get(name);
    if (!content) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(name)] ?? 'application/octet-stream',
      'content-length': content.length,
      'cache-control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : Buffer.from(content));
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListen);
  });
  const address = server.address();
  const urlOf = `http://${host}:${address.port}/`;
  return {
    server,
    url: urlOf,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  };
}
