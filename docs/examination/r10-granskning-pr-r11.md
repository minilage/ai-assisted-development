# R10: granskning av R11-pull requesten med den nya granskningsskillen

**Datum:** 2026-11-18
**Krav:** R10 (`docs/examination/requirements.md:224-243`)
**Granskat:** PR #2 (R11), `git diff 9ab35b8...fbf292f` (6 commits, 7 filer), samt hela `src/legacy/price_calc.py`, `jobs/nightly_report.py`, `src/pricing/legacyPrice.ts` och `tests/legacy/`. Merge-commit i `main`: `d25e11b`.
**Gjort av:** `granskare` med `granska-standard` i versionen från `e6de311` (R10 steg 1: tre områden, Bekräftat/Risk, Kontroll/hook och Automatiskt/Manuellt). Uppdraget nämnde inga förväntade fynd. Fynden är därefter kontrollerade av huvudsessionen (se "Kontroll av fynden").
**Begränsning:** granskningen är läst, inte körd (`granskare` kör inga kontroller). Granskningen gjordes på diffen i Git och inte på själva GitHub-PR:n. Inget är ändrat, sammanslaget eller stängt.

## Verdikt

**Godkänd med anmärkningar för själva ändringen:** refaktoreringen bedömdes beteendebevarande (samma aritmetik och ordning, `_kapa`, SQL och `conn` oförändrade, enda observerbara skillnaden är `__repr__` för `Pris`). **Men koden som PR:n arbetar i har allvarliga, bekräftade fel som PR:n inte skapade och inte rättade** (S3, S12, S14). De är dokumenterade i PR:n (P1–P10) och ligger kvar.

**23 fynd:** 13 bekräftade och 10 risker (efter min kontroll 14 bekräftade och 9 risker, se nedan).

## Kontroll av fynden (huvudsessionen)

| Fynd | Kontroll | Utfall |
|---|---|---|
| **F1** (S3, SQL-injektion via rabattkoden) | Körd mot testdatabasen `butik_test`. En order med `discount_code = x' UNION SELECT 100 --` och en rad 2 × 100,00 skapades med parametriserad `INSERT`, `calc_price` anropades, och raderna togs bort igen (0 kvar, `orders` fortfarande 8). | **Bekräftat med körning:** `net=0 vat=0 total=0`, mot 250 utan rabatt. Injektionen ger 100 % rabatt. Att `POST /orders` sparar vilken sträng som helst är kodläsning (`src/services/orderService.ts:38`). Hela vägen via HTTP är **inte provad** (`python3` startar ingen Python här, se plan 01). |
| **F14** (staplade satser) | Samma prov: rabattkod `x'; create temp table f14_prov(a int); --` (en oskadlig sats som bara skapar en temporär tabell i sessionen). | **Bekräftat med körning (var Risk):** den staplade satsen kördes (`to_regclass('pg_temp.f14_prov')` fanns). En injicerad kod kan alltså köra flera satser, med modulens `autocommit=True` och standardanvändaren `postgres`. Jag körde ingen destruktiv sats. |
| **F2** (S12, formatet) | Läste testerna. | **Bekräftat:** `tests/legacy/test_price_calc.py:38` och `:114` låser `"950"`, `"237.5"` och `"1187.5"` (inte `"950.00"` osv.), och `tests/orders.test.ts:69` jämför bara `Number(res.body.total)`, så formatet prövas aldrig i API-testet. Avviker från `docs/standard.md:25`. |
| **F1, F7** (rader) | `Grep` i `src/legacy/price_calc.py`. | Radnumren stämmer: SQL med `%` på rad 49, 55 och 59, och `_kapa` på rad 24-26 (rad 30, 36 och 42 i originalet). |
| **F11, F12, F13** (dokumentation) | Läste `docs/legacy/price_calc.md:60` och `docs/migrations/001-…md:12,18,79,87`. | **Bekräftade:** codemap rad 60 säger att Jest-testet "klarar det", medan P8 och sessionsloggen säger att det är rött. Migreringsplanen rad 12 och 79 hänvisar till `price_calc.py:41-45` och `:43-45` utan att säga att det är originalets rader. Rad 18 ("fungerar mot både det gamla och det nya schemat under hela vägen") säger emot risk 1 på rad 87. |

## Områdesöversikt

| Område | Bekräftade | Risk | Bekräftat fynd saknas? |
|---|---|---|---|
| Säkerhet | F1, F3, F4, F7, **F14** | F17, F18, F21 | Nej |
| Struktur | F8, F9 | F23 | Nej |
| Kodstandard | F2, F5, F10 | F15, F16 | Nej |
| Testtäckning | F6 | F19, F20, F22 | Nej |
| Dokumentation | F11, F12, F13 | – | Nej |

## Fynd

Status är Bekräftat eller Risk. "Känt" betyder att fyndet redan står i R11:s egen codemap (`docs/legacy/price_calc.md`, P1–P10). Alla förslag om den äldre modulen kräver att användningen undersöks först (`CLAUDE.md`).

| ID | Område | Regel | Allvar | Status | Fil:rad | Vad och varför | Kontroll/hook | Auto/Man |
|---|---|---|---|---|---|---|---|---|
| F1 | Säkerhet | S3 | Hög | **Bekräftat** (körd) | `price_calc.py:59` (källa `orderService.ts:38,44-45`) | SQL-injektion via rabattkoden: `"... where code = '%s'" % kod`, där `kod` är fri text som en inloggad kund kan spara via `POST /orders`. Ger 100 % rabatt och kan läsa ut data genom priset. Provad på modulnivå, se ovan. Känt som P1, men bara `order_id` var provad och vägen via rabattkoden pekades inte ut. | Föreslagen: Bandit B608 eller `ruff` S608, och ESLint `no-restricted-syntax`. Ingen befintlig kontroll läser SQL. | Manuellt |
| F14 | Säkerhet | S3 | Hög | **Bekräftat** (körd; var Risk) | `price_calc.py:59`, `:11` | Staplade satser kördes via den injicerade koden (anslutningen är `autocommit=True` som `postgres`). Inte provad destruktivt. Nytt. | Föreslagen: test med injicerad kod, minimala databasrättigheter | Manuellt |
| F2 | Kodstandard | S12 | Medel | **Bekräftat** | `price_calc.py:26`; `tests/legacy/test_price_calc.py:38,114`; `jobs/nightly_report.py:15` | Beloppen returneras som `"950"` och `"1187.5"`, inte med två decimaler. Beräkningen använder `Decimal` (inget flyttal), så det är formatet som avviker och inte beloppet. Känt, men att API-testet inte prövar formatet är nytt. | Föreslagen: test av svarets format, ESLint `no-restricted-properties` | Manuellt |
| F3 | Säkerhet | S3 | Medel | Bekräftat | `jobs/nightly_report.py:8` | `... created_at::date = '%s'" % dag` med `dag` från `sys.argv[1]`. Kräver åtkomst till driftservern, därför Medel. Känt (P1), ej provad. | Föreslagen: Bandit B608 | Manuellt |
| F4 | Säkerhet | S14 | Medel | Bekräftat | `price_calc.py:10`; `tests/legacy/conftest.py:18-20` | Anslutningssträng med användare och lösenord som standardvärde. Utvecklingsuppgifter, inte riktiga hemligheter, och samma mönster finns i `src/db.ts`. Nytt (inte i P1–P10). | Föreslagen: hemlighetsskanning. `main-guard.js` läser inte kod. | Manuellt |
| F5 | Kodstandard | S8 | Medel | Bekräftat | `src/pricing/legacyPrice.ts:12-14` | Varje fel (även tekniska) blir `not_found` (404). Känt (P8). | Föreslagen: test där skriptet kraschar och 500 förväntas | Manuellt |
| F6 | Testtäckning | U7 | Medel | Bekräftat | `tests/legacy/test_price_calc.py`, `tests/orders.test.ts:66-70` | Testerna är starka där de finns, men saknar: injektion via `discount_code` (F1), nattrapportens `None`-krasch, gränsvärden (rabatt 0, 100, över 100 %, negativa belopp) och API-format. | Föreslagen: mutationsprov, krav på täckning | Manuellt |
| F7 | Säkerhet | S3 | Låg | Bekräftat | `price_calc.py:49,55`; testet `:158` | `order_id` bygger SQL med `%`. Testet visar att `calc_price("1042 OR 1=1")` summerar alla rader (4861.90). Låg nåbarhet: CLI:t gör `int(...)` och routen validerar id. Känt. | Föreslagen: Bandit B608 | Manuellt |
| F8 | Struktur | U4 | Låg | Bekräftat | `jobs/nightly_report.py:4,7,12`; `price_calc.py:11` | Nattrapporten importerar modulens globala anslutning och kör sin egen SQL, och körs vid import (ingen `__main__`). Känt (P6). | – | Manuellt |
| F9 | Struktur | U6 | Låg | Bekräftat | `legacyPrice.ts:17` | `JSON.parse(stdout) as Price` utan validering. Nytt. | Föreslagen: `consistent-type-assertions` | Manuellt |
| F10 | Kodstandard | U9 | Låg | Bekräftat | `price_calc.py:51,69,5` | `== None`, blank `except:` (kvar efter refaktoreringen) och `import os, sys, json, datetime`. Ingen Python-kontroll finns. Känt (P5, P10). | Föreslagen: `ruff` (E711, E722, E401) | Manuellt |
| F11 | Dokumentation | U8 | Låg | Bekräftat | `docs/legacy/price_calc.md:60` mot `:73` och sessionsloggen | Codemapen säger att Jest-testet "klarar det", medan P8 och loggen säger att det är rött. Nytt. | Föreslagen: kontroll av hänvisningar | Manuellt |
| F12 | Dokumentation | U8 | Låg | Bekräftat | `docs/migrations/001-…md:12,79` | Hänvisar till originalets radnummer utan förbehåll. Nytt. | Föreslagen: kontroll av hänvisade rader | Manuellt |
| F13 | Dokumentation | U8 | Låg | Bekräftat | `docs/migrations/001-…md:18` mot `:87` | Motsägelse om fas 1. Nytt. | – | Manuellt |
| F15 | Kodstandard | S12 | Medel | Risk | `price_calc.py:26` | Kapning i stället för avrundning (44,9775 blir 44,97, bekräftat av testet). Att det är fel är inte belagt: ekonomi har stämt av mot avrundningen. Känt (P2). | Föreslagen: gränsvärdestest | Manuellt |
| F16 | Kodstandard | S12 | Medel | Risk | `price_calc.py:58-62` | `valid_from`/`valid_to` används aldrig (`GAMMAL15` ger 15 %, testet `:54-58`). Om det är avsikten är inte belagt. Känt (P3). | – | Manuellt |
| F17 | Säkerhet | U1 | Medel | Risk | `legacyPrice.ts:17` | `JSON.parse` i `execFile`-callbacken utan `try`/`catch`. Nytt. | Föreslagen: `no-misused-promises` | Manuellt |
| F18 | Säkerhet | U2 | Medel | Risk | `legacyPrice.ts:12` | `execFile` utan `timeout`, och varje anrop startar en Python-process och en databasanslutning. Nytt. | Föreslagen: test av gränsvärden | Manuellt |
| F19 | Testtäckning | S17 | Medel | Risk | `tests/legacy/conftest.py:22-27,37-42` | Skyddet `_test` kontrollerar bara sökvägen i URL:en, och `reset_db` kör `DROP TABLE`. `?dbname=` och fjärrvärdar kontrolleras inte (ej provat). Känt. | Föreslagen: test av skyddet | Manuellt |
| F20 | Testtäckning | U7 | Medel | Risk | `sessions/session-15-2026-11-18.md:53` | Refaktoreringen är verifierad bara av pytest. Vägen `GET /orders/:id/price` är röd före och efter. | `npm test` | **Automatiskt** (bedömd) |
| F21 | Säkerhet | U1 | Låg | Risk | `jobs/nightly_report.py:12-13` | `AttributeError` om `calc_price` returnerar `None` (race). Känt (P7). | – | Manuellt |
| F22 | Testtäckning | U7 | Låg | Risk | `test_price_calc.py:141,158,127-132` | Tre tester kan bli instabila (mikrosekunder i loggraden, radordning, tidszon). | Föreslagen: ändra assertionerna | Manuellt |
| F23 | Struktur | – (CLAUDE.md, beroenden) | Låg | Risk | `requirements.txt:1` | `psycopg` 3.2.3 till 3.2.10. Godkännandet står bara i commit och logg. Provad bara på Python 3.14. Ingen regel finns för beroenden. | Föreslagen: `pip-audit`, CI | Manuellt |

## Det som R10 kräver, och vad granskningen visar

| Område | Bekräftat fynd med fil, rad, vad, varför och kontroll | Kommentar |
|---|---|---|
| **Säkerhet** | **F1, F14** (körda), F3, F4, F7 | F1 är en SQL-injektion som en inloggad kund kan nå via `POST /orders`. Fanns före R11. |
| **Struktur** | F8, F9 | Båda låga. |
| **Kodstandard** | **S3** (F1, F3, F7), **S12** (F2), S14 (F4), S8 (F5) | Kodstandardbrotten i den äldre modulen är entydiga och bekräftade, men de ligger i kod som PR:n bara läste och refaktorerade, och inte i rader PR:n lade till. |

**Skillnaden automatiskt kontra manuellt:** bara **F20** bedömdes som Automatiskt (`npm test`, bedömd och inte körd). De övriga 22 är Manuella. `lint`, `typecheck` och `format:check` läser inte Python eller `docs/`, och ingen hook körs på en färdig PR. Ett riktigt automatiskt fynd är därför **ännu inte visat** och är steg 3 i R10-planen.

## Hur granskningsskillen fungerade (iakttagelser)
- Formatet följdes fullt ut: tio kolumner, Bekräftat/Risk, områdesöversikt, automatiskt/manuellt och bedömning av alla regler. Granskaren hittade inte på fynd för att fylla områden, och angav Osäkert separat.
- Granskaren kontrollerade dokumenten mot koden och fann tre dokumentationsfel i R11:s egna dokument (F11–F13).
- **Svagheter:** F1 och F14 stod som "Bekräftat" respektive "Risk" bara på kodläsning, och jag bekräftade båda med en körning. Områdesöversiktens räkning av risker i Testtäckning är slarvig (nämner "delar av F6"). Avsnitten "Regler utan fynd" och "Regler som inte gäller" överlappar (S1, S2, S6 med flera står i båda). F20 har status Risk men är markerad Automatiskt.
- Granskaren blockerades av `agent-guard` på tre sidokontroller (`for`-slinga, `git cat-file`, `git check-ignore`) och försökte inte kringgå dem.
- Granskningen tog cirka 5,5 minuter (332 s enligt agentens egen mätning) och cirka 101 000 agenttokens enligt agentens rapport. Det är agentens egna siffror.

## Rekommenderade åtgärder
1. **F1 och F14 (hög):** parametrisera SQL i `price_calc.py:49,55,59` och begränsa `discountCode` i `orderService`, i ett eget godkänt steg med ett test för `discount_code`. Kräver att användningen undersöks först.
2. F3, F5, F17, F18 och F4 enligt granskarens prioritetsordning.
3. **F11–F13:** rätta de tre dokumentationsfelen i R11:s dokument.
4. F2, F15 och F16 är beslut (format, avrundning, rabattens giltighet) och ska inte ändras utan affärsbeslut.
