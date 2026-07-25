// Data for the project map. Node dates are real commit/release dates for
// shipped work; planned work is ordered by rough intention and rendered in a
// single "future" region (no fake months). `level: 1` nodes show in the
// overview; `level: 2` nodes only appear in the detailed view. `gate: true`
// marks a node as part of the v3.0.0 build release — hardware + guides, the
// things people physically build from. Software ships continuously and is
// never gated.

export type LaneId = 'pcb' | 'case' | 'guides' | 'firmware' | 'tools' | 'community';

export type RoadmapNode = {
  id: string;
  lane: LaneId;
  date: string;
  title: string;
  titleKo?: string;
  status: 'done' | 'planned';
  level: 1 | 2;
  gate?: boolean;
  detail: string;
  detailKo?: string;
  issues?: number[];
  links?: { label: string; href: string }[];
};

export type RoadmapEdge = { from: string; to: string; note: string };

export const NOW = '2026-07-26';

export const LANES: { id: LaneId; label: string; labelKo: string }[] = [
  { id: 'pcb', label: 'PCB', labelKo: 'PCB 회로' },
  { id: 'case', label: 'Enclosure', labelKo: '인클로저' },
  { id: 'guides', label: 'Guides', labelKo: '가이드' },
  { id: 'firmware', label: 'Firmware', labelKo: '펌웨어' },
  { id: 'tools', label: 'Pattern tools', labelKo: '패턴 도구' },
  { id: 'community', label: 'Community', labelKo: '커뮤니티' },
];

const REPO = 'https://github.com/engmung/Patternflow';

export const NODES: RoadmapNode[] = [
  // PCB
  {
    id: 'pcb-proto-v0',
    lane: 'pcb',
    date: '2026-03-29',
    title: 'First hardware prototype',
    titleKo: '첫 실물 프로토타입',
    status: 'done',
    level: 2,
    detail:
      'First hand-wired prototype: LED matrix + ESP32 + 4 potentiometers assembled in the club room, bringing Patternflow out of the web browser and into physical space at Mapo Saebit Cultural Forest.',
    detailKo:
      '동아리방에서 핸드와이어링으로 조립한 첫 실물 프로토타입(LED 매트릭스 + ESP32 + 4개 가변저항). 웹 브라우저 안의 패턴플로우를 마포새빛문화숲 야외 물리 공간으로 실재화했습니다.',
    links: [{ label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' }],
  },
  {
    id: 'pcb-v1',
    lane: 'pcb',
    date: '2026-04-26',
    title: 'v1 board',
    titleKo: 'v1.0 보드',
    status: 'done',
    level: 1,
    detail:
      'First public hardware release: gerbers, KiCad schematic, and a hand-solderable ESP32 + HUB75 board. Everything since is a refinement of this layout.',
    detailKo:
      '첫 공개 하드웨어 릴리스: Gerber, KiCad 회로도, 손납땜 가능한 ESP32 + HUB75 보드.',
  },
  {
    id: 'pcb-v2',
    lane: 'pcb',
    date: '2026-05-08',
    title: 'v2 fixes',
    titleKo: 'v2 버그 수정',
    status: 'done',
    level: 2,
    detail:
      'GPIO0 pull-up fix and encoder silkscreen corrections, driven directly by problems early community builders hit on v1 boards.',
    detailKo:
      '초기 빌더들의 피드백 반영: GPIO0 풀업 보정 및 엔코더 실크스크린 오류 수정.',
  },
  {
    id: 'pcb-v21',
    lane: 'pcb',
    date: '2026-06-18',
    title: 'v2.1 routing',
    titleKo: 'v2.1 배선 리라우팅',
    status: 'done',
    level: 2,
    detail:
      'Reworked ESP32-to-HUB75 routing and silkscreen cleanup. These are the currently recommended gerbers — the build guide is pinned to them.',
    detailKo:
      'ESP32-HUB75 배선 리라우팅 및 실크스크린 정리.',
  },
  {
    id: 'pcb-v22',
    lane: 'pcb',
    date: '2026-06-28',
    title: 'v2.2 USB-C test',
    titleKo: 'v2.2 USB-C 테스트',
    status: 'done',
    level: 1,
    detail:
      'Test board that moves power input to USB-C and goes fully SMD-free. Ordered on 2026-06-30 through a PCBWay gerber sponsorship. Once verified, this board gets promoted to v3. Moving the power connector also breaks the current enclosure, which was designed around v2.1 — so the case follows.',
    detailKo:
      '전원을 USB-C로 이동하고 완전 SMD-free로 개편한 테스트 보드 (PCBWay Gerber 스폰서십 제작).',
  },
  {
    id: 'pcb-usbc-safety',
    lane: 'pcb',
    date: '2026-07-20',
    title: 'USB-C power on hold & review',
    titleKo: 'USB-C 전원 재검토 (보류)',
    status: 'done',
    level: 2,
    detail:
      'USB-C power input placed on hold under active re-evaluation (Issue #221): investigating delayed connector burnout (20–30 min run before pin failure). Full re-evaluation of 14-pin THT vs power-only connectors in progress; builds pinned to 2-pin screw terminal (J4).',
    detailKo:
      'USB-C 입력 지연 탄화 현상(20~30분 구동 후 핀 탄화) 원인 조사 및 전면 재검토 진행 중 (Issue #221). DIY 빌더 전원은 2핀 스크류 터미널(J4)로 보정.',
    issues: [221],
    links: [{ label: 'Issue #221', href: `${REPO}/issues/221` }],
  },
  {
    id: 'pcb-v3',
    lane: 'pcb',
    date: '2026-07-20',
    title: 'v3.0.0 board',
    titleKo: 'v3.0.0 보드',
    status: 'done',
    level: 1,
    gate: true,
    detail:
      'v3.0.0 hardware release: reworked module positions, shrunk overall board size to reduce manufacturing costs, and added USB-C power footprint alongside the 2-pin screw terminal.',
    detailKo:
      'v3.0.0 하드웨어 릴리스: 모듈 배치 수정, 부품 배선 정리, 생산 단가 절감을 위한 전체 PCB 사이즈 축소.',
    links: [
      { label: 'hardware/pcb', href: `${REPO}/tree/main/hardware/pcb` },
      { label: 'Journal (v3 and beyond)', href: 'https://patternflow.work/journal/v3-and-beyond' },
    ],
  },

  // Enclosure
  {
    id: 'case-v1',
    lane: 'case',
    date: '2026-04-26',
    title: 'Original v1 case',
    titleKo: 'v1.0 인클로저',
    status: 'done',
    level: 1,
    detail:
      'The original enclosure, released with v1.0: a fully modeled Blender design with print-ready STLs, a parts breakdown, and print-time notes. This modeling is the ancestor every later case variant descends from.',
    detailKo:
      'v1.0 공개 케이스: Blender 3D 모델 및 STL 출력 파일, 출력을 위한 부품 분할.',
    links: [{ label: 'hardware/case', href: `${REPO}/tree/main/hardware/case` }],
  },
  {
    id: 'case-laser',
    lane: 'case',
    date: '2026-05-26',
    title: 'Laser-cut acrylic',
    titleKo: '레이저 커팅 아크릴',
    status: 'done',
    level: 2,
    detail:
      'A laser-cut acrylic variant of the v1 case, with its own Blender source — an alternative for people with cutter access instead of a 3D printer.',
    detailKo:
      '3D 프린터 대신 레이저 커터를 사용하는 유저를 위한 아크릴 케이스.',
  },
  {
    id: 'case-exp',
    lane: 'case',
    date: '2026-06-04',
    title: 'Print experiments',
    titleKo: '인클로저 출력 실험',
    status: 'done',
    level: 2,
    detail:
      'A long run of 3D-printing experiments through June, kicked off by a PCBWay 3D-printing sponsorship that funded test prints: flat plates, easybond, big-oneshot, easyfit with alignment tabs, one-shot print ribs, a wall-mount hanger — searching for a case that prints reliably without support pain.',
    detailKo:
      'PCBWay 3D 프린팅 스폰서십 기반 snap-fit, rib 구조 등 대규모 3D 출력 실험.',
  },
  {
    id: 'case-snapfit',
    lane: 'case',
    date: '2026-07-05',
    title: 'Snap-fit one-piece',
    titleKo: '일체형 스냅핏 케이스',
    status: 'done',
    level: 1,
    detail:
      'The one-piece snap-fit enclosure graduated to a print-ready option after a confirmed stable one-shot print. It needs a ~330 mm bed, and — important — it was designed around the v2.1 board, so it predates the USB-C power input.',
    detailKo:
      '서포트 없이 1회 출력 가능한 일체형 스냅핏 인클로저 설계.',
    links: [{ label: 'Issue #113 (closed)', href: `${REPO}/issues/113` }],
  },
  {
    id: 'case-v3',
    lane: 'case',
    date: '2026-07-20',
    title: 'v3 snap-fit enclosure',
    titleKo: 'v3 스냅핏 인클로저',
    status: 'done',
    level: 1,
    gate: true,
    detail:
      'v3 enclosure release: added snap-fit joints and overall tolerance improvements to elevate product quality for the Crowd Supply launch.',
    detailKo:
      'v3.0.0 전용 인클로저: 스냅핏 결합부 보강 및 유격 공차 개선으로 완성도를 올린 크라우드 서플라이 런칭용 케이스.',
    links: [{ label: 'hardware/case', href: `${REPO}/tree/main/hardware/case` }],
  },

  // Guides
  {
    id: 'guide-v1',
    lane: 'guides',
    date: '2026-04-26',
    title: 'Build guide v1',
    titleKo: 'v1 빌드 가이드',
    status: 'done',
    level: 1,
    detail:
      'The first full build guide shipped with the public launch — BOM, sourcing links, assembly steps, firmware flashing. Iterated on community feedback from day one (soldering temps, encoder shaft specs, GPIO0 workarounds).',
    detailKo:
      'BOM, 부품 구매 링크, 조립 과정, 펌웨어 업로드 가이드 첫 출간.',
    links: [{ label: 'BUILD_GUIDE.md', href: `${REPO}/blob/main/BUILD_GUIDE.md` }],
  },
  {
    id: 'guide-photos',
    lane: 'guides',
    date: '2026-05-03',
    title: 'Photo rewrite',
    titleKo: '사진/영상 가이드 개편',
    status: 'done',
    level: 2,
    detail:
      'The comprehensive rewrite: build photos and videos for every step, a pin reference, restructured sections. The guide went from "notes" to something a stranger can actually follow.',
    detailKo:
      '모든 단계마다 실물 조립 사진과 영상을 첨부하여 가이드를 대대적으로 개선.',
  },
  {
    id: 'guide-breadboard',
    lane: 'guides',
    date: '2026-06-28',
    title: 'Breadboard guide',
    titleKo: '빵판(Breadboard) 가이드',
    status: 'done',
    level: 2,
    detail:
      'A solder-free build path on a breadboard, lowering the entry bar for people who want to try Patternflow before committing to a PCB order.',
    detailKo:
      '납땜 없이 빵판에서 패턴플로우를 직접 만들어볼 수 있는 진입 가이드.',
  },
  {
    id: 'guide-tht',
    lane: 'guides',
    date: '2026-07-05',
    title: 'Through-hole BOM',
    titleKo: 'Through-hole BOM 개편',
    status: 'done',
    level: 2,
    detail:
      'The BOM went all-through-hole (SMD passives dropped) and the guide was pinned to the v2.1 gerbers, with a heads-up that v3.0 is coming.',
    detailKo:
      'SMD 소자를 전부 제거하고 100% Through-hole(THT) 부품으로 BOM 개편.',
  },
  {
    id: 'guide-rebuild',
    lane: 'guides',
    date: '2026-07-20',
    title: 'Build guide v3.0.0',
    titleKo: 'v3.0.0 빌드 가이드',
    status: 'done',
    level: 1,
    gate: true,
    detail:
      'Build guide updated for v3.0.0 hardware and snap-fit enclosure: BOM, assembly steps, and wiring diagrams updated for the v3 release.',
    detailKo:
      'v3 보드 및 스냅핏 케이스에 맞춘 빌드 가이드 완전 개정.',
    links: [{ label: 'BUILD_GUIDE.md', href: `${REPO}/blob/main/BUILD_GUIDE.md` }],
  },
  {
    id: 'guide-pattern',
    lane: 'guides',
    date: '2026-08-28',
    title: 'Pattern guide',
    titleKo: '패턴 제작 가이드',
    status: 'planned',
    level: 1,
    gate: true,
    detail:
      'The first proper pattern-creation guide: from the web tools to code running on the device. This is the on-ramp for people who want to make patterns rather than build hardware.',
    detailKo:
      '웹 툴부터 디바이스 C++ 실행까지 패턴을 직접 만드는 개발자를 위한 정식 가이드.',
  },

  // Firmware
  {
    id: 'fw-v1',
    lane: 'firmware',
    date: '2026-04-26',
    title: 'v1.0 firmware',
    titleKo: 'v1.0 펌웨어',
    status: 'done',
    level: 1,
    detail:
      'The firmware as first open-sourced: single hardcoded patterns, hardware configs extracted to config.h, flashable from the browser via ESP Web Tools.',
    detailKo:
      '웹 브라우저(ESP Web Tools)에서 직접 플래싱 가능한 오픈소스 초기 펌웨어.',
  },
  {
    id: 'fw-foundation',
    lane: 'firmware',
    date: '2026-05-21',
    title: 'ESP32 optimization',
    titleKo: 'ESP32 펌웨어 대개편',
    status: 'done',
    level: 1,
    detail:
      'The big structural rewrite that made patterns fast on the ESP32: shared core_math / core_color / core_noise libraries, patterns drawing through PFCanvas instead of the raw display driver, gamma LUT, ~240 Hz refresh to kill camera flicker, encoder acceleration. Everything since builds on this.',
    detailKo:
      'shared core_math / core_color / core_noise 라이브러리, PFCanvas 드라이버, 감마 LUT, ~240Hz 주사율, 엔코더 가속 알고리즘 도입.',
  },
  {
    id: 'fw-osc',
    lane: 'firmware',
    date: '2026-05-27',
    title: 'OSC · OTA · audio',
    titleKo: 'OSC · OTA · 오디오',
    status: 'done',
    level: 2,
    detail:
      'Two-way OSC control, wireless OTA flashing, and the audio-react experiments (a websocket server driving virtual knobs). The async rewrite of audio-react was rolled back — the Ableton bridge later picked up that thread.',
    detailKo:
      '양방향 OSC 제어, 무선 OTA 펌웨어 업데이트, 오디오 반응 실험.',
  },
  {
    id: 'fw-v2',
    lane: 'firmware',
    date: '2026-06-22',
    title: 'v2.0.0 presets',
    titleKo: 'v2.0.0 프리셋 시스템',
    status: 'done',
    level: 1,
    detail:
      'Pattern system release: a curated preset library plus reusable custom slots with a custom-first registry, and pattern licensing settled as CC-BY-SA-4.0.',
    detailKo:
      '큐레이션 프리셋 라이브러리 및 커스텀 슬롯 지원 (CC-BY-SA 4.0 라이선스).',
  },
  {
    id: 'fw-improv',
    lane: 'firmware',
    date: '2026-06-23',
    title: 'Improv Wi-Fi',
    titleKo: 'Improv Wi-Fi 설정',
    status: 'done',
    level: 2,
    detail:
      'Improv-Serial Wi-Fi provisioning during browser flashing, plus a live pattern preview behind the select screen.',
    detailKo:
      '브라우저 플래싱 중 시리얼 기반 Wi-Fi 프로비저닝 지원.',
  },
  {
    id: 'fw-ableton',
    lane: 'firmware',
    date: '2026-07-04',
    title: 'Ableton bridge',
    titleKo: 'Ableton Live 연동 브릿지',
    status: 'done',
    level: 2,
    detail:
      'A Max for Live OSC bridge: Ableton Live parameters drive the device knobs directly, with ping/announce auto-discovery on the firmware side.',
    detailKo:
      'Max for Live OSC 브릿지: Ableton 파라미터로 패턴플로우 엔코더/패턴을 직접 드라이브.',
  },
  {
    id: 'fw-browser-build',
    lane: 'firmware',
    date: '2026-07-25',
    title: 'Browser firmware worker',
    titleKo: '웹 브라우저 펌웨어 빌더',
    status: 'done',
    level: 1,
    detail:
      'Cloud build queue + Web Serial flasher (PR #230, #231): write or generate custom patterns in Pattern Lab, compile ESP32-S3 firmware in the browser via build worker, and flash directly over Web Serial without local Arduino IDE setup.',
    detailKo:
      '클라우드 빌드 워커 + Web Serial 플래셔: 로컬 아두이노 설치 없이 웹에서 직접 펌웨어 컴파일 및 USB 플래싱 (#230, #231).',
    issues: [230, 231],
  },
  {
    id: 'fw-resolution',
    lane: 'firmware',
    date: '2026-09-15',
    title: 'Any-resolution engine',
    titleKo: '자유 해상도 엔진',
    status: 'planned',
    level: 1,
    detail:
      'Patterns render at whatever HUB75 panel size you own — pick a resolution, the engine adapts. This is the technical key that opens Patternflow to existing LED signboards, not just the official 64×64 build. Software stream: ships when ready, not gated on v3.0.0.',
    detailKo:
      '64x64뿐만 아니라 상용 전광판 등 모든 HUB75 LED 패널 해상도에 맞춰 렌더링하는 범용 엔진.',
  },

  // Pattern tools
  {
    id: 'tools-origin',
    lane: 'tools',
    date: '2026-01-11',
    title: 'Patternflow origin',
    titleKo: '패턴플로우 오리진',
    status: 'done',
    level: 1,
    detail:
      'Where it all started: the original generative-art website, months before any hardware existed — a node-based pattern studio, URL-shareable presets, 3D relief patterns. Still live at origin.patternflow.work. The pattern-making DNA of the project predates the device.',
    detailKo:
      '하드웨어 제작 몇 달 전, 노드 기반 패턴 스튜디오 및 3D 릴리프 패턴을 선보였던 원형 웹사이트 (origin.patternflow.work).',
    links: [{ label: 'origin.patternflow.work', href: 'https://origin.patternflow.work/' }],
  },
  {
    id: 'tools-paik',
    lane: 'tools',
    date: '2026-01-28',
    title: 'Nam June Paik Art Center',
    titleKo: '백남준아트센터 영감',
    status: 'done',
    level: 1,
    detail:
      'The project’s second root. The trip was originally to see a different artist’s exhibition — Paik’s own permanent works, Participation TV and Robot K-456, and a 20th-anniversary memorial performance were all chance encounters the same day. Months later, an assignment in an "Authorial Design Studio" class asking students to reinterpret a senior artist gave that chance visit a name: Patternflow as a contemporary Participation TV, where the audience becomes the creator instead of just the viewer.',
    detailKo:
      '백남준의 <Participation TV> 관람 ➔ 대중이 관객을 넘어 직접 빛을 연주하는 참여형 예술로서의 핵심 영감.',
    links: [
      {
        label: 'Patternflow in 30 days (journal)',
        href: 'https://patternflow.work/journal/v1-30-days/en',
      },
      {
        label: 'Nam June Paik, Me, Patternflow (journal)',
        href: 'https://patternflow.work/journal/nam-june-paik-me-patternflow/en',
      },
    ],
  },
  {
    id: 'tools-editor',
    lane: 'tools',
    date: '2026-05-04',
    title: 'Live Editor',
    titleKo: '웹 라이브 에디터',
    status: 'done',
    level: 1,
    detail:
      'The in-browser live pattern editor with JS-to-C++ parity and an AI conversion prompt — write a pattern on the website, carry it to the device.',
    detailKo:
      'JS-to-C++ 파리티 및 AI 변환 프롬프트를 갖춘 브라우저 내 라이브 패턴 에디터.',
  },
  {
    id: 'tools-lab',
    lane: 'tools',
    date: '2026-05-13',
    title: 'Pattern Lab',
    titleKo: '패턴랩 (Pattern Lab)',
    status: 'done',
    level: 2,
    detail:
      'The pattern development harness with calibrated knobs, plus the Video Baker experiment (later retired when video mode was dropped from firmware).',
    detailKo:
      '노브 조작 튜닝 및 패턴 개발 하네스 스튜디오.',
  },
  {
    id: 'tools-gemini',
    lane: 'tools',
    date: '2026-06-24',
    title: 'Gemini generation',
    titleKo: 'Gemini AI 패턴 생성',
    status: 'done',
    level: 1,
    detail:
      'In-app AI pattern generation in Pattern Lab — bring your own Gemini key, describe a pattern, get running code. The proof of concept for AI-assisted pattern making.',
    detailKo:
      'Pattern Lab 내 Gemini API 키 연동으로 텍스트 묘사를 통해 패턴 코드를 자동 생성.',
  },
  {
    id: 'tools-stack',
    lane: 'tools',
    date: '2026-07-02',
    title: 'Layers + color ramps',
    titleKo: '컬러 램프 & 레이어 스택',
    status: 'done',
    level: 1,
    detail:
      'Color ramp and v-field modes, the Experiment layer-stack tab that compiles patches to pattern code, knob bindings, and a much stronger C++ conversion prompt (pre-baked LUTs, macro collision warnings, an expensive-math decision table).',
    detailKo:
      'v-field 및 컬러 램프 모드, 생성기 레이어를 쌓아 패턴을 완성하는 Experiment 탭.',
  },
  {
    id: 'tools-lab-mobile',
    lane: 'tools',
    date: '2026-07-26',
    title: 'Lab mobile & resolution',
    titleKo: '패턴랩 모바일 UX & 해상도',
    status: 'done',
    level: 2,
    detail:
      'Added direct clipboard paste and code clear buttons for mobile users, localStorage draft autosave, direct panel resolution entry (// @matrix), and upgraded C++ prompt generator.',
    detailKo:
      '모바일 클립보드 붙여넣기/전체 지우기 버튼, 세션 자동 저장, 커스텀 패널 해상도 직접 입력 (// @matrix).',
  },
  {
    id: 'tools-multiagent',
    lane: 'tools',
    date: '2026-09-28',
    title: 'Multi-agent generation',
    titleKo: '멀티 에이전트 패턴 생성',
    status: 'planned',
    level: 1,
    detail:
      'The next step past single-shot Gemini generation: multiple agents generating, critiquing, and refining patterns in a loop, so quality stops depending on prompt luck. Software stream — ships continuously, independent of v3.0.0.',
    detailKo:
      '다중 AI 에이전트가 패턴을 생성하고 비평·수정하는 피드백 루프 생성기.',
  },

  // Community & business
  {
    id: 'biz-pcbway-order',
    lane: 'community',
    date: '2026-04-21',
    title: 'First PCBWay order',
    titleKo: '첫 PCBWay 스폰서십',
    status: 'done',
    level: 1,
    detail:
      'Serene from PCBWay sent a DM on 04-20, having seen the Reddit post, offering to sponsor a PCB order — the very first PCB, ordered free the next day, before the repo was even public. PCBWay has kept sponsoring since, through the 3D-printing experiments and the v2.2 gerber order.',
    detailKo:
      '레딧 글을 본 PCBWay에서 첫 PCB 제작 지원을 제안하여 프로젝트가 본격화된 계기.',
  },
  {
    id: 'biz-reddit',
    lane: 'community',
    date: '2026-04-23',
    title: 'Reddit launch',
    titleKo: '레딧 프로젝트 공개',
    status: 'done',
    level: 1,
    detail:
      'The repo went public and the Reddit post went viral — the moment Patternflow stopped being a personal project.',
    detailKo:
      'r/arduino 레딧 게시글 바이럴 ➔ 개인 프로젝트에서 글로벌 오픈소스 프로젝트로 전환.',
  },
  {
    id: 'biz-discord',
    lane: 'community',
    date: '2026-04-29',
    title: 'Discord + journal',
    titleKo: '디스코드 & 저널 시작',
    status: 'done',
    level: 2,
    detail:
      'The Discord server opened and the journal started, turning the build log into a public story. First external contributor PRs landed the same week.',
    detailKo:
      '공식 디스코드 커뮤니티 오픈 및 개발 저널(Journal) 연재 시작.',
  },
  {
    id: 'biz-cs',
    lane: 'community',
    date: '2026-05-29',
    title: 'Crowd Supply contract',
    titleKo: 'Crowd Supply 계약',
    status: 'done',
    level: 1,
    detail:
      'The Crowd Supply contract was signed — the commitment that Patternflow becomes a product you can order, not just a repo you can build from.',
    detailKo:
      '크라우드 서플라이 공식 입점 계약 체결.',
  },
  {
    id: 'biz-nath-build',
    lane: 'community',
    date: '2026-06-05',
    title: 'First community build',
    titleKo: '첫 커뮤니티 유저 제작',
    status: 'done',
    level: 2,
    detail:
      'The first fully independent community build (Nath) went up on the build map — proof the guide worked for someone who wasn’t the author.',
    detailKo:
      '해외 외부 유저(Nath)의 가이드 기반 완티드 빌드 성공 및 빌드 맵 등록.',
  },
  {
    id: 'biz-prelaunch',
    lane: 'community',
    date: '2026-06-27',
    title: 'Pre-launch live',
    titleKo: '크라우드 서플라이 프리런칭',
    status: 'done',
    level: 1,
    detail:
      'The Crowd Supply pre-launch page replaced the waitlist across the site and README. Interest signups now feed the campaign directly.',
    detailKo:
      '공식 프리런칭 페이지 공개 및 구독 알림 수집 시작.',
    links: [{ label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' }],
  },
  {
    id: 'biz-cs-150',
    lane: 'community',
    date: '2026-07-24',
    title: '150 Crowd Supply subs',
    titleKo: '구독자 150명 돌파',
    status: 'done',
    level: 1,
    detail:
      'Passed 160+ subscribers on Crowd Supply pre-launch — surpassing the 150 subscriber milestone required for official launch prep — driven by viral Instagram pattern posts hitting ~300k views.',
    detailKo:
      '인스타 패턴 바이럴(~30만 회)에 힘입어 크라우드 서플라이 프리런칭 구독자 162명 돌파 (런칭 준비 임계점 달성).',
    links: [
      { label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' },
      { label: 'Journal (faster-faster)', href: 'https://patternflow.work/journal/faster-faster' },
    ],
  },
  {
    id: 'community-discussions',
    lane: 'community',
    date: '2026-07-24',
    title: 'Discussions & pattern forks',
    titleKo: '커뮤니티 & 패턴 포크',
    status: 'done',
    level: 1,
    detail:
      'Launched the Patternflow Community hub (/community) featuring text discussion boards and pattern sharing with fork capabilities — copy base patterns, tweak color ramps or code, and republish.',
    detailKo:
      '패턴 공유 및 포크(코드/색상 변형 후 재게시) 기능을 갖춘 커뮤니티 Hub (/community) 오픈.',
    links: [{ label: 'Community Hub', href: 'https://patternflow.work/community' }],
  },
  {
    id: 'biz-launch',
    lane: 'community',
    date: '2026-09-25',
    title: 'Campaign launch',
    titleKo: '크라우드 서플라이 런칭',
    status: 'planned',
    level: 1,
    detail:
      'The Crowd Supply campaign goes live once v3.0.0 is real: verified board, printable case, and guides that match what backers will actually build.',
    detailKo:
      'v3.0.0 하드웨어와 검증된 가이드 기반으로 전 세계 크라우드 펀딩 런칭.',
  },
  {
    id: 'biz-market',
    lane: 'community',
    date: '2026-11-10',
    title: 'Pattern marketplace',
    titleKo: '패턴 마켓플레이스',
    status: 'planned',
    level: 1,
    detail:
      'The long-term shape: anyone with an LED panel — including commercial signboard owners — can make patterns with the tools, run them at their own resolution, and sell them. The any-resolution engine and multi-agent generation are the two threads that converge here.',
    detailKo:
      '모든 패널 크기에서 누구나 패턴을 만들고 판매할 수 있는 장기 생태계.',
  },
];

export const EDGES: RoadmapEdge[] = [
  { from: 'pcb-v22', to: 'case-v3', note: 'USB-C moved the power input — the case must follow' },
  { from: 'biz-cs-150', to: 'biz-launch', note: '150 subscriber milestone unlocked launch prep' },
  { from: 'fw-browser-build', to: 'community-discussions', note: 'in-browser build & flash feeds pattern sharing' },
  { from: 'fw-resolution', to: 'biz-market', note: 'any panel, any size' },
  { from: 'tools-multiagent', to: 'biz-market', note: 'pattern quality at scale' },
];
