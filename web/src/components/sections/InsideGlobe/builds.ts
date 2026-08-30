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
export type BuildKind = 'build' | 'collaboration';

export type Build = {
  id: string;
  // The build's address on the map: /inside/<slug>. Maker then region, so a
  // link is readable on its own when it is sent to the person who made it.
  // Kept separate from `id` so renaming one never breaks links already shared.
  slug: string;
  kind: BuildKind;
  // For a collaboration, the pin it grew out of — the globe arcs a line back to
  // it. Defaults to the origin build when left out.
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
    slug: 'seunghun-france',
    kind: 'build',
    location: { lat: 48.8566, lng: 2.3522, label: 'Paris, France' },
    maker: 'Seunghun LEE',
    date: '2026-05',
    description: 'A gift sent to the first collaborator, and the second physical build. One of five 001 units from the first PCB order.',
  },
  {
    id: 'uk-nath',
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
    id: 'norway-enerjoy',
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
];

export function buildBySlug(slug: string): Build | undefined {
  return builds.find((build) => build.slug === slug);
}

// The pin a collaboration hangs off — its own origin, or the first build.
export function originOf(build: Build): Build | undefined {
  const origin = builds.find((entry) => entry.id === (build.originId ?? builds[0]?.id));
  return origin && origin.id !== build.id ? origin : undefined;
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
