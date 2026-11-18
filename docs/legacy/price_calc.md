# Codemap och analys: `src/legacy/price_calc.py` (R11)

**Datum:** 2026-11-18
**Krav:** R11, kodanalys och karakteriseringstester (`docs/examination/requirements.md:245-270`)
**Gren:** `feature/r11-legacy-modernization`
**Status:** Analysen bygger på kodläsning. Beteendena i avsnitt 3 är verifierade av 13 karakteriseringstester (`tests/legacy/test_price_calc.py`, 13 av 13 godkända mot den oförändrade koden, körda två gånger). Mutationsprovet står i avsnitt 5.

**Radnummer:** alla `price_calc.py:rad` i det här dokumentet avser **originalet före refaktoreringen** (`HEAD`, 66 rader). Efter refaktoreringen är raderna förskjutna (till exempel ligger `conn` på rad 11 och SQL-satserna på rad 49, 55 och 59).

## 1. Moduler, ansvar och beroenden

| Fil | Ansvar | Beror på |
|---|---|---|
| `src/legacy/price_calc.py` | Räknar pris, rabatt och moms för en beställning. Kan köras som skript (`price_calc.py <id>`). | `psycopg`, miljövariabeln `DATABASE_URL`, tabellerna `orders`, `order_lines` och `discounts`, och loggfilen `src/legacy/price_calc.log` |
| `src/pricing/legacyPrice.ts` | Brygga från API:t: startar skriptet med `python3` och läser JSON från stdout. Alla fel blir `not_found` (404). | `price_calc.py` (CLI, JSON och exit-kod) |
| `src/routes/orders.ts` (`GET /orders/:id/price`) | Kontrollerar id, ägare och att beställningen finns, och anropar sedan `calcPrice` | `legacyPrice.ts` |
| `jobs/nightly_report.py` | Nattlig rapport för betalda ordrar en dag. Körs av cron. | `calc_price` och `conn` importeras direkt från `price_calc` (`sys.path`-rad på rad 3) |
| `db/schema.sql`, `db/seed.sql` | Tabeller och testdata | |
| `tests/legacy/` | Karakteriseringstester (nya i R11) | `price_calc.py`, `jobs/nightly_report.py`, testdatabasen `butik_test` |

```
GET /orders/:id/price ─► routes/orders.ts ─► pricing/legacyPrice.ts ──(python3, stdout JSON, exit-kod)──► price_calc.py ─► Postgres
cron ─► jobs/nightly_report.py ──(import calc_price, conn)────────────────────────────────────────────► price_calc.py ─► Postgres
                                                                                                          └─► src/legacy/price_calc.log
```

**Vad anroparna är beroende av** (och som därför inte får ändras utan beslut):
- **API:t (`legacyPrice.ts`):** JSON `{"net", "vat", "total"}` som strängar, exit 0. För okänd beställning `{"error": "finns inte"}` och exit 1.
- **Nattrapporten:** modulattributet `conn`, funktionen `calc_price(order_id)` och attributet `total` på resultatet. Resultatet kan vara `None` (kraschar rapporten, se nedan).

## 2. Hur koden fungerar

1. Vid import ansluter modulen till databasen (`conn`, `autocommit=True`, `price_calc.py:10`). Anslutningen finns kvar under hela processen.
2. `calc_price(order_id)` gör tre frågor: rabattkoden för beställningen, orderraderna (`quantity`, `unit_price`) och, om koden finns, procentsatsen i `discounts`.
3. Summan är `Σ quantity × unit_price`. Rabatten dras av som `summa - summa × procent / 100`.
4. `net` och `vat` kapas till två decimaler med `_kapa` (`Decimal(int(x*100))/100`). Momsen är 25 % av `net`. `total` är `net + vat`.
5. En rad `<tid> <order_id> <total>` läggs i loggfilen. Fel vid loggning sväljs.
6. Resultatet är ett `Pris`-objekt med `net`, `vat` och `total`, eller `None` om beställningen saknas.

## 3. Beteenden som testerna låser

Förväntade värden är verifierade mot koden och testdatan (13 av 13 godkända). Testerna som låser ett **fel** är markerade med `# Nuvarande beteende, inte nödvändigtvis rätt:`.

| Beteende | Test | Värde |
|---|---|---|
| Utan rabatt | `test_utan_rabatt_order_1042` | net 950, vat 237.5, total 1187.5 |
| Procentrabatt (SOMMAR20, 20 %) | `test_procentrabatt_sommar20_order_1041` | 588.80 / 147.20 / 736.00 |
| **Fel:** avrundningen kapar (44,9775 blir 44,97, avrundat hade blivit 44,98) | `test_avrundningen_kapar_order_1044` | 179.91 / 44.97 / 224.88 |
| **Fel:** rabattkodens giltighetstid kontrolleras inte (GAMMAL15 gick ut 2024 men ger 15 %) | `test_utgangen_rabattkod_tillampas_order_1045` | 551.65 / 137.91 / 689.56 |
| **Fel:** beställning utan rader ger 0 i stället för fel | `test_order_utan_rader_ger_noll_order_1043` | 0 / 0 / 0 |
| Beställning som saknas | `test_order_som_saknas_ger_none` | `None` |
| **Fel:** okänd rabattkod ignoreras tyst | `test_okand_rabattkod_ignoreras_tyst` | fullt pris |
| Skriptets JSON och exit 0 | `test_cli_skriver_json_och_exit_0` | `{"net": "950", "vat": "237.5", "total": "1187.5"}` |
| Skriptet för okänd beställning | `test_cli_okand_order_ger_fel_och_exit_1` | `{"error": "finns inte"}`, exit 1 |
| Nattrapportens rad | `test_nightly_report_summerar_betalda_ordrar` | t.ex. `2026-10-01: 1 betalda ordrar, totalt 1187.5 kr` |
| Loggrad: ett anrop ger exakt en rad | `test_ett_anrop_loggar_exakt_en_rad` | `<ISO-tid> <id> <total>` |
| **Fel:** en logg som inte går att skriva sväljs tyst | `test_ologgbar_loggfil_svaljs_tyst` | priset returneras ändå |
| **Fel:** SQL-injektion via `order_id` | `test_sql_injektion_via_order_id` | `calc_price("1042 OR 1=1")` summerar alla rader (4861.90) |

**Upptäckt under testningen:** `_kapa` ger `Decimal(int)/100`, som tappar avslutande nollor. Priset serialiseras därför som `"950"` och `"1187.5"`, inte `"950.00"` och `"1187.50"`. Det avviker från `docs/standard.md:25` ("returneras som strängar med två decimaler"). Det var inte väntat i planen och upptäcktes först när testerna kördes. Beteendet är låst i flera tester (str-format), och Jest-testet för `GET /orders/:id/price` klarar det eftersom det jämför `Number(res.body.total)`.

## 4. Problem och risker (inget rättat)

| ID | Allvar | Fil:rad | Problem | Verifierat |
|---|---|---|---|---|
| P1 | **hög** | `price_calc.py:30,36,42`, `jobs/nightly_report.py:8` | SQL byggs med `%`-formatering (injektion). Rabattkoden och nattrapportens datum är också injicerbara. | Test 13 för `order_id`. Kod och datum **ej provade**. |
| P2 | medel | `price_calc.py:23-25` | Kapning i stället för avrundning och tappade nollor i str. Kommentaren på rad 3 säger att ekonomi har stämt av mot nuvarande avrundning, så det ska inte ändras utan beslut. | Test 1, 3 |
| P3 | medel | `price_calc.py:41-45` | Rabattens `valid_from`/`valid_to` används aldrig, och okända koder ignoreras tyst. | Test 4, 7 |
| P4 | låg | `price_calc.py:37-49` | Tom beställning ger 0 | Test 5 |
| P5 | låg | `price_calc.py:51-56` | Blank `except: pass` sväljer loggfel | Test 12 |
| P6 | medel | `price_calc.py:10`, `jobs/nightly_report.py:4` | Anslutning vid import och global `conn`. Kan inte användas utan databas, och försvårar tester och återanvändning. | Kodläsning, testerna måste sätta `DATABASE_URL` före import |
| P7 | låg | `jobs/nightly_report.py:12-13` | Kraschar med `AttributeError` om `calc_price` returnerar `None` (race vid borttagen beställning) | Kodläsning, **ej provad** |
| P8 | medel | `src/pricing/legacyPrice.ts:12-15` | Alla fel (saknad `psycopg`, fel Python, JSON-fel) blir 404. Orsaken till att `GET /orders/:id/price` ser ut som att beställningen saknas (plan 01). | Plan 01, **inte rättat i R11** |
| P9 | låg | `price_calc.py:13,52` | Loggfilen skrivs bredvid koden och kan inte skrivas i en skrivskyddad driftsmiljö | Kodläsning |
| P10 | låg | `price_calc.py:3-5` | Blandade språk i namn, `import os, sys, json, datetime` på en rad, `rad == None` i stället för `is None` | Kodläsning |

## 5. Verifiering av testerna (mutationsprov)

Testerna ska upptäcka att beteendet ändras. Tre tillfälliga ändringar gjordes i **kopior** i scratchpad, och sviten kördes mot dem med `LEGACY_DIR`. Den riktiga filen ändrades inte (`md5` före och efter: `2dcb362ae64635d5bb42e1d447e6ff78`, `git diff -- src jobs db` tom).

| Mutation (i kopian) | Resultat |
|---|---|
| `MOMS = 24` | **9 röda** av 13 (bland annat 1042, 1041, 1044, 1045, CLI, nightly och loggraden) |
| Avrunda med `ROUND_HALF_UP` i stället för att kapa | **6 röda** (1042, 1044, 1043, CLI, nightly, loggraden) |
| Kontrollera `valid_to` i rabattfrågan | **2 röda** (1045 och 1041). SOMMAR20 (gick ut 2026-08-31) räknas också som utgången idag, så testet för 1041 blir rött av samma skäl. |

Mutationen bygger på dagens datum (2026-11-18). Efter 2026-12-31 skulle även 1044 (VAR10) räknas som utgången och bli rött. Mutationskopiorna gjordes av originalfilen (`md5` `2dcb362a…`) före refaktoreringen.

Baslinjen mot oförändrad kod var 13 av 13 godkända. Se `sessions/session-15-2026-11-18.md` för körningarna.

## 6. Frågor som behöver svar före en riktig modernisering
1. **P2:** ska avrundningen vara kvar, med två decimaler i strängen? Ekonomi har stämt av mot den. Det är ett affärsbeslut.
2. **P3:** ska utgångna rabattkoder neka eller ignoreras? Det ändrar belopp.
3. **P1:** parametrisering av SQL ändrar beteendet för illasinnad indata, och bör göras som ett eget steg med eget godkännande (även `jobs/nightly_report.py`).
4. **P6:** att ta bort anslutningen vid import ändrar kontraktet mot `nightly_report.py`.
5. Vilken Python startar `python3` på Windows? (Plan 01)

## 7. Refaktoreringar
Se `sessions/session-15-2026-11-18.md` för de tre stegen och verifieringen efter varje steg.
