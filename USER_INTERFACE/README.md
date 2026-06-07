# ALFRED — 지하철 역사 안내 로봇 키오스크 UI

Turtlebot4 위에 올라가는 **터치 키오스크 UI**입니다. 지하철 역사(1층/2층, 층마다 로봇 1대)에서
사용자에게 시설(화장실·역무실·출구 등)을 안내하고, 평소에는 순찰(patrol)하며 웃는 얼굴을 띄웁니다.

> 이 저장소는 **UI만** 구현합니다. 서버/로봇 쪽(ROS 토픽 발행, 실제 STT 엔진, LLM, 멀티층 핸드오프
> 조율)은 **인터페이스 + 목(mock)** 으로만 들어가 있으며, UI 흐름은 목만으로 완전히 동작합니다.
> 실제 백엔드는 같은 인터페이스를 구현해 끼우면 됩니다. ("server pluggable" — `src/services` 참고)

---

## 빠른 시작

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기
npm run typecheck  # 타입체크만
```

요구 환경: Node 18+ (개발은 Node 24 / npm 11에서 검증).

---

## 키오스크 모드로 띄우기 (요구사항 #1)

탭/제목/주소(omnibox)/북마크 바와 Windows 작업 표시줄이 **전부 없는** 전체화면은 브라우저를
**실행 시점**에 `--kiosk` 로 띄워서 만듭니다. (웹앱 자체는 컨텍스트 메뉴/제스처 차단 + 첫 터치 시
Fullscreen 요청까지만 담당 — `useKioskMode`.)

### ⭐ 원클릭: `start-kiosk.bat` 더블클릭

빌드 → 미리보기 서버 → Chrome 키오스크까지 한 번에 실행하고, **키오스크 창을 닫으면(Alt+F4)
서버도 자동 정리**됩니다.

```
C:\ROKEY_ALFRED\start-kiosk.bat   ← 더블클릭
```

- 종료: 키오스크 창에서 **Alt + F4**
- 별도 임시 프로필로 새 Chrome 인스턴스를 띄우므로 평소 쓰던 탭/북마크가 보이지 않습니다.

### 빠른 방법 (개발 중)

- 이미 열린 창에서 **`F11`** → 전체화면(툴바/표시줄 사라짐). 데모용으로 충분.
- 또는 `npm run dev` 를 켠 상태에서 `kiosk.bat` 더블클릭(개발 서버 5173 대상).

### 수동 2단계

```powershell
# 1) 정적 서버 실행
npm run kiosk      # http://localhost:4173

# 2) Chrome을 키오스크로 실행 (※ 기존 Chrome이 떠 있어도 새 인스턴스로 뜨도록 user-data-dir 필수)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --kiosk "http://localhost:4173" `
  --user-data-dir="$env:TEMP\alfred-kiosk-profile" `
  --start-fullscreen --disable-pinch --overscroll-history-navigation=0 `
  --disable-features=TranslateUI --no-first-run --no-default-browser-check
```

- 작업 표시줄이 계속 보이면 작업 표시줄 설정에서 **자동 숨기기**를 켜세요.
- `Alt+F4` 등 종료키까지 봉인하는 무인 운영은 Windows **할당된 액세스(Assigned Access)** / **Shell Launcher**
  또는 Chrome 엔터프라이즈 정책으로 잠그는 것이 정석입니다.

### 런처 파일

| 파일 | 용도 |
|------|------|
| `start-kiosk.bat` | **원클릭**: 빌드+서버+키오스크, 종료 시 서버 자동 정리 |
| `kiosk.bat` | Chrome 키오스크만 실행 (서버는 따로 띄워둔 상태에서) |

---

## 아키텍처

레이어가 단방향으로 의존하도록 설계했습니다. **UI는 서비스 "인터페이스"에만** 의존하고, 구체 구현
(목/실제)은 한 곳(`createServices`)에서만 선택합니다.

```
src/
├─ app/                 앱 셸: 프로바이더 조립 + 라우터 + 오버레이
│   ├─ App.tsx          ServiceProvider → KioskProvider → GuidanceProvider → KioskApp
│   ├─ KioskApp.tsx     kiosk-mode/idle 타이머, 화면+팝업 렌더
│   ├─ KioskRouter.tsx  상태 → 화면 매핑 (화면이 마운트되는 유일한 곳)
│   └─ StaffCallOverlay.tsx   직원 호출 팝업 (#11)
│
├─ core/                프레임워크/도메인 코어 (UI 비의존)
│   ├─ domain/          Facility / Floor / Navigation 타입 (순수)
│   ├─ kiosk/           유한상태기계: types · kioskMachine(reducer) · Provider · hooks
│   ├─ hooks/           useIdleTimer · useKioskMode · useAnyInput
│   └─ utils/           makeId · cx
│
├─ services/            ★ 서버 경계(서버 관련 부분) — 인터페이스 + 목 구현
│   ├─ ros/             RosService        + MockRosService     (ROS 토픽/Nav 목표)
│   ├─ stt/             SttService        + MockSttService     (음성 인식)
│   ├─ llm/             LlmService        + MockLlmService     (발화 → 시설)
│   ├─ navigation/      NavigationService + MockNavigationService (경로/멀티층 핸드오프)
│   ├─ createServices.ts   구성 루트(여기서만 목/실제 선택)
│   └─ ServiceProvider.tsx DI 컨텍스트 (useServices)
│
├─ features/            화면별 기능 (요구사항 1:1 대응)
│   ├─ patrol/          순찰 화면 (#2)
│   ├─ home/            초기 화면, 버튼 A/B + 직원호출 (#3, #9)
│   ├─ map/             지도(도면) 안내 — Blueprint + 시설 리스트 (#4, #6)
│   ├─ voice/           음성 안내 — useVoiceFlow (STT→LLM→확인) (#5)
│   └─ guiding/         안내중 화면 + GuidanceProvider(경로 오케스트레이션) (#7, #10)
│
├─ components/          공용 프레젠테이션 컴포넌트 (CSS Modules)
│   ScreenFrame · BigButton · RobotFace(^^) · Modal · StaffCallButton · FacilityIcon
│
├─ config/             데이터/문구 (코드와 분리)
│   facilities · floors(도면 좌표) · strings(한국어 문구) · kiosk.config(로봇 설정)
│
└─ styles/             tokens.css(디자인 토큰) · global.css(리셋/키오스크 하드닝)
```

### 상태 머신 (핵심)

화면 전환은 전부 `core/kiosk/kioskMachine.ts` 의 순수 reducer를 통합니다.

```
patrol ──WAKE──▶ home ──OPEN_MAP───▶ map  ─┐
                  │  ──OPEN_VOICE──▶ voice ┼─ START_GUIDING ─▶ guiding
                  ▲  ◀──── GO_HOME ────────┘                     │
                  └──────── END_GUIDING / IDLE_TIMEOUT ──────────┘ ▶ patrol
```

`staffCallActive` 는 화면과 직교(orthogonal)한 오버레이 플래그입니다.

### 서버를 끼우는 법

목을 실제 구현으로 교체하는 지점은 **단 한 곳**입니다.

```ts
// src/services/createServices.ts 에서 Mock* 대신 실제 구현을 생성하거나,
// 루트에서 직접 주입:
<ServiceProvider services={{ ros, stt, llm, navigation }}>
```

- `RosService` → roslibjs + rosbridge_websocket (Nav2/move_base 목표 발행, `requestHandoff`로 다른 층 로봇 호출 #6)
- `SttService` → Web Speech API 또는 서버 STT(Whisper 등)
- `LlmService` → 실제 LLM 호출(후보 시설 목록을 주고 최적 시설 선택)
- `NavigationService` → 실제 로봇 피드백 기반 진행/도착 이벤트

UI 코드는 인터페이스에만 의존하므로 화면/로직 수정 없이 교체됩니다.

---

## 요구사항 → 구현 매핑

| # | 요구사항 | 구현 위치 |
|---|---------|----------|
| 1 | 크롬 크롬/작업표시줄 없는 키오스크 | 실행 `--kiosk`(README) + `core/hooks/useKioskMode` + `styles/global.css` |
| 2 | 순찰 시 웃는 얼굴 + "사용할거면 아무키나 누르세요" | `features/patrol` + `components/RobotFace` |
| 3 | 초기화면 큰 버튼 2개 + 우하단 [직원 호출] | `features/home` + `components/StaffCallButton` |
| 4 | 버튼 A: 도면형 지도, 시설 클릭 시 이동 | `features/map` (`Blueprint` SVG) → `NavigationService` |
| 5 | 버튼 B: STT+LLM으로 시설 도출 후 이동 | `features/voice` (`useVoiceFlow`) → `Stt/Llm/NavigationService` |
| 6 | 다른 층 시설이면 환승점 이동 + 다음 층 로봇 인계 | `MockNavigationService.planRoute/start` (`requestHandoff`) |
| 7 | 안내 중 웃는 얼굴 + "시설 안내중" | `features/guiding` |
| 8 | 텍스트/버튼 최대한 크게 | `styles/tokens.css` (clamp 기반 대형 스케일) |
| 9 | 버튼 A/B 짧은 이름 | "시설 안내" / "음성 안내" (`config/strings`) |
| 10 | 안내 종료 후 다시 순찰 | `GuidanceProvider` → `END_GUIDING` |
| 11 | [직원 호출] 팝업, 직원이 닫기로 종료 | `app/StaffCallOverlay` + `components/Modal` |

> 데모용 타이밍(이동/핸드오프/도착 유지 시간)과 이 로봇이 어느 층인지(`currentFloorId`)는
> `src/config/kiosk.config.ts` 에서 조정합니다. 음성 목(MockStt)은 정해진 예시 문장을 순환 재생합니다.

---

## 기술 스택

React 18 · TypeScript(strict) · Vite 6 · CSS Modules + 디자인 토큰. 런타임 의존성은 React/React-DOM뿐입니다.
