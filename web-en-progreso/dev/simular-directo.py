#!/usr/bin/env python3
"""SIMULACIÓN LOCAL del directo: reproduce por tramos un partido FAB ya terminado
contra el servidor local (dev/serve.mjs) y al final lo deja exactamente como estaba.
No sustituye a la prueba con un partido realmente en curso."""

import json, os, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = os.environ.get("N1_SITE", "http://localhost:8787")
assert SITE.startswith("http://localhost"), "La simulación solo se ejecuta contra el servidor local"
TOKEN = (ROOT / ".fab-import-token-local").read_text().strip()
STORE = ROOT / ".local-bucket" / "objects"
PAUSE = float(sys.argv[2]) if len(sys.argv) > 2 else 20


def call(route, payload):
    req = urllib.request.Request(SITE + route, json.dumps(payload).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return {"HTTP": e.code, **json.load(e)}


def calendar():
    data = json.loads((STORE / "fab%2Fcalendario.json").read_text())
    return [{"id": i, **g} for i, g in data["games"].items()]


game_id = sys.argv[1]
key = STORE / ("fab%2Fjugadas%2F" + game_id + ".json")
final = json.loads(key.read_text())
original = calendar()
events = final["events"]
try:
    for m in (STORE / (key.name + ".meta"), key):
        m.rename(m.with_suffix(m.suffix + ".bak"))
    steps = [len(events) * k // 6 for k in range(1, 6)]
    for n in steps:
        part = events[:n]
        score = [e[7] for e in part if e[7]][-1] if any(e[7] for e in part) else [0, 0]
        board = [dict(g, status="En juego", score=score) if g["id"] == game_id else g for g in original]
        print("calendario", call("/api/calendario-fab", {"games": board})["state"], score)
        print("jugadas", n, call("/api/jugadas-fab", {"id": game_id, "score": score, "events": part}))
        print("reintento", call("/api/jugadas-fab", {"id": game_id, "score": score, "events": part}))
        if n != steps[0]:
            print("instantánea vieja", call("/api/jugadas-fab", {"id": game_id, "score": score, "events": events[:steps[0]]}))
        time.sleep(PAUSE)
    print("final", call("/api/calendario-fab", {"games": original})["state"],
          call("/api/jugadas-fab", {"id": game_id, "score": final["score"], "events": events}))
finally:
    for m in (key, STORE / (key.name + ".meta")):
        m.unlink(missing_ok=True)
        m.with_suffix(m.suffix + ".bak").rename(m)
    call("/api/calendario-fab", {"games": original})
