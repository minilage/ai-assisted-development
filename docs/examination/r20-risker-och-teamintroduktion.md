# R20 – Risker med en kodagent och införande i ett team (utkast, 18 november 2026)

Underlag: filer och kontroller i repot, främst `docs/examination/krav-bevis.md`, `.claude/skills/granska-standard/kontroller.md`, `docs/adr/0001-testskydd-i-main-guard.md`, `PLAN.md` och sessionsloggarna. Utkastet är inte granskat av användaren.

**Så läses beläggen**
- **Körd** = kontrollen kördes 18 november 2026 av huvudsessionen eller `verifierare`.
- **Enligt dokument** = bara belagt i `PLAN.md`, en sessionslogg eller en ADR.
- **Bedömning** = mitt resonemang. Det är inte mätt.

**Så läses bedömningen av sannolikhet och konsekvens.** Båda är bedömningar och inte mätvärden. Skalan är ordinal (Låg, Medel, Hög) och definieras så här:
- *Sannolikhet:* **Låg** = har inte observerats i projektet. **Medel** = observerad som tillfälle eller nära händelse. **Hög** = observerad flera gånger i projektet.
- *Konsekvens:* **Låg** = kosmetiskt eller lätt att upptäcka och rätta. **Medel** = kostar tid, ger felaktiga beslut eller en rapport som inte stämmer. **Hög** = dolda fel i kod som används, säkerhetshål, dataförlust eller utläckta hemligheter.
- *Restrisk:* bedömningen **efter** de kontroller som finns idag (avsnittet "Införda kontroller").

## Översikt

| # | Risk | Sannolikhet | Konsekvens | Restrisk |
|---|---|---|---|---|
| 1 | Agenten tar bort eller stänger av tester | Låg | Hög | **Låg–Medel** |
| 2 | Säkerhetsfel i genererad eller äldre kod som inga automatiska kontroller fångar | Hög | Hög | **Hög** |
| 3 | Felaktiga eller föråldrade uppgifter tas för sanning | Hög | Medel | **Medel** |
| 4 | Agenten körs lokalt utan sandlåda och kan skada eller läcka | Låg–Medel | Hög | **Medel** |
| 5 | Kostnad och tid skenar utan gräns | Medel | Medel | **Medel** |

Rangordningen är min bedömning och ska fastställas av användaren. Risk 2 är den enda som har **bekräftade, ännu orättade fel** i projektet.

## Risk 1: Agenten tar bort eller stänger av tester

| | |
|---|---|
| **Vad kan gå fel** | Ett test tas bort eller hoppas över (`.skip`) för att få gröna resultat, så att ett fel döljs |
| **Sannolikhet: Låg** | Inget spontant försök är känt i projektets underlag. Det enda försöket under arbetet var planterat av mig (Session 17) och blockerades. *Bedömning* |
| **Konsekvens: Hög** | Ett dolt fel gör hela verifieringen opålitlig. *Bedömning* |
| **Belägg** | `test-guard.js` i `main-guard.js`, ADR 0001, commit `e3dbda2`. **Körd:** `.skip` blockerades (Session 17) och riggens tester är 193 av 193 |
| **Upptäckt** | Hooken blockerar med exit 2 och en orsak. Mutationsprov 52/52 och 37/37 (enligt dokument) |
| **Hur det hanteras idag** | `test-guard`, `ask` för `jest.config.js` och `pytest.ini` (enligt dokument), och regeln i `CLAUDE.md` att tester aldrig tas bort för att få godkänt |
| **Kvarvarande risk: Låg–Medel** | Spärren är mönsterbaserad och ingen sandlåda. Kända luckor (`main-guard.js` och ADR 0001): glob i `find -name` (M1), `xargs -I{}` (M2), överskrivning med `cp` och omdirigering, `git checkout`/`restore`/`stash` av ocommittade tester, `pwsh -Command`. Hooks körs inte på en PR som någon annan skrivit (körd: `kontroller.md`, avsnitt B) |

## Risk 2: Säkerhetsfel som inga automatiska kontroller fångar

| | |
|---|---|
| **Vad kan gå fel** | SQL-injektion, saknad behörighet, läckande felmeddelanden, hemligheter i koden eller en async-handler som kraschar processen |
| **Sannolikhet: Hög** | Flera bekräftade fel finns redan: F1 och F14 (SQL-injektion via rabattkoden) och F3 (en header stoppar API:t), provade med körning (enligt dokument, Session 16). I testet missade automatiken 5 av 7 planterade fel. *Bedömning från de observationerna* |
| **Konsekvens: Hög** | Säkerhetshål i kod som används. *Bedömning* |
| **Belägg** | **Körd:** planterade fel (Session 17): bara 2 av 7 fångades av en kontroll (lint och `check-code.js`), 5 bara av manuell granskning. R11-granskningen: 22 av 23 fynd manuella (enligt dokument) |
| **Upptäckt** | `granskare` med `granska-standard`. Blind granskning: 7 av 7 planterade fel hittades (körd). Lint och `check-code.js` för enklare fel |
| **Hur det hanteras idag** | Review-fasen före commit, standardreglerna S1–S18 och användarens godkännande av varje moment |
| **Kvarvarande risk: Hög** | S1–S17 finns inte som ESLint-regler och ingen hemlighetsskanning finns (`kontroller.md`, avsnitt C). F1, F14 och F3 är **inte rättade**. Granskningen är läsande, och bara en modell har provats |

## Risk 3: Felaktiga eller föråldrade uppgifter tas för sanning

| | |
|---|---|
| **Vad kan gå fel** | En agents sammanfattning, en statusrad eller ett dokument är fel eller gammalt och ingen märker det |
| **Sannolikhet: Hög** | Observerat flera gånger under Session 17 (se Belägg). *Bedömning* |
| **Konsekvens: Medel** | Felaktiga beslut och en rapport som inte stämmer med projektet (R23 kräver att den stämmer). *Bedömning* |
| **Belägg** | **Körd:** granskarens sammanfattning stämde inte med dess egen tabell. Statusrader i `session-17` och `PLAN.md` blev föråldrade efter commit. Två fel i mina egna utkast ("inga stoppvillkor" och "6 av 11 rader") upptäcktes i granskning. `requirements.md` avsnitt 7 är daterat 16 november och föråldrat. Kostnadssiffror har stämts av mot CSV:n (se `krav-bevis.md`) |
| **Upptäckt** | Review mot filerna, att huvudsessionen kör kommandon själv, och `verifierare` som redovisar exakta kommandon. Sessionsminnet påminner om att kontrollera mot filerna (körd i `/clear`) |
| **Hur det hanteras idag** | Regler i `CLAUDE.md` ("påstå aldrig att något fungerar om det inte har verifierats"), uppdelningen mellan `granskare` och `verifierare`, och märkning av mätt och uppskattat |
| **Kvarvarande risk: Medel** | Ingen automatisk kontroll av att dokumentation, filhänvisningar och radnummer stämmer med koden (`kontroller.md`, avsnitt C). Rättningen är manuell. En logg som beskriver sin egen commit blir föråldrad av commiten |

## Risk 4: Agenten körs lokalt utan sandlåda

| | |
|---|---|
| **Vad kan gå fel** | Rekursiv borttagning, force-push, läsning av `.env`, eller ett skript som gör något spärren inte tolkar |
| **Sannolikhet: Låg–Medel** | Blockeringar förekommer i testet (`rm -rf`, körd), men ingen skada är känd i det underlag som lästs. *Bedömning* |
| **Konsekvens: Hög** | Dataförlust eller utläckta hemligheter. *Bedömning* |
| **Belägg** | Ingen sandbox eller container är konfigurerad (`sandbox` saknas i `.claude/settings.json`, körd). Behörigheter: allow 29, ask 49, deny 28 (körd). `main-guard.js` blockerade `rm -rf` (körd, Session 17) |
| **Upptäckt** | Hookens block med orsak, `ask`-frågor och riggens tester |
| **Hur det hanteras idag** | `main-guard.js` (hemlighetsfiler, `rm -r`, force-push, `reset --hard`), `agent-guard.js` (läsläge för `granskare` och `verifierare`), och `CLAUDE.md` kräver separat godkännande för commit, push, taggning och borttagning |
| **Kvarvarande risk: Medel** | "Spärren bygger på mönster och är ingen sandlåda. Skript, `bash -c` och variabler tolkas inte" (`main-guard.js`). Om `node` inte startar blockeras anropet inte. **Falska larm:** tre ofarliga anrop blockerades (körd, Session 17). Att ändra spärren är en säkerhetsändring som kräver godkännande |

## Risk 5: Kostnad och tid skenar utan gräns

| | |
|---|---|
| **Vad kan gå fel** | Långa sessioner med stor kontext blir dyra, och kostnaden syns först efteråt |
| **Sannolikhet: Medel** | Långa sessioner förekommer, men det finns ingen gräns att mäta mot, så ett överskridande kan inte konstateras. *Bedömning* |
| **Konsekvens: Medel** | Kostnad och tid. För ett team på fem multipliceras den. *Bedömning* |
| **Belägg** | `metrics/arbetsmoment.csv`, **avstämd** mot transkript och mot loggarna (`krav-bevis.md`, "Avstämning av kostnadssiffrorna"). Längsta sessionen (`344b232c`): 898,5 min vägg, 83 002 435 cache-läsningar, **20,30 USD (uppskattning)**. De 12 raderna: **99,38 USD (uppskattning)**, summerade över de 10 rader som har kostnad (summan av de avrundade raderna är 99,37). Med den pågående sessionen som ögonblicksbild (4,46 USD, 18 november 14:33 UTC) cirka 103,84 USD, inte ett slutvärde |
| **Upptäckt** | `record-metrics.js` skriver tid, tokens och uppskattad kostnad per session. CSV-tokens stämmer med transkripten för 10 sessioner (körd). Statuslinjen visar gränsförbrukning |
| **Hur det hanteras idag** | `maxTurns` per agent (30–80), små uppgifter i taget, sessionsminne och `/clear` |
| **Kvarvarande risk: Medel** | **Ingen gräns för kostnad, tid eller antal omförsök är konfigurerad.** Mätningen är per session och inte per moment, och kostnaden är Claude Codes uppskattning. `maxTurns` är läst ur konfigurationen och inte provat |

## Införda kontroller (finns idag)

Det här är kontroller som finns i projektet. Läget säger hur de är belagda.

| Kontroll | Hanterar risk | Läge |
|---|---|---|
| `CLAUDE.md`, `docs/standard.md`, `docs/prompt-template.md` | 2, 3 | Fil läst |
| `npm run lint`, `typecheck`, `format:check` och hooken `check-code.js` (PostToolUse, Stop) | 2 (bara enklare fel) | **Körd** |
| `main-guard.js` (PreToolUse) med `test-guard.js` | 1, 4 | **Körd** (`.skip` och `rm -rf` blockerades) |
| `agent-guard.js` (läsläge i `granskare` och `verifierare`) | 4 | Fil läst. Granskarens läsning av `FETCH_HEAD` provades (körd) |
| Behörigheter i `.claude/settings.json` (allow 29, ask 49, deny 28) | 4 | **Körd** (räknat) |
| `session-memory.js` (SessionStart, PreCompact) | 3 | **Körd** (`/clear`) |
| `record-metrics.js` (SessionStart, SessionEnd) | 5 | **Körd** (tokens avstämda mot transkript) |
| Skills `tdd`, `planera`, `granska-standard`, `karakterisera` och subagenterna (`maxTurns` 30–80) | 2, 3, 5 | Fil läst. Riggens tester körda (193 av 193) |
| Granskning och sammanslagning via pull requests (#1–#5) | 2, 3 | **Körd** (`git log`). Att granskare krävs eller att grenskydd finns på GitHub är **inte kontrollerat** |

## Föreslagna teamåtgärder (finns inte än)

Allt i det här avsnittet är **förslag och bedömningar**. Inget av det är genomfört eller provat.

### Det som införs först (vecka 1–2)

| Steg | Förslag | Varför först | Ersätter eller kompletterar |
|---|---|---|---|
| 1 | Gemensamma regler: `CLAUDE.md`, `docs/standard.md`, `docs/prompt-template.md` | Billigast, ingen teknik, ger samma arbetssätt | Redan införda filer. Det nya är att alla fem följer dem |
| 2 | `lint`, `typecheck` och `format:check` som **CI-steg** | Hooks körs bara i Claude Code-sessioner, och en PR från någon annan har inte passerat dem. `.github/` saknas (körd) | **Nytt**, finns inte idag |
| 3 | `main-guard.js` med `test-guard.js` och behörigheterna för alla | Hanterar risk 1 och 4 | Införd för projektet, ska införas hos varje utvecklare |
| 4 | PR-mall med fyndtabellen från `granska-standard` och körinstruktionen `docs/examination/kor-granskning-okand-pr.md` | Gör granskning likadan oavsett vem som skrivit koden | **Ny** PR-mall. Körinstruktionen finns, delvis provad |

### Det som kan vänta, och varför

| Del | Varför det kan vänta |
|---|---|
| Skills `tdd`, `planera`, `karakterisera` | Ger nytta först när stegen ovan sitter. Det är en arbetssättsfråga |
| Subagenter med `agent-guard.js` | Mer komplexa att förstå och underhålla. Kända luckor (risk 1 och 4) bör vara hanterade först |
| `record-metrics.js` och `session-memory.js` | Värdefulla men inte säkerhetskritiska. Mätningen är per session och saknar pris per modell |
| Åtgärder för F1, F14 och F3, och ESLint-regler för S1–S17 | Kräver egna moment och beslut |

### Ansvar, granskning och översyn (förslag)

| Fråga | Förslag | Läge |
|---|---|---|
| Vem ansvarar | En namngiven **rigg-ägare** och en ersättare. Ägaren äger `CLAUDE.md`, `.claude/` och `docs/standard.md` | Förslag |
| Hur ändringar i riggen granskas | Alla ändringar via PR med minst en granskare utöver författaren, och gröna riggtester (`node --test`, 193 av 193 idag). En hook-ändring provas med de planterade felen (`docs/examination/r10-testgren/planterade-fel.patch` kan återanvändas som regressionsprov) | Förslag. Patchen finns och är provad som patch, men ingen rutin är inrättad |
| Hur ofta riggen ses över | Efter varje felaktigt block eller missad upptäckt, och vid varje ny modell- eller verktygsversion. Modellbytet från Opus 5.5 till Sonnet 5.5 skedde utan att riggen ändrades (mätt, `krav-bevis.md`). Därutöver en kort genomgång varje sprint | Förslag |
| Mått för att gå vidare | Riggtesterna gröna, planterade fel upptäckta (7 av 7 idag) och antal falska larm per vecka | Förslag. Tröskelvärdena är inte provade |
| Gräns för kostnad och tid | En budget per utvecklare och sprint, och en regel för när en session avslutas | Förslag. Inget sådant finns (risk 5) |
| Grenskydd och krav på granskare på `main` | Slå på det på GitHub | Förslag. Nuvarande inställning är inte kontrollerad |

### Vad som går att återanvända vid byte av modell eller verktyg (bedömning)

| Återanvänds direkt | Delvis | Hänger på Claude Code |
|---|---|---|
| `docs/standard.md`, `docs/plans/`, ADR, `docs/api.md`, sessionsloggar, tester, `eslint.config.js`, `.prettierrc.json`, `tsconfig.json`, fyndtabellen och checklistan i `granska-standard` | Texten i `CLAUDE.md`, skills och agentbeskrivningar. Innehållet går att flytta, men format och filnamn är verktygsspecifika | Hookernas protokoll (stdin-JSON och exit 2), `settings.json` med `allow`/`ask`/`deny`, agenternas frontmatter (`tools`, `maxTurns`, `hooks`) och `record-metrics.js` (läser Claude Codes status och transkript) |

Det här är en bedömning av filformaten. Ingen annan modell eller något annat verktyg har provats.

## Vad som inte är belagt

- Sannolikhet och konsekvens är bedömningar. Ingen kvantitativ riskmodell eller incidentstatistik finns.
- Att inga incidenter har inträffat är inte kontrollerat mot alla sessionsloggar, bara mot det som lästs under arbetet med utkastet.
- Teamdelen bygger på projektets verifierade begränsningar (ingen CI, hooks bara i sessioner) men roller, tröskelvärden, frekvenser och mått är antaganden.
- Kostnaden är en uppskattning från Claude Code, och prisunderlag per modell saknas.
