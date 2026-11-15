// Tester för statusline.js. Körs med: node --test .claude/statusline.test.js
// Karakteriseringstester: de beskriver befintligt beteende och ska inte ändra det.
// Använder bara Node:s inbyggda testverktyg, inga externa paket.
// Varje test får en egen katalog i os.tmpdir(). Den riktiga ~/.claude/statusline.js
// och projektets .claude/metrics/live/ används inte, utom i det sista testet som bara
// läser och kör den befintliga statusraden.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const STATUSLINE = path.join(__dirname, "statusline.js");
const REAL_USER_STATUSLINE = path.join(os.homedir(), ".claude", "statusline.js");
const SECRET_TEXT = "HEMLIG_KONVERSATIONSTEXT_123";

// live ligger två nivåer under root, så att "../../evil" hamnar i root och kan kontrolleras där.
const roots = [];
function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sl-test-"));
  roots.push(root);
  return { root, live: path.join(root, "metrics", "live"), user: path.join(root, "user-statusline.js") };
}
process.on("exit", () => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

// En påhittad användarstatusrad. Den skriver ut session_id från stdin, så att testerna
// kan se att den får samma indata som projektets statusrad.
function writeUserStatusline(dirs, body) {
  fs.writeFileSync(
    dirs.user,
    body ??
      `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{` +
        `let id="?";try{id=JSON.parse(s).session_id}catch{};process.stdout.write("ANVÄNDARRAD "+id)});`,
  );
}

function run(dirs, input, userPath = dirs.user) {
  return spawnSync(process.execPath, [STATUSLINE], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_METRICS_LIVE_DIR: dirs.live, CLAUDE_USER_STATUSLINE: userPath },
    timeout: 10000,
  });
}

function snapshot(dirs, id) {
  return JSON.parse(fs.readFileSync(path.join(dirs.live, `${id}.json`), "utf8"));
}

const SID = "11111111-aaaa-bbbb-cccc-000000000001";
const SID2 = "22222222-aaaa-bbbb-cccc-000000000002";

function status(over = {}) {
  return {
    session_id: SID,
    session_name: "Test-moment",
    transcript_path: "C:\\Users\\Someone\\.claude\\projects\\proj\\x.jsonl",
    version: "2.1.325",
    model: { id: "claude-opus-5-5", display_name: "Opus" },
    cost: {
      total_cost_usd: 1.234,
      total_duration_ms: 1800000,
      total_api_duration_ms: 300000,
      total_lines_added: 40,
      total_lines_removed: 4,
    },
    context_window: { context_window_size: 1000000, used_percentage: 12.4 },
    rate_limits: {
      five_hour: { used_percentage: 10, resets_at: 1000 },
      seven_day: { used_percentage: 1, resets_at: 2000 },
    },
    ...over,
  };
}

// --- Befintlig statusrad ---

test("Rad 1 är användarens statusrad, oförändrad, och den får samma indata", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  const r = run(dirs, status());
  assert.equal(r.status, 0);
  const lines = r.stdout.split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], `ANVÄNDARRAD ${SID}`);
});

test("Användarens statusrad saknas: rad 1 blir reservtexten och rad 2 fungerar", () => {
  const dirs = sandbox();
  const r = run(dirs, status(), path.join(dirs.root, "saknas.js"));
  assert.equal(r.status, 0);
  const lines = r.stdout.split("\n");
  assert.equal(lines[0], "Context: n/a");
  assert.match(lines[1], /^Kontext 12%/);
});

test("Användarens statusrad kraschar utan utskrift: reservtexten visas", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs, `throw new Error("trasig");`);
  const r = run(dirs, status());
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split("\n")[0], "Context: n/a");
});

test("Användarens statusrad hänger: avbryts efter 2 s och reservtexten visas", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs, `setTimeout(() => process.stdout.write("för sent"), 5000);`);
  const t0 = Date.now();
  const r = run(dirs, status());
  const ms = Date.now() - t0;
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split("\n")[0], "Context: n/a");
  assert.ok(ms < 4500, `tog ${ms} ms`);
});

test("Användarens statusrad med blanktecken runt texten: texten trimmas", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs, `process.stdout.write("  Context: 5k / 1000k \\n");`);
  const r = run(dirs, status());
  assert.equal(r.stdout.split("\n")[0], "Context: 5k / 1000k");
});

// --- Mätraden ---

test("Rad 2 visar kontext, uppskattad kostnad, tid och gränser med avrundning", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  const r = run(dirs, status());
  assert.equal(
    r.stdout.split("\n")[1],
    "Kontext 12% · ~$1.23 (uppsk.) · Tid 30 min (API 5 min) · 5h 10% · 7d 1%",
  );
});

test("Rad 2 utan API-tid och utan gränser visar bara det som finns", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  const r = run(dirs, status({ cost: { total_duration_ms: 90000 }, rate_limits: undefined, context_window: {} }));
  assert.equal(r.stdout.split("\n")[1], "Tid 2 min");
});

test("Rad 2 utan mätvärden blir 'Mätvärden: n/a'", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  const r = run(dirs, { session_id: SID });
  assert.equal(r.stdout.split("\n")[1], "Mätvärden: n/a");
});

// --- Felhantering ---

test("Trasig eller tom indata: bara rad 1, exit 0 och ingen ögonblicksbild", () => {
  for (const input of ["{inte json", ""]) {
    const dirs = sandbox();
    const r = run(dirs, input, path.join(dirs.root, "saknas.js"));
    assert.equal(r.status, 0, JSON.stringify(input));
    assert.equal(r.stdout, "Context: n/a");
    assert.ok(!fs.existsSync(dirs.live), "ingen katalog ska skapas");
  }
});

test("Ogiltigt session_id: ingen fil skrivs, men statusraden visas", () => {
  for (const id of ["../../evil", "a/b", "", 42]) {
    const dirs = sandbox();
    writeUserStatusline(dirs);
    const r = run(dirs, status({ session_id: id }));
    assert.equal(r.status, 0);
    assert.equal(r.stdout.split("\n").length, 2);
    assert.ok(!fs.existsSync(dirs.live) || fs.readdirSync(dirs.live).length === 0, String(id));
    assert.ok(!fs.existsSync(path.join(dirs.root, "evil.json")), "ingen fil utanför katalogen");
  }
});

test("Sökvägsangrepp i session_id: ingen fil skrivs utanför katalogen", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  run(dirs, status({ session_id: "../../evil" }));
  assert.equal(path.resolve(dirs.live, "../../evil.json"), path.join(dirs.root, "evil.json"));
  assert.ok(!fs.existsSync(path.join(dirs.root, "evil.json")));
});

test("Ögonblicksbilden kan inte skrivas: statusraden visas ändå och exit 0", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  fs.mkdirSync(path.dirname(dirs.live), { recursive: true });
  fs.writeFileSync(dirs.live, "en fil, inte en katalog");
  const r = run(dirs, status());
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split("\n").length, 2);
});

test("Trasig tidigare ögonblicksbild: ersätts med en ny", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  fs.mkdirSync(dirs.live, { recursive: true });
  fs.writeFileSync(path.join(dirs.live, `${SID}.json`), "{trasig");
  run(dirs, status());
  assert.equal(snapshot(dirs, SID).cost.total_cost_usd_estimate, 1.234);
});

// --- Ögonblicksbilden ---

test("Ögonblicksbilden innehåller rätt fält och värden", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  run(dirs, status());
  const s = snapshot(dirs, SID);
  assert.equal(s.schema, 1);
  assert.equal(s.session_id, SID);
  assert.equal(s.session_name, "Test-moment");
  assert.equal(s.model, "claude-opus-5-5");
  assert.equal(s.claude_code_version, "2.1.325");
  assert.equal(s.first_seen, s.last_seen);
  assert.deepEqual(s.cost, {
    total_cost_usd_estimate: 1.234,
    total_duration_ms: 1800000,
    total_api_duration_ms: 300000,
    lines_added: 40,
    lines_removed: 4,
  });
  assert.deepEqual(s.context, { window_size: 1000000, used_pct: 12.4, max_used_pct: 12.4 });
  assert.deepEqual(s.rate_limits.five_hour, {
    first_pct: 10,
    last_pct: 10,
    resets_at: 1000,
    earlier_windows_pct: 0,
    consumed_pct: 0,
    window_changed: false,
  });
});

test("Två uppdateringar: en fil, senaste värden, första tidpunkten och högsta kontext behålls", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  run(dirs, status({ context_window: { context_window_size: 1000000, used_percentage: 20 } }));
  const first = snapshot(dirs, SID);
  run(
    dirs,
    status({
      cost: { total_cost_usd: 2.5, total_duration_ms: 3600000 },
      context_window: { context_window_size: 1000000, used_percentage: 8 },
      rate_limits: { five_hour: { used_percentage: 14, resets_at: 1000 }, seven_day: { used_percentage: 2, resets_at: 2000 } },
    }),
  );
  assert.deepEqual(fs.readdirSync(dirs.live), [`${SID}.json`], "en fil och inga .tmp-filer");
  const s = snapshot(dirs, SID);
  assert.equal(s.first_seen, first.first_seen);
  assert.ok(s.last_seen >= first.last_seen);
  assert.equal(s.cost.total_cost_usd_estimate, 2.5);
  assert.equal(s.cost.total_duration_ms, 3600000);
  assert.equal(s.context.used_pct, 8);
  assert.equal(s.context.max_used_pct, 20);
  assert.equal(s.rate_limits.five_hour.first_pct, 10);
  assert.equal(s.rate_limits.five_hour.last_pct, 14);
  assert.equal(s.rate_limits.five_hour.consumed_pct, 4);
  assert.equal(s.rate_limits.seven_day.consumed_pct, 1);
});

test("Fält som saknas i en uppdatering: tidigare värden behålls", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  run(dirs, status());
  run(dirs, { session_id: SID });
  const s = snapshot(dirs, SID);
  assert.equal(s.session_name, "Test-moment");
  assert.equal(s.model, "claude-opus-5-5");
  assert.equal(s.cost.total_cost_usd_estimate, 1.234);
  assert.equal(s.cost.lines_added, 40);
  assert.equal(s.context.max_used_pct, 12.4);
  assert.equal(s.rate_limits.five_hour.last_pct, 10);
});

test("Ny session (som efter /clear): ny fil och den gamla är orörd", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  run(dirs, status());
  const before = fs.readFileSync(path.join(dirs.live, `${SID}.json`), "utf8");
  run(dirs, status({ session_id: SID2 }));
  assert.deepEqual(fs.readdirSync(dirs.live).sort(), [`${SID}.json`, `${SID2}.json`]);
  assert.equal(fs.readFileSync(path.join(dirs.live, `${SID}.json`), "utf8"), before);
});

test("Gränser saknas före första API-svaret och kommer senare: mätningen börjar då", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  run(dirs, status({ rate_limits: undefined }));
  assert.equal(snapshot(dirs, SID).rate_limits.five_hour, null);
  run(dirs, status({ rate_limits: { five_hour: { used_percentage: 30, resets_at: 1000 } } }));
  const five = snapshot(dirs, SID).rate_limits.five_hour;
  assert.equal(five.first_pct, 30);
  assert.equal(five.consumed_pct, 0);
});

test("5-timmarsfönstret återställs: förbrukningen summeras över fönstren", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  const five = (pct, reset) => ({ rate_limits: { five_hour: { used_percentage: pct, resets_at: reset } } });
  run(dirs, status(five(80, 1000)));
  run(dirs, status(five(95, 1000)));
  run(dirs, status(five(3, 9000)));
  run(dirs, status(five(7, 9000)));
  const s = snapshot(dirs, SID).rate_limits.five_hour;
  assert.equal(s.earlier_windows_pct, 15);
  assert.equal(s.first_pct, 3);
  assert.equal(s.last_pct, 7);
  assert.equal(s.consumed_pct, 19);
  assert.equal(s.window_changed, true);
});

test("Integritet: bara utvalda fält sparas, ingen cwd eller annan indata", () => {
  const dirs = sandbox();
  writeUserStatusline(dirs);
  run(
    dirs,
    status({
      cwd: "C:\\Users\\Someone\\proj",
      workspace: { current_dir: "C:\\Users\\Someone\\proj" },
      message: SECRET_TEXT,
    }),
  );
  const text = fs.readFileSync(path.join(dirs.live, `${SID}.json`), "utf8");
  assert.ok(!text.includes(SECRET_TEXT));
  assert.ok(!text.includes("current_dir"));
  assert.ok(!/"cwd"/.test(text));
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), [
    "claude_code_version",
    "context",
    "cost",
    "first_seen",
    "last_seen",
    "model",
    "rate_limits",
    "schema",
    "session_id",
    "session_name",
    "transcript_path",
  ]);
});

// --- Den befintliga statusraden på riktigt ---

test(
  "Den befintliga ~/.claude/statusline.js ger samma rad 1 direkt som via projektets statusrad",
  { skip: !fs.existsSync(REAL_USER_STATUSLINE) && "~/.claude/statusline.js finns inte" },
  () => {
    const dirs = sandbox();
    const input = JSON.stringify(
      status({ context_window: { context_window_size: 1000000, used_percentage: 12, current_usage: { input_tokens: 5, cache_read_input_tokens: 120000 } } }),
    );
    const direct = spawnSync(process.execPath, [REAL_USER_STATUSLINE], { input, encoding: "utf8", timeout: 5000 });
    const via = run(dirs, input, REAL_USER_STATUSLINE);
    assert.equal(via.stdout.split("\n")[0], direct.stdout.trim());
    assert.equal(direct.stdout.trim(), "Context: 120k / 1000k");
  },
);
