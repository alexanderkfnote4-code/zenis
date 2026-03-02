#!/usr/bin/env python3
"""
ZeNis WiFi Manager
──────────────────
La prima pornire (sau dacă nu există WiFi configurat), pornește un
Access Point numit "ZeNis-Setup". Utilizatorul se conectează la el
și configurează WiFi-ul prin browser la http://192.168.4.1

Flux:
  boot → check WiFi → dacă nu e configurat → AP mode → setup page
                    → dacă e configurat     → connect → pornește ZeNis

Buton fizic HARD RESET:
  GPIO 3 (Pin 5) + GND
  ┌─────────────────────────────────────────────┐
  │  Ținut 3 sec  →  șterge WiFi + reboot AP   │
  │  Pi oprit     →  apăsare pornește Pi-ul     │
  └─────────────────────────────────────────────┘
"""

import os
import sys
import time
import json
import subprocess
import logging
import threading
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# ── Config ────────────────────────────────────────────────────────────────────
AP_SSID      = "ZeNis-Setup"
AP_PASSWORD  = "zenis1234"          # parolă AP (min 8 caractere)
AP_IP        = "192.168.4.1"
AP_INTERFACE = "wlan0"
CONFIG_FILE  = Path("/etc/zenis/wifi.json")
LOG_FILE     = Path("/var/log/zenis-wifi.log")
PORT         = 80

# ── GPIO — Buton HARD RESET ───────────────────────────────────────────────────
RESET_GPIO_PIN   = 3        # GPIO 3 = Pin fizic 5 (are pull-up hardware intern)
RESET_HOLD_SEC   = 3        # secunde ținut apăsat pentru reset
LED_GPIO_PIN     = None     # opțional: pin LED status (None = dezactivat)
                            # dacă setezi un pin, LED-ul va pulsa în AP mode

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("zenis-wifi")


# ── Sistem helpers ────────────────────────────────────────────────────────────

def run(cmd: str, check=False, capture=True) -> tuple[int, str, str]:
    """Rulează comandă shell, returnează (returncode, stdout, stderr)."""
    result = subprocess.run(
        cmd, shell=True, capture_output=capture, text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def is_connected() -> bool:
    """Verifică dacă există conexiune WiFi activă."""
    code, out, _ = run("iwgetid -r")
    return code == 0 and bool(out)


def get_current_ssid() -> str:
    _, out, _ = run("iwgetid -r")
    return out.strip()


def scan_networks() -> list[dict]:
    """Scanează rețelele WiFi disponibile."""
    log.info("Scanare rețele WiFi...")
    _, out, _ = run("iwlist wlan0 scan 2>/dev/null")
    
    networks = []
    seen = set()
    current = {}
    
    for line in out.splitlines():
        line = line.strip()
        if "ESSID:" in line:
            ssid = line.split('ESSID:"')[1].rstrip('"') if 'ESSID:"' in line else ""
            if ssid and ssid not in seen and ssid != AP_SSID:
                seen.add(ssid)
                current["ssid"] = ssid
                networks.append(dict(current))
                current = {}
        elif "Signal level=" in line:
            try:
                # "Signal level=-65 dBm" sau "Signal level=65/100"
                sig_part = line.split("Signal level=")[1].split(" ")[0]
                if "/" in sig_part:
                    val = int(sig_part.split("/")[0])
                    current["signal"] = val
                else:
                    dbm = int(sig_part)
                    # convertim dBm în procent aproximativ
                    current["signal"] = max(0, min(100, 2 * (dbm + 100)))
            except (ValueError, IndexError):
                current["signal"] = 50
        elif "Encryption key:on" in line:
            current["encrypted"] = True
        elif "Encryption key:off" in line:
            current["encrypted"] = False

    # sortăm după semnal descrescător
    networks.sort(key=lambda n: n.get("signal", 0), reverse=True)
    log.info(f"Găsite {len(networks)} rețele.")
    return networks


def save_wifi_config(ssid: str, password: str) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    config = {"ssid": ssid, "password": password}
    CONFIG_FILE.write_text(json.dumps(config, indent=2))
    log.info(f"Config WiFi salvat pentru SSID: {ssid}")


def load_wifi_config() -> dict | None:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except json.JSONDecodeError:
            return None
    return None


def write_wpa_supplicant(ssid: str, password: str) -> None:
    """Scrie configurația wpa_supplicant."""
    config = f"""ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=RO

network={{
    ssid="{ssid}"
    psk="{password}"
    key_mgmt=WPA-PSK
}}
"""
    Path("/etc/wpa_supplicant/wpa_supplicant.conf").write_text(config)
    log.info("wpa_supplicant.conf actualizat.")


def connect_to_wifi(ssid: str, password: str) -> bool:
    """Încearcă conectarea la WiFi. Returnează True dacă reușit."""
    log.info(f"Conectare la '{ssid}'...")
    write_wpa_supplicant(ssid, password)
    
    run("wpa_cli -i wlan0 reconfigure")
    time.sleep(8)
    
    if is_connected():
        log.info(f"✓ Conectat la '{ssid}'! IP: {get_ip_address()}")
        return True
    
    log.warning(f"✗ Nu s-a putut conecta la '{ssid}'.")
    return False


def get_ip_address() -> str:
    _, out, _ = run("hostname -I")
    ips = out.split()
    for ip in ips:
        if not ip.startswith("192.168.4."):
            return ip
    return out.split()[0] if ips else "necunoscut"


# ── Access Point ──────────────────────────────────────────────────────────────

def start_ap_mode() -> None:
    """Pornește modul Access Point folosind hostapd + dnsmasq."""
    log.info(f"Pornire AP '{AP_SSID}'...")

    # Scriem config hostapd
    hostapd_conf = f"""interface={AP_INTERFACE}
driver=nl80211
ssid={AP_SSID}
hw_mode=g
channel=6
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase={AP_PASSWORD}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
"""
    Path("/etc/hostapd/hostapd_zenis.conf").write_text(hostapd_conf)

    # Config dnsmasq pentru AP
    dnsmasq_conf = f"""interface={AP_INTERFACE}
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
address=/#/{AP_IP}
"""
    Path("/etc/dnsmasq_zenis.conf").write_text(dnsmasq_conf)

    # Setăm IP static pe interfață
    run(f"ip link set {AP_INTERFACE} up")
    run(f"ip addr flush dev {AP_INTERFACE}")
    run(f"ip addr add {AP_IP}/24 dev {AP_INTERFACE}")

    # Oprim wpa_supplicant dacă rulează
    run("systemctl stop wpa_supplicant 2>/dev/null || true")
    run("pkill -f 'wpa_supplicant' || true")
    time.sleep(1)

    # Pornim hostapd și dnsmasq
    run("pkill hostapd || true")
    run("pkill dnsmasq || true")
    time.sleep(1)

    ap_proc = subprocess.Popen(
        ["hostapd", "/etc/hostapd/hostapd_zenis.conf"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    dns_proc = subprocess.Popen(
        ["dnsmasq", "--conf-file=/etc/dnsmasq_zenis.conf", "--no-daemon"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )

    time.sleep(2)
    log.info(f"✓ AP pornit: SSID='{AP_SSID}' | IP={AP_IP} | Port={PORT}")
    log.info(f"  Parolă AP: {AP_PASSWORD}")
    return ap_proc, dns_proc


def stop_ap_mode(ap_proc, dns_proc) -> None:
    log.info("Oprire AP mode...")
    try:
        ap_proc.terminate()
        dns_proc.terminate()
    except Exception:
        pass
    run("pkill hostapd || true")
    run("pkill dnsmasq || true")
    run(f"ip addr flush dev {AP_INTERFACE}")


# ── HTTP Handler ──────────────────────────────────────────────────────────────

# Citim template HTML o singură dată
TEMPLATE_PATH = Path(__file__).parent / "templates" / "setup.html"

class SetupHandler(BaseHTTPRequestHandler):
    
    # Injectăm referința la server principal pentru a putea semnaliza
    wifi_configured_event: threading.Event = None
    configured_ssid: list = [""]  # mutable container

    def log_message(self, format, *args):
        log.info(f"HTTP {self.address_string()} {format % args}")

    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path in ("/", "/setup"):
            self._serve_setup_page()
        elif parsed.path == "/scan":
            self._serve_scan()
        elif parsed.path == "/status":
            self._serve_status()
        elif parsed.path.startswith("/static/"):
            self._serve_static(parsed.path)
        else:
            # Captive portal redirect — orice request → pagina de setup
            self._redirect("/")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/connect":
            self._handle_connect()
        elif parsed.path == "/forget":
            self._handle_forget()
        else:
            self._send_json({"error": "Not found"}, 404)

    def _serve_setup_page(self):
        html = TEMPLATE_PATH.read_text(encoding="utf-8")
        self._send_response(200, "text/html; charset=utf-8", html.encode())

    def _serve_scan(self):
        networks = scan_networks()
        self._send_json({"networks": networks})

    def _serve_status(self):
        connected = is_connected()
        data = {
            "connected": connected,
            "ssid": get_current_ssid() if connected else "",
            "ip": get_ip_address() if connected else "",
        }
        self._send_json(data)

    def _handle_connect(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        params = parse_qs(body)
        
        ssid = params.get("ssid", [""])[0].strip()
        password = params.get("password", [""])[0].strip()
        
        if not ssid:
            self._send_json({"success": False, "error": "SSID lipsă"})
            return

        log.info(f"Cerere conectare la '{ssid}'")
        
        # Salvăm imediat config-ul
        save_wifi_config(ssid, password)
        
        # Răspundem clientului că procesăm
        self._send_json({
            "success": True,
            "message": f"Se conectează la '{ssid}'... Raspberry Pi-ul se va reporni în ~15 secunde."
        })
        
        # Semnalizăm că avem config nou → main loop va face reconectarea
        SetupHandler.configured_ssid[0] = ssid
        if SetupHandler.wifi_configured_event:
            SetupHandler.wifi_configured_event.set()

    def _handle_forget(self):
        if CONFIG_FILE.exists():
            CONFIG_FILE.unlink()
        run("wpa_cli -i wlan0 remove_network all || true")
        self._send_json({"success": True, "message": "Config WiFi șters."})

    def _serve_static(self, path):
        file_path = Path(__file__).parent / path.lstrip("/")
        if file_path.exists():
            ext = file_path.suffix
            mime = {"css": "text/css", "js": "application/javascript",
                    "png": "image/png", "ico": "image/x-icon"}.get(ext.lstrip("."), "text/plain")
            self._send_response(200, mime, file_path.read_bytes())
        else:
            self._send_response(404, "text/plain", b"Not found")

    def _redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()

    def _send_json(self, data: dict, code=200):
        body = json.dumps(data).encode()
        self._send_response(code, "application/json", body)

    def _send_response(self, code, content_type, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", len(body))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)


# ── GPIO Button Monitor ───────────────────────────────────────────────────────

class ButtonMonitor:
    """
    Monitorizează GPIO 3 pentru butonul de HARD RESET WiFi.

    Cum se conectează fizic:
    ┌─────────────────────────────────────────┐
    │  Pi Zero 2W                             │
    │                                         │
    │  Pin 1  [3.3V ]  [ GND] Pin 6           │
    │  Pin 3  [GPIO3]──[BTN ]──[GND] Pin 6   │
    │                                         │
    │  Buton simplu momentan între            │
    │  GPIO3 (Pin 5) și GND (Pin 6)          │
    │  Fără rezistență — pull-up intern activ │
    └─────────────────────────────────────────┘

    Comportament:
    - Ținut < 3 sec : ignorat (debounce / apăsare accidentală)
    - Ținut ≥ 3 sec : șterge wifi.json + reboot → Pi intră în AP mode
    - Pi oprit + apăsare : pornește Pi-ul (comportament hardware GPIO3)
    """

    def __init__(self, on_reset_callback):
        self.on_reset = on_reset_callback
        self._thread  = None
        self._stop    = threading.Event()
        self._gpio_ok = False

        # Încearcă să importe RPi.GPIO (disponibil doar pe Pi real)
        try:
            import RPi.GPIO as GPIO
            self.GPIO = GPIO
            self._setup_gpio()
            self._gpio_ok = True
            log.info(f"GPIO OK — buton reset pe GPIO{RESET_GPIO_PIN} (Pin 5)")
        except ImportError:
            log.warning("RPi.GPIO negăsit — buton fizic dezactivat (mod dev?)")
        except Exception as e:
            log.warning(f"GPIO init eșuat: {e} — buton fizic dezactivat")

    def _setup_gpio(self):
        GPIO = self.GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        # GPIO3 are pull-up hardware pe Pi, dar setăm și software pull-up
        GPIO.setup(RESET_GPIO_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        log.info(f"GPIO{RESET_GPIO_PIN} configurat ca INPUT cu PULL-UP")

    def start(self):
        if not self._gpio_ok:
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True,
            name="button-monitor"
        )
        self._thread.start()
        log.info("Monitor buton pornit.")

    def stop(self):
        self._stop.set()
        if self._gpio_ok:
            try:
                self.GPIO.cleanup(RESET_GPIO_PIN)
            except Exception:
                pass

    def _monitor_loop(self):
        GPIO = self.GPIO
        press_start = None

        log.info(f"Ascult GPIO{RESET_GPIO_PIN} — ține {RESET_HOLD_SEC}s pentru reset WiFi")

        while not self._stop.is_set():
            try:
                state = GPIO.input(RESET_GPIO_PIN)

                # Buton apăsat = LOW (pull-up activ, buton trage la GND)
                if state == GPIO.LOW:
                    if press_start is None:
                        press_start = time.time()
                        log.debug("Buton apăsat — cronometru pornit")

                    held = time.time() - press_start

                    # Feedback progresiv în log la fiecare secundă
                    if int(held) != int(held - 0.05) and int(held) > 0:
                        remaining = RESET_HOLD_SEC - int(held)
                        if remaining > 0:
                            log.info(f"Buton ținut {int(held)}s / {RESET_HOLD_SEC}s pentru reset...")
                        else:
                            log.info("Buton ținut suficient — declanșez resetul!")

                    # Prag atins → declanșăm resetul
                    if held >= RESET_HOLD_SEC:
                        log.warning(
                            f"HARD RESET declanșat după {held:.1f}s apăsare continuă!"
                        )
                        self._trigger_reset()
                        return  # ieșim din loop după reset

                else:
                    # Buton eliberat
                    if press_start is not None:
                        held = time.time() - press_start
                        if held < RESET_HOLD_SEC:
                            log.debug(f"Buton eliberat după {held:.1f}s (prea scurt, ignorat)")
                        press_start = None

                time.sleep(0.05)  # polling la 20 Hz — suficient pentru un buton

            except Exception as e:
                log.error(f"Eroare în monitor buton: {e}")
                time.sleep(1)

    def _trigger_reset(self):
        """Șterge config WiFi și repornește Pi-ul în AP mode."""
        log.warning("=" * 45)
        log.warning("  HARD RESET WiFi — inițiat prin buton fizic")
        log.warning("=" * 45)

        # 1. Ștergem config WiFi
        if CONFIG_FILE.exists():
            CONFIG_FILE.unlink()
            log.info(f"Config WiFi șters: {CONFIG_FILE}")
        else:
            log.info("Niciun config WiFi de șters.")

        # 2. Curățăm wpa_supplicant
        run("wpa_cli -i wlan0 remove_network all 2>/dev/null || true")
        run("wpa_cli -i wlan0 save_config 2>/dev/null || true")

        # 3. Apelăm callback-ul (pentru a opri AP dacă rulează, etc.)
        try:
            self.on_reset()
        except Exception as e:
            log.error(f"Eroare în callback reset: {e}")

        # 4. Reboot — Pi va porni direct în AP mode fără config WiFi
        log.info("Reboot în 2 secunde...")
        time.sleep(2)
        run("reboot")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 50)
    log.info("  ZeNis WiFi Manager — pornire")
    log.info("=" * 50)

    # ── Pornim monitorul de buton imediat ─────────────────────────────────
    # Rulează în background pe tot parcursul — indiferent de starea WiFi
    def on_hard_reset():
        """Apelat când butonul e ținut 3 secunde."""
        log.warning("Callback hard reset — oprire servicii active...")
        # Dacă cumva AP-ul rula, îl oprim forțat
        run("pkill hostapd || true")
        run("pkill dnsmasq || true")

    btn = ButtonMonitor(on_reset_callback=on_hard_reset)
    btn.start()

    config = load_wifi_config()
    
    # Dacă avem config salvat, încearcă conectarea
    if config:
        log.info(f"Config găsit pentru '{config['ssid']}'. Conectare...")
        if connect_to_wifi(config["ssid"], config["password"]):
            log.info("✓ WiFi conectat. Pornesc aplicația ZeNis...")
            btn.stop()
            # Pornim aplicația principală
            os.execv("/usr/bin/python3", ["/usr/bin/python3", "/opt/zenis/main.py"])
            return
        else:
            log.warning("Conexiune eșuată. Intrăm în modul AP Setup.")

    # Nu avem config sau conexiunea a eșuat → AP mode
    ap_proc, dns_proc = start_ap_mode()

    # Event pentru a semnaliza că userul a introdus credențiale
    wifi_event = threading.Event()
    SetupHandler.wifi_configured_event = wifi_event

    # Pornim HTTP server în thread separat
    server = HTTPServer(("0.0.0.0", PORT), SetupHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    log.info(f"Server setup pornit pe http://{AP_IP}:{PORT}")

    # Așteptăm ca userul să configureze WiFi
    log.info("Aștept configurarea WiFi de la utilizator...")
    wifi_event.wait()  # blochează până primim credențiale

    ssid = SetupHandler.configured_ssid[0]
    config = load_wifi_config()
    
    if config:
        log.info(f"Credențiale primite. Opresc AP și mă conectez la '{ssid}'...")
        time.sleep(2)  # lasă clientul să primească răspunsul JSON

        server.shutdown()
        stop_ap_mode(ap_proc, dns_proc)
        time.sleep(2)

        # Reconectăm WiFi
        run("systemctl start wpa_supplicant")
        time.sleep(2)
        
        if connect_to_wifi(config["ssid"], config["password"]):
            log.info("✓ Conectat! Repornire în 3 secunde...")
            time.sleep(3)
            run("reboot")
        else:
            log.error("Nu s-a putut conecta. Repornesc AP-ul pentru reîncercare.")
            # Repornim AP pentru a permite reîncercarea
            os.execv(sys.executable, [sys.executable] + sys.argv)


if __name__ == "__main__":
    if os.geteuid() != 0:
        print("⚠️  Trebuie rulat ca root: sudo python3 wifi_manager.py")
        sys.exit(1)
    main()
