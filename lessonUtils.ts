import type { Lesson, LessonType } from '@/types';

const TYPE_PREFIXES: { type: LessonType; prefixes: string[] }[] = [
  { type: 'lecture', prefixes: ['лек', 'лекц', 'lection', 'лк'] },
  { type: 'lab', prefixes: ['лаб', 'лабор', 'lab'] },
  { type: 'exam', prefixes: ['экз', 'экзамен', 'exam'] },
  { type: 'credit', prefixes: ['зач', 'зачёт', 'зачет', 'credit'] },
  { type: 'practice', prefixes: ['пр', 'прак', 'сем', 'practice', 'семин'] },
];

const TYPE_LABELS: Record<LessonType, string> = {
  lecture: 'Лекция',
  practice: 'Практика',
  lab: 'Лабораторная',
  exam: 'Экзамен',
  credit: 'Зачёт',
};

export function detectLessonType(raw: string): LessonType {
  const lower = raw.toLowerCase().trim();
  for (const { type, prefixes } of TYPE_PREFIXES) {
    if (prefixes.some((p) => lower.startsWith(p) || lower.includes(`(${p}`) || lower.includes(`${p}.`))) {
      return type;
    }
  }
  return 'practice';
}

export function typeLabel(t: LessonType): string {
  return TYPE_LABELS[t];
}

export function typeColor(t: LessonType): string {
  switch (t) {
    case 'lecture':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'lab':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'practice':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'exam':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'credit':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  }
}

export function uniqueSubjects(lessons: Lesson[]): string[] {
  const set = new Set<string>();
  for (const l of lessons) set.add(l.subject);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
}

// Find nearest future lesson for a given subject (date strictly > today),
// optionally filtered by lesson type.
export function findNextLesson(
  lessons: Lesson[],
  subject: string,
  today: string,
  type?: LessonType
): Lesson | null {
  const matches = lessons
    .filter(
      (l) =>
        l.subject === subject &&
        l.date > today &&
        !l.isWindow &&
        (type ? l.type === type : true)
    )
    .sort((a, b) =>
      a.date === b.date
        ? a.startTime.localeCompare(b.startTime)
        : a.date.localeCompare(b.date)
    );
  return matches[0] ?? null;
}
