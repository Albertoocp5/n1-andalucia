import { drawCourt, zoneTable, fromRow } from './tiros.js';
import { jugador as pn, equipo as eq, puesto, muestra, tierPuesto, botonComparar, tipped } from './comun.js';

const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const signed = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + fmt(v, d);

const per40 = (p, k) => p.min ? 40 * p[k] / p.min : null;
// [clave, etiqueta, función, más alto es mejor, decimales, explicación]
const BLOCKS = [
  ['Anotación', [
    ['p40', 'Puntos por 40 min', p => p.p40, true, 1, 'p40'],
    ['ts', 'TS%', p => p.fga + p.fta >= 15 ? p.ts : null, true, 1, 'Tiro real'],
    ['efg', 'eFG%', p => p.fga >= 15 ? p.efg : null, true, 1, 'eFG%', 1],
    ['t3', 'Triples %', p => p.tpa >= 10 ? p.t3 : null, true, 1, 'T3%'],
    ['tl', 'Tiros libres %', p => p.fta >= 10 ? p.tl : null, true, 1, 'TL%'],
    ['ppos', 'Puntos por posesión usada', p => p.ppos, true, 2, 'PPP', 1],
  ]],
  ['Creación', [
    ['a40', 'Asistencias por 40 min', p => p.a40, true, 1, 'p40'],
    ['astp', 'AST%', p => p.astp, true, 1, 'AST%', 1],
    ['usg', 'Uso %', p => p.usg, true, 1, 'USG%', 1],
    ['tov40', 'Pérdidas por 40 min', p => per40(p, 'tov'), false, 1, 'PÉR'],
  ]],
  ['Rebote', [
    ['r40', 'Rebotes por 40 min', p => p.r40, true, 1, 'p40'],
    ['orbp', 'Rebote ofensivo %', p => p.orbp, true, 1, 'ORB%', 1],
    ['drbp', 'Rebote defensivo %', p => p.drbp, true, 1, 'DRB%', 1],
  ]],
  ['Defensa', [
    ['stl40', 'Recuperaciones por 40 min', p => per40(p, 'stl'), true, 1, 'ROB'],
    ['blk40', 'Tapones por 40 min', p => per40(p, 'blk'), true, 1, 'TAP'],
  ]],
  ['Impacto', [
    ['pm40', '+/- por 40 min', p => p.min ? 40 * p.pm / p.min : null, true, 1, '+/-'],
    ['net', 'Net en pista', p => p.net, true, 1, 'Net'],
    ['onoff', 'On/Off', p => p.onoff, true, 1, 'On/Off'],
  ]],
];
const METRICS = BLOCKS.flatMap(([, m]) => m);

function percentile(values, v, higher) {
  if (v == null) return null;
  const xs = values.filter(x => x != null);
  if (!xs.length) return null;
  let below = 0, equal = 0;
  for (const x of xs) { if (x < v) below++; else if (x === v) equal++; }
  const p = 100 * (below + equal / 2) / xs.length;
  return Math.round(higher ? p : 100 - p);
}
const tier = p => p == null ? '' : p >= 80 ? 't-top' : p >= 60 ? 't-good' : p >= 40 ? 't-mid' : p >= 20 ? 't-low' : 't-bottom';

const params = new URLSearchParams(location.search);
const isAna = (block, m) => block === 'Impacto' || m[6];
const [adv, season] = await Promise.all([
  fetch('./api/avanzadas').then(r => r.ok ? r.json() : null),
  fetch('./season.json').then(r => r.json()),
]);
if (!adv) { $('#plName').textContent = 'Estadística avanzada no disponible'; throw Error('sin datos'); }
const byId = new Map(adv.jugadores.map(p => [p.id, p]));
let player = byId.get(params.get('id'));
if (!player) player = [...adv.jugadores].sort((a, b) => b.pts - a.pts)[0];

// buscador
$('#plList').replaceChildren(...adv.jugadores.map(p => new Option(eq(p.equipo), pn(p.nombre))));
$('#plSearch').onchange = () => {
  const p = adv.jugadores.find(x => pn(x.nombre) === $('#plSearch').value);
  if (p) location.search = '?id=' + encodeURIComponent(p.id);
};

const M = muestra(adv.jugadores);
function population(kind, who = player) {
  return adv.jugadores.filter(p => p.min >= M.min && p.pj >= M.pj && (kind === 'liga' || p.grupo === who.grupo));
}
// Bloque «3.º de 142 en su grupo · 12.º de 413 en la N1» con barra peor → mejor
function rankBlock(get, higher, label) {
  const v = get(player);
  const rg = puesto(population('grupo').map(get), v, higher), rl = puesto(population('liga').map(get), v, higher);
  if (!rg && !rl) return null;
  const box = el('div', null, 'rank');
  const r = rg || rl;
  const txt = el('span', null, 'rank-txt');
  txt.append(document.createTextNode(r.pos + '.º de ' + r.n), el('small', rg ? ' en su grupo' : ' en la N1'));
  if (rg && rl) txt.append(el('small', ' · ' + rl.pos + '.º de ' + rl.n + ' en la N1'));
  txt.dataset.tipText = `Puesto ${r.pos} de ${r.n} jugadores ${rg ? 'de su grupo' : 'de la N1'} en ${label.toLowerCase()}: mejor que el ${r.mejorQue} % de ellos. Solo cuentan jugadores con al menos ${M.min} minutos y ${M.pj} partidos.`;
  txt.tabIndex = 0;
  const bar = el('div', null, 'rank-bar'); const fill = el('i', null, tierPuesto(r)); fill.style.width = (r.n > 1 ? 100 * (r.n - r.pos) / (r.n - 1) : 100) + '%'; bar.append(fill);
  const ends = el('div', null, 'rank-ends'); ends.append(el('span', 'peor'), el('span', 'mejor'));
  box.append(txt, bar, ends);
  return box;
}
function pctOf(p, pop) {
  const out = {};
  for (const [key, , get, higher] of METRICS) out[key] = percentile(pop.map(get), get(p), higher);
  return out;
}

function header() {
  document.title = player.nombre + ' · N1 Andalucía';
  document.title = pn(player.nombre) + ' · N1 Andalucía';
  $('#plKicker').replaceChildren(document.createTextNode('GRUPO ' + player.grupo + ' · '), Object.assign(el('a', eq(player.equipo)), { href: './equipo.html?n=' + encodeURIComponent(player.equipo) }));
  $('#plName').replaceChildren(document.createTextNode(pn(player.nombre)), botonComparar({ t: 'j', id: player.id, nombre: pn(player.nombre) }, true));
  $('#plMeta').textContent = `${player.pj} partidos · ${player.tit} de titular · ${fmt(player.mpp)} minutos por partido · ${fmt(player.min, 0)} minutos en total`;
  const pg = k => p => p.pj ? p[k] / p.pj : null;
  const cards = [
    ['Puntos', 'PTS', fmt(player.ppp), 'por partido', p => p.ppp, true], ['Rebotes', 'REB', fmt(player.reb / player.pj), 'por partido', pg('reb'), true],
    ['Asistencias', 'AST', fmt(player.ast / player.pj), 'por partido', pg('ast'), true], ['Valoración', 'VAL', fmt(player.val), 'por partido', p => p.val, true],
    ['Tiro real', 'TS%', fmt(player.ts), 'TS%', p => p.fga + p.fta >= 4 * M.J ? p.ts : null, true], ['Uso', 'USG%', fmt(player.usg), '% de jugadas que termina', p => p.usg, true, 1],
    ['Net en pista', 'Net en pista', signed(player.net), 'por 100 posesiones', p => p.net, true, 1], ['Con él / sin él', 'On/Off', signed(player.onoff), 'On/Off', p => p.onoff, true, 1],
  ];
  $('#plCards').replaceChildren(...cards.map(([t, key, v, sub, get, higher, ana]) => {
    const c = el('article', null, 'adv-card' + (ana ? ' solo-ana' : ''));
    c.append(tipped(t, key), el('strong', v), el('em', sub));
    const rb = rankBlock(get, higher, t); if (rb) c.append(rb);
    return c;
  }));
}

function renderPercentiles() {
  const kind = $('#pctGroup').value, pop = population(kind);
  const vs = byId.get($('#pctVs').value);
  $('#pctNote').textContent = `Su puesto entre los ${pop.length} jugadores de ${kind === 'liga' ? 'toda la N1' : 'su grupo (' + player.grupo + ')'} con al menos ${M.min} minutos y ${M.pj} partidos. 1.º es el mejor; la barra llena significa que está arriba del todo.` +
    (player.min < M.min || player.pj < M.pj ? ' Este jugador no llega al mínimo: su puesto es orientativo.' : '');
  $('#pctGrid').replaceChildren(...BLOCKS.map(([title, metrics]) => {
    const box = el('section', null, 'pct-block' + (title === 'Impacto' ? ' solo-ana' : ''));
    box.append(el('h3', title));
    for (const m of metrics) {
      const [key, label, get, higher, dec, tipKey] = m;
      const row = el('div', null, 'pct-row' + (isAna(title, m) ? ' solo-ana' : ''));
      const name = tipped(label, tipKey || label); name.classList.add('pct-label');
      const v = get(player), r = puesto(pop.map(get), v, higher);
      const bar = el('div', null, 'pct-bar');
      const fill = el('i', null, tierPuesto(r)); fill.style.width = (r ? (r.n > 1 ? 100 * (r.n - r.pos) / (r.n - 1) : 100) : 0) + '%';
      bar.append(fill);
      const rv = vs ? puesto(pop.map(get), get(vs), higher) : null;
      if (rv) { const mk = el('b', null, 'pct-vs'); mk.style.left = (rv.n > 1 ? 100 * (rv.n - rv.pos) / (rv.n - 1) : 100) + '%'; mk.dataset.tipText = pn(vs.nombre) + ': ' + rv.pos + '.º de ' + rv.n; bar.append(mk); }
      const num = el('span', r ? r.pos + '.º' : '—', 'pct-num ' + tierPuesto(r));
      if (r) { num.append(el('small', '/' + r.n)); num.dataset.tipText = `${r.pos}.º de ${r.n}: mejor que el ${r.mejorQue} % de los jugadores comparados.`; num.tabIndex = 0; }
      row.append(name, bar, el('span', key === 'pm40' || key === 'net' || key === 'onoff' ? signed(v, dec) : fmt(v, dec), 'pct-value'), num);
      box.append(row);
    }
    return box;
  }));
}

function renderSimilar() {
  const pop = population('liga');
  const keys = ['p40', 'ts', 'usg', 'a40', 'astp', 'r40', 'orbp', 'drbp', 'stl40', 'blk40', 'tov40'];
  const vector = p => { const pc = pctOf(p, pop); return keys.map(k => pc[k] ?? 50); };
  const me = vector(player);
  const near = pop.filter(p => p.id !== player.id).map(p => {
    const v = vector(p);
    return [Math.sqrt(v.reduce((a, x, i) => a + (x - me[i]) ** 2, 0) / keys.length), p];
  }).sort((a, b) => a[0] - b[0]).slice(0, 6);
  $('#similar').replaceChildren(...near.map(([d, p]) => {
    const a = el('a', null, 'similar-card'); a.href = './jugador.html?id=' + encodeURIComponent(p.id);
    a.append(el('b', pn(p.nombre)), el('small', eq(p.equipo) + ' · grupo ' + p.grupo), el('span', `${fmt(p.ppp)} pts · TS ${fmt(p.ts)} · uso ${fmt(p.usg)}`), el('em', 'Parecido ' + Math.max(0, Math.round(100 - d)) + '%'));
    return a;
  }));
  $('#pctVs').replaceChildren(new Option('Ninguno', ''), ...near.map(([, p]) => new Option(pn(p.nombre) + ' (parecido)', p.id)),
    ...adv.jugadores.filter(p => p.equipo === player.equipo && p.id !== player.id).map(p => new Option(pn(p.nombre) + ' (compañero)', p.id)));
}

async function renderShots() {
  const data = await fetch('./api/avanzadas?tiros=1').then(r => r.ok ? r.json() : null).catch(() => null);
  const idx = data ? data.jugadores.indexOf(player.id) : -1;
  const rows = idx < 0 ? [] : (data.equipos[player.equipo] || []).filter(r => r[4] === idx);
  $('#plCourt').replaceChildren();
  drawCourt($('#plCourt'), rows.map(fromRow), { title: pn(player.nombre), label: 'Mapa de tiro de ' + pn(player.nombre) });
  $('#plZones').replaceChildren();
  zoneTable($('#plZones'), adv.zonas.jugadores[player.id] || {}, adv.zonas.liga);
  const c = player.clutch;
  $('#plClutch').replaceChildren(el('h3', 'Final apretado'), el('p', c.fga || c.pts ? `${c.pts} puntos con ${c.fgm}/${c.fga} en tiros de campo y ${c.tov} pérdidas en los últimos 5 minutos con 5 puntos o menos de diferencia.` : 'Sin acciones de tiro en finales apretados.', 'adv-note'));
}

function renderLog() {
  const games = [];
  for (const g of season.games) {
    for (const [side, t] of (g.box || []).entries()) {
      const r = t.rows.find(r => r[0] === player.id);
      if (!r) continue;
      const home = t.team === g.home, rival = home ? g.away : g.home, sc = g.score || [];
      games.push({ g, r, rival, home, own: home ? sc[0] : sc[1], opp: home ? sc[1] : sc[0] });
    }
  }
  games.sort((a, b) => a.g.date.localeCompare(b.g.date));
  const num = v => Number(String(v).replace(',', '.')) || 0;
  // gráfico de barras: puntos (barra) y valoración (punto)
  const W = 640, H = 170, P = 26, n = games.length || 1, bw = (W - P - 8) / n;
  const maxV = Math.max(10, ...games.flatMap(x => [num(x.r[3]), num(x.r[15])]));
  const minV = Math.min(0, ...games.map(x => num(x.r[15])));
  const Y = v => 10 + (maxV - v) / (maxV - minV) * (H - 36);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Puntos y valoración por partido"><line x1="${P}" x2="${W - 4}" y1="${Y(0)}" y2="${Y(0)}" class="q"/>`;
  games.forEach((x, i) => {
    const cx = P + i * bw + bw / 2, pts = num(x.r[3]), val = num(x.r[15]);
    svg += `<rect x="${cx - bw * 0.3}" y="${Y(pts)}" width="${bw * 0.6}" height="${Math.max(0, Y(0) - Y(pts))}" class="bar-pts"><title>${x.g.round} · ${pts} puntos</title></rect>`;
    svg += `<circle cx="${cx}" cy="${Y(val)}" r="4" class="dot-val"><title>${x.g.round} · valoración ${val}</title></circle>`;
    svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${(x.g.round || '').replace('Jornada ', 'J')}</text>`;
  });
  svg += `<text x="${P}" y="10">${maxV}</text></svg>`;
  const trend = el('div', null, 'flow'); trend.innerHTML = svg;
  const legend = el('div', null, 'shot-legend'); legend.innerHTML = '<i class="lg-pts"></i>Puntos <i class="lg-val"></i>Valoración';
  $('#plTrend').replaceChildren(trend, legend);
  const t = el('table', null, 'adv-table');
  t.innerHTML = '<thead><tr><th>Jornada</th><th class="l">Rival</th><th class="num">Res.</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">T2</th><th class="num">T3</th><th class="num">TL</th><th class="num">REB</th><th class="num">AST</th><th class="num">ROB</th><th class="num">PÉR</th><th class="num">+/−</th><th class="num">VAL</th></tr></thead>';
  const body = el('tbody');
  for (const x of [...games].reverse()) {
    const tr = el('tr');
    const id = x.g.url.split('?')[0].split('/').at(-1);
    const link = el('a', (x.home ? '' : '@ ') + eq(x.rival)); link.href = './index.html?partido=' + id;
    const td = el('td'); td.append(link);
    const res = x.own != null ? (x.own > x.opp ? 'V ' : 'D ') + x.own + '-' + x.opp : '—';
    td.className = 'l'; tr.append(el('td', x.g.round || x.g.date), td, ...[res, x.r[2], x.r[3], x.r[4], x.r[5], x.r[6], x.r[7], x.r[8], x.r[9], x.r[10], x.r[14], x.r[15]].map(v => el('td', v, 'num')));
    body.append(tr);
  }
  t.append(body);
  $('#plLog').replaceChildren(t);
}

header();
renderSimilar();
renderPercentiles();
renderLog();
renderShots();
$('#pctGroup').onchange = renderPercentiles;
$('#pctVs').onchange = renderPercentiles;
