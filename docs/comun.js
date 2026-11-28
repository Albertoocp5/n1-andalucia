// Piezas comunes a todas las páginas: menú, modo Aficionado/Analista, explicaciones emergentes,
// comparador, nombres legibles y puestos («3.º de 142»).
import { term } from './glosario.js';

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- Nombres legibles ----------
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el', 'en']);
const KEEP = new Set(['CB', 'CD', 'CDB', 'BC', 'PC', 'SD', 'EBG', 'GMASB', 'UCAL', 'CAB', 'FCBG', 'MCD', 'CBA', 'ADB', 'AD', 'UD', 'CF', 'II', 'III', 'SAFA', 'FAB']);
const cap = (w, first) => {
  if (!w) return w;
  if (KEEP.has(w.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '')) && w === w.toUpperCase()) return w;
  if (/\./.test(w) || /^[^AEIOUÁÉÍÓÚÜaeiouáéíóúü]+$/.test(w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')) && /[A-Z]/.test(w)) return w;
  const low = w.toLocaleLowerCase('es');
  if (!first && SMALL.has(low)) return low;
  return low.replace(/(^|[-'(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es'));
};
const title = s => String(s ?? '').split(/\s+/).map((w, i) => cap(w, i === 0)).join(' ');
/** «RAMOS RODRIGUEZ, JOSE CARLOS» → «Jose Carlos Ramos Rodriguez» */
export function jugador(s) {
  if (!s) return '';
  const [ap, no] = String(s).split(',').map(x => x.trim());
  return title(no ? no + ' ' + ap : ap);
}
/** «CB LEPE ALIUS EL JAMÓN» → «CB Lepe Alius el Jamón» */
export const equipo = s => title(s).replace(/^(\p{Ll})/u, c => c.toLocaleUpperCase('es'));

// ---------- Escudos y fotos (Afición FAB, índice medios.json) ----------
export const clave = s => String(s ?? '').normalize('NFD').toUpperCase().replace(/[^A-Z0-9]/g, '');
let medios = null;
const cargarMedios = () => medios ??= fetch('./medios.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
const ponerImagen = (box, ruta, alt) => {
  if (!ruta) return;
  const img = new Image(); img.alt = alt || ''; img.loading = 'lazy'; img.decoding = 'async';
  img.onload = () => box.classList.add('con-img'); img.onerror = () => img.remove();
  img.src = new URL(ruta, document.baseURI).href; box.prepend(img);
};
/** Escudo del equipo (vacío y sin hueco si no hay). tam: 's' | 'm' | 'l' */
export function escudo(nombreEquipo, tam = 's') {
  const box = el('span', null, 'escudo escudo-' + tam); box.setAttribute('aria-hidden', 'true');
  cargarMedios().then(m => { const r = m.escudos?.[clave(nombreEquipo)]; if (r) ponerImagen(box, r); else box.remove(); });
  return box;
}
/** Foto del jugador o, si la federación no tiene, sus iniciales con el escudo de su equipo. */
export function avatar(nombreActa, nombreEquipo, tam = 's') {
  const box = el('span', null, 'avatar avatar-' + tam); box.setAttribute('aria-hidden', 'true');
  const [ap, no] = String(nombreActa || '').split(',').map(x => x.trim());
  box.append(el('b', ((no || '')[0] || '') + ((ap || '')[0] || '')));
  cargarMedios().then(m => {
    ponerImagen(box, m.fotos?.[clave(nombreEquipo) + '|' + clave(nombreActa)]);
    const e = m.escudos?.[clave(nombreEquipo)];
    if (e && tam !== 'xs') { const mini = el('i'); ponerImagen(mini, e); box.append(mini); }
  });
  return box;
}

// ---------- Puestos ----------
/** Puesto (1 = mejor) y tamaño de la población; null si no hay dato. */
export function puesto(values, v, higher = true) {
  if (v == null || !Number.isFinite(v)) return null;
  const xs = values.filter(x => x != null && Number.isFinite(x));
  if (!xs.length) return null;
  const better = xs.filter(x => higher ? x > v : x < v).length;
  const worse = xs.filter(x => higher ? x < v : x > v).length;
  return { pos: better + 1, n: xs.length, mejorQue: Math.round(100 * worse / Math.max(1, xs.length - 1)) };
}
/** Muestra mínima para entrar en los puestos: ~8 minutos por jornada jugada y la mitad de los partidos. */
export function muestra(jugadores) {
  const J = Math.max(1, ...jugadores.map(p => p.pj));
  return { min: 8 * J, pj: Math.ceil(J / 2), J };
}
export const tierPuesto = r => !r ? '' : r.pos / r.n <= 0.1 ? 't-top' : r.pos / r.n <= 0.3 ? 't-good' : r.pos / r.n <= 0.7 ? 't-mid' : r.pos / r.n <= 0.9 ? 't-low' : 't-bottom';

// ---------- Cabecera ----------
// Fila superior: logo, enlaces, buscador, modo, comparador, tema y ayuda.
// Debajo, «Estás viendo» con las secciones de la competición. En móvil, barra inferior.
const TOP = [
  ['Inicio', './index.html', p => p.endsWith('/') || p.endsWith('index.html')],
  ['Comparar', './comparar.html'],
  ['Glosario', './avanzada.html?tab=glosario', (p, q) => q.get('tab') === 'glosario'],
];
const NAV = [
  ['Jornadas', './index.html', p => p.endsWith('/') || p.endsWith('index.html')],
  ['Clasificación', './clasificacion.html'],
  ['Líderes', './lideres.html'],
  ['Jugadores', './avanzada.html?tab=jugadores', (p, q) => p.endsWith('jugador.html') || p.endsWith('avanzada.html') && q.get('tab') === 'jugadores'],
  ['Equipos', './avanzada.html?tab=equipos', (p, q) => p.endsWith('equipo.html') || p.endsWith('avanzada.html') && q.get('tab') === 'equipos'],
  ['Estadística avanzada', './avanzada.html', (p, q) => p.endsWith('avanzada.html') && !['jugadores', 'equipos', 'simulador', 'glosario'].includes(q.get('tab')), 1],
  ['Simulador', './avanzada.html?tab=simulador', (p, q) => q.get('tab') === 'simulador', 1],
  ['Laboratorio', './liga.html', p => p.endsWith('liga.html') || p.endsWith('andalucia.html'), 1],
];
const BOTTOM = [
  ['Inicio', './index.html', p => p.endsWith('/') || p.endsWith('index.html')],
  ['Clasificación', './clasificacion.html'],
  ['Líderes', './lideres.html'],
  ['Comparar', './comparar.html'],
];
function links(list) {
  const p = location.pathname, q = new URLSearchParams(location.search);
  return list.map(([label, href, match, ana]) => {
    const a = el('a', label); a.href = href;
    if (match ? match(p, q) : p.endsWith(href.split('/').pop())) a.setAttribute('aria-current', 'page');
    if (ana) a.classList.add('solo-ana');
    return a;
  });
}
// Tema claro / oscuro
const setTheme = t => { document.documentElement.dataset.theme = t; store.set('n1-tema', t); const b = document.querySelector('.theme-btn'); if (b) { b.textContent = t === 'dark' ? '☀' : '☾'; b.setAttribute('aria-label', t === 'dark' ? 'Modo claro' : 'Modo oscuro'); } };
document.documentElement.dataset.theme = store.get('n1-tema', 'light');
// Buscador global (jugadores y equipos)
let searchData = null;
function globalSearch() {
  const box = el('div', null, 'gsearch');
  const input = el('input'); input.type = 'search'; input.placeholder = 'Buscar jugador o equipo'; input.setAttribute('aria-label', 'Buscar jugador o equipo');
  const out = el('div', null, 'gs-results');
  const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  input.addEventListener('focus', () => { searchData ||= fetch('./api/avanzadas').then(r => r.ok ? r.json() : null).catch(() => null); });
  input.addEventListener('input', async () => {
    const words = norm(input.value.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) { out.replaceChildren(); return; }
    const d = await (searchData ||= fetch('./api/avanzadas').then(r => r.ok ? r.json() : null).catch(() => null));
    if (!d) return;
    const hit = s => words.every(w => norm(s).includes(w));
    const teams = d.equipos.filter(t => hit(t.equipo)).slice(0, 4).map(t => { const a = el('a'); a.href = './equipo.html?n=' + encodeURIComponent(t.equipo); a.append(el('b', equipo(t.equipo)), el('small', 'Equipo · grupo ' + t.grupo)); return a; });
    const players = d.jugadores.filter(p => hit(p.nombre)).sort((a, b) => b.min - a.min).slice(0, 8).map(p => { const a = el('a'); a.href = './jugador.html?id=' + encodeURIComponent(p.id); a.append(el('b', jugador(p.nombre)), el('small', equipo(p.equipo) + ' · grupo ' + p.grupo)); return a; });
    out.replaceChildren(...teams, ...players);
    if (!teams.length && !players.length) out.append(el('p', 'Sin resultados.'));
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') out.querySelector('a')?.click(); if (e.key === 'Escape') { input.value = ''; out.replaceChildren(); } });
  document.addEventListener('click', e => { if (!box.contains(e.target)) out.replaceChildren(); });
  box.append(input, out);
  return box;
}
function renderHeader() {
  const head = document.querySelector('header.masthead');
  if (!head || head.dataset.done) return;
  head.dataset.done = '1';
  const top = el('div', null, 'frame topbar');
  const brand = el('a', null, 'brand'); brand.href = './index.html';
  brand.append(el('span', 'N1', 'logo'), el('span', 'N1 Andalucía'), el('span', 'BETA', 'tag'));
  const tnav = el('nav', null, 'topnav'); tnav.setAttribute('aria-label', 'Principal'); tnav.append(...links(TOP));
  const box = el('div', null, 'modo-switch'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Modo de vista');
  for (const [m, label, tipText] of [['aficionado', 'Aficionado', 'Resultados, clasificación, líderes y lo básico de cada jugador y equipo.'], ['analista', 'Analista', 'Todas las métricas: ratings, cuatro factores, quintetos, impacto en pista y simulador.']]) {
    const b = el('button', label); b.type = 'button'; b.dataset.m = m; b.dataset.tipText = tipText;
    b.setAttribute('aria-pressed', String(modo() === m)); b.onclick = () => setModo(m);
    box.append(b);
  }
  const cmp = el('a', null, 'head-btn cmp-head'); cmp.href = './comparar.html'; cmp.append(document.createTextNode('⇄ Comparador '), el('b', String(comparados().length)));
  const theme = el('button', null, 'head-btn theme-btn'); theme.type = 'button'; theme.onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  top.append(brand, tnav, globalSearch(), box, cmp, theme);
  const wrap = el('div', null, 'frame league-wrap'), bar = el('div', null, 'league-bar');
  const info = el('div', null, 'lb-top');
  info.append(el('span', 'Estás viendo', 'lb-k'), el('b', 'Primera Nacional Andalucía'), el('span', '· 2026/27'), el('span', '● En curso', 'lb-live'), el('span', '· Grupos A, B, C y D', 'lb-k'));
  const nav = el('nav', null, 'mainnav'); nav.setAttribute('aria-label', 'Competición'); nav.append(...links(NAV));
  bar.append(info, nav); wrap.append(bar);
  head.replaceChildren(top, wrap);
  const bottom = el('nav', null, 'bottom-nav'); bottom.setAttribute('aria-label', 'Accesos rápidos'); bottom.append(...links(BOTTOM));
  document.body.append(bottom);
  setTheme(document.documentElement.dataset.theme);
  window.addEventListener('n1-comparar', () => {
    const n = String(comparados().length);
    cmp.querySelector('b').textContent = n;
    const c = bottom.querySelector('a[href$="comparar.html"]'); c.querySelector('b')?.remove(); if (n !== '0') c.append(el('b', n));
  });
  window.dispatchEvent(new CustomEvent('n1-comparar'));
}

// ---------- Modo Aficionado / Analista ----------
export const modo = () => document.documentElement.dataset.modo || 'analista';
function setModo(m) {
  document.documentElement.dataset.modo = m;
  store.set('n1-modo', m);
  for (const b of document.querySelectorAll('.modo-switch button')) b.setAttribute('aria-pressed', String(b.dataset.m === m));
  window.dispatchEvent(new CustomEvent('n1-modo', { detail: m }));
}
document.documentElement.dataset.modo = store.get('n1-modo', 'analista');
// Pantalla de entrada (como elparcialbasket): solo la primera vez; la elección se guarda en el navegador.
function renderModo() {
  if (store.get('n1-modo', null) != null) return;
  const capa = el('div', null, 'entrada');
  capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true'); capa.setAttribute('aria-labelledby', 'entradaTitulo');
  const barra = el('div', null, 'entrada-barra');
  const logo = el('span', null, 'entrada-logo'); logo.append(el('span', 'N1', 'logo'), el('b', 'N1 Andalucía'));
  barra.append(logo);
  const caja = el('div', null, 'entrada-caja');
  const h = el('h1', '¿Cómo quieres ver N1 Andalucía?'); h.id = 'entradaTitulo';
  caja.append(h, el('p', 'Puedes cambiarlo cuando quieras desde la cabecera.', 'entrada-sub'));
  const opciones = [['aficionado', 'Aficionado', 'Resultados, directo, clasificación, líderes y tu equipo, de un vistazo.'],
    ['analista', 'Analista', 'Para cuerpo técnico: todas las métricas, quintetos, mapas de tiro, comparador y jugada a jugada.']];
  let primero = null;
  for (const [m, t, d] of opciones) {
    const b = el('button', null, 'entrada-opcion' + (m === 'aficionado' ? ' destacada' : '')); b.type = 'button';
    b.append(el('b', t), el('span', d), el('em', 'Entrar →'));
    b.onclick = () => { setModo(m); capa.remove(); document.documentElement.classList.remove('con-entrada'); };
    caja.append(b); primero ??= b;
  }
  caja.append(el('p', 'La elección se guarda en este navegador.', 'entrada-nota'));
  capa.append(barra, caja);
  document.documentElement.classList.add('con-entrada');
  document.body.append(capa);
  primero.focus();
}

// ---------- Explicaciones emergentes ----------
let pop = null, owner = null;
function tipContent(node) {
  const free = node.dataset.tipText;
  const t = node.dataset.tip ? term(node.dataset.tip) : null;
  if (!t && !free) return null;
  const box = el('div');
  if (t) {
    const h = el('strong', t.key === t.name ? t.name : t.key + ' · ' + t.name); box.append(h);
    box.append(el('p', t.what));
    const how = el('p', null, 'tip-how'); how.append(el('b', 'Cómo se calcula: '), document.createTextNode(t.how)); box.append(how);
    if (t.dir) box.append(el('p', t.dir === '+' ? 'Más alto es mejor.' : 'Más bajo es mejor.', 'tip-dir'));
  }
  if (free) box.append(el('p', free));
  return box;
}
function place(node) {
  const r = node.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
  pop.style.width = w + 'px';
  let left = r.left + r.width / 2 - w / 2; left = Math.max(12, Math.min(left, innerWidth - w - 12));
  pop.style.left = left + scrollX + 'px';
  const below = r.bottom + 8, h = pop.offsetHeight;
  pop.style.top = (below + h > innerHeight && r.top - h - 8 > 0 ? r.top - h - 8 : below) + scrollY + 'px';
}
function show(node) {
  const c = tipContent(node); if (!c) return;
  if (!pop) { pop = el('div', null, 'tip-pop'); pop.setAttribute('role', 'tooltip'); pop.id = 'tip-pop'; document.body.append(pop); }
  pop.replaceChildren(c); pop.hidden = false; owner = node;
  node.setAttribute('aria-describedby', 'tip-pop');
  place(node);
}
function hide() { if (pop) pop.hidden = true; owner?.removeAttribute('aria-describedby'); owner = null; }
const tipTarget = e => e.target.closest?.('[data-tip],[data-tip-text]');
document.addEventListener('mouseover', e => { const n = tipTarget(e); if (n && n !== owner) show(n); else if (!n && owner && !pop?.contains(e.target)) hide(); });
document.addEventListener('focusin', e => { const n = tipTarget(e); if (n) show(n); });
document.addEventListener('focusout', e => { if (tipTarget(e) === owner) hide(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
document.addEventListener('scroll', () => owner && place(owner), { passive: true });
// En pantallas táctiles: tocar muestra la explicación; tocar fuera la cierra.
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const n = tipTarget(e);
  if (n) { if (owner === n) hide(); else show(n); } else if (!pop?.contains(e.target)) hide();
});

/** Marca cabeceras y etiquetas que coinciden con el glosario para que muestren su explicación. */
function annotate(root = document) {
  for (const n of root.querySelectorAll('th, .tip-auto')) {
    if (n.dataset.tip || n.dataset.tipDone) continue;
    n.dataset.tipDone = '1';
    const target = n.querySelector('button') || n;
    const label = target.textContent.replace(/[↑↓]/g, '').trim();
    const t = term(label);
    if (!t) continue;
    target.dataset.tip = label;
    if (target.tagName !== 'BUTTON' && !target.hasAttribute('tabindex')) target.tabIndex = 0;
  }
}
let pending = 0;
new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; annotate(); }); })
  .observe(document.documentElement, { childList: true, subtree: true });
/** Etiqueta con explicación del glosario (clave) o texto libre. */
export function tipped(text, key, free) {
  const s = el('span', text, 'tip');
  if (key) s.dataset.tip = key;
  if (free) s.dataset.tipText = free;
  s.tabIndex = 0;
  return s;
}

// ---------- Comparador ----------
const CMP = 'n1-comparar';
export const comparados = () => store.get(CMP, []);
function saveCmp(list) { store.set(CMP, list); renderCmpBar(); window.dispatchEvent(new CustomEvent('n1-comparar')); }
export function alternarComparar(item) {
  let list = comparados();
  if (list.some(x => x.t === item.t && x.id === item.id)) list = list.filter(x => !(x.t === item.t && x.id === item.id));
  else { list = list.filter(x => x.t === item.t); list.push(item); if (list.length > 4) list.shift(); }
  saveCmp(list);
}
export const quitarComparar = item => saveCmp(comparados().filter(x => !(x.t === item.t && x.id === item.id)));
/** Botón «+» para añadir/quitar del comparador. item = {t:'j'|'e', id, nombre} */
export function botonComparar(item, conTexto = false) {
  const b = el('button', null, 'cmp-btn'); b.type = 'button';
  const sync = () => {
    const on = comparados().some(x => x.t === item.t && x.id === item.id);
    b.textContent = conTexto ? (on ? '✓ En el comparador' : '+ Añadir al comparador') : (on ? '✓' : '+');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', (on ? 'Quitar del comparador: ' : 'Añadir al comparador: ') + item.nombre);
    b.dataset.tipText = on ? 'Está en el comparador. Pulsa para quitarlo.' : 'Añadir al comparador (hasta 4 ' + (item.t === 'j' ? 'jugadores' : 'equipos') + ').';
  };
  b.onclick = e => { e.stopPropagation(); alternarComparar(item); };
  window.addEventListener('n1-comparar', sync);
  sync();
  return b;
}
function renderCmpBar() {
  let bar = document.querySelector('.cmp-bar');
  const list = comparados();
  // El contador está en la cabecera (y en la barra inferior en móvil): no hay barra flotante.
  bar?.remove(); if (true) return;
  if (!bar) { bar = el('div', null, 'cmp-bar'); document.body.append(bar); }
  const a = el('a', 'Comparar ' + list.length + ' ' + (list[0].t === 'j' ? (list.length > 1 ? 'jugadores' : 'jugador') : (list.length > 1 ? 'equipos' : 'equipo')) + ' →');
  a.href = './comparar.html';
  const clear = el('button', 'Vaciar'); clear.type = 'button'; clear.onclick = () => saveCmp([]);
  bar.replaceChildren(el('span', list.map(x => x.nombre).join(' · '), 'cmp-names'), a, clear);
}

// ---------- Arranque ----------
function boot() { renderHeader(); renderModo(); renderCmpBar(); annotate(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
