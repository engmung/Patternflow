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

**남은 노출은 작다.** 컴파일러에게 보이는 쓰기 디렉터리 `.build-worker/modules/<job id>/`는
빌드가 끝나도 지워지지 않으므로(`moduleRunner`는 워커가 준 workDir를 남긴다),
다른 제출자의 헤더가 그 아래 남아 있다. 읽으려면 16자리 16진수 job id를 알아야
하고 `#include`로는 디렉터리를 나열할 수 없다. 닫고 싶으면 워커가 잡을 마친 뒤
그 디렉터리를 지우게 하면 된다(레포 쪽, 몇 줄). drop-in에 남은
`-/home/pi/canary.txt`는 파일이 없어 무해하다.

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
| 빌드 산출물 + 빌드 기록 | **30일** |
| 참조되지 않는 산출물 파일 | 24시간 유예 후 삭제 |

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

> 보관 기간을 바꾸려면 `web/src/lib/community/retention.ts`의 상수와
> `/terms` §9를 **함께** 고쳐야 합니다. 한쪽만 고치면 약관이 거짓말이 됩니다.

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
