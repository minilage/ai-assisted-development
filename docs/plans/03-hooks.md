# Plan: Återstående hooks – sessionsminne, Prettier för riggen, kodkontroller och spärr för huvudsessionen

**Status:** Godkänd och genomförd. Steg 1–4 är klara, committade och pushade: steg 1 i `5e9832e`, steg 2 i `e0e8672`, massformateringen i `a7ed197`, steg 3 i `991bd26` och steg 4 i `7564f3c`. Kända luckor i steg 4 finns i `sessions/session-11-2026-11-16.md`.
**Datum:** 2026-11-15
**Underlag:** `PLAN.md:19` ("Minst fem hooks, inklusive hantering av sessionsminne"), `PLAN.md:21` ("Automatiska kontroller för kodstandard, formatering och typkontroll"), `PLAN.md:74`, `PLAN.md:79`, `PLAN.md:92` och `PLAN.md:96` (nästa arbetsmoment 1). Uppdelningen i fyra steg och ordningen är redan beslutade av användaren i uppdraget till planeraren.

## Mål

När momentet är klart ska riggen ha:

1. **Sessionsminne:** en SessionStart-hook som vid `startup`, `clear`, `resume` och `compact` lägger in en kort sammanfattning i kontexten, och en PreCompact-hook som påminner om att spara det viktiga i `sessions/`.
2. **Prettier för riggen:** `format` och `format:check` i `package.json` omfattar också `.claude/**/*.js`.
3. **Kodkontroller:** en PostToolUse-hook som kör `prettier --check` och `eslint` på en ändrad `.ts`- eller `.js`-fil, och en Stop-hook som kör `npm run typecheck` när `src/` eller `tests/` har ändrats. Kontrollerna rapporterar och ändrar aldrig filer.
4. **Spärr för huvudsessionen:** en PreToolUse-hook, `main-guard.js`, som fångar varianter av farliga kommandon som behörighetsreglerna missar.

Varje steg byggs med TDD (`node --test`), avslutas med en riktig körning och följs av ett stopp.

Ingår inte:
- att formatera riggens befintliga JS-filer med `prettier --write` (öppen fråga 1)
- de 15 befintliga filerna i `src/` och `tests/` med formateringsfel (`PLAN.md:74`)
- att ändra `agent-guard.js`, agenterna, `record-metrics.js` eller `statusline.js`. Undantag: `RIG_PROTECTED` i `agent-guard.js` utökas i steg 4 (beslut om öppen fråga 8, 2026-11-16).
- att lägga till `.claude/` i `npm run lint` eller `npm run typecheck`
- commit och push

## Research

**Om radnumren (uppdaterat 2026-11-16):** Research-avsnittet beskriver läget vid researchen, före steg 1. Hänvisningar till kod och konfiguration (`agent-guard.js`, `record-metrics.js`, `settings.json`, `agents.test.js` med flera) är kontrollerade och rättade till de nuvarande raderna efter massformateringen (`a7ed197`) och hooksen i steg 1 och 3. Hänvisningar till `PLAN.md` är inte ändrade. De gäller `PLAN.md` i commit `6b6ae2d`, som var den aktuella versionen vid researchen. Hänvisningarna till sessionsloggarna är kontrollerade och stämmer.

### Befintlig kod (verifierad)

- **`.claude/settings.json`** hade vid researchen två hooks (avsnittet `hooks` var då `:6-29`, nu `:6-73`): `SessionEnd` (`:7-17`) kör `record-metrics.js end` och `SessionStart` (`:18-28`) kör `record-metrics.js start`. Ingen av dem har `matcher`. `statusLine` (`:2-5`) är ingen hook.
- **`.claude/settings.local.json`** innehåller inget `hooks`-avsnitt (sökning efter "hooks" gav ingen träff). Filen är ignorerad i Git (`.gitignore`).
- **`.claude/hooks/record-metrics.js:19-20`:** hooken skriver aldrig till stdout, eftersom det vid SessionStart skulle hamna i kontexten, och avslutar alltid med kod 0 (`:379-384`). En ny SessionStart-hook som skriver till stdout krockar alltså inte med den. Filen anropar `main()` direkt när den läses in (`:379-383`) och kan inte läsas in med `require` i ett test.
- **`.claude/hooks/agent-guard.js`:**
  - `parse` (`:25-97`) delar upp ett kommando i delkommandon. Den returnerar `{ unsafe }` vid kommandosubstitution, backticks (`:50`), omdirigering till fil (`:81`), `<` (`:89`) och citattecken som inte stängs (`:93`). Då finns inga `segments` att analysera.
  - `mentionsSecret` (`:118-130`) känner igen `.env`, `.env.*` utom `.env.example`, `*.pem` och `*.key`, även som glob.
  - Båda exporteras (`:447`). Körningen ligger bakom `require.main === module` (`:449`), så filen kan läsas in av `main-guard.js` utan sidoeffekter.
  - `RIG_PROTECTED` (`:377-381`) skyddar bara `.claude/agents/`, `.claude/hooks/agent-guard*` och `.claude/settings*.json` mot `utvecklare`. Nya hookskript som `main-guard.js` och `check-code.js` skyddas inte.
- **Registreringen av `agent-guard`:** en gång per agent, i frontmatter under `hooks.PreToolUse`, med matcher `"Bash|Read|Grep|Glob|Write|Edit|NotebookEdit"`:
  - `.claude/agents/granskare.md:11-15`, läge `read`
  - `.claude/agents/planerare.md:11-15`, läge `plans-write`
  - `.claude/agents/utvecklare.md:11-15`, läge `dev`
  - `.claude/agents/verifierare.md:10-14`, läge `checks`

  Den finns inte i `settings.json`.
- **`.claude/agents/agents.test.js:179-185`** kontrollerar att varje hookkommando som pekar på `.claude/hooks/*.js` pekar på en fil som finns. Den gäller agenternas frontmatter.
- **`package.json:12-15`:** `lint` är `eslint src tests`, `typecheck` är `tsc --noEmit`, och `format` och `format:check` gäller `"src/**/*.ts" "tests/**/*.ts"`.
- **`tsconfig.json`:** `include` omfattar `src`, `tests` och `scripts`, inte `.claude/`.
- **`.prettierrc.json`:** `semi: true`, `singleQuote: false`, `printWidth: 100`, `trailingComma: "all"`.
- **`eslint.config.js`:** `js.configs.recommended` och `tseslint.configs.recommended`, utan `files`-avgränsning och utan `globals`. I `node_modules/@typescript-eslint/eslint-plugin/dist/configs/flat/recommended.js` gäller `@typescript-eslint/no-require-imports: 'error'` för alla filer. Undantagen från `eslint-recommended` (till exempel `no-undef: off`) gäller bara `**/*.ts` och liknande (`eslint-recommended-raw.js`). Se fynd 1 nedan.
- **Verktyg som finns lokalt:** `node_modules/prettier/bin/prettier.cjs`, `node_modules/eslint/bin/eslint.js` och `node_modules/.bin/tsc`. Paketet `globals` finns som indirekt beroende (`node_modules/globals`), men inte i `package.json`.
- **Riggens JS-filer** enligt `git ls-files .claude`: `.claude/statusline.js`, `.claude/statusline.test.js`, `.claude/hooks/agent-guard.js`, `.claude/hooks/agent-guard.test.js`, `.claude/hooks/record-metrics.js`, `.claude/hooks/record-metrics.test.js`, `.claude/agents/agents.test.js` och `.claude/skills/skills.test.js`, alltså 8 filer.
- **`PLAN.md:40-97`** är avsnittet "Aktuell status", ungefär 5 600 byte. "Nästa arbetsmoment" (`PLAN.md:94-97`) är ett underavsnitt (`###`) i "Aktuell status" (`##`), inte ett eget avsnitt.
- **Senaste sessionsloggen** är `sessions/session-08-2026-11-15.md`. Namnen börjar med `session-NN-`, där NN har två siffror. `session-01-forberedelser.md` saknar datum.

### Dokumentation och tidigare sessioner (verifierad)

- `CLAUDE.md`, tabellen "Tester och verifiering": hooks ska testas så att de aktiveras och ger rätt resultat vid både tillåtna och otillåtna åtgärder.
- `sessions/session-08-2026-11-15.md:39`: hooks i `settings.json` körs även för subagenternas verktygsanrop. Hooks i frontmatter körs bara i en betrodd arbetsyta. `main-guard` och `check-code` kommer alltså att köras för både huvudsessionen och agenterna.
- `sessions/session-08-2026-11-15.md:417`: deny-reglerna kontrolleras före hooken. En PreToolUse-hook blir alltså den andra spärren när en deny-regel redan matchar.
- `sessions/session-08-2026-11-15.md:136`: `npx prettier --check` underkände de nya filerna och `record-metrics.js`. Ingenting formaterades.
- `sessions/session-07-2026-11-15.md:189`: `node --test <katalog>` fungerar inte i Node 24. Testfilerna måste anges en och en. Kommentaren i `.claude/hooks/record-metrics.test.js:1` anger fortfarande `node --test .claude/hooks/`.
- `PLAN.md:89`: `utvecklare` får inte ändra `settings.json` eller `agent-guard`. Arbetet med riggen görs därför i huvudsessionen. Det gäller också det här momentet.

### Behövs en omstart när hooks läggs till i `settings.json`?

**Okänt utifrån projektets filer.** Det som är dokumenterat:
- Behörighetsreglerna i `settings.json` började gälla direkt, utan omstart (`sessions/session-04-2026-11-15.md:55`).
- Nya agenter i `.claude/agents/` lästes inte in i en pågående session, och en omstart behövdes (`sessions/session-08-2026-11-15.md:188` och `:326`).
- Ingen session har prövat att lägga till hooks i en session som pågår. Hooksen för mätningen skapades och verifierades med `/clear` (Session 06), men det framgår inte om de lästes in utan omstart.

**Kontroll i varje steg som ändrar `settings.json`:**
1. Direkt efter ändringen: öppna `/hooks` och se om den nya hooken finns i listan.
2. Utlös hooken (för steg 1 med `/clear`, för steg 3 med en Edit och för steg 4 med ett kommando som ska blockeras) och se om den körs.
3. Om den inte körs: starta om Claude Code och upprepa.
4. Skriv i sessionsloggen vilket av fallen som gällde.

För SessionStart räcker inte en lyckad körning efter `/clear` som bevis för att hooks läses in utan omstart. Det beror på om `/clear` läser in inställningarna på nytt, och det är inte känt.

### Upptäckt under researchen

1. **ESLint underkänner troligen alla riggens JS-filer.** Verifierat i konfigurationen men inte kört (planeraren får inte köra `eslint`). `@typescript-eslint/no-require-imports` gäller också `.js`, och `no-undef` från `js.configs.recommended` är inte avstängt för `.js`. Inga Node-globaler (`require`, `process`, `__dirname`) är definierade. Om PostToolUse-hooken kör `eslint` på `.claude/**/*.js` avslutar den då med exit 2 efter varje ändring av en riggfil. Se öppen fråga 2.
2. **Motsägelse om commit.** `PLAN.md:54` säger att Session 08 med subagenter och `agent-guard` inte är committad. `git log` visar commit `6b6ae2d` "Add four subagents with agent-guard PreToolUse hook", och `git show --stat 6b6ae2d` visar agenterna, `agent-guard.js`, testerna, `docs/plans/02-health-test.md` och `sessions/session-08-2026-11-15.md`. `PLAN.md` är alltså inte uppdaterad.
3. **Olika sätt att räkna hooks.** `PLAN.md:70` och `:79` räknar `agent-guard` som en hook och kommer fram till "tre av fem". Räknat som registreringar finns redan sex (två i `settings.json` och fyra i frontmatter). Se avsnittet om antal hooks och öppen fråga 6.
4. **"Kort" sammanfattning.** Hela "Aktuell status" är cirka 5 600 byte (`PLAN.md:40-97`) och innehåller redan "Nästa arbetsmoment". Om båda tas med ordagrant blir sammanfattningen varken kort eller fri från dubbletter. Se öppen fråga 3.
5. **`parse` passar inte rakt av för huvudsessionen.** Den ger `unsafe` för `>`, `$(...)` och backticks (`agent-guard.js:50`, `:81`). I PowerShell är backtick ett escape-tecken. `main-guard` behöver ett eget beslut om vad som händer när `parse` inte kan dela upp kommandot. Se öppen fråga 7.
6. **Nya hookskript skyddas inte mot `utvecklare`.** `RIG_PROTECTED` (`agent-guard.js:377-381`) omfattar inte `main-guard.js` och `check-code.js`. Se öppen fråga 8.
7. **Falskt positivt i `agent-guard` under den här researchen.** `find .claude -name "*.js" -not -path "*/node_modules/*"` blockerades som "filer med hemligheter". Den sista delen av `*/node_modules/*` är `*`, och som glob matchar den `server.key` (`agent-guard.js:125-129`). Det påverkar inte planen, men samma sak händer om `main-guard` använder `mentionsSecret` på varje ord. Testerna i steg 4 ska ta med det fallet (kriterium 4.6).
8. **Kommentaren i `record-metrics.test.js:1`** är fel (se ovan). Den rättas inte i det här momentet.

### Antaganden (inte verifierade)

- Att SessionStart-hookens stdout, eller JSON med `hookSpecificOutput.additionalContext`, hamnar i Claudes kontext. Det stämmer med kommentaren i `record-metrics.js:19-20`, men är inte prövat i projektet.
- Att PreCompact-hookens utdata når Claude eller användaren. Det är okänt. Det prövas med `/compact` i steg 1.
- Att PostToolUse med exit 2 visar stderr för Claude, och att Stop med exit 2 får Claude att fortsätta i stället för att stanna.
- Att indata till Stop innehåller `stop_hook_active`.
- Att verktyget i huvudsessionen heter `PowerShell` i hookens `tool_name`, som i behörighetsreglerna (`settings.json:90-99`).
- Att det finns en gräns för hur mycket text en hook kan lägga in i kontexten. Storleken är inte känd.

## Antal hooks och hooktyper

Tre begrepp hålls isär:
- **Händelsetyp:** när Claude Code kör hooken, till exempel SessionStart.
- **Registrerad hook:** varje kommando under `hooks` i `settings.json` eller i en agents frontmatter.
- **Hookskript:** varje körbar fil i `.claude/hooks/` (testfiler räknas inte).

| | Före (verifierat) | Efter steg 1 | Efter steg 2 | Efter steg 3 | Efter steg 4 |
|---|---|---|---|---|---|
| **Händelsetyper** | 3: SessionStart, SessionEnd, PreToolUse (bara i frontmatter) | 4: + PreCompact | 4 | 6: + PostToolUse, Stop | 6: PreToolUse finns nu också i `settings.json` |
| **Registrerade hooks i `settings.json`** | 2: `record-metrics.js end` (SessionEnd), `record-metrics.js start` (SessionStart) | 4: + `session-memory.js start` (SessionStart), `session-memory.js precompact` (PreCompact) | 4 | 6: + `check-code.js post` (PostToolUse, Edit/Write), `check-code.js stop` (Stop) | 7: + `main-guard.js` (PreToolUse) |
| **Registrerade hooks i frontmatter** | 4: `agent-guard.js` med `read`, `plans-write`, `dev` och `checks`, en per agent | 4 | 4 | 4 | 4 |
| **Registrerade hooks totalt** | 6 | 8 | 8 | 10 | 11 |
| **Hookskript i `.claude/hooks/`** | 2: `record-metrics.js`, `agent-guard.js` | 3: + `session-memory.js` | 3 | 4: + `check-code.js` | 5: + `main-guard.js` |
| **Hooks räknade som funktioner** (händelse och syfte) | 3: mätning vid start, mätning vid slut, `agent-guard` | 5: + sessionsminne vid start, påminnelse före komprimering | 5 | 7: + kontroll efter ändring, typkontroll vid Stop | 8: + spärr för huvudsessionen |

Steg 2 ändrar bara `package.json` och lägger inte till någon hook.

**Kravet "minst fem hooks, inklusive hantering av sessionsminne"** (`PLAN.md:19`):
- Räknat som funktioner, som `PLAN.md:70` gör, är kravet uppfyllt efter steg 1 (5) och har marginal efter steg 4 (8). Sessionsminnet ingår genom SessionStart och PreCompact.
- Räknat som hookskript uppfylls kravet först efter steg 4 (5).
- Räknat som händelsetyper uppfylls det efter steg 3 (6).
- Räknat som registreringar var det i praktiken redan uppfyllt (6), men det beror på att `agent-guard` räknas fyra gånger. Det är inte ett rimligt mått.

Förslaget är att `PLAN.md` redovisar både funktionerna och hookskripten, och att kravet bockas av först efter steg 4. Då gäller det oavsett hur man räknar. Se öppen fråga 6.

## Acceptanskriterier

### Steg 1: Sessionsminne

1.1 **Givet** att `PLAN.md` har avsnittet `## Aktuell status` med underavsnittet `### Nästa arbetsmoment`, att `sessions/` innehåller loggar och att projektet är ett Git-arkiv, **när** `session-memory.js start` körs med SessionStart-indata och `source` är `startup`, `clear`, `resume` eller `compact`, **så** avslutar den med exit 0 och skriver till stdout en sammanfattning som innehåller:
- en rad som anger källan, till exempel `Sessionsminne från .claude/hooks/session-memory.js (SessionStart, källa: clear)`
- en förkortad version av "Aktuell status" (öppen fråga 3)
- hela "Nästa arbetsmoment"
- namnet på den senaste filen i `sessions/`
- utdata från `git status --short`

1.2 **Givet** att `PLAN.md` saknas, **när** hooken körs, **så** avslutar den med exit 0, skriver att `PLAN.md` saknas och tar ändå med sessionsfilen och `git status`. Ingen stackspårning skrivs.

1.3 **Givet** att `PLAN.md` finns men saknar `## Aktuell status`, eller saknar `### Nästa arbetsmoment`, **när** hooken körs, **så** avslutar den med exit 0 och skriver att avsnittet saknas. Övriga delar tas med.

1.4 **Givet** att `sessions/` saknas eller är tom, **när** hooken körs, **så** står det att ingen sessionslogg hittades, och hooken avslutar med exit 0.

1.5 **Givet** sessionsfilerna `session-01-forberedelser.md`, `session-09-…` och `session-10-…`, **när** hooken väljer den senaste, **så** väljs `session-10-…`. Valet görs på numret i namnet och inte på ändringstiden.

1.6 **Givet** att `git` inte går att köra eller att katalogen inte är ett Git-arkiv, **när** hooken körs, **så** står det att `git status` inte kunde köras, och hooken avslutar med exit 0.

1.7 **Givet** stdin som inte är giltig JSON, eller utan `source`, **när** hooken körs, **så** avslutar den med exit 0 och skriver sammanfattningen med källan `okänd`.

1.8 **Givet** att "Aktuell status" är längre än gränsen (öppen fråga 3), **när** hooken körs, **så** kortas texten av vid gränsen och det står att den är förkortad och var hela texten finns (`PLAN.md`).

1.9 **Givet** PreCompact-indata, **när** `session-memory.js precompact` körs, **så** avslutar den med exit 0, påminner om att spara pågående uppgift, beslut, problem och nästa steg i `sessions/` och `PLAN.md` och blockerar aldrig komprimeringen.

1.10 **Givet** den uppdaterade `settings.json`, **när** filen läses, **så** finns SessionStart-hooken för `record-metrics.js start` kvar oförändrad, SessionEnd-hooken för `record-metrics.js end` finns kvar, och den nya SessionStart-hooken har matcher `startup|resume|clear|compact`.

1.11 **Riktig körning.** **Givet** att steg 1 är byggt, **när** användaren kör `/clear` och skriver `ready`, **så** finns sammanfattningen från hooken i kontexten. Claude redovisar status och nästa arbetsmoment, hänvisar till källraden från hooken och skiljer den från sådant som Claude själv har läst. Dessutom skrivs `metrics/arbetsmoment.csv` för sessionen som avslutades (kriterium 1.12).

1.12 **Givet** att `/clear` körs, **när** SessionEnd- och SessionStart-hooksen har körts, **så** har `metrics/arbetsmoment.csv` en ny eller uppdaterad rad för den avslutade sessionen med `avslut` = `clear`, och `.claude/metrics/live/errors.log` har inga nya rader.

### Steg 2: Prettier för `.claude/`

2.1 **Givet** den ändrade `package.json`, **när** man läser `format:check`, **så** är det `prettier --check "src/**/*.ts" "tests/**/*.ts" ".claude/**/*.js"`, och `format` är samma sak med `--write`.

2.2 **Givet** att riggens filer inte är formaterade, **när** `npm run format:check` körs, **så** underkänns kommandot, och utdata räknar upp de 15 kända filerna och de riggfiler som inte följer Prettier. Ingen fil ändras (samma md5 före och efter).

2.3 **Givet** att `.claude/metrics/live/` innehåller JSON och är ignorerad i Git, **när** `format:check` körs, **så** kontrolleras inga filer där.

### Steg 3: Kodkontroller

3.1 **Givet** en Edit eller Write av en `.ts`-fil som inte följer Prettier, **när** `check-code.js post` körs, **så** avslutar den med exit 2, och stderr anger filen och att `prettier --check` underkände den. Filen är oförändrad.

3.2 **Givet** en `.ts`-fil med ESLint-fel, **när** hooken körs, **så** avslutar den med exit 2, och stderr innehåller ESLint-felen med rad. Filen är oförändrad.

3.3 **Givet** en `.ts`- eller `.js`-fil som klarar båda kontrollerna, **när** hooken körs, **så** avslutar den med exit 0 och skriver ingenting.

3.4 **Givet** en fil med en annan ändelse, till exempel `.md` eller `.json`, **när** hooken körs, **så** avslutar den med exit 0 utan att köra Prettier eller ESLint.

3.5 **Givet** en fil utanför projektet, eller en fil som inte längre finns, **när** hooken körs, **så** avslutar den med exit 0 utan att köra något.

3.6 **Givet** valfri indata, **när** hooken bygger kommandona, **så** innehåller de aldrig `--write`, `--fix` eller `--fix-dry-run`.

3.7 **Givet** stdin som inte är giltig JSON, **när** hooken körs, **så** blockerar den inte. Den avslutar med exit 1 och ett kort meddelande på stderr.

3.8 **Givet** en `.js`-fil i `.claude/`, **när** hooken körs, **så** gäller det beteende som bestäms i öppen fråga 2. Det får inte vara exit 2 för filer som bara bryter mot `no-require-imports` eller `no-undef` för Node-globaler.

3.9 **Givet** Stop-indata med `stop_hook_active: true`, **när** `check-code.js stop` körs, **så** avslutar den med exit 0 utan att köra `typecheck`.

3.10 **Givet** att inga filer i `src/` eller `tests/` är ändrade enligt definitionen i öppen fråga 5, **när** Stop-hooken körs, **så** avslutar den med exit 0 utan att köra `typecheck`.

3.11 **Givet** att filer i `src/` eller `tests/` är ändrade och `npm run typecheck` underkänns, **när** Stop-hooken körs, **så** rapporteras felen enligt öppen fråga 4, med högst ett bestämt antal rader på stderr.

3.12 **Givet** att filer i `src/` eller `tests/` är ändrade och `npm run typecheck` godkänns, **när** Stop-hooken körs, **så** avslutar den med exit 0.

3.13 **Riktig körning.** En avsiktligt felformaterad rad läggs in med Edit i en provfil, och PostToolUse-meddelandet når Claude. Provfilen återställs sedan, och `git diff` visar att inget annat har ändrats. Stop-hooken körs efter ett svar, och `stop_hook_active` förhindrar en loop.

### Steg 4: Spärr för huvudsessionen

4.1 **Givet** Bash- eller PowerShell-anrop som läser hemliga filer, **när** `main-guard.js` körs, **så** avslutar den med exit 2 och anger orsaken på stderr. Exempel: `cat .env`, `type .env`, `head config/.env.local`, `less .env`, `Get-Content .env`, `gc .env`, `cat server.key`.

4.2 **Givet** rekursiv borttagning i andra former än deny-reglerna (`settings.json:170-171` och `:179`), **när** hooken körs, **så** blockeras anropet. Exempel: `rm -r -f x`, `rm -R -f x`, `rm --recursive --force x`, `rm -f -r x`, `Remove-Item -r x`, `Remove-Item x -Recurse -Force`, `ri -r x`, `rmdir /s x`.

4.3 **Givet** force-push i andra former (`settings.json:163-166` och `:173-175`), **när** hooken körs, **så** blockeras anropet. Exempel: `git push --force-with-lease`, `git push origin +main`, `git push -fu origin main`, `git -C . push -f`, `git --no-pager push --force`.

4.4 **Givet** `git reset --hard` skrivet på andra sätt (`settings.json:167` och `:176`), **när** hooken körs, **så** blockeras anropet. Exempel: `git -C . reset --hard`, `git --no-pager reset --hard`, `git -c x=y reset --hard`, `git reset HEAD~1 --hard`. Samma gäller `git clean -fdx` och `git -C . rebase`.

4.5 **Givet** Read, Grep eller Glob mot hemliga filer, **när** hooken körs, **så** blockeras anropet. `.env.example` tillåts.

4.6 **Givet** tillåtna åtgärder i huvudsessionen, **när** hooken körs, **så** avslutar den med exit 0. Exempel: `git status`, `git push origin main` (behörigheterna ställer sedan frågan), `rm fil.txt` (behörigheterna ställer frågan), `npm run lint`, `cat .env.example`, `echo x > ut.txt`, `git reset --soft HEAD~1` och `find . -not -path "*/node_modules/*"` (fyndet ovan).

4.7 **Givet** ett kommando som `parse` inte kan dela upp, till exempel med `$(...)`, backticks eller `>`, **när** hooken körs, **så** tillåts det (beslut om öppen fråga 7: alternativ A). Kommandot blockeras om råtexten nämner en hemlig fil eller innehåller ett av mönstren i 4.2–4.4. Ett commit-meddelande som skickas med `$(...)` och nämner till exempel `git push --force` blockeras därför. Det är ett accepterat falskt positivt (beslut 2026-11-16), och ett test visar beteendet.

4.8 **Givet** de verktygsanrop som varje agentläge tillåter i `agent-guard.test.js`, **när** `main-guard` körs på samma anrop, **så** tillåts de. Spärrarna krockar alltså inte.

4.9 **Givet** indata utan `tool_name` eller med ogiltig JSON, **när** hooken körs, **så** blockeras anropet med exit 2, på samma sätt som `agent-guard.js:413-414` och `:456-461`.

4.10 **Riktig körning.** **Givet** att steg 4 är byggt och aktivt, **när** Claude i huvudsessionen försöker köra ofarliga provkommandon, **så** blockeras de av `main-guard` och inte av behörighetsreglerna. Provkommandona får inte göra skada om spärren skulle missa, till exempel `cat finns-inte/.env`, `rm -r -f <scratchpad>/finns-inte`, `git push --force-with-lease finns-inte main` och `git -C <scratchpad>/inte-ett-arkiv reset --hard`. Meddelandet visar att det är `main-guard` som har blockerat. Ett tillåtet kommando som `git status` körs som vanligt.

4.11 **Givet** läget `dev` i `agent-guard`, **när** `utvecklare` gör Write eller Edit av en fil i `.claude/hooks/` (till exempel `main-guard.js`, `check-code.js`, `session-memory.js`, `record-metrics.js` eller en testfil), **så** blockeras anropet. Write och Edit i `src/` och `tests/` tillåts som förut. (Beslut om öppen fråga 8: alternativ B, 2026-11-16.)

4.12 **Givet** Write, Edit eller NotebookEdit mot en hemlig fil (`.env`, `.env.*`, `*.pem`, `*.key`), **när** `main-guard.js` körs, **så** blockeras anropet. `.env.example` tillåts. Deny-reglerna har bara `Edit(.env)` och `Edit(.env.*)`, inte Write. (Tillagt och godkänt 2026-11-16.)

## Lösning

### Steg 1: `.claude/hooks/session-memory.js`

- Ett skript med två lägen som argument: `start` och `precompact`. Det har inga beroenden.
- Rena funktioner exporteras, och körningen ligger bakom `require.main === module`, som i `agent-guard.js:447-449`:
  - `extractSection(text, heading)`: avsnittet till nästa rubrik på samma nivå eller högre.
  - `latestSession(files)`: högst nummer i `session-NN-`.
  - `buildSummary({ plan, sessions, gitStatus, source })`
  - `truncate(text, max)`
- Projektkatalogen tas från `CLAUDE_PROJECT_DIR`, sedan från `cwd` i indata och sist från `process.cwd()`.
- `git status --short` körs med `spawnSync("git", [...], { cwd, timeout })`, utan shell.
- Utdata ges som JSON med `hookSpecificOutput.additionalContext`, eller som ren text på stdout. Valet görs i Build efter en kontroll i dokumentationen. Båda sätten ska ge kontext enligt antagandet ovan. Den riktiga körningen avgör.
- Vid fel: exit 0, alltid.
- I `settings.json` läggs en ny post till i `SessionStart`, med matcher `startup|resume|clear|compact`, efter den befintliga posten. Posten för `record-metrics.js start` ändras inte. En ny händelse `PreCompact` läggs till. `timeout` är 10, som för de befintliga hooksen.
- Bortvalt: att ändra `record-metrics.js` så att den också skriver sammanfattningen. Det blandar två ansvar, och hooken får aldrig skriva till stdout (`record-metrics.js:19-20`).

### Steg 2: `package.json`

- `format` och `format:check` får tillägget `".claude/**/*.js"`. Inget annat ändras.
- Massformateringen av riggens 8 JS-filer görs inte utan ett separat beslut (öppen fråga 1). Utan den underkänns `format:check` för fler filer än tidigare. Det redovisas som väntat.

### Steg 3: `.claude/hooks/check-code.js`

- Två lägen: `post` och `stop`.
- `post`:
  - Läser `tool_input.file_path`, kontrollerar ändelsen (`.ts` eller `.js`) och att filen finns i projektet.
  - Kör `node node_modules/prettier/bin/prettier.cjs --check <fil>` och `node node_modules/eslint/bin/eslint.js <fil>` med `process.execPath` och `spawnSync`, utan shell och utan `npx`. Det undviker `.cmd`-problem på Windows och nätverksanrop.
  - Kommandona byggs i en ren funktion, `buildCommands(file)`, som testerna kan kontrollera (kriterium 3.6).
  - Vid fel: exit 2 och en kort sammanfattning på stderr.
- `stop`:
  - Vid `stop_hook_active` avslutar den direkt med exit 0.
  - Annars avgör den om `src/` eller `tests/` är ändrade (öppen fråga 5) och kör i så fall `tsc --noEmit` via `node node_modules/typescript/bin/tsc --noEmit`, vilket motsvarar `npm run typecheck` utan `npm` i en shell. Alternativet är `npm run typecheck` med `shell: true` på Windows. Valet görs i Build, och skillnaden redovisas.
- Körningen ska kunna injiceras, så att enhetstesterna inte behöver köra Prettier och ESLint på riktigt. Ett fåtal integrationstester kör de riktiga verktygen på filer i en tillfällig katalog med `--config` mot projektets konfiguration. Om ESLint vägrar filer utanför projektet hoppar testet över ESLint-delen och skriver det. Det ska inte se ut som ett godkänt test.
- `settings.json`: `PostToolUse` med matcher `Edit|Write` och `timeout` 30, och `Stop` med `timeout` 120. De exakta värdena bestäms efter mätning i den riktiga körningen.
- Bortvalt: `--fix` och `--write` (användarens beslut), och `lint-staged` eller `husky` (nya beroenden).

### Steg 4: `.claude/hooks/main-guard.js`

- `const { parse, mentionsSecret } = require("./agent-guard.js")`. Exporterna i `agent-guard.js` ändras inte. Den enda ändringen i `agent-guard.js` är `RIG_PROTECTED` (`:377-381`) och meddelandet (`:398`), enligt beslutet om öppen fråga 8.
- En spärrlista, inte en lista över vad som är tillåtet. Huvudsessionen ska kunna göra allt som behörighetsreglerna tillåter eller frågar om. Bara det som deny-reglerna försöker stoppa, men missar i andra former, blockeras.
- Delkommandon normaliseras med `path.basename`, gemener och utan `.exe`, som i `agent-guard.js:307-310`. Git-flaggor före underkommandot hoppas över, som i `gitSubcommand` (`agent-guard.js:290-301`). Funktionen kopieras till `main-guard.js` med en hänvisning till originalet (beslut om öppen fråga 9: alternativ A). En gemensam modul kan föreslås senare.
- När `parse` ger `unsafe` delas råtexten upp i ord vid blanksteg, citattecken, `$(`, `)` och backticks. Orden prövas mot hemliga filer, och texten prövas mot mönstren i 4.2–4.4 (beslut om öppen fråga 7: alternativ A).
- För PowerShell: kortformer (`gc`, `ri`, `rm`, `del`, `rd`, `type`, `cat`) och flaggor som förkortats (`-r`, `-rec`, `-Recurse`). Matchningen görs utan hänsyn till skiftläge.
- Utfall med `mentionsSecret`-falskt positivt för `*` (fynd 7): ord som börjar med `-` eller är argument till flaggor som `-path`, `-not` och `--exclude` prövas inte som filnamn. Exakt regel bestäms i Build och täcks av kriterium 4.6.
- `settings.json`: `PreToolUse` med matcher `Bash|PowerShell|Read|Grep|Glob|Write|Edit|NotebookEdit` och `timeout` 10.
- Bortvalt: att lägga spärren i `agent-guard.js` med ett nytt läge. Det ändrar en hook som redan är verifierad i alla fyra agentlägena och gör den större.

## Berörda filer

| Fil | Ändring | Varför |
|---|---|---|
| `.claude/hooks/session-memory.js` | ny (steg 1) | SessionStart och PreCompact |
| `.claude/hooks/session-memory.test.js` | ny (steg 1) | Kriterium 1.1–1.10 |
| `.claude/settings.json` | ändrad (steg 1, 3 och 4) | Registrering av de nya hooksen |
| `package.json` | ändrad (steg 2) | `format` och `format:check` |
| `.claude/hooks/check-code.js` | ny (steg 3) | PostToolUse och Stop |
| `.claude/hooks/check-code.test.js` | ny (steg 3) | Kriterium 3.1–3.12 |
| `.claude/hooks/main-guard.js` | ny (steg 4) | PreToolUse för huvudsessionen |
| `.claude/hooks/main-guard.test.js` | ny (steg 4) | Kriterium 4.1–4.9 och 4.12 |
| `sessions/session-09-2026-11-15.md` (datum enligt dagen) | ny | Sessionslogg för momentet |
| `PLAN.md` | ändrad efter varje godkänt steg | Status, antal hooks och rättelse av `PLAN.md:54` |
| `.claude/hooks/record-metrics.js` | bara läst | Får inte gå sönder |
| `.claude/hooks/agent-guard.js` | ändrad (steg 4): `RIG_PROTECTED` och meddelandet | `parse` och `mentionsSecret` återanvänds. Kriterium 4.11 |
| `.claude/hooks/agent-guard.test.js` | ändrad (steg 4): nya fall för 4.11 | Exempel på tillåtna anrop till kriterium 4.8 |
| `.claude/agents/*.md` | bara läst | Registreringen av `agent-guard` |
| `eslint.config.js` | bara läst, eller ändrad om öppen fråga 2 besvaras så | ESLint för `.js` i riggen |
| `.prettierrc.json`, `tsconfig.json` | bara lästa | Konfiguration för kontrollerna |
| `metrics/arbetsmoment.csv` | skrivs av den befintliga hooken | Kontrolleras i kriterium 1.12 |

Byggs i huvudsessionen och inte av `utvecklare`, eftersom `utvecklare` inte får ändra `settings.json` (`agent-guard.js:377-381`, `:397-398`, `PLAN.md:89`).

## Kräver separat godkännande

- **Säkerhetsinställningar:** steg 4 (`main-guard.js` och registreringen i `settings.json`) kräver ett eget godkännande före Build, enligt användarens beslut och `CLAUDE.md`.
- **Behörigheter och säkerhetsinställningar, i mindre grad:** steg 1 och 3 ändrar `settings.json`. Hooksen spärrar inget, men PostToolUse och Stop med exit 2 påverkar hur Claude arbetar. Det godkänns med respektive steg.
- **Massformatering** av riggens befintliga JS-filer med `prettier --write` (öppen fråga 1). Den är inte godkänd.
- **`eslint.config.js`** om öppen fråga 2 besvaras med en ändring. Det är en ändring av projektets konfiguration som inte ingår i uppdraget.
- **Ändring av `agent-guard.js`** om öppen fråga 8 eller 9 besvaras ja. Det är en säkerhetsinställning. Godkänt 2026-11-16 för `RIG_PROTECTED` i steg 4a (fråga 8, alternativ B). Exporten (fråga 9) görs inte.
- **Beroenden:** inga. `globals` ska inte läggas till i `package.json` utan godkännande.
- **Borttagning av filer:** inga. Provfilerna i den riktiga körningen ligger i scratchpad.
- **API-kontrakt och databasschema:** berörs inte.

## Testplan

Alla riggens tester körs med `node --test <fil>`, en fil i taget eller flera filer uppräknade, inte med en katalog (`sessions/session-07-2026-11-15.md:189`).

| Kriterium | Test som skrivs först | Fil | Kommando |
|---|---|---|---|
| 1.1 | `buildSummary` med en PLAN-text som innehåller båda avsnitten: källraden, nästa arbetsmoment, sessionsfilen och git-status finns i texten. Plus en körning med `spawnSync` och `source` för vart och ett av de fyra värdena: exit 0 och sammanfattningen på stdout. | `.claude/hooks/session-memory.test.js` | `node --test .claude/hooks/session-memory.test.js` |
| 1.2 | `spawnSync` med `CLAUDE_PROJECT_DIR` mot en tillfällig katalog utan `PLAN.md`: exit 0, "PLAN.md saknas", ingen `Error:` på stderr | samma | samma |
| 1.3 | Tillfällig `PLAN.md` utan `## Aktuell status`, och en utan `### Nästa arbetsmoment`: exit 0 och "saknas" | samma | samma |
| 1.4 | Tillfällig katalog utan `sessions/`, och med en tom `sessions/`: exit 0 och "ingen sessionslogg" | samma | samma |
| 1.5 | `latestSession(["session-01-forberedelser.md", "session-09-2026-11-15.md", "session-10-2026-11-16.md"])` ger `session-10-…` | samma | samma |
| 1.6 | Tillfällig katalog som inte är ett Git-arkiv: exit 0 och "git status kunde inte köras" | samma | samma |
| 1.7 | Stdin `inte json` och `{}`: exit 0 och källan `okänd` | samma | samma |
| 1.8 | `truncate` med en lång text: längden högst gränsen och en markering om förkortningen | samma | samma |
| 1.9 | `spawnSync` med `precompact`: exit 0, påminnelsen nämner `sessions/` och `PLAN.md`, aldrig exit 2 | samma | samma |
| 1.10 | Läser den riktiga `.claude/settings.json`: `record-metrics.js start` och `end` finns oförändrade, och `session-memory.js` finns under SessionStart med rätt matcher och under PreCompact | samma | samma |
| 1.11 | Riktig körning, se "Kontroller efter varje steg" | – | `/clear`, sedan `ready` |
| 1.12 | Riktig körning: `wc -l` och `md5sum` för `metrics/arbetsmoment.csv` före och efter `/clear`, raden för den avslutade sessionen med `avslut` = `clear`, och `errors.log` oförändrad | – | `git diff metrics/arbetsmoment.csv` |
| 2.1 | Om öppen fråga 10 besvaras ja: ett test som läser `package.json` och kontrollerar båda skripten. Annars kontrolleras det manuellt med `git diff package.json`. | `.claude/hooks/check-code.test.js` eller ingen fil | `node --test …` eller `git diff package.json` |
| 2.2 | Riktig körning: `md5sum` för riggens 8 JS-filer före och efter `npm run format:check`, och utdata räknar upp de 15 kända filerna och riggfilerna | – | `npm run format:check` |
| 2.3 | Utdata från `format:check` nämner ingen fil i `.claude/metrics/live/` | – | `npm run format:check` |
| 3.1 | Injicerad körning: Prettier ger kod 1, och `decidePost` ger exit 2 med filnamnet och "prettier". Plus ett integrationstest med en felformaterad `.ts`-fil i en tillfällig katalog och md5 oförändrad. | `.claude/hooks/check-code.test.js` | `node --test .claude/hooks/check-code.test.js` |
| 3.2 | Injicerad körning: ESLint ger kod 1 med utdata, och hooken ger exit 2 och utdata på stderr | samma | samma |
| 3.3 | Båda ger kod 0, så hooken ger exit 0 och tom stderr | samma | samma |
| 3.4 | `file_path` slutar på `.md`: ingen körning anropas, exit 0 | samma | samma |
| 3.5 | Sökväg utanför projektet och en fil som inte finns: ingen körning, exit 0 | samma | samma |
| 3.6 | `buildCommands` för `.ts` och `.js`: inga argument matchar `/^--(write|fix)/` | samma | samma |
| 3.7 | Stdin `inte json`: exit 1, aldrig exit 2 | samma | samma |
| 3.8 | Enligt öppen fråga 2, till exempel att en `.js`-fil i `.claude/` med `require` inte ger exit 2 | samma | samma |
| 3.9 | Stop-indata med `stop_hook_active: true`: ingen körning, exit 0 | samma | samma |
| 3.10 | Injicerad ändringskontroll som säger "inga ändringar": `tsc` anropas inte, exit 0 | samma | samma |
| 3.11 | Ändringar finns och `tsc` ger kod 2 med 200 rader: utfall enligt öppen fråga 4, stderr högst gränsen | samma | samma |
| 3.12 | Ändringar finns och `tsc` ger kod 0: exit 0 | samma | samma |
| 3.13 | Riktig körning, se nedan | – | Edit av en provfil, och sedan ett svar som avslutas |
| 4.1 | `decide` med Bash `cat .env` och PowerShell `Get-Content .env`, och resten av listan: blockeras med orsak | `.claude/hooks/main-guard.test.js` | `node --test .claude/hooks/main-guard.test.js` |
| 4.2 | Listan i 4.2: blockeras | samma | samma |
| 4.3 | Listan i 4.3: blockeras | samma | samma |
| 4.4 | Listan i 4.4: blockeras | samma | samma |
| 4.5 | Read `.env`, Grep med `glob: ".env*"`, Glob `**/*.pem`: blockeras. Read `.env.example`: tillåts. | samma | samma |
| 4.6 | Listan i 4.6: tillåts | samma | samma |
| 4.7 | `echo $(cat .env)` och `` echo `cat .env` ``: blockeras. `git status > ut.txt`: tillåts. Commit-meddelande med `$(...)` som nämner `git push --force`: blockeras (accepterat falskt positivt) | samma | samma |
| 4.8 | Tillåtna anrop från `agent-guard.test.js` i alla fyra lägena körs genom `main-guard` och tillåts | samma | samma |
| 4.9 | `spawnSync` med `inte json` och `{}`: exit 2 | samma | samma |
| 4.10 | Riktig körning, se nedan | – | Provkommandona i 4.10 |
| 4.11 | `decide("dev", Write/Edit av .claude/hooks/main-guard.js, check-code.js, session-memory.js, record-metrics.js och en testfil)`: blockeras. Write i `src/` och `tests/`: tillåts | `.claude/hooks/agent-guard.test.js` | `node --test .claude/hooks/agent-guard.test.js` |
| 4.12 | Write, Edit och NotebookEdit av `.env`, `config/.env.local`, `server.key` och `cert.pem`: blockeras. Write av `.env.example`: tillåts | `.claude/hooks/main-guard.test.js` | `node --test .claude/hooks/main-guard.test.js` |

Varje testfil skrivs före koden och körs först för att se att den underkänns (red) med en förväntad orsak, till exempel `Cannot find module`. Mutationer som i Session 08 föreslås för steg 4: till exempel att ta bort en regel och se att ett test underkänns.

### Kontroller efter varje steg

| Kontroll | Steg 1 | Steg 2 | Steg 3 | Steg 4 |
|---|---|---|---|---|
| `node --test .claude/hooks/record-metrics.test.js .claude/hooks/agent-guard.test.js .claude/statusline.test.js .claude/agents/agents.test.js .claude/skills/skills.test.js` | ja | ja | ja | ja |
| `node --test .claude/hooks/session-memory.test.js` | ja | ja | ja | ja |
| `node --test .claude/hooks/check-code.test.js` | – | – | ja | ja |
| `node --test .claude/hooks/main-guard.test.js` | – | – | – | ja |
| `npm run lint` | ja | ja | ja | ja |
| `npm run typecheck` | ja | ja | ja | ja |
| `npm run format:check` | ja (15 kända filer) | ja (15 kända filer och riggfilerna, om fråga 1 inte är godkänd) | ja | ja |
| `git status --porcelain` och `git diff --stat` före och efter | ja | ja | ja | ja |
| `/hooks` och kontroll av om en omstart behövs | ja | – | ja | ja |

### Riktiga körningar

- **Steg 1:**
  1. Notera `wc -l` och `md5sum` för `metrics/arbetsmoment.csv` och storleken på `.claude/metrics/live/errors.log`.
  2. Kontrollera `/hooks`.
  3. Användaren kör `/clear` och skriver `ready`.
  4. Claude redovisar status och nästa arbetsmoment och citerar källraden från hooken utan att läsa `PLAN.md` först. Claude ska skriva vad som kom från hooken och vad som eventuellt lästes efteråt.
  5. Kontrollera CSV-raden och `errors.log` (kriterium 1.12).
  6. Upprepa med `/compact`: se om PreCompact-påminnelsen syns, och för vem, och om SessionStart med `compact` ger sammanfattningen.
  7. Om det går: pröva `resume` i en ny session. Det är inte testat för mätningen i dag (`PLAN.md:91`).
- **Steg 2:** `npm run format:check`, md5 för riggfilerna före och efter, och listan med underkända filer.
- **Steg 3:**
  1. Edit av en provfil i `src/`, till exempel ett tillfälligt mellanslag i en ny fil som tas bort efteråt. Beslutet om var provfilen ska ligga tas före körningen, eftersom en ny fil i `src/` och borttagningen av den kräver godkännande.
  2. Se meddelandet från PostToolUse och att filen inte ändrades av hooken.
  3. Låt ett svar avslutas och se om Stop-hooken körde `typecheck` och om `stop_hook_active` förhindrade en loop.
  4. Mät tiden för båda.
- **Steg 4:** provkommandona i kriterium 4.10, bara i scratchpad och mot sökvägar som inte finns. `git status` före och efter visar att ingenting har ändrats. Om något provkommando inte stoppas avbryts körningen och det redovisas.

## Risker

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|---|---|---|---|
| ESLint underkänner alla JS-filer i riggen (`no-require-imports`, `no-undef`) | Hög (enligt konfigurationen, inte kört) | PostToolUse ger exit 2 efter varje ändring i riggen, och Claude försöker "rätta" | Öppen fråga 2 besvaras före steg 3 |
| Prettier underkänner riggfilerna så länge massformateringen inte är gjord | Hög | Varje Edit av en befintlig riggfil ger exit 2 efter steg 3 | Öppen fråga 1. Alternativt begränsas PostToolUse till `src/` och `tests/` tills formateringen är gjord |
| Den befintliga SessionStart-hooken går sönder | Låg | Mätningen slutar fungera | Separat post i `settings.json`, test 1.10 och kontroll av CSV i 1.12 |
| Sammanfattningen blir för lång eller dyr i tokens vid varje `/clear` | Medel | Mer kontext och kostnad | Gräns och förkortning (1.8, öppen fråga 3) |
| SessionStart-utdata når inte kontexten | Låg–medel | Sessionsminnet fungerar inte | Den riktiga körningen avgör. Byt mellan stdout och `additionalContext` |
| PreCompact-utdata visas bara för användaren eller inte alls | Medel (okänt) | Påminnelsen når inte Claude | Prövas med `/compact`. Påminnelsen kan också tas med i SessionStart med `compact` |
| Stop-hooken med exit 2 gör att Claude fortsätter och rättar fel utanför uppdraget | Medel | Strider mot `CLAUDE.md` om att stanna och inte rätta annat | Öppen fråga 4 och `stop_hook_active` |
| Stop-hooken kör `tsc` efter varje svar så länge det finns ändringar som inte är committade | Hög (med git-alternativet) | Några sekunder extra per svar | Öppen fråga 5. Mät tiden i den riktiga körningen |
| Timeout i Prettier, ESLint eller `tsc` | Låg–medel | Hooken avbryts, och resultatet är oklart | Timeouter efter mätning. Vid timeout rapporteras det, och anropet blockeras inte |
| `main-guard` blockerar för mycket i huvudsessionen | Medel | Vanligt arbete stoppas | Spärrlista och testerna i 4.6 och 4.8 |
| `main-guard` missar en variant | Medel | Falsk trygghet | Dokumentera att den bygger på mönster, som `agent-guard` (`agent-guard.js:13-15`). Behörighetsreglerna finns kvar som första spärr. |
| `main-guard` krockar med `agent-guard` för subagenterna | Låg | Agenterna stoppas | Test 4.8. `main-guard` blockerar bara sådant som alla agentlägen redan blockerar. |
| Provkommandon gör skada om spärren missar | Låg | Data försvinner | Bara sökvägar som inte finns och scratchpad (4.10) |
| Hooks läses inte in utan omstart | Okänt | Den riktiga körningen visar fel resultat | Kontrollen med `/hooks` och omstart, och dokumentation |
| Om `node` inte startar körs anropet utan spärr (`agent-guard.js:14-15`) | Låg | `main-guard` släpper igenom anropet | Dokumentera. Behörighetsreglerna gäller ändå. |
| `utvecklare` kan ändra `main-guard.js` och `check-code.js` | Låg | Spärren kan försvagas av en agent | Öppen fråga 8, besvarad: `RIG_PROTECTED` utökas i steg 4 (4.11). `Edit(.claude/**)` ligger under ask (`settings.json:144`), men Write omfattas inte av den regeln |
| Ett fel i `main-guard` blockerar alla anrop i huvudsessionen, även Edit av `main-guard.js` | Låg–medel | Claude kan inte rätta hooken | Steg 4 delas i 4a (bygga och testa, inget registreras) och 4b (registrering och riktig körning). Före registreringen körs det exakta hookkommandot med testdata. Användaren kan ta bort posten i `settings.json` eller stänga av hooken via `/hooks`. |

## Uppdelning i steg

Varje steg byggs i huvudsessionen med `tdd` (`node --test`), granskas med `granska-standard` (eller `granskare`) och verifieras med kontrollerna ovan (eller `verifierare`). Efter den riktiga körningen uppdateras sessionsloggen och `PLAN.md`, och arbetet stannar.

1. **Sessionsminne.** `session-memory.js`, `session-memory.test.js` och två poster i `settings.json`. Riktig körning med `/clear`, `ready` och `/compact`. Kriterier 1.1–1.12.
2. **Prettier för `.claude/`.** `package.json`, `format` och `format:check`. Riktig körning med `npm run format:check`. Massformateringen görs bara om öppen fråga 1 godkänns, och då som ett eget delsteg med md5 och `git diff --stat` före och efter, så att det syns att bara formateringen ändrades och att alla riggtester fortfarande går igenom. Kriterier 2.1–2.3.
3. **Kodkontroller.** `check-code.js`, `check-code.test.js` och två poster i `settings.json`. Öppen fråga 2, 4 och 5 besvaras först. Kriterier 3.1–3.13.
4. **Spärr för huvudsessionen.** Eget godkännande före Build. `main-guard.js`, `main-guard.test.js`, `RIG_PROTECTED` i `agent-guard.js` och en post i `settings.json`. Kriterier 4.1–4.12. Delas i två delar med ett stopp emellan (beslut 2026-11-16):
   - **4a:** planen uppdateras, `RIG_PROTECTED` (4.11) och `main-guard.js` (4.1–4.9 och 4.12) byggs med TDD, och mutationerna körs. Inget registreras i `settings.json`. Godkänd 2026-11-16.
   - **4b:** registreringen i `settings.json`, den riktiga körningen (4.10), Review med `granskare`, Verify med `verifierare` och dokumentationen. Kräver eget godkännande.

Efter steg 4: `PLAN.md:19` och `PLAN.md:21` bockas av om allt är verifierat, och antalet hooks redovisas enligt tabellen ovan.

## Öppna frågor och beslut

1. **Massformatering av riggen.** Ska riggens 8 befintliga JS-filer formateras med `prettier --write` (eller `npm run format` begränsat till `.claude/**/*.js`)? Det är inte godkänt. Utan den underkänns `format:check` för fler filer efter steg 2, och PostToolUse i steg 3 ger exit 2 vid varje ändring av en befintlig riggfil. Förslag: ett eget delsteg efter steg 2, med alla riggtester före och efter. Formateringen ändrar bara blanksteg, citattecken och kommatecken. `npm run format` ligger under ask (`settings.json`) och kräver ett godkännande när det körs.
2. **ESLint för `.js` i riggen.** Konfigurationen underkänner sannolikt `require` och Node-globaler i `.js` (fynd 1). Alternativ:
   - (a) PostToolUse kör ESLint bara på `.ts`, och Prettier på både `.ts` och `.js`.
   - (b) `eslint.config.js` får ett block för `.claude/**/*.js` med `sourceType: "commonjs"`, Node-globaler och `no-require-imports` avstängt. Det kräver ett godkännande, och `globals` är bara ett indirekt beroende.
   - (c) ESLint körs på `.js` men rapporterar bara, med exit 0.

   Förslag: (a) i det här momentet, och (b) som ett eget moment.
3. **Längden på sammanfattningen.** "Aktuell status" är cirka 5 600 byte och innehåller redan "Nästa arbetsmoment". Förslag: hela "Nästa arbetsmoment", och från resten av "Aktuell status" bara "Senast uppdaterad" och rubrikerna med de första raderna, med en gräns på till exempel 3 000 tecken. Eller ska hela avsnittet tas med?
4. **Hur ska Stop-hooken rapportera?** Med exit 2 fortsätter Claude och kan börja rätta typfel utanför uppdraget, vilket strider mot `CLAUDE.md` ("Rätta inte andra problem…" och "Avsluta efter redovisningen"). Alternativ:
   - (a) exit 2 med en text som säger att Claude ska redovisa felet och inte rätta det utan godkännande
   - (b) exit 0, och felet visas bara för användaren

   Förslag: (a).
5. **Vad betyder "när filer i `src/` eller `tests/` har ändrats"?**
   - (a) `git status --porcelain -- src tests` är inte tom. Det är enkelt och har inget tillstånd, men `tsc` körs efter varje svar så länge ändringarna inte är committade.
   - (b) PostToolUse sparar ändrade sökvägar i en tillståndsfil under `.claude/metrics/live/` eller en egen katalog som ignoreras i Git, och Stop läser och tömmer den.

   Förslag: (a), med tiden mätt i den riktiga körningen.
6. **Hur ska hooks räknas i `PLAN.md`?** Som funktioner (8 efter steg 4), som hookskript (5) eller som händelsetyper (6)? Förslag: funktioner och hookskript redovisas båda, och kravet bockas av efter steg 4.
7. **`main-guard` när `parse` ger `unsafe`.** I huvudsessionen är `>`, `$(...)` och backticks vanliga och tillåts av behörighetsreglerna eller ställs som frågor. Förslag: tillåt, men blockera om råtexten nämner en hemlig fil eller innehåller ett spärrat mönster. Alternativet är att blockera allt som inte kan tolkas, vilket gör att `agent-guard` och `main-guard` beter sig lika men stoppar mer.
   **Beslut 2026-11-16:** förslaget (A). Falska positiva för commit-meddelanden som nämner spärrade mönster accepteras (kriterium 4.7).
8. **Ska `RIG_PROTECTED` i `agent-guard.js:377-381` utökas** till `.claude/hooks/` så att `utvecklare` inte kan ändra `main-guard.js` och `check-code.js`? Det är en ändring av en säkerhetsinställning och ett eget moment. Förslag: ja, efter steg 4.
   **Beslut 2026-11-16:** ja, men i steg 4 och inte efter (B). Kriterium 4.11.
9. **Ska `gitSubcommand` exporteras från `agent-guard.js`**, eller kopieras till `main-guard.js`? Export ändrar `agent-guard.js`, vilket inte ingår. Förslag: kopiera i steg 4 och föreslå en gemensam modul senare.
   **Beslut 2026-11-16:** förslaget (A), kopiera.
10. **Ska det finnas ett automatiskt test för skripten i `package.json` (2.1)?** Det skulle bli en ny testfil eller ett test i `check-code.test.js`, som inte finns förrän i steg 3. Förslag: manuell kontroll med `git diff package.json` i steg 2, och ett test i `check-code.test.js` i steg 3.
11. **`PLAN.md:54` stämmer inte med Git** (commit `6b6ae2d` finns). Ska det rättas när `PLAN.md` uppdateras efter steg 1?
12. **Provfil för den riktiga körningen i steg 3.** Var får den ligga? En ny fil i `src/` som tas bort efteråt kräver godkännande för borttagningen. Ett alternativ är att ändra en befintlig fil tillfälligt och återställa den med Edit, och kontrollera md5 före och efter.
