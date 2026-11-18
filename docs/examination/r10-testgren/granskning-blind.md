# Blind granskning av testgrenen `test/r10-planterade-fel` (R10, 18 november 2026)

Granskare: subagenten `granskare` med `granska-standard`. Den fick inte veta vilka fel som var planterade och fick inte läsa `sessions/` eller `docs/examination/`. Granskningen gäller ocommittade ändringar mot `94fa24a`: `src/routes/refunds.ts` (ny) och `src/app.ts`. Allt är läst, inget kördes av granskaren.

Texten nedan är granskarens egen rapport, oförändrad i sak. Facit finns i `facit.md` och jämförelsen i `jamforelse.md`.

**Verdikt:** Underkänd. Tre fynd med allvarlighet Hög är bekräftade (SQL-injektion, hårdkodat lösenord, felaktiga belopp), och det saknas tjänstelager, behörighetskontroll och tester.

| ID | Område | Regel | Allvar | Status | Fil:rad | Vad och varför | Förslag | Kontroll/hook | Automatiskt/Manuellt |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Säkerhet | S3 | Hög | Bekräftat | src/routes/refunds.ts:12 | Sökvägsparametern går rakt in i SQL via strängkonkatenering. Ett anrop som `/orders/1 OR 1=1/refunds` eller en UNION-fråga läser hela tabellen och annan data. | Parametriserad fråga (`$1`) efter att id har validerats som heltal. | Föreslagen: ESLint `no-restricted-syntax` mot sammanslagning i `db.query` | Manuellt |
| F2 | Säkerhet | S14 | Hög | Bekräftat | src/routes/refunds.ts:7 | Ett lösenord ligger i källkoden och hamnar i git-historiken. Det skrivs också till databaskolumnen `admin` (rad 24), alltså i klartext i en kolumn. | Ta bort konstanten. Byt lösenordet. Ett admin-id ska komma från `req.customerId` eller en miljövariabel. | Föreslagen: hemlighetsskanning av koden. `main-guard.js` täcker bara hemliga filer. | Manuellt |
| F3 | Säkerhet | S12 | Hög | Bekräftat | src/routes/refunds.ts:19-20,24 | Belopp räknas med flyttal (`* 1.0`, `* 0.025`) utan avrundning till två decimaler. Beloppet saknar validering och kan bli NaN eller negativt. Avgiften 2,5 % är en hårdkodad affärsregel i routen. | NUMERIC-sträng eller heltal i öre. Räkna i SQL eller tjänstelagret. Validera belopp > 0. | Föreslagen: ESLint `no-restricted-properties` mot flyttalsfunktioner, och test av svarets format. | Manuellt |
| F4 | Säkerhet | S10 / S11 | Hög | Bekräftat | src/routes/refunds.ts:10-14 | GET-routen saknar `requireCustomer`. Vem som helst kan läsa återbetalningar för valfri beställning, och ingen kontroll visar att beställningen tillhör kunden. | `requireCustomer` och ägarkontroll i ett tjänstelager (`forbidden` ger 403). | Föreslagen: test utan inloggning (401) och med annan kunds id (403). | Manuellt |
| F5 | Säkerhet | S11 | Hög | Bekräftat | src/routes/refunds.ts:17-26 | POST-routen har `requireCustomer`, men `req.customerId` används aldrig. Ingen kontroll av att beställningen tillhör kunden eller finns. | Ägarkontroll i tjänstelagret, 403 eller 404. | Föreslagen: test med annan kunds id. | Manuellt |
| F6 | Säkerhet | U1 | Hög | Bekräftat | src/routes/refunds.ts:10-13 | GET-handlern är `async` utan try/catch. Express 4 fångar inte avvisade löften. Ett id som inte är ett heltal (till exempel `abc`) ger ett SQL-fel och ett oavfångat löfte, vilket kan avsluta processen. | Validera id och fånga fel, eller en error-middleware. | Föreslagen: ESLint `no-misused-promises`, plus test med ogiltigt id. | Manuellt |
| F7 | Säkerhet | U3 | Medel | Bekräftat | src/routes/refunds.ts:28 | Felsvaret innehåller `String(e)` och `stack`. Det lämnar ut databasfel (SQL, tabell- och kolumnnamn) till klienten. | Generellt felsvar, logga felet internt utan personuppgifter. | Föreslagen: test att felsvaret saknar `stack`. | Manuellt |
| F8 | Kodstandard | S7 / S8 | Medel | Bekräftat | src/routes/refunds.ts:28 | Felsvaret är inte `{ error: { code, message } }`. `res.status(...)` används direkt i stället för `sendResult`/`sendError`. Ingen validering finns, så 400 och 404 kan aldrig komma. | `sendResult`/`sendError` från `src/http.ts`. | Föreslagen: ESLint `no-restricted-syntax` mot `res.status(` utanför `src/http.ts`. | Manuellt |
| F9 | Struktur | U4 | Medel | Bekräftat | src/routes/refunds.ts:10-29 | Routen innehåller SQL och affärslogik och går direkt mot `db`. Resten av projektet har routes -> `src/services/` -> db. `refundService` saknas, så S6 och S11 inte kan följas. | `src/services/refundService.ts` som returnerar `Result`. | Föreslagen: arkitekturkontroll (routes får inte importera `db`). | Manuellt |
| F10 | Kodstandard | S2 | Medel | Risk | src/routes/refunds.ts:12 | `SELECT *` ger kolumnnamnen som i databasen (till exempel `order_id`) i stället för camelCase med `AS "orderId"`. Tabellen `refunds` hittades inte i granskarens sökning, så kolumnnamnen kan inte beläggas. | Ange kolumnerna explicit med `AS "..."`. | Föreslagen: test av svarets nycklar. | Manuellt |
| F11 | Testtäckning | S16 / S17 | Medel | Bekräftat | tests/ (saknas) | Två nya endpoints, men ingen `tests/refunds.test.ts`. Varken lyckat fall eller 400/401/403/404 testas. | Tester först (TDD) med `resetDb`. | Föreslagen: krav på testtäckning. `npm test` ser inget fel eftersom inga tester finns. | Manuellt |
| F12 | Dokumentation | U8 | Medel | Bekräftat | docs/api.md (saknas) | Endpoints `GET` och `POST /orders/:id/refunds` finns inte i `docs/api.md`. Ett nytt publikt API-kontrakt kräver separat godkännande enligt CLAUDE.md. | Dokumentera kontraktet och få godkännande före implementationen. | Föreslagen: kontroll att routes och `docs/api.md` stämmer. | Manuellt |
| F13 | Säkerhet | U2 | Medel | Risk | src/routes/refunds.ts:12 | GET returnerar alla återbetalningar för en beställning utan `limit`. Index på `order_id` kan inte beläggas utan tabelldefinitionen. | `LIMIT` och paginering. | Föreslagen: test av gränsvärden. | Manuellt |
| F14 | Kodstandard | U6 | Låg | Bekräftat | src/routes/refunds.ts:18 | `const body: any = req.body;` är ett explicit `any`. | Typa och validera indata (`unknown` och kontroll). | `npm run lint` (`no-explicit-any`, bedömd av granskaren) | Automatiskt |
| F15 | Kodstandard | U9 | Låg | Bekräftat | src/routes/refunds.ts:11 | `const unusedLimit = 10;` är en oanvänd variabel. | Ta bort den, eller använd den som `LIMIT` (se F13). | `npm run lint` (`no-unused-vars`, bedömd av granskaren) | Automatiskt |
| F16 | Kodstandard | S1 / U6 | Låg | Bekräftat | src/routes/refunds.ts:19 | `const amount: number = body.amount * 1.0;` har en onödig typannotering, och `* 1.0` är ingen validering. Resultatet kan vara NaN. Följs av F3. | Se F3. | (anges inte av granskaren) | Manuellt |
| F17 | Struktur | U5 | Låg | Risk | src/routes/refunds.ts:10,17 | Id:t från `req.params.id` används som sträng utan tolkning, medan `src/routes/orders.ts` tolkar sitt id på annat sätt. | Gemensam tolkning av id. | Föreslagen: `jscpd`. | Manuellt |

Not från granskaren: `src/app.ts` är korrekt kopplad (import och `app.use(refunds)`), men monteringen gör alla fynden nåbara över HTTP och är samtidigt en ändring av det publika API-kontraktet.

## Granskarens osäkerheter

- Tabellen `refunds` och dess kolumner kunde inte beläggas i `db/`-filerna. Om tabellen saknas misslyckas båda endpoints, och S2 (F10) är obelagd.
- Om en `AS`-alias används i en annan fil som inte hittades.
- Om en befintlig middleware fångar avvisade löften i `src/server.ts` (U1). Granskaren läste inte `server.ts`.

## Regler utan fynd enligt granskaren

S4, S5, S6 (inget tjänstelager i ändringen, se F9), S9, S13, S15, S17 och S18.

## Anmärkningar om själva rapporten (huvudsessionen, 18 november 2026)

Granskarens sammanfattning stämmer inte med tabellen. Tabellen gäller:

- Allvar enligt tabellen: Hög 6 (F1–F6), Medel 7 (F7–F13), Låg 4 (F14–F17). Totalt 17.
- Status enligt tabellen: Risk 3 (F10, F13, F17), Bekräftat 14. Granskaren skrev "13 bekräftade och 4 risker" och "Medel 6".
- F16 saknar angiven kontroll i granskarens tabell.
- Granskaren bedömde lint-fynden F14 och F15 som "bedömd, inte körd". Huvudsessionen körde `npm run lint` och `check-code.js` flaggade båda (se `facit.md`).
