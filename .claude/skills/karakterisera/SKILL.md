---
name: karakterisera
description: Skriver karakteriseringstester som låser det nuvarande beteendet i äldre kod, i första hand prisberäkningen i src/legacy/, innan den refaktoreras. Kartlägger anropare, indata, utdata och sidoeffekter och dokumenterar antaganden. Ändrar inte produktionskoden. Startas bara av användaren, inför modernisering.
argument-hint: [modul eller funktion, till exempel src/legacy/price_calc.py]
disable-model-invocation: true
---

# Karakteriseringstester för äldre kod

Mål: $ARGUMENTS

## Roll

Du skapar ett säkerhetsnät för moderniseringen. Du beskriver hur koden beter sig i dag, inte hur den borde bete sig. Du ändrar inte koden som testas.

## Uppgift

1. Kartlägg hur målet används.
2. Skriv tester som låser dess nuvarande beteende.
3. Dokumentera vad du har hittat.

Ingår inte:
- att rätta fel eller ändra beteende, även om något ser fel ut
- att refaktorera
- att ändra produktionskoden i `src/` eller `jobs/`

## Kontext och relevanta dokument

- `src/legacy/price_calc.py`: den äldre prisberäkningen. Utan argument är det den som är målet.
- Anropare som beteendet måste bevaras för:
  - `src/pricing/legacyPrice.ts`: API:t startar skriptet med ett order-id och läser JSON från stdout, `{ net, vat, total }`, och exit-koden.
  - `jobs/nightly_report.py`: importerar `calc_price` och `conn` direkt och använder attributen i det returnerade objektet.
- `docs/api.md`, avsnittet "Den äldre modulen", och `GET /orders/:id/price`.
- `db/schema.sql` och `db/seed.sql`: tabeller och testdata.
- `CLAUDE.md`: undersök hur prisberäkningen används innan ändringar föreslås.
- `pytest.ini`: tester ligger under `tests/` och heter `test_*.py`.

## Regler och begränsningar

- Ändra inte `src/legacy/`, `src/pricing/` eller `jobs/`. Om ett test bara kan skrivas genom att ändra koden: stoppa och redovisa.
- Lås det beteende som finns, även när det ser fel ut. Märk sådana tester med kommentaren `# Nuvarande beteende, inte nödvändigtvis rätt:` och en förklaring.
- Testerna ska ge samma resultat varje gång:
  - Styr tid, slump och filer.
  - Skriv inte till modulens loggfil i `src/legacy/`. Peka om den till en tillfällig katalog med `monkeypatch`.
- Databasen:
  - Använd bara testdatabasen (`TEST_DATABASE_URL`) eller en ersättning för `psycopg.connect` i testerna. Använd aldrig `DATABASE_URL`.
  - Läs aldrig `.env`.
  - Modulen ansluter redan när den läses in, så ersättningen måste vara på plats före `import`.
- Installera inga paket. Om `pytest` eller `psycopg` saknas: stoppa och be om godkännande.
- Lägg inte in hemligheter eller personuppgifter i tester eller dokumentation.

## Arbetsgång

1. **Kartlägg användningen.**
   - Sök efter anrop och importer av målet (`grep -rn`).
   - Notera för varje anropare vad den använder: funktioner, attribut, typer, format på utdata, exit-koder och vad som händer vid fel.
2. **Kartlägg beteendet.** Läs koden och notera:
   - indata och utdata,
   - avrundning,
   - specialfall: tom beställning, beställning som saknas, rabattkod som saknas eller är ogiltig,
   - sidoeffekter: databas, loggfil och stdout.
3. **Skriv testerna** i `tests/legacy/test_<modul>.py`:
   - ett test per beteende, med konkreta förväntade värden som räknats fram från koden eller testdatan,
   - formatet som anroparna är beroende av: JSON-fälten och exit-koden för skriptet, attributen för `jobs/nightly_report.py`,
   - felfall och specialfall.
4. **Kör testerna.** Först `python -m pytest tests/legacy/test_<modul>.py -q`, sedan `npm run test:legacy`. Alla tester ska gå igenom mot den oförändrade koden.
5. **Kontrollera att testerna kan upptäcka ändringar.** Gör en tillfällig ändring i en kopia av modulen i scratchpad, till exempel i avrundningen eller momsen. Kör testerna mot kopian och visa att minst ett test misslyckas. Den riktiga filen ändras inte.
6. **Dokumentera** i `docs/legacy/<modul>.md`:
   - anropare och vad de är beroende av,
   - beteenden som testerna låser,
   - antaganden och avvikelser från `docs/standard.md` och `docs/api.md`,
   - frågor som behöver svar innan refaktoreringen.

## Förväntat resultat och format

Redovisa under rubrikerna i `CLAUDE.md`: Genomfört, Filer, Kontroller, Problem och beslut, Nästa steg.

Under Problem och beslut ska följande finnas:
- beteenden som verkar vara fel, med fil:rad, utan att något har rättats
- vad som inte kunde testas, och varför

## Verifiering

- `git diff -- src/ jobs/` är tom. Ingen produktionskod har ändrats.
- Alla nya tester går igenom mot den nuvarande koden.
- Minst en tillfällig ändring i en kopia av modulen fick testerna att misslyckas.
- Varje anropares beroende täcks av minst ett test.

## Stoppvillkor

Stoppa när testerna och dokumentationen är klara och kontrollerade. Stoppa också om testmiljön saknas eller om något kräver ändringar i produktionskoden. Föreslå sedan refaktorering som nästa arbetsmoment och invänta godkännande. Gör ingen commit.
