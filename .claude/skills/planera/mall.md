# Plan: <titel>

**Status:** Utkast, väntar på godkännande
**Datum:** <ÅÅÅÅ-MM-DD>
**Underlag:** <user story, problem eller uppgift, med hänvisning till källan>

## Mål

Vad ska vara uppnått när arbetet är klart? Ange också vad som inte ingår.

## Research

- **Befintlig kod:** berörda moduler med `fil:rad` och hur de hänger ihop.
- **Dokumentation:** vad `docs/standard.md`, `docs/api.md` och tidigare sessioner säger.
- **Beroenden:** anropare, databastabeller och externa delar.
- **Upptäckt under researchen:** fel, motsägelser eller saknad information. Ange tydligt vad som är verifierat och vad som är antaganden.

## Acceptanskriterier

1. **Givet** <utgångsläge>, **när** <händelse>, **så** <förväntat resultat>.
2. …

Ta med felfallen: 400, 401, 403, 404 och 409 där de är möjliga.

## Lösning

Den föreslagna lösningen och varför. Nämn alternativ som valts bort, med en kort motivering.

## Berörda filer

| Fil | Ändring | Varför |
|---|---|---|
| | ny, ändrad eller bara läst | |

## Kräver separat godkännande

Ändringar i:
- publikt API-kontrakt
- databasschema, som migreringar i steg som går att backa
- beroenden
- behörigheter eller säkerhetsinställningar
- borttagning av filer

Skriv "Inget" om inget av detta berörs.

## Testplan

| Kriterium | Test som skrivs först | Fil | Kommando |
|---|---|---|---|
| 1 | | | |

Kodkontroller: `npm run lint`, `npm run typecheck` och `npm run format:check`, beroende på vilken del som ändras.

## Risker

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|---|---|---|---|

## Uppdelning i steg

1. <steg som kan godkännas, byggas med `tdd` och granskas med `granska-standard` för sig>

## Öppna frågor och beslut

- Frågor som användaren behöver svara på innan Build påbörjas.
