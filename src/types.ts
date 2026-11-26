export type LessonType = 'lecture' | 'practice' | 'lab' | 'exam' | 'credit';

export interface HomeworkAttachment {
  name: string;
  dataUrl: string;
}

export interface Homework {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  attachments?: HomeworkAttachment[];
}

// homework saved with no matching future lesson; tied to the calendar week
// it was created in and shown in the "ДЗ без даты" block
export interface UndatedHomework {
  id: string;
  weekKey: string; // Monday of the creation week, YYYY-MM-DD
  subject: string;
  type: LessonType | ''; // '' = "любой тип"
  text: string;
  attachments: HomeworkAttachment[];
  done: boolean;
  createdAt: number;
}

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  number: number; // 1..N
  subject: string;
  subgroup?: string; // e.g. "п/г 1"
  type: LessonType;
  teacher: string;
  room: string;
  homework?: Homework[];
  note?: string | null; // personal note for this specific lesson
  isWindow?: boolean; // "Окно" — free slot between lessons, no times
}

export interface AppState {
  groupName: string;
  lessons: Lesson[];
  undatedHomework: UndatedHomework[];
}
