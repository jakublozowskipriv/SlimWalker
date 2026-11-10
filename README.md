# Mgła Poznania

Poznań przykryty mgłą. Każda ulica, którą przejdziesz, odsłania się i zaczyna świecić bursztynem. To webowa aplikacja (PWA) na telefon. Działa bez backendu i bez logowania, a wszystkie dane zostają w telefonie (IndexedDB).

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testy dopasowania tras, procentów, GPX, pieczęci
npm run build      # build produkcyjny do dist/ (z service workerem)
npm run preview    # podgląd buildu
```

Dane miasta (`public/data/poznan.json`, ok. 3,9 MB, po gzip ok. 1,2 MB) są w repo, więc do uruchomienia nie trzeba niczego pobierać.

### Na iPhonie

1. Otwórz adres aplikacji w Safari (musi być HTTPS, bo inaczej GPS nie zadziała).
2. Kliknij Udostępnij → **Do ekranu początkowego**. Od tej pory aplikacja uruchamia się jak zwykła apka, na pełnym ekranie i offline.
3. Przy pierwszym spacerze Safari zapyta o lokalizację. Wybierz „Pozwól”.

## Wgrywanie tras

Przycisk **GPX** na mapie przyjmuje jeden plik albo wiele naraz, np. całą historię. Duplikaty są pomijane automatycznie. Na komputerze pliki można też przeciągnąć na mapę. W katalogu `samples/` są trzy przykładowe spacery (Jeżyce, Stare Miasto, Śródka nocą), dobre do szybkiego testu.

Skąd wziąć GPX na iPhonie:

| Źródło | Jak |
|---|---|
| **Strava** | strava.com → Ustawienia → Moje konto → *Pobierz lub usuń konto* → archiwum. W `activities/` są pliki `.gpx` (część jako `.fit.gz`, na razie nieobsługiwane). Pojedynczą aktywność wyeksportujesz przez ⋯ → *Eksportuj GPX* na stronie www. |
| **Apple Zdrowie / Fitness (zegarek)** | Zdrowie nie eksportuje GPX bezpośrednio. Darmowe apki typu *HealthFit* albo *RunGap* eksportują treningi „Chód” do GPX w Plikach. |
| **Garmin Connect** | Aktywność → ⚙ → *Eksportuj do GPX*. |
| **Nagrywanie w tle (plan B)** | Np. darmowa, otwartoźródłowa *Open GPX Tracker*: nagrywa przy zablokowanym ekranie, a ślad zapisujesz do Plików i wgrywasz tutaj. |

## Nagrywanie na żywo i ograniczenia iOS

Przycisk **Wyrusz na spacer** nagrywa trasę przez GPS i odsłania mgłę na bieżąco.

Na iOS strona ani PWA nie dostają pozycji, gdy ekran jest zablokowany albo aplikacja działa w tle. Tego nie da się obejść z poziomu przeglądarki. Co robi aplikacja:

- trzyma ekran włączony przez Wake Lock API (iOS 16.4+, w trybie „z ekranu początkowego” od iOS 18.4);
- co kilka sekund zapisuje punkty do IndexedDB. Jeśli Safari zamknie kartę, spacer wznowi się po ponownym otwarciu, a porzucony na ponad 3 h zapisze się sam;
- po powrocie z tła nie łączy dziury prostą linią, tylko pomija ten kawałek. Lepiej nie odsłonić ulicy, niż odsłonić ją niesłusznie.

Na długie spacery z telefonem w kieszeni realny plan B to natywna apka nagrywająca w tle i eksport GPX (tabela wyżej).

## Jak liczymy odkrycie ulicy

Pliki: `src/core/match.ts` (dopasowanie) i `src/core/progress.ts` (procenty).

1. **Odcinki.** Drogi z OSM są cięte na skrzyżowaniach (najwyżej 300 m na odcinek). Każdy odcinek jest próbkowany co 10 m.
2. **Ślad.** Ślad GPS jest najpierw czyszczony. Fragmenty szybsze niż 25 km/h (tramwaj, auto), skoki GPS i fixy o dokładności gorszej niż 50 m są odrzucane. Potem ślad jest zagęszczany co 5 m, a kierunek marszu liczony z okna ±10 m.
3. **Próbka zaliczona.** Próbka ulicy jest zaliczona, gdy ślad przeszedł obok niej w korytarzu **25 m w poprzek** i **±7,5 m wzdłuż**, w kierunku zgodnym z osią ulicy (**±40°**).
   - 25 m wynika z błędu GPS w mieście (5–15 m, w kanionach kamienic do 25 m) i z tego, że oś ulicy w OSM leży na środku jezdni, a idziesz chodnikiem. Równoległe ulice są w Poznaniu zwykle co najmniej 60–100 m od siebie, więc bufor nie przecieka na sąsiednią.
   - Korytarz jest krótki wzdłuż trasy, żeby zakończenie spaceru w połowie ulicy nie zaliczało dodatkowych 25 m. Złapał to test.
   - Warunek kierunku sprawia, że przejście przez pasy albo przez skrzyżowanie nie odkrywa ulicy poprzecznej.
4. **Odcinek odkryty.** Odcinek jest odkryty, gdy zaliczono **≥ 60%** jego próbek. To wybacza dziury GPS przy skrzyżowaniach, ale nie zalicza ulicy „liźniętej”. Zaliczone próbki sumują się między spacerami: połowa ulicy dziś i druga połowa jutro dają odkrytą ulicę.
5. **Procent miasta.** To odkryta długość podzielona przez długość wszystkich liczonych odcinków. Liczone są ulice (od osiedlowych po główne, deptaki, nazwane drogi serwisowe) oraz **nazwane** alejki i ścieżki. Bezimienne ścieżki są rysowane, świecą po przejściu i odsłaniają mgłę, ale nie zawyżają mianownika. Chodniki rysowane w OSM osobno są pomijane (dublowałyby ulice), z wyjątkiem chodników na mostach.
6. **Ulice.** To unikalne nazwy z co najmniej jednym odkrytym odcinkiem.
7. **Mgła.** Mgła jest wycinana wzdłuż samego śladu (promień ok. 40 m, miękkie brzegi), a nie tylko wzdłuż dopasowanych ulic. Spacer przez park też ją rozwiewa.

## Odświeżenie danych OSM

Dane pochodzą z Overpass API: granica miasta, 42 osiedla (`admin_level=9`), drogi, woda, parki i obrysy mostów.

- **Lokalnie:** `npm run osm` (czyli `osm:fetch`, który zapisuje surowe dane do `data/raw/`, ignorowane przez git, a potem `osm:build`, który tworzy `public/data/poznan.json`).
- **Przez GitHub:** zakładka Actions → **Odśwież dane OSM** → *Run workflow*. Workflow pobiera dane, przetwarza je i commituje wynik. Uruchamia się też sam po zmianie `scripts/fetch-osm.mjs` lub `scripts/build-data.ts`.

Po odświeżeniu danych aplikacja sama przelicza pokrycie ze wszystkich zapisanych śladów, bo indeksy odcinków się zmieniają.

Przykładowe spacery do testów generuje `node scripts/sample-gpx.ts "Jeżyce" 4000 samples/jezyce.gpx 20`. To losowy spacer po prawdziwych ulicach osiedla z realistycznym szumem GPS.

## Struktura

```
src/core/     logika bez DOM, pokryta testami (geo, match, progress, gpx, explore, achievements)
src/ui/       mapa (MapLibre + własny styl), mgła (canvas), ekrany, nagrywanie
src/engine.ts stan aplikacji: dane miasta + pokrycie + spacery
src/store.ts  IndexedDB
scripts/      pobieranie i przetwarzanie OSM, generator przykładowych GPX
tests/        vitest (także test na prawdziwych danych Poznania)
```

Decyzje techniczne, które odbiegają od sugestii:

- **Bez zewnętrznych kafelków.** Mapa jest rysowana tylko z naszego GeoJSON z OSM przez MapLibre z własnym stylem „ryciny”. Daje to pełną kontrolę nad wyglądem, działanie offline i zero kluczy. OpenFreeMap okazał się niepotrzebny.
- **Bez Turf.js.** W obrębie jednego miasta wystarcza lokalny układ metryczny (błąd poniżej 0,1%). To kilkadziesiąt linii własnej geometrii i mniej kilobajtów.
- **Mgła na osobnym canvasie.** Proceduralny dym (szum fBm) jest wycinany kilkoma warstwami `destination-out`, co daje miękkie brzegi bez `ctx.filter`, którego Safari nie obsługuje.
- **„Całe Jeżyce” przy 95%, nie 100%.** Część odcinków w OSM to drogi za płotem, na budowach albo wewnątrz kwartałów, więc 100% bywa fizycznie nieosiągalne. Próg jest w `DISTRICT_COMPLETE`.

## Pomysły

Większe rzeczy do omówienia, jeszcze niezrobione:

- **Mgła wraca.** Ulice nieodwiedzane od roku lekko przygasają, co daje powód, żeby wracać w znane miejsca.
- **Wyprawy tygodniowe.** Np. „3 nowe ulice na Wildzie do niedzieli”, z pieczęcią za serię wypraw.
- **Mapa skarbów.** W losowych nieodkrytych miejscach ukryte są znaczniki (stare nazwy ulic, ciekawostki z historii Poznania), widoczne dopiero po odsłonięciu.
- **Import Google Maps Timeline** (eksport JSON z telefonu) i plików **.fit** ze Stravy. Odblokowałoby to całą historię naraz.
- **Kolory pokrycia osiedli na mapie** przy małym zoomie (od pergaminu do bursztynu) jako widok „imperium”.
- **Udostępnianie karty spaceru** jako obrazka (canvas → PNG przez Web Share) w stylu ryciny.
- **Tryb kieszonkowy** do nagrywania: czarny ekran z jednym licznikiem, oszczędzający baterię OLED, kiedy ekran musi zostać włączony.

Dane: © autorzy OpenStreetMap (ODbL).
