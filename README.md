# MODUS

Plan your day. Track your progress.

학생이 계획한 공부를 실제로 실행하고, 기록하고, 그 기록으로 다음 계획을 고치도록 돕는 학습 관리 웹앱(PWA).

- 설계: [docs/DESIGN.md](docs/DESIGN.md)
- 설치·Firebase 연결·배포: [docs/SETUP.md](docs/SETUP.md)

```bash
npm install
npm run dev      # 개발 서버
npm test         # 도메인 로직 단위 테스트 (TZ=Asia/Seoul)
npm run build    # 타입 검사 + 빌드
# 사용 흐름 테스트: npm run build && npx vite preview --port 4173 후
# NODE_PATH=$(npm root -g) node tests/e2e.cjs ./shots
```
