// Statusrad för projektet.
// Rad 1: användarens befintliga statusrad (~/.claude/statusline.js), oförändrad.
// Rad 2: mätvärden för sessionen.
// Sparar en ögonblicksbild per session i .claude/metrics/live/<session_id>.json.
// Filen skrivs över vid varje uppdatering (ingen append), så värden räknas inte två gånger.
// Endast siffror och sessionsmetadata sparas, aldrig konversationstext.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Miljövariablerna används bara vid test.
const LIVE_DIR = process.env.CLAUDE_METRICS_LIVE_DIR || path.join(__dirname, "metrics", "live");
const USER_STATUSLINE =
  process.env.CLAUDE_USER_STATUSLINE || path.join(os.homedir(), ".claude", "statusline.js");

function userLine(raw) {
  try {
    if (!fs.existsSync(USER_STATUSLINE)) return null;
    const r = spawnSync(process.execPath, [USER_STATUSLINE], {
      input: raw,
      encoding: "utf8",
      timeout: 2000,
    });
    const out = (r.stdout || "").trim();
    return out || null;
  } catch {
    return null;
  }
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Förbrukning av en gräns under sessionen. Om fönstret återställs mitt i sessionen
// (resets_at ändras) sparas förbrukningen från det tidigare fönstret i earlier_windows_pct,
// så att consumed_pct blir summan över alla fönster utan att något räknas två gånger.
function limitWindow(prev, cur) {
  if (!cur || num(cur.used_percentage) == null) return prev || null;
  const p = prev || {};
  const sameWindow = p.resets_at == null || p.resets_at === cur.resets_at;
  const earlier =
    (num(p.earlier_windows_pct) ?? 0) +
    (sameWindow || p.first_pct == null ? 0 : Math.max(0, p.last_pct - p.first_pct));
  const first = sameWindow && p.first_pct != null ? p.first_pct : cur.used_percentage;
  return {
    first_pct: first,
    last_pct: cur.used_percentage,
    resets_at: cur.resets_at ?? null,
    earlier_windows_pct: earlier,
    consumed_pct: earlier + Math.max(0, cur.used_percentage - first),
    window_changed: !sameWindow || Boolean(p.window_changed),
  };
}

// Behåll tidigare värde om fältet saknas i den här uppdateringen.
function keep(v, prevV) {
  return num(v) ?? prevV ?? null;
}

function buildSnapshot(d, prev) {
  const now = new Date().toISOString();
  const cost = d.cost || {};
  const cw = d.context_window || {};
  const rl = d.rate_limits || {};
  const pc = (prev && prev.cost) || {};
  const px = (prev && prev.context) || {};
  const usedPct = num(cw.used_percentage);
  const prevMax = num(px.max_used_pct);
  return {
    schema: 1,
    session_id: d.session_id,
    session_name: d.session_name ?? (prev && prev.session_name) ?? null,
    transcript_path: d.transcript_path ?? (prev && prev.transcript_path) ?? null,
    model: (d.model && d.model.id) || (prev && prev.model) || null,
    claude_code_version: d.version ?? (prev && prev.claude_code_version) ?? null,
    first_seen: (prev && prev.first_seen) || now,
    last_seen: now,
    cost: {
      total_cost_usd_estimate: keep(cost.total_cost_usd, pc.total_cost_usd_estimate),
      total_duration_ms: keep(cost.total_duration_ms, pc.total_duration_ms),
      total_api_duration_ms: keep(cost.total_api_duration_ms, pc.total_api_duration_ms),
      lines_added: keep(cost.total_lines_added, pc.lines_added),
      lines_removed: keep(cost.total_lines_removed, pc.lines_removed),
    },
    context: {
      window_size: keep(cw.context_window_size, px.window_size),
      used_pct: keep(usedPct, px.used_pct),
      max_used_pct: usedPct == null ? prevMax : Math.max(usedPct, prevMax ?? 0),
    },
    rate_limits: {
      five_hour: limitWindow(prev && prev.rate_limits && prev.rate_limits.five_hour, rl.five_hour),
      seven_day: limitWindow(prev && prev.rate_limits && prev.rate_limits.seven_day, rl.seven_day),
    },
  };
}

function saveSnapshot(d) {
  if (!d || typeof d.session_id !== "string" || !/^[\w-]+$/.test(d.session_id)) return;
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  const file = path.join(LIVE_DIR, `${d.session_id}.json`);
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    prev = null;
  }
  const snap = buildSnapshot(d, prev);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snap, null, 2));
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignorera */
    }
  }
}

function metricsLine(d) {
  const parts = [];
  const cost = d.cost || {};
  const cw = d.context_window || {};
  const rl = d.rate_limits || {};
  if (num(cw.used_percentage) != null) parts.push(`Kontext ${Math.round(cw.used_percentage)}%`);
  if (num(cost.total_cost_usd) != null) parts.push(`~$${cost.total_cost_usd.toFixed(2)} (uppsk.)`);
  if (num(cost.total_duration_ms) != null) {
    const min = Math.round(cost.total_duration_ms / 60000);
    const api = num(cost.total_api_duration_ms);
    parts.push(`Tid ${min} min` + (api != null ? ` (API ${Math.round(api / 60000)} min)` : ""));
  }
  if (rl.five_hour && num(rl.five_hour.used_percentage) != null)
    parts.push(`5h ${Math.round(rl.five_hour.used_percentage)}%`);
  if (rl.seven_day && num(rl.seven_day.used_percentage) != null)
    parts.push(`7d ${Math.round(rl.seven_day.used_percentage)}%`);
  return parts.length ? parts.join(" · ") : "Mätvärden: n/a";
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let d = null;
  try {
    d = JSON.parse(raw);
  } catch {
    d = null;
  }
  const lines = [];
  lines.push(userLine(raw) || "Context: n/a");
  if (d) {
    lines.push(metricsLine(d));
    try {
      saveSnapshot(d);
    } catch {
      // Statusraden får aldrig krascha på grund av mätningen.
    }
  }
  process.stdout.write(lines.join("\n"));
});
