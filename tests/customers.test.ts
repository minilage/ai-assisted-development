import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { closeDb, resetDb } from "./helpers/db";

const app = createApp();

beforeEach(resetDb);
afterAll(closeDb);

describe("POST /customers", () => {
  it("skapar en kund och returnerar 201", async () => {
    const res = await request(app)
      .post("/customers")
      .send({ name: "Ida Ström", email: "ida.strom@example.com" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Ida Ström", email: "ida.strom@example.com" });
    expect(res.body.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returnerar 400 när name saknas", async () => {
    const res = await request(app).post("/customers").send({ email: "x@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it("returnerar 400 när email saknas", async () => {
    const res = await request(app).post("/customers").send({ name: "Ida Ström" });
    expect(res.status).toBe(400);
  });
});

describe("GET /customers/me", () => {
  it("returnerar den inloggade kunden", async () => {
    const res = await request(app).get("/customers/me").set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alva Lind");
  });

  it("returnerar 401 utan inloggning", async () => {
    const res = await request(app).get("/customers/me");
    expect(res.status).toBe(401);
  });

  it("returnerar 404 för en kund som inte finns", async () => {
    const res = await request(app).get("/customers/me").set("X-Customer-Id", "999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("GET /customers/me/orders", () => {
  it("listar bara den inloggade kundens beställningar, nyast först", async () => {
    const res = await request(app).get("/customers/me/orders").set("X-Customer-Id", "2");
    expect(res.status).toBe(200);
    expect(res.body.items.map((o: { id: number }) => o.id)).toEqual([1047, 1041]);
  });

  it("returnerar första sidan med 20 beställningar när query saknas", async () => {
    // Kund 7 saknar beställningar i testdatan. Högre id får senare created_at.
    await db.query(
      `INSERT INTO orders (id, customer_id, status, created_at)
       SELECT g, $1, 'new', '2026-11-01 12:00:00+01'::timestamptz + (g - 3000) * interval '1 hour'
       FROM generate_series(3001, 3025) AS g`,
      [7],
    );

    const res = await request(app).get("/customers/me/orders").set("X-Customer-Id", "7");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.total).toBe(25);
    expect(res.body.items).toHaveLength(20);
    expect(res.body.items.map((o: { id: number }) => o.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => 3025 - i),
    );
  });

  // Lägger 25 beställningar (id 3001-3025) på kund 7, som saknar beställningar i testdatan.
  // Högre id får senare created_at. De 12 första (3001-3012) är paid, resten new.
  async function seed25ForCustomer7(): Promise<void> {
    await db.query(
      `INSERT INTO orders (id, customer_id, status, created_at)
       SELECT g, $1, CASE WHEN g <= 3012 THEN 'paid' ELSE 'new' END,
              '2026-11-01 12:00:00+01'::timestamptz + (g - 3000) * interval '1 hour'
       FROM generate_series(3001, 3025) AS g`,
      [7],
    );
  }

  const idsOf = (body: { items: { id: number }[] }): number[] => body.items.map((o) => o.id);
  const range = (from: number, to: number): number[] =>
    Array.from({ length: from - to + 1 }, (_, i) => from - i);

  it("page=2&limit=10 ger post 11-20 och total 25", async () => {
    await seed25ForCustomer7();
    const res = await request(app)
      .get("/customers/me/orders?page=2&limit=10")
      .set("X-Customer-Id", "7");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
    expect(res.body.total).toBe(25);
    expect(idsOf(res.body)).toEqual(range(3015, 3006));
  });

  it("sista sidan har resten", async () => {
    await seed25ForCustomer7();
    const res = await request(app)
      .get("/customers/me/orders?page=3&limit=10")
      .set("X-Customer-Id", "7");
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual(range(3005, 3001));
    expect(res.body.total).toBe(25);
  });

  it("sida bortom slutet ger 200 och tom items", async () => {
    await seed25ForCustomer7();
    const res = await request(app)
      .get("/customers/me/orders?page=9&limit=10")
      .set("X-Customer-Id", "7");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(25);
  });

  it("limit 1 och 100 accepteras", async () => {
    await seed25ForCustomer7();
    const one = await request(app)
      .get("/customers/me/orders?page=1&limit=1")
      .set("X-Customer-Id", "7");
    expect(one.status).toBe(200);
    expect(one.body.limit).toBe(1);
    expect(idsOf(one.body)).toEqual([3025]);

    const hundred = await request(app)
      .get("/customers/me/orders?limit=100")
      .set("X-Customer-Id", "7");
    expect(hundred.status).toBe(200);
    expect(hundred.body.limit).toBe(100);
    expect(hundred.body.items).toHaveLength(25);
  });

  it.each(["0", "-5", "101", "1.5", "abc"])("limit %s ger 400", async (limit) => {
    const res = await request(app)
      .get("/customers/me/orders")
      .query({ limit })
      .set("X-Customer-Id", "2");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
    expect(typeof res.body.error.message).toBe("string");
  });

  it.each(["0", "-1", "1.5", "abc"])("page %s ger 400", async (page) => {
    const res = await request(app)
      .get("/customers/me/orders")
      .query({ page })
      .set("X-Customer-Id", "2");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it("status=paid ger bara paid", async () => {
    const res = await request(app)
      .get("/customers/me/orders?status=paid")
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([1042]);
    expect(res.body.total).toBe(1);
  });

  it.each(["finns-inte", ""])("okänd status %j ger 400 invalid_input", async (status) => {
    const res = await request(app)
      .get("/customers/me/orders")
      .query({ status })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
    for (const allowed of ["new", "paid", "shipped", "cancelled"]) {
      expect(res.body.error.message).toContain(allowed);
    }
  });

  it("status och page ihop, total 12", async () => {
    await seed25ForCustomer7();
    const res = await request(app)
      .get("/customers/me/orders?status=paid&limit=10&page=2")
      .set("X-Customer-Id", "7");
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([3002, 3001]);
    expect(res.body.total).toBe(12);
  });

  it("kund utan beställningar ger 200 och tom lista", async () => {
    const created = await request(app)
      .post("/customers")
      .send({ name: "Ny Kund", email: "ny.kund@example.com" });
    expect(created.status).toBe(201);

    const res = await request(app)
      .get("/customers/me/orders")
      .set("X-Customer-Id", String(created.body.id));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("tom lista och total 0 när ingen beställning har vald status", async () => {
    const res = await request(app)
      .get("/customers/me/orders?status=cancelled")
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("401 utan X-Customer-Id, även med giltiga och ogiltiga query-parametrar", async () => {
    const valid = await request(app).get("/customers/me/orders?page=1&limit=10");
    expect(valid.status).toBe(401);
    const invalid = await request(app).get("/customers/me/orders?limit=abc");
    expect(invalid.status).toBe(401);
  });

  it("ser aldrig andras beställningar, även med status och customerId i query", async () => {
    const res = await request(app)
      .get("/customers/me/orders?status=shipped&customerId=1")
      .set("X-Customer-Id", "2");
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([1041]);
    expect(res.body.total).toBe(1);

    const all = await request(app)
      .get("/customers/me/orders?customerId=1")
      .set("X-Customer-Id", "2");
    expect(idsOf(all.body)).toEqual([1047, 1041]);
  });

  it("lika created_at sorteras på id DESC och sidgränser överlappar inte", async () => {
    await db.query(
      `INSERT INTO orders (id, customer_id, status, created_at)
       SELECT g, $1, 'new', '2026-11-01 12:00:00+01'::timestamptz
       FROM generate_series(3001, 3025) AS g`,
      [7],
    );
    const pages = [];
    for (const page of [1, 2, 3]) {
      const res = await request(app)
        .get(`/customers/me/orders?page=${page}&limit=10`)
        .set("X-Customer-Id", "7");
      expect(res.status).toBe(200);
      pages.push(...idsOf(res.body));
    }
    expect(pages).toEqual(range(3025, 3001));

    const again = await request(app)
      .get("/customers/me/orders?page=1&limit=10")
      .set("X-Customer-Id", "7");
    expect(idsOf(again.body)).toEqual(range(3025, 3016));
  });

  it("okänd parameter ignoreras", async () => {
    const res = await request(app).get("/customers/me/orders?sort=x").set("X-Customer-Id", "2");
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([1047, 1041]);
  });

  it("page=01 tolkas som page 1", async () => {
    const res = await request(app).get("/customers/me/orders?page=01").set("X-Customer-Id", "2");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(idsOf(res.body)).toEqual([1047, 1041]);
  });

  it("limit=007 tolkas som limit 7", async () => {
    const res = await request(app).get("/customers/me/orders?limit=007").set("X-Customer-Id", "2");
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(7);
  });

  it.each([
    "page=1&page=2",
    "limit=10&limit=20",
    "status=paid&status=new",
    "status[]=paid",
    "page[]=1",
    "limit[]=10",
  ])("upprepad parameter %s ger 400 invalid_input", async (qs) => {
    const res = await request(app).get(`/customers/me/orders?${qs}`).set("X-Customer-Id", "2");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });
});
