#!/usr/bin/env python3
"""Cliente mínimo del servicio de Afición FAB (appaficionfab.gesdeportiva.es) desde el Mac,
reproduciendo las consultas de la app 5.0.14. La sesión de invitado (id_dispositivo + key)
se guarda en .sesion-fab.json junto a este archivo; nunca va a la web ni al repositorio."""

import json, ssl, time, uuid, urllib.parse, urllib.request
from pathlib import Path

BASE = "https://appaficionfab.gesdeportiva.es/"
SESSION = Path(__file__).with_name(".sesion-fab.json")
VERSION = "50014"
PAUSE = 0.6  # pausa entre consultas para no cargar el servicio
# Certificados del sistema: macOS (/etc/ssl/cert.pem) o Linux (/etc/ssl/certs/ca-certificates.crt)
_CA = next((c for c in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt") if Path(c).exists()), None)
CTX = ssl.create_default_context(cafile=_CA) if _CA else ssl.create_default_context()
UA = "Mozilla/5.0 (Linux; Android 15; sdk_gphone64_x86_64 Build/AE3A.240806.043; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36"


class FabError(RuntimeError):
    pass


class Fab:
    def __init__(self):
        self.s = json.loads(SESSION.read_text()) if SESSION.exists() else {"uid": uuid.uuid4().hex[:16]}
        self.last = 0.0

    def _post(self, url, fields):
        wait = self.last + PAUSE - time.time()
        if wait > 0:
            time.sleep(wait)
        data = urllib.parse.urlencode(fields).encode()
        req = urllib.request.Request(url, data, {"Content-Type": "application/x-www-form-urlencoded",
                                                 "User-Agent": UA, "Accept": "application/json, text/plain, */*"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
                    self.last = time.time()
                    return json.loads(r.read().decode("utf-8-sig"))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                if attempt == 3:
                    raise FabError(f"{url}: {e}")
                time.sleep(2 ** attempt * 2)

    def _save(self, r):
        for k in ("key", "id_dispositivo", "ruta"):
            if r.get(k):
                self.s[k] = r[k]
        self.s["valid_until"] = time.time() + 3000  # la app renueva cada hora
        SESSION.write_text(json.dumps(self.s))
        SESSION.chmod(0o600)

    def login(self, force=False):
        if not force and self.s.get("key") and self.s.get("valid_until", 0) > time.time():
            return
        common = {"uid": self.s["uid"], "plataforma": "android", "tipo_dispositivo": "mobile", "version": VERSION}
        if self.s.get("id_dispositivo"):
            r = self._post(BASE + "dispositivo.ashx", {"accion": "acceso", **common,
                                                       "id_dispositivo": self.s["id_dispositivo"], "token_push": ""})
        else:
            r = self._post(BASE + "dispositivo.ashx", {"accion": "registrar", **common})
        if r.get("resultado") != "correcto":
            raise FabError("Sesión FAB rechazada: " + json.dumps(r)[:300])
        self._save(r)
        self.config = r

    def call(self, path, **fields):
        self.login()
        base = (self.s.get("ruta") or BASE) + "v2/"
        r = self._post(base + path, {"id_dispositivo": self.s["id_dispositivo"], "key": self.s["key"], **fields})
        if isinstance(r, dict) and r.get("resultado") not in (None, "correcto"):
            self.login(force=True)
            r = self._post(base + path, {"id_dispositivo": self.s["id_dispositivo"], "key": self.s["key"], **fields})
        if isinstance(r, dict) and r.get("resultado") == "correcto" and r.get("key"):
            self._save(r)  # la app sustituye la key por la que llega en cada respuesta
        return r


if __name__ == "__main__":
    import sys
    fab = Fab()
    fab.login(force=True)
    print({k: v for k, v in fab.config.items() if k not in ("key", "publicidad")})
    if len(sys.argv) > 2:
        print(json.dumps(fab.call(sys.argv[1], id_partido=sys.argv[2]), ensure_ascii=False)[:3000])
