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
  { id: 'guides', label: 'Guides', labelKo: '빌드 가이드' },
  { id: 'firmware', label: 'Firmware', labelKo: '펌웨어' },
  { id: 'tools', label: 'Pattern tools', labelKo: '패턴 편집기' },
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
      'First hand-wired prototype built in the club room: HUB75 64x64 LED matrix + ESP32-S3 + 4 potentiometers wired on a breadboard, bringing Patternflow out of the web browser and into physical space at Mapo Saebit Cultural Forest.',
    detailKo:
      '동아리방에서 만능기판과 핸드와이어링으로 조립한 첫 실물 프로토타입 (64x64 HUB75 LED 매트릭스 + ESP32-S3 + 4개 가변저항). 웹 브라우저 화면 속에 머물던 패턴플로우 알고리즘을 마포새빛문화숲 야외 공간으로 불러내어 직접 손으로 만지는 빛의 하드웨어로 실재화했습니다.',
    links: [
      { label: 'Instagram Reel (LED & Knobs)', href: 'https://www.instagram.com/p/DWi9wc6gkS0/' },
      { label: 'Reddit Prototype Post', href: 'https://www.reddit.com/r/arduino/comments/1so9er5/built_a_4knob_generative_pattern_controller_with/' },
      { label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' },
      { label: 'hardware/pcb (v1.0.0)', href: `${REPO}/tree/v1.0.0/hardware/pcb` },
    ],
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
      'First public hardware release: KiCad 10.0 schematics, production Gerber files, and a 2-layer hand-solderable ESP32-S3 + HUB75 driver PCB layout with 2.54mm pitch pin headers. Every subsequent board revision descends from this initial floorplan.',
    detailKo:
      '첫 공개 오픈소스 하드웨어 릴리스: KiCad 10.0 회로도, Gerber 파일 및 손납땜이 용이한 2.54mm 핀헤더 방식의 2레이어 ESP32-S3 + HUB75 드라이버 보드. 이후 제작된 모든 보드 개선안의 베이스가 되는 원형 레이아웃입니다.',
    links: [
      { label: 'KiCad Gerber (v1.0.0)', href: `${REPO}/tree/v1.0.0/hardware/pcb` },
      { label: 'Journal (Me and Patternflow)', href: 'https://patternflow.work/journal/me-and-patternflow' },
    ],
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
      'GPIO0 boot pull-up resistor fix (Issue #16) preventing random ESP32 bootloops during cold start, along with silkscreen corrections for rotary encoder A/B/SW pin mappings based directly on early DIY community builder feedback.',
    detailKo:
      '초기 DIY 빌더들의 피드백을 바탕으로 부팅 시 무작위 부트룹 현상을 방지하는 GPIO0 풀업 저항 회로 보정(Issue #16) 및 로터리 엔코더 A/B/SW 핀 실크스크린 인쇄 오류 수정.',
    issues: [16],
    links: [
      { label: 'Issue #16 (GPIO0 fix)', href: `${REPO}/issues/16` },
      { label: 'Journal (wins and losses)', href: 'https://patternflow.work/journal/wins-and-losses-next-step' },
    ],
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
      'Reworked high-speed ESP32-to-HUB75 trace routing to minimize 20MHz DMA refresh clock EMI line noise and cleaned silkscreen labels. These remain the baseline recommended gerbers for manual hand-assembly, pinned in BUILD_GUIDE.md.',
    detailKo:
      '20MHz DMA 주사 클럭에서 발생하는 고주파 EMI 신호 노이즈를 최적화하기 위해 ESP32-HUB75 배선을 리라우팅하고 실크스크린을 픽셀 단위로 정돈. 현재 수동 납땜 빌더용 기준 Gerber로 BUILD_GUIDE.md에 지정되어 있습니다.',
    links: [
      { label: 'Gerbers (v2.1.0)', href: `${REPO}/tree/v2.1.0/hardware/pcb` },
      { label: 'BUILD_GUIDE.md (v2.1.0)', href: `${REPO}/blob/v2.1.0/BUILD_GUIDE.md` },
    ],
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
      'Test board moving power input from 2-pin terminal to USB-C 5V 3A, eliminating all SMD components in favor of 100% Through-Hole (THT) passives. Ordered via PCBWay Gerber sponsorship to validate DIY assembly convenience.',
    detailKo:
      '전원 입력을 USB-C(5V 3A)로 변경하고 SMD 소자를 완전히 제거한 100% 스루홀(THT) 테스트 보드 (PCBWay Gerber 스폰서십 제작). 납땜 난이도를 대폭 낮추고 일반 USB PD 충전기와의 호환성을 검증했습니다.',
    links: [{ label: 'Journal (make it easy to build)', href: 'https://patternflow.work/journal/make-it-easy-to-build' }],
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
      'USB-C power input placed on hold under active re-evaluation (Issue #221): investigating delayed connector pin thermal burnout (20–30 min run under 3A full LED matrix load). DIY builds pinned safely to 2-pin 5.08mm screw terminal (J4).',
    detailKo:
      '64x64 매트릭스 최고 밝기(3A 수용) 구동 시 20~30분 후 발생하는 USB-C 핀 지연 탄화/열 손상 원인을 파악하기 위해 USB-C 입력을 보류 및 전면 재검토 (Issue #221). DIY 빌더 안정성을 위해 전원은 2핀 스크류 터미널(J4)로 보정 사용.',
    issues: [221],
    links: [
      { label: 'Issue #221', href: `${REPO}/issues/221` },
      { label: 'BUILD_GUIDE.md section 10', href: `${REPO}/blob/main/BUILD_GUIDE.md#10-known-issues` },
    ],
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
      'v3.0.0 production hardware release: reorganized module floorplan, reduced PCB trace area to drop manufacturing costs by 18%, added dual power footprint (Screw terminal + USB-C safety circuit) and official silkscreen "PATTERNFLOW v1.0".',
    detailKo:
      'v3.0.0 양산형 하드웨어 릴리스: 모듈 배치 개편, PCB 면적 축소를 통한 단가 18% 절감, 스크류 터미널과 안전회로가 포함된 USB-C 듀얼 전원 풋프린트 지원 및 공식 "PATTERNFLOW v1.0" 실크스크린 적용.',
    links: [
      { label: 'hardware/pcb (v3.0.0)', href: `${REPO}/tree/v3.0.0/hardware/pcb` },
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
      'The original 3D-printable enclosure released with v1.0: fully modeled Blender design (hardware/case/source/patternflow_case.blend) with print-ready STLs, 4-part breakdown, and slicer settings. Ancestor of all case variations.',
    detailKo:
      'v1.0과 함께 공개된 3D 프린팅 전용 인클로저. Blender 4.1 원본 모델 파일과 슬라이서 서포트 설정이 완료된 4분할 STL 파일 제공. 이후 개발된 모든 스냅핏 및 레이저 커팅 케이스의 모태가 되는 모델입니다.',
    links: [
      { label: 'Instagram Reel (Viral Case Prototype)', href: 'https://www.instagram.com/p/DW6hZPsAlRj/' },
      { label: 'hardware/case (v1.0.0)', href: `${REPO}/tree/v1.0.0/hardware/case` },
    ],
  },
  {
    id: 'case-laser',
    lane: 'case',
    date: '2026-05-26',
    title: 'Laser-cut acrylic (on hold)',
    titleKo: '레이저 커팅 아크릴 (실패/재검토)',
    status: 'done',
    level: 2,
    detail:
      'Initial 3mm laser-cut acrylic plate experiment: mechanical fit and tab joint tolerances failed during physical assembly testing, placing acrylic cases on hold for future redesign.',
    detailKo:
      '3mm 아크릴 레이저 커팅 조립 실험. 파츠 간 결합부 유격 공차 및 인장 강도 부족으로 실물 조립에 실패하여 개발 보류. 향후 보강 구조 재설계 예정.',
    links: [{ label: 'hardware/case/source (v2.0.0)', href: `${REPO}/tree/v2.0.0/hardware/case/source` }],
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
      'Month-long 3D printing tolerance experiments sponsored by PCBWay 3D printing service: test prints for alignment tabs, one-shot print ribs, easybond joints, and wall-hangers to achieve support-free printing.',
    detailKo:
      'PCBWay 3D 프린팅 스폰서십을 기반으로 한 한 달간의 정밀 출력 실험. 서포트(보조 구조물) 제거 시 발생하는 표면 손상을 없애기 위해 alignment tab, snap-fit 조인트, 일체형 갈고리 구조 등을 다각도로 검증.',
    links: [{ label: 'Journal (make it easy to build)', href: 'https://patternflow.work/journal/make-it-easy-to-build' }],
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
      'Zero-support one-piece snap-fit enclosure (Issue #113) graduated to print-ready status for 330mm print beds. Eliminates screws in favor of snap-in mechanical locking tabs.',
    detailKo:
      '별도의 나사 조임 없이 파츠끼리 딱 맞춰 맞물리는 0-서포트 일체형 스냅핏 케이스 (Issue #113). 330mm 대형 프린터 베드에서 단 한 번의 출력으로 조립이 완료되는 기계적 락킹 구조 구현.',
    issues: [113],
    links: [{ label: 'Issue #113', href: `${REPO}/issues/113` }],
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
      'v3.0.0 snap-fit enclosure release: reinforced mechanical clips, updated internal PCB standoff tolerances, and revised power port cutouts matching the v3.0.0 hardware board footprint for the Crowd Supply launch.',
    detailKo:
      'v3.0.0 전용 인클로저: 스냅핏 조인트 결합력 강화, PCB 서포트 유격 공차 0.15mm 미세 조정 및 v3.0.0 듀얼 전원 포트 위치에 맞춘 크라우드 서플라이 펀딩용 일체형 케이스.',
    links: [
      { label: 'hardware/case (v3.0.0)', href: `${REPO}/tree/v3.0.0/hardware/case` },
      { label: 'BUILD_GUIDE.md (v3.0.0)', href: `${REPO}/blob/v3.0.0/BUILD_GUIDE.md` },
    ],
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
      'Initial release of BUILD_GUIDE.md: complete Bill of Materials (BOM), component sourcing links (LCSC/AliExpress), step-by-step soldering instructions, and initial firmware upload via Web Serial.',
    detailKo:
      'BUILD_GUIDE.md 첫 릴리스: 상세 BOM(부품명세서), 해외 구매 링크(LCSC/AliExpress), 납땜 순서 가이드, 핀 배치표 및 웹 시리얼 기반 펌웨어 플래싱 안내 수록.',
    links: [
      { label: 'BUILD_GUIDE.md (v1.0.0)', href: `${REPO}/blob/v1.0.0/docs/BUILD.md` },
      { label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' },
    ],
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
      'Comprehensive guide rewrite: replaced text descriptions with high-resolution macro photography and video loops for every soldering step, encoder mounting, and matrix pin connection.',
    detailKo:
      '모든 납땜 단계, 로터리 엔코더 체결, LED 매트릭스 와이어링 과정마다 고화질 실물 조립 사진과 루프 영상을 첨부하여 가이드를 대대적으로 개편.',
    links: [{ label: 'BUILD_GUIDE.md (v1.1.0)', href: `${REPO}/blob/v1.1.0/docs/BUILD.md` }],
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
      'A non-soldering breadboard assembly path (/build/breadboard): complete pin jumper diagram allowing makers to test Patternflow graphics on a 64x64 matrix without ordering custom PCBs.',
    detailKo:
      '납땜이나 PCB 주문 없이 브레드보드(빵판)와 점퍼 와이어만으로 패턴플로우 하드웨어를 구동해볼 수 있는 무납땜 입문 가이드 (/build/breadboard).',
    links: [{ label: 'Breadboard Guide', href: 'https://patternflow.work/build/breadboard' }],
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
      'BOM conversion to 100% Through-Hole (THT) components, dropping all SMD surface-mount passives to allow easy assembly with basic soldering irons.',
    detailKo:
      'SMD 칩 소자를 완전히 배제하고 100% 스루홀(THT) 다리와 저항으로 BOM을 개편하여 일반 가용 핑거 인체공학 인쇄기 및 초보용 인디키 납땜기로도 수월하게 완성 가능하도록 개선.',
    links: [{ label: 'BUILD_GUIDE.md (v2.1.0)', href: `${REPO}/blob/v2.1.0/BUILD_GUIDE.md` }],
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
      'Complete BUILD_GUIDE.md rewrite for v3.0.0 hardware and snap-fit case: updated BOM, assembly photos, troubleshooting section, and safety guidelines for power wiring.',
    detailKo:
      'v3.0.0 하드웨어 보드 및 스냅핏 인클로저에 맞춰 개정된 BUILD_GUIDE.md 정식 출간. 최신 BOM 명세, 단계별 조립 가이드 및 전원 안전 수칙 수록.',
    links: [{ label: 'BUILD_GUIDE.md (v3.0.0)', href: `${REPO}/blob/v3.0.0/BUILD_GUIDE.md` }],
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
      'Comprehensive pattern development guide (firmware/CUSTOM_PATTERNS.md): covering PFCanvas drawing APIs, color palette ramps, noise functions, and transferring web presets to device firmware.',
    detailKo:
      '패턴 개발자를 위한 공식 C++ 패턴 제작 가이드 (firmware/CUSTOM_PATTERNS.md). PFCanvas 드라이버, 컬러 램프, Simplex Noise 함수 사용법 및 웹 스튜디오 알고리즘의 C++ 포팅 가이드.',
    links: [{ label: 'firmware/CUSTOM_PATTERNS.md', href: `${REPO}/blob/main/firmware/CUSTOM_PATTERNS.md` }],
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
      'Initial open-source Arduino sketch (firmware/patternflow/patternflow.ino): hardcoded pattern functions, pin mappings in config.h, and browser flashing via Web Serial.',
    detailKo:
      '초기 오픈소스 아두이노 스케치 (firmware/patternflow/patternflow.ino). config.h 핀 매핑 구조 설정 및 웹 시리얼(ESP Web Tools) 브라우저 플래싱 지원.',
    links: [{ label: 'firmware/patternflow_v1 (v1.0.0)', href: `${REPO}/tree/v1.0.0/firmware/patternflow_v1` }],
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
      'Core graphics pipeline overhaul: PFCanvas drawing abstraction, shared core_math / core_color / core_noise helpers, 2.2 gamma LUT, 240Hz DMA refresh rate eliminating camera shutter flicker, and encoder velocity acceleration.',
    detailKo:
      'ESP32-S3 그래픽 렌더링 파이프라인 전면 개편: PFCanvas abstraction 계층, core_math / core_color / core_noise 헬퍼, 2.2 감마 보정 LUT, 스마트폰 카메라 플리커를 없애는 ~240Hz DMA 주사율 및 로터리 엔코더 속도 가속 알고리즘.',
    links: [{ label: 'Journal (faster-faster)', href: 'https://patternflow.work/journal/faster-faster' }],
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
      'Bi-directional Open Sound Control (OSC) protocol (docs/osc-spec.md), ArduinoOTA wireless firmware flashing over Wi-Fi, and real-time audio-react DSP FFT spectrum analysis integration.',
    detailKo:
      '양방향 OSC 프로토콜 (docs/osc-spec.md), 무선 Wi-Fi OTA(Over-The-Air) 펌웨어 업데이트 및 실시간 오디오 반응(Audio-reactive) FFT 주파수 분석 연동.',
    links: [{ label: 'docs/osc-spec.md', href: `${REPO}/blob/main/docs/osc-spec.md` }],
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
      'v2.0.0 firmware release: modular pattern registry (pattern_registry.h), curated presets (preset_origin.h, preset_wave_saw.h), and user custom slots (custom1.h~custom3.h) under CC-BY-SA 4.0 license.',
    detailKo:
      'v2.0.0 펌웨어 정식 릴리스: 모듈형 패턴 레지스트리(pattern_registry.h), 큐레이션 프리셋 헤더 및 유저 커스텀 패턴 슬롯(custom1.h~custom3.h) 구축 (CC-BY-SA 4.0 라이선스).',
    links: [{ label: 'firmware/patternflow (v2.0.0)', href: `${REPO}/tree/v2.0.0/firmware/patternflow` }],
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
      'Improv-Serial Wi-Fi provisioning protocol integration: credentials are set directly over Web Serial during browser flashing without requiring hardcoded Wi-Fi passwords.',
    detailKo:
      'Improv-Serial Wi-Fi 프로비저닝 프로토콜 연동. 브라우저 플래싱 중 웹 시리얼 연결을 통해 Wi-Fi SSID/PW를 안전하게 전송 및 설정.',
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
      'Ableton Live Max for Live bridge (integrations/ableton/): bi-directional OSC control allowing Ableton MIDI & synth parameters to drive Patternflow knobs and pattern switching in real-time.',
    detailKo:
      'Max for Live 기반 Ableton Live 연동 브릿지 (integrations/ableton/). 음악 트랙의 MIDI/신디사이저 파라미터가 패턴플로우의 4개 엔코더 및 노이즈 속도를 양방향 OSC로 직접 드라이브.',
    links: [{ label: 'integrations/ableton', href: `${REPO}/tree/main/integrations/ableton` }],
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
      'In-browser C++ compilation pipeline & Web Serial flasher (PR #230, #231): compile custom C++ patterns directly in the browser via build worker and flash to ESP32-S3 over Web Serial without local Arduino IDE setup.',
    detailKo:
      '웹 브라우저 C++ 컴파일 파이프라인 및 Web Serial 플래셔 (PR #230, #231). 로컬 아두이노 IDE 설치 없이 웹 스튜디오에서 작성한 패턴 코드를 클라우드 빌드 워커로 C++ 바이너리 컴파일 후 USB 직렬 플래싱.',
    issues: [230, 231],
    links: [
      { label: 'Issue #230', href: `${REPO}/issues/230` },
      { label: 'Issue #231', href: `${REPO}/issues/231` },
    ],
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
      'Resolution-agnostic rendering engine: dynamic matrix dimensions allowing Patternflow firmware to render seamlessly on any HUB75 LED panel configuration (64x32, 128x64, commercial LED signs).',
    detailKo:
      '해상도 비의존적 렌더링 엔진: 64x64 보드뿐만 아니라 상용 128x64, 64x32 전광판 등 모든 HUB75 LED 패널 규격에 맞춰 패턴 좌표계를 동적으로 스케일링하는 범용 엔진.',
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
      'The original node-based generative art website (origin.patternflow.work), created months before hardware existed — featuring 3D relief shaders, URL preset sharing, and real-time canvas modulation.',
    detailKo:
      '하드웨어 제작 몇 달 전 탄생한 원형 노드 기반 제너러티브 아트 웹사이트 (origin.patternflow.work). 3D 릴리프 셰이더, URL 프리셋 공유, 제너레이티브 파동 캔버스 등 프로젝트 알고리즘의 원형이 담겨 있습니다.',
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
      'Visit to Nam June Paik Art Center & encounter with <Participation TV> (1963): reinterpreting video art as a physical interactive instrument where the audience becomes an active performer shaping light and sound.',
    detailKo:
      '백남준아트센터 방문 및 <Participation TV>(1963) 관람: 일방향 시청 대상이었던 TV 비디오 아트를 사용자가 직접 노브를 돌려 신호를 왜곡하고 빛을 연주하는 물리적 참여형 악기로 재해석한 프로젝트의 핵심 철학적 영감.',
    links: [
      { label: 'Journal (Nam June Paik, Me, Patternflow)', href: 'https://patternflow.work/journal/nam-june-paik-me-patternflow' },
      { label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' },
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
      'In-browser Live Pattern Editor (patternflow.work/pattern-lab): featuring JS-to-C++ parity, live 64x64 canvas simulation, real-time knob modulation, and instant C++ code exporter.',
    detailKo:
      '웹 브라우저 라이브 패턴 에디터 (patternflow.work/pattern-lab). JS 캔버스 시뮬레이터와 C++ 디바이스 드라이버 간의 1:1 파리티, 실시간 노브 변조 및 C++ 헤더 자동 내보내기 지원.',
    links: [{ label: 'Live Editor', href: 'https://patternflow.work/pattern-lab' }],
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
      'Pattern Lab harness: featuring calibrated physical knob sliders, color palette selector, noise spectrum visualizers, and pattern performance profiling.',
    detailKo:
      '패턴 튜닝 하네스 스튜디오 (Pattern Lab). 4개 로터리 엔코더 가상 슬라이더, 팔레트 색상 램프 조절기, Simplex 노이즈 주파수 시각화 및 FPS 성능 측정 도구 수록.',
    links: [{ label: 'Pattern Lab', href: 'https://patternflow.work/pattern-lab' }],
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
      'AI pattern generation in Pattern Lab using Google Gemini API: describe desired visual patterns in natural language and automatically generate running C++ matrix code.',
    detailKo:
      'Pattern Lab 내 Google Gemini API 키 연동. "소용돌이치는 오로라 파동" 등 자연어 텍스트 설명만으로 디바이스에서 바로 실행되는 C++ 매트릭스 패턴 코드를 자동 생성.',
    links: [{ label: 'Pattern Lab AI', href: 'https://patternflow.work/pattern-lab' }],
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
      'Color ramp & vector field generator modes in Pattern Lab: layer-stacking engine compiling visual patches into C++ code with pre-baked math decision tables and LUT optimizations.',
    detailKo:
      'Pattern Lab 내 컬러 램프 & 벡터 필드 생성기 모드. 시각 효과 레이어를 쌓아복합 패턴을 구성하고, LUT 디시전 테이블을 통해 고성능 C++ 코드로 자동 합성하는 기능.',
    links: [{ label: 'Pattern Lab Studio', href: 'https://patternflow.work/pattern-lab' }],
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
      'Mobile UX overhaul for Pattern Lab: direct clipboard paste/clear buttons, localStorage draft autosave, and custom panel resolution tags (// @matrix W H).',
    detailKo:
      '패턴랩 모바일 터치 UX 최적화: 클립보드 원터치 붙여넣기/전체 지우기, 임시 저장 세션 자동 복구 및 커스텀 패널 해상도 설정 주석(// @matrix W H) 지원.',
    links: [{ label: 'Pattern Lab Mobile', href: 'https://patternflow.work/pattern-lab' }],
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
      'Multi-agent AI pattern generation pipeline: autonomous generator, critic, and refiner agents working in a feedback loop to produce complex, visually stunning shaders.',
    detailKo:
      '다중 AI 에이전트 렌더링 시스템: 생성기, 비평기, 코드 교정기 에이전트가 루프를 돌며 우수한 비주얼의 셰이더 패턴을 스스로 다듬어내는 차세대 AI 에디터.',
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
      'PCBWay sponsorship partnership: PCBWay reached out on Reddit and sponsored the first PCB prototype order, initiating ongoing hardware manufacturing support.',
    detailKo:
      '레딧 게시글을 본 PCBWay에서 패턴플로우의 가능성을 알아보고 첫 PCB 제작 전액 스폰서십을 제안. 프로젝트가 아이디어를 넘어 하드웨어 제조 단계로 도약한 순간.',
    links: [
      { label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' },
    ],
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
      'Official public repository release & viral Reddit post on r/arduino: gaining global maker traction and transitioning Patternflow into an open-source community project.',
    detailKo:
      'r/arduino 레딧 커뮤니티 정식 공개 후 폭발적인 반응 바이럴. 개인 프로젝트에서 전 세계 메이커들이 함께하는 오픈소스 커뮤니티로 전환.',
    links: [
      { label: 'Reddit Viral Post #1', href: 'https://www.reddit.com/r/arduino/comments/1so9er5/built_a_4knob_generative_pattern_controller_with/' },
      { label: 'Reddit PCB Update #2', href: 'https://www.reddit.com/r/arduino/comments/1szettd/12_days_later_pcb_done_rotary_encoders_done_fully/' },
      { label: 'Journal (Me and Patternflow)', href: 'https://patternflow.work/journal/me-and-patternflow' },
    ],
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
      'Official Discord server & Patternflow Journal launch (patternflow.work/journal): sharing transparent build logs, hardware challenges, and receiving first community PRs.',
    detailKo:
      '공식 디스코드 커뮤니티 서버 개설 및 개발 이야기(patternflow.work/journal) 연재 시작. 투명한 개발 일지 공유를 통해 전 세계 기여자의 첫 PR 접수.',
    links: [
      { label: 'Official Discord', href: 'https://discord.gg/Vr9QtsxeTk' },
      { label: 'Journal Index', href: 'https://patternflow.work/journal' },
    ],
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
      'Official Crowd Supply crowdfunding contract signed: committing Patternflow to become a commercially available open-source hardware kit.',
    detailKo:
      '세계 최대 오픈소스 하드웨어 펀딩 플랫폼인 Crowd Supply와 공식 입점 계약 체결. 누구나 쉽게 완제품 또는 DIY 키트로 구매할 수 있는 기반 마련.',
    links: [
      { label: 'Crowd Supply Page', href: 'https://www.crowdsupply.com/engmung/patternflow' },
      { label: 'Journal (refocus)', href: 'https://patternflow.work/journal/refocus' },
    ],
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
      'First fully independent external community build by UK maker Nath (/inside/nath-uk): validating that the open-source BUILD_GUIDE.md works seamlessly for third-party builders.',
    detailKo:
      '영국의 유저 Nath가 오픈소스 빌드 가이드만 보고 완전히 스스로 제작에 성공한 첫 커뮤니티 실물 빌드 (/inside/nath-uk). 누구나 만들 수 있는 하드웨어 문서화 검증.',
    links: [{ label: 'Nath UK Build', href: 'https://patternflow.work/inside/nath-uk' }],
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
      'Crowd Supply pre-launch page live: gathering interest signups and backer notifications across the web ecosystem for campaign launch readiness.',
    detailKo:
      'Crowd Supply 공식 프리런칭 페이지 런칭. 전 세계 유저를 대상으로 출시 알림 구독 신청을 수집하기 시작.',
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
      'Surpassed 160+ Crowd Supply pre-launch subscribers — fulfilling the mandatory 150 subscriber threshold for campaign launch approval — driven by viral Instagram pattern videos reaching over 300,000 views.',
    detailKo:
      '인스타그램 패턴 바이럴 영상(~30만 회) 폭발적 호응에 힘입어 Crowd Supply 프리런칭 구독자 162명 돌파 (펀딩 정식 승인 요건인 150명 달성).',
    links: [
      { label: 'Instagram @patternflow.work', href: 'https://www.instagram.com/patternflow.work' },
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
      'Patternflow Community Hub launch (patternflow.work/community): featuring discussion forums and pattern sharing with fork capabilities — copy base patterns, customize color ramps, and republish to the community.',
    detailKo:
      '패턴플로우 공식 커뮤니티 허브 (patternflow.work/community) 런칭. 유저 간 패턴 공유, 커스텀 색상/코드 변형 후 재게시(Fork) 기능 및 토론 게시판 오픈.',
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
      'Global Crowd Supply crowdfunding campaign launch: offering assembled Patternflow instruments, DIY component kits, and custom enclosures to backers worldwide.',
    detailKo:
      '전 세계 유저를 대상으로 한 Crowd Supply 공식 크라우드 펀딩 런칭. 완제품 및 DIY 부품 키트를 글로벌 배송하여 전 세계로 파동을 확산.',
    links: [{ label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' }],
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
      'Open Pattern Marketplace: enabling generative artists to create, publish, and monetize LED matrix patterns for device owners and commercial signboard installations worldwide.',
    detailKo:
      '오픈 패턴 마켓플레이스: 미디어 아티스트 및 개발자가 생성한 매트릭스 패턴을 공유하고 전 세계 기기 소유자 및 상용 전광판에 판매/유통할 수 있는 오픈 생태계.',
  },
];

export const EDGES: RoadmapEdge[] = [
  { from: 'pcb-v22', to: 'case-v3', note: 'USB-C moved the power input — the case must follow' },
  { from: 'biz-cs-150', to: 'biz-launch', note: '150 subscriber milestone unlocked launch prep' },
  { from: 'fw-browser-build', to: 'community-discussions', note: 'in-browser build & flash feeds pattern sharing' },
  { from: 'fw-resolution', to: 'biz-market', note: 'any panel, any size' },
  { from: 'tools-multiagent', to: 'biz-market', note: 'pattern quality at scale' },
];
