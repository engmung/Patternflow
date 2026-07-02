'use client';

import React from 'react';

type DiagramMode = 'layout' | 'encoders' | 'encoders_gnd' | 'hubconn' | 'hub_esp' | 'encoders_esp' | 'rail';

interface BreadboardDiagramProps {
  mode: DiagramMode;
}

type LineCap = 'round' | 'butt' | 'square';
type TextAnchor = 'start' | 'middle' | 'end';

interface RectShape {
  x: number; y: number; w: number; h: number;
  rx: number; fill: string; stroke: string; sw: number; op: number;
}
interface PathShape {
  d: string; fill: string; stroke: string; sw: number; op: number; cap: LineCap;
}
interface CircleShape {
  cx: number; cy: number; r: number;
  fill: string; stroke: string; sw: number; op: number;
}
interface TextShape {
  x: number; y: number; t: string;
  size: number; fill: string; anchor: TextAnchor; weight: string; op: number; family: string;
}
interface ShapeOpts {
  rx?: number; fill?: string; stroke?: string; sw?: number; op?: number; cap?: LineCap;
}
interface TextOpts {
  size?: number; fill?: string; anchor?: TextAnchor; weight?: string; op?: number; family?: string;
}

export default function BreadboardDiagram({ mode }: BreadboardDiagramProps) {
  const wires: PathShape[] = [];
  const bodies: RectShape[] = [];
  const circles: CircleShape[] = [];
  const detail: PathShape[] = [];
  const texts: TextShape[] = [];

  const P = {
    fill: '#fbfbcf',
    line: '#7c0a0a',
    wire: '#0c7a0c',
    txt: '#7c0a0a',
    teal: '#0a7d7d',
    mute: '#9a8f6f',
    x: '#cc1a1a',
    red: '#d5402b',
    blue: '#2563a8',
    black: '#2b2b2b',
    bb: '#efe6cf',
    hole: '#fff'
  };

  const SANS = "'Helvetica Neue', Arial, sans-serif";

  const RC = (x: number, y: number, w: number, h: number, o: ShapeOpts = {}): RectShape => ({
    x,
    y,
    w,
    h,
    rx: o.rx || 0,
    fill: o.fill || 'none',
    stroke: o.stroke || 'none',
    sw: o.sw || 0,
    op: o.op == null ? 1 : o.op
  });

  const body = (x: number, y: number, w: number, h: number, o: ShapeOpts = {}) => {
    bodies.push(RC(x, y, w, h, o));
  };

  const W = (d: string, o: ShapeOpts = {}) => {
    wires.push({
      d,
      fill: 'none',
      stroke: o.stroke || P.wire,
      sw: o.sw || 1.7,
      op: o.op == null ? 1 : o.op,
      cap: o.cap || 'round'
    });
  };

  const D = (d: string, o: ShapeOpts = {}) => {
    detail.push({
      d,
      fill: o.fill || 'none',
      stroke: o.stroke || 'none',
      sw: o.sw || 0,
      op: o.op == null ? 1 : o.op,
      cap: o.cap || 'butt'
    });
  };

  const CI = (cx: number, cy: number, r: number, o: ShapeOpts = {}) => {
    circles.push({
      cx,
      cy,
      r,
      fill: o.fill || 'none',
      stroke: o.stroke || 'none',
      sw: o.sw || 0,
      op: o.op == null ? 1 : o.op
    });
  };

  const T = (x: number, y: number, t: string | number, o: TextOpts = {}) => {
    texts.push({
      x,
      y,
      t: String(t),
      size: o.size || 10,
      fill: o.fill || P.txt,
      anchor: o.anchor || 'start',
      weight: o.weight || '400',
      op: o.op == null ? 1 : o.op,
      family: o.family || SANS
    });
  };

  const flag = (xTip: number, y: number, text: string, dir: number) => {
    const w = Math.max(32, text.length * 6.1 + 13);
    const h2 = 8.5;
    const ph = 6;
    let d, tx;
    if (dir > 0) {
      d = `M ${xTip} ${y} L ${xTip - ph} ${y - h2} L ${xTip - w} ${y - h2} L ${xTip - w} ${y + h2} L ${xTip - ph} ${y + h2} Z`;
      tx = xTip - ph - (w - ph) / 2;
    } else {
      d = `M ${xTip} ${y} L ${xTip + ph} ${y - h2} L ${xTip + w} ${y - h2} L ${xTip + w} ${y + h2} L ${xTip + ph} ${y + h2} Z`;
      tx = xTip + ph + (w - ph) / 2;
    }
    D(d, { fill: '#fffdf2', stroke: P.line, sw: 1.3 });
    T(tx, y + 3.4, text, { anchor: 'middle', size: 10, fill: P.txt });
    return w;
  };

  const arrow = (x1: number, y1: number, x2: number, y2: number, c: string, sw?: number) => {
    W(`M ${x1} ${y1} L ${x2} ${y2}`, { stroke: c, sw: sw || 2 });
    const a = Math.atan2(y2 - y1, x2 - x1);
    const L = 8;
    D(`M ${x2} ${y2} L ${x2 - L * Math.cos(a - 0.45)} ${y2 - L * Math.sin(a - 0.45)} L ${x2 - L * Math.cos(a + 0.45)} ${y2 - L * Math.sin(a + 0.45)} Z`, { fill: c });
  };

  const HC: Record<string, [string, string]> = {
    HUB_R1: ['R1', P.red],
    HUB_B1: ['R2', P.red],
    HUB_R2: ['R3', P.red],
    HUB_B2: ['R4', P.red],
    HUB_A: ['R5', P.red],
    HUB_C: ['R6', P.red],
    HUB_CLK: ['R7', P.red],
    HUB_OE: ['R8', P.red],
    HUB_G1: ['B1', P.blue],
    HUB_G2: ['B2', P.blue],
    HUB_E: ['B3', P.blue],
    HUB_B: ['B4', P.blue],
    HUB_D: ['B5', P.blue],
    HUB_LAT: ['B6', P.blue]
  };

  let vw = 600;
  let vh = 620;

  // ============ Encoders ============
  if (mode === 'encoders') {
    vw = 600;
    vh = 560;
    const pos = [[150, 130], [450, 130], [150, 430], [450, 430]];
    pos.forEach((c, i) => {
      const id = i + 1;
      const cx = c[0];
      const cy = c[1];
      const s = 44;
      body(cx - s, cy - s, 2 * s, 2 * s, { rx: 3, fill: P.fill, stroke: P.line, sw: 2 });
      CI(cx, cy, 28, { stroke: P.line, sw: 1.5 });
      D(`M ${cx} ${cy - 28} V ${cy - 10}`, { stroke: P.line, sw: 1.2 });
      D(`M ${cx - 8} ${cy - 18} L ${cx} ${cy - 9} L ${cx + 8} ${cy - 18} Z`, { fill: P.line });
      T(cx, cy - s - 24, 'SW' + id, { anchor: 'middle', size: 14, fill: P.txt, weight: '700' });
      T(cx, cy - s - 10, 'ENC' + id, { anchor: 'middle', size: 12, fill: P.teal, weight: '700' });
      const Lp = [[cy - 24, 'A', 'ENC' + id + '_A'], [cy, 'C', 'GND'], [cy + 24, 'B', 'ENC' + id + '_B']];
      Lp.forEach(([y, nm, net]) => {
        W(`M ${cx - s} ${y} H ${cx - s - 28}`);
        T(cx - s + 10, Number(y) + 4.2, String(nm), { size: 11.5, fill: P.txt, weight: '600' });
        flag(cx - s - 28, Number(y), String(net), 1);
      });
      const Rp = [[cy - 16, 'S1', 'ENC' + id + '_SW'], [cy + 16, 'S2', 'GND']];
      Rp.forEach(([y, nm, net]) => {
        W(`M ${cx + s} ${y} H ${cx + s + 28}`);
        T(cx + s - 10, Number(y) + 4.2, String(nm), { anchor: 'end', size: 11.5, fill: P.txt, weight: '600' });
        flag(cx + s + 28, Number(y), String(net), -1);
      });
    });
  }

  // ============ Encoders GND & Rail ============
  else if (mode === 'encoders_gnd') {
    vw = 600;
    vh = 620;
    const rx = 60;
    const ry = 535;
    const rw = 480;
    const rh = 50;
    body(rx, ry, rw, rh, { rx: 5, fill: P.bb, stroke: '#cabf9c', sw: 1.5 });
    const gndY = ry + 17;
    const pwrY = ry + 33;
    D(`M ${rx + 15} ${gndY} H ${rx + rw - 15}`, { stroke: P.black, sw: 2.2 });
    D(`M ${rx + 15} ${pwrY} H ${rx + rw - 15}`, { stroke: P.red, sw: 2.2 });
    T(rx + 8, gndY + 4.5, '\u2212', { anchor: 'middle', size: 14, fill: P.black, weight: '700' });
    T(rx + 8, pwrY + 4.5, '+', { anchor: 'middle', size: 14, fill: P.red, weight: '700' });
    T(rx + rw / 2, ry + rh + 20, 'BREADBOARD', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    const N = 25;
    const holeX = (i: number) => rx + 22 + i * ((rw - 44) / (N - 1));

    const pos = [[150, 140], [450, 140], [150, 440], [450, 440]];
    const gndHoles = [2, 5, 8, 11, 14, 17, 20, 23];
    let gidx = 0;

    pos.forEach((c, i) => {
      const id = i + 1;
      const cx = c[0];
      const cy = c[1];
      const s = 44;
      body(cx - s, cy - s, 2 * s, 2 * s, { rx: 3, fill: P.fill, stroke: P.line, sw: 2 });
      CI(cx, cy, 28, { stroke: P.line, sw: 1.5 });
      D(`M ${cx} ${cy - 28} V ${cy - 10}`, { stroke: P.line, sw: 1.2 });
      D(`M ${cx - 8} ${cy - 18} L ${cx} ${cy - 9} L ${cx + 8} ${cy - 18} Z`, { fill: P.line });
      T(cx, cy - s - 12, 'ENC' + id, { anchor: 'middle', size: 14, fill: P.teal, weight: '700' });

      const yA = cy - 24;
      const yC = cy;
      const yB = cy + 24;
      CI(cx - s, yA, 2.5, { fill: P.bb, stroke: P.line, sw: 1 });
      CI(cx - s, yC, 3, { fill: P.black });
      CI(cx - s, yB, 2.5, { fill: P.bb, stroke: P.line, sw: 1 });
      T(cx - s - 32, yC + 4.5, 'GND', { anchor: 'end', size: 12, fill: P.black, weight: '700' });

      const yS1 = cy - 16;
      const yS2 = cy + 16;
      CI(cx + s, yS1, 2.5, { fill: P.bb, stroke: P.line, sw: 1 });
      CI(cx + s, yS2, 3, { fill: P.black });
      T(cx + s + 32, yS2 + 4.5, 'GND', { anchor: 'start', size: 12, fill: P.black, weight: '700' });

      const isTop = i < 2;
      const wX1 = isTop ? cx - s - 24 : cx - s - 12;
      const wX2 = isTop ? cx + s + 24 : cx + s + 12;
      const dropCol1 = gndHoles[gidx++];
      const dropCol2 = gndHoles[gidx++];
      const targetX1 = holeX(dropCol1);
      const targetX2 = holeX(dropCol2);

      W(`M ${cx - s} ${yC} H ${wX1} V ${gndY - 15} C ${wX1} ${gndY - 5}, ${targetX1} ${gndY - 12}, ${targetX1} ${gndY}`, { stroke: P.black, sw: 1.5 });
      W(`M ${cx + s} ${yS2} H ${wX2} V ${gndY - 15} C ${wX2} ${gndY - 5}, ${targetX2} ${gndY - 12}, ${targetX2} ${gndY}`, { stroke: P.black, sw: 1.5 });
    });
  }

  // ============ HUB connector ============
  else if (mode === 'hubconn') {
    vw = 500;
    vh = 400;
    const bx = 90;
    const bw = 7 * 38 + 52;
    const by = 165;
    const pitch = 38;
    const bh = 70;
    const midX = bx + bw / 2;
    body(bx, by, bw, bh, { rx: 3, fill: P.fill });
    D(`M ${bx} ${by} H ${midX - 12} V ${by + 8} H ${midX + 12} V ${by} H ${bx + bw} V ${by + bh} H ${bx} Z`, { stroke: P.line, sw: 2 });

    T(bx + bw / 2, by - 45, 'HUB75E', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });
    T(bx + bw / 2, by + bh + 30, '2\u00d78 Pin Header', { anchor: 'middle', size: 12, fill: P.mute, weight: '600' });
    T(bx + bw - 10, by + bh + 55, '\u25be pin 1 bottom-right when laid flat', { anchor: 'end', size: 10, fill: P.mute });

    const HUB = [
      [1, 'HUB_R1', 'L', 0], [3, 'HUB_B1', 'L', 1], [5, 'HUB_R2', 'L', 2], [7, 'HUB_B2', 'L', 3],
      [9, 'HUB_A', 'L', 4], [11, 'HUB_C', 'L', 5], [13, 'HUB_CLK', 'L', 6], [15, 'HUB_OE', 'L', 7],
      [2, 'HUB_G1', 'R', 0], [4, 'GND', 'R', 1], [6, 'HUB_G2', 'R', 2], [8, 'HUB_E', 'R', 3],
      [10, 'HUB_B', 'R', 4], [12, 'HUB_D', 'R', 5], [14, 'HUB_LAT', 'R', 6], [16, 'GND', 'R', 7]
    ];

    HUB.forEach(([pn, net, side, k]) => {
      const isOdd = side === 'L';
      const y = isOdd ? by + 18 : by + 52;
      const x = bx + 26 + (7 - Number(k)) * pitch;

      body(x - 4, y - 4, 8, 8, { fill: '#fff', stroke: P.line, sw: 1 });
      T(x, isOdd ? y - 7 : y + 12, String(pn), { anchor: 'middle', size: 9.5, fill: P.txt, weight: '600' });

      const cc = HC[String(net)] || ['GND', P.black];
      const color = cc[1];
      const labelText = cc[0];
      const ccy = isOdd ? by - 24 : by + bh + 24;

      let cleanText = labelText;
      if (cleanText.startsWith('R') || cleanText.startsWith('B')) {
        cleanText = cleanText.slice(1);
      }
      T(x, ccy + 6.5, cleanText, { anchor: 'middle', size: 20, fill: color, weight: '900', family: "'JetBrains Mono', monospace" });
      W(`M ${x} ${y} V ${ccy + (isOdd ? 9 : -9)}`, { stroke: color, sw: 1.2 });
    });
  }

  // ============ HUB & ESP32 Side-by-Side ============
  else if (mode === 'hub_esp') {
    vw = 860;
    vh = 640;
    const hx = 490;
    const hw = 272;
    const hy = 220;
    const hpitch = 32;
    const hh = 70;
    const midX = hx + hw / 2;
    body(hx, hy, hw, hh, { rx: 3, fill: P.fill });
    D(`M ${hx} ${hy} H ${midX - 12} V ${hy + 8} H ${midX + 12} V ${hy} H ${hx + hw} V ${hy + hh} H ${hx} Z`, { stroke: P.line, sw: 2 });
    T(hx + hw / 2, hy - 55, 'HUB75E', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    const ex = 100;
    const ew = 240;
    const ey = 60;
    const epitch = 23;
    const eby = ey + 20;
    const eh = 21 * epitch + 40;
    body(ex + ew / 2 - 82, ey - 20, 164, 20, { rx: 1, fill: '#1a1a1a', stroke: '#1a1a1a' });
    body(ex, ey, ew, eh, { rx: 3, fill: P.fill, stroke: P.line, sw: 2 });
    body(ex + ew / 2 - 65, ey + 25, 130, 130, { rx: 4, fill: '#d8d3c4', stroke: P.line, sw: 1.5 });
    T(ex + ew / 2, ey - 36, 'ESP32', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    const HUB = [
      [1, 'HUB_R1', 'L', 0], [3, 'HUB_B1', 'L', 1], [5, 'HUB_R2', 'L', 2], [7, 'HUB_B2', 'L', 3],
      [9, 'HUB_A', 'L', 4], [11, 'HUB_C', 'L', 5], [13, 'HUB_CLK', 'L', 6], [15, 'HUB_OE', 'L', 7],
      [2, 'HUB_G1', 'R', 0], [4, 'GND', 'R', 1], [6, 'HUB_G2', 'R', 2], [8, 'HUB_E', 'R', 3],
      [10, 'HUB_B', 'R', 4], [12, 'HUB_D', 'R', 5], [14, 'HUB_LAT', 'R', 6], [16, 'GND', 'R', 7]
    ];

    const EP = [
      [1, '3V3', '', 'nc'], [2, '3V3', '', 'nc'], [3, 'RST', '', 'nc'], [4, 'IO4', '', 'sig'], [5, 'IO5', '', 'sig'], [6, 'IO6', '', 'sig'], [7, 'IO7', '', 'sig'], [8, 'IO15', '', 'sig'], [9, 'IO16', '', 'sig'], [10, 'IO17', '', 'sig'], [11, 'IO18', '', 'sig'], [12, 'IO8', '', 'sig'], [13, 'IO3', '', 'nc'],
      [14, 'IO46', 'HUB_A', 'hub'], [15, 'IO9', '', 'sig'], [16, 'IO10', '', 'sig'],
      [17, 'IO11', 'HUB_B', 'hub'], [18, 'IO12', 'HUB_D', 'hub'], [19, 'IO13', 'HUB_B2', 'hub'], [20, 'IO14', 'HUB_OE', 'hub'], [21, '5V', '', ''], [22, 'GND', '', ''],
      [23, 'GND', '', ''], [24, 'TX', '', 'nc'], [25, 'RX', '', 'nc'], [26, 'IO1', '', 'sig'],
      [27, 'IO2', 'HUB_CLK', 'hub'], [28, 'IO42', 'HUB_R1', 'hub'], [29, 'IO41', 'HUB_G1', 'hub'], [30, 'IO40', 'HUB_B1', 'hub'],
      [31, 'IO39', 'HUB_G2', 'hub'], [32, 'IO38', 'HUB_R2', 'hub'], [33, 'IO37', '', 'nc'], [34, 'IO36', '', 'nc'], [35, 'IO35', '', 'nc'], [36, 'IO0', '', 'nc'], [37, 'IO45', '', 'nc'],
      [38, 'IO48', 'HUB_C', 'hub'], [39, 'IO47', 'HUB_LAT', 'hub'], [40, 'IO21', 'HUB_E', 'hub'],
      [41, 'IO20', '', 'nc'], [42, 'IO19', '', 'nc'], [43, 'GND', '', ''], [44, 'GND', '', ''],
    ];

    const rx = 490;
    const ry = 435;
    const rw = 272;
    const rh = 50;
    body(rx, ry, rw, rh, { rx: 5, fill: P.bb, stroke: '#cabf9c', sw: 1.5 });
    const gndY = ry + 17;
    const pwrY = ry + 33;
    D(`M ${rx + 15} ${gndY} H ${rx + rw - 15}`, { stroke: P.black, sw: 2.2 });
    D(`M ${rx + 15} ${pwrY} H ${rx + rw - 15}`, { stroke: P.red, sw: 2.2 });
    T(rx + 8, gndY + 4.5, '\u2212', { anchor: 'middle', size: 14, fill: P.black, weight: '700' });
    T(rx + 8, pwrY + 4.5, '+', { anchor: 'middle', size: 14, fill: P.red, weight: '700' });

    const N = 13;
    const holeX = (i: number) => rx + 22 + i * ((rw - 44) / (N - 1));
    for (let i = 0; i < N; i++) {
      CI(holeX(i), gndY, 2.5, { fill: P.hole, stroke: '#cabf9c', sw: 0.5 });
      CI(holeX(i), pwrY, 2.5, { fill: P.hole, stroke: '#cabf9c', sw: 0.5 });
    }

    const gndHoles = [3, 9];
    gndHoles.forEach(idx => {
      const x = holeX(idx);
      W(`M ${x} ${gndY - 32} V ${gndY}`, { stroke: P.black, sw: 1.8 });
      CI(x, gndY - 32, 3.5, { fill: P.black });
      T(x, gndY - 40, 'GND', { anchor: 'middle', size: 13, fill: P.black, weight: '700' });
    });
    T(rx + rw / 2, ry + rh + 20, 'BREADBOARD', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    HUB.forEach(([, net, side, k]) => {
      const isOdd = side === 'L';
      const y = isOdd ? hy + 18 : hy + 52;
      const x = hx + 24 + (7 - Number(k)) * hpitch;

      body(x - 4, y - 4, 8, 8, { fill: '#fff', stroke: P.line, sw: 1 });

      const cc = HC[String(net)] || ['GND', P.black];
      const color = cc[1];
      const labelText = cc[0];
      const ccy = isOdd ? hy - 25 : hy + hh + 25;

      let cleanText = labelText;
      if (cleanText.startsWith('R') || cleanText.startsWith('B')) {
        cleanText = cleanText.slice(1);
      }
      T(x, ccy + 6.5, cleanText, { anchor: 'middle', size: 20, fill: color, weight: '900', family: "'JetBrains Mono', monospace" });
      W(`M ${x} ${y} V ${ccy + (isOdd ? 9 : -9)}`, { stroke: color, sw: 1.2 });
    });

    EP.forEach(([n, name, net, kind]) => {
      const numN = Number(n);
      const left = numN <= 22;
      const y = eby + (left ? numN - 1 : numN - 23) * epitch;
      const x = left ? ex : ex + ew;
      T(left ? ex + 10 : ex + ew - 10, y + 4, String(name), { anchor: left ? 'start' : 'end', size: 12, fill: P.txt, weight: '600' });

      let color = P.wire;
      let isLargeLabel = false;
      let labelText = '';

      if (kind === 'hub') {
        const cc = HC[String(net)];
        if (cc) {
          color = cc[1];
          labelText = cc[0];
          if (labelText.startsWith('R') || labelText.startsWith('B')) {
            labelText = labelText.slice(1);
          }
          isLargeLabel = true;
        }
      } else if (kind === 'gnd') {
        color = P.black;
        labelText = 'GND';
        isLargeLabel = true;
      } else if (kind === 'pwr') {
        color = P.red;
        labelText = '5V';
        isLargeLabel = true;
      }

      if (isLargeLabel) {
        const labelX = left ? ex - 38 : ex + ew + 38;
        T(labelX, y + 6.5, labelText, { anchor: 'middle', size: 20, fill: color, weight: '900', family: "'JetBrains Mono', monospace" });
        W(`M ${x} ${y} H ${labelX + (left ? 10 : -10)}`, { stroke: color, sw: 1.2 });
      }
    });
  }

  // ============ Encoders & ESP32 Side-by-Side ============
  else if (mode === 'encoders_esp') {
    vw = 860;
    vh = 600;
    const ex = 560;
    const ew = 240;
    const ey = 50;
    const epitch = 22;
    const eby = ey + 20;
    const eh = 21 * epitch + 40;
    body(ex + ew / 2 - 82, ey - 20, 164, 20, { rx: 1, fill: '#1a1a1a', stroke: '#1a1a1a' });
    body(ex, ey, ew, eh, { rx: 3, fill: P.fill, stroke: P.line, sw: 2 });
    body(ex + ew / 2 - 65, ey + 25, 130, 130, { rx: 4, fill: '#d8d3c4', stroke: P.line, sw: 1.5 });
    T(ex + ew / 2, ey - 36, 'ESP32', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    const pos = [[120, 160], [380, 160], [120, 420], [380, 420]];
    const sigColors = { A: '#1f9d57', B: '#2563a8', S: '#e67e22' };

    const EP = [
      [1, '3V3', '', 'nc'], [2, '3V3', '', 'nc'], [3, 'RST', '', 'nc'],
      [4, 'IO4', 'ENC1_A', 'sig'], [5, 'IO5', 'ENC2_A', 'sig'], [6, 'IO6', 'ENC3_A', 'sig'], [7, 'IO7', 'ENC4_A', 'sig'],
      [8, 'IO15', 'ENC2_SW', 'sig'], [9, 'IO16', 'ENC3_B', 'sig'], [10, 'IO17', 'ENC3_SW', 'sig'], [11, 'IO18', 'ENC4_B', 'sig'], [12, 'IO8', 'ENC1_B', 'sig'],
      [13, 'IO3', '', 'nc'], [14, 'IO46', '', 'hub'],
      [15, 'IO9', 'ENC1_SW', 'sig'], [16, 'IO10', 'ENC2_B', 'sig'],
      [17, 'IO11', '', 'hub'], [18, 'IO12', '', 'hub'], [19, 'IO13', '', 'hub'], [20, 'IO14', '', 'hub'], [21, '5V', '', ''], [22, 'GND', '', ''],
      [23, 'GND', '', ''], [24, 'TX', '', 'nc'], [25, 'RX', '', 'nc'],
      [26, 'IO1', 'ENC4_SW', 'sig'],
      [27, 'IO2', '', 'hub'], [28, 'IO42', '', 'hub'], [29, 'IO41', '', 'hub'], [30, 'IO40', '', 'hub'],
      [31, 'IO39', '', 'hub'], [32, 'IO38', '', 'hub'], [33, 'IO37', '', 'nc'], [34, 'IO36', '', 'nc'], [35, 'IO35', '', 'nc'], [36, 'IO0', '', 'nc'], [37, 'IO45', '', 'nc'],
      [38, 'IO48', '', 'hub'], [39, 'IO47', '', 'hub'], [40, 'IO21', '', 'hub'],
      [41, 'IO20', '', 'nc'], [42, 'IO19', '', 'nc'], [43, 'GND', '', ''], [44, 'GND', '', ''],
    ];

    EP.forEach(([n, name, net, kind]) => {
      const numN = Number(n);
      const left = numN <= 22;
      const y = eby + (left ? numN - 1 : numN - 23) * epitch;
      const x = left ? ex : ex + ew;
      T(left ? ex + 10 : ex + ew - 10, y + 4, String(name), { anchor: left ? 'start' : 'end', size: 12, fill: P.txt, weight: '600' });

      let color = P.wire;
      let isLargeLabel = false;
      let labelText = '';

      if (kind === 'sig' && net) {
        const m = String(net).match(/^ENC(\d)_(A|B|SW)$/);
        if (m) {
          const encId = parseInt(m[1]);
          const channel = m[2] === 'SW' ? 'S' : m[2] as keyof typeof sigColors;
          color = sigColors[channel];
          labelText = `${encId}${channel}`;
          isLargeLabel = true;
        }
      } else if (kind === 'gnd') {
        color = P.black;
        labelText = 'GND';
        isLargeLabel = true;
      } else if (kind === 'pwr') {
        color = P.red;
        labelText = '3V3';
        isLargeLabel = true;
      }

      if (isLargeLabel) {
        const labelX = left ? ex - 38 : ex + ew + 38;
        T(labelX, y + 6.5, labelText, { anchor: 'middle', size: 20, fill: color, weight: '900', family: "'JetBrains Mono', monospace" });
        W(`M ${x} ${y} H ${labelX + (left ? 10 : -10)}`, { stroke: color, sw: 1.2 });
      }
    });

    pos.forEach((c, i) => {
      const id = i + 1;
      const cx = c[0];
      const cy = c[1];
      const s = 44;

      body(cx - s, cy - s, 2 * s, 2 * s, { rx: 3, fill: P.fill, stroke: P.line, sw: 2 });
      CI(cx, cy, 28, { stroke: P.line, sw: 1.5 });
      D(`M ${cx} ${cy - 28} V ${cy - 10}`, { stroke: P.line, sw: 1.2 });
      D(`M ${cx - 8} ${cy - 18} L ${cx} ${cy - 9} L ${cx + 8} ${cy - 18} Z`, { fill: P.line });
      T(cx, cy - s - 24, 'SW' + id, { anchor: 'middle', size: 14, fill: P.txt, weight: '700' });
      T(cx, cy - s - 10, 'ENC' + id, { anchor: 'middle', size: 12, fill: P.teal, weight: '700' });

      const yA = cy - 24;
      const yC = cy;
      const yB = cy + 24;
      const Lp: [number, string, string, string][] = [
        [yA, 'A', `${id}A`, sigColors.A],
        [yC, 'C', 'GND', P.black],
        [yB, 'B', `${id}B`, sigColors.B]
      ];
      Lp.forEach(([y, nm, lbl, col]) => {
        const stubEnd = cx - s - 28;
        W(`M ${cx - s} ${Number(y)} H ${stubEnd + 8}`, { stroke: col, sw: 1.2 });
        T(cx - s + 10, Number(y) + 4.2, String(nm), { size: 11.5, fill: P.txt, weight: '600' });
        T(stubEnd, Number(y) + 6.5, String(lbl), { anchor: 'middle', size: 20, fill: String(col), weight: '900', family: "'JetBrains Mono', monospace" });
      });

      const yS1 = cy - 16;
      const yS2 = cy + 16;
      const Rp: [number, string, string, string][] = [
        [yS1, 'S1', `${id}S`, sigColors.S],
        [yS2, 'S2', 'GND', P.black]
      ];
      Rp.forEach(([y, nm, lbl, col]) => {
        const stubEnd = cx + s + 28;
        W(`M ${cx + s} ${Number(y)} H ${stubEnd - 8}`, { stroke: col, sw: 1.2 });
        T(cx + s - 10, Number(y) + 4.2, String(nm), { anchor: 'end', size: 11.5, fill: P.txt, weight: '600' });
        T(stubEnd, Number(y) + 6.5, String(lbl), { anchor: 'middle', size: 20, fill: String(col), weight: '900', family: "'JetBrains Mono', monospace" });
      });
    });
  }

  // ============ Encoders Power Rail ============
  else if (mode === 'rail') {
    vw = 720;
    vh = 540;

    const rx = 60;
    const ry = 440;
    const rw = 600;
    const rh = 50;
    body(rx, ry, rw, rh, { rx: 5, fill: P.bb, stroke: '#cabf9c', sw: 1.5 });
    const gndY = ry + 17;
    const pwrY = ry + 33;
    D(`M ${rx + 15} ${gndY} H ${rx + rw - 15}`, { stroke: P.black, sw: 2.2 });
    D(`M ${rx + 15} ${pwrY} H ${rx + rw - 15}`, { stroke: P.red, sw: 2.2 });
    T(rx + 8, gndY + 4.5, '\u2212', { anchor: 'middle', size: 14, fill: P.black, weight: '700' });
    T(rx + 8, pwrY + 4.5, '+', { anchor: 'middle', size: 14, fill: P.red, weight: '700' });
    T(rx + rw / 2, ry + rh + 20, 'BREADBOARD', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    const N = 25;
    const holeX = (i: number) => rx + 22 + i * ((rw - 44) / (N - 1));
    for (let i = 0; i < N; i++) {
      CI(holeX(i), gndY, 2.5, { fill: P.hole, stroke: '#cabf9c', sw: 0.5 });
      CI(holeX(i), pwrY, 2.5, { fill: P.hole, stroke: '#cabf9c', sw: 0.5 });
    }

    const ex = 150;
    const ew = 180;
    const ey = 40;
    const epitch = 14;
    const eby = ey + 20;
    const eh = 21 * epitch + 40;
    body(ex + ew / 2 - 60, ey - 15, 120, 15, { rx: 1, fill: '#1a1a1a', stroke: '#1a1a1a' });
    body(ex, ey, ew, eh, { rx: 3, fill: P.fill, stroke: P.line, sw: 2 });
    body(ex + ew / 2 - 45, ey + 20, 90, 90, { rx: 3, fill: '#d8d3c4', stroke: P.line, sw: 1.5 });
    T(ex + ew / 2, ey + 65, 'ESP32', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    for (let k = 0; k < 22; k++) {
      body(ex - 4, eby + k * epitch - 4, 8, 8, { fill: '#fff', stroke: P.line, sw: 1 });
      body(ex + ew - 4, eby + k * epitch - 4, 8, 8, { fill: '#fff', stroke: P.line, sw: 1 });
    }

    const y5V = eby + 20 * epitch;
    const yGND = eby + 21 * epitch;
    CI(ex, y5V, 3, { fill: P.red });
    T(ex - 8, y5V + 3.5, '5V', { anchor: 'end', size: 12, fill: P.red, weight: '700' });

    CI(ex, yGND, 3, { fill: P.black });
    T(ex - 8, yGND + 3.5, 'GND', { anchor: 'end', size: 12, fill: P.black, weight: '700' });

    const espGndHole = holeX(3);
    const esp5VHole = holeX(5);
    W(`M ${ex} ${y5V} H ${ex - 20} V ${pwrY - 20} C ${ex - 20} ${pwrY - 5}, ${esp5VHole} ${pwrY - 10}, ${esp5VHole} ${pwrY}`, { stroke: P.red, sw: 1.8 });
    W(`M ${ex} ${yGND} H ${ex - 32} V ${gndY - 20} C ${ex - 32} ${gndY - 5}, ${espGndHole} ${gndY - 10}, ${espGndHole} ${gndY}`, { stroke: P.black, sw: 1.8 });

    body(460, 50, 190, 70, { rx: 5, fill: '#2c3e50', stroke: '#34495e', sw: 1.5 });
    T(555, 90, '5V USB SUPPLY', { anchor: 'middle', size: 12, fill: '#fff', weight: '700' });
    W(`M 460 75 C 410 75, 400 90, 390 140`, { stroke: P.red, sw: 1.8 });
    W(`M 460 95 C 430 95, 420 100, 420 140`, { stroke: P.black, sw: 1.8 });

    body(460, 200, 190, 70, { rx: 5, fill: '#27ae60', stroke: '#2ecc71', sw: 1.5 });
    T(555, 240, 'HUB75E POWER INPUT', { anchor: 'middle', size: 12, fill: '#fff', weight: '700' });
    W(`M 460 225 C 410 225, 400 210, 390 140`, { stroke: P.red, sw: 1.8 });
    W(`M 460 245 C 430 245, 420 230, 420 140`, { stroke: P.black, sw: 1.8 });

    CI(390, 140, 4.5, { fill: P.red });
    T(390, 125, '5V Joint', { anchor: 'middle', size: 11, fill: P.red, weight: '700' });

    CI(420, 140, 4.5, { fill: P.black });
    T(420, 125, 'GND Joint', { anchor: 'middle', size: 11, fill: P.black, weight: '700' });

    const rail5VHole = holeX(17);
    const railGndHole = holeX(19);
    W(`M 390 140 C 390 240, ${rail5VHole} 340, ${rail5VHole} ${pwrY}`, { stroke: P.red, sw: 1.8 });
    W(`M 420 140 C 420 240, ${railGndHole} 340, ${railGndHole} ${gndY}`, { stroke: P.black, sw: 1.8 });
  }

  // ============ Layout overview ============
  else {
    vw = 860;
    vh = 480;
    const ep: [number, number, string][] = [[60, 70, 'Encoder 1'], [180, 70, 'Encoder 2'], [60, 195, 'Encoder 3'], [180, 195, 'Encoder 4']];
    ep.forEach(([x, y, l]) => {
      body(x, y, 95, 95, { rx: 6, fill: P.fill, stroke: P.line, sw: 2 });
      CI(x + 47, y + 47, 22, { stroke: P.line, sw: 1.5 });
      T(x + 47, y + 51, 'ENC', { anchor: 'middle', size: 12, fill: P.txt, weight: '700' });
      T(x + 47, y - 8, String(l), { anchor: 'middle', size: 12, fill: P.txt, weight: '700' });
    });
    T(150, 44, 'ROTARY ENCODERS', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    body(360 + 90 - 60, 66, 120, 14, { rx: 1, fill: '#1a1a1a', stroke: '#1a1a1a' });
    body(360, 80, 180, 250, { rx: 6, fill: P.fill, stroke: P.line, sw: 2 });
    body(360 + 90 - 55, 95, 110, 110, { rx: 3, fill: '#d8d3c4', stroke: P.line, sw: 1 });
    T(450, 215, 'ESP32', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    const hx = 590;
    const hy = 160;
    const hw = 220;
    const hh = 60;
    const midX = hx + hw / 2;
    body(hx, hy, hw, hh, { rx: 6, fill: P.fill });
    D(`M ${hx} ${hy} H ${midX - 10} V ${hy + 7} H ${midX + 10} V ${hy} H ${hx + hw} V ${hy + hh} H ${hx} Z`, { stroke: P.line, sw: 2 });
    T(hx + hw / 2, hy - 14, 'HUB75E', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });
    const px = hx + 10;
    const py = hy + 15;
    const dx = 24;
    for (let c = 0; c < 8; c++) {
      body(px + c * dx, py, 10, 10, { rx: 1, fill: '#fff', stroke: P.line, sw: 1.2 });
      body(px + c * dx, py + 20, 10, 10, { rx: 1, fill: '#fff', stroke: P.line, sw: 1.2 });
    }
    T(hx + hw / 2, hy + hh + 15, '2\u00d78 Pin Header', { anchor: 'middle', size: 12, fill: P.mute, weight: '600' });

    body(120, 410, 540, 46, { rx: 5, fill: P.bb, stroke: '#cabf9c', sw: 1.5 });
    D(`M 140 424 H 640`, { stroke: P.black, sw: 2 });
    D(`M 140 442 H 640`, { stroke: P.red, sw: 2 });
    T(390, 395, 'BREADBOARD', { anchor: 'middle', size: 15, fill: P.txt, weight: '700' });

    arrow(280, 140, 358, 150, P.wire, 2);
    T(318, 128, 'Signal Jumpers', { anchor: 'middle', size: 12, fill: P.wire, weight: '700' });

    arrow(130, 290, 250, 410, P.black, 1.8);
    T(155, 365, 'GND Jumpers', { anchor: 'middle', size: 12, fill: P.black, weight: '700' });

    arrow(590, 180, 562, 180, P.wire, 2);
    T(576, 165, 'Signal Jumpers', { anchor: 'middle', size: 12, fill: P.wire, weight: '700' });

    arrow(700, 220, 620, 410, P.black, 1.8);
    T(700, 310, 'GND Jumpers', { anchor: 'middle', size: 12, fill: P.black, weight: '700' });

    arrow(420, 410, 420, 332, P.red, 1.8);
    T(456, 372, '5V / GND Jumpers', { anchor: 'middle', size: 12, fill: P.mute, weight: '700' });
  }

  return (
    <div style={{ width: '100%', background: '#fcfbf6', border: '1px solid #e6dcc0', borderRadius: '8px', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" style={{ display: 'block' }}>
        {/* Draw wires */}
        {wires.map((w, idx) => (
          <path
            key={`w-${idx}`}
            d={w.d}
            fill={w.fill}
            stroke={w.stroke}
            strokeWidth={w.sw}
            strokeLinecap={w.cap}
            opacity={w.op}
          />
        ))}
        {/* Draw bodies */}
        {bodies.map((b, idx) => (
          <rect
            key={`b-${idx}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={b.rx}
            fill={b.fill}
            stroke={b.stroke}
            strokeWidth={b.sw}
            opacity={b.op}
          />
        ))}
        {/* Draw circles */}
        {circles.map((c, idx) => (
          <circle
            key={`c-${idx}`}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            fill={c.fill}
            stroke={c.stroke}
            strokeWidth={c.sw}
            opacity={c.op}
          />
        ))}
        {/* Draw detail paths */}
        {detail.map((d, idx) => (
          <path
            key={`d-${idx}`}
            d={d.d}
            fill={d.fill}
            stroke={d.stroke}
            strokeWidth={d.sw}
            strokeLinecap={d.cap}
            opacity={d.op}
          />
        ))}
        {/* Draw texts */}
        {texts.map((t, idx) => (
          <text
            key={`t-${idx}`}
            x={t.x}
            y={t.y}
            fontSize={t.size}
            fill={t.fill}
            textAnchor={t.anchor}
            fontWeight={t.weight}
            opacity={t.op}
            fontFamily={t.family}
          >
            {t.t}
          </text>
        ))}
      </svg>
    </div>
  );
}
