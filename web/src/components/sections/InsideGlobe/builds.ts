export type Build = {
  id: string;
  location: { lat: number; lng: number; label: string };
  sequenceLabel: string;
  maker: string;
  country: string;
  title: string;
  date: string;
};

export const builds: Build[] = [
  {
    id: 'seoul-v1',
    location: { lat: 37.5665, lng: 126.978, label: 'Seoul, Korea' },
    sequenceLabel: 'First build',
    maker: 'LEE',
    country: 'Korea',
    title: 'Patternflow v1.0',
    date: 'April 2026',
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
