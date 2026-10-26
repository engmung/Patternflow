// The pattern page's knob sliders kept the range input's own arrow step,
// 0.001. Ten presses of ArrowRight took Knob 1 from 0.5 to 0.51, and the
// whole of Knob 2 (0.1..10) was 9,900 presses. The Lab's Knobs panel turns
// one detent a press through knobArrowValue, 48 across any range, and the
// page now does the same.

import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DETENTS_PER_TURN, TURNS_PER_FULL_RANGE } from "@/lib/shared/constants";
import { knobDetentStep } from "@/lib/pattern/controls";
import PatternDetailClient, { type PatternView } from "./PatternDetailClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
  },
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children: ReactNode }) => {
    delete (rest as { prefetch?: boolean }).prefetch;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));
// The preview runs pattern code in an iframe and the editor is Monaco. Neither
// is what these tests look at.
vi.mock("@/components/community/SandboxPreview", () => ({ default: () => null }));
vi.mock("@monaco-editor/react", () => ({ default: () => null }));

const PRESSES_ACROSS = DETENTS_PER_TURN * TURNS_PER_FULL_RANGE;

const PATTERN: PatternView = {
  id: "p1",
  title: "Tide",
  description: null,
  code: "// @knobs Hue=0..1, Speed=0.1..10, Mode=0..4.9, Offset=0..1\nfunction draw() {}",
  codeCpp: null,
  ownCpp: null,
  ownCppModeratedAt: null,
  portedBy: null,
  ports: [],
  performances: [],
  hasAuthorPerformance: false,
  license: "CC-BY-SA-4.0",
  madeOn: null,
  madeHow: null,
  visibility: "public",
  hiddenAt: null,
  provenance: { madeHow: null, madeHowLabel: null, madeHowBlurb: null, signals: [] },
  createdAt: "2026-10-01T00:00:00.000Z",
  username: "dora",
  displayUsername: "dora",
  parent: null,
  likeCount: 0,
  forkCount: 0,
};

const RANGES = [
  [0, 1],
  [0.1, 10],
  [0, 4.9],
  [0, 1],
] as const;
const LABELS = ["Hue", "Speed", "Mode", "Offset"];

function slider(label: string) {
  return screen.getByRole("slider", { name: `${label} value` }) as HTMLInputElement;
}

describe("pattern page knobs", () => {
  it("turn one detent on an arrow key, up on Right and Up, down on Left and Down", () => {
    render(<PatternDetailClient pattern={PATTERN} comments={[]} />);
    const hue = slider("Hue");
    expect(Number(hue.value)).toBe(0.5);
    // fireEvent returns false when the handler called preventDefault, which
    // keeps the input from adding its own 0.001 on top.
    expect(fireEvent.keyDown(hue, { key: "ArrowRight" })).toBe(false);
    expect(Number(hue.value)).toBeCloseTo(0.5 + knobDetentStep(RANGES[0]), 12);
    expect(screen.getByText("0.521")).toBeTruthy();
    fireEvent.keyDown(hue, { key: "ArrowUp" });
    fireEvent.keyDown(hue, { key: "ArrowLeft" });
    fireEvent.keyDown(hue, { key: "ArrowDown" });
    expect(Number(hue.value)).toBeCloseTo(0.5, 12);

    const speed = slider("Speed");
    fireEvent.keyDown(speed, { key: "ArrowLeft" });
    expect(Number(speed.value)).toBeCloseTo(5.05 - knobDetentStep(RANGES[1]), 12);
  });

  it("cross each knob's whole range in 48 presses and stop at the top", () => {
    render(<PatternDetailClient pattern={PATTERN} comments={[]} />);
    LABELS.forEach((label, index) => {
      const [min, max] = RANGES[index];
      const input = slider(label);
      fireEvent.change(input, { target: { value: String(min) } });
      expect(Number(input.value)).toBe(min);
      for (let press = 1; press < PRESSES_ACROSS; press++) fireEvent.keyDown(input, { key: "ArrowRight" });
      expect([label, Number(input.value) < max]).toEqual([label, true]);
      fireEvent.keyDown(input, { key: "ArrowRight" });
      expect([label, Number(input.value)]).toEqual([label, max]);
      fireEvent.keyDown(input, { key: "ArrowRight" });
      expect([label, Number(input.value)]).toEqual([label, max]);
    });
  });

  it("leave Home, End, Page keys and modified arrows to the input and the browser", () => {
    render(<PatternDetailClient pattern={PATTERN} comments={[]} />);
    const hue = slider("Hue");
    for (const event of [
      { key: "Home" },
      { key: "End" },
      { key: "PageUp" },
      { key: "ArrowRight", altKey: true },
      { key: "ArrowRight", ctrlKey: true },
      { key: "ArrowRight", metaKey: true },
    ]) {
      expect([event, fireEvent.keyDown(hue, event)]).toEqual([event, true]);
    }
    expect(Number(hue.value)).toBe(0.5);
  });
});
