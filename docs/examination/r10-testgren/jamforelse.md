# Jämförelse: planterade fel mot blind granskning (R10, 18 november 2026)

Underlag: `facit.md` (skrivet före granskningen, utanför repot), `granskning-blind.md` (granskarens rapport) och `planterade-fel.patch` (själva ändringen, ocommittad på `test/r10-planterade-fel`, utgångspunkt `94fa24a`).

## Resultat

| Planterat fel | Hittat av granskaren | Kontroll som faktiskt flaggade det (körd) |
|---|---|---|
| P1 oanvänd variabel (`refunds.ts:11`) | Ja, F15 | `check-code.js` (PostToolUse) och `npm run lint`: **Automatiskt, bekräftat** |
| P2 explicit `any` (`refunds.ts:18`) | Ja, F14 | `check-code.js` och `npm run lint`: **Automatiskt, bekräftat** |
| P3 `.skip` på test | Ej tillämpligt, filen skapades aldrig | `main-guard.js`/`test-guard` blockerade skrivningen i riggens session. På en färdig PR är det manuellt |
| P4 SQL-konkatenering (`:12`) | Ja, F1 (Hög) | Ingen, manuellt |
| P5 saknad behörighet (`:9`) | Ja, F4 och F5 | Ingen, manuellt |
| P6 `float` för pengar (`:19-20`) | Ja, F3 | Ingen, manuellt |
| P7 hårdkodat lösenord (`:7`) | Ja, F2 | Ingen, manuellt |
| P8 läckande fel och stack (`:28`) | Ja, F7 och F8 | Ingen, manuellt |
| P9 (oplanerat) ingen validering | Delvis, F3 (belopp) och F6 (id) | Ingen, manuellt |

**7 av 7 tillämpliga planterade fel hittades blint.** Granskaren fick inga ledtrådar.

Granskaren hittade också äkta fynd som inte var planterade: F5 (POST saknar ägarkontroll), F6 (async-handler utan felhantering), F9 (inget tjänstelager), F11 (inga tester), F12 (kontraktet saknas i `docs/api.md`) och F13 (ingen gräns på antal rader).

## Körda kontroller (huvudsessionen)

| Kommando | Resultat |
|---|---|
| `npm run lint` | Underkänd, 2 fel: P1 och P2 |
| `npm run typecheck` | Godkänd |
| `npm run format:check` | Godkänd |
| `npm test` | 50 av 51 godkända. Det enda felet är det kända `GET /orders/:id/price` (404) |

Bara de två lint-felen fångades av en befintlig kontroll. De övriga sex fylls bara av granskning, vilket stämmer med `kontroller.md`, avsnitt C: reglerna S1–S17 saknar automatiska kontroller.

## Observationer om riggen

- **`main-guard.js` är för bred.** Ett fristående `*` i ett Bash-kommando (`SELECT * FROM` i en heredoc) blockerades som "filer med hemligheter". `mentionsSecret("*")` ger `true`, men `mentionsSecret("*.ts")` ger `false`. En Grep med glob `!{node_modules,.git}/**` blockerades av samma spärr, troligen av samma orsak (inte undersökt). Ingen av blockeringarna kringgicks.
- **Förtydligande efter Review (Session 17):** regeln är mer exakt än "ett fristående `*`". Ett ord blockeras när dess sista del bara är ett glob-mönster: `*`, `**`, `test/*` och `!{node_modules,.git}/**` matchar `mentionsSecret`, medan `*.test.js`, `.claude/**/*.test.js` och `refs/pull/*/head` inte gör det. Texten ovan står kvar som den skrevs. Orsaken till att `verifierares` `find`-anrop blockerades är inte klarlagd, eftersom `*.test.js` inte matchar.
- **`test-guard` fungerar** i riggens session mot `.skip`, men gäller inte för en PR från någon annan.
- **`check-code.js` är en hook, inte CI.** Den flaggade lint-felen vid skrivningen, men det finns ingen `.github/`, så ingen kontroll körs på en färdig PR.
- Granskarens sammanfattning stämde inte med dess egen tabell (se slutet av `granskning-blind.md`).

## Verifiering av bevisen

- Facit och patch är kopierade till `docs/examination/r10-testgren/` och har samma SHA-256 som originalen i scratchpad (patch `adc28e8f…`, facit `d9611491…`).
- Patchen applicerades med `git apply` på en ren kopia av `HEAD:src/app.ts` i scratchpad. Resultatet blev identiskt med arbetskatalogens `src/app.ts`. `refunds.ts` blev identisk efter att CR-tecken tagits bort. Kopian fick CRLF (996 byte mot 966), eftersom `git apply` utanför repot använder CRLF-omvandling. Innehållet är oförändrat.
- Patchen innehåller ett påhittat lösenord (`hunter2-admin-2026`) som är ett planterat fel och inte ett riktigt värde.
- Patchen är en ändring som ska **aldrig** slås ihop. Applicera den bara på en lokal testgren.

## Så återskapas testgrenen

```
git checkout -b test/r10-planterade-fel <utgångscommit>
git apply docs/examination/r10-testgren/planterade-fel.patch
```

Ändringen är ocommittad, och `test/r10-planterade-fel` pekar fortfarande på `94fa24a`.
