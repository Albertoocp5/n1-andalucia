// Servidor local: ejecuta dist/server/index.js con un BUCKET de prueba en disco.
// Uso: node dev/serve.mjs [--port 8787] [--seed]   (--seed reinicia el almacenamiento
// con el estado publicado guardado en ../estado-web-publicada)
import http from 'node:http';
import { readFile, rm, watch } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileBucket } from './bucket.mjs';

const root = path.join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8787;
const storeDir = path.join(root, '.local-bucket');
const tokenFile = path.join(root, '.fab-import-token-local');
if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString('hex'));
const env = { FAB_IMPORT_TOKEN: readFileSync(tokenFile, 'utf8').trim() };

if (args.includes('--seed')) {
  await rm(storeDir, { recursive: true, force: true });
  const bucket = fileBucket(storeDir);
  const published = path.join(root, '..', 'estado-web-publicada');
  const season = JSON.parse(await readFile(path.join(published, 'temporada-publicada.json'), 'utf8'));
  const groups = {};
  for (const g of season.games) {
    if (g.source !== 'Afición FAB') continue;
    const id = g.url.split('?')[0].split('/').at(-1);
    (groups[g.group] ||= {})[id] = { score: g.score, status: g.status, round: g.round, box: g.box, verified: g.verified, source: g.source, checkedAt: g.checkedAt };
  }
  for (const [group, items] of Object.entries(groups)) await bucket.put('fab/group-' + group + '.json', JSON.stringify(items));
  const scores = JSON.parse(await readFile(path.join(published, 'marcadores-publicados.json'), 'utf8'));
  for (const [group, record] of Object.entries(scores)) await bucket.put('scores/' + group + '.json', JSON.stringify({ ...record, lastCheck: new Date().toISOString() }));
  const predictions = JSON.parse(await readFile(path.join(published, 'pronosticos-publicados.json'), 'utf8'));
  for (const p of predictions.slice(1)) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(p.at));
    await bucket.put('predictions/' + day + '.json', JSON.stringify(p));
  }
  console.log('Almacenamiento de prueba sembrado:', Object.keys(groups).map(g => g + ':' + Object.keys(groups[g]).length).join(' '), '· pronósticos', predictions.length - 1);
}

const bucket = fileBucket(storeDir);
env.BUCKET = bucket;
let worker;
async function load() {
  execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
  worker = (await import(pathToFileURL(path.join(root, 'dist/server/index.js')) + '?t=' + Date.now())).default;
}
await load();

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
  const url = 'http://localhost:' + port + req.url;
  const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  if (!req.url.startsWith('/api/jugadas-fab?')) console.log(req.method, req.url, response.status);
}).listen(port, () => console.log('Web local en http://localhost:' + port));

// Recompila al cambiar el código para ver los cambios al recargar.
let timer;
for (const dir of ['web', '.']) {
  (async () => {
    for await (const e of watch(path.join(root, dir))) {
      if (!/\.(m?js|html|css|json)$/.test(e.filename || '') || dir === '.' && !/\.mjs$/.test(e.filename)) continue;
      clearTimeout(timer);
      timer = setTimeout(() => load().then(() => console.log('Recompilado')).catch(err => console.error(err.message)), 200);
    }
  })();
}
