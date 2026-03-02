"""
ZeNis Backend — FastAPI
───────────────────────
Rulează pe Raspberry Pi Zero 2W
- Servește frontend-ul React (build static)
- API REST pentru control masă
- Comunicare Serial cu Arduino
- WebSocket pentru status live

Port: 8000
Acces: http://zenis.local
"""

import os
import json
import asyncio
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

import serial
import serial.tools.list_ports
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────
SERIAL_PORT      = os.getenv("ZENIS_SERIAL", "/dev/ttyUSB0")
SERIAL_BAUD      = int(os.getenv("ZENIS_BAUD", "115200"))
PATTERNS_DIR     = Path("/opt/zenis/patterns")
FRONTEND_BUILD   = Path("/opt/zenis/frontend/build")
LOG_FILE         = Path("/var/log/zenis.log")

PATTERNS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger("zenis")

# ── Serial Manager ────────────────────────────────────────────────────────────
class SerialManager:
    def __init__(self):
        self.port: Optional[serial.Serial] = None
        self.connected = False
        self.port_name = SERIAL_PORT

    def connect(self, port: str = None) -> bool:
        p = port or self.port_name
        try:
            self.port = serial.Serial(p, SERIAL_BAUD, timeout=1)
            self.connected = True
            self.port_name = p
            log.info(f"Serial conectat: {p} @ {SERIAL_BAUD}")
            return True
        except Exception as e:
            log.warning(f"Serial neconectat: {e}")
            self.connected = False
            return False

    def disconnect(self):
        if self.port and self.port.is_open:
            self.port.close()
        self.connected = False

    def send(self, data: str) -> bool:
        if not self.connected or not self.port:
            return False
        try:
            self.port.write((data + "\n").encode())
            return True
        except Exception as e:
            log.error(f"Serial send error: {e}")
            self.connected = False
            return False

    def available_ports(self) -> list:
        return [p.device for p in serial.tools.list_ports.comports()]

    def send_thr(self, thr_content: str, speed: int = 5) -> bool:
        """Trimite un pattern .thr linie cu linie la Arduino."""
        if not self.connected:
            return False
        lines = [l for l in thr_content.splitlines() if l.strip() and not l.startswith("#")]
        self.send(f"SPEED:{speed}")
        self.send(f"PATTERN_START:{len(lines)}")
        for line in lines:
            self.send(line.strip())
        self.send("PATTERN_END")
        return True

ser = SerialManager()

# ── WebSocket Manager ─────────────────────────────────────────────────────────
class WSManager:
    def __init__(self):
        self.clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.append(ws)
        log.info(f"WebSocket client conectat. Total: {len(self.clients)}")

    def disconnect(self, ws: WebSocket):
        self.clients.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for client in self.clients:
            try:
                await client.send_json(data)
            except Exception:
                dead.append(client)
        for d in dead:
            self.clients.remove(d)

ws_manager = WSManager()

# ── App State ─────────────────────────────────────────────────────────────────
app_state = {
    "playing": False,
    "current_pattern": None,
    "progress": 0.0,
    "speed": 50,
}

# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("ZeNis backend pornit.")
    ser.connect()
    yield
    ser.disconnect()
    log.info("ZeNis backend oprit.")

# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(title="ZeNis API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────
class PatternSave(BaseModel):
    name: str
    thr: str
    speed: int = 5

class SpeedUpdate(BaseModel):
    speed: int  # 1-100

class SerialConnect(BaseModel):
    port: str

# ── API Routes ────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    return {
        "playing":         app_state["playing"],
        "current_pattern": app_state["current_pattern"],
        "progress":        app_state["progress"],
        "speed":           app_state["speed"],
        "serial_connected":ser.connected,
        "serial_port":     ser.port_name,
    }

@app.get("/api/serial/ports")
async def list_ports():
    return {"ports": ser.available_ports()}

@app.post("/api/serial/connect")
async def connect_serial(body: SerialConnect):
    ok = ser.connect(body.port)
    if not ok:
        raise HTTPException(400, f"Nu pot conecta la {body.port}")
    return {"connected": True, "port": body.port}

@app.post("/api/serial/disconnect")
async def disconnect_serial():
    ser.disconnect()
    return {"connected": False}

# ── Patterns ──────────────────────────────────────────────────────────────────

@app.get("/api/patterns")
async def list_patterns():
    patterns = []
    for f in sorted(PATTERNS_DIR.glob("*.thr")):
        stat = f.stat()
        patterns.append({
            "id":       f.stem,
            "name":     f.stem.replace("_", " "),
            "filename": f.name,
            "size":     stat.st_size,
            "lines":    sum(1 for l in f.read_text().splitlines() if l.strip() and not l.startswith("#")),
        })
    return {"patterns": patterns}

@app.post("/api/patterns/save")
async def save_pattern(body: PatternSave):
    # Sanitizăm numele
    safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in body.name).strip()
    safe_name = safe_name.replace(" ", "_") or "pattern"
    filename = PATTERNS_DIR / f"{safe_name}.thr"

    # Adăugăm header dacă nu există
    content = body.thr
    if not content.startswith("#"):
        content = f"# Pattern: {body.name}\n# Viteza recomandata: {body.speed}\n\n" + content

    filename.write_text(content)
    log.info(f"Pattern salvat: {filename}")
    return {"saved": True, "id": safe_name, "filename": filename.name}

@app.delete("/api/patterns/{pattern_id}")
async def delete_pattern(pattern_id: str):
    f = PATTERNS_DIR / f"{pattern_id}.thr"
    if not f.exists():
        raise HTTPException(404, "Pattern negăsit")
    f.unlink()
    return {"deleted": True}

@app.get("/api/patterns/{pattern_id}/download")
async def download_pattern(pattern_id: str):
    f = PATTERNS_DIR / f"{pattern_id}.thr"
    if not f.exists():
        raise HTTPException(404, "Pattern negăsit")
    return FileResponse(f, filename=f.name, media_type="text/plain")

# ── Playback ──────────────────────────────────────────────────────────────────

@app.post("/api/play/{pattern_id}")
async def play_pattern(pattern_id: str, speed: int = 50):
    f = PATTERNS_DIR / f"{pattern_id}.thr"
    if not f.exists():
        raise HTTPException(404, "Pattern negăsit")

    if not ser.connected:
        raise HTTPException(503, "Arduino neconectat")

    content = f.read_text()
    ok = ser.send_thr(content, speed)
    if not ok:
        raise HTTPException(503, "Eroare trimitere serial")

    app_state["playing"]         = True
    app_state["current_pattern"] = pattern_id
    app_state["progress"]        = 0.0
    app_state["speed"]           = speed

    await ws_manager.broadcast({
        "event":   "play_start",
        "pattern": pattern_id,
        "speed":   speed,
    })
    return {"playing": True, "pattern": pattern_id}

@app.post("/api/stop")
async def stop():
    ser.send("STOP")
    app_state["playing"]         = False
    app_state["current_pattern"] = None
    app_state["progress"]        = 0.0
    await ws_manager.broadcast({"event": "stopped"})
    return {"stopped": True}

@app.post("/api/pause")
async def pause():
    ser.send("PAUSE")
    app_state["playing"] = False
    await ws_manager.broadcast({"event": "paused"})
    return {"paused": True}

@app.post("/api/resume")
async def resume():
    ser.send("RESUME")
    app_state["playing"] = True
    await ws_manager.broadcast({"event": "resumed"})
    return {"resumed": True}

@app.post("/api/speed")
async def set_speed(body: SpeedUpdate):
    app_state["speed"] = body.speed
    ser.send(f"SPEED:{body.speed}")
    return {"speed": body.speed}

# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        # Trimitem status curent la conectare
        await ws.send_json({"event": "status", **app_state, "serial": ser.connected})

        # Loop: citim mesaje de la Arduino și le broadcastăm
        while True:
            # Citim ce trimite Arduino pe serial (progres, erori, etc.)
            if ser.connected and ser.port and ser.port.in_waiting:
                try:
                    line = ser.port.readline().decode("utf-8", errors="ignore").strip()
                    if line.startswith("PROGRESS:"):
                        pct = float(line.split(":")[1])
                        app_state["progress"] = pct
                        await ws_manager.broadcast({"event": "progress", "progress": pct})
                    elif line == "DONE":
                        app_state["playing"]  = False
                        app_state["progress"] = 1.0
                        await ws_manager.broadcast({"event": "done"})
                    elif line.startswith("ERR:"):
                        await ws_manager.broadcast({"event": "error", "message": line[4:]})
                except Exception:
                    pass

            # Procesăm mesaje de la client WebSocket (dacă trimite ceva)
            try:
                msg = await asyncio.wait_for(ws.receive_json(), timeout=0.05)
                if msg.get("cmd") == "ping":
                    await ws.send_json({"event": "pong"})
            except asyncio.TimeoutError:
                pass
            except Exception:
                break

            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(ws)

# ── Serve React Frontend ──────────────────────────────────────────────────────
# Montăm static files DUPĂ toate rutele API
if FRONTEND_BUILD.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_BUILD / "static")), name="static")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        # SPA: orice rută necunoscută → index.html
        index = FRONTEND_BUILD / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse({"error": "Frontend not built yet"}, 404)
else:
    @app.get("/")
    async def root():
        return {
            "status": "ZeNis API OK",
            "note":   "Frontend nu e build-uit încă. Rulează: cd /opt/zenis/frontend && npm run build:pi",
            "docs":   "/docs",
        }
