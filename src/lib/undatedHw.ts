import type { Lesson, UndatedHomework } from '@/types';
import { findNextLesson } from './lessonUtils';
import { fromDateKey, startOfWeek, toDateKey } from './dates';
import { uid } from './storage';

export interface ReconcileResult {
  lessons: Lesson[];
  undatedHomework: UndatedHomework[];
  moved: number; // attached to a real lesson and removed from "ДЗ без даты"
  carried: number; // week rolled over to the current week
  movedHomework: { lessonId: string; hw: import('@/types').Homework }[];
  deletedUndatedIds: string[];
  carriedUndated: { id: string; weekKey: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Background maintenance for undated homework:
// - unfinished entries whose creation is at least 24h old (or right after a
//   schedule sync, force=true) are attached to the first matching future
//   lesson (same subject, same type if fixed, date strictly after creation)
//   and removed from the undated list;
// - unfinished entries stuck on a past calendar week move to the current week.
export function reconcileUndatedHomework(
  input: { lessons: Lesson[]; undatedHomework: UndatedHomework[] },
  force: boolean,
  now: number = Date.now()
): ReconcileResult {
  const lessons = [...input.lessons];
  const currentWeekStart = startOfWeek(new Date(now)).getTime();
  const currentWeekKey = toDateKey(new Date(currentWeekStart));
  const remaining: UndatedHomework[] = [];
  let moved = 0;
  let carried = 0;
  const movedHomework: { lessonId: string; hw: import('@/types').Homework }[] = [];
  const deletedUndatedIds: string[] = [];
  const carriedUndated: { id: string; weekKey: string }[] = [];

  for (const u of input.undatedHomework) {
    const createdKey = toDateKey(new Date(u.createdAt));
    const due = force || now - u.createdAt >= DAY_MS;

    let matched = false;
    if (!u.done && due) {
      const candidates = lessons
        .filter(
          (l) =>
            l.subject === u.subject &&
            !l.isWindow &&
            l.date > createdKey &&
            (!u.type || l.type === u.type)
        )
        .sort((a, b) =>
          a.date === b.date
            ? a.startTime.localeCompare(b.startTime)
            : a.date.localeCompare(b.date)
        );
      const target = candidates.find((l) => !l.homework || l.homework.length === 0) ?? candidates[0];
      if (target) {
        target.homework = [
          ...(target.homework ?? []),
          {
            id: uid(),
            text: u.text,
            done: false,
            createdAt: u.createdAt,
            attachments: u.attachments,
          },
        ];
        const newHw = target.homework[target.homework.length - 1];
        movedHomework.push({ lessonId: target.id, hw: newHw });
        deletedUndatedIds.push(u.id);
        moved++;
        matched = true;
      }
    }
    if (matched) continue;

    if (
      !u.done &&
      u.weekKey !== currentWeekKey &&
      startOfWeek(fromDateKey(u.weekKey)).getTime() < currentWeekStart
    ) {
      remaining.push({ ...u, weekKey: currentWeekKey });
      carriedUndated.push({ id: u.id, weekKey: currentWeekKey });
      carried++;
      continue;
    }
    remaining.push(u);
  }

  return {
    lessons,
    undatedHomework: remaining,
    moved,
    carried,
    movedHomework,
    deletedUndatedIds,
    carriedUndated,
  };
}
