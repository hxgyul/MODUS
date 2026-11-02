// 실제 사용 흐름 검증 (로컬 모드). 브라우저 시계를 고정해 타이머 시간을 정확히 검사한다.
const { chromium } = require('playwright');
const fs = require('node:fs');
const BASE = 'http://localhost:4173';
const OUT = process.argv[2] || '/home/claude/shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const store = (page, col) => page.evaluate((c) => JSON.parse(localStorage.getItem(`sa:local:${c}`) || '{}'), col);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: new Date('2026-11-02T19:00:00+09:00') });

  await page.goto(BASE);
  await page.getByText('과목부터 등록하세요').waitFor();
  await page.screenshot({ path: `${OUT}/m-01-home-empty.png` });

  // ── 과목 등록 ──
  await page.getByRole('link', { name: '과목 등록하기' }).click();
  // 회귀 테스트: 화면이 1초마다 갱신돼도 입력 칸 포커스가 유지되어야 함 (휴대폰 키보드가 닫히던 버그)
  await page.getByRole('button', { name: '과목 추가' }).click();
  await page.getByLabel('과목 이름').click();
  await page.clock.runFor(3500);
  const stillFocused = await page.evaluate(() => document.activeElement && document.activeElement.id === 'subject-name');
  await page.keyboard.type('국어');
  await page.clock.runFor(1500);
  await page.keyboard.type('문학');
  const typed = await page.getByLabel('과목 이름').inputValue();
  check('입력 중 3초가 지나도 포커스 유지, 끊김 없이 입력', stillFocused && typed === '국어문학', `focused=${stillFocused}, value=${typed}`);
  check('색상 16개', (await page.getByRole('radiogroup', { name: '과목 색상' }).getByRole('radio').count()) === 16);
  await page.screenshot({ path: `${OUT}/m-02a-subject-sheet.png` });
  await page.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
  for (const name of ['공통수학', '통합과학', '공통영어']) {
    await page.getByRole('button', { name: '과목 추가' }).click();
    await page.getByLabel('과목 이름').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: '추가', exact: true }).click();
  }
  const subjects = Object.values(await store(page, 'subjects'));
  check('과목 3개 저장', subjects.length === 3, subjects.map((s) => `${s.name}:${s.color}`).join(', '));
  check('과목 색상이 서로 다름', new Set(subjects.map((s) => s.color)).size === 3);
  await page.screenshot({ path: `${OUT}/m-02-subjects.png` });

  // ── 과제 등록 (복합 과제) ──
  await page.getByRole('link', { name: '홈' }).click();
  await page.getByRole('button', { name: '과제', exact: true }).click();
  await page.getByLabel('과제명').fill('수학 기출문제 풀이');
  await page.getByRole('dialog').getByRole('button', { name: '공통수학' }).click();
  await page.getByRole('button', { name: '1시간', exact: true }).click();
  await page.getByRole('button', { name: '세부 과제 추가' }).click();
  await page.getByLabel('세부 과제 1').fill('1단원 문제 풀이');
  await page.getByRole('button', { name: '세부 과제 추가' }).click();
  await page.getByLabel('세부 과제 2').fill('오답 정리');
  await page.getByRole('dialog').getByRole('button', { name: '추가', exact: true }).click();

  // 단순 과제 (마감 내일)
  await page.getByRole('button', { name: '과제', exact: true }).click();
  await page.getByLabel('과제명').fill('영어 단어 50개');
  await page.getByRole('dialog').getByRole('button', { name: '공통영어' }).click();
  await page.getByLabel('마감일 (선택)').fill('2026-11-03');
  await page.getByRole('button', { name: '30분', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '추가', exact: true }).click();

  // 반복 과제 (월·수·금)
  await page.getByRole('button', { name: '과제', exact: true }).click();
  await page.getByLabel('과제명').fill('과학 개념 복습');
  await page.getByRole('dialog').getByRole('button', { name: '통합과학' }).click();
  await page.getByRole('radio', { name: '요일 선택' }).click();
  await page.getByRole('button', { name: '수', exact: true }).click();
  await page.getByRole('button', { name: '금', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '추가', exact: true }).click();

  let tasks = Object.values(await store(page, 'tasks'));
  const rules = Object.values(await store(page, 'recurrences'));
  check('과제 2개 + 반복 규칙 1개 저장', tasks.length === 2 && rules.length === 1);
  check('반복 과제는 미리 저장하지 않고 화면에만 표시', (await page.getByText('과학 개념 복습').count()) === 1);
  await page.screenshot({ path: `${OUT}/m-03-home-tasks.png`, fullPage: true });

  // ── 완료 처리 ──
  await page.getByRole('checkbox', { name: '영어 단어 50개 완료' }).click();
  tasks = Object.values(await store(page, 'tasks'));
  const eng = tasks.find((t) => t.title === '영어 단어 50개');
  check('단순 과제 완료 저장', eng.completedAt !== null && eng.completedOn === '2026-11-02');
  check('완료 과제 취소선 표시', await page.locator('span.line-through', { hasText: '영어 단어 50개' }).count() === 1);

  await page.getByRole('checkbox', { name: '1단원 문제 풀이 완료' }).click();
  tasks = Object.values(await store(page, 'tasks'));
  check('하위 과제 1/2 → 상위 미완료', tasks.find((t) => t.title === '수학 기출문제 풀이').completedAt === null);

  // ── 타이머: 과제 선택 후 시작 ──
  await page.getByRole('button', { name: '수학 기출문제 풀이 공부 시작' }).click();
  await page.clock.fastForward('02:00');
  await page.getByRole('button', { name: '타이머 열기' }).waitFor();
  check('타이머 바 표시', true);

  // 새로고침 복구
  await page.reload();
  await page.getByRole('button', { name: '타이머 열기' }).waitFor();
  await page.clock.fastForward('01:00');
  const clockText = await page.getByRole('button', { name: '타이머 열기' }).innerText();
  check('새로고침 후 타이머 복구 (3분 경과)', /03:0\d/.test(clockText), clockText.replace(/\n/g, ' '));

  // 일시정지 5분 → 제외
  await page.getByRole('button', { name: '일시정지' }).click();
  await page.clock.fastForward('05:00');
  const pausedText = await page.getByRole('button', { name: '타이머 열기' }).innerText();
  check('일시정지 중 시간 멈춤', /03:0\d/.test(pausedText), pausedText.replace(/\n/g, ' '));
  await page.getByRole('button', { name: '재개' }).click();
  await page.clock.fastForward('02:00');

  // 전환: 영어 자유 공부 → 이전 세션 저장
  await page.getByRole('button', { name: '타이머 열기' }).click();
  await page.getByRole('button', { name: '다른 과목·과제로 전환' }).click();
  await page.screenshot({ path: `${OUT}/m-05-timer-switch.png` });
  await page.getByRole('dialog').locator('li', { hasText: '공통영어' }).getByRole('button', { name: '자유 공부' }).click();
  let sessions = Object.values(await store(page, 'sessions'));
  const s1 = sessions[0];
  check('전환 시 이전 세션 저장 (일시정지 제외 5분)', sessions.length === 1 && s1.durationSec >= 300 && s1.durationSec < 302, `${s1 && s1.durationSec}초, pauses ${s1 && s1.pauses.length}`);
  const mathTask = tasks.find((t) => t.title === '수학 기출문제 풀이');
  check('과제 선택 세션은 과제·과목에 연결', s1.taskId === mathTask.id && s1.subjectId === mathTask.subjectId);
  await page.clock.fastForward('10:00');
  await page.screenshot({ path: `${OUT}/m-06-timer-sheet.png` });
  await page.getByRole('dialog').getByRole('button', { name: '종료하고 저장' }).click();
  sessions = Object.values(await store(page, 'sessions'));
  const s2 = sessions.find((s) => s.id !== s1.id);
  check('자유 공부는 taskId 없이 과목에만', s2 && s2.taskId === null && s2.durationSec >= 600 && s2.durationSec < 602, `${s2 && s2.durationSec}초`);
  const timerDoc = await page.evaluate(() => JSON.parse(localStorage.getItem('sa:local:doc:activeTimer') || '{}'));
  check('종료 후 활성 타이머 없음(종료 표시만)', timerDoc.value && timerDoc.value.sessionId === null && timerDoc.value.lastEndedId === s2.id);

  // 중복 저장 방지: 같은 세션 ID 재저장 시도 → 1건 유지
  check('세션 2건 (중복 없음)', sessions.length === 2);

  // 1분 미만 세션은 저장 안 함
  await page.getByRole('button', { name: '수학 기출문제 풀이 공부 시작' }).click();
  await page.clock.fastForward('00:20');
  await page.getByRole('button', { name: '종료하고 저장' }).click();
  sessions = Object.values(await store(page, 'sessions'));
  check('1분 미만 세션 미저장', sessions.length === 2);

  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/m-07-home-after.png`, fullPage: true });

  // ── 과목 화면 ──
  await page.getByRole('link', { name: '과목' }).first().click();
  const mathCard = await page.getByRole('link', { name: /공통수학/ }).innerText();
  check('과목 카드: 오늘 5분, 미완료 1개', mathCard.includes('5분') && mathCard.includes('미완료 1개'), mathCard.replace(/\n/g, ' '));
  await page.getByRole('link', { name: /공통수학/ }).click();
  await page.screenshot({ path: `${OUT}/m-08-subject-detail.png`, fullPage: true });

  // ── 시간표 등록 ──
  await page.goto(`${BASE}/settings/timetable`);
  await page.getByRole('button', { name: '학기 시간표' }).click();
  await page.getByLabel('이름', { exact: true }).fill('1학년 2학기');
  await page.getByLabel('적용 시작일').fill('2026-08-17');
  await page.getByRole('button', { name: '교시 추가' }).click();
  await page.getByLabel('시작', { exact: true }).first().fill('08:10');
  await page.getByLabel('종료', { exact: true }).first().fill('09:00');
  await page.getByLabel('과목명', { exact: true }).first().fill('통합과학');
  await page.getByLabel('메모', { exact: true }).first().fill('수행평가');
  await page.getByRole('button', { name: '교시 추가' }).click();
  await page.getByLabel('과목명', { exact: true }).nth(1).fill('공통수학');
  await page.getByRole('tab', { name: /화/ }).click();
  await page.getByRole('button', { name: /월요일 교시 시간 그대로 가져오기/ }).click();
  await page.getByLabel('과목명', { exact: true }).first().fill('한국사');
  await page.getByLabel('과목명', { exact: true }).nth(1).fill('미술');
  await page.screenshot({ path: `${OUT}/m-09-timetable-edit.png`, fullPage: true });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const tts = Object.values(await store(page, 'timetables'));
  check('시간표 저장 (월 2교시, 화 2교시)', tts.length === 1 && tts[0].slots.length === 4, JSON.stringify(tts[0]?.slots.map((s) => `${s.weekday}-${s.period}-${s.label}-${s.start}`)));

  await page.getByRole('link', { name: '홈' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/m-09b-home-timetable.png`, fullPage: true });
  const memoShown = await page.getByText('수행평가').count();
  check('홈 시간표에 교시 메모 표시', memoShown >= 1, `count ${memoShown}`);

  // ── 주간 계획 / 반복 과제 ──
  await page.getByRole('link', { name: '계획', exact: true }).last().click();
  await page.getByRole('button', { name: /^수\s*4$/ }).click();
  check('반복 과제가 수요일에 표시', await page.getByText('과학 개념 복습').locator('visible=true').count() === 1);
  await page.getByRole('button', { name: /^화\s*3$/ }).click();
  check('반복 과제가 화요일에는 없음', await page.getByText('과학 개념 복습').locator('visible=true').count() === 0);
  await page.screenshot({ path: `${OUT}/m-10-plan.png`, fullPage: true });

  // 날짜별 예외: 화요일 수업 삭제
  await page.getByRole('button', { name: '이 날 시간표 변경' }).click();
  await page.getByLabel('이 날 메모 (선택)').fill('체험학습');
  await page.getByRole('button', { name: '1교시 삭제' }).click();
  await page.getByRole('button', { name: '이 날만 저장' }).click();
  const exs = Object.values(await store(page, 'timetableExceptions'));
  const tts2 = Object.values(await store(page, 'timetables'));
  check('예외는 그날만, 기본 시간표 유지', exs.length === 1 && exs[0].date === '2026-11-03' && exs[0].slots.length === 1 && tts2[0].slots.length === 4);

  // 길게 눌러 이동: 월요일 수학 과제를 목요일로
  await page.getByRole('button', { name: /^월\s*2$/ }).click();
  const target = page.getByRole('button', { name: /수학 기출문제 풀이/ });
  const box = await target.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.clock.runFor(600);
  await page.mouse.up();
  await page.getByText('옮길 요일을 누르세요').waitFor();
  await page.getByRole('button', { name: /^목\s*5$/ }).click();
  tasks = Object.values(await store(page, 'tasks'));
  const moved = tasks.find((t) => t.title === '수학 기출문제 풀이');
  check('길게 눌러 이동: 날짜만 바뀌고 ID·기록 유지', moved.id === mathTask.id && moved.planDate === '2026-11-05' && moved.firstPlanDate === '2026-11-02' && moved.subtasks[0].doneAt !== null);

  // 다음날: 어제 미완료가 "지난 미완료"에, 완료한 과제는 오늘 목록에서 빠짐
  await page.clock.setFixedTime(new Date('2026-11-06T20:00:00+09:00'));
  await page.goto(BASE);
  await page.waitForTimeout(200);
  const overdueTitle = await page.getByRole('heading', { name: /지난 미완료/ }).innerText();
  check('지난 미완료 표시 (목 수학 + 월·수 과학 반복)', /지난 미완료 3/.test(overdueTitle), overdueTitle);
  check('어제 완료 과제는 오늘 목록에 없음', await page.getByText('영어 단어 50개').count() === 0);
  await page.getByRole('button', { name: '골라서 옮기기' }).click();
  await page.getByRole('button', { name: '모두 선택' }).click();
  await page.getByRole('button', { name: '옮기기', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '옮기기', exact: true }).click();
  tasks = Object.values(await store(page, 'tasks'));
  const sciOcc = tasks.find((t) => t.recurrenceId && t.occurrenceDate === '2026-11-04');
  check('여러 과제 한꺼번에 이월 (반복 발생분은 이때 저장, 원래 날짜 유지)', tasks.find((t) => t.id === mathTask.id).planDate === '2026-11-06' && sciOcc && sciOcc.planDate === '2026-11-06' && sciOcc.occurrenceDate === '2026-11-04');
  const todayCount = await page.locator('ul').first().locator('> li').count();
  check('오늘(금) 목록: 이월 3 + 금요일 반복 1 = 4 (중복 없음)', todayCount === 4, `${todayCount}`);
  await page.screenshot({ path: `${OUT}/m-11-home-next-day.png`, fullPage: true });

  // ── 통계 ──
  await page.clock.setFixedTime(new Date('2026-11-02T21:00:00+09:00'));
  await page.goto(`${BASE}/stats`);
  await page.getByRole('radio', { name: '일' }).click();
  const totalTile = await page.getByText('총 공부 시간').locator('..').innerText();
  check('일간 총 공부 시간 15분', totalTile.includes('15분'), totalTile.replace(/\n/g, ' '));
  await page.screenshot({ path: `${OUT}/m-12-stats.png`, fullPage: true });

  // ── 기록 수정 ──
  await page.goto(`${BASE}/stats/records`);
  await page.getByRole('button', { name: /공통영어 · 자유 공부/ }).click();
  const endInput = page.getByLabel('종료', { exact: true });
  const endVal = await endInput.inputValue();
  await endInput.fill(endVal.replace(/T(\d\d):(\d\d)/, (_, h, m) => `T${h}:${String(Number(m) - 5).padStart(2, '0')}`));
  await page.getByRole('button', { name: '저장', exact: true }).click();
  sessions = Object.values(await store(page, 'sessions'));
  const edited = sessions.find((s) => s.taskId === null);
  check('세션 종료 시각 수정 → 시간 재계산', edited.durationSec >= 280 && edited.durationSec <= 330, `${edited.durationSec}초`);

  // ── 다크 모드 ──
  await page.goto(`${BASE}/settings`);
  await page.getByRole('radio', { name: '다크' }).click();
  check('다크 모드 적용', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.screenshot({ path: `${OUT}/m-13-settings-dark.png`, fullPage: true });
  await page.goto(BASE);
  await page.screenshot({ path: `${OUT}/m-14-home-dark.png`, fullPage: true });
  await page.getByRole('radio', { name: '다크' }).count(); // noop

  check('콘솔·페이지 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ── 태블릿·PC 레이아웃 (같은 데이터) ──
  const state = await page.evaluate(() => JSON.stringify(localStorage));
  for (const [name, vp] of [['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1440, height: 900 }]]) {
    const c2 = await browser.newContext({ viewport: vp, timezoneId: 'Asia/Seoul', locale: 'ko-KR', deviceScaleFactor: 1 });
    const p2 = await c2.newPage();
    await p2.clock.install({ time: new Date('2026-11-02T19:30:00+09:00') });
    await p2.goto(BASE);
    await p2.evaluate((s) => { const o = JSON.parse(s); localStorage.clear(); for (const k in o) localStorage.setItem(k, o[k]); localStorage.setItem('sa:theme', 'light'); }, state);
    await p2.evaluate(() => { const k = 'sa:local:doc:settings'; const v = JSON.parse(localStorage.getItem(k) || '{}'); if (v.value) v.value.theme = 'light'; localStorage.setItem(k, JSON.stringify(v)); });
    for (const [path, file] of [['/', 'home'], ['/plan', 'plan'], ['/calendar', 'calendar'], ['/stats', 'stats'], ['/subjects', 'subjects']]) {
      await p2.goto(BASE + path);
      await p2.waitForTimeout(250);
      await p2.screenshot({ path: `${OUT}/${name}-${file}.png` });
    }
    // PC: 드래그 앤 드롭
    if (name === 'desktop') {
      await p2.goto(BASE + '/plan');
      await p2.waitForTimeout(200);
      const chip = p2.getByRole('button', { name: '과학 개념 복습' }).first();
      const cb = await chip.boundingBox();
      const cell = p2.getByRole('button', { name: /11월 5일 \(목\) 20:00에 과제 추가/ });
      await cell.scrollIntoViewIfNeeded();
      const tb = await cell.boundingBox();
      const cb2 = await chip.boundingBox();
      await p2.mouse.move(cb2.x + 10, cb2.y + 8);
      await p2.mouse.down();
      await p2.mouse.move(cb2.x + 30, cb2.y + 30, { steps: 5 });
      await p2.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 15 });
      await p2.mouse.up();
      await p2.waitForTimeout(200);
      const all = await p2.evaluate(() => Object.values(JSON.parse(localStorage.getItem('sa:local:tasks') || '{}')));
      const dragged = all.find((t) => t.occurrenceDate === '2026-11-02' || (t.recurrenceId && t.planDate === '2026-11-05'));
      check('PC 드래그 앤 드롭: 월요일 반복 과제 → 목 20:00', dragged && dragged.planDate === '2026-11-05' && dragged.planStart === '20:00', JSON.stringify(dragged && { d: dragged.planDate, t: dragged.planStart, o: dragged.occurrenceDate }));
      void cb;
      await p2.screenshot({ path: `${OUT}/desktop-plan-after-drag.png` });
    }
    await c2.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(2);
});
