// The catalogue of features — one line each, in one list.
//
// A feature is a piece of firmware that attaches to the core without the core
// knowing it exists (firmware/patternflow/features/). A firmware on the shelf
// (/editions) is a composition of them. The list here is flat on purpose:
// which firmware carries a feature is a fact printed on its row, never a
// heading the row sits under — otherwise the shelf would be back, one level
// up, and the reason features and firmwares are separate things would be
// gone with it.
//
// Hand-curated, like the shelf. Reels are Instagram posts embedded by their
// permalink, loaded only when a row is opened; a feature without one says so
// rather than borrowing a neighbour's, and a shared reel says which of its
// features it actually shows.

export type Reel = {
  /** The post's permalink, with its trailing slash. */
  url: string;
  /** What the reel shows for THIS feature — and, when it matters, what it does not. */
  caption: string;
};

/** The small tag on the row: where the feature is, in two words. */
export type Home = "every" | "audio" | "performance" | "recipe" | "none";

/**
 * A frozen image served from here so a feature that is not on the shelf
 * can still be tried in one click. Installed exactly the way the shelf
 * installs - through the panel's own /update page, the browser doing the
 * fetch - but never bumped with the core: it is the whole firmware as it
 * was the day it was built, and the row says so. check_versions.py reads
 * these urls, so the folder has to exist under web/public/flash/bin/.
 */
export type TryOut = {
  /** What the image reports as its variant version. */
  version: string;
  /** The core it was built on, as the image reports it. */
  core: string;
  /** The day it was built - what "frozen" is frozen at. */
  built: string;
  /** Site-relative path of the app image. Made absolute in the browser. */
  url: string;
  /** What is particular about trying THIS one. The generic caveat is printed once, by the component. */
  note: string;
};

export type Feature = {
  /** Directory under firmware/patternflow/features/, or "core". */
  id: string;
  name: string;
  /** The one line on the closed row. */
  line: string;
  /** The paragraph in the open row. */
  summary: string;
  /** Hardware or software the feature depends on. Empty means "a panel". */
  needs: string[];
  home: Home;
  /** How it reaches a panel, in a sentence: which firmware carries it, or the recipe. */
  where: string;
  whereHref?: string;
  /** Printed only for a feature that is somebody else's to ask about. */
  maintainer?: string;
  maintainerHref?: string;
  links: { label: string; href: string }[];
  reel?: Reel;
  tryOut?: TryOut;
};

export const HOME_LABEL: Record<Home, string> = {
  every: "every firmware",
  audio: "in Audio",
  performance: "in Performance",
  recipe: "recipe only",
  none: "did not work",
};

const GH = "https://github.com/engmung/Patternflow";
const tree = (path: string) => `${GH}/tree/main/${path}`;
const blob = (path: string) => `${GH}/blob/main/${path}`;

const REEL_BASICS = "https://www.instagram.com/p/Dc2XHslzy8d/";
const REEL_SOUND = "https://www.instagram.com/p/Dc7T60oyi9L/";
const REEL_MIDI = "https://www.instagram.com/p/Dc5TnuGSuJE/";
const REEL_CLOCK = "https://www.instagram.com/p/Dc97sPCSEGq/";
const REEL_MQTT = "https://www.instagram.com/p/DdBKiMGz1-E/";

const SIMONE = { maintainer: "Simone Majocchi", maintainerHref: "https://github.com/SimonePDA" };

export const FEATURES: Feature[] = [
  {
    id: "core",
    name: "The panel itself",
    line: "Four knobs, a pattern library, a console on your network: the base.",
    summary:
      "Patterns turned by four encoders; a console over Wi-Fi for the library, " +
      "the knobs, networks, status and updates; patterns as small .pfm files " +
      "dropped on the panel from the community site or the Pattern Lab, no " +
      "rebuild. Switching firmware is one click and keeps everything.",
    needs: [],
    home: "every",
    where: "In every firmware — this is the default image.",
    whereHref: "/editions#core",
    links: [
      { label: "The shelf", href: "/editions" },
      { label: "Patterns, from the community to the panel", href: blob("PATTERN_GUIDE.md") },
      { label: "HTTP API", href: blob("docs/rest-api.md") },
    ],
    reel: {
      url: REEL_BASICS,
      caption:
        "Changing patterns from the knobs, the web console, and a pattern " +
        "uploaded from the community site landing on the panel.",
    },
  },
  {
    id: "audio_in",
    name: "On-board microphone",
    line: "A microphone on the panel; four bands of the room move the knobs.",
    summary:
      "A small PDM microphone on two DevKit pins; the panel does the FFT " +
      "itself and four bands become four lanes that move the knobs. The Mic " +
      "page on the console shapes each lane with a box, a curve and a lookup " +
      "table, live.",
    needs: ["A PDM microphone soldered to the DevKit — the part and the pins are in the audio guide"],
    home: "audio",
    where: "In the Audio firmware.",
    whereHref: "/editions#audio",
    links: [
      { label: "Audio guide", href: blob("AUDIO_GUIDE.md") },
      { label: "Source", href: tree("firmware/patternflow/features/audio_in") },
    ],
    reel: {
      url: REEL_SOUND,
      caption: "The microphone is in this reel, with the browser extension; it is the sound reel for all three.",
    },
  },
  {
    id: "audio",
    name: "Browser or phone audio",
    line: "Sound analysed in a browser tab or on a phone, streamed to the panel.",
    summary:
      "A browser extension listens to a tab or the microphone, a small Android " +
      "app listens on a phone, and either streams four lanes to the panel over " +
      "a WebSocket. Nothing to solder.",
    needs: ["A computer or an Android phone on the same network"],
    home: "audio",
    where: "In the Audio firmware.",
    whereHref: "/editions#audio",
    links: [
      { label: "Browser extension", href: tree("tools/patternflow-audio-extension") },
      { label: "Android app", href: tree("tools/patternflow-audio-android") },
      { label: "Wire protocol", href: blob("docs/audio-ws-spec.md") },
      { label: "Source", href: tree("firmware/patternflow/features/audio") },
    ],
    reel: {
      url: REEL_SOUND,
      caption: "The browser extension is in this reel, with the microphone; it is the sound reel for all three.",
    },
  },
  {
    id: "osc",
    name: "OSC",
    line: "Max, TouchDesigner, Ableton: the knobs as OSC addresses, both ways.",
    summary:
      "The four knobs as OSC addresses over UDP, in both directions, so the " +
      "panel becomes one more thing on the patch bay. Ableton Live reaches it " +
      "through the Max for Live bridge in the repository.",
    needs: ["Software that speaks OSC on the same network"],
    home: "audio",
    where: "In the Audio firmware.",
    whereHref: "/editions#audio",
    links: [
      { label: "OSC spec", href: blob("docs/osc-spec.md") },
      { label: "Ableton bridge", href: tree("integrations/ableton") },
      { label: "Source", href: tree("firmware/patternflow/features/osc") },
    ],
    reel: {
      url: REEL_SOUND,
      caption:
        "The sound reel — OSC into a DAW is not in it. It works the same way as " +
        "what is; it just was not worth a second reel.",
    },
  },
  {
    id: "midi",
    name: "MIDI",
    line: "The panel as a MIDI port: a DAW drives it and hears the knobs back.",
    summary:
      "RTP-MIDI over Wi-Fi: the panel appears by name in macOS Audio MIDI Setup " +
      "or Windows rtpMIDI, and then in any DAW. CC 20–23 hold a knob, CC 24–27 " +
      "nudge it, notes 60–63 press the buttons, a program change picks a " +
      "pattern; the encoders go out as CC 24–27. The same feature can also be " +
      "the DevKit's USB port as a class-compliant MIDI device, in a firmware " +
      "built for it — data only; the panel is still powered from its screw " +
      "terminal.",
    needs: ["A DAW or anything that speaks MIDI; rtpMIDI on Windows for the network route"],
    home: "audio",
    where:
      "Over Wi-Fi: in the Audio firmware. Over USB: the midi composition in the " +
      "tree, not on the shelf — there is an image to try, below.",
    whereHref: "/editions#audio",
    links: [
      { label: "MIDI spec", href: blob("docs/midi-spec.md") },
      { label: "Live, step by step", href: blob("docs/director-midi.md") },
      { label: "USB build recipe", href: tree("firmware/bundles/midi") },
      { label: "Source", href: tree("firmware/patternflow/features/midi") },
    ],
    reel: {
      url: REEL_MIDI,
      caption: "Ableton Live driving the panel, and the panel's knobs mapped back into Live, over the network.",
    },
    tryOut: {
      version: "v0.1.0",
      core: "3.10.2",
      built: "2026-09-17",
      url: "/flash/bin/midi-v0.1.0/patternflow.ino.bin",
      note:
        "The USB build: while it is on, the DevKit's native USB port is a " +
        "class-compliant MIDI port plus a serial port, and the Wi-Fi route works " +
        "as well. Data only; the panel is powered from its screw terminal as ever.",
    },
  },
  {
    id: "clock",
    name: "Clock",
    line: "Hours and minutes cut out of the running pattern, in seven faces.",
    summary:
      "Seven open-licensed faces, upright or wide, the digits either cut from " +
      "the pattern or solid over it; time zones with their summer-time rule; a " +
      "console page whose preview draws the same pixels the panel does and " +
      "sends every change as you make it.",
    needs: [],
    home: "performance",
    where: "In the Performance firmware.",
    whereHref: "/editions#performance",
    links: [
      { label: "Console API", href: blob("docs/rest-api.md") },
      { label: "Source", href: tree("firmware/patternflow/features/clock") },
    ],
    reel: { url: REEL_CLOCK, caption: "The clock, in a few of its faces, over a running pattern." },
    tryOut: {
      version: "v0.1.5",
      core: "3.10.2",
      built: "2026-09-11",
      url: "/flash/bin/clock-v0.1.5/patternflow.ino.bin",
      note:
        "The clock as it shipped on the shelf with 3.10.2, before it left it: " +
        "the seven faces, the time zone, the console page.",
    },
  },
  {
    id: "mqtt",
    name: "MQTT",
    line: "Every knob and pattern as a topic; one panel can mirror another.",
    summary:
      "Home automation writes the knobs, dashboards read them, and one panel " +
      "can mirror another over the broker. The absolute 0–1000 bus the " +
      "Director also uses.",
    needs: ["A broker on the network"],
    home: "performance",
    where: "In the Performance firmware.",
    whereHref: "/editions#performance",
    ...SIMONE,
    links: [
      { label: "MQTT spec", href: blob("docs/mqtt-spec.md") },
      { label: "Source", href: tree("firmware/patternflow/features/mqtt") },
    ],
    reel: { url: REEL_MQTT, caption: "A panel driven from a broker, and mirroring another." },
  },
  {
    id: "show",
    name: "Sequences and Director",
    line: "Cue tables played on a wall clock, written in the Lab's Director.",
    summary:
      "A show is a cue table — patterns, knob moves and eased ramps at their " +
      "times — written in the Pattern Lab's Director and dropped on the panel " +
      "as a .pfs file. Pause banks the clock; resume picks it back up.",
    needs: [],
    home: "performance",
    where: "In the Performance firmware.",
    whereHref: "/editions#performance",
    ...SIMONE,
    links: [
      { label: "Show file format", href: blob("docs/pfst-v2-spec.md") },
      { label: "The Director and Live", href: blob("docs/director-midi.md") },
      { label: "Source", href: tree("firmware/patternflow/features/show") },
    ],
  },
  {
    id: "weather",
    name: "Weather",
    line: "OpenWeatherMap readings as a lane: a pattern that follows the sky.",
    summary:
      "Readings from OpenWeatherMap become a lane, with a small clock in the " +
      "corner. A page on the console holds the key and the place.",
    needs: ["An OpenWeatherMap key"],
    home: "performance",
    where: "In the Performance firmware.",
    whereHref: "/editions#performance",
    ...SIMONE,
    links: [{ label: "Source", href: tree("firmware/patternflow/features/weather") }],
  },
  {
    id: "ble",
    name: "Wi-Fi setup over Bluetooth",
    line: "A phone handing over Wi-Fi without a cable. Tried; it never worked.",
    summary:
      "Improv-BLE. The phone never listed the panel, and linking the Bluetooth " +
      "stack costs internal RAM every pattern would rather have. Left in the " +
      "tree where it stopped, so nobody starts it twice without knowing why; " +
      "the source says what was measured.",
    needs: [],
    home: "none",
    where: "Not in any firmware, and not planned.",
    links: [{ label: "Source", href: tree("firmware/patternflow/features/ble") }],
  },
];
