import request from "supertest";
import { createApp } from "../src/app";
import { closeDb } from "./helpers/db";

const app = createApp();

afterAll(closeDb);

describe("GET /health", () => {
  it("returnerar 200 utan inloggning", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("returnerar 200 med inloggning", async () => {
    const res = await request(app).get("/health").set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
  });
});
