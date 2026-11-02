/** 과목 색상 팔레트 — 라이트/다크 각각 대비를 맞춘 값. 앱 전체에서 키로만 참조한다. */
/**
 * 16색. 앞 8색은 순서가 고정된 검증 팔레트(색각 이상 대비·명도 대비 통과).
 * 새 과목은 이 순서대로 제안한다. 과목 이름이 항상 함께 표시되므로 9번째 과목부터 색이 겹쳐도 구분된다.
 */
export const SUBJECT_COLORS: Record<string, { name: string; light: string; dark: string }> = {
  blue: { name: '파랑', light: '#2a78d6', dark: '#3987e5' },
  orange: { name: '주황', light: '#eb6834', dark: '#d95926' },
  aqua: { name: '청록', light: '#1baf7a', dark: '#199e70' },
  yellow: { name: '노랑', light: '#eda100', dark: '#c98500' },
  magenta: { name: '분홍', light: '#e87ba4', dark: '#d55181' },
  green: { name: '초록', light: '#008300', dark: '#008300' },
  violet: { name: '보라', light: '#6250d6', dark: '#9085e9' },
  red: { name: '빨강', light: '#e34948', dark: '#e66767' },
  // 9번째부터: 과목 이름이 항상 함께 표시되므로 색만으로 구분할 필요는 없다
  sky: { name: '하늘', light: '#1797cf', dark: '#3fb0e3' },
  teal: { name: '청록 진하게', light: '#0f8580', dark: '#2fa9a3' },
  lime: { name: '연두', light: '#6f9a12', dark: '#93bd2c' },
  brown: { name: '갈색', light: '#94643a', dark: '#bb8a5c' },
  indigo: { name: '남색', light: '#3a4cb3', dark: '#7a88e6' },
  coral: { name: '살구', light: '#e0785a', dark: '#ec9479' },
  plum: { name: '자주', light: '#94369f', dark: '#c072cb' },
  slate: { name: '회청', light: '#5b6777', dark: '#909dad' },
};

export const COLOR_KEYS = Object.keys(SUBJECT_COLORS);

export function subjectColor(key: string | undefined, dark: boolean): string {
  const c = SUBJECT_COLORS[key ?? ''] ?? SUBJECT_COLORS.blue;
  return dark ? c.dark : c.light;
}

/** 아직 쓰지 않은 색을 먼저 제안 */
export function nextColor(used: string[]): string {
  return COLOR_KEYS.find((k) => !used.includes(k)) ?? COLOR_KEYS[used.length % COLOR_KEYS.length];
}
