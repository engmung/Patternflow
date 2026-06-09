(function () {

  // ── Effects ───────────────────────────────────────────────────────
  const EFFECTS = {
    none:       { label: '— none —',      desc: '',                                           expr: () => null },
    hue:        { label: 'hue',           desc: 'Shifts the colour wheel',                    expr: i => `knobs[${i}] * 360` },
    speed:      { label: 'speed',         desc: 'Animation playback rate',                    expr: i => `Math.max(0.05, knobs[${i}] * 4)` },
    spread:     { label: 'wave spread',   desc: 'How far the wave fans across pixels',         expr: i => `0.5 + knobs[${i}] * 0.75` },
    pulse:      { label: 'pulse depth',   desc: 'Brightness oscillation intensity',            expr: i => `0.4 + knobs[${i}] * 1.8` },
    scale:      { label: 'scale',         desc: 'Pixel cell size',                             expr: i => `0.5 + knobs[${i}] * 2.5` },
    waveFreq:   { label: 'wave freq',     desc: 'Frequency of brightness wave',                expr: i => `0.5 + knobs[${i}] * 6` },
    waveAmp:    { label: 'wave amp',      desc: 'How deep the wave dips',                      expr: i => `knobs[${i}]` },
    blockSize:  { label: 'pattern block', desc: 'Quantises pixels into chunky blocks',         expr: i => `Math.max(1, Math.round(knobs[${i}] * 8))` },
    pixelShiftX: { label: 'pixel shift x', desc: 'Offsets alternating rows horizontally',      expr: i => `Math.round(knobs[${i}] * 16)` },
    pixelShiftY: { label: 'pixel shift y', desc: 'Offsets alternating columns vertically',    expr: i => `Math.round(knobs[${i}] * 16)` },
    scroll:     { label: 'scroll',        desc: 'Manual horizontal scroll offset',             expr: i => `knobs[${i}] * 20` },
  };

  // default knob assignments
  const assignments = ['hue', 'speed', 'scale', 'pulse'];

  // ── Inject Patternflow button ─────────────────────────────────────
  function injectButton() {
    const fmtRow = document.querySelector('.fmt-row');
    if (!fmtRow || document.getElementById('fmt-pf')) return;
    const btn = document.createElement('button');
    btn.className = 'fmt-btn';
    btn.id = 'fmt-pf';
    btn.textContent = 'Patternflow JS';
    btn.addEventListener('click', activatePatternflow);
    fmtRow.appendChild(btn);
  }

  // ── Activate ──────────────────────────────────────────────────────
  function activatePatternflow() {
    document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('fmt-pf').classList.add('active');
    document.getElementById('export-panel').style.display = '';
    // hide the normal textarea + bottom row
    document.getElementById('code-out').style.display = 'none';
    const origBottom = document.querySelector('#export-panel > .bottom-row');
    if (origBottom) origBottom.style.display = 'none';
    ensurePanel();
    document.getElementById('pf-panel').style.display = '';
    renderKnobRows();
    renderCode();
  }

  // ── Build panel (once) ────────────────────────────────────────────
  function ensurePanel() {
    if (document.getElementById('pf-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
      #pf-panel { display:flex; flex-direction:column; gap:14px; flex:1; min-height:0; }
      .pf-lbl { font-family:var(--mono); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); display:block; }
      .pf-knob-row { display:grid; grid-template-columns:60px 1fr 140px; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--faint); }
      .pf-knob-row:last-child { border-bottom:none; }
      .pf-knob-name { font-family:var(--mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
      .pf-knob-desc { font-family:var(--mono); font-size:10px; color:var(--muted); letter-spacing:.03em; }
      .pf-knob-row select { font-family:var(--mono); font-size:10px; letter-spacing:.04em; border:1px solid var(--faint); background:var(--bg); color:var(--fg); padding:4px 6px; width:100%; border-radius:0; outline:none; cursor:pointer; }
      .pf-knob-row select:focus { border-color:var(--fg); }
      #pf-code-out { flex:1; min-height:0; font-size:11px; font-family:var(--mono); line-height:1.65; background:var(--fainter); border:1px solid var(--faint); padding:14px 16px; resize:none; color:var(--fg); outline:none; transition:border-color .15s; border-radius:0; width:100%; }
      #pf-code-out:focus { border-color:var(--fg); }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'pf-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <span class="pf-lbl">knob assignments</span>
      <div id="pf-knob-rows"></div>
      <span class="pf-lbl">generated code</span>
      <textarea id="pf-code-out" spellcheck="false"></textarea>
      <div class="bottom-row">
        <button class="copy-btn" id="pf-copy-btn">Copy code</button>
        <span class="info-chip" id="pf-info"></span>
      </div>
    `;
    document.getElementById('export-panel').appendChild(panel);
    document.getElementById('pf-copy-btn').addEventListener('click', () => {
      const ta = document.getElementById('pf-code-out');
      navigator.clipboard.writeText(ta.value).then(() => {
        const btn = document.getElementById('pf-copy-btn');
        btn.textContent = 'Copied ✓';
        btn.classList.add('ok');
        setTimeout(() => { btn.textContent = 'Copy code'; btn.classList.remove('ok'); }, 1500);
      });
    });
  }

  // ── Knob rows ─────────────────────────────────────────────────────
  function renderKnobRows() {
    const container = document.getElementById('pf-knob-rows');
    container.innerHTML = '';
    ['knob 1','knob 2','knob 3','knob 4'].forEach((name, i) => {
      const row = document.createElement('div');
      row.className = 'pf-knob-row';

      const lbl = document.createElement('span');
      lbl.className = 'pf-knob-name';
      lbl.textContent = name;

      const sel = document.createElement('select');
      sel.style.width = '100%';
      Object.keys(EFFECTS).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = EFFECTS[key].label;
        if (key === assignments[i]) opt.selected = true;
        sel.appendChild(opt);
      });

      const desc = document.createElement('span');
      desc.className = 'pf-knob-desc';
      desc.textContent = EFFECTS[assignments[i]].desc;

      sel.addEventListener('change', e => {
        assignments[i] = e.target.value;
        desc.textContent = EFFECTS[e.target.value].desc;
        renderCode();
      });

      row.appendChild(lbl);
      row.appendChild(sel);
      row.appendChild(desc);
      container.appendChild(row);
    });
  }

  // ── Code generation ───────────────────────────────────────────────
  function renderCode() {
    const ta = document.getElementById('pf-code-out');
    if (!ta) return;

    // Read directly from main.js's pixelData global
    const pd = window.pixelData;
    if (!pd) {
      ta.value = '// Generate an image first, then come back to Patternflow.';
      return;
    }

    const { PW, PH, indexed, palette } = pd;

    // Build hex palette
    const hexPal = palette.map(c => '#' + c.map(v => v.toString(16).padStart(2,'0')).join(''));

    // Build led rows (same format as JS matrix tab)
    const rows = [];
    for (let y = 0; y < PH; y++) {
      const row = [];
      for (let x = 0; x < PW; x++) row.push(indexed[y * PW + x]);
      rows.push('[' + row.join(', ') + ']');
    }

    // Deduplicate knob assignments — last knob per param wins
    const lastOf = {};
    assignments.forEach((key, i) => { if (key !== 'none') lastOf[key] = i; });

    const L = [];

    // ── setup
    L.push(`export function setup(params) {`);
    L.push(`  params.time = 0;`);
    L.push(`}`);
    L.push(``);

    // ── update — speed always first so params.time works
    L.push(`export function update(dt, input, params) {`);
    L.push(`  const knobs = input.knobValues || [0, 0, 0, 0];`);
    L.push(``);
    if (lastOf.speed !== undefined) {
      L.push(`  params.speed = ${EFFECTS.speed.expr(lastOf.speed)};`);
    } else {
      L.push(`  params.speed = 2;`);
    }
    Object.entries(lastOf).forEach(([key, i]) => {
      if (key === 'speed') return;
      L.push(`  params.${key} = ${EFFECTS[key].expr(i)};`);
    });
    L.push(``);
    L.push(`  params.time += dt * params.speed;`);
    L.push(`}`);
    L.push(``);

    // ── draw — starts with pal + led, then the render engine
    L.push(`export function draw(display, params) {`);
    L.push(`  // palette — 0 = off, 1 = first color`);
    L.push(`  const pal = ${JSON.stringify(hexPal)};`);
    L.push(``);
    L.push(`  const led = [`);
    rows.forEach(r => L.push(`    ${r},`));
    L.push(`  ];`);
    L.push(``);
    L.push(`  const BMP_H = led.length;`);
    L.push(`  const BMP_W = led[0].length;`);
    L.push(``);
    L.push(`  const {`);
    L.push(`    time,`);
    L.push(`    hue = 0, spread = 0.875, pulse = 1.48, scale = 1,`);
    L.push(`    waveFreq = 2, waveAmp = 0.5, blockSize = 1, pixelShiftX = 0, pixelShiftY = 0`);
    L.push(`  } = params;`);
    L.push(``);
    L.push(`  const cellW = scale, cellH = scale;`);
    L.push(`  const spriteW = BMP_H * cellW;`);
    L.push(`  const spriteH = BMP_W * cellH;`);
    L.push(`  const tilesX = Math.ceil(display.width  / spriteW) + 1;`);
    L.push(`  const tilesY = Math.ceil(display.height / spriteH) + 1;`);
    L.push(`  const scroll = params.scroll || 0;`);
  L.push(`  const scrollX = ((time * 8 + scroll) % spriteW) - spriteW;`);
    L.push(``);
    L.push(`  for (let y = 0; y < display.height; y++)`);
    L.push(`    for (let x = 0; x < display.width; x++)`);
    L.push(`      display.setPixel(x, y, 0, 0, 0);`);
    L.push(``);
    L.push(`  for (let ty = 0; ty < tilesY; ty++) {`);
    L.push(`    for (let tx = 0; tx < tilesX; tx++) {`);
    L.push(`      const ox = scrollX + tx * spriteW;`);
    L.push(`      const oy = ty * spriteH;`);
    L.push(`      if (ox >= display.width  || oy >= display.height) continue;`);
    L.push(`      if (ox + spriteW <= 0   || oy + spriteH <= 0)    continue;`);
    L.push(``);
    L.push(`      for (let sy = 0; sy < BMP_W; sy++) {`);
    L.push(`        for (let sx = 0; sx < BMP_H; sx++) {`);
    L.push(`          const cell = led[BMP_H - 1 - sx][sy];`);
    L.push(`          if (cell === 0) continue;`);
    L.push(``);
    L.push(`          // parse palette color`);
    L.push(`          const hex = pal[(cell - 1) % pal.length];`);
    L.push(`          let pr = parseInt(hex.slice(1,3),16);`);
    L.push(`          let pg = parseInt(hex.slice(3,5),16);`);
    L.push(`          let pb = parseInt(hex.slice(5,7),16);`);
    L.push(``);
    L.push(`          // hue shift: RGB → HSL → shift H → RGB`);
    L.push(`          if (hue !== 0) {`);
    L.push(`            const r1 = pr/255, g1 = pg/255, b1 = pb/255;`);
    L.push(`            const max = Math.max(r1,g1,b1), min = Math.min(r1,g1,b1), d = max-min;`);
    L.push(`            let h2 = 0, s = 0;`);
    L.push(`            const l = (max+min)/2;`);
    L.push(`            if (d > 0) {`);
    L.push(`              s = d / (1 - Math.abs(2*l-1));`);
    L.push(`              if (max===r1) h2 = ((g1-b1)/d+6)%6;`);
    L.push(`              else if (max===g1) h2 = (b1-r1)/d+2;`);
    L.push(`              else h2 = (r1-g1)/d+4;`);
    L.push(`              h2 /= 6;`);
    L.push(`            }`);
    L.push(`            h2 = (h2 + hue/360) % 1;`);
    L.push(`            if (h2 < 0) h2 += 1;`);
    L.push(`            const c2 = (1-Math.abs(2*l-1))*s;`);
    L.push(`            const x2 = c2*(1-Math.abs((h2*6)%2-1));`);
    L.push(`            const m2 = l-c2/2;`);
    L.push(`            const hi = Math.floor(h2*6);`);
    L.push(`            const rgb2 = [[c2,x2,0],[x2,c2,0],[0,c2,x2],[0,x2,c2],[x2,0,c2],[c2,0,x2]][hi]||[0,0,0];`);
    L.push(`            pr = Math.round((rgb2[0]+m2)*255);`);
    L.push(`            pg = Math.round((rgb2[1]+m2)*255);`);
    L.push(`            pb = Math.round((rgb2[2]+m2)*255);`);
    L.push(`          }`);
    L.push(``);
    L.push(`          const h      = sx * 0.045 * spread + sy * 0.035 + time;`);
    L.push(`          const wave   = Math.sin(h * waveFreq + time * 1.5) * waveAmp + (1 - waveAmp * 0.5);`);
    L.push(`          const bright = 0.35 + wave * 0.65 * pulse;`);
    L.push(``);
    L.push(`          const r = pr * bright;`);
    L.push(`          const g = pg * bright;`);
    L.push(`          const b = pb * bright;`);
    L.push(``);
    L.push(`          let px0 = Math.max(0, Math.floor(ox + sx * cellW));`);
    L.push(`          let py0 = Math.max(0, Math.floor(oy + sy * cellH));`);
    L.push(`          const px1 = Math.min(display.width,  Math.ceil(ox + (sx + 1) * cellW));`);
    L.push(`          const py1 = Math.min(display.height, Math.ceil(oy + (sy + 1) * cellH));`);
    L.push(``);
    L.push(`          if (blockSize > 1) {`);
    L.push(`            px0 = Math.floor(px0 / blockSize) * blockSize;`);
    L.push(`            py0 = Math.floor(py0 / blockSize) * blockSize;`);
    L.push(`          }`);
    L.push(``);
    L.push(`          for (let py = py0; py < py1; py++) {`);
    L.push(`            const shiftX = pixelShiftX > 0 ? (py % 2 === 0 ? pixelShiftX : -pixelShiftX) : 0;`);
    L.push(`            for (let px = px0; px < px1; px++) {`);
    L.push(`              const shiftY = pixelShiftY > 0 ? (px % 2 === 0 ? pixelShiftY : -pixelShiftY) : 0;`);
    L.push(`              const spx = (px + shiftX + display.width) % display.width;`);
    L.push(`              const spy = (py + shiftY + display.height) % display.height;`);
    L.push(`              display.setPixel(spx, spy, r, g, b);`);
    L.push(`            }`);
    L.push(`          }`);
    L.push(`        }`);
    L.push(`      }`);
    L.push(`    }`);
    L.push(`  }`);
    L.push(`}`);

    ta.value = L.join('\n');

    const info = document.getElementById('pf-info');
    if (info) info.textContent = `${PW}×${PH} · ${palette.length} colors · ${L.length} lines`;
  }

  // ── Hook into setFmt to hide our panel ───────────────────────────
  const _origSetFmt = window.setFmt;
  window.setFmt = function (fmt) {
    const pfPanel = document.getElementById('pf-panel');
    if (pfPanel) pfPanel.style.display = 'none';
    document.getElementById('code-out').style.display = '';
    const origBottom = document.querySelector('#export-panel > .bottom-row');
    if (origBottom) origBottom.style.display = '';
    if (_origSetFmt) _origSetFmt(fmt);
    // deactivate patternflow button
    const pfBtn = document.getElementById('fmt-pf');
    if (pfBtn) pfBtn.classList.remove('active');
  };

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    injectButton();
    new MutationObserver(() => {
      if (!document.getElementById('fmt-pf')) injectButton();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  document.addEventListener('DOMContentLoaded', init);

})();
