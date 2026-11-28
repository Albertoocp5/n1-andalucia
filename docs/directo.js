// Directo sin retraso: el navegador consulta Afición FAB (la misma API pública que usa la app
// oficial, que permite peticiones desde otras webs) solo mientras hay partidos de la N1 en juego
// o a punto de empezar. Si la federación no responde, la web sigue con los datos publicados en
// GitHub (actualizados cada ~5 minutos durante la jornada).
import { actaFab } from './acta.js';
const BASE = 'https://appaficionfab.gesdeportiva.es/';
const SESION = 'n1-fab-sesion';
const CATEGORIA = 'LIGA NACIONAL N1 MAS', COMPETICION = 'COMPETICIONES-FAB-26-27';
const clave = s => String(s ?? '').normalize('NFD').toUpperCase().replace(/[^A-Z0-9]/g, '');

let ses = (() => { try { return JSON.parse(localStorage.getItem(SESION)) || {}; } catch { return {}; } })();
const guardar = () => { try { localStorage.setItem(SESION, JSON.stringify(ses)); } catch {} };

async function post(url, campos) {
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams(campos) });
  if (!r.ok) throw Error('Afición FAB ' + r.status);
  return r.json();
}

// Sesión de invitado, como la app: se registra una vez por navegador y se renueva cada hora.
async function entrar(forzar = false) {
  if (!forzar && ses.key && ses.hasta > Date.now()) return;
  if (!ses.uid) ses.uid = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const comun = { uid: ses.uid, plataforma: 'android', tipo_dispositivo: 'mobile', version: '50014' };
  const r = ses.id_dispositivo
    ? await post(BASE + 'dispositivo.ashx', { accion: 'acceso', ...comun, id_dispositivo: ses.id_dispositivo, token_push: '' })
    : await post(BASE + 'dispositivo.ashx', { accion: 'registrar', ...comun });
  if (r.resultado !== 'correcto') {
    if (ses.id_dispositivo && !forzar) { delete ses.id_dispositivo; return entrar(true); }
    throw Error('Sesión rechazada');
  }
  for (const k of ['key', 'id_dispositivo', 'ruta']) if (r[k]) ses[k] = r[k];
  ses.hasta = Date.now() + 50 * 60e3;
  guardar();
}

// Las consultas van de una en una: cada respuesta trae la clave para la siguiente.
let cola = Promise.resolve();
function llamar(ruta, campos) {
  const tarea = cola.then(async () => {
    await entrar();
    const url = (ses.ruta || BASE) + 'v2/' + ruta;
    let r = await post(url, { id_dispositivo: ses.id_dispositivo, key: ses.key, ...campos });
    if (r?.resultado && r.resultado !== 'correcto') {
      await entrar(true);
      r = await post(url, { id_dispositivo: ses.id_dispositivo, key: ses.key, ...campos });
    }
    if (r?.resultado === 'correcto' && r.key) { ses.key = r.key; guardar(); }
    return r;
  });
  cola = tarea.catch(() => {});
  return tarea;
}

// Calendario de la federación (los identificadores de partido cambian con cada sesión).
let calendario = null, calendarioHora = 0;
async function cargarCalendario() {
  if (calendario && Date.now() - calendarioHora < 15 * 60e3 && calendario.ses === ses.id_dispositivo) return calendario;
  const cats = await llamar('busqueda.ashx', { accion: 'buscarCategoria', texto: 'N1 MAS', skip: '0' });
  const cat = (cats.categorias || []).find(c => c.NombreCategoria === CATEGORIA && c.NombreCompeticion.trim() === COMPETICION);
  if (!cat) throw Error('Categoría no encontrada');
  const gr = await llamar('categoria.ashx', { accion: 'fasesGrupos', id_categoria_competicion: cat.Id });
  const lista = [];
  for (const fase of gr.listaFasesGrupo || []) for (const g of fase.Grupos || []) {
    const r = await llamar('categoria.ashx', { accion: 'horariosJornadas', id_fase: fase.IdFase, id_grupo: g.IdGrupo, id_ronda: '', id_categoria_competicion: cat.Id, fecha_inicial: '', fecha_final: '' });
    const letra = g.NombreGrupo.replace('GRUPO', '').trim();
    for (const p of r.partidos || []) lista.push({ ...p, group: letra });
  }
  calendario = { ses: ses.id_dispositivo, lista };
  calendarioHora = Date.now();
  return calendario;
}

const inicio = p => Number((p.FechaHoraUTC || '').match(/\d+/)?.[0]) || 0;
const plantillas = new Map();

/** Partidos de la web que hay que seguir ahora: en juego, o sin terminar y con hora de inicio
 *  entre hace 3 horas y dentro de 40 minutos (hora de Madrid). */
export function hayQueSeguir(games) {
  const ahora = Date.now();
  return games.some(g => {
    if (g.status === 'En juego') return true;
    if (g.status === 'Final' || !g.date || !/^\d\d:\d\d/.test(g.time || '')) return false;
    const falta = madrid(g.date, g.time) - ahora;
    // hasta 12 horas después del inicio: si GitHub aún no ha publicado el resultado, se recoge de la federación
    return falta < 40 * 60e3 && falta > -12 * 3600e3;
  });
}
function madrid(fecha, hora) {
  // Fecha y hora de Madrid → milisegundos UTC (con el cambio de hora correcto).
  const base = Date.parse(fecha + 'T' + hora.slice(0, 5) + ':00Z');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(base)).map(x => [x.type, x.value]));
  const comoMadrid = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return base - (comoMadrid - base);
}

/** Consulta la federación y devuelve, por partido (grupo+local/visitante), marcador, estado y reloj. */
export async function consultar(games = []) {
  const { lista } = await cargarCalendario();
  const ahora = Date.now(), out = new Map();
  const id = p => p.group + clave(p.NombreEquipoLocal) + '/' + clave(p.NombreEquipoVisitante);
  // partidos que la web aún no tiene como terminados (para recoger el resultado final aunque GitHub vaya tarde)
  const pendientes = new Set(games.filter(g => g.status !== 'Final').map(g => g.group + clave(g.home) + '/' + clave(g.away)));
  const vigilar = lista.filter(p => ['En juego', 'En curso'].includes(p.Estado)
    || (!['Terminado', 'Aplazado', 'Suspendido'].includes(p.Estado) && ahora - inicio(p) < 3 * 3600e3 && inicio(p) - ahora < 5 * 60e3)
    || (p.Estado === 'Terminado' && pendientes.has(id(p)) && ahora - inicio(p) < 12 * 3600e3 && ahora > inicio(p)));
  for (const p of vigilar) {
    const r = await llamar('envivo/partido.ashx', { id_partido: p.IdPartido });
    if (r?.resultado !== 'correcto' || !r.partido) continue;
    const cab = r.partido, hist = (r.envivo?.historialacciones || []).filter(a => String(a.eliminado).toLowerCase() !== 'true');
    const fin = cab.estado_partido === 'FINALIZADO';
    if (!fin && !hist.length) continue; // aún no ha empezado
    const ultima = hist.reduce((a, b) => (b.autoincremental_id > (a?.autoincremental_id ?? -1) ? b : a), null);
    out.set(id(p), {
      status: fin ? 'Final' : 'En juego',
      score: [Number(cab.tanteo_local) || 0, Number(cab.tanteo_visitante) || 0],
      clock: fin ? '' : reloj(ultima),
      raw: r, partido: p,
    });
  }
  return out;
}

function reloj(a) {
  if (!a) return '';
  const per = Number(a.numero_periodo), q = per > 4 ? 'prórroga' + (per > 5 ? ' ' + (per - 4) : '') : per + '.º cuarto';
  const t = String(a.tiempo_partido || '').slice(3, 8);
  if (a.accion_tipo === 'FINAL-PERIODO') return per === 2 ? 'descanso' : 'fin del ' + q;
  return q + (t && t !== '10:00' && t !== '05:00' ? ' · quedan ' + t : '');
}

/** Jugada a jugada en el mismo formato que /api/jugadas-fab (ver scripts/cargar-fab.py). */
export async function jugadas(dato) {
  const { raw, partido: p } = dato, cab = raw.partido;
  let plantilla = plantillas.get(p.IdPartido);
  if (!plantilla) {
    const est = await llamar('envivo/estadisticas.ashx', { id_partido: p.IdPartido }).catch(() => null);
    const e = est?.estadisticas || {};
    plantilla = [e.estadisticasequipolocal, e.estadisticasequipovisitante].map(rows => Object.fromEntries((rows || []).filter(x => x.dorsal).map(x => [String(x.dorsal), x.nombre.trim()])));
    plantillas.set(p.IdPartido, plantilla);
  }
  const ids = [cab.idlocal, cab.idvisitante];
  const fuente = raw.envivo?.historialacciones || [];
  const orden = fuente.map((a, i) => [a, i]).sort((x, y) => x[0].autoincremental_id - y[0].autoincremental_id || y[1] - x[1]).map(x => x[0]);
  const vistos = new Map(), marcador = [0, 0], events = [];
  for (const a of orden) {
    if (String(a.eliminado).toLowerCase() === 'true') continue;
    const lado = ids.indexOf(a.equipo_id);
    const dorsal = /^\d{1,3}$/.test(String(a.dorsal ?? '')) ? String(a.dorsal) : '';
    const pts = [Number(a.puntos_local) || 0, Number(a.puntos_visitante) || 0];
    // Marcador acumulado a partir de las canastas (cuadra con el acta en los 167 partidos jugados).
    let sc = null;
    const m = /^CANASTA-([123])P$/.exec(a.accion_tipo || '');
    if (m && lado >= 0) { marcador[lado] += Number(m[1]); sc = [...marcador]; }
    const n = vistos.get(a.autoincremental_id) || 0; vistos.set(a.autoincremental_id, n + 1);
    events.push([a.autoincremental_id * 10 + n, a.numero_periodo, a.tiempo_partido || '', a.accion_tipo, lado, dorsal, lado >= 0 ? plantilla[lado][dorsal] || '' : '', sc, pts, null, null]);
  }
  return { events, status: dato.status, checkedAt: new Date().toISOString(), score: dato.score };
}

/** Acta en directo (estadísticas de cada jugador) y quién está en pista ahora mismo. */
export async function actaDirecto(dato) {
  const { raw, partido: p } = dato;
  const est = await llamar('envivo/estadisticas.ashx', { id_partido: p.IdPartido });
  if (est?.resultado !== 'correcto') throw Error('Acta no disponible');
  const e = est.estadisticas || {};
  const local = e.estadisticasequipolocal || [], visitante = e.estadisticasequipovisitante || [];
  plantillas.set(p.IdPartido, [local, visitante].map(rows => Object.fromEntries(rows.filter(x => x.dorsal).map(x => [String(x.dorsal), x.nombre.trim()]))));
  return {
    acta: actaFab(local, visitante, est.partido?.periodos || raw.partido?.periodos),
    enPista: [raw.envivo?.jugadoresenpistalocal || [], raw.envivo?.jugadoresenpistavisitante || []],
    hora: new Date().toISOString(),
  };
}
