#!/usr/bin/env python3
"""Recolector de la Liga Nacional N1 masculina desde Afición FAB, sin emulador.

Escribe en <destino>/ el mismo formato que datos-fab/ (calendario.json, grupos.json,
categorias.json y partidos/<hash>.json con fixture, partido, meta, local, visitante,
livePartido y jugadas), que valida scripts/cargar-fab.py.

  python3 recolectar.py ../datos-fab-vivo            # calendario + partidos nuevos/en juego
  python3 recolectar.py ../datos-fab-vivo --todo     # vuelve a descargar todos los finalizados
"""

import argparse, hashlib, json, sys
from datetime import datetime
from pathlib import Path
from fab_api import Fab

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("destino", type=Path)
    ap.add_argument("--todo", action="store_true")
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
    print("Partidos descargados:", nuevos, "· total en", out / "partidos", len(list((out / "partidos").glob("*.json"))))


if __name__ == "__main__":
    sys.exit(main())
