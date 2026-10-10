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
};

/** Sets the look of every material in the document whose name is in LOOKS. */
export function applyLooks(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    const look = LOOKS[m.getName()];
    if (!look) continue;
    m.setBaseColorFactor(look.color)
      .setMetallicFactor(0)
      .setRoughnessFactor(look.roughness)
      .setAlphaMode(look.blend ? 'BLEND' : 'OPAQUE')
      .setDoubleSided(Boolean(look.blend));
  }
}
