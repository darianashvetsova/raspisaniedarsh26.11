export type LessonType = 'lecture' | 'practice' | 'lab' | 'exam' | 'credit';

export interface Homework {
  id: string;
  text: string;
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
  homework?: Homework | null;
  note?: string | null; // personal note for this specific lesson
  isWindow?: boolean; // "Окно" — free slot between lessons, no times
}

export interface AppState {
  groupName: string;
  lessons: Lesson[];
}
