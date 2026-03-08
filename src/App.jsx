import { useState, useEffect, useRef, useCallback } from "react";

// ─── Utility helpers ────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const fmt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// ─── Note cleaner (content-level pipeline) ──────────────────────────
function cleanNote(raw) {
  let text = raw.replace(/\r\n/g, "\n");

  // ═══ PHASE 1: Unicode & encoding cleanup ═══
  text = text.replace(/[\u201C\u201D\u2033]/g, '"').replace(/[\u2018\u2019\u2032]/g, "'");
  text = text.replace(/\u2026/g, "...").replace(/[\u2013\u2014]/g, "—");
  text = text.replace(/[\u00A0\u2007\u202F]/g, " ");
  text = text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "");

  // ═══ PHASE 2: Strip platform noise ═══
  // Slack formatting artifacts
  text = text.replace(/^([A-Za-z][\w. -]{0,30})\s{2,}(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\s*$/gm, "\n**$1** ($2):");
  text = text.replace(/<@[A-Z0-9]+\|([^>]+)>/g, "@$1");
  text = text.replace(/<@[A-Z0-9]+>/g, "@user");
  text = text.replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1");
  text = text.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2 ($1)");
  text = text.replace(/<(https?:\/\/[^>]+)>/g, "$1");
  text = text.replace(/:[a-z0-9_+-]+:/g, "");
  // Slack system noise: "joined the channel", "set the topic", "pinned a message", "edited"
  text = text.replace(/^.*(?:joined|left) (?:the )?(?:channel|group|call)\.?\s*$/gim, "");
  text = text.replace(/^.*(?:set the (?:topic|channel (?:purpose|description))).*$/gim, "");
  text = text.replace(/^.*(?:pinned|unpinned) a message.*$/gim, "");
  text = text.replace(/\s*\(edited\)/gi, "");
  // Zoom/Teams/Meet noise
  text = text.replace(/^.*(?:is sharing (?:their )?screen|started recording|stopped recording|has (?:joined|left) the meeting).*$/gim, "");
  text = text.replace(/^\s*(?:Recording (?:started|stopped|in progress)).*$/gim, "");
  text = text.replace(/^\s*\d{1,2}:\d{2}:\d{2}\s*$/gm, ""); // bare timestamps like "10:30:45"

  // ═══ PHASE 3: Remove conversational filler & noise ═══
  // Full-line filler (greeting/closing/meta lines that carry no info)
  const fillerLines = [
    /^\s*(?:hey|hi|hello|yo)\s+(?:everyone|team|all|folks|guys|there)[!.,]?\s*$/i,
    /^\s*(?:good )?(?:morning|afternoon|evening)\s*(?:everyone|team|all|folks)?[!.,]?\s*$/i,
    /^\s*(?:thanks|thank you|thx|ty)\s*(?:everyone|team|all|folks)?[!.,]?\s*$/i,
    /^\s*(?:best|regards|cheers|talk soon|ttyl|bye|see you)[!.,]?\s*$/i,
    /^\s*(?:hope (?:this|everyone|you|all)[\w\s]*)[!.,]?\s*$/i,
    /^\s*(?:let me know if (?:you have )?(?:any )?questions)[!.,]?\s*$/i,
    /^\s*(?:(?:ok|okay|sure|sounds good|got it|noted|ack|roger|perfect|great|awesome|nice|cool)[!.,]?\s*)$/i,
    /^\s*(?:can everyone (?:see|hear) (?:me|my screen)\??)\s*$/i,
    /^\s*(?:(?:I'll|let me) (?:take|capture|write|jot)[\w\s]*notes?)\s*$/i,
    /^\s*(?:(?:shall|should|can) we (?:get started|begin|kick off|move on)\??)\s*$/i,
    /^\s*(?:any(?:thing else| other (?:thoughts|questions|updates))\??)\s*$/i,
    /^\s*(?:(?:nothing|nope|nah|no(?:thing)?) (?:from|on) my (?:end|side))[!.,]?\s*$/i,
    /^\s*(?:I (?:think|believe) (?:that(?:'s| is) (?:it|all|everything)))[!.,]?\s*$/i,
    /^\s*(?:moving on|next (?:topic|item|up)|anyway|anywho|so yeah)[!.,]?\s*$/i,
    /^\s*[-=_*]{3,}\s*$/,  // separator lines: "---", "===", "***"
    /^\s*(?:#{1,6}\s*)?\s*$/,  // empty headers
  ];
  const lines = text.split("\n");
  const cleaned = lines.filter(line => !fillerLines.some(rx => rx.test(line)));
  text = cleaned.join("\n");

  // ═══ PHASE 4: Tighten language (inline content cleanup) ═══
  // Wordy → concise substitutions
  const wordySubs = [
    [/\bin order to\b/gi, "to"],
    [/\bat this point in time\b/gi, "now"],
    [/\bat the end of the day\b/gi, "ultimately"],
    [/\bdue to the fact that\b/gi, "because"],
    [/\bin the event that\b/gi, "if"],
    [/\bfor the purpose of\b/gi, "to"],
    [/\bwith regard to\b/gi, "regarding"],
    [/\bin terms of\b/gi, "for"],
    [/\ba large number of\b/gi, "many"],
    [/\ba majority of\b/gi, "most"],
    [/\bat the present time\b/gi, "now"],
    [/\bin the near future\b/gi, "soon"],
    [/\bin the process of\b/gi, ""],
    [/\bon a daily basis\b/gi, "daily"],
    [/\bon a weekly basis\b/gi, "weekly"],
    [/\bprior to\b/gi, "before"],
    [/\bsubsequent to\b/gi, "after"],
    [/\bhas the ability to\b/gi, "can"],
    [/\bis able to\b/gi, "can"],
    [/\bmake a decision\b/gi, "decide"],
    [/\bhave a discussion\b/gi, "discuss"],
    [/\bprovide an update\b/gi, "update"],
    [/\btake a look at\b/gi, "review"],
    [/\bcircle back on\b/gi, "revisit"],
    [/\bloop (?:back|in) on\b/gi, "follow up on"],
    [/\bput a pin in\b/gi, "defer"],
    [/\btable (?:this|that) for now\b/gi, "defer"],
    [/\btouch base (?:on|about|regarding)\b/gi, "discuss"],
    [/\bsync (?:up )?(?:on|about|regarding)\b/gi, "discuss"],
    [/\bget on the same page (?:about|regarding|on)\b/gi, "align on"],
  ];
  for (const [pattern, replacement] of wordySubs) {
    text = text.replace(pattern, replacement);
  }

  // Remove hedging/filler prefixes from lines (keep the substance)
  text = text.replace(/^(•\s*)?(?:I (?:just )?(?:think|believe|feel like|guess|suppose|wanted to say|want to mention)(?:\s+that)?\s+)/gim, "$1");
  text = text.replace(/^(•\s*)?(?:(?:So )?basically,?\s+)/gim, "$1");
  text = text.replace(/^(•\s*)?(?:Just (?:a )?(?:quick|brief|small)\s+(?:update|note|fyi|heads up)[:\s-]*)/gim, "$1");
  text = text.replace(/^(•\s*)?(?:(?:Quick|Brief)\s+(?:update|note|fyi|heads up)[:\s-]*)/gim, "$1");
  text = text.replace(/^(•\s*)?(?:Wanted to (?:flag|mention|note|share|bring up|call out)(?:\s+that)?\s+)/gim, "$1");
  text = text.replace(/^(•\s*)?(?:It(?:'s| is) worth (?:noting|mentioning)(?:\s+that)?\s+)/gim, "$1");
  text = text.replace(/^(•\s*)?(?:As (?:I |we )?(?:mentioned|discussed|talked about)(?:\s+(?:earlier|before|previously))?,?\s+)/gim, "$1");
  text = text.replace(/^(•\s*)?(?:As (?:you (?:all )?)?know,?\s+)/gim, "$1");
  // Remove trailing filler
  text = text.replace(/,?\s+(?:if that makes sense|you know what I mean|so yeah|or something like that|or whatever|and stuff)\s*\.?\s*$/gim, ".");
  // Clean up doubled spaces from removals
  text = text.replace(/  +/g, " ");

  // ═══ PHASE 5: Deduplicate ═══
  const deduped = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    const normalized = line.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (normalized.length < 4) { deduped.push(line); continue; } // keep blanks/short
    if (!seen.has(normalized)) { seen.add(normalized); deduped.push(line); }
  }
  text = deduped.join("\n");

  // ═══ PHASE 6: Normalise structure ═══
  // Bullets
  text = text.replace(/^[\u2022\u2023\u25E6\u2043\u2219●○◦⁃]\s*/gm, "• ");
  text = text.replace(/^[-*]\s+/gm, "• ");
  text = text.replace(/^(\d+)[.)]\s+/gm, "$1. ");
  // ALL CAPS headers → title case
  text = text.replace(/^([A-Z][A-Z &/,:-]{8,60})$/gm, (match) => {
    const title = match.trim().replace(/[:\-]+$/, "").trim();
    const tc = title.split(/\s+/).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
    return `\n## ${tc}`;
  });
  // Label-like lines ending with ":"
  text = text.replace(/^(?!•)(?!\d)(?!\*\*)([A-Z][A-Za-z0-9 /&,-]{2,40}):\s*$/gm, "\n## $1");

  // ═══ PHASE 7: Classify action-like lines ═══
  text = text.replace(/^•?\s*(?:ACTION ITEM|Action item|Action Item)[s]?[:\-–]\s*/gm, "→ ACTION: ");
  text = text.replace(/^•?\s*(?:TODO|To-?do|To Do)[:\-–]\s*/gm, "→ TODO: ");
  text = text.replace(/^•?\s*(?:FOLLOW[- ]?UP|Follow[- ]?up)[:\-–]\s*/gm, "→ FOLLOW-UP: ");
  text = text.replace(/^•?\s*(?:NEXT STEP|Next step)[s]?[:\-–]\s*/gm, "→ NEXT: ");
  text = text.replace(/^•?\s*(?:DECISION|Decision)[:\-–]\s*/gm, "★ DECISION: ");
  text = text.replace(/^\[[\sx]\]\s*/gm, (m) => m.includes("x") ? "✓ " : "→ TODO: ");
  // Infer action items from strong imperative patterns not already tagged
  text = text.replace(/^•\s+((?:Schedule|Send|Draft|Create|Set up|Write|Prepare|Review|Update|Share|Submit|Confirm|Book|Arrange|Coordinate|Finalize|Complete|Ship|Deploy|Fix|Resolve|Investigate|Research|Reach out|Contact|Email|Ping|Ask|Check|Verify|Test)\s.{8,})/gim, "→ TODO: $1");
  // Infer decisions from "we decided", "agreed to", "going with"
  text = text.replace(/^•?\s*(?:We (?:decided|agreed)(?: to)?|(?:Going|Went) with|Final call:)\s+(.+)/gim, "★ DECISION: $1");
  // Infer follow-ups from "@name will", "@name to", "waiting on"
  text = text.replace(/^•?\s*(?:@\w+\s+(?:will|to|should|needs? to)\s+)(.+)/gim, "→ FOLLOW-UP: $&");
  text = text.replace(/^•?\s*(?:Waiting on|Blocked by|Pending|Need(?:s)? (?:input|response|approval) from)\s+(.+)/gim, "→ FOLLOW-UP: $&");

  // ═══ PHASE 8: Restructure — gather actions & decisions to bottom ═══
  const finalLines = text.split("\n");
  const bodyLines = [];
  const actionLines = [];
  const decisionLines = [];
  const doneLines = [];

  for (const line of finalLines) {
    if (line.startsWith("→ ")) actionLines.push(line);
    else if (line.startsWith("★ ")) decisionLines.push(line);
    else if (line.startsWith("✓ ")) doneLines.push(line);
    else bodyLines.push(line);
  }

  // Remove trailing blank lines from body
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();

  // Rebuild with sections
  let result = bodyLines.join("\n");
  if (decisionLines.length > 0) {
    result += "\n\n## Decisions\n\n" + decisionLines.join("\n");
  }
  if (actionLines.length > 0) {
    result += "\n\n## Action Items\n\n" + actionLines.join("\n");
  }
  if (doneLines.length > 0) {
    result += "\n\n" + doneLines.join("\n");
  }

  // ═══ PHASE 9: Final whitespace cleanup ═══
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/^\n+/, "");
  // Ensure spacing before headers
  result = result.replace(/([^\n])\n(## )/g, "$1\n\n$2");
  // Capitalise first letter of bullet content
  result = result.replace(/^(• )([a-z])/gm, (_, p, c) => p + c.toUpperCase());
  // Remove orphan bullets (bullet with only 1-2 chars)
  result = result.replace(/^• .{1,2}\s*$/gm, "");

  return result.trim();
}

// ─── Rich text renderer ─────────────────────────────────────────────
function renderInline(text) {
  if (!text) return null;
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(#[a-zA-Z0-9_-]+))/g;
  let lastIndex = 0, match, key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    if (match[2]) parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++} style={{ fontStyle: "italic", color: C.textMuted }}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} style={{ background: C.surface, padding: "1px 5px", borderRadius: 4, fontSize: 12, fontFamily: "monospace" }}>{match[4]}</code>);
    else if (match[5]) parts.push(<span key={key++} style={{ color: C.accentLight, fontWeight: 500, fontSize: 12 }}>{match[5]}</span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : text;
}

function RichNote({ text, style = {} }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") { elements.push(<div key={i} style={{ height: 10 }} />); continue; }
    if (line.startsWith("## ")) {
      elements.push(<div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.accentLight, marginTop: 14, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>{line.slice(3)}</div>);
      continue;
    }
    if (line.startsWith("→ ")) {
      const m = line.match(/^→ ([A-Z-]+):\s*(.*)/);
      if (m) {
        const lc = m[1] === "TODO" ? C.amber : m[1] === "ACTION" ? C.red : m[1].includes("FOLLOW") ? C.blue : C.accent;
        elements.push(
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 10px", marginBottom: 4, borderRadius: 8, background: `${lc}10`, borderLeft: `3px solid ${lc}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: lc, background: `${lc}20`, padding: "1px 6px", borderRadius: 4, flexShrink: 0, marginTop: 2 }}>{m[1]}</span>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>{renderInline(m[2])}</span>
          </div>
        );
      } else {
        elements.push(<div key={i} style={{ padding: "4px 10px", marginBottom: 3, borderLeft: `3px solid ${C.amber}`, fontSize: 13, lineHeight: 1.5 }}>{renderInline(line.slice(2))}</div>);
      }
      continue;
    }
    if (line.startsWith("★ ")) {
      const content = line.replace(/^★\s*DECISION:\s*/, "");
      elements.push(
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px", marginBottom: 4, borderRadius: 8, background: C.greenBg, borderLeft: `3px solid ${C.green}` }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: `${C.green}20`, padding: "1px 6px", borderRadius: 4, flexShrink: 0, marginTop: 2 }}>DECISION</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, fontWeight: 500 }}>{renderInline(content)}</span>
        </div>
      );
      continue;
    }
    if (line.startsWith("✓ ")) {
      elements.push(<div key={i} style={{ fontSize: 13, lineHeight: 1.5, padding: "2px 10px", color: C.textDim, textDecoration: "line-through", display: "flex", gap: 6, alignItems: "center" }}><span style={{ color: C.green }}>✓</span> {line.slice(2)}</div>);
      continue;
    }
    if (line.startsWith("• ")) {
      elements.push(<div key={i} style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 16, position: "relative", marginBottom: 3 }}><span style={{ position: "absolute", left: 0, color: C.accent }}>•</span>{renderInline(line.slice(2))}</div>);
      continue;
    }
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      elements.push(<div key={i} style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 22, position: "relative", marginBottom: 3 }}><span style={{ position: "absolute", left: 0, color: C.accent, fontWeight: 600, fontSize: 12 }}>{numMatch[1]}.</span>{renderInline(numMatch[2])}</div>);
      continue;
    }
    if (line.startsWith("**") && line.includes("**")) {
      const sm = line.match(/^\*\*(.+?)\*\*\s*(.*)/);
      if (sm) { elements.push(<div key={i} style={{ fontSize: 13, fontWeight: 600, color: C.accentLight, marginTop: 10, marginBottom: 2 }}>{sm[1]} <span style={{ fontWeight: 400, color: C.textDim, fontSize: 11 }}>{sm[2]}</span></div>); continue; }
    }
    elements.push(<div key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 4 }}>{renderInline(line)}</div>);
  }
  return <div style={style}>{elements}</div>;
}

// ─── Action extraction ──────────────────────────────────────────────
function extractActions(text) {
  const patterns = [/(?:action item|todo|to-do|task|follow[- ]?up|next step)[s]?[:\-–]\s*(.+)/gi, /\[\s*\]\s*(.+)/g, /^•\s*(?:TODO|ACTION|FOLLOW[- ]?UP)[:\s]+(.+)/gim];
  const items = [];
  for (const p of patterns) { let m; while ((m = p.exec(text)) !== null) { const t = m[1].trim(); if (t.length > 3 && !items.includes(t)) items.push(t); } }
  return items;
}
function extractTags(text) {
  const matches = text.match(/#[a-zA-Z0-9_-]+/g) || [];
  return [...new Set(matches.map((t) => t.toLowerCase()))];
}

// ─── Colour palette ─────────────────────────────────────────────────
const C = {
  bg: "#0f1117", surface: "#1a1d27", surfaceHover: "#222531", card: "#1e2130", cardHover: "#262a3b",
  border: "#2a2e3d", borderFocus: "#6366f1", text: "#e2e4eb", textMuted: "#8b8fa3", textDim: "#5c6078",
  accent: "#6366f1", accentLight: "#818cf8", accentBg: "rgba(99,102,241,0.12)",
  green: "#22c55e", greenBg: "rgba(34,197,94,0.12)", amber: "#f59e0b", amberBg: "rgba(245,158,11,0.12)",
  red: "#ef4444", redBg: "rgba(239,68,68,0.12)", blue: "#3b82f6", blueBg: "rgba(59,130,246,0.12)",
};

const KANBAN_COLS = [
  { key: "todo", label: "To Do", color: C.amber, bg: C.amberBg },
  { key: "in_progress", label: "In Progress", color: C.blue, bg: C.blueBg },
  { key: "done", label: "Done", color: C.green, bg: C.greenBg },
];
const PRIORITY_COLORS = {
  high: { color: C.red, bg: C.redBg, label: "High" },
  medium: { color: C.amber, bg: C.amberBg, label: "Med" },
  low: { color: C.green, bg: C.greenBg, label: "Low" },
};

// ─── Sample data ────────────────────────────────────────────────────
const SAMPLE_NOTES = [
  { id: uid(), title: "Product Sync — March 3", body: "## Product Sync\n\nDiscussed Q2 roadmap priorities with the full product team.\n\n## Key Updates\n\n• Mobile app redesign kicks off March 15\n• API v3 migration — need timeline from backend team\n• Customer feedback dashboard MVP due end of month\n• Design system tokens are now live in Figma\n\n## Decisions\n\n★ DECISION: Going with React Native for the mobile rewrite over Flutter\n★ DECISION: API v3 will be a breaking change — 90-day deprecation window\n\n→ ACTION: Schedule design review with Sarah by Friday\n→ FOLLOW-UP: Get API migration estimate from DevOps\n→ TODO: Draft Q2 OKRs and share with leadership\n→ NEXT: Share updated timeline with stakeholders by EOW\n\n#product #q2-planning #roadmap", source: "manual", tags: ["#product", "#q2-planning", "#roadmap"], createdAt: "2026-03-03T10:30:00Z", archived: false },
  { id: uid(), title: "1:1 with Manager — Feb 28", body: "## Career Growth Check-in\n\nTalked about growth areas and upcoming projects.\n\n• Take lead on the analytics integration project\n• Presentation skills workshop available in April\n• Performance review cycle starts March 20\n\n## Action Items\n\n→ TODO: Write self-review draft by March 18\n→ FOLLOW-UP: Register for presentation workshop\n→ TODO: Set up weekly 1:1 with the analytics team lead\n\n#1on1 #career #growth", source: "manual", tags: ["#1on1", "#career", "#growth"], createdAt: "2026-02-28T14:00:00Z", archived: false },
  { id: uid(), title: "Slack Standup — March 4", body: "**Sarah Chen** (9:15 AM):\n• Finished the onboarding flow mockups\n• Starting user testing scripts today\n→ TODO: Share mockups in #design-reviews by noon\n\n**Mike R.** (9:22 AM):\n• API rate limiter is deployed to staging\n• Found a bug in the auth token refresh — investigating\n→ ACTION: Fix token refresh bug before release\n\n**Jon** (9:30 AM):\n• Reviewed Q2 budget with finance\n★ DECISION: Approved headcount for 2 more engineers\n→ NEXT: Post job descriptions by Friday\n\n#standup #daily #engineering", source: "slack", tags: ["#standup", "#daily", "#engineering"], createdAt: "2026-03-04T09:30:00Z", archived: false },
];
const SAMPLE_ACTIONS = [
  { id: uid(), text: "Schedule design review with Sarah by Friday", status: "todo", priority: "high", tags: ["#product"], noteId: SAMPLE_NOTES[0].id, createdAt: "2026-03-03T10:30:00Z", dueDate: "2026-03-07" },
  { id: uid(), text: "Get API migration estimate from DevOps", status: "todo", priority: "medium", tags: ["#product"], noteId: SAMPLE_NOTES[0].id, createdAt: "2026-03-03T10:30:00Z", dueDate: "" },
  { id: uid(), text: "Draft Q2 OKRs and share with leadership", status: "in_progress", priority: "high", tags: ["#product", "#q2-planning"], noteId: SAMPLE_NOTES[0].id, createdAt: "2026-03-03T10:30:00Z", dueDate: "2026-03-14" },
  { id: uid(), text: "Share updated timeline with stakeholders by EOW", status: "todo", priority: "medium", tags: ["#product"], noteId: SAMPLE_NOTES[0].id, createdAt: "2026-03-03T10:30:00Z", dueDate: "2026-03-07" },
  { id: uid(), text: "Write self-review draft by March 18", status: "todo", priority: "high", tags: ["#career"], noteId: SAMPLE_NOTES[1].id, createdAt: "2026-02-28T14:00:00Z", dueDate: "2026-03-18" },
  { id: uid(), text: "Register for presentation workshop", status: "done", priority: "low", tags: ["#growth"], noteId: SAMPLE_NOTES[1].id, createdAt: "2026-02-28T14:00:00Z", dueDate: "" },
  { id: uid(), text: "Share mockups in #design-reviews by noon", status: "in_progress", priority: "medium", tags: ["#standup", "#engineering"], noteId: SAMPLE_NOTES[2].id, createdAt: "2026-03-04T09:30:00Z", dueDate: "2026-03-04" },
  { id: uid(), text: "Fix token refresh bug before release", status: "todo", priority: "high", tags: ["#engineering"], noteId: SAMPLE_NOTES[2].id, createdAt: "2026-03-04T09:30:00Z", dueDate: "" },
  { id: uid(), text: "Post job descriptions by Friday", status: "todo", priority: "medium", tags: ["#engineering"], noteId: SAMPLE_NOTES[2].id, createdAt: "2026-03-04T09:30:00Z", dueDate: "2026-03-07" },
];

// ─── Icons ──────────────────────────────────────────────────────────
const Icon = ({ d, size = 18, color = C.textMuted, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}><path d={d} /></svg>
);
const I = {
  search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
  plus: "M12 5v14M5 12h14",
  note: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6",
  kanban: "M3 3h6v18H3zM9 3h6v12H9zM15 3h6v8h-6z",
  tag: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  clock: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2",
  brain: "M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7zM9 22h6",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  grip: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  slack: "M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zM20 10h-1.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5H20c.83 0 1.5.67 1.5 1.5S20.83 10 20 10z",
  paste: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  archive: "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
  restore: "M3 12a9 9 0 1018 0 9 9 0 00-18 0zM3 12h4M12 8v4l3 3",
  sort: "M3 6h7M3 12h5M3 18h3M16 6v12M13 15l3 3 3-3",
  keyboard: "M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8",
};

// ─── Reusable Components ────────────────────────────────────────────
const Badge = ({ label, color, bg, onRemove, style = {} }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600, color, background: bg, whiteSpace: "nowrap", ...style }}>
    {label}{onRemove && <span onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ cursor: "pointer", marginLeft: 2, opacity: 0.7 }}>×</span>}
  </span>
);

const Btn = ({ children, onClick, variant = "default", style = {}, disabled = false, title = "", ...rest }) => {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, transition: "all 0.15s", opacity: disabled ? 0.5 : 1 };
  const v = { default: { background: C.surface, color: C.text, border: `1px solid ${C.border}` }, primary: { background: C.accent, color: "#fff" }, ghost: { background: "transparent", color: C.textMuted, padding: "5px 8px" }, danger: { background: C.redBg, color: C.red }, success: { background: C.greenBg, color: C.green } };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...v[variant], ...style }} title={title} {...rest}>{children}</button>;
};

const Input = ({ style = {}, ...props }) => (
  <input {...props} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, outline: "none", ...style }} onFocus={(e) => (e.target.style.borderColor = C.borderFocus)} onBlur={(e) => (e.target.style.borderColor = C.border)} />
);

const Textarea = ({ style = {}, ...props }) => (
  <textarea {...props} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", minHeight: 120, ...style }} onFocus={(e) => (e.target.style.borderColor = C.borderFocus)} onBlur={(e) => (e.target.style.borderColor = C.border)} />
);

const Select = ({ value, onChange, children, style = {} }) => (
  <select value={value} onChange={onChange} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, outline: "none", cursor: "pointer", ...style }}>{children}</select>
);

// ─── Toast notification ─────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "fadeIn 0.2s" }}>
      {message}
    </div>
  );
}

// ─── Keyboard shortcut help modal ───────────────────────────────────
function ShortcutHelp({ onClose }) {
  const shortcuts = [
    ["Ctrl + N", "New note"],
    ["Ctrl + K", "Focus search"],
    ["Ctrl + 1", "Go to Dashboard"],
    ["Ctrl + 2", "Go to Notes"],
    ["Ctrl + 3", "Go to Action Board"],
    ["Ctrl + E", "Export data"],
    ["Ctrl + I", "Import data"],
    ["Escape", "Close modal / Back"],
    ["?", "Show this help"],
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 400, padding: 24, borderRadius: 16, background: C.card, border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Keyboard Shortcuts</h3>
          <Btn variant="ghost" onClick={onClose}><Icon d={I.x} size={16} /></Btn>
        </div>
        {shortcuts.map(([key, desc]) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>{desc}</span>
            <kbd style={{ background: C.surface, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", color: C.accentLight, border: `1px solid ${C.border}` }}>{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════════════
export default function SecondBrainDashboard() {
  const [view, setView] = useState("dashboard");
  const [notes, setNotes] = useState(SAMPLE_NOTES);
  const [actions, setActions] = useState(SAMPLE_ACTIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [dragItem, setDragItem] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState("newest"); // newest, oldest, title, source
  const [toast, setToast] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Intake state
  const [intakeMode, setIntakeMode] = useState("paste");
  const [intakeTitle, setIntakeTitle] = useState("");
  const [intakeBody, setIntakeBody] = useState("");
  const [intakeAutoClean, setIntakeAutoClean] = useState(true);
  const [intakeAutoExtract, setIntakeAutoExtract] = useState(true);

  // Edit states
  const [editingAction, setEditingAction] = useState(null);
  const [editingNote, setEditingNote] = useState(null); // { id, title, body, tags }

  const searchRef = useRef(null);
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "n") { e.preventDefault(); setView("intake"); }
      else if (ctrl && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); }
      else if (ctrl && e.key === "1") { e.preventDefault(); setView("dashboard"); }
      else if (ctrl && e.key === "2") { e.preventDefault(); setView("notes"); }
      else if (ctrl && e.key === "3") { e.preventDefault(); setView("kanban"); }
      else if (ctrl && e.key === "e") { e.preventDefault(); handleExport(); }
      else if (ctrl && e.key === "i") { e.preventDefault(); importInputRef.current?.click(); }
      else if (e.key === "Escape") {
        if (editingAction) setEditingAction(null);
        else if (editingNote) setEditingNote(null);
        else if (showShortcuts) setShowShortcuts(false);
        else if (view === "noteDetail") setView("notes");
        else if (view === "intake") setView("notes");
      }
      else if (e.key === "?" && !ctrl && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault(); setShowShortcuts(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, editingAction, editingNote, showShortcuts]);

  // ── Export ──
  const handleExport = () => {
    const data = JSON.stringify({ notes, actions, exportedAt: now() }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    setToast("Data exported successfully");
  };

  // ── Import ──
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.notes && Array.isArray(data.notes)) {
          setNotes(data.notes.map(n => ({ ...n, archived: n.archived ?? false })));
        }
        if (data.actions && Array.isArray(data.actions)) setActions(data.actions);
        setToast(`Imported ${data.notes?.length || 0} notes and ${data.actions?.length || 0} actions`);
      } catch { setToast("Failed to parse import file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── File upload for note intake ──
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setIntakeBody(ev.target.result);
      if (!intakeTitle) setIntakeTitle(file.name.replace(/\.(txt|md|text|markdown)$/i, ""));
      setToast(`Loaded "${file.name}"`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Drop handler for file upload ──
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.(txt|md|text|markdown)$/i.test(file.name)) { setToast("Only .txt and .md files supported"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setIntakeBody(ev.target.result);
      if (!intakeTitle) setIntakeTitle(file.name.replace(/\.(txt|md|text|markdown)$/i, ""));
      setToast(`Loaded "${file.name}"`);
    };
    reader.readAsText(file);
  }, [intakeTitle]);

  // ── All tags ──
  const allTags = [...new Set([...notes.filter(n => !n.archived).flatMap((n) => n.tags), ...actions.flatMap((a) => a.tags)])].sort();

  // ── Search + filter ──
  const q = searchQuery.toLowerCase();
  const filterNote = (n) => {
    if (!showArchived && n.archived) return false;
    if (showArchived && !n.archived) return false;
    const matchesSearch = !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q));
    const matchesTags = selectedTags.length === 0 || selectedTags.every((t) => n.tags.includes(t));
    return matchesSearch && matchesTags;
  };
  const filterAction = (a) => {
    const matchesSearch = !q || a.text.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q));
    const matchesTags = selectedTags.length === 0 || selectedTags.every((t) => a.tags.includes(t));
    return matchesSearch && matchesTags;
  };

  // ── Sort notes ──
  const sortNotes = (list) => {
    const sorted = [...list];
    if (sortBy === "newest") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortBy === "oldest") sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sortBy === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "source") sorted.sort((a, b) => a.source.localeCompare(b.source));
    return sorted;
  };

  const filteredNotes = sortNotes(notes.filter(filterNote));
  const filteredActions = actions.filter(filterAction);

  // ── Note CRUD ──
  const handleSaveNote = () => {
    if (!intakeBody.trim()) return;
    const cleaned = intakeAutoClean ? cleanNote(intakeBody) : intakeBody.trim();
    const tags = extractTags(cleaned);
    const title = intakeTitle.trim() || cleaned.split("\n")[0].slice(0, 60) || "Untitled Note";
    const note = { id: uid(), title, body: cleaned, source: intakeMode, tags, createdAt: now(), archived: false };
    setNotes((prev) => [note, ...prev]);
    if (intakeAutoExtract) {
      const extracted = extractActions(cleaned);
      if (extracted.length > 0) {
        const newActions = extracted.map((t) => ({ id: uid(), text: t, status: "todo", priority: "medium", tags, noteId: note.id, createdAt: now(), dueDate: "" }));
        setActions((prev) => [...newActions, ...prev]);
      }
    }
    setIntakeTitle(""); setIntakeBody("");
    setToast("Note saved"); setView("notes");
  };

  const handleUpdateNote = () => {
    if (!editingNote) return;
    const tags = extractTags(editingNote.body);
    setNotes((prev) => prev.map((n) => n.id === editingNote.id ? { ...n, title: editingNote.title, body: editingNote.body, tags } : n));
    if (selectedNote?.id === editingNote.id) setSelectedNote({ ...selectedNote, title: editingNote.title, body: editingNote.body, tags });
    setEditingNote(null);
    setToast("Note updated");
  };

  const archiveNote = (id) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, archived: true } : n));
    if (selectedNote?.id === id) { setSelectedNote(null); setView("notes"); }
    setToast("Note archived");
  };
  const restoreNote = (id) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, archived: false } : n));
    setToast("Note restored");
  };
  const deleteNote = (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setActions((prev) => prev.filter((a) => a.noteId !== id));
    if (selectedNote?.id === id) { setSelectedNote(null); setView("notes"); }
    setToast("Note permanently deleted");
  };

  // ── Action CRUD ──
  const updateAction = (id, updates) => setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  const deleteAction = (id) => setActions((prev) => prev.filter((a) => a.id !== id));
  const addAction = () => {
    const a = { id: uid(), text: "New action item", status: "todo", priority: "medium", tags: [], noteId: null, createdAt: now(), dueDate: "" };
    setActions((prev) => [a, ...prev]);
    setEditingAction(a);
  };

  // ── Kanban drag ──
  const handleDragStart = (actionId) => setDragItem(actionId);
  const handleKanbanDrop = (newStatus) => { if (dragItem) { updateAction(dragItem, { status: newStatus }); setDragItem(null); } };

  // ── Stats ──
  const activeNotes = notes.filter(n => !n.archived);
  const stats = {
    totalNotes: activeNotes.length,
    totalActions: actions.filter((a) => a.status !== "done").length,
    overdue: actions.filter((a) => a.dueDate && a.status !== "done" && new Date(a.dueDate) < new Date()).length,
    doneThisWeek: actions.filter((a) => { if (a.status !== "done") return false; const d = new Date(a.createdAt); const week = new Date(); week.setDate(week.getDate() - 7); return d >= week; }).length,
  };

  // ── Responsive sidebar ──
  const sideW = sidebarOpen ? 220 : 0;

  // ═══════════════════════════════════════════════════════════════════
  // VIEWS
  // ═══════════════════════════════════════════════════════════════════

  const DashboardView = () => (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <Icon d={I.brain} size={24} color={C.accent} /> Dashboard
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Notes", value: stats.totalNotes, color: C.accent, icon: I.note },
          { label: "Open Actions", value: stats.totalActions, color: C.amber, icon: I.kanban },
          { label: "Overdue", value: stats.overdue, color: C.red, icon: I.clock },
          { label: "Done This Week", value: stats.doneThisWeek, color: C.green, icon: I.check },
        ].map((s) => (
          <div key={s.label} style={{ padding: "18px 20px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Icon d={s.icon} size={16} color={s.color} />
              <span style={{ fontSize: 12, color: C.textMuted }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Recent Notes</h3>
            <Btn variant="ghost" onClick={() => setView("notes")} style={{ fontSize: 12 }}>View all →</Btn>
          </div>
          {activeNotes.slice(0, 3).map((note) => (
            <div key={note.id} onClick={() => { setSelectedNote(note); setView("noteDetail"); }} style={{ padding: 14, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{note.title}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>{note.body.replace(/[#*→★•\n]/g, " ").slice(0, 100)}…</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {note.tags.slice(0, 3).map((t) => <Badge key={t} label={t} color={C.accentLight} bg={C.accentBg} />)}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Urgent Actions</h3>
            <Btn variant="ghost" onClick={() => setView("kanban")} style={{ fontSize: 12 }}>View board →</Btn>
          </div>
          {actions.filter((a) => a.status !== "done" && a.priority === "high").slice(0, 5).map((a) => {
            const isOverdue = a.dueDate && new Date(a.dueDate) < new Date();
            return (
              <div key={a.id} style={{ padding: 12, borderRadius: 10, background: C.card, border: `1px solid ${isOverdue ? C.red + "40" : C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, flex: 1 }}>{a.text}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {isOverdue && <Badge label="OVERDUE" color={C.red} bg={C.redBg} />}
                  {a.dueDate && <span style={{ fontSize: 11, color: isOverdue ? C.red : C.textDim }}>{fmt(a.dueDate)}</span>}
                </div>
              </div>
            );
          })}
          {actions.filter((a) => a.status !== "done" && a.priority === "high").length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 13 }}>No urgent actions — nice work!</div>
          )}
        </div>
      </div>
    </div>
  );

  const NotesView = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon d={showArchived ? I.archive : I.note} size={24} color={C.accent} />
          {showArchived ? "Archive" : "Notes"}
          <span style={{ fontSize: 13, fontWeight: 400, color: C.textMuted }}>({filteredNotes.length})</span>
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn variant={showArchived ? "success" : "ghost"} onClick={() => setShowArchived(!showArchived)} title="Toggle archive">
            <Icon d={I.archive} size={14} color={showArchived ? C.green : C.textMuted} /> {showArchived ? "Active" : "Archive"}
          </Btn>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon d={I.sort} size={14} />
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title A-Z</option>
              <option value="source">Source</option>
            </Select>
          </div>
          <Btn variant="primary" onClick={() => setView("intake")}>
            <Icon d={I.plus} size={14} color="#fff" /> Add Note
          </Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {filteredNotes.map((note) => (
          <div key={note.id} onClick={() => { setSelectedNote(note); setView("noteDetail"); }} style={{ padding: 16, borderRadius: 12, background: C.card, border: `1px solid ${note.archived ? C.textDim + "30" : C.border}`, cursor: "pointer", opacity: note.archived ? 0.7 : 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{note.title}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
              {note.body.replace(/[#*→★•\n]/g, " ").slice(0, 150)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {note.tags.slice(0, 4).map((t) => <Badge key={t} label={t} color={C.accentLight} bg={C.accentBg} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textDim }}>{fmt(note.createdAt)}</span>
              <Badge label={note.source} color={C.textMuted} bg={C.surface} />
            </div>
          </div>
        ))}
      </div>
      {filteredNotes.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>
          {showArchived ? "No archived notes." : searchQuery || selectedTags.length ? "No notes match your search." : "No notes yet. Add your first one!"}
        </div>
      )}
    </div>
  );

  const NoteDetailView = () => {
    if (!selectedNote) return null;
    const note = notes.find(n => n.id === selectedNote.id) || selectedNote;
    const noteActions = actions.filter((a) => a.noteId === note.id);
    return (
      <div>
        <Btn variant="ghost" onClick={() => { setView("notes"); setSelectedNote(null); }} style={{ marginBottom: 16 }}>
          <Icon d={I.arrowLeft} size={14} /> Back to Notes
        </Btn>
        <div style={{ padding: 24, borderRadius: 14, background: C.card, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{note.title}</h2>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="ghost" onClick={() => setEditingNote({ id: note.id, title: note.title, body: note.body })} title="Edit note">
                <Icon d={I.edit} size={14} color={C.accent} />
              </Btn>
              {note.archived ? (
                <Btn variant="success" onClick={() => restoreNote(note.id)} style={{ fontSize: 12 }}>
                  <Icon d={I.restore} size={13} color={C.green} /> Restore
                </Btn>
              ) : (
                <Btn onClick={() => archiveNote(note.id)} style={{ fontSize: 12 }}>
                  <Icon d={I.archive} size={13} /> Archive
                </Btn>
              )}
              <Btn variant="danger" onClick={() => deleteNote(note.id)} style={{ fontSize: 12 }}>
                <Icon d={I.trash} size={13} color={C.red} /> Delete
              </Btn>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.textDim }}>{fmtTime(note.createdAt)}</span>
            <Badge label={note.source} color={C.textMuted} bg={C.surface} />
            {note.archived && <Badge label="Archived" color={C.textDim} bg={C.surface} />}
            {note.tags.map((t) => <Badge key={t} label={t} color={C.accentLight} bg={C.accentBg} />)}
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <RichNote text={note.body} />
          </div>
        </div>
        {noteActions.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Linked Action Items ({noteActions.length})</h3>
            {noteActions.map((a) => {
              const pri = PRIORITY_COLORS[a.priority];
              const col = KANBAN_COLS.find((c) => c.key === a.status);
              return (
                <div key={a.id} style={{ padding: 12, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, textDecoration: a.status === "done" ? "line-through" : "none", opacity: a.status === "done" ? 0.6 : 1 }}>{a.text}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Badge label={col?.label} color={col?.color} bg={col?.bg} />
                    <Badge label={pri.label} color={pri.color} bg={pri.bg} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const KanbanView = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon d={I.kanban} size={24} color={C.accent} /> Action Board
        </h2>
        <Btn variant="primary" onClick={addAction}>
          <Icon d={I.plus} size={14} color="#fff" /> Add Action
        </Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {KANBAN_COLS.map((col) => {
          const colActions = filteredActions.filter((a) => a.status === col.key);
          return (
            <div key={col.key} onDragOver={(e) => e.preventDefault()} onDrop={() => handleKanbanDrop(col.key)} style={{ background: C.surface, borderRadius: 14, padding: 14, border: `1px solid ${C.border}`, minHeight: 300 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${col.color}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: col.color }}>{col.label}</span>
                <span style={{ fontSize: 12, color: C.textDim, background: C.bg, padding: "2px 8px", borderRadius: 99 }}>{colActions.length}</span>
              </div>
              {colActions.map((action) => {
                const pri = PRIORITY_COLORS[action.priority];
                const isOverdue = action.dueDate && action.status !== "done" && new Date(action.dueDate) < new Date();
                return (
                  <div key={action.id} draggable onDragStart={() => handleDragStart(action.id)} style={{ padding: 12, borderRadius: 10, background: C.card, border: `1px solid ${isOverdue ? C.red + "40" : C.border}`, cursor: "grab", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, lineHeight: 1.4, flex: 1, marginRight: 8 }}>{action.text}</span>
                      <span onClick={(e) => { e.stopPropagation(); setEditingAction(action); }} style={{ cursor: "pointer", opacity: 0.5, flexShrink: 0 }}>
                        <Icon d={I.edit} size={14} />
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <Badge label={pri.label} color={pri.color} bg={pri.bg} />
                      {isOverdue && <Badge label="OVERDUE" color={C.red} bg={C.redBg} />}
                      {action.tags.slice(0, 2).map((t) => <Badge key={t} label={t} color={C.accentLight} bg={C.accentBg} />)}
                      {action.dueDate && <span style={{ fontSize: 11, color: isOverdue ? C.red : C.textDim, display: "flex", alignItems: "center", gap: 3 }}><Icon d={I.clock} size={11} color={isOverdue ? C.red : C.textDim} /> {fmt(action.dueDate)}</span>}
                    </div>
                  </div>
                );
              })}
              {colActions.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 12 }}>Drop items here</div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const IntakeView = () => (
    <div>
      <Btn variant="ghost" onClick={() => setView("notes")} style={{ marginBottom: 16 }}>
        <Icon d={I.arrowLeft} size={14} /> Back
      </Btn>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <Icon d={I.upload} size={24} color={C.accent} /> Add Note
      </h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "paste", icon: I.paste, label: "Paste / Type" },
          { key: "slack", icon: I.slack, label: "From Slack" },
          { key: "upload", icon: I.upload, label: "Upload File" },
        ].map((tab) => (
          <Btn key={tab.key} variant={intakeMode === tab.key ? "primary" : "default"} onClick={() => setIntakeMode(tab.key)} style={{ fontSize: 12 }}>
            <Icon d={tab.icon} size={14} color={intakeMode === tab.key ? "#fff" : C.textMuted} /> {tab.label}
          </Btn>
        ))}
      </div>
      <div style={{ padding: 24, borderRadius: 14, background: C.card, border: `1px solid ${C.border}` }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Title (optional)</label>
          <Input value={intakeTitle} onChange={(e) => setIntakeTitle(e.target.value)} placeholder="e.g. Sprint Planning — March 5" />
        </div>

        {intakeMode === "paste" && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Paste or type your notes</label>
            <Textarea value={intakeBody} onChange={(e) => setIntakeBody(e.target.value)} placeholder={"Paste meeting notes, Slack messages, or any text here...\n\nTip: Use #tags to categorise, and lines starting with\n'Action item:', 'TODO:', or '[ ]' will be auto-extracted."} style={{ minHeight: 200 }} />
          </div>
        )}

        {intakeMode === "slack" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ padding: 16, borderRadius: 10, background: C.accentBg, border: `1px solid ${C.accent}30`, marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: C.accentLight, fontWeight: 600, marginBottom: 4 }}>Slack Import</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                Copy messages from Slack and paste below. The cleaner will format speaker names, strip emoji codes, and extract action items.
              </div>
            </div>
            <Textarea value={intakeBody} onChange={(e) => setIntakeBody(e.target.value)} placeholder={"Paste Slack messages here...\n\ne.g.\njohn  10:30 AM\nHey team, update from client call:\n- They want MVP by end of March\n- TODO: Send revised timeline"} style={{ minHeight: 200 }} />
          </div>
        )}

        {intakeMode === "upload" && (
          <div style={{ marginBottom: 14 }}>
            <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} style={{ padding: 30, borderRadius: 10, border: `2px dashed ${C.border}`, textAlign: "center", marginBottom: 14, cursor: "pointer", transition: "border-color 0.15s" }} onDragEnter={(e) => { e.currentTarget.style.borderColor = C.accent; }} onDragLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}>
              <Icon d={I.upload} size={32} color={C.textDim} style={{ margin: "0 auto 12px", display: "block" }} />
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4 }}>Click or drop a .txt / .md file here</div>
              <div style={{ fontSize: 11, color: C.textDim }}>File contents will appear below for review</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.text,.markdown" onChange={handleFileUpload} style={{ display: "none" }} />
            <Textarea value={intakeBody} onChange={(e) => setIntakeBody(e.target.value)} placeholder="Or paste file contents here..." style={{ minHeight: 160 }} />
          </div>
        )}

        <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textMuted, cursor: "pointer" }}>
            <input type="checkbox" checked={intakeAutoClean} onChange={() => setIntakeAutoClean(!intakeAutoClean)} style={{ accentColor: C.accent }} /> Auto-clean & format
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textMuted, cursor: "pointer" }}>
            <input type="checkbox" checked={intakeAutoExtract} onChange={() => setIntakeAutoExtract(!intakeAutoExtract)} style={{ accentColor: C.accent }} /> Extract action items
          </label>
        </div>

        {intakeBody.trim() && intakeAutoClean && (() => {
          const cleanedText = cleanNote(intakeBody);
          const rawLines = intakeBody.trim().split("\n").length;
          const cleanLines = cleanedText.split("\n").filter(l => l.trim()).length;
          const removed = rawLines - cleanLines;
          const rawWords = intakeBody.trim().split(/\s+/).length;
          const cleanWords = cleanedText.split(/\s+/).length;
          const pctReduction = rawWords > 0 ? Math.round(((rawWords - cleanWords) / rawWords) * 100) : 0;
          return (
            <div style={{ marginBottom: 20 }}>
              {/* Cleaning stats bar */}
              <div style={{ display: "flex", gap: 16, marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: C.accentBg, fontSize: 11, color: C.accentLight, alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>Cleaning results:</span>
                <span>{rawWords} → {cleanWords} words ({pctReduction}% tighter)</span>
                {removed > 0 && <span>{removed} noise lines removed</span>}
              </div>
              {/* Side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6, fontWeight: 600 }}>RAW INPUT</div>
                  <div style={{ padding: 12, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, maxHeight: 220, overflow: "auto", fontSize: 12, whiteSpace: "pre-wrap", color: C.textDim, lineHeight: 1.5 }}>
                    {intakeBody.trim()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.green, marginBottom: 6, fontWeight: 600 }}>CLEANED OUTPUT</div>
                  <div style={{ padding: 12, borderRadius: 10, background: C.surface, border: `1px solid ${C.green}30`, maxHeight: 220, overflow: "auto" }}>
                    <RichNote text={cleanedText} />
                  </div>
                </div>
              </div>
              {intakeAutoExtract && extractActions(cleanedText).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: C.amber, marginBottom: 6 }}>Detected action items:</div>
                  {extractActions(cleanedText).map((item, i) => (
                    <div key={i} style={{ fontSize: 12, color: C.text, padding: "4px 0", paddingLeft: 12, borderLeft: `2px solid ${C.amber}` }}>{item}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {intakeBody.trim() && !intakeAutoClean && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Preview (raw, no cleaning)</div>
            <div style={{ padding: 14, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6 }}>
              {intakeBody.trim()}
            </div>
          </div>
        )}
        <Btn variant="primary" onClick={handleSaveNote} disabled={!intakeBody.trim()} style={{ width: "100%", justifyContent: "center", padding: "10px 20px" }}>
          <Icon d={I.check} size={14} color="#fff" /> Save Note
        </Btn>
      </div>
    </div>
  );

  // ── Modals ──
  const EditActionModal = () => {
    if (!editingAction) return null;
    const a = editingAction;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setEditingAction(null)}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "90vw", padding: 24, borderRadius: 16, background: C.card, border: `1px solid ${C.border}` }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Edit Action</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Description</label>
            <Textarea value={a.text} onChange={(e) => setEditingAction({ ...a, text: e.target.value })} style={{ minHeight: 80 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Priority</label>
              <Select value={a.priority} onChange={(e) => setEditingAction({ ...a, priority: e.target.value })}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Due Date</label>
              <Input type="date" value={a.dueDate} onChange={(e) => setEditingAction({ ...a, dueDate: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Tags (comma-separated)</label>
            <Input value={a.tags.join(", ")} onChange={(e) => setEditingAction({ ...a, tags: e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) })} placeholder="#project, #urgent" />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Btn variant="danger" onClick={() => { deleteAction(a.id); setEditingAction(null); }}>
              <Icon d={I.trash} size={13} color={C.red} /> Delete
            </Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => setEditingAction(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={() => { updateAction(a.id, { text: a.text, priority: a.priority, dueDate: a.dueDate, tags: a.tags }); setEditingAction(null); }}>Save</Btn>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const EditNoteModal = () => {
    if (!editingNote) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setEditingNote(null)}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: "90vw", maxHeight: "80vh", padding: 24, borderRadius: 16, background: C.card, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Edit Note</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Title</label>
            <Input value={editingNote.title} onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })} />
          </div>
          <div style={{ marginBottom: 16, flex: 1 }}>
            <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Body</label>
            <Textarea value={editingNote.body} onChange={(e) => setEditingNote({ ...editingNote, body: e.target.value })} style={{ minHeight: 300 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn onClick={() => setEditingNote(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleUpdateNote}>Save Changes</Btn>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // LAYOUT
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Hidden import input */}
      <input ref={importInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />

      {/* Mobile hamburger */}
      <div onClick={() => setSidebarOpen(!sidebarOpen)} style={{ position: "fixed", top: 12, left: 12, zIndex: 20, cursor: "pointer", padding: 6, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, display: sidebarOpen ? "none" : "block" }}>
        <Icon d={I.kanban} size={20} color={C.accent} />
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "16px 0", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 10 }}>
          <div style={{ padding: "4px 20px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon d={I.brain} size={22} color={C.accent} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Second Brain</span>
            </div>
            <span onClick={() => setSidebarOpen(false)} style={{ cursor: "pointer", opacity: 0.5 }}>
              <Icon d={I.x} size={14} />
            </span>
          </div>

          {[
            { key: "dashboard", icon: I.brain, label: "Dashboard", match: (v) => v === "dashboard" },
            { key: "notes", icon: I.note, label: "Notes", match: (v) => v === "notes" || v === "noteDetail" },
            { key: "kanban", icon: I.kanban, label: "Action Board", match: (v) => v === "kanban" },
            { key: "intake", icon: I.upload, label: "Add Note", match: (v) => v === "intake" },
          ].map((nav) => {
            const active = nav.match(view);
            return (
              <div key={nav.key} onClick={() => setView(nav.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? C.accent : C.textMuted, background: active ? C.accentBg : "transparent", borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent" }}>
                <Icon d={nav.icon} size={16} color={active ? C.accent : C.textMuted} /> {nav.label}
              </div>
            );
          })}

          {/* Data controls */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, marginTop: 12 }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>DATA</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn variant="ghost" onClick={handleExport} style={{ fontSize: 11 }} title="Ctrl+E">
                <Icon d={I.download} size={12} /> Export
              </Btn>
              <Btn variant="ghost" onClick={() => importInputRef.current?.click()} style={{ fontSize: 11 }} title="Ctrl+I">
                <Icon d={I.upload} size={12} /> Import
              </Btn>
              <Btn variant="ghost" onClick={() => setShowShortcuts(true)} style={{ fontSize: 11 }} title="Press ?">
                <Icon d={I.keyboard} size={12} /> Keys
              </Btn>
            </div>
          </div>

          {/* Tag filter */}
          <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `1px solid ${C.border}`, maxHeight: 200, overflow: "auto" }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon d={I.tag} size={12} /> TAGS
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {allTags.map((t) => (
                <span key={t} onClick={() => setSelectedTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])} style={{ padding: "3px 8px", borderRadius: 99, fontSize: 11, cursor: "pointer", background: selectedTags.includes(t) ? C.accentBg : C.bg, color: selectedTags.includes(t) ? C.accentLight : C.textDim, border: `1px solid ${selectedTags.includes(t) ? C.accent + "40" : C.border}` }}>
                  {t}
                </span>
              ))}
              {selectedTags.length > 0 && (
                <span onClick={() => setSelectedTags([])} style={{ padding: "3px 8px", borderRadius: 99, fontSize: 11, cursor: "pointer", color: C.red, background: C.redBg }}>clear</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ marginLeft: sideW, padding: "24px 32px", maxWidth: 1100, transition: "margin-left 0.2s" }}>
        {/* Search bar */}
        <div style={{ marginBottom: 24, position: "relative" }}>
          <Icon d={I.search} size={16} color={C.textDim} style={{ position: "absolute", left: 12, top: 10 }} />
          <Input ref={searchRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search notes and actions… (Ctrl+K)" style={{ paddingLeft: 36, background: C.card }} />
          {searchQuery && <span onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 12, top: 10, cursor: "pointer" }}><Icon d={I.x} size={14} /></span>}
        </div>

        {(searchQuery || selectedTags.length > 0) && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.textDim }}>Filters:</span>
            {searchQuery && <Badge label={`"${searchQuery}"`} color={C.text} bg={C.surface} onRemove={() => setSearchQuery("")} />}
            {selectedTags.map((t) => <Badge key={t} label={t} color={C.accentLight} bg={C.accentBg} onRemove={() => setSelectedTags((p) => p.filter((x) => x !== t))} />)}
          </div>
        )}

        {view === "dashboard" && <DashboardView />}
        {view === "notes" && <NotesView />}
        {view === "noteDetail" && <NoteDetailView />}
        {view === "kanban" && <KanbanView />}
        {view === "intake" && <IntakeView />}
      </div>

      <EditActionModal />
      <EditNoteModal />
      {showShortcuts && <ShortcutHelp onClose={() => setShowShortcuts(false)} />}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
