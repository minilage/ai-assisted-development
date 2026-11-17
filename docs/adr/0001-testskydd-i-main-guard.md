# ADR 0001: Skydd mot borttagna och avstängda tester i main-guard

**Status:** Accepterad (17 november 2026). Inte committad.
**Datum:** 2026-11-16 (förslag) och 2026-11-17 (accepterad efter Verify).
**Krav:**
- R07 (`docs/examination/requirements.md:159`)
- `CLAUDE.md:83` ("Ta aldrig bort, inaktivera eller försvaga tester")
- `docs/standard.md:35`

**Plan:** `docs/plans/04-testskydd.md`
**Logg:** `sessions/session-13-2026-11-16.md`

## 1. Vilket problem behövde lösas?

Agenten får ändra tester, men inte ta bort eller stänga av dem, och en automatisk kontroll ska stoppa försöken. Kravgenomgången den 16 november 2026 visade att ingenting i riggen gjorde det:
- `Edit(tests/**)` stod under allow (`.claude/settings.json`), så en Edit som lade till `.skip` gick igenom utan fråga.
- `rm` av en testfil gav bara en fråga om behörighet.
- `jest.config.js` och `pytest.ini`, som styr vilka tester som körs, kunde ändras utan fråga.

## 2. Vilken lösning valdes?

En modul med rena funktioner, `.claude/hooks/test-guard.js`, anropas från den befintliga PreToolUse-hooken `.claude/hooks/main-guard.js`. Den hooken körs både för huvudsessionen och för subagenterna. Den blockerar med exit 2:

1. **Edit och Write av en testfil** som ökar antalet avstängningar eller minskar antalet testdefinitioner. Det gäller Jest, node:test, pytest och unittest.
   - Hela filen jämförs före och efter ändringen.
   - Den råa filen prövas först och därefter med CRLF omgjort till LF.
   - En bortkommenterad definition räknas som borttagen.
2. **Skalkommandon som tar bort, flyttar eller byter namn på testfiler:** `rm`, `mv`, `Remove-Item`, `Move-Item`, `ren`, `git rm`, `git mv` med flera, `find -delete`/`-exec rm`, och `… | xargs rm` eller `… | Remove-Item` efter ett delkommando som nämner en testfil.
3. **Ask-regler** för `Edit(jest.config.js)` och `Edit(pytest.ini)` i `settings.json` (steg 3). `package.json` stod redan under ask.

Det som räknas som testfil är en sökväg med katalogen `tests` eller `__tests__`, eller ett filnamn som `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py` eller `conftest.py`. Det omfattar också riggens egna tester (beslut 3 i plan 04).

Tillåtet är nya tester, ändrade påståenden, nya namn och borttagen avstängning.

## 3. Fanns det andra alternativ?

| Alternativ | Styrka | Svaghet |
|---|---|---|
| **A. Bara behörighetsregler** (`deny: Edit(tests/**)`) | Inbyggt och enkelt, ingen kod | Ser inte innehållet. Stoppar alla ändringar av tester, också de som agenten får föreslå. Missar `rm` i andra former. |
| **B. En separat PreToolUse-hook** | Tydlig avgränsning, en hook för ett krav | Ny registrering, egen tolkning av kommandon och en process till per anrop. Gör inget som en modul i `main-guard` inte gör. |
| **C. En Stop-hook som jämför antalet tester med `HEAD`** (`git diff`, `jest --listTests`) | Fångar alla vägar, också skript, `sed -i` och omdirigering | Slår till i efterhand, när ändringen redan är gjord. Långsammare. Kräver ett sätt att räkna tester i flera ramverk. |
| **D. Pre-commit-hook eller kontroll i CI** | Bra för ett team (R20) och oberoende av agenten | Kräver ett nytt beroende (`husky`) eller `.git/hooks`, som inte versionshanteras. Stoppar först vid commit. |
| **E. Skrivskydd i filsystemet** (`attrib +r`) | Gäller alla verktyg | Stoppar också tillåtna ändringar, och agenten kan ta bort skyddet med ett kommando. |
| **Vald: modul i `main-guard`** | Täcker huvudsessionen och subagenterna med en befintlig registrering. Återanvänder `parse`, mönstret för testerna och meddelandet. Reglerna går att testa och mutationstesta för sig. | Mönsterbaserad, så skript och omdirigering fångas inte (se 6). |

## 4. Varför valdes alternativen bort?

- **A:** R07 tillåter att tester ändras, och en deny-regel kan inte skilja mellan att lägga till ett test och att ta bort ett.
- **B:** samma skydd kan fås utan en ny registrering, och `main-guard` gäller redan för subagenterna (verifierat i Session 12 och 13).
- **C och D:** de stoppar för sent för en agent som arbetar i realtid. De är bra komplement, särskilt D i ett team, men inte nödvändiga för R07 i den här riggen.
- **E:** för trubbigt, och lätt att kringgå.

## 5. Vilka tester och mätningar stödjer beslutet?

Alla siffror är uppmätta i Session 13 om inget annat anges.

| Kontroll | Resultat |
|---|---|
| `node --test .claude/hooks/test-guard.test.js` | 22 av 22 |
| `node --test .claude/hooks/main-guard.test.js` | 31 av 31 (19 före R07) |
| Riggsviten `node --test .claude/*.test.js .claude/*/*.test.js` | 189 av 189 (155 före R07) |
| Mutationer i `test-guard.js` (scratchpad) | 37 av 37 upptäckta, varav 5 som gör skyddet för strängt |
| Mutationer i `main-guard.js` (scratchpad) | 52 av 52 upptäckta (29 tidigare, varav 7A med ny söksträng, och 23 för testskyddet) |
| Uppspelning av 20 historiska ändringar av testfiler och 13 nuvarande testfiler | 0 falskt positiva |
| Uppspelning mot `tests/customers.test.ts` och `tests/orders.test.ts` (CRLF) | 16 av 16 bortkommenteringar blockerade och 16 av 16 tillåtna ändringar tillåtna |
| `npm run lint`, `typecheck` och `format:check` | exit 0 |
| Tid för `main-guard` per anrop (20 anrop) | 88,7 ms (Bash), 93,6 ms (Edit av testfil) och 100,8 ms (Edit av `src/app.ts`), ingen märkbar skillnad |

**Riktiga körningar med Claude Code:**
- **Huvudsessionen blockerade:**
  - Edit med `.skip`, Edit som tar bort ett test och bortkommentering via raden före, i både en LF- och en CRLF-fil
  - `rm`, `Remove-Item`, `find -delete`, `… | xargs rm`, `if rm …`, `echo $(rm …)` och `Get-ChildItem … | Remove-Item`
  - `{ skip: true }` i node:test
- **Huvudsessionen tillät:** en ny testfil, ett nytt test, ett nytt namn och ett ändrat värde.
- **`utvecklare` (subagent):** Edit med `.skip`, Edit som tar bort ett test och `rm` blockerades av `main-guard`. Jest gav 2 av 2, och md5 för testfilen var oförändrad.
- **Steg 3:** en Edit av `jest.config.js` gav en behörighetsfråga, som användaren nekade. Filen är oförändrad.

**Fel som granskningarna hittade** (`granskare`, fem omgångar). Testerna och mutationerna hade inte hittat dem:

| Omgång | Hög | Medel | Låg | Exempel |
|---|---|---|---|---|
| Steg 1 | 1 | 3 | 7 | Edit jämfördes bara i utdragen, så `// ` sist i raden före kommenterade bort ett test |
| Steg 1b | 0 | 1 | 6 | CRLF-filer gick förbi jämförelsen av hela filen |
| Steg 1c | 0 | 0 | 5 | `$'`-testet sa ingenting, och blandade radslut |
| Steg 2 | 0 | 2 | 7 | pipelines, `find -delete`, `FOO=1 rm` och `if rm` |
| Steg 2b och 3 (underkänd) | 2 | 2 | 6 | **Regression:** när `$(` blev `;` tilläts `git push origin "$(…)" --force` och `rm $(git ls-files tests)`. Rättat genom att båda varianterna prövas. |
| Rättningen av H1 och H2 | 0 | 0 | 3 | Bara dokumentationen: nya falskt positiva för flaggvärden efter `$(` för hemliga filer, och `pwsh -Command`/`wsl` |

Lärdom: en rättning av ett medelfynd (substitution som egen kommandoposition) införde en regression i befintliga skydd som varken de 29 gamla mutationerna eller testerna täckte. Det fanns inget test med substitution före en flagga. Granskningen hittade det, och regressionstester finns nu.

**Agenternas tokens** (från uppgiftsnotiserna, uppmätta):
- **Granskningar:** 54 936, 46 226, 45 155, 71 485, 90 272 och 70 096, totalt 378 170.
- **Verify:** 19 168 och 22 595.
- **Riktig körning med `utvecklare`:** 23 825.
- **Huvudsessionen:** registreras i `metrics/arbetsmoment.csv` när sessionen avslutas.

## 6. Finns det nackdelar eller risker kvar?

- **Mönsterbaserat och ingen sandlåda.** Det här fångas inte:
  - skript, `bash -c`, `sed -i` i huvudsessionen och omdirigering (`> fil`)
  - globmönster som `*.test.*` och `test_*` i `find -name` och `rm` (M1), `xargs -I{}` (M2), `find -exec git rm`, `rimraf`, `shred` och `trash`
  - `cp`/`Copy-Item`/`Clear-Content`/`truncate`
  - `-Path:` med kolon
  - en subshell `(rm x)`, `cmd /c del` och `ForEach-Object { Remove-Item $_ }`
  - `cd tests && rm *`
  - blockkommentarer, en tidig `return` och försvagade påståenden
  - importerade alias (`@mark.skip`) och `collect_ignore`

  Hela listan står överst i `main-guard.js` och `test-guard.js`. För `utvecklare` stoppar `agent-guard` redan skript, `sed -i`, omdirigering och de flesta borttagningar.
- **Villkorliga avstängningar** (`{ skip: <uttryck> }`) räknas inte. Det är ett beslut i Session 13. Det betyder att nya plattformsvillkor inte kräver användaren, men att agenten kan stänga av ett test med ett godtyckligt uttryck. `granskare` ska därför titta på nya villkor för skip.
- **`git checkout`/`restore`/`stash`** kan ta bort tester som inte är committade. De står under ask men blockeras inte.
- **Falskt positiva:**
  - ett avstängningsord i en ny kommentar eller sträng
  - nycklarna `skip`/`only`/`todo` med `true` i testdata
  - ett test som flyttas mellan filer eller slås ihop med ett annat
  - `env X=1 grep rm tests`
  - ett commit-meddelande via heredoc som nämner en testfil och ett kommando som tar bort eller flyttar. Använd `git commit -F <fil>` i stället.
  - `find "$(pwd)" -name "*.key"` och liknande blockeras som hemliga filer, eftersom flaggvärdet efter `$(` prövas som filnamn. Det tilläts i `HEAD`.
- **`pwsh -Command`, `wsl rm`, `bash -c` och `cmd /c`** fångas inte.

  Användaren gör då ändringen själv.
- **Om `node` inte startar** får Claude Code ett hookfel, och anropet blockeras inte. Det gäller hela `main-guard`.
- **Meddelandet** säger "Spärren för huvudsessionen" också när en subagent stoppas.
- **Nästa steg om risken behöver sänkas:** alternativ C (en Stop-hook mot `HEAD`) eller D (en kontroll i CI) som ett andra lager.
