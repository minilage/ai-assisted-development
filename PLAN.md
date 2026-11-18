
# Projektplan – En rigg för en kodbas

## Projektbeskrivning

I det här projektet ska jag bygga en rigg för en AI-kodagent och använda den för att arbeta med en befintlig kodbas.

Jag utgår från kursens övningsprojekt, ett REST-API för kunder och beställningar i TypeScript. Projektet innehåller även en äldre modul för prisberäkning som behöver moderniseras.

Tanken är att skapa ett gemensamt arbetssätt där AI-agenten får tydliga instruktioner och där kodändringar kan kontrolleras automatiskt. Arbetet ska också dokumenteras så att det går att följa vad som har gjorts, vilka beslut som tagits och vad som återstår.

## Vad som ska ingå

Riggen ska innehålla:

- [x] Projektinstruktioner, projektplan och promptmall.
- [x] Minst tre skills eller kommandon, varav ett för TDD.
- [x] Minst fyra subagenter med tydliga uppgifter.
- [x] Minst fem hooks, inklusive hantering av sessionsminne.
- [x] Behörigheter med allow, ask och deny.
- [x] Automatiska kontroller för kodstandard, formatering och typkontroll.
- [x] Sessionsloggar och versionshantering i Git. Sessionsloggar 01–15 finns i `sessions/`. Arbetet ligger i Git med separata commits och tre sammanslagna pull requests (PR #1–#3, se "Nästa arbetsmoment" och "Aktuell status").
- [x] Skydd av tester (R07): `test-guard.js` i `main-guard.js`, ask för testkonfigurationen och ADR 0001. Verifierat i Session 13. Committat och pushat i `e3dbda2`.

## Arbeten som riggen ska användas till

När riggen är på plats ska jag använda den för följande uppgifter från kursprojektet:

- [x] **Ny funktion (R09):** user story 3, sidindelning och statusfilter för `GET /customers/me/orders`, är byggd, granskad och verifierad (Session 14). Sammanslagen i `main` via PR #1 (merge-commit `fb8888d`, 18 november 2026).
- [ ] **Kodgranskning (R10):** riggen har granskat R09:s pull request med `granskare` och `granska-standard` (`docs/examination/r10-granskning-pr-r09.md`). Testgren med planterade fel och blind granskning är gjorda (Session 17, `docs/examination/r10-testgren/`), och körinstruktionen för en okänd PR finns (`docs/examination/kor-granskning-okand-pr.md`, delvis provad). Kvar: en riktig, oförberedd PR från någon annan, Review och Verify (se punkt 5 under "Nästa arbetsmoment").
- [x] **Modernisering (R11):** den äldre Python-modulen är analyserad, har 13 karakteriseringstester och tre refaktoreringssteg, och en migreringsplan finns. Minimal omfattning, se punkt 6 under "Nästa arbetsmoment". Sammanslagen i `main` via PR #2 (merge-commit `d25e11b`, 18 november 2026).

## Arbetssätt

Jag kommer att dela upp arbetet i mindre uppgifter och arbeta med en uppgift i taget.

Efter varje steg ska resultatet kontrolleras och dokumenteras. Jag vill kunna se vilka filer som ändrats, vilka tester som körts och om något inte fungerade.

Planen uppdateras under arbetets gång och används tillsammans med sessionsloggarna för att hålla reda på vad som är klart och vad som behöver göras härnäst.

## Aktuell status

**Senast uppdaterad:** 18 november 2026 (efter R10 steg 2: testgren med planterade fel, blind granskning och körinstruktion för en okänd PR, Session 17)

### Klart

- Projektplan skapad.
- `CLAUDE.md` skapad och använd vid ett första avgränsat arbetsmoment.
- `docs/prompt-template.md` skapad och granskad.
- Sessionsloggar för arbetet hittills skapade.
- ESLint och TypeScript kontrollerade utan fel vid den första inventeringen.
- Behörigheter konfigurerade i `.claude/settings.json` och testade (se Session 04).
- Mätning per arbetsmoment: statusrad med ögonblicksbilder, hooks vid SessionEnd och SessionStart och `metrics/arbetsmoment.csv`. Testad med 37 automatiska tester (21 för statusraden och 16 för hooken) och verifierad med ett riktigt `/clear` (se Session 06).
- Metrics-hooken lämnar kvotfälten tomma i stället för 0 när mätningen började för sent. Rad 1 i `metrics/arbetsmoment.csv` är rättad (se Session 05).
- Mätningen, Session 05 och Session 06 är granskade och committade (`9570363`). Testerna för statusraden och städningen av testkataloger är committade (`ebced5c`). De fyra skillsen och Session 07 är committade (`cd1afe6`). Session 08 med subagenter och `agent-guard` är committad (`6b6ae2d`). Commitarna till och med `6b6ae2d` är pushade till `origin/main`.
- Fyra subagenter i `.claude/agents/`, en per fas (se Session 08):

  | Agent | Fas | Skill | `agent-guard` |
  |---|---|---|---|
  | `planerare` | Research och Plan | `planera` | `plans-write` |
  | `utvecklare` | Build | `tdd` | `dev` |
  | `granskare` | Review | `granska-standard` | `read` |
  | `verifierare` | Verify | – | `checks` |

  - Varje agent har en exakt lista över `tools`. Ingen agent har `Agent`, `Skill` eller `memory`.
  - Alla fyra har strukturtester i `.claude/agents/agents.test.js` (10 tester) och är testade i riktiga körningar.
  - `granskare` granskade `src/pricing/legacyPrice.ts` och `src/db.ts`. `verifierare` körde riggens tester och kodkontrollerna. `planerare` skrev `docs/plans/02-health-test.md`.
- PreToolUse-hooken `.claude/hooks/agent-guard.js` begränsar agenterna:
  - Den har 30 automatiska tester och 11 mutationer, som alla upptäcktes.
  - Den har blockerat otillåtna åtgärder i riktiga agentkörningar i alla fyra lägena, med Bash, Write och Glob.
  - Enligt beslutet räknas den som den tredje hooken i riggen, efter SessionStart och SessionEnd.

### Kända problem

- **Beslut 16 november 2026:** filer i `src/` och `tests/` ändras inte förrän riggen testas på riktigt. Lärarnas avsiktliga övningsfel ska finnas kvar till dess, till exempel SQL-injektion, lösenord som standardvärden och felfall utan tester. (R09 och R11 har därefter ändrat `src/` och `tests/` med särskilt godkännande för varje moment. Övningsfelen är fortfarande inte rättade.)
- **Kända risker efter R09 och R11 (inget är rättat, och inget ska anses löst):**
  - **F3 (hög, bekräftat med körning 18 november 2026):** `X-Customer-Id: 99999999999` passerar `requireCustomer` (`src/auth.ts:9-10`, ingen int4-gräns) och ger ett databasfel i en `async`-handler utan felhanterare. Node 24 avslutar då hela processen. Felet fanns före R09, men gäller också den nya endpointen. Se `docs/examination/r10-granskning-pr-r09.md`.
  - **P1 (hög):** SQL i `src/legacy/price_calc.py` och `jobs/nightly_report.py:8` byggs med `%`-formatering (injektion). Bara `order_id` är provat (`tests/legacy/test_price_calc.py`, test 13). Se `docs/legacy/price_calc.md`.
  - **Jest-testet för priset (känt fel):** `tests/orders.test.ts:68` (`GET /orders/:id/price`) ger 404 i stället för 200. Orsaken är verifierad 18 november 2026: `python3` på `PATH` är Windows Store-genvägen (`WindowsApps\python3`) och startar ingen Python, så `execFile("python3", …)` i `src/pricing/legacyPrice.ts` misslyckas och alla fel blir 404 (P8). `psycopg` finns bara i den lokala venv:en `.venv`. Inget är ändrat.
  - **P2 och P3 (medel):** den äldre modulen kapar i stället för att avrunda, och rabattens giltighetstid kontrolleras inte. Ekonomi har stämt av mot avrundningen, så ändringar kräver ett affärsbeslut. **P6 (medel):** anslutning vid import. Se `docs/legacy/price_calc.md`.
  - **Övriga R10-fynd:** F4 (inget index på `orders.customer_id`), F5 (`total` och `items` hämtas i två frågor), F6 och F7 (godtagna som låga) och F8–F10 är öppna (se granskningsdokumentet).

- Löst i Session 10: `npm run format:check` underkände de 15 `.ts`-filerna bara för radslut (CRLF i arbetskopian). `.prettierrc.json` har nu `"endOfLine": "auto"`, och `format:check` godkänns.
- Jest-testet för `GET /orders/1042/price` misslyckas fortfarande (404 i stället för 200, se "Kända risker" ovan). En plan med troliga orsaker finns i `docs/plans/01-pris-endpoint-404.md`. Efter 18 november 2026 är orsaken till 404 verifierad för `python3`, och planen väntar fortfarande på godkännande.
- Skills: alla fyra är skapade (`tdd`, `granska-standard`, `karakterisera` och `planera`) och har strukturtester i `.claude/skills/skills.test.js` (se Session 07). `granska-standard` och `planera` är också testade i praktiken. `tdd` och `karakterisera` testas vid den första riktiga uppgiften.
- `pytest` 8.3.3 och `psycopg` 3.2.10 är installerade i den lokala venv:en `.venv` (R11, Session 15). `psycopg-binary` 3.2.3 saknade version för Python 3.14, så `requirements.txt` ändrades till `psycopg[binary]==3.2.10` med särskilt godkännande. Python-testerna körs med `.venv/Scripts/python.exe -m pytest tests/legacy`. `npm run test:legacy` anropar `pytest` utan sökväg och fungerar inte utan att venv:en ligger på `PATH`. `verifierare` kan inte köra pytest i venv:en, eftersom `agent-guard` kräver exakt `python -m pytest` eller `pytest`.
- Granskningen av `src/` med `granska-standard` hittade SQL-injektion i `src/legacy/price_calc.py` (rad 42 i originalet), anslutningssträngar med lösenord som standardvärde och felfall som saknar tester (se Session 07). Inget är rättat. SQL-injektionen är nu låst av ett karakteriseringstest (P1 ovan).
- Hooks: alla fem hookskript finns och är registrerade: `record-metrics.js`, `agent-guard.js`, `session-memory.js`, `check-code.js` och `main-guard.js` (Session 11). Räknat som funktioner är de 8.
  - `main-guard` (PreToolUse för huvudsessionen) är aktiv och verifierad i en riktig körning, och den är committad och pushad i `7564f3c`.
  - Granskningen gav 3 fynd med allvarlighetsgrad medel. De är rättade med TDD och verifierade (Session 11).
  - Granskningen gav också 7 fynd med allvarlighetsgrad låg som inte är rättade, till exempel `-Path:.env` i PowerShell, förkortade git-flaggor och `--namespace`. De är dokumenterade som kända luckor i Session 11.
  - Kraven på rad 19 (hooks) och 21 (automatiska kontroller) är avbockade efter beslut den 16 november 2026.
- Begränsningar för subagenterna och `agent-guard` (se Session 08):
  - Spärren bygger på mönster och är ingen sandlåda. Testkod och skript som körs kan göra vad som helst, och variabler tolkas inte.
  - Hooken blockerar bara vid exit 2. Om `node` inte startar släpps anropet igenom.
  - Hooks i frontmatter körs bara i en betrodd arbetsyta.
  - Agenternas `permissionMode` ignoreras i auto mode.
  - Claude Code kontrollerar Edit-anrop före hooken, och deny-reglerna gäller också före hooken. Därför är Edit-skyddet för riggens filer och spärren mot `.env` bara prövade i de automatiska testerna. Skyddet av riggens filer är visat i praktiken med Write.
  - Nya agenter kräver att Claude Code startas om.
  - Inte testat: att Claude Code självt väljer rätt agent, att agenter startar med `@agent-<namn>`, och en riktig Build med `utvecklare`.
  - `karakterisera` kan inte läsas in i en agent och körs från huvudsessionen.
  - `utvecklare` får inte ändra `.claude/agents/`, `agent-guard` eller inställningarna. Arbete med riggen görs därför i huvudsessionen.
- `docs/plans/02-health-test.md` (test för `GET /health`) är genomförd som det första riktiga testet av riggen (Session 12):
  - `utvecklare` skapade `tests/health.test.ts` med 2 gröna tester, och ett underkänt läge visades per test.
  - `granskare` godkände utan fynd, och `verifierare` godkände alla kontroller.
  - Ingen annan fil i `src/` eller `tests/` är ändrad.
  - Committad och pushad i `b2647f9`.
- Mätningen har kända begränsningar: sessionsnamnet kan komma från samtalet och återupptagna sessioner är inte testade (se Session 06).
- Behörighetsreglerna kan kringgås med kommandon i annan form eller skript som läser filer själva. För subagenterna täcks det delvis av `agent-guard`. För huvudsessionen behövs fortfarande en PreToolUse-hook.

### Nästa arbetsmoment

**Överlämning 18 november 2026 (efter R10 steg 2, se `sessions/session-17-2026-11-18.md`):**
- **Läge:** `main` (`cbadff1`) har R09, R11 och två docs-PR:er (#1–#4). Pågående arbete ligger på `feature/r10-granskningsrigg` (`94fa24a`), pushad men **inte** sammanslagen och utan PR. Ocommittat: `docs/examination/r10-testgren/` (4 filer), `docs/examination/kor-granskning-okand-pr.md`, Session 17 och den här filen. Testgrenen `test/r10-planterade-fel` finns lokalt.
- **R10, nästa steg:** Review och Verify av dokumenten, och en provgranskning av en hämtad PR (tre-punkters-diff, att `granskare` läser `FETCH_HEAD`) enligt `docs/examination/kor-granskning-okand-pr.md`. En riktig, oförberedd PR är det som saknas.
- **Beslut som väntar:** (a) F1 och F14 (SQL-injektion via rabattkoden, hög, provad med körning) och F3 (en header stoppar API:t): egna moment som kräver godkännande. (b) Ska S7 gälla `auth.ts`? (c) Rätta F11–F13 i R11:s dokument? (d) PR för `feature/r10-granskningsrigg`. (e) Ska `main-guard.js` sluta ge falska larm på ett fristående `*` (säkerhetsinställning, kräver godkännande)? (f) Ska testgrenen `test/r10-planterade-fel` tas bort?
- **Kända fel kvar:** Jest `GET /orders/:id/price` (404, `python3` är Windows Store-genvägen), P1–P8, F3. Python-testerna körs med `.venv/Scripts/python.exe -m pytest tests/legacy`. Kör aldrig Jest och pytest samtidigt (delad `butik_test`).
- **Arbetssätt:** commit och push bara efter godkännande, med `git add <filer>`, och meddelanden via `git commit -F` från en fil.

**Äldre punkter:**

1. Hooks-momentet enligt `docs/plans/03-hooks.md` (godkänd). Steg 1, sessionsminne, är klart: byggt, testat och verifierat med `/clear` + `ready` och `/compact` (`.claude/hooks/session-memory.js`, se Session 09). Committat och pushat i `5e9832e`. Steg 2, Prettier för `.claude/`, är committat och pushat i `e0e8672`. Massformateringen är committad och pushad i `a7ed197`. Steg 3, kodkontroller (`.claude/hooks/check-code.js`), är byggt med TDD och registrerat i `settings.json`. Radsluten är lösta (`"endOfLine": "auto"`). PostToolUse och Stop är verifierade i riktiga körningar i samma session, utan omstart. Committat och pushat i `991bd26` (se Session 10).
   - Steg 4 (spärr för huvudsessionen, `main-guard.js`) är byggt med TDD, registrerat i `settings.json` och verifierat i en riktig körning, där alla provkommandon blockerades. Verify: 152 av 152 godkända. `RIG_PROTECTED` omfattar nu hela `.claude/hooks/` (se Session 11).
   - De tre fynden med allvarlighetsgrad medel från granskningen är rättade: 155 av 155 godkända och en ny riktig körning. Committat och pushat i `7564f3c`. Hooks-momentet (plan 03) är klart.
2. Plan 02 som den första riktiga Build-uppgiften för `utvecklare`, med `granskare` och `verifierare`: genomförd (Session 12). Committad och pushad i `b2647f9`.
3. R07, skydd av tester, enligt `docs/plans/04-testskydd.md` (godkänd 16 november 2026):
   - **Steg 1:** `.claude/hooks/test-guard.js` och testfilen är byggda med TDD. 13 av 13 godkända och 168 av 168 i hela riggsviten. 21 av 21 mutationer upptäckta. 0 blockeringar vid uppspelning av 20 historiska ändringar av testfiler.
   - **Review:** godkänd med anmärkningar (1 hög, 3 medel och 7 låg).
   - **Steg 1b:** fynden med hög och medel och tre låga är rättade med TDD. 17 av 17 godkända, 172 av 172 i riggsviten, 33 av 33 mutationer upptäckta och 0 blockeringar vid uppspelningen.
   - **Review av 1b:** godkänd med anmärkningar (0 hög, 1 medel och 6 låg).
   - **Steg 1c:** CRLF-normaliseringen, testerna för ersättaren och de kända luckorna, med avvägningen för villkorliga avstängningar, är dokumenterade. 20 av 20 godkända, 175 av 175 i riggsviten och 36 av 36 mutationer upptäckta. Vid uppspelningen gav historiken 0 falskt positiva, och i CRLF-filerna blockerades 16 av 16 bortkommenteringar.
   - **Review av 1c:** godkänd med anmärkningar (0 hög, 0 medel och 5 låg). Fynden är rättade i början av steg 2.
   - **Steg 2:** `test-guard` är inkopplad i `main-guard` (17 november 2026), och **testskyddet är aktivt**.
     - Tester: 25 av 25 i `main-guard` och 22 av 22 i `test-guard`, och riggsviten 183 av 183.
     - Mutationer: 41 av 41 för `main-guard` och 37 av 37 för `test-guard`.
     - Riktig körning: alla otillåtna försök blockerades i huvudsessionen och för `utvecklare`, och md5 för testfilerna är oförändrad.
     - Verify är godkänd.
     - Review: godkänd med anmärkningar (0 hög, 2 medel och 7 låg).
   - **Steg 2b:** medelfynden (pipelines, `find` och kommandopositioner) är rättade. De låga fynden är dokumenterade som kända begränsningar.
     - Review av 2b: underkänd (H1 var en regression i force-push/clean/rebase/reset och rekursiv borttagning med `$(…)`, och H2 gällde `rm $(…)`). Båda är rättade med regressionstester.
     - M1 (globmönster i `find -name`) och M2 (`xargs -I{}`) är dokumenterade och väntar på beslut.
   - **Steg 3:** `Edit(jest.config.js)` och `Edit(pytest.ini)` står under ask. Riktig körning: frågan visades och nekades.
   - **Steg 4:** `docs/adr/0001-testskydd-i-main-guard.md` finns.
   - **Läget nu:** 189 av 189 i riggsviten, 52 av 52 mutationer för `main-guard` och 37 av 37 för `test-guard`. Committat och pushat i `e3dbda2` (Session 13). M1, M2 och övriga kända begränsningar är dokumenterade, och användaren har godkänt att R07 avslutas med dem.
4. R09, sidindelning och statusfilter för `GET /customers/me/orders`, enligt `docs/plans/05-sidindelning-orders.md` (godkänd 17 november 2026, svarsform A och offset-paginering, ADR `docs/adr/0002-sidindelning-orders.md`):
   - **Build med TDD:** 24 röda tester av rätt skäl, därefter implementation, och regressionstester för `page=01` och upprepade parametrar.
   - **Verify:** 39 av 39 i `tests/customers.test.ts` och 49 av 50 i hela sviten vid den första Verify. Efter R10:s rättning av F1 är det 40 av 40 och 50 av 51 (se punkt 7). Det enda felet är det kända `GET /orders/:id/price`. `lint`, `typecheck` och `format:check` är godkända.
   - **Mutationer:** alla sex körda mutationer gav minst ett rött test.
   - **Review:** 0 hög, 0 medel och 3 låga fynd i vardera av två omgångar. Fynden är rättade eller dokumenterade.
   - **Brytande ändring:** svaret är nu ett objekt med `items`, och högst 20 beställningar returneras utan query (ADR 0002).
   - **Git:** feature-commits på `feature/r09-orders-pagination`, bland annat `798824e` (docs), `d133ea3` (test), `317a321` (feat), `240af7c` (ADR och `PLAN.md`), `17352a9` (F1) och `bb55e6d`. Full lista: `git log fb8888d^1..fb8888d^2`. Sammanslagen i `main` som **PR #1** (merge-commit `fb8888d`, 18 november 2026) med alla commits bevarade (ingen squash).
   - **Kvar:** ingen testad gräns för mycket stort `page`, duplicerad testdata och att `COUNT`-frågan inte är mutationstestad separat (Session 14).
5. R10, granskning av R09:s pull request (`docs/examination/r10-granskning-pr-r09.md`, Session 14):
   - **Gjort:** `granskare` med `granska-standard` granskade hela diffen (säkerhet, korrekthet, struktur, kodstandard, testtäckning). Verdikt: godkänd med anmärkningar, 12 fynd, varje fynd med fil och rad, orsak, rekommendation och vilken kontroll som kunde fånga det (automatiskt eller manuellt).
   - **Rättat:** F1 (test av elementformen, med mutationsdemonstration: 1 rött av 40 för tre mutationer) och F2 (commit-hänvisningar). F6 och F7 är godtagna som låga fynd.
   - **Bekräftat:** F3 (hög, säkerhet) provkördes i en isolerad process 18 november 2026. Det är en befintlig sårbarhet och är **inte rättad**.
   - **R10, steg 1 (plan godkänd 18 november 2026), `feature/r10-granskningsrigg`, commit `e6de311`:** `granska-standard` och `granskare` ger samma fyndtabell med kolumnerna Område, Status (Bekräftat eller Risk), Kontroll/hook och Automatiskt/Manuellt. Checklistan har U1–U9 utöver standarden och en `Kontroll:`-rad per regel, och en ny `kontroller.md` listar de kontroller som finns. Byggt med TDD (5 röda tester först), riggsviten 193 av 193 (189 före), mutationsprov 10 av 10 röda.
   - **R10, granskning av R11:s PR (`docs/examination/r10-granskning-pr-r11.md`, commit `aa93fd4`):** 23 fynd. **S3** (F1, F14, F3, F7) och **S12** (F2) är bekräftade. F1 (SQL-injektion via rabattkoden) och F14 (staplade satser) är provade mot testdatabasen med oskadliga satser. Bara F20 bedömdes som Automatiskt. Ingenting är rättat.
   - **R10, steg 2 och blind granskning (Session 17, `docs/examination/r10-testgren/`):** testgrenen `test/r10-planterade-fel` (lokal, ej pushad, slås aldrig ihop) fick sju tillämpliga planterade fel i `src/routes/refunds.ts`. `granskare` hittade alla sju utan ledtrådar, plus fem äkta fynd (17 fynd, Underkänd). Bara lint-felen (oanvänd variabel, explicit `any`) fångades av en befintlig kontroll: `check-code.js` och `npm run lint` (**bekräftat automatiskt fynd, körd**). De övriga fem (S3, behörighet, pengar, hemlighet, läckande fel) är Manuella. `.skip` blockerades av `test-guard` och skapades inte. Experimentet är bevarat som patch (`planterade-fel.patch`, provad på en ren kopia) och koden är återställd. Granskarens egen sammanräkning stämde inte med tabellen (se `granskning-blind.md`).
   - **Körinstruktion för en okänd PR:** `docs/examination/kor-granskning-okand-pr.md`. `git fetch origin pull/4/head` är provad (`FETCH_HEAD` blev `57c1adb`). Tre-punkters-diffen och att `granskare` läser `FETCH_HEAD` är inte provade.
   - **Rigg-fynd (hooks):** `main-guard.js` blockerade tre ofarliga anrop eftersom ett fristående `*` tolkas som en hemlig fil (`mentionsSecret("*")` är `true`). Ingen spärr kringgicks. Ingen rättning är godkänd.
   - **Kvar för R10:** en riktig, oförberedd PR från någon annan, Review och Verify av dokumenten. Kodstandard har nu bekräftade brott (S3, S12), men de ligger i kod som R11 inte skrev. Om S7 ska gälla `auth.ts` är ett öppet beslut.
6. R11, modernisering av `src/legacy/price_calc.py` (Session 15, minimal omfattning):
   - **Codemap och analys:** `docs/legacy/price_calc.md` (moduler, beroenden, problem P1–P10).
   - **Karakteriseringstester:** `tests/legacy/test_price_calc.py` och `tests/legacy/conftest.py`: 13 tester, varav 6 låser kända fel. 13 av 13 godkända mot den oförändrade koden. Mutationsprov på kopior: 9, 6 och 2 röda av 13.
   - **Refaktorering:** tre beteendebevarande steg, var och en egen commit med gröna tester (`424dd87`, `624c06f`, `9d485fc`). Beroendet i en egen commit (`51b8e32`, `psycopg[binary]` 3.2.10) och testerna i en egen (`b01c257`).
   - **Migreringsplan:** `docs/migrations/001-rabattkod-fk-och-index.md` (expand/contract för en främmande nyckel och ett index, med återställning per fas). **Inget SQL är körd** och `db/schema.sql` är oförändrad.
   - **Logg:** `sessions/session-15-2026-11-18.md`. Sammanslagen i `main` som **PR #2** (merge-commit `d25e11b`, 18 november 2026).
   - **Kvar:** P1–P8 är dokumenterade men inte rättade, och migreringen är bara en plan.
7. **Verifiering av den sammanslagna `main` (`d25e11b`, 18 november 2026):** Jest 50 av 51 (bara det kända felet för priset), `pytest tests/legacy` 13 av 13 (körda efter varandra, aldrig parallellt, eftersom sviterna delar `butik_test`), `lint`, `typecheck` och `format:check` godkända. Slutträdet är identiskt med det som simulerades före sammanslagningen.

### Mätning (`metrics/arbetsmoment.csv`)

- Den sista raden i filen avslutades 17 november 2026 02:17. Sessionerna efter det (slutet av R07, R09, R10 och R11, 17–18 november 2026) saknar rad, eftersom `SessionEnd`-hooken skriver raden först när sessionen avslutas. Inga värden för tokens, kostnad eller tid är inskrivna för hand, och de ska inte uppskattas i efterhand.
- Raderna 7 och 8 har tomma fält (korta sessioner utan mätning), vilket är känt sedan tidigare.
- **Den här sessionen (`344b232c-33f3-4222-b9f8-227e080b67bf`):** raden skrivs av `SessionEnd`-hooken när sessionen avslutas, också vid `/clear`. Kontrollera `metrics/arbetsmoment.csv` efteråt. Ögonblicksbilden från statuslinjen (uppmätt, 18 november 2026 12:00:30 UTC, före avslutet) finns i `sessions/session-16-2026-11-18.md`. Sessionsnamnet i raden blir troligen det första ämnet ("R09 orders pagination and status filtering"), eftersom namnet kommer från samtalet. Det är en känd begränsning.
