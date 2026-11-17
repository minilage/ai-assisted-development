// Tester för main-guard.js. Körs med: node --test .claude/hooks/main-guard.test.js
// Kriterium 4.1–4.9 och 4.12 i docs/plans/03-hooks.md. Testar både tillåtna och otillåtna
// åtgärder (CLAUDE.md, "Hooks och inställningar"). Använder bara Node:s inbyggda testverktyg.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
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
const writeWith = (file_path, content) => ({
  tool_name: "Write",
  tool_input: { file_path, content },
});
const editWith = (file_path, old_string, new_string, replace_all) => ({
  tool_name: "Edit",
  tool_input: { file_path, old_string, new_string, ...(replace_all ? { replace_all } : {}) },
});
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
  for (const f of [p("src", "routes", "x.ts"), p("docs", "plans", "02-x.md")]) {
    allowed(write(f));
    allowed(edit(f));
  }
  // R07 (plan 04, steg 2, beslut 2026-11-17): för en testfil tillåts tillåtna ändringar, men
  // Write med "x" skulle ta bort alla tester och blockeras av testskyddet.
  const testFile = p("tests", "orders.test.ts");
  const content = fs.readFileSync(testFile, "utf8");
  const first = content.split(/\r?\n/)[0];
  assert.equal(content.split(first).length, 2, "första raden ska vara unik");
  allowed(writeWith(testFile, content + '\ntest("ny", () => {});\n'));
  allowed(editWith(testFile, first, first + '\ntest("ny", () => {});'));
  blocked(write(testFile));
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

// --- R07: testskyddet (docs/plans/04-testskydd.md, steg 2) ---
// Avstängningar byggs med sammanslagna strängar, så att filen inte blockerar sig själv.

const SKIP_LINE = ["it", "skip"].join(".") + '("b", () => {});\n';

function tmpTests(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "main-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "tests"));
  const file = path.join(dir, "tests", "a.test.ts");
  fs.writeFileSync(file, 'const x = 1;\nit("a", () => {});\nit("c", () => {});\n');
  return { dir, file };
}

test("R07 krit. 1, 3 och 4: Edit och Write som stänger av eller tar bort tester blockeras", (t) => {
  const { dir, file } = tmpTests(t);
  for (const input of [
    editWith(file, "const x = 1;\n", "const x = 1;\n" + SKIP_LINE),
    editWith(file, "const x = 1;\n", "const x = 1;\n// "),
    editWith(file, 'it("c", () => {});\n', ""),
    writeWith(file, 'it("a", () => {});\n'),
    writeWith(path.join(dir, "tests", "ny.test.ts"), SKIP_LINE),
  ]) {
    blocked(input);
    assert.match(decide(input).reason, /testskydd/);
  }
  assert.equal(
    fs.readFileSync(file, "utf8"),
    'const x = 1;\nit("a", () => {});\nit("c", () => {});\n',
  );
});

test("R07: replace_all skickas vidare till testskyddet", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "main-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "tests"));
  const file = path.join(dir, "tests", "a.test.ts");
  fs.writeFileSync(file, 'const a = 1;\nconst a = 1;\ntest("x", () => {});\n');
  allowed(editWith(file, "const a = 1;\n", "const a = 1;\n// "));
  blocked(editWith(file, "const a = 1;\n", "const a = 1;\n// ", true));
});

test("R07 krit. 5 och 6: tillåtna ändringar av tester och andra filer blockeras inte", (t) => {
  const { dir, file } = tmpTests(t);
  allowed(editWith(file, 'it("c", () => {});\n', 'it("c", () => {});\nit("d", () => {});\n'));
  allowed(editWith(file, "const x = 1;", "const x = 2;"));
  allowed(
    writeWith(file, 'const x = 1;\nit("a", () => {});\nit("c", () => {});\nit("d", () => {});\n'),
  );
  allowed(writeWith(path.join(dir, "tests", "ny.test.ts"), 'it("a", () => {});\n'));
  allowed(editWith(p("src", "app.ts"), "a", SKIP_LINE));
  allowed(writeWith(p("docs", "x.md"), SKIP_LINE));
});

test("R07 krit. 7: borttagning och flytt av testfiler blockeras", () => {
  for (const c of [
    "rm tests/health.test.ts",
    "rm -f tests/x.test.ts",
    "rm tests",
    "rm ./tests/helpers/db.ts",
    "unlink tests/x.test.ts",
    "mv tests/x.test.ts /tmp/x.ts",
    "mv src/a.spec.js src/b.js",
    "git rm tests/x.test.ts",
    "git rm --cached tests/x.test.ts",
    "git mv tests/a.test.ts tests/b.test.ts",
    "cd src && rm a.test.ts",
    "rm src/legacy/test_price.py",
    "rm .claude/hooks/main-guard.test.js",
    "sudo rm tests/x.test.ts",
    "x=$(rm tests/x.test.ts)",
  ]) {
    blocked(bash(c));
    assert.match(decide(bash(c)).reason, /testskydd/, c);
  }
  // Ett ord som bara är * blockeras redan av regeln för hemliga filer (känt falskt positivt).
  blocked(bash("rm tests/*"));
});

test("R07 steg 2b, medel 2: prefix, nyckelord, tilldelning och substitution", () => {
  for (const c of [
    "FOO=1 rm tests/x.test.ts",
    "sudo -u root rm tests/x.test.ts",
    "nice -n 5 rm tests/x.test.ts",
    "timeout 5 rm tests/x.test.ts",
    "doas rm tests/x.test.ts",
    "if rm tests/x.test.ts; then :; fi",
    "true; then rm tests/x.test.ts",
    "! rm tests/x.test.ts",
    "{ rm tests/x.test.ts; }",
    "while true; do rm tests/x.test.ts; done",
    "echo $(rm tests/x.test.ts)",
    "echo `rm tests/x.test.ts`",
    "echo $(git rm tests/x.test.ts)",
  ]) {
    blocked(bash(c));
    assert.match(decide(bash(c)).reason, /testskydd/, c);
  }
});

test("R07 steg 2b, regression H1: substitution före flagga eller underkommando", () => {
  // Granskningen av steg 2b: när $( blev ; hamnade argumenten efter substitutionen i ett eget
  // delkommando. De här blockerades före R07 (HEAD) och ska fortfarande blockeras.
  for (const c of [
    'git push origin "$(git branch --show-current)" --force',
    'git -C "$(pwd)" clean -fd',
    'git -C "$(pwd)" rebase main',
    'git reset "$(git rev-parse HEAD~1)" --hard',
    'rm "$(pwd)/build" -rf',
  ]) {
    blocked(bash(c));
  }
  blocked(ps("Remove-Item $(Join-Path . build) -Recurse"));
});

test("R07 steg 2b, H2: testfiler som väljs i en substitution", () => {
  for (const c of [
    "rm $(git ls-files tests)",
    'rm $(find tests -name "*.test.ts")',
    "rm `ls tests/*.test.ts`",
    "git rm $(git ls-files tests)",
    "mv $(ls tests/*.test.ts) /tmp/",
  ]) {
    blocked(bash(c));
    assert.match(decide(bash(c)).reason, /testskydd/, c);
  }
  blocked(ps("Remove-Item $(Get-ChildItem tests)"));
});

test("R07 steg 2b, medel 1: testfiler som väljs av find eller i ett tidigare delkommando", () => {
  for (const c of [
    'find tests -name "*.test.ts" -delete',
    "find tests -exec rm {} +",
    'find . -name "*.test.ts" -exec rm -f {} +',
    "find tests -execdir mv {} /tmp +",
    "ls tests/*.test.ts | xargs rm",
    "ls tests/*.test.ts | xargs -0 rm -f",
    "git ls-files tests | xargs git rm",
  ]) {
    blocked(bash(c));
    assert.match(decide(bash(c)).reason, /testskydd/, c);
  }
  for (const c of [
    "Get-ChildItem tests -Filter *.test.ts | Remove-Item",
    "Get-ChildItem tests | Remove-Item -Force",
    "gci tests | ri",
  ]) {
    blocked(ps(c));
    assert.match(decide(ps(c)).reason, /testskydd/, c);
  }
});

test("R07 steg 2b: tillåtna kommandon med find, pipelines och ord som rm", () => {
  for (const c of [
    'find tests -name "*.test.ts"',
    'find src -name "*.tmp" -delete',
    "find tests -exec cat {} +",
    "echo rm tests",
    "ls tests | wc -l",
    "git log --oneline -- tests | head -5",
    "cat tests/health.test.ts | grep rm",
    "ls tests; rm tmp.txt",
    "grep -rn rm tests",
    "FOO=1 npx jest tests/health.test.ts",
    "if npx jest tests/health.test.ts; then echo ok; fi",
  ]) {
    allowed(bash(c));
  }
  allowed(ps("Get-ChildItem tests | Select-Object Name"));
  for (const c of [
    "Remove-Item tests/x.test.ts",
    "Remove-Item -Path tests\\x.test.ts -Force",
    "ri tests\\x.test.ts",
    "del tests\\x.test.ts",
    "erase tests\\x.test.ts",
    "Move-Item tests\\x.test.ts x.ts",
    "mi tests\\x.test.ts x.ts",
    "move tests\\x.test.ts x.ts",
    "ren tests\\x.test.ts y.ts",
    "Rename-Item tests\\x.test.ts y.ts",
    "rni tests\\x.test.ts y.ts",
    "rd tests",
    "rmdir tests",
    "Remove-Item C:\\Dev\\proj\\tests\\x.test.ts",
  ]) {
    blocked(ps(c));
    assert.match(decide(ps(c)).reason, /testskydd/, c);
  }
});

test("R07 krit. 8: kommandon som läser eller kör tester och borttagning av andra filer tillåts", () => {
  for (const c of [
    "ls tests",
    "cat tests/health.test.ts",
    "npx jest tests/health.test.ts",
    "node --test .claude/hooks/test-guard.test.js",
    "git diff -- tests",
    "git log -- tests",
    "git status --short -- src tests",
    "rm tmp.txt",
    "mv a.txt b.txt",
    "git rm src/gammal.ts",
    "grep -rn rm tests",
    "git log --grep rm -- tests",
    'echo "mv tests" > /dev/null',
  ]) {
    allowed(bash(c));
  }
  for (const c of ["Get-ChildItem tests", "Remove-Item tmp.txt", "Move-Item a.txt b.txt"]) {
    allowed(ps(c));
  }
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

test("R07 steg 3: ändringar av testkonfigurationen kräver godkännande (ask)", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "settings.json"), "utf8"));
  const { allow, ask, deny } = settings.permissions;
  for (const rule of ["Edit(jest.config.js)", "Edit(pytest.ini)"]) {
    assert.ok(ask.includes(rule), `${rule} ska stå under ask`);
    assert.ok(!allow.includes(rule) && !deny.includes(rule), `${rule} ska bara stå under ask`);
  }
  // package.json, där test-skriptet finns, står redan under ask.
  assert.ok(ask.includes("Edit(package.json)"));
});

test("R07 process: testskyddet ger exit 2 och meddelande från main-guard", (t) => {
  const { file } = tmpTests(t);
  for (const input of [
    editWith(file, "const x = 1;\n", "const x = 1;\n" + SKIP_LINE),
    writeWith(file, ""),
    bash("rm tests/health.test.ts"),
  ]) {
    const r = run(JSON.stringify(input));
    assert.equal(r.status, 2, `${JSON.stringify(input)}: ${r.stderr}`);
    assert.match(r.stderr, /^main-guard: blockerat: testskydd: /);
  }
  const ok = run(JSON.stringify(editWith(file, "const x = 1;", "const x = 2;")));
  assert.equal(ok.status, 0, ok.stderr);
});

test("4.9 process: ogiltig JSON, tom indata och {} ger exit 2", () => {
  for (const stdin of ["inte json", "", "{}", "null"]) {
    const r = run(stdin);
    assert.equal(r.status, 2, `${JSON.stringify(stdin)}: ${r.stderr}`);
    assert.match(r.stderr, /main-guard/);
  }
});
