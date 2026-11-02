/** 'yyyy-MM-dd' — 공부일 기준 날짜 (dayStartHour 이전 시각은 전날) */
export type ISODate = string;
/** 'HH:mm' 24시간제 */
export type HHmm = string;
/** epoch milliseconds */
export type Millis = number;

export interface Owned {
  id: string;
  userId: string;
  createdAt: Millis;
  updatedAt: Millis;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface NotifRule {
  enabled: boolean;
  /** 마감일: 며칠 전 / 공부 시작: 몇 분 전 / 미완료: 몇 시에 */
  offset: number;
}

export interface UserSettings {
  theme: ThemeMode;
  dayStartHour: number;
  weekStartsOn: 0 | 1;
  notifications: {
    deadline: NotifRule;
    studyStart: NotifRule;
    overdue: NotifRule;
  };
  updatedAt: Millis;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  dayStartHour: 4,
  weekStartsOn: 1,
  notifications: {
    deadline: { enabled: false, offset: 1 },
    studyStart: { enabled: false, offset: 10 },
    overdue: { enabled: false, offset: 21 },
  },
  updatedAt: 0,
};

export interface Subject extends Owned {
  name: string;
  /** SUBJECT_COLORS 키 */
  color: string;
  order: number;
  archived: boolean;
}

export interface Subtask {
  id: string;
  title: string;
  doneAt: Millis | null;
}

export type TaskStatus = 'active' | 'skipped' | 'archived';

export interface Task extends Owned {
  subjectId: string;
  title: string;
  planDate: ISODate | null;
  planStart: HHmm | null;
  estimateMin: number | null;
  dueDate: ISODate | null;
  subtasks: Subtask[];
  completedAt: Millis | null;
  completedOn: ISODate | null;
  status: TaskStatus;
  firstPlanDate: ISODate | null;
  recurrenceId: string | null;
  occurrenceDate: ISODate | null;
}

export type RecurrenceFreq = 'daily' | 'weekly' | 'weekdays';

export interface RecurrenceTemplate {
  subjectId: string;
  title: string;
  planStart: HHmm | null;
  estimateMin: number | null;
  subtasks: { id: string; title: string }[];
}

export interface RecurrenceRule extends Owned {
  /**
   * 같은 반복 묶음의 버전들이 공유하는 ID.
   * 규칙을 수정하면 기존 규칙을 어제로 끝내고 같은 seriesId로 새 규칙을 만든다 →
   * 과거 발생분은 그대로, 발생분 ID(seriesId+날짜)도 그대로라 중복이 생기지 않는다.
   */
  seriesId: string;
  template: RecurrenceTemplate;
  freq: RecurrenceFreq;
  /** 0=일 … 6=토. freq='weekdays'일 때 사용 */
  weekdays: number[];
  startDate: ISODate;
  endDate: ISODate | null;
}

export interface PauseSpan {
  start: Millis;
  end: Millis;
}

export interface StudySession extends Owned {
  subjectId: string;
  taskId: string | null;
  startAt: Millis;
  endAt: Millis;
  pauses: PauseSpan[];
  durationSec: number;
  studyDate: ISODate;
  deviceId: string;
}

export interface ActiveTimer {
  sessionId: string;
  subjectId: string;
  taskId: string | null;
  startAt: Millis;
  pauses: PauseSpan[];
  pausedAt: Millis | null;
  deviceId: string;
  updatedAt: Millis;
}

/**
 * state/activeTimer 문서. 타이머를 끝내도 문서를 지우지 않고 "종료 표시"를 남긴다 →
 * 다른 기기가 "내 세션이 다른 곳에서 종료됐다"는 사실을 확실히 알 수 있다.
 */
export type TimerDoc =
  | ActiveTimer
  | { sessionId: null; lastEndedId: string; lastStartAt: Millis; updatedAt: Millis };

export interface TimetableSlot {
  id: string;
  /** 0=일 … 6=토 */
  weekday: number;
  period: number;
  label: string;
  subjectId: string | null;
  start: HHmm;
  end: HHmm;
  memo: string;
}

export interface Timetable extends Owned {
  name: string;
  validFrom: ISODate;
  validTo: ISODate | null;
  slots: TimetableSlot[];
}

export interface TimetableException extends Owned {
  /** 문서 ID와 동일 */
  date: ISODate;
  slots: TimetableSlot[];
  note: string;
}

export type EventKind = 'midterm' | 'final' | 'mock' | 'performance' | 'event' | 'other';

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  midterm: '중간고사',
  final: '기말고사',
  mock: '모의고사',
  performance: '수행평가',
  event: '학교 행사',
  other: '기타',
};

export interface SchoolEvent extends Owned {
  title: string;
  date: ISODate;
  endDate: ISODate | null;
  startTime: HHmm | null;
  endTime: HHmm | null;
  kind: EventKind;
  memo: string;
}
