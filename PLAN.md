
# Projektplan – En rigg för en kodbas

## Projektbeskrivning

I det här projektet ska jag bygga en rigg för en AI-kodagent och använda den för att arbeta med en befintlig kodbas.

Jag utgår från kursens övningsprojekt, ett REST-API för kunder och beställningar i TypeScript. Projektet innehåller även en äldre modul för prisberäkning som behöver moderniseras.

Tanken är att skapa ett gemensamt arbetssätt där AI-agenten får tydliga instruktioner och där kodändringar kan kontrolleras automatiskt. Arbetet ska också dokumenteras så att det går att följa vad som har gjorts, vilka beslut som tagits och vad som återstår.

## Vad som ska ingå

Riggen ska innehålla:

- [x] Projektinstruktioner, projektplan och promptmall.
- [ ] Minst tre skills eller kommandon, varav ett för TDD.
- [ ] Minst fyra subagenter med tydliga uppgifter.
- [ ] Minst fem hooks, inklusive hantering av sessionsminne.
- [ ] Behörigheter med allow, ask och deny.
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

### Kända problem

- Prettier rapporterade formateringsproblem i 15 befintliga filer.
- Jest-testet för `GET /orders/1042/price` misslyckades: API:t svarade 404 i stället för förväntade 200. Orsaken behöver undersökas.
- Skills, subagenter, hooks och behörigheter är ännu inte konfigurerade.

### Nästa arbetsmoment

1. Konfigurera behörigheter med allow, ask och deny.
2. Skapa och testa skills.
3. Skapa subagenter.
4. Implementera hooks och testa de automatiska kontrollerna.
