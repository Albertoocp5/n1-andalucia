#!/usr/bin/env python3
"""Recolector de la Liga Nacional N1 masculina desde Afición FAB, sin emulador.

Escribe en <destino>/ el mismo formato que datos-fab/ (calendario.json, grupos.json,
categorias.json y partidos/<hash>.json con fixture, partido, meta, local, visitante,
livePartido y jugadas), que valida scripts/cargar-fab.py.

  python3 recolectar.py ../datos-fab-vivo            # calendario + partidos nuevos/en juego
  python3 recolectar.py ../datos-fab-vivo --todo     # vuelve a descargar todos los finalizados
"""

import argparse, hashlib, json, re, sys, time, unicodedata, urllib.parse, urllib.request
from datetime import datetime
from pathlib import Path
from fab_api import Fab, CTX, UA

CATEGORIA, COMPETICION = "LIGA NACIONAL N1 MAS", "COMPETICIONES-FAB-26-27"


def estable(obj):
    """Quita los identificadores cifrados por sesión (cambian en cada ejecución) para que
    los archivos guardados solo cambien cuando cambian los datos."""
    if isinstance(obj, dict):
        return {k: estable(v) for k, v in obj.items()
                if not (isinstance(v, str) and len(v) >= 40 and all(c in "0123456789ABCDEF" for c in v))}
    if isinstance(obj, list):
        return [estable(v) for v in obj]
    return obj


def guardar(path, data):
    text = json.dumps(estable(data), ensure_ascii=False)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def key_partido(fixture):
    # Nombre de archivo estable entre sesiones (el IdPartido cambia con la sesión).
    raw = "|".join([fixture["group"], str(fixture["NumeroJornada"]), fixture["NombreEquipoLocal"].strip(),
                    fixture["NombreEquipoVisitante"].strip()])
    return hashlib.sha1(raw.encode()).hexdigest()[:20]


def clave(texto):
    """Mismo normalizado que la web (comun.js) y cargar-fab.py: sin tildes, mayúsculas, solo letras y cifras."""
    return re.sub(r"[^A-Z0-9]", "", unicodedata.normalize("NFD", texto).upper())


class Medios:
    """Escudos de los equipos y fotos de los jugadores de Afición FAB.

    Se guardan en <destino>/medios/ con un índice medios.json que la exportación copia a la web.
    Afición FAB devuelve un dibujo genérico (SVG) cuando no hay foto: eso no se guarda, y el
    jugador se vuelve a comprobar cada REVISAR días por si la federación la sube más tarde."""
    REVISAR = 14 * 86400

    def __init__(self, fab, out):
        self.fab, self.dir, self.indice = fab, out / "medios", out / "medios.json"
        (self.dir / "escudos").mkdir(parents=True, exist_ok=True)
        (self.dir / "fotos").mkdir(parents=True, exist_ok=True)
        self.d = json.loads(self.indice.read_text()) if self.indice.exists() else {}
        for k in ("escudos", "fotos", "jugadores"):
            self.d.setdefault(k, {})
        self.cambios = 0

    def _bajar(self, tipo, id_cifrado):
        base = self.fab.s.get("ruta") or "https://appaficionfab.gesdeportiva.es/"
        url = base + "imagenes.ashx?tipo=" + tipo + "&id=" + urllib.parse.quote(id_cifrado)
        time.sleep(0.3)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20, context=CTX) as r:
                datos, tipo_mime = r.read(), r.headers.get("content-type") or ""
        except Exception as e:  # una imagen que falla no debe parar la descarga de datos
            print("imagen no disponible", tipo, e)
            return None
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(tipo_mime.split(";")[0].strip())
        return (datos, ext) if datos and ext else None  # SVG = dibujo genérico, sin foto real

    def _guardar(self, carpeta, nombre, img):
        datos, ext = img
        ruta = self.dir / carpeta / (nombre + "." + ext)
        if not ruta.exists() or ruta.read_bytes() != datos:
            ruta.write_bytes(datos)
            self.cambios += 1
        return f"medios/{carpeta}/{nombre}.{ext}"

    def escudos(self, calendario):
        for p in calendario:
            for lado in ("Local", "Visitante"):
                equipo, img = p["NombreEquipo" + lado].strip(), p.get("ImgEquipo" + lado)
                if not img or clave(equipo) in self.d["escudos"]:
                    continue
                bajada = self._bajar("escudo", img)
                if bajada:
                    self.d["escudos"][clave(equipo)] = self._guardar("escudos", clave(equipo).lower(), bajada)

    def jugadores(self, vivo, fixture):
        ott = vivo.get("EnVivoJugadoresOTT") or {}
        ahora = time.time()
        for lado, equipo in (("Local", fixture["NombreEquipoLocal"]), ("Visitante", fixture["NombreEquipoVisitante"])):
            for j in ott.get("JugadoresEnVivo" + lado) or []:
                if not j.get("IdJugador") or not j.get("IdJugadorFoto"):
                    continue
                idj, k = str(j["IdJugador"]), clave(equipo) + "|" + clave(j["Nombre"])
                info = self.d["jugadores"].setdefault(idj, {})
                info.update(nombre=re.sub(r"\s*,\s*", ", ", j["Nombre"].strip()), equipo=equipo.strip())
                if info.get("foto") or ahora - info.get("comprobado", 0) < self.REVISAR:
                    if info.get("foto"):
                        self.d["fotos"][k] = info["foto"]
                    continue
                info["comprobado"] = int(ahora)
                bajada = self._bajar("jugador", j["IdJugadorFoto"])
                if bajada:
                    info["foto"] = self.d["fotos"][k] = self._guardar("fotos", idj, bajada)

    def cerrar(self):
        guardar(self.indice, self.d)
        print("Medios:", len(self.d["escudos"]), "escudos,", len(self.d["fotos"]), "fotos de",
              len(self.d["jugadores"]), "jugadores", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("destino", type=Path)
    ap.add_argument("--todo", action="store_true")
    ap.add_argument("--fotos", action="store_true", help="repasa todos los partidos jugados solo para buscar fotos")
    args = ap.parse_args()
    out = args.destino
    (out / "partidos").mkdir(parents=True, exist_ok=True)
    fab = Fab()

    cats = fab.call("busqueda.ashx", accion="buscarCategoria", texto="N1 MAS", skip="0")
    cat = next(c for c in cats["categorias"] if c["NombreCategoria"] == CATEGORIA
               and c["NombreCompeticion"].strip() == COMPETICION)
    guardar(out / "categorias.json", {"categorias": cats["categorias"]})
    grupos = fab.call("categoria.ashx", accion="fasesGrupos", id_categoria_competicion=cat["Id"])
    guardar(out / "grupos.json", {k: v for k, v in grupos.items() if k not in ("key", "id_dispositivo")})

    calendario = []
    for fase in grupos["listaFasesGrupo"]:
        for g in fase["Grupos"] or [{"IdGrupo": "", "NombreGrupo": fase["NombreFase"]}]:
            r = fab.call("categoria.ashx", accion="horariosJornadas", id_fase=fase["IdFase"], id_grupo=g["IdGrupo"],
                         id_ronda="", id_categoria_competicion=cat["Id"], fecha_inicial="", fecha_final="")
            letra = g["NombreGrupo"].replace("GRUPO", "").strip()
            for p in r["partidos"]:
                p["group"] = letra
                p["fase"] = fase["NombreFase"]
                calendario.append(p)
    guardar(out / "calendario.json", calendario)
    estados = {}
    for p in calendario:
        estados[p["Estado"]] = estados.get(p["Estado"], 0) + 1
    print("Calendario:", len(calendario), "partidos", estados, flush=True)

    medios = Medios(fab, out)
    medios.escudos(calendario)
    if args.fotos:
        for p in calendario:
            if p["Estado"] == "Terminado":
                v = fab.call("envivo/partido.ashx", id_partido=p["IdPartido"])
                if v.get("resultado") == "correcto":
                    medios.jugadores(v, p)
        medios.cerrar()
        return

    nuevos = 0
    for p in calendario:
        if p["Estado"] in ("No comenzado", "Aplazado", "Suspendido"):
            continue
        destino = out / "partidos" / (key_partido(p) + ".json")
        jugado = p["Estado"] == "Terminado"
        if jugado and destino.exists() and not args.todo:
            previo = json.loads(destino.read_text())
            if previo.get("fixture", {}).get("Resultados") == p.get("Resultados"):
                continue
        vivo = fab.call("envivo/partido.ashx", id_partido=p["IdPartido"])
        est = fab.call("envivo/estadisticas.ashx", id_partido=p["IdPartido"])
        if vivo.get("resultado") != "correcto" or est.get("resultado") != "correcto":
            print("sin datos", p["group"], p["NumeroJornada"], p["NombreEquipoLocal"], vivo.get("error"), est.get("error"))
            continue
        medios.jugadores(vivo, p)
        e = est["estadisticas"]
        registro = {
            "fixture": p,
            "partido": est["partido"],
            "meta": {k: e.get(k) for k in ("Temporada", "Categoria", "Delegacion", "Competicion")},
            "local": e.get("estadisticasequipolocal") or [],
            "visitante": e.get("estadisticasequipovisitante") or [],
            "livePartido": vivo["partido"],
            "jugadas": vivo["envivo"].get("historialacciones") or [],
            "enPista": {"local": vivo["envivo"].get("jugadoresenpistalocal"),
                        "visitante": vivo["envivo"].get("jugadoresenpistavisitante")},
            "capturado": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        tmp = destino.with_suffix(".tmp")
        tmp.write_text(json.dumps(estable(registro), ensure_ascii=False))
        tmp.replace(destino)
        nuevos += 1
        if nuevos % 10 == 0:
            print("Partidos descargados:", nuevos, flush=True)
    medios.cerrar()
    print("Partidos descargados:", nuevos, "· total en", out / "partidos", len(list((out / "partidos").glob("*.json"))))


if __name__ == "__main__":
    sys.exit(main())
