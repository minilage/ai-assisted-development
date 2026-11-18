# Övningsprojekt: butikens API

Övningsprojektet för delkursen *AI-assisterad systemutveckling*. Det är kodbasen du bygger din rigg för i kursprojektet.

Projektet innehåller två delar med olika ålder och kvalitet:

- **REST-API:t** för kunder och beställningar, i TypeScript med Express och PostgreSQL. Det har tester och följer kodstandarden i `docs/standard.md` någorlunda.
- **Den äldre prisberäkningen** i `src/legacy/price_calc.py`, i Python. Den hade från början ingen dokumentation och inga tester. Efter R11 finns en codemap (`docs/legacy/price_calc.md`) och 13 karakteriseringstester (`tests/legacy/`), men den har fortfarande kända fel och risker (till exempel SQL-injektion och kapning i stället för avrundning). Den är den del som moderniseras i kursprojektet.

## Kom igång

Du behöver Node.js 22 eller senare, Python 3.11 eller senare, Docker och git.

```bash
npm install
pip install -r requirements.txt     # gärna i en virtuell miljö
cp .env.example .env
npm run db:up                       # startar PostgreSQL i Docker
npm run db:reset                    # skapar tabeller och testdata
npm test                            # ska ge 16 gröna tester
npm start                           # API:t på http://localhost:3000
```

Pröva API:t:

```bash
curl http://localhost:3000/customers/me -H "X-Customer-Id: 1"
curl http://localhost:3000/orders/1042/price -H "X-Customer-Id: 1"
```

`npm start` och `npm run db:reset` läser `.env` automatiskt. Testerna använder `TEST_DATABASE_URL`, och den äldre modulen `DATABASE_URL`.

## Kommandon

| Kommando | Vad det gör |
|---|---|
| `npm test` | Kör API-testerna mot testdatabasen. |
| `npm run test:legacy` | Kör Python-testerna i `tests/legacy/` (13 tester) med `pytest -q`. Kräver att `pytest` finns på `PATH`, se "Python-testerna" nedan. |
| `npm run lint` | ESLint med grundkonfiguration. |
| `npm run typecheck` | TypeScript utan att bygga. |
| `npm run format` | Formaterar koden med Prettier. |
| `npm run db:reset` | Återställer båda databaserna till schema och testdata. |

### Python-testerna

Python-testerna i `tests/legacy/` kräver `pytest` och `psycopg` från `requirements.txt`. Installera dem helst i en virtuell miljö och kör testerna med den Python som har paketen:

```bash
python -m venv .venv                  # en gång (python3 på vissa system)
# aktivera miljön, se nedan
pip install -r requirements.txt       # en gång
python -m pytest tests/legacy         # 13 tester
```

Aktivera miljön:

| System | Kommando |
|---|---|
| Windows (PowerShell) | `.venv\Scripts\Activate.ps1` |
| Windows (Git Bash) | `source .venv/Scripts/activate` |
| macOS och Linux | `source .venv/bin/activate` |

Aktiveringskommandona är standard för `venv`. De är inte provade här, men skripten `Activate.ps1` och `activate` finns i `.venv/Scripts/`.

Du kan också hoppa över aktiveringen och anropa miljöns Python direkt. **Exempel, verifierat i det här projektet** (Windows, Python 3.14, `psycopg` 3.2.10, `pytest` 8.3.3):

```bash
.venv/Scripts/python.exe -m pytest tests/legacy
```

På macOS och Linux motsvarar det `.venv/bin/python -m pytest tests/legacy` (inte provat här).

Att tänka på:
- `npm run test:legacy` kör `pytest -q` och fungerar bara om `pytest` ligger på `PATH`, till exempel med aktiverad miljö. Det är inte provat här. Använd annars kommandot ovan.
- Testerna använder testdatabasen (`TEST_DATABASE_URL`, standard `butik_test`), återställer den och avbryter om databasnamnet inte slutar på `_test`. Databasen måste vara igång (`npm run db:up`).
- Python-testerna och `npm test` delar testdatabasen och får inte köras samtidigt.

## Struktur

```
src/
  app.ts, server.ts        API:t
  routes/                  endpoints
  services/                affärslogik, returnerar Result
  pricing/legacyPrice.ts   brygga till den äldre prisberäkningen
  legacy/price_calc.py     den äldre prisberäkningen
jobs/nightly_report.py     nattlig rapport som också använder price_calc
db/                        schema och testdata
tests/                     API-tester
docs/
  standard.md              teamets kodstandard, i ord
  api.md                   endpoints
  user-stories.md          user stories att välja bland
  adr/                     dina beslutsloggar
.claude/skills, .claude/agents   tomma: här bygger du riggen
sessions/                  dina sessionsloggar
```

## Ditt arbete

Projektbeskrivningen finns i kursens material. I korthet:

1. Bygg riggen i det här repot: skills och kommandon, subagenter, hooks, behörigheter och en kodstandard som kontrolleras automatiskt.
2. Använd riggen på tre arbeten: en ny funktion ur `docs/user-stories.md`, granskningen av pull requestet som kursledaren delar ut, och en modernisering av `src/legacy/price_calc.py`.
3. Skriv en sessionslogg i `sessions/` efter varje arbetspass.
4. Tagga repot `inlamning` när du lämnar in.

Testdatan är påhittad. Lägg aldrig in riktiga kunduppgifter eller produktionsdata i repot, i instruktioner eller i sessionsloggar.
