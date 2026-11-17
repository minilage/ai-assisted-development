#!/usr/bin/env node
// PreToolUse-hook för huvudsessionen (och, eftersom den registreras i settings.json, också för
// subagenterna). Anropas utan argument:
//   node ".../.claude/hooks/main-guard.js"
// Läser hookens indata (JSON) från stdin. Exit 0 = tillåt, exit 2 = blockera med orsak på stderr.
//
// Det här är en spärrlista, inte en lista över vad som är tillåtet (docs/plans/03-hooks.md, steg 4).
// Den blockerar bara det som deny-reglerna i settings.json försöker stoppa men missar i andra former:
//   - läsning eller ändring av filer med hemligheter (.env, .env.*, *.pem, *.key; .env.example tillåts)
//   - rekursiv borttagning (rm -r, Remove-Item -Recurse, rmdir /s)
//   - force-push (--force, -f, --force-with-lease, +refspec)
//   - git reset --hard, git clean och git rebase, även med flaggor före underkommandot
//   - testskyddet (R07, docs/plans/04-testskydd.md): Edit och Write som stänger av eller tar bort
//     tester (regler i test-guard.js) och skalkommandon som tar bort eller flyttar testfiler
//     (rm, mv, Remove-Item, Move-Item, git rm, git mv med flera). Gäller också subagenterna.
// Allt annat lämnas till behörighetsreglerna, som tillåter, frågar eller nekar.
//
// Kommandon som parse inte kan dela upp ($(...), backticks, omdirigering) tillåts, men texten prövas
// ändå utan citattecken och substitutioner (beslut om öppen fråga 7, alternativ A). Ett
// commit-meddelande via $(...) som nämner ett spärrat mönster blockeras därför. Det är ett
// accepterat falskt positivt.
//
// Kända begränsningar i testskyddet för skalkommandon (granskningen av steg 2, låga fynd):
//   - överskrivning med cp, Copy-Item, Clear-Content, truncate och omdirigering (> fil) fångas inte
//   - flaggvärden med kolon prövas inte: Remove-Item -Path:tests\x.test.ts
//   - git checkout -- tests/…, git restore och git stash kan ta bort tester som inte är
//     committade. De blockeras inte här. I settings.json står alla tre under ask för Bash, men
//     för PowerShell bara git checkout.
//   - globmönster för testfiler känns inte igen: find . -name "*.test.*" -delete,
//     find . -name "test_*" -delete och rm src/*.test.* (granskningen av steg 2b, M1)
//   - xargs med platshållare: … | xargs -I{} rm {} (granskningen av steg 2b, M2)
//   - find tests -exec git rm {} +, npx rimraf, shred -u och trash
//   - pwsh -Command …, powershell -Command … och wsl rm … fångas inte (som bash -c och cmd /c)
//   - falskt positivt: ett commit-meddelande via $(cat <<'EOF' …) som nämner en testfil och ett
//     kommando som tar bort eller flyttar (rm, mv, move, del, git rm …), också direkt efter (,
//     blockeras. git commit -F <fil> fungerar. testPathBefore sätts över ; och && och inte bara
//     över pipes.
//   - falskt positivt (varianten med ; i checkText): efter $(, en backtick eller ( börjar ett nytt
//     delkommando. Flaggvärden som -name, --exclude och -Pattern som följer prövas då som
//     filnamn för hemliga filer, så find "$(pwd)" -name "*.key" blockeras (tilläts i HEAD).
//   - cd tests && rm x.test.js fångas (filnamnet), men cd tests && rm * inte
//   - (rm x) i en subshell, cmd /c del och ForEach-Object { Remove-Item $_ } fångas inte
//   - falskt positiva: ett delkommando som börjar med ett prefix räknar alla ord som kommandon,
//     så env X=1 grep rm tests och time grep -rn rm tests blockeras
//   - meddelandet säger "Spärren för huvudsessionen" också när en subagent stoppas
// Begränsningar: spärren bygger på mönster och är ingen sandlåda. Skript, bash -c "..." och
// variabler tolkas inte. Om hooken inte kan tolka indata blockeras anropet. Om node inte startar
// alls får Claude Code ett vanligt hookfel och anropet blockeras INTE.
"use strict";
const { parse, mentionsSecret } = require("./agent-guard.js");
const testGuard = require("./test-guard.js");

const SECRET = "filer med hemligheter (.env, *.pem, *.key)";
const REMOVE = "rekursiv borttagning (rm -r, Remove-Item -Recurse, rmdir /s)";
const FORCE_PUSH = "force-push (git push --force, -f, --force-with-lease eller +refspec)";

function allow() {
  return { allow: true, reason: null };
}
function block(reason) {
  return { allow: false, reason };
}

// Kommandonamn utan katalog, med gemener och utan .exe, som i agent-guard.js:307-310.
function commandName(word) {
  return word
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.exe$/, "");
}

// --- Hemliga filer ---

// Flaggor vars värde är ett sökmönster eller en uteslutning och inte en fil som läses, per kommando.
// Utan undantaget blockeras till exempel find . -not -path "*/node_modules/*" (fynd 7 i planen).
// grep --include och rg -g/--glob/--iglob väljer filer som läses och prövas därför som filnamn
// (granskningen 2026-11-16). En rg-glob som börjar med ! utesluter och matchar ingen hemlig fil.
// Flaggorna jämförs med gemener, eftersom parametrar i PowerShell inte skiljer på skiftläge.
const PATTERN_FLAGS = {
  find: ["-path", "-ipath", "-name", "-iname", "-wholename", "-iwholename", "-regex", "-iregex"],
  grep: ["--exclude", "--exclude-dir"],
  "select-string": ["-pattern"],
  sls: ["-pattern"],
};
// Flaggor vars värde prövas som filnamn, utom när det börjar med ! (en uteslutning).
const NEGATABLE_FLAGS = { rg: ["-g", "--glob", "--iglob"] };

// HEAD:.env och liknande prövas del för del.
function wordMentionsSecret(word) {
  return word.split(":").some(mentionsSecret);
}

function segmentMentionsSecret(seg) {
  const cmd = commandName(seg[0]);
  const skip = PATTERN_FLAGS[cmd] || [];
  const negatable = NEGATABLE_FLAGS[cmd] || [];
  for (let i = 0; i < seg.length; i++) {
    const w = seg[i];
    if (!w.startsWith("-")) {
      if (wordMentionsSecret(w)) return true;
      continue;
    }
    const eq = w.indexOf("=");
    const flag = eq < 0 ? w : w.slice(0, eq);
    if (skip.includes(flag.toLowerCase())) {
      if (eq < 0) i++; // värdet är nästa ord
      continue;
    }
    if (negatable.includes(flag)) {
      const value = eq < 0 ? seg[i + 1] : w.slice(eq + 1);
      if (eq < 0) i++;
      if (typeof value === "string" && !value.startsWith("!") && wordMentionsSecret(value))
        return true;
      continue;
    }
    // --env-file=.env och liknande: värdet prövas.
    if (eq >= 0 && wordMentionsSecret(w.slice(eq + 1))) return true;
  }
  return false;
}

// --- git ---

// Kopierad från gitSubcommand i agent-guard.js:290-301 (beslut om öppen fråga 9, alternativ A).
// Skillnad: returnerar också index för underkommandot. Ändras originalet ska den här ändras också.
function gitSubcommand(seg) {
  for (let i = 1; i < seg.length; i++) {
    const a = seg[i];
    if (a === "-C" || a === "-c" || a === "--git-dir" || a === "--work-tree") {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    return { sub: a, args: seg.slice(i + 1), index: i };
  }
  return { sub: null, args: [], index: seg.length };
}

function isForcePushArg(a) {
  if (a === "-f" || a.startsWith("--force")) return true; // --force-with-lease, --force-if-includes
  if (/^-[a-zA-Z]+$/.test(a) && a.includes("f")) return true; // -fu, -uf
  return a.length > 1 && a.startsWith("+"); // +main, +main:main
}

function gitViolation(sub, args) {
  if (sub === "push" && args.some(isForcePushArg)) return FORCE_PUSH;
  if (sub === "reset" && args.includes("--hard")) return "git reset --hard";
  if (sub === "clean") return "git clean";
  if (sub === "rebase") return "git rebase";
  return null;
}

// --- Borttagning ---

const REMOVE_COMMANDS = ["rm", "remove-item", "ri", "del", "erase", "rd", "rmdir"];
const PS_RECURSE = /^-(r|re|rec|recu|recur|recurs|recurse)(:.*)?$/i;

function isRecursiveArg(a) {
  if (a === "--recursive" || PS_RECURSE.test(a)) return true;
  if (/^-[dfiIrRv]+$/.test(a) && /[rR]/.test(a)) return true; // -rf, -fr, -Rf
  return a.toLowerCase() === "/s"; // rmdir /s, rd /s, del /s
}

// --- Testskydd (R07, docs/plans/04-testskydd.md, steg 2) ---

// Kommandon som tar bort eller flyttar filer. Ett argument som är en testfil eller en katalog som
// heter tests blockeras. Det gäller bara på en kommandoposition, så att grep -rn rm tests inte
// blockeras: första ordet, eller vilket ord som helst när delkommandot börjar med ett prefix
// (sudo -u root, timeout 5, xargs), ett nyckelord (if, then, do, !, {) eller en tilldelning
// (FOO=1). Steg 2b: find -delete/-exec och … | xargs rm eller … | Remove-Item, där testfilerna
// väljs av find eller av ett tidigare delkommando.
const FILE_REMOVE_MOVE = [
  ...REMOVE_COMMANDS,
  "unlink",
  "mv",
  "move",
  "move-item",
  "mi",
  "ren",
  "rename-item",
  "rni",
];
const COMMAND_PREFIXES = [
  "sudo",
  "doas",
  "env",
  "xargs",
  "nohup",
  "command",
  "time",
  "exec",
  "nice",
  "timeout",
  "stdbuf",
];
const SHELL_KEYWORDS = ["if", "then", "else", "elif", "do", "while", "until", "!", "{"];
const FIND_RUNS = /^-(exec|execdir|ok|okdir)$/;
const TEST_FILES =
  "testskydd: borttagning eller flytt av testfiler. Agenten får ändra tester men inte ta bort " +
  "eller stänga av dem (R07). Föreslå ändringen i stället, så kan användaren göra den själv om " +
  "den behövs";

function startsWithPrefix(seg) {
  const w = seg[0];
  return COMMAND_PREFIXES.includes(commandName(w)) || SHELL_KEYWORDS.includes(w) || /^\w+=/.test(w);
}
function atCommandPosition(seg, i) {
  return i === 0 || startsWithPrefix(seg);
}
const isTestPathArg = (a) => !a.startsWith("-") && testGuard.isTestFile(a);
const onlyFlags = (args) => args.every((a) => a.startsWith("-"));

// find med -delete, eller -exec och liknande följt av ett kommando som tar bort eller flyttar.
function findRemoves(args) {
  return args.some(
    (a, k) =>
      a === "-delete" ||
      (FIND_RUNS.test(a) && FILE_REMOVE_MOVE.includes(commandName(args[k + 1] || ""))),
  );
}

// Testskyddet för ett ord som är ett kommando. testPathBefore: ett tidigare delkommando i samma
// kommando nämner en testfil, och ett kommando utan sökväg kan då få filerna via en pipe.
function testViolation(seg, i, cmd, testPathBefore) {
  if (!atCommandPosition(seg, i)) return null;
  const args = seg.slice(i + 1);
  if (cmd === "find") return findRemoves(args) && args.some(isTestPathArg) ? TEST_FILES : null;
  if (!FILE_REMOVE_MOVE.includes(cmd)) return null;
  if (args.some(isTestPathArg) || (testPathBefore && onlyFlags(args))) return TEST_FILES;
  return null;
}

// --- Kommandon ---

// Varje ord i delkommandot prövas som början på ett kommando, så att sudo rm -rf x och
// x=$(git push -f) också fångas. Underkommandot till git hoppas över, så att git rm -r inte
// bedöms som rm -r.
function segmentViolation(seg, testPathBefore = false) {
  if (segmentMentionsSecret(seg)) return SECRET;
  for (let i = 0; i < seg.length; i++) {
    const cmd = commandName(seg[i]);
    if (cmd === "git") {
      const rest = seg.slice(i);
      const { sub, args, index } = gitSubcommand(rest);
      const v = gitViolation(sub, args);
      if (v) return v;
      const removes = sub === "rm" || sub === "mv";
      const hitsTests = args.some(isTestPathArg) || (testPathBefore && onlyFlags(args));
      if (removes && atCommandPosition(seg, i) && hitsTests) return TEST_FILES;
      i += index;
    } else if (REMOVE_COMMANDS.includes(cmd) && seg.slice(i + 1).some(isRecursiveArg)) {
      return REMOVE;
    } else {
      const t = testViolation(seg, i, cmd, testPathBefore);
      if (t) return t;
    }
  }
  return null;
}

// Texten utan citattecken, substitutioner och omdirigeringar, så att det som står inuti prövas.
// Två varianter som båda prövas (granskningen av steg 2b, H1 och H2):
//   - med mellanslag behålls sammanhanget: git push origin "$(…)" --force, rm $(ls tests)
//   - med ; får ett kommando i en substitution en egen kommandoposition: echo $(rm tests/x)
function loosenSpaces(cmd) {
  return cmd.replace(/\$\(|[`()<>"']/g, " ");
}
function loosenSplit(cmd) {
  return cmd.replace(/\$\(|[`(]/g, " ; ").replace(/[)<>"']/g, " ");
}

// Windows-sökvägar med enhetsbokstav, till exempel C:\proj\.env.
const DRIVE_PATH = /[A-Za-z]:\\[^\s"'`;|&<>()]*/g;

// I PowerShell är \ en katalogavgränsare och inget escape-tecken, så den prövas som /.
// I Bash är \ ett escape-tecken, och i ett sökmönster som "process\.env" är det ingen katalog
// (granskningen 2026-11-16). parse tolkar dock \ som escape även inom dubbla citattecken, där Bash
// behåller den, så cat "C:\proj\.env" skulle missas. Därför prövas Bash-kommandot både som det är
// och med / bara i sökvägar med enhetsbokstav.
function checkCommand(command, powershell) {
  if (powershell) return checkText(command.replace(/\\/g, "/"));
  const drives = command.replace(DRIVE_PATH, (m) => m.replace(/\\/g, "/"));
  const first = checkText(drives);
  if (!first.allow || drives === command) return first;
  return checkText(command);
}

function checkSegments(segments) {
  let testPathBefore = false;
  for (const seg of segments) {
    const v = segmentViolation(seg, testPathBefore);
    if (v) return block(v);
    if (seg.slice(1).some(isTestPathArg)) testPathBefore = true;
  }
  return allow();
}

// Om parse inte kan dela upp texten prövas båda varianterna, och anropet blockeras om någon av
// dem blockerar. En variant som fortfarande inte kan delas upp ("tomt kommando") hoppas över.
function checkText(text) {
  const parsed = parse(text);
  if (!parsed.unsafe) return checkSegments(parsed.segments);
  for (const loose of [loosenSpaces(text), loosenSplit(text)]) {
    const p = parse(loose);
    if (p.unsafe) continue;
    const r = checkSegments(p.segments);
    if (!r.allow) return r;
  }
  return allow();
}

function checkFile(file) {
  if (typeof file !== "string" || file === "") return block("sökväg saknas");
  return mentionsSecret(file) ? block(SECRET) : allow();
}

// --- Beslut ---

function decide(input) {
  if (!input || typeof input !== "object" || typeof input.tool_name !== "string")
    return block("indata saknar tool_name");
  const ti = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  switch (input.tool_name) {
    case "Bash":
    case "PowerShell":
      if (typeof ti.command !== "string") return block("kommando saknas");
      return checkCommand(ti.command, input.tool_name === "PowerShell");
    case "Write": {
      const secret = checkFile(ti.file_path);
      return secret.allow ? testGuard.checkWrite(ti.file_path, ti.content) : secret;
    }
    case "Edit": {
      const secret = checkFile(ti.file_path);
      if (!secret.allow) return secret;
      return testGuard.checkEdit(ti.file_path, ti.old_string, ti.new_string, {
        replaceAll: ti.replace_all === true,
      });
    }
    case "NotebookEdit":
      return checkFile(ti.notebook_path);
    case "Read":
      return mentionsSecret(ti.file_path) ? block(SECRET) : allow();
    case "Glob":
    case "Grep":
      return [ti.path, input.tool_name === "Glob" ? ti.pattern : null, ti.glob].some(mentionsSecret)
        ? block(SECRET)
        : allow();
    default:
      return allow();
  }
}

module.exports = { decide };

if (require.main === module) {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => (data += d));
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(data);
    } catch {
      process.stderr.write("main-guard: blockerat: hookens indata kunde inte tolkas\n");
      process.exit(2);
    }
    let result;
    try {
      result = decide(input);
    } catch (err) {
      result = block(`internt fel i main-guard: ${err.message}`);
    }
    if (result.allow) process.exit(0);
    process.stderr.write(
      `main-guard: blockerat: ${result.reason}. Spärren för huvudsessionen ` +
        "(.claude/hooks/main-guard.js) stoppade anropet. Redovisa i stället för att försöka på annat sätt.\n",
    );
    process.exit(2);
  });
}
