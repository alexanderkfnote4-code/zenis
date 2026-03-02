#!/bin/bash
# ══════════════════════════════════════════════════════════════
#   ZeNis — Script de instalare complet
#   Testare pe Raspberry Pi Zero 2W cu Pi OS Lite
#
#   Rulează cu: sudo bash install.sh
# ══════════════════════════════════════════════════════════════

set -e

# ── Culori ────────────────────────────────────────────────────
SAND='\033[38;2;200;169;126m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

log()  { echo -e "${SAND}▸${RESET} $1"; }
ok()   { echo -e "${GREEN}✓${RESET} $1"; }
err()  { echo -e "${RED}✗ EROARE:${RESET} $1"; exit 1; }
step() { echo -e "\n${BOLD}${SAND}── $1 ──${RESET}"; }

# ── Verificare root ───────────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Rulează ca root: sudo bash install.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/zenis"
USER_NAME="${SUDO_USER:-pi}"

# ── Banner ────────────────────────────────────────────────────
echo ""
echo -e "${SAND}${BOLD}  ZeNis Sand Table — Instalare${RESET}"
echo -e "${DIM}  Pi Zero 2W · FastAPI · React · Serial${RESET}"
echo ""

# ══════════════════════════════════════════════════════════════
step "1. Pachete sistem"
# ══════════════════════════════════════════════════════════════
apt-get update -qq
apt-get install -y -qq \
    python3 python3-pip python3-venv \
    nodejs npm \
    hostapd dnsmasq \
    wireless-tools iw \
    python3-rpi.gpio \
    avahi-daemon \
    git curl \
    2>/dev/null
ok "Pachete instalate"

# Activăm avahi pentru zenis.local
systemctl enable avahi-daemon 2>/dev/null || true
systemctl start  avahi-daemon 2>/dev/null || true
ok "mDNS (zenis.local) activat"

# ══════════════════════════════════════════════════════════════
step "2. Structură directoare"
# ══════════════════════════════════════════════════════════════
mkdir -p "$INSTALL_DIR"/{backend,frontend,wifi_manager/templates,patterns,logs}
mkdir -p /etc/zenis
ok "Directoare create în $INSTALL_DIR"

# ══════════════════════════════════════════════════════════════
step "3. Backend FastAPI"
# ══════════════════════════════════════════════════════════════
cp "$SCRIPT_DIR/backend/main.py"          "$INSTALL_DIR/backend/"
cp "$SCRIPT_DIR/backend/requirements.txt" "$INSTALL_DIR/backend/"

log "Creare virtualenv Python..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip -q
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt" -q
ok "FastAPI + dependențe instalate în virtualenv"

# ══════════════════════════════════════════════════════════════
step "4. Frontend React — build"
# ══════════════════════════════════════════════════════════════
log "Copiere surse frontend..."
cp -r "$SCRIPT_DIR/frontend/." "$INSTALL_DIR/frontend/"

log "npm install... (poate dura 3-5 min pe Pi Zero)"
cd "$INSTALL_DIR/frontend"
npm install --silent 2>/dev/null
ok "Dependențe npm instalate"

log "Build React pentru producție..."
GENERATE_SOURCEMAP=false npm run build 2>/dev/null
ok "Frontend build-uit în $INSTALL_DIR/frontend/build"

cd "$SCRIPT_DIR"

# ══════════════════════════════════════════════════════════════
step "5. WiFi Manager"
# ══════════════════════════════════════════════════════════════
cp "$SCRIPT_DIR/wifi_manager/wifi_manager.py"       "$INSTALL_DIR/wifi_manager/"
cp "$SCRIPT_DIR/wifi_manager/templates/setup.html"  "$INSTALL_DIR/wifi_manager/templates/"
chmod +x "$INSTALL_DIR/wifi_manager/wifi_manager.py"

# Dezactivăm hostapd/dnsmasq global (gestionat de wifi_manager)
systemctl disable hostapd 2>/dev/null || true
systemctl disable dnsmasq 2>/dev/null || true
ok "WiFi Manager instalat"

# ══════════════════════════════════════════════════════════════
step "6. Permisiuni Serial"
# ══════════════════════════════════════════════════════════════
usermod -aG dialout "$USER_NAME" 2>/dev/null || true
ok "User $USER_NAME adăugat în grupul dialout (acces serial)"

# ══════════════════════════════════════════════════════════════
step "7. Systemd services"
# ══════════════════════════════════════════════════════════════
cp "$SCRIPT_DIR/systemd/zenis.service"      /etc/systemd/system/
cp "$SCRIPT_DIR/systemd/zenis-wifi.service" /etc/systemd/system/

# Setăm userul corect în service
sed -i "s/User=pi/User=$USER_NAME/g" /etc/systemd/system/zenis.service

systemctl daemon-reload
systemctl enable zenis-wifi.service
systemctl enable zenis.service
ok "Services activate (pornire automată la boot)"

# ══════════════════════════════════════════════════════════════
step "8. Permisiuni fișiere"
# ══════════════════════════════════════════════════════════════
chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"
ok "Permisiuni setate"

# ══════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════
echo ""
echo -e "${SAND}${BOLD}══════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✓ Instalare completă!${RESET}"
echo -e "${SAND}${BOLD}══════════════════════════════════════════${RESET}"
echo ""
echo -e "${DIM}La repornire:${RESET}"
echo -e "  1. WiFi Manager pornește primul"
echo -e "     → Dacă nu e WiFi configurat: AP ${SAND}ZeNis-Setup${RESET} (parolă: ${SAND}zenis1234${RESET})"
echo -e "     → Configurezi WiFi la ${SAND}http://192.168.4.1${RESET}"
echo -e "  2. ZeNis backend pornește automat"
echo -e "     → Accesezi la ${SAND}http://zenis.local${RESET}"
echo ""
echo -e "${DIM}Comenzi utile:${RESET}"
echo -e "  ${SAND}sudo systemctl status zenis${RESET}           — status backend"
echo -e "  ${SAND}sudo journalctl -u zenis -f${RESET}           — logs live"
echo -e "  ${SAND}sudo journalctl -u zenis-wifi -f${RESET}      — logs wifi"
echo -e "  ${SAND}sudo rm /etc/zenis/wifi.json && sudo reboot${RESET}  — reset WiFi"
echo ""
echo -e "${DIM}Serial Arduino:${RESET}"
echo -e "  Port implicit: ${SAND}/dev/ttyUSB0${RESET}"
echo -e "  Schimbă din UI Settings sau: ${SAND}ZENIS_SERIAL=/dev/ttyACM0 uvicorn ...${RESET}"
echo ""

read -p "$(echo -e "${SAND}Repornești acum? [y/N]:${RESET} ")" -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Repornire în 3 secunde..."
    sleep 3
    reboot
else
    log "Repornește manual cu: sudo reboot"
    log "Sau testează acum: sudo systemctl start zenis"
fi
