import { describe, expect, it } from 'vitest';
import { builds, countCountries, countryOf, type Build } from './builds';
import {
  angularDistance, fanAngles, fanChordPx, fanLean, fanRadiusPx, groupBuilds, GROUP_ANGLE_DEG,
} from './groups';

const DEG = Math.PI / 180;

function at(id: string, lat: number, lng: number): Build {
  return {
    id,
    slug: id,
    kind: 'build',
    title: id,
    category: 'builds',
    location: { lat, lng, label: id },
    maker: id,
    date: '2026-01',
    description: '',
  };
}

const idsOf = (groups: ReturnType<typeof groupBuilds>) => groups.map((group) => group.members.map((build) => build.id));

describe('grouping builds that sit too close to tell apart', () => {
  it('puts every entry in exactly one group and moves none of them', () => {
    const before = JSON.stringify(builds);
    const groups = groupBuilds(builds);
    const seen = groups.flatMap((group) => group.members.map((build) => build.id)).sort();
    expect(seen).toEqual(builds.map((build) => build.id).sort());
    expect(JSON.stringify(builds)).toBe(before);
    for (const group of groups) {
      for (const member of group.members) expect(builds).toContain(member);
    }
  });

  it('groups two builds on the very same coordinates', () => {
    const groups = groupBuilds([at('a', 54, -2), at('b', 54, -2), at('far', 10, 100)]);
    expect(idsOf(groups)).toEqual([['a', 'b'], ['far']]);
    expect(groups[0].center.lat).toBeCloseTo(54, 6);
    expect(groups[0].center.lng).toBeCloseTo(-2, 6);
  });

  it('groups by distance, not by which side of the limit a longitude number falls', () => {
    // 2.9 degrees apart along the equator, and the same across the date line.
    expect(idsOf(groupBuilds([at('a', 0, 10), at('b', 0, 12.9)]))).toEqual([['a', 'b']]);
    expect(idsOf(groupBuilds([at('a', 0, 10), at('b', 0, 13.1)]))).toEqual([['a'], ['b']]);
    const acrossDateLine = groupBuilds([at('east', 0, 179), at('west', 0, -179)]);
    expect(idsOf(acrossDateLine)).toEqual([['east', 'west']]);
    expect(Math.abs(acrossDateLine[0].center.lng)).toBeCloseTo(180, 6);
    // Near a pole a degree of longitude is next to nothing.
    expect(idsOf(groupBuilds([at('a', 89, 0), at('b', 89, 90)]))).toEqual([['a', 'b']]);
  });

  it('does not chain a line of builds into one pin', () => {
    // Each 2 degrees from the next: neighbours are close, the ends are not.
    const row = [at('a', 0, 0), at('b', 0, 2), at('c', 0, 4), at('d', 0, 6)];
    const groups = groupBuilds(row);
    for (const group of groups) {
      for (const p of group.members) {
        for (const q of group.members) {
          expect(angularDistance(p.location, q.location)).toBeLessThanOrEqual(GROUP_ANGLE_DEG * DEG + 1e-9);
        }
      }
    }
    expect(idsOf(groups)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('orders a group west to east, and keeps the given order on one spot', () => {
    const groups = groupBuilds([at('east', 50, 1), at('first', 50, 0), at('west', 50, -1), at('second', 50, 0)]);
    expect(idsOf(groups)).toEqual([['west', 'first', 'second', 'east']]);
  });

  it('does not depend on the order the entries arrive in', () => {
    const forwards = groupBuilds(builds);
    const backwards = groupBuilds([...builds].reverse());
    expect(backwards.map((group) => group.id).sort()).toEqual(forwards.map((group) => group.id).sort());
  });

  it('reads the real map: the UK is three, France two, northern California three', () => {
    const multi = idsOf(groupBuilds(builds))
      .filter((ids) => ids.length > 1)
      .map((ids) => [...ids].sort());
    expect(multi).toHaveLength(3);
    expect(multi).toContainEqual(['uk-nath', 'uk-saladman', 'uk-slowrush']);
    expect(multi).toContainEqual(['france-day', 'paris-v1']);
    expect(multi).toContainEqual(['california-lopez', 'sf-swartz', 'usa-jon']);
  });

  it('follows the filter: a group is only the entries on show', () => {
    const builtOnly = builds.filter((build) => build.category === 'builds');
    const multi = idsOf(groupBuilds(builtOnly)).filter((ids) => ids.length > 1).map((ids) => [...ids].sort());
    // France loses its project and California its sale.
    expect(multi).toContainEqual(['uk-nath', 'uk-saladman', 'uk-slowrush']);
    expect(multi).toContainEqual(['california-lopez', 'usa-jon']);
    expect(multi).toHaveLength(2);
  });
});

describe('the count beside the list', () => {
  it('reads a country off the end of a label, and folds the UK into one', () => {
    expect(countryOf(at('a', 0, 0))).toBe('a');
    const named = (label: string) => countryOf({ ...at('x', 0, 0), location: { lat: 0, lng: 0, label } });
    expect(named('Leeds, UK')).toBe('United Kingdom');
    expect(named('United Kingdom')).toBe('United Kingdom');
    expect(named('San Francisco, USA')).toBe('USA');
    expect(countCountries(builds)).toBe(12);
  });
});

describe('the fan a group opens into', () => {
  it('stands above the shared point, first member leftmost, symmetric about straight up', () => {
    for (const count of [2, 3, 4, 7]) {
      const angles = fanAngles(count);
      expect(angles).toHaveLength(count);
      for (let i = 0; i < count; i += 1) {
        expect(Math.sin(angles[i])).toBeGreaterThan(0);                 // never below level
        expect(angles[i] + angles[count - 1 - i]).toBeCloseTo(Math.PI); // mirror pairs
        if (i > 0) expect(angles[i]).toBeLessThan(angles[i - 1]);        // left to right
      }
    }
  });

  it('keeps neighbouring pins apart on screen however small the pins are drawn', () => {
    for (const count of [2, 3, 5, 8]) {
      for (const pinPx of [2, 4.5, 8, 15, 30]) {
        const radius = fanRadiusPx(count, pinPx);
        const angles = fanAngles(count);
        const gap = Math.hypot(
          radius * (Math.cos(angles[0]) - Math.cos(angles[1])),
          radius * (Math.sin(angles[0]) - Math.sin(angles[1])),
        );
        expect(gap).toBeCloseTo(fanChordPx(pinPx), 6);
        expect(gap).toBeGreaterThan(29.999);             // a fingertip apart
        expect(gap).toBeGreaterThan(2 * pinPx);          // and never overlapping
      }
    }
  });

  it('stands straight up when nothing is in the way', () => {
    expect(fanLean(3, 32, 8, [])).toBe(0);
    // A neighbour below the shared point is not in the way of a fan above it.
    expect(fanLean(3, 32, 8, [{ x: 10, y: -30, r: 10 }])).toBe(0);
    // ...and a lean it no longer needs is given up.
    expect(fanLean(2, 32, 8, [{ x: 10, y: -30, r: 10 }], 0.5)).toBe(0);
  });

  it('tips away from a neighbour a pin would land on, and never below level', () => {
    const pinPx = 8;
    for (const count of [2, 3]) {
      const radius = fanRadiusPx(count, pinPx);
      // A neighbour sitting exactly where the leftmost pin would go.
      const [left] = fanAngles(count);
      const neighbour = { x: Math.cos(left) * radius, y: Math.sin(left) * radius, r: 12 };
      const lean = fanLean(count, radius, pinPx, [neighbour]);
      expect(lean).toBeGreaterThan(0);   // to the right, away from it
      for (const angle of fanAngles(count, lean)) {
        expect(Math.sin(angle)).toBeGreaterThan(0);
        const gap = Math.hypot(Math.cos(angle) * radius - neighbour.x, Math.sin(angle) * radius - neighbour.y);
        // Two pins have the room to get clear altogether. Three span too much
        // of the arc for that, and go as far as staying above level allows.
        if (count === 2) expect(gap).toBeGreaterThan(pinPx + neighbour.r);
        else expect(lean).toBeCloseTo((88 - 56) * DEG);
      }
      // Mirrored, it tips the other way by the same amount.
      expect(fanLean(count, radius, pinPx, [{ ...neighbour, x: -neighbour.x }])).toBeCloseTo(-lean);
    }
  });

  it('does not rock: a slight overlap is not worth tipping further for', () => {
    const radius = fanRadiusPx(2, 8);
    const [left] = fanAngles(2);
    // Two pixels short of clear: 8 * 1.45 + 10 + 3 = 24.6 needed, 22.6 given.
    const graze = { x: Math.cos(left) * radius - 22.6, y: Math.sin(left) * radius, r: 10 };
    expect(fanLean(2, radius, 8, [graze], 0)).toBe(0);
  });
});
