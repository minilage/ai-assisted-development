# Plan: Skydd mot att tester tas bort eller stängs av (R07)

**Status:** Godkänd 2026-11-16 och genomförd 2026-11-17.
- Steg 1–4 är klara. 1b, 1c och 2b kom till efter granskningarna.
- Regressionen H1/H2 från 2b är rättad och omgranskad: godkänd med anmärkningar, som bara gäller dokumentationen.
- M1 och M2 är dokumenterade och väntar på beslut. ADR: `docs/adr/0001-testskydd-i-main-guard.md`. Logg: `sessions/session-13-2026-11-16.md`. Inte committad.
**Not om radnummer:** Research-avsnittet beskriver läget före steg 1. Radhänvisningarna till `main-guard.js` där (`:24`, `:201`, `:143`, `:129` och `:245`) gäller filen i `HEAD` (`b2647f9`).
**Beslut (användaren, 2026-11-16):** rekommendationerna i alla sex öppna frågor är godkända:
1. Försvagade påståenden blockeras inte.
2. Steg 3 genomförs.
3. Riggens egna tester omfattas.
4. Borttagning av testfiler blockeras.
5. Mutationsskriptet ligger i scratchpad.
6. ADR:er heter `docs/adr/NNNN-kort-namn.md`.
**Datum:** 2026-11-16
**Underlag:** `docs/examination/requirements.md:159` (R07: "AI-agenten får föreslå ändringar i tester, men får inte ta bort eller stänga av dem. Det ska finnas en automatisk kontroll som stoppar sådana försök."), `CLAUDE.md:83` ("Ta aldrig bort, inaktivera eller försvaga tester") och `docs/standard.md:35` ("Ett test tas aldrig bort eller hoppas över för att bli grönt"). Kravgenomgången den 16 november 2026 visade att R07 saknas.

## Mål

När momentet är klart ska riggen automatiskt stoppa, med exit 2 i en PreToolUse-hook, att en agent (huvudsessionen eller en subagent):

1. stänger av ett test genom att lägga till `.skip`, `.only`, `xit`, `xdescribe`, `xtest`, `fit`, `fdescribe` eller motsvarande i pytest (`@pytest.mark.skip`, `skipif`, `xfail`, `pytest.skip(` och `@unittest.skip`)
2. tar bort ett test eller kommenterar bort det med Edit eller Write, alltså när antalet testdefinitioner i en testfil minskar
3. tar bort eller flyttar en testfil med ett skalkommando (`rm`, `del`, `Remove-Item`, `mv`, `Move-Item`, `git rm`, `git mv` och liknande)

Ändringar som behåller eller ökar antalet tester ska fortfarande tillåtas, eftersom agenten får föreslå ändringar i tester. Det gäller till exempel nya tester, nya värden i påståenden, nya testnamn och borttagning av en befintlig `.skip`.

Ingår inte:
- **Att upptäcka försvagade påståenden,** till exempel `toBe(200)` → `toBeDefined()`. Det lämnas till `granskare` (öppen fråga 1).
- **Att täcka skript, `sed -i`, omdirigering (`> tests/x.test.ts`) eller blockkommentarer** (`/* … */`). De dokumenteras som kända luckor, liksom de låga fynden från granskningen av steg 2:
  - `cp`, `Copy-Item`, `Clear-Content` och `truncate`
  - `-Path:` med kolon
  - `git checkout`, `restore` och `stash`
  - subshell, `cmd /c` och `ForEach-Object`
  - falskt positiva efter prefix
  - meddelandet "Spärren för huvudsessionen"

  Från granskningen av steg 2b kommer också följande, som dokumenteras men inte rättas:
  - M1: globmönster som `*.test.*` och `test_*` i `find -name` och `rm`
  - M2: `xargs -I{}`
  - `find -exec git rm`
  - `rimraf`, `shred` och `trash`
  - PowerShell-reglerna för `git restore` och `git stash` saknas under ask
  - `pwsh -Command` och `wsl rm`
  - falskt positiva:
    - commit-meddelanden via heredoc som nämner en testfil och ett kommando som tar bort eller flyttar (använd `git commit -F <fil>`)
    - flaggvärden (`-name`, `--exclude`) efter `$(`, en backtick eller `(`, som prövas som filnamn för hemliga filer, till exempel `find "$(pwd)" -name "*.key"`

  Se `main-guard.js` och `test-guard.js`.
- **En ny hookregistrering i `settings.json`.** Kontrollen läggs in i den befintliga `main-guard`.
- **Ändringar i agenterna, `agent-guard.js` och `check-code.js`.**
- Commit och push.

## Research

### Befintlig kod (verifierad)

- **`main-guard.js` gäller också subagenterna,** eftersom den registreras i `settings.json` som PreToolUse med matchern `Bash|PowerShell|Read|Grep|Glob|Write|Edit|NotebookEdit` (`.claude/settings.json`, PreToolUse). Det står i kommentaren på `.claude/hooks/main-guard.js:2-3`, och Session 12 bekräftar det: "`main-guard` för en agent som skriver kod". En kontroll i `main-guard` täcker alltså både huvudsessionen och `utvecklare`.
- **`main-guard` är en spärrlista** (`main-guard.js:7-13`). Den återanvänder `parse` och `mentionsSecret` från `agent-guard.js` (`main-guard.js:24`). Beslutet fattas i `decide` (`main-guard.js:201`), där Write och Edit i dag bara prövas mot hemliga filer (`checkFile`). Skalkommandon delas upp i delkommandon och prövas i `segmentViolation` (`main-guard.js:143`). Där stoppas borttagning bara när den är rekursiv (`REMOVE_COMMANDS` på `main-guard.js:129` och `isRecursiveArg`).
- **Behörigheterna:**
  - `Edit(tests/**)` står under allow (`settings.json:113`).
  - `Bash(rm *)`, `Bash(mv *)`, `Bash(git rm *)` och `PowerShell(Move-Item *)` står under ask (`settings.json:141`, `:142`, `:128` och `:154`).
  - En borttagen testfil kräver alltså bara ett godkännande, och en Edit som lägger till `.skip` går igenom utan fråga.
  - En PreToolUse-hook med exit 2 blockerar även anrop som en allow-regel tillåter. Det är visat i riktiga körningar av `main-guard` (Session 11).
- **`agent-guard.js` i läget `dev` (`utvecklare`)** blockerar redan `rm`, `mv`, `del`, `Remove-Item` och `Move-Item` (`REMOVE` på `agent-guard.js:268`). Den blockerar också `git rm` och `git mv` (`GIT_BLOCKED` på `agent-guard.js:222`), `sed -i` och indirekt körning. Däremot tillåter `checkWrite` (`agent-guard.js:383`) varje Edit och Write i `tests/`. För subagenterna är luckan alltså Edit och Write. För huvudsessionen gäller både Edit, Write och skalkommandon.
- **`jest.config.js` och `pytest.ini`** styr vilka tester som körs (`testMatch`, `testpaths` och `python_files`). Ingen behörighetsregel täcker dem, så de kan ändras utan fråga. `package.json`, där `test`-skriptet finns, står redan under ask (`settings.json:157`).
- **Testmönstret i riggen:** varje hook har en egen testfil med `node:test` (till exempel `main-guard.test.js`, med 19 `test(`-block). Mutationstester har körts med ett skript i scratchpad. Senast upptäcktes 29 av 29 mutationer (Session 11, avsnittet "Mutationer").

### Dokumentation

- `docs/standard.md:32-35` har avsnittet om tester.
- `docs/adr/` är tom. Det här blir projektets första ADR.

### Upptäckt under researchen

- **Verifierat:** inget i riggen stoppar att tester tas bort eller stängs av (se ovan). Avsnitt 7 i `requirements.md` anger R07 som "Behöver kontrolleras".
- **Antagande, inte verifierat:** att kommandon som körs med `!` i prompten inte går genom PreToolUse-hooks. Det har betydelse för hur användaren själv kan ta bort ett test när det behövs (öppen fråga 4).
- **Själv-blockering:** när kontrollen är aktiv skulle den stoppa Edit av sina egna testfiler, eftersom de innehåller exempel som `it.skip(`. Testdata måste därför byggas med sammanslagna strängar, till exempel `"it" + ".skip("` (se Risker).

## Acceptanskriterier

1. **Givet** en testfil, **när** en Edit lägger till `.skip(`, `.only(`, `xit(`, `xdescribe(`, `xtest(`, `fit(` eller `fdescribe(`, **så** blockeras anropet (exit 2), och orsaken nämner testskyddet.
2. **Givet** en Python-testfil, **när** en Edit lägger till `@pytest.mark.skip`, `@pytest.mark.skipif`, `@pytest.mark.xfail`, `pytest.skip(` eller `@unittest.skip`, **så** blockeras anropet.
3. **Givet** en testfil med N testdefinitioner (rader som börjar med `it(`, `test(`, `it.each`/`test.each` eller `def test_`), **när** en Edit ger färre definitioner i `new_string` än i `old_string`, **så** blockeras anropet. Det gäller också när en definition kommenteras bort med `//` eller `#`.
4. **Givet** en befintlig testfil, **när** Write skriver innehåll med färre testdefinitioner eller fler avstängningar än filen har på disk, **så** blockeras anropet.
5. **Givet** en testfil, **när** en Edit eller Write lägger till tester, ändrar värden i påståenden, byter namn på ett test eller tar bort en befintlig `.skip`, **så** tillåts anropet. Write av en ny testfil utan avstängningar tillåts också.
6. **Givet** en fil som inte är en testfil (till exempel `src/app.ts` eller `docs/x.md`), **när** en Edit innehåller `.skip(` eller tar bort rader som börjar med `test(`, **så** tillåts anropet.
7. **Givet** Bash eller PowerShell, **när** `rm`, `unlink`, `del`, `erase`, `ri`, `Remove-Item`, `mv`, `move`, `Move-Item`, `mi`, `ren`, `Rename-Item`, `git rm` eller `git mv` får ett argument som är en testfil eller ligger i en katalog som heter `tests`, **så** blockeras anropet. Det gäller också i sammansatta kommandon som `cd x && rm a.test.ts`.
8. **Givet** Bash eller PowerShell, **när** ett kommando bara läser eller kör tester (`ls tests`, `cat tests/health.test.ts`, `npx jest tests/health.test.ts`, `git diff -- tests` och `git log -- tests`), eller tar bort en fil som inte är en testfil (`rm tmp.txt`), **så** blockerar testskyddet inte anropet. `rm tmp.txt` går fortfarande till ask-regeln.
9. **Som testfil räknas:** en sökväg med katalogen `tests`, eller ett filnamn som matchar `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py` eller `conftest.py`. Riggens egna tester i `.claude/**/*.test.js` omfattas alltså (öppen fråga 3).
10. **Givet** att kontrollen är aktiv, **när** huvudsessionen och sedan `utvecklare` i en riktig körning försöker lägga till `.skip` i `tests/health.test.ts`, ta bort ett test ur filen och ta bort filen med `rm`, **så** blockeras alla tre försöken med ett meddelande från `main-guard`, och `tests/health.test.ts` är oförändrad (md5 före och efter).
11. **Givet** de befintliga riggtesterna, **när** kontrollen är inlagd, **så** är alla 155 tidigare tester fortfarande godkända och varje mutation i testskyddet upptäcks.
12. *(Steg 3, kräver separat godkännande.)* **Givet** `settings.json`, **när** en Edit av `jest.config.js` eller `pytest.ini` görs, **så** frågar Claude Code först.

## Lösning

**Vald lösning:** en ny modul, `.claude/hooks/test-guard.js`, med rena funktioner. `main-guard.js` anropar den från `decide`:

- **Edit:** om filen är en testfil jämförs hela filen före och efter ändringen. Anropet blockeras om antalet avstängningar ökar eller antalet testdefinitioner minskar.
  - Den råa filen prövas först och därefter med CRLF omgjort till LF.
  - Utdragen (`old_string` mot `new_string`) jämförs bara om filen inte kan läsas eller `old_string` saknas.
  - Ändrat i steg 1b och 1c och i början av steg 2.
- **Write:** om filen är en testfil och finns på disk jämförs nuvarande innehåll med `content` enligt samma regler. Om filen inte finns prövas bara avstängningar.
- **Bash och PowerShell:** i `segmentViolation` prövas ett nytt villkor. Ett kommando som tar bort eller flyttar filer blockeras om något argument som inte är en flagga pekar på en testfil, en katalog som heter `tests` eller ett mönster i en sådan katalog.
  - Villkoret gäller bara på en kommandoposition (beslut i steg 2), så att till exempel `grep -rn rm tests` tillåts. En kommandoposition är det första ordet, eller vilket ord som helst när delkommandot börjar med ett prefix (`sudo`, `timeout`, `xargs`), ett nyckelord (`if`, `then`, `!`, `{`) eller en tilldelning (`FOO=1`).
  - Substitution (`$(…)` och backtick) blir ett eget delkommando.
  - `find -delete`/`-exec rm` med en testsökväg, och `rm`/`Remove-Item`/`git rm` utan sökväg efter ett delkommando som nämner en testfil (`… | xargs rm`), blockeras också.
  - Steg 2b lades till efter granskningens medelfynd.
  - `rm tests/*` blockeras redan av regeln för hemliga filer, eftersom ett ord som bara är `*` kan matcha `.env`.
  - Kända begränsningar står i kommentaren överst i `main-guard.js`.
- **Testdefinitioner räknas per rad** (`^[ \t]*(?:it|test)(?:\.each)?\s*[(\x60]` och `^[ \t]*(?:async[ \t]+)?def[ \t]+test\w*[ \t]*\(`, som stämmer med pytests standard `python_functions = test*`), så att en bortkommenterad definition inte räknas. Mönstren är uppdaterade efter koden i steg 1c.
- Jämförelsen av hela filen vid Edit beskrivs ovan, under **Edit**.

Ingen ny registrering behövs i `settings.json`. Riggen har fortfarande fem hookskript, eftersom `test-guard.js` är en modul och inget eget skript.

**Varför:** det är den minsta ändringen som täcker både huvudsessionen och subagenterna, eftersom `main-guard` redan körs för båda. Den återanvänder dessutom `parse`, mönstret för testerna och felmeddelandet. Att lägga logiken i en egen modul gör att reglerna kan testas och mutationstestas för sig. Det ger också ett tydligt bevis för R07 i ADR:en.

**Alternativ som valts bort (motiveras i ADR:en nedan):**
- **A. Bara behörighetsregler,** till exempel `deny: Edit(tests/**)`. De ser inte innehållet och skulle stoppa alla ändringar av tester, också de som agenten får föreslå.
- **B. En ny, separat PreToolUse-hook.** Den kräver en egen registrering, egen tolkning av kommandon och fler processer per anrop, men gör ingenting som modulen i `main-guard` inte gör.
- **C. En Stop-hook som jämför antalet tester med `HEAD`,** via `git diff` eller `jest --listTests`. Den fångar alla vägar, också skript och `sed`, men först i efterhand när ändringen redan är gjord. Den är också dyrare. Den passar som komplement senare.
- **D. En Git-hook (pre-commit) eller en kontroll i CI.** Den är bra för ett team (R20), men kräver ett nytt beroende (`husky`) eller ett skript i `.git/hooks`, som inte versionshanteras. Den stoppar först vid commit.
- **E. Skrivskydd på filsystemet** (`attrib +r`). Det stoppar också tillåtna ändringar, och agenten kan ta bort skyddet med ett kommando.

## Förslag till ADR (sparas som `docs/adr/0001-testskydd-i-main-guard.md` i steg 4)

```markdown
# ADR 0001: Skydd mot borttagna och avstängda tester i main-guard

**Status:** Föreslagen (blir Accepterad när steg 1–2 är verifierade)
**Datum:** 2026-11-16
**Krav:** R07 (docs/examination/requirements.md:159), CLAUDE.md:83, docs/standard.md:35

## Problem
Agenten får ändra tester (Edit(tests/**) är tillåtet) men inte ta bort eller stänga av dem.
Inget i riggen stoppade det: en Edit som lade till .skip gick igenom utan fråga, och rm av
en testfil krävde bara ett godkännande.

## Beslut
En modul, .claude/hooks/test-guard.js, anropas från den befintliga PreToolUse-hooken
main-guard.js, som körs för både huvudsessionen och subagenterna. Den blockerar (exit 2)
Edit och Write som ökar antalet avstängningar eller minskar antalet testdefinitioner i en
testfil, och skalkommandon som tar bort eller flyttar testfiler.

## Alternativ
A behörighetsregler, B separat hook, C Stop-hook mot HEAD, D pre-commit eller CI,
E skrivskydd. Se docs/plans/04-testskydd.md, "Lösning".

## Stöd för beslutet
Antal tester och mutationer i test-guard.test.js och main-guard.test.js, och en riggad
körning där huvudsessionen och utvecklare blockerades (sessions/session-13-…). Fylls i
med faktiska mätvärden efter Verify.

## Konsekvenser och kvarstående risker
- Mönsterbaserad och ingen sandlåda: skript, sed -i i huvudsessionen, omdirigering,
  blockkommentarer och försvagade påståenden fångas inte. Granskaren och C/D täcker det.
- Falskt positiva: att flytta ett test mellan filer stoppas i första steget. Användaren
  gör det själv.
- Om node inte startar blockeras ingenting (samma begränsning som main-guard).
```

## Berörda filer

| Fil | Ändring | Varför |
|---|---|---|
| `.claude/hooks/test-guard.js` | ny | Regler för testfiler, avstängningar, testdefinitioner och skalkommandon |
| `.claude/hooks/test-guard.test.js` | ny | Enhetstester för modulen (kriterierna 1–9) |
| `.claude/hooks/main-guard.js` | ändrad | Anropar `test-guard` från `decide` och `segmentViolation`, och uppdaterad kommentar |
| `.claude/hooks/main-guard.test.js` | ändrad | Tester av kopplingen via `decide` och stdin (kriterierna 1, 3, 4, 7 och 8 i hookens riktiga körväg) |
| `.claude/settings.json` | ändrad i steg 3 | `Edit(jest.config.js)` och `Edit(pytest.ini)` under ask |
| `docs/adr/0001-testskydd-i-main-guard.md` | ny i steg 4 | ADR:en |
| `sessions/session-13-2026-11-16.md`, `PLAN.md` | ny och ändrad | Logg, mätvärden och status |
| `.claude/hooks/agent-guard.js`, `.claude/agents/*`, `tests/health.test.ts` | bara lästa | `tests/health.test.ts` används som mål i den riktiga körningen men ändras inte |

## Kräver separat godkännande

- **Ändringar i `.claude/hooks/`** (steg 1 och 2): `Edit(.claude/**)` står under ask. Arbetet görs i huvudsessionen, eftersom `utvecklare` inte får ändra `.claude/hooks/` (`agent-guard.js:377`).
- **Säkerhetsinställningar:** steg 3 lägger till ask-regler i `.claude/settings.json`.
- Inget publikt API-kontrakt, inget databasschema, inga beroenden och ingen borttagning av filer berörs.

## Testplan

Alla tester skrivs först och körs underkända av rätt orsak (red) innan koden skrivs. Testdata med avstängningar byggs med sammanslagna strängar, så att filen inte blockerar sig själv när kontrollen blir aktiv.

| Kriterium | Test som skrivs först | Fil | Kommando |
|---|---|---|---|
| 1 | Edit av `tests/a.test.ts` med var och en av de sju JS-avstängningarna blockeras | `test-guard.test.js` | `node --test .claude/hooks/test-guard.test.js` |
| 2 | Edit av `tests/test_price.py` med var och en av de fem pytest-avstängningarna blockeras | `test-guard.test.js` | samma |
| 3 | Färre `test(`/`it(`/`def test_` i `new_string` blockeras, `// test(` och `# def test_` räknas som borttagna | `test-guard.test.js` | samma |
| 4 | Write mot en tillfällig testfil på disk (i `os.tmpdir()`, städas i `after`) med färre tester eller fler avstängningar blockeras | `test-guard.test.js` | samma |
| 5 | Tillåtna ändringar: nytt test, ändrat värde, nytt namn, borttagen `.skip` och ny fil | `test-guard.test.js` | samma |
| 6 | `src/app.ts` och `docs/x.md` med `.skip(` tillåts | `test-guard.test.js` | samma |
| 7 | De 14 kommandoformerna mot `tests/x.test.ts`, `tests`, `tests/*`, `a.spec.js` och `test_x.py` blockeras via `decide` i Bash och PowerShell | `main-guard.test.js` | `node --test .claude/hooks/main-guard.test.js` |
| 8 | Läsande kommandon och `rm tmp.txt` tillåts av `decide` | `main-guard.test.js` | samma |
| 9 | Sökvägsmatchningen för testfiler, med `\` och `/` och med versaler och gemener | `test-guard.test.js` | `node --test .claude/hooks/test-guard.test.js` |
| 1, 3, 4, 7 | Ett fall per typ via stdin till `main-guard.js` ger exit 2 och meddelandet på stderr | `main-guard.test.js` | samma |
| 10 | Riktig körning: tre försök i huvudsessionen och tre i `utvecklare`, med md5 före och efter | sessionsloggen | manuellt, se steg 2 |
| 11 | Alla riggtester och mutationerna | alla | `node --test .claude/*.test.js .claude/*/*.test.js` och ett mutationsskript i scratchpad |
| 12 | Riktig körning: Edit av `jest.config.js` ger en fråga, som nekas | sessionsloggen | manuellt, se steg 3 |

**Planerade mutationer** (en i taget, och varje mutation ska få minst ett test att misslyckas):
1. En avstängning i JS i taget tas bort ur mönstret (`.skip`, `.only`, `x…` och `f…`).
2. Mönstren för pytest tas bort.
3. Regeln om färre testdefinitioner stängs av.
4. Radankaret `^` tas bort, så att bortkommenterade tester räknas.
5. Write läser inte filen på disk.
6. Katalogen `tests` tas bort från matchningen av testfiler.
7. `*.test.*` och `test_*.py` tas bort från matchningen av testfiler.
8. `mv` och `Move-Item` tas bort ur kommandona som flyttar filer.
9. `git rm` och `git mv` prövas inte.
10. Anropet från `decide` till `test-guard` för Edit och Write tas bort.

Kodkontroller: `npm run format:check`, som omfattar `.claude/**/*.js` (`package.json:15`). `lint` och `typecheck` omfattar inte `.claude/`, men körs ändå för att visa att `src/` och `tests/` är opåverkade.

## Risker

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|---|---|---|---|
| Kontrollen blockerar sina egna testfiler när den blir aktiv | Hög | Build fastnar mitt i steg 2 | Testdata byggs med sammanslagna strängar. Kopplingen i `main-guard` görs sist i steg 2, efter att testerna är skrivna. |
| Falskt positivt: en tillåten omstrukturering (till exempel att flytta ett test till en annan fil eller slå ihop två tester) blockeras | Medel | Användaren får göra ändringen själv | Medvetet val, dokumenteras i ADR:en. Meddelandet säger att användaren kan göra ändringen. |
| Falskt negativt: blockkommentarer, `sed -i` och omdirigering i huvudsessionen, skript och försvagade påståenden | Medel | Ett test kan stängas av ändå | Dokumenteras som kända luckor. För `utvecklare` stoppar `agent-guard` redan `sed -i`, skript och borttagning. `granskare` granskar ändringar i tester. Alternativ C och D kan läggas till senare. |
| Fel i `test-guard` gör att `main-guard` kastar fel | Låg | Allt blockeras ("internt fel", `main-guard.js:245`) | Tester via stdin. Risken går åt det säkra hållet. |
| Läsningen av filen på disk vid Write misslyckas | Låg | Kontrollen behandlar filen som ny | Testfall för fil som saknas. Avstängningar prövas ändå. |
| Kontrollen gör `main-guard` långsammare | Låg | Fördröjning per anrop | Det är bara mönster och en filläsning vid Write av testfiler. Tiden mäts i den riktiga körningen. |
| Ändringen av `main-guard` försvagar ett befintligt skydd | Låg | En regression i säkerheten | Alla 155 befintliga tester körs. De 29 befintliga mutationerna körs om, inte bara de nya. |

## Uppdelning i steg

1. **Steg 1: `test-guard.js` med TDD** (kriterierna 1–6 och 9). Modulen och dess testfil byggs i huvudsessionen men kopplas inte in än, så att kontrollen inte är aktiv. Sedan körs mutationerna 1–7 och därefter Review med `granskare`. Stopp.
2. **Steg 2: koppling i `main-guard`** (kriterierna 7, 8, 10 och 11). Först tester i `main-guard.test.js` (red), sedan kopplingen (green). Därefter Verify med `verifierare`: alla riggtester, alla mutationer (29 gamla och cirka 10 nya) och `format:check`. Sist den riktiga körningen i huvudsessionen och med `utvecklare`. Stopp.
3. **Steg 3, frivilligt och med separat godkännande:** ask-regler för `jest.config.js` och `pytest.ini` i `settings.json` (kriterium 12), med en riktig körning. Stopp.
4. **Steg 4: dokumentation.** ADR:en i `docs/adr/` med faktiska mätvärden, Session 13 med tokens, tid och antal fel som kontrollerna fångade, och `PLAN.md`. Därefter ett förslag till commit. Stopp.

Uppskattning, inte mätt: steg 1–2 tar cirka 1,5–2 timmar och steg 3–4 cirka 30 minuter.

## Öppna frågor och beslut

1. **Försvagade påståenden:** ska kontrollen också blockera när antalet `expect(`/`assert` minskar? **Rekommendation: nej.** Det ger många falskt positiva vid vanliga omstruktureringar, och `CLAUDE.md:83` täcks då av `granskare` och dokumenteras som en lucka.
2. **Steg 3:** ska `jest.config.js` och `pytest.ini` läggas under ask? Det är en säkerhetsinställning, så det kräver ditt godkännande. **Rekommendation: ja.** Det är två rader, och det stänger vägen att stänga av tester via konfigurationen.
3. **Riggens egna tester** (`.claude/**/*.test.js`): ska de omfattas? **Rekommendation: ja.** Det är tester som alla andra, och `utvecklare` får ändå inte röra dem.
4. **Blockera eller fråga** när en testfil tas bort: R07 säger "stoppar", så blockering (exit 2) föreslås. Då måste du själv ta bort ett test när det verkligen behövs, till exempel i en editor. Att `!`-kommandon går förbi hooks är inte verifierat. Är det acceptabelt?
5. **Mutationsskriptet:** ska det sparas i repot (till exempel `.claude/hooks/mutate.js`) som bevis till examinationen, eller ligga kvar i scratchpad som tidigare? **Rekommendation: scratchpad som tidigare, och resultatet i sessionsloggen.** Det håller riggen mindre. Säg till om du vill ha det i repot.
6. **Numrering av ADR:er:** ska formatet vara `docs/adr/NNNN-kort-namn.md` med status, problem, beslut, alternativ, stöd och konsekvenser, alltså samma rubriker som VG-frågorna i `requirements.md` avsnitt 2? **Rekommendation: ja.**
