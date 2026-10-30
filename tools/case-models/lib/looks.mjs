// What every case model's materials look like, by name. The scripts that make
// a shell only name a material; its colour and finish are set here, so the
// three cases sit side by side under one light.
//
// Colours are sRGB hex, as a designer writes them; glTF wants linear factors.
//
//   pla_white     printed case parts (the official case, Besoiobiy's, and the
//                 frames, covers and knobs of mbchars')
//   pla_orange    printed case parts in orange (mbchars' control section,
//                 stands and USB retainer)
//   pla_black     printed knobs
//   sheet_face    laser-cut sheet, its two faces: the plate, the border strips
//                 and the feet of SimonePDA's case. Clear acrylic here, as the
//                 acrylic build is; the page can swap in MDF (caseModels.ts)
//   sheet_edge    the same sheet's cut edges
//   acrylic_face  laser-cut parts that are acrylic in every build (the box
//   acrylic_edge  over the board), faces and cut edges
//   birch_face    laser-cut birch ply (jof's Patternflood box), its faces and
//   birch_edge    its cut edges, which the laser burns dark
//   birch_art_*   an etched outer face: birch, its texture the etch
//   button_*      its push buttons' caps: blue, orange, red
//   metal*, pcb_*, plastic_white, iec_red, wire_*, ribbon_grey, cable_blue
//                 what is inside it: the supply, the boards, the wiring
//
// Any other name is left as the file has it (the board's, the DevKit's, the
// LED panel's).

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h, alpha = 1) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255)).concat(alpha);
};

// Clear acrylic: glossy and nearly all see-through, so what is behind it —
// the page, the board — is what shows, as the carpet does through the sheet
// in the remix's photo. Its cut edges are where a sheet shows itself: darker
// and cool green, as light run along the sheet comes out of them.
const ACRYLIC_FACE = { color: hex('#e6efed', 0.12), roughness: 0.08, blend: true };
const ACRYLIC_EDGE = { color: hex('#8fb5ad', 0.7), roughness: 0.25, blend: true };

export const LOOKS = {
  // A neutral white. White PLA photographs anywhere from cool to cream with
  // the light it is under (the build photos run from b* −6 to +11), so the
  // filament itself is drawn without a cast, and matte: a warmer white read
  // as beige once the page's light got bright.
  pla_white: { color: hex('#f4f4f2'), roughness: 0.85 },
  // The orange of mbchars' build: the filament colour in the remix's own
  // print_layout.3mf (#F46B16), matte like the white.
  pla_orange: { color: hex('#f46b16'), roughness: 0.85 },
  pla_black: { color: hex('#151515'), roughness: 0.55 },
  sheet_face: ACRYLIC_FACE,
  sheet_edge: ACRYLIC_EDGE,
  acrylic_face: ACRYLIC_FACE,
  acrylic_edge: ACRYLIC_EDGE,
  // Baltic birch, pale and matte, as in the Patternflood photos; its cut
  // edges the dark brown the laser leaves on them.
  birch_face: { color: hex('#e2cba6'), roughness: 0.9 },
  birch_edge: { color: hex('#4a3020'), roughness: 0.95 },
  // The push buttons' caps on Patternflood's top wall, glossy moulded
  // plastic, the colours of the build photo.
  button_blue: { color: hex('#1d4fb8'), roughness: 0.35 },
  button_orange: { color: hex('#f08a1c'), roughness: 0.35 },
  button_red: { color: hex('#d0241c'), roughness: 0.35 },
  // What is inside Patternflood: drawn plainly, so in plain looks.
  metal: { color: hex('#c9cdd2'), roughness: 0.35 },
  metal_alu: { color: hex('#aab1b8'), roughness: 0.45 },
  metal_psu: { color: hex('#b8bcc1'), roughness: 0.5 },
  pcb_green: { color: hex('#1f5d3b'), roughness: 0.6 },
  pcb_green_dark: { color: hex('#2e7d4a'), roughness: 0.6 },
  pcb_black: { color: hex('#17181b'), roughness: 0.6 },
  plastic_white: { color: hex('#e9e6dd'), roughness: 0.6 },
  iec_red: { color: hex('#c81e1e'), roughness: 0.35 },
  wire_red: { color: hex('#c0261d'), roughness: 0.5 },
  wire_black: { color: hex('#1b1b1b'), roughness: 0.5 },
  wire_brown: { color: hex('#6b3a1e'), roughness: 0.5 },
  wire_blue: { color: hex('#1f4fa0'), roughness: 0.5 },
  wire_earth: { color: hex('#5aa02c'), roughness: 0.5 },
  wire_yellow: { color: hex('#e8c21c'), roughness: 0.5 },
  ribbon_grey: { color: hex('#9a9c9e'), roughness: 0.7 },
  cable_blue: { color: hex('#3a6fc4'), roughness: 0.5 },
};

/** Sets the look of every material in the document whose name is in LOOKS. */
export function applyLooks(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    // A sheet's etched face (birch_art_<part>) is birch, its texture the burn.
    const name = m.getName();
    const look = LOOKS[name] ?? (name.startsWith('birch_art_') ? LOOKS.birch_face : undefined);
    if (!look) continue;
    m.setBaseColorFactor(look.color)
      .setMetallicFactor(0)
      .setRoughnessFactor(look.roughness)
      .setAlphaMode(look.blend ? 'BLEND' : 'OPAQUE')
      .setDoubleSided(Boolean(look.blend));
  }
}
