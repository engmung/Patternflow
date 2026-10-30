import { ledPanel, PatternDef } from './common';

const fragmentShader = `
uniform float uTime;
uniform float uSpeed;
uniform float uParam1; // Hue (0.0 ~ 1.0)
uniform float uParam2; // Unused
uniform float uParam3; // Mode (0.0 ~ 4.9)
uniform float uParam4; // Freq (0.0 ~ 1.0)

varying vec2 vUv;
${ledPanel}

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 rotatedUV = vec2(vUv.y, 1.0 - vUv.x);
  vec2 gridUV = rotatedUV * uGrid;
  vec2 px = floor(gridUV);
  
  float x = px.x;
  float y = uGrid.y - 1.0 - px.y;
  
  int mode = int(clamp(uParam3, 0.0, 4.0));
  float rows, cols, gap, tileSize, gridStep, gridCells;
  
  if (mode == 0) {
    rows = 1.0; cols = 2.0; gap = 4.0; tileSize = 56.0; gridStep = 7.0; gridCells = 8.0;
  } else if (mode == 1) {
    rows = 2.0; cols = 4.0; gap = 3.0; tileSize = 27.0; gridStep = 3.0; gridCells = 9.0;
  } else if (mode == 2) {
    rows = 3.0; cols = 6.0; gap = 2.0; tileSize = 18.0; gridStep = 3.0; gridCells = 6.0;
  } else if (mode == 3) {
    rows = 3.0; cols = 6.0; gap = 2.0; tileSize = 18.0; gridStep = 2.0; gridCells = 9.0;
  } else {
    rows = 6.0; cols = 12.0; gap = 0.0; tileSize = 10.0; gridStep = 2.0; gridCells = 5.0;
  }
  
  float totalW = cols * tileSize + (cols + 1.0) * gap;
  float totalH = rows * tileSize + (rows + 1.0) * gap;
  float offsetX = floor((uGrid.x - totalW) / 2.0);
  float offsetY = floor((uGrid.y - totalH) / 2.0);
  
  x -= offsetX;
  y -= offsetY;
  
  vec3 col = vec3(0.0);
  
  float cellW = tileSize + gap;
  float cellH = tileSize + gap;
  
  float ti = floor((x - gap) / cellW);
  float tj = floor((y - gap) / cellH);
  
  if (ti >= 0.0 && ti < cols && tj >= 0.0 && tj < rows) {
    float localX = x - (gap + ti * cellW);
    float localY = y - (gap + tj * cellH);
    
    if (localX >= 0.0 && localX < tileSize && localY >= 0.0 && localY < tileSize) {
      float gx = min(floor(localX / gridStep), gridCells - 1.0);
      float gy = min(floor(localY / gridStep), gridCells - 1.0);
      
      float cx = tileSize / 2.0;
      float sx = gx * gridStep + gridStep / 2.0;
      float sy = gy * gridStep + gridStep / 2.0;
      float dist = distance(vec2(sx, sy), vec2(cx, cx));
      
      float knobFreqBase = 50.0 + uParam4 * 950.0;
      float knobFreqVar = uParam4 * 1000.0;
      
      float tileFreq = knobFreqBase + (tj * cols + ti) * knobFreqVar * 0.15;
      float wave = sin(dist * tileFreq * 0.5 + uTime * uSpeed * 2.0);
      
      float br = 0.8;
      float t = clamp((wave * br + 1.0) * 0.5, 0.0, 1.0);
      
      vec3 hr_hg_hb = hsv2rgb(vec3(uParam1, 1.0, 1.0));
      
      col = vec3(0.0);
      if (t >= 0.154) col = vec3(10.0) / 255.0; // 기존 40.0에서 10.0으로 더 어둡게
      if (t >= 0.556) col = hr_hg_hb * 1.5; // 글로우를 위해 밝기 증폭
      if (t >= 0.816) col = vec3(2.5);      // 화이트 코어는 더 밝게 증폭
    }
  }

  gl_FragColor = vec4(ledPanel(col), 1.0);
}
`;

const patternFlowOriginal: PatternDef = {
  name: 'PatternFlow Original',
  fragmentShader,
  defaults: {
    uParam1: 0.00, // c1: Hue (0 ~ 1)
    uSpeed: 2.00,  // c2: Speed
    uParam3: 0.00, // c3: Mode (0 ~ 4)
    uParam4: 0.06, // c4: Freq (0 ~ 1), mapped to give Base ~110, Var ~60
  }
};

export default patternFlowOriginal;
