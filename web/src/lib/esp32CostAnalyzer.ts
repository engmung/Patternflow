export type Esp32CostLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Esp32CostReport {
  level: Esp32CostLevel;
  score: number;
  perPixel: {
    trig: number;
    pow: number;
    sqrt: number;
    atan2: number;
    division: number;
  };
  perFrame: {
    trig: number;
    pow: number;
    sqrt: number;
    atan2: number;
    division: number;
  };
  notes: string[];
}

const PIXELS_PER_FRAME = 128 * 64;

function countMatches(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function getDrawBody(code: string) {
  const drawStart = code.search(/export\s+function\s+draw\s*\(/);
  if (drawStart < 0) return code;

  const bodyStart = code.indexOf('{', drawStart);
  if (bodyStart < 0) return code;

  let depth = 0;
  for (let i = bodyStart; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') depth--;
    if (depth === 0) return code.slice(bodyStart + 1, i);
  }

  return code.slice(bodyStart + 1);
}

function getInnermostLoopBody(drawBody: string) {
  const loopMatches = [...drawBody.matchAll(/for\s*\([^)]*\)\s*\{/g)];
  if (loopMatches.length < 2) return drawBody;

  const innerLoop = loopMatches[loopMatches.length - 1];
  const bodyStart = (innerLoop.index ?? 0) + innerLoop[0].length - 1;

  let depth = 0;
  for (let i = bodyStart; i < drawBody.length; i++) {
    if (drawBody[i] === '{') depth++;
    if (drawBody[i] === '}') depth--;
    if (depth === 0) return drawBody.slice(bodyStart + 1, i);
  }

  return drawBody.slice(bodyStart + 1);
}

export function analyzeEsp32Cost(code: string): Esp32CostReport {
  const drawBody = getDrawBody(code);
  const pixelBody = getInnermostLoopBody(drawBody);

  const trig = countMatches(pixelBody, /\b(?:Math\.)?(?:sin|cos)\s*\(/g);
  const pow = countMatches(pixelBody, /\b(?:Math\.)?pow\s*\(/g);
  const sqrt = countMatches(pixelBody, /\b(?:Math\.)?sqrt\s*\(/g);
  const atan2 = countMatches(pixelBody, /\b(?:Math\.)?atan2\s*\(/g);
  const division = countMatches(pixelBody, /\/(?![/*])/g);

  const score = trig * 4 + pow * 8 + sqrt * 8 + atan2 * 14 + division * 1;
  const level: Esp32CostLevel = score >= 28 ? 'HIGH' : score >= 14 ? 'MEDIUM' : 'LOW';

  const notes: string[] = [];
  if (trig > 2) notes.push('Many trig calls inside the pixel loop.');
  if (pow > 0) notes.push('pow() is expensive; prefer v * v when exponent is 2.');
  if (sqrt > 0) notes.push('sqrt() is expensive; compare squared distances when possible.');
  if (atan2 > 0) notes.push('atan2() is very expensive on ESP32.');
  if (division > 4) notes.push('Several divisions inside the pixel loop.');
  if (notes.length === 0) notes.push('Pixel loop looks reasonable for ESP32.');

  return {
    level,
    score,
    perPixel: { trig, pow, sqrt, atan2, division },
    perFrame: {
      trig: trig * PIXELS_PER_FRAME,
      pow: pow * PIXELS_PER_FRAME,
      sqrt: sqrt * PIXELS_PER_FRAME,
      atan2: atan2 * PIXELS_PER_FRAME,
      division: division * PIXELS_PER_FRAME,
    },
    notes,
  };
}
