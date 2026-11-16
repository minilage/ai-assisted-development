// Tester för agent-guard.js. Körs med: node --test .claude/hooks/agent-guard.test.js
// Testar både tillåtna och otillåtna åtgärder i varje läge (CLAUDE.md, "Hooks och inställningar"),
// och kända sätt att försöka kringgå spärren. Använder bara Node:s inbyggda testverktyg.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOK = path.join(__dirname, "agent-guard.js");
const { decide } = require("./agent-guard.js");

// En påhittad projektkatalog. Hooken läser inga filer, den jämför bara sökvägar.
const PROJECT = path.resolve(__dirname, "..", "..");
const p = (...parts) => path.join(PROJECT, ...parts);

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const write = (file_path) => ({ tool_name: "Write", tool_input: { file_path, content: "x" } });
const edit = (file_path) => ({
  tool_name: "Edit",
  tool_input: { file_path, old_string: "a", new_string: "b" },
});
const read = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });
const glob = (pattern) => ({ tool_name: "Glob", tool_input: { pattern } });
const grep = (pattern, extra = {}) => ({ tool_name: "Grep", tool_input: { pattern, ...extra } });

function check(mode, input, allowed) {
  const result = decide(mode, input, PROJECT);
  const what = JSON.stringify(input.tool_input);
  assert.equal(
    result.allow,
    allowed,
    `${mode}: ${what} ska ${allowed ? "tillåtas" : "blockeras"} (${result.reason})`,
  );
  if (!allowed) assert.ok(result.reason, `${mode}: ${what} blockerades utan orsak`);
}

// --- Gemensamt för läsande lägen: read, checks och plans-write ---

const READ_ALLOWED = [
  "git status --short",
  "git status --porcelain --untracked-files=all",
  "git diff HEAD~1 -- src/",
  "git diff --cached",
  "git --no-pager log --oneline -5",
  "git show cd1afe6:src/app.ts",
  "git blame src/app.ts",
  "git branch --show-current",
  "git rev-parse HEAD",
  "git ls-files src",
  'grep -rn "process.env" src/',
  'grep -E "query|exec" src/db.ts',
  "cat src/app.ts | head -20",
  "ls -la src && wc -l src/*.ts",
  'find src -name "*.ts"',
  "sed -n '10,20p' src/app.ts",
  "md5sum src/*.ts",
  "git diff 2>&1 | head -50",
  "git status 2>/dev/null",
  "cd /c/Dev/ai-assisted-development && git status",
  "cat .env.example",
  "tail -n 5 PLAN.md",
  'grep -En "[0-9]+" src/app.ts',
];

const READ_BLOCKED = [
  ["rm src/app.ts", "rm"],
  ["git diff && rm -rf x", "kedja med rm"],
  ["git status; rm x", "semikolon"],
  ["git status\nrm x", "ny rad"],
  ["cat a > b", "omdirigering till fil"],
  ["echo x >> PLAN.md", "tillägg till fil"],
  ["git diff | tee out.txt", "tee"],
  ["git diff --output=patch.txt", "git --output"],
  ["sort -o out.txt src/app.ts", "sort -o"],
  ["cat $(echo .env)", "kommandosubstitution"],
  ["cat `ls`", "backticks"],
  ['grep "x $(rm y)" src', "substitution inom citattecken"],
  ["cat <(ls)", "processsubstitution"],
  ["cat < src/app.ts", "indata från fil"],
  ["cat .env", ".env"],
  ["cat ./config/.env.local", ".env.local"],
  ["cat certs/server.key", ".key"],
  ["head cert.pem", ".pem"],
  ["cat .e*", "glob som matchar .env"],
  ["cat certs/*", "glob som matchar .key"],
  ["cat .en[v]", "glob med hakparentes som matchar .env"],
  ["find . -name x -delete", "find -delete"],
  ["find . -exec rm {} ;", "find -exec"],
  ["sed -i 's/a/b/' src/app.ts", "sed -i"],
  ["sed -n 'w out' src/app.ts", "sed med skrivkommando"],
  ["git commit -m x", "git commit"],
  ["git checkout main", "git checkout"],
  ["git branch ny-gren", "git branch som skapar gren"],
  ["git -C . commit -m x", "git med -C"],
  ["npm run format", "formatering"],
  ["node -e \"require('fs').writeFileSync('x','y')\"", "node -e"],
  ["python -c \"open('x','w')\"", "python -c"],
  ['bash -c "git status"', "bash -c"],
  ['grep "abc src', "citattecken som inte stängs"],
  ["", "tomt kommando"],
];

for (const mode of ["read", "checks", "plans-write"]) {
  test(`${mode}: läsande kommandon tillåts`, () => {
    for (const c of READ_ALLOWED) check(mode, bash(c), true);
  });
  test(`${mode}: skrivande och farliga kommandon blockeras`, () => {
    for (const [c] of READ_BLOCKED) check(mode, bash(c), false);
  });
  test(`${mode}: hemliga filer blockeras även för Read, Glob och Grep`, () => {
    check(mode, read(p("src", "app.ts")), true);
    check(mode, read(p(".env")), false);
    check(mode, read(p("config", ".env.production")), false);
    check(mode, read(p("certs", "server.key")), false);
    check(mode, read(p(".env.example")), true);
    check(mode, glob("src/**/*.ts"), true);
    check(mode, glob("**/.env*"), false);
    check(mode, grep("password", { path: "src" }), true);
    check(mode, grep("password", { path: ".env" }), false);
    check(mode, grep("password", { glob: "*.pem" }), false);
  });
}

// --- read: granskare ---

test("read: kontroller och tester körs inte", () => {
  for (const c of [
    "npm test",
    "npm run lint",
    "npx jest",
    "node --test x.test.js",
    "python -m pytest",
  ]) {
    check("read", bash(c), false);
  }
});

test("read: Write, Edit och NotebookEdit blockeras", () => {
  check("read", write(p("src", "x.ts")), false);
  check("read", edit(p("src", "app.ts")), false);
  check("read", { tool_name: "NotebookEdit", tool_input: { notebook_path: p("x.ipynb") } }, false);
});

// --- checks: verifierare ---

test("checks: projektets kontroller tillåts", () => {
  for (const c of [
    "npm run lint",
    "npm run typecheck",
    "npm run format:check",
    "npm test",
    "npm test -- tests/orders.test.ts",
    'npx jest tests/orders.test.ts -t "price"',
    "npm run test:legacy",
    "python -m pytest tests/legacy -q",
    "node --test .claude/skills/skills.test.js",
    "node --test .claude/hooks/agent-guard.test.js .claude/statusline.test.js",
    "npm run lint 2>&1 | tail -20",
  ]) {
    check("checks", bash(c), true);
  }
});

test("checks: kommandon som rättar, formaterar, installerar eller rör databasen blockeras", () => {
  for (const c of [
    "npm run format",
    "npm run lint -- --fix",
    "npx prettier --write .",
    "npx eslint --fix src",
    "npm run db:up",
    "npm run db:reset",
    "npm install",
    "npm i lodash",
    "pip install pytest",
    "npx jest -u",
    "npm test -- --updateSnapshot",
    "node --test -e x",
    "node --test --eval x",
    "docker compose up -d",
  ]) {
    check("checks", bash(c), false);
  }
});

test("checks: Write och Edit blockeras", () => {
  check("checks", write(p("tests", "x.test.ts")), false);
  check("checks", edit(p("src", "app.ts")), false);
});

// --- plans-write: planerare ---

test("plans-write: planfiler i docs/plans/ får skrivas", () => {
  check("plans-write", write(p("docs", "plans", "02-ny-funktion.md")), true);
  check("plans-write", edit(p("docs", "plans", "01-pris-endpoint-404.md")), true);
  check("plans-write", write("docs/plans/03-relativ-sokvag.md"), true);
});

test("plans-write: andra filer och felaktiga namn blockeras", () => {
  for (const f of [
    p("src", "app.ts"),
    p("docs", "standard.md"),
    p("docs", "plans", "..", "..", "src", "app.ts"),
    p("docs", "plans", "plan.md"),
    p("docs", "plans", "2-kort.md"),
    p("docs", "plans", "02-Versaler.md"),
    p("docs", "plans", "sub", "02-x.md"),
    p("docs", "plans", "02-x.txt"),
    p(".claude", "agents", "planerare.md"),
    path.join(path.dirname(PROJECT), "annat-projekt", "docs", "plans", "02-x.md"),
  ]) {
    check("plans-write", write(f), false);
    check("plans-write", edit(f), false);
  }
  check(
    "plans-write",
    { tool_name: "NotebookEdit", tool_input: { notebook_path: p("docs", "plans", "02-x.md") } },
    false,
  );
});

test("plans-write: planer får inte skrivas via Bash", () => {
  check("plans-write", bash("echo x > docs/plans/02-x.md"), false);
});

// --- dev: utvecklare ---

test("dev: tester, kontroller och vanliga utvecklingskommandon tillåts", () => {
  for (const c of [
    "npm test",
    "npx jest tests/orders.test.ts",
    "npm run lint",
    "npm run typecheck",
    "npm run format:check",
    "node --test .claude/skills/skills.test.js",
    "python -m pytest tests/legacy -q",
    "git status",
    "git diff",
    "git log --oneline -3",
    "mkdir -p tests/legacy",
    "ls tests && cat tests/orders.test.ts",
    "npm test 2>&1 | tail -30",
  ]) {
    check("dev", bash(c), true);
  }
});

test("dev: git som ändrar historik eller arbetskatalog blockeras", () => {
  for (const c of [
    "git add .",
    "git commit -m x",
    "git -C . commit -m x",
    "git --no-pager commit -m x",
    "git push",
    "git push --force origin main",
    "git reset --hard",
    "git stash",
    "git checkout -- src/app.ts",
    "git switch main",
    "git restore src/app.ts",
    "git rebase main",
    "git merge x",
    "git tag inlamning",
    "git clean -fd",
    "git rm src/app.ts",
    "git config core.hooksPath x",
    "git branch -D main",
  ]) {
    check("dev", bash(c), false);
  }
});

test("dev: installationer, databas, borttagning, nätverk och indirekt körning blockeras", () => {
  for (const c of [
    "npm install lodash",
    "npm i",
    "npm ci",
    "npm uninstall jest",
    "npm update",
    "pip install pytest",
    "python -m pip install pytest",
    "npx prettier --write .",
    "npx some-package",
    "npm run format",
    "npm run db:up",
    "npm run db:reset",
    "docker compose down -v",
    "psql -c 'drop table orders'",
    "rm src/app.ts",
    "rm -rf tests",
    "rmdir tests",
    "mv src/app.ts src/old.ts",
    "Remove-Item src/app.ts",
    'bash -c "git commit -m x"',
    'sh -c "rm x"',
    "eval git commit",
    'node -e "x"',
    'python -c "x"',
    "ls | xargs rm",
    "find . -name '*.tmp' -delete",
    "curl https://example.com",
    "wget https://example.com",
    "echo x > src/app.ts",
    "cat .env",
    "git commit -m $(date)",
  ]) {
    check("dev", bash(c), false);
  }
});

test("dev: Write och Edit tillåts i koden men inte för hemligheter eller riggens spärrar", () => {
  check("dev", write(p("src", "routes", "x.ts")), true);
  check("dev", edit(p("tests", "orders.test.ts")), true);
  check("dev", edit(p("PLAN.md")), true);
  check("dev", write(p(".env")), false);
  check("dev", edit(p("config", ".env.local")), false);
  check("dev", edit(p(".claude", "hooks", "agent-guard.js")), false);
  check("dev", edit(p(".claude", "hooks", "agent-guard.test.js")), false);
  check("dev", write(p(".claude", "agents", "utvecklare.md")), false);
  check("dev", edit(p(".claude", "settings.json")), false);
  check("dev", edit(p(".claude", "settings.local.json")), false);
});

// Kriterium 4.11 i docs/plans/03-hooks.md: hela .claude/hooks/ skyddas, inte bara agent-guard.
test("dev: inga hookskript eller hooktester i .claude/hooks/ får ändras", () => {
  for (const name of [
    "main-guard.js",
    "main-guard.test.js",
    "check-code.js",
    "check-code.test.js",
    "session-memory.js",
    "record-metrics.js",
    "record-metrics.test.js",
    "ny-hook.js",
  ]) {
    check("dev", write(p(".claude", "hooks", name)), false);
    check("dev", edit(p(".claude", "hooks", name)), false);
  }
  check(
    "dev",
    { tool_name: "NotebookEdit", tool_input: { notebook_path: p(".claude", "hooks", "x.ipynb") } },
    false,
  );
  const { reason } = decide("dev", edit(p(".claude", "hooks", "main-guard.js")), PROJECT);
  assert.match(reason, /hookskripten/, reason);
  // Det som var tillåtet förut är fortfarande tillåtet.
  check("dev", write(p("src", "pricing", "x.ts")), true);
  check("dev", edit(p("tests", "helpers", "db.ts")), true);
  check("dev", edit(p(".claude", "hooksx", "a.js")), true);
});

// --- Orsaken ska säga vad som stoppade kommandot (Session 08, steg 2) ---
// "npm run lint -- --fix" gav tidigare "...inte tillåtet i det här läget: npm run lint", så det såg ut
// som om vanliga npm run lint var spärrat.

test("orsaken anger argumentet som inte är tillåtet, inte bara kommandots början", () => {
  const cases = [
    ["checks", "npm run lint -- --fix", /--fix/],
    ["checks", "npx jest -u", /-u\b/],
    ["read", "git diff --output=x.patch", /--output=x\.patch/],
    ["read", "git branch ny-gren", /ny-gren/],
    ["read", "sort -o ut.txt a.txt", /-o/],
  ];
  for (const [mode, c, re] of cases) {
    const { allow, reason } = decide(mode, bash(c), PROJECT);
    assert.equal(allow, false, c);
    assert.match(reason, re, `${c}: orsaken ska nämna argumentet (${reason})`);
    assert.match(reason, /argument/, `${c}: orsaken ska säga att det är ett argument (${reason})`);
  }
});

test("orsaken skiljer på kommandon som inte finns i listan och argument som inte är tillåtna", () => {
  const notListed = decide("checks", bash("git stash list"), PROJECT).reason;
  assert.match(notListed, /finns inte bland de tillåtna/, notListed);
  assert.match(notListed, /git stash list/, notListed);
  const badArgs = decide("read", bash("sed -n 'w ut' a.txt"), PROJECT).reason;
  assert.match(badArgs, /sed -n/, badArgs);
  assert.match(badArgs, /argument/, badArgs);
});

// --- Indata som inte går att tolka blockeras ---

test("okänt läge, saknat verktyg och saknat kommando blockeras", () => {
  assert.equal(decide("okänt", bash("git status"), PROJECT).allow, false);
  assert.equal(decide(undefined, bash("git status"), PROJECT).allow, false);
  assert.equal(decide("read", {}, PROJECT).allow, false);
  assert.equal(decide("read", { tool_name: "Bash", tool_input: {} }, PROJECT).allow, false);
  assert.equal(decide("plans-write", { tool_name: "Write", tool_input: {} }, PROJECT).allow, false);
});

test("andra verktyg släpps igenom, eftersom de styrs av agentens tools", () => {
  assert.equal(
    decide("read", { tool_name: "WebSearch", tool_input: { query: "x" } }, PROJECT).allow,
    true,
  );
});

// --- Hooken som process, så som Claude Code anropar den ---

function run(args, stdin, env = {}) {
  return spawnSync(process.execPath, [HOOK, ...args], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT, ...env },
  });
}

test("process: tillåten åtgärd ger exit 0 utan utskrift", () => {
  const r = run(["read"], JSON.stringify(bash("git status")));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
});

test("process: blockerad åtgärd ger exit 2 och en orsak på stderr", () => {
  const r = run(["read"], JSON.stringify(bash("rm src/app.ts")));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /agent-guard \(read\)/);
  assert.match(r.stderr, /blockerat/i);
});

test("process: felaktig JSON, tom indata och saknat läge ger exit 2", () => {
  assert.equal(run(["read"], "inte json").status, 2);
  assert.equal(run(["read"], "").status, 2);
  assert.equal(run([], JSON.stringify(bash("git status"))).status, 2);
  assert.equal(run(["okänt"], JSON.stringify(bash("git status"))).status, 2);
});

test("process: projektkatalogen tas från cwd i indata när CLAUDE_PROJECT_DIR saknas", () => {
  const input = { ...write(p("docs", "plans", "02-x.md")), cwd: PROJECT };
  const r = run(["plans-write"], JSON.stringify(input), { CLAUDE_PROJECT_DIR: "" });
  assert.equal(r.status, 0, r.stderr);
});

test(
  "process: sökvägar i Git Bash-form (/c/...) tolkas på Windows",
  { skip: process.platform !== "win32" },
  () => {
    const posix = p("docs", "plans", "02-x.md")
      .replace(/\\/g, "/")
      .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    assert.equal(decide("plans-write", write(posix), PROJECT).allow, true);
    const outside = p("src", "app.ts")
      .replace(/\\/g, "/")
      .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    assert.equal(decide("plans-write", write(outside), PROJECT).allow, false);
  },
);
