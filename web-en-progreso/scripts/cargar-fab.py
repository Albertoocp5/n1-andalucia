#!/usr/bin/env python3
"""Validate an Afición FAB capture and import the season into the existing Site."""

import argparse
from collections import Counter
from datetime import datetime
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
from tempfile import NamedTemporaryFile
from time import sleep
import unicodedata

ROOT = Path(__file__).resolve().parent.parent
IMPORT_PDF = runpy.run_path(str(ROOT / "scripts" / "importar-fab.py"))
MINUTES = IMPORT_PDF["minutes"]
SITE = IMPORT_PDF["SITE"]
STATS_FIELDS = ("rebotes", "asistencias", "recuperaciones", "perdidas",
                "taponescometidos", "faltascometidas", "faltasrecibidas", "masMenos", "valoracion")


def words(value):
    value = unicodedata.normalize("NFD", value).upper()
    return re.sub(r"[^A-Z0-9]", "", value)


def fixture_key(group, home, away):
    return (group, words(home), words(away))


def source_key(record):
    return fixture_key(record["group"], record["NombreEquipoLocal"], record["NombreEquipoVisitante"])


def schedule(source, seed):
    teams = {fixture_key(g["group"], g["home"], g["away"]): g for g in seed}
    fixtures = {}
    for item in source:
        if item["Categoria"].strip() != "LIGA NACIONAL N1 MAS" or item["Competicion"].strip() != "COMPETICIONES-FAB-26-27":
            raise ValueError("El calendario incluye otra competición")
        base = teams[source_key(item)]
        id = base["url"].split("?")[0].rsplit("/",1)[-1]
        if id in fixtures:
            raise ValueError("Partido FAB duplicado")
        statuses = {"Terminado":"Final", "No comenzado":"Programado", "En juego":"En juego",
                    "En curso":"En juego", "Comenzado":"En juego", "Aplazado":"Aplazado", "Suspendido":"Suspendido"}
        status = statuses.get(item["Estado"])
        if status is None:  # estado nuevo de la FAB: se decide por si hay marcador
            has_score = any(str((item.get("Resultados") or {}).get(k) or "").strip() not in ("", "0")
                            for k in ("ResultadoLocal", "ResultadoVisitante"))
            status = "En juego" if has_score else "Programado"
            print("Aviso: estado FAB desconocido", repr(item["Estado"]), "→", status, flush=True)
        # Recién empezado, la FAB pone «-» como resultado: entonces 0-0 (el marcador real llega de las jugadas).
        raw = [str((item.get("Resultados") or {}).get(k) or "").strip() for k in ("ResultadoLocal", "ResultadoVisitante")]
        score = [int(v) if v.isdigit() else 0 for v in raw] if status in ("Final","En juego") else None
        if status == "Final" and not all(v.isdigit() for v in raw):
            score = None
        match = {"id": id, "date": datetime.strptime(item["Fecha"], "%d/%m/%Y").date().isoformat(),
                 "time": item["Hora"][:5], "round": f"Jornada {item['NumeroJornada']}",
                 "venue": item["CampoJuego"].strip(), "status": status, "score": score}
        fixtures[id] = (base, match)
    if len(fixtures) != len(seed):
        raise ValueError("El calendario oficial no cubre todas las fichas del sitio")
    return {fixture_key(base["group"],base["home"],base["away"]): match for base,match in fixtures.values()}


def team_rows(items, points):
    rows = []
    for p in items:
        if not p.get("componente_id"):
            continue
        shots = [f"{int(p[f'canasta{n}p'])}/{int(p[f'tiro{n}p'])}" for n in (2,3,1)]
        name = re.sub(r"\s*,\s*", ", ", p["nombre"].strip())
        rows.append([name, MINUTES(p["tiempo_jugado"]), str(p["puntos"]), *shots, *(str(p[k]) for k in STATS_FIELDS)])
    if not rows or sum(int(r[2]) for r in rows) != points:
        raise ValueError("Los puntos individuales no suman el marcador de la FAB")
    return rows


SIDES = (("local","NombreEquipoLocal"),("visitante","NombreEquipoVisitante"))
# Identificador oficial de equipo FAB -> nombre del calendario. Se aprende de las
# actas cuyo nombre coincide literalmente con el calendario y sirve para aceptar
# las actas que usan la denominación del club (p. ej. CD BALONCESTO ADRA 2012).
TEAM_IDS = {}


def learn_team_ids(records):
    for record in records:
        header, fixture = record.get("partido") or {}, record["fixture"]
        for side, key in SIDES:
            team_id = header.get("id"+side)
            if team_id and words(header.get(side,"")) == words(fixture[key]):
                name = TEAM_IDS.setdefault(team_id, words(fixture[key]))
                if name != words(fixture[key]):
                    raise ValueError(f"El equipo FAB {team_id} figura con dos nombres de calendario")


def same_team(header, fixture, side, key):
    if words(header[side]) == words(fixture[key]):
        return True
    return TEAM_IDS.get(header["id"+side]) == words(fixture[key])


def box_report(record, game):
    header = record["partido"]
    meta = record["meta"]
    if (meta["Competicion"].strip(),meta["Temporada"].strip(),meta["Categoria"].strip()) != ("COMPETICIONES-FAB-26-27","Temporada 2026/2027","N1 MAS"):
        raise ValueError("Informe FAB de otra competición o temporada")
    fixture = record["fixture"]
    live = record.get("livePartido") or {}
    if any(live.get("id"+side, header["id"+side]) != header["id"+side] for side,_ in SIDES):
        raise ValueError("Identificadores de equipo distintos entre acta y jugadas")
    if not all(same_team(header,fixture,side,key) for side,key in SIDES):
        raise ValueError("Enfrentamiento incorrecto en el acta")
    if header["estado_partido"] != "FINALIZADO" or [header["tanteo_local"],header["tanteo_visitante"]] != game["score"]:
        raise ValueError("Marcador final del acta distinto del calendario FAB")
    teams = [{"team":fixture[key].strip(), "rows":team_rows(record[side],game["score"][i])}
             for i,(side,key) in enumerate(SIDES)]
    return {"id":game["id"],"year":"2026/2027","date":game["date"],"round":game["round"],"score":game["score"],"teams":teams}


def play_report(record, game):
    header = record["livePartido"]
    if [header["tanteo_local"],header["tanteo_visitante"]] != game["score"]:
        raise ValueError("Marcador de las jugadas distinto del calendario FAB")
    roster = [{r["dorsal"]:r["nombre"].strip() for r in record.get(side,[]) if r.get("dorsal")} for side in ("local","visitante")]
    ids = [header["idlocal"],header["idvisitante"]]
    plays = []
    # La FAB entrega las jugadas de la más reciente a la más antigua. Se ordenan por
    # su identificador y, si dos acciones lo comparten, por su posición oficial.
    source = record["jugadas"]
    ordered = sorted(range(len(source)), key=lambda i: (source[i]["autoincremental_id"], -i))
    seen = Counter()
    for action in (source[i] for i in ordered):
        if str(action.get("eliminado", "")).lower() == "true":
            continue
        team = action.get("equipo_id")
        side = ids.index(team) if team in ids else -1
        dorsal = str(action.get("dorsal",""))
        dorsal = dorsal if re.fullmatch(r"\d{1,3}",dorsal) else ""
        player = roster[side].get(dorsal,"") if side>=0 else ""
        score = [action.get("tanteoLocal"),action.get("tanteoVisitante")]
        score = score if all(isinstance(i,int) for i in score) else None
        clock = action.get("tiempo_partido") or ""
        points = [int(action.get("puntos_local") or 0), int(action.get("puntos_visitante") or 0)]
        coords = [action.get(k) for k in ("posicion_x","posicion_y")]
        coords = [v if type(v) in (float,int) else None for v in coords]
        # Secuencia = identificador FAB x 10 + orden dentro del identificador: conserva
        # el identificador original (seq // 10) sin renumerar ni descartar acciones.
        seq = action["autoincremental_id"]*10 + seen[action["autoincremental_id"]]
        seen[action["autoincremental_id"]] += 1
        if seen[action["autoincremental_id"]] > 10:
            raise ValueError("Demasiadas acciones con el mismo identificador")
        plays.append([seq,action["numero_periodo"],clock,
                      action["accion_tipo"],side,dorsal,player,score,points,*coords])
    if not plays or len({row[0] for row in plays})!=len(plays):
        raise ValueError("Secuencia vacía o con identificadores duplicados")
    return {"id":game["id"],"score":game["score"],"events":plays}


def post(route, payload, token):
    with NamedTemporaryFile(mode="w", encoding="utf-8") as data:
        json.dump(payload,data,ensure_ascii=False)
        data.flush()
        p = subprocess.run(["/usr/bin/curl","--silent","--show-error","--fail-with-body",
                            "--max-time","28","--config","-","--data-binary","@"+data.name,SITE+route],
                           input=f'header = "Authorization: Bearer {token}"\nheader = "Content-Type: application/json"\n',
                           encoding="utf-8",capture_output=True)
    try:
        response = json.loads(p.stdout)
    except ValueError:
        response = {"error": f"Respuesta no disponible (curl {p.returncode})."}
    if p.returncode or "error" in response:
        raise RuntimeError(response.get("error","Error del sitio"))
    return response


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captura", type=Path)
    parser.add_argument("--publicar",action="store_true")
    args=parser.parse_args()
    capture=args.captura
    seed=json.loads((ROOT/"web"/"season.json").read_text())["games"]
    fixtures=schedule(json.loads((capture/"calendario.json").read_text()),seed)
    learn_team_ids(json.loads(path.read_text()) for path in sorted((capture/"partidos").glob("*.json")))
    board={"games":list(fixtures.values())}
    outcomes=Counter()
    reports={}
    for path in sorted((capture/"partidos").glob("*.json")):
        data=json.loads(path.read_text())
        game=fixtures[source_key(data["fixture"])]
        live=data.get("livePartido") or {}
        if game["status"]=="En juego" and all(isinstance(live.get(k),int) for k in ("tanteo_local","tanteo_visitante")):
            # durante el partido el calendario y las jugadas se piden con segundos de diferencia:
            # manda el marcador de las jugadas para que la secuencia y el parcial coincidan
            game["score"]=[live["tanteo_local"],live["tanteo_visitante"]]
        entry=(game["id"],data["fixture"]["group"],game["round"])
        if entry[0] in reports:
            raise ValueError("La captura contiene informes de partido duplicados")
        reports[entry[0]]={}
        for category, converter in (("actas",box_report),("jugadas",play_report)):
            try:
                reports[entry[0]][category] = converter(data,game)
            except (KeyError,TypeError,ValueError) as error:
                print(category,*entry[1:],data["fixture"]["NombreEquipoLocal"],"—",str(error),flush=True)
                outcomes["sin_"+category]+=1
            else:
                outcomes[category]+=1
                if category=="jugadas":
                    outcomes["acciones"]+=len(reports[entry[0]][category]["events"])
    print("Calendario:",len(fixtures),"Finalizados:",sum(g["status"]=="Final" for g in fixtures.values()),
          "Capturados:",len(reports),dict(outcomes),flush=True)
    if not args.publicar:
        return
    token=Path(os.environ.get("N1_TOKEN_FILE", ROOT/".fab-import-token")).read_text().strip()
    if not re.fullmatch(r"[a-f0-9]{64}",token):
        raise ValueError("Credencial local de publicación no válida")
    print(post("/api/calendario-fab",board,token),flush=True)
    loaded=Counter()
    errors=False
    for index,(id,items) in enumerate(reports.items(),1):
        for category, route in (("actas","/api/actas-fab"),("jugadas","/api/jugadas-fab")):
            if category not in items:
                continue
            try:
                post(route,items[category],token)
            except RuntimeError as error:
                print(category,id,str(error),flush=True)
                errors=True
            else:
                loaded[category]+=1
                if category=="jugadas":
                    loaded["acciones"]+=len(items[category]["events"])
            sleep(float(os.environ.get("N1_PAUSA", "0.12")))
        if index%15==0 or index==len(reports):
            print(f"Publicados {index}/{len(reports)}",dict(loaded),flush=True)
    if errors:
        raise SystemExit(2)


if __name__=="__main__":
    main()
