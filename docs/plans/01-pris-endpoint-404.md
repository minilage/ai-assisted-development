# Plan: GET /orders/1042/price svarar 404 i stället för 200

**Status:** Utkast, väntar på godkännande. Planen togs fram som verifieringsexempel för skillen `planera` (Session 07).
**Uppdatering 18 november 2026 (efter R11):** felet är fortfarande kvar (Jest ger 404 för `GET /orders/1042/price`). Det som är verifierat sedan planen skrevs:
- `python3` på `PATH` är Windows Store-genvägen (`WindowsApps\python3`) och startar ingen Python. Det är den sannolika orsaken till 404 (`legacyPrice.ts` gör alla fel till 404).
- `psycopg-binary` 3.2.3 saknar version för Python 3.14 (`pip install -r requirements.txt` misslyckades). `requirements.txt` ändrades i R11 till `psycopg[binary]==3.2.10`.
- `psycopg` och `pytest` är installerade bara i den lokala venv:en `.venv`, inte i den Python som `python3` pekar på. Lösningen i den här planen (miljön) är **inte genomförd**. Texten nedan beskriver läget när planen skrevs (15 november 2026).
**Datum:** 2026-11-15
**Underlag:** `PLAN.md`, Kända problem. Felet upptäcktes i Session 01: 15 av 16 Jest-tester gick igenom.

## Mål

`GET /orders/1042/price` ska svara 200 med rätt pris i testmiljön, och ett tekniskt fel i prisberäkningen ska inte se ut som att beställningen saknas.

Ingår inte: att ändra prisberäkningen i `src/legacy/price_calc.py`. Det görs efter karakteriseringstester med `karakterisera`.

## Research

**Befintlig kod**, verifierad:
- `src/routes/orders.ts:31-43`: routen kontrollerar id:t (400), hämtar beställningen med `getOrder` (403/404) och anropar sedan `calcPrice(id)`.
- `src/pricing/legacyPrice.ts:12`: `execFile("python3", [SCRIPT, String(orderId)], { env: process.env }, ...)`.
- `src/pricing/legacyPrice.ts:13-15`: *alla* fel från processen blir `err("not_found", ...)` och alltså 404.
- `src/legacy/price_calc.py:7`: `import psycopg`. Rad 10 ansluter redan när modulen läses in.
- `tests/helpers/env.ts:2-3`: testerna sätter `DATABASE_URL` till testdatabasen, och `env: process.env` skickar vidare den till Python.
- `tests/orders.test.ts:65-71`: testet förväntar sig status 200 och `Number(res.body.total) === 1187.5`.

**Testdata**, verifierad: `db/seed.sql:23` har beställning 1042, som tillhör kund 1 och saknar rabattkod. Raderna på `db/seed.sql:35-36` är 2 × 375,00 och 1 × 200,00, alltså netto 950,00, moms 237,50 och totalt 1 187,50.

**Miljön**, verifierad 2026-11-15:
- `python -c "import importlib.util ..."` visar att `psycopg` inte är installerat i `C:\Python314` (Python 3.14.3).
- `python3` i PATH är en länk till `AppInstallerPythonRedirector.exe` under `WindowsApps`, inte direkt till en Python-installation.
- `requirements.txt` anger `psycopg[binary]==3.2.3` och `pytest==8.3.3`. Ingen av dem är installerad.

**Slutsats.** Order 1042 finns och tillhör kund 1, så `getOrder` lyckas. 404 måste därför komma från `calcPrice` (`legacyPrice.ts:14`), alltså från att Python-processen misslyckas. Två verifierade förutsättningar räcker var för sig för att den ska misslyckas: `psycopg` saknas, och det är oklart vilken Python som `python3` startar.

**Antaganden, inte verifierade:**
- Att omdirigeringen startar `C:\Python314`. Om den startar en annan Python kan `psycopg` finnas där.
- Att databasen körde när testet misslyckades. Det är troligt, eftersom de andra 15 testerna gick igenom.
- Att `price_calc.py` skriver ut `"1187.5"` och inte `"1187.50"`. Det är räknat fram från `_kapa` men inte kört.

## Acceptanskriterier

1. **Givet** testdatabasen med testdata och en Python-miljö med beroendena från `requirements.txt`, **när** kund 1 anropar `GET /orders/1042/price`, **så** blir svaret 200 och `total` är 1187.5.
2. **Givet** ett ogiltigt id (`abc`), **när** priset hämtas, **så** blir svaret 400.
3. **Givet** att headern `X-Customer-Id` saknas, **när** priset hämtas, **så** blir svaret 401.
4. **Givet** en beställning som tillhör en annan kund, **när** priset hämtas, **så** blir svaret 403.
5. **Givet** en beställning som inte finns, **när** priset hämtas, **så** blir svaret 404.
6. **Givet** att prisberäkningen inte kan köras, till exempel för att Python eller `psycopg` saknas, **när** priset för en befintlig beställning hämtas, **så** blir svaret *inte* 404. Statuskoden beslutas under "Öppna frågor och beslut".

## Lösning

1. **Miljön.** Installera Python-beroendena och se till att det kommando som `calcPrice` startar når en Python med `psycopg`. Det löser kriterium 1 utan kodändring, om antagandena stämmer.
2. **Tester för felfallen.** Kriterierna 2–5 finns redan i routen men saknar tester (fynd S16 i Session 07). Inga kodändringar väntas.
3. **Felhantering i bryggan.** Skilj "beställningen finns inte i Python" (exit 1 med `{"error": "finns inte"}`) från tekniska fel i `legacyPrice.ts`, och fånga fel från `JSON.parse`. Det är fynd S8 i Session 07.

Bortvalt:
- Att ändra testet så att det accepterar 404. Det strider mot regeln att aldrig försvaga tester.
- Att byta ut `python3` mot `python` direkt i koden utan att först veta vad `python3` startar.

## Berörda filer

| Fil | Ändring | Varför |
|---|---|---|
| `requirements.txt` | ändras eventuellt | Om `psycopg[binary]==3.2.3` saknar wheel för Python 3.14 måste versionen uppgraderas eller en annan Python användas |
| `tests/orders.test.ts` | ändrad | Nya tester för kriterierna 2–6 |
| `src/pricing/legacyPrice.ts` | ändrad | Kriterium 6, och eventuellt valet av Python-kommando |
| `src/result.ts`, `src/http.ts` | ändras eventuellt | Om kriterium 6 kräver en ny felkod |
| `docs/api.md` | ändras eventuellt | Om en ny statuskod läggs till för priset |
| `src/legacy/price_calc.py` | bara läst | Ändras inte i den här planen |

## Kräver separat godkännande

- **Beroenden:** `pip install -r requirements.txt`, och eventuellt en uppgradering av `psycopg`.
- **Publikt API-kontrakt:** en ny statuskod för tekniska fel i prisberäkningen (kriterium 6). Enligt `docs/api.md` kan `GET /orders/:id/price` i dag bara svara 200, 400, 401, 403 och 404.
- Databasschema, behörigheter och borttagning av filer berörs inte.

## Testplan

| Kriterium | Test som skrivs först | Fil | Kommando |
|---|---|---|---|
| 1 | Finns redan: "räknar pris med moms via den äldre modulen". Ska gå igenom efter steg 1 utan kodändring. | `tests/orders.test.ts` | `npx jest tests/orders.test.ts -t "räknar pris"` |
| 2 | "returnerar 400 för ett ogiltigt id" | `tests/orders.test.ts` | `npx jest tests/orders.test.ts -t "price"` |
| 3 | "returnerar 401 utan inloggning" | `tests/orders.test.ts` | samma |
| 4 | "returnerar 403 för en annan kunds beställning" | `tests/orders.test.ts` | samma |
| 5 | "returnerar 404 för en beställning som inte finns" | `tests/orders.test.ts` | samma |
| 6 | Ett test där prisberäkningen misslyckas, till exempel med ett Python-kommando som inte finns. Utformningen beror på beslutet om statuskod. | `tests/orders.test.ts` | samma |

Kriterierna 2–5 väntas gå igenom direkt, eftersom beteendet redan finns. Enligt `tdd` redovisas det i stället för att något implementeras.

Kodkontroller: `npm test`, `npm run lint`, `npm run typecheck` och `npm run format:check`.

## Risker

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|---|---|---|---|
| `psycopg[binary]==3.2.3` saknar wheel för Python 3.14 | Medel | Installationen misslyckas | Besluta om uppgradering av `psycopg` eller om Python 3.12/3.13 ska användas |
| `python3` startar en annan Python än `C:\Python314` | Medel | Beroendena installeras i fel miljö | Kontrollera med `python3 --version` innan installationen |
| Att köra prisberäkningen skriver till `src/legacy/price_calc.log` | Hög | Loggfilen växer lokalt | Filen ignoreras av Git (`.gitignore`). Ingen åtgärd. |
| Kriterium 6 ändrar kontraktet för `nightly_report.py` eller andra klienter | Låg | En klient tolkar en ny statuskod fel | Rapporten anropar Python direkt och påverkas inte. Ändra `docs/api.md`. |

## Uppdelning i steg

1. **Miljön** (kräver godkännande för beroenden):
   - Kontrollera `python3 --version` och var den finns.
   - Installera `requirements.txt`.
   - Kör `npx jest tests/orders.test.ts -t "räknar pris"`.
   - Om testet går igenom är kriterium 1 klart.
2. **Tester för felfallen** (`tdd`): kriterierna 2–5. Granska med `granska-standard`.
3. **Felhantering i bryggan** (`tdd`, efter beslut om statuskod): kriterium 6. Granska med `granska-standard`.

Steg 1 behövs också för att `karakterisera` ska kunna användas på `price_calc.py`.

## Öppna frågor och beslut

1. Får `pip install -r requirements.txt` köras? Om `psycopg 3.2.3` inte går att installera i Python 3.14: ska versionen uppgraderas, eller ska en äldre Python användas?
2. Vilken statuskod ska ett tekniskt fel i prisberäkningen ge (kriterium 6)? `docs/standard.md` nämner bara 400, 401, 403, 404 och 409. Ett förslag är 500 med en ny felkod, men det ändrar det publika kontraktet.
3. Ska Python-kommandot i `legacyPrice.ts` kunna ställas in, till exempel med en miljövariabel, så att det fungerar både på Windows och på driftservern?
4. Iakttagelse som inte ingår i planen: `price_calc.py` returnerar troligen `"1187.5"` och inte ett belopp med två decimaler, som `docs/standard.md` kräver (S12). Det bör låsas med `karakterisera` innan något ändras.
