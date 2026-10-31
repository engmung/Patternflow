// The five cases the Build panel lets a reader switch between: the official
// printed case, the three community remixes in hardware/case/remixes/, and
// Patternflood, a build of its own documented in its own repository.
//
// Every claim here is copied from a file in the repo, not written fresh — the
// official case from hardware/case/README.md and BUILD_GUIDE.md §1, §4 and §6,
// each remix from the six header fields and the prose of its own README. A
// remix's guide is its README, not this card: the card says what the case is
// and leads with a link to it. When a README changes, change the card with it;
// build-cases-data.test.ts checks that every GitHub link here still points at
// a path that exists, and that every photo is in public/.
//
// A new remix is one more entry: copy its photos (resized, ~1200 px) into
// public/cases/<folder name>/, and use the folder name as the id so
// /build?case=<id> reads like the path it links to.

const REPO = 'https://github.com/engmung/Patternflow';

/** A file on main: a README, a 3MF, a PDF. */
export const blob = (path: string) => `${REPO}/blob/main/${path}`;
/** A folder on main. */
export const tree = (path: string) => `${REPO}/tree/main/${path}`;

export type CaseId =
  | 'official'
  | 'besoiobiy-printed'
  | 'simonepda-lasercut'
  | 'mbchars-horizontal-desktop-printed'
  | 'jof-patternflood';

export interface CasePhoto {
  src: string;
  alt: string;
  /** Pixel size of the file in public/, so the strip can size each photo to its own ratio. */
  width: number;
  height: number;
}

export interface CaseLink {
  /** What the reader gets, on the left of the row. */
  label: string;
  /** Where it goes, short, on the right: a file name, a folder, a site. */
  target: string;
  href: string;
}

/** One of the cost-and-time facts over the case switch. */
export interface BuildFact {
  value: string;
  name: string;
  detail: string;
}

/** One of the Build panel's four steps. */
export interface BuildStep {
  id: number;
  title: string;
  desc: string;
}

/**
 * How a build that is not made the Patternflow way goes, for the parts of the
 * Build panel that otherwise follow the main path (BuildPanel.tsx): its own
 * facts, its four steps (step 01 is still the case's `step`), and its own
 * guide and links under Start here. The preview acts its steps out
 * (buildPose.ts): a boardless build has no soldering, so step 02 is the box
 * going together.
 */
export interface BuildFlow {
  /** The line under the panel's title, in place of content/build.md's cost and time. */
  subtitle: string;
  facts: BuildFact[];
  steps: BuildStep[];
  guide: { href: string; title: string; desc: string };
  links: CaseLink[];
}

export interface BuildCase {
  id: CaseId;
  /** The two lines on the switch: who, then how. */
  tab: string;
  method: string;
  /** 'variant': a build of its own, documented in its own repository, not in hardware/case/remixes/. */
  kind: 'official' | 'remix' | 'variant';
  name: string;
  summary: string;
  author: { name: string; note?: string; href?: string };
  material: string;
  fits: string;
  make: string;
  /** What it needs beyond the BOM. */
  parts: string;
  verified: string;
  license: string;
  /** What to check on your own panel before printing or cutting, and the
      README section that says how. */
  caution: string;
  cautionHref: string;
  /** How this case relates to the written build guide. */
  guide: string;
  /** A remix's README on GitHub. It is the guide to building that case, so
      the card leads with it, ahead of the facts. */
  readme?: string;
  /** What the preview's 3D model of a remix is made from, in a line: the
      models are drawn from the remix's files by tools/case-models, and a
      reader comparing them with the photos should know how closely. */
  modelNote?: string;
  /** The first two show on the card; all of them open in the viewer. */
  photos: CasePhoto[];
  credit: string;
  /** The first one is also this case's row under Start here: MakerWorld for
      the official case, the folder (its README) for a remix. */
  links: CaseLink[];
  /** Step 01 of the four steps, in this case's words. */
  step: { title: string; desc: string };
  /** A build of its own, not the v3 board's: what replaces the main path's facts, steps and guide. */
  flow?: BuildFlow;
}

const OFFICIAL = 'hardware/case';
const BESOIOBIY = 'hardware/case/remixes/besoiobiy-printed';
const SIMONE = 'hardware/case/remixes/simonepda-lasercut';
const MBCHARS = 'hardware/case/remixes/mbchars-horizontal-desktop-printed';
/** Patternflood's own repository: its build guide, cut files, model and software. */
const PATTERNFLOOD = 'https://github.com/jof/patternflood';

export const BUILD_CASES: BuildCase[] = [
  {
    id: 'official',
    tab: 'Official',
    method: 'Printed',
    kind: 'official',
    name: 'The official printed case',
    summary:
      'The case the build guide walks through and the 3D model on this page shows: a frame for the panel and a bay for the board and the power bank, with a snap-fit back panel and two wall-mount holes. On a 256 mm bed it prints in halves you glue right after printing; on a 330 mm bed it is one piece.',
    author: { name: 'Patternflow', note: 'the project’s own design' },
    material: 'White PLA for the body, black PLA for the knobs, as a separate print.',
    fits: 'v3.9 and v3.0 boards, and the panel linked in the BOM. For another panel there is an adjustable version, in for_other_panels/.',
    make: 'About 10 hours on a 256 mm bed (Bambu P1S, X1C or A1 class), then the knobs. One piece, no gluing, on a ~330 mm bed.',
    parts: '6–12 M4 screws, about 10 mm, for the panel; CA glue for the halves.',
    verified: 'Print and assembly verified: the assembly video is built from these files.',
    license: 'CC BY-SA 4.0',
    caution:
      'The adjustable version in for_other_panels/ is not universal: if your panel’s holes sit far from the BOM panel’s, it may still not fit. Check its mounting part against your panel before the full print.',
    cautionHref: `${blob(`${OFFICIAL}/README.md`)}#for_other_panels--using-a-different-led-panel`,
    guide:
      'The build guide covers it end to end: printing in section 4, assembly in section 6.',
    photos: [
      {
        src: '/cases/official/printing.jpg',
        alt: 'The case printing on a Bambu P1S: the white frame halves standing on the bed',
        width: 787,
        height: 1400,
      },
      {
        src: '/cases/official/printed_parts.jpg',
        alt: 'Everything from the 256 mm print laid out before gluing: the two frame halves, the back-panel halves and the covers, all in white',
        width: 1400,
        height: 788,
      },
      {
        src: '/cases/official/close_back.jpg',
        alt: 'The back panel sliding shut over the v3 board inside the white case',
        width: 1400,
        height: 788,
      },
    ],
    credit: 'Photos from the build guide.',
    links: [
      {
        label: 'One-click print profiles',
        target: 'MakerWorld',
        href: 'https://makerworld.com/en/models/3072492-patternflow-open-source-led-synthesizer-case#profileId-3459015',
      },
      { label: 'Every file, by bed size', target: 'hardware/case/', href: tree(OFFICIAL) },
      {
        label: 'Bambu Studio project, four plates',
        target: 'patternflow_v3.3mf',
        href: blob(`${OFFICIAL}/bed_256mm/patternflow_v3.3mf`),
      },
      {
        label: 'For a panel other than the BOM’s',
        target: 'for_other_panels/',
        href: tree(`${OFFICIAL}/bed_256mm/for_other_panels`),
      },
    ],
    step: {
      title: 'Print the case',
      desc: 'Print the body in white PLA and the knobs in black. About 10 hours of printer time.',
    },
  },
  {
    id: 'besoiobiy-printed',
    tab: 'Besoiobiy',
    method: 'Printed remix',
    kind: 'remix',
    name: 'Besoiobiy’s printed case',
    summary:
      'Two long pieces glued side by side: a frame around the panel, and a box for the board and the power bank with PATTERNFLOW lettered down its side. Four covers close the back with countersunk screws, and twelve M3 bolts go through the frame’s covers and tabs into the panel’s own sockets, clamping the three together.',
    author: {
      name: 'Besoiobiy',
      note: 'on the Patternflow Discord',
      href: 'https://discord.gg/Vr9QtsxeTk',
    },
    material:
      'PLA, set up for a Bambu Lab P1S with a 0.4 mm nozzle. White case, black knob caps.',
    fits: 'v3.9 and v3.0 boards, and a 320 × 160 mm panel with M3 sockets on Besoiobiy’s hole pattern, ending 14.35 mm behind the LED face.',
    make: 'Eight parts and four knob caps, each fitting a 256 mm bed on its own. Glue the halves, then set the brass inserts. The print settings are in the 3MF.',
    parts: '8 M3 heat-set inserts (M3 × 8 × 5), 8 M3 × 10 and 12 M3 × 25 countersunk screws, glue.',
    verified: 'Built by its author, and working for a week when they shared it (2026-10-08).',
    license: 'CC BY-SA 4.0',
    caution:
      'As drawn, this case takes an M3 panel on Besoiobiy’s hole pattern, whose sockets end 14.35 mm behind the LED face. An M3 × 25 bolt reaches about 8.5 mm into each socket: check yours are that deep and closed at the bottom, or use a shorter bolt. The panel linked in the BOM takes M4 screws on a different pattern, so for that one the frame’s tabs and covers have to be redrawn from the Blender source.',
    cautionHref: `${blob(`${BESOIOBIY}/README.md`)}#check-your-panel-first`,
    guide:
      'It replaces sections 4 and 6 of the build guide, and changes the order of 7 to 9: the panel is wired before its covers go on.',
    readme: blob(`${BESOIOBIY}/README.md`),
    modelNote: 'The 3D view puts it together from its STL files.',
    photos: [
      {
        src: '/cases/besoiobiy-printed/built.jpg',
        alt: 'Besoiobiy’s build held upright: the lit LED panel on the left, the white box on the right with four black knobs at the top and PATTERNFLOW lettered down its side',
        width: 1050,
        height: 1400,
      },
      {
        src: '/cases/besoiobiy-printed/exploded_front.jpg',
        alt: 'Render of the case pulled apart: the two box halves with their lettering and the knob caps on the left, the two frame halves with the panel tabs on the right, the four covers behind',
        width: 1400,
        height: 900,
      },
      {
        src: '/cases/besoiobiy-printed/exploded_back.jpg',
        alt: 'Render of the case pulled apart, seen from behind: the two frame covers close the whole back of the panel, the two box covers close the box',
        width: 1400,
        height: 900,
      },
      {
        src: '/cases/besoiobiy-printed/parts.jpg',
        alt: 'The thirteen STL files rendered as they lie for printing: two box halves, two frame halves, four covers, the knob cap, and the four box-half variants',
        width: 1400,
        height: 1096,
      },
    ],
    credit: 'Photo by Besoiobiy; renders from the STL files.',
    links: [
      { label: 'README and every file', target: 'besoiobiy-printed/', href: tree(BESOIOBIY) },
      {
        label: 'Print layout, Bambu Studio',
        target: 'print_layout.3mf',
        href: blob(`${BESOIOBIY}/print_layout.3mf`),
      },
      { label: 'One STL per part', target: 'stl/', href: tree(`${BESOIOBIY}/stl`) },
      {
        label: 'Blender source',
        target: 'patternbox.blend',
        href: blob(`${BESOIOBIY}/source/patternbox.blend`),
      },
    ],
    step: {
      title: 'Print the case',
      desc: 'Print eight parts and four knob caps, glue the halves, then set the brass inserts.',
    },
  },
  {
    id: 'simonepda-lasercut',
    tab: 'SimonePDA',
    method: 'Laser-cut remix',
    kind: 'remix',
    name: 'Simone Majocchi’s laser-cut case',
    summary:
      'The body is cut from sheet: one flat plate carries everything. The panel screws on from behind into its own inserts, four strips guard the LEDs at its edge, and the board sits beside it under a small finger-jointed box, its four encoder shafts coming through to the front. Three open cubes are feet for laying it flat.',
    author: {
      name: 'Simone Majocchi',
      note: 'SimonePDA',
      href: 'https://github.com/SimonePDA',
    },
    material: '3 mm acrylic (about 2.75 mm with the film off) or 2.8 mm MDF, laser cut.',
    fits: 'v3.9 and v3.0 boards (built on v3.0; v3.9 has the same outline), and a 320 × 160 mm panel.',
    make: 'Three pages of the drawing to cut: the plate (page 3), 256 × 340 mm, which has to fit your cutter’s bed whole; the four border strips (page 1); and the box and the three feet (page 5). The knobs are not in the drawing: print the official ones, or fit any that suit your shafts.',
    parts: 'Panel screws of 10 or 12 mm at most, M4 or M3 to suit your panel; tape or glue for the box.',
    verified: 'Cut three times by its author, in acrylic and in MDF (2026-10-05).',
    license: 'CC BY-SA 4.0, except page 6 of the PDF, a panel maker’s drawing',
    caution:
      'Its holes have to sit where the drawing has them: compare it with page 2 before cutting. Keep the panel screws to 10 or 12 mm: a longer one can pass through the panel’s inserts into its circuit board.',
    cautionHref: `${blob(`${SIMONE}/README.md`)}#notes-do-not-skip`,
    guide:
      'It replaces sections 4 and 6 of the build guide. The soldering, the wiring and the firmware are the same.',
    readme: blob(`${SIMONE}/README.md`),
    modelNote: 'The 3D view is a plain model of its parts, built to the drawing’s sizes.',
    photos: [
      {
        src: '/cases/simonepda-lasercut/acrylic_front.jpg',
        alt: 'The laser-cut case in clear acrylic, upright: the LED panel on the left, the board and its four knobs to the right',
        width: 925,
        height: 1200,
      },
      {
        src: '/cases/simonepda-lasercut/mdf_front.jpg',
        alt: 'The same case cut in MDF and turned on its side: the LED panel above, four knobs below it on the right',
        width: 1200,
        height: 905,
      },
      {
        src: '/cases/simonepda-lasercut/mdf_back.jpg',
        alt: 'The MDF case from behind: screws through the sheet into the panel, four windows over the panel’s connectors, the board under an acrylic box',
        width: 1200,
        height: 929,
      },
      {
        src: '/cases/simonepda-lasercut/board_in_box.jpg',
        alt: 'The v3.0 board under its finger-jointed acrylic box, wired at the two screw terminals',
        width: 1200,
        height: 537,
      },
    ],
    credit: 'Photos by Simone Majocchi.',
    links: [
      { label: 'README and every file', target: 'simonepda-lasercut/', href: tree(SIMONE) },
      {
        label: 'The drawing, six A3 pages at 1:1',
        target: 'lasercut_layout.pdf',
        href: blob(`${SIMONE}/lasercut_layout.pdf`),
      },
      {
        label: 'CorelDRAW source, with its guides',
        target: 'lasercut_layout.cdr',
        href: blob(`${SIMONE}/lasercut_layout.cdr`),
      },
      { label: 'Knobs to print', target: 'knobs/', href: tree(`${OFFICIAL}/knobs`) },
    ],
    step: {
      title: 'Cut the case',
      desc: 'Laser-cut the plate, the border strips, the box and the feet, and print the knobs.',
    },
  },
  {
    id: 'mbchars-horizontal-desktop-printed',
    tab: 'mbchars',
    method: 'Printed remix',
    kind: 'remix',
    name: 'Mykyta Bilous’s horizontal desktop case',
    summary:
      'The panel the long way across, on two removable stands, with the four controls on the right. Three front sections print face down, two white frames and an orange control section, and four joint bars on brass inserts hold them together without glue. Two rear covers open onto the electronics and have screw openings for hanging it on a wall. The power-bank compartment is gone: the control section holds a separate trigger module that feeds J4, the screw terminal, at 5 V.',
    author: {
      name: 'Mykyta Bilous',
      note: 'mbchars',
      href: 'https://github.com/mbchars',
    },
    material:
      'PLA, set up for a Bambu Lab P2S with a 0.4 mm nozzle, 0.20 mm layers and a textured plate. White frames, covers, joint bars and knobs; orange control section, stands and module retainer. The colours are optional.',
    fits: 'v3.9 and v3.0 boards (built on v3.0; v3.9 has the same outline), and a 320 × 160 mm panel with the hole pattern it was tested on.',
    make: 'Nine plates in one Bambu Studio project, one colour each: about 24 hours and 714 g of PLA. The front sections and the module retainer print with the supports set up in the 3MF; the rest need none.',
    parts:
      '25 M3 heat-set inserts (5 mm across, 5 mm long) and 25 M3 × 8 countersunk screws; a PDSink 303PDSink01 trigger module set to 5 V, two wires from it to J4, and a supply it takes, in place of the power bank. No glue.',
    verified: 'Built by its author, and photographed (2026-10-07).',
    license: 'CC BY-SA 4.0',
    caution:
      'Check that your panel’s hole pattern agrees with the frame before you print: a panel’s size alone does not say it fits. Set the trigger module to 5 V and measure its output before you connect it to J4: a higher voltage can damage the board and the panel.',
    cautionHref: `${blob(`${MBCHARS}/README.md`)}#parts-and-assembly`,
    guide:
      'Its own illustrated assembly instructions (assembly.md) and BOM changes (bom.md) take the place of the build guide’s printing, case assembly and power bank. The build guide still covers the controller’s setup and operation.',
    readme: blob(`${MBCHARS}/README.md`),
    modelNote: 'The 3D view puts it together from its STL files.',
    photos: [
      {
        src: '/cases/mbchars-horizontal-desktop-printed/front.jpg',
        alt: 'The case on its two orange stands: the lit LED panel the long way across in a white frame, and the orange control section on the right with four white knobs near the top',
        width: 1200,
        height: 1200,
      },
      {
        src: '/cases/mbchars-horizontal-desktop-printed/angle.jpg',
        alt: 'The case at an angle: blue and orange waves on the panel, the white frame in two sections, and the orange control section with its power cable leaving low on its side',
        width: 1200,
        height: 1200,
      },
      {
        src: '/cases/mbchars-horizontal-desktop-printed/rear_assembly.jpg',
        alt: 'The case open from behind, covers off: the board in the orange control section, the trigger module below it wired to J4, the ribbon cable across to the panel, and brass inserts at the corners',
        width: 900,
        height: 1200,
      },
    ],
    credit: 'Photos by Mykyta Bilous.',
    links: [
      { label: 'README and every file', target: 'mbchars-horizontal-desktop-printed/', href: tree(MBCHARS) },
      {
        label: 'Bambu Studio project, nine plates',
        target: 'print_layout.3mf',
        href: blob(`${MBCHARS}/print_layout.3mf`),
      },
      { label: 'Illustrated assembly', target: 'assembly.md', href: blob(`${MBCHARS}/assembly.md`) },
      { label: 'What changes in the BOM', target: 'bom.md', href: blob(`${MBCHARS}/bom.md`) },
      { label: 'One STL per part', target: 'stl/', href: tree(`${MBCHARS}/stl`) },
    ],
    step: {
      title: 'Print the case',
      desc: 'Print the nine plates of the 3MF, about 24 hours, set the brass inserts, and join the three front sections with the joint bars.',
    },
  },
  {
    id: 'jof-patternflood',
    tab: 'jof',
    method: 'Laser-cut variant',
    kind: 'variant',
    name: 'Patternflood, jof’s birch box',
    summary:
      'A different instrument round the same idea: a 256 mm square of 128 × 128 pixels, four P2 panels in a 2 × 2, in a finger-jointed birch box 293 × 373 × 61 mm, etched front, back and sides with generated circuit-board art. The four knobs sit under the display on the left, each in a ring of light, with four push buttons along the top. A Raspberry Pi 5 renders and a Colorlight card drives the panels; it runs every Patternflow pattern, and the community’s.',
    author: {
      name: 'Jonathan Lassoff',
      note: 'jof',
      href: 'https://thejof.com/',
    },
    material: '3 mm Baltic birch ply, laser cut; the front and every wall two sheets, glued.',
    fits: 'No Patternflow board: a Raspberry Pi 5 and a Colorlight 5A-75B card, driving four 128 × 128 mm P2 panels (Waveshare RGB-Matrix-P2-64x64-B) as one square.',
    make: 'Six 12 × 24" sheets of birch on a 600 × 305 mm bed. The etched art is optional: about 4 to 4½ hours of scoring on the front, the walls and the back.',
    parts: 'Its own parts list, not the BOM: the panels, the Pi, the card, a Mean Well LRS-50-5 and a mains inlet, four Adafruit 4991 encoder boards, four buttons, and M3 screws into nuts captive in the birch.',
    verified: 'Built twice by its author; these files are Rev 2.7, finished and running on 2026-10-28.',
    license: 'CC BY-SA 4.0',
    caution:
      'The braces are cut for the Waveshare P2-64x64-B’s screw posts and locating pins, and the window for four of them butted together. Other P2 panels put those elsewhere: measure yours first. The box also has mains wiring inside it.',
    cautionHref: `${PATTERNFLOOD}/blob/main/docs/desktop/enclosure-lasercut.md#11-panel-mounting-there-is-no-standard`,
    guide:
      'It is not a case for the v3 board, so none of the build guide applies: Patternflood has its own, BUILD.md, from flashing the card to first power-up.',
    readme: `${PATTERNFLOOD}/blob/main/README.md`,
    modelNote:
      'The 3D view is built from its cut files, every sheet where it goes and etched as cut; the bought parts are drawn plainly, and the wiring is schematic.',
    photos: [
      {
        src: '/cases/jof-patternflood/front.jpg',
        alt: 'Patternflood upright on the floor: the dark 2 × 2 LED panel in the etched birch front, four black knobs below it on the left',
        width: 960,
        height: 1280,
      },
      {
        src: '/cases/jof-patternflood/inside.jpg',
        alt: 'The box from behind with its back off: the Colorlight card and the Pi 5 on a birch tray across the middle, the HUB75 ribbons above, the supply and the encoders at the bottom',
        width: 960,
        height: 1280,
      },
      {
        src: '/cases/jof-patternflood/back.jpg',
        alt: 'The back cover, etched all over with circuit traces, with a title block and two QR codes',
        width: 960,
        height: 1280,
      },
      {
        src: '/cases/jof-patternflood/top.jpg',
        alt: 'The box at an angle, showing the four push buttons along its top wall',
        width: 960,
        height: 1280,
      },
    ],
    credit: 'Photos by Jonathan Lassoff.',
    links: [
      { label: 'README and every file', target: 'jof/patternflood', href: PATTERNFLOOD },
      { label: 'Nested on six 12 × 24" sheets', target: 'sheets/', href: `${PATTERNFLOOD}/tree/main/hardware/laser/sheets` },
      { label: 'One DXF per part', target: 'hardware/laser/', href: `${PATTERNFLOOD}/tree/main/hardware/laser` },
      { label: 'Its build guide', target: 'BUILD.md', href: `${PATTERNFLOOD}/blob/main/docs/desktop/BUILD.md` },
      {
        label: 'The model, public on Onshape',
        target: 'Onshape',
        href: 'https://cad.onshape.com/documents/8cfb8d4f799392c05f62f6ad/w/b5dfed0b24d2121a79e8b1a8/e/06ba580a80083894ed24609b',
      },
      { label: 'Software and gateware', target: 'firmware/', href: `${PATTERNFLOOD}/tree/main/firmware` },
    ],
    step: {
      title: 'Cut the box',
      desc: 'Cut the box from six sheets of 3 mm birch. The etched art is optional.',
    },
    // From Patternflood's own BUILD.md: its parts list (§1), the cut (§6),
    // glue-up (§7), wiring (§8 and §9), flashing (§2 and §3) and first
    // power-up (§10).
    flow: {
      subtitle: 'A laser-cut birch box with its own electronics, on mains.',
      facts: [
        {
          value: '6 sheets',
          name: 'Birch',
          detail: '3 mm Baltic birch ply, 12 × 24", on a laser with a 600 × 305 mm bed.',
        },
        {
          value: '128 × 128',
          name: 'Pixels',
          detail: 'Four P2 panels in a 2 × 2, a 256 mm square, driven by a Colorlight 5A-75B; a Raspberry Pi 5 renders.',
        },
        {
          value: '~4½ hr',
          name: 'Etching',
          detail: 'Laser time for the optional circuit-board art on the front, walls and back, on an xTool P2. Cutting comes on top.',
        },
        {
          value: 'Mains',
          name: 'Power',
          detail: 'A Mean Well LRS-50-5 inside, on a fused IEC inlet. Have someone check the wiring if mains is new to you.',
        },
      ],
      steps: [
        { id: 1, title: 'Cut the box', desc: '' },
        {
          id: 2,
          title: 'Glue up the box',
          desc: 'Laminate the front and the walls, two sheets each, then glue the finger-jointed box together.',
        },
        {
          id: 3,
          title: 'Wire it',
          desc: 'Mains to the supply, the 5 V bus, then the panels, the card, the Pi, the knobs and the buttons.',
        },
        {
          id: 4,
          title: 'Flash and power on',
          desc: 'Flash the Colorlight card’s gateware, write the Pi’s SD card, then switch on at the inlet.',
        },
      ],
      guide: {
        href: `${PATTERNFLOOD}/blob/main/docs/desktop/BUILD.md`,
        title: 'Patternflood’s build guide →',
        desc: 'Parts, flashing, cutting, glue-up, wiring and first power-up, with photos of every stage.',
      },
      links: [
        { label: 'The cut files', target: 'hardware/laser/', href: `${PATTERNFLOOD}/tree/main/hardware/laser` },
        {
          label: 'The model',
          target: 'Onshape',
          href: 'https://cad.onshape.com/documents/8cfb8d4f799392c05f62f6ad/w/b5dfed0b24d2121a79e8b1a8/e/06ba580a80083894ed24609b',
        },
        { label: 'Software and gateware', target: 'jof/patternflood', href: PATTERNFLOOD },
        {
          label: 'Before you buy the panels',
          target: 'Panel mounting',
          href: `${PATTERNFLOOD}/blob/main/docs/desktop/enclosure-lasercut.md#11-panel-mounting-there-is-no-standard`,
        },
      ],
    },
  },
];

export const DEFAULT_CASE: CaseId = 'official';

export function findCase(id: string | null | undefined): BuildCase | undefined {
  return BUILD_CASES.find((item) => item.id === id);
}

/** The case `step` places along the switch from `id`, wrapping round at either end: the preview's arrows. */
export function stepCase(id: CaseId, step: number): CaseId {
  const count = BUILD_CASES.length;
  const at = Math.max(0, BUILD_CASES.findIndex((item) => item.id === id));
  return BUILD_CASES[(((at + step) % count) + count) % count].id;
}

// replaceState, not push: switching cases is not a page to go back to. The
// official case is the bare /build.
export function writeCaseToUrl(id: CaseId) {
  const query = id === DEFAULT_CASE ? '' : `?case=${id}`;
  const next = `/build${query}${window.location.hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (now !== next) window.history.replaceState(null, '', next);
}
