# Krav → bevis, R01–R24 (utkast, 18 november 2026)

Underlag: `docs/examination/requirements.md` (avsnitt 3–6), filerna i repot och kontroller körda 18 november 2026. Utkastet är inte granskat av användaren och inte committat. Avsnitt 7 i `requirements.md` (status 16 november) är **föråldrat** och är inte uppdaterat här.

**Så läses kolumnen Läge**
- **Körd** = kontrollen kördes av huvudsessionen eller `verifierare` 18 november 2026 på `27bf45c`, vars innehåll är identiskt med `main` (`4f14b42`). De är inte omkörda efter sammanslagningen.
- **Fil läst** = filen finns och är läst, men det den påstår är inte omkört.
- **Enligt dokument** = bara belagt i `PLAN.md` eller en sessionslogg.

Kontroller som körts: `npm run lint`, `typecheck` och `format:check` (godkända), `npm test` (50 av 51, det enda felet är det kända `GET /orders/:id/price` med 404), `node --test` på de 9 testfilerna i `.claude/` (193 av 193) och `.venv/Scripts/python.exe -m pytest tests/legacy` (13 av 13). `npm run test:legacy` är underkänd eftersom `pytest` saknas på `PATH` (känt miljöfel).

## Tabell

| Krav | Bevis | Läge | Saknas |
|---|---|---|---|
| **R01** Kodstandard | `eslint.config.js`, `.prettierrc.json`, `tsconfig.json`, skripten `lint`, `typecheck`, `format:check`. `check-code.js` (PostToolUse och Stop). Exempel: lint och `check-code.js` flaggade en oanvänd variabel och ett explicit `any` i testgrenen (`r10-testgren/jamforelse.md`) | Körd | Projektets egna regler S1–S17 finns inte som ESLint-regler (`kontroller.md`, avsnitt C). Det är en begränsning att redovisa |
| **R02** Skills | `tdd`, `planera`, `granska-standard`, `karakterisera` i `.claude/skills/`. `skills.test.js` | Körd (testerna) | Per skill: hur den testades och vad som hände, samlat (R13) |
| **R03** Subagenter | `planerare`, `utvecklare`, `granskare`, `verifierare` i `.claude/agents/`, med `tools` och `agent-guard`. `agents.test.js`. **Modellval: `model: inherit` i alla fyra, se avsnittet Modellanvändning** | Körd (testerna) | Kravet säger "ett definierat modellval". `inherit` är ett medvetet val (användaren valde alternativ A 18 november 2026), men definierar ingen modell. Motiveringen finns nedan |
| **R04** Hooks | Registrerade i `.claude/settings.json`: `record-metrics.js` (SessionStart, SessionEnd), `session-memory.js` (SessionStart, PreCompact), `main-guard.js` (PreToolUse), `check-code.js` (PostToolUse, Stop). Dessutom `agent-guard.js` (i `granskare` och `verifierare`, läge `read` och `checks`) och `test-guard.js` (anropas av `main-guard.js`). `docs/plans/03-hooks.md` | Körd (hooktesterna ingår i 193 av 193). Hooks stoppade anrop i riktiga körningar (Session 17) | Hur "minst fem" räknas (skript eller registreringar) behöver förklaras. Ett samlat dokument per hook (när, vad, stoppar, testad, kan inte fånga) saknas. `agent-guard` i frontmatter för `planerare` och `utvecklare` är inte kontrollerad |
| **R05** Sessionsminne | `session-memory.js` (SessionStart för `startup`, `resume`, `clear`, `compact`, samt PreCompact). `session-memory.test.js`. Verifierat i `/clear` + `ready` i Session 17 | Körd (test och `/clear`) | Riktig `resume` och `PreCompact` är bara belagda i loggar (Session 09 och 11) |
| **R06** Behörigheter | `.claude/settings.json`: allow 29, ask 49, deny 28. `main-guard.js`, `agent-guard.js`. `docs/plans/03-hooks.md`, `04-testskydd.md` | Fil läst | Förklaring av reglerna och körmiljön (lokalt på Windows, ingen sandbox eller container är konfigurerad) och begränsningarna. Hör till R14 |
| **R07** Testskydd | `test-guard.js`, ADR 0001 (`docs/adr/0001-testskydd-i-main-guard.md`), commit `e3dbda2`, Session 13 | Körd (`.skip` blockerades i Session 17) | Mutationssiffrorna (52/52, 37/37) och 189/189 är enligt dokument |
| **R08** Sessionsloggar | `sessions/` 01–17 | Fil läst | Mätrader i `metrics/arbetsmoment.csv` för Session 15–17 saknas tills `SessionEnd` skriver dem |
| **R09** Ny funktion | User story 3. `docs/plans/05-sidindelning-orders.md`, `docs/api.md`, ADR 0002, commits `317a321` och `17352a9`, PR #1 (`fb8888d`), Session 14 | Körd (Jest) | En samlad krav–commit-koppling för rapporten |
| **R10** Granska kod | `r10-granskning-pr-r09.md`, `r10-granskning-pr-r11.md`, `r10-testgren/*`, `kor-granskning-okand-pr.md`, PR #5 (`4f14b42`). Blind granskning: 7 av 7 tillämpliga planterade fel hittades | Fil läst. Mekaniken körd: `git fetch`, tre-punkters-diff och `granskare` läser `FETCH_HEAD` | **En oförberedd PR från någon annan** (seminariet). PR #5 är projektets egen |
| **R11** Modernisera | `docs/legacy/price_calc.md`, `tests/legacy/` (13 tester), tre refaktoreringar, `docs/migrations/001-rabattkod-fk-och-index.md` | Körd (pytest 13 av 13) | Migreringen är inte körd (dokumenterat). P1–P8, F1 och F14 är kvarvarande risker |
| **R12** Kodbas, krav och beslut | `docs/user-stories.md`, `plans/05`, ADR 0001 och 0002, `api.md` | Fil läst | Rapportavsnittet, antaganden och alternativ per beslut |
| **R13** Riggens delar | Underlag i `.claude/`, `plans/03`–`04`, `kontroller.md` | Fil läst | Sammanställning per skill, subagent och hook |
| **R14** Behörigheter och körmiljö | `.claude/settings.json`, hooks, `agent-guard.js` | Fil läst | Förklaring av reglerna, att agenten körs lokalt utan sandbox, och begränsningar |
| **R15** Arbetsflöde och kontext | `CLAUDE.md`, `PLAN.md`, `docs/plans/`, `sessions/`, `session-memory.js`. Kandidater för exempelcommit: `b2647f9`, `e3dbda2`, `317a321`, `27bf45c` | Fil läst. Commits finns på `main` | Beskrivningen och en vald commit med hänvisningar |
| **R16** Orkestrering och modellval | Faserna i `CLAUDE.md`. Resultat per fas i `docs/plans/` och `sessions/`. **Modellanvändning: se avsnittet nedan** | Modellanvändning och subagentandel är mätta ur transkript. Stoppvillkor och faser är lästa i `.claude/agents/` och `CLAUDE.md`. Parallellkörning är belagd i loggar och i transkript. Se avsnittet R16 nedan | Gräns för kostnad, tid och antal försök är inte konfigurerad. Kostnad med en större modell saknas (inget prisunderlag). Att worktrees valdes bort är inte dokumenterat som ett beslut *(en tidigare version av den här raden sa felaktigt att inga stoppvillkor fanns. `maxTurns` och avsnitten "Stoppvillkor" finns i agentfilerna)* |
| **R17** Kodgenerering och granskning | `kontroller.md`, granskningsdokumenten, `check-code.js`, `test-guard.js` | Fil läst | "Vad varje kontroll kan upptäcka" och "när jag godkänner" som sammanställning |
| **R18** Modernisering | Som R11, plus Session 15 | Fil läst | Rapportavsnittet och det som återstår |
| **R19** Mätningar | `metrics/arbetsmoment.csv`: 12 rader per **session**, med tokens, tid, kostnad (uppskattning) och modell | Mätt: CSV-siffrorna för tokens stämmer exakt med transkripten för alla 10 sessioner med rad. Se avsnittet R19 nedan | **Session → arbetsmoment kan inte beläggas för 5 av 10 märkta rader** (session-id står bara i 5 loggar). Kostnad per moment saknas. Rad för den pågående sessionen (`0d2737f1`) saknas tills `SessionEnd` skriver den. Antal fel som kontrollerna fångat är inte sammanställt över alla sessioner. Prisunderlaget bakom kostnaden är inte kontrollerat |
| **R20** Team och risker | Risker finns spridda i `docs/plans/*` och granskningsdokumenten | Delvis | Införande i ett team med fem utvecklare och en riskanalys med minst fem risker |
| **R21** Erfarenheter | Spritt i sessionsloggarna (rigg-friktion, falska larm, med mera) | Delvis | Sammanställningen och vad som prioriteras med en vecka till |
| **R22** Repo och Git | PR #1–#5 sammanslagna, `main` = `origin/main` (`4f14b42`) | Körd (`git status`) | **Taggen `inlamning` saknas** (`git tag -l` är tom). Skapas sist, med användarens godkännande |
| **R23** PDF | Ingen | Ej påbörjad | Allt. Examinationsmallen finns inte i repot |
| **R24** Muntlig | Delar av underlaget finns | Ej förberett | Manus och övning |

## Modellanvändning (R03 och R16)

### Verifierat (mätt eller läst 18 november 2026)

| Fakta | Källa |
|---|---|
| Alla fyra agentdefinitioner har `model: inherit` | `.claude/agents/granskare.md:6`, `planerare.md:6`, `utvecklare.md:6`, `verifierare.md:5` |
| `.claude/settings.json` och `.claude/settings.local.json` anger ingen `model` och ingen modellrelaterad miljövariabel | Läst med `node` |
| Sessionerna med Opus (CSV-raderna är daterade 15–16 november) använde `claude-opus-5-5`, både huvudsession och subagenter | Modellnamn i transkript: sessionerna `285e1567`, `9cd08258`, `dfe9fec3`, `f03e7ab5` (subagenter: 95, 86, 34 och 174 anrop) samt fem sessioner utan subagenter |
| Sessionerna från 17 november använder `claude-sonnet-5-5`, både huvudsession och subagenter | Sessionerna `344b232c` (674 huvudanrop, 345 subagentanrop, 18 agenter) och `0d2737f1` (210 och 26, 3 agenter) |
| I alla 6 sessioner med subagenter (45 subagent-transkript) hade subagenterna **samma modell som huvudsessionen** | Samma räkning. Inga blandade modeller och inga andra modeller, till exempel Haiku |
| Kolumnen `modell` i `metrics/arbetsmoment.csv` stämmer med transkripten: 11 rader `claude-opus-5-5`, 1 rad `claude-sonnet-5-5` | Transkript och CSV |
| `record-metrics.js` summerar tokens för huvudsession och subagenter ihop och skriver den **sista** modell som sågs | `.claude/hooks/record-metrics.js` rad 122–170 och 241 |
| Blind granskning med `granskare` (Sonnet 5.5, via `inherit`) hittade 7 av 7 tillämpliga planterade fel: 49 411 ms och 31 199 agenttokens | `r10-testgren/jamforelse.md`, agentens egna siffror |

### Antaganden (inte verifierade)

- **Orsaken till bytet** från Opus 5.5 (senast i CSV 16 november) till Sonnet 5.5 (första raden 17 november) är inte verifierad.
- Att `inherit` ger **samma modell** i framtida sessioner gäller bara så länge huvudsessionens modell är vald så. Ändras den, ändras alla subagenter.
- Användarnivåns inställningar (`~/.claude/`) är inte lästa.
- Ett av live-filerna (`.claude/metrics/live/`) saknade `transcript_path` och ingår inte i genomgången. Vilken fil det är är inte undersökt.
- Kostnaden i `metrics/arbetsmoment.csv` är en **uppskattning**. Vilket pris per modell som räknats med är inte kontrollerat, och ingen kostnad med en större modell är beräknad.

### Valet: behåll `inherit` (alternativ A, användarens beslut 18 november 2026)

Konfigurationen är oförändrad. Avvägningar, där **antagande** betyder att det inte är mätt:

| Aspekt | Med `inherit` | Anmärkning |
|---|---|---|
| Enkelhet | En modell att förklara, testa och mäta. Inga extra inställningar per agent | Fakta: konfigurationen är en rad per agent |
| Konsekvens | Subagenter och huvudsession resonerar likadant, så resultat går att jämföra mellan agenter | Fakta för de sessioner som mätts |
| Kvalitet | Alla roller får huvudsessionens modell, även de som kunde klara sig med en mindre. Granskning och planering är de roller som tjänar mest på en stark modell | **Antagande.** Ingen jämförelse mellan modeller har gjorts. Att `granskare` hittade 7 av 7 på Sonnet 5.5 visar bara att den modellen räckte i det provet |
| Kostnad | `verifierare` (kör kommandon och rapporterar) och läsande uppdrag skulle kunna köras på en billigare modell. Med `inherit` betalas full modell även för dem | **Antagande.** Subagentens andel av tokens är mätbar i transkripten (till exempel 345 av 1 019 anrop i `344b232c`), men ingen kostnadsjämförelse per modell finns |
| Säkerhet | Att byta till en svagare modell för `verifierare` kan öka risken att ett fel rapporteras som godkänt, och för `granskare` att fynd missas | **Antagande.** Inget prov gjort |
| Mätbarhet | Mätningen blir tydlig eftersom en modell per session | **Fakta:** `record-metrics.js` skiljer inte på modell, så en framtida blandning skulle ge en missvisande `modell` och en odelad token- och kostnadssumma |

**Förslag att redovisa under R21 (inte genomfört):** testa en mindre modell för `verifierare` på samma kontroller och jämför rapporterna, och låt `record-metrics.js` skriva tokens per modell.

### Det som återstår för R16 (modell)

- Vilken modell varje subagent använder: svaret är "samma som huvudsessionen" (verifierat ovan).
- Varför: `inherit` av enkelhetsskäl, enligt valet ovan. Den motiveringen är ett resonemang, inte en mätning.
- Hur kostnaden skulle skilja sig med en större modell: **saknas**. Kräver ett prisunderlag som inte finns i repot.

## R16 – Orkestrering (verifierat 18 november 2026)

### Faser och vad varje fas lämnar vidare

Faserna är Research → Plan → Build → Review → Verify (`CLAUDE.md`, avsnittet "Arbetsflöde vid utveckling"). Varje fas ska lämna ett resultat som sparas i projektet. Vem som utför den och vad som lämnas vidare, enligt agentdefinitionerna (lästa, inte omkörda):

| Fas | Utförs av | Resultat som lämnas vidare |
|---|---|---|
| Research och Plan | `planerare` (skill `planera`) | Plan i `docs/plans/` med acceptanskriterier (Givet/När/Så), berörda filer, risker och testplan |
| Build | `utvecklare` (skill `tdd`) | Tester och kod i `src/` och `tests/`, redovisning av kontroller. Ingen commit |
| Review | `granskare` (skill `granska-standard`) | Fyndtabell med fil och rad, orsak, rekommendation, kontroll och Automatiskt/Manuellt. Sparas av huvudsessionen i `docs/examination/` |
| Verify | `verifierare` | Tabell över kommandon och resultat. Rättar ingenting. Har ett avsnitt "Överlämning" |

`granskare`, `planerare` och `verifierare` har dessutom `tools` begränsade per roll och en `agent-guard`-hook (läge `read`, `plans-write` och `checks`). Huvudsessionen fattar beslut om nästa fas, och användaren godkänner varje moment (`CLAUDE.md`).

### Stoppvillkor (konfigurerade)

| Agent | `maxTurns` | Stoppvillkor i agentfilen |
|---|---|---|
| `planerare` | 40 | Stoppa när planen är sparad och redovisad, eller om underlaget är för oklart |
| `utvecklare` | 80 | Stoppa när steget har gröna tester och kontrollerna körts, eller om ett test inte går att rätta inom steget, steget kräver något som inte är godkänt, eller testmiljön inte fungerar |
| `granskare` | 40 | Stoppa när rapporten är klar, eller om målet inte går att tolka |
| `verifierare` | 30 | Stoppa när kontrollerna är körda och redovisade. Försök inte rätta det som misslyckas |

Hooken `agent-guard` har `timeout: 10` i agentfilerna. `maxTurns` är läst ur konfigurationen och är **inte provat** (ingen agent har nått gränsen).

**Inte konfigurerat:** någon gräns för kostnad, tid eller antal omförsök per steg. `maxTurns` begränsar bara antalet varv i en agent.

### När ett steg misslyckas

- `CLAUDE.md`: om ett test misslyckas ska orsaken undersökas, andra problem rättas inte utan att användaren först tillfrågas.
- `utvecklare` stoppar och redovisar. `verifierare` rättar inte. Användaren beslutar om nästa steg.
- Belagt i praktiken (Session 17): när `main-guard.js` blockerade ett anrop redovisades det i stället för att försöka på annat sätt, och när `check-code.js` flaggade två lint-fel rättades de inte utan godkännande.

### Parallellkörning

| Belägg | Källa | Läge |
|---|---|---|
| Tre körningar startades parallellt efter att agenterna blivit tillgängliga | `sessions/session-08-2026-11-15.md` rad 348 | Enligt dokument |
| Review och Verify parallellt. Build, Review och Verify tillsammans: 73 700 agenttokens, 28 verktygsanrop och 180 s summerad agenttid (101 + 40 + 39 s). Parallellkörningen gav cirka 140 s i klocktid, alltså cirka 40 s kortare | `sessions/session-12-2026-11-16.md` rad 57 och 86–93 | Enligt dokument (agenternas egna siffror) |
| Verify och Review av steg 2 parallellt | `sessions/session-13-2026-11-16.md` rad 314 | Enligt dokument |
| Överlappande subagent-transkript i tid (par där nästa agent startade före den föregående var klar): `285e1567` 4 par, `344b232c` 4, `9cd08258` 2, `f03e7ab5` 2. I `0d2737f1` ingen | Egen körning av tidsstämplar i transkripten | **Mätt.** Överlappet säger att agenter kördes samtidigt, men inte att det var ett planerat beslut |
| Jest och pytest körs aldrig parallellt (delad `butik_test`) | `PLAN.md` punkt 7 | Enligt dokument |

Varför parallellt: Review och Verify är oberoende av varandra och läser bara. Det är ett resonemang i loggarna och inte en mätning av besparingen utöver siffrorna i Session 12.

### Worktrees

`git worktree list` visar bara huvudträdet (`main`). Inga worktrees används. `worktree` finns i `GIT_BLOCKED` i `agent-guard.js`, så `utvecklare` kan inte skapa dem. Att worktrees **valdes bort** är inte dokumenterat som ett beslut. Det som kan sägas är att arbetet gått via grenar och PR:er (#1–#5) och att Jest och pytest delar databasen, vilket gör parallella träd riskabla. Det är ett antagande.

### Kostnad med en större modell

**Saknas.** Kostnaden i `metrics/arbetsmoment.csv` är Claude Codes egen uppskattning (`cost.total_cost_usd_estimate`, `record-metrics.js` rad 234). Repot innehåller inget prisunderlag per modell, så jag har inte räknat om den. Tokenantalen finns (se R19), men priserna måste hämtas utanför repot.

## R19 – Mätningar (verifierat 18 november 2026)

### Hur siffrorna är kontrollerade

- Raderna i `metrics/arbetsmoment.csv` jämfördes med en egen summering av transkripten (huvudsession plus subagenter, ett svar räknas en gång). **Input- och output-tokens stämmer exakt för alla 10 sessioner som har en rad med tokens.** Cache-tokens är inte jämförda separat.
- Tid och kostnad kommer från Claude Codes statuslinje (`total_duration_ms`, `total_api_duration_ms`, `total_cost_usd_estimate`). De är **inte** kontrollerade mot något annat. **Kostnaden är en uppskattning.**
- Kolumnen "Sub-andel" är andelen output-tokens som kommer från subagenter, beräknad ur transkripten.

### Per session (inte per arbetsmoment)

| Session | Datum | Etikett i CSV | Vägg (min) | API (min) | Output-tokens | Sub-andel | USD (uppskattning) | Modell |
|---|---|---|---|---|---|---|---|---|
| `81117d99` | 15 nov | Granskning av Git-ändringar och dokumentation | 213,1 | 10,5 | 50 477 | 0 % | 3,86 | Opus 5.5 |
| `38312034` | 15 nov | Metrics-filernas innehåll | 20,7 | 5,2 | 29 851 | 0 % | 1,53 | Opus 5.5 |
| `51e9ca5b` | 15 nov | test-matning | 11,9 | 2,8 | 14 526 | 0 % | 0,90 | Opus 5.5 |
| `496a512e` | 15 nov | test-matning | 213,2 | 29,6 | 168 836 | 0 % | 11,62 | Opus 5.5 |
| `285e1567` | 15 nov | test-matning | 83,1 | 30,9 | 165 047 | 18 % | 10,05 | Opus 5.5 |
| `dfe9fec3` | 15 nov | test-matning | 43,0 | 13,5 | 77 673 | 52 % | 3,82 | Opus 5.5 |
| `aeb08c13` | 15 nov | test-matning | 88,8 | 14,2 | 73 753 | 0 % | 5,43 | Opus 5.5 |
| `9cd08258` | 16 nov | Frågor 7–9 med konsekvenser | 499,2 | 37,7 | 206 084 | 21 % | 16,64 | Opus 5.5 |
| `f03e7ab5` | 16 nov | Kravuppfyllnad R01–R24 inför examination | 360,8 | 65,2 | 355 997 | 34 % | 25,22 | Opus 5.5 |
| `344b232c` | 17–18 nov | R09 orders pagination and status filtering | 898,5 | 63,0 | 477 991 | 36 % | 20,30 | Sonnet 5.5 |
| `0d2737f1` (**pågående, ögonblicksbild**) | 18 nov | (ingen rad än) | cirka 119 | cirka 15,5 | 113 551 | 9 % | cirka 3,60 | Sonnet 5.5 |

Två ytterligare CSV-rader (`108ab81a`, `997f4ec5`, 15 november) saknar etikett och kostnad och har ett anrop vardera. De är inte med i tabellen.

**Summa för de 12 raderna i CSV:n:** vägg 2 432,3 min, API 272,6 min, 1 330 API-anrop, 2 954 input-tokens, 1 620 522 output-tokens, 221 096 847 cache-läsningar, 4 454 931 cache-skrivningar och 99,38 USD (uppskattning). Opus 5.5: 11 rader, 79,08 USD och 1 142 531 output-tokens. Sonnet 5.5: 1 rad, 20,30 USD och 477 991 output-tokens. Raderna är inte jämförbara som modelljämförelse, eftersom arbetet skiljer sig mellan sessionerna.

### Mätvärden som saknas (flaggat)

1. **Mätningen är per session, inte per arbetsmoment.** Etiketten är sessionens första ämne. Fem rader heter "test-matning" och beskriver inte arbetet. Session-id står bara i fem sessionsloggar (`81117d99`, `38312034`, `51e9ca5b`, `dfe9fec3`, `344b232c`), så koppling till arbetsmoment kan inte beläggas för de övriga fem märkta raderna. Tid, tokens och kostnad per R09, R10 och R11 går därför inte att redovisa separat. De ingår alla i `344b232c` (och delvis `0d2737f1`).
2. **Den pågående sessionen** (`0d2737f1`) har ingen rad ännu. `SessionEnd`-hooken skriver raden vid `/clear` eller avslut. Siffrorna för den är en ögonblicksbild från statuslinjen och transkripten.
3. **Priser per modell** och därmed kostnad per token-typ saknas. Cache-läsningar utgör nästan alla tokens (221 M mot 1,6 M output), men hur kostnaden fördelas är inte känt.
4. **Subagenternas egen tid och kostnad** är inte uppdelade. Bara token-andelen är mätt. Agenternas egna siffror finns spridda i loggarna (till exempel 31 199 tokens och 49 411 ms för den blinda granskningen).
5. **Antal fel som kontrollerna upptäckt över hela projektet** är inte sammanställt.

### Fel som kontrollerna upptäckte (det som är verifierat)

| Fel | Kontroll | Läge |
|---|---|---|
| Oanvänd variabel och explicit `any` (2 lint-fel) i testgrenen | `check-code.js` och `npm run lint` | Körd 18 november (Session 17) |
| `.skip` på ett test | `test-guard.js` via `main-guard.js` | Körd 18 november (Session 17) |
| `rm -rf` | `main-guard.js` | Körd 18 november (Session 17) |
| 7 av 7 tillämpliga planterade fel i den blinda granskningen | `granskare` (manuell granskning med skill) | Körd 18 november, facit i `r10-testgren/` |
| 12 fynd (R09) och 23 fynd (R11) i granskningarna, varav F3, F1 och F14 provade med körning | `granskare` | Enligt dokument (`r10-granskning-pr-r09.md`, `…-r11.md`) |
| Mutationsprov: 52/52, 37/37, 29/29 upptäckta | Riggens tester | Enligt dokument, inte omkörda |
| Falska larm: tre ofarliga anrop blockerades av `main-guard.js` | `main-guard.js` | Körd (Session 17). Räknas inte som upptäckta fel |

### Två sätt att minska kostnad eller tid (antaganden, inte mätta effekter)

| Förslag | Mätt underlag | Möjlig nackdel för kvalitet och säkerhet |
|---|---|---|
| **1. Korta sessioner och rensa kontexten oftare** (`/clear` med sessionsminnet) | Cache-läsningar är 221 M av alla tokens. De längsta sessionerna (`344b232c`, 898 min och 83 M cache-läsningar, och `9cd08258`, 499 min) är också de dyraste per rad | Mer kontext går förlorad, och riggen måste läsa om filer. Risk att ett beslut tappas om sessionsminnet inte räcker. *Antagande: kostnaden följer sessionens längd. Det är inte testat* |
| **2. Låt läsande agenter (`verifierare`, kanske `granskare`) använda en mindre modell** | Subagenter står för 9–52 % av output-tokens i sessioner där de används (mätt). Idag `inherit` | Risk att ett fel rapporteras som godkänt eller att fynd missas, och att kvaliteten skiljer sig mellan körningar. Ingen modelljämförelse är gjord. *Kräver en ändring av agentkonfigurationen, som inte är gjord* |

Ett tredje, enklare förslag som inte kräver mätning: undvik att köra samma granskning två gånger. Det är ett antagande utan underlag.
