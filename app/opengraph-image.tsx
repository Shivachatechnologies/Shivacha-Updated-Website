import { ImageResponse } from "next/og";

export const alt = "Shivacha Technologies — Technology for companies building what comes next.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  const colors = ["#8e6bff", "#4c82ff", "#1fc38e", "#2fd6ee", "#48b8fa"];
  const labels = ["AI", "Digital", "FinTech", "Web3", "Cloud"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#04060b", padding: 72, color: "#e9edf5", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, letterSpacing: 8, fontWeight: 600 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: "white" }} />
          SHIVACHA
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>Technology for companies building what comes next.</div>
          <div style={{ display: "flex", gap: 14 }}>
            {labels.map((l, i) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, padding: "10px 20px", fontSize: 24 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: colors[i] }} />
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
