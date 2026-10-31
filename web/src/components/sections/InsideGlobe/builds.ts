export type BuildImage = {
  src: string;
  alt: string;
};

// What a pin actually is. `build` is a Patternflow someone put together;
// `collaboration` is a separate work made together with Patternflow, which is a
// different claim and should not read as another unit out in the world. The
// globe draws the two differently and the pin's own page titles itself to match.
//
// Note this names the relationship, not the derivation: it fits a work made
// *with* us. A derivative someone builds on their own is not a collaboration
// and would need its own kind rather than being filed under this one.
//
// `sold` is a unit the maker sold, properly, for money. Units that left Seoul
// as gifts stay `build` (the Paris one set that precedent); sales are kept
// apart on purpose, because the maintainer wants them to be their own list —
// a /works page one day is a filter on this kind, not a second source of
// truth. The globe gives it its own pin and a line back to where it came from.
//
// `showing` is a unit set out somewhere for a while for people to play: an
// exhibition, a night by the turntables, a party. It is a unit that already has
// a pin, travelling, not Patternflow reaching a new place, so like a sale it
// stays out of the web, gets its own pin and a line back to that unit, and
// files under In use.
export type BuildKind = 'build' | 'collaboration' | 'sold' | 'showing';

// Subject of the entry, independent of the collaboration relationship above.
export type BuildCategory = 'builds' | 'projects' | 'in-use';
export type BuildFilter = 'all' | BuildCategory;
export const BUILD_FILTERS: { value: BuildFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'builds', label: 'Builds' },
  { value: 'projects', label: 'Projects' },
  { value: 'in-use', label: 'In use' },
];

export type Build = {
  id: string;
  // The build's address on the map: /inside/<slug>. Maker then region, so a
  // link is readable on its own when it is sent to the person who made it.
  // Kept separate from `id` so renaming one never breaks links already shared.
  slug: string;
  kind: BuildKind;
  title: string;
  category: BuildCategory;
  // For a collaboration, a sale or a showing, the pin it grew out of — the
  // globe arcs a line back to it. Defaults to the origin build when left out.
  originId?: string;
  // Where the pin sits and what it is called. Keep the two at the same
  // resolution: a city label gets the city's coordinates, a country label gets
  // the country's centre. Labelling a pin "Poland" while dropping it on Warsaw
  // claims a city the maker never gave us.
  location: { lat: number; lng: number; label: string };
  maker: string;
  // YYYY-MM. Stored sortable and formatted for display (see formatBuildDate),
  // so the list order is checkable rather than a promise the file makes to
  // itself. Day precision is more than any of these are known to.
  date: string;
  description: string;
  // A path into the site (/build?case=…) changes the tab in place; a full
  // address opens in a new tab. See PinLink.
  links?: { href: string; label: string }[];
  images?: BuildImage[];
};

// How many photos a pin puts on screen the moment it opens. The desktop globe
// overlay has room for a strip of three; the mobile card fits two beside each
// other. Both slice their list with these, and the preloader warms the larger
// of the two — so a build with fifteen photos costs the same up front as one
// with three, and the rest arrive when the lightbox is opened.
export const STRIP_TILES = 3;
export const CARD_TILES = 2;

export const builds: Build[] = [
  {
    id: 'seoul-v1',
    title: 'The first build',
    category: 'builds',
    slug: 'seunghun-korea',
    kind: 'build',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    maker: 'Seunghun LEE',
    date: '2026-04',
    description: 'The very first edition. One of five 001 units from the first PCB order.',
    images: [
      { src: '/builds/seunghun/1.jpg', alt: "Seunghun LEE's first Patternflow build" },
      { src: '/builds/seunghun/2.jpg', alt: "Seunghun LEE's first Patternflow build, another view" },
      { src: '/builds/seunghun/3.jpg', alt: "Seunghun LEE's first Patternflow build, detail" },
    ],
  },
  {
    id: 'paris-v1',
    title: 'The second build',
    category: 'builds',
    slug: 'seunghun-france',
    kind: 'build',
    location: { lat: 48.8566, lng: 2.3522, label: 'Paris, France' },
    maker: 'Seunghun LEE',
    date: '2026-05',
    description: 'A gift sent to the first collaborator, and the second physical build. One of five 001 units from the first PCB order.',
  },
  {
    id: 'uk-nath',
    title: "Nath’s build",
    category: 'builds',
    slug: 'nath-uk',
    kind: 'build',
    location: { lat: 54.0, lng: -2.0, label: 'United Kingdom' },
    maker: 'Nath',
    date: '2026-06',
    description: 'The first case of someone sharing their own Patternflow build through Discord.',
    images: [
      { src: '/builds/nath/custom-pattern.jpg', alt: "A custom pattern running on Nath's build" },
      { src: '/builds/nath/front.jpg', alt: "Nath's Patternflow build, front view" },
      { src: '/builds/nath/front-angle.jpg', alt: "Nath's Patternflow build, front angle" },
      { src: '/builds/nath/angle.jpg', alt: "Nath's Patternflow build, side angle" },
      { src: '/builds/nath/back.jpg', alt: "Nath's Patternflow build, back view" },
    ],
  },
  {
    id: 'poland-shooter',
    title: 'Paper & acrylic diffuser',
    category: 'builds',
    slug: 'shooter-poland',
    kind: 'build',
    location: { lat: 52.0, lng: 19.3, label: 'Poland' },
    maker: 'shooter',
    date: '2026-06',
    description: 'Shared through Discord with a clever twist — an LED diffuser layered from paper and acrylic that gives the panel a really fun, soft glow.',
    images: [
      { src: '/builds/shooter/main.jpg', alt: "shooter's Patternflow build with a paper-and-acrylic LED diffuser" },
      { src: '/builds/shooter/detail.jpg', alt: "Detail of shooter's layered paper-and-acrylic LED diffuser" },
    ],
  },
  {
    id: 'france-day',
    title: 'Raspberry Pi port',
    category: 'projects',
    slug: 'day-france',
    kind: 'build',
    location: { lat: 46.6034, lng: 1.8883, label: 'France' },
    maker: 'day',
    date: '2026-07',
    description:
      'The first port to a new platform — Patternflow reworked for a Raspberry Pi and a 64×32 LED matrix, in an enclosure adapted from another open-source design.',
    links: [
      { href: 'https://github.com/dayeggpi/pi-dashboard', label: 'github.com/dayeggpi/pi-dashboard' },
      { href: 'https://www.printables.com/model/850534-rgb-led-clock-case-64x32-matrix', label: 'Enclosure on Printables' },
    ],
    images: [
      { src: '/builds/day/ring.jpg', alt: "A blue ring pattern on day's Raspberry Pi Patternflow build in a white enclosure" },
      { src: '/builds/day/waves.jpg', alt: "Red and blue crossing waves on day's LED matrix build" },
      { src: '/builds/day/tiles.jpg', alt: "A colorful tiled pattern on day's LED matrix build" },
      { src: '/builds/day/noise.jpg', alt: "A red-and-white noise gradient on day's LED matrix build" },
    ],
  },
  {
    id: 'iran-azmano',
    title: 'MOTIFLOW',
    category: 'projects',
    slug: 'azmano-iran',
    kind: 'collaboration',
    location: { lat: 32.4, lng: 53.7, label: 'Iran' },
    maker: 'Azmano',
    date: '2026-07',
    description:
      'MOTIFLOW — a browser-based live visual instrument developed in collaboration with Azmano, using patterns adapted from Patternflow. Movement, sound, color, symmetry, and MIDI control turn the digital image into something that can be played.',
    links: [
      { href: 'https://azmano.art/portfolio-item/motiflow/', label: 'Project page on azmano.art' },
    ],
    images: [
      { src: '/builds/azmano/performance.webp', alt: 'A performer moving in front of a projected MOTIFLOW pattern, with an LED column glowing beside them' },
      { src: '/builds/azmano/interface.png', alt: 'The MOTIFLOW control interface with a red-and-white pattern on the canvas' },
      { src: '/builds/azmano/pattern.png', alt: 'A yellow-and-cyan tiled pattern generated in MOTIFLOW' },
    ],
  },
  {
    id: 'california-lopez',
    title: 'A gift, for the patterns',
    category: 'builds',
    slug: 'seunghun-california',
    kind: 'build',
    location: { lat: 36.7783, lng: -119.4179, label: 'California, USA' },
    maker: 'Seunghun LEE',
    date: '2026-09',
    description:
      'Sent to Martin Lopez, who put more patterns on the community wall — and more consistently, and more fun ones — than anyone. One of three units built with what the first sale earned.',
    images: [
      { src: '/builds/martin/lit.jpg', alt: "A pink and blue pattern of crosses and stars lit on Martin Lopez's Patternflow, in a dark room" },
    ],
  },
  {
    id: 'sf-swartz',
    title: 'The first sale',
    category: 'in-use',
    slug: 'seunghun-san-francisco',
    kind: 'sold',
    location: { lat: 37.7749, lng: -122.4194, label: 'San Francisco, USA' },
    maker: 'Seunghun LEE',
    date: '2026-09',
    description:
      'The first Patternflow sold as a work: $500, to Mike Swartz, for USER EXPERIENCE, an exhibition in San Francisco that opened in October 2026. This is the unit that spent the month before in front of the camera for Instagram. What it earned goes straight back into growing the community, as the certificate says.',
    links: [
      { href: 'https://www.instagram.com/userexperience.place', label: 'USER EXPERIENCE on Instagram' },
    ],
    images: [
      { src: '/builds/swartz/on-show.jpg', alt: 'The first sold Patternflow lying flat on a pale wooden table in the gallery, a teal and orange pattern on the panel and its card in front' },
      { src: '/builds/swartz/storefront.jpg', alt: 'The USER EXPERIENCE gallery from the street: a black front with the name in white above open glass doors' },
      { src: '/builds/swartz/gallery.jpg', alt: 'Inside the USER EXPERIENCE gallery: long wooden tables of objects, a rail of clothes and a blue wall at the back, the Patternflow lit on the nearest table' },
      { src: '/builds/swartz/certificate.jpg', alt: 'The certificate that went with the first sold Patternflow, beside its pattern card' },
    ],
  },
  {
    id: 'norway-enerjoy',
    title: 'Black enclosure',
    category: 'builds',
    slug: 'enerjoy-norway',
    kind: 'build',
    location: { lat: 68.4385, lng: 17.4273, label: 'Narvik, Norway' },
    maker: 'Enerjoy',
    date: '2026-07',
    description:
      'A black-edition Patternflow — and, remarkably, the maker\'s first-ever soldering job. It turned out beautifully.',
    images: [
      { src: '/builds/enerjoy/pattern.jpg', alt: "A red pattern glowing on Enerjoy's black-edition Patternflow" },
      { src: '/builds/enerjoy/setup.jpg', alt: "Enerjoy's black-edition Patternflow on the wall above a DJ setup" },
      { src: '/builds/enerjoy/build.jpg', alt: "Enerjoy's Patternflow mid-build, showing the PCB and black 3D-printed enclosure" },
    ],
  },
  {
    id: 'uae-simonepda',
    title: "SimonePDA’s build",
    category: 'builds',
    slug: 'simonepda-uae',
    kind: 'build',
    location: { lat: 25.4052, lng: 55.5136, label: 'Ajman, UAE' },
    maker: 'SimonePDA',
    date: '2026-07',
    description:
      '"I am an old time maker, and LED matrices always had a sweet spot on me. Now they are cheap to buy and cool for many projects. This one stands out because it is both huge and interactive. Generative Art using AI to code is another cool recent development and this design is made explicitly to include patterns designed and coded using even simple chatbots. Last but not least important is fully Open Sourced and very well documented, that is the true meaning of open sourcing a project."',
    links: [
      { href: 'https://www.instagram.com/simonepda', label: 'instagram.com/simonepda' },
    ],
    images: [
      { src: '/builds/simonepda/1.jpg', alt: "SimonePDA's Patternflow build in Ajman, UAE" },
      { src: '/builds/simonepda/2.jpg', alt: "SimonePDA's Patternflow build, view 2" },
      { src: '/builds/simonepda/3.jpg', alt: "SimonePDA's Patternflow build, view 3" },
      { src: '/builds/simonepda/4.jpg', alt: "SimonePDA's Patternflow build, view 4" },
      { src: '/builds/simonepda/5.jpg', alt: "SimonePDA's Patternflow build, view 5" },
    ],
  },
  {
    id: 'usa-nick',
    title: 'In the DJ booth',
    category: 'builds',
    slug: 'nick-usa',
    kind: 'build',
    location: { lat: 32.7157, lng: -117.1611, label: 'San Diego, USA' },
    maker: 'Nick',
    date: '2026-08',
    description:
      'One of the earliest people in the Discord, here since May. The build was finished in July and then reworked into this final version — it now runs in a DJ booth, above the turntables.',
    images: [
      { src: '/builds/nick/decks.jpg', alt: "A rainbow pattern on Nick's Patternflow, on the shelf above a turntable" },
      { src: '/builds/nick/setup.jpg', alt: "Nick's Patternflow lighting a whole DJ booth — turntables, a Xone:92 mixer and shelves of records" },
      { src: '/builds/nick/booth.jpg', alt: "Nick's Patternflow glowing blue above the mixer in a dark DJ booth" },
    ],
  },
  {
    id: 'usa-jon',
    title: 'Shoulder-strap case',
    category: 'builds',
    slug: 'jon-usa',
    kind: 'build',
    location: { lat: 39.5296, lng: -119.8138, label: 'Reno, USA' },
    maker: 'Jon',
    date: '2026-08',
    description:
      'A raspberry case with the Burning Man emblem inlaid in orange into the front panel. Printed D-ring anchors take a shoulder strap, so it can be worn to a festival. The juiciest one on the map yet.',
    images: [
      { src: '/builds/jon/man.jpg', alt: "Jon's Patternflow powered down, the Burning Man figure inlaid in orange into the front battery panel and the strap clipped to both sides" },
      { src: '/builds/jon/front.jpg', alt: "A blue pattern on Jon's raspberry-and-orange Patternflow, a shoulder strap running off one side" },
      { src: '/builds/jon/anchor.jpg', alt: "Close-up of the printed D-ring anchor carrying the shoulder strap on Jon's Patternflow" },
    ],
  },
  {
    id: 'mexico-alfredo',
    title: 'Wooden case',
    category: 'builds',
    slug: 'alfredo-mexico',
    kind: 'build',
    location: { lat: 19.4326, lng: -99.1332, label: 'Mexico City, Mexico' },
    maker: 'Alfredo Borboa',
    date: '2026-08',
    description:
      '"A wooden case that blends with any home decor. LED juiciness for any space in your home!"',
    images: [
      { src: '/builds/alfredo/lit.jpg', alt: "Alfredo Borboa's Patternflow in a pale wood case, a full-spectrum gradient across the panel" },
      { src: '/builds/alfredo/wood.jpg', alt: "Alfredo Borboa's wooden Patternflow case powered down, four turned walnut knobs down the front" },
      { src: '/builds/alfredo/glow.jpg', alt: "Colored light from Alfredo Borboa's Patternflow spilling across a wooden table" },
    ],
  },
  {
    id: 'uk-slowrush',
    title: 'Orange, in the garden',
    category: 'builds',
    slug: 'slowrush-uk',
    kind: 'build',
    location: { lat: 54.0, lng: -2.0, label: 'United Kingdom' },
    maker: 'slowrush',
    date: '2026-09',
    description:
      'A first build, on a v3 board that xponentone had spare and sent over — one member’s stock becoming another’s panel. Plain by the maker’s own account except for the colour, and the colour is the point: a fresh orange that sits well among the flowers. It came out beautifully, and it runs the clock.',
    images: [
      { src: '/builds/slowrush/garden.jpg', alt: "slowrush's orange Patternflow standing in a flower bed, a blue pattern on the panel" },
      { src: '/builds/slowrush/doorstep.jpg', alt: "slowrush's orange Patternflow on a doorstep with the garden behind it, a speckle of cyan and yellow on the panel" },
      { src: '/builds/slowrush/clock.jpg', alt: "slowrush's Patternflow on its side on a shelf at night, the clock showing 10:15 cut out of a pattern" },
    ],
  },
  {
    id: 'uk-saladman',
    title: 'Pastel, among the boomboxes',
    category: 'builds',
    slug: 'saladman-uk',
    kind: 'build',
    location: { lat: 53.8008, lng: -1.5491, label: 'Leeds, United Kingdom' },
    maker: 'saladman',
    date: '2026-09',
    description:
      '"Patternflow is such a crazy, cool and unique thing I had to build one for me and my kids to jam with. This is the start of a beautiful journey 🙂"',
    images: [
      { src: '/builds/saladman/boomboxes.jpg', alt: "saladman's pastel Patternflow on a shelf beneath a row of vintage boomboxes, a white and orange block pattern on the panel" },
      { src: '/builds/saladman/wall.jpg', alt: "A whole wall of shelves full of boomboxes, toys and model cars, with saladman's pastel Patternflow on the lower shelf" },
    ],
  },
  {
    id: 'germany-philipppp',
    title: 'Plaster shell, on the wall',
    category: 'builds',
    slug: 'philipppp-germany',
    kind: 'build',
    location: { lat: 51.1657, lng: 10.4515, label: 'Germany' },
    maker: 'Philipppp',
    date: '2026-10',
    description:
      'A Raspberry Pi 4 with a HUB75 HAT and custom firmware, in a self-designed 3D-printed case finished with a plaster shell. It hangs on the wall with four knobs and an on/off button, and it is wired mostly with jumper wires. It came out beautifully.',
    images: [
      { src: '/builds/philipppp/wall.jpg', alt: "Philipppp's Patternflow on a wall, seen at an angle: a green lattice pattern on the panel, a ribbed plaster side and four knobs in a slot" },
      { src: '/builds/philipppp/shell.jpg', alt: "The case without its panel: a 3D-printed frame under a ribbed plaster shell, held in one hand" },
      { src: '/builds/philipppp/inside.jpg', alt: "Inside Philipppp's case: a Raspberry Pi with a HUB75 HAT on the back of the LED panel, wired mostly with jumper wires" },
    ],
  },
  {
    id: 'ukraine-mbchars',
    title: 'Horizontal build',
    category: 'builds',
    slug: 'mbchars-ukraine',
    kind: 'build',
    location: { lat: 50.4501, lng: 30.5234, label: 'Kyiv, Ukraine' },
    maker: 'mbchars',
    date: '2026-10',
    description:
      "A horizontal Patternflow in orange and white, for a desk or a wall. The case is held together with brass inserts instead of glue. It is also the maker's first 3D design, first PCB order and first soldering job, and it came out beautifully.",
    links: [
      { href: 'https://github.com/engmung/Patternflow/tree/main/hardware/case/remixes/mbchars-horizontal-desktop-printed', label: 'Case files on GitHub' },
      { href: '/build?case=mbchars-horizontal-desktop-printed', label: 'Build this case' },
    ],
    images: [
      { src: '/builds/mbchars/front.jpg', alt: "mbchars's horizontal Patternflow from the front: a rainbow gradient on the panel, an orange side panel with four white knobs, and orange feet" },
      { src: '/builds/mbchars/angle.jpg', alt: "mbchars's Patternflow at an angle, blue and orange waves on the panel and a braided orange cable running off to the side" },
      { src: '/builds/mbchars/inside.jpg', alt: "Inside mbchars's case: the board in the orange control box beside the panel, with brass inserts at the corners" },
    ],
  },
  {
    id: 'russia-zuperzuche',
    title: 'The first print',
    category: 'builds',
    slug: 'zuperzuche-russia',
    kind: 'build',
    location: { lat: 55.7558, lng: 37.6173, label: 'Moscow, Russia' },
    maker: 'ZuperZuche',
    date: '2026-10',
    description:
      'Found by accident, with the PCBs ordered ten minutes later. A month on, the only thing missing was the case, so the maker bought a 3D printer and made it the first thing printed.',
    images: [
      { src: '/builds/zuperzuche/fuji.jpg', alt: "ZuperZuche's white horizontal Patternflow in front of a modular synthesizer, with a pixel-art Mount Fuji at sunset on the panel" },
      { src: '/builds/zuperzuche/frog-pond.jpg', alt: "A pixel-art frog pond on the panel of ZuperZuche's Patternflow: lily pads and small flowers on teal water, seen from above" },
      { src: '/builds/zuperzuche/cat.jpg', alt: "A cat plush in the foreground, with ZuperZuche's Patternflow behind it glowing red, purple and blue" },
    ],
  },
  {
    id: 'seoul-hongik',
    title: 'The process, on the wall',
    category: 'in-use',
    slug: 'seunghun-hongik-seoul',
    kind: 'showing',
    originId: 'seoul-v1',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    maker: 'Seunghun LEE',
    date: '2026-06',
    description:
      "The exhibition of the Hongik University course Authorial Design Studio (1), in the visual design department's corridor on the seventh floor of Hongmun Hall. The written process went up on the wall behind the unit. The unit died on the first day, and fixing it is how the SMD parts came off the board: the encoders' capacitors and resistors turned out not to be needed.",
    images: [
      { src: '/builds/hongik/wall.jpg', alt: 'A Patternflow with a red pattern on a table in front of a wall of pinned-up process notes, sketches and printouts, an open case and loose parts beside it' },
      { src: '/builds/hongik/lit.jpg', alt: 'The same table from the side, a blue and pink pattern on the panel and the notes running on along a red wall' },
    ],
  },
  {
    id: 'usa-morelli',
    title: 'A gift, for helping out',
    category: 'builds',
    slug: 'seunghun-philadelphia',
    kind: 'build',
    location: { lat: 39.9526, lng: -75.1652, label: 'Near Philadelphia, USA' },
    maker: 'Seunghun LEE',
    date: '2026-09',
    description:
      'Sent to Jake Morelli, at a studio near Philadelphia, who is helping out with Patternflow. One of three units built with what the first sale earned.',
  },
  {
    id: 'spain-vargas',
    title: 'A gift, to Spain',
    category: 'builds',
    slug: 'seunghun-spain',
    kind: 'build',
    location: { lat: 40.4637, lng: -3.7492, label: 'Spain' },
    maker: 'Seunghun LEE',
    date: '2026-09',
    description:
      'Sent to José Manuel Vargas, in Spain. One of three units built with what the first sale earned.',
  },
  {
    id: 'uae-simonepda-mqtt',
    title: 'Ajman to Seoul, over MQTT',
    category: 'projects',
    slug: 'simonepda-mqtt-uae',
    kind: 'collaboration',
    originId: 'seoul-v1',
    location: { lat: 25.4052, lng: 55.5136, label: 'Ajman, UAE' },
    maker: 'SimonePDA',
    date: '2026-09',
    description:
      "An MQTT link, tested with SimonePDA: a knob turned on SimonePDA's Patternflow in Ajman changed the panel of the first build in Seoul. flowlocal, a box that gives a Patternflow a hotspot of its own, comes out of the same work. Its source is on GitHub, with the Anbu setup.",
    links: [
      { href: 'https://github.com/engmung/patternflow-exhibition-2026/tree/main/firmware/flowlocal', label: 'flowlocal source on GitHub' },
    ],
    images: [
      { src: '/journal/the-messy-desk/flowlocal.jpg', alt: 'A flowlocal built in Seoul, held open: a battery cell and a small screen above the boards' },
    ],
  },
  {
    id: 'seoul-anbu',
    title: 'Played at Anbu',
    category: 'in-use',
    slug: 'seunghun-anbu-seoul',
    kind: 'showing',
    originId: 'seoul-v1',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    maker: 'Seunghun LEE',
    date: '2026-10',
    description:
      "Anbu (안부), an exhibition by visually impaired artists near Seoul Station. Patternflow was not the exhibit. It was a corner where visitors played the artists' paintings, illustrations and sculptures as patterns: one knob picks the work, the other three play it, and the sound follows the knobs. How it was set up, and the code it ran, are on GitHub.",
    links: [
      { href: 'https://github.com/engmung/patternflow-exhibition-2026', label: 'Setup and code on GitHub' },
    ],
    images: [
      { src: '/builds/anbu/visitors.jpg', alt: "A visitor turning the knobs of a Patternflow lying flat on a white plinth, a painting on its panel and the artists' works on the wall behind" },
      { src: '/builds/anbu/demo.jpg', alt: 'A Patternflow lying flat beside a laptop running Ableton Live, an orange pixel picture of a creature in sunglasses on its panel' },
    ],
  },
  {
    id: 'seoul-hongdae',
    title: 'A record bar in Hongdae',
    category: 'in-use',
    slug: 'seunghun-hongdae-seoul',
    kind: 'showing',
    originId: 'seoul-v1',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    maker: 'Seunghun LEE',
    date: '2026-10',
    description:
      'A DJ night at a record bar in Hongdae. A Patternflow with the microphone fitted stood beside the turntables and moved with the music, the first time the microphone was used outside home. Photos: mondkim.',
    images: [
      { src: '/builds/hongdae/decks.jpg', alt: 'A white Patternflow on the bar beside two turntables and a Pioneer mixer, a red and white tiled pattern on its panel' },
      { src: '/builds/hongdae/close.jpg', alt: 'Close on the Patternflow, red and white tiles on the panel, with the mixer and its cables behind' },
      { src: '/builds/hongdae/dj.jpg', alt: 'The DJ behind the decks with shelves of records at the back, a red swirl on the Patternflow in front' },
    ],
  },
  {
    id: 'uae-simonepda-lasercut',
    title: 'Laser-cut case',
    category: 'builds',
    slug: 'simonepda-lasercut-uae',
    kind: 'build',
    location: { lat: 25.4052, lng: 55.5136, label: 'Ajman, UAE' },
    maker: 'SimonePDA',
    date: '2026-10',
    description:
      'A case drawn for the laser cutter, and cut three times, in clear acrylic and in MDF. One flat plate carries everything: the panel screws on from behind, and the board sits beside it under a small finger-jointed box. The drawing is in the repository for anyone to cut.',
    links: [
      { href: 'https://github.com/engmung/Patternflow/tree/main/hardware/case/remixes/simonepda-lasercut', label: 'Case files on GitHub' },
      { href: '/build?case=simonepda-lasercut', label: 'Build this case' },
    ],
    images: [
      { src: '/cases/simonepda-lasercut/acrylic_front.jpg', alt: "SimonePDA's laser-cut case in clear acrylic, upright: the LED panel on the left, the board and its four knobs to the right" },
      { src: '/cases/simonepda-lasercut/mdf_front.jpg', alt: 'The same case cut in MDF and turned on its side: the LED panel above, four knobs below it on the right' },
      { src: '/cases/simonepda-lasercut/mdf_back.jpg', alt: 'The MDF case from behind: screws through the sheet into the panel, four windows over the panel’s connectors, the board under an acrylic box' },
      { src: '/cases/simonepda-lasercut/board_in_box.jpg', alt: 'The v3.0 board under its finger-jointed acrylic box, wired at the two screw terminals' },
    ],
  },
  {
    id: 'russia-besoiobiy',
    title: 'Lettered down the side',
    category: 'builds',
    slug: 'besoiobiy-russia',
    kind: 'build',
    location: { lat: 61.524, lng: 105.3188, label: 'Russia' },
    maker: 'Besoiobiy',
    date: '2026-10',
    description:
      'A printed case in two long pieces glued side by side: a frame around the panel, and a box for the board and the power bank with PATTERNFLOW lettered down it. Twelve M3 bolts clamp the frame, its covers and the panel together. The files are in the repository for anyone to print.',
    links: [
      { href: 'https://github.com/engmung/Patternflow/tree/main/hardware/case/remixes/besoiobiy-printed', label: 'Case files on GitHub' },
      { href: '/build?case=besoiobiy-printed', label: 'Build this case' },
    ],
    images: [
      { src: '/cases/besoiobiy-printed/built.jpg', alt: 'Besoiobiy’s build held upright: the lit LED panel on the left, the white box on the right with four black knobs at the top and PATTERNFLOW lettered down its side' },
    ],
  },
  {
    id: 'seoul-ddp',
    title: 'At Seoul Design Week',
    category: 'in-use',
    slug: 'seunghun-ddp-seoul',
    kind: 'showing',
    originId: 'seoul-v1',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    maker: 'Seunghun LEE',
    date: '2026-10',
    description:
      'Taken to the Seoul Design Week network party at DDP, Dongdaemun Design Plaza, on 16 October 2026, and left running on a table among the guests.',
    images: [
      { src: '/builds/ddp/pedestal.jpg', alt: 'A Patternflow on a round table draped in purple, the DJs and stage lights in the haze behind it' },
      { src: '/builds/ddp/crowd.jpg', alt: 'Guests crowding round the Patternflow, two of them filming it on their phones' },
      { src: '/builds/ddp/phones.jpg', alt: 'A hand at the knobs while someone films the panel on a phone, a red and white tiled pattern lit' },
      { src: '/builds/ddp/room.jpg', alt: "The party around the Patternflow's table, the lit glass wall of the hall behind" },
    ],
  },
  {
    id: 'belgium-jonwtr',
    title: 'Norns screen mirror',
    category: 'projects',
    slug: 'jonwtr-belgium',
    kind: 'build',
    location: { lat: 51.0543, lng: 3.7174, label: 'Ghent, Belgium' },
    maker: 'jonwtr',
    date: '2026-10',
    description:
      'Mirrors the screen of a shieldXL, a norns clone, onto the panel. Still a work in progress — laser-cut wood and a diffusing surface are next.',
    images: [
      { src: '/builds/jonwtr/goldeneye.jpg', alt: 'The norns screen mirrored in red on the panel: two tape reels and 007_goldeneye.wav' },
      { src: '/builds/jonwtr/mirror.jpg', alt: "From above: the shieldXL's green pad screen mirrored on the panel, beside a grid controller" },
      { src: '/builds/jonwtr/surface.jpg', alt: 'A shieldXL and a Synthux Simple Touch resting on the glowing panel, played with both hands' },
    ],
  },
  {
    id: 'russia-dmitryleeo',
    title: 'On air',
    category: 'builds',
    slug: 'dmitryleeo-russia',
    kind: 'build',
    location: { lat: 55.7558, lng: 37.6173, label: 'Moscow, Russia' },
    maker: "Dmitry Lee'O",
    date: '2026-10',
    description:
      'A black Patternflow connected to Cubase over RTP-MIDI and used in live performance. The maker plays original electronic music on YouTube, and the panel is joining the Friday stream.',
    links: [
      { href: 'https://www.youtube.com/@dmitryleeo', label: 'youtube.com/@dmitryleeo' },
    ],
    images: [
      { src: '/builds/dmitryleeo/on-air.jpg', alt: "Dmitry Lee'O's black Patternflow standing on a desk in a home studio, a red and white tile pattern on the panel and an ON AIR sign behind it" },
      { src: '/builds/dmitryleeo/space.jpg', alt: 'The same Patternflow on its side, a pixel-art spaceship and a planet on the panel' },
      { src: '/builds/dmitryleeo/studio.jpg', alt: 'The same Patternflow on its side between a mixer and a keyboard, a pixel-art platform game on the panel' },
    ],
  },
  {
    id: 'usa-jof-patternflood',
    title: 'Patternflood',
    category: 'builds',
    slug: 'jof-patternflood-usa',
    kind: 'build',
    location: { lat: 37.7749, lng: -122.4194, label: 'San Francisco, USA' },
    maker: 'jof',
    date: '2026-10',
    description:
      'Four P2 panels in a 2 × 2, 128 × 128 pixels, in a finger-jointed birch box laser-cut and etched at Sequoia Fabrica, a community makerspace. A Raspberry Pi 5 and a Colorlight card stand in for the v3 board; it runs every Patternflow pattern and the community’s, alongside its own.',
    links: [
      { href: 'https://github.com/jof/patternflood', label: 'Patternflood on GitHub' },
      { href: '/build?case=jof-patternflood', label: 'Build this one' },
    ],
    images: [
      { src: '/cases/jof-patternflood/front.jpg', alt: 'Patternflood upright on the floor: the dark 2 × 2 LED panel in the etched birch front, four black knobs below it on the left' },
      { src: '/cases/jof-patternflood/top.jpg', alt: 'Patternflood at an angle, its four push buttons along the top wall' },
      { src: '/cases/jof-patternflood/inside.jpg', alt: 'Patternflood with its back off: the Colorlight card and the Pi 5 on a birch tray, the ribbons above, the supply and the encoders below' },
      { src: '/cases/jof-patternflood/back.jpg', alt: 'The back cover, etched all over with circuit traces, a title block and two QR codes' },
    ],
  },
];

// One order for the text list and the globe's previous/next controls.
export const orderedBuilds = builds
  .map((build, index) => ({ build, index }))
  .sort((a, b) => b.build.date.localeCompare(a.build.date) || b.index - a.index)
  .map(({ build }) => build);

export function matchesBuildFilter(build: Build, filter: BuildFilter): boolean {
  return filter === 'all' || build.category === filter;
}

export function buildBySlug(slug: string): Build | undefined {
  return builds.find((build) => build.slug === slug);
}

// The pin a collaboration, a sale or a showing hangs off — its own origin, or
// the first build.
export function originOf(build: Build): Build | undefined {
  const origin = builds.find((entry) => entry.id === (build.originId ?? builds[0]?.id));
  return origin && origin.id !== build.id ? origin : undefined;
}

// The country a pin is in, read off the end of its label ("Leeds, UK" → the
// United Kingdom). Labels are written for people, so the one country that is
// spelled two ways is folded here rather than by rewording somebody's pin.
const COUNTRY_ALIASES: Record<string, string> = { UK: 'United Kingdom' };

export function countryOf(build: Build): string {
  const name = build.location.label.split(',').pop()!.trim();
  return COUNTRY_ALIASES[name] ?? name;
}

export function countCountries(entries: Build[]): number {
  return new Set(entries.map(countryOf)).size;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "2026-04" → "April 2026". Parsed by hand rather than through Date, which
// would drag the viewer's timezone into a value that has no time in it.
export function formatBuildDate(date: string): string {
  const [year, month] = date.split('-');
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : date;
}

export function latLngToVec3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}
