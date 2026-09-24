# ZeNis — Sand Table

ZeNis este o versiune personalizată a [Dune Weaver](https://github.com/tuanchris/dune-weaver) pentru mese de nisip cu Raspberry Pi.

## Ce adaugă ZeNis
- **Temă nisipiu** și numele ZeNis (aplicație, masă, hotspot WiFi)
- **Desenează**: editor de forme (linie, cerc, elipsă, inimă, stea, spirală...), previzualizare animată, salvare în librărie, trimitere la masă. Traseul pornește din centru, cu unghi continuu, fără rotiri pe loc.
- **Live (desen de mână)**: desenezi cu degetul, iar după 5 secunde de pauză masa desenează linia. Cât e activ: LED-urile pe efectul de rulare și muzica pornită. Viteză reglabilă, poziția reală a bilei afișată pe ecran. Se oprește singur după 10 minute fără desen.
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
Din aplicație: **Settings → Software Version** arată versiunea ZeNis instalată și ultima publicată. Când există una nouă, apare butonul de update. Din terminal:
```bash
sudo zenis-update            # instalează versiunea nouă dacă există
sudo zenis-update --force    # reinstalează versiunea curentă
```
Backup-urile automate sunt în `~/.zenis-backup/` (ultimele 5).

## Publicarea unei versiuni noi
Încarcă în repo, peste cele vechi, **ambele** fișiere:
1. `zenis-overlay.tar.gz` (pachetul)
2. `ZENIS_VERSION` (un fișier text cu numărul versiunii, de ex. `1.6.5`) — după el vede aplicația că există o versiune nouă.

Mesele se pot actualiza apoi din aplicație sau cu `sudo zenis-update`.

## Live (desen de mână)
În tab-ul **Desenează** apasă **Live**. Pornește modul (sau începe direct să desenezi), trage linii cu degetul: după 5 secunde fără atingere, masa le desenează la viteza aleasă. Liniile punctate așteaptă, cele aurii sunt deja pe nisip, iar punctul auriu e bila. Bila nu se poate ridica, deci între două linii separate trage o legătură. Comutatorul **5s / 0** alege dacă masa așteaptă 5 secunde după ce te oprești sau desenează **în timp real**, cât tragi linia. **Centru** duce bila în centru pe o linie dreaptă. **Oprește Live** readuce luminile pe repaus și oprește muzica. Pentru depanare, fiecare linie e notată în jurnal: `journalctl -u dune-weaver | grep Live:`.

## Rutine: Good Morning și Good Night (tab-ul „Rutine”)
Configurezi rutina și apeși **„Salvează alarma”**. Alarmele salvate apar în listă (oră, zile, playlist, melodie, data salvării) și se opresc sau pornesc din comutator (fără să fie șterse) și se șterg din butonul din dreapta. Poți avea oricâte, de exemplu Good Morning 07:00 luni–vineri și 09:00 în weekend. Ora se alege în format de 24 de ore.

**Good Morning** — alegi ora, zilele, playlistul (o dată sau repetat), melodia de început, volumul și lumina finale.
Muzica și luminile pornesc la 10%, după 10 secunde pornește bila, iar în 5 minute sunetul și lumina cresc până la nivelul ales. Primul model pornește fără curățare (nisipul e deja pregătit de Good Night). Alarma are prioritate față de pauza programată Still Sands: cât rulează Good Morning, masa nu e oprită de ea (setarea ta rămâne neschimbată). După melodia de început muzica continuă cât timp masa desenează.

**Good Night** — alegi ora, zilele și melodia. Masa se oprește, bila iese drept pe rază până la margine, din poziția în care se află, și curăță nisipul în spirală spre centru (curățarea mesei, rotită să înceapă exact la unghiul bilei).
Sunetul și lumina scad odată cu bila și ajung la 10% exact când bila e în centru; după 5 secunde se sting complet, fără să treacă prin efectul de repaus. Bila rămâne în centru pentru dimineață.

Ambele au buton **„Testează acum”**.

**Oprirea unei alarme în curs:** cât rulează o alarmă, pe orice pagină apare sus butonul **„Oprește alarma”**: bila se oprește unde e, muzica se oprește, luminile revin la efectul de repaus, iar volumul la normal. Același efect îl are și Stop-ul de pe masă. Dacă pornești alt model în timpul unei alarme, alarma se retrage singură. Rutinele folosesc ora Raspberry Pi-ului, luată automat de pe internet (NTP) și afișată în fiecare card împreună cu fusul orar. Pi 4 nu are baterie pentru ceas: fără internet după o pană de curent, ora poate fi greșită (pagina avertizează „nesincronizată”). Fusul orar se setează cu `sudo raspi-config` → Localisation → Timezone.

## WiFi pentru client
Dacă masa nu găsește o rețea cunoscută, pornește hotspot-ul **ZeNis**. Clientul se conectează cu telefonul, alege WiFi-ul de acasă și introduce parola.

## Licență
ZeNis se bazează pe Dune Weaver (© tuanchris și contribuitorii), licențiat **GPL-3.0**. Modificările ZeNis sunt distribuite sub aceeași licență, iar codul sursă este disponibil în acest repo.
