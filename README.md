# ZeNis — Sand Table

ZeNis este o versiune personalizată a [Dune Weaver](https://github.com/tuanchris/dune-weaver) pentru mese de nisip cu Raspberry Pi.

## Ce adaugă ZeNis
- **Temă nisipiu** și numele ZeNis (aplicație, masă, hotspot WiFi)
- **Caută** (fostul Browse): selecție multiplă și ștergere a desenelor proprii (`custom_patterns`); patternurile încorporate nu pot fi șterse
- **LED Override**: controalele luminilor sunt active doar cu Override pornit; la oprire revine scena salvată (rulează/repaus), luminozitatea, viteza și aprinderea; se oprește singur când începe o formă nouă sau o rutină
- **Desenează**: editor de forme (linie, cerc, elipsă, inimă, stea, spirală...), previzualizare animată, salvare în librărie, trimitere la masă. Traseul pornește din centru, cu unghi continuu, fără rotiri pe loc.
- **Live (desen de mână)**: desenezi cu degetul, iar după 5 secunde de pauză masa desenează linia. Cât e activ: LED-urile pe efectul de rulare și muzica pornită. Viteză reglabilă, poziția reală a bilei afișată pe ecran. Se oprește singur după 10 minute fără desen.
- **Audio**: boxe Bluetooth (scan, împerechere, conectare), upload MP3/WAV/OGG/FLAC/AAC până la 200 MB, volum
- **Muzică sincronizată cu masa**: pornește când masa desenează, se oprește la pauză sau oprire
- **Viteza de curățare** se aplică tuturor curățărilor (inclusiv Good Night și curățărilor personalizate), nu și modelului care urmează
- **Rutine Good Morning / Good Night**: trezire și culcare cu nisip, lumină și muzică, la oră fixă
- **Actualizare la distanță** din acest repo, cu backup și revenire automată
- **Homing cu senzor magnetic** pe unghi (GPIO17 pe Raspberry Pi): după Home masa știe exact unde e „nordul”
- **Calibrare** (tab separat, activat din Settings): coordonatele bilei și alinierea cadranelor cu LED-urile
- **Ecran cadran** (opțional, din meniul ☰): rama se rotește ca la un ceas, meniurile stau în 10 cercuri, iar în mijloc se vede desenul în lucru

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
Backup-urile automate sunt în `~/.zenis-backup/` (ultimele 5), inclusiv o copie a `state.json` și `playlists.json`. Actualizarea **nu atinge** desenele (`patterns/`), playlisturile, cache-ul de previzualizări, muzica și alarmele.

## Publicarea unei versiuni noi
Încarcă în repo, peste cele vechi, **ambele** fișiere:
1. `zenis-overlay.tar.gz` (pachetul)
2. `ZENIS_VERSION` (un fișier text cu numărul versiunii, de ex. `1.6.5`) — după el vede aplicația că există o versiune nouă.

Mesele se pot actualiza apoi din aplicație sau cu `sudo zenis-update`.

## Live (desen de mână)
În tab-ul **Desenează** apasă **Live**. Pornește modul (sau începe direct să desenezi), trage linii cu degetul: după 5 secunde fără atingere, masa le desenează la viteza aleasă. Liniile punctate așteaptă, cele aurii sunt deja pe nisip, iar punctul auriu e bila. Bila nu se poate ridica, deci între două linii separate trage o legătură. Comutatorul **5s / 0** alege dacă masa așteaptă 5 secunde după ce te oprești sau desenează **în timp real**, cât tragi linia. **Centru** duce bila în centru pe o linie dreaptă. **Oprește Live** readuce luminile pe repaus și oprește muzica. Pentru depanare, fiecare linie e notată în jurnal: `journalctl -u dune-weaver | grep Live:`.

## Rutine: Good Morning și Good Night (tab-ul „Rutine”)
Configurezi rutina și apeși **„Salvează alarma”**. Alarmele salvate apar în listă (oră, zile, playlist, melodie, data salvării) și se opresc sau pornesc din comutator (fără să fie șterse) și se șterg din butonul din dreapta. Poți avea oricâte, de exemplu Good Morning 07:00 luni–vineri și 09:00 în weekend. Între două alarme active trebuie cel puțin 30 de minute (verificat pe toată săptămâna, inclusiv peste miezul nopții); o alarmă la aceeași oră sau prea aproape nu se salvează și apare motivul. Ora se alege în format de 24 de ore.

**Good Morning** — alegi ora, zilele, playlistul (o dată sau repetat), melodia de început, volumul și lumina finale.
Muzica și luminile pornesc la 10%, după 10 secunde pornește bila, iar în 5 minute sunetul și lumina cresc până la nivelul ales. Primul model pornește fără curățare (nisipul e deja pregătit de Good Night). Alarma are prioritate față de pauza programată Still Sands: cât rulează Good Morning, masa nu e oprită de ea (setarea ta rămâne neschimbată). După melodia de început muzica continuă cât timp masa desenează.

**Good Night** — alegi ora, zilele și melodia. Masa se oprește, bila iese drept pe rază până la margine, din poziția în care se află, și curăță nisipul în spirală spre centru (curățarea mesei, rotită să înceapă exact la unghiul bilei).
Sunetul și lumina scad odată cu bila și ajung la 10% exact când bila e în centru; după 5 secunde se sting complet, fără să treacă prin efectul de repaus. Bila rămâne în centru pentru dimineață.

Ambele au buton **„Testează acum”**.

**Oprirea unei alarme în curs:** cât rulează o alarmă, pe orice pagină apare sus butonul **„Oprește alarma”**: bila se oprește unde e, muzica se oprește, luminile revin la efectul de repaus, iar volumul la normal. Același efect îl are și Stop-ul de pe masă. Dacă pornești alt model în timpul unei alarme, alarma se retrage singură. Rutinele folosesc ora Raspberry Pi-ului, luată automat de pe internet (NTP) și afișată în fiecare card împreună cu fusul orar. Pi 4 nu are baterie pentru ceas: fără internet după o pană de curent, ora poate fi greșită (pagina avertizează „nesincronizată”). Fusul orar se setează cu `sudo raspi-config` → Localisation → Timezone.

## Ecran cadran
Din meniul **☰** (sus, dreapta) alegi **Ecran cadran** sau **Ecran clasic**. Alegerea se ține pe fiecare telefon sau calculator.

- **Rama** se rotește cu degetul ca rama unui ceas (pe calculator: rotița mouse-ului sau săgețile); la fiecare 20° treci la următoarea opțiune.
- **Cele 10 cercuri** sunt meniurile: Modele, Playlisturi, Desenează, Control, Viteză, Lumini, Audio, Rutine, Setări și Listă (sau Calibrare, dacă e activată). Atingi un cerc ca să intri în meniu; opțiunile lui apar în cercuri. **Meniu** (sus) te întoarce.
- **Pornește / Oprește** stă între cele două cercuri de jos. Atingerea mijlocului pune pauză sau continuă.
- **În mijloc**: previzualizarea opțiunii alese; cât masa desenează, desenul real se construiește odată cu bila, iar progresul apare pe ramă.
- **Desenează**: Editor desen și curățarea nisipului (din centru, de la margine, lateral).
- **Control**: Home, bila în centru, bila la margine, Control complet. **Viteză**: valori de la 50 la 500 mm/s.
- Meniurile cu multe setări (Lumini, Audio, Rutine, Setări, Editor desen) nu schimbă pagina imediat: numele apare în mijloc, care luminează de două ori, apoi pagina se deschide cu o tranziție. Butonul **Cadran** (stânga jos) te aduce înapoi.

## Homing cu senzor magnetic și Calibrare
**Cablaj:** modulul Hall (3144E + LM393) la Raspberry Pi: **VCC → pin 1 (3.3V)**, **GND → pin 9**, **DO → pin 11 (GPIO17)**. AO rămâne nelegat. Nu alimenta modulul la 5V, pentru că ieșirea ar trimite 5V în Pi. Senzorul dă LOW când magnetul e în dreptul lui; verificare din terminal: `pinctrl get 17`.

**Activare:** Settings → Homing Configuration → **Homing cu senzor magnetic (GPIO17)**. De atunci butonul Home (și homing-ul la pornire sau din playlist):
1. aduce bila în centru (crash homing pe rază);
2. rotește brațul până găsește magnetul, se dă înapoi și trece încet peste el, măsurând unde începe și unde se termină zona;
3. se oprește la mijlocul zonei și aduce din nou bila în centru. Unghiul de acolo devine *Sensor Offset* (implicit 0°).

În timpul rotirii raza e compensată, deci bila rămâne în centru. Dacă magnetul nu e găsit, masa face homing-ul obișnuit (rămâne utilizabilă), iar eroarea apare în Settings și în pagina Calibrare.

**Calibrare:** în același loc bifezi **Pagina Calibrare** și apare tab-ul **Calibrare**. Pagina arată masa cu LED-urile, cadranele, poziția bilei și coordonatele θ (unghi) și ρ (rază), cu butoane de mișcare (±0.2°, ±1°, ±10°, centru, margine). Pași:
1. **Home** cu senzorul;
2. **Aprinde LED 1**, apasă **Margine** și rotește bila până e exact în dreptul lui;
3. **Aici e LED-ul 1**: poziția se salvează față de magnet, deci rămâne valabilă după fiecare Home;
4. **Mergi la LED 27**: bila trebuie să ajungă la începutul cadranului 2; dacă ajunge pe partea opusă, bifează **Sens invers**.

Butoanele de lumini: **Arată cadranele** (5 zone colorate; 132 LED-uri → 26, 26, 26, 26, 28), **LED urmărește bila**, **Revino la normal**. La ieșirea din pagină luminile revin singure la scena salvată. Setările sunt în `~/dune-weaver/zenis_calib.json`.

## WiFi pentru client
Dacă masa nu găsește o rețea cunoscută, pornește hotspot-ul **ZeNis**. Clientul se conectează cu telefonul, alege WiFi-ul de acasă și introduce parola.

## Codul sursă al interfeței
Sursele React ale interfeței ZeNis sunt în `zenis-frontend-src.zip` (folderul `frontend/`). Compilare: `npm install` și `npm run build`.

## Licență
ZeNis se bazează pe Dune Weaver (© tuanchris și contribuitorii), licențiat **GPL-3.0**. Modificările ZeNis sunt distribuite sub aceeași licență, iar codul sursă este disponibil în acest repo.
