import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.join(import.meta.dirname,'..');
const assets = {};
for (const file of await readdir(path.join(root,'web'))) {
  if (!/\.(html|js|css|json)$/.test(file)) continue;
  assets['/'+file] = await readFile(path.join(root,'web',file),'utf8');
}
const server = (await readFile(path.join(root,'web/model.js'),'utf8')).replace('export function forecast','function forecast')+'\n'+(await readFile(path.join(root,'actas.mjs'),'utf8'))+'\n'+(await readFile(path.join(root,'fab.mjs'),'utf8'))+'\n'+(await readFile(path.join(root,'server.mjs'),'utf8'));
await mkdir(path.join(root,'dist/server'),{recursive:true});
await mkdir(path.join(root,'dist/.openai'),{recursive:true});
await writeFile(path.join(root,'dist/server/index.js'),'const assets = '+JSON.stringify(assets)+';\n'+server);
await copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
