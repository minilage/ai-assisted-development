# R10: granskning av R09-pull requesten

**Datum:** 2026-11-17
**Krav:** R10 (`docs/examination/requirements.md:224`)
**Granskat:** hela PR-diffen `git diff main...feature/r09-orders-pagination` (6 commits, 8 filer, merge-bas `e3dbda2`). R07-commiten `9ab35b8` på `main` ingår inte.
**Gjort av:** `granskare` med `granska-standard`. Fynden är kontrollerade av huvudsessionen enligt avsnittet "Kontroll av fynden".
**Begränsning:** PR:n på GitHub är inte öppnad ännu (`gh` saknas). Granskningen gäller grenens diff, som blir PR:ns innehåll. Inga tester eller kontroller kördes under granskningen, och inget ändrades, slogs ihop eller stängdes under den. Rättningarna av F1 och F2 gjordes efteråt (se "Åtgärder efter granskningen"). Resten av dokumentet beskriver läget vid granskningen, om inget annat anges.

**Verdikt: godkänd med anmärkningar.** Implementationen är korrekt vid läsning: parametriserad SQL, rätt källa för kund-id, stabil sortering, validering som tål arrayer och objekt, och dokumenterat kontrakt. Det finns inget bekräftat fel som kräver att PR:n stoppas. F1 och F2 bedömdes böra rättas före sammanslagning och är nu rättade. F3 kräver ett beslut.

## Kontroll av fynden (huvudsessionen)

| Fynd | Kontroll | Utfall |
|---|---|---|
| F1 | `grep createdAt tests` | 0 träffar. Bekräftat. |
| F2 | `git rev-list --count main..HEAD` | 6 commits. Sessionsloggen säger fyra, `PLAN.md` fem. Bekräftat. |
| F3 | Läste `src/auth.ts:7-16` och `src/app.ts`. Node är v24.14.0 och Express 4.22.3. | Ingen int4-gräns på `X-Customer-Id` och ingen felhanterare finns. Själva krashen är **inte provkörd**: ett försök blockerades av `main-guard` (kommandot nämnde `.env`) och jag försökte inte kringgå det. |
| F8 | `src/services/customerService.ts:6` | `createdAt: string`. `pg` ger `Date` för `TIMESTAMPTZ`. Bekräftat vid läsning. |

## Åtgärder efter granskningen (17 november 2026)

Användaren beslutade att bara F1 och F2 rättas. Övriga fynd är oförändrade i tabellerna nedan.

| Fynd | Status | Åtgärd och verifiering |
|---|---|---|
| **F1** | **Rättat** | Ett regressionstest i `tests/customers.test.ts` ("varje element har exakt nycklarna id, status och createdAt med rätt typer") kontrollerar nycklarna och typerna (`id` som number, `status` som string, `createdAt` som ISO 8601-sträng). Det var grönt direkt, eftersom beteendet fanns. Mutationsdemonstration (tillfälliga ändringar i `src/services/customerService.ts`, återställda efter varje): (1) `AS "created_at"` ger 1 rött av 40, (2) ett extra fält `discount_code` i `SELECT` ger 1 rött av 40, (3) `status` borttaget ur `SELECT` ger 1 rött av 40. I alla tre fall var det nya testet det enda röda. Före och efter varje återställning var `md5` av `customerService.ts` identisk (`93058b17…`) och `git diff --stat -- src` var tom. |
| **F2** | **Rättat** | Hårdkodade commit-antal är ersatta med de sex faktiska hasharna och en hänvisning till `git log main..feature/r09-orders-pagination` för senare commits, i `sessions/session-14-2026-11-17.md`, `PLAN.md` och `docs/plans/05-sidindelning-orders.md`. Sessionsloggens föråldrade rader om `PLAN.md` och nästa moment är uppdaterade, och loggen har fått ett avsnitt om R10. |
| **F6** | **Godtagen, ej åtgärdad** | Låg prioritet. Luckan finns kvar (se tabellen). |
| **F7** | **Godtagen, ej åtgärdad** | Låg prioritet. Luckan finns kvar (se tabellen). |

Verifiering efter åtgärderna: se avsnittet "Verifiering efter åtgärderna" längst ned.

## Fynd

### Bekräftade fel
| ID | Område | Allvar | Fil:rad | Vad och varför | Rekommendation | Kontroll som kunde fånga det |
|---|---|---|---|---|---|---|
| F1 (**rättat**, se åtgärder) | Testtäckning | medel | `tests/customers.test.ts` (hela filen), `src/services/customerService.ts:80` | Ingen assertion kontrollerar elementens form `{ id, status, createdAt }`. Om `AS "createdAt"` tas bort (S2) förblir alla 39 tester gröna, och kontraktet bryts utan att något märks. Mutationslistan i Session 14 saknar den mutationen. | Test med `expect(items[0]).toEqual({ id, status, createdAt: expect.any(String) })`. | Jest-test (saknas). **Automatisk** med nytt test. |
| F2 (**rättat**, se åtgärder) | Dokumentation | låg | `sessions/session-14-2026-11-17.md:5,60,69-72`, `PLAN.md` (R09-punkten), `docs/plans/05-sidindelning-orders.md:3` | Antalet commits står olika på olika ställen (fyra, fem och fyra hashar). Grenen har sex. Loggen säger också att `PLAN.md` inte är uppdaterad, men den är det. Spårbarheten blir missvisande. | Skriv "se `git log`" i stället för hårdkodade antal. | **Manuell** granskning (eller en konsistenskontroll i CI). |
| F6 (godtagen) | Testtäckning | låg | `tests/customers.test.ts` | Valideringsfall utan test: tom `page=`/`limit=`, `status[a]=b`, `page[a]=1`, `+1`, `1e3`, `0x10`, Unicode-siffror, `page=9007199254740991` och `9007199254740992`. `COUNT`-frågan är inte mutationstestad separat. Gränsen mot int8 (ADR 0002) är helt olåst. | `it.each` med dessa värden. | Jest-test. **Automatisk** med nya tester. |
| F8 | Struktur | låg | `src/services/customerService.ts:6,42,93` | `createdAt: string`, men `pg` returnerar `Date`. Typen är oriktig och döljs av att radresultatet är `any`. `ORDER_STATUSES` är `string[]`, och det finns ingen delad `OrderStatus`-typ. | `as const`, härled `OrderStatus` och typa frågeresultatet. | `typecheck` räcker inte. ESLint `no-unsafe-*` med typinformation, annars **manuell**. |
| F9 | Struktur | låg | `src/auth.ts:11`, `src/result.ts:2`, `src/http.ts:5-10` | `requireCustomer` skickar `unauthorized` direkt med `res.status(401)`, och koden finns inte i `ErrorCode` eller `STATUS`. Två vägar för felsvar (S7/S8). Ligger utanför diffen, men `docs/api.md` lovar 401 utan att beskriva felkoden. | Lägg `unauthorized: 401` i `ErrorCode` och `STATUS`, och använd `sendError`. | ESLint `no-restricted-syntax` mot `res.status(` utanför `http.ts`. **Automatisk** med ny regel. |
| F10 | Struktur | låg | `src/services/customerService.ts:40-76`, `src/routes/customers.ts:22-27` | HTTP-parsning av `unknown` sker i servicelagret. `parseInteger` är lokal, medan `parseId` i `src/routes/orders.ts:9` gör nästan samma sak med andra regler (`Number()` godtar `"1e3"` och `"0x10"`). | En gemensam hjälpfunktion om fler endpoints behöver den. | **Manuell** (kodduplicering), eventuellt `jscpd`. |

### Risker (ej bekräftade)
| ID | Område | Allvar | Fil:rad | Vad och varför | Rekommendation | Kontroll |
|---|---|---|---|---|---|---|
| F3 | Säkerhet (DoS) | hög, fanns redan före PR:n | `src/auth.ts:9-10`, `src/routes/customers.ts:23`, `src/services/customerService.ts:79-86`, `src/app.ts` | `X-Customer-Id: 99999999999` passerar `requireCustomer` (heltal > 0, ingen int4-gräns) och skickas mot `customer_id INTEGER`. Postgres ger `out of range for type integer`. Handlern är `async` i Express 4, och det finns ingen felhanterare, så avvisningen blir en oavfångad promise-rejection. I Node 24 stoppar den som standard processen. Vem som helst som kan skicka en header kan då ta ned API:t med ett anrop. Alla DB-fel ger samma resultat. Den nya endpointen lägger till två frågor på den ytan. **Status: starkt skäl men ej körd.** | Error-middleware och wrappa async-handlers (eller Express 5), int4-gräns i `requireCustomer`, och ett test för `X-Customer-Id: 99999999999` (förväntat 401). | Jest-test (saknas), `no-floating-promises`/`no-misused-promises`. **Delvis automatisk**. Ändringen rör behörighet och felkontrakt och kräver godkännande. |
| F4 | Säkerhet (DoS) | låg–medel | `db/schema.sql:24-30`, `src/services/customerService.ts:79-92` | Inget index på `orders.customer_id`, och varje anrop gör två frågor. Utan index blir båda sekventiella skanningar. Villkoret `($2::text IS NULL OR status = $2)` kan hindra ett framtida index. Ingen rate limit. Dokumenterat i ADR 0002 och medvetet utelämnat (schemaändring). | Index `orders(customer_id, created_at DESC, id DESC)` i en separat ändring. | **Manuell**, eventuellt `EXPLAIN`-test. |
| F5 | Korrekthet | låg | `customerService.ts:79-93` | `items` och `total` hämtas i två frågor utan snapshot, så `total` kan avvika om en beställning skapas emellan. Dokumenterat i ADR 0002. | Acceptera (ADR) eller en `REPEATABLE READ`-transaktion. | **Manuell**. |
| F7 (godtagen) | Testtäckning | låg | `tests/customers.test.ts` (401-testet) | Testet kontrollerar bara statuskoden, inte felkoden `unauthorized`, och ingen ogiltig header (`abc`, `0`, `-1`) testas mot routen. | Testa `error.code` och ogiltiga headers. | Jest-test. **Automatisk**. |

### Informationsnoter
| ID | Fil | Not |
|---|---|---|
| F11 | `tests/customers.test.ts` | Seed-SQL med `generate_series` finns på tre ställen, och `range(from, to)` är förvirrande. Underhållsrisk, ingen funktionell. **Manuell.** |
| F12 | commits `d133ea3` före `317a321` | Testcommiten är röd isolerat, och fixar efter Review blev ingen egen commit. Avviker från planen och försvårar `bisect`. Låt `test` och `feat` bli en commit vid sammanslagning. **Manuell.** |

### Utan fel (läst)
- **SQL:** parametriserad (`$1`–`$4`), ingen strängkonkatenering, och felmeddelandet citerar inte indata.
- **Kund-id:** kommer från `requireCustomer`, och `?customerId=1` ignoreras (testat). Identiteten är en förfalskningsbar header enligt `src/auth.ts:3`, vilket är känt och ingen nyhet.
- **Regex:** `/^\d+$/` är linjär (ingen ReDoS), och Unicode-siffror, blanksteg och radbrytning avvisas.
- **OFFSET:** högst cirka 9,0e17, vilket ryms i int8 (marginalen är dokumenterad i ADR 0002).
- **Sortering och tid:** `created_at DESC, id DESC` är entydig, och `TIMESTAMPTZ` ger UTC-ISO.
- **Tester:** inga `.skip`, `.only` eller borttagna tester. Ändringen av det befintliga testet till `res.body.items` är en kontraktsanpassning, inte en försvagning (S18).
- **Standarden:** S1, S3–S6, S9–S11, S14, S15, S17 och S18 utan fynd. S12 och S13 gäller inte.

## Kunde inte bedömas utan att köra kod
- Att alla tester går igenom (39 vid granskningen, enligt loggen och Verify, men inte omkört här). Efter rättningen av F1 är det 40, och det är verifierat (se "Verifiering efter åtgärderna").
- Att F3 verkligen stoppar processen (se kontrollen ovan).
- Frågeplan och prestanda utan index.
- Hur `pg` serialiserar OFFSET nära 9e17.
- Lint-, typecheck- och formatresultat.

## R10-mappning

| Område | Fynd | Bedömning |
|---|---|---|
| **Säkerhet** | F3 (risk, hög, fanns före PR:n), F4 (risk) | Minst ett fynd finns, men F3 är **inte provkörd**. Ingen SQL-injektion och ingen ny IDOR. |
| **Struktur** | F8, F9, F10 (bekräftade, låga) | Uppfyllt. |
| **Kodstandard** | F1 (S2 oskyddat av test), F9 (S7/S8, utanför diffen), F6/F7 (S16-luckor) | **Delvis.** Inget bekräftat brott mot en standardregel i den nya koden. Fynden är luckor i täckning och en regel som kringgås i `auth.ts`. Inget hittat på för att fylla kvoten. |

## Automatiskt eller manuellt
- **Fångas av riggens nuvarande kontroller:** inget. `lint`, `typecheck`, `format:check` och Jest passerar, och F1, F3, F6 och F7 slinker igenom just därför. `docs/standard.md:3` säger att reglerna inte kontrolleras automatiskt ännu.
- **Kan fångas automatiskt med små tillägg:** F1, F6, F7 (nya Jest-tester), F9 (ESLint-regel mot `res.status(` utanför `http.ts`), F3 (test av `X-Customer-Id: 99999999999` och `no-floating-promises`), F8 (typbaserade `no-unsafe-*`-regler).
- **Kräver manuell granskning:** F2, F4, F5, F10, F11, F12.

## Verifiering efter åtgärderna

Review (`granskare`, 17 november 2026): 0 hög, 0 medel och 4 låga fynd, alla i det här dokumentets formuleringar. De är rättade. F1-testet och F2-hänvisningarna bedömdes korrekta.

Verify (`verifierare`, 17 november 2026):

| Kontroll | Resultat |
|---|---|
| `npm test -- tests/customers.test.ts` | 40 av 40 godkända |
| `npm test` | 50 godkända, 1 underkänd: det kända `GET /orders/:id/price › räknar pris med moms via den äldre modulen`. Inga nya fel. |
| `npm run lint` | godkänd |
| `npm run typecheck` | godkänd |
| `npm run format:check` | godkänd |
| `md5sum src/services/customerService.ts` | `93058b177d828b8bf08f920ac4d42c4a`, identisk med före mutationerna |
| `git diff --stat -- src` | tom: `src/` är oförändrat sedan `240af7c` |
| R07-filerna | inte ändrade |
| Hänvisade filer | alla finns (radhänvisningarna är inte kontrollerade av verifieraren) |

Inte verifierat: F3 är fortfarande inte provkörd, och mutationsdemonstrationen är körd av `utvecklare` (granskaren och verifieraren körde den inte om).

## Rekommenderade åtgärder
1. F1, F6, F7: lägg till tester. F2: rätta commit-antalen. Små och säkra ändringar. **Läge: F1 och F2 är gjorda. F6 och F7 är godtagna som låga fynd och väntar.**
2. F3: eget moment (felhantering och int4-gräns). Kräver godkännande eftersom det rör behörighet och felkontrakt.
3. F4 (index) och F9 (`unauthorized`) separat, eftersom de kräver godkännande (schema respektive felkontrakt).

## Övrigt vid granskningen
- Under R09 gav `main-guard` flera falska larm för harmlösa kommandon (se Session 14). Provet av F3 blockerades däremot med rätta, eftersom kommandot nämnde `.env`. Det är underlag för riggen och hör inte till PR:n.
