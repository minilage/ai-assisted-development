// Hook som sparar mätvärden per session i metrics/arbetsmoment.csv.
//
//   node record-metrics.js end    – SessionEnd (även vid /clear): registrerar sessionen som avslutas.
//   node record-metrics.js start  – SessionStart: reserv. Registrerar ögonblicksbilder från sessioner
//                                    där SessionEnd aldrig kördes (till exempel om processen dog).
//
// Källor:
//   - Ögonblicksbilden .claude/metrics/live/<session_id>.json från statusline.js
//     (tid, uppskattad kostnad, kontext, gränsförbrukning, ändrade rader).
//   - Transkriptet <session_id>.jsonl och eventuella subagent-transkript. Bara fälten
//     message.id, message.usage och timestamp läses. Ingen text från konversationen används.
//
// Ingen dubbelräkning:
//   - Samma API-svar står på flera rader i transkriptet. Tokens räknas en gång per message.id,
//     även om svaret förekommer i flera filer.
//   - CSV-filen har en rad per session_id. Körs hooken igen för samma session ersätts raden.
//
// Integritet: CSV-filen innehåller inga sökvägar, ingen cwd och ingen konversationstext.
// Hooken skriver aldrig till stdout (vid SessionStart skulle det hamna i kontexten) och
// avslutar alltid med kod 0.
"use strict";
const fs = require("fs");
const path = require("path");

// Miljövariablerna används bara vid test.
const LIVE_DIR =
  process.env.CLAUDE_METRICS_LIVE_DIR || path.join(__dirname, "..", "metrics", "live");
const CSV_FILE =
  process.env.CLAUDE_METRICS_CSV || path.join(__dirname, "..", "..", "metrics", "arbetsmoment.csv");
const STATE_FILE = path.join(LIVE_DIR, "recorded.json");
const ERROR_LOG = path.join(LIVE_DIR, "errors.log");

const COLUMNS = [
  "session_id",
  "datum",
  "arbetsmoment",
  "avslut",
  "start",
  "slut",
  "tid_vagg_min",
  "tid_api_min",
  "api_anrop",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "max_kontext_pct",
  "kostnad_usd_uppskattad",
  "femtimmar_fore_pct",
  "femtimmar_efter_pct",
  "femtimmar_forbrukat_pct",
  "vecka_forbrukat_pct",
  "rader_tillagda",
  "rader_borttagna",
  "modell",
  "version",
];

const ID_RE = /^[\w-]+$/;

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, text);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignorera */
    }
  }
}

function isTranscript(p) {
  return typeof p === "string" && p.toLowerCase().endsWith(".jsonl") && fs.existsSync(p);
}

// Transkriptet för sessionen. Hookens egen sökväg används för den session som avslutas.
// För andra sessioner används samma katalog som den aktuella sessionens transkript,
// och i sista hand sökvägen som statusraden sparade.
function findTranscript(id, input, snap) {
  const candidates = [];
  if (input && input.session_id === id) candidates.push(input.transcript_path);
  if (input && typeof input.transcript_path === "string")
    candidates.push(path.join(path.dirname(input.transcript_path), `${id}.jsonl`));
  if (snap) candidates.push(snap.transcript_path);
  return candidates.find(isTranscript) || null;
}

function subagentTranscripts(main) {
  const dir = path.join(path.dirname(main), path.basename(main, ".jsonl"), "subagents");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".jsonl"))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

// Summerar tokens per unikt API-svar. Läser bara id, usage och timestamp.
function tokenTotals(main) {
  const usageById = new Map();
  let first = null;
  let last = null;
  let model = null;
  for (const file of [main, ...subagentTranscripts(main)]) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (file === main && typeof o.timestamp === "string") {
        if (!first || o.timestamp < first) first = o.timestamp;
        if (!last || o.timestamp > last) last = o.timestamp;
      }
      const m = o.message;
      const u = m && m.usage;
      if (!u || typeof u !== "object") continue;
      const key = m.id || o.requestId || o.uuid;
      if (!key) continue;
      if (typeof m.model === "string") model = m.model;
      const prev = usageById.get(key) || {};
      // Om samma svar skulle ha olika värden på olika rader används det största, aldrig summan.
      usageById.set(key, {
        input: Math.max(prev.input ?? 0, num(u.input_tokens) ?? 0),
        output: Math.max(prev.output ?? 0, num(u.output_tokens) ?? 0),
        cacheRead: Math.max(prev.cacheRead ?? 0, num(u.cache_read_input_tokens) ?? 0),
        cacheWrite: Math.max(prev.cacheWrite ?? 0, num(u.cache_creation_input_tokens) ?? 0),
      });
    }
  }
  const t = {
    calls: usageById.size,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    first,
    last,
    model,
  };
  for (const u of usageById.values()) {
    t.input += u.input;
    t.output += u.output;
    t.cacheRead += u.cacheRead;
    t.cacheWrite += u.cacheWrite;
  }
  return t;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// Lokal tid, till exempel 2026-11-15 16:24.
function localTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(v, decimals) {
  const n = num(v);
  if (n == null) return "";
  return decimals == null ? String(n) : n.toFixed(decimals);
}

// Gränsförbrukningen beräknas som skillnaden mellan första och sista värdet som statusraden såg.
// Började statusraden mäta mer än så här långt efter sessionens start är första värdet inte
// sessionens startvärde, och förbrukningen skulle bli för låg (ofta 0). Då lämnas fälten tomma.
const LATE_START_MS = 2 * 60 * 1000;

function startedLate(snap, tokens) {
  const seen = Date.parse(snap && snap.first_seen);
  const began = Date.parse(tokens && tokens.first);
  if (Number.isNaN(seen) || Number.isNaN(began)) return false;
  return seen - began > LATE_START_MS;
}

function buildRow(id, reason, snap, tokens) {
  const s = snap || {};
  const c = s.cost || {};
  const ctx = s.context || {};
  const rl = s.rate_limits || {};
  const late = startedLate(s, tokens);
  // Vid sen start är bara slutvärdet (last_pct) uppmätt för hela sessionen.
  const five = late ? { last_pct: (rl.five_hour || {}).last_pct } : rl.five_hour || {};
  const week = late ? {} : rl.seven_day || {};
  const start = (tokens && tokens.first) || s.first_seen || null;
  const end = (tokens && tokens.last) || s.last_seen || null;
  const t = tokens || {};
  return {
    session_id: id,
    datum: localTime(start).slice(0, 10),
    arbetsmoment: s.session_name || "",
    avslut: reason || "",
    start: localTime(start),
    slut: localTime(end),
    tid_vagg_min: num(c.total_duration_ms) == null ? "" : (c.total_duration_ms / 60000).toFixed(1),
    tid_api_min:
      num(c.total_api_duration_ms) == null ? "" : (c.total_api_duration_ms / 60000).toFixed(1),
    api_anrop: fmt(t.calls),
    input_tokens: fmt(t.input),
    output_tokens: fmt(t.output),
    cache_read_tokens: fmt(t.cacheRead),
    cache_write_tokens: fmt(t.cacheWrite),
    max_kontext_pct: fmt(ctx.max_used_pct),
    kostnad_usd_uppskattad: fmt(c.total_cost_usd_estimate, 4),
    femtimmar_fore_pct: fmt(five.first_pct),
    femtimmar_efter_pct: fmt(five.last_pct),
    femtimmar_forbrukat_pct: fmt(five.consumed_pct),
    vecka_forbrukat_pct: fmt(week.consumed_pct),
    rader_tillagda: fmt(c.lines_added),
    rader_borttagna: fmt(c.lines_removed),
    modell: s.model || t.model || "",
    version: s.claude_code_version || "",
  };
}

// CSV-fält: radbrytningar tas bort, formler neutraliseras och fält med specialtecken citeras.
function csvField(v) {
  let s = String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(f);
      f = "";
    } else if (ch === "\n") {
      row.push(f.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      f = "";
    } else f += ch;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

// En rad per session_id: finns raden ersätts den, annars läggs den till sist.
// keepReason: ett avslut som redan finns på raden (till exempel "clear" från SessionEnd)
// behålls, och bara mätvärdena uppdateras. Används av reservsvepet vid SessionStart.
function upsertRow(row, keepReason) {
  let records = [];
  if (fs.existsSync(CSV_FILE)) {
    const [header, ...data] = parseCsv(fs.readFileSync(CSV_FILE, "utf8"));
    if (header)
      records = data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  }
  const i = records.findIndex((r) => r.session_id === row.session_id);
  if (i >= 0 && keepReason && records[i].avslut) row.avslut = records[i].avslut;
  if (i >= 0) records[i] = row;
  else records.push(row);
  const lines = [
    COLUMNS.join(","),
    ...records.map((r) => COLUMNS.map((k) => csvField(r[k])).join(",")),
  ];
  writeAtomic(CSV_FILE, lines.join("\n") + "\n");
}

function fingerprint(snap, transcript) {
  let size = "";
  try {
    if (transcript) size = String(fs.statSync(transcript).size);
  } catch {
    /* ignorera */
  }
  return `${(snap && snap.last_seen) || ""}|${size}`;
}

function record(id, reason, input, state, keepReason = false) {
  if (!ID_RE.test(id)) return false;
  const snap = readJson(path.join(LIVE_DIR, `${id}.json`));
  const transcript = findTranscript(id, input, snap);
  if (!snap && !transcript) return false;
  const tokens = transcript ? tokenTotals(transcript) : null;
  upsertRow(buildRow(id, reason, snap, tokens), keepReason);
  state[id] = fingerprint(snap, transcript);
  return true;
}

// Reserv: registrera ögonblicksbilder som inte har registrerats eller har ändrats sedan dess.
function sweep(input, state) {
  const current = input && input.session_id;
  let files = [];
  try {
    files = fs.readdirSync(LIVE_DIR);
  } catch {
    return;
  }
  for (const f of files) {
    const m = /^([\w-]+)\.json$/.exec(f);
    if (!m || m[1] === "recorded" || m[1] === current) continue;
    const id = m[1];
    const snap = readJson(path.join(LIVE_DIR, f));
    if (!snap) continue;
    if (state[id] === fingerprint(snap, findTranscript(id, input, snap))) continue;
    record(id, "efterhand", input, state, true);
  }
}

function logError(err) {
  try {
    fs.mkdirSync(LIVE_DIR, { recursive: true });
    fs.appendFileSync(
      ERROR_LOG,
      `${new Date().toISOString()} ${err && err.message ? err.message : err}\n`,
    );
  } catch {
    /* ignorera */
  }
}

function main() {
  const mode = process.argv[2];
  let input = null;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    input = null;
  }
  if (!input || typeof input !== "object") return;
  if (mode !== "end" && mode !== "start") return;
  const state = readJson(STATE_FILE) || {};
  if (mode === "end" && typeof input.session_id === "string") {
    record(input.session_id, input.reason || "", input, state);
  }
  sweep(input, state);
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  writeAtomic(STATE_FILE, JSON.stringify(state, null, 2));
}

try {
  main();
} catch (err) {
  logError(err);
}
process.exitCode = 0;
