// Tester för test-guard.js. Körs med: node --test .claude/hooks/test-guard.test.js
// Kriterium 1–6 och 9 i docs/plans/04-testskydd.md. Testar både tillåtna och otillåtna
// ändringar (CLAUDE.md, "Hooks och inställningar"). Använder bara Node:s inbyggda testverktyg.
//
// Avstängningar (skip-, only- och x-anrop med flera) byggs med sammanslagna strängar, så att den
// här filen inte själv innehåller dem. Annars skulle testskyddet blockera ändringar av filen när
// det är inkopplat. Steg 1b och 1c lägger till testerna för granskningarnas fynd (Session 13).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { isTestFile, countDisables, countTests, checkEdit, checkWrite } = require("./test-guard.js");

const dot = (...parts) => parts.join(".");

// Avstängningar i Jest: [namn i testet, rad som läggs till].
const JS_DISABLES = [
  [dot("it", "skip"), dot("it", "skip") + '("b", () => {});'],
  [dot("test", "skip"), dot("test", "skip") + '("b", () => {});'],
  [dot("describe", "skip"), dot("describe", "skip") + '("b", () => {});'],
  [dot("it", "only"), dot("it", "only") + '("b", () => {});'],
  [dot("test", "only"), dot("test", "only") + '("b", () => {});'],
  [dot("describe", "only"), dot("describe", "only") + '("b", () => {});'],
  [dot("test", "skip", "each"), dot("test", "skip", "each") + '([1])("b %i", () => {});'],
  ["x" + "it", "x" + 'it("b", () => {});'],
  ["x" + "test", "x" + 'test("b", () => {});'],
  ["x" + "describe", "x" + 'describe("b", () => {});'],
  ["f" + "it", "f" + 'it("b", () => {});'],
  ["f" + "describe", "f" + 'describe("b", () => {});'],
  // Steg 1b, fynd medel 1: .each efter x- och f-formerna.
  [dot("f" + "it", "each"), dot("f" + "it", "each") + '([1])("b %i", () => {});'],
  [dot("f" + "describe", "each"), dot("f" + "describe", "each") + '([1])("b %i", () => {});'],
  [dot("x" + "it", "each"), dot("x" + "it", "each") + '([1])("b %i", () => {});'],
  [dot("x" + "test", "each"), dot("x" + "test", "each") + '([1])("b %i", () => {});'],
  [dot("x" + "describe", "each"), dot("x" + "describe", "each") + '([1])("b %i", () => {});'],
  // Steg 1b, fynd medel 2: node:test, som riggens egna tester använder.
  ["node:test, skip-flagga", 'test("b", { ' + ["skip", "true"].join(": ") + " }, () => {});"],
  ["node:test, only-flagga", 'test("b", { ' + ["only", "true"].join(": ") + " }, () => {});"],
  ["node:test, todo-flagga", 'test("b", { ' + ["todo", "true"].join(": ") + " }, () => {});"],
  ["node:test, skip med orsak", 'test("b", { ' + ["skip", '"x"'].join(": ") + " }, () => {});"],
  [dot("t", "skip") + "(", 'test("b", (t) => {\n  ' + dot("t", "skip") + "();\n});"],
  [dot("t", "todo") + "(", 'test("b", (t) => {\n  ' + dot("t", "todo") + "();\n});"],
];

// Avstängningar i pytest: [namn i testet, text som läggs till före testet].
const PY_DISABLES = [
  [dot("@pytest", "mark", "skip"), dot("@pytest", "mark", "skip") + "\n"],
  [dot("@pytest", "mark", "skipif"), dot("@pytest", "mark", "skipif") + "(True, reason='x')\n"],
  [dot("@pytest", "mark", "xfail"), dot("@pytest", "mark", "xfail") + "\n"],
  [dot("pytest", "skip") + "(", "def test_c():\n    " + dot("pytest", "skip") + '("x")\n'],
  [dot("@unittest", "skip"), dot("@unittest", "skip") + '("x")\n'],
  [dot("@unittest", "skipIf"), dot("@unittest", "skipIf") + '(True, "x")\n'],
  ["pytestmark", "pytestmark = " + dot("pytest", "mark", "skip") + "\n"],
  // Steg 1b, fynd medel 3.
  [dot("pytest", "xfail") + "(", "def test_c():\n    " + dot("pytest", "xfail") + '("x")\n'],
  [dot("pytest", "importor" + "skip") + "(", dot("pytest", "importor" + "skip") + '("psycopg")\n'],
  [
    dot("self", "skip" + "Test") + "(",
    "def test_c(self):\n    " + dot("self", "skip" + "Test") + '("x")\n',
  ],
  ["Skip" + "Test", "def test_c():\n    raise " + dot("unittest", "Skip" + "Test") + '("x")\n'],
  ["expected" + "Failure", dot("@unittest", "expected" + "Failure") + "\n"],
];

const JS_FILE = "tests/a.test.ts";
const PY_FILE = "tests/legacy/test_price.py";
const JS_OLD = 'test("a", () => {\n  expect(1).toBe(1);\n});\n';
const PY_OLD = "def test_a():\n    assert 1 == 1\n";

function expectBlocked(result, what, word) {
  assert.equal(result.allow, false, `${what} ska blockeras`);
  assert.ok(result.reason && result.reason.includes(word), `${what}: orsaken ska nämna "${word}"`);
}
function expectAllowed(result, what) {
  assert.equal(result.allow, true, `${what} ska tillåtas (${result.reason})`);
}

// --- 9: vad som räknas som testfil ---

test("9: sökvägar i en katalog som heter tests eller med testfilnamn räknas som testfiler", () => {
  for (const f of [
    "tests/a.test.ts",
    "tests/helpers/db.ts",
    "C:\\Dev\\proj\\tests\\helpers\\db.ts",
    "/c/Dev/proj/tests/orders.test.ts",
    "tests",
    "./tests/",
    "tests/*",
    "TESTS/X.TS",
    "src/a.spec.js",
    "src/a.test.tsx",
    "*.test.ts",
    "__tests__/a.js",
    "tests/legacy/test_price.py",
    "legacy/test_price.py",
    "legacy/price_test.py",
    "conftest.py",
    "test_*.py",
  ]) {
    assert.equal(isTestFile(f), true, `${f} ska räknas som testfil`);
  }
});

test("9: riggens egna tester räknas som testfiler", () => {
  for (const f of [
    ".claude/hooks/main-guard.test.js",
    "C:\\Dev\\proj\\.claude\\hooks\\test-guard.test.js",
    ".claude/agents/agents.test.js",
    ".claude/statusline.test.js",
  ]) {
    assert.equal(isTestFile(f), true, `${f} ska räknas som testfil`);
  }
});

test("9: andra filer räknas inte som testfiler", () => {
  for (const f of [
    "src/app.ts",
    "docs/x.md",
    ".claude/hooks/test-guard.js",
    ".claude/hooks/main-guard.js",
    "src/testing.ts",
    "src/tests.ts",
    "src/latest.ts",
    "src/legacy/contest.py",
    "src/legacy/price_calc.py",
    "jest.config.js",
    "",
  ]) {
    assert.equal(isTestFile(f), false, `${f} ska inte räknas som testfil`);
  }
  assert.equal(isTestFile(undefined), false);
  assert.equal(isTestFile(null), false);
});

// --- Räkning ---

test("countTests räknar testdefinitioner per rad men inte bortkommenterade", () => {
  const text = [
    'test("a", () => {});',
    '  it("b", () => {});',
    "  test.each([1, 2])('c %i', () => {});",
    '// test("d", () => {});',
    "def test_e():",
    "    async def test_f(self):",
    "# def test_g():",
    'const s = "test(";',
  ].join("\n");
  assert.equal(countTests(text), 5);
  assert.equal(countTests(""), 0);
});

test("countDisables räknar avstängningar men inte test.todo eller vanliga namn", () => {
  for (const [name, line] of [...JS_DISABLES, ...PY_DISABLES]) {
    assert.equal(countDisables(line), 1, `${name} ska räknas som en avstängning`);
  }
  for (const text of [
    'test("a", () => {});',
    dot("test", "todo") + '("senare");',
    "const skip = 1; expect(skip).toBe(1);",
    "suffix(); prefix(); profit();",
    "if (only) {}",
    // Steg 1b, beslut: villkorliga avstängningar räknas inte. De två som finns i riggen
    // (statusline.test.js:359, agent-guard.test.js:436) är plattformsvillkor.
    'test("a", { ' + ["skip", 'process.platform !== "win32"'].join(": ") + " }, () => {});",
    'test("a", { ' + ["skip", "!fs.existsSync(x)"].join(": ") + " }, () => {});",
    'test("a", { ' + ["skip", "false"].join(": ") + " }, () => {});",
    "t.after(() => {}); t.diagnostic('x');",
    "const skipped = []; const onlyOne = 1;",
  ]) {
    assert.equal(countDisables(text), 0, `${text} ska inte räknas`);
  }
});

// --- 1: avstängningar i Jest ---

test("1: Edit som lägger till en avstängning i en JS-testfil blockeras", () => {
  for (const [name, line] of JS_DISABLES) {
    expectBlocked(checkEdit(JS_FILE, JS_OLD, JS_OLD + line + "\n"), name, "avstäng");
  }
});

test("1: avstängning i riggens egna tester blockeras", () => {
  const [name, line] = JS_DISABLES[0];
  const file = "C:\\Dev\\proj\\.claude\\hooks\\main-guard.test.js";
  expectBlocked(checkEdit(file, JS_OLD, JS_OLD + line + "\n"), name, "avstäng");
});

// --- 2: avstängningar i pytest ---

test("2: Edit som lägger till en avstängning i en Python-testfil blockeras", () => {
  for (const [name, added] of PY_DISABLES) {
    expectBlocked(checkEdit(PY_FILE, PY_OLD, added + PY_OLD), name, "avstäng");
  }
});

// --- 3: borttagna tester ---

test("3: Edit som tar bort ett test blockeras", () => {
  const two = JS_OLD + 'it("b", () => {\n  expect(2).toBe(2);\n});\n';
  expectBlocked(checkEdit(JS_FILE, two, JS_OLD), "borttaget it(", "tas bort");
  expectBlocked(checkEdit(JS_FILE, JS_OLD, ""), "tom new_string", "tas bort");
  const pyTwo = PY_OLD + "\ndef test_b():\n    assert 2 == 2\n";
  expectBlocked(checkEdit(PY_FILE, pyTwo, PY_OLD), "borttaget def test_", "tas bort");
});

test("3: Edit som kommenterar bort ett test blockeras", () => {
  expectBlocked(
    checkEdit(JS_FILE, 'test("a", () => {', '// test("a", () => {'),
    "// test(",
    "tas bort",
  );
  expectBlocked(checkEdit(PY_FILE, "def test_a():", "# def test_a():"), "# def test_", "tas bort");
});

// --- Steg 1b, fynd hög: Edit jämförs med hela filen på disk ---

test("1b: Edit jämförs med hela filen, så att ett test på nästa rad inte kan stängas av", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "tests"));
  const file = path.join(dir, "tests", "a.test.ts");
  const text = 'const x = 1;\nit("a", () => {});\n';
  fs.writeFileSync(file, text);

  // Utdragen innehåller inget test, men ändringen påverkar raden efter.
  expectBlocked(
    checkEdit(file, "const x = 1;\n", "const x = 1;\n// "),
    "// före nästa rad",
    "tas bort",
  );
  expectBlocked(
    checkEdit(file, "const x = 1;\n", "const x = 1;\nx"),
    "x före nästa rad",
    "avstäng",
  );
  expectAllowed(checkEdit(file, "const x = 1;", "const x = 2;"), "ändrat värde i hela filen");
  // old_string som inte finns i filen: utdragen jämförs som tidigare.
  expectAllowed(checkEdit(file, "finns inte", "inte heller"), "old_string som saknas");
  expectBlocked(checkEdit(file, JS_OLD, ""), "old_string som saknas, borttaget test", "tas bort");
  assert.equal(fs.readFileSync(file, "utf8"), text, "checkEdit ska inte ändra filen");
});

test("1b: replace_all ersätter alla förekomster innan filen jämförs", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "tests"));
  const file = path.join(dir, "tests", "a.test.ts");
  // Bara den andra förekomsten står före ett test.
  fs.writeFileSync(file, 'const a = 1;\nconst a = 1;\ntest("x", () => {});\n');
  const [oldStr, newStr] = ["const a = 1;\n", "const a = 1;\n// "];
  // Edit-verktyget avvisar en old_string som inte är unik när replace_all saknas, så fallet
  // inträffar inte i praktiken. Testet visar bara skillnaden mot replace_all: utan den ersätts
  // den första förekomsten, som inte står före något test.
  expectAllowed(checkEdit(file, oldStr, newStr), "första förekomsten utan replace_all");
  expectBlocked(checkEdit(file, oldStr, newStr, { replaceAll: true }), "replace_all", "tas bort");
});

// --- Steg 1c: CRLF (fynd M1 i granskningen av steg 1b) ---

test("1c: Edit med LF i old_string jämförs med hela filen även när filen har CRLF", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "tests"));
  const file = path.join(dir, "tests", "crlf.test.ts");
  const text =
    'describe("a", () => {\r\n  it("b", () => {\r\n    expect(1).toBe(1);\r\n  });\r\n});\r\n';
  fs.writeFileSync(file, text);
  const head = 'describe("a", () => {\n';

  expectBlocked(checkEdit(file, head, head + "// "), "LF-utdrag, // före nästa rad", "tas bort");
  // Nästa rad har indrag, så x läggs efter indraget och ger ett x-anrop.
  expectBlocked(checkEdit(file, head + "  ", head + "  x"), "LF-utdrag, x-anrop", "avstäng");
  const crlfHead = head.replace("\n", "\r\n");
  expectBlocked(checkEdit(file, crlfHead, crlfHead + "// "), "CRLF-utdrag", "tas bort");
  // Tillåtna ändringar i en fil med CRLF, också med flera rader i old_string.
  const block = '  it("b", () => {\n    expect(1).toBe(1);\n';
  expectAllowed(checkEdit(file, block, block.replace("toBe(1)", "toBe(2)")), "ändrat värde, LF");
  expectAllowed(checkEdit(file, block, block + "    expect(2).toBe(2);\n"), "nytt påstående");
  assert.equal(fs.readFileSync(file, "utf8"), text, "checkEdit ska inte ändra filen");
});

// --- Steg 1c: ersättaren och tom old_string (fynd L4) ---

test("1c: $& och $' i new_string tolkas inte som ersättningsmönster", () => {
  const text = 'const x = 1;\nit("a", () => {});\n';
  const readFile = () => text;
  // Edit-verktyget skriver new_string ordagrant: it("a") ersätts och raden börjar med $&,
  // så testet försvinner. Tolkades $& skulle it("a") finnas kvar och ändringen tillåtas.
  const oldStr = 'it("a", () => {});\n';
  const r = checkEdit("tests/a.test.ts", oldStr, '$&it("b", () => {});\n', { readFile });
  expectBlocked(r, "$& i new_string", "tas bort");
  // $' står före texten efter matchningen. Ordagrant börjar raden med $' och testet försvinner.
  // Tolkat skulle $' bli it("a") och ge två tester, så ändringen skulle tillåtas.
  const r2 = checkEdit("tests/a.test.ts", "const x = 1;\n", "$'", { readFile });
  expectBlocked(r2, "$' i new_string", "tas bort");
});

test("1c: old_string som bara är unik i den råa filen ersätts där, vid blandade radslut", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "tests"));
  const file = path.join(dir, "tests", "blandad.test.ts");
  // Första raden har CRLF, andra LF. "const a = 1;\n" finns bara en gång, före testet.
  fs.writeFileSync(file, 'const a = 1;\r\nconst a = 1;\ntest("x", () => {});\n');
  const [oldStr, newStr] = ["const a = 1;\n", "const a = 1;\n// "];
  expectBlocked(checkEdit(file, oldStr, newStr), "blandade radslut", "tas bort");
});

test("1c: old_string med CRLF mot en fil med LF jämförs med hela filen", () => {
  const readFile = () => 'const x = 1;\nit("a", () => {});\n';
  const r = checkEdit("tests/a.test.ts", "const x = 1;\r\n", "const x = 1;\r\n// ", { readFile });
  expectBlocked(r, "CRLF-utdrag mot LF-fil", "tas bort");
});

test("1c: tom old_string mot en befintlig fil prövar bara utdragen", () => {
  const readFile = () => 'it("a", () => {});\n';
  const added = 'it("c", () => {});\n';
  expectAllowed(checkEdit("tests/a.test.ts", "", added, { readFile }), "tom old_string, nytt test");
  const disable = JS_DISABLES[0][1];
  expectBlocked(
    checkEdit("tests/a.test.ts", "", disable, { readFile }),
    "tom, avstängning",
    "avstäng",
  );
});

test("1b: Edit läser filen med den funktion som skickas in", () => {
  const text = 'const x = 1;\nit("a", () => {});\n';
  const readFile = () => text;
  const r = checkEdit("tests/a.test.ts", "const x = 1;\n", "const x = 1;\n// ", { readFile });
  expectBlocked(r, "injicerad läsning", "tas bort");
});

test("1b: meddelandet säger att användaren kan göra ändringen själv", () => {
  const r = checkEdit(JS_FILE, JS_OLD, "");
  assert.ok(r.reason.includes("användaren"), r.reason);
});

// --- 4: Write mot en fil på disk ---

test("4: Write jämför med testfilen på disk", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const testsDir = path.join(dir, "tests");
  fs.mkdirSync(testsDir);
  const file = path.join(testsDir, "a.test.ts");
  const two = JS_OLD + 'it("b", () => {});\n';
  fs.writeFileSync(file, two);

  expectBlocked(checkWrite(file, JS_OLD), "Write med färre tester", "tas bort");
  expectBlocked(checkWrite(file, two + JS_DISABLES[0][1] + "\n"), "Write med .skip", "avstäng");
  expectAllowed(checkWrite(file, two + 'test("c", () => {});\n'), "Write med fler tester");
  expectAllowed(checkWrite(file, two.replace("toBe(1)", "toBe(2)")), "Write med ändrat värde");

  const created = path.join(testsDir, "ny.test.ts");
  expectAllowed(checkWrite(created, two), "Write av ny testfil");
  expectBlocked(checkWrite(created, JS_DISABLES[7][1]), "ny testfil med avstängning", "avstäng");
  assert.equal(fs.readFileSync(file, "utf8"), two, "checkWrite ska inte ändra filen");
  assert.equal(fs.existsSync(created), false, "checkWrite ska inte skapa filen");
});

// --- 5: tillåtna ändringar av tester ---

test("5: tillåtna ändringar av tester blockeras inte", () => {
  const skipped = dot("it", "skip") + '("a", () => {});\n';
  for (const [what, file, oldStr, newStr] of [
    ["nytt test", JS_FILE, JS_OLD, JS_OLD + 'test("b", () => {});\n'],
    ["ändrat värde", JS_FILE, "toBe(1)", "toBe(201)"],
    ["nytt testnamn", JS_FILE, 'test("a",', 'test("returnerar 200",'],
    ["borttagen .skip", JS_FILE, skipped, 'it("a", () => {});\n'],
    ["test.todo", JS_FILE, JS_OLD, JS_OLD + dot("test", "todo") + '("senare");\n'],
    ["ändring utan tester", "tests/helpers/db.ts", "const a = 1;", "const a = 2;"],
    ["nytt Python-test", PY_FILE, PY_OLD, PY_OLD + "\ndef test_b():\n    assert 2\n"],
    ["ändrad assert", PY_FILE, "assert 1 == 1", "assert 1 == 2"],
    ["riggens test, nytt test", ".claude/hooks/main-guard.test.js", JS_OLD, JS_OLD + JS_OLD],
  ]) {
    expectAllowed(checkEdit(file, oldStr, newStr), what);
  }
});

// --- 6: filer som inte är testfiler ---

test("6: andra filer än testfiler påverkas inte", () => {
  const line = JS_DISABLES[0][1];
  expectAllowed(checkEdit("src/app.ts", "", line), "src/app.ts med .skip");
  expectAllowed(checkEdit("docs/x.md", JS_OLD, ""), "docs/x.md utan test(");
  expectAllowed(checkEdit(".claude/hooks/test-guard.js", "", line), "test-guard.js");
  expectAllowed(checkWrite("src/app.ts", line), "Write av src/app.ts");
});
