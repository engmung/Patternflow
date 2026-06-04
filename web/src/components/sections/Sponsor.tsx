'use client';

import Image from "next/image";
import { captureEvent } from "@/lib/posthogEvents";

type Partner = {
  name: string;
  url: string;
  logo: string;
  width: number;
  height: number;
};

// Add future sponsors / collaborators here — one entry renders one logo.
const PARTNERS: Partner[] = [
  {
    name: "PCBWay",
    url: "https://www.pcbway.com/",
    logo: "/pcbway-logo.png",
    width: 132,
    height: 37,
  },
];

export default function Sponsor() {
  return (
    <section className="sponsor" aria-label="Sponsors">
      <span className="sponsor-label">Sponsors</span>
      <div className="sponsor-logos">
        {PARTNERS.map((p) => (
          <a
            key={p.name}
            className="sponsor-logo"
            href={p.url}
            target="_blank"
            rel="noopener"
            aria-label={p.name}
            onClick={() => captureEvent('sponsor_clicked', {
              surface: 'home',
              destination: p.name.toLowerCase(),
            })}
          >
            <Image src={p.logo} alt={p.name} width={p.width} height={p.height} priority={false} />
          </a>
        ))}
      </div>
    </section>
  );
}
