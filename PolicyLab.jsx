import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, BarChart, Bar, Cell,
  AreaChart, Area
} from "recharts";

/* ══════════════════════════════════════════════════════════════════════
   ECONOMIC ENGINE (unchanged core)
   ══════════════════════════════════════════════════════════════════════ */

const BASE = {
  gdp: 3.5, price: 100, unemp: 7.5, deficit: 5.9,
  trade: -2.1, realWage: 100, gini: 0.35, inflation: 5.0,
  interestEq: 6.5, outputEq: 3.5,
};

function simulate(G, T, R, Tr) {
  const g = (G - 50) / 50, t = (T - 50) / 50, r = (R - 50) / 50, tr = (Tr - 50) / 50;
  const adShift = g * 1.8 - t * 1.2 - r * 1.5 + tr * 0.3;
  const asShift = -t * 0.4 - tr * 0.9 - r * 0.15;
  const outChg = adShift * 0.6 + asShift * 0.4;
  const pChg = adShift * 0.4 - asShift * 0.6;
  const gdp = Math.max(1.5, BASE.gdp * (1 + outChg * 0.15));
  const price = Math.max(60, BASE.price * (1 + pChg * 0.12));
  const inflation = BASE.inflation + pChg * 4.5;
  const unemp = Math.max(1, Math.min(15, BASE.unemp - outChg * 4.5));
  const deficit = BASE.deficit + g * 3.5 - t * 2.8 - outChg * 0.8;
  const trade = BASE.trade + tr * 1.2 - r * 0.5 - g * 0.4;
  const realWage = BASE.realWage * (1 + outChg * 0.08 - pChg * 0.06);
  const gini = Math.max(0.2, Math.min(0.6, BASE.gini - t * 0.04 - g * 0.03 + tr * 0.015));
  const isShift = g * 1.5 - t * 1.0 + tr * 0.2;
  const lmShift = r * 1.8;
  const eqOutput = BASE.outputEq + (isShift * 0.55 - lmShift * 0.25);
  const eqInterest = BASE.interestEq + (isShift * 0.3 + lmShift * 0.5);
  const moneyDemandShift = outChg * 0.8 + pChg * 0.5;
  const moneySupplyShift = -r * 1.2;
  const labourDemandShift = outChg * 1.2;
  const labourSupplyShift = -t * 0.3 + g * 0.1;
  return {
    gdp, price, inflation, unemp, deficit, trade, realWage, gini,
    adShift, asShift, isShift, lmShift, eqOutput, eqInterest,
    moneyDemandShift, moneySupplyShift, labourDemandShift, labourSupplyShift,
    outChg, pChg,
  };
}

function makeCurve(n, fn) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(fn(i / n, i));
  return pts;
}
function adasCurves(ad, as) {
  return makeCurve(50, x => {
    const o = +(1.5 + x * 4).toFixed(2);
    const adv = 145 - x * 70 + ad * 16;
    const asv = 70 + x * 55 + Math.pow(x, 2.2) * 45 + as * 15;
    return { x: o, ad: +Math.max(40, adv).toFixed(1), as: +Math.max(40, asv).toFixed(1) };
  });
}
function islmCurves(isS, lmS) {
  return makeCurve(50, x => {
    const o = +(1.5 + x * 4).toFixed(2);
    return { x: o, is: +Math.max(0, 14 - x * 10 + isS * 2.2).toFixed(2), lm: +Math.max(0, 1 + x * 8 + lmS * 2.0).toFixed(2) };
  });
}
function moneyMarketCurves(dS, sS) {
  return makeCurve(50, x => ({
    x: +(x * 100).toFixed(0), md: +Math.max(0, 14 - x * 12 + dS * 2.5).toFixed(2), ms: +(6.5 + sS * 3).toFixed(2)
  }));
}
function labourCurves(dS, sS) {
  return makeCurve(50, x => ({
    x: +(40 + x * 60).toFixed(0), ld: +Math.max(0, 18 - x * 14 + dS * 2.5).toFixed(2), ls: +Math.max(0, 2 + x * 12 + sS * 1.5).toFixed(2)
  }));
}
function findInt(data, k1, k2) {
  let min = Infinity, best = { x: 0, y: 0, valid: false };
  data.forEach(p => {
    const d = Math.abs(p[k1] - p[k2]);
    if (d < min) { min = d; best = { x: p.x, y: +((p[k1] + p[k2]) / 2).toFixed(1), valid: d < 3.0 }; }
  });
  return best;
}

/* ── HISTORICAL DATA ── */
const INDIA_HISTORY = [
  { year: 2015, gdp: 2.10, price: 82 }, { year: 2016, gdp: 2.29, price: 85 },
  { year: 2017, gdp: 2.65, price: 88 }, { year: 2018, gdp: 2.70, price: 92 },
  { year: 2019, gdp: 2.83, price: 96 }, { year: 2020, gdp: 2.67, price: 100 },
  { year: 2021, gdp: 3.15, price: 108 }, { year: 2022, gdp: 3.39, price: 118 },
  { year: 2023, gdp: 3.57, price: 122 }, { year: 2024, gdp: 3.73, price: 126 },
];
const INDIA_PHILLIPS = [
  { year: 2015, unemp: 5.6, inflation: 4.9 }, { year: 2016, unemp: 5.5, inflation: 4.5 },
  { year: 2017, unemp: 5.4, inflation: 3.6 }, { year: 2018, unemp: 5.3, inflation: 3.4 },
  { year: 2019, unemp: 5.3, inflation: 4.8 }, { year: 2020, unemp: 8.0, inflation: 6.2 },
  { year: 2021, unemp: 5.8, inflation: 5.5 }, { year: 2022, unemp: 4.8, inflation: 6.7 },
  { year: 2023, unemp: 4.6, inflation: 5.4 }, { year: 2024, unemp: 4.5, inflation: 4.9 },
];

/* ── CAUSAL CHAINS ── */
function getChains(G, T, R, Tr, e) {
  const chains = [];
  const gs = G - 50, ts = T - 50, rs = R - 50, trs = Tr - 50;
  if (Math.abs(gs) > 5) {
    const up = gs > 0;
    chains.push({ label: "Fiscal: Govt Spending", color: "#C4870A",
      steps: up ? [
        "↑ Government expenditure (G)", "→ IS shifts right → ↑ AD → ↑Y ↑P",
        `→ Multiplier ≈ ${(1.5 + Math.abs(gs) / 80).toFixed(1)}x`,
        `→ Deficit widens to ${e.deficit.toFixed(1)}% of GDP`,
        e.unemp < 4 ? "⚠ Near full employment — mostly inflationary" : "→ Output gap narrows",
      ] : ["↓ Govt spending (austerity)", "→ IS left → ↓ AD", `→ Deficit → ${e.deficit.toFixed(1)}%`]
    });
  }
  if (Math.abs(ts) > 5) {
    const up = ts > 0;
    chains.push({ label: "Fiscal: Taxation", color: "#D14B4B",
      steps: up ? [
        "↑ Tax → ↓ Yd → ↓ C → IS left", "→ Also ↑ costs → AS left → stagflation",
        Math.abs(ts) > 30 ? "⚠ Laffer curve territory" : `→ Revenue rises, deficit ${e.deficit.toFixed(1)}%`,
      ] : ["↓ Tax → ↑ Yd → ↑ C → IS right", `→ Deficit widens to ${e.deficit.toFixed(1)}%`]
    });
  }
  if (Math.abs(rs) > 5) {
    const up = rs > 0;
    chains.push({ label: "Monetary: Repo Rate", color: "#7B61C4",
      steps: up ? [
        "↑ Repo → LM up → ↑ borrowing cost", "→ Ms contracts → ↓ I → ↓ AD",
        `→ Trade → ${e.trade.toFixed(1)}%`,
        e.unemp > 9 ? "⚠ Tightening into slowdown" : "→ RBI inflation targeting",
      ] : ["↓ Repo → LM down → credit expands", `→ Inflation → ${e.inflation.toFixed(1)}%`]
    });
  }
  if (Math.abs(trs) > 5) {
    const up = trs > 0;
    chains.push({ label: "Trade: Import Tariff", color: "#3A8A5C",
      steps: up ? [
        "↑ Tariff → ↑ input costs → AS left", "→ Domestic producers gain share",
        `→ Trade → ${e.trade.toFixed(1)}%`,
        Math.abs(trs) > 30 ? "⚠ DWL exceeds protection gains" : "→ Infant industry defence",
      ] : ["↓ Tariff → ↓ costs → AS right", `→ Trade deficit may widen to ${e.trade.toFixed(1)}%`]
    });
  }
  if (!chains.length) chains.push({ label: "Baseline", color: "#8090A0", steps: ["All levers at baseline", "Adjust sliders to begin"] });
  return chains;
}

/* ── SCENARIOS ── */
const SCENARIOS = [
  { name: "Keynesian Stimulus", tag: "Demand", desc: "Expansionary fiscal + accommodative monetary.", ctx: "India post-COVID: Atmanirbhar 1.0, RBI cuts to 4%.", g: 80, t: 35, r: 30, tr: 50, exp: "GDP ↑↑, unemp ↓↓, inflation spikes, deficit balloons." },
  { name: "Volcker Shock", tag: "Monetary", desc: "Aggressive tightening to break inflation.", ctx: "Fed 1979-82 pushed rates to 20%.", g: 50, t: 50, r: 90, tr: 50, exp: "Inflation crushed, severe output contraction." },
  { name: "Atmanirbhar Bharat", tag: "Protection", desc: "Spending + high tariffs for domestic capacity.", ctx: "PLI schemes + customs increases post-2020.", g: 65, t: 50, r: 50, tr: 80, exp: "GDP rises but AS contracts. Inflation up." },
  { name: "Supply-Side Reform", tag: "Structural", desc: "Cut taxes, cut tariffs. 1991 playbook.", ctx: "Manmohan Singh reforms. 2019 corp tax cut.", g: 40, t: 25, r: 50, tr: 25, exp: "AS right → prices fall, output rises." },
  { name: "Stagflation Trap", tag: "Crisis", desc: "Everything wrong simultaneously.", ctx: "India 1970s-80s: license raj, deficit financing.", g: 70, t: 70, r: 30, tr: 75, exp: "Output stagnates, prices surge." },
  { name: "Austerity Programme", tag: "Fiscal", desc: "Slash spending, raise taxes, tighten. IMF playbook.", ctx: "Greece 2010-15. India FRBM Act.", g: 20, t: 70, r: 70, tr: 50, exp: "Deficit shrinks, GDP contracts." },
];

/* ══════════════════════════════════════════════════════════════════════
   THEME + DARK MODE
   ══════════════════════════════════════════════════════════════════════ */
const SANS = `'Outfit', 'Avenir', sans-serif`;
const SERIF = `'Source Serif 4', Georgia, serif`;
const MONO = `'JetBrains Mono', monospace`;

const THEMES = {
  light: {
    bg: "#F7F6F3", card: "#FFFFFF", alt: "#EEECE7", bdr: "#DDD9D0", bdrL: "#E8E5DE",
    txt: "#1C1B18", sec: "#6B6860", ter: "#9C9890",
    acc: "#C4550A", accBg: "#FDF0E8",
    blue: "#3B7DD8", red: "#D14B4B", green: "#3A8A5C", purple: "#7B61C4", amber: "#C4870A",
    cmpA: "#3B7DD8", cmpB: "#C4550A",
  },
  dark: {
    bg: "#0f0f17", card: "#1a1a2e", alt: "#16213e", bdr: "#2a2a4a", bdrL: "#222244",
    txt: "#e8e6e3", sec: "#9a96a6", ter: "#6a6680",
    acc: "#ff7b3a", accBg: "#2d1a0e",
    blue: "#5b9df8", red: "#f06868", green: "#5aba7c", purple: "#9b81e4", amber: "#e4a72a",
    cmpA: "#5b9df8", cmpB: "#ff7b3a",
  }
};

/* ══════════════════════════════════════════════════════════════════════
   EASTER EGGS + PERSONALITY
   ══════════════════════════════════════════════════════════════════════ */

const LOADING_QUOTES = [
  "Calculating deadweight loss of slow WiFi...",
  "Ceteris paribus, this page will load...",
  "IPM kids discovering the opportunity cost of sleep...",
  "Estimating the MPC of mess food...",
  "Adjusting IS-LM for hostel room prices...",
  "Deriving the Phillips Curve of assignment submissions...",
  "Computing the Gini coefficient of CGPA distribution...",
  "Running a Solow model on campus WiFi bandwidth...",
  "Checking if Keynesian beauty contest applies to placements...",
  "Applying RBI monetary policy to canteen inflation...",
];

function getToast(G, T, R, Tr) {
  if (G > 90 && T > 80 && Tr > 80) return "🏛️ Congratulations, you've invented the License Raj";
  if (R > 95) return "📞 RBI is calling, they want their repo rate back";
  if (G > 90 && R < 10) return "💸 Money printer go brrr — MMT gang approves";
  if (T > 90 && G < 10) return "🏴 Full austerity achieved. IMF sends a fruit basket.";
  if (G < 10 && T < 10 && R < 10 && Tr < 10) return "☭ You've achieved fully automated luxury communism";
  if (G > 85 && T < 15) return "🇺🇸 Reaganomics with extra spending? Bold strategy.";
  if (Tr > 90) return "🧱 Great Wall of Tariffs erected. Comparative advantage weeps.";
  if (G === 50 && T === 50 && R === 50 && Tr === 50) return null;
  if (Math.abs(G - 50) < 3 && Math.abs(T - 50) < 3 && Math.abs(R - 50) < 3 && Math.abs(Tr - 50) < 3) return "😴 Playing it safe? Macro professors hate this one trick.";
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   TURN-BASED TIME ENGINE
   ══════════════════════════════════════════════════════════════════════ */

function advanceEconomy(prevState, e) {
  // Compound: blend previous state with new policy outcomes
  // Inflation has momentum, unemployment has hysteresis, GDP compounds
  return {
    gdp: prevState.gdp * 0.35 + e.gdp * 0.65,
    inflation: prevState.inflation * 0.45 + e.inflation * 0.55, // sticky
    unemp: prevState.unemp * 0.5 + e.unemp * 0.5, // hysteresis
    deficit: prevState.deficit * 0.3 + e.deficit * 0.7,
    trade: prevState.trade * 0.4 + e.trade * 0.6,
    realWage: prevState.realWage * 0.4 + e.realWage * 0.6,
    gini: prevState.gini * 0.5 + e.gini * 0.5,
    price: prevState.price * 0.3 + e.price * 0.7,
  };
}

/* ── POLICY GRADE ── */
function gradePolicy(e) {
  let s = 0;
  s += Math.min(2, (e.gdp - 3.0) * 3);
  s -= Math.max(0, Math.abs(e.inflation - 4) - 1) * 0.8;
  s -= Math.max(0, e.unemp - 5) * 0.5;
  s -= Math.max(0, e.deficit - 4) * 0.4;
  s += Math.min(0.5, (e.trade + 2) * 0.3);
  s -= Math.max(0, e.gini - 0.35) * 3;
  const grades = ['F','D-','D','D+','C-','C','C+','B-','B','B+','A-','A','A+'];
  const idx = Math.max(0, Math.min(12, Math.round((s + 2) * 2)));
  const colors = ['#D14B4B','#D14B4B','#D14B4B','#D14B4B','#C4870A','#C4870A','#C4870A','#3B7DD8','#3B7DD8','#3B7DD8','#3A8A5C','#3A8A5C','#3A8A5C'];
  return { grade: grades[idx], color: colors[idx], score: s };
}

/* ── SHARE URL ── */
function encodeShareURL(G, T, R, Tr, quarter) {
  const params = new URLSearchParams({ G, T, R, Tr, q: quarter });
  return `${window.location.origin}${window.location.pathname}?${params}`;
}
function decodeShareURL() {
  const p = new URLSearchParams(window.location.search);
  if (!p.has("G")) return null;
  return { G: +p.get("G") || 50, T: +p.get("T") || 50, R: +p.get("R") || 50, Tr: +p.get("Tr") || 50, q: +p.get("q") || 0 };
}

/* ══════════════════════════════════════════════════════════════════════
   UI ATOMS
   ══════════════════════════════════════════════════════════════════════ */

function useAnimatedValue(target, duration = 350) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const start = prev.current, diff = target - start, t0 = performance.now();
    if (Math.abs(diff) < 0.001) { setVal(target); prev.current = target; return; }
    let raf;
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const v = start + diff * ease;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function Stat({ label, val, raw, unit, base, inv, small, C }) {
  const animated = useAnimatedValue(typeof raw === "number" ? raw : parseFloat(val));
  const n = animated;
  const d = n - base;
  const pct = base ? Math.abs((d / Math.abs(base)) * 100).toFixed(1) : "0";
  const up = d > 0.01, dn = d < -0.01;
  const clr = (up || dn) ? ((inv ? dn : up) ? C.green : C.red) : C.ter;
  const displayVal = typeof raw === "number"
    ? (Math.abs(raw) < 1 ? animated.toFixed(3) : animated.toFixed(raw >= 10 ? 0 : Math.abs(raw) < 10 ? (unit === "%" || unit === "%GDP" ? 1 : 2) : 1))
    : val;
  const prefix = typeof raw === "number" && val.startsWith("₹") ? "₹" : "";
  const suffix = typeof raw === "number" && val.endsWith("T") ? "T" : "";
  return (
    <div style={{ flex: 1, minWidth: small ? 80 : 100, padding: small ? "6px 8px" : "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, transition: "all 0.3s" }}>
      <div style={{ fontSize: small ? 8 : 9, fontFamily: SANS, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: small ? 15 : 20, fontWeight: 700, fontFamily: MONO, color: C.txt, marginTop: 1 }}>
        {prefix}{displayVal}{suffix}<span style={{ fontSize: small ? 8 : 10, color: C.ter, fontFamily: SANS, fontWeight: 400 }}> {unit}</span>
      </div>
      {(up || dn) && <div style={{ fontSize: small ? 8 : 9, fontFamily: MONO, color: clr, marginTop: 1 }}>{up ? "▲" : "▼"} {pct}%</div>}
    </div>
  );
}

function Slider({ label, value, onChange, color, left, right, compact, C }) {
  const active = value !== 50;
  const pct = active ? (value > 50 ? `+${(value - 50) * 2}%` : `${(value - 50) * 2}%`) : "—";
  return (
    <div style={{ marginBottom: compact ? 10 : 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: compact ? 11 : 12, fontWeight: 600, fontFamily: SANS, color: C.txt }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600, color: active ? color : C.ter, background: active ? `${color}14` : "transparent", padding: "1px 6px", borderRadius: 3 }}>{pct}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={ev => onChange(+ev.target.value)}
        style={{ width: "100%", height: 3, appearance: "none", WebkitAppearance: "none", outline: "none", cursor: "pointer", borderRadius: 2, background: `linear-gradient(to right, ${color} ${value}%, ${C.bdrL} ${value}%)` }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 8, fontFamily: SANS, color: C.ter, textTransform: "uppercase", letterSpacing: "0.05em" }}>{left}</span>
        <span style={{ fontSize: 8, fontFamily: SANS, color: C.ter, textTransform: "uppercase", letterSpacing: "0.05em" }}>{right}</span>
      </div>
    </div>
  );
}

function StarRating({ rating, onRate, C }) {
  const [hover, setHover] = useState(0);
  const labels = ["", "License Raj", "Suboptimal", "Textbook", "Based", "Absolute Keynes"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} onClick={() => onRate(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
          style={{ cursor: "pointer", fontSize: 16, transition: "transform 0.15s", transform: (hover === i) ? "scale(1.3)" : "scale(1)", color: i <= (hover || rating) ? C.amber : C.bdr }}>
          ★
        </span>
      ))}
      {(hover || rating) > 0 && <span style={{ fontSize: 9, fontFamily: MONO, color: C.ter, marginLeft: 4 }}>{labels[hover || rating]}</span>}
    </div>
  );
}

function Toast({ message, onDone, C }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 999,
      background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 20px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.15)", fontFamily: SANS, fontSize: 13, color: C.txt,
      animation: "fadeUp 0.3s ease-out",
    }}>
      {message}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   CHART COMPONENTS
   ══════════════════════════════════════════════════════════════════════ */

function MiniChart({ title, data, baseData, k1, k2, l1, l2, c1, c2, xLabel, yLabel, yDomain, intersection, modified, height, C }) {
  const TT_STYLE = { background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 11, fontFamily: SANS, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "12px 10px 4px", transition: "all 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "0 4px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SANS, color: C.txt }}>{title}</span>
        <div style={{ display: "flex", gap: 8, fontSize: 9, fontFamily: SANS, color: C.ter }}>
          <span><span style={{ color: c1, fontWeight: 700 }}>━</span> {l1}</span>
          <span><span style={{ color: c2, fontWeight: 700 }}>━</span> {l2}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height || 190}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 14, left: 2 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.bdrL} />
          <XAxis dataKey="x" tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL}
            label={{ value: xLabel, position: "insideBottom", offset: -8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          <YAxis tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL} domain={yDomain}
            label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          {modified && <>
            <Line data={baseData} dataKey={k1} stroke={c1} strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.18} />
            <Line data={baseData} dataKey={k2} stroke={c2} strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.18} />
          </>}
          <Line dataKey={k1} stroke={c1} strokeWidth={2} dot={false} />
          <Line dataKey={k2} stroke={c2} strokeWidth={2} dot={false} />
          {intersection.valid && <ReferenceDot x={intersection.x} y={intersection.y} r={4} fill={C.acc} stroke={C.card} strokeWidth={2} />}
          <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => [typeof v === "number" ? v.toFixed(1) : v, n === k1 ? l1 : l2]} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ADASChart({ data, baseData, intersection, modified, showHistory, onToggleHistory, C }) {
  const histData = INDIA_HISTORY.map(h => ({ x: h.gdp, hist: h.price }));
  const TT_STYLE = { background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 11, fontFamily: SANS };
  const renderHistDot = (props) => {
    const { cx, cy, index } = props;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    const yr = INDIA_HISTORY[index];
    if (!yr) return null;
    return (<g key={`h-${index}`}><circle cx={cx} cy={cy} r={3.5} fill="#D4760A" stroke={C.card} strokeWidth={1.5} />
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={7} fontFamily={MONO} fill="#D4760A" fontWeight={600}>'{String(yr.year).slice(2)}</text></g>);
  };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "12px 10px 4px", transition: "all 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "0 4px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SANS, color: C.txt }}>AD — AS</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: SANS, color: C.ter }}>
          <span><span style={{ color: C.blue, fontWeight: 700 }}>━</span> AD</span>
          <span><span style={{ color: C.red, fontWeight: 700 }}>━</span> SRAS</span>
          {showHistory && <span><span style={{ color: "#D4760A", fontWeight: 700 }}>●━</span> India</span>}
          <button onClick={onToggleHistory} style={{
            border: `1px solid ${showHistory ? "#D4760A" : C.bdr}`, background: showHistory ? "#FDF0E8" : "transparent",
            color: showHistory ? "#D4760A" : C.ter, fontSize: 8, fontFamily: SANS, fontWeight: 600,
            padding: "2px 6px", borderRadius: 3, cursor: "pointer", transition: "all 0.15s",
          }}>{showHistory ? "▣" : "▢"} India 2015–24</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 14, left: 2 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.bdrL} />
          <XAxis dataKey="x" type="number" domain={[1.5, 5.5]} ticks={[1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]}
            tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL}
            label={{ value: "Output (₹T)", position: "insideBottom", offset: -8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          <YAxis tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL} domain={[40, 180]}
            label={{ value: "Price Level", angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          {modified && <>
            <Line data={baseData} dataKey="ad" stroke={C.blue} strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.18} />
            <Line data={baseData} dataKey="as" stroke={C.red} strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.18} />
          </>}
          <Line dataKey="ad" stroke={C.blue} strokeWidth={2} dot={false} />
          <Line dataKey="as" stroke={C.red} strokeWidth={2} dot={false} />
          {showHistory && <Line data={histData} dataKey="hist" stroke="#D4760A" strokeWidth={1.5} strokeDasharray="4 2" dot={renderHistDot} isAnimationActive={false} connectNulls />}
          {intersection.valid && <ReferenceDot x={intersection.x} y={intersection.y} r={4} fill={C.acc} stroke={C.card} strokeWidth={2} />}
          <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => { if (n === "hist") return [v, "India"]; return [typeof v === "number" ? v.toFixed(1) : v, n === "ad" ? "AD" : "SRAS"]; }} labelFormatter={v => `Y = ₹${v}T`} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PhillipsCurveChart({ currentUnemp, currentInflation, history, showHistory, onToggleHistory, C }) {
  const TT_STYLE = { background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 11, fontFamily: SANS };
  const theoreticalPC = useMemo(() => {
    const pts = [];
    for (let g = 0; g <= 100; g += 2) { const s = simulate(g, 50, 50, 50); pts.push({ unemp: +s.unemp.toFixed(2), inflation: +s.inflation.toFixed(2) }); }
    pts.sort((a, b) => a.unemp - b.unemp);
    return pts;
  }, []);
  const tracedPath = useMemo(() => {
    const pts = [{ unemp: BASE.unemp, inflation: BASE.inflation, step: 0 }];
    history.forEach(h => pts.push({ unemp: h.unemp, inflation: h.inflation, step: h.step }));
    return pts;
  }, [history]);
  const indiaData = INDIA_PHILLIPS.map(h => ({ unemp: h.unemp, indiaInf: h.inflation }));

  const renderIndiaDot = (props) => {
    const { cx, cy, index } = props;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    const yr = INDIA_PHILLIPS[index]; if (!yr) return null;
    return (<g key={`ip-${index}`}><circle cx={cx} cy={cy} r={3} fill="#D4760A" stroke={C.card} strokeWidth={1.5} />
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize={7} fontFamily={MONO} fill="#D4760A" fontWeight={600}>'{String(yr.year).slice(2)}</text></g>);
  };
  const renderTracedDot = (props) => {
    const { cx, cy, index } = props;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    const pt = tracedPath[index]; if (!pt) return null;
    return (<g key={`tr-${index}`}><circle cx={cx} cy={cy} r={index === tracedPath.length - 1 ? 5 : 3.5}
      fill={index === 0 ? C.ter : C.purple} stroke={C.card} strokeWidth={1.5} />
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={7} fontFamily={MONO} fill={index === 0 ? C.ter : C.purple} fontWeight={600}>
        {index === 0 ? "Base" : `Q${pt.step}`}</text></g>);
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "12px 10px 4px", transition: "all 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SANS, color: C.txt }}>Phillips Curve</span>
          {history.length === 0 && <span style={{ fontSize: 9, fontFamily: SERIF, color: C.ter, fontStyle: "italic" }}>Advance quarters to trace a path</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: SANS, color: C.ter }}>
          <span><span style={{ color: C.sec, fontWeight: 700 }}>━</span> SRPC</span>
          {history.length > 0 && <span><span style={{ color: C.purple, fontWeight: 700 }}>●━</span> Path</span>}
          <button onClick={onToggleHistory} style={{
            border: `1px solid ${showHistory ? "#D4760A" : C.bdr}`, background: showHistory ? "#FDF0E8" : "transparent",
            color: showHistory ? "#D4760A" : C.ter, fontSize: 8, fontFamily: SANS, fontWeight: 600,
            padding: "2px 6px", borderRadius: 3, cursor: "pointer",
          }}>{showHistory ? "▣" : "▢"} India</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart margin={{ top: 4, right: 12, bottom: 14, left: 2 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.bdrL} />
          <XAxis dataKey="unemp" type="number" domain={[0, 16]} ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16]}
            tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL}
            label={{ value: "Unemployment %", position: "insideBottom", offset: -8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          <YAxis type="number" domain={[-2, 16]} ticks={[0, 2, 4, 6, 8, 10, 12, 14]}
            tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL}
            label={{ value: "Inflation %", angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          <Line data={theoreticalPC} dataKey="inflation" stroke={C.sec} strokeWidth={1.5} dot={false} opacity={0.35} strokeDasharray="6 3" />
          {showHistory && <Line data={indiaData} dataKey="indiaInf" stroke="#D4760A" strokeWidth={1.5} strokeDasharray="4 2" dot={renderIndiaDot} isAnimationActive={false} />}
          {tracedPath.length > 1 && <Line data={tracedPath} dataKey="inflation" stroke={C.purple} strokeWidth={2} dot={renderTracedDot} isAnimationActive={false} />}
          <ReferenceDot x={currentUnemp} y={currentInflation} r={5} fill={C.acc} stroke={C.card} strokeWidth={2} />
          <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => { if (n === "indiaInf") return [`${v}%`, "India"]; return [`${typeof v === "number" ? v.toFixed(1) : v}%`, "Inflation"]; }} labelFormatter={v => `Unemp = ${v}%`} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   HCAPTCHA WRAPPER
   ══════════════════════════════════════════════════════════════════════ */

function HCaptchaWidget({ onVerify, theme }) {
  const ref = useRef(null);
  const widgetId = useRef(null);
  useEffect(() => {
    let mounted = true;
    const iv = setInterval(() => {
      if (window.hcaptcha && ref.current && widgetId.current === null && mounted) {
        try {
          widgetId.current = window.hcaptcha.render(ref.current, {
            sitekey: "10000000-ffff-ffff-ffff-000000000000", // test key
            callback: (token) => { if (mounted) onVerify(token); },
            theme: theme === "dark" ? "dark" : "light",
            size: "normal",
          });
        } catch (e) { /* already rendered */ }
        clearInterval(iv);
      }
    }, 200);
    return () => { mounted = false; clearInterval(iv); };
  }, [onVerify, theme]);
  return <div ref={ref} style={{ display: "flex", justifyContent: "center" }} />;
}

/* ══════════════════════════════════════════════════════════════════════
   LOGIN SCREEN
   ══════════════════════════════════════════════════════════════════════ */

function LoginScreen({ onLogin, dark, setDark }) {
  const C = dark ? THEMES.dark : THEMES.light;
  const [user, setUser] = useState("");
  const [captchaDone, setCaptchaDone] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setQuoteIdx(i => (i + 1) % LOADING_QUOTES.length), 3000);
    return () => clearInterval(iv);
  }, []);

  const handleLogin = () => {
    if (!user.trim() || !captchaDone) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    // confetti burst on login
    if (window.confetti) {
      window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 }, colors: [C.acc, C.blue, C.purple, C.amber] });
    }
    setTimeout(() => onLogin(user.trim()), 400);
  };

  return (
    <div style={{
      minHeight: "100vh", background: dark ? "linear-gradient(135deg, #0f0f17 0%, #1a1a2e 50%, #16213e 100%)" : "linear-gradient(135deg, #F7F6F3 0%, #fff 50%, #EEECE7 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SANS,
    }}>
      {/* Dark mode toggle */}
      <button onClick={() => setDark(d => !d)} style={{
        position: "absolute", top: 16, right: 16, border: `1px solid ${C.bdr}`, background: C.card,
        color: C.txt, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600,
      }}>{dark ? "☀ Light" : "🌙 Dark"}</button>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(135deg, ${C.acc}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" }}>P</div>
        <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", color: C.txt }}>PolicyLab</span>
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 14, color: C.sec, marginBottom: 32, textAlign: "center", maxWidth: 400 }}>
        Interactive Macro Policy Simulator — IIM Indore · IPM23 · Group 10
      </p>

      {/* Login card */}
      <div style={{
        background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: "32px 36px", width: 380,
        boxShadow: dark ? "0 12px 40px rgba(0,0,0,0.4)" : "0 12px 40px rgba(0,0,0,0.06)",
        animation: shake ? "shake 0.4s ease-in-out" : "fadeUp 0.5s ease-out",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.txt, marginBottom: 20 }}>Sign in to simulate</div>

        <label style={{ fontSize: 10, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.08em" }}>Username</label>
        <input value={user} onChange={ev => setUser(ev.target.value)} placeholder="e.g. finance_minister_69"
          onKeyDown={ev => ev.key === "Enter" && handleLogin()}
          style={{
            width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 16, border: `1px solid ${C.bdr}`,
            borderRadius: 8, fontFamily: MONO, fontSize: 13, background: C.alt, color: C.txt, outline: "none",
            boxSizing: "border-box",
          }} />

        <div style={{ marginBottom: 16 }}>
          <HCaptchaWidget onVerify={() => setCaptchaDone(true)} theme={dark ? "dark" : "light"} />
          {captchaDone && <div style={{ fontSize: 10, color: C.green, fontFamily: MONO, marginTop: 6, textAlign: "center" }}>✓ Verified — you're not a central banker bot</div>}
        </div>

        <button onClick={handleLogin} style={{
          width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
          background: (user.trim() && captchaDone) ? `linear-gradient(135deg, ${C.acc}, ${C.purple})` : C.bdr,
          color: (user.trim() && captchaDone) ? "#fff" : C.ter,
          fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: (user.trim() && captchaDone) ? "pointer" : "not-allowed",
          transition: "all 0.2s",
        }}>
          Enter the Economy →
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          <div style={{ flex: 1, height: 1, background: C.bdr }} />
          <span style={{ fontSize: 9, color: C.ter, fontFamily: SANS }}>or</span>
          <div style={{ flex: 1, height: 1, background: C.bdr }} />
        </div>

        <button onClick={() => { setCaptchaDone(true); setUser("Guest Economist"); }}
          style={{ width: "100%", marginTop: 12, padding: "10px 0", borderRadius: 8, border: `1px solid ${C.bdr}`, background: "transparent", color: C.sec, fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          🎓 Continue as Guest Economist
        </button>
      </div>

      {/* Rotating quote */}
      <div style={{
        marginTop: 32, fontFamily: MONO, fontSize: 11, color: C.ter, textAlign: "center",
        minHeight: 20, transition: "opacity 0.3s",
      }}>
        {LOADING_QUOTES[quoteIdx]}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════════════════ */

function policyLabel(G, T, R, Tr) {
  const parts = [];
  if (G !== 50) parts.push(`G ${G > 50 ? "+" : ""}${(G - 50) * 2}%`);
  if (T !== 50) parts.push(`T ${T > 50 ? "+" : ""}${(T - 50) * 2}%`);
  if (R !== 50) parts.push(`R ${R > 50 ? "+" : ""}${(R - 50) * 2}%`);
  if (Tr !== 50) parts.push(`Tr ${Tr > 50 ? "+" : ""}${(Tr - 50) * 2}%`);
  return parts.length ? parts.join(", ") : "Baseline";
}

export default function PolicyLab() {
  // Auth
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [dark, setDark] = useState(false);
  const C = dark ? THEMES.dark : THEMES.light;

  // Tabs
  const [tab, setTab] = useState("sim");

  // Policy
  const [G, sG] = useState(50), [T, sT] = useState(50), [R, sR] = useState(50), [Tr, sTr] = useState(50);
  const [scenario, setSc] = useState(null);

  // Turn-based time
  const [quarter, setQuarter] = useState(0);
  const [econState, setEconState] = useState({ gdp: BASE.gdp, inflation: BASE.inflation, unemp: BASE.unemp, deficit: BASE.deficit, trade: BASE.trade, realWage: BASE.realWage, gini: BASE.gini, price: BASE.price });
  const [history, setHistory] = useState([]);

  // Historical overlay
  const [showHist, setShowHist] = useState(false);

  // Compare mode
  const [cmpA, setCmpA] = useState({ G: 50, T: 50, R: 50, Tr: 50, label: "Policy A" });
  const [cmpB, setCmpB] = useState({ G: 50, T: 50, R: 50, Tr: 50, label: "Policy B" });

  // Ratings
  const [ratings, setRatings] = useState({});

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimeout = useRef(null);
  const showToast = useCallback((msg) => {
    if (!msg) return;
    setToast(msg);
    clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Share URL on mount
  useEffect(() => {
    const shared = decodeShareURL();
    if (shared) { sG(shared.G); sT(shared.T); sR(shared.R); sTr(shared.Tr); setLoggedIn(true); setUsername("Shared Policy"); }
  }, []);

  // Konami code
  const konamiSeq = useRef([]);
  const KONAMI = "ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a";
  useEffect(() => {
    const handler = (ev) => {
      konamiSeq.current.push(ev.key);
      if (konamiSeq.current.length > 10) konamiSeq.current.shift();
      if (konamiSeq.current.join(",") === KONAMI) {
        showToast("🇮🇳 Manmohan Mode activated — 1991 liberalization loaded!");
        sG(40); sT(25); sR(50); sTr(25); setSc("Supply-Side Reform");
        konamiSeq.current = [];
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showToast]);

  // Computed
  const e = useMemo(() => simulate(G, T, R, Tr), [G, T, R, Tr]);

  // Blended economy: combine turn-based state with current policy preview
  const blended = useMemo(() => {
    if (quarter === 0) return e;
    return {
      ...e,
      gdp: econState.gdp * 0.35 + e.gdp * 0.65,
      inflation: econState.inflation * 0.45 + e.inflation * 0.55,
      unemp: econState.unemp * 0.5 + e.unemp * 0.5,
      deficit: econState.deficit * 0.3 + e.deficit * 0.7,
      trade: econState.trade * 0.4 + e.trade * 0.6,
      realWage: econState.realWage * 0.4 + e.realWage * 0.6,
      gini: econState.gini * 0.5 + e.gini * 0.5,
    };
  }, [e, econState, quarter]);

  const display = quarter > 0 ? blended : e;

  const adas = useMemo(() => adasCurves(e.adShift, e.asShift), [e.adShift, e.asShift]);
  const adasB = useMemo(() => adasCurves(0, 0), []);
  const islm = useMemo(() => islmCurves(e.isShift, e.lmShift), [e.isShift, e.lmShift]);
  const islmB = useMemo(() => islmCurves(0, 0), []);
  const mm = useMemo(() => moneyMarketCurves(e.moneyDemandShift, e.moneySupplyShift), [e.moneyDemandShift, e.moneySupplyShift]);
  const mmB = useMemo(() => moneyMarketCurves(0, 0), []);
  const lab = useMemo(() => labourCurves(e.labourDemandShift, e.labourSupplyShift), [e.labourDemandShift, e.labourSupplyShift]);
  const labB = useMemo(() => labourCurves(0, 0), []);
  const chains = useMemo(() => getChains(G, T, R, Tr, display), [G, T, R, Tr, display]);
  const adasI = useMemo(() => findInt(adas, "ad", "as"), [adas]);
  const islmI = useMemo(() => findInt(islm, "is", "lm"), [islm]);
  const mmI = useMemo(() => findInt(mm, "md", "ms"), [mm]);
  const labI = useMemo(() => findInt(lab, "ld", "ls"), [lab]);
  const eA = useMemo(() => simulate(cmpA.G, cmpA.T, cmpA.R, cmpA.Tr), [cmpA]);
  const eB = useMemo(() => simulate(cmpB.G, cmpB.T, cmpB.R, cmpB.Tr), [cmpB]);
  const grade = useMemo(() => gradePolicy(display), [display]);

  const mod = G !== 50 || T !== 50 || R !== 50 || Tr !== 50;
  const reset = () => { sG(50); sT(50); sR(50); sTr(50); setSc(null); setQuarter(0); setHistory([]); setEconState({ gdp: BASE.gdp, inflation: BASE.inflation, unemp: BASE.unemp, deficit: BASE.deficit, trade: BASE.trade, realWage: BASE.realWage, gini: BASE.gini, price: BASE.price }); };
  const apply = s => { sG(s.g); sT(s.t); sR(s.r); sTr(s.tr); setSc(s.name); setTab("sim"); };

  const advanceQuarter = () => {
    const newQ = quarter + 1;
    const newState = advanceEconomy(econState, e);
    setQuarter(newQ);
    setEconState(newState);
    const label = policyLabel(G, T, R, Tr);
    setHistory(prev => [...prev, {
      step: newQ, label,
      desc: [G !== 50 && (G > 50 ? "↑G" : "↓G"), T !== 50 && (T > 50 ? "↑T" : "↓T"), R !== 50 && (R > 50 ? "↑R" : "↓R"), Tr !== 50 && (Tr > 50 ? "↑Tr" : "↓Tr")].filter(Boolean).join(" ") || "Hold",
      G, T, R, Tr,
      gdp: newState.gdp, inflation: newState.inflation, unemp: newState.unemp,
      deficit: newState.deficit, trade: newState.trade, gini: newState.gini,
    }]);
    // Confetti on milestone quarters
    if (window.confetti && newQ % 4 === 0) {
      window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 }, colors: [C.acc, C.blue, C.green] });
    }
    // Check for toast-worthy combos
    const t = getToast(G, T, R, Tr);
    if (t) showToast(t);
  };

  const sharePolicy = () => {
    const url = encodeShareURL(G, T, R, Tr, quarter);
    navigator.clipboard.writeText(url).then(() => showToast("📋 Share link copied!")).catch(() => showToast("Link: " + url));
  };

  // LOGIN GATE
  if (!loggedIn) return <LoginScreen onLogin={(u) => { setUsername(u); setLoggedIn(true); }} dark={dark} setDark={setDark} />;

  const TT_STYLE = { background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 11, fontFamily: SANS };

  const tabStyle = (t) => ({
    border: "none", background: "none", cursor: "pointer", padding: "12px 14px",
    fontFamily: SANS, fontSize: 12, fontWeight: 600,
    color: tab === t ? C.acc : C.ter,
    borderBottom: `2px solid ${tab === t ? C.acc : "transparent"}`,
    transition: "all 0.15s",
  });
  const btnStyle = (active) => ({
    background: active ? C.accBg : C.card,
    border: `1px solid ${active ? C.acc + "40" : C.bdr}`,
    color: active ? C.acc : C.sec,
    padding: "5px 12px", borderRadius: 5, fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: SANS, transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: SANS, color: C.txt, transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:${C.txt}; cursor:pointer; border:2px solid ${C.bg}; }
        input[type="range"]::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:${C.txt}; cursor:pointer; border:2px solid ${C.bg}; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        .fu { animation: fadeUp 0.25s ease-out; }
        .sc:hover { border-color: ${C.acc} !important; box-shadow: 0 2px 12px rgba(196,85,10,0.07); }
        .sim-grid { display: grid; grid-template-columns: 240px 1fr 260px; gap: 16px; align-items: start; }
        .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .scenario-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .cmp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .history-chart-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 1100px) { .sim-grid { grid-template-columns: 220px 1fr; } .sim-grid > div:nth-child(3) { grid-column: 1 / -1; } .cmp-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) { .sim-grid,.chart-grid,.scenario-grid,.history-chart-wrap { grid-template-columns: 1fr; } }
        .timeline-step { border-left: 2px solid ${C.bdr}; padding: 0 0 12px 14px; margin-left: 6px; position: relative; cursor: pointer; transition: all 0.15s; }
        .timeline-step:hover { border-left-color: ${C.acc}; }
        .timeline-step::before { content: ''; position: absolute; left: -5px; top: 2px; width: 8px; height: 8px; border-radius: 50%; background: ${C.bdr}; border: 2px solid ${C.bg}; }
        .timeline-step:hover::before { background: ${C.acc}; }
        .timeline-step:last-child { border-left-color: transparent; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: `1px solid ${C.bdr}`, background: C.card, transition: "all 0.3s" }}>
        <div style={{ maxWidth: 1340, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
              <div style={{ width: 26, height: 26, borderRadius: 5, background: `linear-gradient(135deg, ${C.acc}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>P</div>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: C.txt }}>PolicyLab</span>
            </div>
            <nav style={{ display: "flex" }}>
              <button style={tabStyle("sim")} onClick={() => setTab("sim")}>Simulator</button>
              <button style={tabStyle("compare")} onClick={() => setTab("compare")}>Compare</button>
              <button style={tabStyle("scenarios")} onClick={() => setTab("scenarios")}>Scenarios</button>
              <button style={tabStyle("about")} onClick={() => setTab("about")}>About</button>
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Policy Grade Badge */}
            <div style={{
              padding: "3px 10px", borderRadius: 6, fontFamily: MONO, fontSize: 13, fontWeight: 800,
              color: grade.color, background: grade.color + "18", border: `1px solid ${grade.color}40`,
              animation: mod ? "pulse 2s infinite" : "none",
            }}>{grade.grade}</div>
            {/* Quarter indicator */}
            <div style={{ padding: "3px 10px", borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.purple, background: C.purple + "15", border: `1px solid ${C.purple}30` }}>
              Q{quarter}
            </div>
            {/* Dark mode */}
            <button onClick={() => setDark(d => !d)} style={{ border: `1px solid ${C.bdr}`, background: C.card, color: C.txt, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: SANS, fontSize: 11 }}>
              {dark ? "☀" : "🌙"}
            </button>
            {/* Share */}
            <button onClick={sharePolicy} style={btnStyle(false)}>Share</button>
            {tab === "sim" && mod && <button onClick={reset} style={btnStyle(false)}>Reset</button>}
            <span style={{ fontSize: 10, fontFamily: MONO, color: C.ter }}>{username}</span>
          </div>
        </div>
      </header>

      {/* ══════════ SIMULATOR TAB ══════════ */}
      {tab === "sim" && (
        <div style={{ maxWidth: 1340, margin: "0 auto", padding: "16px 20px" }} className="fu">
          {scenario && mod && (
            <div style={{ background: C.accBg, border: `1px solid ${C.acc}25`, borderRadius: 6, padding: "6px 12px", marginBottom: 12, fontSize: 11, color: C.acc, fontWeight: 500 }}>
              <strong>{scenario}</strong> <span style={{ color: C.sec }}>— Q{quarter} — adjust sliders and advance quarters</span>
            </div>
          )}

          {/* Indicators */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat C={C} label="GDP" val={`₹${display.gdp.toFixed(2)}T`} raw={display.gdp} unit="" base={BASE.gdp} />
            <Stat C={C} label="Inflation" val={display.inflation.toFixed(1)} raw={display.inflation} unit="%" base={BASE.inflation} inv />
            <Stat C={C} label="Unemployment" val={display.unemp.toFixed(1)} raw={display.unemp} unit="%" base={BASE.unemp} inv />
            <Stat C={C} label="Fiscal Deficit" val={display.deficit.toFixed(1)} raw={display.deficit} unit="%GDP" base={BASE.deficit} inv />
            <Stat C={C} label="Trade Bal." val={display.trade.toFixed(1)} raw={display.trade} unit="%GDP" base={BASE.trade} />
            <Stat C={C} label="Real Wage" val={display.realWage.toFixed(0)} raw={display.realWage} unit="idx" base={BASE.realWage} />
            <Stat C={C} label="Gini" val={display.gini.toFixed(3)} raw={display.gini} unit="" base={BASE.gini} inv />
          </div>

          {/* Main 3-col grid */}
          <div className="sim-grid">
            {/* Left: sliders + time controls */}
            <div>
              <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "14px 14px 8px", transition: "all 0.3s" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Policy Levers</div>
                <Slider C={C} label="Govt Spending" value={G} onChange={sG} color={C.amber} left="Austerity" right="Expansion" />
                <Slider C={C} label="Tax Rate" value={T} onChange={sT} color={C.red} left="Cut" right="Hike" />
                <Slider C={C} label="Repo Rate" value={R} onChange={sR} color={C.purple} left="Easing" right="Tightening" />
                <Slider C={C} label="Import Tariff" value={Tr} onChange={sTr} color={C.green} left="Open" right="Protect" />

                {/* TIME CONTROLS */}
                <div style={{ borderTop: `1px solid ${C.bdr}`, paddingTop: 10, marginTop: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Time Engine</div>
                  <button onClick={advanceQuarter} style={{
                    ...btnStyle(true), width: "100%", padding: "9px 0", fontSize: 12,
                    background: `linear-gradient(135deg, ${C.acc}, ${C.purple})`, color: "#fff", border: "none",
                  }}>
                    Advance Quarter → Q{quarter + 1}
                  </button>
                  <div style={{ fontSize: 9, fontFamily: SERIF, color: C.ter, marginTop: 6, textAlign: "center", fontStyle: "italic" }}>
                    {quarter === 0 ? "Set policy, then advance time" : `Economy compounding over ${quarter} quarter${quarter > 1 ? "s" : ""}`}
                  </div>
                </div>
              </div>

              {/* Timeline */}
              {history.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                    Quarter History ({history.length})
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto", paddingRight: 4 }}>
                    {history.map((h, i) => (
                      <div key={i} className="timeline-step" onClick={() => { sG(h.G); sT(h.T); sR(h.R); sTr(h.Tr); }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.txt }}>Q{h.step}</span>
                          <span style={{ fontSize: 9, fontFamily: MONO, color: C.ter }}>₹{h.gdp.toFixed(2)}T</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.sec, fontFamily: SERIF, marginTop: 1 }}>{h.desc}</div>
                        <div style={{ fontSize: 9, fontFamily: MONO, color: C.ter, marginTop: 1 }}>
                          π{h.inflation.toFixed(1)}% u{h.unemp.toFixed(1)}% Δ{h.deficit.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Center: charts */}
            <div>
              <div className="chart-grid">
                <ADASChart C={C} data={adas} baseData={adasB} intersection={adasI} modified={mod} showHistory={showHist} onToggleHistory={() => setShowHist(h => !h)} />
                <MiniChart C={C} title="IS — LM" data={islm} baseData={islmB} k1="is" k2="lm" l1="IS" l2="LM" c1={C.blue} c2={C.red} xLabel="Output (₹T)" yLabel="Interest %" yDomain={[0, 18]} intersection={islmI} modified={mod} />
                <MiniChart C={C} title="Money Market" data={mm} baseData={mmB} k1="md" k2="ms" l1="Md" l2="Ms" c1={C.blue} c2={C.red} xLabel="Quantity" yLabel="Interest %" yDomain={[0, 18]} intersection={mmI} modified={mod} />
                <MiniChart C={C} title="Labour Market" data={lab} baseData={labB} k1="ld" k2="ls" l1="Ld" l2="Ls" c1={C.blue} c2={C.red} xLabel="Employment (M)" yLabel="Real Wage" yDomain={[0, 22]} intersection={labI} modified={mod} />
              </div>
              <div style={{ marginTop: 10 }}>
                <PhillipsCurveChart C={C} currentUnemp={display.unemp} currentInflation={display.inflation} history={history} showHistory={showHist} onToggleHistory={() => setShowHist(h => !h)} />
              </div>
            </div>

            {/* Right: chains */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Transmission</div>
              <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
                {chains.map((c, i) => (
                  <div key={i} style={{ background: C.card, border: `1px solid ${C.bdr}`, borderLeft: `3px solid ${c.color}`, borderRadius: 7, padding: "10px 12px", marginBottom: 7, transition: "all 0.3s" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: c.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{c.label}</div>
                    {c.steps.map((s, j) => (
                      <div key={j} style={{ fontSize: 11.5, lineHeight: 1.5, fontFamily: SERIF, color: s.startsWith("⚠") ? C.amber : C.txt, fontWeight: s.startsWith("⚠") ? 600 : 400 }}>{s}</div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, padding: "8px 10px", background: C.alt, borderRadius: 6, fontSize: 9.5, fontFamily: SERIF, color: C.sec, lineHeight: 1.5, transition: "all 0.3s" }}>
                Simplified elasticity model calibrated to Indian economy. Directionally accurate, not predictive.
              </div>
            </div>
          </div>

          {/* History sparklines */}
          {history.length >= 2 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Economic Evolution</div>
              <div className="history-chart-wrap">
                {[
                  { key: "gdp", label: "GDP (₹T)", color: C.blue },
                  { key: "inflation", label: "Inflation %", color: C.red },
                  { key: "unemp", label: "Unemployment %", color: C.amber },
                  { key: "deficit", label: "Fiscal Deficit %", color: C.purple },
                ].map(({ key, label, color }) => (
                  <div key={key} style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "10px 10px 4px", transition: "all 0.3s" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, fontFamily: SANS, color: C.sec, marginBottom: 4 }}>{label}</div>
                    <ResponsiveContainer width="100%" height={80}>
                      <AreaChart data={[{ step: 0, [key]: BASE[key === "deficit" ? "deficit" : key] }, ...history]} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <defs>
                          <linearGradient id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="step" tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL} />
                        <YAxis hide domain={["auto", "auto"]} />
                        <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2} fill={`url(#g-${key})`} dot={{ r: 3, fill: color, strokeWidth: 0 }} />
                        <Tooltip contentStyle={TT_STYLE} formatter={v => [typeof v === "number" ? v.toFixed(2) : v, label]} labelFormatter={v => `Q${v}`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ COMPARE TAB ══════════ */}
      {tab === "compare" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }} className="fu">
          <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: SERIF, marginBottom: 4, color: C.txt }}>Compare Policies</h2>
          <p style={{ fontSize: 12, color: C.sec, fontFamily: SERIF, marginBottom: 20 }}>Two policy mixes side by side.</p>
          <div className="cmp-grid">
            {[
              { cfg: cmpA, set: setCmpA, label: "Policy A", color: C.cmpA, econ: eA },
              { cfg: cmpB, set: setCmpB, label: "Policy B", color: C.cmpB, econ: eB },
            ].map(({ cfg, set, label, color, econ }) => (
              <div key={label}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  <input value={cfg.label} onChange={ev => set(p => ({ ...p, label: ev.target.value }))}
                    style={{ border: "none", background: "transparent", fontSize: 15, fontWeight: 700, fontFamily: SANS, color: C.txt, outline: "none", width: 200 }} />
                  <select onChange={ev => { const s = SCENARIOS.find(s => s.name === ev.target.value); if (s) set(p => ({ ...p, G: s.g, T: s.t, R: s.r, Tr: s.tr, label: s.name })); }} value=""
                    style={{ fontSize: 10, fontFamily: SANS, color: C.sec, border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "2px 6px", background: C.card, cursor: "pointer" }}>
                    <option value="">Load scenario...</option>
                    {SCENARIOS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "14px 14px 8px", marginBottom: 12, transition: "all 0.3s" }}>
                  <Slider C={C} label="Govt Spending" value={cfg.G} onChange={v => set(p => ({ ...p, G: v }))} color={C.amber} left="Austerity" right="Expansion" compact />
                  <Slider C={C} label="Tax Rate" value={cfg.T} onChange={v => set(p => ({ ...p, T: v }))} color={C.red} left="Cut" right="Hike" compact />
                  <Slider C={C} label="Repo Rate" value={cfg.R} onChange={v => set(p => ({ ...p, R: v }))} color={C.purple} left="Easing" right="Tightening" compact />
                  <Slider C={C} label="Import Tariff" value={cfg.Tr} onChange={v => set(p => ({ ...p, Tr: v }))} color={C.green} left="Open" right="Protect" compact />
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Stat C={C} small label="GDP" val={`₹${econ.gdp.toFixed(2)}T`} raw={econ.gdp} unit="" base={BASE.gdp} />
                  <Stat C={C} small label="Inflation" val={econ.inflation.toFixed(1)} raw={econ.inflation} unit="%" base={BASE.inflation} inv />
                  <Stat C={C} small label="Unemp" val={econ.unemp.toFixed(1)} raw={econ.unemp} unit="%" base={BASE.unemp} inv />
                  <Stat C={C} small label="Deficit" val={econ.deficit.toFixed(1)} raw={econ.deficit} unit="%" base={BASE.deficit} inv />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "16px 12px 8px", transition: "all 0.3s" }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={[
                { name: "GDP", a: +eA.gdp.toFixed(2), b: +eB.gdp.toFixed(2) },
                { name: "Inflation", a: +eA.inflation.toFixed(1), b: +eB.inflation.toFixed(1) },
                { name: "Unemp", a: +eA.unemp.toFixed(1), b: +eB.unemp.toFixed(1) },
                { name: "Deficit", a: +eA.deficit.toFixed(1), b: +eB.deficit.toFixed(1) },
                { name: "Trade", a: +eA.trade.toFixed(1), b: +eB.trade.toFixed(1) },
                { name: "Gini", a: +eA.gini.toFixed(3), b: +eB.gini.toFixed(3) },
              ]} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.bdrL} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.sec }} stroke={C.bdrL} />
                <YAxis tick={{ fontSize: 9, fill: C.ter }} stroke={C.bdrL} />
                <Tooltip contentStyle={TT_STYLE} />
                <Bar dataKey="a" name={cmpA.label} fill={C.cmpA} radius={[3, 3, 0, 0]} barSize={20} />
                <Bar dataKey="b" name={cmpB.label} fill={C.cmpB} radius={[3, 3, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, fontSize: 11, fontFamily: SANS, color: C.sec, paddingBottom: 4 }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: C.cmpA, marginRight: 4, verticalAlign: "middle" }} />{cmpA.label}</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: C.cmpB, marginRight: 4, verticalAlign: "middle" }} />{cmpB.label}</span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ SCENARIOS TAB ══════════ */}
      {tab === "scenarios" && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }} className="fu">
          <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: SERIF, marginBottom: 4, color: C.txt }}>Policy Scenarios</h2>
          <p style={{ fontSize: 13, color: C.sec, fontFamily: SERIF, marginBottom: 24 }}>Real macroeconomic episodes. Click to load, rate to judge.</p>
          <div className="scenario-grid">
            {SCENARIOS.map(s => (
              <div key={s.name} className="sc" style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "16px 18px", cursor: "pointer", transition: "all 0.15s" }}>
                <div onClick={() => apply(s)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS, color: C.txt }}>{s.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.acc, background: C.accBg, padding: "2px 7px", borderRadius: 3 }}>{s.tag}</span>
                  </div>
                  <p style={{ fontSize: 12, color: C.sec, fontFamily: SERIF, lineHeight: 1.5, marginBottom: 4 }}>{s.desc}</p>
                  <p style={{ fontSize: 11, color: C.ter, fontFamily: SERIF, fontStyle: "italic", marginBottom: 6 }}>{s.ctx}</p>
                  <div style={{ fontSize: 10.5, fontFamily: MONO, color: C.txt, background: C.alt, padding: "7px 9px", borderRadius: 5, marginBottom: 6 }}>{s.exp}</div>
                </div>
                {/* Rating */}
                <StarRating C={C} rating={ratings[s.name] || 0} onRate={(r) => setRatings(prev => ({ ...prev, [s.name]: r }))} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ ABOUT TAB ══════════ */}
      {tab === "about" && (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 20px" }} className="fu">
          <h2 style={{ fontSize: 26, fontWeight: 700, fontFamily: SERIF, marginBottom: 6, color: C.txt }}>About PolicyLab</h2>
          <p style={{ fontSize: 14, fontFamily: SERIF, color: C.sec, lineHeight: 1.7, marginBottom: 20 }}>
            An interactive macroeconomic policy simulator with turn-based time dynamics. Set fiscal and monetary policy, advance quarters, and watch your economy compound — or implode.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS, marginBottom: 6, color: C.txt }}>Transmission Channels</h3>
          <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "14px 16px", marginBottom: 20, fontFamily: MONO, fontSize: 11, lineHeight: 2.0, color: C.txt, transition: "all 0.3s" }}>
            <div><span style={{ color: C.amber, fontWeight: 700 }}>G ↑</span> → IS right → AD right → ↑Y ↑P ↑i</div>
            <div><span style={{ color: C.red, fontWeight: 700 }}>T ↑</span> → IS left → AD left + AS left → stagflation risk</div>
            <div><span style={{ color: C.purple, fontWeight: 700 }}>R ↑</span> → LM up → Ms contracts → ↓Y ↓P</div>
            <div><span style={{ color: C.green, fontWeight: 700 }}>Tr ↑</span> → AS left (cost-push) → ↑P, mixed Y</div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS, marginBottom: 6, color: C.txt }}>What's New</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { t: "Turn-Based Time", d: "Advance quarters. GDP compounds, inflation has momentum, unemployment shows hysteresis." },
              { t: "Policy Grade", d: "Real-time A+ to F grading based on GDP, inflation targeting, employment, and inequality." },
              { t: "Dark Mode", d: "For those late-night policy simulations in the hostel." },
              { t: "Share Policies", d: "Generate a URL that loads your exact policy state. Send it to your group." },
              { t: "Scenario Ratings", d: "Rate each historical scenario. Is Keynesian Stimulus 'Absolute Keynes' or 'License Raj'?" },
              { t: "Easter Eggs", d: "Try the Konami code. Push sliders to extremes. We won't spoil the rest." },
            ].map(x => (
              <div key={x.t} style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, padding: "10px 12px", transition: "all 0.3s" }}>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: SANS, marginBottom: 2, color: C.txt }}>{x.t}</div>
                <div style={{ fontSize: 11, fontFamily: SERIF, color: C.sec, lineHeight: 1.5 }}>{x.d}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS, marginBottom: 6, color: C.txt }}>Credits & Inspiration</h3>
          <p style={{ fontSize: 13, fontFamily: SERIF, color: C.sec, lineHeight: 1.7, marginBottom: 8 }}>
            Inspired by open-source economics simulators including Prosperity Wars (agent-based policy game), Economia.js (emergent market sim), and macrosimulation.org (academic AD-AS tools). Built with React + Recharts + Vite.
          </p>
          <div style={{ padding: "12px 16px", background: C.alt, borderRadius: 8, fontSize: 12, fontFamily: SANS, color: C.sec, transition: "all 0.3s" }}>
            <strong style={{ color: C.txt }}>Built for</strong> IIM Indore · IPM23 · Group 10 · Web Dev Class
          </div>
          <div style={{ marginTop: 12, fontSize: 10, fontFamily: MONO, color: C.ter, textAlign: "center" }}>
            "In the long run, we are all dead." — Keynes · "The curious task of economics is to demonstrate to men how little they really know." — Hayek
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} C={C} />}
    </div>
  );
}
