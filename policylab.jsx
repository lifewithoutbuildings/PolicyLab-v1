import { useState, useMemo, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, BarChart, Bar, Cell,
  AreaChart, Area
} from "recharts";

/* ═══════════════════════════════════════════════════════════════════════════
   ECONOMIC ENGINE
   ═══════════════════════════════════════════════════════════════════════════ */

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
    // AD: downward sloping. Calibrated so at x=0.5 (output=3.5T), AD≈108
    const adv = 145 - x * 70 + ad * 16;
    // SRAS: upward sloping with convexity at high output. At x=0.5, SRAS≈105
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
// Find approximate intersection. valid=false if curves don't cross (gap > 3).
function findInt(data, k1, k2) {
  let min = Infinity, best = { x: 0, y: 0, valid: false };
  data.forEach(p => {
    const d = Math.abs(p[k1] - p[k2]);
    if (d < min) { min = d; best = { x: p.x, y: +((p[k1] + p[k2]) / 2).toFixed(1), valid: d < 3.0 }; }
  });
  return best;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORICAL INDIA DATA (2015–2024)
   Real GDP (₹T at current prices, USD approx) and GDP deflator as price proxy.
   Mapped to the AD-AS chart coordinate space:
     X-axis: Output in ₹T (model range ~1.5–5.5)
     Y-axis: Price level index (model range ~40–180)
   
   Sources: RBI, MoSPI, World Bank. GDP in USD trillions (current).
   Price level: GDP deflator indexed to model baseline (2019=100).
   ═══════════════════════════════════════════════════════════════════════════ */

const INDIA_HISTORY = [
  // { year, gdp (USD T current), priceIndex (deflator mapped to chart scale) }
  // GDP mapped: real range ~2.1T–3.5T → chart x-axis
  // Price: deflator growth indexed so 2019-20 ≈ 100 (our baseline)
  { year: 2015, gdp: 2.10, price: 82 },
  { year: 2016, gdp: 2.29, price: 85 },
  { year: 2017, gdp: 2.65, price: 88 },
  { year: 2018, gdp: 2.70, price: 92 },
  { year: 2019, gdp: 2.83, price: 96 },
  { year: 2020, gdp: 2.67, price: 100 },  // COVID contraction
  { year: 2021, gdp: 3.15, price: 108 },  // Recovery + inflation
  { year: 2022, gdp: 3.39, price: 118 },  // Post-COVID inflation spike
  { year: 2023, gdp: 3.57, price: 122 },
  { year: 2024, gdp: 3.73, price: 126 },
];

/* ═══════════════════════════════════════════════════════════════════════════
   CAUSAL CHAINS
   ═══════════════════════════════════════════════════════════════════════════ */

function getChains(G, T, R, Tr, e) {
  const chains = [];
  const gs = G - 50, ts = T - 50, rs = R - 50, trs = Tr - 50;
  if (Math.abs(gs) > 5) {
    const up = gs > 0;
    chains.push({ label: "Fiscal: Govt Spending", color: "#C4870A",
      steps: up ? [
        "↑ Government expenditure (G)", "→ IS curve shifts right",
        "→ ↑ AD → ↑ output and ↑ price level",
        `→ Multiplier ≈ ${(1.5 + Math.abs(gs) / 80).toFixed(1)}x`,
        `→ Interest rate rises (crowding out) → i = ${e.eqInterest.toFixed(1)}%`,
        `→ Fiscal deficit widens to ${e.deficit.toFixed(1)}% of GDP`,
        e.unemp < 4 ? "⚠ Near full employment — mostly inflationary" : "→ Output gap narrows, unemployment falls",
      ] : [
        "↓ Government spending (austerity)", "→ IS shifts left → ↓ AD",
        "→ Negative multiplier contracts activity",
        `→ Deficit narrows to ${e.deficit.toFixed(1)}% — unemployment rises to ${e.unemp.toFixed(1)}%`,
      ]
    });
  }
  if (Math.abs(ts) > 5) {
    const up = ts > 0;
    chains.push({ label: "Fiscal: Taxation", color: "#D14B4B",
      steps: up ? [
        "↑ Tax rate → ↓ Yd = Y − T", "→ ↓ Consumption → IS left → ↓ AD",
        "→ Also ↑ costs → AS left", "→ Stagflationary pressure",
        Math.abs(ts) > 30 ? "⚠ Laffer curve — revenue may decline" : `→ Revenue rises, deficit at ${e.deficit.toFixed(1)}%`,
        `→ Gini → ${e.gini.toFixed(3)}`,
      ] : [
        "↓ Tax rate → ↑ Yd → ↑ C", "→ IS right → ↑ AD",
        "→ Lower costs → AS right", `→ Deficit widens to ${e.deficit.toFixed(1)}%`,
      ]
    });
  }
  if (Math.abs(rs) > 5) {
    const up = rs > 0;
    chains.push({ label: "Monetary: Repo Rate", color: "#7B61C4",
      steps: up ? [
        "↑ Repo rate → LM shifts up", "→ ↑ Borrowing cost → ↓ Investment",
        "→ Ms contracts → rate rises", "→ ↓ AD → ↓ output, ↓ inflation",
        "→ ₹ appreciates (yield inflows)",
        `→ Trade balance → ${e.trade.toFixed(1)}%`,
        e.unemp > 9 ? "⚠ Tightening into slowdown" : "→ RBI targeting in action",
      ] : [
        "↓ Repo → LM down", "→ ↓ Cost → ↑ I + credit",
        "→ Ms expands", "→ ↑ AD → ↑ output, ↑ inflation",
        `→ Inflation → ${e.inflation.toFixed(1)}%`,
      ]
    });
  }
  if (Math.abs(trs) > 5) {
    const up = trs > 0;
    chains.push({ label: "Trade: Import Tariff", color: "#3A8A5C",
      steps: up ? [
        "↑ Tariff → ↑ input costs", "→ AS left (cost-push)",
        "→ Domestic producers gain share", "→ Ld ↑ in protected sectors",
        `→ Trade balance → ${e.trade.toFixed(1)}%`, "→ Prices rise — regressive",
        Math.abs(trs) > 30 ? "⚠ DWL exceeds protection gains" : "→ Infant industry defence",
      ] : [
        "↓ Tariff → ↓ costs → AS right", "→ ↓ Prices, ↑ competition",
        `→ Trade deficit may widen to ${e.trade.toFixed(1)}%`,
      ]
    });
  }
  if (!chains.length) {
    chains.push({ label: "Baseline", color: "#8090A0",
      steps: ["All levers at baseline", "GDP ₹3.5T · Inflation 5% · Unemp 7.5%", "Adjust sliders to begin"]
    });
  }
  return chains;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCENARIOS
   ═══════════════════════════════════════════════════════════════════════════ */

const SCENARIOS = [
  { name: "Keynesian Stimulus", tag: "Demand", desc: "Classic expansionary fiscal + accommodative monetary.", ctx: "India post-COVID 2020-21: Atmanirbhar 1.0, RBI cuts to 4%.", g: 80, t: 35, r: 30, tr: 50, exp: "GDP ↑↑, unemployment ↓↓, inflation spikes, deficit balloons." },
  { name: "Volcker Shock", tag: "Monetary", desc: "Aggressive tightening to break inflation expectations.", ctx: "Fed 1979-82 pushed rates to 20%. RBI post-2016 is a mild version.", g: 50, t: 50, r: 90, tr: 50, exp: "Inflation crushed, severe output contraction. LM shifts sharply up." },
  { name: "Atmanirbhar Bharat", tag: "Protection", desc: "Spending + high tariffs to build domestic capacity.", ctx: "PLI schemes + customs increases post-2020. ISI echoes.", g: 65, t: 50, r: 50, tr: 80, exp: "GDP rises but AS contracts. Inflation up, trade improves short-run." },
  { name: "Supply-Side Reform", tag: "Structural", desc: "Cut taxes, cut tariffs. The 1991 liberalization playbook.", ctx: "Manmohan Singh reforms. 2019 corporate tax cut (35→25%).", g: 40, t: 25, r: 50, tr: 25, exp: "AS right → prices fall, output rises. Deficit widens." },
  { name: "Stagflation Trap", tag: "Crisis", desc: "High spending, taxes, easy money, barriers. Everything wrong.", ctx: "India 1970s-80s: license raj, deficit financing.", g: 70, t: 70, r: 30, tr: 75, exp: "Output stagnates, prices surge. No good options." },
  { name: "Austerity Programme", tag: "Fiscal", desc: "Slash spending, raise taxes, tighten money. IMF playbook.", ctx: "Greece 2010-15. Argentina IMF. India FRBM Act.", g: 20, t: 70, r: 70, tr: 50, exp: "Deficit shrinks, GDP contracts. IS hard left, LM up." },
];

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */

const SANS = `'Outfit', 'Avenir', sans-serif`;
const SERIF = `'Source Serif 4', Georgia, serif`;
const MONO = `'JetBrains Mono', monospace`;
const C = {
  bg: "#F7F6F3", card: "#FFFFFF", alt: "#EEECE7", bdr: "#DDD9D0", bdrL: "#E8E5DE",
  txt: "#1C1B18", sec: "#6B6860", ter: "#9C9890",
  acc: "#C4550A", accBg: "#FDF0E8",
  blue: "#3B7DD8", red: "#D14B4B", green: "#3A8A5C", purple: "#7B61C4", amber: "#C4870A",
  // Compare mode
  cmpA: "#3B7DD8", cmpB: "#C4550A",
};
const TT = { background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 11, fontFamily: SANS, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" };

/* ═══════════════════════════════════════════════════════════════════════════
   UI ATOMS
   ═══════════════════════════════════════════════════════════════════════════ */

// raw = actual numeric value for delta calc; val = display string
function Stat({ label, val, raw, unit, base, inv, small }) {
  const n = typeof raw === "number" ? raw : parseFloat(val);
  const d = n - base;
  const pct = base ? Math.abs((d / Math.abs(base)) * 100).toFixed(1) : "0";
  const up = d > 0.01, dn = d < -0.01;
  const clr = (up || dn) ? ((inv ? dn : up) ? C.green : C.red) : C.ter;
  return (
    <div style={{ flex: 1, minWidth: small ? 80 : 100, padding: small ? "6px 8px" : "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
      <div style={{ fontSize: small ? 8 : 9, fontFamily: SANS, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: small ? 15 : 20, fontWeight: 700, fontFamily: MONO, color: C.txt, marginTop: 1 }}>{val}<span style={{ fontSize: small ? 8 : 10, color: C.ter, fontFamily: SANS, fontWeight: 400 }}> {unit}</span></div>
      {(up || dn) && <div style={{ fontSize: small ? 8 : 9, fontFamily: MONO, color: clr, marginTop: 1 }}>{up ? "▲" : "▼"} {pct}%</div>}
    </div>
  );
}

function Slider({ label, value, onChange, color, left, right, compact }) {
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

function MiniChart({ title, data, baseData, k1, k2, l1, l2, c1, c2, xLabel, yLabel, yDomain, intersection, modified, height }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "12px 10px 4px" }}>
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
          {/* Baseline dashed overlays use per-line data={baseData} to override chart-level data */}
          {modified && <>
            <Line data={baseData} dataKey={k1} stroke={c1} strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.18} />
            <Line data={baseData} dataKey={k2} stroke={c2} strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.18} />
          </>}
          <Line dataKey={k1} stroke={c1} strokeWidth={2} dot={false} />
          <Line dataKey={k2} stroke={c2} strokeWidth={2} dot={false} />
          {intersection.valid && <ReferenceDot x={intersection.x} y={intersection.y} r={4} fill={C.acc} stroke={C.card} strokeWidth={2} />}
          <Tooltip contentStyle={TT} formatter={(v, n) => [typeof v === "number" ? v.toFixed(1) : v, n === k1 ? l1 : l2]} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER: generate a summary label for a policy state
   ═══════════════════════════════════════════════════════════════════════════ */

/* Custom AD-AS chart with optional historical India trajectory overlay */
function ADASChart({ data, baseData, intersection, modified, showHistory, onToggleHistory }) {
  const histData = INDIA_HISTORY.map(h => ({ x: h.gdp, hist: h.price }));

  const renderHistDot = (props) => {
    const { cx, cy, index } = props;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    const yr = INDIA_HISTORY[index];
    if (!yr) return null;
    return (
      <g key={`hist-${index}`}>
        <circle cx={cx} cy={cy} r={3.5} fill="#D4760A" stroke={C.card} strokeWidth={1.5} />
        <text x={cx + (index % 2 === 0 ? -2 : 2)} y={cy - 8} textAnchor="middle" fontSize={7} fontFamily={MONO} fill="#D4760A" fontWeight={600}>
          '{String(yr.year).slice(2)}
        </text>
      </g>
    );
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "12px 10px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "0 4px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SANS, color: C.txt }}>AD — AS</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: SANS, color: C.ter }}>
          <span><span style={{ color: C.blue, fontWeight: 700 }}>━</span> AD</span>
          <span><span style={{ color: C.red, fontWeight: 700 }}>━</span> SRAS</span>
          {showHistory && <span><span style={{ color: "#D4760A", fontWeight: 700 }}>●━</span> India</span>}
          <button onClick={onToggleHistory} style={{
            border: `1px solid ${showHistory ? "#D4760A" : C.bdr}`,
            background: showHistory ? "#FDF0E8" : "transparent",
            color: showHistory ? "#D4760A" : C.ter,
            fontSize: 8, fontFamily: SANS, fontWeight: 600,
            padding: "2px 6px", borderRadius: 3, cursor: "pointer",
            transition: "all 0.15s", lineHeight: 1.2,
          }}>
            {showHistory ? "▣" : "▢"} India 2015–24
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 14, left: 2 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.bdrL} />
          <XAxis dataKey="x" type="number" domain={[1.5, 5.5]}
            ticks={[1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5]}
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
          {showHistory && (
            <Line
              data={histData}
              dataKey="hist"
              stroke="#D4760A"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={renderHistDot}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {intersection.valid && <ReferenceDot x={intersection.x} y={intersection.y} r={4} fill={C.acc} stroke={C.card} strokeWidth={2} />}
          <Tooltip
            contentStyle={TT}
            formatter={(v, n) => {
              if (n === "hist") return [v, "India (actual)"];
              return [typeof v === "number" ? v.toFixed(1) : v, n === "ad" ? "AD" : "SRAS"];
            }}
            labelFormatter={v => `Y = ₹${v}T`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PHILLIPS CURVE
   Generate theoretical short-run Phillips Curve by sweeping demand shocks
   and plotting resulting (unemployment, inflation) pairs. Then overlay
   the current position and any recorded timeline steps as a traced path.
   ═══════════════════════════════════════════════════════════════════════════ */

function generatePhillipsCurve() {
  // Sweep G from 0 to 100 (pure demand shock), hold others at 50
  const pts = [];
  for (let g = 0; g <= 100; g += 2) {
    const sim = simulate(g, 50, 50, 50);
    pts.push({ unemp: +sim.unemp.toFixed(2), inflation: +sim.inflation.toFixed(2) });
  }
  // Sort by unemployment for clean curve
  pts.sort((a, b) => a.unemp - b.unemp);
  return pts;
}

// Historical India Phillips Curve data (approx CPI inflation + unemployment rate)
const INDIA_PHILLIPS = [
  { year: 2015, unemp: 5.6, inflation: 4.9 },
  { year: 2016, unemp: 5.5, inflation: 4.5 },
  { year: 2017, unemp: 5.4, inflation: 3.6 },
  { year: 2018, unemp: 5.3, inflation: 3.4 },
  { year: 2019, unemp: 5.3, inflation: 4.8 },
  { year: 2020, unemp: 8.0, inflation: 6.2 },  // COVID
  { year: 2021, unemp: 5.8, inflation: 5.5 },
  { year: 2022, unemp: 4.8, inflation: 6.7 },  // Post-COVID inflation
  { year: 2023, unemp: 4.6, inflation: 5.4 },
  { year: 2024, unemp: 4.5, inflation: 4.9 },
];

function PhillipsCurveChart({ currentUnemp, currentInflation, history, showHistory, onToggleHistory }) {
  const theoreticalPC = useMemo(() => generatePhillipsCurve(), []);

  // Timeline traced path: baseline + recorded steps
  const tracedPath = useMemo(() => {
    const pts = [{ unemp: BASE.unemp, inflation: BASE.inflation, step: 0 }];
    history.forEach(h => pts.push({ unemp: h.unemp, inflation: h.inflation, step: h.step }));
    return pts;
  }, [history]);

  // India historical for overlay
  const indiaData = INDIA_PHILLIPS.map(h => ({ unemp: h.unemp, indiaInf: h.inflation }));

  const renderIndiaDot = (props) => {
    const { cx, cy, index } = props;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    const yr = INDIA_PHILLIPS[index];
    if (!yr) return null;
    return (
      <g key={`ipc-${index}`}>
        <circle cx={cx} cy={cy} r={3} fill="#D4760A" stroke={C.card} strokeWidth={1.5} />
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize={7} fontFamily={MONO} fill="#D4760A" fontWeight={600}>
          '{String(yr.year).slice(2)}
        </text>
      </g>
    );
  };

  const renderTracedDot = (props) => {
    const { cx, cy, index } = props;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    const pt = tracedPath[index];
    if (!pt) return null;
    return (
      <g key={`tr-${index}`}>
        <circle cx={cx} cy={cy} r={index === tracedPath.length - 1 ? 5 : 3.5}
          fill={index === 0 ? C.ter : C.purple}
          stroke={C.card} strokeWidth={1.5} />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize={7} fontFamily={MONO}
          fill={index === 0 ? C.ter : C.purple} fontWeight={600}>
          {index === 0 ? "Base" : `S${pt.step}`}
        </text>
      </g>
    );
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "12px 10px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SANS, color: C.txt }}>Phillips Curve</span>
          {history.length === 0 && (
            <span style={{ fontSize: 9, fontFamily: SERIF, color: C.ter, fontStyle: "italic" }}>Record decisions to trace a path</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: SANS, color: C.ter }}>
          <span><span style={{ color: C.sec, fontWeight: 700 }}>━</span> SRPC</span>
          {history.length > 0 && <span><span style={{ color: C.purple, fontWeight: 700 }}>●━</span> Path</span>}
          {showHistory && <span><span style={{ color: "#D4760A", fontWeight: 700 }}>●</span> India</span>}
          <button onClick={onToggleHistory} style={{
            border: `1px solid ${showHistory ? "#D4760A" : C.bdr}`,
            background: showHistory ? "#FDF0E8" : "transparent",
            color: showHistory ? "#D4760A" : C.ter,
            fontSize: 8, fontFamily: SANS, fontWeight: 600,
            padding: "2px 6px", borderRadius: 3, cursor: "pointer",
            transition: "all 0.15s", lineHeight: 1.2,
          }}>
            {showHistory ? "▣" : "▢"} India 2015–24
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart margin={{ top: 4, right: 12, bottom: 14, left: 2 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.bdrL} />
          <XAxis dataKey="unemp" type="number" domain={[0, 16]}
            ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16]}
            tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL}
            label={{ value: "Unemployment %", position: "insideBottom", offset: -8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          <YAxis type="number" domain={[-2, 16]}
            ticks={[0, 2, 4, 6, 8, 10, 12, 14]}
            tick={{ fontSize: 8, fill: C.ter }} stroke={C.bdrL}
            label={{ value: "Inflation %", angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 8, fill: C.ter, fontFamily: SANS } }} />
          {/* Theoretical short-run Phillips Curve */}
          <Line data={theoreticalPC} dataKey="inflation" stroke={C.sec} strokeWidth={1.5} dot={false} opacity={0.35} strokeDasharray="6 3" />
          {/* India historical trajectory */}
          {showHistory && (
            <Line data={indiaData} dataKey="indiaInf" stroke="#D4760A" strokeWidth={1.5} strokeDasharray="4 2"
              dot={renderIndiaDot} isAnimationActive={false} />
          )}
          {/* Traced policy path from recorded decisions */}
          {tracedPath.length > 1 && (
            <Line data={tracedPath} dataKey="inflation" stroke={C.purple} strokeWidth={2}
              dot={renderTracedDot} isAnimationActive={false} />
          )}
          {/* Current position marker */}
          <ReferenceDot x={currentUnemp} y={currentInflation} r={5} fill={C.acc} stroke={C.card} strokeWidth={2} />
          <Tooltip contentStyle={TT}
            formatter={(v, n) => {
              if (n === "indiaInf") return [`${v}%`, "India (actual)"];
              return [`${typeof v === "number" ? v.toFixed(1) : v}%`, "Inflation"];
            }}
            labelFormatter={v => `Unemp = ${v}%`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function policyLabel(G, T, R, Tr) {
  const parts = [];
  if (G !== 50) parts.push(`G ${G > 50 ? "+" : ""}${(G - 50) * 2}%`);
  if (T !== 50) parts.push(`T ${T > 50 ? "+" : ""}${(T - 50) * 2}%`);
  if (R !== 50) parts.push(`R ${R > 50 ? "+" : ""}${(R - 50) * 2}%`);
  if (Tr !== 50) parts.push(`Tr ${Tr > 50 ? "+" : ""}${(Tr - 50) * 2}%`);
  return parts.length ? parts.join(", ") : "Baseline";
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PolicyLab() {
  const [tab, setTab] = useState("sim");
  const [G, sG] = useState(50), [T, sT] = useState(50), [R, sR] = useState(50), [Tr, sTr] = useState(50);
  const [scenario, setSc] = useState(null);

  // History timeline
  const [history, setHistory] = useState([]);
  const stepNum = useRef(0);

  // Historical overlay toggle
  const [showHist, setShowHist] = useState(false);

  // Compare mode
  const [cmpA, setCmpA] = useState({ G: 50, T: 50, R: 50, Tr: 50, label: "Policy A" });
  const [cmpB, setCmpB] = useState({ G: 50, T: 50, R: 50, Tr: 50, label: "Policy B" });

  const e = useMemo(() => simulate(G, T, R, Tr), [G, T, R, Tr]);
  const adas = useMemo(() => adasCurves(e.adShift, e.asShift), [e.adShift, e.asShift]);
  const adasB = useMemo(() => adasCurves(0, 0), []);
  const islm = useMemo(() => islmCurves(e.isShift, e.lmShift), [e.isShift, e.lmShift]);
  const islmB = useMemo(() => islmCurves(0, 0), []);
  const mm = useMemo(() => moneyMarketCurves(e.moneyDemandShift, e.moneySupplyShift), [e.moneyDemandShift, e.moneySupplyShift]);
  const mmB = useMemo(() => moneyMarketCurves(0, 0), []);
  const lab = useMemo(() => labourCurves(e.labourDemandShift, e.labourSupplyShift), [e.labourDemandShift, e.labourSupplyShift]);
  const labB = useMemo(() => labourCurves(0, 0), []);
  const chains = useMemo(() => getChains(G, T, R, Tr, e), [G, T, R, Tr, e]);

  const adasI = useMemo(() => findInt(adas, "ad", "as"), [adas]);
  const islmI = useMemo(() => findInt(islm, "is", "lm"), [islm]);
  const mmI = useMemo(() => findInt(mm, "md", "ms"), [mm]);
  const labI = useMemo(() => findInt(lab, "ld", "ls"), [lab]);

  // Compare mode computations
  const eA = useMemo(() => simulate(cmpA.G, cmpA.T, cmpA.R, cmpA.Tr), [cmpA]);
  const eB = useMemo(() => simulate(cmpB.G, cmpB.T, cmpB.R, cmpB.Tr), [cmpB]);

  const mod = G !== 50 || T !== 50 || R !== 50 || Tr !== 50;
  const reset = () => { sG(50); sT(50); sR(50); sTr(50); setSc(null); };
  const apply = s => { sG(s.g); sT(s.t); sR(s.r); sTr(s.tr); setSc(s.name); setTab("sim"); };

  const recordStep = () => {
    stepNum.current += 1;
    const label = policyLabel(G, T, R, Tr);
    const desc = [];
    if (G !== 50) desc.push(G > 50 ? "↑ Govt spending" : "↓ Govt spending");
    if (T !== 50) desc.push(T > 50 ? "↑ Tax rate" : "↓ Tax rate");
    if (R !== 50) desc.push(R > 50 ? "↑ Repo rate" : "↓ Repo rate");
    if (Tr !== 50) desc.push(Tr > 50 ? "↑ Tariffs" : "↓ Tariffs");
    setHistory(prev => [...prev, {
      step: stepNum.current,
      label,
      desc: desc.join(", ") || "No change",
      G, T, R, Tr,
      gdp: e.gdp, inflation: e.inflation, unemp: e.unemp,
      deficit: e.deficit, trade: e.trade, gini: e.gini,
    }]);
  };

  const loadStep = (h) => { sG(h.G); sT(h.T); sR(h.R); sTr(h.Tr); };

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
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: SANS, color: C.txt }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Source+Serif+4:wght@400;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:${C.txt}; cursor:pointer; border:2px solid ${C.bg}; }
        input[type="range"]::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:${C.txt}; cursor:pointer; border:2px solid ${C.bg}; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        .fu { animation: fadeUp 0.25s ease-out; }
        .sc:hover { border-color: ${C.acc} !important; box-shadow: 0 2px 12px rgba(196,85,10,0.07); }
        .sim-grid { display: grid; grid-template-columns: 220px 1fr 280px; gap: 16px; align-items: start; }
        .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .scenario-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .cmp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .history-chart-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 1100px) {
          .sim-grid { grid-template-columns: 200px 1fr; }
          .sim-grid > div:nth-child(3) { grid-column: 1 / -1; }
          .cmp-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .sim-grid { grid-template-columns: 1fr; }
          .chart-grid { grid-template-columns: 1fr; }
          .scenario-grid { grid-template-columns: 1fr; }
          .history-chart-wrap { grid-template-columns: 1fr; }
        }
        .timeline-step { border-left: 2px solid ${C.bdr}; padding: 0 0 16px 16px; margin-left: 6px; position: relative; cursor: pointer; transition: all 0.15s; }
        .timeline-step:hover { border-left-color: ${C.acc}; }
        .timeline-step::before { content: ''; position: absolute; left: -5px; top: 2px; width: 8px; height: 8px; border-radius: 50%; background: ${C.bdr}; border: 2px solid ${C.bg}; }
        .timeline-step:hover::before { background: ${C.acc}; }
        .timeline-step:last-child { border-left-color: transparent; }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${C.bdr}`, background: C.card }}>
        <div style={{ maxWidth: 1340, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
              <div style={{ width: 26, height: 26, borderRadius: 5, background: C.acc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>P</div>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>PolicyLab</span>
            </div>
            <nav style={{ display: "flex" }}>
              <button style={tabStyle("sim")} onClick={() => setTab("sim")}>Simulator</button>
              <button style={tabStyle("compare")} onClick={() => setTab("compare")}>Compare</button>
              <button style={tabStyle("scenarios")} onClick={() => setTab("scenarios")}>Scenarios</button>
              <button style={tabStyle("about")} onClick={() => setTab("about")}>About</button>
            </nav>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {tab === "sim" && mod && <button onClick={reset} style={btnStyle(false)}>Reset</button>}
          </div>
        </div>
      </header>

      {/* ════════════════════ SIMULATOR TAB ════════════════════ */}
      {tab === "sim" && (
        <div style={{ maxWidth: 1340, margin: "0 auto", padding: "16px 20px" }} className="fu">
          {scenario && mod && (
            <div style={{ background: C.accBg, border: `1px solid ${C.acc}25`, borderRadius: 6, padding: "6px 12px", marginBottom: 12, fontSize: 11, color: C.acc, fontWeight: 500 }}>
              <strong>{scenario}</strong> <span style={{ color: C.sec }}>— adjust sliders to explore</span>
            </div>
          )}

          {/* Indicators */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat label="GDP" val={`₹${e.gdp.toFixed(2)}T`} raw={e.gdp} unit="" base={BASE.gdp} />
            <Stat label="Inflation" val={e.inflation.toFixed(1)} raw={e.inflation} unit="%" base={BASE.inflation} inv />
            <Stat label="Unemployment" val={e.unemp.toFixed(1)} raw={e.unemp} unit="%" base={BASE.unemp} inv />
            <Stat label="Fiscal Deficit" val={e.deficit.toFixed(1)} raw={e.deficit} unit="%GDP" base={BASE.deficit} inv />
            <Stat label="Trade Bal." val={e.trade.toFixed(1)} raw={e.trade} unit="%GDP" base={BASE.trade} />
            <Stat label="Real Wage" val={e.realWage.toFixed(0)} raw={e.realWage} unit="idx" base={BASE.realWage} />
            <Stat label="Gini" val={e.gini.toFixed(3)} raw={e.gini} unit="" base={BASE.gini} inv />
          </div>

          {/* Main 3-col grid */}
          <div className="sim-grid">
            {/* Left: sliders + record */}
            <div>
              <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "14px 14px 8px" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Policy Levers</div>
                <Slider label="Govt Spending" value={G} onChange={sG} color={C.amber} left="Austerity" right="Expansion" />
                <Slider label="Tax Rate" value={T} onChange={sT} color={C.red} left="Cut" right="Hike" />
                <Slider label="Repo Rate" value={R} onChange={sR} color={C.purple} left="Easing" right="Tightening" />
                <Slider label="Import Tariff" value={Tr} onChange={sTr} color={C.green} left="Open" right="Protect" />
                <button onClick={recordStep} style={{ ...btnStyle(true), width: "100%", marginTop: 4, padding: "7px 0" }}>
                  Record Decision →
                </button>
              </div>

              {/* History Timeline */}
              {history.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                    Policy Timeline ({history.length})
                  </div>
                  <div style={{ maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
                    {history.map((h, i) => (
                      <div key={i} className="timeline-step" onClick={() => loadStep(h)}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: SANS, color: C.txt }}>Step {h.step}</span>
                          <span style={{ fontSize: 9, fontFamily: MONO, color: C.ter }}>GDP ₹{h.gdp.toFixed(2)}T</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.sec, fontFamily: SERIF, marginTop: 2 }}>{h.desc}</div>
                        <div style={{ fontSize: 9, fontFamily: MONO, color: C.ter, marginTop: 2 }}>
                          π {h.inflation.toFixed(1)}% · u {h.unemp.toFixed(1)}% · Δ {h.deficit.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setHistory([]); stepNum.current = 0; }} style={{ ...btnStyle(false), width: "100%", marginTop: 6, fontSize: 10, padding: "4px 0" }}>Clear Timeline</button>
                </div>
              )}
            </div>

            {/* Center: 2x2 charts + Phillips Curve below */}
            <div>
              <div className="chart-grid">
                <ADASChart data={adas} baseData={adasB} intersection={adasI} modified={mod} showHistory={showHist} onToggleHistory={() => setShowHist(h => !h)} />
                <MiniChart title="IS — LM" data={islm} baseData={islmB} k1="is" k2="lm" l1="IS" l2="LM" c1={C.blue} c2={C.red} xLabel="Output (₹T)" yLabel="Interest %" yDomain={[0, 18]} intersection={islmI} modified={mod} />
                <MiniChart title="Money Market" data={mm} baseData={mmB} k1="md" k2="ms" l1="Md" l2="Ms" c1={C.blue} c2={C.red} xLabel="Quantity" yLabel="Interest %" yDomain={[0, 18]} intersection={mmI} modified={mod} />
                <MiniChart title="Labour Market" data={lab} baseData={labB} k1="ld" k2="ls" l1="Ld" l2="Ls" c1={C.blue} c2={C.red} xLabel="Employment (M)" yLabel="Real Wage" yDomain={[0, 22]} intersection={labI} modified={mod} />
              </div>
              <div style={{ marginTop: 10 }}>
                <PhillipsCurveChart
                  currentUnemp={e.unemp}
                  currentInflation={e.inflation}
                  history={history}
                  showHistory={showHist}
                  onToggleHistory={() => setShowHist(h => !h)}
                />
              </div>
            </div>

            {/* Right: chains */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Transmission</div>
              <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
                {chains.map((c, i) => (
                  <div key={i} style={{ background: C.card, border: `1px solid ${C.bdr}`, borderLeft: `3px solid ${c.color}`, borderRadius: 7, padding: "10px 12px", marginBottom: 7 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: c.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{c.label}</div>
                    {c.steps.map((s, j) => (
                      <div key={j} style={{ fontSize: 11.5, lineHeight: 1.5, fontFamily: SERIF, color: s.startsWith("⚠") ? C.amber : C.txt, fontWeight: s.startsWith("⚠") ? 600 : 400, paddingLeft: j ? 4 : 0, marginBottom: 1 }}>{s}</div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, padding: "8px 10px", background: C.alt, borderRadius: 6, fontSize: 9.5, fontFamily: SERIF, color: C.sec, lineHeight: 1.5 }}>
                Simplified elasticity model calibrated to Indian economy. Directionally accurate, not predictive.
              </div>
            </div>
          </div>

          {/* History sparklines — show when 2+ steps recorded */}
          {history.length >= 2 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Policy Evolution</div>
              <div className="history-chart-wrap">
                {[
                  { key: "gdp", label: "GDP (₹T)", color: C.blue },
                  { key: "inflation", label: "Inflation %", color: C.red },
                  { key: "unemp", label: "Unemployment %", color: C.amber },
                  { key: "deficit", label: "Fiscal Deficit %", color: C.purple },
                ].map(({ key, label, color }) => (
                  <div key={key} style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "10px 10px 4px" }}>
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
                        <Tooltip contentStyle={TT} formatter={v => [typeof v === "number" ? v.toFixed(2) : v, label]} labelFormatter={v => `Step ${v}`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ COMPARE TAB ════════════════════ */}
      {tab === "compare" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }} className="fu">
          <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: SERIF, marginBottom: 4 }}>Compare Policies</h2>
          <p style={{ fontSize: 12, color: C.sec, fontFamily: SERIF, marginBottom: 20, lineHeight: 1.5 }}>
            Configure two different policy mixes side by side and compare their macroeconomic outcomes.
          </p>

          <div className="cmp-grid">
            {/* Policy A */}
            {[
              { cfg: cmpA, set: setCmpA, label: "Policy A", color: C.cmpA, econ: eA },
              { cfg: cmpB, set: setCmpB, label: "Policy B", color: C.cmpB, econ: eB },
            ].map(({ cfg, set, label, color, econ }) => (
              <div key={label}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  <input
                    value={cfg.label}
                    onChange={ev => set(p => ({ ...p, label: ev.target.value }))}
                    style={{ border: "none", background: "transparent", fontSize: 15, fontWeight: 700, fontFamily: SANS, color: C.txt, outline: "none", width: 200 }}
                  />
                  {/* Quick scenario loaders */}
                  <select
                    onChange={ev => {
                      const s = SCENARIOS.find(s => s.name === ev.target.value);
                      if (s) set(p => ({ ...p, G: s.g, T: s.t, R: s.r, Tr: s.tr, label: s.name }));
                    }}
                    value=""
                    style={{ fontSize: 10, fontFamily: SANS, color: C.sec, border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "2px 6px", background: C.card, cursor: "pointer" }}
                  >
                    <option value="">Load scenario...</option>
                    {SCENARIOS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "14px 14px 8px", marginBottom: 12 }}>
                  <Slider label="Govt Spending" value={cfg.G} onChange={v => set(p => ({ ...p, G: v }))} color={C.amber} left="Austerity" right="Expansion" compact />
                  <Slider label="Tax Rate" value={cfg.T} onChange={v => set(p => ({ ...p, T: v }))} color={C.red} left="Cut" right="Hike" compact />
                  <Slider label="Repo Rate" value={cfg.R} onChange={v => set(p => ({ ...p, R: v }))} color={C.purple} left="Easing" right="Tightening" compact />
                  <Slider label="Import Tariff" value={cfg.Tr} onChange={v => set(p => ({ ...p, Tr: v }))} color={C.green} left="Open" right="Protect" compact />
                </div>

                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Stat small label="GDP" val={`₹${econ.gdp.toFixed(2)}T`} raw={econ.gdp} unit="" base={BASE.gdp} />
                  <Stat small label="Inflation" val={econ.inflation.toFixed(1)} raw={econ.inflation} unit="%" base={BASE.inflation} inv />
                  <Stat small label="Unemp" val={econ.unemp.toFixed(1)} raw={econ.unemp} unit="%" base={BASE.unemp} inv />
                  <Stat small label="Deficit" val={econ.deficit.toFixed(1)} raw={econ.deficit} unit="%" base={BASE.deficit} inv />
                </div>
              </div>
            ))}
          </div>

          {/* Side-by-side bar chart comparison */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Outcome Comparison</div>
            <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "16px 12px 8px" }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={[
                    { name: "GDP (₹T)", a: +eA.gdp.toFixed(2), b: +eB.gdp.toFixed(2), base: BASE.gdp },
                    { name: "Inflation %", a: +eA.inflation.toFixed(1), b: +eB.inflation.toFixed(1), base: BASE.inflation },
                    { name: "Unemp %", a: +eA.unemp.toFixed(1), b: +eB.unemp.toFixed(1), base: BASE.unemp },
                    { name: "Deficit %", a: +eA.deficit.toFixed(1), b: +eB.deficit.toFixed(1), base: BASE.deficit },
                    { name: "Trade %", a: +eA.trade.toFixed(1), b: +eB.trade.toFixed(1), base: BASE.trade },
                    { name: "Gini", a: +eA.gini.toFixed(3), b: +eB.gini.toFixed(3), base: BASE.gini },
                  ]}
                  margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke={C.bdrL} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.sec, fontFamily: SANS }} stroke={C.bdrL} />
                  <YAxis tick={{ fontSize: 9, fill: C.ter }} stroke={C.bdrL} />
                  <Tooltip contentStyle={TT} />
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

          {/* Delta table */}
          <div style={{ marginTop: 16, background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.ter, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Differences</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {[
                { l: "GDP", a: eA.gdp, b: eB.gdp, fmt: v => `₹${v.toFixed(2)}T` },
                { l: "Inflation", a: eA.inflation, b: eB.inflation, fmt: v => `${v.toFixed(1)}%`, inv: true },
                { l: "Unemployment", a: eA.unemp, b: eB.unemp, fmt: v => `${v.toFixed(1)}%`, inv: true },
                { l: "Deficit", a: eA.deficit, b: eB.deficit, fmt: v => `${v.toFixed(1)}%`, inv: true },
                { l: "Trade", a: eA.trade, b: eB.trade, fmt: v => `${v.toFixed(1)}%` },
                { l: "Gini", a: eA.gini, b: eB.gini, fmt: v => v.toFixed(3), inv: true },
              ].map(({ l, a, b, fmt, inv }) => {
                const d = a - b;
                const better = inv ? d < -0.01 : d > 0.01;
                const worse = inv ? d > 0.01 : d < -0.01;
                return (
                  <div key={l} style={{ textAlign: "center", padding: "6px 4px" }}>
                    <div style={{ fontSize: 9, color: C.ter, fontFamily: SANS, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: Math.abs(d) < 0.01 ? C.ter : better ? C.cmpA : C.cmpB }}>
                      {Math.abs(d) < 0.01 ? "=" : better ? `A ${inv ? "↓" : "↑"}` : `B ${inv ? "↓" : "↑"}`}
                    </div>
                    <div style={{ fontSize: 9, fontFamily: MONO, color: C.ter }}>Δ {Math.abs(d).toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ SCENARIOS TAB ════════════════════ */}
      {tab === "scenarios" && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }} className="fu">
          <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: SERIF, marginBottom: 4 }}>Policy Scenarios</h2>
          <p style={{ fontSize: 13, color: C.sec, fontFamily: SERIF, marginBottom: 24, lineHeight: 1.6 }}>
            Pre-configured combinations from real macroeconomic episodes. Click to load into the simulator.
          </p>
          <div className="scenario-grid">
            {SCENARIOS.map(s => (
              <div key={s.name} className="sc" onClick={() => apply(s)} style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "16px 18px", cursor: "pointer", transition: "all 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS }}>{s.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: C.acc, background: C.accBg, padding: "2px 7px", borderRadius: 3 }}>{s.tag}</span>
                </div>
                <p style={{ fontSize: 12, color: C.sec, fontFamily: SERIF, lineHeight: 1.5, marginBottom: 6 }}>{s.desc}</p>
                <p style={{ fontSize: 11, color: C.ter, fontFamily: SERIF, fontStyle: "italic", marginBottom: 8 }}>{s.ctx}</p>
                <div style={{ fontSize: 10.5, fontFamily: MONO, color: C.txt, background: C.alt, padding: "7px 9px", borderRadius: 5, lineHeight: 1.5 }}>{s.exp}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 10, fontSize: 9, fontFamily: MONO, color: C.ter }}>
                  <span>G {s.g > 50 ? "↑" : s.g < 50 ? "↓" : "—"}</span>
                  <span>T {s.t > 50 ? "↑" : s.t < 50 ? "↓" : "—"}</span>
                  <span>R {s.r > 50 ? "↑" : s.r < 50 ? "↓" : "—"}</span>
                  <span>Tr {s.tr > 50 ? "↑" : s.tr < 50 ? "↓" : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════ ABOUT TAB ════════════════════ */}
      {tab === "about" && (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 20px" }} className="fu">
          <h2 style={{ fontSize: 26, fontWeight: 700, fontFamily: SERIF, marginBottom: 6 }}>About PolicyLab</h2>
          <p style={{ fontSize: 14, fontFamily: SERIF, color: C.sec, lineHeight: 1.7, marginBottom: 20 }}>
            An interactive macroeconomic policy simulator built on the AD-AS and IS-LM frameworks. Manipulate four policy levers and observe real-time propagation through goods, money, and labour markets.
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS, marginBottom: 6 }}>Transmission Channels</h3>
          <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "14px 16px", marginBottom: 20, fontFamily: MONO, fontSize: 11, lineHeight: 2.0, color: C.txt }}>
            <div><span style={{ color: C.amber, fontWeight: 700 }}>G ↑</span> → IS right → AD right → ↑Y ↑P ↑i → Labour demand ↑</div>
            <div><span style={{ color: C.red, fontWeight: 700 }}>T ↑</span> → IS left → AD left + AS left → ↓Y ↑P (stagflation risk)</div>
            <div><span style={{ color: C.purple, fontWeight: 700 }}>R ↑</span> → LM up → Ms contracts → ↓I → AD left → ↓Y ↓P</div>
            <div><span style={{ color: C.green, fontWeight: 700 }}>Tr ↑</span> → AS left (cost-push) + AD slight right → ↑P, mixed Y</div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS, marginBottom: 6 }}>Features</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { t: "Five Markets", d: "AD-AS, IS-LM, Money Market, Labour Market, and Phillips Curve respond simultaneously." },
              { t: "Phillips Curve", d: "Traces your policy decisions as a path through (unemployment, inflation) space — live loop dynamics." },
              { t: "Causal Chains", d: "Dynamic transmission mechanism text explains why each variable moves." },
              { t: "Policy Timeline", d: "Record decisions sequentially and track how the economy evolves over time." },
              { t: "Compare Mode", d: "Run two policy configurations side by side with bar chart and delta table." },
              { t: "India 2015–24", d: "Toggle real data onto AD-AS and Phillips Curve diagrams. Anchors theory in observed reality." },
            ].map(x => (
              <div key={x.t} style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: SANS, marginBottom: 2 }}>{x.t}</div>
                <div style={{ fontSize: 11, fontFamily: SERIF, color: C.sec, lineHeight: 1.5 }}>{x.d}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: SANS, marginBottom: 6 }}>Limitations</h3>
          <p style={{ fontSize: 13, fontFamily: SERIF, color: C.sec, lineHeight: 1.7, marginBottom: 16 }}>
            Pedagogical tool, not a forecasting model. Static expectations, no time dimension, linearized transmission, no financial sector, simplified labour market. Directionally accurate — shows which way and why — not quantitatively predictive.
          </p>

          <div style={{ padding: "12px 16px", background: C.alt, borderRadius: 8, fontSize: 12, fontFamily: SANS, color: C.sec }}>
            <strong style={{ color: C.txt }}>Built for</strong> IIM Indore · IPM23 · Group 10
          </div>
        </div>
      )}
    </div>
  );
}
