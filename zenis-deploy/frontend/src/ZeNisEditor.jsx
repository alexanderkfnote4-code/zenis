import { useState, useEffect, useRef, useCallback } from "react";

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  sand:    "#C8A97E",
  sandDim: "#8C6F4E",
  sandPale:"#E8D5B8",
  bg:      "#0D0D0D",
  surf:    "#141414",
  surf2:   "#1C1C1C",
  surf3:   "#242424",
  border:  "#2E2E2E",
  text:    "#EDE8E1",
  dim:     "#5A5550",
  green:   "#4ADE80",
  red:     "#F87171",
  blue:    "#60A5FA",
};

// ── Tiny Icon ─────────────────────────────────────────────────────────────────
const Ic = ({ d, size = 20, color = "currentColor", fill = "none", sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={fill} stroke={color} strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {Array.isArray(d)
      ? d.map((p, i) => <path key={i} d={p} />)
      : <path d={d} />}
  </svg>
);

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  { id: "select",   label: "Selector",  icon: "M5 3l14 9-14 9V3z", key: "v" },
  { id: "pen",      label: "Creion",    icon: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z", key: "p" },
  { id: "line",     label: "Linie",     icon: "M5 19L19 5", key: "l" },
  { id: "circle",   label: "Cerc",      icon: "M12 2a10 10 0 100 20A10 10 0 0012 2z", key: "c" },
  { id: "rect",     label: "Dreptunghi",icon: "M3 3h18v18H3z", key: "r" },
  { id: "triangle", label: "Triunghi",  icon: "M12 2L2 22h20L12 2z", key: "t" },
  { id: "text",     label: "Text",      icon: "M4 7V4h16v3M9 20h6M12 4v16", key: "x" },
  { id: "eraser",   label: "Radieră",   icon: "M20 20H7L3 16l10-10 7 7-3.5 3.5M6.5 17.5l5-5", key: "e" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function ptOnCanvas(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - r.left) * (canvas.width  / r.width),
    y: (src.clientY - r.top)  * (canvas.height / r.height),
  };
}

function dist(a, b) { return dist2(a, b); }

// ── Geometry helpers ──────────────────────────────────────────────────────────

// Distanță euclidiană între 2 puncte {x,y}
function dist2(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Samplez o linie în N puncte {x,y}
function sampleLine(x0, y0, x1, y1, steps = 60) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
  return pts;
}

// Samplez un arc eliptic în N puncte {x,y}
function sampleArc(ocx, ocy, rx, ry, a0, a1, steps = 120) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (i / steps) * (a1 - a0);
    pts.push({ x: ocx + rx * Math.cos(a), y: ocy + ry * Math.sin(a) });
  }
  return pts;
}

// ── TEXT: Stroke-font real — litere ca trasee continue ───────────────────────
// Fiecare literă e definită ca o serie de "segmente" — bila desenează fiecare
// segment, iar între segmente merge pe linia de bază (tranziție).
// Coordonate normalizate: x ∈ [0,1], y ∈ [0,1]  (y=0 = baza, y=1 = vârf)

const STROKE_LETTERS = {
  A: [ [[0,0],[0.5,1]], [[0.5,1],[1,0]], [[0.15,0.45],[0.85,0.45]] ],
  B: [ [[0,0],[0,1],[0.65,1],[0.85,0.82],[0.85,0.62],[0.65,0.5],[0,0.5],[0.65,0.5],[0.85,0.35],[0.85,0.15],[0.65,0],[0,0]] ],
  C: [ [[0.9,0.82],[0.5,1],[0.1,0.75],[0,0.5],[0.1,0.25],[0.5,0],[0.9,0.18]] ],
  D: [ [[0,0],[0,1],[0.5,1],[0.85,0.75],[0.85,0.25],[0.5,0],[0,0]] ],
  E: [ [[0.8,1],[0,1],[0,0],[0.8,0]], [[0,0.5],[0.65,0.5]] ],
  F: [ [[0,0],[0,1],[0.8,1]], [[0,0.5],[0.65,0.5]] ],
  G: [ [[0.9,0.82],[0.5,1],[0.1,0.75],[0,0.5],[0.1,0.25],[0.5,0],[0.9,0.18],[0.9,0.5],[0.55,0.5]] ],
  H: [ [[0,0],[0,1]], [[1,0],[1,1]], [[0,0.5],[1,0.5]] ],
  I: [ [[0.2,0],[0.8,0]], [[0.5,0],[0.5,1]], [[0.2,1],[0.8,1]] ],
  J: [ [[0.2,1],[0.8,1]], [[0.65,1],[0.65,0.18],[0.5,0],[0.2,0],[0,0.18],[0,0.35]] ],
  K: [ [[0,0],[0,1]], [[0,0.5],[0.85,1]], [[0,0.5],[0.85,0]] ],
  L: [ [[0,1],[0,0],[0.8,0]] ],
  M: [ [[0,0],[0,1],[0.5,0.45],[1,1],[1,0]] ],
  N: [ [[0,0],[0,1],[1,0],[1,1]] ],
  O: [ [[0.5,0],[0.1,0.1],[0,0.35],[0,0.65],[0.1,0.9],[0.5,1],[0.9,0.9],[1,0.65],[1,0.35],[0.9,0.1],[0.5,0]] ],
  P: [ [[0,0],[0,1],[0.65,1],[0.9,0.82],[0.9,0.62],[0.65,0.5],[0,0.5]] ],
  Q: [ [[0.5,0],[0.1,0.1],[0,0.35],[0,0.65],[0.1,0.9],[0.5,1],[0.9,0.9],[1,0.65],[1,0.35],[0.9,0.1],[0.5,0]], [[0.6,0.2],[1,0]] ],
  R: [ [[0,0],[0,1],[0.65,1],[0.9,0.82],[0.9,0.62],[0.65,0.5],[0,0.5],[0.5,0.5],[1,0]] ],
  S: [ [[0.9,0.82],[0.5,1],[0.1,0.82],[0.1,0.6],[0.5,0.5],[0.9,0.38],[0.9,0.18],[0.5,0],[0.1,0.18]] ],
  T: [ [[0,1],[1,1]], [[0.5,1],[0.5,0]] ],
  U: [ [[0,1],[0,0.2],[0.15,0.05],[0.5,0],[0.85,0.05],[1,0.2],[1,1]] ],
  V: [ [[0,1],[0.5,0],[1,1]] ],
  W: [ [[0,1],[0.25,0],[0.5,0.45],[0.75,0],[1,1]] ],
  X: [ [[0,1],[1,0]], [[1,1],[0,0]] ],
  Y: [ [[0,1],[0.5,0.5],[1,1]], [[0.5,0.5],[0.5,0]] ],
  Z: [ [[0,1],[1,1],[0,0],[1,0]] ],
  "0": [ [[0.5,0],[0.1,0.1],[0,0.35],[0,0.65],[0.1,0.9],[0.5,1],[0.9,0.9],[1,0.65],[1,0.35],[0.9,0.1],[0.5,0]] ],
  "1": [ [[0.2,0.75],[0.5,1],[0.5,0]] ],
  "2": [ [[0.1,0.75],[0.4,1],[0.8,0.85],[0.9,0.62],[0.5,0.38],[0,0],[1,0]] ],
  "3": [ [[0.1,0.88],[0.5,1],[0.9,0.75],[0.55,0.5],[0.9,0.25],[0.5,0],[0.1,0.12]] ],
  "4": [ [[0.75,0],[0.75,1],[0,0.38],[1,0.38]] ],
  "5": [ [[0.9,1],[0,1],[0,0.5],[0.7,0.5],[0.9,0.35],[0.9,0.15],[0.7,0],[0.1,0]] ],
  "6": [ [[0.8,0.9],[0.4,1],[0.1,0.7],[0,0.4],[0.1,0.1],[0.5,0],[0.9,0.1],[0.9,0.4],[0.5,0.5],[0.1,0.5]] ],
  "7": [ [[0,1],[1,1],[0.35,0]] ],
  "8": [ [[0.5,0.5],[0.1,0.65],[0,0.82],[0.1,0.95],[0.5,1],[0.9,0.95],[1,0.82],[0.9,0.65],[0.5,0.5],[0.1,0.35],[0,0.18],[0.1,0.05],[0.5,0],[0.9,0.05],[1,0.18],[0.9,0.35],[0.5,0.5]] ],
  "9": [ [[0.2,0.1],[0.6,0],[0.9,0.1],[1,0.5],[0.9,0.9],[0.5,1],[0.1,0.9],[0.1,0.5],[0.5,0.5],[0.9,0.5]] ],
  "!": [ [[0.5,1],[0.5,0.25]], [[0.5,0.08],[0.5,0]] ],
  "?": [ [[0.15,0.82],[0.4,1],[0.75,0.88],[0.85,0.65],[0.5,0.42],[0.5,0.18]], [[0.5,0.06],[0.5,0]] ],
  ".": [ [[0.4,0],[0.6,0],[0.6,0.08],[0.4,0.08],[0.4,0]] ],
  ",": [ [[0.5,0.08],[0.5,0.16],[0.35,0]] ],
  "-": [ [[0.1,0.5],[0.9,0.5]] ],
  " ": [],
};

// Convertește un segment de literă (coordonate norm.) în puncte canvas
function segmentToPoints(seg, ox, oy, w, h, steps = 20) {
  const pts = [];
  for (let i = 0; i < seg.length - 1; i++) {
    const [x0n, y0n] = seg[i];
    const [x1n, y1n] = seg[i + 1];
    const x0 = ox + x0n * w, y0 = oy - y0n * h;
    const x1 = ox + x1n * w, y1 = oy - y1n * h;
    const n  = Math.max(steps, Math.ceil(Math.hypot(x1-x0, y1-y0) / 3));
    for (let j = (pts.length ? 1 : 0); j <= n; j++) {
      pts.push({ x: x0 + (x1-x0)*(j/n), y: y0 + (y1-y0)*(j/n) });
    }
  }
  return pts;
}

// Generează traseul complet pentru un text:
// - pornește direct la primul punct al primei litere
// - în cadrul literei: între segmente → baseline scurtă
// - între litere → baseline
function textToPoints(text, x, y, fontSize = 40) {
  const allPts   = [];
  const letterW  = fontSize * 0.55;
  const letterH  = fontSize;
  const spacing  = fontSize * 0.72;
  const baseY    = y;

  let curX   = x;
  let lastPt = null;   // ultimul punct desenat

  // Adaugă tranziție pe baseline de la lastPt la (toX, toY)
  const goBaseline = (toX, toY) => {
    if (!lastPt) return;
    // Coboară vertical la baseline
    if (Math.abs(lastPt.y - baseY) > 2) {
      const s1 = Math.max(3, Math.ceil(Math.abs(lastPt.y - baseY) / 4));
      for (let i = 1; i <= s1; i++)
        allPts.push({ x: lastPt.x, y: lastPt.y + (baseY - lastPt.y) * (i / s1) });
    }
    // Glisează pe baseline spre toX
    const fromX = allPts.length ? allPts[allPts.length-1].x : lastPt.x;
    if (Math.abs(fromX - toX) > 2) {
      const s2 = Math.max(3, Math.ceil(Math.abs(toX - fromX) / 4));
      for (let i = 1; i <= s2; i++)
        allPts.push({ x: fromX + (toX - fromX) * (i / s2), y: baseY });
    }
    // Urcă la toY
    if (Math.abs(toY - baseY) > 2) {
      const s3 = Math.max(3, Math.ceil(Math.abs(toY - baseY) / 4));
      for (let i = 1; i <= s3; i++)
        allPts.push({ x: toX, y: baseY + (toY - baseY) * (i / s3) });
    }
    lastPt = { x: toX, y: toY };
  };

  for (const ch of text.toUpperCase()) {
    const segs = STROKE_LETTERS[ch];
    if (!segs || segs.length === 0) { curX += spacing * 0.45; continue; }

    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      if (seg.length < 2) continue;

      const [x0n, y0n] = seg[0];
      const startX = curX + x0n * letterW;
      const startY = baseY - y0n * letterH;

      // Tranziție la start-ul acestui segment
      if (!lastPt) {
        // Prima oară — mergi direct (bila vine din centru prin routing principal)
        allPts.push({ x: startX, y: startY });
        lastPt = { x: startX, y: startY };
      } else {
        goBaseline(startX, startY);
      }

      // Desenează segmentul
      const segPts = segmentToPoints(seg, curX, baseY, letterW, letterH);
      if (segPts.length > 1) {
        allPts.push(...segPts.slice(1)); // skip primul (suntem deja acolo)
        lastPt = segPts[segPts.length - 1];
      }
    }

    curX += spacing;
  }

  return allPts;
}

// ── Stroke-font corect pentru T și E ─────────────────────────────────────────
// T: bara orizontală sus → coboară la mijloc → bara verticală jos
// E: bara verticală → bara sus → revin la mijloc → bara mijloc → revin → bara jos
// Redefinim doar literele problematice (restul rămân)
Object.assign(STROKE_LETTERS, {
  // T: bara orizontală din stânga spre dreapta, apoi coboară vertical din mijloc
  T: [ [[0,1],[1,1]], [[0.5,1],[0.5,0]] ],
  // E: o singură trecere continuă, fără sărituri
  // Stânga sus → stânga jos (bara verticală) → dreapta jos (bara jos)
  // → înapoi la mijloc stânga → dreapta mijloc → înapoi sus → dreapta sus
  E: [
    [[0,1],[0,0],[0.8,0]],           // bara verticală + bara de jos
    [[0,0.5],[0.65,0.5]],            // bara de mijloc
    [[0,1],[0.8,1]],                 // bara de sus
  ],
  // I: bara sus → punct mijloc → bara jos (mai clar)
  I: [ [[0.2,1],[0.8,1]], [[0.5,1],[0.5,0]], [[0.2,0],[0.8,0]] ],
  // H: stânga sus→jos, dreapta sus→jos, bara mijloc
  H: [ [[0,1],[0,0]], [[1,1],[1,0]], [[0,0.5],[1,0.5]] ],
});

// ── Extrage toate punctele unui shape ca [{x,y}] ──────────────────────────────
function shapeToPoints(s) {
  switch (s.type) {
    case "pen":
      return s.points.filter((_, i) => i % 3 === 0);
    case "line":
      return sampleLine(s.x0, s.y0, s.x1, s.y1, 60);
    case "circle": {
      const rx = Math.abs(s.x1 - s.x0) / 2;
      const ry = Math.abs(s.y1 - s.y0) / 2;
      const ocx = (s.x0 + s.x1) / 2, ocy = (s.y0 + s.y1) / 2;
      return sampleArc(ocx, ocy, rx, ry, 0, 2 * Math.PI, 120);
    }
    case "rect": {
      const x0 = Math.min(s.x0,s.x1), y0 = Math.min(s.y0,s.y1);
      const x1 = Math.max(s.x0,s.x1), y1 = Math.max(s.y0,s.y1);
      return [
        ...sampleLine(x0, y0, x1, y0, 50),
        ...sampleLine(x1, y0, x1, y1, 50),
        ...sampleLine(x1, y1, x0, y1, 50),
        ...sampleLine(x0, y1, x0, y0, 50),
      ];
    }
    case "triangle": {
      const tx = (s.x0 + s.x1) / 2;
      return [
        ...sampleLine(tx,   s.y0, s.x1, s.y1, 50),
        ...sampleLine(s.x1, s.y1, s.x0, s.y1, 50),
        ...sampleLine(s.x0, s.y1, tx,   s.y0, 50),
      ];
    }
    case "text":
      return textToPoints(s.text || "?", s.x, s.y, s.fontSize || 40);
    default: return [];
  }
}

// ── Găsește indexul celui mai apropiat punct ──────────────────────────────────
function nearestIdx(pts, pos) {
  let best = 0, bestD = Infinity;
  pts.forEach((p, i) => {
    const d = dist2(p, pos);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// ── TRANZIȚIE PE MUCHIE: bila merge pe conturul/traseul formei curente
//    până ajunge la punctul cel mai aproape de forma următoare ─────────────────
function edgeTransition(shapePts, curPos, nextPts, isOpen = false) {
  if (!nextPts || nextPts.length === 0) return [];

  // Găsim pe forma curentă punctul cel mai aproape de nextPts
  let bestEdgeIdx = 0, bestDist = Infinity;
  for (let i = 0; i < shapePts.length; i++) {
    const nearest = nearestIdx(nextPts, shapePts[i]);
    const d = dist2(shapePts[i], nextPts[nearest]);
    if (d < bestDist) { bestDist = d; bestEdgeIdx = i; }
  }

  const curIdx = nearestIdx(shapePts, curPos);
  const total  = shapePts.length;

  const edgePts = [];

  if (isOpen) {
    // Traseu deschis (pen): mergem DOAR înainte pe traseu
    // Dacă bestEdgeIdx e în spatele curIdx → cel mai aproape punct accesibil
    // înainte e chiar capătul traseului
    const targetIdx = bestEdgeIdx > curIdx ? bestEdgeIdx : total - 1;
    for (let i = curIdx + 1; i <= targetIdx; i++) {
      edgePts.push(shapePts[i]);
    }
  } else {
    // Formă închisă: alegem direcția cea mai scurtă (înainte sau înapoi)
    const fwdSteps = (bestEdgeIdx - curIdx + total) % total;
    const bwdSteps = (curIdx - bestEdgeIdx + total) % total;

    if (fwdSteps <= bwdSteps) {
      for (let i = 1; i <= fwdSteps; i++)
        edgePts.push(shapePts[(curIdx + i) % total]);
    } else {
      for (let i = 1; i <= bwdSteps; i++)
        edgePts.push(shapePts[(curIdx - i + total) % total]);
    }
  }

  return edgePts;
}

// ── ALGORITMUL PRINCIPAL: shapes → θ-ρ cu routing corect ─────────────────────
function shapesToThetaRho(shapes, canvasSize) {
  const CX = canvasSize / 2;
  const CY = canvasSize / 2;
  const R  = canvasSize / 2 - 10;

  const toTR = ({ x, y }) => {
    const dx = x - CX, dy = y - CY;
    let theta = Math.atan2(dy, dx);
    if (theta < 0) theta += 2 * Math.PI;
    return [theta, Math.min(Math.sqrt(dx*dx + dy*dy) / R, 1.0)];
  };

  const allPts = [];
  let curPos = { x: CX, y: CY }; // bila pornește din centru

  for (let si = 0; si < shapes.length; si++) {
    const shape    = shapes[si];
    const shapePts = shapeToPoints(shape);
    if (shapePts.length === 0) continue;

    const isText        = shape.type === "text";
    const isClosed      = ["circle","rect","triangle"].includes(shape.type);
    const prevShape     = shapes[si - 1];
    const prevPts       = si > 0 ? shapeToPoints(prevShape) : null;
    // pen + forme închise ambele pot folosi edge transition
    const prevHasEdge   = prevShape && ["circle","rect","triangle","pen"].includes(prevShape.type);

    // ── TEXT: executat strict în ordinea punctelor, fără reordonare ───────────
    if (isText) {
      // Tranziție directă de la curPos la primul punct al textului
      const firstPt = shapePts[0];
      const steps = Math.max(10, Math.ceil(dist2(curPos, firstPt) / 3));
      for (let i = 1; i <= steps; i++) {
        allPts.push({
          x: curPos.x + (firstPt.x - curPos.x) * (i / steps),
          y: curPos.y + (firstPt.y - curPos.y) * (i / steps),
        });
      }
      // Adăugăm toate punctele textului EXACT în ordine — nicio reordonare
      allPts.push(...shapePts);
      curPos = shapePts[shapePts.length - 1];
      continue;
    }

    // ── FORME GEOMETRICE ──────────────────────────────────────────────────────
    let entryPt;

    if (si === 0 || !prevHasEdge) {
      // Prima formă sau vine după pen/text → tranziție directă la nearest
      const entryIdx = nearestIdx(shapePts, curPos);
      entryPt = shapePts[entryIdx];
      const steps = Math.max(12, Math.ceil(dist2(curPos, entryPt) / 3));
      for (let i = 1; i <= steps; i++) {
        allPts.push({
          x: curPos.x + (entryPt.x - curPos.x) * (i / steps),
          y: curPos.y + (entryPt.y - curPos.y) * (i / steps),
        });
      }
    } else {
      // Vine după o formă cu edge → merge pe muchie/traseu până la nearest exit point
      const prevIsOpen = prevShape.type === "pen";
      const edgePts = edgeTransition(prevPts, curPos, shapePts, prevIsOpen);
      allPts.push(...edgePts);
      const exitPt = edgePts.length > 0 ? edgePts[edgePts.length - 1] : curPos;
      const reEntryIdx = nearestIdx(shapePts, exitPt);
      entryPt = shapePts[reEntryIdx];
      const bridgeSteps = Math.max(4, Math.ceil(dist2(exitPt, entryPt) / 4));
      for (let i = 1; i <= bridgeSteps; i++) {
        allPts.push({
          x: exitPt.x + (entryPt.x - exitPt.x) * (i / bridgeSteps),
          y: exitPt.y + (entryPt.y - exitPt.y) * (i / bridgeSteps),
        });
      }
    }

    // Reordonăm forma să înceapă din entry și parcurgem complet
    const reIdx   = nearestIdx(shapePts, allPts[allPts.length - 1] || entryPt);
    const ordered = [...shapePts.slice(reIdx), ...shapePts.slice(0, reIdx)];
    allPts.push(...ordered);
    curPos = ordered[ordered.length - 1];
  }

  return allPts.map(toTR);
}

// ── Toolbar Button ────────────────────────────────────────────────────────────
function ToolBtn({ tool, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={`${tool.label} [${tool.key.toUpperCase()}]`}
      style={{
        width: 44, height: 44, borderRadius: 10, border: "none",
        background: active ? `${C.sand}22` : "transparent",
        outline: active ? `1.5px solid ${C.sand}55` : "1px solid transparent",
        color: active ? C.sand : C.dim,
        cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", transition: "all 0.12s",
      }}
    >
      <Ic d={tool.icon} size={18} color={active ? C.sand : C.dim} />
    </button>
  );
}

// ── Color Swatch ──────────────────────────────────────────────────────────────
function Swatch({ color, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 22, height: 22, borderRadius: "50%", background: color,
      border: active ? `2px solid #fff` : "2px solid transparent",
      boxShadow: active ? `0 0 0 1px ${color}` : "none",
      cursor: "pointer", flexShrink: 0, transition: "all 0.12s",
    }} />
  );
}

// ── Main canvas drawing surface ───────────────────────────────────────────────
const CSIZE = 600; // canvas logical pixels

function DrawCanvas({ tool, strokeColor, strokeWidth, shapes, setShapes, selectedId, setSelectedId }) {
  const canvasRef  = useRef(null);
  const drawing    = useRef(false);
  const currentRef = useRef(null); // shape being drawn now
  const textRef    = useRef(null);

  const dragStart = useRef(null);

  // Redraw all shapes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CSIZE, CSIZE);

    // Background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, CSIZE, CSIZE);

    // Polar grid
    const cx = CSIZE / 2, cy = CSIZE / 2, R = CSIZE / 2 - 10;
    ctx.save();

    // outer circle boundary
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = `${C.sand}35`; ctx.lineWidth = 1.5; ctx.stroke();

    // ── Punct de start (centru) — bila pornește de aici ──
    // Cerc exterior pulsant
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = `${C.sand}60`; ctx.lineWidth = 1; ctx.stroke();
    // Punct central plin
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = C.sand; ctx.fill();
    // Cruce de minim pentru referință
    ctx.strokeStyle = `${C.sand}40`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
    // Label "START"
    ctx.save();
    ctx.font = "9px monospace";
    ctx.fillStyle = `${C.sand}70`;
    ctx.fillText("START", cx + 14, cy - 8);
    ctx.restore();

    // rings
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, R * i / 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1; ctx.stroke();
    }
    // radials
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();

    // Draw each shape
    [...shapes, currentRef.current].filter(Boolean).forEach(s => {
      drawShape(ctx, s, s.id === selectedId);
    });

    // ── Punct START — desenat DEASUPRA shapes ca să fie mereu vizibil ──
    ctx.save();
    // Halou
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.strokeStyle = `${C.sand}30`; ctx.lineWidth = 1; ctx.stroke();
    // Inel
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = `${C.sand}80`; ctx.lineWidth = 1.5; ctx.stroke();
    // Punct plin
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = C.sandPale; ctx.fill();
    // Cruce
    ctx.strokeStyle = `${C.sand}50`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16); ctx.stroke();
    // Label
    ctx.font = "bold 9px monospace";
    ctx.fillStyle = `${C.sand}90`;
    ctx.fillText("START", cx + 14, cy - 10);
    ctx.restore();
  }, [shapes, selectedId]);

  function drawShape(ctx, s, selected) {
    ctx.save();
    ctx.strokeStyle = s.color || C.sand;
    ctx.lineWidth   = s.sw    || 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    if (selected) {
      ctx.shadowColor = C.sand;
      ctx.shadowBlur  = 8;
    }

    switch (s.type) {
      case "pen":
        if (s.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        s.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        break;
      case "line":
        ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
        break;
      case "circle": {
        const rx = Math.abs(s.x1 - s.x0) / 2, ry = Math.abs(s.y1 - s.y0) / 2;
        ctx.beginPath();
        ctx.ellipse((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "rect":
        ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        break;
      case "triangle": {
        const tx = (s.x0 + s.x1) / 2;
        ctx.beginPath(); ctx.moveTo(tx, s.y0);
        ctx.lineTo(s.x1, s.y1); ctx.lineTo(s.x0, s.y1); ctx.closePath();
        ctx.stroke();
        break;
      }
      case "text": {
        const fontSize = s.fontSize || 40;
        const letterW = fontSize * 0.55;
        const letterH = fontSize;
        const spacing = fontSize * 0.72;
        const baseY   = s.y;
        let curX = s.x;

        // 1. Desenăm traseul bilei (subțire, semitransparent) — ce va face masa
        const tpts = textToPoints(s.text || "?", s.x, s.y, fontSize);
        if (tpts.length > 1) {
          ctx.save();
          ctx.strokeStyle = `${s.color || C.sand}50`;
          ctx.lineWidth = 0.8;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(tpts[0].x, tpts[0].y);
          tpts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
          ctx.restore();
        }

        // 2. Desenăm literele vizual cu stroke gros pentru lizibilitate în editor
        ctx.save();
        ctx.strokeStyle = s.color || C.sand;
        ctx.lineWidth   = Math.max(2, fontSize * 0.06);
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";

        for (const ch of (s.text || "?").toUpperCase()) {
          const segs = STROKE_LETTERS[ch] || STROKE_LETTERS["?"];
          if (!segs || segs.length === 0) { curX += spacing * 0.45; continue; }
          for (const seg of segs) {
            if (seg.length < 2) continue;
            ctx.beginPath();
            seg.forEach(([xn, yn], i) => {
              const px = curX + xn * letterW;
              const py = baseY - yn * letterH;
              i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            });
            ctx.stroke();
          }
          curX += spacing;
        }
        ctx.restore();
        break;
      }
      default: break;
    }

    // Selection handles
    if (selected && s.type !== "pen") {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = `${C.sand}88`;
      ctx.lineWidth = 1;
      const bb = getBBox(s);
      if (bb) ctx.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function getBBox(s) {
    if (s.type === "pen") return null;
    if (s.type === "text") {
      const fontSize = s.fontSize || 40;
      const w = (s.text?.length || 1) * fontSize * 0.72;
      return { x: s.x, y: s.y - fontSize, w, h: fontSize };
    }
    const x = Math.min(s.x0 ?? s.x, s.x1 ?? s.x);
    const y = Math.min(s.y0 ?? s.y, s.y1 ?? s.y);
    const w = Math.abs((s.x1 ?? s.x) - (s.x0 ?? s.x));
    const h = Math.abs((s.y1 ?? s.y) - (s.y0 ?? s.y));
    return { x, y, w, h };
  }

  useEffect(() => { redraw(); }, [redraw]);

  // ── Pointer events ──────────────────────────────────────────────────────
  const onDown = (e) => {
    e.preventDefault();
    const p = ptOnCanvas(e, canvasRef.current);

    if (tool === "select") {
      // Find topmost shape at click
      const hit = [...shapes].reverse().find(s => {
        const bb = getBBox(s);
        if (!bb) return false;
        return p.x >= bb.x - 8 && p.x <= bb.x + bb.w + 8 &&
               p.y >= bb.y - 8 && p.y <= bb.y + bb.h + 8;
      });
      setSelectedId(hit ? hit.id : null);
      if (hit) {
        dragStart.current = { px: p.x, py: p.y, shapeId: hit.id };
      }
      return;
    }

    if (tool === "eraser") {
      // Remove shape near click
      setShapes(prev => prev.filter(s => {
        const bb = getBBox(s);
        if (!bb) {
          if (s.type === "pen") {
            return !s.points.some(pt => dist(pt, p) < 20);
          }
          return true;
        }
        return !(p.x >= bb.x - 10 && p.x <= bb.x + bb.w + 10 &&
                 p.y >= bb.y - 10 && p.y <= bb.y + bb.h + 10);
      }));
      return;
    }

    if (tool === "text") {
      // Creăm un textbox drag-abil pe canvas
      const id = Date.now();
      setShapes(prev => [...prev, {
        id, type: "text",
        x: p.x, y: p.y,
        text: "Text",
        color: strokeColor,
        fontSize: 40,
        sw: strokeWidth,
        editing: true,
      }]);
      setSelectedId(id);
      setTool("select"); // trecem automat în select pentru drag
      return;
    }

    drawing.current = true;
    const newShape = {
      id: Date.now(),
      type: tool,
      color: strokeColor,
      sw: strokeWidth,
      x0: p.x, y0: p.y, x1: p.x, y1: p.y,
      points: tool === "pen" ? [p] : undefined,
    };
    currentRef.current = newShape;
    redraw();
  };

  const onMove = (e) => {
    e.preventDefault();

    // Drag selected shape
    if (tool === "select" && dragStart.current) {
      const p = ptOnCanvas(e, canvasRef.current);
      const dx = p.x - dragStart.current.px;
      const dy = p.y - dragStart.current.py;
      dragStart.current = { ...dragStart.current, px: p.x, py: p.y };
      setShapes(prev => prev.map(s => {
        if (s.id !== dragStart.current.shapeId) return s;
        if (s.type === "pen") {
          return { ...s, points: s.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) };
        }
        if (s.type === "text") {
          return { ...s, x: s.x + dx, y: s.y + dy };
        }
        return { ...s, x0: s.x0 + dx, y0: s.y0 + dy, x1: s.x1 + dx, y1: s.y1 + dy };
      }));
      return;
    }

    if (!drawing.current || !currentRef.current) return;
    const p = ptOnCanvas(e, canvasRef.current);
    const s = currentRef.current;

    if (s.type === "pen") {
      s.points.push(p);
    } else {
      s.x1 = p.x; s.y1 = p.y;
    }
    redraw();
  };

  const onUp = (e) => {
    e.preventDefault();
    dragStart.current = null;
    if (!drawing.current || !currentRef.current) return;
    drawing.current = false;
    const s = currentRef.current;
    currentRef.current = null;
    // Only save if shape has meaningful size
    const hasSize = s.type === "pen"
      ? s.points.length > 3
      : dist({ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }) > 5;
    if (hasSize) setShapes(prev => [...prev, s]);
    redraw();
  };

  // Textbox editing overlay
  const selectedText = shapes.find(s => s.id === selectedId && s.type === "text");

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1" }}>
      <canvas
        ref={canvasRef}
        width={CSIZE} height={CSIZE}
        style={{
          width: "100%", height: "100%",
          display: "block", borderRadius: "50%",
          cursor: tool === "pen" || tool === "eraser" ? "crosshair"
                : tool === "select" ? (dragStart.current ? "grabbing" : "grab")
                : "crosshair",
          touchAction: "none",
          boxShadow: `0 0 60px rgba(200,169,126,0.08), inset 0 0 0 1px ${C.border}`,
        }}
        onMouseDown={onDown} onMouseMove={onMove}
        onMouseUp={onUp}     onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      />
      {/* Textbox editor overlay */}
      {selectedText && (
        <div style={{
          position: "absolute",
          bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "90%", background: C.surf,
          border: `1px solid ${C.sand}50`,
          borderRadius: 12, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 11, color: C.dim, fontFamily: "monospace", whiteSpace: "nowrap" }}>TEXT:</span>
          <input
            autoFocus
            value={selectedText.text}
            onChange={e => setShapes(prev => prev.map(s =>
              s.id === selectedId ? { ...s, text: e.target.value } : s
            ))}
            style={{
              flex: 1, background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "7px 10px",
              color: C.sand, fontFamily: "Syne, sans-serif", fontSize: 14, outline: "none",
            }}
          />
          <input
            type="number" min={20} max={100} value={selectedText.fontSize || 40}
            onChange={e => setShapes(prev => prev.map(s =>
              s.id === selectedId ? { ...s, fontSize: Number(e.target.value) } : s
            ))}
            style={{
              width: 56, background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "7px 8px",
              color: C.dim, fontFamily: "monospace", fontSize: 12, outline: "none", textAlign: "center",
            }}
          />
          <span style={{ fontSize: 10, color: C.dim, fontFamily: "monospace" }}>px</span>
          <button onClick={() => setSelectedId(null)} style={{
            background: C.sand, border: "none", borderRadius: 7,
            padding: "7px 12px", color: "#111",
            fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer",
          }}>✓ OK</button>
        </div>
      )}
    </div>
  );
}

// ── Sand Table Preview (polar animation) ──────────────────────────────────────
function SandPreview({ thrPoints, speed, onClose, onSave }) {
  const canvasRef  = useRef(null);
  const animRef    = useRef(null);
  const progRef    = useRef(0);
  const pausedRef  = useRef(false);
  const [progress, setProgress]   = useState(0);
  const [paused,   setPaused]     = useState(false);
  const [ballSpeed, setBallSpeed] = useState(speed);

  const PSIZE = 500;
  const PCX = PSIZE / 2, PCY = PSIZE / 2, PR = PSIZE / 2 - 20;

  const drawFrame = useCallback((prog) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, PSIZE, PSIZE);

    // Sand background
    ctx.fillStyle = "#0e0c0a";
    ctx.beginPath(); ctx.arc(PCX, PCY, PR + 4, 0, Math.PI * 2);
    ctx.fill();

    // Grid
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.arc(PCX, PCY, PR * i / 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200,169,126,0.04)"; ctx.lineWidth = 1; ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(PCX, PCY);
      ctx.lineTo(PCX + PR * Math.cos(a), PCY + PR * Math.sin(a));
      ctx.strokeStyle = "rgba(200,169,126,0.03)"; ctx.lineWidth = 1; ctx.stroke();
    }

    // Outer ring
    ctx.beginPath(); ctx.arc(PCX, PCY, PR, 0, Math.PI * 2);
    ctx.strokeStyle = `${C.sand}50`; ctx.lineWidth = 2; ctx.stroke();

    // Centru — punct de start bilă
    ctx.beginPath(); ctx.arc(PCX, PCY, 8, 0, Math.PI * 2);
    ctx.strokeStyle = `${C.sand}50`; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(PCX, PCY, 3, 0, Math.PI * 2);
    ctx.fillStyle = `${C.sand}90`; ctx.fill();
    ctx.strokeStyle = `${C.sand}30`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PCX-12,PCY); ctx.lineTo(PCX+12,PCY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PCX,PCY-12); ctx.lineTo(PCX,PCY+12); ctx.stroke();

    if (!thrPoints.length) return;

    const drawn = Math.max(2, Math.floor(thrPoints.length * prog));

    // Draw trail — faded older, bright recent, tranzițiile în culoare diferită
    for (let i = 1; i < drawn; i++) {
      const [t0, r0] = thrPoints[i - 1];
      const [t1, r1] = thrPoints[i];
      const x0 = PCX + PR * r0 * Math.cos(t0);
      const y0 = PCY + PR * r0 * Math.sin(t0);
      const x1 = PCX + PR * r1 * Math.cos(t1);
      const y1 = PCY + PR * r1 * Math.sin(t1);

      const age = (drawn - i) / drawn;
      // Detectăm salt mare (tranziție între shapes) — mai mulți pași mici = normal
      const dr = Math.abs(r1 - r0);
      const dt = Math.abs(t1 - t0);
      const isTransition = dr > 0.08 || dt > 0.2;

      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      if (isTransition) {
        ctx.strokeStyle = `rgba(96,165,250,${Math.max(0.1, 0.5 - age * 0.4)})`;
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = `rgba(200,169,126,${Math.max(0.05, 0.7 - age * 0.65)})`;
        ctx.setLineDash([]);
        ctx.lineWidth = age < 0.05 ? 2 : 1;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ball
    const [bt, br] = thrPoints[drawn - 1];
    const bx = PCX + PR * br * Math.cos(bt);
    const by = PCY + PR * br * Math.sin(bt);

    const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 18);
    glow.addColorStop(0, "rgba(200,169,126,0.55)");
    glow.addColorStop(1, "transparent");
    ctx.beginPath(); ctx.arc(bx, by, 18, 0, Math.PI * 2);
    ctx.fillStyle = glow; ctx.fill();

    ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = C.sandPale; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
  }, [thrPoints]);

  useEffect(() => {
    const fps = 60;
    const step = ballSpeed / (fps * thrPoints.length * 0.3);

    const loop = () => {
      if (!pausedRef.current) {
        progRef.current = Math.min(progRef.current + step, 1);
        setProgress(progRef.current);
        drawFrame(progRef.current);
        if (progRef.current >= 1) {
          // loop animation
          setTimeout(() => { progRef.current = 0; }, 800);
        }
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawFrame, ballSpeed, thrPoints.length]);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(p => !p);
  };

  const restart = () => { progRef.current = 0; };

  // Generate .thr text
  const thrText = ["# Pattern ZeNis — generat din editor", `# ${new Date().toLocaleString("ro-RO")}`, ""]
    .concat(thrPoints.map(([t, r]) => `${t.toFixed(4)} ${r.toFixed(4)}`))
    .join("\n");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
      zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: C.surf, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: 28,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        maxWidth: 580, width: "100%",
        boxShadow: `0 0 80px rgba(200,169,126,0.1)`,
      }}>
        {/* Header */}
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Previzualizare masă de nisip</div>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: "monospace", marginTop: 2 }}>
              {thrPoints.length} puncte θ-ρ generate
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${C.border}`,
            color: C.dim, borderRadius: 8, padding: "6px 12px",
            cursor: "pointer", fontSize: 12, fontFamily: "inherit",
          }}>✕ Închide</button>
        </div>

        {/* Canvas */}
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef} width={PSIZE} height={PSIZE}
            style={{
              width: Math.min(PSIZE, 440), height: Math.min(PSIZE, 440),
              borderRadius: "50%", display: "block",
              border: `1px solid ${C.border}`,
            }}
          />
          {/* Progress arc overlay label */}
          <div style={{
            position: "absolute", bottom: -20, left: "50%",
            transform: "translateX(-50%)",
            fontSize: 11, color: C.dim, fontFamily: "monospace", whiteSpace: "nowrap",
          }}>
            {Math.round(progress * 100)}% desenat
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, fontSize: 11, fontFamily: "monospace", color: C.dim }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 2, background: C.sand }} />
            Traseu pattern
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 2, background: "#60A5FA", borderTop: "2px dashed #60A5FA" }} />
            Tranziție între shapes
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: "100%", marginTop: 8 }}>
          <div style={{ height: 3, background: C.surf3, borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progress * 100}%`,
              background: `linear-gradient(90deg, ${C.sandDim}, ${C.sand})`,
              transition: "width 0.1s", borderRadius: 2,
            }} />
          </div>
        </div>

        {/* Transport controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={restart} style={iconBtn()}>
            <Ic d="M1 4v6h6M23 20v-6h-6" size={16} color={C.dim} />
          </button>
          <button onClick={togglePause} style={{
            ...iconBtn(), width: 48, height: 48, borderRadius: 12,
            background: `${C.sand}18`, border: `1px solid ${C.sand}40`,
            color: C.sand,
          }}>
            <Ic
              d={paused ? "M5 3l14 9-14 9V3z" : "M6 4h4v16H6zM14 4h4v16h-4z"}
              size={18} color={C.sand}
              fill={paused ? C.sand : "none"}
            />
          </button>
          <button onClick={restart} style={iconBtn()}>
            <Ic d="M5 4l10 8-10 8V4zM19 4h2v16h-2z" size={16} color={C.dim} />
          </button>
        </div>

        {/* Speed control */}
        <div style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.dim, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Viteză bilă
            </span>
            <span style={{ fontSize: 12, color: C.sand, fontFamily: "monospace" }}>
              {ballSpeed === 1 ? "Foarte lent" : ballSpeed <= 3 ? "Lent" : ballSpeed <= 6 ? "Normal" : ballSpeed <= 8 ? "Rapid" : "Maxim"}
              &nbsp;({ballSpeed}/10)
            </span>
          </div>
          <div style={{ position: "relative", height: 6, background: C.surf3, borderRadius: 3 }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${(ballSpeed / 10) * 100}%`,
              background: `linear-gradient(90deg, ${C.sandDim}, ${C.sand})`,
              borderRadius: 3, transition: "width 0.1s",
            }} />
            <input type="range" min={1} max={10} value={ballSpeed}
              onChange={e => setBallSpeed(Number(e.target.value))}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 9, color: C.dim, fontFamily: "monospace" }}>LENT</span>
            <span style={{ fontSize: 9, color: C.dim, fontFamily: "monospace" }}>RAPID</span>
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button onClick={() => onSave(thrText, ballSpeed)} style={{
            flex: 1, padding: "13px", borderRadius: 12,
            background: C.sand, border: "none", color: "#111",
            fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Ic d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" size={16} color="#111" />
            Salvează în bibliotecă
          </button>
        </div>
      </div>
    </div>
  );
}

function iconBtn() {
  return {
    width: 40, height: 40, borderRadius: 10,
    background: C.surf2, border: `1px solid ${C.border}`,
    color: C.dim, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}

// ── Saved pattern toast ───────────────────────────────────────────────────────
function SavedToast({ name, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: C.surf, border: `1px solid ${C.green}40`,
      borderRadius: 12, padding: "12px 20px",
      display: "flex", alignItems: "center", gap: 10,
      color: C.green, fontSize: 13, fontFamily: "monospace",
      boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
      zIndex: 200, whiteSpace: "nowrap",
      animation: "slideUp 0.3s ease",
    }}>
      <Ic d="M20 6L9 17l-5-5" size={16} color={C.green} sw={2.5} />
      „{name}" salvat în bibliotecă!
    </div>
  );
}

// ── Main Editor ───────────────────────────────────────────────────────────────
export default function ZeNisEditor() {
  const [tool,        setTool]        = useState("pen");
  const [strokeColor, setStrokeColor] = useState(C.sand);
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [shapes,      setShapes]      = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [thrPoints,   setThrPoints]   = useState([]);
  const [speed,       setSpeed]       = useState(5);
  const [savedToast,  setSavedToast]  = useState(null);
  const [history,     setHistory]     = useState([[]]);
  const [histIdx,     setHistIdx]     = useState(0);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const t = TOOLS.find(t => t.key === e.key.toLowerCase());
      if (t) setTool(t.id);
      if ((e.metaKey || e.ctrlKey) && e.key === "z") undo();
      if ((e.metaKey || e.ctrlKey) && e.key === "y") redo();
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          setShapes(prev => prev.filter(s => s.id !== selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, histIdx]);

  // Track history on shapes change
  const prevShapesRef = useRef(shapes);
  useEffect(() => {
    if (shapes === prevShapesRef.current) return;
    prevShapesRef.current = shapes;
    setHistory(h => {
      const next = h.slice(0, histIdx + 1);
      next.push(shapes);
      return next.slice(-30);
    });
    setHistIdx(h => Math.min(h + 1, 29));
  }, [shapes]);

  const undo = () => {
    if (histIdx <= 0) return;
    const ni = histIdx - 1;
    setHistIdx(ni);
    setShapes(history[ni]);
  };

  const redo = () => {
    if (histIdx >= history.length - 1) return;
    const ni = histIdx + 1;
    setHistIdx(ni);
    setShapes(history[ni]);
  };

  const handleRender = () => {
    if (!shapes.length) return;
    const pts = shapesToThetaRho(shapes, CSIZE);
    setThrPoints(pts);
    setShowPreview(true);
  };

  const handleSave = (thrText, savedSpeed) => {
    const name = prompt("Numele pattern-ului:", "Desen " + new Date().toLocaleDateString("ro-RO")) || "Fără nume";
    // In real app: POST to /api/patterns with thrText
    console.log("Saving pattern:", name, thrText.substring(0, 100) + "...");
    setShowPreview(false);
    setSavedToast(name);
  };

  const clearAll = () => {
    if (shapes.length && !window.confirm("Ștergi tot?")) return;
    setShapes([]);
    setSelectedId(null);
  };

  const PALETTE = [C.sand, "#E8E0D4", "#60A5FA", "#4ADE80", "#F87171", "#FBBF24", "#A78BFA"];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; color: ${C.text}; font-family: 'Syne', sans-serif; overflow: hidden; }
        input[type=range] { -webkit-appearance: none; appearance: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${C.sand}; cursor: pointer; }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: C.bg }}>

        {/* ── LEFT TOOLBAR ─────────────────────────────────────────────── */}
        <aside style={{
          width: 60, background: C.surf, borderRight: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "16px 8px", gap: 4,
        }}>
          {/* Logo */}
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: `linear-gradient(135deg, ${C.sandDim}, ${C.sand})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 12, flexShrink: 0,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#111" }} />
          </div>

          {/* Tools */}
          {TOOLS.map(t => <ToolBtn key={t.id} tool={t} active={tool === t.id} onClick={() => setTool(t.id)} />)}

          <div style={{ flex: 1 }} />

          {/* Undo/Redo */}
          <button title="Undo (Ctrl+Z)" onClick={undo} disabled={histIdx <= 0}
            style={{ ...iconBtn(), opacity: histIdx <= 0 ? 0.3 : 1, marginBottom: 4 }}>
            <Ic d="M3 7v6h6" size={16} color={C.dim} />
          </button>
          <button title="Redo (Ctrl+Y)" onClick={redo} disabled={histIdx >= history.length - 1}
            style={{ ...iconBtn(), opacity: histIdx >= history.length - 1 ? 0.3 : 1 }}>
            <Ic d="M21 7v6h-6" size={16} color={C.dim} />
          </button>
        </aside>

        {/* ── CANVAS AREA ──────────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          background: C.bg, position: "relative",
          backgroundImage: `radial-gradient(circle at center, #181818 0%, ${C.bg} 70%)`,
        }}>
          {/* Canvas */}
          <div style={{ width: "min(90vw, 90vh, 600px)", aspectRatio: "1" }}>
            <DrawCanvas
              tool={tool}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              shapes={shapes}
              setShapes={setShapes}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
            />
          </div>

          {/* Shape count badge */}
          {shapes.length > 0 && (
            <div style={{
              position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
              background: C.surf, border: `1px solid ${C.border}`,
              borderRadius: 99, padding: "5px 14px",
              fontSize: 11, color: C.dim, fontFamily: "monospace",
              display: "flex", gap: 12,
            }}>
              <span>{shapes.length} {shapes.length === 1 ? "element" : "elemente"}</span>
              {selectedId && <span style={{ color: C.sand }}>1 selectat · Del = șterge</span>}
            </div>
          )}

          {/* Empty state */}
          {shapes.length === 0 && (
            <div style={{
              position: "absolute", pointerEvents: "none",
              textAlign: "center", color: C.dim,
            }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Desenează pe canvas</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", lineHeight: 1.8 }}>
                Creion [P] · Linie [L] · Cerc [C]<br />
                Dreptunghi [R] · Triunghi [T] · Text [X]
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────── */}
        <aside style={{
          width: 220, background: C.surf, borderLeft: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", padding: 16, gap: 20,
          overflowY: "auto",
        }}>

          {/* Stroke color */}
          <div>
            <div style={sectionLabel()}>Culoare</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PALETTE.map(col => (
                <Swatch key={col} color={col} active={strokeColor === col} onClick={() => setStrokeColor(col)} />
              ))}
              <div style={{ position: "relative" }}>
                <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: `conic-gradient(red, yellow, lime, cyan, blue, magenta, red)`,
                  cursor: "pointer",
                }} />
              </div>
            </div>
          </div>

          {/* Stroke width */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", ...sectionLabel() }}>
              <span>Grosime</span>
              <span style={{ color: C.sand, fontFamily: "monospace" }}>{strokeWidth}px</span>
            </div>
            <div style={{ position: "relative", height: 5, background: C.surf3, borderRadius: 3, marginTop: 10 }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(strokeWidth / 10) * 100}%`, background: C.sand, borderRadius: 3 }} />
              <input type="range" min={1} max={10} step={0.5} value={strokeWidth}
                onChange={e => setStrokeWidth(Number(e.target.value))}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: C.dim, fontFamily: "monospace" }}>SUBȚIRE</span>
              <span style={{ fontSize: 9, color: C.dim, fontFamily: "monospace" }}>GROS</span>
            </div>
          </div>

          {/* Active tool info */}
          <div style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: "monospace", marginBottom: 4 }}>INSTRUMENT ACTIV</div>
            <div style={{ fontSize: 13, color: C.sand, display: "flex", alignItems: "center", gap: 8 }}>
              <Ic d={TOOLS.find(t => t.id === tool)?.icon || ""} size={14} color={C.sand} />
              {TOOLS.find(t => t.id === tool)?.label}
            </div>
          </div>

          {/* Layers / shapes list */}
          {shapes.length > 0 && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <div style={sectionLabel()}>Elemente ({shapes.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {[...shapes].reverse().map((s, i) => (
                  <div
                    key={s.id}
                    onClick={() => { setTool("select"); setSelectedId(s.id); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                      background: selectedId === s.id ? `${C.sand}15` : C.surf2,
                      border: `1px solid ${selectedId === s.id ? `${C.sand}40` : "transparent"}`,
                      transition: "all 0.1s",
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.text, flex: 1, textTransform: "capitalize" }}>
                      {s.type === "pen" ? "Desen liber" : s.type === "text" ? `"${s.text?.slice(0,10)}"` : s.type}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setShapes(prev => prev.filter(sh => sh.id !== s.id)); }}
                      style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 2, display: "flex" }}
                    >
                      <Ic d="M18 6L6 18M6 6l12 12" size={12} color={C.dim} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Clear */}
          <button onClick={clearAll} style={{
            background: "transparent", border: `1px solid ${C.border}`,
            color: C.dim, borderRadius: 10, padding: "9px",
            cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Ic d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" size={14} color={C.dim} />
            Șterge tot
          </button>

          {/* RENDER button */}
          <button
            onClick={handleRender}
            disabled={shapes.length === 0}
            style={{
              background: shapes.length ? C.sand : C.surf3,
              border: "none",
              color: shapes.length ? "#111" : C.dim,
              borderRadius: 12, padding: "14px",
              fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14,
              cursor: shapes.length ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s",
            }}
          >
            <Ic d="M12 2a10 10 0 100 20A10 10 0 0012 2zM12 8v4l3 3" size={17} color={shapes.length ? "#111" : C.dim} />
            Randează pentru masă
          </button>

        </aside>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <SandPreview
          thrPoints={thrPoints}
          speed={speed}
          onClose={() => setShowPreview(false)}
          onSave={handleSave}
        />
      )}

      {/* Saved toast */}
      {savedToast && <SavedToast name={savedToast} onDismiss={() => setSavedToast(null)} />}
    </>
  );
}

function sectionLabel() {
  return {
    fontSize: 10, color: C.dim, fontFamily: "monospace",
    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10,
  };
}
