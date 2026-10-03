#!/bin/bash
# ================================================================
#  ZeNis - instalare completa pe Raspberry Pi (64-bit)
#  Pi gol:          instaleaza baza Dune Weaver + toate modificarile ZeNis
#  Masa existenta:  aplica doar modificarile ZeNis (cu backup)
#  Utilizare:       bash zenis-install.sh      (NU cu sudo)
# ================================================================
set -e
PIN=7ddb7f60671c8a6e4b03f935f648433784745cba     # versiunea Dune Weaver testata cu ZeNis
UPSTREAM=https://github.com/tuanchris/dune-weaver
REPO_RAW="${ZENIS_REPO_RAW:-https://raw.githubusercontent.com/alexanderkfnote4-code/zenis/main}"
DW="$HOME/dune-weaver"
HERE="$(cd "$(dirname "$0")" && pwd)"
S='\033[38;5;179m'; N='\033[0m'
[ "$(id -u)" = 0 ] && { echo "Ruleaza fara sudo: bash zenis-install.sh"; exit 1; }
[ "$(uname -m)" = aarch64 ] || { echo "Necesita Raspberry Pi OS 64-bit"; exit 1; }
echo -e "$S
  ███████╗███████╗███╗   ██╗██╗███████╗
     ███╔╝██╔════╝████╗  ██║██║██╔════╝
    ███╔╝ █████╗  ██╔██╗ ██║██║███████╗
   ███╔╝  ██╔══╝  ██║╚██╗██║██║╚════██║
  ███████╗███████╗██║ ╚████║██║███████║
  ╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝╚══════╝   Sand Table$N"
sudo -v   # cere parola o singura data

# 1. Pachetul ZeNis (local, langa script, sau de pe GitHub)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if [ -f "$HERE/zenis-overlay.tar.gz" ]; then cp "$HERE/zenis-overlay.tar.gz" "$TMP/o.tgz"
else echo "Descarc pachetul ZeNis..."; curl -fsSL "$REPO_RAW/zenis-overlay.tar.gz?t=$(date +%s)" -o "$TMP/o.tgz"; fi
tar -xzf "$TMP/o.tgz" -C "$TMP"

# 2. Baza (doar pe un Pi gol)
if [ ! -f "$DW/main.py" ]; then
  echo -e "${S}==> Instalez baza (Dune Weaver $PIN)$N"
  sudo apt-get update -qq && sudo apt-get install -y -qq git curl >/dev/null
  mkdir -p "$DW" && cd "$DW"
  git init -q && git remote add origin "$UPSTREAM"
  git fetch -q --depth 1 origin "$PIN" && git checkout -q FETCH_HEAD
  sed -i 's/HOTSPOT_SSID="Dune Weaver"/HOTSPOT_SSID="ZeNis"/' wifi/setup-wifi.sh
  echo -e "${S}==> Rulez installer-ul de baza (raspunde la intrebarea USB/UART)$N"
  bash setup-pi.sh
else
  echo -e "${S}==> Masa existenta gasita in $DW - aplic doar ZeNis$N"
fi

# 3. Toate modificarile ZeNis
bash "$TMP/zenis-overlay/apply.sh" "$DW"
echo -e "$S
Comenzi utile:
  sudo zenis-update            actualizeaza ZeNis din GitHub
  sudo zenis-update --force    reinstaleaza versiunea curenta
  Backup-uri automate:         ~/.zenis-backup/$N"
