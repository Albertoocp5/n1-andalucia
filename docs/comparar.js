import { jugador as pn, equipo as eq, muestra, puesto, comparados, alternarComparar, quitarComparar, tipped } from './comun.js';
import { standings } from './clasif.js';

const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const signed = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + fmt(v, d);

const [adv, season] = await Promise.all([
  fetch('./api/avanzadas').then(r => r.ok ? r.json() : null).catch(() => null),
  fetch('./season.json').then(r => r.json()),
]);
if (!adv) { $('#cmp').textContent = 'Las estadísticas todavía no están disponibles.'; throw Error('sin datos'); }
const m = muestra(adv.jugadores);
const pool = adv.jugadores.filter(p => p.min >= m.min && p.pj >= m.pj);
const stand = new Map(['A', 'B', 'C', 'D'].flatMap(g => standings(season.games.filter(x => x.group === g), season.groups[g]).map(r => [r.equipo, r])));

// [etiqueta, clave glosario, valor, decimales, más alto es mejor, con signo, solo analista]
const PLAYER = [
  ['Básico', [
    ['Partidos', 'PJ', p => p.pj, 0, null], ['Minutos por partido', 'MIN', p => p.mpp, 1, null],
    ['Puntos', 'PTS', p => p.ppp, 1, true], ['Rebotes', 'REB', p => p.reb / p.pj, 1, true], ['Asistencias', 'AST', p => p.ast / p.pj, 1, true],
    ['Recuperaciones', 'ROB', p => p.stl / p.pj, 1, true], ['Tapones', 'TAP', p => p.blk / p.pj, 1, true], ['Pérdidas', 'PÉR', p => p.tov / p.pj, 1, false],
    ['Valoración', 'VAL', p => p.val, 1, true],
  ]],
  ['Tiro', [
    ['Tiro real', 'TS%', p => p.ts, 1, true], ['Tiro efectivo', 'eFG%', p => p.efg, 1, true], ['Tiros de dos %', 'T2%', p => p.t2, 1, true],
    ['Triples %', 'T3%', p => p.t3, 1, true], ['Triples intentados', 'T3I', p => p.tpa, 0, null], ['Tiros libres %', 'TL%', p => p.tl, 1, true],
  ]],
  ['Avanzado', [
    ['Puntos por 40 min', 'p40', p => p.p40, 1, true], ['Uso', 'USG%', p => p.usg, 1, null], ['Puntos por posesión usada', 'PPP', p => p.ppos, 2, true],
    ['Asistencias %', 'AST%', p => p.astp, 1, true], ['Rebote ofensivo %', 'ORB%', p => p.orbp, 1, true], ['Rebote defensivo %', 'DRB%', p => p.drbp, 1, true],
    ['Más / menos', '+/-', p => p.pm, 0, true, true], ['Net en pista', 'Net en pista', p => p.net, 1, true, true], ['Con él / sin él', 'On/Off', p => p.onoff, 1, true, true],
  ], true],
];
const TEAM = [
  ['Clasificación', [
    ['Puesto en su grupo', null, t => stand.get(t.equipo)?.pos, 0, false], ['Ganados', 'G', t => t.v, 0, true], ['Perdidos', 'P', t => t.pj - t.v, 0, false],
    ['Puntos a favor por partido', 'PF', t => t.pts / t.pj, 1, true], ['Puntos en contra por partido', 'PC', t => t.opp / t.pj, 1, false],
  ]],
  ['Ratings', [
    ['Ataque', 'Ataque', t => t.off, 1, true], ['Defensa', 'Defensa', t => t.def, 1, false], ['Diferencia neta', 'Net', t => t.net, 1, true, true], ['Ritmo', 'Ritmo', t => t.ritmo, 1, null],
  ], true],
  ['Cuatro factores', [
    ['Tiro efectivo', 'eFG%', t => t.efg, 1, true], ['Tiro real', 'TS%', t => t.ts, 1, true], ['Pérdidas por 100 pos.', 'TOV%', t => t.tov, 1, false],
    ['Rebote ofensivo %', 'ORB%', t => t.orb, 1, true], ['Tiros libres por tiro', 'FTr', t => t.ftr, 2, true], ['Asistencias %', 'AST%', t => t.ast, 1, true], ['Frecuencia de triple', '3PAr', t => t.t3r, 1, null],
  ], true],
];

const params = new URLSearchParams(location.search);
let tipo = comparados()[0]?.t || params.get('tipo') || 'j';
$('#tipo').value = tipo;
function options() {
  const list = tipo === 'j' ? [...adv.jugadores].sort((a, b) => b.min - a.min).map(p => [pn(p.nombre) + ' · ' + eq(p.equipo), p.id, pn(p.nombre)]) : adv.equipos.map(t => [eq(t.equipo) + ' · grupo ' + t.grupo, t.equipo, eq(t.equipo)]);
  $('#opciones').replaceChildren(...list.map(([label]) => new Option(label)));
  return list;
}
let opts = options();
$('#tipo').onchange = () => { tipo = $('#tipo').value; opts = options(); render(); };
$('#buscar').onchange = () => {
  const o = opts.find(x => x[0] === $('#buscar').value);
  if (o) { alternarComparar({ t: tipo, id: o[1], nombre: o[2] }); $('#buscar').value = ''; }
};
window.addEventListener('n1-comparar', () => render());

function render() {
  const items = comparados().filter(x => x.t === tipo);
  const ents = items.map(x => tipo === 'j' ? adv.jugadores.find(p => p.id === x.id) : adv.equipos.find(t => t.equipo === x.id)).filter(Boolean);
  if (!ents.length) {
    $('#cmp').replaceChildren(el('p', 'Todavía no has añadido ' + (tipo === 'j' ? 'jugadores' : 'equipos') + '. Escribe un nombre arriba o pulsa + en cualquier tabla.', 'adv-note'));
    return;
  }
  const blocks = tipo === 'j' ? PLAYER : TEAM;
  const popFor = ent => tipo === 'j' ? pool : adv.equipos;
  const wrap = el('div', null, 'table-wrap'), t = el('table', null, 'adv-table cmp-table');
  const head = el('tr'); head.append(el('th', ''));
  for (const [i, e] of ents.entries()) {
    const th = el('th', null, 'num');
    const a = el('a', tipo === 'j' ? pn(e.nombre) : eq(e.equipo)); a.href = tipo === 'j' ? './jugador.html?id=' + encodeURIComponent(e.id) : './equipo.html?n=' + encodeURIComponent(e.equipo);
    const x = el('button', '×', 'cmp-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar'); x.onclick = () => quitarComparar(items[i]);
    const box = el('span', null, 'who'); const top = el('span'); top.append(a, x);
    box.append(top, el('small', tipo === 'j' ? eq(e.equipo) + ' · grupo ' + e.grupo : 'Grupo ' + e.grupo + ' · ' + e.v + '-' + (e.pj - e.v)));
    th.append(box); head.append(th);
  }
  const thead = el('thead'); thead.append(head);
  const body = el('tbody');
  for (const [title, rows, ana] of blocks) {
    const sec = el('tr', null, 'cmp-sec' + (ana ? ' solo-ana' : '')); const td = el('td', title); td.colSpan = ents.length + 1; sec.append(td); body.append(sec);
    for (const [label, key, get, d, higher, sign] of rows) {
      const tr = el('tr'); if (ana) tr.className = 'solo-ana';
      const lt = el('td'); lt.append(key ? tipped(label, key) : el('span', label)); tr.append(lt);
      const vals = ents.map(get);
      const valid = vals.filter(v => v != null && Number.isFinite(v));
      const best = higher == null || valid.length < 2 ? null : higher ? Math.max(...valid) : Math.min(...valid);
      ents.forEach((e, i) => {
        const v = vals[i], c = el('td', null, 'num');
        c.append(el('b', sign ? signed(v, d) : fmt(v, d)));
        if (higher != null && key) {
          const inPool = tipo === 'e' || pool.includes(e);
          const r = inPool ? puesto(popFor(e).map(get), v, higher) : null;
          if (r) c.append(el('small', ' ' + r.pos + '.º de ' + r.n, 'cmp-rank'));
          else if (!inPool && v != null) c.append(el('small', 'pocos minutos', 'cmp-rank'));
        }
        if (best != null && v === best) c.classList.add('cmp-best');
        tr.append(c);
      });
      body.append(tr);
    }
  }
  t.append(thead, body); wrap.append(t);
  const note = el('p', tipo === 'j' ? `«3.º de ${pool.length}» = puesto entre los ${pool.length} jugadores de toda la N1 con al menos ${m.min} minutos y ${m.pj} partidos («pocos minutos» si no llega). En verde, el mejor de la comparación.` : 'El puesto se calcula entre los 48 equipos de la N1. En verde, el mejor de la comparación.', 'adv-note');
  $('#cmp').replaceChildren(wrap, note);
}
render();
