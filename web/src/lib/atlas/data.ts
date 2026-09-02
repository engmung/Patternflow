// Pattern Atlas — the map of pattern-technique space.
//
// A sibling of the workshop map: the workshop charts where the HARDWARE could
// go (territories = project directions), this charts where PATTERNS could go.
// Axes are feelings, not math: x = order → chaos, y = wire/trajectory → field.
//
// This module is the single source of truth, edited like the community seed
// script — by hand, in code. Coordinates are taste hypotheses: reposition with
// the page's edit mode, export, and bake the JSON back here.
//
// Localization: the page defaults to English (the community is public);
// Korean lives in the base fields, English in the *En fields. The generation
// prompt is English-only — it is written for AIs, not for readers.
//
// The generation prompt (BASE) mirrors Pattern Lab's COPY PROMPT assembly
// (lib/ai/gemini.ts: buildVariantCopyPrompt → buildTechGuide) verbatim, with the
// atlas taste/craft directions layered where the lab puts VARIANT_*_DIRECTION.
// If gemini.ts's wording changes, change it here too.

export type AtlasFamilyId =
  | "ink" | "waterfall" | "optics" | "advect"
  | "feedback" | "pde" | "life" | "critical" | "invent";

export type AtlasStatusId =
  | "verified" | "active" | "hold" | "unexplored" | "retired" | "invented";

export type AtlasEntry = {
  id: string;
  /** Korean name. */
  nm: string;
  /** English name. */
  nmEn: string;
  /** Small-caps subtitle (language-neutral). */
  en?: string;
  f: AtlasFamilyId;
  st: AtlasStatusId;
  /** Data coords: x 0..100 (order→chaos), y 0..100 (wire→field). */
  x: number;
  y: number;
  /** Texture — what the material looks like. */
  tex: string;
  texEn: string;
  /** Critical knob and its phase transition (Korean display; English display reuses knobEn). */
  knob?: string;
  /** English critical-knob line — used both in the panel (EN) and in the prompt. */
  knobEn?: string;
  vert?: string;
  vertEn?: string;
  risk?: string;
  riskEn?: string;
  impl?: string;
  implEn?: string;
  /**
   * The batch this entry joined the map with (YYYY-MM-DD; a second batch the
   * same day appends a letter, e.g. 2026-08-16b — the tags compare
   * lexicographically). The original chart carries none. The newest tag
   * present is what the map calls "new" — past fifty points, "which ones did
   * I just add?" stops being answerable by looking, and a research import
   * only makes that worse.
   */
  added?: string;
  /** Prompt subject line (English). */
  topic?: string;
  /** Prompt implementation hints (English). */
  hints?: string[];
};

export const FAMILIES: Record<AtlasFamilyId, { label: string; labelEn: string; color: string }> = {
  ink:       { label: "동역학계 잉크",    labelEn: "Dynamical-systems ink",      color: "#5ad7ff" },
  waterfall: { label: "이력 폭포",        labelEn: "History waterfalls",         color: "#7ea4ff" },
  optics:    { label: "광학 누적",        labelEn: "Optical accumulation",       color: "#ffce6b" },
  advect:    { label: "필드 이류",        labelEn: "Field advection",            color: "#7fe0a0" },
  feedback:  { label: "재귀 피드백",      labelEn: "Recursive feedback",         color: "#ff8ad4" },
  pde:       { label: "PDE 물성",         labelEn: "PDE matter",                 color: "#ffa06b" },
  life:      { label: "연속 생명",        labelEn: "Continuous life",            color: "#c9a0ff" },
  critical:  { label: "임계 · 유체 (섬)", labelEn: "Criticality · fluids",       color: "#6be0d0" },
  invent:    { label: "발명 실험",        labelEn: "Invented experiments",       color: "#d8d2c4" },
};

export const STATUSES: Record<AtlasStatusId, {
  label: string; labelEn: string; legend: string; legendEn: string;
}> = {
  verified: {
    label: "검증됨", labelEn: "Verified",
    legend: "본토 — 실기기/취향 통과",
    legendEn: "mainland — passed hardware and taste",
  },
  active: {
    label: "탐사중", labelEn: "Exploring",
    legend: "지금 걷고 있는 땅 — 패턴은 있고 판정은 아직",
    legendEn: "ground being walked right now — a pattern exists, the verdict does not",
  },
  hold: {
    label: "유보", labelEn: "On hold",
    legend: "평가 애매 — 재도전 가치",
    legendEn: "ambiguous verdict — worth a second attempt",
  },
  unexplored: {
    label: "미탐사", labelEn: "Uncharted",
    legend: "해도에만 있는 땅 — 아직 아무도 안 걸어봤다",
    legendEn: "land that exists only on the chart — nobody has walked it yet",
  },
  retired: {
    label: "버려짐", labelEn: "Abandoned",
    legend: "접은 땅 — 걸어봤더니 별로였거나, 볼 것 없어 보이거나, 기기에 무겁거나",
    legendEn: "dropped — it disappointed when walked, or does not look worth the walk, or the device cannot hold it",
  },
  invented: {
    label: "발명", labelEn: "Invented",
    legend: "AI 창작 가설 — 실재하는 수학, 아직 아무도 안 밟은 땅",
    legendEn: "AI-authored hypotheses — real mathematics nobody has walked yet",
  },
};

/** Continent blobs: [family, cx, cy, rx, ry, rotationDeg] in data coords. */
export const BLOBS: Array<[AtlasFamilyId, number, number, number, number, number]> = [
  ["ink",       50, 27, 31, 14, -5],
  ["waterfall", 63, 35, 24, 13,  7],
  ["optics",    38, 58, 15, 11,  0],
  ["advect",    58, 61, 15, 17,  0],
  ["pde",       56, 77, 34, 11,  0],
  ["life",      56, 74, 11,  7,  0],
  ["feedback",  79, 59, 10,  8,  0],
];

export const ENTRIES: AtlasEntry[] = [
  { id: "clifford", nm: "Clifford · De Jong 잉크", nmEn: "Clifford · De Jong ink", en: "STRANGE INK", f: "ink", st: "verified", x: 68, y: 22,
    tex: "수십만 반복 궤적이 페이드 잉크 버퍼에 쌓여 만드는 필라멘트 레이스. 계수 모핑으로 접히고 펼쳐진다.",
    texEn: "Hundreds of thousands of iterated orbits piling into a fading ink buffer — filament lace that folds and unfolds as the coefficients morph.",
    knob: "사상 계수(a,b,c,d 중 하나) — 어트랙터의 위상 자체가 바뀌는 분기를 건넌다.",
    knobEn: "one map coefficient (a, b, c, d) — it crosses bifurcations where the attractor's topology itself changes",
    vert: "어트랙터를 세로로 세워 회전 투영, 긴 축을 따라 접히게.",
    vertEn: "Stand the attractor upright under a rotating projection; let it fold along the long axis.",
    risk: "계수 공간 대부분이 발산/점 붕괴. 검증된 유역을 시드로, 그 근방만 모핑.",
    riskEn: "Most of coefficient space diverges or collapses. Seed a known-good basin and morph only nearby.",
    topic: "Strange ink — orbits of a Clifford / De Jong style 2D iterated map accumulated into a fading ink buffer",
    hints: ["accumulate thousands of points per frame: buf *= fade, buf[hit] += ink",
            "morph coefficients gently around a known-good basin — most of coefficient space diverges or collapses",
            "smoothstep tone curve on output"] },

  { id: "gmira", nm: "Gumowski-Mira 잉크", nmEn: "Gumowski-Mira ink", en: "PETAL INK", f: "ink", st: "verified", x: 58, y: 28,
    tex: "꽃잎·해양생물 같은 대칭 필라멘트가 뭉개지며 유기적 레이스가 된다.",
    texEn: "Symmetric petal-like filaments smearing into organic lace.",
    knob: "μ(비선형 항) — 대칭 꽃 ↔ 흩어진 혼돈 구름.",
    knobEn: "mu (the nonlinearity) — symmetric petal lace ↔ scattered chaotic cloud",
    topic: "Fading-ink orbit accumulation of the Gumowski-Mira map",
    hints: ["ride the knob from the basin where symmetry survives into the basin where it collapses"] },

  { id: "lorenz", nm: "3D 흐름 잉크 (Lorenz · Thomas)", nmEn: "3D flow ink (Lorenz · Thomas)", en: "FLOW INK", f: "ink", st: "verified", x: 63, y: 34,
    tex: "3D 궤적의 회전 투영 + 깊이 가중 잉크 — 감긴 실타래가 숨쉬며 돈다.",
    texEn: "Rotating projection of 3D trajectories with depth-weighted ink — a wound skein turning as it breathes.",
    knob: "Lorenz ρ / Thomas b — 고정점 수렴 ↔ 혼돈의 경계를 건넌다.",
    knobEn: "Lorenz rho / Thomas b — crosses the boundary between fixed-point convergence and chaos",
    topic: "3D flow ink — Lorenz or Thomas attractor trajectories under a rotating projection with depth-weighted ink",
    hints: ["clamp integration dt and reseed on divergence", "multiply ink intensity by depth for volume"] },

  { id: "chirikov", nm: "표준사상 위상공간", nmEn: "Standard-map phase space", en: "KAM SEA", f: "ink", st: "verified", x: 47, y: 26,
    tex: "KAM 섬들의 동심 레이스가 혼돈 바다에 잠식되는 위상공간의 초상.",
    texEn: "Concentric lace of KAM islands being eaten by a chaotic sea — a portrait of phase space itself.",
    knob: "K(킥 강도) — KAM 섬 보존 ↔ 붕괴. 교과서적 위상전이.",
    knobEn: "K (kick strength) — KAM islands survive ↔ dissolve; a textbook phase transition",
    topic: "Phase-space portrait of the Chirikov standard map — hundreds of initial conditions accumulated as ink (KAM islands in a chaotic sea)",
    hints: ["sweep K roughly 0.5..5", "run hundreds of initial conditions in parallel for density"] },

  { id: "harmono", nm: "하모노그래프", nmEn: "Harmonograph", en: "PENDULUM LACE", f: "ink", st: "verified", x: 18, y: 14,
    tex: "감쇠 진동의 간섭 곡선 — 질서 쪽 끝단의 보석 세공.",
    texEn: "Interference curves of damped oscillation — jewel work at the order end of the map.",
    knob: "Detune(주파수비 어긋남) — 닫힌 리사주 ↔ 세차하는 나선 띠.",
    knobEn: "detune (frequency-ratio offset) — closed Lissajous figures ↔ precessing spiral bands",
    risk: "질서 끝단이라 5분 서사가 약함 — 모핑 필수.",
    riskEn: "Weak five-minute narrative at the order end — morphing is mandatory.",
    topic: "Damped harmonograph curves accumulated into fading ink",
    hints: ["this sits at the order end of the map — morphing is mandatory or it freezes into a dead picture"] },

  { id: "sprott", nm: "미사용 어트랙터 군도", nmEn: "Uncharted attractor archipelago", en: "UNCHARTED ATTRACTORS", f: "ink", st: "retired", x: 74, y: 30,
    tex: "Ikeda · Tinkerbell · Svensson · Aizawa · Sprott 수십 종 — 각각 결이 다른 필라멘트.",
    texEn: "Ikeda · Tinkerbell · Svensson · Aizawa · dozens of Sprott systems — each with a different filament grain.",
    knob: "각 계의 급소 계수 (사전 스캔으로 좋은 유역부터 찾기).",
    knobEn: "that system's own critical coefficient — scan for good basins first",
    topic: "Pick one unused attractor (Ikeda map, Tinkerbell, Svensson, Aizawa, or a Sprott flow) and render it as fading orbit ink",
    hints: ["scan several candidates quickly; keep only filament textures that differ clearly from Clifford/De Jong"] },

  { id: "flame", nm: "프랙탈 플레임", nmEn: "Fractal flame", en: "FRACTAL FLAME", f: "ink", st: "verified", x: 52, y: 42,
    tex: "variation 블렌드로 비선형 왜곡된 IFS — 빛나는 깃털/연기 필라멘트.",
    texEn: "An IFS warped by blended nonlinear variations — glowing feather and smoke filaments.",
    knob: "variation 가중치 블렌드 — 형태 문법 자체가 바뀐다.",
    knobEn: "variation weight blend — the form grammar itself changes",
    impl: "PhoenixEmber(2026-08-11 핀) — 카오스게임 ~2천 iter/frame + log-density, 실기 통과.",
    implEn: "PhoenixEmber (pinned 2026-08-11) — chaos game at ~2k iters/frame + log-density, passed hardware.",
    topic: "Fractal flame — an IFS with blended nonlinear variations, accumulated as log-density ink",
    hints: ["log-density tone mapping is what makes flames glow"] },

  { id: "caustic", nm: "파면 굴절 커스틱", nmEn: "Refraction caustics", en: "POOLSIDE", f: "optics", st: "verified", x: 40, y: 58,
    tex: "굴절된 광자들이 착지점에 누적되어 만드는 그물빛 — 가짜 패턴이 아닌 실제 광학량.",
    texEn: "Photons refracted through a wavefront, accumulated where they land — real optics, not a faked pattern.",
    knob: "depth(초점거리) — 퍼진 일렁임 ↔ 날카로운 그물 특이점.",
    knobEn: "depth (focal distance) — soft shimmer ↔ sharp caustic web singularities",
    topic: "Refraction caustics — photons passed through a slowly morphing wavefront, accumulated where they land",
    hints: ["thousands of photons per frame", "build the wavefront from a sum of slow low-frequency noises"] },

  { id: "mirror", nm: "반사 커스틱 · 중력 렌즈", nmEn: "Reflection caustics · gravity lens", en: "FOLDED LIGHT", f: "optics", st: "verified", x: 46, y: 64,
    tex: "곡면 거울/질량장이 접는 빛 — 커스틱의 형제, 더 이질적인 접힘(fold/cusp).",
    texEn: "Light folded by curved mirrors or a mass field — sibling of caustics with stranger folds and cusps.",
    knob: "곡률/질량 분포 — 커스틱 가지가 태어나고 합쳐지는 전이.",
    knobEn: "curvature / mass distribution — caustic folds and cusps are born and merge",
    impl: "ParabolicWavefront·DualLenseQuadrupole(2026-08-10 핀) — 픽셀당 trig ~4개 단일 패스가 실기 상한선 근처.",
    implEn: "ParabolicWavefront · DualLenseQuadrupole (pinned 2026-08-10) — ~4 trig per pixel in a single pass sits near the hardware ceiling.",
    topic: "Reflection caustics off a curved mirror, or gravitational-lens style deflection — photon landing accumulation" },

  { id: "interf", nm: "이동 광원 간섭 누적", nmEn: "Slow interference accumulation", en: "SLOW INTERFERENCE", f: "optics", st: "retired", x: 30, y: 52,
    tex: "천천히 움직이는 광원들의 위상 간섭이 시간으로 쌓이는 모아레 장.",
    texEn: "Phase interference of slowly moving sources, accumulated over time into a drifting moiré field.",
    knob: "광원 수/파장비 — 정상파 격자 ↔ 유동 간섭.",
    knobEn: "source count / wavelength ratio — standing-wave lattice ↔ drifting interference",
    risk: "'단순 파동 간섭' 클리셰와 한 끗 차이 — 누적과 모핑으로만 차별화된다.",
    riskEn: "One step from the plain-wave-interference cliché — only accumulation and morphing set it apart.",
    topic: "Slowly moving wave sources whose interference accumulates over time into a drifting moiré field",
    hints: ["differentiate from the cliché ripple demo through accumulation and slow morphing — never a static interference shot"] },

  { id: "gale", nm: "모핑 벡터장 이류", nmEn: "Morphing-field advection", en: "GALE INK", f: "advect", st: "verified", x: 55, y: 68,
    tex: "보이지 않는 입자들이 남기는 유선 잉크 — 바람의 질감.",
    texEn: "Streamline ink left behind by invisible particles — the texture of wind.",
    knob: "curl 비율 0↔1 — 층류 결 ↔ 난류 소용돌이 전이.",
    knobEn: "curl ratio 0↔1 — laminar grain ↔ turbulent swirl transition",
    topic: "Gale ink — invisible particles advected through a morphing vector field, leaving only streamline ink",
    hints: ["particles must never read as objects: short lifetimes, ink trails only"] },

  { id: "physarum", nm: "Physarum 점균", nmEn: "Physarum slime", en: "SLIME NETWORK", f: "advect", st: "verified", x: 61, y: 42,
    tex: "페로몬 장을 따라 자기조직되는 수송망 — 살아있는 잎맥 웹.",
    texEn: "A transport web self-organizing along a pheromone field — living leaf veins.",
    knob: "sense angle / reach — 망의 굵기·분기 밀도가 위상 변화.",
    knobEn: "sensor angle / sensor reach — the network's thickness and branching density shift phase",
    topic: "A Physarum transport network — agents plus a pheromone trail field, self-organizing into living vein webs",
    hints: ["thousands of agents + a diffusing, decaying trail grid"] },

  { id: "mphysarum", nm: "다종 점균", nmEn: "Two-species slime", en: "TERRITORY WAR", f: "advect", st: "retired", x: 66, y: 47,
    tex: "서로 밀어내는 두 페로몬 종의 영토 전쟁 — 경계 필라멘트가 요동.",
    texEn: "A territorial war between two mutually repelling pheromone species — the boundary filaments quiver.",
    knob: "종간 반발 계수 — 공존 ↔ 영토 분리 전이.",
    knobEn: "cross-species repulsion — coexistence ↔ territorial segregation",
    topic: "Two-species Physarum with mutually repelling pheromone fields — a territorial war of transport networks" },

  { id: "smoke", nm: "curl noise 연기", nmEn: "Curl-noise smoke", en: "RISING SMOKE", f: "advect", st: "retired", x: 62, y: 78,
    tex: "비압축 curl 장 + 부력 — 솔버 없이 피어오르는 연기 기둥.",
    texEn: "A divergence-free curl field plus buoyancy — smoke columns rising without a solver.",
    knob: "부력/난류 스케일 — 층류 기둥 ↔ 말려 올라가는 난류.",
    knobEn: "buoyancy / turbulence scale — laminar column ↔ curling turbulence",
    vert: "상승 자체가 주인공 — 세로 프레임과 천생연분.",
    vertEn: "Rising itself is the protagonist — born for the tall frame.",
    risk: "8/9 SmokeFluid 탈락 — 픽셀당 장 합성 + semi-Lagrangian 리샘플은 실기 예산 초과. 입자 이류(GaleInk 방식)로만.",
    riskEn: "SmokeFluid (8/9) failed hardware: per-pixel field synthesis + semi-Lagrangian resampling blows the budget. Particle advection (the GaleInk route) is the way in.",
    topic: "Rising smoke — a curl-noise (divergence-free) velocity field plus buoyancy, made visible by advected PARTICLES depositing ink",
    hints: ["no solver needed: the curl of a noise potential is already incompressible",
            "advect a few hundred particles through the curl field and deposit ink — do NOT synthesize the velocity field per pixel per frame, and no semi-Lagrangian density resampling (both failed on hardware)"] },

  { id: "lic", nm: "LIC 유선 직물", nmEn: "LIC streamline fabric", en: "LINE INTEGRAL CONVOLUTION", f: "advect", st: "retired", x: 43, y: 50,
    tex: "벡터장 전체를 노이즈로 문질러 얻는 조밀한 유선 직물 — 철가루 자기장의 질감. 플로우필드 클리셰의 비클리셰 상위호환. (연구 수입)",
    texEn: "Noise smeared along an entire vector field — a dense woven streamline fabric, the iron-filings texture. The non-cliché upgrade of the flow field. (research import)",
    knob: "장의 위상 구조(소용돌이 수/배치) — 결이 갈라지는 임계.",
    knobEn: "the field's topology (number and placement of vortices) — where the grain tears apart",
    risk: "픽셀당 유선 적분 수십 스텝 — ESP32 예산 주의.",
    riskEn: "Tens of integration steps per pixel — mind the ESP32 budget.",
    topic: "Line Integral Convolution — smear noise along a morphing vector field into a dense woven streamline fabric",
    hints: ["budget: integrate a low-res field with interpolation; the per-pixel streamline integral is the expensive part",
            "scroll the noise phase over time so the fabric flows"] },

  { id: "ouroboros", nm: "재귀 피드백", nmEn: "Recursive feedback", en: "OUROBOROS", f: "feedback", st: "hold", x: 76, y: 62,
    tex: "프레임 전체가 회전+줌+워프를 거쳐 자기 위에 재합성 — 무한 터널의 물질화.",
    texEn: "The whole frame re-composited onto itself through rotate + zoom + warp — an infinite tunnel made material.",
    knob: "zoom=1 경계 — 수렴 ↔ 폭주의 칼날 위.",
    knobEn: "the zoom≈1 boundary — the knife edge between convergence and blow-up",
    risk: "단독 평가는 애매했음. 그리고 8/14 워프-리샘플 시도 2건 전패 — 픽셀당 바이리니어 피드백은 실기 적대적. 정수 시프트(행 복사 스크롤/회전)나 타일 단위 재귀로만.",
    riskEn: "Ambiguous on its own — and both 8/14 warp-resample attempts failed hardware. Per-pixel bilinear feedback is device-hostile; feedback must move by whole-pixel integer shifts (row-copy scroll/rotate) or at tile level.",
    topic: "Recursive frame feedback via integer-pixel shifts — the frame re-composited onto itself through whole-pixel scroll/rotate steps and decay, never per-pixel resampling",
    hints: ["integer shifts alone pin the image to the grid and look mechanical — follow every shift with a cheap 3x3 blur, which redistributes brightness across neighbours and reads as viscosity. That blur is what buys back the continuity bilinear sampling was there to provide",
            "decay by bit-shift equivalent (v -= v/32) rather than a float multiply"] },

  { id: "hybrid", nm: "피드백 교배", nmEn: "Feedback crossbreed", en: "CROSSBREED", f: "feedback", st: "retired", x: 82, y: 56,
    tex: "검증된 소스(커스틱·잉크)를 피드백 기계에 씨앗으로 — 소스의 질감이 재귀로 증폭된다.",
    texEn: "A proven source (caustic ink, attractor ink) fed as the seed of the feedback machine — its texture amplified by recursion.",
    knob: "피드백 게인 × 소스 강도 — 소스 지배 ↔ 재귀 지배.",
    knobEn: "feedback gain × source strength — source-dominated ↔ recursion-dominated",
    risk: "피드백 변환은 정수 시프트 한정 (ouroboros 참조) — 워프-리샘플 판 2건 실기 전패.",
    riskEn: "The feedback transform must be integer shifts (see ouroboros) — both warp-resample builds failed hardware.",
    topic: "A feedback crossbreed — feed a proven source (caustic ink, attractor ink) as the seed of an integer-shift frame feedback" },

  { id: "cgl", nm: "CGL 결함 난류", nmEn: "CGL defect turbulence", en: "BOILING", f: "pde", st: "verified", x: 86, y: 72,
    tex: "나선 결함들이 태어나고 소멸하는 끓는 장 — '끓는 것'의 정수.",
    texEn: "Spiral defects born and dying across a boiling field — the essence of 'the boiling one'.",
    knob: "α·β — Benjamin-Feir 임계선을 건너는 결함 난류 전이.",
    knobEn: "alpha·beta — crossing the Benjamin-Feir line into defect turbulence",
    topic: "Complex Ginzburg-Landau spiral-defect turbulence, rendering |A|",
    hints: ["pick regimes with local drama (defects) — uniform activity reads as grey mush",
            "guard with an amplitude ceiling + reseed"] },

  { id: "fhn", nm: "FitzHugh-Nagumo", nmEn: "FitzHugh-Nagumo", en: "EXCITABLE", f: "pde", st: "hold", x: 71, y: 66,
    tex: "흥분파 전선이 쓸고 지나가는 매질 — '뛰는 것'.",
    texEn: "An excitable medium swept by wavefronts — 'the beating one'.",
    knob: "흥분성 임계 — 파 소멸 ↔ 나선파 ↔ 난류 breakup.",
    knobEn: "excitability threshold — wave death ↔ stable spirals ↔ turbulent breakup",
    risk: "전선만 보이면 저밀도 — 유보였음. breakup 레짐 위주로 재도전.",
    riskEn: "Lone fronts read as low density — held. Retry in the breakup regime.",
    topic: "A FitzHugh-Nagumo excitable medium in its spiral-wave breakup regime",
    hints: ["only the breakup regime has enough density; lone traveling fronts read as low-density props",
            "use Barkley kinetics for the retry — u(1-u)(u-(v+b)/a) is piecewise-cheap with zero transcendentals, and near a ≈ 0.75, b ≈ 0.06 the spiral tips MEANDER, tracing epicyclic flowers instead of closed circles (the extra drama the first attempt lacked)"] },

  { id: "sh", nm: "Swift-Hohenberg", nmEn: "Swift-Hohenberg", en: "FREEZING", f: "pde", st: "hold", x: 27, y: 72,
    tex: "줄무늬/육각 패턴이 굳어가는 장 — '굳는 것'.",
    texEn: "Stripes and hexagons hardening into place — 'the freezing one'.",
    knob: "r(분기 파라미터) — 균질 ↔ 패턴 형성 임계.",
    knobEn: "r (bifurcation parameter) — homogeneous ↔ patterned; ride near onset",
    risk: "정적이 되기 쉬움 — 결함 동역학 위주로만.",
    riskEn: "Freezes into a still picture easily — defect dynamics only.",
    topic: "Swift-Hohenberg pattern formation, focused on crawling defect dynamics near onset",
    hints: ["stay near onset where defects crawl — deep in the patterned phase it freezes into a dead picture"] },

  { id: "cahn", nm: "Cahn-Hilliard 상분리", nmEn: "Cahn-Hilliard separation", en: "SPINODAL", f: "pde", st: "retired", x: 38, y: 80,
    tex: "기름과 물이 갈라지며 굵어지는 미로 — 성장·병합의 서사가 내장돼 있다.",
    texEn: "Oil and water unmixing into a coarsening labyrinth — a narrative of growth and merging built into the physics.",
    knob: "혼합비 — 미로(스피노달) ↔ 방울(핵생성) 위상.",
    knobEn: "mixture ratio — labyrinth (spinodal) ↔ droplet (nucleation) morphology",
    topic: "Cahn-Hilliard spinodal decomposition — two phases separating and coarsening, a built-in narrative of growth and merging",
    hints: ["4th-order PDE: use semi-implicit or spectral stepping",
            "if spectral on a real field: enforce Hermitian symmetry every step (hard-won lesson — roundoff ghosts grow exponentially otherwise)"] },

  { id: "ising", nm: "Ising 어닐링", nmEn: "Ising annealing", en: "CRITICAL DOMAINS", f: "pde", st: "verified", x: 46, y: 86,
    tex: "자화 도메인이 온도에 따라 얼고 녹는 통계역학의 장.",
    texEn: "Magnetization domains freezing and melting with temperature — statistical mechanics as a field.",
    knob: "T(온도) — 임계점 근방의 프랙탈 요동이 하이라이트.",
    knobEn: "temperature T — the critical point's fractal flicker is the highlight",
    impl: "IsingModelPattern(2026-08-14 핀) — 체커보드 Metropolis + 국소 자화 평균, 실기 통과.",
    implEn: "IsingModelPattern (pinned 2026-08-14) — checkerboard Metropolis + local magnetization average, passed hardware.",
    topic: "Ising-model annealing — magnetization domains freezing and melting with temperature, fractal fluctuations near criticality",
    hints: ["checkerboard update for parallel-friendly sweeps",
            "render local magnetization averages, not raw spins (raw spins are pixel noise)"] },

  { id: "potts", nm: "Potts 결정립 조대화", nmEn: "Potts grain growth", en: "GRAIN GROWTH", f: "pde", st: "unexplored", x: 33, y: 85, added: "2026-08-16",
    tex: "수십 결정립이 서로를 삼키며 굵어지는 거품 — 입계의 그물이 느리게 흐르고, 위에서 새 립이 내려와 조대화가 끝나지 않는다.",
    texEn: "Dozens of grains swallowing one another into a coarsening foam — a slow-flowing net of boundary walls, fresh grains fed from above so it never finishes.",
    knob: "온도 T = 0..1.2 (J 단위) — 동결된 각진 립 ↔ 배회하는 부드러운 입계 ↔ 끓는 무질서.",
    knobEn: "temperature T = 0..1.2 (units of J) — frozen faceted grains ↔ soft wandering boundaries ↔ boiling disorder",
    topic: "q-state Potts model grain growth — a foam of domains coarsening forever, rendered as boundary walls over faint grain shades",
    hints: ["q ≈ 24 states in a Uint8Array; checkerboard Metropolis exactly like Ising, comparing neighbor agreement counts — all integer energy math",
            "render boundary density (how many neighbors disagree) bright over a dim per-grain shade (state * constant mod 1)",
            "coarsening stalls at equilibrium: keep feeding fresh random grains into the top rows and let renewal flow down the tall axis"] },

  { id: "rps", nm: "가위바위보 나선", nmEn: "Rock-paper-scissors spirals", en: "CYCLIC COMPETITION", f: "pde", st: "unexplored", x: 66, y: 80, added: "2026-08-16",
    tex: "세 종이 순환하며 서로를 먹는다 — 영토가 영원히 뒤집히고, 침공 전선이 감겨 도는 나선 팔이 된다.",
    texEn: "Three species each devouring the next in a cycle — territory forever overturning, invasion fronts winding into rotating spiral arms.",
    knob: "이동도 = 0.5..8 — 얽힌 스펙클 ↔ 맑은 회전 나선 ↔ 한 종의 석권(멸종 전이).",
    knobEn: "mobility = 0.5..8 — entangled speckle ↔ clean rotating spirals ↔ one species sweeps the board (the mobility-driven extinction transition)",
    topic: "May-Leonard rock-paper-scissors on a lattice — cyclic invasion fronts winding into rotating spiral arms, territory forever overturning",
    hints: ["states empty/A/B/C in a Uint8Array; random sequential pair events: selection (A kills B leaving empty), reproduction into empty, and neighbor exchange (mobility) — zero transcendentals",
            "thousands of single-site events per frame; render species as three fixed tones with an invasion-age EMA so fresh fronts glow",
            "the knob is the exchange-to-reaction ratio: past a critical mobility spirals outgrow the box and one species wins — reseed on extinction",
            "all-integer fallback with the same spiral engine: the cyclic cellular automaton (Griffeath) — N states, advance when ≥ kappa neighbors hold your successor; kappa 1..3 crosses turbulent ↔ crystalline spirals"] },

  { id: "xy", nm: "XY 소용돌이 해리", nmEn: "XY vortex unbinding", en: "KOSTERLITZ-THOULESS", f: "pde", st: "unexplored", x: 57, y: 89, added: "2026-08-16",
    tex: "위상 스핀 장의 비단결 — 소용돌이 쌍이 묶였다 풀렸다 하며, 결이 흐르는 천과 그 결함이 한 화면에.",
    texEn: "The silk grain of a phase-spin field — vortex pairs binding and unbinding, flowing cloth and its defects in one frame.",
    knob: "온도 T = 0.3..1.6 — 묶인 소용돌이 쌍의 매끈한 비단 ↔ T_KT≈0.89 ↔ 자유 소용돌이 플라즈마.",
    knobEn: "temperature T = 0.3..1.6 — bound vortex pairs in smooth silk ↔ T_KT ≈ 0.89 ↔ a free-vortex plasma (the Kosterlitz-Thouless transition)",
    topic: "The 2D XY model crossing the Kosterlitz-Thouless transition — spin-phase silk with vortex pairs binding and unbinding",
    hints: ["quantize angles to 256 bins (Uint8Array) and precompute a 256-entry cosine table in setup — the microcontroller cannot afford per-site trig, and with the table every energy evaluation is a lookup",
            "checkerboard Metropolis; proposal = current angle ± a small random step",
            "render local alignment (mean table-cosine of the four neighbor differences) so silk reads bright and vortex cores dark; warm up below T_KT in setup"] },

  { id: "nematic", nm: "활성 네마틱 결함 난류", nmEn: "Active nematic defect turbulence", en: "COMET DEFECTS", f: "pde", st: "unexplored", x: 78, y: 76, added: "2026-08-16b",
    tex: "스스로 에너지를 태우는 액정 — +1/2 혜성 결함이 제 발로 달리며 매질을 휘젓고, -1/2 세잎 결함과 만나 소멸한다. 결함이 엔진인 난류. (연구 수입)",
    texEn: "A liquid crystal burning its own fuel — +1/2 comet defects self-propel, stirring the medium, annihilating on -1/2 trefoils. Turbulence whose engines are the defects themselves. (research import)",
    knob: "활성 응력 α — 정지 네마틱 ↔ 결함 해리 난류 (실재하는 활성 전이).",
    knobEn: "active stress alpha — quiescent nematic ↔ defect-unbinding turbulence (a genuine activity transition)",
    topic: "Active nematic defect turbulence — a Q-tensor orientation field driven by active stress, +1/2 comet defects self-propelling and annihilating on -1/2 trefoils; render orientational order so comets read as darting bright wakes",
    hints: ["evolve the two Q-tensor components with a 5-point stencil relaxation plus active terms; skip the full Stokes solve — the local approximation u ∝ -alpha * div(Q) keeps the comets motile with no Poisson iteration (loses exact incompressibility, keeps the phenomenon)",
            "render the local nematic order S (or |Q|) with an EMA: defect cores read dark, comet wakes bright",
            "15-35 defects on screen in the good regime; annihilation balances pair creation, so it runs forever"] },

  { id: "ks2d", nm: "2D 화염면 끓는 지형", nmEn: "2D flame-front boiling terrain", en: "KURAMOTO-SIVASHINSKY 2D", f: "pde", st: "unexplored", x: 76, y: 84, added: "2026-08-16b",
    tex: "포물선 첨점 세포들이 태어나고 갈라지고 합쳐지는 끓는 지형 — lineage 폭포의 2차원 본토. 능선과 첨점이 끝없이 재배열된다. (연구 수입)",
    texEn: "A boiling terrain of parabolic cusp cells — the 2D homeland of the lineage waterfall. Ridges and cusps born, splitting, merging, forever rearranging. (research import)",
    knob: "영역 크기 / 첨점 파장 비 — 동결 세포 격자 ↔ 시공간 혼돈.",
    knobEn: "domain-to-wavelength ratio — frozen cell lattice ↔ full spatiotemporal chaos",
    topic: "The 2D Kuramoto-Sivashinsky equation — h_t = -lap(h) - biharm(h) + |grad h|^2/2 — a boiling terrain of cusp cells splitting and merging; render curvature or mean-subtracted height",
    hints: ["explicit stepping is stable at dt ≈ 0.02 with unit grid spacing — 6-10 substeps per frame is enough motion; the 13-point biharmonic is two nested 5-point Laplacians, zero transcendentals",
            "raw h drifts unboundedly: subtract the mean every step, and render curvature (the Laplacian you already computed) or mean-subtracted height through an EMA-normalized smoothstep",
            "the instability wavelength is ~9 px, so 64x128 holds ~7x14 cells — 25-50 cusps live at once"] },

  { id: "lle", nm: "공진기 소산 솔리톤", nmEn: "Cavity dissipative solitons", en: "LUGIATO-LEFEVER", f: "pde", st: "unexplored", x: 44, y: 78, added: "2026-08-16b",
    tex: "어두운 공진기 바다 위의 빛 핀들 — 진동하는 꼬리로 서로를 붙잡아 분자를 이루고, 떠다니고, 숨쉬고, 흩어진다. (연구 수입)",
    texEn: "Pinpoints of light on a dark cavity sea — locking one another through oscillating tails into molecules that drift, breathe, and scatter. (research import)",
    knob: "공진기 이조 α ≈ 1.7..2.5 — 균질 배경 ↔ 솔리톤 존재 창 ↔ 붕괴 (실재하는 존재 경계).",
    knobEn: "cavity detuning alpha ≈ 1.7..2.5 — homogeneous background ↔ the soliton existence window ↔ collapse (a genuine existence boundary)",
    topic: "Lugiato-Lefever cavity solitons — a driven damped nonlinear Schrödinger field, E_t = -(1+i*alpha)E + i|E|^2 E + i*lap(E) + F; sharp bright solitons on a dark background, binding into molecules through their oscillatory tails",
    hints: ["split E into real/imaginary Float32 fields with 5-point Laplacians — the same machinery as CGL, canonical F ≈ 1.3",
            "render |E|^2 with a peak EMA; the dark homogeneous background is part of the picture — do not normalize it away",
            "inject weak seeded noise continuously so fresh solitons keep nucleating as others drift off or merge"] },

  { id: "sinegordon", nm: "구동 사인-고든 플럭손 기체", nmEn: "Driven sine-Gordon fluxon gas", en: "BALLISTIC SOLITONS", f: "pde", st: "unexplored", x: 38, y: 68, added: "2026-08-16b",
    tex: "위상장의 국소 매듭들이 탄도로 달리며 부딪힌다 — 퍼지지 않고, 뭉개지지 않고, 정확히 충돌하고 소멸하는 입자 같은 파동. (연구 수입)",
    texEn: "Localized knots of a phase field running ballistically — waves that behave like particles: no dispersion, no smearing, exact collisions and annihilations. (research import)",
    knob: "감쇠 α × 바이어스 γ — 정지 격자 ↔ 플럭손 증식 혼돈 (탈피닝 전이). 무구동 적분가능계는 지루함이 판정된 땅 — 구동·감쇠가 생명이다.",
    knobEn: "damping alpha × bias gamma — pinned lattice ↔ chaotic fluxon proliferation (a depinning transition). The undriven integrable system is verdict-dull — drive and damping are what make it live",
    topic: "The damped driven 2D sine-Gordon equation — phi_tt = lap(phi) - sin(phi) - alpha*phi_t + gamma — a gas of ballistic fluxon solitons colliding and annihilating; canonical alpha ≈ 0.05, gamma ≈ 0.4",
    hints: ["leapfrog the wave equation with sin from a 256-entry table — two Float32 fields, ~15 flops per site, no library trig",
            "render sin^2(phi/2) so kinks read as bright cores on dark ground; an energy-density render also works",
            "gamma feeds energy that annihilations spend — modulate gamma slowly (harmless axis) so the population breathes"] },

  { id: "schrod", nm: "Schrödinger 파속", nmEn: "Schrödinger packet", en: "QUANTUM CAUSTICS", f: "pde", st: "retired", x: 56, y: 82,
    tex: "복소 파동함수 |ψ|²의 간섭·터널링·산란 — 양자 커스틱.",
    texEn: "|ψ|² of a complex wavefunction — interference, tunneling, scattering. Quantum caustics.",
    knob: "퍼텐셜 지형 — 속박 ↔ 산란 전이.",
    knobEn: "the potential landscape — bound ↔ scattering transition",
    topic: "2D Schrödinger wave-packet evolution rendered as |psi|² — interference, tunneling, scattering",
    hints: ["split-step spectral method", "use norm conservation as the divergence guard"] },

  { id: "lineage", nm: "Lineage — KS 폭포", nmEn: "Lineage — KS waterfall", en: "KURAMOTO-SIVASHINSKY", f: "waterfall", st: "retired", x: 58, y: 38,
    tex: "화염면 혼돈의 계보도 — 세포가 태어나고 합쳐지고 갈라지는 직조가 아래로 흐른다.",
    texEn: "A genealogy of flame-front chaos — cells born, merging and splitting, woven downward.",
    knob: "Domain(L)=16..64 — 동결 기둥 ↔ 세포 병합 ↔ 땋임 난류.",
    knobEn: "domain length L = 16..64 — frozen columns ↔ breathing cell merges ↔ braided turbulence",
    impl: "_temp/s01-waterfall/lineage.js · 기술검증 통과, 판정 대기 (트랜스크립트에서 복구됨)",
    implEn: "_temp/s01-waterfall/lineage.js · passed tech verification, awaiting verdict (recovered from transcript)",
    topic: "A vertical history waterfall of 1D Kuramoto-Sivashinsky flame-front chaos — newest row on top, ancestry scrolling down",
    hints: ["spectral IMEX + Hermitian projection every step — roundoff otherwise grows a non-Hermitian ghost that blows up every ~300 time units",
            "an N=64 dealiased grid only resolves dissipation up to L≈64"] },

  { id: "blight", nm: "Blight — CML 간헐성", nmEn: "Blight — CML intermittency", en: "DIRECTED PERCOLATION", f: "waterfall", st: "retired", x: 76, y: 42,
    tex: "어두운 층류 들판을 밝은 난류 레이스가 잠식 — 감염 전선의 폭포.",
    texEn: "Bright turbulent lace eating through a dark laminar field — a waterfall of infection fronts.",
    knob: "Chaos(a)=1.44..2.0 — 층류 ↔ 퍼콜레이션 ↔ 전면 난류.",
    knobEn: "map coefficient a = 1.44..2.0 — laminar ↔ percolating fronts ↔ full turbulence (directed-percolation-like)",
    impl: "_temp/s01-waterfall/blight.js · 기술검증 통과, 판정 대기 (트랜스크립트에서 복구됨)",
    implEn: "_temp/s01-waterfall/blight.js · passed tech verification, awaiting verdict (recovered from transcript)",
    topic: "A waterfall of coupled-map-lattice spatiotemporal intermittency, rendered by the recurrence distance |x(t) - x(t-2)|",
    hints: ["render the recurrence distance, not spatial roughness — the laminar zigzag dithers into 1px stripes otherwise",
            "a slow EMA plus 3-tap smoothing fuses period-2 flicker into continuous filaments"] },

  { id: "logistic", nm: "로지스틱 분기 스캔", nmEn: "Logistic bifurcation scan", en: "BIFURCATION FALLS", f: "waterfall", st: "retired", x: 66, y: 20,
    tex: "r을 훑으며 흘러내리는 분기 다이어그램 — 갈라지는 궤도 밀도의 폭포.",
    texEn: "The bifurcation diagram flowing down as r scans — a waterfall of splitting orbit density.",
    knob: "r 중심/폭 — 주기배가 계단 ↔ 혼돈 띠 ↔ 주기 창.",
    knobEn: "r center / width — period-doubling staircase ↔ chaos bands ↔ periodic windows",
    risk: "분기도는 교과서 이미지 — 살아있는 스캔 + 궤도 잉크로만 차별화됨.",
    riskEn: "The diagram is a textbook image — only a living, scanning, ink-dense waterfall earns its place.",
    topic: "A logistic-map bifurcation waterfall — each row a histogram of orbit density while the scanned r range drifts and breathes",
    hints: ["the bifurcation diagram is a textbook image: it only earns its place as a living, scanning, ink-dense waterfall"] },

  { id: "kdv", nm: "KdV 솔리톤 궤적", nmEn: "KdV soliton worldlines", en: "SOLITON WORLDLINES", f: "waterfall", st: "retired", x: 22, y: 24,
    tex: "솔리톤들이 서로를 통과하는 세로 월드라인 직조.",
    texEn: "Solitons passing through one another — a weave of vertical worldlines.",
    knob: "분산 계수 — 솔리톤 분해 ↔ 파열.",
    knobEn: "dispersion coefficient — soliton decomposition ↔ breakdown",
    risk: "월드라인이 셀 수 있는 선으로 보일 위험 — 밀도 확보가 관건 (뻔함 필터 2번 경계).",
    riskEn: "Worldlines risk being countable lines — density is the whole game.",
    topic: "KdV soliton worldlines woven downward — solitons passing through each other in a vertical history waterfall",
    hints: ["danger: countable worldlines — keep enough solitons and ink that it reads as weave, not lines"] },

  { id: "cgl1d", nm: "1D CGL 폭포", nmEn: "1D CGL waterfall", en: "PHASE DEFECT FALLS", f: "waterfall", st: "retired", x: 81, y: 47,
    tex: "1차원 위상 결함들의 생멸이 흘러내리는 시공간 얼룩.",
    texEn: "Phase defects born and dying as spacetime stains flowing down the frame.",
    knob: "α·β — 위상 난류 ↔ 결함 난류.",
    knobEn: "alpha·beta — phase turbulence ↔ defect turbulence",
    topic: "A vertical waterfall of 1D complex Ginzburg-Landau — phase defects born and dying as spacetime stains",
    hints: ["complex field: use an amplitude ceiling as the divergence guard"] },

  { id: "kpz", nm: "KPZ 계면 성장", nmEn: "KPZ interface growth", en: "ROUGHENING FRONT", f: "waterfall", st: "unexplored", x: 69, y: 28, added: "2026-08-16",
    tex: "자라는 계면의 기울기 장이 지층으로 쌓인다 — 매끈함이 보편류 거칠기로 무너지는 기록.",
    texEn: "A growing interface's slope field laid down as strata — the record of smoothness collapsing into universal roughness.",
    knob: "비선형 λ = 0..4 — Edwards-Wilkinson 매끈한 이완 ↔ KPZ 탄도 거칠어짐 (보편류 전이).",
    knobEn: "nonlinearity lambda = 0..4 — Edwards-Wilkinson smooth relaxation ↔ KPZ ballistic roughening (a universality-class crossing)",
    topic: "A history waterfall of a 1D KPZ growing interface — each row the local slope of the height field, roughening strata scrolling down",
    hints: ["h_i += dt * (nu * laplacian(h) + (lambda/2) * (grad h)^2 + noise); canonical nu = 1, dt = 0.05, seeded noise",
            "raw height drifts unboundedly — subtract the mean height every step and render SLOPE or curvature, never raw h",
            "64 cells on a ring; multiple substeps per frame scroll multiple rows"] },

  { id: "traffic", nm: "유령 정체 시공간", nmEn: "Phantom-jam spacetime", en: "NAGEL-SCHRECKENBERG", f: "waterfall", st: "unexplored", x: 50, y: 18, added: "2026-08-16",
    tex: "아무도 브레이크를 밟지 않았는데 태어나는 정체 — 밝은 자유류 직조를 거슬러 오르는 어두운 사선 충격파들.",
    texEn: "Jams born from nothing — dark diagonal shockwaves climbing upstream through a bright free-flow weave.",
    knob: "차량 밀도 ρ = 0.05..0.5 — 자유류 ↔ 임계 ↔ 스톱앤고 정체파.",
    knobEn: "car density rho = 0.05..0.5 — free flow ↔ critical ↔ stop-and-go jam waves (a genuine flow transition)",
    risk: "차가 셀 수 있는 개체로 보이는 순간 사망 — 속도장/밀도장으로만 렌더.",
    riskEn: "The moment cars are countable it dies — render the velocity/density field, never vehicles.",
    topic: "A spacetime waterfall of Nagel-Schreckenberg traffic — backward-drifting jam shocks as dark diagonals in a bright free-flow weave",
    hints: ["canonical: vmax = 5, randomization p = 0.25, a 64-cell ring",
            "render local mean VELOCITY smoothed over ~3 cells with an EMA — raw occupancy is countable-car pixel noise",
            "integer state only; several update sweeps per frame scroll several rows"] },

  { id: "oslo", nm: "Oslo 쌀더미 지층", nmEn: "Oslo rice-pile strata", en: "STICK-SLIP AVALANCHES", f: "waterfall", st: "unexplored", x: 71, y: 22, added: "2026-08-16",
    tex: "한 알씩 먹인 더미가 미끄러질 때만 흐른다 — 사태 활동이 지층으로 쌓이는 멱법칙의 기록.",
    texEn: "A pile fed one grain at a time, flowing only when it slips — stick-slip activity laid down as power-law strata.",
    knob: "구동률 = 프레임당 낟알 1..12 — 고립된 사태 펄스 ↔ 임계 겹침 ↔ 연속 요동 (시간척도 분리가 급소).",
    knobEn: "drive rate = grains per frame 1..12 — isolated avalanche pulses ↔ critical overlap ↔ continuous churn (timescale separation is the dial)",
    topic: "The Oslo rice-pile model as a history waterfall — local slope and topple activity written as ink, stick-slip avalanches leaving strata",
    hints: ["1D pile, 64 sites; the Oslo rule: each site's critical slope is randomly 1 or 2, redrawn after every topple — this quenched randomness is what makes it critical (a plain 1D BTW pile is trivial)",
            "render topple ACTIVITY with an EMA afterglow, layered over dim local slope — never raw heights",
            "all integer arithmetic; feed grains at the top-left region so avalanches run down-slope"] },

  { id: "voter", nm: "합의의 월드라인", nmEn: "Consensus worldlines", en: "COALESCING WALLS", f: "waterfall", st: "unexplored", x: 36, y: 16, added: "2026-08-16",
    tex: "수십 의견의 경계 벽들이 랜덤워크하다 만나면 소멸한다 — 합쳐지기만 하는 실들의 직조, 돌연변이가 새 실을 뿌린다.",
    texEn: "Walls between dozens of opinions random-walking until they meet and annihilate — a weave of threads that only ever merge, mutation seeding new ones.",
    knob: "돌연변이율 = 0..0.02 — 순수 병합(합의로 수렴) ↔ 정상 상태 다양성 (흡수 상전이).",
    knobEn: "mutation rate = 0..0.02 — pure coalescence toward consensus ↔ steady-state diversity (an absorbing-state transition)",
    risk: "벽이 셀 수 있는 선으로 남을 위험 — 초기 밀도와 돌연변이 공급으로 직조 밀도를 지킬 것.",
    riskEn: "Walls risk reading as countable lines — keep the weave dense via initial diversity and mutation supply.",
    topic: "A 1D multi-opinion voter model as a history waterfall — domain walls as glowing worldlines that wander, collide and merge, mutation reseeding fresh threads",
    hints: ["init every cell to a distinct opinion (Uint8Array, up to 255 states) so the weave starts saturated",
            "render CHANGE: a wall glows where neighbors differ, with an EMA trail — the state values themselves stay invisible",
            "random sequential updates: a site copies a random neighbor; mutation assigns a fresh state"] },

  { id: "rule54", nm: "Rule 54 글라이더 기체", nmEn: "Rule 54 glider gas", en: "SOLITONIC LATTICE GAS", f: "waterfall", st: "unexplored", x: 57, y: 15, added: "2026-08-16b",
    tex: "이진 격자의 결정질 배경 위를 달리는 글라이더 입자들 — 산란하고, 위상이 밀리고, 소멸하는 이산 솔리톤의 땋임. (연구 수입)",
    texEn: "Glider particles running over a binary lattice's crystalline background — scattering, phase-shifting, annihilating: a braid of discrete solitons. (research import)",
    knob: "경계 주입률 — 성긴 탄도 기체 ↔ 조밀한 산란 땋임 ↔ 포화 (입자 수지가 급소).",
    knobEn: "boundary injection rate — sparse ballistic gas ↔ dense scattering braid ↔ saturation (the particle budget is the dial)",
    risk: "원시 상태는 주기-4 배경이 지배해 무늬로만 보인다 — 배경을 XOR로 벗겨내야 월드라인만 남는다.",
    riskEn: "The raw state is dominated by the period-4 background and reads as wallpaper — XOR the background away so only the worldlines remain.",
    topic: "Elementary cellular automaton Rule 54 as a history waterfall — a deterministic lattice gas of glider particles over a period-4 background, scattering and annihilating; render the state XOR the unperturbed background, with an EMA glow",
    hints: ["one 8-entry rule lookup per cell — the cheapest simulation on this map; run many rows per frame",
            "the essential render trick: XOR each cell against the deterministic period-4 background pattern, then glow worldlines with an EMA — raw states hide everything",
            "on 64 cells collisions eventually thin the gas: inject gliders at the boundaries (or rare seeded bit flips) to hold a steady population"] },

  { id: "mitosis", nm: "분열 펄스 계보", nmEn: "Splitting-pulse genealogy", en: "PULSE MITOSIS FALLS", f: "waterfall", st: "unexplored", x: 60, y: 25, added: "2026-08-16b",
    tex: "펄스가 제 심장을 굶겨 둘로 갈라진다 — Y자 분기들이 폭포를 채우는 가계도. 가지끼리 만나면 굶주린 쪽이 죽는다. (연구 수입)",
    texEn: "A pulse starves its own core and splits in two — Y-forks filling the fall like a family tree. Where branches meet, the hungrier one dies. (research import)",
    knob: "공급률 F — 붕괴 ↔ 자기복제 분열 ↔ 정지 튜링 배열 (실재하는 분열 문턱).",
    knobEn: "feed rate F — decay ↔ self-replicating splitting ↔ frozen Turing array (a genuine splitting threshold)",
    topic: "1D Gray-Scott in its pulse-splitting regime, drawn as a history waterfall — activator pulses that starve centrally and split into diverging children, a branching genealogy; canonical F ≈ 0.030, k ≈ 0.062, Du ≈ 1.0, Dv ≈ 0.5",
    hints: ["64-cell explicit stepping, ~50 substeps per frame at dt ≈ 0.2 — two Float32 arrays and a 3-point Laplacian",
            "render the activator's spatial gradient (or v^2), not raw concentration — the substrate background must stay invisible",
            "the frozen-Turing-array endgame is the boredom risk: breathe F slowly across the splitting threshold so lattices keep collapsing and reseeding"] },

  { id: "zrp", nm: "응축 강줄기", nmEn: "Condensation rivers", en: "ZERO-RANGE PROCESS", f: "waterfall", st: "unexplored", x: 26, y: 20, added: "2026-08-16b",
    tex: "확률 도약하는 질량이 스스로 응축한다 — 가는 지류들이 빛나는 본류로 모여들고, 본류는 부스러기를 흘리며 떠돈다. (연구 수입)",
    texEn: "Stochastically hopping mass condensing on its own — faint tributaries feeding glowing trunks that drift and shed grains. (research import)",
    knob: "도약 지수 b (u(n)=1+b/n) — b<2 균질 흐름 ↔ b>2 실공간 응축 (엄밀한 응축 상전이).",
    knobEn: "hop exponent b in u(n)=1+b/n — b<2 homogeneous flow ↔ b>2 real-space condensation (a rigorous condensation transition)",
    topic: "A zero-range process with chipping, drawn as a history waterfall — site masses hopping at rate u(n)=1+b/n, condensing into drifting trunk rivers fed by tributary showers; canonical b ≈ 5, density ≈ 3",
    hints: ["integer masses in one array; per step pick random sites, move one unit to a neighbor with probability ∝ 1 + b/n — all integer arithmetic",
            "occupancies span orders of magnitude: render log2(1 + n), or the trunks whiteout and the tributaries vanish",
            "total coarsening into one eternal trunk is the boredom end — cap site mass and burst-split any site that hits the cap, so rivers keep being born"] },

  { id: "lenia", nm: "Lenia", nmEn: "Lenia", en: "CONTINUOUS LIFE", f: "life", st: "retired", x: 60, y: 72,
    tex: "연속 커널 CA — 부드러운 생명 형태가 헤엄치는 장.",
    texEn: "The continuous-kernel cellular automaton — soft life forms swimming as a field.",
    knob: "커널 반경 / 성장함수 중심·폭 — 종(species)이 바뀌는 파라미터 공간.",
    knobEn: "kernel radius / growth-function center and width — the parameter space where species change",
    risk: "'생명체'가 개체로 보이는 순간 사망 — 군집/장 스케일 레짐으로만.",
    riskEn: "The moment a creature is countable it dies — colony/field-scale regimes only.",
    topic: "Lenia, the continuous cellular automaton — tuned to colony/field-scale regimes (tissues and blooms, never a single creature)",
    hints: ["the wide radial kernel is the whole cost problem, and a sliding-window box sum solves it: a running sum along each scanline (S += in - out) computes any radius in O(1) per pixel, independent of radius, and three cascaded box passes approximate a Gaussian. Approximate the ring kernel as the difference of two such blurs",
            "cheaper cousin worth trying first: multiscale Turing (McCabe) — 2-4 scales of activator/inhibitor built from those same box sums, each site stepping toward whichever scale has the least local variation",
            "if it reads as one countable creature the pattern is dead — stay at colony/field scale"] },

  { id: "nca", nm: "Neural CA", nmEn: "Neural CA", en: "LEARNED RULES", f: "life", st: "retired", x: 52, y: 76,
    tex: "학습된 국소 규칙이 씨앗에서 텍스처를 길러냄 — 규칙 vs 학습의 단층선 위. (연구 수입)",
    texEn: "A learned local rule growing texture from a seed — sitting on the rules-vs-learning fault line. (research import)",
    knob: "학습 후엔 급소가 약함 — 노이즈 주입/스텝률 정도. 급소 노브 요건과 긴장 관계.",
    knobEn: "inherently weak after training — noise injection / step rate; in tension with the critical-knob rule",
    risk: "오프라인 학습 필요 + ESP32 추론 예산 — 장기 후보.",
    riskEn: "Needs offline training plus an ESP32 inference budget — a long shot.",
    topic: "Neural CA texture growth — train the local update rule offline, bake the small weights into the pattern code",
    hints: ["long shot: training happens outside; inference must fit a tiny net within the per-frame budget"] },

  { id: "fluid", nm: "Stable Fluids 잉크", nmEn: "Stable Fluids ink", en: "REAL FLUID", f: "critical", st: "retired", x: 70, y: 86,
    tex: "속도장이 스스로 진화(이류·압력투영)하며 잉크를 실어나름 — 소용돌이의 실제 상호작용.",
    texEn: "A velocity field evolving itself (advection, pressure projection) while carrying ink — vortices that truly interact.",
    knob: "점성 / vorticity confinement — 끈적한 흐름 ↔ 격렬한 난류.",
    knobEn: "viscosity / vorticity confinement — sticky flow ↔ violent turbulence",
    risk: "밀도장 semi-Lagrangian 리샘플은 실기 예산 초과 (8월 필드 데이터) — 잉크는 입자로 실어나를 것.",
    riskEn: "Semi-Lagrangian density resampling blows the hardware budget (August field data) — carry the ink with particles instead.",
    topic: "Stable Fluids — a coarse self-evolving velocity field (semi-Lagrangian advection + pressure projection on the coarse grid only), its ink carried by advected particles depositing at full res",
    hints: ["a 32×64 velocity grid is enough; resample only the coarse velocity field, never a full-res density field",
            "a few Jacobi iterations of pressure projection suffice",
            "carry ink as particles depositing into a fade buffer — the GaleInk route"] },

  { id: "sandpile", nm: "Abelian 사태", nmEn: "Abelian avalanches", en: "SELF-ORGANIZED CRITICALITY", f: "critical", st: "verified", x: 79, y: 52,
    tex: "임계 격자의 사태 연쇄 파면 — 멱법칙: 잔반짝임 속 가끔 화면을 삼키는 대붕괴.",
    texEn: "Cascade fronts of a critical lattice — power law: small flickers, and occasionally a collapse that swallows the screen.",
    knob: "낙사율/소산 — 아임계 ↔ 자기조직 임계.",
    knobEn: "drop rate / dissipation — subcritical ↔ self-organized criticality",
    impl: "WaveCoupling(2026-08-12 핀) — 위상 연동 문턱 붕괴 변주, 실기 통과.",
    implEn: "WaveCoupling (pinned 2026-08-12) — a phase-locked-threshold cascade variant, passed hardware.",
    topic: "An Abelian sandpile — render the cascading avalanche FRONTS as brightness, never individual grains",
    hints: ["render avalanche wavefronts with fade; hide the raw lattice values",
            "power-law sizes: mostly small flickers, occasionally a screen-swallowing collapse"] },

  { id: "forestfire", nm: "산불 임계 순환", nmEn: "Forest-fire criticality", en: "DROSSEL-SCHWABL", f: "critical", st: "unexplored", x: 85, y: 60, added: "2026-08-16",
    tex: "자라는 숲, 벼락, 지도를 먹어치우는 화선 — 태우고 다시 자라며 스스로 임계로 돌아오는 모자이크.",
    texEn: "A regrowing forest, lightning, fronts that eat the map — a mosaic burning and regrowing its way back to criticality.",
    knob: "성장/벼락 비 p/f = 50..2000 — 잔불 반짝임 ↔ 척도 없는 화재 모자이크 ↔ 화면을 삼키는 대화재.",
    knobEn: "growth-to-lightning ratio p/f = 50..2000 — small sparks ↔ scale-free fire mosaics ↔ system-spanning burns",
    topic: "The Drossel-Schwabl forest-fire model — burning fronts sweeping a regrowing forest, fire scars flowing as dark rivers",
    hints: ["states empty/tree/burning in a Uint8Array; per sweep: fire ignites neighboring trees, burning becomes empty, empty regrows with probability p, lightning strikes trees with probability f — all integer",
            "render fire bright over dim forest, with an EMA afterglow buffer so scars fade like rivers of ash",
            "the timescale separation f << p is what self-organizes criticality; keep both under one ratio knob"] },

  { id: "dla", nm: "DLA 응집 확률장", nmEn: "DLA probability field", en: "AGGREGATION FIELD", f: "critical", st: "retired", x: 52, y: 33,
    tex: "확산 응집을 개체 없는 확률장으로 — 서리 가지가 자라는 장.",
    texEn: "Diffusive aggregation as an object-free probability field — frost branches growing as a field.",
    knob: "부착 확률 / DBM η — 성긴 가지 ↔ 조밀 덩어리 (연속 조절).",
    knobEn: "sticking probability / DBM eta — sparse branches ↔ dense clumps, continuously",
    risk: "입자가 보이면 실패 (Hoarfrost의 교훈) — 장 형태로만.",
    riskEn: "Fails the moment particles show (the Hoarfrost lesson) — field form only.",
    topic: "DLA / dielectric-breakdown growth as an object-free aggregation probability field",
    hints: ["field rendering only — visible walker particles killed this once before"] },

  // ── Invented experiments — AI-authored hypotheses (real mechanisms, unverified) ──

  { id: "cascade", nm: "Cascade — 셸 난류", nmEn: "Cascade — shell turbulence", en: "SHELL-MODEL TURBULENCE", f: "invent", st: "retired", x: 79, y: 35,
    tex: "세로축이 공간이 아니라 '스케일'이다: 맨 위가 큰 소용돌이, 아래로 갈수록 잔결 — 난류 에너지가 옥타브 사다리를 타고 쏟아지는 폭포. 간헐적 버스트가 위에서 아래로 번개처럼 전파된다.",
    texEn: "The vertical axis is SCALE, not space: big eddies on top, fine grain below — turbulent energy pouring down an octave ladder, intermittent bursts propagating downward like lightning.",
    knob: "레이놀즈(강제/점성비) — 층류 트리클 ↔ 간헐 캐스케이드 폭발.",
    knobEn: "Reynolds number (forcing amplitude / viscosity) — laminar trickle ↔ intermittent avalanche cascade",
    vert: "스케일 사다리 자체가 세로 구도 — 행마다 특징 주파수가 2배씩 늘어 자기유사 직조가 된다.",
    vertEn: "The scale ladder IS the composition — feature frequency doubles per band, a self-similar weave.",
    risk: "셸 모델을 시각화한 전례가 거의 없음 — 행 간 위상 연결을 잘 못 지으면 줄무늬 나열로 보일 수 있다.",
    riskEn: "Almost no precedent for visualizing shell models — weak phase linking between bands could read as stacked stripes.",
    topic: "A turbulence energy cascade made visible — a shell model of turbulence (Sabra/GOY, ~24 complex ODEs, one per wavenumber octave) where the vertical axis IS scale: top rows render the large-scale shells, bottom rows the fine scales, each row textured at its shell's wavenumber; intermittent bursts cascade downward",
    hints: ["integrate a Sabra shell model with k_n = 2^n, ~20-24 shells, forcing on the first 2-3 shells, viscosity term -nu*k_n^2*u_n; complex u_n, dt small and clamped",
            "render row band for shell n as v(x) = |u_n| * (0.5 + 0.5*sin(k_n * x / width + arg(u_n))) — the phase makes each octave a moving texture",
            "normalize each shell by an EMA of its own |u_n| so deep shells stay visible; guard with isFinite + amplitude ceiling"] },

  { id: "kneaded", nm: "Kneaded — 휘저어진 반응장", nmEn: "Kneaded — stirred reaction field", en: "STRANGE EIGENMODE", f: "invent", st: "retired", x: 68, y: 73,
    tex: "반응-확산 무늬가 혼돈 흐름에 반죽된다 — 나선이 실처럼 늘여지고 접히고, 반응이 다시 뭉친다. 두 검증 대륙(PDE × 필드 이류)의 교배.",
    texEn: "Reaction-diffusion kneaded by a chaotic flow — spirals stretched into threads, folded, and re-formed by the reaction. A crossbreed of two verified continents (PDE × advection).",
    knob: "담쾰러 수(반응속도/젓기속도) — 나선 생존 ↔ 스트리에이션(실무늬) ↔ 완전 혼합 소멸.",
    knobEn: "Damkoehler number (reaction rate vs stirring rate) — spirals survive ↔ sheared striations ↔ mixed to death",
    topic: "A reaction field kneaded by a chaotic flow — Gray-Scott (or FitzHugh-Nagumo) reaction-diffusion whose concentration fields are advected each step by a smooth time-morphing vector field; the competition between stirring and reacting produces persistent striated 'strange eigenmode' textures",
    hints: ["alternate: one semi-Lagrangian advection step of both concentrations, then one reaction-diffusion step",
            "keep the flow divergence-free (curl of a slow noise potential) so nothing drains or piles up",
            "Gray-Scott around f=0.03..0.06, k~0.06 as the reactive backbone; advection speed is the other half of the critical ratio"] },

  { id: "curtain", nm: "Phase Curtain — 상전이 커튼", nmEn: "Phase Curtain — graded criticality", en: "GRADED CRITICALITY", f: "invent", st: "retired", x: 50, y: 80,
    tex: "제어 파라미터를 세로로 기울여 화면 자체가 상도표의 단면이 된다: 위는 얼고 아래는 끓는데, 그 사이 임계 띠가 프랙탈로 반짝인다. 노브가 그 임계선을 위아래로 민다.",
    texEn: "Tilt the control parameter along the height and the screen becomes a slice of the phase diagram: frozen above, boiling below, the critical band scintillating between. The knob slides that horizon.",
    knob: "임계 띠의 위치(파라미터 전역 오프셋) — 상전이 자체가 풍경으로 걸려 있고, 노브가 지평선을 옮긴다.",
    knobEn: "global offset of the graded control parameter — where in the frame the phase boundary sits",
    vert: "세로축 = 제어 파라미터 축. 1:2 프레임의 가장 정직한 사용법.",
    vertEn: "Vertical axis = control-parameter axis. The most honest use of the 1:2 frame.",
    topic: "A phase transition hung on screen as a curtain — an Ising lattice (or CGL) whose control parameter is GRADED along the vertical axis: ordered and frozen at the top, boiling disorder at the bottom, the critical band scintillating between them; the knob shifts the gradient so the phase boundary sweeps up and down the frame",
    hints: ["Ising version: per-row temperature T(y) = Tc * (0.6 + offset + 0.8 * y/height), checkerboard Metropolis sweeps, render local magnetization averaged over a small neighborhood (raw spins are noise)",
            "keep the gradient gentle so the critical band spans 20-30 rows of fractal flicker",
            "morph by slowly tilting/curving the iso-parameter lines so the curtain waves"] },

  { id: "creep", nm: "Creep — 디피닝 전선", nmEn: "Creep — depinning front", en: "DEPINNING AVALANCHES", f: "invent", st: "invented", x: 70, y: 36,
    tex: "고정핀 무질서 속을 끌려가는 탄성 전선의 역사 — 멈춤(어둠) 위로 사태처럼 번지는 미끄러짐(빛)의 대륙들. 문턱에서는 크래클링, 그 위에서는 거친 활주.",
    texEn: "The history of an elastic front dragged through pinning disorder — continents of slip (light) flaring over stillness (dark). Crackling at threshold, rough sliding above it.",
    knob: "구동력 F — 핀 고정(정적) ↔ 임계 크래클링 ↔ 연속 활주의 디피닝 전이.",
    knobEn: "driving force F across the depinning threshold — pinned stillness ↔ critical crackling ↔ continuous rough sliding",
    topic: "A vertical history waterfall of an elastic front creeping through quenched pinning disorder — each row records the 1D front's LOCAL VELOCITY (bright = slipping avalanche, dark = pinned); below threshold the field crackles in power-law patches, above it slides as a rough front",
    hints: ["simple automaton: front height h(x) + frozen random pin-strength map; a site advances when F + elastic pull (discrete laplacian of h) exceeds its local pin strength; each advance destabilizes neighbors -> avalanches",
            "render per-row the recent-advance activity (EMA of advances), not h itself",
            "sample pin strengths from a seeded RNG grid that scrolls with the front so disorder never repeats"] },

  { id: "rogue", nm: "Rogue — 변조 불안정 폭포", nmEn: "Rogue — modulational instability", en: "NLS BREATHERS", f: "invent", st: "invented", x: 54, y: 21,
    tex: "고요한 반송파가 스스로 불안정해져 숨쉬는 파속(breather)들로 갈라지고, 아주 가끔 화면을 찢는 섬광(로그 웨이브)이 터진다 — 어둠 기반, 드문 대사건의 통계.",
    texEn: "A calm carrier destabilizing into a gas of breathing wave packets — and, rarely, a rogue flash that tears the screen. Dark-founded; the statistics of rare great events.",
    knob: "비선형/분산 비 — 안정 반송파 ↔ breather 가스 ↔ 로그 섬광 통계.",
    knobEn: "nonlinearity-to-dispersion ratio across the modulational-instability threshold — stable carrier ↔ breather gas ↔ rogue-flash statistics",
    risk: "복소장 스펙트럴 — 발산 가드는 노름 보존으로. 섬광 빈도 튜닝이 관건 (너무 잦으면 번쩍임 공해).",
    riskEn: "Complex spectral field — guard with norm conservation. Tuning flash frequency is the craft (too frequent = strobe pollution).",
    topic: "A vertical history waterfall of the 1D nonlinear Schroedinger equation in its modulational-instability regime — a calm carrier wave breaking into a gas of breathers, with rare rogue-wave flashes; rendered as |psi|^2",
    hints: ["split-step spectral: half linear step in k-space (dispersion), full nonlinear phase rotation exp(i*g*|psi|^2*dt) in real space, half linear again",
            "divergence guard = norm conservation (total |psi|^2 must stay constant; renormalize or reseed on drift)",
            "soft-knee tone so rogue peaks read as flashes without crushing the breather texture underneath"] },

  { id: "tongues", nm: "Locked Tongues — 악마의 계단", nmEn: "Locked Tongues — devil's staircase", en: "ARNOLD TONGUES", f: "invent", st: "retired", x: 33, y: 63,
    tex: "결합된 원사상 격자의 모드록 영토들 — 회전수가 유리수에 잠긴 평평한 판(플래토)들이 모자이크를 이루고, 판의 경계에서 위상 미끄러짐이 필라멘트로 새어나온다. 톤 플래토가 물리 그 자체.",
    texEn: "Mode-locked territories of a coupled circle-map lattice — flat plateaus locked to rational winding numbers, phase slips leaking through the seams as filaments. Tonal plateaus as physics itself.",
    knob: "킥 강도 K — 준주기 바다 ↔ 혀(tongue)들의 확장 ↔ 겹침 혼돈.",
    knobEn: "kick strength K — quasiperiodic sea ↔ widening Arnold tongues ↔ overlapping chaos; the devil's staircase becomes visible territory",
    topic: "A mosaic of mode-locking — a lattice of coupled circle maps (theta -> theta + Omega - (K/2pi)*sin(2pi*theta) + weak neighbor coupling) where Omega is graded smoothly across space; mode-locked domains form flat tonal plateaus separated by phase-slip filament seams",
    hints: ["render the local winding rate (EMA of theta increments), softly quantized — locked domains become literal tonal plateaus, slips become bright seams",
            "grade Omega along y so the tongues stack vertically; morph the gradient slowly",
            "K around 0.8..1.2 is where the staircase is richest; keep neighbor coupling weak (0.05..0.2)"] },

  { id: "vortexglass", nm: "Vortex Glass — 위상 유리", nmEn: "Vortex Glass — phase glass", en: "KURAMOTO LATTICE", f: "invent", st: "invented", x: 58, y: 53,
    tex: "제각기 다른 고유진동수의 진동자 격자가 동기화를 두고 다툰다 — 위상 소용돌이(결함)들이 생멸하는 유리질 직조. 위상 기울기만 렌더하면 결함 필라멘트가 어둠 위로 떠오른다.",
    texEn: "A lattice of oscillators with quenched random frequencies fighting over synchrony — a glassy weave where phase vortices are born and annihilate. Render only the phase gradient and the defect filaments float over darkness.",
    knob: "결합 강도 K — 비동기 유리 ↔ 결함의 희박한 춤 ↔ 전면 동기(죽은 균질). 임계 바로 아래가 가장 살아있다.",
    knobEn: "coupling strength K across the synchronization transition — desynchronized glass ↔ sparse defect dance ↔ dead uniform sync (live just below critical)",
    topic: "A 2D lattice of Kuramoto phase oscillators with quenched random natural frequencies, rendered as the magnitude of the phase gradient — vortex defects wander, pair-create and annihilate in a glassy weave",
    hints: ["theta_i += dt * (omega_i + K * sum over 4 neighbors of sin(theta_j - theta_i)); omega_i from a seeded gaussian, frozen",
            "render |grad theta| (each difference wrapped to [-pi, pi]) smoothed by an EMA — defect cores glow, synced domains go dark",
            "grade the omega spread along y so the defect population drifts vertically"] },

  { id: "ftle", nm: "FTLE — 흐름의 뼈대", nmEn: "FTLE — the flow's skeleton", en: "LAGRANGIAN SKELETON", f: "invent", st: "retired", x: 51, y: 57,
    tex: "바람(벡터장)의 보이지 않는 골격 — 이웃한 추적자들이 얼마나 찢어지는지(늘임률)를 렌더하면 흐름이 갈라지는 능선이 유령 필라멘트로 떠오른다. Gale Ink의 X-레이. (연구 수입 + 변형)",
    texEn: "The invisible skeleton of the wind — render how violently neighboring tracers tear apart, and the ridges where the flow splits surface as ghost filaments. An X-ray of gale ink. (research import + twist)",
    knob: "적분 지평 T — 부드러운 그라디언트 ↔ 날카로운 프랙탈 능선. curl 비율은 골격 자체를 재편한다.",
    knobEn: "integration horizon T — soft gradients ↔ sharp fractal ridges; the flow's curl ratio independently restructures the whole skeleton",
    topic: "The hidden skeleton of a morphing flow — finite-time Lyapunov exponents: for each grid point, integrate a tiny cross of tracers through the vector field for a short horizon and render the log of their separation growth; ridges of stretching appear as ghost filaments that reorganize as the flow morphs",
    hints: ["per-pixel-per-frame is too dear for ESP32 — compute FTLE on a half-resolution grid with few substeps, update a fraction of rows each frame, interpolate in draw",
            "reuse the same morphing curl-noise field as a gale-ink flow; FTLE is its X-ray",
            "log-scale the exponent, EMA it, then stretch to 0..1 with a running min/max"] },

  { id: "crease", nm: "Creasefall — 충격파 계보", nmEn: "Creasefall — shock genealogy", en: "BURGERS SHOCKS", f: "invent", st: "invented", x: 42, y: 34,
    tex: "매끈한 파형이 스스로 가팔라져 주름(충격파)이 되고, 주름들이 서로를 삼키며 굵어지는 계보가 흘러내린다 — KS의 사촌이지만 셀 대신 '접힘'의 역사.",
    texEn: "Smooth waves steepening into creases that swallow one another and thicken — KS's cousin, but a history of folds instead of cells.",
    knob: "점성 ν — 유리처럼 매끈한 물결 ↔ 면도날 주름들의 병합 캐스케이드.",
    knobEn: "viscosity nu — glassy smooth waves ↔ razor-crease merging cascade",
    topic: "A vertical history waterfall of the 1D Burgers equation — smooth waves steepen into shock creases that collide and merge, an inverse cascade of folds flowing down the frame; render a blend of u and its gradient so creases read as bright seams",
    hints: ["upwind or semi-implicit finite differences are enough (Burgers is tame); gentle random low-wavenumber forcing keeps it alive",
            "render u as the soft body plus |du/dx| (normalized) as bright crease seams",
            "shock mergers are the narrative — keep forcing gentle so mergers stay readable"] },

  { id: "chladni", nm: "Chladni 고유모드 모핑", nmEn: "Chladni eigenmode morphing", en: "STANDING WAVE MODES", f: "pde", st: "retired", x: 22, y: 48,
    tex: "판 진동의 고유모드들 사이를 연속 보간 — 마디선 그물이 접히고 재배열된다. 재현이 아니라 추상 정상파의 기하.",
    texEn: "Continuous interpolation between plate-vibration eigenmodes — the web of nodal lines folds and rearranges. Not a depiction: the geometry of abstract standing waves.",
    knob: "모드 지수쌍 (m,n)의 사다리 위치 — 단계마다 마디선 위상이 재배열되는 전이.",
    knobEn: "position along the (m,n) eigenmode ladder — the nodal topology rearranges at every step",
    risk: "정지 상태로 두면 죽은 그림 — 연속 보간과 느린 회전 모핑이 필수.",
    riskEn: "Static modes are a dead picture — continuous interpolation and slow rotation are mandatory.",
    topic: "Morphing Chladni figures — continuously interpolating between plate-vibration eigenmodes (sums of standing waves), rendering the near-nodal regions as bright filament webs",
    hints: ["rectangular-plate eigenmodes are cheap: combinations of cos(m*pi*x)*cos(n*pi*y); blend two or three adjacent (m,n) pairs and morph the blend weights on incommensurate periods",
            "render v from 1 - |field|, sharpened around the zero crossings, so the nodal lines glow",
            "grade the mode index along y for a vertical ladder of complexity"] },

  { id: "invasion", nm: "침투 퍼콜레이션", nmEn: "Invasion percolation", en: "WEAKEST-PATH INVASION", f: "critical", st: "verified", x: 55, y: 47,
    tex: "동결 무질서 격자에서 항상 가장 약한 이웃만 뚫고 번지는 침투 — 확산 없는 프랙탈 손가락, 임계가 내장된 성장. (연구 수입)",
    texEn: "An invasion that always breaks the weakest neighboring site of a frozen disorder field — fractal fingers without diffusion; growth with criticality built in. (research import)",
    knob: "무질서 상관길이 / 트래핑 규칙 — 가는 프랙탈 손가락 ↔ 뭉툭한 압축 전선.",
    knobEn: "disorder correlation length / trapping rule — thin fractal fingers ↔ blunt compact fronts",
    impl: "FantasiaGarden(2026-08-11 핀) — 저항 뱅크 스크롤 + 침투 나이 렌더, 실기 통과.",
    implEn: "FantasiaGarden (pinned 2026-08-11) — scrolling resistance bank + invasion-age render, passed hardware.",
    topic: "Invasion percolation — a front that always advances through the weakest site of a quenched random resistance field, rendered as an object-free invasion-age field",
    hints: ["keep a frontier set; each step invade the minimum-resistance frontier site (a small heap, or a periodic min-scan, is fine at this scale)",
            "render invasion AGE as tone — the freshly invaded glows, old territory fades; never individual sites",
            "smooth the resistance field spatially for the correlation-length knob"] },

  { id: "billiard", nm: "Billiard — 속삭임 회랑의 붕괴", nmEn: "Billiard — whispering gallery collapse", en: "CHAOTIC RAY INK", f: "invent", st: "invented", x: 40, y: 23,
    tex: "천천히 변형되는 공동(원↔스타디움) 속에서 광선 수천 개가 반사하며 잉크를 쌓는다 — 가지런한 회랑 커스틱이 혼돈 얼룩으로 무너지는 과정 그 자체.",
    texEn: "Thousands of rays reflecting inside a slowly deforming cavity (circle ↔ stadium), accumulating ink — orderly whispering-gallery caustics collapsing into chaotic smear.",
    knob: "경계 변형량 — 원(가적분: 고리 커스틱) ↔ 스타디움(혼돈: 에르고딕 얼룩). 실재하는 적분가능성 전이.",
    knobEn: "boundary deformation — circle (integrable: ring caustics) ↔ stadium (chaotic: ergodic smear); a genuine integrability transition",
    topic: "Chaotic billiard ray ink — thousands of specular rays bouncing inside a slowly morphing closed cavity, accumulating into a fading ink buffer; deform the boundary from circle toward stadium to cross the integrable-to-chaotic transition",
    hints: ["parameterize the boundary as a smooth radius function r(theta) and reflect rays off the local normal",
            "in the circle, rays conserve angular momentum and weave ring caustics; deformation destroys the invariant and the ink goes ergodic",
            "a few thousand short ray segments per frame; fade buffer + smoothstep as usual"] },

  { id: "chimera", nm: "Chimera — 반쪽 동기화", nmEn: "Chimera — half-synchronized", en: "COEXISTING ORDER AND CHAOS", f: "invent", st: "invented", x: 46, y: 57,
    tex: "완전히 동일한 진동자들이 스스로 질서 진영과 혼돈 진영으로 갈라진다 — 매끈한 위상 비단과 끓는 비동기 띠가 한 화면에 공존하고, 그 경계가 배회한다.",
    texEn: "Perfectly identical oscillators spontaneously splitting into an ordered camp and a chaotic camp — smooth phase silk and boiling incoherence coexisting on one screen, their border wandering.",
    knob: "결합 반경 / 위상 지연 α — 전면 동기 ↔ 키메라 공존 ↔ 전면 비동기.",
    knobEn: "coupling range / phase lag alpha — full sync ↔ chimera coexistence ↔ full incoherence",
    topic: "A chimera state — a ring or lattice of identical phase oscillators with nonlocal coupling and a phase lag, spontaneously splitting into coexisting coherent and incoherent regions; render local coherence so the two camps and their wandering border are the picture",
    hints: ["nonlocal coupling: each oscillator couples to neighbors within radius R via sin(theta_j - theta_i - alpha); alpha slightly below pi/2 is chimera country",
            "render the local order parameter (|mean of e^(i*theta)| over a small window) — silk vs boil",
            "a 1D ring rendered as a history waterfall also works beautifully"] },

  { id: "fpu", nm: "FPU — 유령 회귀", nmEn: "FPU — ghost recurrence", en: "FERMI-PASTA-ULAM", f: "invent", st: "retired", x: 33, y: 28,
    tex: "비선형 사슬에 부은 에너지가 모드들로 흩어졌다가, 오랜 방황 끝에 유령처럼 처음 형태로 되돌아온다 — 흩어짐과 회귀의 긴 호흡이 폭포로 흐른다.",
    texEn: "Energy poured into a nonlinear chain scatters across its modes — then, after a long wander, returns like a ghost to its original shape. The long breath of dispersal and recurrence, flowing as a waterfall.",
    risk: "외부 서베이 판정(8/16): 변위 폭포는 매끈한 전역 정상파 — 국소 구조가 없어 지루함. 모드 에너지 밴드 렌더로만 승산이 있다.",
    riskEn: "External survey verdict (8/16): the displacement waterfall is smooth global standing waves — no localized structures, monotonous. Only the mode-energy-band render has a chance.",
    knob: "비선형 강도 β — 완전 회귀 ↔ 준회귀 ↔ 열화(에르고딕)의 문턱.",
    knobEn: "nonlinearity beta — clean recurrence ↔ partial recurrence ↔ the thermalization threshold",
    topic: "Fermi-Pasta-Ulam-Tsingou recurrence as a vertical history waterfall — a nonlinear oscillator chain seeded in its lowest mode, energy spreading through the spectrum and ghost-returning; render the displacement field, or the per-mode energies as vertical bands",
    hints: ["a chain of 32-64 masses with quadratic/cubic coupling (alpha/beta FPU); leapfrog integration, total energy as the divergence guard",
            "seed the lowest mode and let the recurrence be the narrative — its period is the slow heartbeat",
            "two renders both work: the displacement waterfall, or mode-energy bands (a small scale-ladder like a mini cascade)"] },

  { id: "resonance", nm: "Resonance — 노이즈가 그리는 신호", nmEn: "Resonance — noise draws the signal", en: "STOCHASTIC RESONANCE", f: "invent", st: "retired", x: 44, y: 70,
    tex: "문턱 아래 숨은 희미한 형상이, 노이즈를 알맞게 부으면 떠오르고 지나치면 다시 익사한다 — 노이즈가 최적일 때만 그림이 존재하는 역설의 장.",
    texEn: "A faint shape hidden below threshold surfaces when just enough noise is poured on, and drowns again in excess — a field where the picture exists only at the optimal noise. The paradox is the material.",
    knob: "노이즈 진폭 — 침묵 ↔ 공명(형상 출현) ↔ 익사. 비단조 급소 노브.",
    knobEn: "noise amplitude — silence ↔ resonance (the shape surfaces) ↔ drowned; a non-monotonic critical knob",
    topic: "Stochastic resonance as a field — a lattice of bistable wells driven by a weak subthreshold spatial signal plus tunable noise; at the optimal noise the hidden shape surfaces in the flip statistics, below and above it dissolves",
    hints: ["per cell an overdamped double well: dx/dt = x - x^3 + weak slow spatial signal + noise; render an EMA of the state",
            "let the hidden signal itself morph slowly (large smooth abstract blobs) so the surfacing picture is alive",
            "bonus curtain: sweep the noise amplitude along y so a resonant band glows mid-frame"] },

  { id: "choke", nm: "Choke — 배타 수송 충격파", nmEn: "Choke — exclusion shockwaves", en: "ASEP BOUNDARY PHASES", f: "invent", st: "verified", x: 78, y: 24,
    tex: "한 방향으로만 흐르는 배타 입자들의 밀도장 — 정체 충격파가 흐름을 거슬러 기어오르고 희박파가 부채꼴로 펴진다. 입자는 안 보이고 밀도의 지층만 흐른다.",
    texEn: "The density field of one-way excluding particles — jam shockwaves crawling upstream, rarefaction fans spreading. No particles visible, only strata of density flowing.",
    knob: "주입/배출률 — 저밀도 / 고밀도 / 최대류 상을 가르는 실제 경계 상전이 (1차 전이 포함).",
    knobEn: "injection/extraction rates — the boundary-driven phase diagram (low-density / high-density / maximal-current, with a genuine first-order line)",
    impl: "DefectCascade(2026-08-14 핀) — 발명 대륙 첫 검증. 1D 동역학 + 이력 스크롤 = 실기 최저비용 골격의 증명.",
    implEn: "DefectCascade (pinned 2026-08-14) — the invented continent's first verification. 1D dynamics + history scroll, proof of the cheapest hardware architecture.",
    topic: "A boundary-driven exclusion process (ASEP) rendered as a coarse-grained density field flowing down the frame — jam shocks climbing against the flow, rarefaction fans, and boundary-rate phase transitions",
    hints: ["simulate a 1D ASEP with random sequential updates per row-time and render coarse-grained density as a history waterfall — never individual particles",
            "alpha (inject) and beta (extract) span the phase diagram: alpha<beta<0.5 low density, beta<alpha<0.5 high density with a wandering shock, both >0.5 maximal current",
            "smooth the density over a few sites plus an EMA so the strata read as material"] },
];

/* ── Generation prompt (mirrors Pattern Lab's COPY PROMPT assembly) ─────── */

const BASE = `I am writing custom LED patterns in JavaScript for a Patternflow 64x128 LED matrix web preview.

Frame — the pattern is drawn into a 64 × 128 pixel grid: 64 wide (x = 0..63) and 128 tall (y = 0..127). It is TALLER than it is wide (1:2.00). Compose for a tall frame — a design meant for a wide frame will read as cramped and over-zoomed here. Lay the composition, bands, and motion out for these proportions.

Subject — explore ONE system deeply: __TOPIC__

Create exactly 3 distinct standalone patterns exploring this subject. They must differ genuinely — a different regime, a different accumulation or rendering of the same system — not the same pattern with different constants.

Very important output rules:
- Return exactly 3 separate JavaScript code blocks.
- Each code block must be a complete standalone Patternflow pattern.
- Do not combine the 3 patterns into one file.
- Do not add a mode selector, preset array, switch statement, or any code that contains multiple patterns in one output.
- Do not write wrapper text inside the code blocks.
- Put a short pattern name before each code block.
- Do not include nested triple backticks inside any code block.

Required API for every pattern:
- export function setup(params) {}
- export function update(dt, input, params) {}
- export function draw(display, params, time) {}
- Use input.knobValues as the primary control API. input.knobValues is an array of 4 absolute knob values after the min/max ranges are applied.
- Declare the ranges your 4 knobs want with ONE comment line near the top of the file, exactly this format:
  // @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1
  (exactly 4 comma-separated entries, Name=min..max, short names). Pattern Lab parses this line, renames the on-screen knobs, and sets their min/max automatically — the user can then retune any range and your pattern follows, because you read the values back through input.knobValues.
- Read input.knobValues[i] directly as the parameter value (matching your @knobs ranges). Do NOT read input.knobNormalized and remap it with baked constants such as 3 + kn[0] * 9 — that disconnects Pattern Lab's range editor (the user's min/max edits stop doing anything). input.knobNormalized is acceptable only for a truly unitless 0..1 blend where any range would mean the same thing.
- Keep input.knobDeltas only as compatibility fallback if needed.
- Optional: each knob also has a push button. input.btnPressed[i] is true only on the frame it is pressed (edge); input.btnHeld[i] is true while it is held down. Use these for momentary actions like reset, freeze, cycle, or trigger. Do not use long-press or mode-switching; that is a reserved system gesture.
- IMPORTANT: input is passed ONLY to update(dt, input, params). draw's signature is draw(display, params, time) with NO input argument — params.input does not exist. To read knob or button values inside draw, use params.knobValues / params.knobNormalized / params.knobDeltas / params.btnPressed / params.btnHeld (the harness mirrors the latest input onto params every frame), or stash whatever you need on params during update. Never read input.* or params.input.* inside draw.
- Use display.width and display.height in loops. Never hardcode the frame's pixel dimensions inside draw() — the same pattern is run at other resolutions, and a hardcoded size crops or zooms it.
- Declare the frame you composed for with ONE comment line near the top of the file, exactly this format:
  // @matrix 64x128
  Use exactly the dimensions given above. Pattern Lab reads this line to set the preview resolution, and the firmware uses it to map the pattern onto the physical panel.
- Write each pixel with display.setValue(x, y, v) — EXACTLY three arguments, where v is a single number from 0.0 to 1.0. Do NOT call display.setPixel anywhere.
- Use only plain JavaScript and Math.*. No browser APIs, DOM APIs, imports, async code, external libraries, dynamic evaluation, or per-pixel allocations.

Creative control mapping:
- It is okay to keep one knob as animation speed, preferably Knob 2, if that suits the pattern.
- Do not keep all four knobs as the same old hue/speed/mode/frequency template unless it is genuinely the best fit.
- Redesign the controls creatively for each pattern. Examples: cell size, symmetry fold, glitch amount, palette split, trail length, scanline spacing, pulse width, inversion threshold, rotation, warp depth, density, edge thickness, phase offset, bloom-like gain, or motif selection.
- Each pattern should have a slightly different control personality. The controls should reveal the unique idea of that pattern.
- Include a short comment near setup() or update() naming what the 4 knobs do for that specific pattern.

Value-field direction (IMPORTANT — there is NO color in this pattern):
- The pattern outputs only a scalar value field via display.setValue(x, y, v). Color is applied OUTSIDE the pattern by a user-controlled color ramp that maps v = 0..1 to colors.
- Do NOT compute any colors, palettes, hues, RGB values, or hsvToRgb helpers anywhere. No color logic at all — pour all effort into geometry, structure, and motion.
- Treat v as the pattern's tonal value and design the field so it reads well under ANY ramp:
  - Use the full 0..1 range every frame: some pixels near 0, some near 1.
  - Build deliberate tonal structure tied to the geometry: edges, bands, plateaus, gradients driven by distance, phase, cell id, density, or masks.
  - Value contrast is your only material — sharp boundaries, layered levels, and clear figure/ground separation matter more than in RGB mode.
  - Avoid uniform mid-grey mush (everything hovering near 0.5) and avoid pure binary output unless the idea is intentionally hard-edged.
- Knobs must control geometry/motion/structure, never color (no hue knobs — color belongs to the ramp).

Rendering craft — most attempts die here, read carefully:
- update() is called as update(dt, input, params) — there is NO time argument in update. Referencing one gives undefined, and one undefined variable turns the whole field into NaN = a permanently black screen. Build your own clock instead: params.t = 0 in setup, params.t += dt at the top of update, and use params.t wherever the simulation needs absolute time. (draw does receive time, but keep all simulation clocking in update.)
- NaN passes straight through Math.min/Math.max clamps, and NaN > x is always false — so a naive divergence check never fires on a NaN-poisoned field. Make every divergence guard isFinite-based: if any sampled value fails isFinite(v), reseed immediately.
- The first frame must already be alive. Run enough warmup iterations / prefill inside setup() that the developed texture is visible immediately. Never start from an empty field that slowly fills in.
- Never write raw physical magnitudes to v. Track a running amplitude estimate (e.g., an EMA of the per-frame max) and normalize through it, then shape the tone with smoothstep (t*t*(3-2*t)). Unnormalized output is how screens end up all-black (values far below 1) or all-white (clipped).
- Accumulation buffers need decay: buf *= fade every frame, then add ink. Without decay the buffer saturates to solid white within seconds.
- Cover the whole frame: width is 64 (x = 0..63), height is 128 (y = 0..127). If content appears only as a thin band while the rest stays empty, you have a transposed buffer or a wrong loop bound — this is the single most common failure.
- Simulate in the display's own orientation. Internal buffers are 64 wide × 128 tall (index = y * 64 + x), matching // @matrix 64x128. Do NOT build a 128×64 landscape simulation and rotate or remap it inside draw() — no axis swaps, no dispX = y tricks. If you catch yourself writing const w = 128, h = 64, stop: swap them. (Most LED-matrix code online is landscape; this device stands tall.)
- Choose @knobs ranges so the pattern is at its best near the MIDDLE of every range, with nobody touching anything. Knob extremes may be calm or violent; the default position is the show.
- Simulations must sit in their interesting regime at those defaults — use the canonical parameter values from the hints below when given; do not invent your own.
- This code is also compiled for a 240 MHz microcontroller, where sin/cos/exp/pow/atan2 each cost hundreds of cycles. Budget transcendentals: keep them OUT of the per-pixel loop — per-agent, per-row, per-timestep math is fine, expensive fields can be computed on a coarse control grid (a few hundred nodes) and interpolated up, and integer/add/multiply lattice rules are free. At most one full-resolution pass per frame, carrying no more than a couple of trig calls per pixel. Never resample the previous frame per pixel (no warp/zoom/bilinear feedback), never do O(n²) all-pairs interactions, and use Float32Array only — never Float64Array (doubles are software-emulated).

Taste direction (settled by experiment on this device — treat as hard constraints, on top of everything above):
- No countable objects. Thousands of accumulated operations must read as one continuous "material". The moment dots/creatures/cars can be counted, the pattern is dead.
- No depiction of real things — only abstract mathematics moving on its own.
- Refining "creative control mapping" above: Knob 1 must grip a real coefficient of the underlying equation (the critical knob) — turning it must cross a phase transition or bifurcation, not just restyle. Knob 3 = density/scale, knob 4 = fade/persistence (wire ↔ smoke) have worked well.
- Morphing: let secondary coefficients breathe slowly on incommensurate periods so that five minutes in it is not the same picture. The autonomous morphing must NOT ride the critical coefficient itself — pumping it injects energy and can blow the system up; morph through harmless axes (time compression, render transforms).
- The long vertical axis is the protagonist: falling, rising, columns, history scrolling downward.
- Reliability: clamp dt (~0.1 max), detect divergence and auto-reseed, use a seeded RNG instead of Math.random, allocate every buffer in setup, attach helper functions to params as closures (survives layer flattening), and stay inside the microcontroller budget stated under Rendering craft.
- Each pattern must declare in its first comment: "critical knob = ___, turning it crosses ___ ↔ ___".
- Discard any idea that fails these rules — output only survivors. If you cannot execute and test the code, mark the pattern "UNVERIFIED".`;

export function buildPrompt(entry: AtlasEntry): string {
  let prompt = BASE.replace("__TOPIC__", entry.topic ?? entry.nmEn);
  const extra: string[] = [];
  if (entry.knobEn) extra.push(`Critical-knob candidate: ${entry.knobEn}`);
  if (entry.hints) extra.push(...entry.hints);
  if (extra.length > 0) {
    prompt += `\n\nSubject-specific hints:\n${extra.map((h) => `- ${h}`).join("\n")}`;
  }
  return prompt;
}

/** Fast lookup for validation and panels. */
export const ENTRY_BY_ID: ReadonlyMap<string, AtlasEntry> = new Map(
  ENTRIES.map((entry) => [entry.id, entry]),
);

/**
 * The latest batch tag on the map — what the "new" filter shows.
 *
 * Derived rather than declared: tag an import with today's date and it becomes
 * the new arrivals while the previous batch ages out on its own. Nothing to
 * remember to switch off.
 */
export const NEWEST_BATCH: string | null = ENTRIES.reduce<string | null>(
  (newest, entry) =>
    entry.added && (newest === null || entry.added > newest) ? entry.added : newest,
  null,
);

export function isNewEntry(entry: AtlasEntry): boolean {
  return NEWEST_BATCH !== null && entry.added === NEWEST_BATCH;
}
