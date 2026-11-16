// Tester för main-guard.js. Körs med: node --test .claude/hooks/main-guard.test.js
// Kriterium 4.1–4.9 och 4.12 i docs/plans/03-hooks.md. Testar både tillåtna och otillåtna
// åtgärder (CLAUDE.md, "Hooks och inställningar"). Använder bara Node:s inbyggda testverktyg.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOK = path.join(__dirname, "main-guard.js");
const { decide } = require("./main-guard.js");
const agentGuard = require("./agent-guard.js");

const PROJECT = path.resolve(__dirname, "..", "..");
const p = (...parts) => path.join(PROJECT, ...parts);

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const ps = (command) => ({ tool_name: "PowerShell", tool_input: { command } });
const write = (file_path) => ({ tool_name: "Write", tool_input: { file_path, content: "x" } });
const edit = (file_path) => ({
  tool_name: "Edit",
  tool_input: { file_path, old_string: "a", new_string: "b" },
});
const notebook = (notebook_path) => ({ tool_name: "NotebookEdit", tool_input: { notebook_path } });
const read = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });
const glob = (pattern, extra = {}) => ({ tool_name: "Glob", tool_input: { pattern, ...extra } });
const grep = (pattern, extra = {}) => ({ tool_name: "Grep", tool_input: { pattern, ...extra } });

function check(input, allowed) {
  const result = decide(input);
  const what = `${input.tool_name} ${JSON.stringify(input.tool_input)}`;
  assert.equal(
    result.allow,
    allowed,
    `${what} ska ${allowed ? "tillåtas" : "blockeras"} (${result.reason})`,
  );
  if (!allowed) assert.ok(result.reason, `${what} blockerades utan orsak`);
}
const blocked = (input) => check(input, false);
const allowed = (input) => check(input, true);

// --- 4.1: läsning av hemliga filer via Bash och PowerShell ---

test("4.1: Bash och PowerShell som läser hemliga filer blockeras", () => {
  for (const c of [
    "cat .env",
    "head config/.env.local",
    "less .env",
    "cat server.key",
    "cat certs/cert.pem",
    "cat ./config/.env.production",
    "git show HEAD:.env",
    "node --env-file=.env x.js",
    "grep -n x .env",
    'cat "C:\\Dev\\x\\.env"',
    "cat 'C:\\Dev\\x\\.env'",
    'cat "D:\\proj\\config\\.env.local"',
    // Granskningen 2026-11-16, fynd 3: --include, -g, --glob och --iglob väljer filer som läses.
    'grep -rn PASSWORD . --include=".env*"',
    'grep -rn BEGIN -r . --include "*.key"',
    "grep -rn x . --include=*.pem",
    'rg PASSWORD -g ".env*"',
    'rg BEGIN --glob "*.key"',
    "rg x --iglob=*.pem",
  ])
    blocked(bash(c));
  for (const c of [
    "type .env",
    "Get-Content .env",
    "gc .env",
    "Get-Content -Path .env",
    "Get-Content C:\\Dev\\x\\.env",
    "Get-Content config\\.env",
    "Select-String -Pattern x -Path .env",
  ])
    blocked(ps(c));
});

test("4.1: orsaken nämner hemliga filer", () => {
  assert.match(decide(bash("cat .env")).reason, /hemlig/);
});

// --- 4.2: rekursiv borttagning ---

test("4.2: rekursiv borttagning i andra former blockeras", () => {
  for (const c of [
    "rm -r -f x",
    "rm -R -f x",
    "rm --recursive --force x",
    "rm -f -r x",
    "rm -rf x",
    "rm -fr x",
    "rm -Rf x",
    "rm -r x",
    "/usr/bin/rm -rf x",
    "rm.exe -rf x",
    "rmdir /s x",
    "rd /s /q x",
    "sudo rm -rf x",
    "git status && rm -rf x",
  ])
    blocked(bash(c));
  for (const c of [
    "Remove-Item -r x",
    "Remove-Item x -Recurse -Force",
    "remove-item x -recurse",
    "Remove-Item x -Rec",
    "Remove-Item x -Recurse:$true",
    "ri -r x",
    "rm x -Recurse",
    "del /s x",
    "rmdir /S x",
  ])
    blocked(ps(c));
  assert.match(decide(bash("rm -r -f x")).reason, /rekursiv/);
});

// --- 4.3: force-push ---

test("4.3: force-push i andra former blockeras", () => {
  for (const c of [
    "git push --force-with-lease",
    "git push --force-with-lease=main origin main",
    "git push --force-if-includes origin main",
    "git push origin +main",
    "git push origin +main:main",
    "git push -fu origin main",
    "git push -uf origin main",
    "git -C . push -f",
    "git --no-pager push --force",
    "git push origin main --force",
    "git -c x=y push -f",
  ])
    blocked(bash(c));
  blocked(ps("git -C . push --force"));
  assert.match(decide(bash("git push origin +main")).reason, /force/);
});

// --- 4.4: reset --hard, clean och rebase ---

test("4.4: reset --hard, clean och rebase i andra former blockeras", () => {
  for (const c of [
    "git -C . reset --hard",
    "git --no-pager reset --hard",
    "git -c x=y reset --hard",
    "git reset HEAD~1 --hard",
    "git --git-dir .git reset --hard",
    "git clean -fdx",
    "git -C . clean -fd",
    "git -C . rebase",
    "git -C . rebase main",
    "git --no-pager rebase -i main",
  ])
    blocked(bash(c));
  blocked(ps("git -C . reset --hard"));
});

// --- 4.5: Read, Grep och Glob mot hemliga filer ---

test("4.5: Read, Grep och Glob mot hemliga filer blockeras, .env.example tillåts", () => {
  blocked(read(p(".env")));
  blocked(read(p("config", ".env.local")));
  blocked(read(p("certs", "server.key")));
  blocked(grep("password", { glob: ".env*" }));
  blocked(grep("password", { path: ".env" }));
  blocked(glob("**/*.pem"));
  blocked(glob("*", { path: p("certs", "server.key") }));
  allowed(read(p(".env.example")));
  allowed(read(p("src", "app.ts")));
  allowed(grep("password", { path: "src" }));
  allowed(glob("src/**/*.ts"));
});

// --- 4.6: tillåtna åtgärder ---

test("4.6: vanliga åtgärder i huvudsessionen tillåts", () => {
  for (const c of [
    "git status",
    "git status --short",
    "git push origin main",
    "git push -u origin main",
    "git push",
    "rm fil.txt",
    "rm -f fil.txt",
    "rmdir tom-katalog",
    "npm run lint",
    "npm test 2>&1 | tail -30",
    "cat .env.example",
    "echo x > ut.txt",
    "git reset --soft HEAD~1",
    "git reset HEAD fil.txt",
    "git rm -r --cached src/gammal",
    "git -C . rm -r --cached src/gammal",
    'find . -not -path "*/node_modules/*"',
    'find .claude -name "*.js" -not -path "*/node_modules/*"',
    'grep -rn x src --exclude="*.key"',
    'grep -rn x src --include="*.ts"',
    'rg x -g "!*.key" src',
    // Granskningen 2026-11-16, fynd 1: \ i ett sökmönster är inte en katalogavgränsare i Bash.
    'grep -rn "process\\.env" src',
    "grep -rn process\\.env src",
    'git commit -m "Block git push --force in main-guard"',
    'grep -n "rm -rf" docs/plans/03-hooks.md',
    "git log --oneline -5",
    "node --test .claude/hooks/main-guard.test.js",
    "md5sum src/*.ts",
  ])
    allowed(bash(c));
  for (const c of [
    "git status",
    "Remove-Item fil.txt",
    "Remove-Item fil.txt -Force",
    "rm -Force fil.txt",
    "Get-Content .env.example",
    "Get-ChildItem -Recurse src",
    'Select-String -Pattern "process\\.env" src/*.ts',
    'Select-String -Path src/app.ts -pattern "\\.env"',
  ])
    allowed(ps(c));
  allowed(write(p("src", "app.ts")));
  allowed(edit(p("PLAN.md")));
  allowed({ tool_name: "WebSearch", tool_input: { query: "x" } });
});

// --- 4.7: kommandon som parse inte kan dela upp (beslut om öppen fråga 7: alternativ A) ---

test("4.7: kommandon som inte kan tolkas tillåts, utom när råtexten är farlig", () => {
  allowed(bash("git status > ut.txt"));
  allowed(bash("node x.js > ut.txt"));
  allowed(bash('find . -not -path "*/node_modules/*" > ut.txt'));
  allowed(bash('echo "$(date)"'));
  allowed(bash("git commit -m \"$(cat <<'EOF'\nAdd main-guard\n\nCo-Authored-By: x\nEOF\n)\""));
  allowed(ps('Write-Output "rad1`nrad2"'));
  blocked(bash("echo $(cat .env)"));
  blocked(bash("echo `cat .env`"));
  blocked(bash('echo "$(rm -rf x)"'));
  blocked(bash("x=$(git push --force) && echo $x"));
  blocked(bash("cat < .env"));
  blocked(bash("git -C . reset --hard > ut.txt"));
  blocked(ps('Remove-Item x -Recurse; Write-Output "klar`n"'));
});

test("4.7: accepterat falskt positivt: commit-meddelande via $(...) som nämner ett spärrat mönster", () => {
  blocked(bash("git commit -m \"$(cat <<'EOF'\nSpärra git push --force i main-guard\nEOF\n)\""));
  blocked(bash("git commit -m \"$(cat <<'EOF'\nLäs inte cat .env\nEOF\n)\""));
});

test("kända falska positiva som delas med agent-guard: ord som bara är *", () => {
  blocked(bash("ls src/*"));
});

// Inom enkla citattecken behåller både Bash och parse \, och mentionsSecret delar vid \. I Git Bash
// på Windows kan 'config\.env' vara en riktig sökväg, så det går inte att skilja från ett sökmönster.
test("kända falska positiva som delas med agent-guard: \\ före .env inom enkla citattecken", () => {
  const c = "grep -n 'process\\.env' src/app.ts";
  blocked(bash(c));
  assert.equal(agentGuard.decide("read", bash(c), PROJECT).allow, false);
});

// --- 4.8: krockar inte med agent-guard ---

// Alla strängar i agent-guard.test.js prövas som kommandon. Det som agent-guard tillåter i något
// läge ska main-guard också tillåta, annars stoppar main-guard agenterna (hooks i settings.json
// körs också för subagenterna).
function literalsIn(file) {
  const src = fs.readFileSync(file, "utf8");
  const out = new Set();
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) {
    try {
      out.add(m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2].replace(/\\(.)/g, "$1"));
    } catch {
      /* hoppa över */
    }
  }
  return [...out];
}

test("4.8: allt som agent-guard tillåter i något läge tillåts också av main-guard", () => {
  const corpus = literalsIn(path.join(__dirname, "agent-guard.test.js"));
  assert.ok(corpus.length > 100, `för få strängar: ${corpus.length}`);
  let compared = 0;
  for (const mode of ["read", "checks", "plans-write", "dev"]) {
    for (const c of corpus) {
      if (!agentGuard.decide(mode, bash(c), PROJECT).allow) continue;
      compared++;
      const r = decide(bash(c));
      assert.equal(r.allow, true, `${mode} tillåter ${JSON.stringify(c)}, main-guard: ${r.reason}`);
    }
  }
  assert.ok(compared > 50, `för få jämförelser: ${compared}`);
  for (const f of [
    p("src", "routes", "x.ts"),
    p("tests", "orders.test.ts"),
    p("docs", "plans", "02-x.md"),
  ]) {
    allowed(write(f));
    allowed(edit(f));
  }
});

// Granskningen 2026-11-16, fynd 2: korpusen ovan saknar \ inom citattecken och jämför inte Read,
// Grep och Glob. De här fallen prövas därför uttryckligen.
const MODES = ["read", "checks", "plans-write", "dev"];
const BACKSLASH_CASES = [
  'grep -rn "process\\.env" src',
  "grep -rn process\\.env src",
  "grep -n 'process\\.env' src/app.ts",
  'grep -E "a\\.b|c\\.d" src/app.ts',
  'sed -n "s/\\./x/p" src/app.ts',
  'grep -rn "\\$1" src',
  'cat "src\\app.ts"',
];

test("4.8: kommandon med \\ som agent-guard tillåter tillåts också av main-guard", () => {
  let compared = 0;
  for (const mode of MODES) {
    for (const c of BACKSLASH_CASES) {
      if (!agentGuard.decide(mode, bash(c), PROJECT).allow) continue;
      compared++;
      const r = decide(bash(c));
      assert.equal(r.allow, true, `${mode} tillåter ${JSON.stringify(c)}, main-guard: ${r.reason}`);
    }
  }
  assert.ok(compared >= BACKSLASH_CASES.length, `för få jämförelser: ${compared}`);
});

test("4.8: Read, Grep och Glob ger samma beslut i main-guard som i agent-guard", () => {
  const inputs = [
    read(p("src", "app.ts")),
    read(p(".env")),
    read(p(".env.example")),
    read(p("config", ".env.local")),
    read(p("certs", "server.key")),
    glob("src/**/*.ts"),
    glob("**/.env*"),
    glob("**/*.pem"),
    glob("*.ts", { path: p("src") }),
    grep("password", { path: "src" }),
    grep("password", { path: ".env" }),
    grep("password", { glob: "*.pem" }),
    grep("process\\.env", { path: "src" }),
    grep("x", { glob: "*.ts" }),
  ];
  for (const mode of MODES) {
    for (const input of inputs) {
      const a = agentGuard.decide(mode, input, PROJECT).allow;
      const m = decide(input).allow;
      assert.equal(m, a, `${mode} ${input.tool_name} ${JSON.stringify(input.tool_input)}`);
    }
  }
});

// --- 4.12: Write, Edit och NotebookEdit mot hemliga filer ---

test("4.12: Write, Edit och NotebookEdit mot hemliga filer blockeras, .env.example tillåts", () => {
  for (const f of [p(".env"), p("config", ".env.local"), p("server.key"), p("certs", "cert.pem")]) {
    blocked(write(f));
    blocked(edit(f));
  }
  blocked(notebook(p(".env")));
  allowed(write(p(".env.example")));
  allowed(notebook(p("notebooks", "x.ipynb")));
});

// --- 4.9: indata som inte går att tolka ---

test("4.9: indata utan tool_name eller kommando blockeras", () => {
  assert.equal(decide({}).allow, false);
  assert.equal(decide(null).allow, false);
  assert.equal(decide({ tool_name: "Bash", tool_input: {} }).allow, false);
  assert.equal(decide({ tool_name: "PowerShell" }).allow, false);
  assert.equal(decide({ tool_name: "Write", tool_input: {} }).allow, false);
});

function run(stdin) {
  return spawnSync(process.execPath, [HOOK], { input: stdin, encoding: "utf8" });
}

test("process: tillåten åtgärd ger exit 0 utan utskrift", () => {
  const r = run(JSON.stringify(bash("git status")));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, "");
});

test("process: blockerad åtgärd ger exit 2 och visar att main-guard har blockerat", () => {
  const r = run(JSON.stringify(bash("rm -r -f x")));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^main-guard: blockerat: /);
  assert.match(r.stderr, /rekursiv/);
});

test("4.9 process: ogiltig JSON, tom indata och {} ger exit 2", () => {
  for (const stdin of ["inte json", "", "{}", "null"]) {
    const r = run(stdin);
    assert.equal(r.status, 2, `${JSON.stringify(stdin)}: ${r.stderr}`);
    assert.match(r.stderr, /main-guard/);
  }
});
