import { useState } from "react";
import SecondBrainApp from "./SecondBrainApp";
import CosmicSpinDemo from "./cosmicSpinDemo";

export default function App() {
  const [mode, setMode] = useState("cosmic");

  return (
    <>
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 9999,
          background: "rgba(9,12,21,0.88)",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 999,
          padding: 4,
          display: "flex",
          gap: 4,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <button
          onClick={() => setMode("cosmic")}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "8px 12px",
            cursor: "pointer",
            fontWeight: 700,
            color: mode === "cosmic" ? "#06221d" : "#b7f9ef",
            background: mode === "cosmic" ? "#00e2c2" : "transparent",
          }}
        >
          Cosmic Spin
        </button>
        <button
          onClick={() => setMode("second_brain")}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "8px 12px",
            cursor: "pointer",
            fontWeight: 700,
            color: mode === "second_brain" ? "#1f1640" : "#dbccff",
            background: mode === "second_brain" ? "#a78bfa" : "transparent",
          }}
        >
          Second Brain
        </button>
      </div>
      {mode === "cosmic" ? <CosmicSpinDemo /> : <SecondBrainApp />}
    </>
  );
}
