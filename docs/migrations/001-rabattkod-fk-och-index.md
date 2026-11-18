# Migreringsplan 001: främmande nyckel för rabattkod och index på orders (exempel, R11)

**Status:** Plan, **inte körd**. Inget SQL i det här dokumentet har körts mot någon databas, och `db/schema.sql` är oförändrad. SQL-satserna är inte syntaxkontrollerade mot Postgres. De ska provas på en kopia av databasen innan de används.
**Datum:** 2026-11-18
**Krav:** R11, avsnittet "Databasmigrering" (`docs/examination/requirements.md:263-266`): stegvis migrering, expand/contract och vilka steg som går att återställa.
**Underlag:** `docs/legacy/price_calc.md` (codemap), `db/schema.sql:17-30`, `src/services/orderService.ts:38-45`, F4 i `docs/examination/r10-granskning-pr-r09.md` (inget index på `orders.customer_id`). **Obs:** granskningsdokumentet och ADR 0002 finns på grenen `feature/r09-orders-pagination` och inte på `main`, där den här grenen utgår från. Hänvisningarna fungerar först när R09-grenen är sammanslagen.

## Varför de här två ändringarna

1. **Främmande nyckel `orders.discount_code → discounts.code`.** Koden kontrollerar inte rabattkoden någonstans:
   - `POST /orders` sparar vilken text som helst som `discount_code` (`src/services/orderService.ts:38-45`).
   - Den äldre prisberäkningen ignorerar en okänd kod utan fel (`src/legacy/price_calc.py:41-45`), så beställningen får fullt pris utan att någon märker det.
   - `discounts.code` är redan primärnyckel (`db/schema.sql:17-22`), så den kan vara mål för en främmande nyckel.
2. **Index `orders(customer_id, created_at DESC, id DESC)`.** `orders` saknar index utöver primärnyckeln (`db/schema.sql:24-30`). `GET /customers/me/orders` filtrerar på `customer_id` och sorterar på `created_at DESC, id DESC` (ADR 0002 och F4 i R10-granskningen, båda på R09-grenen, se ovan).

## Strategi: expand/contract

Varje fas ska kunna rullas ut och återställas för sig. Applikationen (API:t och Python-modulen) fungerar mot både det gamla och det nya schemat under hela vägen, tills fas 3.

| Fas | Syfte | Ändrar data? | Går att återställa? |
|---|---|---|---|
| 0. Förkontroll | Läs, ändra inget | nej | ingenting att återställa |
| 1. Expand | Lägg till index och en nyckel som bara kontrollerar nya rader | nej | **ja**, helt |
| 2. Migrera | Rätta befintliga rader och validera nyckeln | **ja** | **ja**, med säkerhetskopia |
| 3. Contract | Tvinga fram nya beteendet i applikationen och städa | nej i databasen, ja i koden | **delvis**, se nedan |

### Fas 0: förkontroll (bara läsning)

Hitta rader som skulle bryta mot nyckeln:

```sql
SELECT o.id, o.discount_code
  FROM orders o
  LEFT JOIN discounts d ON d.code = o.discount_code
 WHERE o.discount_code IS NOT NULL AND d.code IS NULL;
```

Ett tomt resultat betyder att fas 2 blir trivial. Testdatan i `db/seed.sql` bör ge tomt (alla koder, inklusive den utgångna `GAMMAL15`, finns i `discounts`), men det är **inte körd**. Rader som kommer tillbaka kräver ett affärsbeslut i fas 2.

### Fas 1: expand (additiv och bakåtkompatibel)

```sql
-- Går inte i en transaktion (CONCURRENTLY). Blockerar inte skrivningar (se risk 3).
CREATE INDEX CONCURRENTLY idx_orders_customer_created
    ON orders (customer_id, created_at DESC, id DESC);

-- Kontrollerar nya och ändrade rader, men inte de som redan finns.
ALTER TABLE orders
    ADD CONSTRAINT orders_discount_code_fkey
    FOREIGN KEY (discount_code) REFERENCES discounts (code) NOT VALID;
```

- **Effekt:** `POST /orders` med en okänd rabattkod ger nu ett databasfel (23503). Se risk 1.
- **Återställning (ingen dataförlust):**
  ```sql
  ALTER TABLE orders DROP CONSTRAINT orders_discount_code_fkey;
  DROP INDEX CONCURRENTLY idx_orders_customer_created;
  ```

### Fas 2: migrera (data)

1. Skapa en säkerhetskopia av de rader som ska ändras:
   ```sql
   CREATE TABLE orders_discount_backup AS
   SELECT id, discount_code FROM orders
    WHERE discount_code IS NOT NULL
      AND discount_code NOT IN (SELECT code FROM discounts);
   ```
2. **Beslut (affärsregel, inte tekniskt):** för varje ogiltig kod, antingen lägg till koden i `discounts` eller sätt `discount_code` till `NULL`. Att sätta `NULL` ändrar inte priset: den äldre modulen ignorerar redan en okänd kod, så en beställning med okänd kod och en med `NULL` får samma pris. Att i stället lägga till koden i `discounts` ändrar däremot priset för de beställningarna, och bör därför bara göras om det är avsikten.
3. Validera nyckeln. Den låser inte skrivningar:
   ```sql
   ALTER TABLE orders VALIDATE CONSTRAINT orders_discount_code_fkey;
   ```
- **Återställning (i den här ordningen):** 1) ta bort nyckeln som i fas 1 (`DROP CONSTRAINT`). En `NOT VALID`-nyckel kontrollerar ändå ändrade rader, så uppdateringen i nästa steg skulle annars ge `23503` för en ogiltig kod. 2) Återinför koderna från `orders_discount_backup` (`UPDATE orders o SET discount_code = b.discount_code FROM orders_discount_backup b WHERE b.id = o.id;`). `VALIDATE` ändrar ingen data, så det steget behöver inget eget återställningssteg. **Säkerhetskopian får inte tas bort förrän fas 3 är klar och accepterad.**

### Fas 3: contract (applikation och städning)

1. **API:t:** `POST /orders` ska svara 400 för en okänd rabattkod, i stället för att låta databasen svara 500. Det ändrar det publika kontraktet (`docs/api.md:11`) och kräver separat godkännande, plus tester.
2. **Python-modulen:** när alla rader är giltiga behövs inte grenen som ignorerar en okänd kod (`src/legacy/price_calc.py:43-45`). Den tas bort först när karakteriseringstesterna är uppdaterade, eftersom ett test just låser det beteendet.
3. **`db/schema.sql`:** lägg in nyckeln och indexet, så att `resetDb` i testerna får samma schema. Det är en ändring av databasschemat och kräver separat godkännande.
4. **Städa:** ta bort `orders_discount_backup`.

- **Återställning:** fas 3.1–3.3 går att återställa med `git revert` av kodändringarna och med fas 1:s `DROP CONSTRAINT`. **Fas 3.4 går inte att återställa** (säkerhetskopian försvinner). Det är den enda punkten utan återvändo, och den görs sist, efter en avtalad väntetid.

## Risker och öppna frågor

1. **Fas 1 ändrar beteendet för skrivningar direkt.** En klient som skickar en okänd kod får ett databasfel redan efter fas 1, och API:t har ingen felhantering för det (jämför F3 i R10-granskningen, där ett databasfel i en `async`-handler stoppar processen). **Fas 1 bör därför inte rullas ut före fix av felhanteringen eller fas 3.1.** Det är den största risken i planen.
2. **Ogiltiga rader:** vilka rader som finns i produktion är okänt. Fas 0 måste köras först.
3. **Låsning:** `CREATE INDEX CONCURRENTLY` och `VALIDATE CONSTRAINT` blockerar inte skrivningar. `ADD CONSTRAINT … NOT VALID` tar ändå ett kort lås (`SHARE ROW EXCLUSIVE`) på `orders` och `discounts`, och går därför snabbt men inte helt utan lås. Ett misslyckat `CREATE INDEX CONCURRENTLY` kan lämna ett ogiltigt index (`INVALID`) som måste tas bort med `DROP INDEX CONCURRENTLY` innan nästa försök. Inget av detta är mätt mot en riktig datamängd eller provkört.
4. **Provkörning:** inget av SQL:en är körd. Lägg till en provkörning på en kopia och en kontroll av att `db/schema.sql` och migreringen ger samma resultat.
5. **Testmiljön:** `resetDb` (`tests/helpers/db.ts`) bygger om databasen från `db/schema.sql`. Så länge schemat inte ändras påverkas varken Jest- eller Python-testerna.

## Det som inte ingår
- Att köra något av SQL:en eller ändra `db/schema.sql`.
- Statusfältet (`orders.status`) och fler index.
- Rättning av den äldre modulens beteende (avrundning, rabattens giltighetstid).
