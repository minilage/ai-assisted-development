# Plan: Sidindelning och statusfilter för GET /customers/me/orders (R09)

**Status:** Godkänd och genomförd 2026-11-17 (alla nio rekommendationer, svarsform A, offset). Beslut efter Review: `page=01` godtas som sida 1, upprepad parameter ger 400. Se `sessions/session-14-2026-11-17.md`. Committad på grenen `feature/r09-orders-pagination` (`798824e`, `d133ea3`, `317a321`, `3416c8a`).
**Datum:** 2026-11-17
**Gren:** `feature/r09-orders-pagination` (redan skapad)
**Underlag:** User story 3 i `docs/user-stories.md:7`: "Som kund vill jag se mina beställningar sidvis och kunna filtrera på status." Krav R09 (`docs/examination/requirements.md:194`). Grenen används också för R10 (`docs/examination/requirements.md:224`).

## Mål

`GET /customers/me/orders` ska kunna returnera den inloggade kundens beställningar sidvis (`page`, `limit`) och filtrerade på `status`, nyast först med stabil sortering. Fasernas resultat ska gå att granska (R09): acceptanskriterier, API-kontrakt, TDD, granskning, verifiering, spårbara commits och en ADR.

Ingår inte:
- andra endpoints, `GET /orders/:id` eller prisberäkningen
- ändring av `requireCustomer` eller dess felkod (se Öppna frågor 5)
- nytt index eller andra schemaändringar (se fråga 4)
- att committa, pusha eller öppna PR. Det är separata godkännanden.

## Research

**Befintlig kod, verifierad:**
- `src/routes/customers.ts:21-24`: `GET /customers/me/orders` med `requireCustomer`, anropar `listOrdersForCustomer(customerId)` och svarar `res.json(orders)`. Svaret är alltså en ren array. Ingen läsning av `req.query`.
- `src/services/customerService.ts:33-40`: en SQL-fråga, parametriserad: `SELECT id, status, created_at AS "createdAt" FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`. Ingen LIMIT, ingen `id` i ORDER BY, alltså instabil ordning vid lika `created_at`. Returnerar `OrderSummary[]` (`customerService.ts:6`), inte `Result`.
- **N+1:** finns inte i listan. Frågan är en enda fråga och hämtar inga orderrader. N+1 skulle bara uppstå om någon lade till rader via `getOrder` per beställning (`src/services/orderService.ts:68-98`, en fråga per order). Planen får inte göra det (`docs/standard.md:14`). Räkning av total görs i en separat fråga, inte per rad.
- `listOrdersForCustomer` anropas bara från `src/routes/customers.ts:22` (sökning i `src`, `tests`, `docs`). Inga andra interna anropare.
- `src/http.ts:5-10,13-19` och `src/result.ts:2-14`: `sendResult`/`sendError` ger `{ error: { code, message } }`. `invalid_input` ger 400. Mönstret finns redan i `createCustomer` (`customerService.ts:12-17`).
- `src/auth.ts:9-17`: saknad eller ogiltig `X-Customer-Id` ger 401 med `{ error: { code: "unauthorized", ... } }`.

**Databas, verifierad (`db/schema.sql:22-27`):**
- `orders(id SERIAL PK, customer_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', discount_code, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`.
- Inget index utöver primärnyckeln. Ingen främmande nyckel och ingen CHECK på `status`. Alltså kan vilken text som helst ligga i `status` i teorin.
- Statusvärden i `db/seed.sql:20-28`: `new`, `paid`, `shipped`, `cancelled`. `createOrder` skriver bara default `new` (`orderService.ts:46-49`).
- Seed: kund 1 har 1040 (shipped) och 1042 (paid). Kund 2 har 1041 (shipped) och 1047 (new). För att testa sidindelning behövs fler beställningar, som testen själva måste skapa.

**Tester, verifierade:**
- `tests/customers.test.ts:51-57`: ett enda test, kund 2 får `[1047, 1041]` som ren array. Det testet bygger på dagens kontrakt (se fråga 1).
- `tests/helpers/db.ts:10-14`: `resetDb()` läser `db/schema.sql` och `db/seed.sql`. `closeDb()` stänger poolen. Mönster med `supertest` och `createApp()` finns i `tests/customers.test.ts:1-8`.

**Dokumentation, verifierad:**
- `docs/api.md:10`: `GET /customers/me/orders`, "nyast först", svar 200, 401. Inga query-parametrar dokumenterade.
- `docs/standard.md:25-26,41-42`: en tom sökning ger 200 och tom lista. Felformat och statuskoder (400 ogiltig indata, 401 inte inloggad). `docs/standard.md:33` kräver tester för lyckat fall och 400/401 där de är möjliga. `docs/standard.md:23` kräver `AS "camelCase"`.
- `PLAN.md`: "Ny funktion" är inte påbörjad. Plan 04 (R07) är genomförd men enligt Session 13 var den inte committad när sessionen avslutades, men `PLAN.md` anger `e3dbda2` som committad och pushad. De ändrade filerna i arbetskaträdet (`PLAN.md`, `docs/examination/requirements.md`, `metrics/arbetsmoment.csv`, `sessions/session-13-2026-11-16.md`) är orelaterade till R09 och ska inte följa med i R09-commitarna.
- `docs/adr/` innehåller bara `0001-testskydd-i-main-guard.md` (format: Status, Datum, Krav, Plan, Logg, 1. problem, 2. lösning, 3. alternativ). Nästa ADR blir 0002.

**Antaganden, inte verifierade:**
- Att `new`, `paid`, `shipped` och `cancelled` är hela mängden giltiga statusar. Den följer av seed och default, inte av en CHECK eller dokumentation.
- Att det inte finns externa klienter som läser svaret som en array. I repot finns bara ett test.
- Att `limit` 100 som övre gräns och 20 som standard är rimliga. De är förslag, inte krav.
- Att `COUNT(*)` på `orders` per kund är billig utan index vid övningens datamängd.

**Upptäckt under researchen:**
- Dokumentationen (`docs/api.md:10`) och koden stämmer för dagens beteende. Ingen motsägelse.
- `requireCustomer` returnerar koden `unauthorized`, som inte finns i `ErrorCode` (`src/result.ts:2`) eller `STATUS` (`src/http.ts:5-8`). Det är redan så och rörs inte här.

## Acceptanskriterier

Alla gäller `GET /customers/me/orders` med inloggad kund om inget annat anges.

1. **Standardvärden.** **Givet** en kund med 25 beställningar, **när** den anropar utan query, **så** blir svaret 200 med första sidan (`page` 1, `limit` 20) och 20 beställningar.
2. **Sidindelning.** **Givet** 25 beställningar, **när** kunden anropar med `?page=2&limit=10`, **så** får den beställning 11-20 i ordningen nyast först, och `total` är 25.
3. **Sista sidan.** **Givet** 25 beställningar, **när** kunden anropar med `?page=3&limit=10`, **så** får den 5 beställningar.
4. **Sida bortom slutet.** **Givet** 25 beställningar, **när** kunden anropar med `?page=9&limit=10`, **så** blir svaret 200 med tom lista och `total` 25.
5. **Gränser.** **Givet** en kund, **när** `limit=100` anges, **så** accepteras det. `limit=1` och `page=1` accepteras.
6. **Ogiltigt `limit`.** **Givet** en kund, **när** `limit` är 0, negativt, över 100, ett decimaltal eller inte ett tal (`limit=0`, `-5`, `101`, `1.5`, `abc`), **så** blir svaret 400 med `{ error: { code: "invalid_input", message } }`.
7. **Ogiltigt `page`.** **Givet** en kund, **när** `page` är 0, negativt, ett decimaltal eller inte ett tal, **så** blir svaret 400 med `invalid_input`.
8. **Statusfilter.** **Givet** kund 1 med en `shipped` och en `paid`, **när** kunden anropar med `?status=paid`, **så** får den bara beställning 1042, och `total` är 1.
9. **Ogiltig status.** **Givet** en kund, **när** `status=finns-inte` (eller tom sträng), **så** blir svaret 400 med `invalid_input`. Meddelandet nämner de tillåtna värdena.
10. **Filter och sidor ihop.** **Givet** 25 beställningar varav 12 `paid`, **när** kunden anropar med `?status=paid&limit=10&page=2`, **så** får den 2 beställningar och `total` är 12.
11. **Tom lista.** **Givet** en kund utan beställningar (eller utan någon i vald status), **när** kunden anropar, **så** blir svaret 200 med tom lista och `total` 0 (inte 404).
12. **Inloggning.** **Givet** att `X-Customer-Id` saknas eller är ogiltig, **när** någon anropar, **så** blir svaret 401. Det gäller också med giltiga query-parametrar. Ogiltiga query-parametrar utan inloggning ger 401, inte 400.
13. **Bara egna.** **Givet** att kund 1 och kund 2 har beställningar, **när** kund 2 anropar, **så** innehåller svaret aldrig kund 1:s beställningar, även med `status`-filter. Kund-id tas från `requireCustomer`, aldrig från query (`docs/standard.md:30`).
14. **Ordning.** **Givet** beställningar där flera har samma `created_at`, **när** kunden listar, **så** är ordningen nyast först och, vid lika tid, högst `id` först. Samma anrop två gånger ger samma ordning, och ingen beställning visas på två sidor.
15. **Okända parametrar.** **Givet** en okänd query-parameter (till exempel `?sort=x`), **när** kunden anropar, **så** ignoreras den och svaret blir 200 (antagande, fråga 6).

403 och 404 är inte möjliga: listan gäller alltid den inloggade kundens egna beställningar. 409 är inte möjligt (ingen skrivning).

## API-kontrakt (förslag, kräver godkännande)

**Endpoint:** `GET /customers/me/orders`
**Header:** `X-Customer-Id` (krävs).

| Query | Typ | Standard | Regel |
|---|---|---|---|
| `page` | heltal | 1 | >= 1 |
| `limit` | heltal | 20 | 1-100 |
| `status` | text | ingen (alla) | en av `new`, `paid`, `shipped`, `cancelled` |

**Svar 200 (förslag, alternativ A):**

```json
{
  "items": [{ "id": 1047, "status": "new", "createdAt": "2026-10-10T18:55:00.000Z" }],
  "page": 1,
  "limit": 20,
  "total": 2
}
```

`items` har samma element som dagens `OrderSummary`. `total` är antalet beställningar som matchar filtret, inte antalet på sidan.

**Statuskoder:** 200 (också tom lista), 400 (ogiltig `page`, `limit` eller `status`), 401 (inte inloggad).
**Felformat:** `{ "error": { "code": "invalid_input", "message": "..." } }` via `err`/`sendResult` (`docs/standard.md:25-27`). 401 som idag via `requireCustomer`.

**Avvägning av svarsformen** (den är en ändring av det publika kontraktet och kräver separat godkännande):

| Alternativ | För | Emot |
|---|---|---|
| **A. Omslag `{ items, page, limit, total }`** (rekommenderas) | Klienten får total och kan bygga sidnavigering. Går att utöka (till exempel `hasMore`) utan att bryta igen. | Bryter dagens kontrakt: svaret är inte längre en array. Testet `tests/customers.test.ts:51-57` måste ändras. |
| **B. Ren array kvar, `total` i headern `X-Total-Count`** | Bakåtkompatibel för klienter som läser en array, förutsatt att alla har under 20 beställningar. | Beteendet ändras ändå: utan query returneras högst 20, inte alla. Totalen göms i en header. Svårare att utöka. |
| **C. Ren array, ingen total** | Minst ändring. | Klienten vet inte hur många sidor det finns. Uppfyller "sidvis" svagare. |

Rekommendation: A, eftersom bara ett test i repot läser svaret (`tests/customers.test.ts:55`) och API:t är ett övningsprojekt. Vid externa klienter är B tryggare. Bakåtkompatibiliteten är ändå delvis bruten i alla alternativ, eftersom standardgränsen 20 ändrar vad ett anrop utan query returnerar. Användaren beslutar (fråga 1). Att dokumentera kontraktet i `docs/api.md:10` ingår i steg 3 efter godkännande.

## Lösning

- **Route** (`src/routes/customers.ts:21-24`): läs `req.query.page`, `limit`, `status` som `unknown` och skicka dem till tjänsten tillsammans med `customerId`. Använd `sendResult` (som övriga routes) i stället för `res.json`.
- **Tjänst** (`src/services/customerService.ts:33-40`): `listOrdersForCustomer(customerId, query)` validerar indata och returnerar `Promise<Result<OrderPage>>`. Valideringen är strikt: bara strängar av siffror (`/^\d+$/`) godtas för `page` och `limit`, så `1.5`, `1e1`, tom sträng och arrayer (`?page=1&page=2`) ger 400.
- **SQL**, parametriserad, två frågor:
  - `SELECT id, status, created_at AS "createdAt" FROM orders WHERE customer_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`
  - `SELECT COUNT(*)::int AS total FROM orders WHERE customer_id = $1 AND ($2::text IS NULL OR status = $2)`
  - `COUNT` castas till `int` eftersom `pg` annars returnerar `bigint` som sträng. Ingen strängmall används för SQL (`docs/standard.md:13`). De två frågorna körs efter varandra (eller med `Promise.all`).
- **Stabil sortering:** `created_at DESC, id DESC`. `id` är unik, så ordningen blir deterministisk.
- **Tillåtna statusar** som en konstant i tjänstelagret, inte i databasen (ingen migrering).

**Bortvalda alternativ:**
- **Cursor-paginering (keyset)** på `(created_at, id)`: stabil även när nya beställningar läggs under tiden och snabbare på stora tabeller, men kräver ogenomskinlig cursor, går inte att hoppa till sida N och passar inte frasen "sidvis" och `page` i storyn. Offset räcker för övningens datamängd. Avvägningen dokumenteras i ADR 0002.
- **`COUNT(*) OVER()` i samma fråga:** en fråga mindre, men ger ingen total när sidan ligger bortom slutet (kriterium 4).
- **Validera status mot en databastabell eller CHECK:** kräver schemaändring. Utanför planen.

## ADR-förslag

**Fil:** `docs/adr/0002-sidindelning-orders.md` (skapas i steg 5, efter godkännande, i samma format som `docs/adr/0001-testskydd-i-main-guard.md`).

Innehåll:
- **Problem:** `GET /customers/me/orders` returnerar alla beställningar utan gräns och utan filter.
- **Beslut:** offset-paginering (`page`, `limit`), `status`-filter, stabil sortering `created_at DESC, id DESC`, svarsform enligt beslut på fråga 1.
- **Alternativ:** cursor/keyset-paginering, header-baserad total (alternativ B), ingen total (C). Med styrkor och svagheter.
- **Konsekvenser:** sidor kan glida om nya beställningar läggs under läsning. Offset blir långsammare på stora tabeller. Index `orders(customer_id, created_at DESC, id DESC)` rekommenderas om datamängden växer, men ingår inte (fråga 4). Kontraktsändring dokumenterad i `docs/api.md`.
- **Länkar:** R09, user story 3, den här planen, sessionsloggen.

## Berörda filer

| Fil | Ändring | Varför |
|---|---|---|
| `tests/customers.test.ts` | ändrad | Nya tester för kriterium 1-15. Det befintliga testet på rad 51-57 anpassas efter beslutad svarsform (ändring av förväntat värde, inget test tas bort eller stängs av, `docs/standard.md:35`). |
| `src/services/customerService.ts` | ändrad | Validering, sidindelning, filter, total |
| `src/routes/customers.ts` | ändrad | Läs query och använd `sendResult` |
| `docs/api.md` | ändrad | Dokumentera parametrar och svar (kräver godkännande) |
| `docs/adr/0002-sidindelning-orders.md` | ny | ADR (R09) |
| `sessions/session-NN-*.md` och `PLAN.md` | ändrade | Logg och status |
| `src/http.ts`, `src/result.ts`, `src/auth.ts` | bara lästa | Felformat och inloggning |
| `db/schema.sql`, `db/seed.sql`, `tests/helpers/db.ts` | bara lästa | Statusar, testdata |

## Kräver separat godkännande

- **Publikt API-kontrakt:** nya query-parametrar och, framför allt, ändrad svarsform (fråga 1). Gäller också ändringen i `docs/api.md`.
- **Databasschema:** inget i den här planen. Ett eventuellt index vore en migrering i steg som går att backa (`docs/user-stories.md:11`) och ingår inte (fråga 4).
- Beroenden, behörigheter och borttagning av filer: inget.

## Testplan

Testerna skrivs före implementationen med `tdd` och ska vara röda av rätt skäl (inte av syntaxfel). Testdata för sidindelning skapas i testen via `db.query` eller `POST /orders` (parametriserat, `resetDb` före varje test). Alla i `tests/customers.test.ts`, i `describe("GET /customers/me/orders")`.

| Kriterium | Test som skrivs först | Fil | Kommando |
|---|---|---|---|
| 1 | `it("standard: page 1, limit 20")` med 25 beställningar | `tests/customers.test.ts` | `npm test -- tests/customers.test.ts` |
| 2 | `it("page=2&limit=10 ger post 11-20 och total 25")` | samma | samma |
| 3 | `it("sista sidan har resten")` | samma | samma |
| 4 | `it("sida bortom slutet ger 200 och tom items")` | samma | samma |
| 5 | `it("limit 1 och 100 accepteras")` | samma | samma |
| 6 | `it.each(["0","-5","101","1.5","abc"])("limit %s ger 400")` | samma | samma |
| 7 | `it.each(["0","-1","1.5","abc"])("page %s ger 400")` | samma | samma |
| 8 | `it("status=paid ger bara paid")` (kund 1) | samma | samma |
| 9 | `it("okänd status ger 400 invalid_input")` | samma | samma |
| 10 | `it("status och page ihop, total 12")` | samma | samma |
| 11 | `it("kund utan beställningar ger 200 och tom lista")` (en ny kund via `POST /customers`) | samma | samma |
| 12 | `it("401 utan X-Customer-Id")`, även med `?limit=abc` | samma | samma |
| 13 | `it("ser aldrig andras beställningar")`, även med status och `?customerId=1` i query | samma | samma |
| 14 | `it("lika created_at sorteras på id DESC och sidgränser överlappar inte")` | samma | samma |
| 15 | `it("okänd parameter ignoreras")` | samma | samma |

Efter implementation: `npm test -- tests/customers.test.ts`, därefter `npm test`, `npm run lint`, `npm run typecheck` och `npm run format:check`. Det kända felet `GET /orders/1042/price` (`PLAN.md`, plan 01) väntas fortfarande misslyckas och hör inte till R09. Verifieraren ska skilja på det och nya fel.

Mutationskontroll (som i plan 04): ta bort `, id DESC`, ändra `OFFSET`, ta bort `customer_id`-villkoret och ta bort statusvillkoret tillfälligt och se att minst ett test blir rött. Återställ efter varje.

## Arbetsflöde och resultat per fas

| Fas | Agent och skill | Resultat som sparas |
|---|---|---|
| Research | `planerare` med `planera` | Avsnittet Research i den här planen |
| Plan | `planerare` med `planera` | Planen `docs/plans/05-sidindelning-orders.md` med kriterier, kontrakt och testplan. Användaren godkänner. |
| Build | `utvecklare` med `tdd` | Först röda tester, sedan implementation, gröna tester. Redovisning med faktiska kommandon. |
| Review | `granskare` med `granska-standard` | Granskningsrapport med fynd (fil:rad, allvarlighet) mot `docs/standard.md` och säkerhet (SQL-injektion, behörighet) |
| Verify | `verifierare` | Verifieringsrapport: alla kontroller, vad som är grönt, vad som återstår |

Efter varje fas stannar arbetet och användaren beslutar om nästa. Sessionsloggen i `sessions/` och `PLAN.md` uppdateras efter Verify.

## Risker

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|---|---|---|---|
| Ändrad svarsform bryter befintliga klienter | Medel | Klienter som förväntar en array får fel | Separat godkännande (fråga 1), dokumentera i `docs/api.md` och ADR |
| Offset-sidor glider när nya beställningar skapas | Låg | Dubblett eller missad post mellan sidor | Dokumenterat i ADR. Stabil sortering minskar risken. |
| Statusar utanför de fyra finns i databasen (ingen CHECK) | Låg | Poster som aldrig går att filtrera fram | Antagande som flaggas i fråga 3. Okänd status ger 400. |
| Strikt validering ger 400 där klienter skickar ex. `page=01` | Låg | Oväntat 400 | Regex `^\d+$` tillåter `01`. Beslut om detta i testet. |
| Fullständig tabellsökning utan index | Låg här, hög vid stor data | Långsam lista | Dokumenteras i ADR, index i eget moment (fråga 4) |
| Befintligt test ändras, kan misstolkas som försvagning | Låg | Misstanke om försvagat test | Redovisa uttryckligen att bara det förväntade värdet följer nya kontraktet. Test-guard (`test-guard.js`) kontrollerar att antalet tester inte minskar. |
| `COUNT` returneras som sträng av `pg` | Medel | `total` blir `"25"` | `::int`-cast och test på typ |

## Uppdelning i steg och spårbara commits

Förslag, inget utförs utan godkännande. Meddelande skrivs till en fil och committas med `git commit -F` (se Session 13). Endast filer för R09 läggs till, inte de orelaterade ändrade filerna i arbetskatalogen.

1. **Kontrakt och ADR-utkast** (efter godkännande av fråga 1): `docs/api.md` och `docs/adr/0002-sidindelning-orders.md`, status "Föreslagen". Commit: `docs: föreslå kontrakt och ADR 0002 för sidindelning av orders (R09)`.
2. **Röda tester** (`utvecklare`, `tdd`): kriterium 1-15 i `tests/customers.test.ts`. Körningen visar röda tester av rätt skäl. Commit: `test: sidindelning och statusfilter för GET /customers/me/orders (R09, röd)`.
3. **Implementation** (`utvecklare`): `customerService.ts` och `customers.ts` tills testerna är gröna. Commit: `feat: sidindelning och statusfilter för orders (R09)`.
4. **Review** (`granskare`): rapport. Eventuella rättningar i egen commit: `fix: åtgärda granskningsfynd för orders-listan (R09)`.
5. **Verify och dokumentation** (`verifierare`): ADR 0002 sätts till "Accepterad", sessionslogg och `PLAN.md` uppdateras. Commit: `docs: verifiera R09, acceptera ADR 0002, uppdatera logg`.

Varje steg kan godkännas, byggas och granskas för sig. Commitarna hänvisar till R09 och planen, så att varje fas går att spåra.

**Grenen och R10:** alla commits görs på `feature/r09-orders-pagination`. Efter Verify (och godkännande) pushas grenen och en pull request öppnas mot `main`. PR-beskrivningen länkar planen, ADR 0002 och verifieringsrapporten. PR:n är samtidigt underlag för R10: riggen (`granskare` med `granska-standard`) kan granska PR:ns diff mot `main` och redovisa fynd för säkerhet, struktur och kodstandard med fil och rad och vilken hook eller kontroll som skulle ha fångat dem. Att PR:n öppnas, pushas eller mergas kräver ett eget godkännande.

## Öppna frågor och beslut

1. **Svarsform (publikt kontrakt).** Alternativ A (omslag med `items`, `page`, `limit`, `total`), B (array och `X-Total-Count`) eller C (array utan total)? **Rekommendation: A.** Bryter dagens kontrakt och kräver ditt godkännande. Se avvägningen ovan.
2. **Standard och maxvärde för `limit`:** 20 och 100? Rekommendation: ja. Det är rimliga förslag, inte krav i storyn.
3. **Tillåtna statusar:** `new`, `paid`, `shipped`, `cancelled`, enligt seed och default men utan CHECK eller dokumentation. Stämmer mängden? Rekommendation: ja, och att okänd status ger 400 (inte tom lista).
4. **Index** `orders(customer_id, created_at DESC, id DESC)`? Rekommendation: nej nu. Schemaändring kräver godkännande och migrering som går att backa. Lyft i ADR som framtida åtgärd.
5. **401-felkoden `unauthorized`** finns inte i `ErrorCode` (`src/result.ts:2`). Rekommendation: lämna orörd, utanför R09. Kan noteras som fynd för R10.
6. **Okända query-parametrar:** ignoreras (kriterium 15, antagande). Alternativ: 400. Rekommendation: ignorera.
7. **Offset eller cursor?** Rekommendation: offset (ADR 0002). Cursor vore ett alternativ om datamängden växer.
8. **Befintligt test** `tests/customers.test.ts:51-57` måste ändras om A eller B väljs (för A: `res.body.items`). Godkänns det som en ändring av förväntat värde, inte som en försvagning? Rekommendation: ja.
9. **Commit-uppdelning och PR** enligt ovan: godkänns de, och när (efter Verify)?
