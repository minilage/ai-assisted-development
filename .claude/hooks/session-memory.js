// Hook för sessionsminne.
//
//   node session-memory.js start       – SessionStart (startup, resume, clear, compact):
//                                         skriver en sammanfattning till stdout. Claude Code lägger
//                                         in den i kontexten.
//   node session-memory.js precompact  – PreCompact: skriver instruktioner till stdout som Claude Code
//                                         använder när komprimeringen sammanfattas.
//
// Sammanfattningen innehåller "Nästa arbetsmoment" och en förkortad "Aktuell status" ur PLAN.md,
// namnet på den senaste sessionsloggen och `git status --short`. Den är högst MAX_CHARS tecken.
// Inga andra filer läses, och ingen konversationstext används.
//
// Hooken avslutar alltid med kod 0 och blockerar aldrig. Fel ger ett meddelande i sammanfattningen,
// ingen stackspårning.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MAX_CHARS = 3000;
const GIT_MAX_CHARS = 600;
const STATUS = "## Aktuell status";
const NEXT = "### Nästa arbetsmoment";

function headingLevel(line) {
  const m = /^(#{1,6})\s/.exec(line);
  return m ? m[1].length : 0;
}

// Avsnittet under rubriken, till nästa rubrik på samma nivå eller högre. null om rubriken saknas.
function extractSection(text, heading) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return null;
  const level = headingLevel(heading);
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const l = headingLevel(line);
    if (l && l <= level) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

// Underavsnitten (### …) i ett avsnitt, med texten före det första som eget stycke.
function subsections(body) {
  const parts = [{ heading: null, text: [] }];
  for (const line of body.split("\n")) {
    if (headingLevel(line) === 3) parts.push({ heading: line.trim(), text: [] });
    else parts[parts.length - 1].text.push(line);
  }
  return parts.map((p) => ({ heading: p.heading, text: p.text.join("\n").trim() }));
}

// Den sessionslogg som har högst nummer i namnet session-NN-….
function latestSession(files) {
  let best = null;
  let bestNum = -1;
  for (const f of files) {
    const m = /^session-(\d+)-.*\.md$/.exec(f);
    if (m && Number(m[1]) > bestNum) {
      bestNum = Number(m[1]);
      best = f;
    }
  }
  return best;
}

function truncate(text, max, where = "PLAN.md") {
  if (text.length <= max) return text;
  const marker = `\n[… förkortad, hela texten finns i ${where}]`;
  if (max <= marker.length) return marker.slice(0, Math.max(0, max));
  return text.slice(0, max - marker.length).trimEnd() + marker;
}

// Fördelar utrymmet mellan delarna. Korta delar tar bara det de behöver, och det som blir över
// delas lika mellan de långa delarna, som kortas av.
function share(texts, budget) {
  const limits = texts.map(() => null);
  let left = Math.max(0, budget);
  let open = texts.map((_, i) => i);
  let changed = true;
  while (open.length && changed) {
    changed = false;
    const per = Math.floor(left / open.length);
    for (const i of open) {
      if (texts[i].length <= per) {
        limits[i] = texts[i].length;
        left -= texts[i].length;
        changed = true;
      }
    }
    open = open.filter((i) => limits[i] === null);
  }
  const per = open.length ? Math.floor(left / open.length) : 0;
  return texts.map((t, i) => truncate(t, limits[i] === null ? per : limits[i]));
}

function buildSummary({ plan, session, gitStatus, source }) {
  const head = [
    `Sessionsminne från .claude/hooks/session-memory.js (SessionStart, källa: ${source}).`,
    "Uppgifterna är en automatisk sammanfattning. Kontrollera mot projektets filer innan du utgår från att något är klart.",
  ].join("\n");

  let next;
  let status = null;
  if (plan === null) {
    next = "PLAN.md saknas.";
  } else {
    const body = extractSection(plan, STATUS);
    if (body === null) {
      next = `Avsnittet "${STATUS}" saknas i PLAN.md.`;
    } else {
      const parts = subsections(body);
      const nextPart = parts.find((p) => p.heading === NEXT);
      next = nextPart ? nextPart.text || "(tomt)" : `Avsnittet "${NEXT}" saknas i PLAN.md.`;
      status = parts.filter((p) => p.heading !== NEXT);
    }
  }

  const sessionLine = session
    ? `Senaste sessionslogg: sessions/${session}`
    : "Ingen sessionslogg hittades i sessions/.";
  let git;
  if (gitStatus === null) git = "git status kunde inte köras.";
  else if (gitStatus.trim() === "") git = "git status --short: inga ändringar.";
  else
    git =
      "git status --short:\n" +
      truncate(gitStatus.replace(/\s+$/, ""), GIT_MAX_CHARS, "git status");

  const fixed = [head, `${NEXT} (PLAN.md)\n${next}`, sessionLine, git];
  let statusText = "";
  if (status) {
    const title = `${STATUS} (PLAN.md, förkortad om den är för lång)`;
    // Utrymme som blir kvar för statusen, fördelat lika mellan dess delar.
    const sep = 2 * (fixed.length + 1);
    const budget = MAX_CHARS - fixed.join("").length - title.length - sep;
    const fulls = status
      .filter((p) => p.heading || p.text)
      .map((p) => (p.heading ? `${p.heading}\n${p.text}` : p.text));
    statusText = [title, ...share(fulls, budget - 2 * fulls.length)].join("\n\n");
  }

  const all = [fixed[0], statusText, ...fixed.slice(1)].filter(Boolean).join("\n\n");
  return truncate(all, MAX_CHARS);
}

function buildPrecompact(trigger) {
  return [
    `Sessionsminne från .claude/hooks/session-memory.js (PreCompact, utlöst: ${trigger}).`,
    "Bevara i sammanfattningen:",
    "- vilken uppgift som pågår och hur långt den har kommit,",
    "- vad som faktiskt har genomförts och verifierats, med kommandon och resultat,",
    "- vilka beslut användaren har fattat och vad som väntar på godkännande,",
    "- problem som fortfarande finns kvar,",
    "- nästa arbetsmoment, alltså det som ska göras härnäst.",
    "Påminn om att det viktiga ska sparas i sessions/ och PLAN.md och inte bara finnas i konversationen.",
  ].join("\n");
}

function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function projectDir(input) {
  return (
    process.env.CLAUDE_PROJECT_DIR || (typeof input.cwd === "string" && input.cwd) || process.cwd()
  );
}

function readPlan(dir) {
  try {
    return fs.readFileSync(path.join(dir, "PLAN.md"), "utf8");
  } catch {
    return null;
  }
}

function findSession(dir) {
  try {
    return latestSession(fs.readdirSync(path.join(dir, "sessions")));
  } catch {
    return null;
  }
}

function gitStatus(dir) {
  try {
    const r = spawnSync("git", ["status", "--short"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 5000,
    });
    return r.status === 0 ? r.stdout : null;
  } catch {
    return null;
  }
}

function word(v) {
  return typeof v === "string" && /^[\w-]{1,20}$/.test(v) ? v : "okänd";
}

function main() {
  const mode = process.argv[2];
  if (mode !== "start" && mode !== "precompact") return;
  const input = readInput();
  if (mode === "precompact") {
    process.stdout.write(buildPrecompact(word(input.trigger)) + "\n");
    return;
  }
  const dir = projectDir(input);
  const text = buildSummary({
    plan: readPlan(dir),
    session: findSession(dir),
    gitStatus: gitStatus(dir),
    source: word(input.source),
  });
  process.stdout.write(text + "\n");
}

module.exports = {
  extractSection,
  latestSession,
  truncate,
  buildSummary,
  buildPrecompact,
  MAX_CHARS,
};

if (require.main === module) {
  try {
    main();
  } catch {
    // Sessionsminnet får aldrig stoppa en session.
  }
  process.exitCode = 0;
}
