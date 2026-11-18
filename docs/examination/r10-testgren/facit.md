# Facit: planterade fel på test/r10-planterade-fel (18 november 2026)

Ligger utanför repot så att `granskare` inte ser det. Ocommittad ändring ovanpå `94fa24a`.

| # | Fel | Plats | Regel | Förväntad kontroll | Faktiskt utfall (körd) |
|---|---|---|---|---|---|
| P1 | Oanvänd variabel `unusedLimit` | src/routes/refunds.ts:11 | lint | Automatiskt: lint, check-code | Flaggad av check-code.js (PostToolUse) och `npm run lint` |
| P2 | Explicit `any` | src/routes/refunds.ts:18 | lint | Automatiskt: lint, check-code | Flaggad av check-code.js och `npm run lint` |
| P3 | `.skip` på test | tests/refunds.test.ts (ej skapad) | S18 | Automatiskt i rigg: test-guard | Blockerad av main-guard/test-guard. Filen skapades inte. Manuellt på färdig PR |
| P4 | SQL med strängkonkatenering | src/routes/refunds.ts:12 | S3 | Manuellt | Ingen kontroll flaggade |
| P5 | Saknad requireCustomer och ägarkontroll på GET /orders/:id/refunds | src/routes/refunds.ts:9 | behörighet | Manuellt | Ingen kontroll flaggade |
| P6 | float för pengar (`* 1.0`, `* 0.025`) | src/routes/refunds.ts:19-20 | pengar | Manuellt | Ingen kontroll flaggade |
| P7 | Hårdkodat lösenord ADMIN_PASSWORD | src/routes/refunds.ts:7 | hemligheter | Manuellt | Ingen kontroll flaggade |
| P8 | Läckande felmeddelande och stack i svaret | src/routes/refunds.ts:28 | felhantering | Manuellt | Ingen kontroll flaggade |
| P9 (oplanerat) | Ingen validering av `amount` och `id` (NaN, negativt belopp), refunds-tabellen finns inte i schemat | src/routes/refunds.ts | validering | Manuellt | -- |

Kontroller körda: lint underkänd (2 fel, P1 och P2), typecheck och format:check godkända, `npm test` 50 av 51 (endast känt pris-404).

Sidofynd om riggen: main-guard.js blockerade ett Bash-anrop på grund av ett fristående `*` (SELECT * FROM i en heredoc). mentionsSecret("*") ger true, mentionsSecret("*.ts") ger false.
