# API

Alla anrop utom `POST /customers` och `/health` kräver headern `X-Customer-Id` med den inloggade kundens id. Det är en förenklad inloggning för övningen.

| Metod och sökväg | Beskrivning | Svar |
|---|---|---|
| `GET /health` | Kontroll att API:t kör. | 200 |
| `POST /customers` | Registrera en kund. Body: `{ name, email }`. | 201, 400 |
| `GET /customers/me` | Den inloggade kunden. | 200, 401, 404 |
| `GET /customers/me/orders` | Den inloggade kundens beställningar, nyast först, sidvis. Query: `page` (heltal >= 1, standard 1), `limit` (heltal 1-100, standard 20) och `status` (`new`, `paid`, `shipped` eller `cancelled`, standard alla). Svar: `{ items: [{ id, status, createdAt }], page, limit, total }`, där `total` är antalet som matchar filtret. `page` och `limit` ska vara hela tal utan tecken och decimaler. Inledande nollor godtas (`page=01` ger sida 1), och svaret visar det tolkade värdet. Samma parameter får bara anges en gång: `?page=1&page=2` (och motsvarande för `limit` och `status`) ger 400. Okända parametrar ignoreras. En sida bortom slutet och en tom lista ger 200 med tom `items`. Se `docs/adr/0002-sidindelning-orders.md`. | 200, 400, 401 |
| `POST /orders` | Lägg en beställning. Body: `{ lines: [{ product, quantity, unitPrice }], discountCode? }`. | 201, 400, 401 |
| `GET /orders/:id` | En egen beställning med rader. | 200, 400, 401, 403, 404 |
| `GET /orders/:id/price` | Pris för en egen beställning: `{ net, vat, total }`. Räknas av den äldre modulen. | 200, 400, 401, 403, 404 |

## Den äldre modulen

`src/legacy/price_calc.py` räknar pris, rabatt och moms för en beställning. Den är skriven i Python. Den hade från början varken tester eller dokumentation, men har sedan R11 karakteriseringstester (`tests/legacy/`) och en codemap (`docs/legacy/price_calc.md`). Den anropas från två ställen: API:t (via `src/pricing/legacyPrice.ts`) och den nattliga rapporten `jobs/nightly_report.py`.

Den går att köra direkt:

```bash
python3 src/legacy/price_calc.py 1042
```
