// The catalogue of features — what a panel can carry, one at a time.
//
// A feature is a piece of firmware that attaches to the core without the core
// knowing it exists (firmware/patternflow/features/). A firmware on the shelf
// (/editions) is a composition of them. This page is the other axis: each
// feature on its own, with what it needs, where it lives, and a reel of it
// running. Editions are what you install; features are what you are
// choosing between when you do.
//
// Hand-curated, like the shelf. Reels are Instagram posts, embedded by their
// permalink; a feature without one says so rather than borrowing a neighbour's.

export type Reel = {
  /** The post's permalink, with its trailing slash. */
  url: string;
  /** What the reel actually shows — and, when it matters, what it does not. */
  caption: string;
};

export type Feature = {
  /** Directory under firmware/patternflow/features/, or "core". */
  id: string;
  name: string;
  summary: string;
  /** Hardware or software the feature depends on. Empty means "a panel". */
  needs: string[];
  /** How it reaches a panel: which shelf image carries it, or the recipe. */
  where: string;
  whereHref?: string;
  /** Printed only for a feature that is somebody else's to ask about. */
  maintainer?: string;
  maintainerHref?: string;
  links: { label: string; href: string }[];
};

export type Group = {
  id: string;
  title: string;
  blurb: string;
  reel?: Reel;
  features: Feature[];
};

const GH = "https://github.com/engmung/Patternflow";
const tree = (path: string) => `${GH}/tree/main/${path}`;
const blob = (path: string) => `${GH}/blob/main/${path}`;

export const GROUPS: Group[] = [
  {
    id: "panel",
    title: "The panel itself",
    blurb:
      "Before any feature: four knobs, a library of patterns, and a console " +
      "on your own network. Every firmware on the shelf starts from this.",
    reel: {
      url: "https://www.instagram.com/p/Dc2XHslzy8d/",
      caption:
        "Changing patterns from the knobs, the web console, and a pattern " +
        "uploaded from the community site landing on the panel.",
    },
    features: [
      {
        id: "core",
        name: "Core",
        summary:
          "Patterns turned by four encoders; a console over Wi-Fi for the " +
          "library, the knobs, networks, status and updates; patterns as " +
          "small .pfm files dropped on the panel from the community site or " +
          "the Pattern Lab, no rebuild. Switching firmware is one click and " +
          "keeps everything.",
        needs: [],
        where: "In every firmware — this is the default image.",
        whereHref: "/editions#core",
        links: [
          { label: "The shelf", href: "/editions" },
          { label: "Patterns, from the community to the panel", href: blob("PATTERN_GUIDE.md") },
          { label: "HTTP API", href: blob("docs/rest-api.md") },
        ],
      },
    ],
  },
  {
    id: "sound",
    title: "Sound",
    blurb:
      "Three ways for sound to reach the knobs: a microphone on the panel, an " +
      "analysis running in a browser or a phone, or software talking OSC. " +
      "They share one reel, and the reel is honest about which it shows.",
    reel: {
      url: "https://www.instagram.com/p/Dc7T60oyi9L/",
      caption:
        "The on-board microphone and the browser extension are in this one. " +
        "OSC into a DAW is not — it works the same way, it just was not " +
        "worth a second reel.",
    },
    features: [
      {
        id: "audio_in",
        name: "On-board microphone",
        summary:
          "A small PDM microphone on two DevKit pins; the panel does the FFT " +
          "itself and four bands become four lanes that move the knobs. The " +
          "Mic page on the console shapes each lane with a box, a curve and a " +
          "lookup table, live.",
        needs: ["A PDM microphone soldered to the DevKit — the part and the pins are in the audio guide"],
        where: "In the Audio firmware.",
        whereHref: "/editions#audio",
        links: [
          { label: "Audio guide", href: blob("AUDIO_GUIDE.md") },
          { label: "Source", href: tree("firmware/patternflow/features/audio_in") },
        ],
      },
      {
        id: "audio",
        name: "Audio-react from a browser or phone",
        summary:
          "The analysis runs where the sound already is: a browser extension " +
          "listens to a tab or the microphone, a small Android app listens on " +
          "a phone, and either streams four lanes to the panel over a " +
          "WebSocket. Nothing to solder.",
        needs: ["A computer or an Android phone on the same network"],
        where: "In the Audio firmware.",
        whereHref: "/editions#audio",
        links: [
          { label: "Browser extension", href: tree("tools/patternflow-audio-extension") },
          { label: "Android app", href: tree("tools/patternflow-audio-android") },
          { label: "Wire protocol", href: blob("docs/audio-ws-spec.md") },
          { label: "Source", href: tree("firmware/patternflow/features/audio") },
        ],
      },
      {
        id: "osc",
        name: "OSC",
        summary:
          "Max, TouchDesigner, Ableton Live through the Max for Live bridge: " +
          "the four knobs as OSC addresses, in both directions, over UDP. The " +
          "panel becomes one more thing on the patch bay.",
        needs: ["Software that speaks OSC on the same network"],
        where: "In the Audio firmware.",
        whereHref: "/editions#audio",
        links: [
          { label: "OSC spec", href: blob("docs/osc-spec.md") },
          { label: "Ableton bridge", href: tree("integrations/ableton") },
          { label: "Source", href: tree("firmware/patternflow/features/osc") },
        ],
      },
    ],
  },
  {
    id: "midi",
    title: "MIDI",
    blurb:
      "The panel as a MIDI port. A DAW holds the knobs with control changes, " +
      "presses the buttons with notes, picks a pattern with a program change — " +
      "and hears the knobs back as the encoders turn.",
    reel: {
      url: "https://www.instagram.com/p/Dc5TnuGSuJE/",
      caption:
        "Ableton Live driving the panel, and the panel's knobs mapped back " +
        "into Live, over the network.",
    },
    features: [
      {
        id: "midi",
        name: "MIDI",
        summary:
          "RTP-MIDI over Wi-Fi: the panel appears by name in macOS Audio MIDI " +
          "Setup or Windows rtpMIDI, and then in any DAW. CC 20–23 hold a " +
          "knob, CC 24–27 nudge it, notes 60–63 press the buttons, a program " +
          "change picks a pattern; the encoders go out as CC 24–27. The same " +
          "feature can also be the DevKit's USB port as a class-compliant MIDI " +
          "device, in a firmware built for it — data only; the panel is still " +
          "powered from its screw terminal.",
        needs: ["A DAW or anything that speaks MIDI; rtpMIDI on Windows for the network route"],
        where:
          "Over Wi-Fi: in the Audio firmware. Over USB: the midi composition in " +
          "the tree, built with build.sh midi — not on the shelf.",
        whereHref: "/editions#audio",
        links: [
          { label: "MIDI spec", href: blob("docs/midi-spec.md") },
          { label: "Live, step by step", href: blob("docs/director-midi.md") },
          { label: "USB build recipe", href: tree("firmware/bundles/midi") },
          { label: "Source", href: tree("firmware/patternflow/features/midi") },
        ],
      },
    ],
  },
  {
    id: "time",
    title: "Time",
    blurb:
      "A panel on a shelf that you glance at. The hours and minutes are cut " +
      "out of whatever pattern is running, so the edges stay soft and the " +
      "pattern keeps moving inside them.",
    reel: {
      url: "https://www.instagram.com/p/Dc97sPCSEGq/",
      caption: "The clock, in a few of its faces, over a running pattern.",
    },
    features: [
      {
        id: "clock",
        name: "Clock",
        summary:
          "Seven open-licensed faces, upright or wide, the digits either cut " +
          "from the pattern or solid over it; time zones with their summer-time " +
          "rule; a console page whose preview draws the same pixels the panel " +
          "does and sends every change as you make it.",
        needs: [],
        where:
          "A feature in the tree with its own recipe, firmware/bundles/clock — " +
          "build it with build.sh clock. It was on the shelf as its own firmware " +
          "until September 2026; the last image, v0.1.5, is on the v3.10.2 release.",
        whereHref: tree("firmware/bundles/clock"),
        links: [
          { label: "Console API", href: blob("docs/rest-api.md") },
          { label: "Source", href: tree("firmware/patternflow/features/clock") },
        ],
      },
    ],
  },
  {
    id: "performance",
    title: "Performance",
    blurb:
      "Simone Majocchi's set: the panel in a show, in a house, in more than " +
      "one place at once. Sequences that play on a wall clock, a broker in " +
      "every role, and the weather as a lane.",
    reel: {
      url: "https://www.instagram.com/p/DdBKiMGz1-E/",
      caption: "MQTT: a panel driven from a broker, and mirroring another.",
    },
    features: [
      {
        id: "mqtt",
        name: "MQTT",
        summary:
          "Every knob, pattern and lane as a topic: home automation writes " +
          "them, dashboards read them, and one panel can mirror another over " +
          "the broker. The absolute 0–1000 bus the Director also uses.",
        needs: ["A broker on the network"],
        where: "In the Performance firmware.",
        whereHref: "/editions#performance",
        maintainer: "Simone Majocchi",
        maintainerHref: "https://github.com/SimonePDA",
        links: [
          { label: "MQTT spec", href: blob("docs/mqtt-spec.md") },
          { label: "Source", href: tree("firmware/patternflow/features/mqtt") },
        ],
      },
      {
        id: "show",
        name: "Sequences and the Director",
        summary:
          "A show is a cue table the panel plays against a wall clock — " +
          "patterns, knob moves and eased ramps at their times — written in " +
          "the Pattern Lab's Director and dropped on the panel as a .pfs file. " +
          "Pause banks the clock; resume picks it back up.",
        needs: [],
        where: "In the Performance firmware.",
        whereHref: "/editions#performance",
        maintainer: "Simone Majocchi",
        maintainerHref: "https://github.com/SimonePDA",
        links: [
          { label: "Show file format", href: blob("docs/pfst-v2-spec.md") },
          { label: "The Director and Live", href: blob("docs/director-midi.md") },
          { label: "Source", href: tree("firmware/patternflow/features/show") },
        ],
      },
      {
        id: "weather",
        name: "Weather",
        summary:
          "Readings from OpenWeatherMap become a lane — a pattern that follows " +
          "the temperature outside, or the wind — with a small clock in the " +
          "corner. A page on the console holds the key and the place.",
        needs: ["An OpenWeatherMap key"],
        where: "In the Performance firmware.",
        whereHref: "/editions#performance",
        maintainer: "Simone Majocchi",
        maintainerHref: "https://github.com/SimonePDA",
        links: [{ label: "Source", href: tree("firmware/patternflow/features/weather") }],
      },
    ],
  },
];

// In the tree, in no firmware. Listed so that nobody rediscovers it.
export const IN_THE_TREE: Feature[] = [
  {
    id: "ble",
    name: "Wi-Fi setup over Bluetooth",
    summary:
      "Improv-BLE: a phone provisions the panel's Wi-Fi without a cable. The " +
      "lifecycle works on hardware, but linking it costs internal RAM every " +
      "pattern would rather have, and the one phone it was tried with never " +
      "listed the panel. Opt-in for whoever finishes it; the source records " +
      "what was measured.",
    needs: [],
    where: "Not in any firmware.",
    links: [{ label: "Source", href: tree("firmware/patternflow/features/ble") }],
  },
];
