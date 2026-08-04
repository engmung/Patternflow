import { getDb } from "../src/lib/community/db";
import { newId } from "../src/lib/community/queries";
import { territories } from "../src/lib/community/schema";

// Seeds the map with the directions the project is actually open to.
//
// Territories are moderator data — there is no admin screen for them yet, so
// this script is the editor. Run it again after editing the list and it
// updates matching codes in place rather than duplicating them, so a title or
// a position can be corrected without losing the threads and pins hanging off
// that code.
//
//   npm run seed:map
//
// These are DIRECTIONS, not milestones: things somebody could pick up and take
// somewhere, which is a different list from /roadmap (what ships, and when).
// Positions are laid out for the constellation's 1440×640 stage, arranged
// around the device in the middle rather than in a row.

type Seed = {
  code: string;
  title: string;
  description: string;
  /** Floor-plan width, in columns of six. */
  span: number;
  /** Constellation position on the 1440×640 stage. */
  x: number;
  y: number;
  shippingNext?: boolean;
  questions?: string[];
};

const SEEDS: Seed[] = [
  {
    code: "A1",
    title: "Wired control — OSC",
    description:
      "Drive the panel from a program over a wire: OSC in, knobs and pattern selection out. Ableton, TouchDesigner, anything that speaks it.",
    span: 3,
    x: 270,
    y: 140,
    questions: ["USB or Ethernet?", "who owns the clock?"],
  },
  {
    code: "A2",
    title: "Laser-cut version",
    description:
      "A body that comes off a laser bed instead of a printer — flat parts, one material, cuttable anywhere there is a makerspace.",
    span: 3,
    x: 1090,
    y: 128,
    shippingNext: true,
    questions: ["acrylic or ply?"],
  },
  {
    code: "A3",
    title: "Bigger panels",
    description:
      "Port the firmware to larger and chained HUB75 panels. More pixels changes what a pattern can be, and what the frame has to hold.",
    span: 2,
    x: 1200,
    y: 420,
    questions: ["128×128?", "chained or one panel?"],
  },
  {
    code: "B1",
    title: "Pattern language",
    description:
      "What people can write in a pattern: helpers, colour ramps, shared building blocks — and what the editor should know about them.",
    span: 2,
    x: 960,
    y: 560,
  },
  {
    code: "B2",
    title: "Sound and sensors",
    description:
      "Patterns that answer to something: a microphone, a light sensor, a knob somebody else is turning in another room.",
    span: 2,
    x: 520,
    y: 520,
  },
  {
    code: "B3",
    title: "Getting one made",
    description:
      "Sourcing, assembly and the guide: how somebody with no kit and no help ends up with a working device.",
    span: 4,
    x: 175,
    y: 380,
  },
];

async function main() {
  const db = getDb();
  const now = new Date();
  let added = 0;
  let updated = 0;

  for (const [index, seed] of SEEDS.entries()) {
    const result = await db
      .insert(territories)
      .values({
        id: newId(),
        code: seed.code,
        title: seed.title,
        description: seed.description,
        span: seed.span,
        position: index,
        x: seed.x,
        y: seed.y,
        shippingNext: seed.shippingNext ?? false,
        questions: seed.questions?.join("\n") ?? null,
        createdAt: now,
      })
      // The code is the identity — threads and pins point at the row it names,
      // so re-running this edits a territory rather than replacing it.
      .onConflictDoUpdate({
        target: territories.code,
        set: {
          title: seed.title,
          description: seed.description,
          span: seed.span,
          position: index,
          x: seed.x,
          y: seed.y,
          shippingNext: seed.shippingNext ?? false,
          questions: seed.questions?.join("\n") ?? null,
        },
      })
      .returning({ id: territories.id, createdAt: territories.createdAt });

    // Drizzle's timestamp mode stores seconds, so the millisecond part of
    // `now` does not survive the round trip — compare at that resolution or a
    // freshly inserted row looks like an old one.
    const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
    if (result[0] && seconds(result[0].createdAt) === seconds(now)) added += 1;
    else updated += 1;
  }

  console.log(`Map seeded: ${added} added, ${updated} updated, ${SEEDS.length} total.`);
}

void main();
