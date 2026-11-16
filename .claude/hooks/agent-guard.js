#!/usr/bin/env node
// PreToolUse-hook för projektets subagenter. Anropas från agentens frontmatter:
//   node ".../.claude/hooks/agent-guard.js" <läge>
// Läser hookens indata (JSON) från stdin. Exit 0 = tillåt, exit 2 = blockera med orsak på stderr.
//
// Lägen:
//   read         granskare:   Bash får bara läsa. Inga Write/Edit.
//   checks       verifierare: som read, plus projektets kontroller. Inget som rättar eller formaterar.
//   plans-write  planerare:   som read, plus Write/Edit av docs/plans/NN-namn.md.
//   dev          utvecklare:  spärrar git som ändrar historik, installationer, borttagning,
//                             databas, nätverk, indirekt körning och ändringar av riggens spärrar.
//
// Begränsningar (se sessions/session-08-2026-11-15.md): spärren bygger på mönster och stoppar
// misstag, men är ingen sandlåda. Om hooken inte kan tolka indata blockeras anropet. Om node
// inte startar alls får Claude Code ett vanligt hookfel och anropet blockeras INTE.
"use strict";
const path = require("path");

const MODES = ["read", "checks", "plans-write", "dev"];

// --- Tolkning av kommandon ---

// Delar upp ett kommando i delkommandon (vid ; && || | & och ny rad) med ord, med hänsyn
// till citattecken. Returnerar { segments } eller { unsafe: orsak }.
function parse(cmd) {
  const segments = [];
  let cur = [];
  let tok = "";
  let has = false;
  let quote = null;
  const push = () => {
    if (has) cur.push(tok);
    tok = "";
    has = false;
  };
  const end = () => {
    push();
    if (cur.length) segments.push(cur);
    cur = [];
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const next = cmd[i + 1];
    if (quote === "'") {
      if (c === "'") quote = null;
      else tok += c;
      continue;
    }
    if (c === "`" || (c === "$" && next === "("))
      return { unsafe: "kommandosubstitution ($(...) eller backticks)" };
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < cmd.length) tok += cmd[++i];
      else tok += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
      continue;
    }
    if (c === "\\" && i + 1 < cmd.length) {
      tok += cmd[++i];
      has = true;
      continue;
    }
    if ((c === "<" || c === ">") && next === "(") return { unsafe: "processsubstitution" };
    if (c === " " || c === "\t") {
      push();
      continue;
    }
    if (c === ";" || c === "\n" || c === "\r" || c === "|" || c === "&") {
      // 2>&1 och liknande hanteras vid '>' nedan, så här är & alltid en avgränsare.
      end();
      if ((c === "|" || c === "&") && next === c) i++;
      continue;
    }
    if (c === ">") {
      // Tillåtet: >/dev/null, 2>/dev/null, 2>&1, 1>&2. Allt annat skriver till en fil.
      const m = /^>>?[ \t]*(&[0-2]|\/dev\/null)(?=$|[\s;&|])/.exec(cmd.slice(i));
      if (!m) return { unsafe: "omdirigering till fil (>)" };
      if (/^[0-2]$/.test(tok)) {
        tok = "";
        has = false;
      } else push();
      i += m[0].length - 1;
      continue;
    }
    if (c === "<") return { unsafe: "omdirigering av indata (<)" };
    tok += c;
    has = true;
  }
  if (quote) return { unsafe: "citattecken som inte stängs" };
  end();
  if (segments.length === 0) return { unsafe: "tomt kommando" };
  return { segments };
}

// --- Hemliga filer ---

const SECRET_SAMPLES = [".env", ".env.local", "server.key", "cert.pem"];

function isSecretName(name) {
  if (/^\.env(\..+)?$/i.test(name)) return !/^\.env\.example$/i.test(name);
  return /\.(pem|key)$/i.test(name);
}

function globToRegex(g) {
  let re = "";
  for (const ch of g) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

// Sant om ordet är, eller som glob kan matcha, en fil med hemligheter.
function mentionsSecret(word) {
  if (typeof word !== "string" || word === "") return false;
  const parts = word.split(/[\\/]/);
  for (const part of parts) if (isSecretName(part)) return true;
  // Glob prövas bara mot filnamnet (sista delen). Katalogdelar som ** matchar inga filer.
  const part = parts[parts.length - 1];
  if (!/[*?[]/.test(part)) return false;
  // [...] räknas som ett valfritt tecken, vilket matchar minst lika mycket som i Bash.
  // I Bash matchar * och ? inte en inledande punkt.
  const re = globToRegex(part.replace(/\[[^\]]*\]/g, "?"));
  return SECRET_SAMPLES.some((s) => (part.startsWith(".") || !s.startsWith(".")) && re.test(s));
}

// --- Läsande kommandon och kontroller ---

const rule = (cmd, opts = {}) => ({ cmd, ...opts });
const NO_OUTPUT = [/^--output/];

const READ_RULES = [
  rule(["cd"]),
  rule(["pwd"]),
  rule(["git", "status"]),
  rule(["git", "diff"], { forbid: [...NO_OUTPUT, /^--ext-diff$/] }),
  rule(["git", "log"], { forbid: NO_OUTPUT }),
  rule(["git", "show"], { forbid: [...NO_OUTPUT, /^--ext-diff$/] }),
  rule(["git", "blame"]),
  rule(["git", "rev-parse"]),
  rule(["git", "ls-files"]),
  rule(["git", "branch"], {
    only: [/^--show-current$/, /^-a$/, /^--all$/, /^-r$/, /^--list$/, /^-v+$/],
  }),
  rule(["grep"]),
  rule(["cat"]),
  rule(["head"]),
  rule(["tail"]),
  rule(["ls"]),
  rule(["wc"]),
  rule(["find"], { forbid: [/^-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)$/] }),
  // Bara utskrift av rader, till exempel sed -n '10,20p' fil.
  rule(["sed", "-n"], {
    check: (a) =>
      a.length >= 1 && /^\d+(,\d+)?p$/.test(a[0]) && a.slice(1).every((x) => !x.startsWith("-")),
  }),
  rule(["md5sum"]),
  rule(["sha256sum"]),
  rule(["sort"], { forbid: [/^-o/, ...NO_OUTPUT] }),
  rule(["cut"]),
  rule(["diff"]),
  rule(["echo"]),
];

const CHECK_RULES = [
  rule(["npm", "run", "lint"], { forbid: [/^--fix/] }),
  rule(["npm", "run", "typecheck"]),
  rule(["npm", "run", "format:check"], { forbid: [/^--write/] }),
  rule(["npm", "test"], { forbid: [/^-u$/, /^--updateSnapshot/] }),
  rule(["npx", "jest"], { forbid: [/^-u$/, /^--updateSnapshot/] }),
  rule(["npm", "run", "test:legacy"]),
  rule(["python", "-m", "pytest"]),
  rule(["pytest"]),
  rule(["node", "--test"], { forbid: [/^-(e|p|r)$/, /^--(eval|print|require|import)/] }),
];

function normalize(seg) {
  // git --no-pager <kommando> ska bedömas som git <kommando>.
  if (seg[0] === "git" && seg[1] === "--no-pager") return ["git", ...seg.slice(2)];
  return seg;
}

// Returnerar null om kommandot är tillåtet, annars orsaken. Orsaken säger om kommandot saknas i
// listan eller om det är ett argument som inte är tillåtet, så att den som blockeras inte tror att
// hela kommandot är spärrat.
function ruleViolation(seg, rules) {
  for (const r of rules) {
    if (r.cmd.length > seg.length || !r.cmd.every((w, i) => seg[i] === w)) continue;
    const name = r.cmd.join(" ");
    const args = seg.slice(r.cmd.length);
    const notOnly = r.only ? args.find((a) => !r.only.some((re) => re.test(a))) : undefined;
    if (notOnly !== undefined) return `argumentet "${notOnly}" är inte tillåtet för "${name}"`;
    const forbidden = r.forbid && args.find((a) => r.forbid.some((re) => re.test(a)));
    if (forbidden)
      return `argumentet "${forbidden}" är inte tillåtet för "${name}" ("${name}" i sig är tillåtet)`;
    if (r.check && !r.check(args))
      return `argumenten för "${name}" är inte tillåtna i det här läget`;
    return null;
  }
  return `kommandot finns inte bland de tillåtna i det här läget: ${seg.slice(0, 3).join(" ")}`;
}

function checkAllowlist(command, rules) {
  const parsed = parse(command);
  if (parsed.unsafe) return block(parsed.unsafe);
  for (const raw of parsed.segments) {
    const seg = normalize(raw);
    if (seg.some(mentionsSecret)) return block("filer med hemligheter (.env, *.pem, *.key)");
    const violation = ruleViolation(seg, rules);
    if (violation) return block(violation);
  }
  return allow();
}

// --- dev: spärrlista ---

const GIT_BLOCKED = new Set([
  "add",
  "commit",
  "push",
  "pull",
  "reset",
  "rebase",
  "stash",
  "checkout",
  "switch",
  "restore",
  "merge",
  "tag",
  "clean",
  "rm",
  "mv",
  "cherry-pick",
  "revert",
  "am",
  "config",
  "update-ref",
  "filter-branch",
  "reflog",
  "gc",
  "prune",
  "worktree",
  "submodule",
  "remote",
  "init",
]);
const SHELLS = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "pwsh",
  "powershell",
  "cmd",
  "eval",
  "exec",
  "source",
  ".",
  "xargs",
  "env",
  "sudo",
]);
const REMOVE = new Set(["rm", "rmdir", "unlink", "shred", "del", "mv", "remove-item", "move-item"]);
const NETWORK = new Set(["curl", "wget", "invoke-webrequest", "invoke-restmethod", "ssh", "scp"]);
const DATABASE = new Set(["docker", "docker-compose", "psql", "pg_dump", "dropdb", "createdb"]);
const INSTALLERS = new Set(["pip", "pip3", "yarn", "pnpm", "uv", "poetry", "conda"]);
const NPM_BLOCKED = new Set([
  "install",
  "i",
  "ci",
  "uninstall",
  "un",
  "remove",
  "rm",
  "update",
  "up",
  "add",
  "link",
  "publish",
  "exec",
  "x",
]);
const NPX_ALLOWED = new Set(["jest", "tsc"]);

function gitSubcommand(seg) {
  for (let i = 1; i < seg.length; i++) {
    const a = seg[i];
    if (a === "-C" || a === "-c" || a === "--git-dir" || a === "--work-tree") {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    return { sub: a, args: seg.slice(i + 1) };
  }
  return { sub: null, args: [] };
}

function devSegment(seg) {
  let s = seg;
  while (s.length && /^\w+=/.test(s[0])) s = s.slice(1); // FOO=bar kommando
  if (!s.length) return null;
  const cmd = path
    .basename(s[0])
    .toLowerCase()
    .replace(/\.exe$/, "");
  const args = s.slice(1);
  if (s.some(mentionsSecret)) return "filer med hemligheter (.env, *.pem, *.key)";
  if (SHELLS.has(cmd)) return `indirekt körning (${cmd})`;
  if (REMOVE.has(cmd)) return `borttagning eller flytt av filer (${cmd}) kräver godkännande`;
  if (NETWORK.has(cmd)) return `nätverksanrop (${cmd})`;
  if (DATABASE.has(cmd)) return `databas eller Docker (${cmd}) kräver godkännande`;
  if (INSTALLERS.has(cmd)) return `installation av beroenden (${cmd}) kräver godkännande`;
  if (
    (cmd === "node" && args.some((a) => /^(-e|-p|--eval|--print)$/.test(a))) ||
    (/^(python3?|py)$/.test(cmd) && args.includes("-c"))
  )
    return "kod på kommandoraden (-e/-c)";
  if (/^(python3?|py)$/.test(cmd) && args[0] === "-m" && args[1] === "pip")
    return "installation av beroenden (pip) kräver godkännande";
  if (cmd === "find" && args.some((a) => /^-(exec|execdir|ok|okdir|delete)$/.test(a)))
    return "find med -exec eller -delete";
  if (cmd === "sed" && args.some((a) => /^-i/.test(a) || a === "--in-place"))
    return "sed -i (ändra filer med Edit i stället)";
  if (cmd === "git") {
    const { sub, args: gargs } = gitSubcommand(s);
    if (sub && GIT_BLOCKED.has(sub))
      return `git ${sub} kräver godkännande och görs inte av utvecklaren`;
    if (sub === "branch" && gargs.some((a) => /^(-d|-D|-m|-M|--delete|--move|-f|--force)$/.test(a)))
      return "git branch som ändrar grenar";
  }
  if (cmd === "npm") {
    if (NPM_BLOCKED.has(args[0])) return `npm ${args[0]} kräver godkännande`;
    if (args[0] === "run" && (args[1] === "format" || /^db:/.test(args[1] || "")))
      return `npm run ${args[1]} kräver godkännande`;
  }
  if (cmd === "npx" && !NPX_ALLOWED.has(args[0]))
    return `npx ${args[0] || ""} är inte tillåtet (bara jest och tsc)`.trim();
  return null;
}

function checkDev(command) {
  const parsed = parse(command);
  if (parsed.unsafe) return block(parsed.unsafe);
  for (const seg of parsed.segments) {
    const reason = devSegment(seg);
    if (reason) return block(reason);
  }
  return allow();
}

// --- Sökvägar ---

function toNative(p) {
  // Git Bash-form /c/dir på Windows blir C:/dir.
  if (process.platform === "win32") {
    const m = /^\/([a-zA-Z])(\/|$)(.*)$/.exec(p);
    if (m) return `${m[1].toUpperCase()}:/${m[3]}`;
  }
  return p;
}

// Returnerar sökvägen relativt projektet med / som avgränsare, eller null om den ligger utanför.
function relativeToProject(file, projectDir) {
  const abs = path.resolve(projectDir, toNative(file));
  let rel = path.relative(path.resolve(projectDir), abs);
  if (process.platform === "win32" && /^[a-zA-Z]:/.test(rel)) return null; // annan enhet
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  rel = rel.split(path.sep).join("/");
  return process.platform === "win32" ? rel.toLowerCase() : rel;
}

const RIG_PROTECTED = [
  /^\.claude\/agents\//,
  /^\.claude\/hooks\//,
  /^\.claude\/settings(\.local)?\.json$/,
];

function checkWrite(mode, file, projectDir) {
  if (typeof file !== "string" || file === "") return block("sökväg saknas");
  if (mentionsSecret(file)) return block("filer med hemligheter (.env, *.pem, *.key)");
  if (mode === "read" || mode === "checks") return block("det här läget får inte skriva filer");
  const rel = relativeToProject(file, projectDir);
  if (mode === "plans-write") {
    // Jämför med originalets skiftläge för filnamnet, så att versaler upptäcks även på Windows.
    const name = path.basename(toNative(file));
    if (rel && /^docs\/plans\/[^/]+$/.test(rel) && /^\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(name))
      return allow();
    return block("planeraren får bara skriva docs/plans/NN-kort-namn.md");
  }
  // dev
  if (rel === null) return block("filen ligger utanför projektet");
  if (RIG_PROTECTED.some((re) => re.test(rel)))
    return block("utvecklaren får inte ändra agenterna, hookskripten eller inställningarna");
  return allow();
}

// --- Beslut ---

function allow() {
  return { allow: true, reason: null };
}
function block(reason) {
  return { allow: false, reason };
}

function decide(mode, input, projectDir) {
  if (!MODES.includes(mode)) return block(`okänt läge: ${mode}`);
  if (!input || typeof input !== "object" || typeof input.tool_name !== "string")
    return block("indata saknar tool_name");
  const ti = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  switch (input.tool_name) {
    case "Bash": {
      if (typeof ti.command !== "string") return block("kommando saknas");
      if (mode === "dev") return checkDev(ti.command);
      return checkAllowlist(
        ti.command,
        mode === "checks" ? [...READ_RULES, ...CHECK_RULES] : READ_RULES,
      );
    }
    case "Write":
    case "Edit":
      return checkWrite(mode, ti.file_path, projectDir);
    case "NotebookEdit":
      if (mode === "dev") return checkWrite(mode, ti.notebook_path, projectDir);
      return block("det här läget får inte ändra notebooks");
    case "Read":
      return mentionsSecret(ti.file_path)
        ? block("filer med hemligheter (.env, *.pem, *.key)")
        : allow();
    case "Glob":
    case "Grep":
      return [ti.path, ti.pattern && input.tool_name === "Glob" ? ti.pattern : null, ti.glob].some(
        mentionsSecret,
      )
        ? block("filer med hemligheter (.env, *.pem, *.key)")
        : allow();
    default:
      return allow(); // Övriga verktyg begränsas av agentens tools.
  }
}

module.exports = { decide, parse, mentionsSecret };

if (require.main === module) {
  const mode = process.argv[2];
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => (data += d));
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(data);
    } catch {
      process.stderr.write(`agent-guard (${mode}): blockerat: hookens indata kunde inte tolkas\n`);
      process.exit(2);
    }
    const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    let result;
    try {
      result = decide(mode, input, projectDir);
    } catch (err) {
      result = block(`internt fel i agent-guard: ${err.message}`);
    }
    if (result.allow) process.exit(0);
    process.stderr.write(
      `agent-guard (${mode}): blockerat: ${result.reason}. Redovisa i stället för att försöka på annat sätt.\n`,
    );
    process.exit(2);
  });
}
