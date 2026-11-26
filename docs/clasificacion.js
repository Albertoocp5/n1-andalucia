import { standings, formaNode } from './clasif.js';
import { equipo as eq, botonComparar } from './comun.js';

const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const signed = v => v == null ? '—' : (v > 0 ? '+' : '') + (Number.isInteger(v) ? v : fmt(v));

const [season, adv] = await Promise.all([
  fetch('./season.json').then(r => r.json()),
  fetch('./api/avanzadas').then(r => r.ok ? r.json() : null).catch(() => null),
]);
const advTeam = new Map((adv?.equipos || []).map(t => [t.equipo, t]));
const params = new URLSearchParams(location.search);
let grupo = params.get('grupo') || '';
try { grupo ||= localStorage.getItem('n1-grupo') || ''; } catch {}
if (!'ABCD'.includes(grupo)) grupo = '';

const finals = season.games.filter(g => g.status === 'Final');
const last = finals.map(g => g.date).sort().at(-1);
$('#stamp').textContent = 'Fuente: actas oficiales de Afición FAB · ' + finals.length + ' partidos jugados' + (last ? ' · último el ' + new Date(last + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '');

function renderTabs() {
  $('#grupos').replaceChildren(...['', 'A', 'B', 'C', 'D'].map(g => {
    const b = el('button', g ? 'Grupo ' + g : 'Todos'); b.type = 'button';
    b.setAttribute('aria-pressed', String(grupo === g));
    b.onclick = () => { grupo = g; try { localStorage.setItem('n1-grupo', g); } catch {} history.replaceState(null, '', g ? '?grupo=' + g : location.pathname); render(); };
    return b;
  }));
}

function groupTable(g) {
  const games = season.games.filter(x => x.group === g);
  const rows = standings(games, season.groups[g]);
  // Jornada actual: la más alta con al menos la mitad de sus partidos terminados (los adelantados no cuentan).
  const rn = x => Number(String(x.round).match(/\d+/)?.[0]) || 0;
  const jornada = Math.max(0, ...[...new Set(games.map(rn))].filter(r => { const gs = games.filter(x => rn(x) === r); return gs.filter(x => x.status === 'Final').length * 2 >= gs.length; }));
  const box = el('section', null, 'pl-section');
  box.append(el('h2', 'Grupo ' + g), el('p', `Jornada ${jornada} de ${Math.max(...games.map(x => Number(String(x.round).match(/\d+/)?.[0]) || 0))} · ${rows.length} equipos`, 'adv-note'));
  const wrap = el('div', null, 'table-wrap'), t = el('table', null, 'adv-table std-table');
  const heads = [['#', ''], ['Equipo', 'l'], ['PJ', 'num'], ['G', 'num'], ['P', 'num'], ['PF', 'num'], ['PC', 'num'], ['Dif.', 'num'], ['Casa', 'num'], ['Fuera', 'num'], ['Últimos 5', ''], ['Racha', 'num'], ['Ataque', 'num solo-ana'], ['Defensa', 'num solo-ana'], ['Net', 'num solo-ana']];
  const tr = el('tr');
  for (const [h, c] of heads) { const th = el('th', null, c); th.append(Object.assign(el('button', h), { disabled: true, type: 'button' })); tr.append(th); }
  const thead = el('thead'); thead.append(tr);
  const body = el('tbody');
  for (const r of rows) {
    const a = advTeam.get(r.equipo);
    const x = el('tr');
    const name = el('td', null, 'l'); const link = el('a', eq(r.equipo)); link.href = './equipo.html?n=' + encodeURIComponent(r.equipo);
    name.append(link, botonComparar({ t: 'e', id: r.equipo, nombre: eq(r.equipo) }));
    const tdf = el('td'); tdf.append(formaNode(r));
    x.append(el('td', String(r.pos), 'pos'), name, ...[r.pj, r.g, r.p, r.pf, r.pc].map(v => el('td', String(v), 'num')),
      el('td', signed(r.dif), 'num ' + (r.dif > 0 ? 'good' : r.dif < 0 ? 'bad' : '')),
      el('td', r.casa.join('-'), 'num'), el('td', r.fuera.join('-'), 'num'), tdf, el('td', r.racha, 'num'),
      el('td', fmt(a?.off), 'num solo-ana'), el('td', fmt(a?.def), 'num solo-ana'), el('td', a ? signed(a.net) : '—', 'num solo-ana'));
    body.append(x);
  }
  t.append(thead, body); wrap.append(t); box.append(wrap);
  const next = games.filter(x => x.status !== 'Final').sort((p, q) => (p.date + p.time).localeCompare(q.date + q.time));
  if (next.length) {
    const rnd = next[0].round, list = next.filter(x => x.round === rnd);
    const p = el('p', null, 'adv-note'); const a = el('a', 'Ver la ' + rnd.toLowerCase() + ' →'); a.href = './index.html?jornada=' + encodeURIComponent(rnd) + '&grupo=' + g;
    p.append(document.createTextNode('Próxima: ' + rnd + ' · ' + list.length + ' partidos. '), a);
    box.append(p);
  }
  return box;
}

function render() {
  renderTabs();
  $('#tablas').replaceChildren(...(grupo ? [grupo] : ['A', 'B', 'C', 'D']).map(groupTable));
}
render();
