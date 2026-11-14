# Session 01 – Projektstart och förberedelser

**Period:** Början av november 2026  
**Dokumenterat:** 14 november 2026  
**Typ:** Sammanställning av tidigare förberedelser

## Mål

Förbereda datorn och utvecklingsmiljön inför kursprojektet. Jag ville också få en bättre förståelse för uppgiften och vad jag behöver bygga innan jag börjar arbeta med själva riggen.

## Planering

Jag började med att gå igenom kursprojektets beskrivning och fundera på hur jag skulle lägga upp arbetet. Började med att planera i word dokument så att så mycket som möjligt skulle vara planerat innan jag började lägga in här.

Jag valde att använda lärarens övningsprojekt eftersom det redan innehåller en kodbas med tester och en äldre del som ska moderniseras.

## Förberedelser och installation

Jag har förberett utvecklingsmiljön och kontrollerat att jag har de verktyg som behövs:

- Visual Studio Code
- Git och GitHub
- Node.js och npm
- Python
- Docker Desktop
- Claude Code

Jag köpte även så att jag har pro abonnemang på Claude. Jag har även hämtat kursens övningsprojekt till mitt eget GitHub-repository och öppnat det lokalt i VS Code.

Därefter installerade jag projektets beroenden med npm och startade PostgreSQL via Docker.

## Första testkörningen

Jag körde projektets befintliga tester för att kontrollera utgångsläget innan jag börjar göra ändringar.

Av 16 tester blev 15 godkända och ett misslyckades.

Det misslyckade testet gäller `GET /orders/1042/price`, där svaret blev 404 i stället för förväntade 200.

Jag har inte gjort några ändringar för att försöka rätta felet ännu. Jag vill först undersöka vad som redan finns i projektet och hur det fungerar.

## Resultat

Utvecklingsmiljön är förberedd och jag har kunnat installera beroenden, starta databasen och köra testerna.

Jag har också fått en tydligare bild av projektets omfattning och börjat planera hur jag ska bygga riggen.

## Nästa steg

- Färdigställa och spara `PLAN.md`.
- Undersöka vilka filer och inställningar som redan finns i projektet.
- Börja skapa projektinstruktioner i `CLAUDE.md`.
- Fortsätta bygga riggen i mindre steg och dokumentera arbetet efter hand.