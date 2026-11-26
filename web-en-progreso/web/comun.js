// Piezas comunes a todas las páginas: menú, modo Aficionado/Analista, explicaciones emergentes,
// comparador, nombres legibles y puestos («3.º de 142»).
import { term } from '/glosario.js';

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

// ---------- Menú ----------
const NAV = [
  ['Jornada', '/index.html', p => p.endsWith('/') || p.endsWith('index.html')],
  ['Clasificación', '/clasificacion.html'],
  ['Líderes', '/lideres.html'],
  ['Jugadores', '/avanzada.html?tab=jugadores', (p, q) => p.endsWith('jugador.html') || p.endsWith('avanzada.html') && q.get('tab') === 'jugadores'],
  ['Equipos', '/avanzada.html?tab=equipos', (p, q) => p.endsWith('equipo.html') || p.endsWith('avanzada.html') && q.get('tab') === 'equipos'],
  ['Comparar', '/comparar.html'],
  ['Estadística avanzada', '/avanzada.html', (p, q) => p.endsWith('avanzada.html') && !['jugadores', 'equipos', 'simulador', 'glosario'].includes(q.get('tab'))],
  ['Simulador', '/avanzada.html?tab=simulador', (p, q) => q.get('tab') === 'simulador'],
  ['Laboratorio', '/liga.html', p => p.endsWith('liga.html') || p.endsWith('andalucia.html')],
  ['Glosario', '/avanzada.html?tab=glosario', (p, q) => q.get('tab') === 'glosario'],
];
function renderNav() {
  const nav = document.querySelector('.mainnav');
  if (!nav) return;
  const p = location.pathname, q = new URLSearchParams(location.search);
  nav.replaceChildren(...NAV.map(([label, href, match]) => {
    const a = el('a', label); a.href = href;
    if (match ? match(p, q) : p.endsWith(href.split('/').pop())) a.setAttribute('aria-current', 'page');
    if (['Estadística avanzada', 'Simulador', 'Laboratorio'].includes(label)) a.classList.add('solo-ana');
    return a;
  }));
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
function renderModo() {
  const bar = document.querySelector('.brandbar');
  if (!bar || bar.querySelector('.modo-switch')) return;
  const box = el('div', null, 'modo-switch'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Modo de vista');
  for (const [m, label, tipText] of [['aficionado', 'Aficionado', 'Resultados, clasificación, líderes y lo básico de cada jugador y equipo.'], ['analista', 'Analista', 'Todas las métricas: ratings, cuatro factores, quintetos, impacto en pista y simulador.']]) {
    const b = el('button', label); b.type = 'button'; b.dataset.m = m; b.dataset.tipText = tipText;
    b.setAttribute('aria-pressed', String(modo() === m)); b.onclick = () => setModo(m);
    box.append(b);
  }
  bar.querySelector('.season')?.remove();
  bar.append(box);
  if (store.get('n1-modo', null) == null) {
    const d = el('dialog', null, 'modo-dialog');
    d.append(el('h2', '¿Cómo quieres ver la web?'), el('p', 'Puedes cambiarlo cuando quieras arriba a la derecha.', 'adv-note'));
    const opts = el('div', null, 'modo-opts');
    for (const [m, t, s] of [['aficionado', 'Aficionado', 'Resultados, clasificación, líderes y fichas con lo básico, de un vistazo.'], ['analista', 'Analista', 'Para cuerpo técnico: todas las métricas, quintetos, mapas de tiro, impacto y simulador.']]) {
      const b = el('button', null, 'modo-opt'); b.type = 'button';
      b.append(el('b', t), el('span', s), el('em', 'Entrar →'));
      b.onclick = () => { setModo(m); d.close(); d.remove(); };
      opts.append(b);
    }
    d.append(opts);
    document.body.append(d);
    d.showModal();
  }
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
  if (location.pathname.endsWith('comparar.html') || !list.length) { bar?.remove(); return; }
  if (!bar) { bar = el('div', null, 'cmp-bar'); document.body.append(bar); }
  const a = el('a', 'Comparar ' + list.length + ' ' + (list[0].t === 'j' ? (list.length > 1 ? 'jugadores' : 'jugador') : (list.length > 1 ? 'equipos' : 'equipo')) + ' →');
  a.href = '/comparar.html';
  const clear = el('button', 'Vaciar'); clear.type = 'button'; clear.onclick = () => saveCmp([]);
  bar.replaceChildren(el('span', list.map(x => x.nombre).join(' · '), 'cmp-names'), a, clear);
}

// ---------- Arranque ----------
function boot() { renderNav(); renderModo(); renderCmpBar(); annotate(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
