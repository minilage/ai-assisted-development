// Kodkontroller som hooks (steg 3 i docs/plans/03-hooks.md).
//
//   node check-code.js post   PostToolUse (Edit|Write): prettier --check på .ts och .js,
//                             eslint på .ts. Exit 2 vid fel, så att Claude får meddelandet.
//   node check-code.js stop   Stop: tsc --noEmit om git visar ändringar i src/ eller tests/.
//                             Exit 2 vid typfel. Gör ingenting om stop_hook_active är satt.
//
// Hooken rapporterar bara. Den ändrar aldrig filer: inga --write eller --fix.
// Verktygen körs med node och spawnSync, utan shell och utan npx, och med projektkatalogen
// som arbetskatalog (ESLint hoppar annars över filer utanför sin baskatalog med exit 0).
// Fel i själva hooken (ogiltig indata, timeout, verktyg som inte startar) ger exit 1, som inte
// blockerar.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MAX_LINES = 20;
const TIMEOUT_MS = 25000;
const STOP_TIMEOUT_MS = 110000;
const TOOL_ROOT = path.resolve(__dirname, "..", "..");

const PRETTIER_EXT = new Set([".ts", ".js"]);
const ESLINT_EXT = new Set([".ts"]);

const REPORT_ONLY =
  "Redovisa felet för användaren. Rätta inte filen, och rätta inte andra problem, utan godkännande.";

function bin(toolRoot, ...parts) {
  return path.join(toolRoot, "node_modules", ...parts);
}

function buildCommands(file, { toolRoot = TOOL_ROOT } = {}) {
  const ext = path.extname(file);
  const cmds = [];
  if (PRETTIER_EXT.has(ext)) {
    cmds.push({
      name: "prettier",
      cmd: process.execPath,
      args: [bin(toolRoot, "prettier", "bin", "prettier.cjs"), "--check", file],
    });
  }
  if (ESLINT_EXT.has(ext)) {
    cmds.push({
      name: "eslint",
      cmd: process.execPath,
      args: [
        bin(toolRoot, "eslint", "bin", "eslint.js"),
        "--config",
        path.join(toolRoot, "eslint.config.js"),
        file,
      ],
    });
  }
  return cmds;
}

function buildStopCommands({ toolRoot = TOOL_ROOT } = {}) {
  return {
    git: { cmd: "git", args: ["status", "--porcelain", "--", "src", "tests"] },
    tsc: { cmd: process.execPath, args: [bin(toolRoot, "typescript", "bin", "tsc"), "--noEmit"] },
  };
}

function defaultRun(cmd, args, { cwd, timeoutMs }) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: timeoutMs, windowsHide: true });
}

function limit(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length <= MAX_LINES) return lines.join("\n");
  return [
    ...lines.slice(0, MAX_LINES),
    `[… förkortad, ${lines.length - MAX_LINES} fler rader]`,
  ].join("\n");
}

function parse(raw) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function failedToRun(result) {
  if (result.error) return result.error.code === "ETIMEDOUT" ? "timeout" : result.error.message;
  if (result.status === null) return "avbröts";
  return null;
}

function insideProject(file, projectDir) {
  const rel = path.relative(path.resolve(projectDir), file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function runPost(raw, { projectDir, toolRoot = TOOL_ROOT, run = defaultRun } = {}) {
  const input = parse(raw);
  if (!input) return { code: 1, stderr: "check-code: ogiltig indata från hooken (inte JSON)." };
  const given = input.tool_input && input.tool_input.file_path;
  if (typeof given !== "string" || given === "") return { code: 0, stderr: "" };

  const file = path.resolve(projectDir, given);
  if (!insideProject(file, projectDir) || !fs.existsSync(file)) return { code: 0, stderr: "" };

  const cmds = buildCommands(file, { toolRoot });
  const rel = path.relative(projectDir, file);
  const problems = [];
  for (const c of cmds) {
    const result = run(c.cmd, c.args, { cwd: projectDir, timeoutMs: TIMEOUT_MS });
    const broken = failedToRun(result);
    if (broken)
      return { code: 1, stderr: `check-code: ${c.name} kunde inte köras för ${rel} (${broken}).` };
    if (result.status !== 0)
      problems.push({ name: c.name, out: `${result.stdout || ""}\n${result.stderr || ""}` });
  }
  if (problems.length === 0) return { code: 0, stderr: "" };

  const parts = [`check-code: ${rel} underkändes.`];
  for (const p of problems) {
    if (p.name === "prettier") {
      parts.push(
        "prettier --check underkände filen. Den kan ha varit oformaterad redan före ändringen.",
      );
    } else {
      parts.push("eslint rapporterade:", limit(p.out));
    }
  }
  parts.push(REPORT_ONLY);
  return { code: 2, stderr: parts.join("\n") };
}

function runStop(raw, { projectDir, toolRoot = TOOL_ROOT, run = defaultRun } = {}) {
  const input = parse(raw);
  if (!input) return { code: 1, stderr: "check-code: ogiltig indata från hooken (inte JSON)." };
  if (input.stop_hook_active === true) return { code: 0, stderr: "" };

  const { git, tsc } = buildStopCommands({ toolRoot });
  const status = run(git.cmd, git.args, { cwd: projectDir, timeoutMs: TIMEOUT_MS });
  if (failedToRun(status) || status.status !== 0) {
    return {
      code: 1,
      stderr: "check-code: git status kunde inte köras, typkontrollen hoppades över.",
    };
  }
  if (String(status.stdout || "").trim() === "") return { code: 0, stderr: "" };

  const result = run(tsc.cmd, tsc.args, { cwd: projectDir, timeoutMs: STOP_TIMEOUT_MS });
  const broken = failedToRun(result);
  if (broken) return { code: 1, stderr: `check-code: tsc kunde inte köras (${broken}).` };
  if (result.status === 0) return { code: 0, stderr: "" };

  const parts = [
    "check-code: typkontrollen (tsc --noEmit, som npm run typecheck) underkändes efter ändringar i src/ eller tests/:",
    limit(`${result.stdout || ""}\n${result.stderr || ""}`),
    REPORT_ONLY,
  ];
  return { code: 2, stderr: parts.join("\n") };
}

function main() {
  const mode = process.argv[2];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    raw = "";
  }
  let result;
  if (mode === "post") result = runPost(raw, { projectDir });
  else if (mode === "stop") result = runStop(raw, { projectDir });
  else result = { code: 1, stderr: `check-code: okänt läge "${mode}", använd post eller stop.` };
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.code;
}

module.exports = { buildCommands, buildStopCommands, runPost, runStop, MAX_LINES };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`check-code: oväntat fel (${e && e.message}).\n`);
    process.exitCode = 1;
  }
}
