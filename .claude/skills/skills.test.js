// Strukturtester för projektets skills. Körs med: node --test .claude/skills/skills.test.js
// (I Node 24 tolkas en katalog som argument till --test inte som en katalog.)
// Kontrollerar formatet enligt Claude Code (code.claude.com/docs/en/skills) och
// rubrikerna i docs/prompt-template.md. Testar inte hur väl en skill fungerar,
// det görs med beteendetester (se sessions/session-07-2026-11-15.md).
// Använder bara Node:s inbyggda testverktyg, inga externa paket.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SKILLS_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");

// Skills som ska finnas och deras inställningar. Listan fylls på steg för steg.
//   invocation: "both" = användaren och Claude, "user" = bara användaren.
//   disallowed: verktyg som ska vara borttagna medan skillen är aktiv.
//   files: stödfiler som ska finnas och vara länkade från SKILL.md.
//   mentions: text som måste finnas i SKILL.md, till exempel filer som ska undersökas.
const EXPECTED = {
  tdd: { invocation: "both", required: ["argument-hint"], mentions: ["docs/plans/"] },
  "granska-standard": {
    invocation: "both",
    required: ["argument-hint"],
    disallowed: ["Edit", "Write", "NotebookEdit"],
    files: ["checklista.md", "kontroller.md"],
    // R10: granskningen ska täcka de tre områdena och visa vilken kontroll som kunde fånga ett
    // fynd och om den är automatisk eller manuell.
    mentions: ["Säkerhet", "Struktur", "Kodstandard", "Kontroll/hook", "Automatiskt/Manuellt"],
  },
  // CLAUDE.md: undersök hur prisberäkningen används innan ändringar föreslås.
  karakterisera: {
    invocation: "user",
    required: ["argument-hint"],
    mentions: [
      "src/legacy/price_calc.py",
      "src/pricing/legacyPrice.ts",
      "jobs/nightly_report.py",
      "npm run test:legacy",
    ],
  },
  planera: {
    invocation: "both",
    required: ["argument-hint"],
    files: ["mall.md"],
    mentions: ["docs/plans/", "docs/user-stories.md", "docs/standard.md", "docs/api.md"],
  },
};

// Rubriker som varje plan från planera ska ha (planera/mall.md).
const PLAN_HEADINGS = [
  "Mål",
  "Research",
  "Acceptanskriterier",
  "Lösning",
  "Berörda filer",
  "Kräver separat godkännande",
  "Testplan",
  "Risker",
  "Uppdelning i steg",
  "Öppna frågor och beslut",
];

// Rubriker från docs/prompt-template.md. "Exempel" är valfri.
const HEADINGS = [
  "Roll",
  "Uppgift",
  "Kontext",
  "Regler",
  "Förväntat resultat",
  "Verifiering",
  "Stoppvillkor",
];

// Inbyggda och reserverade namn som en projektskill inte får ta.
const RESERVED = new Set([
  "anthropic-skills",
  "synced",
  "code-review",
  "review",
  "simplify",
  "init",
  "security-review",
  "run",
  "loop",
  "schedule",
  "help",
  "clear",
  "compact",
  "config",
  "context",
  "cost",
  "hooks",
  "memory",
  "model",
  "permissions",
  "plugin",
  "skills",
  "reload-skills",
  "status",
  "statusline",
  "agents",
  "login",
  "logout",
  "doctor",
  "fast",
  "rename",
  "resume",
  "usage",
  "batch",
  "debug",
  "claude-api",
  "update-config",
  "keybindings-help",
  "fewer-permission-prompts",
]);

const MAX_DESCRIPTION = 1536;
const MAX_LINES = 500;

function parseSkill(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0] !== "---") return { text, front: null, body: text };
  const end = lines.indexOf("---", 1);
  if (end < 0) return { text, front: null, body: text };
  const front = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) front[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return { text, front, body: lines.slice(end + 1).join("\n") };
}

// Returnerar en lista med fel. Tom lista = skillen följer strukturen.
function checkSkill(dir, root = REPO_ROOT) {
  const errors = [];
  const name = path.basename(dir);
  const file = path.join(dir, "SKILL.md");
  if (!fs.existsSync(file)) return [`${name}: SKILL.md saknas`];
  const { text, front, body } = parseSkill(file);

  if (!front) return [`${name}: frontmatter saknas eller börjar inte på rad 1`];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))
    errors.push(`${name}: katalognamnet är inte kebab-case`);
  if (front.name !== name)
    errors.push(`${name}: name (${front.name}) skiljer sig från katalognamnet`);
  if (RESERVED.has(name)) errors.push(`${name}: namnet är inbyggt eller reserverat`);
  if (!front.description) errors.push(`${name}: description saknas`);
  const descLen = (front.description || "").length + (front.when_to_use || "").length;
  if (descLen > MAX_DESCRIPTION)
    errors.push(`${name}: description är för lång (${descLen} tecken)`);
  const bodyLines = body.split("\n").length;
  if (bodyLines >= MAX_LINES) errors.push(`${name}: brödtexten har ${bodyLines} rader`);

  const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const h of HEADINGS) {
    if (!headings.some((x) => x.startsWith(h))) errors.push(`${name}: rubriken "${h}" saknas`);
  }

  // Länkar till stödfiler i samma katalog.
  for (const m of body.matchAll(/\]\(([^)#\s]+)\)/g)) {
    if (/^[a-z]+:/.test(m[1])) continue;
    if (!fs.existsSync(path.join(dir, m[1]))) errors.push(`${name}: länkad fil saknas: ${m[1]}`);
  }

  // Projektfiler i backticks, till exempel `docs/standard.md`. Mönster med platshållare hoppas över.
  for (const m of body.matchAll(/`([^`\s]+)`/g)) {
    const p = m[1];
    if (/[<>*${}]/.test(p)) continue;
    if (!/^\.?[\w-]+(\/[\w.-]+)+\/?$/.test(p) && !/^[\w-]+\.(md|ts|py|js|json|ini)$/.test(p))
      continue;
    if (!fs.existsSync(path.join(root, p)))
      errors.push(`${name}: filen eller katalogen finns inte: ${p}`);
  }

  // npm-skript som nämns måste finnas i package.json.
  let scripts = {};
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts || {};
  } catch {
    errors.push(`${name}: package.json kunde inte läsas`);
  }
  for (const m of text.matchAll(/npm run ([\w:-]+)/g)) {
    if (!(m[1] in scripts)) errors.push(`${name}: npm-skriptet finns inte: ${m[1]}`);
  }

  // Inga personuppgifter eller hemligheter.
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text)) errors.push(`${name}: innehåller en e-postadress`);
  if (
    /(api[_-]?key|password|secret|token)\s*[:=]\s*\S+/i.test(text) ||
    /\bsk-[A-Za-z0-9]{10,}/.test(text)
  )
    errors.push(`${name}: innehåller något som liknar en hemlighet`);

  return errors;
}

function skillDirs() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS_DIR, d.name));
}

// --- Projektets skills ---

test("De förväntade skillsen finns", () => {
  const names = skillDirs().map((d) => path.basename(d));
  for (const n of Object.keys(EXPECTED))
    assert.ok(names.includes(n), `${n} saknas i .claude/skills/`);
});

test("Varje skill följer strukturen", () => {
  const dirs = skillDirs();
  assert.ok(dirs.length > 0, "inga skills finns");
  const errors = dirs.flatMap((d) => checkSkill(d));
  assert.deepEqual(errors, []);
});

test("Varje skill har rätt inställningar för start och verktyg", () => {
  for (const [n, cfg] of Object.entries(EXPECTED)) {
    const file = path.join(SKILLS_DIR, n, "SKILL.md");
    assert.ok(fs.existsSync(file), `${n} saknas`);
    const { front } = parseSkill(file);
    const userOnly = front["disable-model-invocation"] === "true";
    assert.equal(userOnly, cfg.invocation === "user", `${n}: disable-model-invocation`);
    assert.notEqual(front["user-invocable"], "false", `${n}: ska kunna startas med /${n}`);
    for (const k of cfg.required || []) assert.ok(front[k], `${n}: ${k} saknas`);
    for (const tool of cfg.disallowed || []) {
      const list = (front["disallowed-tools"] || "").split(/[,\s]+/);
      assert.ok(list.includes(tool), `${n}: ${tool} ska finnas i disallowed-tools`);
    }
    const { body } = parseSkill(file);
    for (const f of cfg.files || []) {
      assert.ok(fs.existsSync(path.join(SKILLS_DIR, n, f)), `${n}: stödfilen ${f} saknas`);
      assert.ok(body.includes(`](${f})`), `${n}: ${f} är inte länkad från SKILL.md`);
    }
    for (const text of cfg.mentions || []) {
      assert.ok(body.includes(text), `${n}: SKILL.md nämner inte ${text}`);
    }
  }
});

// Mallen för planera och planerna i docs/plans/ ska ha alla rubriker.
test("planera: mallen och sparade planer har alla rubriker", () => {
  const mall = path.join(SKILLS_DIR, "planera", "mall.md");
  assert.ok(fs.existsSync(mall), "mall.md saknas");
  const plansDir = path.join(REPO_ROOT, "docs", "plans");
  const plans = fs.existsSync(plansDir)
    ? fs
        .readdirSync(plansDir)
        .filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f))
        .map((f) => path.join(plansDir, f))
    : [];
  for (const file of [mall, ...plans]) {
    const headings = [...fs.readFileSync(file, "utf8").matchAll(/^## (.+)$/gm)].map((m) =>
      m[1].trim(),
    );
    for (const h of PLAN_HEADINGS) {
      assert.ok(
        headings.some((x) => x.startsWith(h)),
        `${path.basename(file)}: rubriken "${h}" saknas`,
      );
    }
  }
});

// Checklistan för granska-standard ska täcka varje avsnitt i docs/standard.md.
test("granska-standard: checklistan täcker alla avsnitt i docs/standard.md", () => {
  const file = path.join(SKILLS_DIR, "granska-standard", "checklista.md");
  assert.ok(fs.existsSync(file), "checklista.md saknas");
  const list = fs.readFileSync(file, "utf8");
  const standard = fs.readFileSync(path.join(REPO_ROOT, "docs", "standard.md"), "utf8");
  const sections = [...standard.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  assert.ok(sections.length > 0, "inga avsnitt i docs/standard.md");
  for (const s of sections)
    assert.match(list, new RegExp(`^## ${s}$`, "m"), `avsnittet "${s}" saknas i checklistan`);
  const rules = [...standard.matchAll(/^- (.+)$/gm)].length;
  const ids = new Set([...list.matchAll(/^### (S\d+)\b/gm)].map((m) => m[1]));
  assert.equal(ids.size, rules, `docs/standard.md har ${rules} regler men checklistan ${ids.size}`);
});

// Reglerna i checklistan (S1–S18 ur standarden och U1.. utöver den) delar upp i regelblock.
function checklistBlocks(text) {
  const blocks = [];
  const re = /^### ([SU]\d+)\b[^\n]*\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm;
  for (const m of text.matchAll(re)) blocks.push({ id: m[1], body: m[2] });
  return blocks;
}

// R10: varje regel ska säga vilken kontroll som kan fånga ett fynd och om den är automatisk.
test("granska-standard: varje regel anger kontroll och automatiskt eller manuellt", () => {
  const list = fs.readFileSync(path.join(SKILLS_DIR, "granska-standard", "checklista.md"), "utf8");
  const blocks = checklistBlocks(list.replace(/\r\n/g, "\n"));
  assert.ok(blocks.length >= 26, `bara ${blocks.length} regler hittades`);
  for (const b of blocks) {
    const line = /^- Kontroll: (.+)$/m.exec(b.body);
    assert.ok(line, `${b.id}: raden "- Kontroll:" saknas`);
    assert.match(line[1], /\b(Automatiskt|Manuellt)\b/, `${b.id}: ange Automatiskt eller Manuellt`);
  }
});

// R10: reglerna utöver standarden täcker säkerhet och struktur, inte bara stil.
test("granska-standard: checklistan har regler utöver standarden för säkerhet och struktur", () => {
  const list = fs
    .readFileSync(path.join(SKILLS_DIR, "granska-standard", "checklista.md"), "utf8")
    .replace(/\r\n/g, "\n");
  assert.match(list, /^## Utöver standarden/m, 'avsnittet "Utöver standarden" saknas');
  const extra = checklistBlocks(list).filter((b) => b.id.startsWith("U"));
  assert.ok(extra.length >= 8, `${extra.length} regler utöver standarden, minst 8 ska finnas`);
  const areas = new Set(
    extra.map((b) => /^- Område: (\S+)/m.exec(b.body)?.[1]).filter((a) => a !== undefined),
  );
  for (const a of ["Säkerhet", "Struktur", "Testtäckning"])
    assert.ok(areas.has(a), `ingen regel utöver standarden har området ${a}`);
  for (const b of extra) assert.match(b.body, /^- Allvar: /m, `${b.id}: Allvar saknas`);
});

// R10: kontrollistan ska bara hänvisa till kontroller som finns i projektet.
test("granska-standard: kontroller.md hänvisar bara till kontroller som finns", () => {
  const file = path.join(SKILLS_DIR, "granska-standard", "kontroller.md");
  assert.ok(fs.existsSync(file), "kontroller.md saknas");
  const text = fs.readFileSync(file, "utf8");
  const scripts = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).scripts;
  for (const need of ["lint", "typecheck", "format:check", "test", "test:legacy"]) {
    assert.ok(text.includes(`npm run ${need}`) || need === "test", `kontroller.md saknar ${need}`);
    assert.ok(need in scripts, `package.json saknar skriptet ${need}`);
  }
  for (const m of text.matchAll(/npm run ([\w:-]+)/g))
    assert.ok(m[1] in scripts, `npm-skriptet finns inte: ${m[1]}`);
  assert.match(text, /npm test/, "npm test saknas");
  for (const h of ["check-code.js", "test-guard.js", "main-guard.js", "agent-guard.js"]) {
    assert.ok(text.includes(h), `kontroller.md saknar hooken ${h}`);
    assert.ok(fs.existsSync(path.join(REPO_ROOT, ".claude", "hooks", h)), `hooken ${h} finns inte`);
  }
  assert.match(text, /Automatiskt/, 'förklaringen av "Automatiskt" saknas');
  assert.match(text, /Manuellt/, 'förklaringen av "Manuellt" saknas');
});

test("Inga okända skills utan plats i EXPECTED", () => {
  const extra = skillDirs()
    .map((d) => path.basename(d))
    .filter((n) => !(n in EXPECTED));
  assert.deepEqual(extra, [], "lägg till nya skills i EXPECTED med sina inställningar");
});

// --- Valideringen själv: varje kontroll ska fånga sitt fel ---

const roots = [];
process.on("exit", () => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

const GOOD_BODY = HEADINGS.map((h) => `## ${h}\n\nText.\n`).join("\n");

function fixture(name, content, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ scripts: { lint: "eslint" } }),
  );
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "finns.md"), "x");
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
  for (const [f, c] of Object.entries(extra)) fs.writeFileSync(path.join(dir, f), c);
  return { dir, root };
}

function skill(name, front, body = GOOD_BODY) {
  return `---\nname: ${name}\n${front}---\n\n${body}`;
}

function errorsFor(name, content, extra) {
  const { dir, root } = fixture(name, content, extra);
  return checkSkill(dir, root);
}

test("Valideringen godkänner en korrekt skill", () => {
  const body = `${GOOD_BODY}\nSe [mall](mall.md), \`docs/finns.md\` och \`npm run lint\`.\n`;
  assert.deepEqual(
    errorsFor("bra-skill", skill("bra-skill", "description: Gör något.\n", body), {
      "mall.md": "x",
    }),
    [],
  );
});

test("Valideringen fångar varje typ av fel", () => {
  const cases = [
    ["frontmatter saknas", "ingen-front", GOOD_BODY, /frontmatter saknas/],
    [
      "frontmatter inte på rad 1",
      "rad-ett",
      `\n${skill("rad-ett", "description: x\n")}`,
      /frontmatter saknas/,
    ],
    ["name skiljer sig", "namn", skill("annat", "description: x\n"), /skiljer sig/],
    ["inte kebab-case", "Stor_Bokstav", skill("Stor_Bokstav", "description: x\n"), /kebab-case/],
    ["reserverat namn", "code-review", skill("code-review", "description: x\n"), /reserverat/],
    ["description saknas", "utan-beskrivning", skill("utan-beskrivning", ""), /description saknas/],
    [
      "för lång description",
      "lang",
      skill("lang", `description: ${"x".repeat(1537)}\n`),
      /för lång/,
    ],
    [
      "för lång brödtext",
      "langre",
      skill("langre", "description: x\n", GOOD_BODY + "rad\n".repeat(500)),
      /brödtexten/,
    ],
    [
      "rubrik saknas",
      "rubrik",
      skill("rubrik", "description: x\n", GOOD_BODY.replace("## Stoppvillkor", "## Annat")),
      /Stoppvillkor/,
    ],
    [
      "länkad fil saknas",
      "lank",
      skill("lank", "description: x\n", `${GOOD_BODY}[x](saknas.md)\n`),
      /länkad fil saknas/,
    ],
    [
      "projektfil saknas",
      "fil",
      skill("fil", "description: x\n", `${GOOD_BODY}\`docs/saknas.md\`\n`),
      /finns inte: docs\/saknas.md/,
    ],
    [
      "npm-skript saknas",
      "skript",
      skill("skript", "description: x\n", `${GOOD_BODY}npm run deploy\n`),
      /npm-skriptet finns inte: deploy/,
    ],
    [
      "e-postadress",
      "epost",
      skill("epost", "description: x\n", `${GOOD_BODY}kontakt@exempel.se\n`),
      /e-postadress/,
    ],
    [
      "hemlighet",
      "hemlis",
      skill("hemlis", "description: x\n", `${GOOD_BODY}password = hunter2\n`),
      /hemlighet/,
    ],
  ];
  for (const [label, name, content, re] of cases) {
    const errors = errorsFor(name, content);
    assert.ok(
      errors.some((e) => re.test(e)),
      `${label}: fångades inte (${JSON.stringify(errors)})`,
    );
  }
});

test("Valideringen hoppar över platshållare och kommandon i backticks", () => {
  const body = `${GOOD_BODY}\`tests/<namn>.test.ts\`, \`test_*.py\`, \`npx jest tests/x.test.ts\`, \`$ARGUMENTS\`\n`;
  assert.deepEqual(errorsFor("platshallare", skill("platshallare", "description: x\n", body)), []);
});
