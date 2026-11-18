# Kontroller i riggen: vad som kan upptäcka ett fynd

Den här filen används för kolumnerna **Kontroll/hook** och **Automatiskt/Manuellt** i fyndtabellen (R10). Den listar bara kontroller som finns i projektet.

## Vad Automatiskt och Manuellt betyder

- **Automatiskt:** en kontroll i tabellerna nedan skulle flagga fyndet utan att en människa eller en agent läser koden. Ange vilken kontroll.
- **Manuellt:** ingen kontroll nedan täcker det i dag, så det kräver granskning. Ange gärna en **föreslagen** kontroll (skriv "föreslagen") som skulle kunna göra det automatiskt. En föreslagen kontroll finns inte och räknas inte som Automatiskt.
- **Bedömningen är läst, inte körd.** `granskare` kör inga kontroller. Huvudsessionen eller `verifierare` bekräftar genom att köra kommandot. Skriv därför "bedömd" om du inte har sett kontrollen flagga fyndet.

## A. Kontroller som körs på koden (gäller också en färdig PR)

| Kontroll | Vad den fångar | Begränsning |
|---|---|---|
| `npm run lint` | ESLint med `recommended` från ESLint och typescript-eslint, till exempel oanvända variabler och explicit `any`. | Projektets egna regler ur `docs/standard.md` finns **inte** i konfigurationen (`eslint.config.js`). Gäller bara `.ts` i `src` och `tests`. |
| `npm run typecheck` | TypeScript-fel (`tsc --noEmit`). | Fångar inte fel som typerna inte uttrycker. |
| `npm run format:check` | Prettier-formatering i `src`, `tests` och `.claude/**/*.js`. | Gäller inte `docs/`, `sessions/` eller Python. |
| `npm test` | Jest-tester av API:t mot testdatabasen. | Fångar bara det som något test kontrollerar. Kräver att databasen körs. |
| `npm run test:legacy` | pytest för Python i `tests/legacy/`. | Kräver att `pytest` finns på `PATH` (se README). Delar testdatabasen med `npm test`. |

## B. Hooks som bara körs i riggens sessioner

Hooksen stoppar eller varnar medan ändringen görs i riggen. En färdig PR som någon annan har skrivit har **inte** passerat dem.

| Hook | Vad den gör |
|---|---|
| `.claude/hooks/check-code.js` | Efter Edit eller Write: Prettier och ESLint på den ändrade filen. Vid Stop: `tsc --noEmit` om `src/` eller `tests/` ändrats. Exit 2 vid fel. |
| `.claude/hooks/test-guard.js` (anropas av `main-guard.js`) | Blockerar ändringar som tar bort eller stänger av tester (till exempel `.skip`), och kommandon som tar bort testfiler. |
| `.claude/hooks/main-guard.js` | Spärr för huvudsessionen: filer med hemligheter (`.env`, `*.pem`, `*.key`), destruktiva git-kommandon, rekursiv borttagning och liknande. |
| `.claude/hooks/agent-guard.js` | Begränsar subagenterna per läge (`read`, `dev`, `checks`, `plans-write`). |

**Följd för granskningen:** S18 (borttagna eller överhoppade tester) är Automatiskt i riggens sessioner men Manuellt på en färdig PR.

## C. Det som inte finns automatiskt

Skriv dessa som Manuellt, med en föreslagen kontroll om du har en:
- Projektets regler S1–S17 i `docs/standard.md`: inga ESLint-regler eller andra kontroller finns för dem.
- Sökning efter hemligheter i koden: `main-guard.js` stoppar bara åtkomst till hemliga filer, och ingen kontroll läser kod efter lösenord.
- Krav på testtäckning, och kontroll av om en assertion är för svag.
- Kontroll av att dokumentation, filhänvisningar och radnummer stämmer med koden.
- Automatisk körning i CI: det finns ingen `.github/` i projektet, så ingen kontroll körs vid en pull request.
