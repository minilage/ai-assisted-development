
# Kravspecifikation – AI-assisterad systemutveckling, delkurs 2

**Projekt:** AI-rigg för en befintlig kodbas  
**Repository:** `minilage/ai-assisted-development`  
**Examination:** 19 november 2026  
**Mål:** Väl godkänt (VG)  
**Dokument:** Egen sammanställning av kursens examinationskrav

---

## 1. Syfte och mål

Målet med projektet är att bygga en AI-rigg som hjälper till med utvecklingsarbetet i en befintlig kodbas. Riggen ska se till att arbetet följer en tydlig struktur, att kod och tester kontrolleras automatiskt och att det går att följa vad som har gjorts och varför.

Jag vill också kunna visa att riggen fungerar i praktiken, inte bara att instruktioner och konfigurationsfiler finns på plats. Det är viktigt att kunna förklara hur de olika delarna fungerar tillsammans, varför de behövs och vilka begränsningar som finns.

Projektet bedöms framför allt utifrån hur riggen fungerar och används, vilka tekniska beslut som har tagits och hur resultaten redovisas.

### 1.1 Vald kodbas

Projektet använder kursens övningsprojekt som innehåller:
- Ett REST-API i TypeScript för kunder och beställningar.
- Befintliga tester och utvecklingsverktyg.
- En äldre Python-modul för prisberäkning.
- Databasberoenden och avsiktligt införda fel som kan användas för att testa riggen.

### 1.2 Grundprinciper

- Instruktioner och regler som styr AI-agenten ska finnas i projektet, inte bara i en chatt.
- Arbetet ska utgå från tydliga krav och acceptanskriterier.
- Det ska gå att följa ändringar genom planer, tester, sessionsloggar och Git.
- Automatiska kontroller ska upptäcka fel och stoppa otillåtna ändringar.
- Jag ansvarar för viktiga beslut och godkänner arbetet innan nästa steg.
- AI-agenten får föreslå ändringar i tester, men inte ta bort eller stänga av dem.
- Ingen verklig kunddata eller produktionsdata får användas.
- Problem, begränsningar och sådant som inte blivit färdigt ska dokumenteras.

---

## 2. Betygskriterier

### Godkänt (G)

För godkänt ska det finnas en fungerande AI-rigg som har använts i riktigt utvecklingsarbete i kodbasen. Dokumentationen ska besvara uppgiftens frågor och visa var det finns bevis för resultaten i repositoryt.

### Väl godkänt (VG)

För väl godkänt krävs dessutom att jag kan:
- Jämföra olika lösningar och förklara deras styrkor och svagheter.
- Motivera varför jag har valt en viss lösning.
- Använda mätvärden för att stödja mina beslut, till exempel tokens, tid, kostnad eller antal upptäckta fel.
- Visa att utvecklingsarbetet har följt kursens arbetssätt hela vägen.
- Koppla krav, beslut, tester och commits till varandra.
- Förklara hur riggen fungerar, varför den är uppbyggd som den är och vad den inte klarar av.

### Vad som behöver framgå för VG

För större tekniska beslut ska jag kunna svara på följande:
1. Vilket problem behövde lösas?
2. Vilken lösning valde jag?
3. Fanns det andra alternativ?
4. Varför valde jag bort dem?
5. Vilka tester eller mätningar stödjer beslutet?
6. Finns det några nackdelar eller risker kvar?

---

## 3. Tekniska krav på AI-riggen

### R01 – Automatisk kontroll av kodstandard

**Krav**

Riggen ska automatiskt kunna kontrollera:
- Linting.
- Kodformatering.
- Typkontroll.
- Felmeddelanden som tydligt visar vad som behöver rättas.

**Så visar vi att det fungerar**

Genom konfiguration, testresultat och konkreta exempel där kontrollerna upptäcker fel.

### R02 – Skills och kommandon

**Krav**

Minst tre egna skills eller kommandon ska finnas i projektet. En av dem måste vara `/tdd`.

För varje skill ska vi kunna visa:
- Vad den heter och används till.
- När den ska användas.
- Vilka verktyg och begränsningar den har.
- Hur vi har testat den.
- Vad som hände när vi använde den.

### R03 – Subagenter

**Krav**

Minst fyra subagenter ska finnas.

Varje subagent behöver ha:
- En tydlig uppgift.
- En beskrivning av vilka verktyg den får använda.
- Ett definierat modellval.
- Tydliga begränsningar och behörigheter.
- Ett resultat som kan lämnas vidare till nästa steg.

Vi ska också kunna förklara hur agenterna samarbetar, hur arbetet fördelas och varför vissa moment eventuellt körs parallellt.

### R04 – Hooks

**Krav**

Minst fem fungerande hooks ska finnas. De ska användas för att styra och kontrollera arbetet, till exempel genom automatiska kodkontroller, säkerhetsregler och sessionshantering.

För varje hook behöver vi dokumentera:
- När den körs.
- Vad den gör.
- Vilka problem eller ändringar den kan stoppa.
- Hur vi har testat att den fungerar.
- Om det finns något den inte kan fånga.

### R05 – Sessionsminne

**Krav**

Riggen ska kunna spara information från ett arbetspass och använda den när arbetet fortsätter.

Det gäller bland annat:
- När en session startar.
- När en session avslutas.
- När kontexten komprimeras.
- När arbetet återupptas.

**Så visar vi att det fungerar**

Genom sessionsloggar och tester där vi faktiskt avslutar, komprimerar eller återupptar arbetet.

### R06 – Behörigheter och säkerhet

**Krav**

Projektets inställningar ska använda:
- `allow`
- `ask`
- `deny`

Vi ska kunna förklara:
- Vad agenten får göra utan att fråga.
- Vad jag behöver godkänna.
- Vad agenten inte får göra.
- Varför reglerna ser ut som de gör.
- Var agenten körs och vilket skydd som finns.
- Vilka begränsningar säkerhetslösningen har.

### R07 – Skydd av tester

**Krav**

AI-agenten får föreslå ändringar i tester, men får inte ta bort eller stänga av dem. Det ska finnas en automatisk kontroll som stoppar sådana försök.

**Så visar vi att det fungerar**

Med ett test där agenten försöker utföra en förbjuden åtgärd och kontrollen stoppar den.

### R08 – Sessionsloggar och spårbarhet

**Krav**

Det ska finnas en sessionslogg i `sessions/` efter varje arbetspass.

Loggen behöver visa:
- Var i arbetet vi befinner oss.
- Vad som har gjorts.
- Vad som fungerade och hur vi vet det.
- Vad som inte fungerade.
- Vilka beslut som har tagits och varför.
- Vad som återstår.
- Vad nästa steg är.

Instruktioner och andra ändringar som påverkar riggen ska versionshanteras i Git.

---

## 4. Praktiskt arbete med riggen

Riggen ska användas på tre olika typer av arbetsuppgifter. Alla delar behöver inte bli helt färdiga. Läraren har förtydligat att det viktigaste är att riggen fungerar, att den används i praktiken och att jag kan visa vad den gjorde.

Det som inte hinns med ska dokumenteras tillsammans med varför det återstår.

### R09 – Utveckla en ny funktion utifrån en user story

En av kursens föreslagna user stories ska väljas och användas som underlag för utvecklingsarbetet.

**Möjliga user stories**
1. Kunden ska kunna skicka samma beställning igen utan att en dubblett skapas.
2. Kunden ska kunna avbryta en beställning inom 30 minuter.
3. Beställningar ska kunna listas med sidindelning och filter på status.
4. Det ska gå att lägga till en rabattkod på en beställning.
5. Kunden ska kunna ändra leveransadress innan beställningen skickas.
6. Lagersaldot ska kontrolleras när en beställning läggs.
7. Kunder ska kunna sökas via namn eller e-post.
8. Kundens beställningar ska kunna exporteras som CSV.

**Arbetsflöde**

Research → Plan → Build → Review → Verify

Arbetet ska innehålla:
- En vald user story.
- Acceptanskriterier enligt Givet/När/Så.
- API-kontrakt med endpoint, statuskoder och felhantering.
- Testdriven utveckling.
- Kodgranskning.
- Verifiering.
- Spårbara commits.
- Ett dokumenterat arkitekturbeslut (ADR).

Varje fas ska lämna efter sig ett resultat som går att granska.

### R10 – Granska agentgenererad kod

Riggen ska kunna granska ett pull request eller en annan koduppgift som delas ut.

Granskningen ska kunna hitta minst ett problem inom varje område:
- Säkerhet.
- Struktur.
- Kodstandard.

För varje problem ska vi kunna visa:
- Vilken fil och rad det gäller.
- Vad som är fel.
- Varför det är ett problem.
- Vilken kontroll eller hook som skulle kunna upptäcka eller stoppa det.

Vi ska också kunna skilja mellan sådant de automatiska kontrollerna upptäcker och sådant som kräver en manuell granskning.

**Lärarens förtydligande**

Under seminariet kan vi få ett pull request, en utvecklingsuppgift eller en fråga att lösa med riggen. Därför behöver vi kunna använda den även på något vi inte har förberett i förväg.

### R11 – Modernisera äldre kod

Den äldre Python-modulen ska undersökas och moderniseras stegvis.

**Kodanalys**
- Skapa en codemap över moduler, ansvar och beroenden.
- Undersöka hur den befintliga koden fungerar.
- Identifiera problem och risker.

**Karakteriseringstester**
- Skapa minst fem tester som fångar hur koden fungerar i dag.
- Testerna ska även kunna dokumentera befintliga buggar, så att vi upptäcker om beteendet ändras under moderniseringen.

**Refaktorering**
- Genomföra minst tre mindre refaktoreringssteg.
- Kontrollera att testerna är gröna efter varje steg.
- Dokumentera ändringarna i Git.

**Databasmigrering**
- Ta fram en plan för hur databasen kan migreras stegvis.
- Använda expand/contract som strategi.
- Visa vilka steg som kan återställas och hur.

**Viktig avgränsning**

Moderniseringen måste inte bli helt färdig. Vi behöver däremot visa hur riggen används och dokumentera resultat, problem och återstående steg.

---

## 5. Krav på dokumentationen

Dokumentationen ska följa kursens mall och lämnas in som PDF.

### R12 – Kodbas, krav och beslut

Dokumentera:
- Vilken kodbas som används och varför.
- Vald user story.
- Acceptanskriterier enligt Givet/När/Så.
- API-kontrakt.
- Viktigt arkitekturbeslut (ADR).
- Vilka andra alternativ som fanns och varför de valdes bort.
- Antaganden om systemet och användarna.

### R13 – Riggens delar

För varje skill, subagent och hook ska vi beskriva:
- Vad den gör.
- Varför vi behöver den.
- Vilka problem den ska förhindra.
- Hur vi har kontrollerat att den fungerar.
- Vilka andra lösningar vi har funderat på.

### R14 – Behörigheter och körmiljö

Dokumentera:
- Allow-, ask- och deny-reglerna.
- Varför reglerna ser ut som de gör.
- Om agenten körs lokalt, i en container eller i någon annan sandlåda.
- Vilket skydd miljön ger och vilka begränsningar som finns.

### R15 – Arbetsflöde och kontext

Beskriv:
- Hur vi går från krav till färdig commit.
- Hur vi använder planer.
- Hur vi rensar och komprimerar kontext.
- Hur sessionsloggarna hjälper oss att fortsätta arbetet.
- Hur vi kan förstå varför en ändring gjordes genom Git-historiken.

Minst en commit ska användas som ett konkret exempel, med hash och hänvisningar till relevant dokumentation.

### R16 – Orkestrering och modellval

Dokumentera:
- Vilka faser arbetsflödet består av.
- Vilken fil eller vilket resultat varje fas lämnar vidare.
- Vilken modell varje subagent använder.
- Varför just de modellerna valdes.
- Hur kostnaden skulle skilja sig med en större modell.
- Vad som händer när ett steg misslyckas och behöver göras om.
- Vilka stoppvillkor som finns, exempelvis antal försök, kostnad eller tid.
- Vilka delar som körts parallellt.
- Om worktrees har använts eller valts bort, och varför.

### R17 – Kodgenerering och granskning

Beskriv:
- Vilka automatiska kodkontroller som används.
- Hur kontrollerna visar vad som behöver rättas.
- Vilka olika granskningssteg som finns.
- Vad varje kontroll kan upptäcka.
- När jag behöver granska eller godkänna arbetet.
- Vad den praktiska kodgranskningen visade.

### R18 – Modernisering

Redovisa:
- Codemap.
- Karakteriseringstester.
- Genomförda refaktoreringssteg.
- Testresultat.
- Plan för databasmigrering.
- Vad som fortfarande återstår.

### R19 – Mätningar och effektivitet

Dokumentera:
- Antal tokens per arbetsmoment.
- Hur lång tid varje arbetsmoment tog.
- Kostnad per arbetsmoment.
- Hur många fel kontrollerna upptäckte.
- Exempel på fel som hittades.
- Två möjliga sätt att minska kostnad eller tidsåtgång.
- Vilka nackdelar besparingarna kan få för kvalitet och säkerhet.

Det ska vara tydligt vilka siffror som faktiskt har mätts och vilka som är uppskattningar.

### R20 – Riggen i ett team och risker

Beskriv hur riggen skulle kunna införas i ett team med fem utvecklare.

Det ska framgå:
- Vad som bör införas först.
- Vad som kan vänta och varför.
- Vem som ansvarar för riggen.
- Hur ändringar ska granskas och godkännas.
- Hur ofta riggen behöver ses över.
- Vilka delar som går att återanvända om vi byter AI-modell eller utvecklingsverktyg.

**Riskanalys**

Identifiera minst fem risker med att använda en kodagent i projektet.

För varje risk ska vi beskriva:
- Vad som kan gå fel.
- Hur vi upptäcker problemet.
- Vad riggen gör för att förebygga eller hantera det.
- Vilken risk som eventuellt finns kvar.

### R21 – Erfarenheter och lärdomar

Beskriv:
- Vad som har fungerat bra.
- Vilka problem vi har stött på.
- Vad vi har fått ändra under arbetets gång.
- Vilka begränsningar som finns kvar.
- Vad jag skulle prioritera först om jag hade ytterligare en vecka.

---

## 6. Inlämning och redovisning

### R22 – Repository och Git

Repositoryt ska innehålla:
- Den fungerande AI-riggen.
- Projektinstruktioner.
- Skills och subagenter.
- Hooks och behörigheter.
- Automatiska kontroller.
- Planer och sessionsloggar.
- Genomförda arbetsuppgifter.
- Spårbara commits.

När arbetet är klart ska repositoryt taggas med `inlamning`. Taggen skapas först när allt som ska ingå är färdigt och kontrollerat.

### R23 – Dokumentation som PDF

Den ifyllda examinationsmallen ska lämnas in som PDF. Svar och slutsatser ska så långt det är möjligt kunna kopplas till filer, commits, tester eller sessionsloggar.

Det som står i rapporten måste stämma med det som faktiskt finns i projektet.

### R24 – Muntlig redovisning

Redovisningen ska börja med att visa:
- Vad riggen består av.
- Hur den fungerar.
- Vilka resultat vi har fått.
- Vad testerna och mätningarna visar.
- Vilka viktiga tekniska beslut som har tagits.

Vi ska också vara beredda på att kursledaren väljer en uppgift som ska lösas eller förklaras på plats.

Det kan till exempel handla om att:
- Visa att en hook stoppar en otillåten ändring.
- Återuppta arbetet från en sessionslogg.
- Använda en skill på ny kod.
- Granska ett pull request.
- Förklara en valfri commit.
- Motivera behörigheter och andra tekniska beslut.

Jag behöver kunna förklara både hur riggen fungerar och vilka begränsningar den har.

---

## 7. Projektets status den 16 november 2026

Den här delen bygger på de resultat Claude Code hittills har rapporterat. Statusen är preliminär tills den har kontrollerats mot filerna och testerna i repositoryt.

| Krav | Status | Underlag |
|---|---|---|
| R01 | Genomfört | Lint, typecheck och format:check |
| R02 | Genomfört | Fyra skills |
| R03 | Genomfört | Fyra subagenter |
| R04 | Genomfört | Fem hookskript och verifierade händelser |
| R05 | Genomfört | Sessionsminne och tester av kontexthantering |
| R06 | Genomfört | Behörighetsregler, agent-guard och main-guard |
| R07 | Uppfyllt (17 november 2026) | `test-guard.js` i `main-guard.js` och ask för `jest.config.js` och `pytest.ini`. ADR: `docs/adr/0001-testskydd-i-main-guard.md`. Bevis: Session 13 (riktiga körningar, 189 av 189 tester, mutationer 52 av 52 och 37 av 37). Commit `e3dbda2`. Kända begränsningar (M1, M2 med flera) är dokumenterade. |
| R08 | Genomförs löpande | PLAN.md och sessionsloggar 01–12 |
| R09 | Delvis | Fullständigt arbetsflöde för GET /health, men ingen av de valda user stories färdig |
| R10 | Förberett | Granskningsskill och agent finns; tilldelad PR återstår |
| R11 | Delvis | Analys och skill finns; praktisk modernisering återstår |
| R12–R21 | Delvis / återstår | Underlag finns men dokumentationsmallen är inte färdig |
| R22 | Delvis | Repository pushat; slutlig tagg saknas |
| R23 | Återstår | PDF ska färdigställas |
| R24 | Återstår | Redovisning och demonstration ska förberedas |

### 7.1 Resultat hittills

**Riggen**
- 155 av 155 riggtester godkända.
- 29 av 29 mutationer upptäckta i säkerhetstester.
- Tre medelallvarliga fynd från granskningen rättade.
- Sju lågprioriterade fynd dokumenterade för senare hantering.

**Första riktiga arbetsflödet**
- Research → Plan → Build → Review → Verify genomfört.
- Två tester skapade för GET /health.
- TDD med både rött och grönt testläge.
- Granskningen godkänd utan fynd.
- Lint, typecheck och format:check godkända.
- 73 700 agenttokens rapporterade för Build, Review och Verify.
- Commit `b2647f9` pushad till `origin/main`.

**Dokumentation och loggar**
- `PLAN.md`
- `docs/plans/`
- `sessions/`
- `metrics/arbetsmoment.csv`

### 7.2 Det vi behöver prioritera

1. Kontrollera att riggen uppfyller kravet på skydd av befintliga tester.
2. Genomföra en del av en vald user story.
3. Testa `karakterisera` på den äldre Python-modulen och dokumentera resultatet.
4. Kontrollera att det finns en ADR för ett viktigt tekniskt beslut.
5. Sammanställa mätvärden och kostnadsjämförelser.
6. Fylla i examinationsmallen.
7. Förbereda den praktiska redovisningen.
8. Kontrollera repositoryt, skapa taggen och lämna in arbetet.

---

## 8. Så följer vi upp kraven

Dokumentet används för att planera arbetet och kontrollera vad som faktiskt är färdigt.

### Status

- **Ej påbörjat:** Vi har inte gjort något som kan visas.
- **Pågår:** Arbetet har startat men är inte klart.
- **Delvis uppfyllt:** En del är färdig och verifierad.
- **Uppfyllt:** Kravet är kontrollerat och det finns bevis.
- **Ej tillämpligt:** Kravet är inte relevant och vi har dokumenterat varför.

### Vad räknas som bevis?

Ett krav ska inte markeras som uppfyllt bara för att en agent säger att det fungerar. Det ska finnas något konkret att hänvisa till, exempelvis:
- Fil och sökväg.
- Testkommando och resultat.
- Sessionslogg.
- Commit-hash.
- Mätvärde.
- Dokumenterat beslut.

### Ansvarsfördelning

**Jag som student**
- Bestämmer vad vi ska prioritera.
- Godkänner viktiga ändringar.
- Ansvarar för att resultatet motsvarar kraven.
- Ska kunna förklara lösningarna vid redovisningen.

**AI-riggen**
- Utför de tekniska uppgifter den får.
- Följer projektets instruktioner.
- Använder skills, subagenter och automatiska kontroller.
- Dokumenterar resultat, problem och begränsningar.
- Kan föreslå att ett krav är uppfyllt, men ska visa bevis för det.

### Regler för uppföljning

- Vi ska skilja på vad som är planerat och vad som faktiskt är gjort.
- Om resultatet avviker från planen ska det dokumenteras.
- Krav får inte markeras som uppfyllda utan bevis.
- Om något är osäkert ska det framgå tydligt.
- Det ska gå att fortsätta arbetet i en ny session utan att viktiga beslut tappas bort.

---

## 9. Checklista före inlämning

- [ ] Alla tekniska grundkrav är kontrollerade.
- [ ] Riggen har använts i riktigt utvecklingsarbete.
- [ ] Vald user story och acceptanskriterier finns dokumenterade.
- [ ] Kodgranskningen är dokumenterad.
- [ ] Moderniseringsarbetet och det som återstår är dokumenterat.
- [ ] Viktiga beslut och alternativa lösningar finns med.
- [ ] Mätningar och kostnadsjämförelser är sammanställda.
- [ ] Minst fem risker och tillhörande åtgärder finns beskrivna.
- [ ] Examinationsmallen är ifylld.
- [ ] Filhänvisningar, commits och testresultat är kontrollerade.
- [ ] PDF är skapad och granskad.
- [ ] Repositoryt är uppdaterat och pushat.
- [ ] Git-taggen `inlamning` är skapad.
- [ ] Den praktiska demonstrationen är förberedd.
- [ ] Jag kan förklara de viktigaste tekniska besluten.

---

## 10. Om dokumentet

Detta är min egen sammanställning av kursens examinationsuppgift för delkurs 2. Syftet är att ha en tydlig överblick över kraven, vad vi har gjort och vad som återstår.

Om något i sammanställningen skulle skilja sig från lärarens originaluppgift är det alltid originalet som gäller.

Avsnitt 2–6 bygger på kursens krav och lärarens förtydliganden. Avsnitt 7–9 beskriver projektets aktuella status och hur jag har valt att följa upp arbetet. De är inte ytterligare krav från läraren.

Det är kursledaren som gör den slutliga bedömningen. Målet är att kunna visa ett genomtänkt arbete med fungerande teknik, tydliga beslut och resultat som går att kontrollera.
