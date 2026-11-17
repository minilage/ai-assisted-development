# ADR 0002: Sidindelning och statusfilter för GET /customers/me/orders

**Status:** Accepterad (17 november 2026), efter Review och Verify. Inte committad.
**Datum:** 2026-11-17
**Krav:**

- R09 (`docs/examination/requirements.md:194`)
- User story 3 (`docs/user-stories.md:7`)

**Plan:** `docs/plans/05-sidindelning-orders.md` (godkänd 2026-11-17, med svarsform A och offset-paginering)
**Gren:** `feature/r09-orders-pagination`

## 1. Vilket problem behövde lösas?

`GET /customers/me/orders` returnerar alla kundens beställningar i en enda ren array, utan gräns och utan filter (`src/routes/customers.ts:21-24` och `src/services/customerService.ts:33-40`, radnumren gäller koden före ändringen, `e3dbda2`):

- Svaret växer obegränsat med antalet beställningar.
- Kunden kan inte filtrera på status.
- Sorteringen är `created_at DESC` utan `id`, så ordningen är inte entydig när två beställningar har samma tid. Det går inte att bygga sidindelning på en sådan ordning.

## 2. Vilken lösning valdes?

**Query-parametrar:**

| Parameter | Standard | Regel                                       |
| --------- | -------- | ------------------------------------------- |
| `page`    | 1        | heltal >= 1                                 |
| `limit`   | 20       | heltal 1-100                                |
| `status`  | alla     | en av `new`, `paid`, `shipped`, `cancelled` |

Ogiltigt värde ger 400 med `{ "error": { "code": "invalid_input", "message": "..." } }`. Inledande nollor godtas (`page=01` är sida 1). Upprepad parameter (`?page=1&page=2`) ger 400. Okända parametrar ignoreras. Utan inloggning blir svaret 401, också med ogiltiga parametrar.

**Offset-paginering** med stabil sortering `created_at DESC, id DESC`. Två parametriserade SQL-frågor: en för sidan (`LIMIT`/`OFFSET`) och en `COUNT(*)::int` för totalen.

**Svarsform A**, ett omslag:

```json
{
  "items": [{ "id": 1047, "status": "new", "createdAt": "2026-10-10T18:55:00.000Z" }],
  "page": 1,
  "limit": 20,
  "total": 2
}
```

`items` har samma element som dagens lista. `total` är antalet beställningar som matchar filtret, inte antalet på sidan. En sida bortom slutet ger 200 med tom `items`.

## 3. Brytande ändring av API-kontraktet

Det här är en **brytande ändring** av ett publikt kontrakt (`docs/api.md:10`). Användaren har godkänt den separat (2026-11-17).

| Före                                | Efter                                                      |
| ----------------------------------- | ---------------------------------------------------------- |
| Svaret är en array av beställningar | Svaret är ett objekt, och beställningarna ligger i `items` |
| Alla beställningar returneras       | Högst `limit` (standard 20) returneras                     |
| Inga query-parametrar               | `page`, `limit` och `status`                               |

Två saker bryts för en klient:

1. **Formen.** En klient som gör `res.map(...)` eller `res.length` på svaret får ett objekt i stället för en array.
2. **Antalet.** Också en klient utan query får högst 20 beställningar. Det gäller alla svarsformer, inte bara A. Klienten måste läsa `total` och hämta fler sidor för att få alla.

**Konsekvenser för migrering:**

- I det här repot är det bara ett test som läser svaret, `tests/customers.test.ts:51-57` (före ändringen, `e3dbda2`). Det anpassas till `res.body.items`. Bara det förväntade värdet följer det nya kontraktet. Inget test tas bort eller stängs av (`docs/standard.md:35`).
- `docs/api.md:10` uppdateras med parametrarna och svarsformen.
- Externa klienter är inte kända. Antagandet är att det inte finns några, eftersom det är ett övningsprojekt. Om det finns måste de ändras samtidigt som API:t driftsätts. Ingen versionering av API:t finns att luta sig mot (`docs/api.md` har ingen versionsprefix).
- Ingen databasmigrering behövs. Ingen schemaändring ingår.
- Återgång: ändringen ligger på en egen gren och i egna commits (se planen). Den går att backa med `git revert` av commitarna utan att databasen påverkas.

## 4. Fanns det andra alternativ?

**Svarsform:**

| Alternativ                                           | Styrka                                                                                                      | Svaghet                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **A. Omslag `{ items, page, limit, total }`** (valt) | Klienten får total och kan bygga sidnavigering. Går att utöka (till exempel `hasMore`) utan att bryta igen. | Bryter formen: svaret är inte längre en array.                                                           |
| **B. Ren array, `total` i headern `X-Total-Count`**  | Formen är oförändrad för klienter som läser en array.                                                       | Standardgränsen bryter ändå antalet. Totalen göms i en header, som är lätt att missa och svår att utöka. |
| **C. Ren array, ingen total**                        | Minst ändring.                                                                                              | Klienten vet inte hur många sidor som finns. Uppfyller "sidvis" svagare.                                 |

**Pagineringsmetod:**

| Alternativ                                | Styrka                                                                            | Svaghet                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Offset (`page`, `limit`)** (valt)       | Enkelt. Passar storyns "sidvis". Går att hoppa till sida N. Ger en entydig total. | Sidor kan glida om beställningar läggs till under läsning. `OFFSET` blir långsammare på stora tabeller. |
| **Cursor (keyset) på `(created_at, id)`** | Stabil även när nya poster tillkommer. Snabb på stora tabeller.                   | Cursor är ogenomskinlig. Går inte att hoppa till sida N. Ger ingen enkel total. Mer kod för en övning.  |

**Övrigt som valdes bort:**

- `COUNT(*) OVER()` i samma fråga: en fråga mindre, men ingen total när sidan ligger bortom slutet.
- Validering av status mot en tabell eller CHECK: kräver schemaändring, som inte ingår.

## 5. Konsekvenser

- **Glidande sidor:** med offset kan en post visas två gånger eller hoppas över om en beställning läggs under läsningen. Den stabila sorteringen `created_at DESC, id DESC` ger en entydig ordning mellan anropen, men tar inte bort glidningen helt. För nya beställningar, som hamnar först, förskjuts alla efterföljande sidor.
- **Prestanda:** orders saknar index utöver primärnyckeln (`db/schema.sql:24-30`). Vid stor datamängd rekommenderas `orders(customer_id, created_at DESC, id DESC)`. Det ingår inte här, eftersom det är en schemaändring som kräver eget godkännande och en migrering som går att backa. Om datamängden växer bör cursor-paginering också omprövas.
- **Statusar:** mängden `new`, `paid`, `shipped` och `cancelled` är ett antagande utifrån seed och default. Det finns ingen CHECK i databasen. Okända värden i databasen går inte att filtrera fram, och okänd status i anropet ger 400.
- **Stora `page`-värden:** `page` över `Number.MAX_SAFE_INTEGER` ger 400. Med `limit` högst 100 ryms `OFFSET` i int8. Marginalen beror på `MAX_LIMIT` (100). Om gränsen höjs över ungefär 1000 kan `OFFSET` överskrida int8 och ge 500, och då behövs en egen övre gräns för `page`. Inget test låser detta (valfritt, ingår inte i R09).
- **Totalen och sidan hämtas i två frågor** utan gemensam ögonblicksbild, så `total` kan avvika från `items` om en beställning skapas mellan frågorna.
- **Känd brist utanför R09:** `requireCustomer` svarar med koden `unauthorized`, som inte finns i `ErrorCode` (`src/result.ts:2`). Den rörs inte här.

## 6. Länkar

- Plan: `docs/plans/05-sidindelning-orders.md`
- Krav: R09, user story 3
- Sessionslogg: `sessions/session-14-2026-11-17.md`
