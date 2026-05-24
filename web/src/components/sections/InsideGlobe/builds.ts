export type Build = {
  id: string;
  location: { lat: number; lng: number; label: string };
  maker: string;
  country: string;
  date: string;
  description: string;
};

export const builds: Build[] = [
  {
    id: 'seoul-v1',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    maker: 'Seunghun LEE',
    country: 'Korea',
    date: 'April 2026',
    description: 'The very first edition. One of five 001 units from the first PCB order.',
  },
  {
    id: 'paris-v1',
    location: { lat: 48.8566, lng: 2.3522, label: 'Paris, France' },
    maker: 'Seunghun LEE',
    country: 'France',
    date: 'May 2026',
    description: 'A gift sent to the first collaborator, and the second physical build. One of five 001 units from the first PCB order.',
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
