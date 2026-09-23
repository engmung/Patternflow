// What has grown out of Patternflow, one line each, rendered under the hero
// by Milestones.tsx. (Named -data because a file called milestones.ts would
// differ from Milestones.tsx only in case, which Windows cannot tell apart.)
//
// What earns a line: something somebody built ON Patternflow - a port, an
// instrument, an edition, a feature - and the one campaign that put it in
// people's hands. Not releases, not version numbers, not the author's own
// builds: those are the changelog, the shelf and the map. No dates either;
// the order is the order they are told in, not a claim about when.
//
// `who` credits the person as they wish to be credited; `href` is the page
// that tells the rest - a pin, the shelf, a pull request.
export type Milestone = {
  title: string;
  who?: string;
  href?: string;
};

export const milestones: Milestone[] = [
  {
    title: 'A Raspberry Pi port',
    who: 'day',
    href: '/inside/day-france',
  },
  {
    title: 'MOTIFLOW, a browser instrument built on Patternflow patterns',
    who: 'Azmano',
    href: '/inside/azmano-iran',
  },
  {
    title: 'The Performance edition: sequences on a timeline, MQTT in every role',
    who: 'Simone Majocchi',
    href: '/editions',
  },
  // FlowLocal is Simone's too and belongs here the day it is public; until
  // then it is not a thing a visitor can see, so it is not a line.
  {
    title: 'Sleep mode, and a pattern that survives power-off',
    who: 'bendobos',
    href: 'https://github.com/engmung/Patternflow/pull/314',
  },
  {
    title: 'The Crowd Supply campaign launches',
    href: 'https://www.crowdsupply.com/engmung/patternflow',
  },
];
