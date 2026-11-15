# Plan: Test för GET /health

**Status:** Utkast, väntar på godkännande
**Datum:** 2026-11-15
**Underlag:** Granskningsfynd i `sessions/session-07-2026-11-15.md:244`: S16, Låg, `src/app.ts:8`, "`GET /health` saknar test". Uppdraget kommer från Session 08 (`sessions/session-08-2026-11-15.md:332`).

## Mål

`GET /health` ska ha Jest-tester som visar att endpointen svarar 200 enligt `docs/api.md:7`, även utan headern `X-Customer-Id` (`docs/api.md:3`).

Ingår inte:
- att ändra `src/app.ts` eller någon annan produktionskod
- de andra S16-fynden i Session 07 (`sessions/session-07-2026-11-15.md:241-242`) om saknade felfallstester för andra endpoints
- att låta `/health` kontrollera databasen eller ändra svaret

## Research

**Befintlig kod**, verifierad:
- `src/app.ts:8-10`: `app.get("/health", ...)` svarar med `res.json({ status: "ok" })`, alltså 200 och body `{ "status": "ok" }`.
- `src/app.ts:8` registreras före `app.use(customers)` och `app.use(orders)` (`src/app.ts:11-12`). `requireCustomer` används bara per route (`src/routes/customers.ts:15,21`, `src/routes/orders.ts:15,21,31`) och ligger inte som global middleware. Därför ska `/health` inte kräva inloggning.
- `src/db.ts:3-6`: `Pool` skapas när modulen läses in, men ansluter först vid första frågan. `/health` gör inga databasfrågor.

**Tester**, verifierade:
- `tests/` innehåller `customers.test.ts`, `orders.test.ts` och `helpers/`. Inget test nämner `health`. En sökning efter "health" i `src` och `tests` ger bara `src/app.ts:8`.
- `jest.config.js`: `testMatch: ["**/tests/**/*.test.ts"]` och `setupFiles: ["<rootDir>/tests/helpers/env.ts"]`. En ny fil `tests/health.test.ts` hittas alltså automatiskt.
- `tests/customers.test.ts:1-8` visar mönstret: `supertest`, `createApp()`, `beforeEach(resetDb)` och `afterAll(closeDb)` från `tests/helpers/db.ts`.
- `supertest` finns redan i `devDependencies` i `package.json`. Inga nya beroenden behövs.

**Dokumentation**, verifierad:
- `docs/api.md:3`: `/health` kräver inte `X-Customer-Id`.
- `docs/api.md:7`: `GET /health`, "Kontroll att API:t kör.", svar 200. Body är inte dokumenterad.
- `docs/standard.md:33`: varje endpoint ska ha tester för lyckat fall och för 400, 401, 403 och 404 där de är möjliga.
- `docs/standard.md:34`: testerna körs mot testdatabasen, som återställs före varje test.

**Upptäckt under researchen:**
- Felfallen 400, 403 och 404 är inte möjliga för `/health`: ingen indata, ingen resurs som ägs av någon. 401 ska inte inträffa. Det testbara "felfallet" är att svaret är 200 *utan* `X-Customer-Id`.
- Body `{ "status": "ok" }` finns i koden (`src/app.ts:9`) men inte i `docs/api.md:7`. Om testet kontrollerar body låses ett beteende som inte är dokumenterat. Se Öppna frågor.
- `docs/standard.md:34` säger att testerna körs mot en testdatabas som återställs, men `/health` använder ingen databas. Se Öppna frågor.
- Endpointen finns redan. Testet blir därför grönt direkt, och TDD-steget "rött först" går inte att få naturligt. Det är ett karakteriseringstest av befintligt beteende.

**Antaganden, inte verifierade:**
- Att `createApp()` kan importeras i en testfil utan att någon databasanslutning öppnas, och att Jest avslutas utan öppna handtag om `closeDb` inte anropas. Det följer av hur `pg.Pool` fungerar men är inte kört.

## Acceptanskriterier

1. **Givet** att API:t körs, **när** någon anropar `GET /health` utan headern `X-Customer-Id`, **så** blir svaret 200 (inte 401).
2. **Givet** att API:t körs, **när** någon anropar `GET /health`, **så** har svaret `Content-Type` JSON och body `{ "status": "ok" }`. Gäller bara om användaren godkänner att body ska ingå i kontraktet (Öppna frågor, fråga 1).
3. **Givet** att API:t körs, **när** en inloggad kund anropar `GET /health` med `X-Customer-Id: 1`, **så** blir svaret också 200.

Felfallen 400, 403, 404 och 409 är inte möjliga för endpointen. 401 täcks av kriterium 1, som visar att den *inte* inträffar.

## Lösning

Skapa en ny testfil `tests/health.test.ts` med `supertest` och `createApp()`, enligt mönstret i `tests/customers.test.ts:1-5`. En separat fil gör att testet hålls avgränsat från kund- och beställningstesterna.

Om användaren väljer att följa `docs/standard.md:34` bokstavligt används `beforeEach(resetDb)` och `afterAll(closeDb)`. Annars utelämnas `resetDb`, men `afterAll(closeDb)` behålls så att poolen stängs.

Bortvalda alternativ:
- Lägga testet i `tests/customers.test.ts`: `/health` hör inte till kunder.
- Testa att mutera routen för att få "rött först": det ändrar produktionskod, vilket inte ingår.

## Berörda filer

| Fil | Ändring | Varför |
|---|---|---|
| `tests/health.test.ts` | ny | Testerna för kriterium 1-3 |
| `src/app.ts` | bara läst | Endpointen som testas |
| `tests/customers.test.ts` | bara läst | Mönster för testfilen |
| `tests/helpers/db.ts` | bara läst | `resetDb` och `closeDb` |
| `tests/helpers/env.ts` | bara läst | Sätter testdatabasen |
| `jest.config.js` | bara läst | `testMatch` och `setupFiles` |
| `docs/api.md` | bara läst | Kontraktet för `/health` |
| `docs/standard.md` | bara läst | Testreglerna |

## Kräver separat godkännande

Inget. Ingen ändring av API-kontrakt, schema, beroenden, behörigheter eller borttagning. Om användaren vill att body `{ "status": "ok" }` ska dokumenteras i `docs/api.md:7` är det en ändring av det publika kontraktet och ett eget moment, utanför den här planen.

## Testplan

| Kriterium | Test som skrivs först | Fil | Kommando |
|---|---|---|---|
| 1 | `it("returnerar 200 utan inloggning")`: `request(app).get("/health")`, `expect(res.status).toBe(200)` | `tests/health.test.ts` | `npm test -- tests/health.test.ts` |
| 2 | `it("svarar med status ok")`: `expect(res.headers["content-type"]).toMatch(/json/)`, `expect(res.body).toEqual({ status: "ok" })` | `tests/health.test.ts` | `npm test -- tests/health.test.ts` |
| 3 | `it("returnerar 200 med inloggning")`: `.set("X-Customer-Id", "1")`, `expect(res.status).toBe(200)` | `tests/health.test.ts` | `npm test -- tests/health.test.ts` |

Eftersom testerna blir gröna direkt ska utvecklaren visa att de kan bli röda, utan att ändra produktionskod: tillfälligt ändra det förväntade värdet i testet (till exempel `toBe(201)`), köra och se att testet misslyckas, och sedan återställa. Det ska redovisas.

Därefter hela sviten: `npm test`. Kodkontroller: `npm run lint`, `npm run typecheck` och `npm run format:check`.

Observera: `npm test` kör alla tester. Det kända felet för `GET /orders/1042/price` (`PLAN.md:59`, `docs/plans/01-pris-endpoint-404.md`) väntas fortfarande misslyckas och har inget med den här planen att göra.

## Risker

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|---|---|---|---|
| Testet låser body `{ status: "ok" }` som inte är dokumenterad | Medel | En framtida ändring av svaret bryter testet | Beslut i fråga 1 innan Build |
| Jest hänger på öppna handtag om poolen inte stängs | Låg | Testkörningen avslutas inte | Behåll `afterAll(closeDb)` |
| Testerna är gröna från början och bevisar därför mindre | Hög | Ett test som aldrig kan bli rött | Visa ett tillfälligt rött läge enligt testplanen |
| Testet kräver databasen fast `/health` inte använder den, om `resetDb` används | Medel | Testet misslyckas när databasen inte kör | Beslut i fråga 2 |

## Uppdelning i steg

1. Skapa `tests/health.test.ts` med testerna för kriterium 1 och 3 (och 2 om fråga 1 besvaras ja). Bygg med `tdd`, granska med `granska-standard`, verifiera med `npm test -- tests/health.test.ts`, `npm test`, `npm run lint`, `npm run typecheck` och `npm run format:check`.

Det är bara ett steg. Uppgiften är för liten för att delas upp mer.

## Öppna frågor och beslut

1. **Ska body ingå i testet?** Koden svarar `{ "status": "ok" }` (`src/app.ts:9`), men `docs/api.md:7` anger bara 200. Ja betyder att kriterium 2 ingår och att body i praktiken blir en del av kontraktet. Då bör `docs/api.md` uppdateras i ett separat, godkänt moment. Nej betyder att kriterium 2 stryks.
2. **Ska testfilen återställa databasen?** `docs/standard.md:34` säger att testerna återställer testdatabasen före varje test, men `/health` använder ingen databas. Utan `resetDb` kan testet köras utan databas. Med `resetDb` följer det regeln bokstavligt.
3. **Godtas att testet är grönt från början?** TDD kräver rött först (`tdd`). Förslaget är ett tillfälligt rött läge genom att ändra förväntat värde i testet, inte produktionskoden.
