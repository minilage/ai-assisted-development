---
name: tdd
description: Testdriven utveckling (red → green → refactor) för en avgränsad och godkänd uppgift i projektet. Skriv först ett test som misslyckas av rätt orsak, sedan minsta implementation, och kör tester och kodkontroller. Använd i Build-fasen när kod i src/, tests/, src/legacy/ eller .claude/ ska läggas till eller ändras.
argument-hint: [uppgift eller acceptanskriterium]
---

# TDD: red → green → refactor

Uppgift: $ARGUMENTS

## Roll

Du är utvecklare i Build-fasen. Du skriver tester före implementationen och ändrar bara det som den godkända uppgiften kräver.

## Uppgift

Genomför den godkända uppgiften med testdriven utveckling.

Ingår inte:
- nya funktioner eller rättningar utanför uppgiften
- refaktorering av kod som uppgiften inte berör
- commit eller push

## Kontext och relevanta dokument

- `CLAUDE.md`: arbetssätt, godkännanden och redovisning.
- `docs/standard.md`: kodstandard och regler för tester.
- `docs/api.md`: endpoints och förväntat beteende.
- En godkänd plan i `docs/plans/`, skapad med skillen `planera`, om den finns. Annars acceptanskriterierna i uppgiften.
- Befintliga tester som mönster, till exempel `tests/orders.test.ts` och `tests/helpers/db.ts`.

| Del | Tester | Kör ett test | Kör sviten |
|---|---|---|---|
| API (TypeScript) | `tests/<namn>.test.ts` (Jest, supertest) | `npx jest tests/<namn>.test.ts -t "<testnamn>"` | `npm test` |
| Äldre modulen (Python) | `tests/legacy/test_<namn>.py` (pytest) | `python -m pytest tests/legacy/test_<namn>.py -q` | `npm run test:legacy` |
| Riggen (`.claude/`) | `<fil>.test.js` (node:test) | `node --test <fil>.test.js` | samma kommando för alla berörda testfiler |

Riggens hookskript, agenter och inställningar (`.claude/hooks/`, `.claude/agents/` och `.claude/settings*.json`) ändras bara i huvudsessionen. Agenten `utvecklare` är spärrad för dem av `agent-guard`, så när skillen körs i den agenten gäller den `src/`, `tests/`, `src/legacy/` och övriga delar av `.claude/`.

Jest-testerna kräver testdatabasen. Den startas med `npm run db:up` och återställs med `npm run db:reset`. Båda kommandona kräver godkännande.

## Regler och begränsningar

- Följ `CLAUDE.md` och `docs/standard.md`.
- Ta aldrig bort, hoppa över (`.skip`, `.only`, `xfail`) eller försvaga ett test för att få det grönt.
- Ändra inte befintligt beteende som inte ingår i uppgiften.
- En endpoint ska ha tester för lyckat fall och för 400, 401, 403 och 404 där de är möjliga.
- Använd parametriserad SQL, `Result` i tjänstelagret och inga flyttal för pengar.
- Lägg inte in hemligheter eller personuppgifter i tester, fixtures eller loggar.
- Fråga först om uppgiften kräver ändringar i publikt API, databasschema, beroenden, behörigheter eller borttagning av filer.

## Arbetsgång

1. **Kriterier.** Skriv acceptanskriterierna i formen Givet/När/Så. Om de är oklara: fråga i stället för att gissa.
2. **Red.** Skriv ett test för ett kriterium i taget. Kör bara det testet. Det ska misslyckas av rätt orsak, alltså att beteendet saknas.
   - Om testet misslyckas av fel orsak, till exempel att databasen saknas, testet är fel skrivet eller importen inte fungerar: rätta testet eller stoppa och redovisa.
   - Om testet går igenom direkt: beteendet finns redan. Redovisa det i stället för att implementera.
3. **Green.** Skriv minsta möjliga implementation som får testet att gå igenom. Kör testet igen.
4. **Refactor.** Städa koden utan att ändra beteendet. Kör testet igen.
5. Upprepa steg 2–4 för nästa kriterium.
6. **Hela sviten.** Kör sviten för den berörda delen, så att inget annat har gått sönder.
7. **Kodkontroller** för TypeScript: `npm run lint`, `npm run typecheck` och `npm run format:check`.
   - `format:check` godkänns utan anmärkningar sedan Session 10 (`"endOfLine": "auto"`). Om den underkänner en fil: kontrollera om det är en fil du har ändrat, och redovisa annars utan att rätta.

## Förväntat resultat och format

Redovisa under rubrikerna i `CLAUDE.md`: Genomfört, Filer, Kontroller, Problem och beslut, Nästa steg.

Under Kontroller ska följande finnas:
- varje test med resultatet i red och i green, och varför det misslyckades i red
- de exakta kommandona som kördes och om de gick igenom
- kontroller som inte kördes, och varför

## Verifiering

- Varje nytt test har setts misslyckas av rätt orsak innan implementationen skrevs.
- Alla nya och befintliga tester i den berörda sviten går igenom.
- Lint, typkontroll och formatkontroll ger inga nya fel i de ändrade filerna.
- Inga tester har tagits bort, hoppats över eller försvagats. Kontrollera med `git diff`.

## Stoppvillkor

- Stoppa och redovisa när alla kriterier i uppgiften har gröna tester och kontrollerna har körts.
- Stoppa också direkt, och redovisa, om:
  - ett test misslyckas av en orsak som du inte kan rätta inom uppgiften,
  - uppgiften kräver ändringar som inte är godkända,
  - testmiljön inte fungerar.
- Gör ingen commit. Föreslå en commit och invänta godkännande.
