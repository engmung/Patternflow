import type { CaseModel } from '../caseModels';

// Jonathan Lassoff's Patternflood box: tools/case-models/patternflood.py, from
// the cut files in tools/case-models/source/jof-patternflood/dxf/. A birch box
// standing upright, the 2 x 2 panel at the top and the knobs below it on the
// left; inside, three braces the panels bolt to, a tray on the middle one
// with the Colorlight card and the Pi 5, the supply on the bottom wall and
// the mains inlet beside it. There is no Patternflow board in it, so it has
// no pcb_v39 or devkit.
export const JOF_MODEL: CaseModel = {
  id: 'jof-patternflood',
  url: '/cases/jof-patternflood/model.glb',
  boardless: true,
  // Four 64 x 64 panels in a 2 x 2: 128 x 128 LEDs, which upstream's patterns
  // fill on the device, as the page draws them here.
  ledGrid: [128, 128],
  // Its own demo, drawn for its square: Obra, a lit solid dithered into inks.
  demo: 'obra',
  gear: [
    'psu',
    'iec_inlet',
    'colorlight',
    'pi5',
    'encoders',
    'knob_lights',
    'power_bus',
    'panel_connectors',
    'wiring',
    'button_previous',
    'button_select',
    'button_next',
    'button_sleep',
  ],
  cover: ['back_cover', 'back_doubler'],
  // Each knob's NeoPixel through a paper ring and the slits round the knob.
  knobLights: ['knob_glow_k0', 'knob_glow_k1', 'knob_glow_k2', 'knob_glow_k3'],
  // Drawn apart as its sheets are cut and glued (buildPose.ts), round the
  // front, which stays: every laminate's two sheets come apart, the inner
  // one further in; the walls open outwards with their doublers inside
  // them; behind the front, the braces, the tray, the shelf and the knob
  // ribs, then the rails, and the back cover and its doubler last.
  explode: {
    c1: [0, 0, 4.2],
    c2: [0, 0, 4.2],
    c3: [0, 0, 4.2],
    c4: [0, 0, 4.2],
    bezel_inner: [0, 0, -2.5],
    l: [0, 0, -5],
    wall_left: [-7, 0, -3],
    doubler_left: [-4, 0, -3],
    wall_right: [7, 0, -3],
    doubler_right: [4, 0, -3],
    wall_top: [0, 7, -3],
    doubler_top: [0, 4, -3],
    wall_bottom: [0, -7, -3],
    doubler_bottom: [0, -4, -3],
    brace_lower: [0, 0, -5],
    brace_upper: [0, 0, -5],
    brace_middle_front: [0, 0, -5],
    brace_middle_centre: [0, 0, -6.2],
    brace_middle_rear: [0, 0, -7.4],
    tray_front: [0, 0, -9.5],
    tray_rear: [0, 0, -10.7],
    shelf: [0, -2, -5],
    knob_rib_1: [0, -2, -6.5],
    knob_rib_2: [0, -2, -6.5],
    rail_c_lower: [0, -1.5, -12.5],
    rail_b_lower: [0, -1.5, -13.7],
    rail_a_lower: [0, -1.5, -14.9],
    rail_c_upper: [0, 1.5, -12.5],
    rail_b_upper: [0, 1.5, -13.7],
    rail_a_upper: [0, 1.5, -14.9],
    back_doubler: [0, 0, -17],
    back_cover: [0, 0, -19.5],
    button_previous: [0, 5.5, -2],
    button_select: [0, 5.5, -2],
    button_next: [0, 5.5, -2],
    button_sleep: [0, 5.5, -2],
  },
};
