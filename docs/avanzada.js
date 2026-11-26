import { drawCourt, zoneTable, fromRow } from './tiros.js';
import { GLOSSARY } from './glosario.js';
import { simulate, winProb } from './simulador.js';
const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const signed = v => v == null ? '—' : (v > 0 ? '+' : '') + fmt(v);


const tip = label => GLOSSARY[label] || '';

let data, tab = 'equipos';
const state = { sortTeam: ['net', -1], sortPlayer: ['pts', -1], sortLineup: ['min', -1], sortClutch: ['pts', -1] };

function table(container, columns, rows, sortKey, onSort, rowLink) {
  const t = el('table', null, 'adv-table');
  const head = el('tr');
  for (const c of columns) {
    const th = el('th');
    const b = el('button', c.label);
    b.type = 'button';
    if (tip(c.tip || c.label)) { b.title = tip(c.tip || c.label); b.classList.add('has-tip'); }
    if (sortKey && sortKey[0] === c.key) th.setAttribute('aria-sort', sortKey[1] < 0 ? 'descending' : 'ascending');
    if (c.key && onSort) b.onclick = () => onSort(c.key);
    else b.disabled = true;
    th.append(b); if (c.num) th.className = 'num'; head.append(th);
  }
  const thead = el('thead'); thead.append(head);
  const body = el('tbody');
  rows.forEach((r, i) => {
    const tr = el('tr');
    for (const c of columns) {
      const td = el('td');
      const v = c.get ? c.get(r, i) : r[c.key];
      if (v instanceof Node) td.append(v); else td.textContent = c.fmt ? c.fmt(v, r) : v ?? '—';
      if (c.num) td.className = 'num';
      if (c.heat && typeof v === 'number') td.style.setProperty('--heat', String(c.heat(v, r)));
      tr.append(td);
    }
    if (rowLink) tr.dataset.href = rowLink(r);
    body.append(tr);
  });
  t.append(thead, body);
  container.replaceChildren(t);
}
const sorter = ([key, dir]) => (a, b) => {
  const x = a[key], y = b[key];
  if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
  return typeof x === 'string' ? dir * x.localeCompare(y, 'es') : dir * (x - y);
};
const toggle = (name, key) => { const s = state[name]; state[name] = [key, s[0] === key ? -s[1] : (key === 'def' || key === 'tov' ? 1 : -1)]; render(); };

// Escala de calor centrada en la media del grupo de filas visibles
function heat(rows, key, higherBetter = true) {
  const vals = rows.map(r => r[key]).filter(v => typeof v === 'number');
  if (!vals.length) return () => 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  return v => Math.max(-1, Math.min(1, ((v - mean) / sd / 2) * (higherBetter ? 1 : -1))).toFixed(2);
}

function filtered(list) {
  const g = $('#grupo').value, t = $('#equipo').value;
  return list.filter(x => (!g || x.grupo === g) && (!t || x.equipo === t));
}

function renderTeams() {
  const teams = filtered(data.equipos).map(t => ({ ...t, balance: t.v + '–' + (t.pj - t.v), diff: t.pts - t.opp }));
  const best = (k, high = true) => [...teams].filter(t => t[k] != null).sort((a, b) => high ? b[k] - a[k] : a[k] - b[k])[0];
  const cards = [['Mejor ataque', best('off'), 'off', 'Ataque'], ['Mejor defensa', best('def', false), 'def', 'Defensa'], ['Mejor Net', best('net'), 'net', 'Net'], ['Más ritmo', best('ritmo'), 'ritmo', 'Ritmo']];
  $('#teamCards').replaceChildren(...cards.filter(c => c[1]).map(([title, t, k, label]) => {
    const card = el('article', null, 'adv-card');
    const tl = el('a', t.equipo); tl.href = './equipo.html?n=' + encodeURIComponent(t.equipo);
    card.append(el('small', title), el('strong', k === 'net' ? signed(t[k]) : fmt(t[k])), tl, el('em', label + ' · grupo ' + t.grupo));
    return card;
  }));
  const rows = teams.sort(sorter(state.sortTeam));
  const h = { off: heat(rows, 'off'), def: heat(rows, 'def', false), net: heat(rows, 'net'), efg: heat(rows, 'efg'), ts: heat(rows, 'ts'), tov: heat(rows, 'tov', false), orb: heat(rows, 'orb'), ftr: heat(rows, 'ftr') };
  table($('#teamTable'), [
    { label: '#', get: (r, i) => i + 1 },
    { label: 'Equipo', key: 'equipo', get: r => { const a = el('a', r.equipo); a.href = './equipo.html?n=' + encodeURIComponent(r.equipo); return a; } },
    { label: 'Gr.', key: 'grupo' }, { label: 'Bal.', key: 'v', get: r => r.balance, num: true },
    { label: 'Ataque', key: 'off', num: true, fmt: v => fmt(v), heat: h.off },
    { label: 'Defensa', key: 'def', num: true, fmt: v => fmt(v), heat: h.def },
    { label: 'Net', key: 'net', num: true, fmt: v => signed(v), heat: h.net },
    { label: 'Ritmo', key: 'ritmo', num: true, fmt: v => fmt(v) },
    { label: 'eFG%', key: 'efg', num: true, fmt: v => fmt(v), heat: h.efg },
    { label: 'TS%', key: 'ts', num: true, fmt: v => fmt(v), heat: h.ts },
    { label: 'TOV%', key: 'tov', num: true, fmt: v => fmt(v), heat: h.tov },
    { label: 'ORB%', key: 'orb', num: true, fmt: v => fmt(v), heat: h.orb },
    { label: 'FTr', key: 'ftr', num: true, fmt: v => fmt(v, 2), heat: h.ftr },
    { label: '3PAr', key: 't3r', num: true, fmt: v => fmt(v) },
    { label: 'AST%', key: 'ast', num: true, fmt: v => fmt(v) },
  ], rows, state.sortTeam, k => toggle('sortTeam', k));
  scatter(teams);
}

function scatter(teams) {
  const W = 520, H = 400, P = 46;
  const xs = teams.map(t => t.off), ys = teams.map(t => t.def);
  const pad = 3, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const X = v => P + (v - x0) / (x1 - x0) * (W - P - 12), Y = v => 12 + (v - y0) / (y1 - y0) * (H - P - 12); // defensa baja = arriba
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Ataque frente a defensa de cada equipo');
  const add = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.append(n); return n; };
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  add('rect', { x: X(mx), y: 12, width: W - 12 - X(mx), height: Y(my) - 12, class: 'quad-good' });
  add('line', { x1: X(mx), x2: X(mx), y1: 12, y2: H - P, class: 'axis-mean' });
  add('line', { x1: P, x2: W - 12, y1: Y(my), y2: Y(my), class: 'axis-mean' });
  add('text', { x: W - 16, y: 26, 'text-anchor': 'end', class: 'quad-label' }, 'Buen ataque · buena defensa');
  add('text', { x: (W + P) / 2, y: H - 10, 'text-anchor': 'middle', class: 'axis-label' }, 'Ataque (puntos por 100 pos.) →');
  add('text', { x: 14, y: (H - P) / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 14 ${(H - P) / 2})` }, '← Defensa (menos es mejor)');
  for (const v of [Math.ceil(x0 / 5) * 5, Math.round(mx), Math.floor(x1 / 5) * 5]) add('text', { x: X(v), y: H - P + 16, 'text-anchor': 'middle', class: 'tick' }, String(v));
  for (const v of [Math.ceil(y0 / 5) * 5, Math.round(my), Math.floor(y1 / 5) * 5]) add('text', { x: P - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' }, String(v));
  for (const t of teams) {
    const g = add('g', { class: 'dot g' + t.grupo, tabindex: 0 });
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', X(t.off)); c.setAttribute('cy', Y(t.def)); c.setAttribute('r', 6);
    const ti = document.createElementNS(ns, 'title'); ti.textContent = `${t.equipo} (grupo ${t.grupo}) · Ataque ${fmt(t.off)} · Defensa ${fmt(t.def)} · Net ${signed(t.net)}`;
    g.append(c, ti);
    if (teams.length <= 12) { const lb = document.createElementNS(ns, 'text'); lb.setAttribute('x', X(t.off) + 8); lb.setAttribute('y', Y(t.def) + 4); lb.setAttribute('class', 'dot-label'); lb.textContent = t.equipo.split(' ').slice(-2).join(' '); g.append(lb); }
  }
  const legend = el('div', null, 'adv-legend');
  for (const g of 'ABCD') { const s = el('span', 'Grupo ' + g, 'g' + g); legend.append(s); }
  $('#scatter').replaceChildren(svg, legend);
}

const VIEWS = {
  basica: [['pj', 'PJ'], ['mpp', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'ROB'], ['tov', 'PÉR'], ['val', 'VAL'], ['ts', 'TS%'], ['usg', 'USG%']],
  tiro: [['pj', 'PJ'], ['pts', 'PTS'], ['ts', 'TS%'], ['efg', 'eFG%'], ['t2', 'T2%'], ['t3', 'T3%'], ['tl', 'TL%'], ['tpa', 'T3I'], ['fta', 'TLI'], ['ppos', 'PPP']],
  impacto: [['pj', 'PJ'], ['min', 'MIN tot.'], ['pm', '+/-'], ['off', 'Ataque'], ['def', 'Defensa'], ['net', 'Net'], ['netSin', 'Net sin él'], ['onoff', 'On/Off'], ['pos', 'Pos.']],
  rol: [['pj', 'PJ'], ['tit', 'Titular'], ['mpp', 'MIN'], ['usg', 'USG%'], ['astp', 'AST%'], ['orbp', 'ORB%'], ['drbp', 'DRB%'], ['blk', 'TAP'], ['stl', 'ROB']],
};
const COUNTING = new Set(['pts', 'reb', 'ast', 'stl', 'tov', 'blk', 'tpa', 'fta', 'orb', 'drb']);
const PCT = new Set(['ts', 'efg', 't2', 't3', 'tl', 'usg', 'astp', 'orbp', 'drbp']);

function scaled(p, scale) {
  const out = { ...p };
  for (const k of COUNTING) {
    const v = p[k];
    out[k] = scale === 'pp' ? v / p.pj : scale === 'p40' ? (p.min ? v * 40 / p.min : null) : scale === 'p100' ? (p.pos ? v * 100 / p.pos : null) : v;
  }
  out.pts = scale === 'pp' ? p.ppp : out.pts;
  if (scale === 'tot') out.val = p.val * p.pj;
  return out;
}

let lastPlayers = [];
function renderPlayers() {
  const q = $('#q').value.trim().toLocaleLowerCase('es'), min = Number($('#minMin').value) || 0, scale = $('#escala').value;
  const cols = VIEWS[$('#vista').value];
  if (!cols.some(c => c[0] === state.sortPlayer[0]) && state.sortPlayer[0] !== 'nombre') state.sortPlayer = [cols[2][0], -1];
  let rows = filtered(data.jugadores).filter(p => p.min >= min && (!q || p.nombre.toLocaleLowerCase('es').includes(q))).map(p => scaled(p, scale));
  rows.sort(sorter(state.sortPlayer));
  lastPlayers = rows;
  const heats = Object.fromEntries(cols.map(([k]) => [k, heat(rows, k, !['tov', 'def'].includes(k))]));
  $('#playerNote').textContent = rows.length + ' jugadores con ' + min + ' minutos o más. Pasa el ratón por las cabeceras para ver cada definición.';
  table($('#playerTable'), [
    { label: '#', get: (r, i) => i + 1 },
    { label: 'Jugador', key: 'nombre', get: r => { const a = el('a', r.nombre); a.href = './jugador.html?id=' + encodeURIComponent(r.id); const s = el('small', r.equipo + ' · ' + r.grupo); const w = el('span', null, 'who'); w.append(a, s); return w; } },
    ...cols.map(([k, label]) => ({
      key: k, label, tip: label === 'PÉR' ? 'TOV%' : label, num: true,
      fmt: v => k === 'pm' || k === 'net' || k === 'onoff' || k === 'netSin' ? signed(v) : (Number.isInteger(v) && !PCT.has(k) ? String(v) : fmt(v)),
      heat: ['pj', 'tit', 'min', 'mpp', 'pos'].includes(k) ? null : heats[k],
    })),
  ], rows.slice(0, 300), state.sortPlayer, k => toggle('sortPlayer', k));
}

function renderLineups() {
  const min = Number($('#minLineup').value) || 0;
  const rows = filtered(data.quintetos.map(l => ({ ...l, grupo: teamGroup[l.equipo] }))).filter(l => l.min >= min).sort(sorter(state.sortLineup));
  const h = heat(rows, 'net');
  table($('#lineupTable'), [
    { label: 'Equipo', key: 'equipo', get: r => { const a = el('a', r.equipo, 'team-tag'); a.href = './equipo.html?n=' + encodeURIComponent(r.equipo); return a; } },
    { label: 'Quinteto', get: r => el('span', r.jug.map(n => n.split(',')[0]).join(' · '), 'lineup') },
    { label: 'MIN', key: 'min', num: true, fmt: v => fmt(v) }, { label: 'Pos.', key: 'pos', num: true, fmt: v => fmt(v, 0) },
    { label: '+/-', key: 'pm', num: true, fmt: v => signed(v) },
    { label: 'Ataque', key: 'off', num: true, fmt: v => fmt(v) }, { label: 'Defensa', key: 'def', num: true, fmt: v => fmt(v) },
    { label: 'Net', key: 'net', num: true, fmt: v => signed(v), heat: h },
    { label: 'eFG%', key: 'efg', num: true, fmt: v => fmt(v) }, { label: 'TOV%', key: 'tov', num: true, fmt: v => fmt(v) }, { label: 'ORB%', key: 'orb', num: true, fmt: v => fmt(v) },
  ], rows.slice(0, 200), state.sortLineup, k => toggle('sortLineup', k));
}

function renderClutch() {
  const rows = filtered(data.jugadores).filter(p => p.clutch.fga + p.clutch.pts > 0).map(p => ({ ...p, cpts: p.clutch.pts, cfg: p.clutch.fgm + '/' + p.clutch.fga, cpct: p.clutch.fga ? 100 * p.clutch.fgm / p.clutch.fga : null, ctov: p.clutch.tov }));
  const st = state.sortClutch[0] === 'pts' ? ['cpts', -1] : state.sortClutch;
  rows.sort(sorter(st));
  table($('#clutchTable'), [
    { label: '#', get: (r, i) => i + 1 },
    { label: 'Jugador', key: 'nombre', get: r => { const w = el('span', null, 'who'); const a = el('a', r.nombre); a.href = './jugador.html?id=' + encodeURIComponent(r.id); w.append(a, el('small', r.equipo)); return w; } },
    { label: 'PTS', key: 'cpts', num: true, tip: 'Clutch' }, { label: 'TC', key: 'cpct', num: true, get: r => r.cfg },
    { label: 'TC%', key: 'cpct', num: true, fmt: v => fmt(v) }, { label: 'PÉR', key: 'ctov', num: true },
  ], rows.slice(0, 150), st, k => { state.sortClutch = [k, state.sortClutch[0] === k ? -state.sortClutch[1] : -1]; render(); });
}

let shotData = null;
async function renderShots() {
  const team = $('#equipo').value || (filtered(data.equipos)[0] || data.equipos[0]).equipo;
  if (!shotData) {
    $('#shotNote').textContent = 'Cargando tiros…';
    shotData = await fetch('./api/avanzadas?tiros=1').then(r => r.json()).catch(() => null);
    if (!shotData) { $('#shotNote').textContent = 'Mapa de tiro no disponible.'; return; }
  }
  const players = data.jugadores.filter(p => p.equipo === team).sort((a, b) => b.fga - a.fga);
  const keep = $('#shotPlayer').value;
  $('#shotPlayer').replaceChildren(new Option('Todo el equipo', ''), ...players.filter(p => p.fga).map(p => new Option(`${p.nombre} (${p.fga} TC)`, p.id)));
  if (players.some(p => p.id === keep)) $('#shotPlayer').value = keep;
  const pid = $('#shotPlayer').value, type = Number($('#shotType').value) || 0;
  const idx = pid ? shotData.jugadores.indexOf(pid) : -1;
  const rows = (shotData.equipos[team] || []).filter(r => (!pid || r[4] === idx) && (!type || r[2] === type));
  const who = pid ? players.find(p => p.id === pid).nombre : team;
  $('#shotNote').textContent = (!$('#equipo').value ? 'Mostrando ' + team + '. Cambia de equipo con el selector de arriba. ' : '') + rows.length + ' tiros de campo con posición.';
  $('#shotCourt').replaceChildren();
  drawCourt($('#shotCourt'), rows.map(fromRow), { title: who, label: 'Mapa de tiro de ' + who });
  $('#shotZones').replaceChildren();
  zoneTable($('#shotZones'), (pid ? data.zonas.jugadores[pid] : data.zonas.equipos[team]) || {}, data.zonas.liga);
}

let seasonData = null;
const simCache = {};
async function renderSim() {
  const g = $('#grupo').value || 'A';
  seasonData ||= await fetch('./season.json').then(r => r.json());
  const games = seasonData.games.filter(x => x.group === g).map(x => ({ ...x, score: x.status === 'Final' ? x.score : null }));
  const teams = seasonData.groups[g];
  const sim = simCache[g] ||= simulate(games, teams);
  const n = teams.length, focus = $('#equipo').value;
  $('#simNote').textContent = `Grupo ${g}${$('#grupo').value ? '' : ' (elige otro grupo arriba)'} · ${sim.model.played} partidos jugados y ${sim.left.length} por jugar · ventaja de campo ${fmt(sim.model.home)} puntos · dispersión ${fmt(sim.model.sd)} puntos por partido · ${sim.runs.toLocaleString('es-ES')} simulaciones.`;
  const t = el('table', null, 'adv-table sim-table');
  const head = el('tr');
  for (const h of ['Equipo', 'Bal.', 'Fuerza', 'V esp.', 'Puesto esp.', '1.º', 'Top 4', 'Últimos 2']) { const th = el('th'); th.append(Object.assign(el('button', h), { disabled: true })); if (h !== 'Equipo') th.className = 'num'; head.append(th); }
  for (let i = 1; i <= n; i++) { const th = el('th', String(i), 'num pos-h'); head.append(th); }
  const thead = el('thead'); thead.append(head);
  const body = el('tbody');
  const pc = v => v < 0.005 ? '—' : v > 0.995 ? '>99 %' : Math.round(100 * v) + ' %';
  for (const r of sim.rows) {
    const tr = el('tr'); if (r.equipo === focus) tr.className = 'sim-focus';
    const top4 = r.pos.slice(0, 4).reduce((a, b) => a + b, 0), last2 = r.pos.slice(-2).reduce((a, b) => a + b, 0);
    const tl = el('a', r.equipo); tl.href = './equipo.html?n=' + encodeURIComponent(r.equipo); const tcell = el('td'); tcell.append(tl);
    tr.append(tcell, ...[r.w + '–' + r.l, signed(r.rating), fmt(r.vEsp), fmt(r.pEsp), pc(r.pos[0]), pc(top4), pc(last2)].map(v => el('td', v, 'num')));
    r.pos.forEach((p, i) => { const td = el('td', p >= 0.01 ? String(Math.round(100 * p)) : '', 'num heat-cell'); td.style.setProperty('--p', p.toFixed(3)); if (p > 0.5) td.style.color = '#fff'; td.title = `${r.equipo}: ${pc(p)} de acabar ${i + 1}.º`; tr.append(td); });
    body.append(tr);
  }
  t.append(thead, body);
  $('#simTable').replaceChildren(t);
  const next = games.filter(x => !x.score).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const firstRound = next[0]?.round;
  const upcoming = next.filter(x => x.round === firstRound || (focus && (x.home === focus || x.away === focus))).slice(0, 12);
  const nt = el('table', null, 'adv-table');
  nt.innerHTML = '<thead><tr><th>Fecha</th><th>Jornada</th><th>Local</th><th class="num">Prob. local</th><th>Visitante</th><th class="num">Margen esperado</th></tr></thead>';
  const nb = el('tbody');
  for (const x of upcoming) {
    const p = winProb(sim.model, x.home, x.away), m = sim.model.home + sim.model.ratings.get(x.home) - sim.model.ratings.get(x.away);
    const tr = el('tr');
    const fecha = new Date(x.date + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + (x.time || '');
    tr.append(el('td', fecha), el('td', x.round || ''), el('td', x.home, p >= .5 ? 'fav' : ''), el('td', Math.round(100 * p) + ' %', 'num'), el('td', x.away, p < .5 ? 'fav' : ''), el('td', (m >= 0 ? x.home.split(' ').slice(-1)[0] + ' +' : x.away.split(' ').slice(-1)[0] + ' +') + fmt(Math.abs(m)), 'num'));
    nb.append(tr);
  }
  nt.append(nb);
  $('#simNext').replaceChildren(nt);
}

function renderGlossary() {
  $('#glossary').replaceChildren(...Object.entries(GLOSSARY).flatMap(([k, v]) => [el('dt', k), el('dd', v)]));
}

let teamGroup = {};
function render() {
  for (const b of document.querySelectorAll('.adv-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll('.adv-panel')) p.hidden = p.id !== 'tab-' + tab;
  ({ equipos: renderTeams, jugadores: renderPlayers, quintetos: renderLineups, tiro: renderShots, simulador: renderSim, clutch: renderClutch, glosario: renderGlossary })[tab]();
  try { localStorage.setItem('adv-tab', tab); } catch {}
}
function fillTeams() {
  const g = $('#grupo').value, keep = $('#equipo').value;
  const names = data.equipos.filter(t => !g || t.grupo === g).map(t => t.equipo).sort((a, b) => a.localeCompare(b, 'es'));
  $('#equipo').replaceChildren(new Option('Todos', ''), ...names.map(n => new Option(n, n)));
  if (names.includes(keep)) $('#equipo').value = keep;
}

try {
  const r = await fetch('./api/avanzadas');
  if (!r.ok) throw Error();
  data = await r.json();
  teamGroup = Object.fromEntries(data.equipos.map(t => [t.equipo, t.grupo]));
  const pj = data.equipos.reduce((a, t) => a + t.pj, 0) / 2;
  $('#advMeta').textContent = `${pj} partidos · ${data.jugadores.length} jugadores · ${data.quintetos.length} quintetos con 5+ minutos juntos`;
  $('#advChecked').textContent = 'actualizado ' + new Date(data.checkedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
  const params = new URLSearchParams(location.search);
  try { tab = params.get('tab') || localStorage.getItem('adv-tab') || 'equipos'; } catch { tab = params.get('tab') || 'equipos'; }
  if (!document.getElementById('tab-' + tab)) tab = 'equipos';
  if (params.get('grupo')) $('#grupo').value = params.get('grupo');
  fillTeams();
  for (const b of document.querySelectorAll('.adv-tabs button')) b.onclick = () => { tab = b.dataset.tab; render(); };
  $('#grupo').onchange = () => { fillTeams(); render(); };
  for (const id of ['#equipo', '#escala', '#vista', '#minMin', '#minLineup', '#shotPlayer', '#shotType']) $(id).onchange = render;
  $('#q').oninput = render;
  $('#csv').onclick = () => {
    const cols = ['nombre', 'equipo', 'grupo', ...VIEWS[$('#vista').value].map(c => c[0])];
    const csv = [cols.join(';'), ...lastPlayers.map(p => cols.map(c => typeof p[c] === 'number' ? String(Math.round(p[c] * 10) / 10).replace('.', ',') : '"' + String(p[c] ?? '').replace(/"/g, '""') + '"').join(';'))].join('\n');
    const a = el('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'n1-jugadores-' + $('#vista').value + '.csv'; a.click();
  };
  render();
} catch {
  $('#advMeta').textContent = 'La estadística avanzada todavía no está disponible.';
}
