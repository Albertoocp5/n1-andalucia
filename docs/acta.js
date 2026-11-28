// Acta del partido (estadísticas individuales tipo acta FAB) y jugadores en pista.
// La usan la portada (ventana del partido) y dev/exportar.mjs (formato de api/actas/<id>.json).

/** Fila de estadísticas de Afición FAB → formato compacto de la web. */
export function filaFab(r) {
  const n = k => Number(r[k]) || 0;
  return {
    d: String(r.dorsal ?? ''), n: String(r.nombre || '').trim().replace(/\s*,\s*/, ', '), tit: !!r.quintetotitular,
    s: Math.round(n('milisegundos_jugados') / 1000), pts: n('puntos'),
    t1: [n('canasta1p'), n('tiro1p')], t2: [n('canasta2p'), n('tiro2p')], t3: [n('canasta3p'), n('tiro3p')],
    ro: n('reboteofensivo'), rd: n('rebotedefensivo'), ast: n('asistencias'), rob: n('recuperaciones'), per: n('perdidas'),
    tc: n('taponescometidos'), tr: n('taponesrecibidos'), fc: n('faltascometidas'), fr: n('faltasrecibidas'),
    val: n('valoracion'), mm: r.masMenos == null ? null : n('masMenos'),
  };
}

/** Acta completa a partir de un registro de Afición FAB (local/visitante/partido o estadísticas en vivo). */
export function actaFab(local, visitante, periodos) {
  return {
    equipos: [local, visitante].map(rows => (rows || []).filter(r => r.nombre && String(r.dorsal ?? '').trim() !== '' && !/^TOTAL/i.test(String(r.nombre).trim())).map(filaFab)),
    periodos: (periodos || []).map(p => [p.tanteo_periodo_local, p.tanteo_periodo_visitante]),
  };
}

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const pct = ([m, a]) => a ? Math.round(100 * m / a) + '%' : '—';
const signo = v => v == null ? '—' : v > 0 ? '+' + v : String(v);

// [cabecera, valor, solo analista, explicación]
const COLS = [
  ['MIN', f => f.s ? mmss(f.s) : '—', 0, 'Minutos jugados'],
  ['PTS', f => f.pts, 0, 'Puntos', f => f.pts],
  ['T2', f => f.t2.join('/'), 1, 'Tiros de dos: anotados/intentados'], ['T2%', f => pct(f.t2), 1, 'Acierto en tiros de dos'],
  ['T3', f => f.t3.join('/'), 0, 'Triples: anotados/intentados'], ['T3%', f => pct(f.t3), 1, 'Acierto en triples'],
  ['TL', f => f.t1.join('/'), 1, 'Tiros libres: anotados/intentados'], ['TL%', f => pct(f.t1), 1, 'Acierto en tiros libres'],
  ['RO', f => f.ro, 1, 'Rebotes ofensivos'], ['RD', f => f.rd, 1, 'Rebotes defensivos'], ['REB', f => f.ro + f.rd, 0, 'Rebotes totales', f => f.ro + f.rd],
  ['AST', f => f.ast, 0, 'Asistencias', f => f.ast], ['ROB', f => f.rob, 1, 'Robos (recuperaciones)', f => f.rob], ['PER', f => f.per, 1, 'Pérdidas'],
  ['TAP', f => f.tc, 1, 'Tapones puestos', f => f.tc], ['TAPR', f => f.tr, 1, 'Tapones recibidos'],
  ['FC', f => f.fc, 0, 'Faltas cometidas (5 = eliminado)'], ['FR', f => f.fr, 1, 'Faltas recibidas'],
  ['+/-', f => signo(f.mm), 1, 'Diferencia en el marcador con él en pista'], ['VAL', f => f.val, 0, 'Valoración', f => f.val],
];

/** Jugador con mayor valoración del partido (en caso de empate, más puntos). */
export function mejorDelPartido(acta) {
  let mejor = null;
  acta.equipos.forEach((filas, lado) => filas.forEach(f => {
    if (!f.s && !f.pts) return;
    if (!mejor || f.val > mejor.f.val || (f.val === mejor.f.val && f.pts > mejor.f.pts)) mejor = { f, lado };
  }));
  return mejor;
}

const suma = filas => {
  const t = { d: '', n: 'Total', s: 0, pts: 0, t1: [0, 0], t2: [0, 0], t3: [0, 0], ro: 0, rd: 0, ast: 0, rob: 0, per: 0, tc: 0, tr: 0, fc: 0, fr: 0, val: 0, mm: null };
  for (const f of filas) for (const k of Object.keys(t)) {
    if (Array.isArray(t[k])) { t[k][0] += f[k][0]; t[k][1] += f[k][1]; }
    else if (typeof t[k] === 'number') t[k] += f[k] || 0;
  }
  return t;
};

/**
 * Tablas del acta. opciones: { equipos: [local, visitante] (nombres ya legibles), jugador(nombreActa) → texto,
 * enlace(fila, lado) → href o null, enPista: [Set(dorsales), Set(dorsales)] }
 */
export function pintarActa(acta, { equipos, jugador = x => x, enlace = () => null, enPista } = {}) {
  const box = el('div', null, 'acta');
  const todos = acta.equipos.flat();
  const maximos = COLS.map(c => c[4] ? Math.max(...todos.map(c[4])) : null);
  const mvp = mejorDelPartido(acta);
  if (acta.periodos?.length) {
    const t = el('table', null, 'acta-cuartos'), h = el('tr');
    h.append(el('th', ''), ...acta.periodos.map((_, i) => el('th', i < 4 ? i + 1 + '.º' : 'Pr' + (i > 4 ? i - 3 : ''))), el('th', 'Total'));
    t.append(h);
    for (const lado of [0, 1]) {
      const tr = el('tr');
      tr.append(el('td', equipos[lado], 'l'), ...acta.periodos.map(p => el('td', p[lado] ?? '—')), el('td', String(acta.periodos.reduce((a, p) => a + (Number(p[lado]) || 0), 0)), 'tot'));
      t.append(tr);
    }
    const w = el('div', null, 'table-wrap'); w.append(t); box.append(w);
  }
  acta.equipos.forEach((filas, lado) => {
    if (!filas.length) return;
    box.append(el('h3', equipos[lado]));
    const t = el('table', null, 'adv-table acta-tabla'), h = el('tr');
    h.append(el('th', '#'), el('th', 'Jugador', 'l'));
    for (const [c, , ana, tip] of COLS) { const th = el('th', c, ana ? 'num solo-ana' : 'num'); th.dataset.tipText = tip; h.append(th); }
    const thead = el('thead'); thead.append(h);
    const tb = el('tbody');
    const orden = [...filas].sort((a, b) => b.tit - a.tit || b.s - a.s || Number(a.d) - Number(b.d));
    for (const f of [...orden, suma(filas)]) {
      const total = f.n === 'Total' && f.d === '';
      const tr = el('tr', null, [total ? 'tot' : '', f.fc >= 5 && !total ? 'elim' : f.fc === 4 && !total ? 'cargado' : '', enPista?.[lado]?.has(f.d) ? 'jugando' : ''].filter(Boolean).join(' '));
      tr.append(el('td', f.d + (f.tit && !total ? '*' : ''), 'dor'));
      const td = el('td', null, 'l');
      const href = total ? null : enlace(f, lado);
      const nombre = total ? 'Total' : jugador(f.n);
      if (href) { const a = el('a', nombre); a.href = href; td.append(a); } else td.append(document.createTextNode(nombre));
      if (!total && enPista?.[lado]?.has(f.d)) td.append(el('span', '● en pista', 'pista-tag'));
      if (!total && f.fc >= 5) td.append(el('span', 'eliminado', 'falta-tag'));
      if (!total && mvp && mvp.f === f) { td.append(el('span', '★ MVP', 'mvp-tag')); tr.classList.add('mvp'); }
      tr.append(td);
      COLS.forEach(([, v, ana, , num], i) => {
        const top = !total && num && maximos[i] > 0 && num(f) === maximos[i];
        const td2 = el('td', String(v(f)), (ana ? 'num solo-ana' : 'num') + (top ? ' maximo' : ''));
        if (top) td2.title = 'Máximo del partido';
        tr.append(td2);
      });
      tb.append(tr);
    }
    t.append(thead, tb);
    const w = el('div', null, 'table-wrap'); w.append(t); box.append(w);
  });
  box.append(el('p', '* titular · ★ MVP: mejor valoración del partido · en negrita, el máximo del partido en cada estadística · fila resaltada: 4 faltas · nombre tachado: eliminado (5 faltas) · ● en pista: jugando ahora.', 'acta-nota'));
  return box;
}

/** Bloque «En pista ahora»: los cinco de cada equipo con sus puntos, faltas y minutos. */
export function pintarEnPista(enPista, { equipos, jugador = x => x, avatar }) {
  const box = el('div', null, 'en-pista');
  enPista.forEach((lista, lado) => {
    const col = el('div', null, 'en-pista-equipo');
    col.append(el('h4', equipos[lado]));
    const ul = el('ul');
    for (const j of lista || []) {
      const li = el('li', null, Number(j.faltas) >= 4 ? 'cargado' : '');
      if (avatar) li.append(avatar(j));
      li.append(el('b', '#' + j.dorsal), el('span', jugador(j.nombre), 'n'),
        el('span', `${j.puntos} pts · ${j.faltas} faltas · ${j.minutos}`, 'st'));
      ul.append(li);
    }
    if (!(lista || []).length) ul.append(el('li', 'Sin datos de quinteto en este momento.'));
    col.append(ul); box.append(col);
  });
  return box;
}
