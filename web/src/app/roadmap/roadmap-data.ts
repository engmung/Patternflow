// Data for the project map. Node dates are real commit/release dates for
// shipped work; planned work is ordered by rough intention and rendered in a
// single "future" region (no fake months). `level: 1` nodes show in the
// overview; `level: 2` nodes only appear in the detailed view. `gate: true`
// marks a node as part of the v3.0.0 build release — hardware + guides, the
// things people physically build from. Software ships continuously and is
// never gated.

export type LaneId = 'pcb' | 'case' | 'guides' | 'firmware' | 'tools' | 'community';

export type RoadmapNode = {
  id: string;
  lane: LaneId;
  date: string;
  title: string;
  status: 'done' | 'planned';
  level: 1 | 2;
  gate?: boolean;
  detail: string;
  issues?: number[];
  links?: { label: string; href: string }[];
};

export type RoadmapEdge = { from: string; to: string; note: string };

export const NOW = '2026-07-26';

export const LANES: { id: LaneId; label: string }[] = [
  { id: 'pcb', label: 'PCB' },
  { id: 'case', label: 'Enclosure' },
  { id: 'guides', label: 'Guides' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'tools', label: 'Pattern tools' },
  { id: 'community', label: 'Community' },
];

const REPO = 'https://github.com/engmung/Patternflow';

export const NODES: RoadmapNode[] = [
  // PCB
  {
    id: 'pcb-proto-v0',
    lane: 'pcb',
    date: '2026-03-29',
    title: 'First hardware prototype',
    status: 'done',
    level: 2,
    detail:
      'First hand-wired prototype: LED matrix + ESP32 + 4 potentiometers assembled in the club room, bringing Patternflow out of the web browser and into physical space at Mapo Saebit Cultural Forest.',
    links: [{ label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' }],
  },
  {
    id: 'pcb-v1',
    lane: 'pcb',
    date: '2026-04-26',
    title: 'v1 board',
    status: 'done',
    level: 1,
    detail:
      'First public hardware release: gerbers, KiCad schematic, and a hand-solderable ESP32 + HUB75 board. Everything since is a refinement of this layout.',
  },
  {
    id: 'pcb-v2',
    lane: 'pcb',
    date: '2026-05-08',
    title: 'v2 fixes',
    status: 'done',
    level: 2,
    detail:
      'GPIO0 pull-up fix and encoder silkscreen corrections, driven directly by problems early community builders hit on v1 boards.',
  },
  {
    id: 'pcb-v21',
    lane: 'pcb',
    date: '2026-06-18',
    title: 'v2.1 routing',
    status: 'done',
    level: 2,
    detail:
      'Reworked ESP32-to-HUB75 routing and silkscreen cleanup. These are the currently recommended gerbers — the build guide is pinned to them.',
  },
  {
    id: 'pcb-v22',
    lane: 'pcb',
    date: '2026-06-28',
    title: 'v2.2 USB-C test',
    status: 'done',
    level: 1,
    detail:
      'Test board that moves power input to USB-C and goes fully SMD-free. Ordered on 2026-06-30 through a PCBWay gerber sponsorship. Once verified, this board gets promoted to v3. Moving the power connector also breaks the current enclosure, which was designed around v2.1 — so the case follows.',
  },
  {
    id: 'pcb-usbc-safety',
    lane: 'pcb',
    date: '2026-07-20',
    title: 'USB-C power on hold & review',
    status: 'done',
    level: 2,
    detail:
      'USB-C power input placed on hold under active re-evaluation (Issue #221): investigating delayed connector burnout (20–30 min run before pin failure). Full re-evaluation of 14-pin THT vs power-only connectors in progress; builds pinned to 2-pin screw terminal (J4).',
    issues: [221],
    links: [{ label: 'Issue #221', href: `${REPO}/issues/221` }],
  },
  {
    id: 'pcb-v3',
    lane: 'pcb',
    date: '2026-07-20',
    title: 'v3.0.0 board',
    status: 'done',
    level: 1,
    gate: true,
    detail:
      'v3.0.0 hardware release: reworked module positions, shrunk overall board size to reduce manufacturing costs, and added USB-C power footprint alongside the 2-pin screw terminal.',
    links: [
      { label: 'hardware/pcb', href: `${REPO}/tree/main/hardware/pcb` },
      { label: 'Journal (v3 and beyond)', href: 'https://patternflow.work/journal/v3-and-beyond' },
    ],
  },

  // Enclosure
  {
    id: 'case-v1',
    lane: 'case',
    date: '2026-04-26',
    title: 'Original v1 case',
    status: 'done',
    level: 1,
    detail:
      'The original enclosure, released with v1.0: a fully modeled Blender design with print-ready STLs, a parts breakdown, and print-time notes. This modeling is the ancestor every later case variant descends from.',
    links: [{ label: 'hardware/case', href: `${REPO}/tree/main/hardware/case` }],
  },
  {
    id: 'case-laser',
    lane: 'case',
    date: '2026-05-26',
    title: 'Laser-cut acrylic',
    status: 'done',
    level: 2,
    detail:
      'A laser-cut acrylic variant of the v1 case, with its own Blender source — an alternative for people with cutter access instead of a 3D printer.',
  },
  {
    id: 'case-exp',
    lane: 'case',
    date: '2026-06-04',
    title: 'Print experiments',
    status: 'done',
    level: 2,
    detail:
      'A long run of 3D-printing experiments through June, kicked off by a PCBWay 3D-printing sponsorship that funded test prints: flat plates, easybond, big-oneshot, easyfit with alignment tabs, one-shot print ribs, a wall-mount hanger — searching for a case that prints reliably without support pain.',
  },
  {
    id: 'case-snapfit',
    lane: 'case',
    date: '2026-07-05',
    title: 'Snap-fit one-piece',
    status: 'done',
    level: 1,
    detail:
      'The one-piece snap-fit enclosure graduated to a print-ready option after a confirmed stable one-shot print. It needs a ~330 mm bed, and — important — it was designed around the v2.1 board, so it predates the USB-C power input.',
    links: [{ label: 'Issue #113 (closed)', href: `${REPO}/issues/113` }],
  },
  {
    id: 'case-v3',
    lane: 'case',
    date: '2026-07-20',
    title: 'v3 snap-fit enclosure',
    status: 'done',
    level: 1,
    gate: true,
    detail:
      'v3 enclosure release: added snap-fit joints and overall tolerance improvements to elevate product quality for the Crowd Supply launch.',
    links: [{ label: 'hardware/case', href: `${REPO}/tree/main/hardware/case` }],
  },

  // Guides
  {
    id: 'guide-v1',
    lane: 'guides',
    date: '2026-04-26',
    title: 'Build guide v1',
    status: 'done',
    level: 1,
    detail:
      'The first full build guide shipped with the public launch — BOM, sourcing links, assembly steps, firmware flashing. Iterated on community feedback from day one (soldering temps, encoder shaft specs, GPIO0 workarounds).',
    links: [{ label: 'BUILD_GUIDE.md', href: `${REPO}/blob/main/BUILD_GUIDE.md` }],
  },
  {
    id: 'guide-photos',
    lane: 'guides',
    date: '2026-05-03',
    title: 'Photo rewrite',
    status: 'done',
    level: 2,
    detail:
      'The comprehensive rewrite: build photos and videos for every step, a pin reference, restructured sections. The guide went from "notes" to something a stranger can actually follow.',
  },
  {
    id: 'guide-breadboard',
    lane: 'guides',
    date: '2026-06-28',
    title: 'Breadboard guide',
    status: 'done',
    level: 2,
    detail:
      'A solder-free build path on a breadboard, lowering the entry bar for people who want to try Patternflow before committing to a PCB order.',
  },
  {
    id: 'guide-tht',
    lane: 'guides',
    date: '2026-07-05',
    title: 'Through-hole BOM',
    status: 'done',
    level: 2,
    detail:
      'The BOM went all-through-hole (SMD passives dropped) and the guide was pinned to the v2.1 gerbers, with a heads-up that v3.0 is coming.',
  },
  {
    id: 'guide-rebuild',
    lane: 'guides',
    date: '2026-07-20',
    title: 'Build guide v3.0.0',
    status: 'done',
    level: 1,
    gate: true,
    detail:
      'Build guide updated for v3.0.0 hardware and snap-fit enclosure: BOM, assembly steps, and wiring diagrams updated for the v3 release.',
    links: [{ label: 'BUILD_GUIDE.md', href: `${REPO}/blob/main/BUILD_GUIDE.md` }],
  },
  {
    id: 'guide-pattern',
    lane: 'guides',
    date: '2026-08-28',
    title: 'Pattern guide',
    status: 'planned',
    level: 1,
    gate: true,
    detail:
      'The first proper pattern-creation guide: from the web tools to code running on the device. This is the on-ramp for people who want to make patterns rather than build hardware.',
  },

  // Firmware
  {
    id: 'fw-v1',
    lane: 'firmware',
    date: '2026-04-26',
    title: 'v1.0 firmware',
    status: 'done',
    level: 1,
    detail:
      'The firmware as first open-sourced: single hardcoded patterns, hardware configs extracted to config.h, flashable from the browser via ESP Web Tools.',
  },
  {
    id: 'fw-foundation',
    lane: 'firmware',
    date: '2026-05-21',
    title: 'ESP32 optimization',
    status: 'done',
    level: 1,
    detail:
      'The big structural rewrite that made patterns fast on the ESP32: shared core_math / core_color / core_noise libraries, patterns drawing through PFCanvas instead of the raw display driver, gamma LUT, ~240 Hz refresh to kill camera flicker, encoder acceleration. Everything since builds on this.',
  },
  {
    id: 'fw-osc',
    lane: 'firmware',
    date: '2026-05-27',
    title: 'OSC · OTA · audio',
    status: 'done',
    level: 2,
    detail:
      'Two-way OSC control, wireless OTA flashing, and the audio-react experiments (a websocket server driving virtual knobs). The async rewrite of audio-react was rolled back — the Ableton bridge later picked up that thread.',
  },
  {
    id: 'fw-v2',
    lane: 'firmware',
    date: '2026-06-22',
    title: 'v2.0.0 presets',
    status: 'done',
    level: 1,
    detail:
      'Pattern system release: a curated preset library plus reusable custom slots with a custom-first registry, and pattern licensing settled as CC-BY-SA-4.0.',
  },
  {
    id: 'fw-improv',
    lane: 'firmware',
    date: '2026-06-23',
    title: 'Improv Wi-Fi',
    status: 'done',
    level: 2,
    detail:
      'Improv-Serial Wi-Fi provisioning during browser flashing, plus a live pattern preview behind the select screen.',
  },
  {
    id: 'fw-ableton',
    lane: 'firmware',
    date: '2026-07-04',
    title: 'Ableton bridge',
    status: 'done',
    level: 2,
    detail:
      'A Max for Live OSC bridge: Ableton Live parameters drive the device knobs directly, with ping/announce auto-discovery on the firmware side.',
  },
  {
    id: 'fw-browser-build',
    lane: 'firmware',
    date: '2026-07-25',
    title: 'Browser firmware worker',
    status: 'done',
    level: 1,
    detail:
      'Cloud build queue + Web Serial flasher (PR #230, #231): write or generate custom patterns in Pattern Lab, compile ESP32-S3 firmware in the browser via build worker, and flash directly over Web Serial without local Arduino IDE setup.',
    issues: [230, 231],
  },
  {
    id: 'fw-resolution',
    lane: 'firmware',
    date: '2026-09-15',
    title: 'Any-resolution engine',
    status: 'planned',
    level: 1,
    detail:
      'Patterns render at whatever HUB75 panel size you own — pick a resolution, the engine adapts. This is the technical key that opens Patternflow to existing LED signboards, not just the official 64×64 build. Software stream: ships when ready, not gated on v3.0.0.',
  },

  // Pattern tools
  {
    id: 'tools-origin',
    lane: 'tools',
    date: '2026-01-11',
    title: 'Patternflow origin',
    status: 'done',
    level: 1,
    detail:
      'Where it all started: the original generative-art website, months before any hardware existed — a node-based pattern studio, URL-shareable presets, 3D relief patterns. Still live at origin.patternflow.work. The pattern-making DNA of the project predates the device.',
    links: [{ label: 'origin.patternflow.work', href: 'https://origin.patternflow.work/' }],
  },
  {
    id: 'tools-paik',
    lane: 'tools',
    date: '2026-01-28',
    title: 'Nam June Paik Art Center',
    status: 'done',
    level: 1,
    detail:
      'The project’s second root. The trip was originally to see a different artist’s exhibition — Paik’s own permanent works, Participation TV and Robot K-456, and a 20th-anniversary memorial performance were all chance encounters the same day. Months later, an assignment in an "Authorial Design Studio" class asking students to reinterpret a senior artist gave that chance visit a name: Patternflow as a contemporary Participation TV, where the audience becomes the creator instead of just the viewer.',
    links: [
      {
        label: 'Patternflow in 30 days (journal)',
        href: 'https://patternflow.work/journal/v1-30-days/en',
      },
      {
        label: 'Nam June Paik, Me, Patternflow (journal)',
        href: 'https://patternflow.work/journal/nam-june-paik-me-patternflow/en',
      },
    ],
  },
  {
    id: 'tools-editor',
    lane: 'tools',
    date: '2026-05-04',
    title: 'Live Editor',
    status: 'done',
    level: 1,
    detail:
      'The in-browser live pattern editor with JS-to-C++ parity and an AI conversion prompt — write a pattern on the website, carry it to the device.',
  },
  {
    id: 'tools-lab',
    lane: 'tools',
    date: '2026-05-13',
    title: 'Pattern Lab',
    status: 'done',
    level: 2,
    detail:
      'The pattern development harness with calibrated knobs, plus the Video Baker experiment (later retired when video mode was dropped from firmware).',
  },
  {
    id: 'tools-gemini',
    lane: 'tools',
    date: '2026-06-24',
    title: 'Gemini generation',
    status: 'done',
    level: 1,
    detail:
      'In-app AI pattern generation in Pattern Lab — bring your own Gemini key, describe a pattern, get running code. The proof of concept for AI-assisted pattern making.',
  },
  {
    id: 'tools-stack',
    lane: 'tools',
    date: '2026-07-02',
    title: 'Layers + color ramps',
    status: 'done',
    level: 1,
    detail:
      'Color ramp and v-field modes, the Experiment layer-stack tab that compiles patches to pattern code, knob bindings, and a much stronger C++ conversion prompt (pre-baked LUTs, macro collision warnings, an expensive-math decision table).',
  },
  {
    id: 'tools-lab-mobile',
    lane: 'tools',
    date: '2026-07-26',
    title: 'Lab mobile & resolution',
    status: 'done',
    level: 2,
    detail:
      'Added direct clipboard paste and code clear buttons for mobile users, localStorage draft autosave, direct panel resolution entry (// @matrix), and upgraded C++ prompt generator.',
  },
  {
    id: 'tools-multiagent',
    lane: 'tools',
    date: '2026-09-28',
    title: 'Multi-agent generation',
    status: 'planned',
    level: 1,
    detail:
      'The next step past single-shot Gemini generation: multiple agents generating, critiquing, and refining patterns in a loop, so quality stops depending on prompt luck. Software stream — ships continuously, independent of v3.0.0.',
  },

  // Community & business
  {
    id: 'biz-pcbway-order',
    lane: 'community',
    date: '2026-04-21',
    title: 'First PCBWay order',
    status: 'done',
    level: 1,
    detail:
      'Serene from PCBWay sent a DM on 04-20, having seen the Reddit post, offering to sponsor a PCB order — the very first PCB, ordered free the next day, before the repo was even public. PCBWay has kept sponsoring since, through the 3D-printing experiments and the v2.2 gerber order.',
  },
  {
    id: 'biz-reddit',
    lane: 'community',
    date: '2026-04-23',
    title: 'Reddit launch',
    status: 'done',
    level: 1,
    detail:
      'The repo went public and the Reddit post went viral — the moment Patternflow stopped being a personal project.',
  },
  {
    id: 'biz-discord',
    lane: 'community',
    date: '2026-04-29',
    title: 'Discord + journal',
    status: 'done',
    level: 2,
    detail:
      'The Discord server opened and the journal started, turning the build log into a public story. First external contributor PRs landed the same week.',
  },
  {
    id: 'biz-cs',
    lane: 'community',
    date: '2026-05-29',
    title: 'Crowd Supply contract',
    status: 'done',
    level: 1,
    detail:
      'The Crowd Supply contract was signed — the commitment that Patternflow becomes a product you can order, not just a repo you can build from.',
  },
  {
    id: 'biz-nath-build',
    lane: 'community',
    date: '2026-06-05',
    title: 'First community build',
    status: 'done',
    level: 2,
    detail:
      'The first fully independent community build (Nath) went up on the build map — proof the guide worked for someone who wasn’t the author.',
  },
  {
    id: 'biz-prelaunch',
    lane: 'community',
    date: '2026-06-27',
    title: 'Pre-launch live',
    status: 'done',
    level: 1,
    detail:
      'The Crowd Supply pre-launch page replaced the waitlist across the site and README. Interest signups now feed the campaign directly.',
    links: [{ label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' }],
  },
  {
    id: 'biz-cs-150',
    lane: 'community',
    date: '2026-07-24',
    title: '150 Crowd Supply subs',
    status: 'done',
    level: 1,
    detail:
      'Passed 160+ subscribers on Crowd Supply pre-launch — surpassing the 150 subscriber milestone required for official launch prep — driven by viral Instagram pattern posts hitting ~300k views.',
    links: [
      { label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' },
      { label: 'Journal (faster-faster)', href: 'https://patternflow.work/journal/faster-faster' },
    ],
  },
  {
    id: 'community-discussions',
    lane: 'community',
    date: '2026-07-24',
    title: 'Discussions & pattern forks',
    status: 'done',
    level: 1,
    detail:
      'Launched the Patternflow Community hub (/community) featuring text discussion boards and pattern sharing with fork capabilities — copy base patterns, tweak color ramps or code, and republish.',
    links: [{ label: 'Community Hub', href: 'https://patternflow.work/community' }],
  },
  {
    id: 'biz-launch',
    lane: 'community',
    date: '2026-09-25',
    title: 'Campaign launch',
    status: 'planned',
    level: 1,
    detail:
      'The Crowd Supply campaign goes live once v3.0.0 is real: verified board, printable case, and guides that match what backers will actually build.',
  },
  {
    id: 'biz-market',
    lane: 'community',
    date: '2026-11-10',
    title: 'Pattern marketplace',
    status: 'planned',
    level: 1,
    detail:
      'The long-term shape: anyone with an LED panel — including commercial signboard owners — can make patterns with the tools, run them at their own resolution, and sell them. The any-resolution engine and multi-agent generation are the two threads that converge here.',
  },
];

export const EDGES: RoadmapEdge[] = [
  { from: 'pcb-v22', to: 'case-v3', note: 'USB-C moved the power input — the case must follow' },
  { from: 'biz-cs-150', to: 'biz-launch', note: '150 subscriber milestone unlocked launch prep' },
  { from: 'fw-browser-build', to: 'community-discussions', note: 'in-browser build & flash feeds pattern sharing' },
  { from: 'fw-resolution', to: 'biz-market', note: 'any panel, any size' },
  { from: 'tools-multiagent', to: 'biz-market', note: 'pattern quality at scale' },
];
