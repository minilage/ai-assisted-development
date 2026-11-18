# Checklista: docs/standard.md och utöver den

Regler S1–S18 följer `docs/standard.md`, en punkt per regel, och hör till området **Kodstandard**. Regeltexten står i citat. Efter dem kommer reglerna U1–U9 **utöver standarden**, för områdena Säkerhet, Struktur, Testtäckning och Dokumentation (R10). Under varje regel står hur den kontrolleras, vilket allvar ett fynd brukar ha och vilken kontroll som kan fånga det.

Sökningarna ger ledtrådar, inte fynd. Ett fynd räknas först när koden har lästs och regeln faktiskt bryts.

Raden `Kontroll:` anger vilken **befintlig** kontroll ur [kontroller.md](kontroller.md) som skulle flagga fyndet (Automatiskt), eller att det kräver granskning (Manuellt) med en **föreslagen** kontroll. Bedömningen är läst, inte körd.

Allvar:
- **Hög:** säkerhet, behörighet, SQL-injektion eller felaktiga belopp.
- **Medel:** felhantering, transaktioner, N+1 eller tester som saknas.
- **Låg:** namn och form.

## Namn

### S1 camelCase och PascalCase
> Funktioner och variabler i TypeScript skrivs i camelCase, typer i PascalCase.

- Läs deklarationer i ändrade `.ts`-filer: `function`, `const`, `let`, `type` och `interface`.
- Sök efter `_` i namn på variabler och funktioner.
- Allvar: Låg.
- Kontroll: Manuellt. Föreslagen: ESLint-regeln `@typescript-eslint/naming-convention`.

### S2 camelCase i JSON-svar
> Fältnamn i JSON-svar skrivs i camelCase, även när kolumnen i databasen har snake_case. Byt namn i SQL med `AS "fältnamn"`.

- Leta efter SQL med kolumner i snake_case, till exempel `customer_id` och `created_at`, som returneras utan `AS "camelCase"`.
- Jämför med fälten i svaren i `tests/`.
- Allvar: Medel, eftersom det påverkar API-kontraktet.
- Kontroll: Manuellt. Jest fångar det bara om ett test kontrollerar svarets form (jämför R10 F1). Föreslagen: test av svarets nycklar.

## Databas

### S3 Parametriserad SQL
> All SQL är parametriserad: `db.query(sql, [värden])`. SQL byggs aldrig med strängmallar eller sammanslagning.

- Sök efter `db.query(`, `` ` `` med `${` i SQL, och `+` mellan SQL och variabler.
- I Python: `execute(` med f-strängar, `%` eller `+`.
- Allvar: Hög.
- Kontroll: Manuellt. Ingen kontroll i riggen läser SQL. Föreslagen: ESLint `no-restricted-syntax` mot mallsträngar i `db.query`.

### S4 Ingen fråga per rad
> Hämta relaterade rader i en fråga (JOIN eller `= ANY($1)`), inte en fråga per rad i en loop.

- Leta efter `db.query` inuti `for`, `.map(`, `forEach` eller `Promise.all(... .map(`.
- Allvar: Medel.
- Kontroll: Manuellt. Föreslagen: ESLint `no-await-in-loop`.

### S5 Transaktioner
> Skrivningar som hör ihop görs i en transaktion.

- Leta efter flera `INSERT`, `UPDATE` eller `DELETE` i samma funktion.
- Kontrollera att de körs med `BEGIN`/`COMMIT`/`ROLLBACK` på en och samma klient från `db.connect()`.
- Allvar: Medel. Hög om data kan bli halvt sparad.
- Kontroll: Manuellt. Föreslagen: test som avbryter mitt i en skrivning.

## Fel

### S6 Result i tjänstelagret
> Tjänstelagret (`src/services/`) kastar inte fel för förväntade fall. Det returnerar `Result` med `ok(värde)` eller `err(kod, meddelande)` från `src/result.ts`.

- Sök efter `throw` i `src/services/`.
- Kontrollera att funktionerna returnerar `ok(`/`err(` för till exempel "finns inte" och ogiltig indata.
- Allvar: Medel.
- Kontroll: Manuellt. Föreslagen: ESLint `no-restricted-syntax` mot `throw` i `src/services/`.

### S7 Felsvar via sendResult/sendError
> Routes översätter fel till HTTP med `sendResult` eller `sendError` från `src/http.ts`. Alla felsvar har formen `{ "error": { "code": "...", "message": "..." } }`.

- Sök i `src/routes/` efter `res.status(` och `res.json(` som skickar fel direkt.
- Kontrollera formen på felsvaren.
- Allvar: Medel.
- Kontroll: Manuellt. Föreslagen: ESLint `no-restricted-syntax` mot `res.status(` utanför `src/http.ts`.

### S8 Statuskoder
> Statuskoder: 400 ogiltig indata, 401 inte inloggad, 403 inte din resurs, 404 finns inte, 409 konflikt.

- Jämför felkoderna i `src/result.ts` och hur `src/http.ts` översätter dem till statuskoder med regeln.
- Jämför också med svaren i `docs/api.md`.
- Allvar: Medel.
- Kontroll: Manuellt. Jest fångar det bara om ett test kontrollerar statuskoden.

### S9 Tom sökning ger 200
> En sökning som inte hittar något returnerar 200 och en tom lista.

- Leta efter list- och sökendpoints som returnerar 404 när resultatet är tomt.
- Allvar: Medel.
- Kontroll: Manuellt. Jest fångar det om ett test kontrollerar en tom lista.

## Behörighet

### S10 Kund från requireCustomer
> Den inloggade kunden hämtas med `requireCustomer` och `req.customerId`, aldrig från request body eller query.

- Kontrollera att routes som kräver inloggning använder `requireCustomer`, enligt `docs/api.md`.
- Sök efter `req.body.customerId`, `req.query` och `req.headers` utanför `src/auth.ts`.
- Allvar: Hög.
- Kontroll: Manuellt. Jest fångar det om ett test anropar utan inloggning (401).

### S11 Bara egna beställningar
> En kund får bara läsa och ändra sina egna beställningar. Kontrollen görs i tjänstelagret.

- Kontrollera att funktionerna för beställningar i `src/services/` jämför ägaren med `customerId` och returnerar `err("forbidden", ...)`.
- Kontrollen ska inte bara finnas i en route.
- Allvar: Hög.
- Kontroll: Manuellt. Jest fångar det om ett test anropar med en annan kunds id (403).

## Pengar

### S12 Inga flyttal för belopp
> Belopp räknas aldrig med flyttal. Priser lagras som `NUMERIC` och returneras som strängar med två decimaler.

- Sök efter `parseFloat`, `Number(`, `*`/`+` på pris, `toFixed`, och `float(` i Python.
- Kontrollera typen i `db/` och formatet på svaren.
- Allvar: Hög.
- Kontroll: Manuellt. Föreslagen: ESLint `no-restricted-properties` mot `parseFloat` och `toFixed`, och test av svarets format (jämför `"950"` mot `"950.00"`).

### S13 All prisberäkning via calcPrice
> All prisberäkning går genom `calcPrice` i `src/pricing/`. Logiken dupliceras inte.

- Sök efter `calcPrice`. Kontrollera att den finns, och leta efter egen beräkning av pris, rabatt eller moms utanför `src/pricing/`.
- Allvar: Medel.
- Kontroll: Manuellt.

## Hemligheter och loggar

### S14 Inga hemligheter i koden
> Inga nycklar, lösenord eller tokens i koden. De läses från miljövariabler.

- Sök efter `password`, `secret`, `token`, `apikey` och anslutningssträngar som `postgres://`.
- Läs aldrig `.env`.
- Allvar: Hög.
- Kontroll: Manuellt. `main-guard.js` stoppar bara åtkomst till hemliga filer. Föreslagen: en hemlighetsskanning av koden.

### S15 Inga personuppgifter i loggar
> Inga personuppgifter (namn, e-post) i loggar.

- Sök efter `console.log`, `console.error`, `print(` och `logging.` som skriver ut `name`, `email` eller hela objekt för kunder.
- Allvar: Hög.
- Kontroll: Manuellt. Föreslagen: ESLint `no-console`.

## Tester

### S16 Tester för lyckat fall och felfall
> Varje endpoint har tester för lyckat fall och för felfallen 400, 401, 403 och 404 där de är möjliga.

- Jämför varje rad i `docs/api.md` med `describe`/`it` i `tests/`.
- Lista vilka statuskoder som saknar test.
- Allvar: Medel.
- Kontroll: Manuellt. `npm test` fångar bara fel i de tester som finns. Föreslagen: krav på testtäckning.

### S17 Testdatabasen återställs
> Testerna körs mot testdatabasen, som återställs före varje test.

- Kontrollera `beforeEach(resetDb)` i varje testfil och `tests/helpers/`.
- Allvar: Medel.
- Kontroll: Manuellt.

### S18 Inga borttagna eller överhoppade tester
> Ett test tas aldrig bort eller hoppas över för att bli grönt.

- Sök efter `.skip`, `.only`, `xit`, `xdescribe`, `test.todo` och `pytest.mark.skip`.
- I en diff: leta efter borttagna `it(`/`test(` och försvagade `expect`.
- Allvar: Hög.
- Kontroll: Automatiskt i riggens sessioner (`test-guard.js` blockerar borttagna och avstängda tester). Manuellt på en färdig PR, som inte har passerat hooken.

## Utöver standarden (R10)

Reglerna nedan finns inte i `docs/standard.md`. De täcker det en granskning av säkerhet, struktur och tester också ska titta på. Ange `Område:` som området i fyndtabellen.

### U1 Oavfångade fel i async-handlers
- Område: Säkerhet
- Leta efter `async`-handlers i routes (Express 4) utan `try`/`catch` eller felhanterare, och anrop mot databasen som kan kasta, till exempel för värden utanför kolumnens intervall.
- Ett oavfångat fel i en `async`-handler kan avsluta hela processen.
- Allvar: Hög om en klient kan utlösa det, annars Medel.
- Kontroll: Manuellt. Föreslagen: en error-middleware, ESLint `no-misused-promises` (kräver typinformation) och ett test med ett värde utanför intervallet.

### U2 Indata utan gränser
- Område: Säkerhet
- Kontrollera att tal, id och headers har intervall och att listor har övre gräns: `limit`, `OFFSET`, längd på texter och frågor som körs vid varje anrop utan index.
- Allvar: Medel. Hög om en enskild klient kan ta ned tjänsten.
- Kontroll: Manuellt. Föreslagen: tester av gränsvärden.

### U3 Läckage i svar och loggar
- Område: Säkerhet
- Leta efter felmeddelanden eller loggar som innehåller stackar, SQL eller indata. Kompletterar S15.
- Allvar: Medel.
- Kontroll: Manuellt.

### U4 Lagerbrott
- Område: Struktur
- Kontrollera att validering och tolkning av HTTP-indata (`req.query`, headers) och affärslogik ligger på rätt lager. Tjänstelagret ska inte läsa HTTP, och routes ska inte innehålla affärslogik.
- Allvar: Låg.
- Kontroll: Manuellt.

### U5 Duplicerad logik
- Område: Struktur
- Leta efter samma tolkning eller validering på flera ställen, särskilt med olika regler.
- Allvar: Låg.
- Kontroll: Manuellt. Föreslagen: en kontroll av duplicerad kod, till exempel `jscpd`.

### U6 Typer som döljer fel
- Område: Struktur
- Leta efter `any`, `as`-casts och typer som inte stämmer med verkligheten, till exempel `string` där databasen ger `Date`, eller `string` där en union av värden är rätt.
- Allvar: Låg.
- Kontroll: Delvis Automatiskt: `npm run lint` bör flagga explicit `any` (bedömd, bekräfta genom körning). Manuellt för `as`-casts och oriktiga typer.

### U7 Svaga eller ofullständiga tester
- Område: Testtäckning
- Leta efter assertioner som inte skulle fånga en regression (bara statuskoden, inte svarets form), saknade gränsvärden och felfall, och tester som beror på ordning, tid eller tidszon. Kompletterar S16.
- Allvar: Medel.
- Kontroll: Manuellt. Föreslagen: mutationsprov eller krav på täckning.

### U8 Dokumentation som inte stämmer
- Område: Dokumentation
- Jämför `docs/api.md`, ADR, planer och loggar med koden: kontrakt, filhänvisningar, radnummer och antal commits.
- Allvar: Låg.
- Kontroll: Manuellt. Föreslagen: en kontroll av att hänvisade filer och commits finns.

### U9 Fel som de automatiska kontrollerna redan fångar
- Område: Kodstandard
- Oanvända variabler, typfel och formatering. Redovisa dem som Automatiskt och be `verifierare` köra kontrollerna. De behöver inte listas som egna fynd om kontrollerna redan underkänner.
- Allvar: Låg.
- Kontroll: Automatiskt: `npm run lint`, `npm run typecheck` och `npm run format:check`.
