// Tester för record-metrics.js. Körs med: node --test .claude/hooks/
// Använder bara Node:s inbyggda testverktyg, inga externa paket.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOK = path.join(__dirname, "record-metrics.js");
const SECRET_TEXT = "HEMLIG_KONVERSATIONSTEXT_123";

// Testkatalogerna tas bort när testerna är klara.
const roots = [];
process.on("exit", () => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-test-"));
  roots.push(root);
  const dirs = {
    root,
    live: path.join(root, "live"),
    projects: path.join(root, "projects", "C--Users-Someone-proj"),
    csv: path.join(root, "out", "arbetsmoment.csv"),
  };
  fs.mkdirSync(dirs.live, { recursive: true });
  fs.mkdirSync(dirs.projects, { recursive: true });
  return dirs;
}

function run(dirs, mode, input) {
  const r = spawnSync(process.execPath, [HOOK, mode], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_METRICS_LIVE_DIR: dirs.live,
      CLAUDE_METRICS_CSV: dirs.csv,
    },
    timeout: 10000,
  });
  return r;
}

function assistant(id, usage, ts, extra = {}) {
  return {
    type: "assistant",
    timestamp: ts,
    cwd: "C:\\Users\\Someone\\proj",
    message: { id, role: "assistant", model: "claude-opus-5-5", usage, content: [{ type: "text", text: SECRET_TEXT }] },
    ...extra,
  };
}

const U1 = { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500 };
const U2 = { input_tokens: 5, output_tokens: 50, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 };

function writeTranscript(dirs, id, entries, sub) {
  const base = sub ? path.join(dirs.projects, sub.parent, "subagents") : dirs.projects;
  fs.mkdirSync(base, { recursive: true });
  const file = path.join(base, sub ? `${id}.jsonl` : `${id}.jsonl`);
  const lines = [
    { type: "user", timestamp: entries[0].timestamp, message: { role: "user", content: SECRET_TEXT } },
    ...entries,
  ];
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

function writeSnapshot(dirs, id, transcriptPath, over = {}) {
  const snap = {
    schema: 1,
    session_id: id,
    session_name: "Test-moment",
    transcript_path: transcriptPath,
    model: "claude-opus-5-5",
    claude_code_version: "2.1.325",
    first_seen: "2026-11-15T10:00:30.000Z",
    last_seen: "2026-11-15T10:30:00.000Z",
    cost: {
      total_cost_usd_estimate: 1.23456,
      total_duration_ms: 1800000,
      total_api_duration_ms: 300000,
      lines_added: 40,
      lines_removed: 4,
    },
    context: { window_size: 1000000, used_pct: 12, max_used_pct: 20 },
    rate_limits: {
      five_hour: { first_pct: 10, last_pct: 15, resets_at: 1, earlier_windows_pct: 0, consumed_pct: 5, window_changed: false },
      seven_day: { first_pct: 1, last_pct: 2, resets_at: 2, earlier_windows_pct: 0, consumed_pct: 1, window_changed: false },
    },
    ...over,
  };
  fs.writeFileSync(path.join(dirs.live, `${id}.json`), JSON.stringify(snap));
}

// Enkel CSV-läsare för testerna (hanterar citattecken och radbrytningar i fält).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n") {
      row.push(f.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const SID = "11111111-aaaa-bbbb-cccc-000000000001";
const SID2 = "22222222-aaaa-bbbb-cccc-000000000002";

function standardSession(dirs, id = SID) {
  // Samma API-svar (msg_1) förekommer på tre rader, som i riktiga transkript.
  const t = writeTranscript(dirs, id, [
    assistant("msg_1", U1, "2026-11-15T10:00:00.000Z"),
    assistant("msg_1", U1, "2026-11-15T10:00:01.000Z"),
    assistant("msg_1", U1, "2026-11-15T10:00:02.000Z"),
    assistant("msg_2", U2, "2026-11-15T10:20:00.000Z"),
  ]);
  writeSnapshot(dirs, id, t);
  return t;
}

test("SessionEnd: en rad, tokens per unikt API-svar räknas en gång", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  const r = run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear", hook_event_name: "SessionEnd" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  const rows = parseCsv(fs.readFileSync(dirs.csv, "utf8"));
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.session_id, SID);
  assert.equal(row.arbetsmoment, "Test-moment");
  assert.equal(row.avslut, "clear");
  assert.equal(row.api_anrop, "2");
  assert.equal(row.input_tokens, "15");
  assert.equal(row.output_tokens, "150");
  assert.equal(row.cache_read_tokens, "3000");
  assert.equal(row.cache_write_tokens, "500");
  assert.equal(row.tid_vagg_min, "30.0");
  assert.equal(row.tid_api_min, "5.0");
  assert.equal(row.max_kontext_pct, "20");
  assert.equal(row.kostnad_usd_uppskattad, "1.2346");
  assert.equal(row.femtimmar_fore_pct, "10");
  assert.equal(row.femtimmar_efter_pct, "15");
  assert.equal(row.femtimmar_forbrukat_pct, "5");
  assert.equal(row.vecka_forbrukat_pct, "1");
  assert.equal(row.rader_tillagda, "40");
  assert.equal(row.rader_borttagna, "4");
  assert.match(row.start, /^2026-11-15 \d\d:\d\d$/);
  assert.match(row.datum, /^2026-11-1[45]$/);
});

test("Körs två gånger: fortfarande en rad med samma värden (ingen dubbelräkning)", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  const input = { session_id: SID, transcript_path: t, reason: "clear" };
  run(dirs, "end", input);
  const first = fs.readFileSync(dirs.csv, "utf8");
  run(dirs, "end", input);
  run(dirs, "start", { session_id: SID2, transcript_path: path.join(dirs.projects, `${SID2}.jsonl`), source: "clear" });
  assert.equal(fs.readFileSync(dirs.csv, "utf8"), first);
});

test("Återupptagen session: raden uppdateras i stället för att en ny läggs till", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "prompt_input_exit" });
  fs.appendFileSync(t, JSON.stringify(assistant("msg_3", U2, "2026-11-15T11:00:00.000Z")) + "\n");
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear" });
  const rows = parseCsv(fs.readFileSync(dirs.csv, "utf8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].api_anrop, "3");
  assert.equal(rows[0].output_tokens, "200");
  assert.equal(rows[0].avslut, "clear");
});

test("SessionStart efter /clear: avslut från SessionEnd behålls när transkriptet har vuxit", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear", hook_event_name: "SessionEnd" });
  // Claude Code kan skriva fler rader till transkriptet efter att SessionEnd-hooken har körts.
  fs.appendFileSync(t, JSON.stringify(assistant("msg_3", U2, "2026-11-15T11:00:00.000Z")) + "\n");
  fs.appendFileSync(t, JSON.stringify({ type: "cost-state", totalCostUSD: 1.5 }) + "\n");
  run(dirs, "start", { session_id: SID2, transcript_path: path.join(dirs.projects, `${SID2}.jsonl`), source: "clear" });
  const rows = parseCsv(fs.readFileSync(dirs.csv, "utf8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].avslut, "clear");
  assert.equal(rows[0].api_anrop, "3", "mätvärdena ska ändå uppdateras");
  assert.equal(rows[0].output_tokens, "200");
});

test("Flera sessioner ger en rad var", () => {
  const dirs = sandbox();
  const t1 = standardSession(dirs, SID);
  const t2 = standardSession(dirs, SID2);
  run(dirs, "end", { session_id: SID, transcript_path: t1, reason: "clear" });
  run(dirs, "end", { session_id: SID2, transcript_path: t2, reason: "logout" });
  const rows = parseCsv(fs.readFileSync(dirs.csv, "utf8"));
  assert.deepEqual(
    rows.map((r) => r.session_id),
    [SID, SID2],
  );
});

test("SessionStart som reserv: kvarlämnad session registreras, aktuell session hoppas över", () => {
  const dirs = sandbox();
  standardSession(dirs, SID); // SessionEnd kördes aldrig för den här
  const t2 = standardSession(dirs, SID2); // den nya, pågående sessionen
  const r = run(dirs, "start", { session_id: SID2, transcript_path: t2, source: "startup" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "", "SessionStart får inte skriva till stdout (hamnar i kontexten)");
  const rows = parseCsv(fs.readFileSync(dirs.csv, "utf8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session_id, SID);
  assert.equal(rows[0].avslut, "efterhand");
});

test("Subagenternas transkript räknas, och samma svar räknas bara en gång", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  writeTranscript(
    dirs,
    "agent-abc",
    [
      assistant("msg_sub", U2, "2026-11-15T10:05:00.000Z", { isSidechain: true }),
      assistant("msg_2", U2, "2026-11-15T10:20:00.000Z"), // finns redan i huvudtranskriptet
    ],
    { parent: SID },
  );
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear" });
  const row = parseCsv(fs.readFileSync(dirs.csv, "utf8"))[0];
  assert.equal(row.api_anrop, "3");
  assert.equal(row.output_tokens, "200");
});

test("Integritet: inga sökvägar, ingen cwd och ingen konversationstext i CSV", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear", cwd: "C:\\Users\\Someone\\proj" });
  const csv = fs.readFileSync(dirs.csv, "utf8");
  assert.ok(!csv.includes(SECRET_TEXT));
  assert.ok(!csv.includes("Someone"));
  assert.ok(!csv.includes(dirs.root));
  assert.ok(!/[A-Za-z]:\\|\/Users\/|\.jsonl/.test(csv));
});

test("Sessionsnamn med komma, citattecken, radbrytning och formel escapas", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  writeSnapshot(dirs, SID, t, { session_name: '=HYPERLINK("x"),\nrad två' });
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear" });
  const text = fs.readFileSync(dirs.csv, "utf8");
  const rows = parseCsv(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].arbetsmoment, `'=HYPERLINK("x"), rad två`);
  assert.equal(text.trim().split("\n").length, 2, "radbrytningen i namnet ska tas bort");
});

test("Ögonblicksbild saknas: tokens från transkriptet, övriga fält tomma", () => {
  const dirs = sandbox();
  const t = writeTranscript(dirs, SID, [assistant("msg_1", U1, "2026-11-15T10:00:00.000Z")]);
  const r = run(dirs, "end", { session_id: SID, transcript_path: t, reason: "other" });
  assert.equal(r.status, 0);
  const row = parseCsv(fs.readFileSync(dirs.csv, "utf8"))[0];
  assert.equal(row.output_tokens, "100");
  assert.equal(row.kostnad_usd_uppskattad, "");
  assert.equal(row.arbetsmoment, "");
});

test("Felfall: trasig indata, ogiltigt session_id och saknat transkript ger exit 0 utan utskrift", () => {
  const dirs = sandbox();
  for (const [mode, input] of [
    ["end", "{inte json"],
    ["end", ""],
    ["end", { session_id: "../../evil", transcript_path: "x.jsonl", reason: "clear" }],
    ["end", { session_id: SID, transcript_path: path.join(dirs.projects, "saknas.jsonl"), reason: "clear" }],
    ["start", "{inte json"],
    ["okänt", { session_id: SID }],
  ]) {
    const r = run(dirs, mode, input);
    assert.equal(r.status, 0, `${mode} ${JSON.stringify(input)}`);
    assert.equal(r.stdout, "");
  }
  assert.ok(!fs.existsSync(path.join(dirs.root, "evil.json")));
  assert.ok(!fs.existsSync(dirs.csv), "ingen rad ska skrivas utan data");
});

// Statusraden kan börja mäta en bit in i sessionen (till exempel om den slås på mitt i en
// session). Då är första gränsvärdet inte sessionens startvärde, och förbrukningen blir för låg.
test("Mätningen började sent: osäkra gränsvärden lämnas tomma i stället för 0", () => {
  const dirs = sandbox();
  const t = standardSession(dirs); // transkriptet börjar 10:00:00
  writeSnapshot(dirs, SID, t, {
    first_seen: "2026-11-15T13:30:00.000Z", // 3,5 timmar senare
    rate_limits: {
      five_hour: { first_pct: 11, last_pct: 11, resets_at: 1, earlier_windows_pct: 0, consumed_pct: 0, window_changed: false },
      seven_day: { first_pct: 1, last_pct: 1, resets_at: 2, earlier_windows_pct: 0, consumed_pct: 0, window_changed: false },
    },
  });
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear" });
  const row = parseCsv(fs.readFileSync(dirs.csv, "utf8"))[0];
  assert.equal(row.femtimmar_fore_pct, "", "startvärdet är okänt");
  assert.equal(row.femtimmar_forbrukat_pct, "", "förbrukningen är okänd");
  assert.equal(row.vecka_forbrukat_pct, "", "veckoförbrukningen är okänd");
  assert.equal(row.femtimmar_efter_pct, "11", "slutvärdet är fortfarande uppmätt");
  assert.equal(row.kostnad_usd_uppskattad, "1.2346", "totaler från Claude Code påverkas inte");
  assert.equal(row.output_tokens, "150", "tokens från transkriptet påverkas inte");
});

test("Mätningen började strax före gränsen (2 min): gränsvärdena behålls", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  writeSnapshot(dirs, SID, t, { first_seen: "2026-11-15T10:01:59.000Z" });
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear" });
  const row = parseCsv(fs.readFileSync(dirs.csv, "utf8"))[0];
  assert.equal(row.femtimmar_fore_pct, "10");
  assert.equal(row.femtimmar_forbrukat_pct, "5");
  assert.equal(row.vecka_forbrukat_pct, "1");
});

test("Mätningen började strax efter gränsen (2 min): gränsvärdena lämnas tomma", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  writeSnapshot(dirs, SID, t, { first_seen: "2026-11-15T10:02:01.000Z" });
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear" });
  const row = parseCsv(fs.readFileSync(dirs.csv, "utf8"))[0];
  assert.equal(row.femtimmar_fore_pct, "");
  assert.equal(row.femtimmar_forbrukat_pct, "");
  assert.equal(row.vecka_forbrukat_pct, "");
  assert.equal(row.femtimmar_efter_pct, "15");
});

test("Gränsvärden saknas i ögonblicksbilden: fälten blir tomma, inte 0", () => {
  const dirs = sandbox();
  const t = standardSession(dirs);
  writeSnapshot(dirs, SID, t, { rate_limits: { five_hour: null, seven_day: null } });
  run(dirs, "end", { session_id: SID, transcript_path: t, reason: "clear" });
  const row = parseCsv(fs.readFileSync(dirs.csv, "utf8"))[0];
  for (const k of ["femtimmar_fore_pct", "femtimmar_efter_pct", "femtimmar_forbrukat_pct", "vecka_forbrukat_pct"]) {
    assert.equal(row[k], "", k);
  }
});

test("Transkript utanför .jsonl används inte", () => {
  const dirs = sandbox();
  const other = path.join(dirs.root, "hemlig.txt");
  fs.writeFileSync(other, JSON.stringify(assistant("msg_x", U1, "2026-11-15T10:00:00.000Z")));
  writeSnapshot(dirs, SID, other);
  run(dirs, "end", { session_id: SID, transcript_path: other, reason: "clear" });
  const row = parseCsv(fs.readFileSync(dirs.csv, "utf8"))[0];
  assert.equal(row.api_anrop, "");
  assert.equal(row.output_tokens, "");
});
