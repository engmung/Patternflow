export type BuildImage = {
  src: string;
  alt: string;
};

export type Build = {
  id: string;
  location: { lat: number; lng: number; label: string };
  maker: string;
  country: string;
  date: string;
  description: string;
  links?: { href: string; label: string }[];
  images?: BuildImage[];
};

export const builds: Build[] = [
  {
    id: 'seoul-v1',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    maker: 'Seunghun LEE',
    country: 'Korea',
    date: 'April 2026',
    description: 'The very first edition. One of five 001 units from the first PCB order.',
    images: [
      { src: '/builds/seunghun/1.jpg', alt: "Seunghun LEE's first Patternflow build" },
      { src: '/builds/seunghun/2.jpg', alt: "Seunghun LEE's first Patternflow build, another view" },
      { src: '/builds/seunghun/3.jpg', alt: "Seunghun LEE's first Patternflow build, detail" },
    ],
  },
  {
    id: 'paris-v1',
    location: { lat: 48.8566, lng: 2.3522, label: 'Paris, France' },
    maker: 'Seunghun LEE',
    country: 'France',
    date: 'May 2026',
    description: 'A gift sent to the first collaborator, and the second physical build. One of five 001 units from the first PCB order.',
  },
  {
    id: 'uk-nath',
    location: { lat: 51.5072, lng: -0.1276, label: 'United Kingdom' },
    maker: 'Nath',
    country: 'UK',
    date: 'June 2026',
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
    location: { lat: 52.2297, lng: 21.0122, label: 'Poland' },
    maker: 'shooter',
    country: 'Poland',
    date: 'June 2026',
    description: 'Shared through Discord with a clever twist — an LED diffuser layered from paper and acrylic that gives the panel a really fun, soft glow.',
    images: [
      { src: '/builds/shooter/main.jpg', alt: "shooter's Patternflow build with a paper-and-acrylic LED diffuser" },
      { src: '/builds/shooter/detail.jpg', alt: "Detail of shooter's layered paper-and-acrylic LED diffuser" },
    ],
  },
  {
    id: 'france-day',
    location: { lat: 46.6034, lng: 1.8883, label: 'France' },
    maker: 'day',
    country: 'France',
    date: 'July 2026',
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
    id: 'norway-enerjoy',
    location: { lat: 68.4385, lng: 17.4273, label: 'Narvik, Norway' },
    maker: 'Enerjoy',
    country: 'Norway',
    date: 'July 2026',
    description:
      'A black-edition Patternflow — and, remarkably, the maker\'s first-ever soldering job. It turned out beautifully.',
    images: [
      { src: '/builds/enerjoy/pattern.jpg', alt: "A red pattern glowing on Enerjoy's black-edition Patternflow" },
      { src: '/builds/enerjoy/setup.jpg', alt: "Enerjoy's black-edition Patternflow on the wall above a DJ setup" },
      { src: '/builds/enerjoy/build.jpg', alt: "Enerjoy's Patternflow mid-build, showing the PCB and black 3D-printed enclosure" },
    ],
  },
];

export function latLngToVec3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}
