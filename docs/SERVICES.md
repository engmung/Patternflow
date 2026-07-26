# Patternflow Server Services & Worker Management

Patternflow 커뮤니티 웹 서버 및 C++ 펌웨어 웹플래시 컴파일 빌드 워커 서비스 구성과 운영 방법 가이드입니다.

---

## 1. Systemd 서비스 구성

라즈베리 파이(또는 린눅스 서버) 상에서 다음 2개의 systemd 서비스로 가동됩니다.

### ① `patternflow-community.service`
- **역할**: Next.js 기반 커뮤니티 웹 서버 (`patternflow.work` / `community.patternflow.work`)
- **실행 명령**: `npm start` (포트 3000)
- **위치**: `/etc/systemd/system/patternflow-community.service`

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
