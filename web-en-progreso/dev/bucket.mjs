// Almacenamiento de prueba en disco con la misma interfaz que el BUCKET de Sites
// (get/put/head/list con condiciones onlyIf por etag). Solo para uso local.
import { mkdir, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function fileBucket(dir) {
  const file = key => path.join(dir, 'objects', encodeURIComponent(key));
  const metaFile = key => file(key) + '.meta';
  const object = async key => {
    try {
      const body = await readFile(file(key), 'utf8');
      const meta = JSON.parse(await readFile(metaFile(key), 'utf8'));
      return { key, body, ...meta };
    } catch { return null; }
  };
  const wrap = o => o && {
    key: o.key, etag: o.etag, customMetadata: o.customMetadata || {}, uploaded: new Date(o.uploaded),
    text: async () => o.body, json: async () => JSON.parse(o.body),
  };
  return {
    async get(key) { return wrap(await object(key)); },
    async head(key) { const o = await object(key); return o && { key, etag: o.etag, customMetadata: o.customMetadata || {} }; },
    async put(key, value, options = {}) {
      const old = await object(key);
      const cond = options.onlyIf;
      if (cond?.etagMatches && old?.etag !== cond.etagMatches) return null;
      if (cond?.etagDoesNotMatch === '*' && old) return null;
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      const meta = { etag: createHash('md5').update(body).digest('hex') + Date.now().toString(36),
        customMetadata: options.customMetadata || {}, uploaded: new Date().toISOString() };
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), body);
      await writeFile(metaFile(key), JSON.stringify(meta));
      return { key, etag: meta.etag };
    },
    async delete(key) { await rm(file(key), { force: true }); await rm(metaFile(key), { force: true }); },
    async list({ prefix = '' } = {}) {
      let names = [];
      try { names = await readdir(path.join(dir, 'objects')); } catch {}
      const keys = names.filter(n => !n.endsWith('.meta')).map(decodeURIComponent).filter(k => k.startsWith(prefix)).sort();
      const objects = await Promise.all(keys.map(async key => {
        const o = await object(key);
        return { key, etag: o?.etag, customMetadata: o?.customMetadata || {}, size: (await stat(file(key))).size };
      }));
      return { objects, truncated: false };
    },
  };
}
