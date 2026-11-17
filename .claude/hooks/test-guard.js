// Testskydd (docs/plans/04-testskydd.md, R07): agenten får ändra tester men inte ta bort eller
// stänga av dem (CLAUDE.md, docs/standard.md:35). En modul med rena funktioner som main-guard.js
// anropar för Edit och Write (steg 2). Den är ingen egen hook.
//
// Regler för en testfil (isTestFile), jämförda för hela filen före och efter ändringen:
//   - antalet avstängningar (Jest, node:test, pytest och unittest, se DISABLES) får inte öka
//   - antalet testdefinitioner (it(, test(, test.each och def test… i början av en rad, som
//     pytests standard python_functions = test*) får inte minska
// Allt annat tillåts: nya tester, ändrade påståenden, nya namn och borttagen avstängning.
//
// Begränsningar: mönster per text, ingen tolkning av koden. Fångas inte:
//   - blockkommentarer (/* … */), en tidig return i ett test och försvagade påståenden
//   - villkorliga avstängningar ({ skip: <uttryck> }). Beslut i Session 13: bara true eller en
//     sträng räknas. Avvägning: annars måste användaren själv lägga till nya plattformsvillkor
//     (som statusline.test.js:359), men nu kan agenten stänga av ett test med ett godtyckligt
//     uttryck, till exempel { skip: !false }. Granskaren ska därför titta på nya skip-villkor.
//   - importerade alias (@mark.skip, @skip) och collect_ignore i conftest.py
//   - test.concurrent.skip( och .only(, describe.todo( och ctx.skip() med ett annat namn än t
//   - test.concurrent och t.test( som testdefinitioner
//   - kataloger som heter test (singular)
// Falskt positiva (användaren gör då ändringen själv):
//   - ett avstängningsord som läggs till i en kommentar eller sträng
//   - nycklarna skip, only eller todo med true eller en sträng i vanliga objekt, till exempel
//     testdata eller parse(x, { only: true })
//   - ett test som flyttas till en annan fil, eller två tester som slås ihop
//   - alla filer under en överordnad katalog utanför projektet som heter tests
"use strict";
const fs = require("fs");

const TEST_DIRS = new Set(["tests", "__tests__"]);
const TEST_NAMES = [/\.(test|spec)\.[a-z0-9]+$/, /^test_.*\.py$/, /_test\.py$/, /^conftest\.py$/];

function isTestFile(file) {
  if (typeof file !== "string" || file === "") return false;
  const parts = file.replace(/\\/g, "/").toLowerCase().split("/").filter(Boolean);
  if (parts.some((p) => TEST_DIRS.has(p))) return true;
  const name = parts[parts.length - 1] || "";
  return TEST_NAMES.some((re) => re.test(name));
}
// Avstängningar i Jest och pytest. test.todo räknas inte, eftersom det inte stänger av ett test.
// Villkorliga avstängningar i node:test ({ skip: process.platform … }) räknas medvetet inte.
// Avvägningen står i kommentaren överst under "Begränsningar" (beslut i Session 13).
const DISABLES = [
  /\b(?:it|test|describe)\s*\.\s*(?:skip|only)\b/g, // it.skip, test.only, test.skip.each
  /(?<![\w.$])(?:xit|xtest|xdescribe|fit|fdescribe)\s*(?:\(|\.\s*each\b)/g, // xit(, fit.each
  /\b(?:skip|only|todo)\s*:\s*(?:true\b|["'`])/g, // node:test: { skip: true }, { only: true }
  /\bt\s*\.\s*(?:skip|todo)\s*\(/g, // node:test: t.skip()
  /\bpytest\s*\.\s*mark\s*\.\s*(?:skip|skipif|xfail)\b/g, // @pytest.mark.skip, pytestmark = …
  /\bpytest\s*\.\s*(?:skip|xfail|importorskip)\s*\(/g, // pytest.skip("…"), pytest.xfail("…")
  /\bunittest\s*\.\s*skip\w*/g, // @unittest.skip, skipIf, skipUnless
  /\bskipTest\s*\(/g, // self.skipTest("…")
  /\bSkipTest\b/g, // raise unittest.SkipTest
  /\bexpectedFailure\b/g, // @unittest.expectedFailure
];

// Testdefinitioner räknas bara i början av en rad, så att en bortkommenterad definition
// (// test( eller # def test_) räknas som borttagen.
const TEST_DEFS = [
  /^[ \t]*(?:it|test)(?:\.each)?\s*[(`]/gm,
  /^[ \t]*(?:async[ \t]+)?def[ \t]+test\w*[ \t]*\(/gm,
];

function count(patterns, text) {
  if (typeof text !== "string") return 0;
  return patterns.reduce((n, re) => n + (text.match(re) || []).length, 0);
}
const countDisables = (text) => count(DISABLES, text);
const countTests = (text) => count(TEST_DEFS, text);

function allow() {
  return { allow: true, reason: null };
}
function block(reason) {
  return {
    allow: false,
    reason:
      `testskydd: ${reason}. Agenten får ändra tester men inte ta bort eller stänga av dem ` +
      "(R07). Föreslå ändringen i stället, så kan användaren göra den själv om den behövs",
  };
}

const readUtf8 = (f) => fs.readFileSync(f, "utf8");

// Filen efter Edit, eller null om old_string saknas. Ersättaren är en funktion, så att $& och
// liknande i new_string inte tolkas.
function applyEdit(text, oldString, newString, replaceAll) {
  if (typeof oldString !== "string" || oldString === "" || !text.includes(oldString)) return null;
  const replacement = typeof newString === "string" ? newString : "";
  if (replaceAll) return text.split(oldString).join(replacement);
  return text.replace(oldString, () => replacement);
}

// Jämför texten före och efter i en testfil.
function compare(before, after) {
  if (countDisables(after) > countDisables(before))
    return block("ändringen lägger till en avstängning av tester (.skip, .only, xit, skip, xfail)");
  if (countTests(after) < countTests(before))
    return block("ändringen gör att ett test tas bort eller kommenteras bort");
  return allow();
}

// CRLF görs om till LF före jämförelsen, eftersom old_string kan ha LF fast filen har CRLF
// (tests/customers.test.ts och tests/orders.test.ts, granskningen av steg 1b, fynd M1).
// Radsluten påverkar inte räkningen, så jämförelsen blir densamma.
const toLf = (s) => (typeof s === "string" ? s.replace(/\r\n/g, "\n") : s);

// Edit jämförs med hela filen före och efter, eftersom ett utdrag kan påverka raden efter
// (granskningen av steg 1, fynd hög: "const x = 1;\n" → "const x = 1;\n// "). Om filen inte
// kan läsas eller old_string saknas jämförs utdragen.
function checkEdit(file, oldString, newString, { replaceAll = false, readFile = readUtf8 } = {}) {
  if (!isTestFile(file)) return allow();
  let raw = null;
  try {
    raw = readFile(file);
  } catch {
    raw = null;
  }
  if (typeof raw !== "string") return compare(oldString, newString);
  // Den råa filen prövas först, så att en old_string som bara är unik där ersätts på rätt
  // ställe vid blandade radslut (granskningen av steg 1c). Därefter med LF.
  const rawAfter = applyEdit(raw, oldString, newString, replaceAll);
  if (rawAfter !== null) return compare(raw, rawAfter);
  const current = toLf(raw);
  const after = applyEdit(current, toLf(oldString), toLf(newString), replaceAll);
  if (after === null) return compare(oldString, newString);
  return compare(current, after);
}
// Write ersätter hela filen, så det nya innehållet jämförs med filen på disk. Finns filen inte
// (en ny testfil) jämförs det med en tom fil, och då prövas i praktiken bara avstängningar.
function checkWrite(file, content, readFile = readUtf8) {
  if (!isTestFile(file)) return allow();
  let current = "";
  try {
    current = readFile(file);
  } catch {
    current = "";
  }
  return compare(current, content);
}

module.exports = { isTestFile, countDisables, countTests, checkEdit, checkWrite };
