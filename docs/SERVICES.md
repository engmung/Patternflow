# Patternflow Server Services & Worker Management

Patternflow 커뮤니티 웹 서버 및 C++ 펌웨어 웹플래시 컴파일 빌드 워커 서비스 구성과 운영 방법 가이드입니다.

---

## 1. Systemd 서비스 구성

라즈베리 파이(또는 린눅스 서버) 상에서 다음 2개의 systemd 서비스로 가동됩니다.

### ① `patternflow-community.service`
- **역할**: Next.js 기반 커뮤니티 웹 서버 (`patternflow.work` / `community.patternflow.work`)
- **실행 명령**: `npm start` (포트 3000)
- **위치**: `/etc/systemd/system/patternflow-community.service`

#### 죽으면 스스로 다시 뜨게 — `Restart=always` 필수

systemd 기본값은 `Restart=no`입니다. 그대로 두면 Node 프로세스가 한 번이라도
죽는 순간(라즈베리 파이에서 현실적인 원인은 OOM 킬) 누가 `systemctl restart`를
칠 때까지 커뮤니티 전체가 내려간 채로 있습니다. 두 서비스 모두 `[Service]`에
아래 두 줄이 들어 있는지 확인하세요:

```ini
[Service]
Restart=always
RestartSec=3
```

확인: `systemctl show patternflow-community.service -p Restart` 가
`Restart=always` 를 돌려줘야 합니다. 죽은 적이 있는지는
`sudo journalctl -u patternflow-community.service | grep -i "main process exited"`,
OOM 킬은 `dmesg -T | grep -i "killed process"` 로 봅니다.

### ② `patternflow-worker.service`
- **역할**: C++ 펌웨어 빌드 워커 (`scripts/build-worker.ts`)
- **설명**: 웹플래시 요청 대기열(`queued`)을 수신하여 `arduino-cli`를 이용해 ESP32-S3 바이너리를 컴파일합니다.
- **위치**: `/etc/systemd/system/patternflow-worker.service`
- **환경변수 중요 사항**: `Environment=PATH`에 `arduino-cli` 설치 경로(`~/.local/bin` 또는 `/usr/local/bin`) 포함 필수

#### 워커는 격리된 채로 돈다 — `hardening.conf` (2026-09-04)

워커는 사용자가 제출한 C++를 컴파일한다. 컴파일 시점의 임의 코드 실행이
가능한 구조라, 유닛에 systemd 샌드박스를 걸어 둔 상태로만 켠다.
`/etc/systemd/system/patternflow-worker.service.d/hardening.conf`:

```ini
[Service]
NoNewPrivileges=yes
PrivateNetwork=yes            # 워커는 네트워크를 쓰지 않는다 (로컬 SQLite 폴링 → 파일 산출)
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/pi/patternflow-data /home/pi/Patternflow/.build-worker /home/pi/Patternflow/firmware/modules/.build
# 시크릿은 유닛 밖: 워커가 쓰는 변수만 root 전용 파일로, .env.local은 빈 파일로 보이게
EnvironmentFile=/etc/patternflow/worker.env
BindReadOnlyPaths=/dev/null:/home/pi/Patternflow/web/.env.local
InaccessiblePaths=-/home/pi/.ssh -/home/pi/backups -/home/pi/.config
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
# bwrap이 컴파일러를 가두려면 네임스페이스와 mount 계열이 필요하다 (아래 2단계)
RestrictNamespaces=user mnt pid ipc uts net cgroup
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
CapabilityBoundingSet=
SystemCallArchitectures=native
SystemCallFilter=@system-service @mount
SystemCallFilter=~@resources
UMask=0077
MemoryMax=1G
CPUQuota=200%
TasksMax=128
Nice=10
```

`MemoryDenyWriteExecute`는 넣지 않는다 — Node(V8)가 죽는다. 쓰기 경로 세 개는
strace로 확인한 전부다: 데이터 디렉터리(DB·WAL·산출물), 워커 작업 디렉터리,
레포 안 모듈 빌드 캐시. `systemd-analyze security patternflow-worker`가
9.2(UNSAFE)에서 1.7(OK)로 내려갔고, 정상 빌드·자원 폭탄(120 s 타임아웃 뒤 워커
생존)·다음 빌드 정상 수주까지 확인했다.

**이 격리가 막지 않는 것.** 컴파일러는 워커와 같은 사용자(`pi`)로 돌기 때문에,
`pi`가 읽을 수 있는 파일은 제출된 헤더의 `#include`로 읽힌다. 컴파일 오류는
문제의 줄을 그대로 인용하고, 그 오류 문자열은 빌드 상태 API로 제출자에게
돌아간다 — 즉 `web/.env.local`(인증 시크릿)이나 `community.db`(비밀번호
해시)를 `#include`하면 내용 일부가 새어 나갈 수 있다. `/etc/shadow`가 막힌 건
격리 덕이 아니라 원래 root 전용이라서다. 카나리 파일(`/home/pi/canary.txt`에
`CANARY-7f3a`)을 `#include`한 빌드의 오류 문자열에 그 문장이 그대로 나오는
것으로 재현했다. 두 단계 중 첫째는 끝났다:

1. **시크릿은 유닛 밖 (완료, 2026-09-04).** 워커가 필요로 하는 변수
   (`COMMUNITY_ENABLED`, `BUILD_ENABLED`, `BUILD_FQBN`, `COMMUNITY_DB_PATH`)는
   root 전용 `/etc/patternflow/worker.env`(0600)에서 `EnvironmentFile=`로
   받는다. `.env.local`은 `InaccessiblePaths`로 막으면 워커가 못 뜬다 —
   `scripts/loadEnv.ts`의 `existsSync`는 접근 불가 파일에도 `true`를 돌려주고,
   그다음 `process.loadEnvFile`이 EACCES에 예외를 던진다. 그래서
   `BindReadOnlyPaths=/dev/null:…/.env.local`로 **빈 파일로 보이게** 한다:
   워커는 빈 파일을 조용히 넘기고, `#include`는 0바이트를 읽는다. `.ssh`,
   `backups`, `.config`는 `InaccessiblePaths`. 재검증: 카나리는
   `Permission denied`, `.env.local`은 0바이트, 백업 디렉터리는
   `Permission denied`, 정상 빌드 0.5 s.
2. **컴파일러만 따로 가둔다 (완료, 2026-09-04).** DB는 워커에게 필요하니
   유닛 단위로는 못 숨긴다. `build_module.py`는 `PF_XTENSA_BIN`이 가리키는
   디렉터리에서 `xtensa-esp32s3-elf-g++`를 찾고 `nm`은 그 옆 것을 쓰므로,
   `/etc/patternflow/xtensa-sandbox/`(root 소유 0755)에 그 둘의 래퍼를 두고
   `worker.env`에 `PF_XTENSA_BIN=/etc/patternflow/xtensa-sandbox`를 넣었다.
   래퍼는 `bwrap --unshare-all --die-with-parent --new-session`으로 실제
   툴체인(`~/.arduino15/packages/esp32/tools/esp-x32/2601`, g++가 cc1plus·as·ld를
   찾도록 루트째)·`/usr` `/lib` `/bin` `/etc/ld.so.cache`·`firmware/patternflow`·
   `firmware/toolchain`을 읽기 전용으로, `.build-worker`·`modules/.build`·`/tmp`
   (유닛의 PrivateTmp라 호스트와 무관)를 쓰기로 바인드하고 `--chdir /`에서
   실제 g++를 실행한다. 컴파일러의 눈에 그 밖의 파일은 **없다**. 재검증:
   데이터 디렉터리의 카나리와 `web/package.json` 모두 `No such file or
   directory`, 정상 빌드 0.5 s(오버헤드 없음), 자원 폭탄은 120 s 타임아웃 뒤
   워커 생존, seccomp 추가 허용 0개, `systemd-analyze security` 2.7(OK).
   `~@privileged`는 뺐다 — bwrap이 사용자 네임스페이스 안에서 `capset`을 쓴다.

**남은 노출은 작다.** 컴파일 하나가 남기는 파일은 두 군데다. 제출된 헤더
소스는 `.build-worker/modules/<job id>-<n>/`에 들어가는데, 워커가 컴파일마다
새로 만들고 끝나는 즉시(성공이든 실패든) `finally`에서 지운다
(`web/scripts/build-worker.ts`). 컴파일러가 내놓는 오브젝트는 체크아웃 안
`firmware/modules/.build/<slug>/pattern.o`에 떨어지는데(`build_module.py`,
샌드박스에 읽기·쓰기로 바인드됨), 이건 `runModuleBuild`가 매 빌드 `finally`에서
`firmware/modules/.build/` 디렉터리째 지운다(`web/src/lib/firmware/moduleRunner.ts`)
— `<slug>`는 실패한 포팅에선 알 수 없고 체크아웃당 워커는 하나뿐이라, 특정
서브디렉터리를 짚는 대신 디렉터리 전체를 비운다. 워커는 잡을 하나씩만
처리하므로, 다른 제출자의 헤더든 그 오브젝트든 디스크에 있는 건 그 사람 자신의
컴파일이 도는 동안뿐이다 — `rm` 도중 워커가 죽은 경우의 잔여물을 빼면 컴파일러가
남의 것을 볼 틈은 없다. drop-in에 남은 `-/home/pi/canary.txt`는 파일이 없어
무해하다.

**헤더 텍스트 검사는 경계가 아니다.** `validateCustomPattern`
(`web/src/lib/firmware/assemble.ts`)이 `# include`·`#embed`·`asm(`·`.incbin` 같은
평범한 표기는 거절하지만, 글자를 보는 검사라 표기를 바꾸면 지나간다 — `#`와
`include` 사이의 백슬래시 줄바꿈, 지시문 안의 주석, `#`의 이중문자 `%:`,
`asm`으로 펼쳐지는 매크로, 두 문자열로 쪼갠 `.incbin`(2026-09-24 실제 툴체인으로
확인). 헤더가 읽을 수 있는 파일을 정하는 건 위 2단계의 bwrap 래퍼다: 툴체인,
시스템 디렉터리, `firmware/patternflow`·`firmware/toolchain`(읽기 전용)뿐. 그리고
그 안의 파일은 **공개된 것으로 본다** — 공개 패턴의 컴파일 오류는
`/api/community/patterns/<id>/zip`의 422 `detail`로 누구에게나 보이고, `.incbin`은
파일 바이트를 공개 다운로드되는 `.pfm`에 그대로 넣는다. 그러니 Pi 체크아웃의 그
경로에 비밀을 두지 않는다(예: `firmware/patternflow/patternflow_secrets.h`를 Pi에
만들지 않는다). 래퍼 없이 도는 워커(개발 PC 등)에서는 헤더가 워커 사용자가 읽을
수 있는 모든 파일에 닿으므로, 남의 헤더를 굽는 워커는 반드시 래퍼 뒤에서
돌린다.

### 호스트 업데이트 절차

레포는 `/home/pi/Patternflow`, 데이터는 `/home/pi/patternflow-data`
(DB `community.db`, `attachments/`, `builds/`), 백업은 매일 04:00 크론이
`/home/pi/backups/`에 `.backup`으로 뜬다. Node는
`/home/pi/Desktop/nodejs/node-v21.7.2-linux-arm64`, 터널은 `cloudflared.service`.

```bash
# 1. 백업 (DB는 온라인 .backup으로, WAL 일관성 유지)
sqlite3 /home/pi/patternflow-data/community.db ".backup '/home/pi/backups/community-$(date +%F)_pre_update.db'"
cp -r /home/pi/patternflow-data/attachments /home/pi/backups/attachments-$(date +%F)_pre_update
git -C /home/pi/Patternflow rev-parse HEAD   # 롤백 기준점을 적어 둔다

# 2. 코드
cd /home/pi/Patternflow && git fetch origin && git checkout main && git pull --ff-only
cd web && npm ci && npm run build

# 3. 재시작 (DB 마이그레이션은 서버가 첫 접속 때 자동 적용)
sudo systemctl restart patternflow-community patternflow-worker

# 4. 확인
curl -sI https://community.patternflow.work/editions | head -1      # 200
curl -sI https://community.patternflow.work/variants | head -1      # 308
curl -sI https://community.patternflow.work/api/community/patterns | head -1   # 200
journalctl -u patternflow-community -n 30 --no-pager                 # 마이그레이션 오류 없음
```

`.env.local`은 건드리지 않는다. 키 목록은 `web/.env.example`이 전부다.

---

## 2. 주요 관리 명령어

### 서비스 상태 및 상태 확인
```bash
# 커뮤니티 웹 서버 상태 확인
sudo systemctl status patternflow-community.service

# 펌웨어 빌드 워커 상태 확인
sudo systemctl status patternflow-worker.service

# 빌드 워커 실시간 로그 확인
sudo journalctl -u patternflow-worker.service -f
```

### 서비스 재시작
```bash
# 웹 서버 재시작
sudo systemctl restart patternflow-community.service

# 빌드 워커 재시작
sudo systemctl restart patternflow-worker.service
```

### 보관 기간 정리 (Retention)

`/terms` §9에 약속한 보관 기간을 실제로 이행하는 작업입니다.

| 대상 | 보관 |
|---|---|
| 세션 (IP·User-Agent 포함) | 만료 시 삭제, 최대 **90일** |
| Better Auth 인증 토큰 | 만료 시 삭제 |
| 빌드 산출물 + 빌드 기록 (bake 잡 포함) | **30일** |
| 참조되지 않는 산출물 파일 | 24시간 유예 후 삭제 |
| 컴파일된 패턴 모듈 (`module_cache`) | 헤더가 사이트에 있는 동안 보관. 헤더가 지워지거나 바뀌면 마지막 사용 후 **30일** |
| 이전 툴체인 리비전의 모듈 | 마지막 사용 후 **7일** (롤백하면 그대로 다시 쓰인다) |

**빌드 워커가 하루에 한 번 자동으로 돌립니다** (`patternflow-worker.service`).
별도 systemd 타이머를 설치할 필요가 없습니다 — 대신 **워커가 꺼져 있으면
정리도 멈춥니다.**

```bash
cd web

# 뭐가 지워질지 먼저 확인 (아무것도 안 지움)
npm run sweep -- --dry-run

# 실제로 정리
npm run sweep
```

워커 로그에서 `retention swept` 줄로 마지막 실행 결과를 확인할 수 있습니다:

```bash
sudo journalctl -u patternflow-worker.service | grep "retention"
```

> 보관 기간을 바꾸려면 `web/src/lib/community/server/retention.ts`의 상수와
> `/terms` §9를 **함께** 고쳐야 합니다. 한쪽만 고치면 약관이 거짓말이 됩니다.

### 컴파일된 모듈 캐시 (`module_cache`, 2026-09-24)

공개된 헤더는 **한 번만** 컴파일된다. 워커가 결과(.pfm 바이트 + 사이드카)를
DB의 `module_cache`에 (헤더 sha256, 툴체인 리비전) 키로 넣고, 웹은 설치·다운로드
요청마다 그 행으로 zip을 조립한다 — 큐도 컴파일도 없다. 패턴 페이지의 `.zip`
(`/api/community/patterns/<id>/zip`)과 덱 팩(`/api/community/decks/<id>/zip`)이
둘 다 여기서 나온다. 컴파일하고 모듈 내용(.pfm·사이드카·상태·오류)을 쓰는 건
워커뿐이다. 웹은 bake 잡을 넣고, 보관 기간 계산용 `used_at`만 행당 하루 한 번
갱신한다.

- **툴체인 리비전**은 워커가 잡마다 계산해 `build_meta.builder_rev`에 적는다
  (ABI 헤더·공유 수학 헤더·`core_module_loader.h`·`module.ld`·두 파이썬
  스크립트·컴파일러 `--version`·`PF_TARGET_ABI`의 해시, `web/src/lib/firmware/builderRev.ts`).
  펌웨어를 `git pull`해서 이 중 하나라도 바뀌면 리비전이 바뀌고, 워커가 한가할 때
  공개 헤더를 **1분에 5개씩** 다시 굽는다. 손으로 할 일은 없다.
- **컴파일 오류**(코드 탓)는 캐시에 남아 같은 헤더를 다시 컴파일하지 않는다.
  코드 탓으로 치는 건 **증거가 있을 때만**이다: 패턴 자신의 소스 줄을 가리키는
  컴파일 오류(`pattern.cpp:12:3: error:` 또는 그 줄에서 이어진
  `required from`), 기기 로더가 못 푸는 심볼. 그리고 캐시에 적기 전에 워커가
  **카나리**(`firmware/patternflow/presets/preset_origin.h`)를 컴파일해 본다 —
  그것도 실패하면 툴체인 쪽 문제로 보고 캐시하지 않는다(통과는 10분 기억).
  bwrap이 안 뜨거나 cc1plus·ld가 없어진 경우처럼 **인프라 오류**는 캐시하지
  않고, 같은 헤더 재시도는 1분부터 두 배씩(최대 6시간) 미룬다. 헤더 안의
  `#error Permission denied` 같은 글자는 판정에 쓰지 않는다.
- 컴파일러가 없거나 `--version`에 답하지 않으면 워커는 리비전을 **만들지 않는다**
  (잡은 인프라 오류로 실패, 워밍은 그 회차를 건너뜀). `build_meta`에는 마지막
  정상 리비전이 남으므로 이미 구운 모듈은 계속 내려받힌다.
- bake 잡은 헤더 주인(작성자, 포트면 포터)에게 달리지만 개인 빌드 한도·대기열
  취소에는 안 잡힌다. 대신 **주인당 동시 4개**(대기+컴파일 중)까지만 쌓인다 —
  헤더를 계속 고쳐 저장해도 컴파일이 줄줄이 쌓이지 않는다. 헤더를 저장하면
  사이트에서 사라진 이전 텍스트의 대기 중 bake는 취소되고, 차례가 왔을 때 이미
  사라진 텍스트는 컴파일하지 않고 넘긴다. 워커는 사람이 누른 `send` 잡을 항상
  먼저 처리한다.
- **워커는 체크아웃당 하나만.** `build_module.py`는 오브젝트를 체크아웃의
  `firmware/modules/.build/<slug>/pattern.o`에 만들고 `<slug>`는 패턴 NAME에서
  나오므로, 워커 둘이 같은 NAME의 헤더를 동시에 컴파일하면 서로의 오브젝트를
  링크할 수 있다. `BUILD_WORK_DIR`를 달리해도 막히지 않는다.
- 툴체인 사고 뒤 잘못 남은 오류 행을 지우려면(다음 bake가 다시 판정한다):

```bash
sqlite3 /home/pi/patternflow-data/community.db \
  "DELETE FROM module_cache WHERE status='error'
     AND builder_rev=(SELECT value FROM build_meta WHERE key='builder_rev');"
```

- 상태 보기:

```bash
sqlite3 /home/pi/patternflow-data/community.db \
  "SELECT builder_rev = (SELECT value FROM build_meta WHERE key='builder_rev') AS current,
          status, COUNT(*), SUM(bytes) FROM module_cache GROUP BY 1, 2;"
sqlite3 /home/pi/patternflow-data/community.db \
  "SELECT kind, status, COUNT(*) FROM builds GROUP BY 1, 2;"
```

로컬 확인: `npm run check:modcache`(가짜 컴파일러, CI에서도 돈다),
`npm run check:modcache-e2e`(진짜 툴체인 — 한 번 굽고, 두 번째는 프로세스 0개인지).

### 펌웨어 빌드 큐 상태 점검 스크립트
```bash
cd web

# 현재 최신 큐 상태 확인
npm run build:status

# 특정 빌드 ID 상태 확인
npm run build:status -- <BUILD_ID>

# 테스트 빌드 인큐
npm run build:enqueue
```

---

## 3. 자주 발생하는 문제 & 조치법 (Troubleshooting)

- **웹플래시 요청이 계속 `queued`에서 안 넘어감**:
  - `patternflow-worker.service`가 켜져 있는지 확인: `sudo systemctl status patternflow-worker.service`
  - 꺼져 있다면 재시작: `sudo systemctl restart patternflow-worker.service`
- **`spawn arduino-cli ENOENT` 에러 발생**:
  - `patternflow-worker.service` 파일 내 `PATH` 환경변수에 `arduino-cli` 설치 경로가 올바르게 지정되었는지 확인.
