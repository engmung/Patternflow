import type { ClosingCopy, OpeningCopy, SceneCopy } from "../copy";
import type { GuideLang } from "../store";
import type { CheckCard, LinkCard } from "../build/cards";

// Build (/guide/build) — every word of the guide, in both languages: for
// someone who solders a Patternflow from bare parts. Its title for search and
// sharing, the opening, the chapters, the end, and the words on the cards
// inside its steps (build/BuildCards.tsx). The chapters line up with
// scenes/build.ts by id, and their steps one-to-one (pages.test.ts checks
// both). The small print every guide shares — "Stuck here?" — is copy.ts's
// `ui`.
//
// The written sources are the truth: BUILD_GUIDE.md (the v3.9 board), the BOM
// (hardware/bom/bom_v3.9.csv), hardware/**/README.md. The parts list on the
// page is the CSV itself (build/bom.ts); what is here is only what a card
// says about a line, keyed by its reference (build/build.test.ts checks every
// line has one). The list is made to be scanned: a quantity, a part, its
// reference and a few words. What to order it by, alternates and sourcing
// notes are behind the line, or left to the file and BUILD_GUIDE §1, which
// the card links. One line says more, because it is the one that goes wrong:
// the LED panel, with the listing BUILD_GUIDE §1 recommends and the way to
// docs/panel-compatibility.md. The board's known issues are BUILD_GUIDE.md
// §10: link there, don't restate them. The board has one power input, J4, the
// screw terminal: USB-C is never power. Firmware is the Play guide's 01 Flash,
// not repeated here: the step that sends a builder there says only the order
// that chapter goes in, so nobody starts at the button. BOOT and RST first,
// every first flash; then Flash Patternflow; the Wi-Fi step that usually
// doesn't appear after it (RST, then Connect to Wi-Fi from the flasher again);
// the panel's own network as the way round, once it is lit. The hand-off card
// stops the builder at that chapter's Power step, because seating the DevKit
// and the first power are this guide's; First light then names the step
// after it, the panel's own network, for whoever skipped the Wi-Fi. There
// are no kits.
//
// No multimeter, anywhere: the maker cut the short check, the continuity
// check and the 5 V measurement as steps nobody needs. After the wiring the
// build goes straight on to the firmware, the DevKit and first light; what a
// builder checks before power is what they can see, the +5v marks
// (build/build.test.ts keeps the meter out).
//
// The LED panel goes into the frame from the FRONT and stops on the twelve
// tabs inside it. The tabs are part of the frame (encloser.stl's frame halves,
// the .blend's 0904_v3.9 body; docs/build-guide/images/v3/02, 11–13), and the
// M4 screws go in from behind, through the tabs, into the panel's own
// threads. Only for_other_panels/ has a separate mounting part.
//
// The board's two faces are "the printed side" (all its lettering, the
// sockets, J1, J3, J4 and C11 — KiCad's F side) and "the plain side" (where
// the encoders' bodies sit). Not "front" and "back": the docs use "back" for
// both the encoder side and J4's, which are opposite faces.
//
// The two covers are named as the Play guide names them, because a builder
// is sent into its 01 Flash mid-build: "the back panel" is the big snap-fit
// plate, "the back cover" the small one that slides over the board.

export type BuildLink = { label: string; href: string };

/** The words on the cards inside the steps (build/BuildCards.tsx). */
export type BuildCardsCopy = {
  bom: {
    /**
     * The few words on a line, by its reference ("SW1-SW4") — or, for a part
     * with none, its name. Every line has them but the LED panel, whose line
     * is `panel`.
     */
    tips: Record<string, string>;
    /** A line's name where the file's English one is not what a reader would call it (Korean). The file's own name is then behind the line. */
    names?: Record<string, string>;
    /** Behind a line: an alternate, a sourcing note. A sentence or two, for the lines that have one. */
    more: Record<string, string>;
    /** Behind a line: what its rows are called — the file's name for it, its spec, the part number to order by. */
    labels: { name: string; spec: string; mpn: string };
    /** The LED panel's line: the listing BUILD_GUIDE §1 recommends, a word on that link, and the way to the compatibility doc. */
    panel: { listing: BuildLink; note: string; other: BuildLink };
    /** The link to the file under the list. */
    source: string;
    /** Beside it: the sourcing notes, BUILD_GUIDE §1. */
    guide: BuildLink;
    /** In place of the list when the page was built without the file. */
    missing: string;
  };
  tools: {
    items: { label: string; where: string; href: string }[];
    /** Under the list: where the ticks are kept. */
    kept: string;
  };
  figures: { value: string; label: string }[];
  caseFiles: {
    head: [bed: string, file: string, note: string];
    rows: { bed: string; file: string; href: string; note: string }[];
    settingsLabel: string;
    settings: string[];
    links: BuildLink[];
  };
  order: {
    /** Sockets, J1/J3/J4, C11, the encoders — the chapter's steps 1–4. */
    steps: [string, string, string, string];
    video: BuildLink;
    /** The video's note: the v3.0 board's USB-C part, which v3.9 doesn't have. */
    skip: string;
  };
  terminals: {
    /** How the drawing is seen. */
    seen: string;
    red: string;
    black: string;
    /** The DevKit's end, at the bottom edge. */
    usb: string;
    /** What each terminal is for. */
    j4: string;
    j3: string;
  };
  checks: Record<CheckCard, string[]>;
  handoff: { label: string; href: string; line: string };
  /** The long-press screens, K1..K4. */
  knobMap: { screens: [string, string, string, string] };
  links: Record<LinkCard, BuildLink[]>;
};

export type BuildCopy = {
  meta: { title: string; description: string };
  /** The guide's name: in the hub, and where a "Stuck here?" issue says the reader was. */
  name: string;
  opening: OpeningCopy;
  /** The chapters, in order: each one's id (its scene in scenes/build.ts, its #anchor) and words. */
  chapters: { id: string; copy: SceneCopy }[];
  next: ClosingCopy;
  cards: BuildCardsCopy;
};

const REPO = "https://github.com/engmung/Patternflow";
const BUILD_GUIDE_MD = `${REPO}/blob/main/BUILD_GUIDE.md`;
const BLOB = `${REPO}/blob/main`;
const TREE = `${REPO}/tree/main`;
const PCBWAY = "https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html";
const MAKERWORLD = "https://makerworld.com/en/models/3072492-patternflow-open-source-led-synthesizer-case#profileId-3459015";
const SOLDER_VIDEO = "https://youtu.be/NZCjMBCsDAc";
const ASSEMBLY_VIDEO = "https://youtu.be/J9C9bZgkNKs";
// BUILD_GUIDE.md by section. Not §5: the GPIO0 note is at that section's far
// end, and what a reader lands on at its top is the multimeter pass this guide
// does not have. The note's substance is issue #16, and §10 lists it.
const GUIDE_SECTION = {
  bom: `${BUILD_GUIDE_MD}#1-bill-of-materials-bom`,
  tools: `${BUILD_GUIDE_MD}#what-you-also-need-not-in-bom`,
  print: `${BUILD_GUIDE_MD}#4-3d-printing`,
  case: `${BUILD_GUIDE_MD}#6-case-assembly`,
  issues: `${BUILD_GUIDE_MD}#10-known-issues--design-notes`,
};
const ISSUE_16 = `${REPO}/issues/16`;
const PANEL_DOC = `${BLOB}/docs/panel-compatibility.md`;
/** The panel BUILD_GUIDE §1 recommends: the one the case is measured around (build/build.test.ts keeps the two in step). */
export const PANEL_LISTING = "https://s.click.aliexpress.com/e/_c3SVdcQr";
const GERBER = `${BLOB}/hardware/pcb/gerber/patternflow_v3.9_gerber.zip`;
const KICAD = `${TREE}/hardware/pcb/kicad`;
const CASE_256 = `${BLOB}/hardware/case/bed_256mm/encloser.stl`;
const CASE_330 = `${BLOB}/hardware/case/bed_330mm/encloser.stl`;
const CASE_OTHER = `${TREE}/hardware/case/bed_256mm/for_other_panels`;
const CASE_DIR = `${TREE}/hardware/case`;
const THREE_MF = `${BLOB}/hardware/case/bed_256mm/patternflow_v3.3mf`;

const en: BuildCopy = {
  meta: {
    title: "Build a Patternflow",
    description:
      "The Build guide: a Patternflow soldered from bare parts — the parts list, the board order, the printed case, soldering, putting it together and first light — shown on the real v3.9 hardware in 3D.",
  },
  name: "Build",
  opening: {
    kicker: "The guide · Build",
    title: "Build one from scratch.",
    lede: "The board comes from a fab, the case from your printer, the parts from the parts list. Then about an hour of soldering and putting it together — shown here on the real parts, in the order it really happens.",
    scroll: "Scroll",
    chapters: ["Gather", "Order & print", "Solder", "Into the case", "Wire", "Firmware", "Check & close"],
    back: { label: "All guides", to: "hub" },
  },
  chapters: [
    {
      id: "gather",
      copy: {
        num: "01",
        title: "Gather the parts",
        lede: "Everything is on the parts list. Order first: shipping is the slow part.",
        steps: [
          {
            kicker: "On the board",
            title: "Seven lines. Everything you solder is through-hole.",
            body: [
              "Order by part number, from Mouser, DigiKey or anywhere with the same one. Open a line to see its number.",
            ],
            extra: "build:bomBoard",
          },
          {
            kicker: "Off the board",
            title: "A panel, screws, a cable, a power bank.",
            body: [
              "Buy the LED panel by its listing, not a part number: the case is measured around the one linked below. It comes with its ribbon and power cable.",
            ],
            warn: "Another panel? Its driver IC decides, not “HUB75E” in the title. S-PWM “video wall” panels stay completely dark, and no firmware fixes that.",
            extra: "build:bomOff",
          },
          {
            kicker: "On the bench",
            title: "And the tools.",
            body: ["Tick them off as you find them."],
            extra: "build:tools",
          },
          {
            kicker: "Budget and time",
            title: "Order first, build later.",
            body: [
              "Budget US$100–200. Take $100 as the floor, not the estimate: shipping, minimum order quantities and a reprint or two add up.",
            ],
            extra: "build:figures",
          },
        ],
      },
    },
    {
      id: "print",
      copy: {
        num: "02",
        title: "Order the board, print the case",
        lede: "The board comes from a PCB fab. The case and the knobs come off your printer.",
        steps: [
          {
            kicker: "The board",
            title: "Order the v3.9 board.",
            body: [
              "The PCBWay shared project needs no upload, and ordering through it supports Patternflow. Any fab works too: upload the v3.9 Gerber zip. JLCPCB tends to be the cheapest.",
            ],
            warn: "v3.x only. The v2.1 board is a different size and won't fit these cases. Nothing in gerber/experiment/ is verified.",
            extra: "build:linksPcb",
          },
          {
            kicker: "The case",
            title: "Pick the file by your printer's bed.",
            body: [
              "Print the body in white PLA, about 10 hours in all. On a Bambu printer, MakerWorld has it with tuned profiles, one click; the same four-plate project is in the repo.",
            ],
            extra: "build:caseFiles",
          },
          {
            kicker: "Knobs",
            title: "The knobs in black, on their own.",
            body: [
              "Print knobs_20mm.stl, all four on one plate, as its own job in black PLA. It fits the BOM's 20 mm-shaft encoders; 15 mm shafts take knobs_15mm.stl.",
              "White body, black knobs: that contrast is the Patternflow look.",
            ],
          },
          {
            kicker: "256 mm only",
            title: "Glue the halves right away.",
            body: [
              "The 256 mm print splits the frame and the back panel into upper and lower halves. As soon as they're off the bed, glue each pair with CA glue and hold it with masking tape while it cures.",
              "Backlit, a bonded seam shows a hairline gap. That's normal: putty, or baking soda with CA, fills it.",
              "Let it cure while you solder. Printed the 330 mm one-piece body? Skip this.",
            ],
          },
        ],
      },
    },
    {
      id: "solder",
      copy: {
        num: "03",
        title: "Solder the board",
        lede: "Every joint is big and through-hole. Four steps, the encoders last.",
        steps: [
          {
            kicker: "Sockets",
            title: "Sockets first, on the printed side.",
            body: [
              "Set the two 1×22 sockets into U1's two rows of holes from the printed side, the one with all the lettering. Solder all 44 pins from the plain side, and keep both rows straight and flush.",
              "The DevKit plugs in much later. It is never soldered.",
            ],
            extra: "build:order",
          },
          {
            kicker: "J1 · J3 · J4",
            title: "Then the header and the two terminals.",
            body: [
              "J1, the 2×8 box header, goes beside the right-hand row of sockets, its notch toward them: the board prints hole! on that side.",
              "The two screw terminals go in the bottom corners. Printed side up, encoders at the top: J4 on the left, its wire openings toward the bottom edge; J3 on the right, its openings the other way, up the board. J4 is the board's only power input.",
              "Seat each one flush, then solder from the plain side: 16 joints for J1, two each for J3 and J4.",
            ],
            extra: "build:order",
          },
          {
            kicker: "C11",
            title: "The capacitor, the right way round.",
            body: [
              "C11, the 1000 µF electrolytic, goes above J4. Its long lead is +: it goes in the hole marked + on the board, the one nearer the sockets. The stripe down the can marks −.",
              "Solder it, then trim the leads.",
            ],
            warn: "Before you solder, check the long lead is in +. Reversed, the capacitor fails.",
            extra: "build:order",
          },
          {
            kicker: "SW1–SW4",
            title: "The encoders last, from the other side.",
            body: [
              "Turn the board over. The four encoders go in from the plain side: their bodies sit there, and their pins come through to the printed side, which says it four times: ENCODER FACING OTHER SIDE.",
              "Solder the pins on the printed side.",
            ],
            warn: "Check the side twice before you solder each one. On the wrong side the shafts can't reach the front of the case, and a soldered encoder is very hard to get back out.",
            extra: "build:order",
          },
        ],
      },
    },
    {
      id: "case",
      copy: {
        num: "04",
        title: "Into the case",
        lede: "The panel first, then the board — with its power lead already through the case.",
        steps: [
          {
            kicker: "The panel",
            title: "From the front, IN toward the top.",
            body: [
              "Glue cured? On the panel's back, find the connector marked HUB-75E IN. That end goes toward the top, the knob end: it's where the ribbon reaches J1 from.",
              "Then seat the panel in the frame from the front, LEDs facing out, until its back rests on the twelve tabs inside the frame.",
            ],
            warn: "The fit is very tight, with almost no clearance. Work it in slowly: forced, the print can crack.",
          },
          {
            kicker: "M4 screws",
            title: "Screw it in from behind.",
            body: [
              "Turn the case over. Each tab's hole sits over one of the panel's threaded holes: drive an M4 screw through the tab, into the panel. All 12 is the exact fit; 6, spread over the corners and the middle, hold it firmly.",
              "Another panel's holes and screws may differ. That's what the for_other_panels print is for.",
            ],
          },
          {
            kicker: "Power lead",
            title: "The lead goes in before the board.",
            body: [
              "Cut the USB cable, keeping the power-bank end. Strip only its red (+5 V) and black (GND) wires.",
              "Thread the cut end through the small cable hole first, from the power-bank compartment up into the board bay, right below J4's place. Not the wide opening beside it, if your case has one.",
              "Board still outside the case, clamp them into J4, red to the +5v side. Tug each wire.",
            ],
            warn: "J4 is the only way power gets in. Never through the DevKit's USB ports.",
            extra: "build:j4",
          },
          {
            kicker: "The board",
            title: "Set the board into its bay.",
            body: [
              "From behind, printed side toward you: the four encoder shafts go through the four holes in the front face. The sockets and the terminals face the open back, and the J4 lead follows the board in.",
            ],
          },
          {
            kicker: "Nuts",
            title: "Lock it from the front.",
            body: [
              "On the front, screw the nut that came with each encoder onto its shaft and tighten it with pliers or a wrench. The nuts are what hold the board against the front face.",
              "Keep the knobs off. They go on last, in 07.",
            ],
          },
        ],
      },
    },
    {
      id: "wire",
      copy: {
        num: "05",
        title: "Wiring",
        lede: "Two cables from the panel to the board: the ribbon, then the power pair.",
        steps: [
          {
            kicker: "Ribbon",
            title: "From J1 to the panel's IN.",
            body: [
              "Plug the panel's HUB75 ribbon into J1 on the board and into the panel's IN connector, the one at the top. The one at the bottom is OUT: it stays empty.",
              "The plugs are keyed. Match each key to its header's notch.",
            ],
          },
          {
            kicker: "J3",
            title: "The panel's power into J3.",
            body: [
              "Plug the panel's power cable into the 4-pin power header on the panel's back, just below the middle, and clamp its other end into J3: red to the side marked +5v, black to GND.",
              "J3 is J4's mirror image. From this side J3's +5v is on the left and J4's on the right, so go by the +5v mark, not by left and right.",
            ],
            warn: "Reversed, J3 can destroy the panel. Look twice before it ever gets power.",
            extra: "build:j3",
          },
        ],
      },
    },
    {
      id: "firmware",
      copy: {
        num: "06",
        title: "Firmware and first light",
        lede: "The DevKit gets its firmware on its own, then goes in.",
        steps: [
          {
            kicker: "Flash",
            title: "Flash it in the Play guide.",
            body: [
              "The DevKit is flashed on its own, out of the board, from desktop Chrome or Edge, through its left USB port. The Play guide's 01 Flash goes in this order: hold BOOT, tap RST, let go, and only then press Flash Patternflow.",
              "After the install the Wi-Fi step usually doesn't appear, and that's expected: press RST, press Flash Patternflow again, pick the port and choose Connect to Wi-Fi, on 2.4 GHz. Or leave it for later: a lit panel with no Wi-Fi raises a network of its own.",
            ],
            extra: "build:handoff",
          },
          {
            kicker: "Seat it",
            title: "Seat the DevKit, power off.",
            body: [
              "Press the flashed DevKit straight into the two sockets, its USB-C ports toward the board's bottom edge, where the board says USB, and its antenna end toward the encoders.",
              "All 44 pins in, neither row shifted by one. The power bank stays unplugged until the next step.",
            ],
          },
          {
            kicker: "First light",
            title: "Plug in the power bank.",
            body: [
              "Slide the power bank into its compartment and plug in the J4 lead. Within a second or two the panel lights with Origin.",
              "One pattern is right, not a failed install. The Basics pack goes on in the Play guide's 03.",
              "Skipped the Wi-Fi, or it didn't take? Give it 15 seconds, then hold K2, the top-left shaft from the front, for a second: the panel shows HOTSPOT and the name of the network it raised. Play 01's last step, the one after where you stopped, shows how to join it.",
            ],
            extra: "build:linksPlay03",
          },
        ],
      },
    },
    {
      id: "check",
      copy: {
        num: "07",
        title: "Check and close",
        lede: "Every knob, every screen, one power cycle. Then the back goes on, and the knobs last.",
        steps: [
          {
            kicker: "Turn and click",
            title: "Every knob, both ways.",
            body: [
              "Turn each of the four shafts: each one should visibly change the pattern. Then click each once: on Origin, a click zeroes that knob.",
              "From the front: K2 and K1 on top, K4 and K3 below.",
            ],
            extra: "build:checkKnobs",
          },
          {
            kicker: "Hold",
            title: "Hold each knob for a second.",
            body: [
              "Each opens its own screen. K4's is the pattern list: turn to browse, hold again to close it.",
            ],
            extra: "build:knobMap",
          },
          {
            kicker: "Power cycle",
            title: "Off, on, no RST.",
            body: [
              "Unplug the power bank and plug it back in. Origin must come back by itself, without a press of RST. If it doesn't, issue #16 is about exactly that, with the fix.",
            ],
            extra: "build:linksGpio0",
          },
          {
            kicker: "Close the back",
            title: "Right edge in first, then click.",
            body: [
              "Hook the back panel's right edge in first, then press along the snap-fit until it clicks shut. Keep the cables clear of the edge.",
              "Then slide the back cover, the small one, shut over the board bay.",
            ],
            extra: "build:linksBack",
          },
          {
            kicker: "Last",
            title: "Cover shut, knobs on.",
            body: [
              "Slide the power-bank cover shut. Then press the four black knobs onto the shafts, last of all.",
              "That's a Patternflow, built.",
            ],
          },
        ],
      },
    },
  ],
  next: {
    title: "It's alive. Now play it.",
    lede: "The next guide is what comes after first light: the four knobs, more patterns, and the device's own console.",
    groups: [{ label: "The next guide", items: ["Knobs — turn, press, hold", "Patterns — 33 more, over Wi-Fi", "Console — every setting, in a browser"], to: "play" }],
    until: "Something not right? The board's known issues are written down:",
    links: [
      { label: "Known issues · BUILD_GUIDE §10", href: GUIDE_SECTION.issues },
      { label: "Soldering video", href: SOLDER_VIDEO },
      { label: "Assembly video", href: ASSEMBLY_VIDEO },
      { label: "BUILD_GUIDE.md", href: BUILD_GUIDE_MD },
    ],
    report: { title: "stuck", where: "The Build guide, somewhere not listed" },
  },
  cards: {
    bom: {
      tips: {
        U1: "Plugs in, never soldered.",
        "U1 (sockets)": "Two rows, for the DevKit.",
        "SW1-SW4": "20 mm shaft, to match the knobs.",
        J1: "For the panel's ribbon.",
        J3: "+5 V out to the panel.",
        J4: "The only power input.",
        C11: "Mind its polarity.",
        "M4 screw": "About 10 mm. 12 is the exact fit, 6 hold it.",
        "USB cable (sacrificial)": "One you can cut: it becomes the power lead.",
        "USB power bank": "5 V. Has to fit the case's compartment.",
      },
      more: {
        U1: "Espressif's own is the reference part. AliExpress modules usually work too.",
        "SW1-SW4": "Any 5-pin EC11 with a push switch works; the cheapest packs fail more often. A 15 mm shaft takes knobs_15mm.stl.",
        "M4 screw": "Sized for the linked panel. Another panel takes whatever screws its own holes do.",
      },
      labels: { name: "In the BOM", spec: "Spec", mpn: "Order by" },
      panel: {
        listing: { label: "Recommended listing", href: PANEL_LISTING },
        note: "An affiliate link: it supports Patternflow at no extra cost.",
        other: { label: "Panel compatibility", href: PANEL_DOC },
      },
      source: "The full BOM",
      guide: { label: "Sourcing notes · BUILD_GUIDE §1", href: GUIDE_SECTION.bom },
      missing: "The parts list is the BOM file:",
    },
    tools: {
      items: [
        { label: "A 3D printer with a 256 mm bed or bigger", where: "§4", href: GUIDE_SECTION.print },
        { label: "White PLA for the body, black PLA for the knobs", where: "§4", href: GUIDE_SECTION.print },
        { label: "Soldering iron, solder, flux, tweezers", where: "§1", href: GUIDE_SECTION.tools },
        { label: "Wire cutters, a Phillips screwdriver, a small flathead for the terminals", where: "§1", href: GUIDE_SECTION.tools },
        { label: "CA glue and masking tape, for bonding the printed halves", where: "§4", href: GUIDE_SECTION.print },
        { label: "Putty, or baking soda with CA, for the seams (optional)", where: "§4", href: GUIDE_SECTION.print },
        { label: "Pliers or a wrench, for the encoder nuts", where: "§6", href: GUIDE_SECTION.case },
      ],
      kept: "Your ticks stay in this browser.",
    },
    figures: [
      { value: "~2 weeks", label: "for the parts to arrive" },
      { value: "~10 h", label: "of printing" },
      { value: "~1 h", label: "of soldering and assembly" },
    ],
    caseFiles: {
      head: ["Your bed", "Print", ""],
      rows: [
        { bed: "256 mm · P1S, X1C, A1", file: "bed_256mm/encloser.stl", href: CASE_256, note: "In halves you glue." },
        { bed: "330 mm+ · H2S", file: "bed_330mm/encloser.stl", href: CASE_330, note: "One piece, no gluing. Its DevKit opening is for data, never power." },
        { bed: "Another panel", file: "bed_256mm/for_other_panels/", href: CASE_OTHER, note: "Instead of the 256 mm file: its panel mount adjusts to other hole layouts." },
      ],
      settingsLabel: "Print settings",
      settings: ["0.4 mm nozzle", "0.2 mm layers", "standard supports, not tree", "brim off", "aux fan ~20%"],
      links: [
        { label: "MakerWorld", href: MAKERWORLD },
        { label: "patternflow_v3.3mf", href: THREE_MF },
        { label: "All the case files", href: CASE_DIR },
      ],
    },
    order: {
      steps: ["Sockets", "J1 · J3 · J4", "C11", "Encoders"],
      video: { label: "The soldering, start to finish", href: SOLDER_VIDEO },
      skip: "Filmed on a v3.0 board: skip 11:00–15:18, the USB-C part. v3.9 has no USB-C footprint.",
    },
    terminals: {
      seen: "The printed side, encoders up: how you see the board through the open back.",
      red: "red",
      black: "black",
      usb: "USB",
      j4: "power in",
      j3: "out to the panel",
    },
    checks: {
      checkKnobs: ["K1 turns and clicks", "K2 turns and clicks", "K3 turns and clicks", "K4 turns and clicks"],
    },
    handoff: {
      label: "Flash it — Play 01",
      href: "/guide/play#flash-2",
      line: "It opens in a new tab. Stop at its Power step, where the DevKit goes back in, and come back to this tab: seating it and first light are the next steps here.",
    },
    knobMap: { screens: ["Brightness", "Network: Wi-Fi and IP, or HOTSPOT", "Each knob's number", "Pattern select"] },
    links: {
      linksPcb: [
        { label: "PCBWay shared project", href: PCBWAY },
        { label: "Gerber zip, v3.9", href: GERBER },
        { label: "KiCad source", href: KICAD },
      ],
      linksWiring: [{ label: "The wiring at 06:57 in the assembly video", href: `${ASSEMBLY_VIDEO}?t=417` }],
      linksPlay03: [{ label: "More patterns: Play 03", href: "/guide/play#patterns" }],
      linksGpio0: [
        { label: "Issue #16 · RST needed at power-up", href: ISSUE_16 },
        { label: "Known issues · BUILD_GUIDE §10", href: GUIDE_SECTION.issues },
      ],
      linksBack: [{ label: "Closing the back at 09:11 in the assembly video", href: `${ASSEMBLY_VIDEO}?t=551` }],
    },
  },
};

const ko: BuildCopy = {
  meta: {
    title: "패턴플로우 조립하기",
    description:
      "부품 주문부터 기판 발주, 케이스 출력, 납땜과 조립, 첫 점등까지. 패턴플로우를 직접 만드는 전 과정을 실제 v3.9 하드웨어 3D 모델로 보여줘요.",
  },
  name: "조립",
  opening: {
    kicker: "가이드 · 조립",
    title: "처음부터 직접 만들어요.",
    lede: "기판은 제작 업체에 맡기고 케이스는 3D 프린터로 뽑고 부품은 목록대로 준비해요. 손으로 납땜하고 조립하는 데는 한 시간쯤 걸려요. 실제 부품을 실제 조립 순서 그대로 보여줘요.",
    scroll: "스크롤",
    chapters: ["부품", "주문과 출력", "납땜", "케이스", "배선", "펌웨어", "점검과 마무리"],
    back: { label: "가이드 전체", to: "hub" },
  },
  chapters: [
    {
      id: "gather",
      copy: {
        num: "01",
        title: "부품 모으기",
        lede: "필요한 건 부품 목록에 다 있어요. 배송이 제일 오래 걸리니 주문부터 해 두세요.",
        steps: [
          {
            kicker: "기판 위",
            title: "부품 일곱 가지. 납땜은 전부 스루홀이에요.",
            body: [
              "Mouser나 DigiKey 같은 곳에서 부품 번호로 검색해 주문해요. 각 항목을 누르면 부품 번호가 나와요.",
            ],
            extra: "build:bomBoard",
          },
          {
            kicker: "기판 밖",
            title: "패널, 나사, 케이블, 보조배터리.",
            body: [
              "LED 패널은 부품 번호로 찾지 말고 아래 링크에서 사요. 케이스가 이 패널 치수에 맞춰 설계돼 있어요. 리본 케이블과 전원 케이블도 같이 들어 있어요.",
            ],
            warn: "다른 패널을 쓴다면? 패널이 켜질지는 상품명의 ‘HUB75E’가 아니라 드라이버 IC에 달려 있어요. S-PWM 방식 ‘비디오 월’ 패널은 아예 켜지지 않고 펌웨어로도 못 살려요.",
            extra: "build:bomOff",
          },
          {
            kicker: "작업대 위",
            title: "챙겨 둘 공구.",
            body: ["준비된 것부터 하나씩 체크해 두세요."],
            extra: "build:tools",
          },
          {
            kicker: "예산과 시간",
            title: "주문 먼저, 조립은 나중에.",
            body: [
              "예산은 100~200달러쯤 잡으면 돼요. 100달러는 아무 문제 없이 끝났을 때 드는 돈이에요. 배송비나 최소 주문 수량, 한두 번 다시 뽑는 값까지 합치면 보통은 더 들어요.",
            ],
            extra: "build:figures",
          },
        ],
      },
    },
    {
      id: "print",
      copy: {
        num: "02",
        title: "기판 주문, 케이스 출력",
        lede: "기판은 제작 업체에 주문하고 케이스와 노브는 3D 프린터로 직접 뽑아요.",
        steps: [
          {
            kicker: "기판",
            title: "v3.9 기판을 주문해요.",
            body: [
              "PCBWay 공유 프로젝트로 주문하면 거버 파일을 따로 올릴 필요가 없고 패턴플로우 개발에도 보탬이 돼요. 다른 업체에 맡겨도 괜찮아요. v3.9 거버 압축 파일을 올리면 되고 가격은 대개 JLCPCB가 제일 싸요.",
            ],
            warn: "꼭 v3.x로 주문해요. v2.1 기판은 크기가 달라서 v3 케이스에 안 맞아요. gerber/experiment/ 폴더의 파일은 아직 검증 전이니 주문하지 마세요.",
            extra: "build:linksPcb",
          },
          {
            kicker: "케이스",
            title: "프린터 베드 크기에 맞는 파일을 골라요.",
            body: [
              "본체는 흰색 PLA로 뽑아요. 다 뽑는 데 10시간쯤 걸려요. 뱀부 프린터를 쓴다면 MakerWorld에 설정이 다 된 프로필이 올라와 있으니 바로 출력하면 돼요. 똑같은 4플레이트 프로젝트 파일이 레포에도 들어 있어요.",
            ],
            extra: "build:caseFiles",
          },
          {
            kicker: "노브",
            title: "노브는 검은색으로 따로 뽑아요.",
            body: [
              "knobs_20mm.stl은 검정 PLA로 따로 출력해요. 한 판에 네 개가 같이 들어 있어요. BOM에 적힌 20 mm 축 엔코더용이고 15 mm 축을 쓴다면 knobs_15mm.stl을 뽑으면 돼요.",
              "하얀 본체에 까만 노브. 이 대비가 패턴플로우의 인상을 만들어요.",
            ],
          },
          {
            kicker: "256 mm만",
            title: "다 뽑으면 위아래 반쪽부터 붙여요.",
            body: [
              "256 mm용 파일은 본체 프레임과 뒤판이 위아래 두 조각으로 나뉘어 나와요. 베드에서 떼자마자 순간접착제(CA)로 짝을 맞춰 붙이고 굳을 때까지 마스킹 테이프로 잡아 둬요.",
              "뒤에서 빛을 비춰 보면 접합선에 실틈이 보일 거예요. 원래 그래요. 퍼티로 메우거나 베이킹소다를 채우고 순간접착제를 떨어뜨려 메우면 돼요.",
              "접착제가 굳는 동안 기판을 납땜하면 시간이 딱 맞아요. 330 mm 일체형 본체를 뽑았다면 이 단계는 건너뛰어요.",
            ],
          },
        ],
      },
    },
    {
      id: "solder",
      copy: {
        num: "03",
        title: "기판 납땜",
        lede: "부품이 전부 큼직한 스루홀이라 납땜하기 편해요. 네 단계로 나뉘고 엔코더는 맨 마지막에 달아요.",
        steps: [
          {
            kicker: "소켓",
            title: "소켓부터 글씨 있는 면에 꽂아요.",
            body: [
              "글씨가 인쇄된 면에서 U1 자리의 두 줄 구멍에 1×22 소켓 두 개를 꽂아요. 두 줄이 비뚤어지거나 들뜨지 않게 기판에 딱 붙인 뒤 글씨 없는 면에서 44핀을 모두 납땜해요.",
              "DevKit 모듈은 나중에 소켓에 꽂기만 해요. 절대 납땜하지 않아요.",
            ],
            extra: "build:order",
          },
          {
            kicker: "J1 · J3 · J4",
            title: "다음은 헤더와 나사 단자 두 개.",
            body: [
              "2×8 박스 헤더 J1은 오른쪽 소켓 줄 옆 자리에 꽂아요. 옆면의 파인 홈이 소켓 쪽을 향하면 돼요. 기판에도 그쪽에 hole!이라고 적혀 있어요.",
              "나사 단자 두 개는 아래쪽 양 모서리에 꽂아요. 글씨 있는 면을 위로 두고 엔코더 자리가 위쪽으로 오게 놓았을 때 왼쪽이 J4, 오른쪽이 J3예요. 전선이 들어가는 입구는 J4가 기판 아래쪽 가장자리를 향하고 J3는 반대로 위쪽을 향해요. J4가 기판의 유일한 전원 입력이에요.",
              "부품이 들뜨지 않게 기판에 밀착해 꽂고 글씨 없는 면에서 납땜해요. J1은 16핀, J3와 J4는 2핀씩이에요.",
            ],
            extra: "build:order",
          },
          {
            kicker: "C11",
            title: "커패시터는 극성을 맞춰서.",
            body: [
              "1000 µF 전해 커패시터 C11은 J4 바로 위 자리에 꽂아요. 다리가 긴 쪽이 +예요. 소켓 쪽에 더 가까운 + 표시 구멍에 긴 다리를 넣으면 돼요. 몸통 옆면의 띠는 − 표시예요.",
              "납땜한 뒤에 튀어나온 다리는 니퍼로 잘라 내요.",
            ],
            warn: "납땜하기 전에 긴 다리가 + 구멍에 들어갔는지 확인해요. 극성을 반대로 달면 커패시터가 망가져요.",
            extra: "build:order",
          },
          {
            kicker: "SW1–SW4",
            title: "엔코더는 마지막에 반대쪽 면에서.",
            body: [
              "이제 기판을 뒤집어요. 엔코더 네 개는 글씨 없는 면에서 꽂아야 해요. 엔코더 몸통이 글씨 없는 면에 놓이고 다리가 글씨 있는 면으로 올라오는 식이에요. 기판에도 ENCODER FACING OTHER SIDE라고 네 번 적혀 있어요.",
              "올라온 다리는 글씨 있는 면에서 납땜해요.",
            ],
            warn: "하나 납땜할 때마다 방향이 맞는지 두 번 확인해요. 반대 면에 달면 축이 케이스 앞으로 나오지 못하는데 한번 납땜한 엔코더는 도로 빼내기가 정말 힘들어요.",
            extra: "build:order",
          },
        ],
      },
    },
    {
      id: "case",
      copy: {
        num: "04",
        title: "케이스에 넣기",
        lede: "패널을 먼저 앉히고 기판을 넣어요. 전원선은 기판을 넣기 전에 미리 케이스 안으로 빼 둬야 해요.",
        steps: [
          {
            kicker: "패널",
            title: "앞쪽에서 넣어요. IN이 위로 가게요.",
            body: [
              "접착제가 다 굳었으면 패널 뒷면에서 HUB-75E IN이라고 적힌 커넥터를 찾아요. 이 커넥터가 위쪽, 즉 노브가 달릴 쪽으로 가야 기판의 J1과 리본 케이블로 이어져요.",
              "LED가 바깥을 향하게 잡고 프레임 앞쪽에서 패널을 끼워 넣어요. 패널 뒷면이 프레임 안쪽 고정 탭 열두 개에 닿아 멈출 때까지 밀어 넣으면 돼요.",
            ],
            warn: "유격이 거의 없어서 아주 빡빡하게 들어가요. 억지로 밀면 출력물이 갈라질 수 있으니 천천히 나눠서 눌러 넣어요.",
          },
          {
            kicker: "M4 나사",
            title: "뒤에서 나사로 고정해요.",
            body: [
              "케이스를 뒤집으면 고정 탭 구멍 너머로 패널의 나사산이 맞춰져 있어요. 뒤에서 M4 나사를 넣어 조여요. 12개를 다 채우면 가장 좋지만 모서리와 가운데에 6개만 고루 조여도 단단히 잡혀요.",
              "다른 패널을 썼다면 나사 구멍 위치나 규격이 다를 수 있어요. 그럴 땐 for_other_panels 폴더의 파일로 뽑아 맞추면 돼요.",
            ],
          },
          {
            kicker: "전원선",
            title: "전원선은 기판을 넣기 전에 먼저.",
            body: [
              "보조배터리에 꽂을 플러그 쪽을 남기고 USB 케이블을 잘라요. 겉피복을 벗긴 뒤 빨간 선(+5 V)과 검은 선(GND) 두 가닥만 끝을 까 두고 나머지 선은 안 써요.",
              "자른 전선 끝을 먼저 작은 케이블 구멍에 통과시켜요. 보조배터리 칸에서 기판 칸 쪽으로 밀어 올리면 J4 자리 바로 아래로 올라와요. 그 옆에 넓은 구멍이 있는 케이스도 있는데, 거기가 아니에요.",
              "기판을 케이스에 넣기 전에 밖에서 전선 두 가닥을 J4 단자에 먼저 물려요. 빨간 선이 +5v 표시 쪽이에요. 나사를 조인 뒤 한 가닥씩 당겨 봐서 빠지지 않는지 확인해요.",
            ],
            warn: "전원이 들어가는 길은 J4 하나뿐이에요. DevKit의 USB 포트로는 절대 넣지 않아요.",
            extra: "build:j4",
          },
          {
            kicker: "기판",
            title: "기판을 자리에 넣어요.",
            body: [
              "케이스 뒤쪽에서 글씨 있는 면이 내 쪽을 향하게 기판을 넣어요. 엔코더 축 네 개를 앞면 구멍 네 곳에 맞춰 밀어 넣으면 소켓과 단자가 열린 뒤쪽을 향하고 J4 전원선도 기판을 따라 안으로 정리돼요.",
            ],
          },
          {
            kicker: "너트",
            title: "앞에서 너트를 조여 고정해요.",
            body: [
              "케이스 앞쪽으로 나온 엔코더 축마다 동봉된 너트를 끼우고 펜치나 렌치로 단단히 조여요. 너트를 조여야 기판이 케이스 앞면에 밀착돼요.",
              "노브 캡은 아직 끼우지 않아요. 07장의 맨 마지막 단계에서 끼워요.",
            ],
          },
        ],
      },
    },
    {
      id: "wire",
      copy: {
        num: "05",
        title: "배선",
        lede: "패널과 기판을 케이블 두 개로 연결해요. 리본 케이블을 먼저 꽂고 이어서 전원선을 물려요.",
        steps: [
          {
            kicker: "리본 케이블",
            title: "J1에서 패널의 IN으로.",
            body: [
              "패널에 동봉된 HUB75 리본 케이블 한쪽을 기판의 J1에, 반대쪽을 패널 위쪽의 IN 커넥터에 꽂아요. 패널 아래쪽의 OUT 커넥터는 쓰지 않고 비워 둬요.",
              "플러그 옆면의 돌기를 헤더의 파인 홈에 맞춰 끝까지 눌러 꽂아요.",
            ],
          },
          {
            kicker: "J3",
            title: "패널 전원선은 J3에 물려요.",
            body: [
              "패널 뒷면 가운데 바로 아래의 4핀 전원 단자에 전원 케이블을 꽂고 반대쪽 두 가닥을 J3에 물려요. 빨간 선은 +5v 표시 쪽, 검은 선은 GND 쪽이에요.",
              "J3와 J4는 방향이 서로 반대예요. 뒤에서 볼 때 J3는 왼쪽이 +5v이고 J4는 오른쪽이 +5v이니 좌우 위치로 외우지 말고 기판에 적힌 +5v 표시를 보고 맞춰요.",
            ],
            warn: "극성을 거꾸로 물리면 패널이 바로 타 버릴 수 있어요. 전원을 넣기 전에 꼭 두 번 확인해요.",
            extra: "build:j3",
          },
        ],
      },
    },
    {
      id: "firmware",
      copy: {
        num: "06",
        title: "펌웨어와 첫 점등",
        lede: "DevKit에 먼저 펌웨어를 구운 뒤에 기판 소켓에 꽂아요.",
        steps: [
          {
            kicker: "굽기",
            title: "펌웨어는 연주 가이드에서 구워요.",
            body: [
              "아직 기판에 꽂지 않은 DevKit의 왼쪽 USB 포트를 컴퓨터에 연결하고 데스크톱 크롬이나 엣지에서 따로 구워요. 연주 가이드 01장의 순서대로 BOOT를 누른 채 RST를 한 번 눌렀다 떼고 BOOT에서 손을 뗀 다음 Flash Patternflow를 눌러요.",
              "설치가 끝난 직후에는 대개 와이파이 설정 창이 바로 뜨지 않아요. 원래 그러니 RST를 한 번 누른 뒤 다시 Flash Patternflow를 눌러 포트를 잡고 Connect to Wi-Fi로 2.4 GHz 와이파이를 연결해요. 지금 건너뛰어도 괜찮아요. 와이파이를 못 찾은 패널은 켜진 뒤에 자체 핫스팟을 직접 띄워요.",
            ],
            extra: "build:handoff",
          },
          {
            kicker: "꽂기",
            title: "전원을 뺀 채로 DevKit을 꽂아요.",
            body: [
              "구운 DevKit을 소켓 두 줄에 맞춰 수직으로 꾹 눌러 꽂아요. USB-C 포트가 기판 아래쪽 가장자리의 USB 표시 쪽으로 가고 안테나 끝이 엔코더 쪽을 향하면 돼요.",
              "양쪽 44핀이 한 칸도 밀리지 않고 다 들어갔는지 확인해요. 보조배터리는 다음 단계에서 꽂아요.",
            ],
          },
          {
            kicker: "첫 점등",
            title: "보조배터리를 연결해요.",
            body: [
              "보조배터리를 수납칸에 밀어 넣고 J4 전원선을 꽂아요. 1~2초 안에 패널에 Origin 패턴이 켜져요.",
              "처음엔 패턴이 하나만 들어 있는 게 정상이에요. 설치가 잘못된 게 아니에요. 나머지 Basics 팩은 연주 가이드 03장에서 넣어요.",
              "와이파이 설정을 건너뛰었거나 연결이 안 됐다면 전원을 켜고 15초쯤 뒤에 앞면 왼쪽 위 축인 K2를 1초간 꾹 눌러 봐요. HOTSPOT이라는 글자와 패널이 띄운 네트워크 이름이 나타나는데 접속 방법은 아까 멈췄던 연주 01장의 마지막 단계에 나와 있어요.",
            ],
            extra: "build:linksPlay03",
          },
        ],
      },
    },
    {
      id: "check",
      copy: {
        num: "07",
        title: "점검과 마무리",
        lede: "축 네 개와 길게 누르기 화면을 하나씩 확인하고 전원을 한 번 껐다 켜 봐요. 이상이 없으면 뒤판을 닫고 마지막에 노브를 끼워요.",
        steps: [
          {
            kicker: "돌리고 누르기",
            title: "축마다 돌리고 눌러 봐요.",
            body: [
              "축 네 개를 하나씩 좌우로 돌려 봐요. 돌릴 때마다 화면의 패턴이 뚜렷하게 바뀌어야 해요. 그다음 한 번씩 짧게 눌러 봐요. Origin에선 짧게 누르면 해당 노브 값이 초기값으로 돌아가요.",
              "앞에서 보면 위쪽이 K2와 K1이고 아래쪽이 K4와 K3예요.",
            ],
            extra: "build:checkKnobs",
          },
          {
            kicker: "꾹 누르기",
            title: "축마다 1초씩 꾹 눌러 봐요.",
            body: ["축마다 맡은 설정 화면이 열려요. K4는 패턴 목록인데 돌려서 고르고 다시 꾹 누르면 닫혀요."],
            extra: "build:knobMap",
          },
          {
            kicker: "껐다 켜기",
            title: "전원을 뺐다 꽂아도 바로 켜지는지.",
            body: [
              "보조배터리를 뺐다가 다시 꽂아 봐요. RST를 누르지 않아도 Origin이 알아서 다시 켜져야 해요. 만약 켜지지 않는다면 이슈 #16에 원인과 해결법이 정리돼 있어요.",
            ],
            extra: "build:linksGpio0",
          },
          {
            kicker: "뒤판 닫기",
            title: "오른쪽 가장자리부터 걸고 딸깍.",
            body: [
              "큰 뒤판의 오른쪽 가장자리를 먼저 홈에 걸고 스냅핏을 따라 눌러 딸깍 닫아요. 안쪽 케이블이 가장자리에 집히지 않게 정리해 넣어요.",
              "이어서 작은 뒷면 덮개를 기판 칸 위로 밀어 닫아요.",
            ],
            extra: "build:linksBack",
          },
          {
            kicker: "마지막",
            title: "덮개를 닫고 노브를 끼워요.",
            body: [
              "보조배터리 칸 덮개를 밀어 닫고 맨 마지막으로 검은 노브 네 개를 축에 맞춰 끝까지 눌러 끼워요.",
              "드디어 패턴플로우 완성이에요.",
            ],
          },
        ],
      },
    },
  ],
  next: {
    title: "불이 켜졌네요. 이제 연주해 봐요.",
    lede: "전원이 켜진 뒤의 이야기는 다음 가이드에 이어져요. 노브 네 개 다루기, 새 패턴 설치하기, 웹 콘솔 쓰는 법을 알아봐요.",
    groups: [{ label: "다음 가이드", items: ["노브 — 돌리고 누르고 길게 누르기", "패턴 — 와이파이로 33개 더", "콘솔 — 모든 설정을 브라우저에서"], to: "play" }],
    until: "잘 안 되는 부분이 있다면 기판의 알려진 문제 목록을 먼저 확인해 보세요:",
    links: [
      { label: "알려진 문제 · BUILD_GUIDE §10", href: GUIDE_SECTION.issues },
      { label: "납땜 영상", href: SOLDER_VIDEO },
      { label: "조립 영상", href: ASSEMBLY_VIDEO },
      { label: "BUILD_GUIDE.md", href: BUILD_GUIDE_MD },
    ],
    report: { title: "stuck", where: "조립 가이드 어딘가 (단계 없음)" },
  },
  cards: {
    bom: {
      tips: {
        U1: "소켓에 꽂아 써요. 납땜하지 않아요.",
        "U1 (sockets)": "DevKit을 꽂을 22핀 소켓 두 줄.",
        "SW1-SW4": "축 길이 20 mm. 기본 노브와 맞아요.",
        J1: "패널 리본 케이블을 꽂는 자리.",
        J3: "패널로 +5 V 전원을 내보내는 단자.",
        J4: "기판의 유일한 전원 입력 단자.",
        C11: "긴 다리가 +예요. 극성에 주의해요.",
        "M4 screw": "10 mm쯤. 12개면 다 채우고 6개도 단단해요.",
        "USB cable (sacrificial)": "잘라서 J4 전원선으로 만들어 쓸 케이블.",
        "USB power bank": "5 V 출력. 케이스 수납칸에 들어가야 해요.",
      },
      names: {
        "U1 (sockets)": "핀 소켓",
        "SW1-SW4": "로터리 엔코더",
        J1: "박스 헤더",
        J3: "나사 단자",
        J4: "나사 단자",
        C11: "전해 커패시터",
        "LED matrix panel": "LED 매트릭스 패널",
        "M4 screw": "M4 나사",
        "USB cable (sacrificial)": "USB 케이블 (절단용)",
        "USB power bank": "USB 보조배터리",
      },
      more: {
        U1: "에스프레시프 정품이 기준 부품이지만 알리익스프레스 호환 모듈도 대개 잘 돌아가요.",
        "SW1-SW4": "푸시 스위치가 달린 5핀 EC11 규격이면 다 맞아요. 너무 싼 묶음 상품은 불량이 좀 잦아요. 15 mm 축이면 노브는 knobs_15mm.stl을 뽑아요.",
        "M4 screw": "추천 링크의 패널에 맞는 나사예요. 다른 패널을 쓴다면 패널 나사산에 맞는 규격으로 준비해요.",
      },
      labels: { name: "BOM 표기", spec: "규격", mpn: "부품 번호" },
      panel: {
        listing: { label: "추천 판매 페이지", href: PANEL_LISTING },
        note: "제휴 링크라 추가 비용 없이 패턴플로우에 보탬이 돼요.",
        other: { label: "패널 호환성", href: PANEL_DOC },
      },
      source: "BOM 전체",
      guide: { label: "부품 구매 팁 · BUILD_GUIDE §1", href: GUIDE_SECTION.bom },
      missing: "부품 목록 원본은 BOM 파일에 있어요:",
    },
    tools: {
      items: [
        { label: "베드 크기 256 mm 이상인 3D 프린터", where: "§4", href: GUIDE_SECTION.print },
        { label: "본체용 흰색 PLA, 노브용 검정 PLA 필라멘트", where: "§4", href: GUIDE_SECTION.print },
        { label: "인두기, 땜납, 플럭스, 핀셋", where: "§1", href: GUIDE_SECTION.tools },
        { label: "니퍼, 십자 드라이버, 단자용 작은 일자 드라이버", where: "§1", href: GUIDE_SECTION.tools },
        { label: "분할 출력물을 붙일 순간접착제(CA)와 마스킹 테이프", where: "§4", href: GUIDE_SECTION.print },
        { label: "접합선 메우기용 퍼티 또는 베이킹소다와 순간접착제 (선택)", where: "§4", href: GUIDE_SECTION.print },
        { label: "엔코더 너트용 펜치나 렌치", where: "§6", href: GUIDE_SECTION.case },
      ],
      kept: "체크한 내역은 이 브라우저에 남아요.",
    },
    figures: [
      { value: "~2주", label: "부품 배송" },
      { value: "~10시간", label: "출력" },
      { value: "~1시간", label: "납땜과 조립" },
    ],
    caseFiles: {
      head: ["프린터 베드", "출력할 파일", ""],
      rows: [
        { bed: "256 mm · P1S, X1C, A1", file: "bed_256mm/encloser.stl", href: CASE_256, note: "위아래 두 조각으로 나와서 붙여요." },
        { bed: "330 mm 이상 · H2S", file: "bed_330mm/encloser.stl", href: CASE_330, note: "붙일 것 없는 일체형이에요. DevKit 쪽 구멍은 데이터용이지 전원용이 아니에요." },
        { bed: "다른 패널", file: "bed_256mm/for_other_panels/", href: CASE_OTHER, note: "256 mm 파일 대신 뽑아요. 나사 구멍 배치가 다른 패널에 맞출 수 있어요." },
      ],
      settingsLabel: "출력 설정",
      settings: ["노즐 0.4 mm", "레이어 0.2 mm", "일반 서포트 (트리 아님)", "브림 끔", "보조 팬 ~20%"],
      links: [
        { label: "MakerWorld", href: MAKERWORLD },
        { label: "patternflow_v3.3mf", href: THREE_MF },
        { label: "케이스 파일 전체", href: CASE_DIR },
      ],
    },
    order: {
      steps: ["소켓", "J1 · J3 · J4", "C11", "엔코더"],
      video: { label: "납땜 전 과정 영상", href: SOLDER_VIDEO },
      skip: "v3.0 기판으로 찍은 영상이라 11:00–15:18의 USB-C 납땜 구간은 건너뛰세요. v3.9 기판엔 USB-C 자리가 아예 없어요.",
    },
    terminals: {
      seen: "엔코더를 위쪽에 두고 케이스의 열린 뒤쪽에서 바라본 글씨 있는 면이에요.",
      red: "빨강",
      black: "검정",
      usb: "USB",
      j4: "전원 입력",
      j3: "패널 전원 출력",
    },
    checks: {
      checkKnobs: ["K1 돌리고 누르기", "K2 돌리고 누르기", "K3 돌리고 누르기", "K4 돌리고 누르기"],
    },
    handoff: {
      label: "펌웨어 굽기 — 연주 01",
      href: "/guide/play/ko#flash-2",
      line: "새 탭에서 열려요. DevKit을 다시 꽂는 전원 단계 직전까지만 따라 하고 이 탭으로 돌아오세요. 소켓에 꽂고 첫 전원을 켜는 과정은 여기서 이어져요.",
    },
    knobMap: { screens: ["밝기", "네트워크: 와이파이와 IP, 또는 HOTSPOT", "노브 번호 안내", "패턴 고르기"] },
    links: {
      linksPcb: [
        { label: "PCBWay 공유 프로젝트", href: PCBWAY },
        { label: "거버 zip, v3.9", href: GERBER },
        { label: "KiCad 원본", href: KICAD },
      ],
      linksWiring: [{ label: "조립 영상 06:57, 배선", href: `${ASSEMBLY_VIDEO}?t=417` }],
      linksPlay03: [{ label: "패턴 더 넣기: 연주 03", href: "/guide/play/ko#patterns" }],
      linksGpio0: [
        { label: "이슈 #16 · 켤 때마다 RST가 필요하다면", href: ISSUE_16 },
        { label: "알려진 문제 · BUILD_GUIDE §10", href: GUIDE_SECTION.issues },
      ],
      linksBack: [{ label: "조립 영상 09:11, 뒤판 닫기", href: `${ASSEMBLY_VIDEO}?t=551` }],
    },
  },
};

export const BUILD_COPY: Record<GuideLang, BuildCopy> = { en, ko };
