#!/usr/bin/env python3
"""Estadística avanzada de la N1 a partir de las actas y el jugada a jugada de Afición FAB.

Uso: python3 scripts/avanzadas.py <captura> <salida.json> [--sitio URL]

Definiciones (las mismas que publica la web en su glosario):
  Posesiones (Pos.)  FGA - OREB + PÉRD + 0,44·FTA, promediando las de ambos equipos.
  OffRtg / DefRtg    puntos anotados / recibidos por 100 posesiones.  Net = Off - Def.
  Ritmo              posesiones por 40 minutos.
  eFG%  (TC + 0,5·T3) / TCI          TS%  PTS / (2·(TCI + 0,44·TLI))
  TOV%  PÉRD / Pos.                  ORB% OREB / (OREB + DREB rival)
  FT rate TLI / TCI                  AST% (equipo) AST / TC anotados
  USG%  (TCI + 0,44·TLI + PÉRD) del jugador / las del equipo con él en pista
  En pista: +/-, Pos., OffRtg, DefRtg y Net del equipo mientras el jugador juega.
  Clutch: últimos 5 minutos del 4.º periodo o prórroga con diferencia ≤ 5 puntos.
  Parcial: puntos seguidos de un equipo sin que anote el rival (se listan los de 8+).
"""

import argparse, json, re, unicodedata, urllib.request
from collections import defaultdict
from pathlib import Path

SHOTS = {"CANASTA-2P": (2, 1), "TIRO2-FALLADO": (2, 0), "CANASTA-3P": (3, 1), "TIRO3-FALLADO": (3, 0)}
FTS = {"CANASTA-1P": 1, "TIRO1-FALLADO": 0}
COUNTED = ("pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "ast", "tov", "stl", "blk", "pf")


# Calibración de las coordenadas de tiro de Afición FAB (píxeles de su imagen de pista,
# ya reflejados a una sola canasta) a metros FIBA con origen en el centro del aro:
# separa tiros de 2 y de 3 con la línea de 6,75 m / 6,6 m en el 100 % de una muestra de 6.000 tiros;
# el aro se ancla en el centro de los tiros de la zona Z1 de la FAB.
RIM_X, RIM_Y, PX_X, PX_Y = 120, 292, 29, 33


def shot_m(a):
    try:
        x, y = float(a["posicion_x"]), float(a["posicion_y"])
    except (TypeError, ValueError):
        return None
    if not (x or y):
        return None
    along = (x - RIM_X) / PX_X  # metros hacia el centro del campo
    side = (y - RIM_Y) / PX_Y   # metros hacia la banda (negativo = izquierda del atacante)
    return round(min(max(along, -1.5), 12.4), 2), round(min(max(side, -7.4), 7.4), 2)


FAB_ZONES = {"Z1": "Aro", "Z2": "Pintura", "Z3": "Pintura", "Z4": "Pintura",
             **{f"Z{n}": "Media distancia" for n in range(5, 10)},
             "Z10": "Triple esquina", "Z14": "Triple esquina", "Z11": "Triple lateral", "Z13": "Triple lateral",
             "Z12": "Triple frontal"}


def shot_zone(along, side, val, fab_zone=""):
    zone = FAB_ZONES.get((fab_zone or "").split("-")[0])
    if zone and zone.startswith("Triple") == (val == 3):
        return zone
    dist = (along ** 2 + side ** 2) ** 0.5
    if val == 3:
        if abs(side) >= 6.0 and along < 2.5:
            return "Triple esquina"
        return "Triple frontal" if abs(side) < 2.5 else "Triple lateral"
    if dist < 1.6:
        return "Aro"
    if dist < 4.2:
        return "Pintura"
    return "Media distancia"


def words(v):
    return re.sub(r"[^A-Z0-9]", "", unicodedata.normalize("NFD", v).upper())


def clock_s(v):
    m = re.match(r"(\d\d):(\d\d):(\d\d)(?:\.(\d))?", v or "")
    return int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]) + int(m[4] or 0) / 10 if m else None


def possessions(t):
    return t["fga"] - t["orb"] + t["tov"] + 0.44 * t["fta"]


def blank():
    return defaultdict(float)


def r1(x, d=1):
    return None if x is None else round(x, d)


def div(a, b):
    return a / b if b else None


def team_view(t, o, minutes):
    poss = (possessions(t) + possessions(o)) / 2
    return {
        "pts": t["pts"], "opp": o["pts"], "pos": r1(poss), "ritmo": r1(div(poss * 40, minutes)),
        "off": r1(div(100 * t["pts"], poss)), "def": r1(div(100 * o["pts"], poss)),
        "net": r1(div(100 * (t["pts"] - o["pts"]), poss)),
        "efg": r1(div(100 * (t["fgm"] + 0.5 * t["tpm"]), t["fga"])),
        "ts": r1(div(100 * t["pts"], 2 * (t["fga"] + 0.44 * t["fta"]))),
        "tov": r1(div(100 * t["tov"], poss)), "orb": r1(div(100 * t["orb"], t["orb"] + o["drb"])),
        "drb": r1(div(100 * t["drb"], t["drb"] + o["orb"])),
        "ftr": r1(div(t["fta"], t["fga"]), 2), "ast": r1(div(100 * t["ast"], t["fgm"])),
        "t3r": r1(div(100 * t["tpa"], t["fga"])),
    }


class Game:
    """Recorre el jugada a jugada de un partido manteniendo quién está en pista."""

    def __init__(self, data, names):
        self.d = data
        lp = data["livePartido"]
        self.ids = [lp["idlocal"], lp["idvisitante"]]
        self.fx = data["fixture"]
        self.teams = names  # nombres del calendario (los de la web)
        # La fila sin componente_id es la de TOTALES del equipo.
        self.box = [{r["dorsal"]: r for r in data[s] if r.get("componente_id")} for s in ("local", "visitante")]
        src = data["jugadas"]
        order = sorted(range(len(src)), key=lambda i: (src[i]["autoincremental_id"], -i))
        self.events = [src[i] for i in order if str(src[i].get("eliminado")).lower() != "true"]
        self.period_len = {p: (data["partido"].get("duracion_periodo_normal_mm") or 10) * 60 for p in range(1, 5)}
        self.ot_len = (data["partido"].get("duracion_periodo_extra_mm") or 5) * 60

    def elapsed(self, period, clock):
        before = sum(self.period_len.get(p, self.ot_len) for p in range(1, period))
        length = self.period_len.get(period, self.ot_len)
        return before + length - (clock if clock is not None else length)

    def run(self):
        on = [set(), set()]
        score = [0, 0]
        players = [defaultdict(blank), defaultdict(blank)]  # dorsal -> acumulados
        stints = defaultdict(lambda: {"sec": 0.0, "t": blank(), "o": blank()})  # (lado, quinteto)
        team = [blank(), blank()]
        quarters = defaultdict(lambda: [blank(), blank()])
        timeline = [[0, 0, 0]]
        runs, cur = [], None
        clutch = [defaultdict(blank), defaultdict(blank)]
        clutch_team = [blank(), blank()]
        last_t = 0.0
        anomalies = 0
        lead_changes, ties, max_lead = 0, 0, [0, 0]
        leader = 0
        for a in self.events:
            kind = a["accion_tipo"]
            side = self.ids.index(a["equipo_id"]) if a["equipo_id"] in self.ids else -1
            dorsal = str(a.get("dorsal", ""))
            period = a["numero_periodo"]
            t = self.elapsed(period, clock_s(a["tiempo_partido"]))
            # tiempo jugado por el quinteto vigente
            if t > last_t:
                full = all(len(x) == 5 for x in on)
                for s in (0, 1):
                    for d in on[s]:
                        players[s][d]["sec"] += t - last_t
                    if full:
                        stints[(s, tuple(sorted(on[s])))]["sec"] += t - last_t
                last_t = t
            if kind in ("FINAL-PERIODO", "INICIO-PARTIDO"):
                on = [set(), set()]
                continue
            if kind == "CAMBIO-JUGADOR-ENTRA" and side >= 0:
                on[side].add(dorsal)
                continue
            if kind == "CAMBIO-JUGADOR-SALE" and side >= 0:
                on[side].discard(dorsal)
                continue
            if side < 0:
                continue
            stat = {}
            if kind in SHOTS:
                val, made = SHOTS[kind]
                stat = {"fga": 1, "fgm": made, "tpa": val == 3, "tpm": val == 3 and made, "pts": val * made}
            elif kind in FTS:
                stat = {"fta": 1, "ftm": FTS[kind], "pts": FTS[kind]}
            elif kind == "REBOTE-OFENSIVO":
                stat = {"orb": 1}
            elif kind == "REBOTE-DEFENSIVO":
                stat = {"drb": 1}
            elif kind == "ASISTENCIA":
                stat = {"ast": 1}
            elif kind == "PERDIDA":
                stat = {"tov": 1}
            elif kind == "RECUPERACION":
                stat = {"stl": 1}
            elif kind == "TAPON-COMETIDO":
                stat = {"blk": 1}
            elif kind == "FALTA-COMETIDA":
                stat = {"pf": 1}
            if not stat:
                continue
            stat = {k: float(v) for k, v in stat.items() if v}
            full = all(len(x) == 5 for x in on)
            if not full or (dorsal not in on[side] and dorsal not in ("-1", "")):
                anomalies += 1
            clutch_now = period >= 4 and self.elapsed(period, clock_s(a["tiempo_partido"])) >= self.elapsed(period, 300) \
                and abs(score[0] - score[1]) <= 5
            for k, v in stat.items():
                team[side][k] += v
                quarters[period][side][k] += v
                if dorsal not in ("-1", ""):
                    players[side][dorsal][k] += v
                    if clutch_now:
                        clutch[side][dorsal][k] += v
                if clutch_now:
                    clutch_team[side][k] += v
                if full:
                    for s in (0, 1):
                        bucket = stints[(s, tuple(sorted(on[s])))]
                        (bucket["t"] if s == side else bucket["o"])[k] += v
                # en pista (para todos los que están, incluido el +/-)
                for s in (0, 1):
                    for d in on[s]:
                        players[s][d][("on_" if s == side else "onopp_") + k] += v
            pts = stat.get("pts", 0)
            if pts:
                score[side] += int(pts)
                timeline.append([round(t), score[0], score[1]])
                if cur and cur["side"] == side:
                    cur["pts"] += pts
                    cur["to"] = round(t)
                    cur["score"] = list(score)
                else:
                    if cur and cur["pts"] >= 8:
                        runs.append(cur)
                    cur = {"side": side, "pts": pts, "from": round(t), "to": round(t), "score": list(score)}
                diff = score[0] - score[1]
                now = (diff > 0) - (diff < 0)
                if now == 0:
                    ties += 1
                elif leader and now != leader:
                    lead_changes += 1
                if now:
                    leader = now
                max_lead[0] = max(max_lead[0], diff)
                max_lead[1] = max(max_lead[1], -diff)
        if cur and cur["pts"] >= 8:
            runs.append(cur)
        return dict(players=players, stints=stints, team=team, quarters=quarters, timeline=timeline,
                    runs=runs, clutch=clutch, clutch_team=clutch_team, anomalies=anomalies, score=score,
                    minutes=last_t / 60, lead_changes=lead_changes, ties=ties, max_lead=max_lead)


def load_ids(site):
    """(equipo, nombre normalizado) -> id de jugador que usa la web, leyendo /season.json."""
    if not site:
        return {}
    season = json.load(urllib.request.urlopen(site.rstrip("/") + "/season.json"))
    ids = {}
    for g in season["games"]:
        for t in g.get("box") or []:
            for r in t["rows"]:
                ids[(t["team"], words(r[1]))] = r[0]
    return ids, season


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("captura", type=Path)
    ap.add_argument("salida", type=Path)
    ap.add_argument("--sitio", default="")
    ap.add_argument("--publicar", action="store_true", help="envía los datos a --sitio (requiere credencial)")
    args = ap.parse_args()
    site_ids, season = load_ids(args.sitio) if args.sitio else ({}, None)
    by_teams = {}
    if season:
        for g in season["games"]:
            by_teams[(g["group"], words(g["home"]), words(g["away"]))] = g
    games_out, checks = {}, defaultdict(int)
    season_team = defaultdict(lambda: {"t": blank(), "o": blank(), "min": 0.0, "pj": 0, "grupo": ""})
    season_player = defaultdict(lambda: defaultdict(float))
    player_info = {}
    lineups = defaultdict(lambda: {"sec": 0.0, "t": blank(), "o": blank()})
    zones = defaultdict(lambda: [0, 0])  # (equipo, zona) -> [intentos, anotados]
    pzones = defaultdict(lambda: [0, 0])  # (jugador, zona)
    lzones = defaultdict(lambda: [0, 0])  # liga
    shots = defaultdict(list)  # equipo -> [[metros hacia campo ×10, metros banda ×10, valor, anotado, jugador, partido]]
    shot_players = {}
    for path in sorted((args.captura / "partidos").glob("*.json")):
        data = json.loads(path.read_text())
        fx = data["fixture"]
        if fx.get("Estado") != "Terminado" or not data["jugadas"] or not data["local"]:
            continue
        base = by_teams.get((fx["group"], words(fx["NombreEquipoLocal"]), words(fx["NombreEquipoVisitante"])))
        names = [base["home"], base["away"]] if base else [fx["NombreEquipoLocal"].strip(), fx["NombreEquipoVisitante"].strip()]
        gid = base["url"].split("?")[0].split("/")[-1] if base else path.stem
        game = Game(data, names)
        res = game.run()
        final = [data["partido"]["tanteo_local"], data["partido"]["tanteo_visitante"]]
        checks["partidos"] += 1
        checks["anomalias_quinteto"] += res["anomalies"]
        if res["score"] != final:
            checks["marcador_distinto"] += 1
        minutes = max(res["minutes"], 40)
        # --- jugadores del partido (validación contra el acta) ---
        game_players = []
        for s in (0, 1):
            opp = 1 - s
            for dorsal, row in game.box[s].items():
                p = res["players"][s].get(dorsal, blank())
                if int(p["pts"]) != row["puntos"]:
                    checks["puntos_jugador_distintos"] += 1
                pm = p["on_pts"] - p["onopp_pts"]
                if row.get("masMenos") is not None and int(pm) != row["masMenos"]:
                    checks["masmenos_distinto"] += 1
                if abs(p["sec"] - row["milisegundos_jugados"] / 1000) > 90:
                    checks["minutos_distintos_mas_90s"] += 1
                name = re.sub(r"\s*,\s*", ", ", row["nombre"].strip())
                pid = site_ids.get((names[s], words(name))) or "fab-" + words(names[s])[:12] + "-" + words(name)
                player_info[pid] = {"nombre": name, "equipo": names[s], "grupo": fx["group"]}
                sec = row["milisegundos_jugados"] / 1000
                use_on = p["on_fga"] + 0.44 * p["on_fta"] + p["on_tov"]
                use = row["tiro2p"] + row["tiro3p"] + 0.44 * row["tiro1p"] + row["perdidas"]
                on_poss = (p["on_fga"] - p["on_orb"] + p["on_tov"] + 0.44 * p["on_fta"]
                           + p["onopp_fga"] - p["onopp_orb"] + p["onopp_tov"] + 0.44 * p["onopp_fta"]) / 2
                game_players.append({
                    "id": pid, "lado": s, "nombre": name, "dorsal": dorsal, "min": r1(sec / 60),
                    "pts": row["puntos"], "ts": r1(div(100 * row["puntos"], 2 * (row["tiro2p"] + row["tiro3p"] + 0.44 * row["tiro1p"]))),
                    "usg": r1(div(100 * use, use_on)), "pm": int(pm), "pos": r1(on_poss),
                    "off": r1(div(100 * p["on_pts"], on_poss)), "def": r1(div(100 * p["onopp_pts"], on_poss)),
                    "val": row["valoracion"],
                })
                acc = season_player[pid]
                acc["pj"] += 1
                acc["sec"] += sec
                acc["titular"] += 1 if row.get("quintetotitular") else 0
                for k, v in (("pts", row["puntos"]), ("fgm", row["canasta2p"] + row["canasta3p"]),
                             ("fga", row["tiro2p"] + row["tiro3p"]), ("tpm", row["canasta3p"]), ("tpa", row["tiro3p"]),
                             ("ftm", row["canasta1p"]), ("fta", row["tiro1p"]), ("orb", row["reboteofensivo"]),
                             ("drb", row["rebotedefensivo"]), ("ast", row["asistencias"]), ("tov", row["perdidas"]),
                             ("stl", row["recuperaciones"]), ("blk", row["taponescometidos"]), ("val", row["valoracion"]),
                             ("pf", row["faltascometidas"]), ("pm", pm), ("use", use), ("use_on", use_on), ("on_pos", on_poss),
                             ("on_pts", p["on_pts"]), ("on_opp", p["onopp_pts"]),
                             ("on_tfgm", p["on_fgm"]), ("on_odrb", p["onopp_drb"]), ("on_oorb", p["onopp_orb"]),
                             ("on_torb", p["on_orb"]), ("on_tdrb", p["on_drb"]), ("on_tfga", p["on_fga"])):
                    acc[k] += v
                cp = res["clutch"][s].get(dorsal)
                if cp:
                    acc["clutch_pts"] += cp["pts"]
                    acc["clutch_fga"] += cp["fga"]
                    acc["clutch_fgm"] += cp["fgm"]
                    acc["clutch_tov"] += cp["tov"]
        # --- equipos ---
        views = [team_view(res["team"][s], res["team"][1 - s], minutes) for s in (0, 1)]
        for s in (0, 1):
            st = season_team[names[s]]
            st["grupo"] = fx["group"]
            st["pj"] += 1
            st["v"] = st.get("v", 0) + (final[s] > final[1 - s])
            st["min"] += minutes
            for k, v in res["team"][s].items():
                st["t"][k] += v
            for k, v in res["team"][1 - s].items():
                st["o"][k] += v
            st.setdefault("partidos", []).append({"id": gid, "rival": names[1 - s], "local": s == 0,
                                                  "pts": final[s], "opp": final[1 - s], "net": views[s]["net"],
                                                  "off": views[s]["off"], "def": views[s]["def"], "fecha": fx["Fecha"]})
        quarters = []
        for per in sorted(res["quarters"]):
            q = res["quarters"][per]
            qmin = (game.period_len.get(per, game.ot_len)) / 60
            quarters.append({"periodo": per, "eq": [team_view(q[s], q[1 - s], qmin) for s in (0, 1)]})
        # --- quintetos del partido ---
        game_lineups = []
        for (s, five), b in res["stints"].items():
            if b["sec"] < 60:
                continue
            v = team_view(b["t"], b["o"], b["sec"] / 60)
            game_lineups.append({"lado": s, "jug": [game.box[s].get(d, {}).get("nombre", "#" + d) for d in five],
                                 "min": r1(b["sec"] / 60), "pm": int(b["t"]["pts"] - b["o"]["pts"]), **{k: v[k] for k in ("pos", "off", "def", "net")}})
            key = (names[s], tuple(sorted(site_ids.get((names[s], words(re.sub(r"\s*,\s*", ", ", game.box[s][d]["nombre"].strip()))), d)
                                          for d in five if d in game.box[s])))
            L = lineups[key]
            L["sec"] += b["sec"]
            L["nombres"] = [re.sub(r"\s*,\s*", ", ", game.box[s][d]["nombre"].strip()) for d in five if d in game.box[s]]
            for k, val in b["t"].items():
                L["t"][k] += val
            for k, val in b["o"].items():
                L["o"][k] += val
        game_lineups.sort(key=lambda x: -x["min"])
        # --- tiros: posición en metros y zona ---
        dorsal_pid = {(p["lado"], p["dorsal"]): p["id"] for p in game_players}
        game_shots = []
        for a in game.events:
            if a["accion_tipo"] in SHOTS and a["equipo_id"] in game.ids:
                s = game.ids.index(a["equipo_id"])
                val, made = SHOTS[a["accion_tipo"]]
                pos = shot_m(a)
                if not pos:
                    continue
                zone = shot_zone(*pos, val, a.get("zona"))
                pid = dorsal_pid.get((s, str(a.get("dorsal", ""))))
                for bucket in (zones[(names[s], zone)], lzones[zone], *( [pzones[(pid, zone)]] if pid else [])):
                    bucket[0] += 1
                    bucket[1] += made
                if pid:
                    shot_players.setdefault(pid, len(shot_players))
                row = [round(pos[0] * 10), round(pos[1] * 10), val, made, shot_players.get(pid, -1)]
                shots[names[s]].append(row + [gid])
                game_shots.append([s, *row[:4], str(a.get("dorsal", "")), a["numero_periodo"]])
        clutch_game = None
        if any(res["clutch_team"][s]["fga"] or res["clutch_team"][s]["fta"] for s in (0, 1)):
            clutch_game = [{"pts": int(res["clutch_team"][s]["pts"]), "fgm": int(res["clutch_team"][s]["fgm"]),
                            "fga": int(res["clutch_team"][s]["fga"]), "tov": int(res["clutch_team"][s]["tov"])} for s in (0, 1)]
        games_out[gid] = {
            "equipos": names, "marcador": final, "min": r1(minutes), "claves": views, "cuartos": quarters,
            "evolucion": res["timeline"], "parciales": [{**r, "equipo": r["side"]} for r in res["runs"]],
            "cambiosLider": res["lead_changes"], "empates": res["ties"], "maxVentaja": res["max_lead"],
            "clutch": clutch_game, "jugadores": game_players, "quintetos": game_lineups[:12], "tiros": game_shots,
        }
    # --- temporada: equipos ---
    teams_out = []
    for name, st in season_team.items():
        v = team_view(st["t"], st["o"], st["min"])
        rv = team_view(st["o"], st["t"], st["min"])  # lo que concede: cuatro factores del rival
        teams_out.append({"equipo": name, "grupo": st["grupo"], "pj": st["pj"], "v": st["v"], **v,
                          "rival": {k: rv[k] for k in ("efg", "ts", "tov", "orb", "ftr", "t3r", "ast")},
                          "ritmo": r1(div(((possessions(st["t"]) + possessions(st["o"])) / 2) * 40, st["min"])),
                          "partidos": st["partidos"]})
    # posición dentro del grupo para cada métrica
    for k, best_high in (("off", True), ("def", False), ("net", True), ("ritmo", True)):
        for g in "ABCD":
            group = sorted([t for t in teams_out if t["grupo"] == g and t[k] is not None], key=lambda t: t[k], reverse=best_high)
            for i, t in enumerate(group, 1):
                t.setdefault("rank", {})[k] = i
    # --- temporada: jugadores ---
    players_out = []
    for pid, a in season_player.items():
        info = player_info[pid]
        mins = a["sec"] / 60
        players_out.append({
            "id": pid, **info, "pj": int(a["pj"]), "tit": int(a["titular"]), "min": r1(mins), "mpp": r1(div(mins, a["pj"])),
            "pts": int(a["pts"]), "ppp": r1(div(a["pts"], a["pj"])), "reb": int(a["orb"] + a["drb"]), "ast": int(a["ast"]),
            "stl": int(a["stl"]), "blk": int(a["blk"]), "tov": int(a["tov"]), "val": r1(div(a["val"], a["pj"])),
            "fgm": int(a["fgm"]), "fga": int(a["fga"]), "tpm": int(a["tpm"]), "tpa": int(a["tpa"]), "ftm": int(a["ftm"]), "fta": int(a["fta"]),
            "orb": int(a["orb"]), "drb": int(a["drb"]),
            "ts": r1(div(100 * a["pts"], 2 * (a["fga"] + 0.44 * a["fta"]))),
            "efg": r1(div(100 * (a["fgm"] + 0.5 * a["tpm"]), a["fga"])),
            "t3": r1(div(100 * a["tpm"], a["tpa"])), "t2": r1(div(100 * (a["fgm"] - a["tpm"]), a["fga"] - a["tpa"])),
            "tl": r1(div(100 * a["ftm"], a["fta"])),
            "usg": r1(div(100 * a["use"], a["use_on"])),
            "astp": r1(div(100 * a["ast"], a["on_tfgm"] - a["fgm"])),
            "orbp": r1(div(100 * a["orb"], a["on_torb"] + a["on_odrb"])),
            "drbp": r1(div(100 * a["drb"], a["on_tdrb"] + a["on_oorb"])),
            "ppos": r1(div(a["pts"], a["use"]), 2),
            "pm": int(a["pm"]), "pos": r1(a["on_pos"]),
            "off": r1(div(100 * a["on_pts"], a["on_pos"])), "def": r1(div(100 * a["on_opp"], a["on_pos"])),
            "net": r1(div(100 * (a["on_pts"] - a["on_opp"]), a["on_pos"])),
            "p40": r1(div(40 * a["pts"], mins)), "r40": r1(div(40 * (a["orb"] + a["drb"]), mins)), "a40": r1(div(40 * a["ast"], mins)),
            "p100": r1(div(100 * a["pts"], a["on_pos"])),
            "clutch": {"pts": int(a["clutch_pts"]), "fgm": int(a["clutch_fgm"]), "fga": int(a["clutch_fga"]), "tov": int(a["clutch_tov"])},
        })
    # on/off: net del equipo sin el jugador
    team_totals = {t["equipo"]: season_team[t["equipo"]] for t in teams_out}
    for p in players_out:
        st = team_totals[p["equipo"]]
        a = season_player[p["id"]]
        poss_all = (possessions(st["t"]) + possessions(st["o"])) / 2
        off_poss = poss_all - a["on_pos"]
        p["netSin"] = r1(div(100 * ((st["t"]["pts"] - a["on_pts"]) - (st["o"]["pts"] - a["on_opp"])), off_poss)) if off_poss > 60 else None
        p["onoff"] = r1(p["net"] - p["netSin"]) if p["net"] is not None and p["netSin"] is not None else None
    # --- quintetos de temporada ---
    lineups_out = []
    for (team, _), L in lineups.items():
        if L["sec"] < 300:
            continue
        v = team_view(L["t"], L["o"], L["sec"] / 60)
        lineups_out.append({"equipo": team, "jug": L["nombres"], "min": r1(L["sec"] / 60),
                            "pm": int(L["t"]["pts"] - L["o"]["pts"]), **{k: v[k] for k in ("pos", "off", "def", "net", "efg", "tov", "orb")}})
    lineups_out.sort(key=lambda x: -x["min"])
    zone_doc = lambda d: {z: {"int": a, "anot": m} for z, (a, m) in d.items()}
    zones_out = {"liga": zone_doc(lzones), "equipos": defaultdict(dict), "jugadores": defaultdict(dict)}
    for (team, zone), (att, made) in zones.items():
        zones_out["equipos"][team][zone] = {"int": att, "anot": made}
    for (pid, zone), (att, made) in pzones.items():
        zones_out["jugadores"][pid][zone] = {"int": att, "anot": made}
    shots_doc = {"jugadores": [pid for pid, _ in sorted(shot_players.items(), key=lambda kv: kv[1])], "equipos": shots}
    out = {"fuente": "Afición FAB", "checks": dict(checks), "equipos": teams_out, "jugadores": players_out,
           "quintetos": lineups_out, "zonas": zones_out, "partidos": games_out}
    args.salida.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print("Validación:", dict(checks))
    if args.publicar:
        import os, runpy
        loader = runpy.run_path(str(Path(__file__).with_name("cargar-fab.py")))
        token = Path(os.environ.get("N1_TOKEN_FILE", Path(__file__).parent.parent / ".fab-import-token")).read_text().strip()
        season_doc = {k: v for k, v in out.items() if k != "partidos"}
        print(loader["post"]("/api/avanzadas", {"tipo": "temporada", "datos": season_doc}, token))
        print(loader["post"]("/api/avanzadas", {"tipo": "tiros", "datos": shots_doc}, token))
        for gid, g in games_out.items():
            loader["post"]("/api/avanzadas", {"tipo": "partido", "id": gid, "datos": g}, token)
        print("Partidos con informe avanzado:", len(games_out))
    print("Equipos", len(teams_out), "· jugadores", len(players_out), "· quintetos ≥5 min", len(lineups_out),
          "· partidos", len(games_out), "·", round(args.salida.stat().st_size / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
