
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
- [ ] Sessionsloggar och versionshantering i Git.
- [x] Skydd av tester (R07): `test-guard.js` i `main-guard.js`, ask för testkonfigurationen och ADR 0001. Verifierat i Session 13, inte committat.

## Arbeten som riggen ska användas till

När riggen är på plats ska jag använda den för följande uppgifter från kursprojektet:

- [ ] **Ny funktion:** Välja en user story och arbeta från krav och planering till implementation, testning och granskning.
- [ ] **Kodgranskning:** Använda riggen för att granska en tilldelad pull request och identifiera problem med säkerhet, struktur och kodstandard.
- [ ] **Modernisering:** Undersöka den äldre Python-modulen, skapa karakteriseringstester och genomföra mindre refaktoreringar med tester som säkerhetsnät.

## Arbetssätt

Jag kommer att dela upp arbetet i mindre uppgifter och arbeta med en uppgift i taget.

Efter varje steg ska resultatet kontrolleras och dokumenteras. Jag vill kunna se vilka filer som ändrats, vilka tester som körts och om något inte fungerade.

Planen uppdateras under arbetets gång och används tillsammans med sessionsloggarna för att hålla reda på vad som är klart och vad som behöver göras härnäst.

## Aktuell status

**Senast uppdaterad:** 16 november 2026

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

- **Beslut 16 november 2026:** filer i `src/` och `tests/` ändras inte förrän riggen testas på riktigt. Lärarnas avsiktliga övningsfel ska finnas kvar till dess, till exempel SQL-injektion, lösenord som standardvärden och felfall utan tester.

- Löst i Session 10: `npm run format:check` underkände de 15 `.ts`-filerna bara för radslut (CRLF i arbetskopian). `.prettierrc.json` har nu `"endOfLine": "auto"`, och `format:check` godkänns.
- Jest-testet för `GET /orders/1042/price` misslyckades: API:t svarade 404 i stället för förväntade 200. En plan med troliga orsaker finns i `docs/plans/01-pris-endpoint-404.md`: `psycopg` saknas, och `python3` är en omdirigering. Planen väntar på godkännande.
- Skills: alla fyra är skapade (`tdd`, `granska-standard`, `karakterisera` och `planera`) och har strukturtester i `.claude/skills/skills.test.js` (se Session 07). `granska-standard` och `planera` är också testade i praktiken. `tdd` och `karakterisera` testas vid den första riktiga uppgiften.
- `pytest` och `psycopg` är inte installerade i Python 3.14, så `npm run test:legacy` går inte att köra. Installationen kräver godkännande.
- Granskningen av `src/` med `granska-standard` hittade SQL-injektion i `src/legacy/price_calc.py:42`, anslutningssträngar med lösenord som standardvärde och felfall som saknar tester (se Session 07). Inget är rättat.
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
   - **Läget nu:** 189 av 189 i riggsviten, 52 av 52 mutationer för `main-guard` och 37 av 37 för `test-guard`. Inte committat (Session 13).
   - Inte inkopplad i `main-guard`. Inte committad.
