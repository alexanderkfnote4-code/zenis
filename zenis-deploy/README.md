# ZeNis — Deploy pe Raspberry Pi Zero 2W

## Ce conține acest pachet

```
zenis-deploy/
├── frontend/
│   ├── src/
│   │   ├── App.jsx           ← entry point React
│   │   ├── index.js          ← ReactDOM render
│   │   └── ZeNisEditor.jsx   ← editorul de pattern-uri
│   ├── public/index.html
│   └── package.json
├── backend/
│   ├── main.py               ← FastAPI server
│   └── requirements.txt
├── wifi_manager/
│   ├── wifi_manager.py       ← AP setup + buton GPIO3
│   └── templates/setup.html
├── systemd/
│   ├── zenis.service         ← backend autostart
│   └── zenis-wifi.service    ← wifi manager autostart
├── install.sh                ← instalare completă
└── README.md
```

## Instalare

### 1. Copiază pe Pi

```bash
# De pe calculatorul tău:
scp -r zenis-deploy/ pi@raspberrypi.local:~

# SSH pe Pi:
ssh pi@raspberrypi.local
cd ~/zenis-deploy
sudo bash install.sh
```

### 2. Configurare WiFi (prima pornire)

Dacă Pi-ul nu are WiFi configurat:
1. Caută WiFi: **ZeNis-Setup** → parolă: `zenis1234`
2. Deschide browser → **http://192.168.4.1**
3. Alege rețeaua ta WiFi → introdu parola → Conectează
4. Pi-ul se repornește automat

### 3. Accesare după repornire

Reconectează-te la WiFi-ul normal și deschide:
```
http://zenis.local
```

## Conectare Arduino

Arduino se conectează prin USB la Pi Zero 2W.

**Port serial implicit:** `/dev/ttyUSB0`

Dacă Arduino apare pe alt port (ex. `/dev/ttyACM0`):
```bash
# Verifică portul:
ls /dev/tty*

# Schimbă în service:
sudo nano /etc/systemd/system/zenis.service
# Adaugă: Environment=ZENIS_SERIAL=/dev/ttyACM0
sudo systemctl daemon-reload
sudo systemctl restart zenis
```

## API Endpoints

| Method | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/status` | Status curent |
| GET | `/api/patterns` | Lista pattern-uri salvate |
| POST | `/api/patterns/save` | Salvează pattern din editor |
| POST | `/api/play/{id}` | Execută pattern pe masă |
| POST | `/api/stop` | Oprește |
| POST | `/api/pause` | Pauză |
| POST | `/api/resume` | Continuă |
| POST | `/api/speed` | Setează viteza |
| GET | `/api/serial/ports` | Porturi serial disponibile |
| POST | `/api/serial/connect` | Conectează la Arduino |
| WS | `/ws` | Status live (progres, erori) |

Documentație interactivă Swagger: **http://zenis.local/docs**

## Buton fizic reset WiFi

```
Pi Zero 2W Pin 5 (GPIO3) ──── [Buton] ──── Pin 6 (GND)
```
- Pi oprit + apăsare scurtă → pornește Pi
- Pi pornit + ținut 3 secunde → șterge WiFi + reboot în AP mode

## Structură pe Pi după instalare

```
/opt/zenis/
├── backend/          ← FastAPI
├── frontend/build/   ← React compiled
├── wifi_manager/     ← WiFi setup
├── patterns/         ← fișiere .thr salvate
├── venv/             ← Python virtualenv
└── logs/

/etc/zenis/
└── wifi.json         ← credențiale WiFi (șterge pentru reset)

/var/log/
├── zenis.log         ← backend logs
└── zenis-wifi.log    ← wifi manager logs
```

## Comenzi utile

```bash
# Status servicii
sudo systemctl status zenis
sudo systemctl status zenis-wifi

# Logs live
sudo journalctl -u zenis -f
sudo journalctl -u zenis-wifi -f

# Restart manual
sudo systemctl restart zenis

# Reset WiFi
sudo rm /etc/zenis/wifi.json && sudo reboot

# Test API fără browser
curl http://zenis.local/api/status
```
