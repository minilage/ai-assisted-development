# Promptmall

Mallen används som stöd när instruktioner skrivs för skills, subagenter och enskilda uppgifter till AI-agenten. Den följer strukturen i `CLAUDE.md` under rubriken "Skills och subagenter".

Alla rubriker behöver inte användas varje gång. Ta med det som behövs för att uppgiften ska bli tydlig och avgränsad.

## Mall

```markdown
## Roll

Vem agenten är och vilket ansvarsområde den har.
Exempel: "Du är en kodgranskare som granskar ändringar mot projektets kodstandard."

## Uppgift

Vad som ska göras i det här arbetsmomentet och vad som ligger utanför uppdraget.

## Kontext och relevanta dokument

Vilka filer, dokument och tidigare resultat agenten ska utgå från.
Exempel: `docs/standard.md`, `docs/api.md`, `PLAN.md`, senaste loggen i `sessions/`.

## Regler och begränsningar

Vad agenten måste följa och vad den inte får göra.
- Följ `docs/standard.md`.
- Ändra bara det som ingår i uppgiften.
- Vilka verktyg agenten får använda.
- Vad som kräver godkännande innan det genomförs.

## Förväntat resultat och format

Vad agenten ska leverera och i vilken form.
Exempel: en lista med fynd, en plan med berörda filer eller en redovisning
under rubrikerna Genomfört, Filer, Kontroller, Problem och beslut, Nästa steg.

## Verifiering

Vilka tester eller kontroller ska göras för att kontrollera resultatet?
Ange hur resultatet ska dokumenteras.
Om uppgiften bara gäller undersökning ska inga filer ändras.

## Stoppvillkor

När ska agenten avsluta sitt arbete?
Avsluta när det godkända arbetsmomentet är genomfört och kontrollerat.
Redovisa resultatet och invänta godkännande innan nästa arbetsmoment påbörjas.

## Exempel (vid behov)

Ett kort exempel på önskat resultat eller arbetssätt.
```

## Checklista

Innan instruktionen används, kontrollera att:

- [ ] Rollen är tydlig och avgränsad.
- [ ] Uppgiften säger både vad som ska göras och vad som inte ingår.
- [ ] De dokument som behövs finns med och finns i projektet.
- [ ] Reglerna stämmer med `CLAUDE.md` och `docs/standard.md`.
- [ ] Det framgår vilka verktyg agenten får använda.
- [ ] Det förväntade resultatet går att kontrollera.
- [ ] Det framgår vad nästa agent eller fas behöver kontrollera när arbetet lämnas vidare.
- [ ] Det framgår hur resultatet ska verifieras.
- [ ] Det finns ett tydligt stoppvillkor.
