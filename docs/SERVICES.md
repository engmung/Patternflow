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
