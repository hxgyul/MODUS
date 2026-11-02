/** 충돌 가능성이 사실상 없는 클라이언트 생성 ID (오프라인에서도 사용) */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }
  return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 20);
}

/** 반복 과제 발생분의 결정적 ID — 같은 규칙·같은 날짜는 항상 같은 ID */
export function occurrenceId(ruleId: string, date: string): string {
  return `r_${ruleId}_${date.replace(/-/g, '')}`;
}
