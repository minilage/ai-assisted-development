// Tester för session-memory.js. Körs med: node --test .claude/hooks/session-memory.test.js
// Använder bara Node:s inbyggda testverktyg, inga externa paket.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOK = path.join(__dirname, "session-memory.js");
const SETTINGS = path.join(__dirname, "..", "settings.json");
const {
  extractSection,
  latestSession,
  truncate,
  buildSummary,
  buildPrecompact,
  MAX_CHARS,
} = require("./session-memory.js");

const PLAN = [
  "# Projektplan",
  "",
  "## Aktuell status",
  "",
  "**Senast uppdaterad:** 15 november 2026",
  "",
  "### Klart",
  "",
  "- Sak A är klar.",
  "",
  "### Kända problem",
  "",
  "- Problem B finns kvar.",
  "",
  "### Nästa arbetsmoment",
  "",
  "1. Gör steg C.",
  "",
  "## Annat avsnitt",
  "",
  "Ska inte vara med.",
  "",
].join("\n");

const roots = [];
process.on("exit", () => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function project({
  plan = PLAN,
  sessions = ["session-01-a.md", "session-02-b.md"],
  git = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sm-test-"));
  roots.push(root);
  if (plan !== null) fs.writeFileSync(path.join(root, "PLAN.md"), plan);
  if (sessions !== null) {
    fs.mkdirSync(path.join(root, "sessions"));
    for (const s of sessions) fs.writeFileSync(path.join(root, "sessions", s), "x");
  }
  if (git) {
    spawnSync("git", ["init", "-q"], { cwd: root });
    fs.writeFileSync(path.join(root, "ny-fil.txt"), "x");
  }
  return root;
}

function run(root, mode, input, env = {}) {
  return spawnSync(process.execPath, [HOOK, mode], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    timeout: 15000,
  });
}

// --- rena funktioner ---

test("extractSection tar avsnittet till nästa rubrik på samma nivå", () => {
  const s = extractSection(PLAN, "## Aktuell status");
  assert.match(s, /Sak A är klar/);
  assert.match(s, /Gör steg C/);
  assert.doesNotMatch(s, /Ska inte vara med/);
  assert.equal(extractSection(PLAN, "### Nästa arbetsmoment").trim(), "1. Gör steg C.");
});

test("extractSection hanterar CRLF och saknade avsnitt", () => {
  assert.match(extractSection(PLAN.replace(/\n/g, "\r\n"), "### Klart"), /Sak A/);
  assert.equal(extractSection(PLAN, "## Finns inte"), null);
});

test("latestSession väljer högst nummer, inte ändringstid eller bokstavsordning", () => {
  assert.equal(
    latestSession([
      "session-01-forberedelser.md",
      "session-09-2026-11-15.md",
      "session-10-2026-11-16.md",
      "README.md",
    ]),
    "session-10-2026-11-16.md",
  );
  // I bokstavsordning är "session-9" större än "session-10".
  assert.equal(latestSession(["session-10-b.md", "session-9-a.md"]), "session-10-b.md");
  assert.equal(latestSession(["README.md"]), null);
  assert.equal(latestSession([]), null);
});

test("truncate kortar av till högst gränsen och markerar förkortningen", () => {
  const t = truncate("a".repeat(500), 100);
  assert.ok(t.length <= 100, `längd ${t.length}`);
  assert.match(t, /förkortad/);
  assert.equal(truncate("kort", 100), "kort");
});

test("buildSummary innehåller källrad, status, nästa arbetsmoment, sessionslogg och git status", () => {
  const s = buildSummary({
    plan: PLAN,
    session: "session-02-b.md",
    gitStatus: " M PLAN.md",
    source: "clear",
  });
  assert.match(
    s,
    /Sessionsminne från \.claude\/hooks\/session-memory\.js \(SessionStart, källa: clear\)/,
  );
  assert.match(s, /Senast uppdaterad:\*\* 15 november 2026/);
  assert.match(s, /Sak A är klar/);
  assert.match(s, /Problem B finns kvar/);
  assert.match(s, /1\. Gör steg C\./);
  assert.match(s, /sessions\/session-02-b\.md/);
  assert.match(s, / M PLAN\.md/);
  assert.doesNotMatch(s, /Ska inte vara med/);
  // Nästa arbetsmoment ska bara finnas en gång.
  assert.equal(s.split("Gör steg C").length - 1, 1);
});

test("buildSummary håller sig under 3 000 tecken och behåller hela nästa arbetsmoment", () => {
  assert.equal(MAX_CHARS, 3000);
  const lang = PLAN.replace("- Sak A är klar.", "- Lång rad.\n".repeat(600)).replace(
    "- Problem B finns kvar.",
    "- Problem.\n".repeat(600),
  );
  const s = buildSummary({
    plan: lang,
    session: "session-02-b.md",
    gitStatus: "",
    source: "startup",
  });
  assert.ok(s.length <= 3000, `längd ${s.length}`);
  assert.match(s, /1\. Gör steg C\./);
  assert.match(s, /förkortad/);
  assert.match(s, /PLAN\.md/);
  assert.match(s, /### Kända problem/, "båda underavsnitten ska få plats med rubrik");
  // Korta delar (Senast uppdaterad) får inte låsa utrymme som de långa delarna behöver.
  assert.ok(s.length >= 2900, `utrymmet används inte: längd ${s.length}`);
});

test("buildSummary håller gränsen även när nästa arbetsmoment ensamt är för långt", () => {
  const lang = PLAN.replace("1. Gör steg C.", "1. Steg.\n".repeat(800));
  const s = buildSummary({ plan: lang, session: "s", gitStatus: "", source: "clear" });
  assert.ok(s.length <= 3000, `längd ${s.length}`);
  assert.match(s, /förkortad/);
});

test("buildSummary klarar saknad plan, avsnitt, sessionslogg och git", () => {
  const s = buildSummary({ plan: null, session: null, gitStatus: null, source: "okänd" });
  assert.match(s, /PLAN\.md saknas/);
  assert.match(s, /Ingen sessionslogg hittades/);
  assert.match(s, /git status kunde inte köras/);
  const utan = buildSummary({
    plan: "# Bara rubrik\n",
    session: "s",
    gitStatus: "",
    source: "clear",
  });
  assert.match(utan, /Avsnittet "## Aktuell status" saknas/);
  const utanNasta = buildSummary({
    plan: PLAN.replace(/### Nästa arbetsmoment[\s\S]*?(?=## Annat)/, ""),
    session: "s",
    gitStatus: "",
    source: "clear",
  });
  assert.match(utanNasta, /Avsnittet "### Nästa arbetsmoment" saknas/);
  assert.match(utanNasta, /Sak A/);
});

test("buildSummary skriver att arbetsträdet är rent när git status är tom", () => {
  const s = buildSummary({ plan: PLAN, session: "s", gitStatus: "", source: "clear" });
  assert.match(s, /inga ändringar/);
});

test("buildPrecompact ber om att bevara uppgift, beslut, problem och nästa steg", () => {
  const p = buildPrecompact("manual");
  for (const ord of ["uppgift", "beslut", "problem", "nästa", "sessions/", "PLAN.md"]) {
    assert.match(p, new RegExp(ord, "i"));
  }
});

// --- körning som hook ---

for (const source of ["startup", "clear", "resume", "compact"]) {
  test(`start med källa ${source}: exit 0 och sammanfattning på stdout`, () => {
    const root = project({ git: true });
    const r = run(root, "start", { hook_event_name: "SessionStart", source });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`källa: ${source}\\)`));
    assert.match(r.stdout, /Gör steg C/);
    assert.match(r.stdout, /session-02-b\.md/);
    assert.match(r.stdout, /ny-fil\.txt/);
    assert.ok(r.stdout.length <= 3000);
  });
}

test("start utan PLAN.md: exit 0, meddelande och ingen stackspårning", () => {
  const r = run(project({ plan: null }), "start", { source: "clear" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /PLAN\.md saknas/);
  assert.match(r.stdout, /session-02-b\.md/);
  assert.doesNotMatch(r.stdout + r.stderr, /Error:|at .*\.js:\d+/);
});

test("start utan sessions/ och med tom sessions/", () => {
  for (const sessions of [null, []]) {
    const r = run(project({ sessions }), "start", { source: "clear" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Ingen sessionslogg hittades/);
  }
});

test("start utanför ett Git-arkiv: exit 0 och meddelande", () => {
  const root = project({ git: false });
  // GIT_CEILING_DIRECTORIES hindrar git från att hitta ett arkiv i en överordnad katalog.
  const r = run(
    root,
    "start",
    { source: "clear" },
    { GIT_CEILING_DIRECTORIES: path.dirname(root) },
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /git status kunde inte köras/);
  assert.doesNotMatch(r.stdout, /inga ändringar/);
});

test("start med ogiltig indata ger källan okänd", () => {
  for (const input of ["inte json", "{}", ""]) {
    const r = run(project(), "start", input);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /källa: okänd\)/);
  }
});

test("precompact: exit 0, instruktioner på stdout, blockerar aldrig", () => {
  for (const input of [{ hook_event_name: "PreCompact", trigger: "auto" }, "inte json"]) {
    const r = run(project(), "precompact", input);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /sessions\//);
  }
});

test("okänt läge: exit 0 och ingen utdata", () => {
  const r = run(project(), "annat", {});
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

// --- settings.json ---

test("settings.json: mätningens hooks är kvar och sessionsminnet är registrerat", () => {
  const s = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  const cmds = (ev) =>
    (s.hooks[ev] || []).flatMap((e) => e.hooks.map((h) => ({ ...h, matcher: e.matcher })));

  const start = cmds("SessionStart");
  assert.ok(
    start.some(
      (h) => h.command === 'node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/record-metrics.js" start',
    ),
  );
  assert.ok(
    cmds("SessionEnd").some(
      (h) => h.command === 'node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/record-metrics.js" end',
    ),
  );
  const mem = start.find(
    (h) => h.command.includes("session-memory.js") && h.command.endsWith(" start"),
  );
  assert.ok(mem, "session-memory.js start saknas under SessionStart");
  assert.equal(mem.matcher, "startup|resume|clear|compact");
  // Mätningens post får inte ha fått en matcher.
  assert.equal(start.find((h) => h.command.includes("record-metrics.js")).matcher, undefined);

  const pre = cmds("PreCompact");
  assert.ok(
    pre.some((h) => h.command.includes("session-memory.js") && h.command.endsWith(" precompact")),
  );
});
