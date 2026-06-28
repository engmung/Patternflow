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
      { src: '/builds/nath/front.jpg', alt: "Nath's Patternflow build, front view" },
      { src: '/builds/nath/front-angle.jpg', alt: "Nath's Patternflow build, front angle" },
      { src: '/builds/nath/angle.jpg', alt: "Nath's Patternflow build, side angle" },
      { src: '/builds/nath/back.jpg', alt: "Nath's Patternflow build, back view" },
      { src: '/builds/nath/custom-pattern.jpg', alt: "A custom pattern running on Nath's build" },
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
