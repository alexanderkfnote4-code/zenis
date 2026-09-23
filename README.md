# ZeNis — Sand Table

ZeNis este o versiune personalizată a [Dune Weaver](https://github.com/tuanchris/dune-weaver) pentru mese de nisip cu Raspberry Pi.

## Ce adaugă ZeNis
- **Temă nisipiu** și numele ZeNis (aplicație, masă, hotspot WiFi)
- **Desenează**: editor de forme (linie, cerc, elipsă, inimă, stea, spirală...), previzualizare animată, salvare în librărie, trimitere la masă. Traseul pornește din centru, cu unghi continuu, fără rotiri pe loc.
- **Audio**: boxe Bluetooth (scan, împerechere, conectare), upload MP3/WAV/OGG/FLAC/AAC până la 200 MB, volum
- **Muzică sincronizată cu masa**: pornește când masa desenează, se oprește la pauză sau oprire
- **Rutine Good Morning / Good Night**: trezire și culcare cu nisip, lumină și muzică, la oră fixă
- **Actualizare la distanță** din acest repo, cu backup și revenire automată

## Instalare (Raspberry Pi OS 64-bit)
Funcționează pe un Pi gol sau peste o masă existentă. Rulează **fără sudo**:
```bash
curl -fsSLO https://github.com/alexanderkfnote4-code/zenis/raw/main/zenis-install.sh
bash zenis-install.sh
```
Pe un Pi gol, installer-ul întreabă cum e conectat controlerul (USB sau UART).

## Actualizare
```bash
sudo zenis-update            # instalează versiunea nouă dacă există
sudo zenis-update --force    # reinstalează versiunea curentă
```
Backup-urile automate sunt în `~/.zenis-backup/` (ultimele 5).

## Publicarea unei versiuni noi
1. Modifică `ZENIS_VERSION` din pachet (de ex. `1.0.1`).
2. Încarcă noul `zenis-overlay.tar.gz` în acest repo.
3. Pe mese: `sudo zenis-update`.

## Rutine: Good Morning și Good Night (tab-ul „Rutine”)
**Good Morning** — alegi ora, zilele, playlistul (o dată sau repetat), melodia de început, volumul și lumina finale.
Muzica și luminile pornesc la 10%, după 10 secunde pornește bila, iar în 5 minute sunetul și lumina cresc până la nivelul ales. După melodia de început muzica continuă cât timp masa desenează.

**Good Night** — alegi ora, zilele și melodia. Masa se oprește, bila merge pe margine și curăță nisipul spirală spre centru.
Sunetul și lumina scad odată cu bila și ajung la 10% exact când bila e în centru; după 5 secunde se sting complet. Bila rămâne în centru pentru dimineață.

Ambele au buton **„Testează acum”**. Rutinele folosesc ora Raspberry Pi-ului, afișată în pagină; verific-o cu `timedatectl` (fus orar `Europe/Bucharest`).

## WiFi pentru client
Dacă masa nu găsește o rețea cunoscută, pornește hotspot-ul **ZeNis**. Clientul se conectează cu telefonul, alege WiFi-ul de acasă și introduce parola.

## Licență
ZeNis se bazează pe Dune Weaver (© tuanchris și contribuitorii), licențiat **GPL-3.0**. Modificările ZeNis sunt distribuite sub aceeași licență, iar codul sursă este disponibil în acest repo.
