// Strukturtester för projektets subagenter. Körs med: node --test .claude/agents/agents.test.js
// Kontrollerar formatet enligt Claude Code (code.claude.com/docs/en/sub-agents), rubrikerna i
// docs/prompt-template.md och att varje agent har rätt verktyg, skills och spärr (agent-guard).
// Testar inte hur väl en agent fungerar, det görs med beteendetester (sessions/session-08-2026-11-15.md).
// Okända fält i frontmatter ignoreras av Claude Code utan varning, därför kontrolleras fälten här.
// Använder bara Node:s inbyggda testverktyg, inga externa paket.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const AGENTS_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");

// Agenter som ska finnas och deras inställningar.
//   tools:   exakt de verktyg agenten får ha.
//   skills:  skills som läses in när agenten startar.
//   guard:   läget för .claude/hooks/agent-guard.js i agentens PreToolUse-hook.
//   matcher: verktyg som hookens matcher minst måste täcka.
const EXPECTED = {
  planerare: {
    tools: ["Read", "Grep", "Glob", "Bash", "Write"],
    skills: ["planera"],
    guard: "plans-write",
    matcher: ["Bash", "Write", "Edit", "Read", "Grep", "Glob"],
  },
  utvecklare: {
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
    skills: ["tdd"],
    guard: "dev",
    matcher: ["Bash", "Write", "Edit", "Read", "Grep", "Glob"],
  },
  granskare: {
    tools: ["Read", "Grep", "Glob", "Bash"],
    skills: ["granska-standard"],
    guard: "read",
    matcher: ["Bash", "Write", "Edit", "Read", "Grep", "Glob"],
  },
  verifierare: {
    tools: ["Read", "Grep", "Glob", "Bash"],
    skills: [],
    guard: "checks",
    matcher: ["Bash", "Write", "Edit", "Read", "Grep", "Glob"],
  },
};

// Verktyg som ingen agent får ha: Agent (starta egna agenter) och Skill (starta andra skills).
const FORBIDDEN_TOOLS = ["Agent", "Task", "Skill"];
// Verktyg som skriver filer. Bara agenter som har dem i EXPECTED får ha dem.
const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];

// Fält som Claude Code känner igen. Ett felstavat fält ignoreras annars utan varning.
const KNOWN_FIELDS = new Set([
  "name",
  "description",
  "tools",
  "disallowedTools",
  "model",
  "permissionMode",
  "maxTurns",
  "autoCompactWindow",
  "skills",
  "mcpServers",
  "hooks",
  "memory",
  "background",
  "omitClaudeMd",
  "effort",
  "isolation",
  "color",
  "initialPrompt",
  "experimental",
]);
const MODELS = new Set(["inherit", "sonnet", "opus", "haiku", "fable"]);
const COLORS = new Set(["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"]);

// Inbyggda agenter som en projektagent inte ska krocka med.
const RESERVED = new Set([
  "explore",
  "plan",
  "general-purpose",
  "claude",
  "statusline-setup",
  "claude-code-guide",
  "fork",
]);

// Rubriker från docs/prompt-template.md, plus överlämningen till nästa fas (CLAUDE.md).
const HEADINGS = [
  "Roll",
  "Uppgift",
  "Kontext",
  "Regler",
  "Förväntat resultat",
  "Verifiering",
  "Stoppvillkor",
  "Överlämning",
];

const MAX_DESCRIPTION = 1024;
const MAX_LINES = 300;
const GUARD = ".claude/hooks/agent-guard.js";

function parseAgent(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0] !== "---") return { text, front: null, frontText: "", body: text };
  const end = lines.indexOf("---", 1);
  if (end < 0) return { text, front: null, frontText: "", body: text };
  const frontLines = lines.slice(1, end);
  const front = {};
  for (const line of frontLines) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line); // bara fält på översta nivån
    if (m) front[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return { text, front, frontText: frontLines.join("\n"), body: lines.slice(end + 1).join("\n") };
}

const list = (v) =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Hooks i frontmatter: PreToolUse med matcher och kommando. Returnerar [{ matcher, commands }].
function parseHooks(frontText) {
  const out = [];
  const pre = /^ {2}PreToolUse:\s*$/m.exec(frontText);
  if (!pre) return out;
  const block = frontText.slice(pre.index + pre[0].length).split(/\n(?= {0,2}\S)/)[0];
  for (const entry of block.split(/\n {4}- /).slice(1)) {
    const matcher = (/matcher:\s*["']?([^"'\n]+)["']?/.exec(entry) || [])[1] || "";
    const commands = [...entry.matchAll(/command:\s*(.+)/g)].map((m) =>
      m[1].trim().replace(/^'|'$/g, ""),
    );
    out.push({ matcher, commands });
  }
  return out;
}

// Returnerar en lista med fel. Tom lista = agenten följer strukturen.
function checkAgent(file, root = REPO_ROOT) {
  const errors = [];
  const name = path.basename(file, ".md");
  const { text, front, frontText, body } = parseAgent(file);
  if (!front) return [`${name}: frontmatter saknas eller börjar inte på rad 1`];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) errors.push(`${name}: filnamnet är inte kebab-case`);
  if (front.name !== name) errors.push(`${name}: name (${front.name}) skiljer sig från filnamnet`);
  if (RESERVED.has(name.toLowerCase())) errors.push(`${name}: namnet krockar med en inbyggd agent`);
  if (!front.description) errors.push(`${name}: description saknas`);
  if ((front.description || "").length > MAX_DESCRIPTION)
    errors.push(`${name}: description är för lång`);
  for (const k of Object.keys(front))
    if (!KNOWN_FIELDS.has(k)) errors.push(`${name}: okänt fält i frontmatter: ${k}`);
  if (!front.tools) errors.push(`${name}: tools saknas (utan tools ärver agenten alla verktyg)`);
  for (const t of list(front.tools))
    if (FORBIDDEN_TOOLS.includes(t)) errors.push(`${name}: verktyget ${t} är inte tillåtet`);
  if (front.model && !MODELS.has(front.model) && !/^claude-/.test(front.model))
    errors.push(`${name}: okänd model: ${front.model}`);
  if (front.color && !COLORS.has(front.color)) errors.push(`${name}: okänd color: ${front.color}`);
  if (front.maxTurns && !/^\d+$/.test(front.maxTurns))
    errors.push(`${name}: maxTurns är inte ett heltal`);
  if ("memory" in front)
    errors.push(`${name}: memory ska inte användas, sessionsminnet ligger i projektets filer`);

  // Skills som läses in måste finnas och få startas av Claude.
  for (const s of list(front.skills)) {
    const sf = path.join(root, ".claude", "skills", s, "SKILL.md");
    if (!fs.existsSync(sf)) {
      errors.push(`${name}: skillen ${s} finns inte`);
      continue;
    }
    if (/^disable-model-invocation:\s*true\s*$/m.test(fs.readFileSync(sf, "utf8")))
      errors.push(`${name}: skillen ${s} har disable-model-invocation och kan inte läsas in`);
  }

  // Hooks: varje kommando som pekar på ett skript i .claude/hooks/ måste peka på en fil som finns.
  for (const h of parseHooks(frontText)) {
    for (const c of h.commands) {
      const m = /\.claude\/hooks\/([\w.-]+\.js)/.exec(c);
      if (m && !fs.existsSync(path.join(root, ".claude", "hooks", m[1])))
        errors.push(`${name}: hook-skriptet finns inte: ${m[1]}`);
    }
  }

  const bodyLines = body.split("\n").length;
  if (bodyLines >= MAX_LINES) errors.push(`${name}: brödtexten har ${bodyLines} rader`);
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const h of HEADINGS)
    if (!headings.some((x) => x.startsWith(h))) errors.push(`${name}: rubriken "${h}" saknas`);

  // Projektfiler i backticks måste finnas. Mönster med platshållare hoppas över.
  for (const m of body.matchAll(/`([^`\s]+)`/g)) {
    const p = m[1];
    if (/[<>*${}]/.test(p)) continue;
    if (!/^\.?[\w-]+(\/[\w.-]+)+\/?$/.test(p) && !/^[\w-]+\.(md|ts|py|js|json|ini)$/.test(p))
      continue;
    if (!fs.existsSync(path.join(root, p)))
      errors.push(`${name}: filen eller katalogen finns inte: ${p}`);
  }
  let scripts = {};
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts || {};
  } catch {
    errors.push(`${name}: package.json kunde inte läsas`);
  }
  for (const m of text.matchAll(/npm run ([\w:-]+)/g))
    if (!(m[1] in scripts)) errors.push(`${name}: npm-skriptet finns inte: ${m[1]}`);

  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text)) errors.push(`${name}: innehåller en e-postadress`);
  if (
    /(api[_-]?key|password|secret|token)\s*[:=]\s*\S+/i.test(text) ||
    /\bsk-[A-Za-z0-9]{10,}/.test(text)
  )
    errors.push(`${name}: innehåller något som liknar en hemlighet`);
  return errors;
}

// Kontrollerar inställningarna i EXPECTED för en agent.
function checkExpected(file, cfg) {
  const errors = [];
  const name = path.basename(file, ".md");
  const { front, frontText } = parseAgent(file);
  if (!front) return [`${name}: frontmatter saknas`];
  const tools = list(front.tools);
  const want = [...cfg.tools].sort();
  if (JSON.stringify([...tools].sort()) !== JSON.stringify(want))
    errors.push(`${name}: tools är ${tools.join(", ")}, ska vara ${want.join(", ")}`);
  for (const t of WRITE_TOOLS)
    if (tools.includes(t) && !cfg.tools.includes(t)) errors.push(`${name}: får inte ha ${t}`);
  const skills = list(front.skills).sort();
  if (JSON.stringify(skills) !== JSON.stringify([...cfg.skills].sort()))
    errors.push(
      `${name}: skills är ${skills.join(", ") || "inga"}, ska vara ${cfg.skills.join(", ") || "inga"}`,
    );
  const hooks = parseHooks(frontText);
  const guarded = hooks.filter((h) =>
    h.commands.some(
      (c) => c.includes(GUARD) && new RegExp(`agent-guard\\.js"?\\s+${cfg.guard}\\b`).test(c),
    ),
  );
  if (guarded.length === 0)
    errors.push(`${name}: PreToolUse-hook med agent-guard.js ${cfg.guard} saknas`);
  for (const h of guarded) {
    const covered = h.matcher.split("|").map((s) => s.trim());
    for (const t of cfg.matcher)
      if (!covered.includes(t)) errors.push(`${name}: hookens matcher täcker inte ${t}`);
  }
  if (!front.model) errors.push(`${name}: model saknas`);
  if (!front.maxTurns) errors.push(`${name}: maxTurns saknas`);
  if (!front.color) errors.push(`${name}: color saknas`);
  return errors;
}

function agentFiles(dir = AGENTS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
}

// --- Projektets agenter ---

// Ett test per agent, så att resultatet syns för varje agent för sig.
for (const [n, cfg] of Object.entries(EXPECTED)) {
  test(`${n}: finns och har rätt verktyg, skills och spärr`, () => {
    const file = path.join(AGENTS_DIR, `${n}.md`);
    assert.ok(fs.existsSync(file), `${n} saknas i .claude/agents/`);
    assert.deepEqual(checkExpected(file, cfg), []);
  });
}

test("Varje agent följer strukturen", () => {
  const files = agentFiles();
  assert.ok(files.length > 0, "inga agenter finns");
  assert.deepEqual(
    files.flatMap((f) => checkAgent(f)),
    [],
  );
});

// R10: granskaren och skillen ska ge samma tabell, med kolumner för kontroll och automatiskt/manuellt.
const R10_COLUMNS =
  "| ID | Område | Regel | Allvar | Status | Fil:rad | Vad och varför | Förslag | Kontroll/hook | Automatiskt/Manuellt |";

test("granskare och granska-standard använder samma fyndtabell för R10", () => {
  const agent = fs.readFileSync(path.join(AGENTS_DIR, "granskare.md"), "utf8");
  const skill = fs.readFileSync(
    path.join(AGENTS_DIR, "..", "skills", "granska-standard", "SKILL.md"),
    "utf8",
  );
  assert.ok(agent.includes(R10_COLUMNS), "granskare.md saknar R10-tabellen");
  assert.ok(skill.includes(R10_COLUMNS), "SKILL.md saknar R10-tabellen");
  for (const text of [agent, skill]) {
    assert.match(text, /Bekräftat/, 'Status "Bekräftat" saknas');
    assert.match(text, /Risk/, 'Status "Risk" saknas');
    for (const a of ["Säkerhet", "Struktur", "Kodstandard"])
      assert.ok(text.includes(a), `området ${a} saknas`);
  }
});

test("Inga okända agenter utan plats i EXPECTED", () => {
  const extra = agentFiles()
    .map((f) => path.basename(f, ".md"))
    .filter((n) => !(n in EXPECTED));
  assert.deepEqual(extra, [], "lägg till nya agenter i EXPECTED med sina inställningar");
});

test("Varje skill som kan läsas in i en agent används av någon agent, utom de som bara användaren startar", () => {
  const used = new Set(Object.values(EXPECTED).flatMap((c) => c.skills));
  for (const s of ["planera", "tdd", "granska-standard"])
    assert.ok(used.has(s), `${s} används inte av någon agent`);
});

// --- Valideringen själv: varje kontroll ska fånga sitt fel ---

const roots = [];
process.on("exit", () => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

const GOOD_BODY = HEADINGS.map((h) => `## ${h}\n\nText.\n`).join("\n");
const goodFront = (name, extra = "") =>
  [
    "---",
    `name: ${name}`,
    "description: Granskar kod.",
    "tools: Read, Grep, Glob, Bash",
    "skills: granska-standard",
    "model: inherit",
    "maxTurns: 30",
    "color: blue",
    "hooks:",
    "  PreToolUse:",
    '    - matcher: "Bash|Read|Grep|Glob|Write|Edit|NotebookEdit"',
    "      hooks:",
    "        - type: command",
    `          command: node "\${CLAUDE_PROJECT_DIR:-.}/${GUARD}" read`,
    extra,
    "---",
  ]
    .filter((l) => l !== "")
    .join("\n");

function fixture(name, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-test-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ scripts: { lint: "eslint" } }),
  );
  fs.mkdirSync(path.join(root, ".claude", "hooks"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "hooks", "agent-guard.js"), "");
  for (const [s, extra] of [
    ["granska-standard", ""],
    ["karakterisera", "disable-model-invocation: true\n"],
  ]) {
    fs.mkdirSync(path.join(root, ".claude", "skills", s), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "skills", s, "SKILL.md"),
      `---\nname: ${s}\ndescription: x\n${extra}---\n`,
    );
  }
  const dir = path.join(root, ".claude", "agents");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, content);
  return { root, file };
}

const CFG = {
  tools: ["Read", "Grep", "Glob", "Bash"],
  skills: ["granska-standard"],
  guard: "read",
  matcher: ["Bash", "Write", "Edit"],
};

test("Valideringen godkänner en korrekt agent", () => {
  const { root, file } = fixture("testagent", `${goodFront("testagent")}\n${GOOD_BODY}`);
  assert.deepEqual(checkAgent(file, root), []);
  assert.deepEqual(checkExpected(file, CFG), []);
});

test("Valideringen fångar fel i strukturen", () => {
  const cases = [
    ["utan frontmatter", "testagent", GOOD_BODY, /frontmatter saknas/],
    ["fel name", "testagent", `${goodFront("annat")}\n${GOOD_BODY}`, /skiljer sig/],
    ["inbyggt namn", "explore", `${goodFront("explore")}\n${GOOD_BODY}`, /inbyggd agent/],
    ["inte kebab-case", "Test_Agent", `${goodFront("Test_Agent")}\n${GOOD_BODY}`, /kebab-case/],
    [
      "description saknas",
      "testagent",
      `${goodFront("testagent").replace(/^description:.*\n/m, "")}\n${GOOD_BODY}`,
      /description saknas/,
    ],
    [
      "felstavat fält",
      "testagent",
      `${goodFront("testagent", "allowed-tools: Read")}\n${GOOD_BODY}`,
      /okänt fält.*allowed-tools/,
    ],
    [
      "tools saknas",
      "testagent",
      `${goodFront("testagent").replace(/^tools:.*\n/m, "")}\n${GOOD_BODY}`,
      /tools saknas/,
    ],
    [
      "Agent i tools",
      "testagent",
      `${goodFront("testagent").replace("Bash\n", "Bash, Agent\n")}\n${GOOD_BODY}`,
      /Agent är inte tillåtet/,
    ],
    [
      "Skill i tools",
      "testagent",
      `${goodFront("testagent").replace("Bash\n", "Bash, Skill\n")}\n${GOOD_BODY}`,
      /Skill är inte tillåtet/,
    ],
    [
      "okänd model",
      "testagent",
      `${goodFront("testagent").replace("model: inherit", "model: gpt")}\n${GOOD_BODY}`,
      /okänd model/,
    ],
    [
      "okänd color",
      "testagent",
      `${goodFront("testagent").replace("color: blue", "color: svart")}\n${GOOD_BODY}`,
      /okänd color/,
    ],
    [
      "memory",
      "testagent",
      `${goodFront("testagent", "memory: project")}\n${GOOD_BODY}`,
      /memory ska inte/,
    ],
    [
      "skill finns inte",
      "testagent",
      `${goodFront("testagent").replace("skills: granska-standard", "skills: saknas")}\n${GOOD_BODY}`,
      /skillen saknas finns inte/,
    ],
    [
      "skill bara för användaren",
      "testagent",
      `${goodFront("testagent").replace("skills: granska-standard", "skills: karakterisera")}\n${GOOD_BODY}`,
      /disable-model-invocation/,
    ],
    [
      "hook-skript saknas",
      "testagent",
      `${goodFront("testagent").replace("agent-guard.js", "saknas.js")}\n${GOOD_BODY}`,
      /hook-skriptet finns inte/,
    ],
    [
      "rubrik saknas",
      "testagent",
      `${goodFront("testagent")}\n${GOOD_BODY.replace("## Överlämning", "## Annat")}`,
      /Överlämning/,
    ],
    [
      "fil finns inte",
      "testagent",
      `${goodFront("testagent")}\n${GOOD_BODY}\nSe \`docs/finns-inte.md\`.`,
      /finns inte: docs\/finns-inte.md/,
    ],
    [
      "npm-skript finns inte",
      "testagent",
      `${goodFront("testagent")}\n${GOOD_BODY}\nKör \`npm run saknas\`.`,
      /npm-skriptet finns inte/,
    ],
    [
      "e-postadress",
      "testagent",
      `${goodFront("testagent")}\n${GOOD_BODY}\nperson@example.com`,
      /e-postadress/,
    ],
    [
      "hemlighet",
      "testagent",
      `${goodFront("testagent")}\n${GOOD_BODY}\npassword=hemligt123`,
      /hemlighet/,
    ],
  ];
  for (const [label, name, content, re] of cases) {
    const { root, file } = fixture(name, content);
    const errors = checkAgent(file, root);
    assert.ok(
      errors.some((e) => re.test(e)),
      `${label}: fångades inte (${JSON.stringify(errors)})`,
    );
  }
});

test("Valideringen fångar fel i verktyg, skills och spärr", () => {
  const cases = [
    [
      "Write för en läsande agent",
      goodFront("testagent").replace("Bash\n", "Bash, Write\n"),
      /tools är|får inte ha Write/,
    ],
    ["verktyg saknas", goodFront("testagent").replace(", Bash\n", "\n"), /tools är/],
    [
      "fel skill",
      goodFront("testagent").replace("skills: granska-standard", "skills: karakterisera"),
      /skills är/,
    ],
    [
      "hook saknas",
      goodFront("testagent").replace(/hooks:[\s\S]*read\n/, ""),
      /agent-guard.js read saknas/,
    ],
    [
      "fel läge",
      goodFront("testagent").replace(/agent-guard\.js" read/, 'agent-guard.js" dev'),
      /agent-guard.js read saknas/,
    ],
    [
      "matcher täcker inte Write",
      goodFront("testagent").replace("|Write|", "|"),
      /täcker inte Write/,
    ],
    ["maxTurns saknas", goodFront("testagent").replace(/^maxTurns:.*\n/m, ""), /maxTurns saknas/],
  ];
  for (const [label, front, re] of cases) {
    const { file } = fixture("testagent", `${front}\n${GOOD_BODY}`);
    const errors = checkExpected(file, CFG);
    assert.ok(
      errors.some((e) => re.test(e)),
      `${label}: fångades inte (${JSON.stringify(errors)})`,
    );
  }
});
