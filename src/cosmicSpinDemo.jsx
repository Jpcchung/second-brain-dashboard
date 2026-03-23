import { useEffect, useMemo, useRef, useState } from "react";

const PHASE_DURATIONS = { BETTING: 10, SPINNING: 6, RESULT: 3, PAYOUT: 2 };

const BASE_SEGMENTS = [
  ...Array.from({ length: 20 }, () => ({ id: "star_1", label: "★ 1x", multiplier: 1, color: "#7f8ea3", bonus: false })),
  ...Array.from({ length: 12 }, () => ({ id: "star_2", label: "★ 2x", multiplier: 2, color: "#2ea7ff", bonus: false })),
  ...Array.from({ length: 7 }, () => ({ id: "star_5", label: "★ 5x", multiplier: 5, color: "#8f67ff", bonus: false })),
  ...Array.from({ length: 4 }, () => ({ id: "star_10", label: "★ 10x", multiplier: 10, color: "#ffd359", bonus: false })),
  ...Array.from({ length: 5 }, () => ({ id: "warp_jump", label: "WARP", color: "#2df2e5", bonus: true })),
  ...Array.from({ length: 3 }, () => ({ id: "asteroid_belt", label: "AST", color: "#ff9d3f", bonus: true })),
  ...Array.from({ length: 2 }, () => ({ id: "black_hole", label: "BH", color: "#9f4dff", bonus: true })),
  { id: "mission_control", label: "MC", color: "#ff4b78", bonus: true },
];

const BONUS_POOLS = {
  warp_jump: [2, 3, 5, 8, 10, 15, 25, 50],
  asteroid_belt: [2, 3, 5, 8, 10, 12, 15, 20, 25, 40, 50, 75, 100],
  black_hole: [2, 5, 10, 25, 100, 500],
  mission_control: [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 200],
};

const STYLES = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 20% 0%, #273650 0%, #0f1727 45%, #0a0f1a 100%)",
    color: "#f2f8ff",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: "24px 22px 30px",
  },
  header: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(27, 36, 52, 0.95), rgba(12, 18, 30, 0.95))",
    borderRadius: 16,
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.35)",
  },
  badge: {
    fontSize: 12,
    borderRadius: 999,
    padding: "5px 10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(380px, 560px) minmax(380px, 1fr)",
    gap: 16,
    alignItems: "start",
  },
  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(27, 36, 52, 0.93), rgba(12, 18, 30, 0.95))",
    borderRadius: 16,
    padding: 14,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.35)",
  },
  chip: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0d1524",
    color: "#d8e5ff",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
};

function rollBonusMultiplier(segmentId) {
  const pool = BONUS_POOLS[segmentId] ?? [2, 5, 10];
  return pool[Math.floor(Math.random() * pool.length)];
}

function drawWheel(ctx, segments, rotation, winningIndex) {
  const { width, height } = ctx.canvas;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 24;
  const step = (Math.PI * 2) / segments.length;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#090f1b";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  for (let i = 0; i < segments.length; i++) {
    const start = i * step - Math.PI / 2;
    const end = start + step;
    const segment = segments[i];
    const isWinner = i === winningIndex;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = isWinner ? "#e5ff6a" : segment.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(9, 14, 24, 0.92)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = "#00e2c2";
  ctx.lineWidth = 5;
  ctx.shadowColor = "rgba(0,226,194,0.6)";
  ctx.shadowBlur = 14;
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = "#00e2c2";
  ctx.beginPath();
  ctx.moveTo(cx, 16);
  ctx.lineTo(cx - 14, 44);
  ctx.lineTo(cx + 14, 44);
  ctx.closePath();
  ctx.fill();
}

function getPhaseColor(phase) {
  if (phase === "BETTING") return "#00e2c2";
  if (phase === "SPINNING") return "#ffd359";
  if (phase === "RESULT") return "#ff9d3f";
  return "#8f67ff";
}

export default function CosmicSpinDemo() {
  const canvasRef = useRef(null);
  const spinFrameRef = useRef(null);
  const segments = useMemo(() => BASE_SEGMENTS, []);

  const uniqueBetTypes = useMemo(() => {
    const seen = new Map();
    for (const seg of segments) if (!seen.has(seg.id)) seen.set(seg.id, seg);
    return Array.from(seen.values());
  }, [segments]);

  const [phase, setPhase] = useState("BETTING");
  const [countdown, setCountdown] = useState(PHASE_DURATIONS.BETTING);
  const [rotation, setRotation] = useState(0);
  const [winningIndex, setWinningIndex] = useState(null);
  const [winningSegment, setWinningSegment] = useState(null);
  const [balance, setBalance] = useState(2500);
  const [betType, setBetType] = useState("star_2");
  const [betAmount, setBetAmount] = useState(25);
  const [lastPayout, setLastPayout] = useState(0);
  const [lastMultiplier, setLastMultiplier] = useState(0);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawWheel(ctx, segments, rotation, winningIndex);
  }, [rotation, segments, winningIndex]);

  useEffect(() => {
    if (phase !== "BETTING") return;
    if (countdown <= 0) {
      startSpin();
      return;
    }
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase === "RESULT") {
      const timer = setTimeout(() => {
        const { payout, multiplier } = resolvePayout();
        setLastPayout(payout);
        setLastMultiplier(multiplier);
        setBalance((v) => v + payout);
        setPhase("PAYOUT");
        setCountdown(PHASE_DURATIONS.PAYOUT);
      }, PHASE_DURATIONS.RESULT * 1000);
      return () => clearTimeout(timer);
    }

    if (phase === "PAYOUT") {
      if (countdown <= 0) {
        setPhase("BETTING");
        setCountdown(PHASE_DURATIONS.BETTING);
        setWinningIndex(null);
        setWinningSegment(null);
        return;
      }
      const timer = setTimeout(() => setCountdown((v) => v - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [phase, countdown]);

  useEffect(() => () => {
    if (spinFrameRef.current) cancelAnimationFrame(spinFrameRef.current);
  }, []);

  function resolvePayout() {
    if (!winningSegment || winningSegment.id !== betType) return { payout: 0, multiplier: 0 };
    const multiplier = winningSegment.bonus ? rollBonusMultiplier(winningSegment.id) : winningSegment.multiplier;
    const payout = betAmount * multiplier;

    setHistory((prev) => [
      {
        segment: winningSegment.label,
        match: true,
        multiplier,
        payout,
      },
      ...prev,
    ].slice(0, 7));

    return { payout, multiplier };
  }

  function startSpin() {
    if (betAmount > balance) return;

    setBalance((v) => v - betAmount);
    setLastPayout(0);
    setLastMultiplier(0);
    setPhase("SPINNING");

    const selectedIndex = Math.floor(Math.random() * segments.length);
    setWinningIndex(selectedIndex);
    setWinningSegment(segments[selectedIndex]);

    const step = (Math.PI * 2) / segments.length;
    const start = rotation;
    const target = -(selectedIndex * step) + Math.PI * 2 * 8;
    const startedAt = performance.now();
    const duration = PHASE_DURATIONS.SPINNING * 1000;

    const animate = (time) => {
      const p = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setRotation(start + (target - start) * eased);
      setCountdown(Math.max(0, Math.ceil(PHASE_DURATIONS.SPINNING * (1 - p))));

      if (p < 1) {
        spinFrameRef.current = requestAnimationFrame(animate);
      } else {
        setPhase("RESULT");
        setCountdown(PHASE_DURATIONS.RESULT);
      }
    };

    spinFrameRef.current = requestAnimationFrame(animate);
  }

  return (
    <div style={STYLES.page}>
      <div style={STYLES.header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Cosmic Spin</div>
          <div style={{ color: "#9eb2cf", fontSize: 13 }}>Stake-style UI pass for the playable prototype</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ ...STYLES.badge, color: getPhaseColor(phase), borderColor: `${getPhaseColor(phase)}66` }}>{phase}</span>
          <span style={STYLES.badge}>Timer: {countdown}s</span>
          <span style={{ ...STYLES.badge, color: "#7bf3a8", borderColor: "#7bf3a866" }}>Balance: {balance}</span>
        </div>
      </div>

      <div style={STYLES.grid}>
        <div style={STYLES.card}>
          <canvas
            ref={canvasRef}
            width={520}
            height={520}
            style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.09)" }}
          />
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {uniqueBetTypes.map((seg) => (
              <span key={seg.id} style={{ ...STYLES.chip, borderColor: seg.id === betType ? "#00e2c2" : "rgba(255,255,255,0.12)", color: seg.id === betType ? "#00e2c2" : "#d8e5ff" }}>
                {seg.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={STYLES.card}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Place Bet</div>
            <div style={{ display: "grid", gap: 10 }}>
              <select
                value={betType}
                disabled={phase !== "BETTING"}
                onChange={(e) => setBetType(e.target.value)}
                style={{ background: "#0c1423", color: "#e5edff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: 10 }}
              >
                {uniqueBetTypes.map((seg) => (
                  <option key={seg.id} value={seg.id}>
                    {seg.label}
                  </option>
                ))}
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  value={betAmount}
                  disabled={phase !== "BETTING"}
                  onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value || 1)))}
                  style={{ background: "#0c1423", color: "#e5edff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: 10 }}
                />
                <button
                  type="button"
                  disabled={phase !== "BETTING" || betAmount > balance}
                  onClick={startSpin}
                  style={{
                    borderRadius: 10,
                    border: "1px solid #00e2c2",
                    color: "#052820",
                    background: phase === "BETTING" && betAmount <= balance ? "#00e2c2" : "#28404b",
                    fontWeight: 800,
                    padding: "0 14px",
                    cursor: phase === "BETTING" && betAmount <= balance ? "pointer" : "not-allowed",
                  }}
                >
                  Spin Now
                </button>
              </div>
            </div>

            {winningSegment && (
              <div style={{ marginTop: 12, color: "#9eb2cf", fontSize: 13 }}>
                Latest segment: <strong style={{ color: "#ffd359" }}>{winningSegment.label}</strong>
              </div>
            )}
          </div>

          <div style={STYLES.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Round Result</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ ...STYLES.chip, background: "#101a2c" }}>Multiplier: {lastMultiplier || "—"}</div>
              <div style={{ ...STYLES.chip, background: "#101a2c", color: lastPayout > 0 ? "#7bf3a8" : "#ff879e" }}>
                Payout: {lastPayout}
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#91a4c3" }}>
              Auto cycle keeps running. You can place/update bets only during <strong>BETTING</strong>.
            </div>
          </div>

          <div style={STYLES.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Hits</div>
            {history.length === 0 ? (
              <div style={{ color: "#91a4c3", fontSize: 13 }}>No winning rounds yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {history.map((item, i) => (
                  <div key={`${item.segment}-${i}`} style={{ ...STYLES.chip, display: "flex", justifyContent: "space-between", background: "#101a2c" }}>
                    <span>{item.segment}</span>
                    <span style={{ color: "#7bf3a8" }}>{item.multiplier}x / {item.payout}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
