import { db } from "../db";
import { Result, ok, err } from "../result";

export type Customer = { id: number; uuid: string; name: string; email: string };

export type OrderSummary = { id: number; status: string; createdAt: string };

export async function createCustomer(input: {
  name?: unknown;
  email?: unknown;
}): Promise<Result<Customer>> {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    return err("invalid_input", "name saknas.");
  }
  if (typeof input.email !== "string" || input.email.trim() === "") {
    return err("invalid_input", "email saknas.");
  }
  const res = await db.query(
    "INSERT INTO customers (name, email) VALUES ($1, $2) RETURNING id, uuid, name, email",
    [input.name.trim(), input.email.trim()],
  );
  return ok(res.rows[0]);
}

export async function getCustomer(id: number): Promise<Result<Customer>> {
  const res = await db.query("SELECT id, uuid, name, email FROM customers WHERE id = $1", [id]);
  if (res.rowCount === 0) {
    return err("not_found", `Kund ${id} finns inte.`);
  }
  return ok(res.rows[0]);
}

export type OrderPage = {
  items: OrderSummary[];
  page: number;
  limit: number;
  total: number;
};

export type OrderListQuery = { page?: unknown; limit?: unknown; status?: unknown };

const ORDER_STATUSES = ["new", "paid", "shipped", "cancelled"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Godtar bara en sträng av siffror. Saknat värde ger standardvärdet.
function parseInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function listOrdersForCustomer(
  customerId: number,
  query: OrderListQuery,
): Promise<Result<OrderPage>> {
  const page = parseInteger(query.page, DEFAULT_PAGE);
  if (page === null || page < 1) {
    return err("invalid_input", "page måste vara ett heltal som är minst 1.");
  }
  const limit = parseInteger(query.limit, DEFAULT_LIMIT);
  if (limit === null || limit < 1 || limit > MAX_LIMIT) {
    return err("invalid_input", `limit måste vara ett heltal mellan 1 och ${MAX_LIMIT}.`);
  }
  let status: string | null = null;
  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !ORDER_STATUSES.includes(query.status)) {
      return err("invalid_input", `status måste vara en av: ${ORDER_STATUSES.join(", ")}.`);
    }
    status = query.status;
  }

  const rows = await db.query(
    `SELECT id, status, created_at AS "createdAt"
       FROM orders
      WHERE customer_id = $1 AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC, id DESC
      LIMIT $3 OFFSET $4`,
    [customerId, status, limit, (page - 1) * limit],
  );
  const count = await db.query(
    `SELECT COUNT(*)::int AS total
       FROM orders
      WHERE customer_id = $1 AND ($2::text IS NULL OR status = $2)`,
    [customerId, status],
  );
  return ok({ items: rows.rows, page, limit, total: count.rows[0].total });
}
