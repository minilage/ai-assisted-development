# R21 – Erfarenheter och lärdomar (utkast, 18 november 2026)

Underlag: sessionsloggarna 08, 10, 11, 13, 14, 16 och 17, `docs/examination/krav-bevis.md`, `docs/examination/r20-risker-och-teamintroduktion.md`, `docs/examination/r10-testgren/jamforelse.md`, `docs/examination/r10-granskning-pr-r11.md`, `PLAN.md` och `metrics/arbetsmoment.csv`. Sessionerna 03–07, 09, 12 och 15 är bara genomsökta efter nyckelord och inte lästa i sin helhet. Utkastet är inte granskat av användaren.

**Så läses beläggen**
- **Körd** = kontrollen eller händelsen är belagd av en körning som loggen redovisar (huvudsessionen eller `verifierare`). Den är **inte omkörd** för det här utkastet.
- **Enligt dokument** = bara belagt i en logg, ett granskningsdokument eller en ADR.
- **Bedömning** = resonemang som inte är mätt. Det gäller särskilt avsnitt 5, där förslagen ska fastställas av användaren.

## 1. Vad som har fungerat bra

| # | Vad | Belägg | Läge |
|---|---|---|---|
| 1 | Hooks stoppade otillåtna åtgärder i riktiga körningar: `.skip` på ett test (`test-guard` via `main-guard.js`) och `rm -rf`. `agent-guard` stoppade otillåtna kommandon för subagenter, och agenterna redovisade i stället för att försöka på annat sätt | `sessions/session-17-2026-11-18.md` (Händelser 3, Rigg-fynd), `sessions/session-08-2026-11-15.md` rad 275 | Körd (loggar) |
| 2 | Test först och mutationsprov: riggens tester och mutationsprov hittade luckor som annars hade följt med. Riggtesterna är 193 av 193 | `session-13` rad 418–438 (189 av 189, mutationer 52 av 52 och 37 av 37). 193 av 193: `krav-bevis.md` | Mutationerna: körda enligt loggen (Session 13) men inte omkörda. 193 av 193: körd 18 november |
| 3 | Review fångade fel som huvudsessionen hade missat, även i det egna arbetet: till exempel regressionerna H1 och H2 i `main-guard.js` och två felaktiga rader i utkastet till `krav-bevis.md` | `session-13` rad 399–406 (fynden H1 och H2) och 418–425 (rättningen), `krav-bevis.md` rad 31 och 165 (rättelsenoter) | Enligt dokument |
| 4 | Blind granskning: `granskare` hittade 7 av 7 tillämpliga planterade fel utan ledtrådar. Den tog 49 411 ms och 31 199 agenttokens | 7 av 7: `docs/examination/r10-testgren/jamforelse.md`. Tid och tokens: `session-17` rad 62 och `krav-bevis.md` rad 54 | Enligt dokument (agentens egna siffror). Facit skrevs före granskningen |
| 5 | Sessionsminne vid `/clear`: sessionen startade med status från `PLAN.md` och den senaste loggen, och den kontrollerades mot Git innan arbetet fortsatte | `.claude/hooks/session-memory.js`. `/clear` + `ready` är redovisat som verifierat i `krav-bevis.md` R05 (rad 20). `session-17` rad 8: sessionen startade efter `/clear` och överlämningen kontrollerades mot Git | Körd (enligt `krav-bevis.md`). Att den här sessionens start fungerade är min egen iakttagelse och inte belagd i någon logg |
| 6 | Mätningarna går att kontrollera: input- och output-tokens i CSV:n stämde exakt med transkripten för alla 10 sessioner som har en rad med tokens | `krav-bevis.md`, avsnittet R19 | Körd 18 november (egen summering av transkripten) |
| 7 | Uppdelningen mellan roller: `granskare` läser och bedömer, `verifierare` kör och rapporterar, huvudsessionen kör det som agenterna inte får köra själva (venv-pytest, `node --test`) | `.claude/agents/*.md`, `session-17` rad 98 | Fil läst |
| 8 | Review och Verify kördes parallellt i vissa steg, vilket i Session 12 gav cirka 40 s kortare klocktid | `session-12-2026-11-16.md` rad 57 och 86–93 | Enligt dokument (agenternas egna siffror). Besparingen är mätt bara där |

## 2. Vilka problem vi har stött på

| # | Problem | Belägg | Status |
|---|---|---|---|
| 1 | **Falska larm i spärrarna.** `main-guard.js` blockerade ofarliga anrop när ett ords sista del bara är ett glob-mönster (till exempel `*`, `test/*` eller `!{node_modules,.git}/**`, enligt `session-17` rad 96). Orsaken är bekräftad för `*` men inte för `Grep`-blockeringen ("troligen densamma", `session-17`) och inte för `verifierares` `find`-anrop ("inte klarlagd", `session-17` rad 98). Tre blockeringar i Session 17, observerade i Session 14 och 16, och känt och accepterat i Session 11 (`session-11` rad 124–127). `agent-guard` blockerade också mer än nödvändigt i Session 08 (`session-08` rad 280). `agent-guard` blockerade också till exempel `git merge-base`, `git cat-file` och `npx prettier` | `session-08` rad 280, `session-11` rad 124–127, `session-14` rad 56, `session-16` rad 63, `session-17` rad 14 och 42–50 | **Inte rättat.** Rättningen är en säkerhetsinställning som kräver godkännande |
| 2 | **Föråldrad status.** Statusrader om commit och gren blev fel efter en commit (Session 17 och `PLAN.md`). `requirements.md` avsnitt 7 är daterat 16 november. Session 08 hade en rättelse av samma slag | `session-17` rad 5 och 96, `session-08` rad 289, `krav-bevis.md` rad 3 | Rättat i de två första fallen med tidigare text som anmärkning. Avsnitt 7 är **inte** uppdaterat |
| 3 | **Agentens sammanfattning stämde inte med dess egen tabell** (granskaren, Session 17), och granskarens påståenden om F1 och F14 stod bara på kodläsning tills huvudsessionen körde proven | `session-17` rad 19, `session-16` rad 61, `r10-granskning-pr-r11.md` rad 78 | Rättat i dokumenten. Det visar att en agents rapport måste kontrolleras av någon annan |
| 4 | **Spärrmeddelandet pekade ut fel orsak.** `npm run lint -- --fix` blockerades, men meddelandet visade bara `npm run lint`, så `verifierare` trodde att vanlig lint var spärrad | `session-08` rad 279 och 295–299 | Rättat med test först (30 av 30) |
| 5 | **En ändring av mig försvagade ett skydd** (H1 och H2 i `main-guard.js`) och orsakade nya falska larm (`loosenSplit`) | `session-13` rad 418–448 | H1 och H2 rättade. De nya falska larmen är dokumenterade |
| 6 | **Rigg-filer följde inte Prettier** (7 filer) och `format:check` kontrollerade dem inte, så `verifierare` hade en föråldrad baslinje (15 filer) | `session-10` rad 63–68 och 86–105 | Rättat (`a7ed197`, `e0e8672`) |
| 7 | **Miljön.** `python3` är Windows Store-genvägen, så Jest `GET /orders/:id/price` ger 404. `pytest` finns inte på `PATH`. `gh` saknades, så PR #1 öppnades i webbläsaren. `verifierare` kan inte köra venv-pytest eller `node --test` | `session-14` rad 71, `session-16` rad 59 och 63, `session-17` rad 98 | **Inte rättat** (ligger utanför godkända moment). Jest 50 av 51 beror på detta |
| 8 | **Mätningen är per session, inte per arbetsmoment.** Fem rader heter "test-matning" och beskriver inte arbetet. Koppling till arbetsmoment kan inte beläggas för fem av tio märkta rader | `krav-bevis.md`, "Mätvärden som saknas" punkt 1 | Inte rättat |
| 9 | **Säkerhetsfel i äldre kod som inga automatiska kontroller fångar.** R11-F1 och R11-F14 (SQL-injektion via rabattkoden) och R09-F3 (en header stoppar API:t) är bekräftade med körning. *(F-numren är olika i de två granskningarna: R11-F3 är nattrapportens SQL och är ett annat fel.)* | `r10-granskning-pr-r11.md` rad 42 (F14), `session-14` rad 77 (R09-F3), `session-16` rad 58 | **Inte rättade.** Kräver egna godkända moment |
| 10 | **Motsägelser mellan hooks och agentbeskrivningar** efter att hookskripten spärrades: `utvecklare.md:57` och skillen `tdd` | `session-11` rad 133–135 | Rättat samma session (`session-11` rad 309–317): `utvecklare.md` (nu rad 58) nämner hela `.claude/hooks/` och skillen `tdd` är ändrad. Kontrollerat mot `utvecklare.md:58` |

## 3. Vad vi har fått ändra under arbetets gång

| Ändring | Orsak | Belägg |
|---|---|---|
| Meddelanden från `agent-guard` anger nu vilket argument som stoppade kommandot (`ruleViolation`) | Missvisande meddelande (problem 4) | `session-08` rad 295–299 |
| Prettier för `.claude/`, massformatering av 7 rigg-filer, `format:check` omfattar `.claude/**/*.js`, radslut `"endOfLine": "auto"` | Problem 6, och radsluten på Windows gav fel i kontrollerna | `session-10` (bland annat rad 218), `PLAN.md`. Commits: `e0e8672` (skripten), `a7ed197` (formateringen), `991bd26` (`endOfLine`) |
| `.claude/hooks/` skyddas nu mot ändring av agenter (`RIG_PROTECTED`) och `main-guard.js` byggdes för huvudsessionen | Den första riggen skyddade bara subagenterna | `session-11` rad 16 och 54 (beslutet om `RIG_PROTECTED`), rad 143 (filtabellen) |
| Regressionerna H1 och H2 rättades (`loosenSpaces`, `loosenSplit`) | En egen ändring hade gjort ett skydd svagare | `session-13` rad 418–425 |
| Alla fyra subagenter behöll `model: inherit` | Användarens beslut (alternativ A, 18 november): enkelhet och jämförbarhet. Ingen modelljämförelse är gjord | `krav-bevis.md`, avsnittet "Valet: behåll `inherit`" |
| Tre rader i `requirements.md` fick en neutral formulering | Formuleringarna fick inte stå kvar i dokumentet | Commit `093516d` |
| Kostnads- och statussiffror i `krav-bevis.md` rättades och stämdes av mot CSV:n | Felaktiga eller föråldrade uppgifter (problem 2 och 3) | Commit `3b8a50a`, `krav-bevis.md` rad 167–180 |
| Commit, push och tagg kräver särskilt godkännande, och commits föreslås först när en del är färdig och verifierad | Regel i `CLAUDE.md` (avsnitten om separat godkännande och resultat). Review gjordes inte alltid före commit: i Session 17 gjordes den efter `939006e` | `CLAUDE.md`, `session-17` rad 78 |

## 4. Vilka begränsningar som finns kvar

1. **Ingen sandlåda.** Agenten körs lokalt på Windows. Spärrarna är mönsterbaserade och har kända luckor (M1, M2, `bash -c`, omdirigering). `session-11` rad 128–132, `r20-…md` risk 1 och 4.
2. **Bara 2 av 7 planterade fel fångades av en automatisk kontroll** (lint och `check-code.js`). De övriga fem krävde manuell granskning. Regler S1–S17 finns inte som ESLint-regler och ingen hemlighetsskanning finns. `session-17` rad 27–38, `krav-bevis.md` R01.
3. **R11-F1, R11-F14 och R09-F3 är orättade**, och S7 för `auth.ts` är en öppen tolkning. `session-16` rad 58–62.
4. **Granskningen är provad på bara en modell** (Sonnet 5.5 via `inherit`) och på projektets egna PR:er. En oförberedd PR från någon annan har inte granskats. `krav-bevis.md` R10 och R16.
5. **Hooks körs inte på en PR som någon annan har skrivit** (bara när en session har riggen). `r20-…md` risk 1.
6. **Ingen gräns för kostnad, tid eller antal omförsök** är konfigurerad. `maxTurns` är satt men aldrig nådd. `krav-bevis.md` R16.
7. **Mätningen** är per session och saknar kostnad per arbetsmoment och per modell. Kostnaden är Claude Codes uppskattning och prisunderlaget är inte kontrollerat. `krav-bevis.md` R19.
8. **Riktig `resume` och `PreCompact`** är bara belagda i loggar (Session 09 och 11), inte omkörda. `krav-bevis.md` R05.
9. **Dokument i `docs/` och `sessions/` täcks inte av Prettier**, så formatfel i dokumentationen upptäcks inte automatiskt. `session-16` rad 65.
10. **Det är inte testat att Claude Code själv väljer en subagent** utifrån en vanlig begäran. Alla körningar startades med `subagent_type`. `session-08` rad 284.

## 5. Vad jag skulle prioritera först med en vecka till (förslag)

Rangordningen är **en bedömning** som användaren fastställer. Den följer risknivåerna i `r20-risker-och-teamintroduktion.md` och är inte mätt.

| Prio | Förslag | Skäl (belägg) | Obs |
|---|---|---|---|
| 1 | Rätta R11-F1 och R11-F14 samt R09-F3 som egna moment: test först, sedan parametriserad SQL och felhantering för headern | De allvarligaste (Hög) bekräftade, orättade säkerhetsfynden i kod som används (problem 9). Fler bekräftade fynd med lägre allvar finns i `r10-granskning-pr-r11.md` rad 69 (F4, F7 och R11-F3). Restrisken i R20 är Hög | Kräver godkännande per moment. Migreringen `docs/migrations/001-…` är inte körd |
| 2 | Gör S1–S17 till automatiska kontroller där det går (ESLint-regler, hemlighetsskanning) | 5 av 7 planterade fel fångades bara manuellt (begränsning 2) | Hur många regler som går att automatisera är inte undersökt |
| 3 | Rätta de falska larmen i `main-guard.js` och `agent-guard.js`, med tester före | Återkommande i fem sessioner: 08, 11, 14, 16 och 17 (problem 1) | Säkerhetsinställning: mutationsproven (52 av 52, 37 av 37 och för `agent-guard` 29 av 29, `krav-bevis.md` rad 199) måste köras om |
| 4 | Mät per arbetsmoment och per modell (till exempel arbetsmoment som egen kolumn och tokens per modell) | Problem 8 och R19:s saknade värden | Kräver ändring av `record-metrics.js` |
| 5 | Jämför en mindre modell för `verifierare` på samma kontroller | Förslaget i `krav-bevis.md` (R16). Inget underlag finns i dag | Risk att ett fel rapporteras som godkänt. Ska provas, inte antas |
| 6 | Granska en riktig, oförberedd PR och lägg riggens `node --test` som ett `npm`-skript | Begränsning 4 och Session 17 rad 98 (`package.json` saknar `test:rig`) | Kräver att någon öppnar en PR. Ett nytt skript är en ändring av `package.json` |
| 7 | Rätta miljön: `python3` och `pytest` på `PATH` | Problem 7. Jest 50 av 51 beror på detta | Ändrar den lokala miljön, inte projektet |

**Inte undersökt:** hur lång tid varje förslag tar och vilka som får plats på en vecka. Det är inte uppskattat här.
