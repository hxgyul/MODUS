# 학습 관리 웹앱 — 1단계 설계서

> 작성일 2026-11-02 · 상태: **검토 대기 (코드 작성 전)**
> 근거: 「학생용 학습 관리 웹앱 기획 및 개발 통합 지시서」

---

## 0. 확정된 전제

| 항목 | 결정 |
|---|---|
| 프로젝트 | 완전히 새 앱 (스목스와 코드·데이터 공유 없음) |
| 기존 저장소 | 없음 → 1단계 "기존 코드 분석"은 해당 없음 |
| 기술 스택 | React 19 + TypeScript + Vite 8, Tailwind CSS 4 |
| 백엔드 | **새** Firebase 프로젝트 (Firestore + Authentication) |
| 범위 | 지시서에 명시된 기능만. 스목스 v19 기능(시험 플래너·그룹·붙여넣기 등)은 넣지 않음 |
| 배포 | Netlify (방식은 §10 질문 참고) |

---

## 1. 기술 구성

| 영역 | 선택 | 이유 |
|---|---|---|
| UI | React 19, React Router | 화면 8개 + 전역 타이머 바 |
| 언어 | TypeScript (strict) | 데이터 모델이 복잡하고 날짜 계산 오류가 치명적 |
| 스타일 | Tailwind CSS 4 + CSS 변수 토큰 | 라이트/다크·과목 색상을 토큰으로 일관 관리 |
| 데이터 | Firebase JS SDK 13 — Firestore `persistentLocalCache` + `persistentMultipleTabManager` | 오프라인 읽기/쓰기, 재접속 자동 동기화 |
| 인증 | Firebase Auth — 익명으로 시작 → 정식 계정 연결(link) | 지시서 §11-2 |
| 날짜 | date-fns 4 | 주·월 경계, 요일 계산 |
| 드래그 | @dnd-kit (터치 길게 누르기 센서 지원) | 지시서 §3-4 모바일 요구 |
| PWA | vite-plugin-pwa (Workbox) | 설치·캐시·업데이트 안내 |
| 테스트 | Vitest(도메인 로직) + Firebase Emulator(보안 규칙·오프라인) + Playwright(사용 흐름) | §13, §15 |

---

## 2. 화면 구조와 이동 동선

```
하단 탭(휴대폰) / 좌측 사이드바(태블릿·PC)
 ├─ 홈            /                오늘 할 일 · 오늘 공부 시간 · 마감/일정
 ├─ 과목          /subjects        과목 카드 그리드
 │   └─ 과목 상세 /subjects/:id    미완료·완료 과제, 과목 기록, ▶시작, 자유 공부
 ├─ 계획          /plan?week=…     주간 계획 = 주간 달력 (시간표+개인 계획+일정)
 ├─ 달력          /calendar        월간 ⇄ 주간 전환 (주간은 /plan과 같은 컴포넌트)
 ├─ 통계          /stats           기본 통계 · 실행률 · 피드백 · 기록 조회(/stats/records)
 └─ 설정          /settings        과목/시간표/알림/테마/계정
전역: 실행 중 타이머 바(모든 화면 하단 고정) → 탭하면 타이머 시트
```

**설계 판단 — §3-4 주간 계획과 §7 주간 달력의 통합.** 두 절의 요구 항목(시간표·개인 계획·일정·과제 배치·시간대)이 사실상 같으므로 하나의 `WeekView` 컴포넌트로 만들고, 달력 탭의 "주간"은 같은 화면을 보여 줍니다. 중복 화면을 만들지 않기 위함입니다.

### 핵심 동선의 터치 수 (휴대폰)

| 흐름 | 터치 |
|---|---|
| 홈에서 오늘 과제 바로 시작 | **1** (과제 행의 ▶) |
| 과목 → 과제 → 시작 | **2** (과목 카드 → 과제 ▶) |
| 과목 → 자유 공부 | **2** (과목 카드 → "자유 공부 시작") |
| 실행 중 타이머 일시정지/종료 | **1** (하단 타이머 바) |

### 홈 화면 배치 (위에서부터)
1. 날짜·요일 + 오늘 총 공부 시간(한 줄)
2. 실행 중 타이머 카드 (있을 때만)
3. **오늘의 할 일** — 가장 큰 영역. 체크박스, ▶, 과목 색 점, 하위 과제 진행(2/4)
4. "지난 미완료 N개" 접힌 묶음 → 펼쳐서 다중 선택 후 날짜 이동
5. 다가오는 마감·일정 (7일 이내, 최대 5개)
6. "주간 계획" 버튼

통계 그래프는 홈에 두지 않습니다.

---

## 3. 데이터 모델 (Firestore)

### 3-1. 경로 원칙
모든 사용자 데이터는 `users/{uid}/…` 하위 컬렉션 **한 단계**에만 둡니다(중첩 최소화). 각 문서에도 `userId`를 중복 저장해 향후 이전·관리 작업에 대비합니다.

```
users/{uid}                         UserSettings (문서 1개)
users/{uid}/subjects/{subjectId}
users/{uid}/tasks/{taskId}          단일 과제 + 실체화된 반복 과제 발생분
users/{uid}/recurrences/{ruleId}    반복 규칙
users/{uid}/sessions/{sessionId}    공부 세션
users/{uid}/state/activeTimer       활성 타이머 (사용자당 정확히 1개 문서)
users/{uid}/timetables/{ttId}       학기별 기본 시간표
users/{uid}/timetableExceptions/{yyyy-MM-dd}
users/{uid}/events/{eventId}        학교 일정
users/{uid}/pushTokens/{tokenHash}  웹 푸시 수신 기기
```

### 3-2. 타입 정의 (요약)

```ts
type ISODate = string;   // 'yyyy-MM-dd' — "공부일" 기준 날짜
type HHmm = string;      // '18:30'
type Millis = number;    // epoch ms (Firestore Timestamp로 저장)

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  dayStartHour: number;         // 공부일 경계 (§4-1)
  weekStartsOn: 0 | 1;          // 기본 1(월)
  notifications: { deadline: NotifRule; studyStart: NotifRule; overdue: NotifRule };
  createdAt; updatedAt;
}

interface Subject {
  id; userId; name: string; color: string;   // 팔레트 키 (라이트/다크 대응)
  order: number; archived: boolean; createdAt; updatedAt;
}

interface Task {
  id; userId; subjectId: string; title: string;
  planDate: ISODate | null;     // 요일 지정 과제 = planDate만, 시간 지정 = planDate+planStart
  planStart: HHmm | null;
  estimateMin: number | null;   // 예상 소요 시간 (주간 블록 높이·시간 실행률)
  dueDate: ISODate | null;      // 이동해도 바뀌지 않음
  subtasks: { id: string; title: string; doneAt: Millis | null }[];
  completedAt: Millis | null;   // 복합 과제는 하위 과제 전부 완료 시 자동 기록
  completedOn: ISODate | null;  // 완료한 공부일 (취소선 표시·통계용)
  status: 'active' | 'skipped' | 'archived';
  firstPlanDate: ISODate | null;           // 최초 계획일 (요일별 미완료 분석용)
  recurrenceId: string | null; occurrenceDate: ISODate | null;
  createdAt; updatedAt;
}

interface RecurrenceRule {
  id; userId; template: Pick<Task,'subjectId'|'title'|'planStart'|'estimateMin'|'subtasks'>;
  freq: 'daily' | 'weekly' | 'weekdays';   // 매일 / 매주(시작 요일) / 특정 요일
  weekdays: number[];                       // freq='weekdays'일 때
  startDate: ISODate; endDate: ISODate | null;
  createdAt; updatedAt;
}

interface StudySession {
  id;                       // 시작 시점에 기기에서 만든 UUID (멱등 저장 키)
  userId; subjectId: string; taskId: string | null;   // null = 자유 공부
  startAt: Millis; endAt: Millis;
  pauses: { start: Millis; end: Millis }[];
  durationSec: number;      // (endAt-startAt) - Σpauses, 저장 시 계산
  studyDate: ISODate;       // startAt의 공부일
  deviceId: string; createdAt; updatedAt;
}

interface ActiveTimer {
  sessionId; subjectId; taskId: string | null;
  startAt: Millis; pauses: { start: Millis; end: Millis }[];
  pausedAt: Millis | null; deviceId: string; updatedAt;
}

interface Timetable {        // 학기별 1개, 날짜 범위로 적용
  id; name: string; validFrom: ISODate; validTo: ISODate | null;
  slots: TimetableSlot[];    // 30~50개 내외 → 문서 안 배열로 충분
}
interface TimetableSlot {
  id; weekday: 1|2|3|4|5|6|0; period: number; label: string;   // '통합과학'
  subjectId: string | null;  // 공부 과목과 연결되면 그 색상 사용
  start: HHmm; end: HHmm; memo: string;
}
interface TimetableException {   // 문서 ID = 날짜
  date: ISODate; slots: TimetableSlot[];   // 그날의 최종 수업 목록 (기본과 독립)
  note: string;
}

interface SchoolEvent {
  id; title; date: ISODate; endDate: ISODate | null;
  startTime: HHmm | null; endTime: HHmm | null;
  kind: 'midterm'|'final'|'mock'|'performance'|'event'|'other'; memo: string;
}
```

### 3-3. 관계와 무결성
- 과목별 시간 = `sessions where subjectId` 합계 / 과제별 시간 = `sessions where taskId` 합계. 자유 공부(taskId=null)는 과목에만 합산 — **집계값을 따로 저장하지 않고 항상 세션에서 계산**합니다(가짜 숫자 방지, 동기화 충돌 원천 제거).
- 과제 날짜 이동은 `planDate`(와 `planStart`)만 변경. ID·`dueDate`·`subtasks`·세션 연결은 그대로.
- 과목 삭제: 연결된 과제·세션이 있으면 **보관(archived)만** 허용, 없으면 실제 삭제.
- 과제 삭제: 세션이 연결된 과제는 `archived`로 보관해 기록이 끊기지 않게 함.

### 3-4. 필요한 인덱스
`tasks(planDate)`, `tasks(subjectId, completedAt)`, `tasks(dueDate)`, `sessions(studyDate)`, `sessions(subjectId, studyDate)`, `sessions(taskId)`, `events(date)` — 사용자 하위 컬렉션이므로 대부분 단일 필드 자동 인덱스로 충분하고, 복합 인덱스는 `firestore.indexes.json`에 명시합니다.

---

## 4. 핵심 로직 설계 (오류가 나기 쉬운 부분)

### 4-1. "공부일" 경계
자정을 넘겨 공부하는 경우(예: 00:30 종료), 그 세션이 어느 날 기록인지가 모든 통계를 좌우합니다. `dayStartHour`(설정값) 이전의 시각은 전날 공부일로 계산하는 함수 `toStudyDate(ms, dayStartHour)` 하나로 앱 전체를 통일합니다. 세션은 **시작 시각의 공부일**에 귀속합니다. 기본값은 §10에서 확인합니다.

### 4-2. 반복 과제 — "지연 실체화" 방식
지시서 §4-5의 요구(자동 생성·특정 날짜만 수정/건너뛰기·규칙 수정은 이후에만 반영·중복 생성 금지)를 오프라인 다중 기기 환경에서 모두 지키기 위해:

1. 규칙(`recurrences`)에서 그 날짜의 발생분을 **화면에서 계산해 자동으로 보여 줌** (가상 과제).
2. 사용자가 그 발생분을 건드리는 순간(완료·이동·수정·건너뛰기·타이머 시작) **결정적 ID** `r_{ruleId}_{yyyyMMdd}`로 문서를 만듦.
3. 같은 날짜의 발생분은 어느 기기에서 몇 번 만들어도 같은 ID → **중복이 구조적으로 불가능**. 오프라인 두 기기가 동시에 만들어도 병합(merge)됨.
4. 규칙 수정 → 아직 실체화되지 않은(손대지 않은) 미래 발생분에만 자동 반영. 이미 완료했거나 기록이 있는 과제는 그대로.
5. 건너뛰기 = `status:'skipped'` 문서를 남김 → 다시 생성되지 않음, 완료율 분모에서 제외.
6. 이동한 발생분은 `occurrenceDate`(원래 날짜)를 유지하므로, 원래 날짜에 가상 과제가 다시 나타나지 않음.

"매일 미리 30일치를 만들어 두는" 방식은 오프라인에서 서버 존재 여부를 확인할 수 없어 사용자의 수정 내용을 덮어쓸 위험이 있어 택하지 않았습니다.

### 4-3. 타이머
**상태는 화면이 아니라 시각 기록**으로 관리합니다.

```
경과(초) = (now 또는 pausedAt) − startAt − Σ(pause.end − pause.start)
```
- 화면은 1초마다 위 식을 **다시 계산**만 함(카운터를 누적하지 않음).
- 시작: 기기에서 `sessionId`(UUID) 생성 → `state/activeTimer` 저장 + localStorage 사본.
- 일시정지/재개: `pausedAt` 기록 / `pauses`에 구간 추가.
- 종료: **배치 쓰기 한 번**으로 `sessions/{sessionId}` 생성 + `activeTimer` 삭제. 같은 ID로 재시도해도 한 건만 남음(멱등).
- 전환(다른 과목·과제 시작): 같은 배치에서 이전 세션 종료·저장 + 새 activeTimer 설정.
- 복구: 새로고침·앱 재실행 시 localStorage → Firestore 캐시 → 서버 순으로 activeTimer를 읽어 식으로 재계산.
- 0분 미만(기본 1분 미만) 세션은 저장하지 않음 — 실수로 누른 시작/종료 방지. (값은 설정 가능하게 할지 검토)

**다른 기기 동시 실행 충돌 처리.** activeTimer는 사용자당 문서 1개이므로 마지막에 쓴 쪽이 "현재 타이머"가 됩니다. 각 기기는 이 문서를 구독하다가, 자기가 돌리던 세션이 아닌 다른 `sessionId`로 바뀐 것을 발견하면 자기 세션을 `min(지금, 상대 시작 시각)`에 종료·저장합니다. 결과적으로 **겹치는 시간은 한 번만 기록**됩니다. (Firestore 트랜잭션은 오프라인에서 실패하므로 의도적으로 쓰지 않습니다.)

### 4-4. 과제 완료 표시 규칙
- 오늘 목록 = `planDate == 오늘` 과제 + 오늘의 가상 반복 과제. 오늘 완료한 것은 취소선으로 남김.
- 어제 이전에 완료한 과제는 오늘 목록에 나오지 않음, 완료 기록 화면에서 조회.
- 지난 날짜의 미완료 과제는 원래 날짜에 그대로 있고, 홈의 "지난 미완료" 묶음에서 골라서 옮김(자동 이월 없음).
- 완료 취소 → `completedAt/completedOn = null`.

### 4-5. 통계 계산
모든 수치는 해당 기간의 `sessions`·`tasks`·반복 규칙에서 **조회 시점에 계산**합니다.

| 지표 | 정의 |
|---|---|
| 시간 실행률 | Σ(실제 공부 시간 — 그 과제들에 연결된 세션) ÷ Σ(예상 소요 시간) × 100. **분모·분자 모두 예상 시간이 입력된 기간 내 계획 과제만** |
| 과제 완료율 | 완료 과제 수 ÷ 기간 내 계획 과제 수(건너뛴·보관 과제 제외, 가상 반복 과제 포함) × 100 |

두 수치는 항상 따로 표시하고 합산 점수를 만들지 않습니다. 100% 초과 시간 실행률은 "계획보다 오래 걸림"으로 중립 표기합니다.

### 4-6. 피드백(다음 주 계획 개선)
각 항목은 **관찰(데이터 그대로)** 과 **제안(추정)** 을 다른 표기로 구분하고, 최소 데이터 조건을 넘지 못하면 "아직 데이터가 부족합니다(현재 n/필요 m)"만 표시합니다.

| 피드백 | 판단 기준(초안) | 최소 데이터 |
|---|---|---|
| 특정 요일 미완료가 잦음 | 요일별 완료율이 전체 평균보다 20%p 이상 낮음 | 최근 4주, 해당 요일 계획 8개 이상 |
| 특정 과목 미완료 누적 | 과목별 지난 미완료 수 증가 추세 | 2주 이상 |
| 예상보다 오래 걸림 | 실제/예상 ≥ 1.3인 완료 과제 비율이 높음 | 예상 시간 있는 완료 과제 5개 이상 |
| 과목 편중 | 한 과목이 주간 공부 시간의 50% 이상 | 주간 5시간 이상 |
| 다음 주 조정 제안 | 위 결과를 바탕으로 문장 제안 (예: "수학 과제 예상 시간을 1.4배로 잡아 보세요") | 위 조건 충족 시만 |

AI 모델은 쓰지 않고 규칙 기반으로 구현합니다.

---

## 5. 학교 시간표·일정
- 날짜 D의 수업 목록 = `timetableExceptions/D`가 있으면 그것, 없으면 D가 속한 학기 시간표의 해당 요일 slots.
- 예외 편집은 그날 기본 수업을 복사해서 시작하고, 이후 기본 시간표가 바뀌어도 예외 날짜는 영향 없음(지시서 §6-2). "기본으로 되돌리기" = 예외 문서 삭제.
- 메모는 있을 때만 과목명 아래 작은 글씨, 없으면 줄 자체를 렌더링하지 않음.
- 시간표 칸의 `label`은 자유 입력(창체·체육 등 공부 과목이 아닌 수업도 있음), `subjectId`를 연결하면 과목 색상 적용.

---

## 6. 주간 계획 화면 (WeekView)
- 열 = 요일 7개, 위쪽 띠 = 요일 지정 과제(시간 없음) + 그날 학교 일정, 아래 = 시간축 그리드(시간표 블록 + 시간 지정 과제 블록, 높이 = 시간 길이 ∝).
- 이동: PC는 드래그, 터치는 **길게 누르기(약 300ms) 후 드래그**, 그리고 블록 탭 → "날짜·시간 변경" 시트(드래그 없이도 이동 가능).
- 시간 지정 과제 블록 높이 = `estimateMin`(없으면 30분 기본 높이로 표시하되 통계에는 반영 안 함).
- 레이아웃: 휴대폰 = 하루/3일 단위 좌우 스와이프, 태블릿 = 7일, PC = 7일 + 오른쪽 미배치·지난 미완료 패널.

---

## 7. 오프라인·동기화
- Firestore 영구 캐시 + 다중 탭 관리자 → 오프라인에서 조회·생성·수정·완료·세션 저장 모두 가능, 재접속 시 자동 업로드.
- 충돌 정책: 필드 단위 merge 쓰기(마지막 쓰기 우선). 세션·반복 발생분은 결정적 ID라 중복 없음. 타이머는 §4-3.
- 화면 상단에 "오프라인 — 변경 사항은 연결되면 저장됩니다" 배너, 쓰기 대기 중 표시(`hasPendingWrites`).
- iOS Safari/홈 화면 PWA는 저장소가 분리되고 장기간 미사용 시 삭제될 수 있음 → 실제 기기 검증 항목에 포함(§9).

---

## 8. 보안 규칙 (골격)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{col}/{docId} {
        allow read, delete: if request.auth.uid == uid;
        allow create, update: if request.auth.uid == uid
          && request.resource.data.userId == uid;   // + 컬렉션별 필드 검증
      }
    }
  }
}
```
세션의 `durationSec ≥ 0`, `endAt ≥ startAt` 등은 규칙에서도 검증합니다. Firebase API 키는 비밀이 아니며, 접근 제어는 인증 + 규칙으로만 합니다. 설정값은 `VITE_FIREBASE_*` 환경 변수로 받고 `.env.example`과 설정 절차를 문서화합니다.

---

## 9. 폴더 구조 (예정)

```
modus/
├─ docs/DESIGN.md · docs/SETUP.md
├─ firestore.rules · firestore.indexes.json · firebase.json
├─ netlify.toml · .env.example
└─ src/
   ├─ domain/          순수 함수 (Firebase·React 의존 없음, 단위 테스트 대상)
   │   studyDate.ts · recurrence.ts · timer.ts · stats.ts · insights.ts · timetable.ts
   ├─ data/            Firestore 저장소 + 구독 훅 (useSubjects, useTasksForRange …)
   ├─ features/        home · subjects · subject-detail · plan · calendar
   │                   stats · records · settings · timer
   ├─ components/ui/   버튼·시트·체크박스·색상 칩 등 디자인 시스템
   └─ app/             라우팅 · 레이아웃(하단탭/사이드바) · 테마 · 인증 게이트
```
데이터 처리(domain/data)와 화면(features)을 분리해 §13-2를 지킵니다.

---

## 10. 확정된 결정 (2026-11-02)

1. **공부일 경계** — 새벽 4시 이전은 전날 공부일. `UserSettings.dayStartHour` 기본값 4, 설정에서 변경 가능.
2. **로그인** — 익명 인증으로 시작 → 설정에서 Google 계정 연결(`linkWithPopup`/`linkWithRedirect`), 예비로 이메일·비밀번호 연결 제공. 연결 시 uid가 유지되어 데이터 이전 불필요.
3. **배포·푸시** — GitHub 저장소 연결 Netlify 배포. 예약 알림은 Netlify Scheduled Function + FCM(HTTP v1)으로 발송. 서비스 계정 키는 Netlify 환경 변수에만 보관. 미지원 환경은 앱 내 알림으로 대체.
4. **세션 수정** — 기록 화면에서 세션의 시작·종료 시각 수정, 일시정지 구간 반영 재계산, 삭제 허용. 수정 시 `updatedAt` 갱신, 겹치는 세션이 생기면 저장 전 경고.

---

## 11. 위험 요소

| 위험 | 대응 |
|---|---|
| iOS 웹 푸시: 16.4 이상 + 홈 화면 설치 상태에서만 동작 | 권한·설치 여부 감지 후 안내, 미지원 시 앱 내 알림 |
| iOS PWA 저장소 분리·삭제 | 서버 동기화를 기본으로, 실제 기기 테스트 |
| 오프라인 두 기기 동시 타이머 | §4-3 겹침 잘라내기 + 에뮬레이터 시나리오 테스트 |
| 반복 규칙 수정과 이미 손댄 발생분 | §4-2 지연 실체화 |
| 시간대·자정 경계 | 모든 날짜 계산을 `domain/studyDate.ts` 한 곳에서, 경계 사례 단위 테스트 |
| Firestore 무료 한도 | 집계 저장 없이 기간 쿼리만 사용, 개인 사용 규모에서 여유 충분 |

---

## 12. 개발 순서 (지시서 §14와 동일, 단계별 보고)

| 단계 | 내용 | 완료 확인 |
|---|---|---|
| 1 | 설계(본 문서) | 사용자 승인 |
| 2 | 레이아웃·8개 화면 UI(데이터 없는 빈 상태 화면, 가짜 숫자 없음) | 휴대폰/태블릿/PC 스크린샷 |
| 3 | Firebase 연결·과목/과제/시간표/일정 CRUD | 에뮬레이터에서 저장→새로고침→복원 |
| 4 | 완료·하위 과제·수동 이월·반복·주간 편집·시간표 예외 | 도메인 단위 테스트 + 흐름 테스트 |
| 5 | 타이머 | 새로고침 복구·전환·일시정지·중복 방지·두 기기 충돌 테스트 |
| 6 | 통계·기록·피드백 | 고정 테스트 데이터로 수치 검증 |
| 7 | 오프라인·PWA·알림 | 오프라인 시나리오, 설치, 실제 기기 |
| 8 | 최종 검수 | §15 체크리스트 전 항목 |

**3단계 시작 전 필요한 것:** 새 Firebase 프로젝트를 만들어 웹 앱 설정값(`firebaseConfig`)을 전달해 주셔야 합니다. 생성 절차는 2단계 끝에 `docs/SETUP.md`로 드립니다. 그 전까지는 Firebase 에뮬레이터로 개발·테스트합니다(가짜 설정값을 만들어 쓰지 않음).
