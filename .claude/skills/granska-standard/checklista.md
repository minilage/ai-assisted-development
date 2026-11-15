# Checklista: docs/standard.md

En punkt per regel i `docs/standard.md`. Regeltexten står i citat. Under varje regel står hur den kontrolleras och vilket allvar ett fynd brukar ha.

Sökningarna ger ledtrådar, inte fynd. Ett fynd räknas först när koden har lästs och regeln faktiskt bryts.

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

### S2 camelCase i JSON-svar
> Fältnamn i JSON-svar skrivs i camelCase, även när kolumnen i databasen har snake_case. Byt namn i SQL med `AS "fältnamn"`.

- Leta efter SQL med kolumner i snake_case, till exempel `customer_id` och `created_at`, som returneras utan `AS "camelCase"`.
- Jämför med fälten i svaren i `tests/`.
- Allvar: Medel, eftersom det påverkar API-kontraktet.

## Databas

### S3 Parametriserad SQL
> All SQL är parametriserad: `db.query(sql, [värden])`. SQL byggs aldrig med strängmallar eller sammanslagning.

- Sök efter `db.query(`, `` ` `` med `${` i SQL, och `+` mellan SQL och variabler.
- I Python: `execute(` med f-strängar, `%` eller `+`.
- Allvar: Hög.

### S4 Ingen fråga per rad
> Hämta relaterade rader i en fråga (JOIN eller `= ANY($1)`), inte en fråga per rad i en loop.

- Leta efter `db.query` inuti `for`, `.map(`, `forEach` eller `Promise.all(... .map(`.
- Allvar: Medel.

### S5 Transaktioner
> Skrivningar som hör ihop görs i en transaktion.

- Leta efter flera `INSERT`, `UPDATE` eller `DELETE` i samma funktion.
- Kontrollera att de körs med `BEGIN`/`COMMIT`/`ROLLBACK` på en och samma klient från `db.connect()`.
- Allvar: Medel. Hög om data kan bli halvt sparad.

## Fel

### S6 Result i tjänstelagret
> Tjänstelagret (`src/services/`) kastar inte fel för förväntade fall. Det returnerar `Result` med `ok(värde)` eller `err(kod, meddelande)` från `src/result.ts`.

- Sök efter `throw` i `src/services/`.
- Kontrollera att funktionerna returnerar `ok(`/`err(` för till exempel "finns inte" och ogiltig indata.
- Allvar: Medel.

### S7 Felsvar via sendResult/sendError
> Routes översätter fel till HTTP med `sendResult` eller `sendError` från `src/http.ts`. Alla felsvar har formen `{ "error": { "code": "...", "message": "..." } }`.

- Sök i `src/routes/` efter `res.status(` och `res.json(` som skickar fel direkt.
- Kontrollera formen på felsvaren.
- Allvar: Medel.

### S8 Statuskoder
> Statuskoder: 400 ogiltig indata, 401 inte inloggad, 403 inte din resurs, 404 finns inte, 409 konflikt.

- Jämför felkoderna i `src/result.ts` och hur `src/http.ts` översätter dem till statuskoder med regeln.
- Jämför också med svaren i `docs/api.md`.
- Allvar: Medel.

### S9 Tom sökning ger 200
> En sökning som inte hittar något returnerar 200 och en tom lista.

- Leta efter list- och sökendpoints som returnerar 404 när resultatet är tomt.
- Allvar: Medel.

## Behörighet

### S10 Kund från requireCustomer
> Den inloggade kunden hämtas med `requireCustomer` och `req.customerId`, aldrig från request body eller query.

- Kontrollera att routes som kräver inloggning använder `requireCustomer`, enligt `docs/api.md`.
- Sök efter `req.body.customerId`, `req.query` och `req.headers` utanför `src/auth.ts`.
- Allvar: Hög.

### S11 Bara egna beställningar
> En kund får bara läsa och ändra sina egna beställningar. Kontrollen görs i tjänstelagret.

- Kontrollera att funktionerna för beställningar i `src/services/` jämför ägaren med `customerId` och returnerar `err("forbidden", ...)`.
- Kontrollen ska inte bara finnas i en route.
- Allvar: Hög.

## Pengar

### S12 Inga flyttal för belopp
> Belopp räknas aldrig med flyttal. Priser lagras som `NUMERIC` och returneras som strängar med två decimaler.

- Sök efter `parseFloat`, `Number(`, `*`/`+` på pris, `toFixed`, och `float(` i Python.
- Kontrollera typen i `db/` och formatet på svaren.
- Allvar: Hög.

### S13 All prisberäkning via calcPrice
> All prisberäkning går genom `calcPrice` i `src/pricing/`. Logiken dupliceras inte.

- Sök efter `calcPrice`. Kontrollera att den finns, och leta efter egen beräkning av pris, rabatt eller moms utanför `src/pricing/`.
- Allvar: Medel.

## Hemligheter och loggar

### S14 Inga hemligheter i koden
> Inga nycklar, lösenord eller tokens i koden. De läses från miljövariabler.

- Sök efter `password`, `secret`, `token`, `apikey` och anslutningssträngar som `postgres://`.
- Läs aldrig `.env`.
- Allvar: Hög.

### S15 Inga personuppgifter i loggar
> Inga personuppgifter (namn, e-post) i loggar.

- Sök efter `console.log`, `console.error`, `print(` och `logging.` som skriver ut `name`, `email` eller hela objekt för kunder.
- Allvar: Hög.

## Tester

### S16 Tester för lyckat fall och felfall
> Varje endpoint har tester för lyckat fall och för felfallen 400, 401, 403 och 404 där de är möjliga.

- Jämför varje rad i `docs/api.md` med `describe`/`it` i `tests/`.
- Lista vilka statuskoder som saknar test.
- Allvar: Medel.

### S17 Testdatabasen återställs
> Testerna körs mot testdatabasen, som återställs före varje test.

- Kontrollera `beforeEach(resetDb)` i varje testfil och `tests/helpers/`.
- Allvar: Medel.

### S18 Inga borttagna eller överhoppade tester
> Ett test tas aldrig bort eller hoppas över för att bli grönt.

- Sök efter `.skip`, `.only`, `xit`, `xdescribe`, `test.todo` och `pytest.mark.skip`.
- I en diff: leta efter borttagna `it(`/`test(` och försvagade `expect`.
- Allvar: Hög.
