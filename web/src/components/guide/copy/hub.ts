import type { GuideLang, GuidePageId } from "../store";

// The hub's words (/guide, GuideHub): where the reader picks a guide by
// where their Patternflow is. The hub is one glance — four names and, under
// each, the one line a reader recognises themselves in. Each guide's name
// and its chapter names come from the guide itself (pages.ts); what the
// guide covers is the guide's own opening to say, not the hub's. The brand,
// the WIP chip and the language switch are copy.ts's.
//
// Build is for someone soldering a Patternflow from bare parts — starting
// with nothing: its first chapters are buying the parts, ordering the board
// and printing the case, so its line must not say the parts are already on
// the bench. There are no kits and no assembled boards: never offer one.

export type HubGuideCopy = {
  /** Who it is for, in the reader's words: the one line they recognise themselves in. */
  situation: string;
};

export type HubCopy = {
  meta: { title: string; description: string };
  /** The small label over the page's one sentence. */
  kicker: string;
  /** The page's one sentence: what to do here. */
  title: string;
  guides: Record<GuidePageId, HubGuideCopy>;
  /** The page's "Stuck?" issue: the link and where it says the reader was. */
  report: { label: string; where: string };
};

const en: HubCopy = {
  meta: {
    title: "The Patternflow guide",
    description:
      "Four guides, by where you are: build a Patternflow from bare parts, play the one you've built, make your own patterns, and bring sound and MIDI to it with the Audio edition.",
  },
  kicker: "The guide",
  title: "Start where you are.",
  guides: {
    build: { situation: "You're soldering one from bare parts." },
    play: { situation: "Your Patternflow is built." },
    make: { situation: "It plays. Now make your own." },
    audio: { situation: "It plays. Now add sound and MIDI." },
  },
  report: { label: "Stuck? Tell us", where: "The guide, somewhere not listed" },
};

const ko: HubCopy = {
  meta: {
    title: "패턴플로우 가이드",
    description:
      "지금 단계에 맞춰 고르는 가이드 네 개. 부품부터 직접 납땜해 조립하기, 완성한 악기 연주하기, 내 패턴 만들기, 오디오 에디션으로 소리와 MIDI 연결하기까지.",
  },
  kicker: "가이드",
  title: "지금 있는 곳에서 시작해요.",
  guides: {
    build: { situation: "부품부터 하나씩 직접 납땜해 만들어요." },
    play: { situation: "패턴플로우를 다 만들었어요." },
    make: { situation: "잘 돌아가요. 이제 내 패턴을 만들어요." },
    audio: { situation: "잘 돌아가요. 이제 소리나 DAW를 이어요." },
  },
  report: { label: "막혔나요? 알려 주세요", where: "가이드 어딘가 (단계 없음)" },
};

export const HUB_COPY: Record<GuideLang, HubCopy> = { en, ko };
