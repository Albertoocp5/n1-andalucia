// Exporta la web a archivos estáticos (GitHub Pages, cualquier hosting estático).
// Ejecuta el Worker compilado contra el almacenamiento local (.local-bucket) y guarda
// cada página, recurso y respuesta de la API como archivo. Uso:
//   node scripts/build.mjs && node dev/exportar.mjs ../docs
import { mkdir, rm, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileBucket } from './bucket.mjs';

const root = path.join(import.meta.dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, '..', 'docs'));
const worker = (await import(pathToFileURL(path.join(root, 'dist/server/index.js')) + '?t=' + Date.now())).default;
const env = { BUCKET: fileBucket(path.join(root, '.local-bucket')) };
const get = async route => {
  const r = await worker.fetch(new Request('http://local' + route), env);
  return r.ok ? r.text() : null;
};

// Traductor de la API: mismo comportamiento que el Worker, leyendo archivos estáticos.
const SHIM = `<script>(()=>{const f=window.fetch.bind(window),base=new URL('./',document.baseURI);
const map=u=>{const x=new URL(u,location.href);if(x.origin!==location.origin)return null;const p=x.pathname,q=x.searchParams,id=q.get('partido');
if(p.endsWith('/api/avanzadas'))return id?'api/avanzadas/partidos/'+id+'.json':q.has('tiros')?'api/avanzadas-tiros.json':'api/avanzadas.json';
if(p.endsWith('/api/jugadas-fab'))return id?'api/jugadas/'+id+'.json':null;
if(p.endsWith('/api/results-saved')||p.endsWith('/api/results'))return 'api/results-saved.json';
if(p.endsWith('/api/sync-status'))return 'api/sync-status.json';
if(p.endsWith('/api/pronosticos'))return 'api/pronosticos.json';
if(p.endsWith('/api/articles'))return 'api/no-disponible.json';return null};
window.fetch=(u,o)=>{const s=typeof u==='string'?u:u?.url;const m=s&&(!o||!o.method||o.method==='GET')?map(s):null;return f(m?new URL(m,base).href:u,o)}})();</script>`;

// Rutas absolutas → relativas (la web vive en una subcarpeta en GitHub Pages).
const relative = text => text
  .replace(/(["'`])\/\?/g, '$1./index.html?')
  .replace(/href=(["'])\/\1/g, 'href=$1./$1')
  .replace(/(["'`(])\/(?=[A-Za-z0-9_.-]+\.(?:html|js|css|json)\b|api\/|#)/g, '$1./');

// Escritura estable: un archivo solo se reescribe si cambia algo más que sus marcas de hora,
// para que el repositorio no acumule cambios vacíos en cada actualización.
await mkdir(path.join(out, 'api/avanzadas/partidos'), { recursive: true });
await mkdir(path.join(out, 'api/jugadas'), { recursive: true });
const written = new Set();
const strip = t => t.replace(/"(checkedAt|lastCheck|lastGood|lastFull)":"[^"]*"/g, '');
const write = async (file, text) => {
  written.add(file);
  const target = path.join(out, file);
  const old = await readFile(target, 'utf8').catch(() => null);
  if (old != null && strip(old) === strip(text)) return;
  await writeFile(target, text);
};

let pages = 0, assets = 0;
for (const file of await readdir(path.join(root, 'web'))) {
  if (!/\.(html|js|css|json)$/.test(file)) continue;
  let text = await get('/' + file);
  if (text == null) continue;
  if (file.endsWith('.html')) { text = relative(text).replace(/<head>/i, '<head>' + SHIM); pages++; }
  else if (file.endsWith('.js') || file.endsWith('.css')) { text = relative(text); assets++; }
  await write(file, text);
}
// Respuestas dinámicas del Worker
await write('season.json', await get('/season.json'));
await write('n1-data.js', relative(await get('/n1-data.js')));
for (const [route, file] of [['/api/results-saved', 'api/results-saved.json'], ['/api/sync-status', 'api/sync-status.json'],
  ['/api/pronosticos', 'api/pronosticos.json'], ['/api/avanzadas', 'api/avanzadas.json'], ['/api/avanzadas?tiros=1', 'api/avanzadas-tiros.json']]) {
  const text = await get(route);
  if (text != null) await write(file, text);
}
await write('api/no-disponible.json', JSON.stringify({ error: 'No disponible en la versión estática.' }));
const season = JSON.parse(await get('/season.json'));
let advanced = 0, plays = 0;
for (const g of season.games) {
  const id = g.url.split('?')[0].split('/').at(-1);
  const a = await get('/api/avanzadas?partido=' + id);
  if (a) { await write('api/avanzadas/partidos/' + id + '.json', a); advanced++; }
  const j = await get('/api/jugadas-fab?partido=' + id);
  if (j) { await write('api/jugadas/' + id + '.json', j); plays++; }
}
await write('.nojekyll', '');
await write('404.html', '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./"><title>N1 Andalucía</title></head><body><a href="./">Ir a la portada</a></body></html>');
// borrar lo que ya no se exporta
const walk = async dir => (await readdir(dir, { withFileTypes: true })).flatMap(e => e.isDirectory() ? [] : [path.relative(out, path.join(dir, e.name))]);
for (const dir of [out, path.join(out, 'api'), path.join(out, 'api/avanzadas/partidos'), path.join(out, 'api/jugadas')])
  for (const file of await walk(dir)) if (!written.has(file)) await rm(path.join(out, file));
console.log(`Exportado en ${out}: ${pages} páginas, ${assets} recursos, ${advanced} informes avanzados, ${plays} jugadas a jugada.`);
