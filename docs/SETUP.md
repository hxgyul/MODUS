# 설치·연결 안내

## 1. 지금 바로 써 보기 (로컬 모드)

Firebase 설정 없이도 앱은 **로컬 모드**로 작동합니다. 데이터는 그 브라우저에만 저장되고 기기 간 동기화는 되지 않습니다.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 도메인 로직 단위 테스트
npm run build      # dist/ 생성
```

## 2. 새 Firebase 프로젝트 만들기

1. https://console.firebase.google.com → **프로젝트 추가** (Google 애널리틱스는 꺼도 됨)
2. **Build → Authentication → 시작하기 → 로그인 방법**에서 세 가지를 켭니다.
   - 익명 (Anonymous)
   - Google
   - 이메일/비밀번호
3. **Authentication → 설정 → 승인된 도메인**에 Netlify 주소(예: `내사이트.netlify.app`)를 추가합니다.
4. **Build → Firestore Database → 데이터베이스 만들기**
   - 위치: `asia-northeast3 (서울)`
   - **프로덕션 모드**로 시작 (규칙은 아래에서 배포)
5. **프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹 앱 추가(`</>`)** → 앱 이름 입력 → 표시되는 `firebaseConfig` 값을 복사합니다.

## 3. 설정값 넣기

`.env.example`을 `.env`로 복사하고 위에서 복사한 값을 채웁니다.

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

이 값들은 비밀번호가 아니라 "어느 프로젝트인지"를 알려 주는 주소입니다. 실제 접근 제어는 로그인과 `firestore.rules`가 합니다. 그래도 `.env`는 저장소에 올리지 않습니다(`.gitignore`에 포함). Netlify에는 아래 4번처럼 환경 변수로 넣습니다.

## 4. 보안 규칙 배포

```bash
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project <프로젝트ID>
```

## 5. Netlify 배포 (GitHub 연결)

1. 이 폴더를 GitHub 저장소로 올립니다.
2. Netlify → **Add new site → Import an existing project → GitHub** → 저장소 선택
3. 빌드 설정은 `netlify.toml`에 있으므로 그대로 둡니다 (`npm run build`, 게시 폴더 `dist`).
4. **Site configuration → Environment variables**에 3번의 `VITE_FIREBASE_*` 값을 모두 추가합니다.
5. 배포 후 사이트 주소를 Firebase **승인된 도메인**에 추가했는지 확인합니다.

## 5-1. 홈 화면 앱(iPhone/iPad)에서 Google 로그인이 되게 하기

iOS 사파리와 홈 화면 앱은 다른 도메인(`firebaseapp.com`)의 저장소를 막아서, 기본 설정으로는 홈 화면 앱의 Google 로그인이 끝나지 않습니다. 로그인 창을 우리 주소에서 열도록 바꿉니다.

1. 빌드할 때 `dist/_redirects`가 자동으로 만들어져 `/__/auth/*`, `/__/firebase/*` 요청을 `https://<프로젝트ID>.firebaseapp.com`으로 전달합니다. (vite.config.ts의 firebaseAuthProxy, 프로젝트 ID는 `VITE_FIREBASE_PROJECT_ID`에서 읽음)
2. Netlify 환경 변수 `VITE_FIREBASE_AUTH_DOMAIN` 값을 **사이트 주소**로 바꿉니다: `modus-study.netlify.app`
3. https://console.cloud.google.com/apis/credentials (Firebase와 같은 프로젝트 선택) → OAuth 2.0 클라이언트 ID의 **Web client (auto created by Google Service)** →
   - 승인된 JavaScript 원본: `https://modus-study.netlify.app`
   - 승인된 리디렉션 URI: `https://modus-study.netlify.app/__/auth/handler`
4. 다시 배포한 뒤, 휴대폰에서 기존 홈 화면 아이콘을 지우고 사파리에서 다시 "홈 화면에 추가"합니다.

홈 화면 앱은 사파리와 저장 공간이 따로라서, 사파리에서 로그인했어도 홈 화면 앱 안에서 한 번 더 로그인해야 합니다.

## 5-2. Powered by Netlify 배지 끄기

Netlify → Project configuration → General → **Powered by Netlify badge** → 끄기

## 6. 휴대폰·태블릿에서

1. 사이트를 열고 **설정 → 계정과 동기화 → Google 계정 연결**(또는 이메일)
2. 다른 기기에서는 **설정 → 이미 계정이 있어요**로 같은 계정에 로그인
3. 홈 화면에 추가
   - iPhone/iPad (Safari): 공유 → 홈 화면에 추가
   - Android (Chrome): 메뉴 → 앱 설치

## 아직 구현하지 않은 항목

- 푸시 알림(7단계): Netlify 예약 함수 + FCM. 필요한 추가 설정(VAPID 키, 서비스 계정)은 그 단계에서 안내합니다.
