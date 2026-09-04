// Data for the project map. Node dates are real commit/release/journal dates for
// shipped work; planned work is ordered by rough intention and rendered in a
// single "future" region (no fake months). `level: 1` nodes show in the
// overview; `level: 2` nodes only appear in the detailed view. `gate: true`
// marks a node as part of the v3.0.0 build release — hardware + guides, the
// things people physically build from. Software ships continuously and is
// never gated.
//
// Sourcing rule: every claim here traces to CHANGELOG.md, a git commit, a
// release note, or a journal entry. If a number or a cause can't be traced to
// one of those, it doesn't go in the detail text.

export type LaneId = 'pcb' | 'case' | 'guides' | 'firmware' | 'tools' | 'community' | 'media';

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

// The "today" marker resolves at runtime. NOW is the SSR/first-paint fallback
// (bump it when you like — it only decides where the line sits for the split
// second before the client resolves the real date), and todaySeoul() is the
// live value. Both are Asia/Seoul, so the line moves at midnight KST rather
// than at whatever midnight the visitor's machine happens to be in.
export const NOW = '2026-09-03';

export function todaySeoul(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const LANES: { id: LaneId; label: string; labelKo: string }[] = [
  { id: 'pcb', label: 'PCB', labelKo: 'PCB 회로' },
  { id: 'case', label: 'Enclosure', labelKo: '인클로저' },
  { id: 'guides', label: 'Guides', labelKo: '빌드 가이드' },
  { id: 'firmware', label: 'Firmware', labelKo: '펌웨어' },
  { id: 'tools', label: 'Pattern tools', labelKo: '패턴 편집기' },
  { id: 'community', label: 'Community', labelKo: '커뮤니티' },
  { id: 'media', label: 'Media & Press', labelKo: '언론 & 미디어' },
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
    level: 1,
    detail:
      'Parts arrived on 29 March and went together the same day in the club room: a 128x64 P2.5 HUB75 panel, an ESP32-S3 and four potentiometers on a breadboard, held in place with a glue gun. No soldering, no enclosure — just the fastest possible route to seeing it run. The Patternflow: Origin shader was ported to the matrix that night and the first footage was shot in Mapo Saebit Cultural Forest. The reel landed flat, which is what made a case feel necessary.',
    detailKo:
      '3월 29일 부품이 도착한 그날 바로 동아리방에서 올린 첫 실물 프로토타입입니다. 128x64 P2.5 HUB75 패널에 ESP32-S3와 가변저항 4개를 빵판에 꽂고 글루건으로 고정한 물건이었습니다. 납땜도 인클로저도 없는, 작동하는 모습을 가장 빨리 보기 위한 구성이었습니다. 그날 밤 패턴플로우:오리진의 셰이더를 매트릭스용으로 옮겨 올렸고, 보조배터리를 들고 마포새빛문화숲에 나가 첫 영상을 찍었습니다. 반응이 거의 없었고, 그래서 케이스가 필요하다는 결론에 도달합니다.',
    links: [
      { label: 'Instagram Reel (LED & Knobs)', href: 'https://www.instagram.com/p/DWi9wc6gkS0/' },
      { label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' },
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
      'First public hardware release: a KiCad schematic and board drawn over a single weekend by someone who could not read a schematic two days earlier, fabricated free of charge under the PCBWay sponsorship. Through-hole headers plus 0805 SMD passives, ESP32-S3 + HUB75, four EC11 encoders. Every later revision descends from this floorplan.',
    detailKo:
      '첫 공개 오픈소스 하드웨어 릴리스입니다. 이틀 전까지 회로도조차 읽지 못하던 사람이 주말 2일을 통째로 갈아넣어 그린 KiCad 회로도와 아트워크이고, PCBWay 스폰서십으로 무료 제작되었습니다. 스루홀 핀헤더에 0805 SMD 수동소자가 함께 올라간 ESP32-S3 + HUB75 보드이며, EC11 로터리 엔코더 4개를 사용합니다. 이후의 모든 개선안이 이 레이아웃에서 갈라져 나왔습니다.',
    links: [
      { label: 'hardware/pcb (v1.0.0)', href: `${REPO}/tree/v1.0.0/hardware/pcb` },
      { label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' },
    ],
  },
  {
    id: 'pcb-v2',
    lane: 'pcb',
    date: '2026-05-07',
    title: 'v2 cold-boot fix',
    titleKo: 'v2 콜드부트 수정',
    status: 'done',
    level: 2,
    detail:
      'The cold-boot failure that shipped with v1 — the board needed a reset press after every power-up — was tracked to a floating GPIO0 strapping pin and fixed with a 10k pull-up (R13), together with silkscreen fixes for the R/C designators and the encoder back-side marking. Contributed as PR #48 by @idranoutof1d, after u/Infrated diagnosed it on r/AskElectronics. Shipped in v2.0.0 on 11 May.',
    detailKo:
      'v1의 고질병이던 콜드부트 실패 — 전원을 넣을 때마다 리셋 버튼을 눌러야 켜지던 문제 — 의 원인이 GPIO0 스트래핑 핀 플로팅으로 밝혀져 10k 풀업 저항(R13)으로 해결되었습니다. R/C 지시자와 엔코더 뒷면 표기 실크스크린도 함께 정리했습니다. r/AskElectronics의 u/Infrated가 원인을 짚어주었고, @idranoutof1d가 PR #48로 직접 고쳐 보냈습니다. 5월 11일 v2.0.0에 포함되어 배포되었습니다.',
    issues: [16],
    links: [
      { label: 'Issue #16 (cold boot)', href: `${REPO}/issues/16` },
      { label: 'Journal (wins and losses)', href: 'https://patternflow.work/journal/wins-and-losses-next-step' },
    ],
  },
  {
    id: 'pcb-v21',
    lane: 'pcb',
    date: '2026-06-18',
    title: 'v2.1 routing',
    titleKo: 'v2.1 배선 정리',
    status: 'done',
    level: 2,
    detail:
      'The tangled ESP32-to-J1 (HUB75) area was re-routed in both schematic and board, with pin assignments left untouched so firmware config.h did not move. A silkscreen pass four days earlier had already disambiguated the R9/R10/C14/C15 labels. These stayed the recommended Gerbers for the whole v2.x line, pinned by the build guide and by the v2.1.0 consolidation release.',
    detailKo:
      '엉켜 있던 ESP32-J1(HUB75) 구간 배선을 회로도와 보드 양쪽에서 다시 정리했습니다. 핀 할당은 그대로 두어 펌웨어 config.h는 손대지 않아도 되게 했습니다. 나흘 앞선 실크스크린 작업에서 R9/R10/C14/C15 표기 혼동도 이미 정리해 둔 상태였습니다. 이 거버가 v2.x 라인 전체의 권장 보드가 되었고, 빌드 가이드와 v2.1.0 통합 릴리스가 이 버전을 기준으로 고정했습니다.',
    links: [
      { label: 'Gerbers (v2.1.0)', href: `${REPO}/tree/v2.1.0/hardware/pcb` },
      { label: 'BUILD_GUIDE.md (v2.1.0)', href: `${REPO}/blob/v2.1.0/BUILD_GUIDE.md` },
    ],
  },
  {
    id: 'pcb-v22',
    lane: 'pcb',
    date: '2026-06-28',
    title: 'v2.2 USB-C · SMD-free',
    titleKo: 'v2.2 USB-C · SMD 제거',
    status: 'done',
    level: 2,
    detail:
      'Power input moved from the 2-pin terminal to USB-C, and every SMD passive was deleted — the two 5.1k CC pull-downs are hand-soldered, so the whole board can be built with a basic iron. The SMD parts turned out to be unnecessary: a Discord builder pointed out the encoder caps and resistors could come off, and the board ran fine without them. DRC clean but never fabricated as v2.2 — it was absorbed into the v3.0 test board a week later.',
    detailKo:
      '전원 입력을 2핀 터미널에서 USB-C로 옮기고 SMD 수동소자를 전부 제거했습니다. 남은 5.1k CC 풀다운 2개는 손납땜이라, 보드 전체를 일반 인두 하나로 만들 수 있게 되었습니다. SMD가 애초에 필요 없었다는 사실은 디스코드의 한 빌더가 엔코더 캡과 저항을 떼도 괜찮다고 알려준 데서 확인되었습니다. DRC는 통과했지만 v2.2로 제작되지는 않았고, 일주일 뒤 v3.0 테스트 보드로 흡수됩니다.',
    issues: [114],
    links: [
      { label: 'Issue #114', href: `${REPO}/issues/114` },
      { label: 'Journal (refocus)', href: 'https://patternflow.work/journal/refocus' },
    ],
  },
  {
    id: 'pcb-v3-test',
    lane: 'pcb',
    date: '2026-07-07',
    title: 'v3.0 test board',
    titleKo: 'v3.0 테스트 보드',
    status: 'done',
    level: 2,
    detail:
      'The v3.0 test Gerber: hybrid power input — USB-C plus a back-side 2-pin screw terminal as the beginner bypass — all through-hole, DRC clean, shipped in hardware/pcb/gerber/experiment/ under a "do not order, unverified" warning. Boards were ordered on 11 July and came back verified on 17 July.',
    detailKo:
      'v3.0 테스트 거버입니다. USB-C와 뒷면 2핀 스크류 터미널을 함께 둔 하이브리드 전원 입력에 100% 스루홀 구성, DRC 클린 상태로 hardware/pcb/gerber/experiment/ 아래에 "미검증, 주문하지 말 것" 경고와 함께 올라갔습니다. 7월 11일에 실제 보드를 주문했고, 17일에 검증 완료로 돌아왔습니다.',
    issues: [114],
    links: [{ label: 'Issue #114', href: `${REPO}/issues/114` }],
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
      'v3.0.0 production board: fabricated, assembled and verified. Hybrid power input (USB-C footprint plus the J4 screw terminal), zero SMD passives — every part you solder is through-hole — a smaller board with the modules rearranged to cut production cost, and a machine-readable BOM listing every part by manufacturer part number. Not size-compatible with v2.x cases, and vice versa.',
    detailKo:
      'v3.0.0 양산형 보드입니다. 실제로 제작·조립·검증까지 마쳤습니다. USB-C 풋프린트와 J4 스크류 터미널을 함께 둔 하이브리드 전원 입력, SMD 수동소자 0개(납땜하는 부품이 전부 스루홀), 모듈 배치를 다시 잡고 전체 크기를 줄여 생산 단가를 낮춘 구성, 그리고 모든 부품을 제조사 부품번호로 명시한 기계 판독용 BOM이 함께 배포되었습니다. v2.x 케이스와는 크기가 호환되지 않습니다.',
    issues: [114],
    links: [
      { label: 'hardware/pcb (v3.0.0)', href: `${REPO}/tree/v3.0.0/hardware/pcb` },
      { label: 'bom_v3.0.csv', href: `${REPO}/blob/v3.0.0/hardware/bom/bom_v3.0.csv` },
      { label: 'Journal (v3 and beyond)', href: 'https://patternflow.work/journal/v3-and-beyond' },
    ],
  },
  {
    id: 'pcb-usbc-safety',
    lane: 'pcb',
    date: '2026-07-26',
    title: 'USB-C power withdrawn',
    titleKo: 'USB-C 전원 사용 중단',
    status: 'done',
    level: 2,
    detail:
      'A USB-C-powered board ran fine for 20–30+ minutes and then smoked at a connector pin, destroying the receptacle and the power path (Issue #221). The input was withdrawn from service in v3.1.0, not merely paused: leave USB1/R1/R2 unpopulated and power the board through the J4 screw terminal until a redesign passes. The guide, the assembly map and the v3.0.0 release notes all carry the hold.',
    detailKo:
      'USB-C로 전원을 넣은 보드가 20~30분 이상 정상 동작하다가 커넥터 핀에서 연기가 나며 리셉터클과 전원 경로가 파손되었습니다(Issue #221). v3.1.0에서 "보류"가 아니라 사용 중단 조치를 내렸습니다. 재설계가 검증될 때까지 USB1/R1/R2는 비워 두고 J4 스크류 터미널로만 전원을 넣어야 합니다. 빌드 가이드, 조립 맵, v3.0.0 릴리스 노트에 모두 이 경고가 반영되어 있습니다.',
    issues: [221],
    links: [
      { label: 'Issue #221', href: `${REPO}/issues/221` },
      { label: 'BUILD_GUIDE.md §2', href: `${REPO}/blob/main/BUILD_GUIDE.md#2-power-input--use-the-screw-terminal` },
    ],
  },

  // Enclosure
  {
    id: 'case-proto',
    lane: 'case',
    date: '2026-04-05',
    title: 'First enclosure prototype',
    titleKo: '첫 인클로저 프로토타입',
    status: 'done',
    level: 2,
    detail:
      'The breadboard came apart and the parts went into a printed case, wired by hand — the first version that reads as an object rather than a pile of components, and the first soldering of the project (done wrong, in the wrong order, at the cost of a great many cold joints). Hung in the club-room corridor on 5 April for a reel that went nowhere. Reprinted in plain white and shot on a desk instead: 10,000 views in two days.',
    detailKo:
      '빵판을 걷어내고 부품을 출력한 케이스에 넣어 손으로 배선한 버전입니다. 부품 더미가 아니라 하나의 물건으로 보이는 첫 프로토타입이자, 이 프로젝트의 첫 납땜이기도 합니다. 방법을 알아보지도 않고 순서를 거꾸로 해서 냉납과 접촉불량을 잔뜩 얻었습니다. 4월 5일 동아리방 복도에 걸어 릴스를 찍었지만 반응은 없었습니다. 케이스를 흰색으로 통일해 다시 뽑고 집 책상에 두고 찍은 영상이 이틀 만에 조회수 1만을 넘겼습니다.',
    links: [{ label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' }],
  },
  {
    id: 'case-v1',
    lane: 'case',
    date: '2026-04-26',
    title: 'Original v1 case',
    titleKo: 'v1.0 인클로저',
    status: 'done',
    level: 1,
    detail:
      'The original 3D-printable enclosure released with v1.0: modeled in Blender around one rule — no wasted space, no decoration, thin enough not to look like a computer is hiding behind it, with an internal bay for the power bank so no cable shows. Three prints total. Printing it flat warped every time; standing it upright solved it after three days of failed beds.',
    detailKo:
      'v1.0과 함께 공개된 3D 프린팅 인클로저입니다. 낭비되는 공간과 장식을 없애고, 뒤에 컴퓨터가 숨어 있는 것처럼 보이지 않도록 최대한 얇게, 선이 보이지 않도록 보조배터리 수납 공간을 안에 두는 것을 원칙으로 블렌더에서 모델링했습니다. 총 3개 파츠를 출력합니다. 눕혀서 뽑으면 매번 모서리가 말려 올라가 3일을 헤맸고, 세워서 출력하니 해결되었습니다.',
    links: [
      { label: 'Instagram Reel (case prototype)', href: 'https://www.instagram.com/p/DW6hZPsAlRj/' },
      { label: 'hardware/case (v1.0.0)', href: `${REPO}/tree/v1.0.0/hardware/case` },
    ],
  },
  {
    id: 'case-laser',
    lane: 'case',
    date: '2026-05-26',
    title: 'Laser-cut acrylic (on hold)',
    titleKo: '레이저 커팅 아크릴 (보류)',
    status: 'done',
    level: 2,
    detail:
      'Laser-cut acrylic, tried with 0.1mm kerf compensation. The first cut got the tabs and slots into each other but was not a usable case — panel relief depth and the bezel edge both needed work. The revision drawn to fix them came out wrong, and with wood as the next material after that (different material loss, a scorch margin to find), the acrylic path was put on hold rather than iterated further. The v1 Blender/SVG cut source is committed so the work is not lost; no shipped build uses it.',
    detailKo:
      '0.1mm 커프 보정을 잡고 진행한 레이저 커팅 아크릴 실험입니다. 첫 컷은 탭과 슬롯이 물리기는 했지만 쓸 수 있는 케이스는 아니었습니다. 패널 릴리프 깊이와 베젤 엣지 모두 손봐야 했습니다. 그걸 보완하려고 다시 그린 버전은 잘못 만들어졌고, 그다음 재료로 보던 목재는 재료 손실량도 다르고 그을음 여유도 새로 찾아야 하는 상황이라, 계속 반복하는 대신 아크릴 경로를 보류했습니다. 작업이 사라지지 않도록 v1 블렌더/SVG 컷 소스는 저장소에 커밋해 두었습니다. 현재 배포되는 빌드는 모두 3D 프린팅입니다.',
    links: [{ label: 'hardware/case/source (v2.1.0)', href: `${REPO}/tree/v2.1.0/hardware/case/source` }],
  },
  {
    id: 'case-exp',
    lane: 'case',
    date: '2026-06-05',
    title: 'Print experiments',
    titleKo: '인클로저 출력 실험',
    status: 'done',
    level: 2,
    detail:
      'Six weeks of enclosure print iteration: two flat print variants, then thicker walls, outer fillets and small snap-pins as an anti-warp pass. Tests ran on a P1S in the club room and on the university makerspace H2S through a professor — a slow loop, since each large-format attempt meant sending the file, waiting, and driving over to see it fail. PCBWay also printed one test set under the sponsorship; it came back mediocre.',
    detailKo:
      '6주에 걸친 인클로저 출력 반복입니다. 평면 출력 변형 두 가지를 시작으로, 워핑을 잡기 위해 벽 두께를 올리고 외곽 필렛과 작은 스냅핀을 더했습니다. 테스트는 동아리방의 P1S와 교수님을 통해 쓰는 학교 메이커스페이스의 H2S에서 진행했는데, 대형 출력은 파일을 보내고 기다렸다가 직접 가서 실패를 확인하는 느린 루프였습니다. PCBWay 스폰서십으로 한 세트를 출력해 보기도 했지만 결과물은 그리 좋지 않았습니다.',
    links: [{ label: 'Journal (refocus)', href: 'https://patternflow.work/journal/refocus' }],
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
      'The one-piece snap-fit enclosure (Issue #113) was promoted to a supported print option: a single-piece body plus a snap-fit closing part, no gluing, with a wall-mount hanger hole. Needs a ~330mm bed (H2S-class); stable print confirmed.',
    detailKo:
      '일체형 스냅핏 인클로저(Issue #113)가 정식 지원 출력 옵션으로 승격되었습니다. 본체 한 덩어리에 스냅핏 마감 파츠를 끼우는 구조로, 접착 없이 조립되며 벽걸이용 구멍이 포함됩니다. ~330mm 베드(H2S급)가 필요하고, 안정적인 출력까지 확인했습니다.',
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
      'v3.0.0 enclosure, reorganized by printer bed size: bed_256mm/encloser.stl prints the body, back panels and panel mount as one ~10h STL, bed_330mm/ keeps the one-piece snap-fit. Knobs print separately in black. Adds a snap-fit back panel, two wall-mount holes, and recesses for the LED panel alignment bumps — retiring the nipper-trimming step that had been there since v1.0 (Issue #19). Also listed on MakerWorld with tuned print profiles.',
    detailKo:
      'v3.0.0 인클로저는 프린터 베드 크기 기준으로 폴더가 정리되었습니다. bed_256mm/encloser.stl은 본체·후면 패널·LED 패널 마운트를 하나로 묶어 약 10시간에 출력하고, bed_330mm/에는 일체형 스냅핏이 남아 있습니다. 노브는 검정으로 따로 출력합니다. 스냅핏 후면 패널, 벽걸이 구멍 2개, LED 패널 정렬 돌기를 받아주는 홈이 추가되어 v1.0부터 따라다니던 니퍼 다듬기 단계가 사라졌습니다(Issue #19). 메이커월드에도 출력 프로파일과 함께 등록했습니다.',
    issues: [19, 169],
    links: [
      { label: 'hardware/case (v3.0.0)', href: `${REPO}/tree/v3.0.0/hardware/case` },
      { label: 'MakerWorld listing', href: 'https://makerworld.com/ko/models/3072492-patternflow-open-source-led-synthesizer-case' },
    ],
  },
  {
    id: 'case-petg',
    lane: 'case',
    date: '2026-08-23',
    title: 'PETG enclosure upgrade',
    titleKo: 'PETG 인클로저 소재 전환',
    status: 'done',
    level: 2,
    detail:
      'Switched from PLA to heat-resistant PETG for mass production and international shipping stability, preventing heat warping during transit. Sponsored by PCBWay for Crowd Supply reward units.',
    detailKo:
      '글로벌 배송 중 고온에 의한 열변형을 방지하기 위해 3D 프린팅 소재를 PLA에서 내열성이 뛰어난 PETG로 전환했습니다. PCBWay 지원을 통해 크라우드 서플라이 리워드 완제품에 적용되었습니다.',
    links: [{ label: 'Journal (Right Before Launch)', href: 'https://patternflow.work/journal/right-before-launch' }],
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
      'First release of docs/BUILD.md: bill of materials, AliExpress sourcing links for every electronic part, assembly walkthrough, pin reference and firmware upload via the Arduino IDE. Drafted by handing the whole build experience to an AI and letting it write the structure — which is exactly why the next two months are mostly rewrites.',
    detailKo:
      'docs/BUILD.md 첫 릴리스입니다. BOM, 모든 전자부품의 알리익스프레스 구매 링크, 조립 순서, 핀 배치표, 아두이노 IDE 펌웨어 업로드 안내가 들어갔습니다. 빌드 경험을 통째로 AI에 넘겨 정리시킨 초안이었고, 이후 두 달이 대부분 이 문서를 다시 쓰는 작업이 된 이유이기도 합니다.',
    links: [
      { label: 'docs/BUILD.md (v1.0.0)', href: `${REPO}/blob/v1.0.0/docs/BUILD.md` },
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
      'A weekend of guide rewrites: build photos and video stills added for the soldering steps, encoder mounting and case bonding, the firmware section reworked, a pin reference added, and the encoder shaft spec corrected. Author-written this time, replacing the AI-drafted structure.',
    detailKo:
      '주말 내내 가이드를 다시 썼습니다. 납땜 단계, 엔코더 체결, 케이스 접합 과정에 실물 사진과 영상 스틸을 붙이고, 펌웨어 섹션을 재작성하고, 핀 레퍼런스를 추가하고, 엔코더 샤프트 규격 표기를 바로잡았습니다. AI가 잡아둔 초안 구조를 제작자가 직접 쓴 글로 교체한 작업입니다.',
    links: [{ label: 'docs/BUILD.md (v2.0.0)', href: `${REPO}/blob/v2.0.0/docs/BUILD.md` }],
  },
  {
    id: 'guide-pattern',
    lane: 'guides',
    date: '2026-05-11',
    title: 'Pattern authoring guide',
    titleKo: '패턴 제작 가이드',
    status: 'done',
    level: 2,
    detail:
      'firmware/CUSTOM_PATTERNS.md: the 5-step path from a plain-language description to a pattern running on the panel — copy the creation prompt, ask any code-capable model, paste into the Live Editor, tune the knobs, convert to C++. A hand-written route is documented alongside it for anyone comfortable with shader-style code. It has been extended twice since: browser build & flash, then loadable modules.',
    detailKo:
      'firmware/CUSTOM_PATTERNS.md 문서입니다. 말로 설명한 패턴을 실제 패널에서 돌아가게 만드는 5단계 경로 — 생성 프롬프트 복사, 아무 코드 생성 모델에 붙여넣기, 라이브 에디터에 붙여넣기, 노브 튜닝, C++ 변환 — 를 안내합니다. 셰이더 스타일 코드가 익숙한 사람을 위한 직접 작성 경로도 함께 정리되어 있습니다. 이후 브라우저 빌드/플래싱, 로더블 모듈이 추가되며 두 차례 확장되었습니다.',
    links: [{ label: 'firmware/CUSTOM_PATTERNS.md', href: `${REPO}/blob/main/firmware/CUSTOM_PATTERNS.md` }],
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
      'A no-soldering, no-PCB assembly path (/build/breadboard): a full jumper diagram that gets Patternflow running on a breadboard, so anyone can try the hardware before ordering a board. The experiment was run first and worked, then documented.',
    detailKo:
      '납땜도 PCB 주문도 없이 만들어 보는 경로입니다(/build/breadboard). 빵판과 점퍼선만으로 패턴플로우를 구동하는 전체 배선도를 제공해, 보드를 주문하기 전에 하드웨어를 먼저 경험할 수 있게 했습니다. 실험을 먼저 해서 작동을 확인한 뒤 문서로 정리했습니다.',
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
      'The BOM was rewritten as all-through-hole — the 0805 SMD passives are gone, so a basic soldering iron is enough — and PCB orders were pinned to the v2.1 Gerbers, with a heads-up about the v3.0 board coming. The guide had moved to the repo root as BUILD_GUIDE.md two weeks earlier.',
    detailKo:
      'BOM을 100% 스루홀로 다시 썼습니다. 0805 SMD 수동소자가 사라져 일반 인두 하나면 조립이 가능해졌습니다. PCB 주문은 v2.1 거버로 고정했고, 곧 나올 v3.0 보드에 대한 안내도 함께 넣었습니다. 가이드 자체는 2주 앞서 저장소 루트의 BUILD_GUIDE.md로 옮겨진 상태였습니다.',
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
      'BUILD_GUIDE.md rewritten for the v3.0 board and snap-fit case, with two full video walkthroughs — PCB soldering, and assembly through first power-on — photo-documented print/case/wiring steps, a netlist-derived pin reference, and a dedicated OSC/Ableton build path. The v2 guide lives on as BUILD_GUIDE_v2.md for existing builds.',
    detailKo:
      'v3.0 보드와 스냅핏 케이스에 맞춰 BUILD_GUIDE.md를 새로 썼습니다. PCB 납땜과 조립~첫 전원 인가까지 각각 전체 영상 워크스루가 붙었고, 출력·케이스·배선 단계는 사진으로 기록했으며, 넷리스트에서 뽑아낸 핀 레퍼런스와 OSC/에이블톤 빌드 경로가 별도로 들어갔습니다. 기존 v2 빌더를 위해 v2 가이드는 BUILD_GUIDE_v2.md로 남겨두었습니다.',
    links: [
      { label: 'BUILD_GUIDE.md (v3.0.0)', href: `${REPO}/blob/v3.0.0/BUILD_GUIDE.md` },
      { label: 'Video — PCB soldering', href: 'https://youtu.be/NZCjMBCsDAc' },
      { label: 'Video — assembly to first power-on', href: 'https://youtu.be/J9C9bZgkNKs' },
    ],
  },
  {
    id: 'guide-panel',
    lane: 'guides',
    date: '2026-07-30',
    title: 'Panel compatibility guide',
    titleKo: 'LED 패널 호환성 가이드',
    status: 'done',
    level: 2,
    detail:
      'A panel matching the spec line for line can still stay completely black, because HUB75E is a connector and not a protocol — the driver IC decides. And the driver IC is essentially never in the listing. The guide leads with what actually works (read buyer reviews for anyone running it off an ESP32, then ask the seller), with a verified-panel table and a symptom-to-cause table. Opened up by @SimonePDA, who hit the failure and researched it properly.',
    detailKo:
      '스펙이 한 줄도 틀리지 않는 패널을 사도 화면이 완전히 까맣게 나올 수 있습니다. HUB75E는 프로토콜이 아니라 커넥터일 뿐이고, 실제로는 드라이버 IC가 결정하기 때문입니다. 그런데 드라이버 IC는 판매 페이지에 거의 적혀 있지 않습니다. 그래서 실제로 통하는 방법 — ESP32로 구동한 구매자 후기 찾아보기, 그다음 판매자에게 직접 물어보기 — 을 앞세우고, 검증된 패널 표와 증상-원인 대조표를 함께 실었습니다. 직접 이 문제를 겪고 제대로 조사해 준 @SimonePDA가 열어준 문서입니다.',
    issues: [259],
    links: [
      { label: 'docs/panel-compatibility.md', href: `${REPO}/blob/main/docs/panel-compatibility.md` },
      { label: 'Issue #259', href: `${REPO}/issues/259` },
    ],
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
      'The initial open-source Arduino sketch (firmware/patternflow_v1/patternflow_v1.ino): HUB75 DMA driver, the default pattern set, and hardware configuration extracted into config.h. Flashing was still Arduino IDE only.',
    detailKo:
      '첫 오픈소스 아두이노 스케치입니다(firmware/patternflow_v1/patternflow_v1.ino). HUB75 DMA 드라이버와 기본 패턴 세트가 들어 있고, 하드웨어 설정은 config.h로 분리했습니다. 이 시점에는 아두이노 IDE로만 업로드할 수 있었습니다.',
    links: [{ label: 'firmware/patternflow_v1 (v1.0.0)', href: `${REPO}/tree/v1.0.0/firmware/patternflow_v1` }],
  },
  {
    id: 'fw-v11',
    lane: 'firmware',
    date: '2026-04-27',
    title: 'v1.1 · browser flasher',
    titleKo: 'v1.1 · 웹 플래셔',
    status: 'done',
    level: 1,
    detail:
      'v1.1.0, one day after v1.0.0: patterns modularized into pattern_*.h files behind a central registry, a shared InputFrame for normalized encoder and button state, a long-press pattern-selection UI, and Wave Saw added. The web flasher shipped with it — one prebuilt "PatternFlow OS" image, flashed from the browser, so nobody else has to configure the Arduino IDE. The first step of the platform.',
    detailKo:
      'v1.0.0 하루 뒤에 나온 v1.1.0입니다. 패턴을 pattern_*.h 파일로 모듈화해 중앙 레지스트리에 등록하고, 엔코더·버튼 상태를 정규화해 공유하는 InputFrame을 도입하고, 롱프레스 패턴 선택 UI와 Wave Saw 패턴을 추가했습니다. 웹 플래셔도 이때 함께 나왔습니다. 미리 컴파일해 둔 "PatternFlow OS" 이미지 하나를 브라우저에서 바로 올릴 수 있게 해서, 다른 사람은 아두이노 IDE를 설정하지 않아도 되게 만든 플랫폼 영역의 첫걸음입니다.',
    links: [{ label: 'Flash from the browser', href: 'https://patternflow.work' }],
  },
  {
    id: 'fw-v2',
    lane: 'firmware',
    date: '2026-05-11',
    title: 'v2.0.0 release',
    titleKo: 'v2.0.0 릴리스',
    status: 'done',
    level: 2,
    detail:
      'v2.0.0 unified the versioning: project, firmware, PCB and case became one Patternflow version instead of four. It carried the GPIO0 cold-boot fix, the custom-pattern workflow doc, canonical pattern names (Origin, Wave Saw), and a web platform that was by then substantially complete — flasher, Live Editor, journal and build map.',
    detailKo:
      'v2.0.0에서 버전 체계를 하나로 통일했습니다. 프로젝트·펌웨어·PCB·케이스가 각자 버전을 갖는 대신 하나의 패턴플로우 버전으로 묶였습니다. GPIO0 콜드부트 수정, 커스텀 패턴 제작 문서, 패턴 이름 정규화(Origin, Wave Saw)가 들어갔고, 이 시점의 웹(플래셔, 라이브 에디터, 저널, 빌드 맵)은 이미 상당 부분 완성된 상태였습니다.',
    links: [{ label: 'CHANGELOG (2.0.0)', href: `${REPO}/blob/main/CHANGELOG.md` }],
  },
  {
    id: 'fw-foundation',
    lane: 'firmware',
    date: '2026-05-21',
    title: 'Graphics foundation',
    titleKo: '그래픽 파이프라인 개편',
    status: 'done',
    level: 1,
    detail:
      'The rendering pipeline was rebuilt from under the patterns: they now draw through a PFCanvas abstraction instead of touching the HUB75 driver, on top of shared core_math / core_color / core_noise libraries. A 2.2 gamma LUT applied in present(), per-channel white balance, and refresh raised to ~240Hz to kill the banding phone cameras were picking up. (Encoder acceleration also landed here; it was removed again in the July knob rework.)',
    detailKo:
      '패턴 밑단의 렌더링 파이프라인을 다시 만들었습니다. 패턴이 HUB75 드라이버를 직접 건드리지 않고 PFCanvas 추상화를 통해 그리도록 바꾸고, core_math / core_color / core_noise 공용 라이브러리를 깔았습니다. present()에서 2.2 감마 LUT를 적용하고, 채널별 화이트 밸런스를 잡고, 주사율을 ~240Hz로 올려 휴대폰 카메라에 잡히던 줄무늬를 없앴습니다. (엔코더 가속도 이때 들어갔지만, 7월 노브 개편에서 다시 제거되었습니다.)',
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
      'Three wireless capabilities within a week: two-way OSC reworked from a content mode into a sidechannel accepting knob, pattern and content commands (21 May); ArduinoOTA flashing over Wi-Fi with the Arduino IDE 2.x workaround documented (26 May); and the audio-react foundation — a WebSocket server routing browser audio analysis through virtual knobs (27 May).',
    detailKo:
      '일주일 사이에 무선 기능 세 가지가 들어왔습니다. 양방향 OSC를 콘텐츠 모드가 아닌 사이드채널로 재설계해 노브·패턴·콘텐츠 명령을 받게 했고(5월 21일), Wi-Fi를 통한 ArduinoOTA 플래싱과 아두이노 IDE 2.x 우회 방법을 문서화했으며(5월 26일), 브라우저의 오디오 분석 결과를 가상 노브로 흘려보내는 WebSocket 오디오 리액트 기반을 만들었습니다(5월 27일).',
  },
  {
    id: 'fw-presets',
    lane: 'firmware',
    date: '2026-06-22',
    title: 'Preset & custom slots',
    titleKo: '프리셋 · 커스텀 슬롯',
    status: 'done',
    level: 1,
    detail:
      'The pattern system split in two: a curated preset library, and reusable custom slots a builder can overwrite without touching the presets — with a custom-first registry so your own patterns come up first (Origin stays pattern 1). Licensing metadata was baked into each pattern header (patterns are CC-BY-SA-4.0, inbound = outbound) and the video content mode was dropped. Shipped in v2.1.0.',
    detailKo:
      '패턴 시스템이 둘로 갈라졌습니다. 큐레이션된 프리셋 라이브러리와, 프리셋을 건드리지 않고 덮어쓸 수 있는 재사용 커스텀 슬롯입니다. 레지스트리는 커스텀 우선으로 두어 자기가 만든 패턴이 먼저 나오게 했습니다(Origin은 1번 유지). 각 패턴 헤더에 라이선스 메타데이터를 넣었고(패턴은 CC-BY-SA-4.0, inbound = outbound), 비디오 콘텐츠 모드는 제거했습니다. v2.1.0에 포함되었습니다.',
    links: [{ label: 'firmware/patternflow (v2.1.0)', href: `${REPO}/tree/v2.1.0/firmware/patternflow` }],
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
      'Improv-Serial Wi-Fi provisioning: credentials are entered in the browser during flashing and sent over Web Serial, so no Wi-Fi password ever gets hardcoded into a sketch or committed by accident.',
    detailKo:
      'Improv-Serial Wi-Fi 프로비저닝입니다. 플래싱 중에 브라우저에서 Wi-Fi 정보를 입력하면 웹 시리얼로 전달됩니다. 스케치에 비밀번호를 하드코딩하거나 실수로 커밋할 일이 없어졌습니다.',
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
      'A Max for Live bridge device (integrations/ableton/) maps the four hardware knobs to any Live parameter over OSC — relative encoder deltas, per-slot sweep sensitivity, mappings saved with the Live set. The OSC wire protocol was written up as docs/osc-spec.md at the same time, as a versioned contract third-party integrations can build against.',
    detailKo:
      'Max for Live 브릿지 디바이스(integrations/ableton/)가 하드웨어 노브 4개를 OSC로 라이브의 아무 파라미터에나 연결합니다. 상대 엔코더 델타, 슬롯별 스윕 감도, 라이브 세트와 함께 저장되는 매핑을 지원합니다. 이때 OSC 와이어 프로토콜을 docs/osc-spec.md로 정리해, 서드파티 연동이 기댈 수 있는 버전 관리되는 규약으로 만들었습니다.',
    links: [
      { label: 'integrations/ableton', href: `${REPO}/tree/main/integrations/ableton` },
      { label: 'docs/osc-spec.md', href: `${REPO}/blob/main/docs/osc-spec.md` },
    ],
  },
  {
    id: 'fw-browser-build',
    lane: 'firmware',
    date: '2026-07-25',
    title: 'Browser firmware builds',
    titleKo: '웹 브라우저 펌웨어 빌드',
    status: 'done',
    level: 1,
    detail:
      'A build queue and worker compile a complete firmware image containing your pattern in about 30 seconds, and the browser flashes it over Web Serial — no IDE, no board package, no registry editing (#230, with OSC enabled by default per #231). Finished builds can also hand off to the device\'s own update page, so after the first USB flash new patterns go over Wi-Fi (#232). Shipped in v3.1.0.',
    detailKo:
      '빌드 큐와 워커가 내 패턴이 들어간 완전한 펌웨어 이미지를 30초 남짓에 컴파일하고, 브라우저가 웹 시리얼로 바로 플래싱합니다. IDE 설치도, 보드 패키지도, 레지스트리 수정도 필요 없습니다(#230, OSC 기본 활성화는 #231). 완성된 빌드를 기기의 업데이트 페이지로 넘길 수도 있어, 첫 USB 플래싱 이후에는 Wi-Fi로 패턴을 보낼 수 있습니다(#232). v3.1.0에 포함되었습니다.',
    issues: [230, 231, 232],
    links: [
      { label: 'Issue #230', href: `${REPO}/issues/230` },
      { label: 'Issue #232', href: `${REPO}/issues/232` },
    ],
  },
  {
    id: 'fw-modules',
    lane: 'firmware',
    date: '2026-07-28',
    title: 'Loadable pattern modules',
    titleKo: '로더블 패턴 모듈 (.pfm)',
    status: 'done',
    level: 1,
    detail:
      'v3.2.0: patterns stop needing a firmware build. A pattern compiles to a relocatable Xtensa ELF of a few KB, goes to the device over Wi-Fi and appears in the list immediately — no reflash, no reboot, no 1MB image for a 6KB pattern. Up to 128 modules install, switching costs 6–11ms, and the device gets its own pattern manager at /patterns. Design and the working proof of concept came from Simone Majocchi (@SimonePDA): a frozen C ABI, a linker script collapsing each module to four sections, and an on-device relocator.',
    detailKo:
      'v3.2.0에서 패턴에 더 이상 펌웨어 빌드가 필요 없어졌습니다. 패턴은 몇 KB짜리 재배치 가능한 Xtensa ELF로 컴파일되어 Wi-Fi로 기기에 전송되고 곧바로 목록에 나타납니다. 다시 플래싱할 필요도, 재부팅할 필요도, 6KB 패턴 하나 때문에 1MB 이미지를 올릴 필요도 없습니다. 최대 128개까지 설치할 수 있고 패턴 전환은 6~11ms이며, 기기에는 /patterns 패턴 관리자가 생겼습니다. 설계와 실제로 동작하는 PoC는 Simone Majocchi(@SimonePDA)가 가져왔습니다. 호스트-모듈 간 고정 C ABI, 모듈을 4개 섹션으로 압축하는 링커 스크립트, 그리고 기기 내 재배치기입니다.',
    issues: [232, 242],
    links: [
      { label: 'PR #242', href: `${REPO}/pull/242` },
      { label: 'Journal (community)', href: 'https://patternflow.work/journal/community' },
    ],
  },
  {
    id: 'fw-knobs',
    lane: 'firmware',
    date: '2026-07-31',
    title: 'Knob & render tuning',
    titleKo: '노브 · 렌더 튜닝',
    status: 'done',
    level: 2,
    detail:
      'Encoder acceleration removed — one detent, one step. A fast spin used to multiply each detent x2 to x5; measured against a linear build with four curves live at once, linear won outright. Knob travel now derives from the parameter\'s range instead of a fixed constant, the quadrature decoder stopped resyncing onto physically impossible bounced states, and ENCODER_CLICKS_PER_TURN was corrected from 20 to the reference encoder\'s 24. Alongside it: the frame is painted in one call instead of 8,192, and the color calibration became runtime-switchable.',
    detailKo:
      '엔코더 가속을 제거했습니다. 이제 한 딸깍에 한 스텝입니다. 빠르게 돌리면 딸깍당 2~5배로 곱해지던 방식이었는데, 네 가지 커브를 동시에 띄워두고 선형 빌드와 비교한 결과 선형이 완승했습니다. 노브 이동량도 고정 상수 대신 파라미터의 실제 범위에서 계산하도록 바꿨고, 물리적으로 불가능한 바운스 상태에 디코더가 동기화되던 버그를 잡았으며, ENCODER_CLICKS_PER_TURN을 기준 엔코더의 실제 값인 24로 고쳤습니다(기존 20). 함께: 프레임을 8,192번이 아니라 한 번의 호출로 그리도록 바꾸고, 색 보정을 런타임에 켜고 끌 수 있게 했습니다.',
    issues: [262],
    links: [{ label: 'PR #262', href: `${REPO}/pull/262` }],
  },
  {
    id: 'fw-color-calibration',
    lane: 'firmware',
    date: '2026-08-09',
    title: 'Panel color calibration',
    titleKo: '패널 색 보정',
    status: 'done',
    level: 1,
    detail:
      'v3.3.0: white balance, gamma and saturation stopped being compile-time constants. They are runtime state now, tunable live over GET /api/display while looking at the panel, so finding a number no longer costs a reflash per guess. The shipped defaults are one physical panel\'s measured numbers rather than plausible ones — WB 0.930/1.000/0.975, because that panel leans warm and red needed trimming hardest, and a saturation boost of 1.62. The boost reversed the theory that predicted it: narrow-band LED primaries cover more than sRGB, which should mean cutting saturation, but placed beside a monitor showing the same frame the panel reads washed out, and the boost held at both 14% and 100% brightness. Panels vary, so the tuning loop ships with the firmware: a test card overlay (white, greyscale staircase, color bars, and sRGB-versus-OKLab ramp pairs) that draws over the running pattern and dismisses without disturbing it.',
    detailKo:
      'v3.3.0에서 화이트 밸런스·감마·채도가 컴파일 타임 상수에서 벗어났습니다. 이제 런타임 값이라 패널을 보면서 GET /api/display로 실시간 조정할 수 있고, 값 하나 찾자고 추측할 때마다 다시 플래싱할 필요가 없습니다. 기본값도 그럴듯한 숫자가 아니라 실제 패널에서 측정한 값입니다. WB는 0.930/1.000/0.975 — 그 패널이 따뜻한 쪽으로 치우쳐 빨강을 가장 많이 깎아야 했습니다. 채도는 1.62배입니다. 이 값은 예측을 뒤집었습니다. LED의 좁은 대역 원색은 sRGB보다 넓은 색역을 가지므로 채도를 낮춰야 한다는 것이 이론이었지만, 같은 화면을 띄운 모니터 옆에 두고 보면 패널 쪽이 오히려 물이 빠져 보였고, 밝기 14%와 100% 양쪽에서 같은 결론이 나왔습니다. 패널마다 다르므로 보정 도구를 펌웨어에 함께 넣었습니다. 흰 화면, 그레이 계단, 컬러 바, 그리고 sRGB와 OKLab 램프를 위아래로 비교하는 테스트 카드가 돌아가는 패턴 위에 겹쳐 떴다가 패턴을 건드리지 않고 사라집니다.',
    issues: [287, 288],
    links: [
      { label: 'PR #287', href: `${REPO}/pull/287` },
      { label: 'Panel tuner', href: 'https://patternflow.work/panel-tuner.html' },
    ],
  },
  {
    id: 'fw-editions',
    lane: 'firmware',
    date: '2026-08-31',
    title: 'Firmware editions & feature seam',
    titleKo: '펌웨어 에디션 및 Feature Seam 분리',
    status: 'done',
    level: 1,
    detail:
      'v3.8.0 split the firmware into standalone editions over an unchanged core: Patternflow (core), Patternflow Audio (on-board PDM mic, network MIDI, browser audio-react, OSC), and Patternflow Performance (MQTT, show player, weather). Features attach through a frozen function-pointer seam (pf_feature.h); the core never names or branches on a feature. Switchable in one click from the web shelf without wiping patterns, networks or settings. CI enforces boundaries with check_boundaries.py.',
    detailKo:
      'v3.8.0에서 펌웨어가 변경 없는 코어 위에 독립 에디션 체계로 분리되었습니다. Patternflow(코어), Patternflow Audio(온보드 PDM 마이크, 네트워크 MIDI, 브라우저 오디오 반응, OSC), Patternflow Performance(MQTT, 시퀀스 플레이어, 날씨)로 구성됩니다. 각 기능은 함수 포인터 seam(pf_feature.h)을 통해 연결되며, 코어는 기능 이름을 직접 참조하지 않습니다. 웹 선반에서 패턴과 Wi-Fi 설정을 유지한 채 원클릭으로 교체 가능하며, CI의 check_boundaries.py가 경계를 엄격히 검증합니다.',
    links: [
      { label: 'EDITIONS.md', href: `${REPO}/blob/main/docs/EDITIONS.md` },
      { label: 'Release v3.8.0', href: `${REPO}/releases/tag/v3.8.0` },
    ],
  },
  {
    id: 'fw-dualcore-pipeline',
    lane: 'firmware',
    date: '2026-09-03',
    title: 'Dual-core tasking & frame acceleration',
    titleKo: 'FreeRTOS 듀얼코어 분리 및 렌더링 가속',
    status: 'done',
    level: 1,
    detail:
      'v3.9.1–v3.9.3: Wi-Fi, HTTP and OTA moved to a dedicated FreeRTOS task pinned to Core 0, leaving Core 1 exclusively for 60fps input, draw and present. Pushing a frame dropped from 9.9ms to 6.9ms via 256-entry CIE bit-spread lookup tables. Pattern list rebuilding no longer pauses rendering (2.4s to 55ms) via cached sidecars, and PFMath::jsMod replaces fmodf libm calls for 15% faster frame times. CI now compiles all three editions automatically.',
    detailKo:
      'v3.9.1~v3.9.3 릴리즈: Wi-Fi, HTTP 콘솔 및 OTA 처리를 Core 0에 할당된 FreeRTOS 태스크로 분리하여 Core 1이 오직 60fps 렌더링과 인풋에만 전념하도록 격리했습니다. 256칸 CIE 룩업 테이블로 프레임 전송 시간을 9.9ms에서 6.9ms로 단축했고, 사이드카 캐싱으로 패턴 목록 재스캔 시 렌더 중단을 2.4초에서 55ms로 없앴으며, PFMath::jsMod로 libm fmodf 호출을 제거했습니다. CI에서 3개 에디션 자동 컴파일 검증도 구축되었습니다.',
    links: [
      { label: 'Release v3.9.3', href: `${REPO}/releases/tag/v3.9.3` },
      { label: 'CHANGELOG.md', href: `${REPO}/blob/main/CHANGELOG.md` },
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
      'A pattern already declares the matrix it was composed for (// @matrix), and that travels through Pattern Lab, the community sandbox and the C++ conversion. The firmware is the part still pinned to one panel: the goal is a resolution-agnostic render path so the same pattern runs on 64x32, 128x64 or a commercial LED sign without being rewritten.',
    detailKo:
      '패턴은 이미 자기가 어떤 매트릭스를 위해 만들어졌는지 선언하고(// @matrix), 그 정보는 패턴랩·커뮤니티 샌드박스·C++ 변환까지 그대로 따라갑니다. 아직 한 가지 패널에 묶여 있는 쪽은 펌웨어입니다. 같은 패턴을 다시 쓰지 않고 64x32, 128x64, 상용 전광판 어디서든 돌릴 수 있도록 해상도에 의존하지 않는 렌더 경로를 만드는 것이 목표입니다.',
  },

  // Pattern tools
  {
    id: 'tools-origin',
    lane: 'tools',
    date: '2026-01-03',
    title: 'Patternflow origin',
    titleKo: '패턴플로우 오리진',
    status: 'done',
    level: 1,
    detail:
      'It started with a mistake. Playing with Blender geometry and shader nodes, a parameter got pushed to an extreme and the pattern that came out was worth keeping. Patternflow: Origin (origin.patternflow.work) was built around it months before any hardware existed — an interactive web piece with 3D relief shaders and shareable URL presets, made with an exhibition and 3D-printed objects in mind.',
    detailKo:
      '실수에서 시작했습니다. 오랜만에 블렌더의 지오메트리 노드와 셰이더 노드를 만지다가 파라미터를 극단으로 올려버렸고, 거기서 나온 시각 패턴에 매료되어 그대로 붙잡았습니다. 하드웨어가 생기기 몇 달 전에 그 패턴을 중심으로 만든 인터랙티브 웹 작업이 패턴플로우:오리진(origin.patternflow.work)입니다. 3D 릴리프 셰이더와 URL 프리셋 공유를 갖췄고, 처음부터 전시와 3D 프린팅 오브제를 염두에 두고 만들었습니다.',
    links: [{ label: 'origin.patternflow.work', href: 'https://origin.patternflow.work/' }],
  },
  {
    id: 'tools-origin-studio',
    lane: 'tools',
    date: '2026-01-11',
    title: 'Node-based studio',
    titleKo: '노드 기반 스튜디오',
    status: 'done',
    level: 2,
    detail:
      'A node editor added to Origin: patterns get composed by wiring nodes rather than editing parameters, with a preset system, curator mode, dynamic resolution and per-preset parameter ranges layered on over the following two weeks.',
    detailKo:
      '오리진에 노드 에디터가 붙었습니다. 파라미터를 조정하는 대신 노드를 연결해 패턴을 구성하는 방식이고, 이후 2주에 걸쳐 프리셋 시스템, 큐레이터 모드, 동적 해상도, 프리셋별 파라미터 범위가 차례로 얹혔습니다.',
    links: [{ label: 'origin.patternflow.work', href: 'https://origin.patternflow.work/' }],
  },
  {
    id: 'tools-reflow',
    lane: 'tools',
    date: '2026-02-08',
    title: 'Reflow cube · 3D export',
    titleKo: '리플로우 큐브 · 3D 출력',
    status: 'done',
    level: 2,
    detail:
      'The Reflow cube: a six-face pattern cube driven by one shared heightmap, reachable from a QR/NFC URL that carries its own preset, plus an OBJ exporter for printing the patterns as physical objects. This is the branch that turned Origin\'s patterns into things you could hold — the direct ancestor of the idea of putting them on a panel.',
    detailKo:
      '리플로우 큐브입니다. 하나의 하이트맵으로 6면을 함께 구동하는 패턴 큐브이고, QR/NFC URL에 프리셋을 실어 바로 열 수 있게 했습니다. 패턴을 실물 오브제로 뽑기 위한 OBJ 익스포터도 함께 붙었습니다. 오리진의 패턴을 손에 쥘 수 있는 물건으로 바꿔 본 갈래이며, 이걸 패널에 올려보자는 발상의 직계 조상입니다.',
  },
  {
    id: 'tools-paik',
    lane: 'tools',
    date: '2026-01-28',
    title: 'Nam June Paik Art Center',
    titleKo: '백남준아트센터',
    status: 'done',
    level: 1,
    detail:
      'A day trip to the Nam June Paik Art Center — to see someone else\'s exhibition, as it happens — landed in the middle of the 20th-anniversary programme. <Participation TV> (1963) and Robot K-456 were both seen for the first time that day. The connection came later: Patternflow did not come out of <Participation TV>, it was already an extension of Origin into physical space. But both are devices for handling light, and only one of them lets the audience build and share their own.',
    detailKo:
      '백남준아트센터에 놀러 간 날입니다. 사실은 그곳에서 열리던 다른 작가의 전시를 보러 간 것이었는데, 우연히 백남준 서거 20주년 행사 기간이었습니다. 〈참여TV〉(1963)와 〈로봇 K-456〉을 그날 처음 보았습니다. 연결은 나중에 이루어졌습니다. 패턴플로우가 〈참여TV〉에서 나왔다고 할 수는 없고, 그보다 먼저 진행하던 오리진을 현실로 확장한 쪽에 가깝습니다. 다만 둘 다 빛을 조작하는 기기이고, 그중 하나만이 관객에게 직접 만들고 공유할 자리를 내줍니다.',
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
      'The Live Editor, in the Pattern section of the site: write a pattern in JavaScript, watch it run on a simulated panel with the four knobs live, then convert it to C++ that behaves the same on the device. JS-to-C++ parity is the whole point — what you tune in the browser is what the hardware renders.',
    detailKo:
      '사이트의 패턴 섹션에 있는 라이브 에디터입니다. 자바스크립트로 패턴을 쓰고, 시뮬레이션된 패널에서 노브 4개를 실시간으로 돌려보며 확인한 다음, 기기에서 동일하게 동작하는 C++로 변환합니다. JS와 C++의 동작 일치가 핵심입니다. 브라우저에서 맞춘 그대로가 하드웨어에서 나와야 합니다.',
    links: [{ label: 'Live Editor', href: 'https://patternflow.work/pattern' }],
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
      'Pattern Lab, a development harness sitting beside the Live Editor: knob sliders calibrated to the physical encoders, encoder push buttons, and a working surface for tuning a pattern rather than writing one. The Video Baker shipped the same day, baking patterns to PFV1 video for firmware playback.',
    detailKo:
      '라이브 에디터 옆에 붙는 개발용 하네스, 패턴랩입니다. 실물 엔코더에 맞춰 캘리브레이션한 노브 슬라이더와 엔코더 푸시 버튼을 제공해, 패턴을 쓰는 곳이 아니라 다듬는 곳으로 만들었습니다. 같은 날 비디오 베이커도 함께 나와, 패턴을 PFV1 비디오로 구워 펌웨어에서 재생할 수 있게 했습니다.',
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
      'In-app AI pattern generation in Pattern Lab, bring-your-own Gemini key: describe a pattern in plain language and get running code back inside the tool, instead of copying a prompt out to a chat window and pasting the answer back.',
    detailKo:
      '패턴랩 안에서 바로 쓰는 AI 패턴 생성입니다. 본인의 Gemini 키를 넣어 사용하며, 원하는 패턴을 말로 설명하면 도구 안에서 곧바로 동작하는 코드가 나옵니다. 프롬프트를 복사해 채팅창에 붙여넣고 답을 다시 가져오는 과정이 사라졌습니다.',
    links: [{ label: 'Pattern Lab', href: 'https://patternflow.work/pattern-lab' }],
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
      'Color ramp and v-field modes with a gradient editor, plus an Experiment tab — a layer-stack patch editor that compiles down to pattern code with knob bindings. The C++ conversion prompt was hardened alongside it: exact helper signatures, an expensive-math decision table, and ramps emitted as pre-baked lookup tables so the model never has to reproduce them by hand.',
    detailKo:
      '그라디언트 에디터가 붙은 컬러 램프 & v-field 모드, 그리고 실험 탭이 들어왔습니다. 실험 탭은 레이어 스택 패치 에디터로, 노브 바인딩까지 포함한 패턴 코드로 컴파일됩니다. C++ 변환 프롬프트도 함께 단단해졌습니다. 헬퍼 시그니처를 정확히 명시하고, 연산 비용 결정표를 넣고, 램프는 미리 구운 룩업 테이블로 내보내 모델이 손으로 재현하지 않아도 되게 했습니다.',
    links: [{ label: 'Pattern Lab', href: 'https://patternflow.work/pattern-lab' }],
  },
  {
    id: 'tools-lab-mobile',
    lane: 'tools',
    date: '2026-07-26',
    title: 'Mobile UX & pattern frames',
    titleKo: '모바일 UX & 패턴 프레임',
    status: 'done',
    level: 2,
    detail:
      'A pattern now declares the matrix it was composed for with a single // @matrix line, and that fact travels through Pattern Lab, the community sandbox and the firmware conversion — so portrait and custom resolutions render correctly everywhere. On phones: a Copy prompt / Paste response action bar, and session autosave to localStorage.',
    detailKo:
      '이제 패턴은 // @matrix 한 줄로 자기가 어떤 매트릭스를 위해 만들어졌는지 선언하고, 그 정보가 패턴랩·커뮤니티 샌드박스·펌웨어 변환까지 그대로 따라갑니다. 세로형이나 커스텀 해상도도 어디서나 제대로 렌더링됩니다. 모바일에서는 프롬프트 복사 / 응답 붙여넣기 액션 바와 localStorage 세션 자동 저장이 추가되었습니다.',
    links: [{ label: 'Pattern Lab', href: 'https://patternflow.work/pattern-lab' }],
  },
  {
    id: 'tools-lab-v2',
    lane: 'tools',
    date: '2026-07-27',
    title: 'Pattern Lab v2 — layers',
    titleKo: '패턴랩 v2 — 레이어',
    status: 'done',
    level: 1,
    detail:
      'Pattern Lab rebuilt as a layered, dockable editor platform. Code layers and pixel-art layers composite bottom-to-top with opacity and blend modes; any layer can flip to masking the one below it; each code layer carries its own color ramp with alpha. A pixel panel draws straight onto the matrix. Panels dock and float like Photoshop. Publishing flattens the visible stack into one standalone pattern — while the full editable project rides along in a single compressed // @stack comment, so a shared pattern reopens as layers.',
    detailKo:
      '패턴랩을 레이어 기반의 도킹 가능한 에디터 플랫폼으로 다시 만들었습니다. 코드 레이어와 픽셀아트 레이어가 아래에서 위로 합성되며 불투명도와 블렌드 모드를 갖고, 어떤 레이어든 바로 아래 레이어를 마스킹하는 역할로 전환할 수 있으며, 코드 레이어마다 알파를 포함한 자기 컬러 램프를 갖습니다. 픽셀 패널에서는 매트릭스에 직접 그림을 그릴 수 있습니다. 패널들은 포토샵처럼 도킹하고 띄울 수 있습니다. 게시하면 보이는 스택이 하나의 독립 패턴으로 평탄화되는데, 동시에 편집 가능한 전체 프로젝트가 압축된 // @stack 주석 한 줄에 실려 함께 나갑니다. 공유받은 패턴을 다시 레이어 상태로 열 수 있다는 뜻입니다.',
    links: [{ label: 'Pattern Lab', href: 'https://patternflow.work/pattern-lab' }],
  },
  {
    id: 'tools-oklab',
    lane: 'tools',
    date: '2026-08-09',
    title: 'Perceptual color ramps',
    titleKo: '지각 기반 색 램프',
    status: 'done',
    level: 2,
    detail:
      'Ramps can interpolate in OKLab and OKLCH, not only sRGB and HSV. The two failures this removes are the ones that make generative color look amateur: blending complementary stops in sRGB collapses the middle into grey, and sweeping hue in HSV makes lightness pulse because HSV is a rearranged monitor signal rather than a model of vision. Blends that leave the panel\'s gamut are pulled back by lowering chroma at constant lightness and hue instead of clipping channels, which is what bends a color toward the nearest primary. The ramp panel also draws the ramp\'s lightness as a grey strip with a monotonicity read-out — the squint test as a permanent instrument. Because a ramp is baked to a 256-entry lookup table on the web side, the new modes reached the firmware, the C++ conversion and loadable modules without a single device-side change.',
    detailKo:
      '램프를 sRGB와 HSV뿐 아니라 OKLab·OKLCH 공간에서 보간할 수 있게 했습니다. 이걸로 사라지는 두 가지 실패가 제너러티브 색이 아마추어처럼 보이는 주된 이유입니다. sRGB에서 보색 정지점을 섞으면 중간이 회색으로 죽고, HSV에서 색상만 돌리면 명도가 요동칩니다. HSV는 인간 시각의 모델이 아니라 모니터 신호를 원기둥으로 재배열한 것이기 때문입니다. 색역을 벗어나는 보간은 채널을 잘라내는 대신 명도와 색상을 고정한 채 채도만 낮춰 되돌립니다. 채널을 자르면 색이 가장 가까운 원색 쪽으로 휘어버립니다. 램프 패널에는 램프의 명도를 회색 띠로 그리고 단조성을 함께 표시합니다. 눈을 가늘게 뜨고 확인하던 테스트를 상시 계기로 만든 것입니다. 램프는 웹에서 256칸 룩업 테이블로 구워지기 때문에, 새 모드는 기기 쪽 코드를 한 줄도 고치지 않고 펌웨어·C++ 변환·로더블 모듈까지 그대로 도달했습니다.',
    issues: [287],
    links: [{ label: 'PR #287', href: `${REPO}/pull/287` }],
  },
  {
    id: 'tools-director-export',
    lane: 'tools',
    date: '2026-08-23',
    title: 'Director & Graphic Export',
    titleKo: '디렉터(Director) 및 그래픽 내보내기',
    status: 'done',
    level: 1,
    detail:
      'Pattern Lab gained the Director panel (a multi-lane timeline sequencer for 4-knob parameter automation, exporting .pfs performance files and Ableton-compatible .mid tracks) and Graphic Export (rendering patterns directly into high-res print-ready PNG posters and looping MP4 video clips in the browser).',
    detailKo:
      '패턴랩에 디렉터(Director) 패널(4개 노브 파라미터 오토메이션 타임라인 시퀀서, .pfs 쇼 파일 및 Ableton 호환 .mid 트랙 내보내기 지원)과 그래픽 내보내기(인쇄용 고해상도 PNG 명함/포스터 및 브라우저 내 무손실 루핑 MP4 영상 클립 렌더링) 기능이 추가되었습니다.',
    links: [{ label: 'Pattern Lab', href: 'https://patternflow.work/pattern-lab' }],
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
      'A multi-agent generation pipeline: generator, critic and refiner agents working in a loop, so the tool can push a pattern past the first plausible result on its own instead of handing every judgement call back to the person at the keyboard.',
    detailKo:
      '다중 에이전트 생성 파이프라인입니다. 생성기·비평기·교정기 에이전트가 루프를 돌며, 처음 그럴듯하게 나온 결과에서 멈추지 않고 도구가 스스로 더 밀어붙이도록 하는 것이 목표입니다. 판단을 매번 사람에게 되돌려주지 않아도 되게 하는 방향입니다.',
  },

  // Community & business
  {
    id: 'biz-reddit',
    lane: 'community',
    date: '2026-04-17',
    title: 'Reddit goes viral',
    titleKo: '레딧 바이럴',
    status: 'done',
    level: 1,
    detail:
      'With the prototype breaking every time a camera came out, an older reel got posted to r/arduino — partly hoping someone would know what was wrong. It passed a thousand upvotes fast. Commenters had fought the same potentiometer noise and switched to rotary encoders; encoders were ordered the same day. Plenty of people asked to buy one. That thread is why this became open source instead of a personal project.',
    detailKo:
      '카메라만 켜면 프로토타입이 고장 나던 시기에, 예전에 찍어둔 릴스를 r/arduino에 올렸습니다. 누군가 원인을 알려주길 바라는 마음도 있었습니다. 금세 업보트 1천을 넘겼고, 댓글에는 같은 가변저항 노이즈로 고생하다 로터리 엔코더로 바꿨다는 이야기가 이어졌습니다. 그날 바로 엔코더를 주문했습니다. 사고 싶다는 사람도 많았습니다. 이 글이 개인 프로젝트를 오픈소스로 바꾼 계기입니다.',
    links: [
      { label: 'Reddit — prototype thread', href: 'https://www.reddit.com/r/arduino/comments/1so9er5/built_a_4knob_generative_pattern_controller_with/' },
      { label: 'Reddit — PCB update', href: 'https://www.reddit.com/r/arduino/comments/1szettd/12_days_later_pcb_done_rotary_encoders_done_fully/' },
      { label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' },
    ],
  },
  {
    id: 'biz-pcbway-order',
    lane: 'community',
    date: '2026-04-20',
    title: 'PCBWay sponsorship',
    titleKo: 'PCBWay 스폰서십',
    status: 'done',
    level: 2,
    detail:
      'The day after the first PCB artwork was finished — drawn over one weekend, with no idea whether it was correct — an Instagram DM arrived: PCBWay had seen the Reddit thread and wanted to sponsor the fabrication. It read like spam. It was not. The boards arrived three days later on the cheapest shipping option, and the project moved from an idea to something manufacturable.',
    detailKo:
      '주말 이틀을 갈아넣어 첫 PCB 아트워크를 끝낸 바로 다음 날, 인스타그램으로 DM이 왔습니다. PCBWay에서 레딧 글을 보았고 제작을 후원하고 싶다는 내용이었습니다. 스팸인 줄 알았는데 진짜였습니다. 가장 저렴한 배송 옵션을 골랐는데도 3일 만에 보드가 도착했고, 프로젝트가 아이디어에서 실제로 제조 가능한 물건으로 넘어갔습니다.',
    links: [{ label: 'Journal (v1 in 30 days)', href: 'https://patternflow.work/journal/v1-30-days' }],
  },
  {
    id: 'biz-opensource',
    lane: 'community',
    date: '2026-04-23',
    title: 'Repository goes public',
    titleKo: '저장소 공개',
    status: 'done',
    level: 2,
    detail:
      'The monorepo went public — web, hardware and firmware in one tree — restructured so someone else could actually follow it. The plan behind it was explicit: not a product, a genre and an ecosystem, with reputation valued over revenue and the other half of the work handed to whoever shows up.',
    detailKo:
      '모노레포를 공개했습니다. 웹·하드웨어·펌웨어를 한 트리에 두고, 다른 사람이 실제로 따라올 수 있도록 구조를 다시 잡았습니다. 그 배경에 있는 계획은 분명했습니다. 하나의 상품이 아니라 장르이자 생태계를 만드는 것, 돈보다 명예를 택하는 것, 그리고 남은 절반의 작업을 찾아오는 사람들에게 맡기는 것입니다.',
    links: [{ label: 'GitHub — engmung/Patternflow', href: REPO }],
  },
  {
    id: 'biz-designright',
    lane: 'community',
    date: '2026-04-26',
    title: 'Design filing · v1.0.0',
    titleKo: '디자인권 출원 · v1.0.0',
    status: 'done',
    level: 2,
    detail:
      'The design registration was filed on the same day v1.0.0 was tagged. Licensing was settled at the same time and has not moved since: firmware and web under MIT, hardware and designs under CC-BY-SA 4.0, with "Patternflow" held as a trademark.',
    detailKo:
      'v1.0.0을 태깅한 같은 날 미뤄두던 디자인권 출원을 진행했습니다. 라이선스도 이때 정해져 지금까지 그대로입니다. 펌웨어와 웹은 MIT, 하드웨어와 디자인은 CC-BY-SA 4.0이며, "Patternflow"는 상표로 보유합니다.',
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
      'The Discord invite went into the README with the v1.0.0 release, and the journal launched three days later with the first build log — a running account of the process, failures included, rather than a polished changelog. The first outside pull requests landed the same day: #22 and #23, both fixing things the guide had gotten wrong.',
    detailKo:
      'v1.0.0 릴리스와 함께 README에 디스코드 초대 링크가 들어갔고, 사흘 뒤 첫 빌드 로그와 함께 저널이 시작되었습니다. 잘 다듬은 체인지로그가 아니라 실패를 포함한 과정을 그대로 적는 기록입니다. 외부에서 온 첫 PR도 같은 날 들어왔습니다. #22와 #23, 둘 다 가이드가 틀리게 적어둔 것을 고치는 내용이었습니다.',
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
      'Crowd Supply signed. The application had been sent and forgotten — everyone said it was hard to get in — and the reply came the next day asking why a kit rather than a finished product, and how manufacturing would be handled. Signing committed Patternflow to being something people can actually buy, as a kit or assembled.',
    detailKo:
      'Crowd Supply와 계약했습니다. 되기 어렵다는 말을 들어 기대 없이 신청해 두고 잊고 있었는데, 바로 다음 날 답장이 왔습니다. 왜 완제품이 아니라 키트로 가는지, 펀딩을 진행하면 제조는 어떻게 처리할 것인지를 묻는 내용이었습니다. 계약과 함께 패턴플로우는 실제로 사서 만들 수 있는 물건이 되기로 확정되었습니다.',
    links: [
      { label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' },
      { label: 'Journal (stopped)', href: 'https://patternflow.work/journal/stopped' },
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
      'Nath, in the UK, built a complete Patternflow from the published files alone — the first person outside the project to do so. Proof that the guide works for someone who cannot walk over and ask.',
    detailKo:
      '영국의 Nath가 공개된 자료만 보고 패턴플로우를 완성했습니다. 프로젝트 바깥에서 처음 나온 완성품입니다. 옆에 와서 물어볼 수 없는 사람에게도 가이드가 통한다는 증거입니다.',
    links: [{ label: 'Nath UK Build', href: 'https://patternflow.work/inside/nath-uk' }],
  },
  {
    id: 'biz-exhibition',
    lane: 'community',
    date: '2026-06-15',
    title: 'Exhibition',
    titleKo: '전시',
    status: 'done',
    level: 2,
    detail:
      'Patternflow was exhibited through the Hongik course it had been tied to. What went on the wall was not the finished object — the whole written process, every journal entry and failure that could be shown, was pinned up behind it. The exhibited unit died on day one from rough handling, which is what led to pulling the SMD parts off the board.',
    detailKo:
      '패턴플로우를 연계해 진행하던 홍익대 수업의 전시입니다. 벽에 건 것은 완성된 물건이 아니라 그 뒷면이었습니다. 작업하며 쓴 글과 과정을, 도저히 보여줄 수 없는 것만 빼고 거의 다 뒤에 붙였습니다. 전시한 기기는 험하게 다뤄진 탓에 하루 만에 고장 났는데, 그 일이 보드에서 SMD 부품을 떼어내는 결정으로 이어졌습니다.',
    links: [{ label: 'Journal (refocus)', href: 'https://patternflow.work/journal/refocus' }],
  },
  {
    id: 'biz-sdsc',
    lane: 'community',
    date: '2026-06-16',
    title: 'Seoul Design Startup Center',
    titleKo: '서울디자인창업센터 입주',
    status: 'done',
    level: 2,
    detail:
      'Accepted as a resident at the Seoul Design Startup Center after a 5-minute pitch and 7 minutes of questions — what kind of business this actually is, how the IP would be handled. The mentoring said the deck was too artistic and needed numbers. Getting in as a solo student is not the usual path.',
    detailKo:
      '5분 피칭과 7분 질의응답을 거쳐 서울디자인창업센터 입주기업으로 선정되었습니다. 정확히 어떤 사업인지, IP는 어떻게 할 것인지 같은 질문이 이어졌습니다. 멘토링에서는 너무 예술적으로 간다, 숫자가 필요하다는 지적을 받았습니다. 학생 혼자 입주한 건 흔한 경우는 아닙니다.',
    links: [{ label: 'Journal (refocus)', href: 'https://patternflow.work/journal/refocus' }],
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
      'The Crowd Supply pre-launch page went live a month after signing. The 100-person waitlist was emailed on day one and under 20% converted to subscribers — the first hard lesson that an Instagram audience does not automatically follow you onto a crowdfunding platform it has never heard of.',
    detailKo:
      '계약 한 달 만에 Crowd Supply 프리런칭 페이지를 열었습니다. 첫날 웨이트리스트 100명에게 메일을 보냈지만 구독 전환은 20%에 미치지 못했습니다. 인스타그램의 반응이 처음 들어보는 크라우드펀딩 플랫폼 가입까지 자동으로 이어지지는 않는다는 걸 처음으로 확실히 배운 지점입니다.',
    links: [
      { label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' },
      { label: 'Journal (what is Patternflow)', href: 'https://patternflow.work/journal/what-is-patternflow' },
    ],
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
      'The 150-subscriber threshold Crowd Supply requires before a campaign can launch was cleared, landing at 160. It had been stuck: 60 in early July, 93 by the 18th, with the growth visibly flattening. What broke it open was a pattern the author nearly did not post for being a bit grotesque — it went on to be the best-performing one yet, tracking toward roughly 300,000 views.',
    detailKo:
      '펀딩 정식 승인 요건인 구독자 150명을 넘겨 160명을 찍었습니다. 그 전까지는 막혀 있었습니다. 7월 초 60명, 18일에 93명이었고 증가세가 눈에 띄게 꺾이던 참이었습니다. 이걸 뚫은 건 조금 징그러울까 봐 올릴까 말까 망설였던 패턴이었습니다. 그 패턴이 지금까지 중 가장 좋은 성적을 냈고, 30만 조회수 근처로 향하고 있습니다.',
    links: [
      { label: 'Instagram @patternflow.work', href: 'https://www.instagram.com/patternflow.work' },
      { label: 'Journal (faster-faster)', href: 'https://patternflow.work/journal/faster-faster' },
    ],
  },
  {
    id: 'community-discussions',
    lane: 'community',
    date: '2026-07-22',
    title: 'Pattern Community',
    titleKo: '패턴 커뮤니티',
    status: 'done',
    level: 1,
    detail:
      'The Pattern Community: a paged feed with hover-to-play live previews and scroll-wheel knob control, detail pages with in-place editing, publishing with recorded fork lineage, likes, comments and profiles, plus a Discussions board added three days later. Browse and edit without an account. The move off Discord as the main venue was deliberate — Discord is blocked in a number of countries, and locking people out of a community for where they live is not acceptable.',
    detailKo:
      '패턴 커뮤니티입니다. 마우스를 올리면 바로 재생되고 휠로 노브를 돌려볼 수 있는 페이지네이션 피드, 그 자리에서 코드를 고칠 수 있는 상세 페이지, 포크 계보가 기록되는 게시, 좋아요·댓글·프로필을 갖췄고 사흘 뒤 디스커션 게시판이 붙었습니다. 계정 없이도 둘러보고 수정할 수 있습니다. 메인 커뮤니티를 디스코드에서 옮긴 건 의도적인 결정이었습니다. 디스코드 가입이 막힌 국가가 생각보다 많고, 사는 곳 때문에 커뮤니티에서 배제되는 건 있을 수 없는 일이기 때문입니다.',
    links: [
      { label: 'Community Hub', href: 'https://patternflow.work/community' },
      { label: 'Journal (v3 and beyond)', href: 'https://patternflow.work/journal/v3-and-beyond' },
    ],
  },
  {
    id: 'community-terms',
    lane: 'community',
    date: '2026-07-29',
    title: 'Licence, takedown, decks',
    titleKo: '라이선스 · 신고 · 덱',
    status: 'done',
    level: 2,
    detail:
      'The community grew the machinery a shared library needs: licence headers that actually mean something on every published pattern, a moderation queue and takedown path, a provenance record, deletion that really deletes what the terms say it deletes, and the Saved / Deck split — Saved is a bookmark, a Deck is a curated set you can share.',
    detailKo:
      '공유 라이브러리에 필요한 장치들이 붙었습니다. 게시되는 모든 패턴에 실효성 있는 라이선스 헤더, 신고 처리 큐와 게시 중단 경로, 출처 기록, 약관에 적힌 대로 실제로 지워지는 삭제, 그리고 Saved / Deck 분리입니다. Saved는 북마크이고, Deck은 골라 담아 공유하는 묶음입니다.',
    links: [{ label: 'Community Hub', href: 'https://patternflow.work/community' }],
  },
  {
    id: 'biz-sfac',
    lane: 'community',
    date: '2026-07-30',
    title: 'SFAC arts incubating',
    titleKo: '서울문화재단 예술창업인큐베이팅',
    status: 'done',
    level: 2,
    detail:
      'Accepted into the Seoul Foundation for Arts and Culture\'s arts startup incubating programme — the second support track after the Seoul Design Startup Center residency. Later relinquished in August when selected for the KAMS program due to concurrent public grant restrictions.',
    detailKo:
      '서울문화재단 예술창업인큐베이팅에 합격했습니다. 서울디자인창업센터 입주에 이은 두 번째 지원 트랙이었으나, 이후 8월 예술경영지원센터(예경) 프로그램에 최종 선정되며 중복 수혜 제한으로 인해 포기하게 됩니다.',
  },
  {
    id: 'biz-kams',
    lane: 'community',
    date: '2026-08-21',
    title: 'KAMS arts startup support (20:1)',
    titleKo: '예술경영지원센터 예비창업 선정 (20:1)',
    status: 'done',
    level: 2,
    detail:
      'Selected for the Korea Arts Management Service (KAMS) Arts Pre-Startup Support Program against 20:1 competition (notified 21 Aug), offering 5M KRW in support and market validation. Chosen over the SFAC program to focus on global market preparation.',
    detailKo:
      '예술경영지원센터(예경) 예술분야 예비창업 지원사업에 20:1의 치열한 경쟁률을 뚫고 최종 선정되었습니다(8월 21일 선정 통보). 500만 원 상당의 간접 지원과 글로벌 시장 검증을 지원받으며, 중복 수혜 불가 규정에 따라 서울문화재단 지원 대신 예경 트랙을 선택해 집중하기로 했습니다.',
    links: [{ label: 'Journal (Right Before Launch)', href: 'https://patternflow.work/journal/right-before-launch' }],
  },
  {
    id: 'biz-launch',
    lane: 'community',
    date: '2026-08-26',
    title: 'Campaign launch',
    titleKo: '크라우드 서플라이 런칭',
    status: 'done',
    level: 1,
    detail:
      'The Crowd Supply campaign officially went live: assembled instruments ($269), DIY kits and PETG cases shipping worldwide on the v3 hardware. Launched to immediate global attention across synthesizer, maker and electronic music publications.',
    detailKo:
      'Crowd Supply 정식 펀딩이 공식 런칭되었습니다. 완제품($269), DIY 키트, PETG 케이스를 v3 하드웨어 기준으로 전 세계에 배송하며, 글로벌 신디사이저·메이커·일렉트로닉 뮤직 전문 미디어들의 집중 조명을 받았습니다.',
    links: [{ label: 'Crowd Supply page', href: 'https://www.crowdsupply.com/engmung/patternflow' }],
  },
  {
    id: 'biz-campaign-success',
    lane: 'community',
    date: '2026-09-25',
    title: 'Campaign funding & production',
    titleKo: '펀딩 목표 달성 및 양산·물류 준비',
    status: 'planned',
    level: 1,
    detail:
      'Driving the Crowd Supply campaign past its funding goal, finalizing component sourcing, completing CE/FCC lab testing, and setting up global fulfillment logistics.',
    detailKo:
      '크라우드 서플라이 펀딩 목표 금액 달성을 견인하고, 주요 부품 공급망 확정, CE/FCC 시험실 인증 마무리 및 글로벌 배송 물류 체계를 확립하는 단계입니다.',
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
      'A licensing rail rather than a shop. The paying side is commercial LED surfaces — shop signage, venue walls, installations — not device owners, who keep everything free. Patterns stay CC-BY-SA for anyone building one; a separate paid track lets creators license their work for commercial display, with the provenance and licence records the community already keeps as its foundation.',
    detailKo:
      '상점이 아니라 라이선싱 레일입니다. 돈을 내는 쪽은 상업용 LED 면 — 가게 간판, 공연장 벽, 설치 작업 — 이지, 기기 소유자가 아닙니다. 기기 소유자에게는 계속 무료입니다. 직접 만들어 쓰는 사람에게 패턴은 CC-BY-SA 그대로이고, 별도의 유료 트랙에서 창작자가 상업적 전시용으로 자기 작업을 라이선스할 수 있게 합니다. 커뮤니티가 이미 쌓고 있는 출처·라이선스 기록이 그 토대입니다.',
  },

  // Media & Press
  {
    id: 'media-fabscene',
    lane: 'media',
    date: '2026-06-15',
    title: 'fabscene (JP) ×2',
    titleKo: '팹씬 (fabscene, 일본)',
    status: 'done',
    level: 2,
    detail:
      'Two write-ups on the Japanese maker site fabscene, assembled from the two r/arduino threads. Nobody mentioned them — they turned up while looking at where site traffic was coming from. Not a major outlet, but exactly the shape of pickup the project is built for: the material is all public, take it and write.',
    detailKo:
      '일본의 메이커 사이트 팹씬(fabscene)에 올라온 두 건입니다. r/arduino에서 화제가 된 두 게시글을 정리한 내용이었습니다. 알려준 사람은 없었고, 사이트 유입 트래픽을 살펴보다 발견했습니다. 크게 유의미한 매체는 아니지만, 이 프로젝트가 지향하는 형태의 소개입니다. 자료가 전부 공개되어 있으니 가져가서 쓰면 됩니다.',
    links: [
      { label: 'fabscene — make', href: 'https://fabscene.com/new/make/arduino-patternflow-led-art/' },
      { label: 'fabscene — news', href: 'https://fabscene.com/new/news/patternflow-esp32-led-synthesizer/' },
    ],
  },
  {
    id: 'media-hackster-1',
    lane: 'media',
    date: '2026-05-02',
    title: 'Hackster.io #1',
    titleKo: 'Hackster.io (1차)',
    status: 'done',
    level: 1,
    detail:
      '"You\'ll Want This LED Pattern Generator on Your Desk", by Gareth Halfacree — the first press pickup, written from the r/arduino thread and the public repo without anyone being asked. The first sign that the project could travel on its own.',
    detailKo:
      'Gareth Halfacree 기자의 "You\'ll Want This LED Pattern Generator on Your Desk"입니다. 첫 언론 픽업이고, r/arduino 글과 공개 저장소만 보고 요청 없이 쓰인 기사입니다. 프로젝트가 스스로 굴러갈 수 있다는 첫 신호였습니다.',
    links: [{ label: 'Hackster.io Article #1', href: 'https://www.hackster.io/news/you-ll-want-this-led-pattern-generator-on-your-desk-007c411e74e4' }],
  },
  {
    id: 'media-hackster-2',
    lane: 'media',
    date: '2026-06-28',
    title: 'Hackster.io #2',
    titleKo: 'Hackster.io (2차)',
    status: 'done',
    level: 2,
    detail:
      '"A Living Canvas of Shifting Colors and Motion" — an organic follow-up covering how the hardware had moved on, landing the day after the Crowd Supply pre-launch page opened. Also unprompted.',
    detailKo:
      '"A Living Canvas of Shifting Colors and Motion"입니다. 그동안 하드웨어가 어떻게 발전했는지를 다룬 자발적 후속 기사로, 크라우드 서플라이 프리런칭 페이지를 연 바로 다음 날 올라왔습니다. 이 역시 요청하지 않은 기사입니다.',
    links: [{ label: 'Hackster.io Article #2', href: 'https://www.hackster.io/news/a-living-canvas-of-shifting-colors-and-motion-c53f6fd6e478' }],
  },
  {
    id: 'media-twitter-viral',
    lane: 'media',
    date: '2026-05-12',
    title: 'X / Twitter viral',
    titleKo: '트위터(X) 바이럴',
    status: 'done',
    level: 2,
    detail:
      'A third-party post on X (@Inspector_9) went viral on its own, with the author\'s name rendered "Seungheon" instead of Seunghun — hun read as heon. The author\'s own X account, posting the same material, got nothing. Consistency is apparently the whole game on that platform, which is why Instagram stayed the one channel worth maintaining.',
    detailKo:
      'X(트위터)에서 한 유저(@Inspector_9)의 게시글이 자발적으로 바이럴되었습니다. 제작자 이름은 이승훈이 아니라 이승헌으로 적혀 있었습니다. hun이 헌으로 읽힌 모양입니다. 정작 본인 계정에 같은 내용을 올렸을 때는 아무 반응이 없었습니다. 그쪽은 결국 꾸준함이 전부인 듯해, 인스타그램 한 채널에만 집중하기로 한 계기가 되었습니다.',
    links: [{ label: 'X post (@Inspector_9)', href: 'https://x.com/Inspector_9/status/2053926198049226794' }],
  },
  {
    id: 'media-yanko',
    lane: 'media',
    date: '2026-05-14',
    title: 'Yanko Design',
    titleKo: '얀코디자인 (Yanko Design)',
    status: 'done',
    level: 2,
    detail:
      'Featured on Yanko Design\'s official Instagram (@yankodesign), focused on the enclosure and the tactile side — the knobs and the light, rather than the electronics.',
    detailKo:
      '글로벌 인더스트리얼 디자인 매체 얀코디자인(Yanko Design)의 공식 인스타그램(@yankodesign)에 소개되었습니다. 전자적인 부분보다 인클로저와 촉각적인 면 — 노브와 빛 — 에 초점을 맞춘 게시글이었습니다.',
    links: [{ label: 'Yanko Design Instagram', href: 'https://www.instagram.com/p/DYUYZzxMBa6/' }],
  },
  {
    id: 'media-howtogeek',
    lane: 'media',
    date: '2026-07-03',
    title: 'How-To Geek',
    titleKo: '하우투긱 (How-To Geek)',
    status: 'done',
    level: 2,
    detail:
      'Included in How-To Geek\'s curated "Beautiful ESP32 Projects to Make This Weekend" round-up — a recommendation aimed at people deciding what to build, which is the audience that matters most for a project whose whole point is that you build it.',
    detailKo:
      'How-To Geek의 주말 추천 큐레이션 기사 "Beautiful ESP32 Projects to Make This Weekend"에 수록되었습니다. 이번 주말에 뭘 만들지 고르는 사람들을 향한 추천이고, 직접 만드는 것이 핵심인 프로젝트에는 가장 중요한 독자층입니다.',
    links: [{ label: 'How-To Geek Article', href: 'https://www.howtogeek.com/beautiful-esp32-projects-to-make-this-weekend-jul-3-5/' }],
  },
  {
    id: 'media-digikey-youtube',
    lane: 'media',
    date: '2026-07-09',
    title: 'DigiKey YouTube',
    titleKo: '디지키(DigiKey) 유튜브',
    status: 'done',
    level: 2,
    detail:
      'Covered on DigiKey\'s official YouTube channel — the open-source hardware architecture, the four-knob interface, and the panel in motion.',
    detailKo:
      '글로벌 전자부품 유통기업 디지키(DigiKey)의 공식 유튜브 채널에 소개되었습니다. 오픈소스 하드웨어 구조, 4개 노브 인터페이스, 그리고 실제로 움직이는 패널을 다뤘습니다.',
    links: [{ label: 'DigiKey YouTube Video', href: 'https://www.youtube.com/watch?v=3Y-rTNgBq6w&t=18s' }],
  },
  {
    id: 'media-video',
    lane: 'media',
    date: '2026-07-17',
    title: 'Intro video',
    titleKo: '소개 영상',
    status: 'done',
    level: 2,
    detail:
      'A two-minute introduction video, three days of work, made for the Crowd Supply campaign and posted to YouTube expecting reach. It did not get out of the low hundreds of views. The same footage with subtitles, posted to Instagram as an afterthought, did fine. A useful correction about where this project\'s audience actually lives.',
    detailKo:
      '3일을 들여 만든 2분짜리 소개 영상입니다. Crowd Supply 런칭에 쓸 영상이었고 유튜브에서 조회수가 나오길 기대했지만 세 자릿수도 넘기지 못했습니다. 같은 영상에 자막만 붙여 보너스처럼 올린 인스타그램 쪽이 오히려 괜찮은 성과를 냈습니다. 이 프로젝트의 관객이 실제로 어디 있는지에 대한 유용한 교정이었습니다.',
    links: [{ label: 'Journal (I hope it works out)', href: 'https://patternflow.work/journal/i-hope-it-works-out' }],
  },
  {
    id: 'media-can',
    lane: 'media',
    date: '2026-07-13',
    title: 'Creative Applications',
    titleKo: 'Creative Applications (CAN)',
    status: 'done',
    level: 1,
    detail:
      'Creative Applications Network ran "Patternflow – An open-source LED synthesizer reinterpreting Participation TV" — submitted on 3 July, published on the 13th. This one was asked for rather than picked up: CAN was the art-side magazine the author had wanted a piece in since long before there was anything to show it.',
    detailKo:
      'Creative Applications Network에 "Patternflow – An open-source LED synthesizer reinterpreting Participation TV"가 게재되었습니다. 7월 3일에 요청해 13일에 실렸습니다. 알아서 다뤄준 것이 아니라 직접 요청한 건입니다. CAN은 보여줄 것이 생기기 한참 전부터 선망하던 예술 쪽 매거진이었습니다.',
    links: [{ label: 'Creative Applications Article', href: 'https://www.creativeapplications.net/news/patternflow-an-open-source-led-synthesizer-reinterpreting-participation-tv/' }],
  },
  {
    id: 'media-mixmag',
    lane: 'media',
    date: '2026-08-28',
    title: 'Mixmag Asia',
    titleKo: '믹스맥 아시아 (Mixmag Asia)',
    status: 'done',
    level: 1,
    detail:
      '"Patternflow: an open-source LED synth built by a community of sound & visuals" — organic feature by the Asian headquarters of Mixmag, the world\'s leading electronic dance music publication, spotlighting the solo designer journey from Seoul, homage to Nam June Paik, and the 150+ builder community.',
    detailKo:
      '세계 최고 권위의 일렉트로닉 댄스 뮤직 매거진 Mixmag 아시아 본부에 "Patternflow: an open-source LED synth built by a community of sound & visuals" 기사가 자발적으로 게재되었습니다. 서울의 1인 디자이너 개발 서사, 백남준 오마주, 150+ 커뮤니티 생태계를 집중 조명했습니다.',
    links: [{ label: 'Mixmag Asia Article', href: 'https://mixmag.asia/read/patternflow-open-source-led-synthesizer-seunghun-lee-community-made-tech/' }],
  },
  {
    id: 'media-matrixsynth',
    lane: 'media',
    date: '2026-08-30',
    title: 'MATRIXSYNTH',
    titleKo: '매트릭스신스 (MATRIXSYNTH)',
    status: 'done',
    level: 2,
    detail:
      '"Playing light like an instrument — Open Source ESP32-S3 LED Synthesizer" — pitch pickup on the premier 20-year synthesizer archive webzine, spreading the 3-minute demo video, full hardware specs, and Crowd Supply campaign.',
    detailKo:
      '20년 역사의 전 세계 1위 신디사이저 전문 아카이브 웹진 MATRIXSYNTH에 피칭 성사되어 "Playing light like an instrument — Open Source ESP32-S3 LED Synthesizer"가 소개되었습니다. 3분 데모 영상, 제품 스펙 및 크라우드 서플라이 펀딩 링크가 즉시 전파되었습니다.',
    links: [{ label: 'MATRIXSYNTH Feature', href: 'https://www.matrixsynth.com/2026/08/playing-light-like-instrument-open.html' }],
  },
  {
    id: 'media-synthtopia',
    lane: 'media',
    date: '2026-08-30',
    title: 'Synthtopia',
    titleKo: '신스토피아 (Synthtopia)',
    status: 'done',
    level: 1,
    detail:
      '"Patternflow Is An Open-Source Light Synthesizer & Music Controller" by Synthhead on America\'s #1 synthesizer and music tech blog, spotlighting 8,192-pixel live calculation, wireless Ableton OSC, and the $269 assembled unit on Crowd Supply.',
    detailKo:
      '미국 1위 신디사이저 및 음악 기술 블로그 Synthtopia(작성자: Synthhead)에 "Patternflow Is An Open-Source Light Synthesizer & Music Controller"가 게재되었습니다. 8,192픽셀 실시간 연산 스펙, 에이블톤 무선 OSC 연동, $269 완제품 펀딩을 최상단에 배치했습니다.',
    links: [{ label: 'Synthtopia Article', href: 'https://www.synthtopia.com/content/2026/08/30/patternflow-is-an-open-source-light-synthesizer-music-controller/' }],
  },
  {
    id: 'media-mmr',
    lane: 'media',
    date: '2026-08-31',
    title: 'MMR Magazine',
    titleKo: 'MMR 매거진 (MMR Magazine)',
    status: 'done',
    level: 2,
    detail:
      '"Open-Source Patternflow Device Combines Light and Music Control" — published in Musical Merchandise Review (MMR Magazine, est. 1879), the 140-year-old US music industry B2B trade journal, registering Patternflow to the instrument trade as a next-gen visual controller.',
    detailKo:
      '1879년 창간되어 140년 역사를 지닌 미국 악기 산업/유통 B2B 1위 전문지 MMR Magazine에 "Open-Source Patternflow Device Combines Light and Music Control"이 실려, 미국 공식 악기 유통업계에 차세대 비주얼 컨트롤러 신제품으로 등재되었습니다.',
    links: [{ label: 'MMR Magazine Article', href: 'https://mmrmag.com/open-source-patternflow-device-combines-light-and-music-control/' }],
  },
  {
    id: 'media-amazona',
    lane: 'media',
    date: '2026-08-31',
    title: 'AMAZONA.de',
    titleKo: '아마조나 (AMAZONA.de)',
    status: 'done',
    level: 1,
    detail:
      '"Engmung Patternflow, Visualisierungs-Synthesizer" by Thilo Goldschmitz on Europe and Germany\'s #1 synthesizer magazine, written after direct editorial outreach to gather photos and details, targeting European synth enthusiasts.',
    detailKo:
      '유럽 및 독일어권 1위 신디사이저 전문 매거진 AMAZONA.de(작성자: Thilo Goldschmitz)에 "Engmung Patternflow, Visualisierungs-Synthesizer" 기사가 게재되었습니다. 에디터가 직접 연락해 사진을 수급한 후 작성되어, 독일/유럽 신스 매니아층을 집중 타깃했습니다.',
    links: [{ label: 'AMAZONA.de Article', href: 'https://www.amazona.de/engmung-patternflow-visualisierungs-synthesizer/' }],
  },
  {
    id: 'media-midifan',
    lane: 'media',
    date: '2026-09-02',
    title: 'Midifan',
    titleKo: '미디판 (Midifan)',
    status: 'done',
    level: 1,
    detail:
      '"开源灯光合成器与音乐控制器 Patternflow 开启众筹，也可以自己 DIY" by Wode on Greater China\'s leading 25-year-old computer music portal, introducing the Crowd Supply launch and DIY open-source path to the Asian music tech community.',
    detailKo:
      '25년 역사의 중화권(중국/대만/홍콩) 1위 컴퓨터 음악/신스 전문 포털 Midifan(작성자: Wode)에 "开源灯光合成器与音乐控制器 Patternflow 开启众筹，也可以自己 DIY"가 게재되어, 아시아 중화권 최대 커뮤니티에 크라우드펀딩 런칭 및 DIY 오픈소스 프로젝트가 동시 소개되었습니다.',
    links: [{ label: 'Midifan Article', href: 'https://www.midifan.com/modulenews-detailview-60651.htm' }],
  },
];

export const EDGES: RoadmapEdge[] = [
  { from: 'biz-exhibition', to: 'pcb-v22', note: 'the exhibited unit died — and the SMD parts turned out to be optional' },
  { from: 'pcb-v3', to: 'case-v3', note: 'new board size and port positions — the case had to follow' },
  { from: 'case-v3', to: 'case-petg', note: 'shipping durability demanded PETG' },
  { from: 'biz-cs-150', to: 'biz-launch', note: '150 subscribers unlocked launch prep' },
  { from: 'biz-sfac', to: 'biz-kams', note: '20:1 selection at KAMS superseded SFAC due to concurrent grant rules' },
  { from: 'biz-kams', to: 'biz-launch', note: 'pre-startup market validation for the launch' },
  { from: 'fw-editions', to: 'biz-launch', note: 'audio and performance editions ready for backers' },
  { from: 'biz-launch', to: 'biz-campaign-success', note: 'funding the campaign unlocks mass production' },
  { from: 'biz-launch', to: 'media-mixmag', note: 'launch coverage across global music & synth media' },
  { from: 'biz-launch', to: 'media-synthtopia', note: 'synth enthusiasts discover Patternflow' },
  { from: 'biz-launch', to: 'media-amazona', note: 'European synth press pickup' },
  { from: 'fw-browser-build', to: 'community-discussions', note: 'build & flash in the browser makes sharing worth doing' },
  { from: 'fw-modules', to: 'biz-market', note: 'a pattern installs in seconds — the precondition for licensing one' },
  { from: 'fw-resolution', to: 'biz-market', note: 'any panel, any size' },
  { from: 'tools-multiagent', to: 'biz-market', note: 'pattern quality at scale' },
];
