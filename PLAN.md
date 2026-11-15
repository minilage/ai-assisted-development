
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
- [ ] Minst fem hooks, inklusive hantering av sessionsminne.
- [x] Behörigheter med allow, ask och deny.
- [ ] Automatiska kontroller för kodstandard, formatering och typkontroll.
- [ ] Sessionsloggar och versionshantering i Git.

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

**Senast uppdaterad:** 15 november 2026

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

- Löst i Session 10: `npm run format:check` underkände de 15 `.ts`-filerna bara för radslut (CRLF i arbetskopian). `.prettierrc.json` har nu `"endOfLine": "auto"`, och `format:check` godkänns.
- Jest-testet för `GET /orders/1042/price` misslyckades: API:t svarade 404 i stället för förväntade 200. En plan med troliga orsaker finns i `docs/plans/01-pris-endpoint-404.md`: `psycopg` saknas, och `python3` är en omdirigering. Planen väntar på godkännande.
- Skills: alla fyra är skapade (`tdd`, `granska-standard`, `karakterisera` och `planera`) och har strukturtester i `.claude/skills/skills.test.js` (se Session 07). `granska-standard` och `planera` är också testade i praktiken. `tdd` och `karakterisera` testas vid den första riktiga uppgiften.
- `pytest` och `psycopg` är inte installerade i Python 3.14, så `npm run test:legacy` går inte att köra. Installationen kräver godkännande.
- Granskningen av `src/` med `granska-standard` hittade SQL-injektion i `src/legacy/price_calc.py:42`, anslutningssträngar med lösenord som standardvärde och felfall som saknar tester (se Session 07). Inget är rättat.
- Hooks: tre av fem finns: SessionStart och SessionEnd för mätning, och PreToolUse i form av `agent-guard` för subagenterna. Hooks för sessionsminne, automatiska kontroller och en PreToolUse-spärr för huvudsessionen återstår.
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
- `docs/plans/02-health-test.md` (test för `GET /health`) väntar på godkännande och svar på tre öppna frågor.
- Mätningen har kända begränsningar: sessionsnamnet kan komma från samtalet och återupptagna sessioner är inte testade (se Session 06).
- Behörighetsreglerna kan kringgås med kommandon i annan form eller skript som läser filer själva. För subagenterna täcks det delvis av `agent-guard`. För huvudsessionen behövs fortfarande en PreToolUse-hook.

### Nästa arbetsmoment

1. Hooks-momentet enligt `docs/plans/03-hooks.md` (godkänd). Steg 1, sessionsminne, är klart: byggt, testat och verifierat med `/clear` + `ready` och `/compact` (`.claude/hooks/session-memory.js`, se Session 09). Committat och pushat i `5e9832e`. Steg 2, Prettier för `.claude/`, är committat och pushat i `e0e8672`. Massformateringen är committad och pushad i `a7ed197`. Steg 3, kodkontroller (`.claude/hooks/check-code.js`), är byggt med TDD och registrerat i `settings.json`. Radsluten är lösta (`"endOfLine": "auto"`). PostToolUse och Stop är verifierade i riktiga körningar i samma session, utan omstart. Inte committat (se Session 10). Därefter steg 4 (spärr för huvudsessionen).
2. Använda plan 02 som den första riktiga Build-uppgiften för `utvecklare`, med `granskare` och `verifierare`, när planen är godkänd.
