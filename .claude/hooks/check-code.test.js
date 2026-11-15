// Tester för check-code.js. Körs med: node --test .claude/hooks/check-code.test.js
// Använder bara Node:s inbyggda testverktyg, inga externa paket.
// Enhetstesterna ersätter körningen av Prettier, ESLint, git och tsc med en fejk.
// Integrationstesterna längst ned kör de riktiga verktygen på filer i en tillfällig katalog.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOK = path.join(__dirname, "check-code.js");
const REPO = path.resolve(__dirname, "..", "..");
const SETTINGS = path.join(__dirname, "..", "settings.json");
const {
  buildCommands,
  buildStopCommands,
  runPost,
  runStop,
  MAX_LINES,
} = require("./check-code.js");

const roots = [];
process.on("exit", () => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-test-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src"));
  return root;
}

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

// Fejkad körning: svarar efter verktygets namn och sparar alla anrop.
function fakeRun(results = {}) {
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const all = [cmd, ...args].join(" ");
    for (const [key, value] of Object.entries(results)) {
      if (all.includes(key)) return { status: 0, stdout: "", stderr: "", ...value };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

function postInput(file, tool = "Edit") {
  return JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: tool,
    tool_input: { file_path: file },
  });
}

const md5 = (file) => crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");

// ---------- buildCommands ----------

test("buildCommands: .ts ger prettier --check och eslint via node, utan npx", () => {
  const file = path.join(REPO, "src", "app.ts");
  const cmds = buildCommands(file, { toolRoot: REPO });
  assert.deepEqual(
    cmds.map((c) => c.name),
    ["prettier", "eslint"],
  );
  for (const c of cmds) {
    assert.equal(c.cmd, process.execPath);
    assert.ok(c.args.includes(file), `${c.name} ska få filen`);
  }
  assert.ok(cmds[0].args[0].endsWith(path.join("prettier", "bin", "prettier.cjs")));
  assert.ok(cmds[0].args.includes("--check"));
  assert.ok(cmds[1].args[0].endsWith(path.join("eslint", "bin", "eslint.js")));
});

test("buildCommands: .js ger bara prettier (öppen fråga 2, alternativ a)", () => {
  const cmds = buildCommands(path.join(REPO, ".claude", "hooks", "x.js"), { toolRoot: REPO });
  assert.deepEqual(
    cmds.map((c) => c.name),
    ["prettier"],
  );
});

test("buildCommands: andra ändelser ger inga kommandon", () => {
  for (const name of ["a.md", "a.json", "a.tsx.bak", "Makefile", "a.TS.txt"]) {
    assert.deepEqual(buildCommands(path.join(REPO, name), { toolRoot: REPO }), [], name);
  }
});

test("buildCommands: innehåller aldrig --write, --fix eller --fix-dry-run (3.6)", () => {
  const forbidden = ["--write", "-w", "--fix", "--fix-dry-run", "--fix-type"];
  const names = ["a.ts", "--fix.ts", "--write.js", "b c.ts", "src/x.js"];
  for (const name of names) {
    for (const c of buildCommands(path.join(REPO, name), { toolRoot: REPO })) {
      for (const arg of c.args) {
        assert.ok(!forbidden.includes(arg), `${c.name} för ${name} har ${arg}`);
      }
    }
  }
});

test("buildStopCommands: git status --porcelain -- src tests och tsc --noEmit via node", () => {
  const { git, tsc } = buildStopCommands({ toolRoot: REPO });
  assert.equal(git.cmd, "git");
  assert.deepEqual(git.args, ["status", "--porcelain", "--", "src", "tests"]);
  assert.equal(tsc.cmd, process.execPath);
  assert.ok(tsc.args[0].endsWith(path.join("typescript", "bin", "tsc")));
  assert.ok(tsc.args.includes("--noEmit"));
});

// ---------- runPost ----------

test("post: Prettier underkänner en .ts-fil, exit 2 med filen och prettier --check (3.1, beslut A)", () => {
  const root = tempProject();
  const file = write(root, "src/a.ts", "const a = 1\n");
  const { run } = fakeRun({ "prettier.cjs": { status: 1, stderr: `[warn] ${file}\n` } });
  const r = runPost(postInput(file), { projectDir: root, toolRoot: REPO, run });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /src[\\/]a\.ts/);
  assert.match(r.stderr, /prettier --check/);
  assert.match(r.stderr, /redan före/i, "ska säga att filen kan ha varit oformaterad före");
  assert.match(r.stderr, /redovisa/i);
  assert.match(r.stderr, /godkännande/i);
});

test("post: ESLint-fel ger exit 2 med felen och rad (3.2)", () => {
  const root = tempProject();
  const file = write(root, "src/a.ts", "x\n");
  const out = `${file}\n  1:10  error  Unexpected any  @typescript-eslint/no-explicit-any\n`;
  const { run } = fakeRun({ "eslint.js": { status: 1, stdout: out } });
  const r = runPost(postInput(file, "Write"), { projectDir: root, toolRoot: REPO, run });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /eslint/i);
  assert.match(r.stderr, /1:10\s+error\s+Unexpected any/);
});

test("post: båda godkänner, exit 0 utan utdata (3.3)", () => {
  const root = tempProject();
  for (const name of ["src/a.ts", "src/b.js"]) {
    const file = write(root, name, "x\n");
    const { run, calls } = fakeRun();
    const r = runPost(postInput(file), { projectDir: root, toolRoot: REPO, run });
    assert.deepEqual(r, { code: 0, stderr: "" }, name);
    assert.ok(calls.length >= 1, `${name} ska ha kontrollerats`);
  }
});

test("post: verktygen körs med projektkatalogen som arbetskatalog", () => {
  const root = tempProject();
  const file = write(root, "src/a.ts", "x\n");
  const { run, calls } = fakeRun();
  runPost(postInput(file), { projectDir: root, toolRoot: REPO, run });
  assert.equal(calls.length, 2);
  for (const c of calls) assert.equal(c.opts.cwd, root);
});

test("post: andra ändelser kör ingenting (3.4)", () => {
  const root = tempProject();
  for (const name of ["a.md", "a.json"]) {
    const file = write(root, name, "x\n");
    const { run, calls } = fakeRun();
    const r = runPost(postInput(file), { projectDir: root, toolRoot: REPO, run });
    assert.deepEqual(r, { code: 0, stderr: "" }, name);
    assert.equal(calls.length, 0, name);
  }
});

test("post: fil utanför projektet eller som inte finns kör ingenting (3.5)", () => {
  const root = tempProject();
  const other = tempProject();
  const outside = write(other, "src/a.ts", "x\n");
  const missing = path.join(root, "src", "finns-inte.ts");
  const sneaky = path.join(root, "..", path.basename(other), "src", "a.ts");
  for (const file of [outside, missing, sneaky]) {
    const { run, calls } = fakeRun();
    const r = runPost(postInput(file), { projectDir: root, toolRoot: REPO, run });
    assert.deepEqual(r, { code: 0, stderr: "" }, file);
    assert.equal(calls.length, 0, file);
  }
});

test("post: relativ sökväg tolkas mot projektkatalogen", () => {
  const root = tempProject();
  write(root, "src/a.ts", "x\n");
  const { run, calls } = fakeRun();
  runPost(postInput("src/a.ts"), { projectDir: root, toolRoot: REPO, run });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].args.includes(path.join(root, "src", "a.ts")));
});

test("post: saknad file_path ger exit 0 utan körning", () => {
  const { run, calls } = fakeRun();
  const raw = JSON.stringify({ hook_event_name: "PostToolUse", tool_input: {} });
  const r = runPost(raw, { projectDir: tempProject(), toolRoot: REPO, run });
  assert.deepEqual(r, { code: 0, stderr: "" });
  assert.equal(calls.length, 0);
});

test("post: ogiltig JSON blockerar inte, exit 1 och kort meddelande (3.7)", () => {
  const { run, calls } = fakeRun();
  const r = runPost("{inte json", { projectDir: tempProject(), toolRoot: REPO, run });
  assert.equal(r.code, 1);
  assert.ok(r.stderr.length > 0 && r.stderr.length < 200, r.stderr);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/, "ingen stackspårning");
  assert.equal(calls.length, 0);
});

test("post: timeout eller verktyg som inte startar blockerar inte, exit 1", () => {
  const root = tempProject();
  const file = write(root, "src/a.ts", "x\n");
  for (const error of [Object.assign(new Error("t"), { code: "ETIMEDOUT" }), new Error("ENOENT")]) {
    const { run } = fakeRun({ "prettier.cjs": { status: null, error } });
    const r = runPost(postInput(file), { projectDir: root, toolRoot: REPO, run });
    assert.equal(r.code, 1, error.message);
    assert.match(r.stderr, /prettier/i);
  }
});

test("post: långa felutdata kortas till MAX_LINES rader", () => {
  const root = tempProject();
  const file = write(root, "src/a.ts", "x\n");
  const out = Array.from({ length: 100 }, (_, i) => `  ${i + 1}:1  error  fel ${i}`).join("\n");
  const { run } = fakeRun({ "eslint.js": { status: 1, stdout: out } });
  const r = runPost(postInput(file), { projectDir: root, toolRoot: REPO, run });
  assert.equal(r.code, 2);
  assert.ok(r.stderr.split("\n").length <= MAX_LINES + 6, `för många rader: ${r.stderr}`);
  assert.match(r.stderr, /fel 0/);
  assert.doesNotMatch(r.stderr, /fel 99/);
  assert.match(r.stderr, /förkortad|fler rader/i);
});

// ---------- runStop ----------

test("stop: stop_hook_active ger exit 0 utan att köra något (3.9)", () => {
  const { run, calls } = fakeRun({ "status --porcelain": { stdout: " M src/a.ts\n" } });
  const raw = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: true });
  const r = runStop(raw, { projectDir: tempProject(), toolRoot: REPO, run });
  assert.deepEqual(r, { code: 0, stderr: "" });
  assert.equal(calls.length, 0);
});

test("stop: inga ändringar i src/ eller tests/ ger exit 0 utan tsc (3.10)", () => {
  const { run, calls } = fakeRun({ "status --porcelain": { stdout: "" } });
  const raw = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false });
  const r = runStop(raw, { projectDir: tempProject(), toolRoot: REPO, run });
  assert.deepEqual(r, { code: 0, stderr: "" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "git");
});

test("stop: ändringar och typfel ger exit 2, redovisa och rätta inte, högst MAX_LINES (3.11)", () => {
  const errors = Array.from(
    { length: 50 },
    (_, i) => `src/a.ts(${i + 1},1): error TS2322: fel ${i}`,
  );
  const { run, calls } = fakeRun({
    "status --porcelain": { stdout: " M src/a.ts\n" },
    tsc: { status: 2, stdout: errors.join("\n") },
  });
  const root = tempProject();
  const r = runStop(JSON.stringify({ hook_event_name: "Stop" }), {
    projectDir: root,
    toolRoot: REPO,
    run,
  });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /typecheck|tsc/);
  assert.match(r.stderr, /TS2322: fel 0/);
  assert.doesNotMatch(r.stderr, /fel 49/);
  assert.ok(r.stderr.split("\n").length <= MAX_LINES + 6, r.stderr);
  assert.match(r.stderr, /redovisa/i);
  assert.match(r.stderr, /rätta inte|inte rätta/i);
  assert.match(r.stderr, /godkännande/i);
  assert.equal(calls.length, 2);
  for (const c of calls) assert.equal(c.opts.cwd, root);
});

test("stop: ändringar och godkänd typkontroll ger exit 0 (3.12)", () => {
  const { run, calls } = fakeRun({ "status --porcelain": { stdout: "?? tests/b.test.ts\n" } });
  const r = runStop(JSON.stringify({ hook_event_name: "Stop" }), {
    projectDir: tempProject(),
    toolRoot: REPO,
    run,
  });
  assert.deepEqual(r, { code: 0, stderr: "" });
  assert.equal(calls.length, 2);
});

test("stop: git går inte att köra, blockerar inte (exit 1)", () => {
  const { run, calls } = fakeRun({
    "status --porcelain": { status: 128, stderr: "not a git repository" },
  });
  const r = runStop(JSON.stringify({ hook_event_name: "Stop" }), {
    projectDir: tempProject(),
    toolRoot: REPO,
    run,
  });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /git/);
  assert.equal(calls.length, 1, "tsc ska inte köras");
});

test("stop: ogiltig JSON blockerar inte (exit 1)", () => {
  const { run, calls } = fakeRun();
  const r = runStop("inte json", { projectDir: tempProject(), toolRoot: REPO, run });
  assert.equal(r.code, 1);
  assert.equal(calls.length, 0);
});

// ---------- package.json och settings.json ----------

test("package.json: format och format:check omfattar .claude/**/*.js (2.1, öppen fråga 10)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  const globs = '"src/**/*.ts" "tests/**/*.ts" ".claude/**/*.js"';
  assert.equal(pkg.scripts["format:check"], `prettier --check ${globs}`);
  assert.equal(pkg.scripts.format, `prettier --write ${globs}`);
});

test("settings.json: PostToolUse och Stop kör check-code.js, befintliga hooks finns kvar", () => {
  const s = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  const cmd = (mode) => `node "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/check-code.js" ${mode}`;
  const post = s.hooks.PostToolUse;
  assert.equal(post.length, 1);
  assert.equal(post[0].matcher, "Edit|Write");
  assert.deepEqual(post[0].hooks, [{ type: "command", command: cmd("post"), timeout: 30 }]);
  const stop = s.hooks.Stop;
  assert.equal(stop.length, 1);
  assert.equal(stop[0].matcher, undefined);
  assert.deepEqual(stop[0].hooks, [{ type: "command", command: cmd("stop"), timeout: 120 }]);
  const all = JSON.stringify(s.hooks);
  assert.ok(all.includes('record-metrics.js\\" start'));
  assert.ok(all.includes('record-metrics.js\\" end'));
  assert.ok(all.includes('session-memory.js\\" start'));
  assert.ok(all.includes('session-memory.js\\" precompact'));
});

// ---------- Integration: hooken som process, med de riktiga verktygen ----------

function runHook(mode, input, projectDir) {
  return spawnSync(process.execPath, [HOOK, mode], {
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    timeout: 60000,
  });
}

test("integration: felformaterad .ts ger exit 2 och filen ändras inte", () => {
  const root = tempProject();
  const file = write(root, "src/bad.ts", "const   a = {b:1}\nexport default a\n");
  const before = md5(file);
  const r = runHook("post", postInput(file), root);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /prettier --check/);
  assert.match(r.stderr, /bad\.ts/);
  assert.equal(md5(file), before);
});

test("integration: ESLint-fel i .ts ger exit 2 med regel och rad, filen ändras inte", () => {
  const root = tempProject();
  const file = write(root, "src/any.ts", "const x: any = 1;\nexport default x;\n");
  const before = md5(file);
  const r = runHook("post", postInput(file), root);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /1:10/);
  assert.match(r.stderr, /no-explicit-any/);
  assert.equal(md5(file), before);
});

test("integration: korrekt .ts och .js med require ger exit 0 utan utdata (3.3, 3.8)", () => {
  const root = tempProject();
  const ts = write(root, "src/ok.ts", "const a = { b: 1 };\nexport default a;\n");
  const js = write(
    root,
    ".claude/hooks/ok.js",
    'const fs = require("fs");\nprocess.exit(fs ? 0 : 1);\n',
  );
  for (const file of [ts, js]) {
    const r = runHook("post", postInput(file), root);
    assert.equal(r.status, 0, `${file}: ${r.stderr}`);
    assert.equal(r.stderr, "");
    assert.equal(r.stdout, "");
  }
});

test("integration: okänt läge ger exit 1 och blockerar inte", () => {
  const r = runHook("okant", "{}", tempProject());
  assert.equal(r.status, 1);
  assert.ok(r.stderr.length > 0);
});
