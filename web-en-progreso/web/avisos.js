// Avisos del partido de tu equipo mientras la web está abierta (aunque sea en otra pestaña):
// inicio, final de cada cuarto, último minuto del 4.º cuarto, prórroga y final.
// Cada navegador recibe los suyos; si se cierra la web, dejan de llegar a ese navegador.
const ACTIVOS = 'n1-avisos', HECHOS = 'n1-avisados';
const leer = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const soportados = () => 'Notification' in window;
export const activos = () => soportados() && Notification.permission === 'granted' && leer(ACTIVOS, false);

let registro = null;
async function prepararServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try { registro ??= await navigator.serviceWorker.register('/sw.js'); return registro; } catch { return null; }
}

/** Pide permiso y activa los avisos. Devuelve true si quedan activos. */
export async function activar() {
  if (!soportados()) return false;
  const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  escribir(ACTIVOS, permiso === 'granted');
  if (permiso === 'granted') await prepararServiceWorker();
  return permiso === 'granted';
}
export const desactivar = () => escribir(ACTIVOS, false);

async function mostrar(titulo, cuerpo, { etiqueta, url, icono }) {
  const opciones = { body: cuerpo, tag: etiqueta, renotify: true, icon: icono, badge: icono, data: { url } };
  const reg = await prepararServiceWorker();
  try {
    if (reg?.showNotification) return await reg.showNotification(titulo, opciones);
  } catch {}
  try { const n = new Notification(titulo, opciones); n.onclick = () => { window.focus(); location.href = url; }; } catch {}
}

const nombreCuarto = p => p <= 4 ? ['1.er', '2.º', '3.er', '4.º'][p - 1] + ' cuarto' : 'la prórroga' + (p > 5 ? ' ' + (p - 4) : '');
const segundos = t => { const m = /^(\d\d):(\d\d):(\d\d)/.exec(String(t || '')); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };

/**
 * Revisa el directo del partido de tu equipo y lanza los avisos nuevos.
 * dato: lo que devuelve directo.consultar() para ese partido; nombres: [local, visitante] legibles.
 */
export function revisar(id, dato, nombres, { url, icono } = {}) {
  if (!activos() || !dato?.raw) return;
  const hist = (dato.raw.envivo?.historialacciones || []).filter(a => String(a.eliminado).toLowerCase() !== 'true')
    .sort((a, b) => a.autoincremental_id - b.autoincremental_id);
  const [l, v] = dato.score;
  const marcador = `${nombres[0]} ${l}-${v} ${nombres[1]}`;
  const eventos = [];
  if (hist.length) eventos.push(['inicio', 'Empieza el partido', `${nombres[0]} – ${nombres[1]}`]);
  for (const a of hist) {
    if (a.accion_tipo !== 'FINAL-PERIODO') continue;
    const p = Number(a.numero_periodo);
    if (p === 2) eventos.push(['fin-2', 'Descanso', marcador]);
    else if (p < 4) eventos.push(['fin-' + p, 'Final del ' + nombreCuarto(p), marcador]);
    else if (p >= 4 && l === v && dato.status !== 'Final') eventos.push(['fin-' + p, p === 4 ? '¡Prórroga!' : '¡Otra prórroga!', 'Empate a ' + l + ' · ' + marcador]);
    else if (p > 4) eventos.push(['fin-' + p, 'Final de ' + nombreCuarto(p), marcador]);
  }
  const ultima = hist.at(-1);
  if (ultima && Number(ultima.numero_periodo) === 4 && ultima.accion_tipo !== 'FINAL-PERIODO') {
    const s = segundos(ultima.tiempo_partido);
    if (s != null && s <= 60 && s > 0) eventos.push(['ultimo-minuto', 'Último minuto', marcador]);
  }
  if (dato.status === 'Final') eventos.push(['final', 'Final del partido', marcador]);

  const hechos = leer(HECHOS, {});
  const primeraVez = !(id in hechos);
  const vistos = new Set(hechos[id] || []);
  // Al abrir la web con el partido ya empezado no se avisa de lo que ya pasó: solo de lo último.
  const nuevos = eventos.filter(([k]) => !vistos.has(k));
  const avisar = primeraVez ? nuevos.slice(-1).filter(([k]) => k === 'final' || k === 'ultimo-minuto' || hist.length < 15) : nuevos;
  for (const [k] of nuevos) vistos.add(k);
  hechos[id] = [...vistos];
  // limpiar partidos antiguos (más de 40 guardados)
  const claves = Object.keys(hechos); if (claves.length > 40) delete hechos[claves[0]];
  escribir(HECHOS, hechos);
  for (const [k, titulo, cuerpo] of avisar) mostrar(titulo, cuerpo, { etiqueta: id + '-' + k, url, icono });
}
