import type { AppState, Lesson } from '@/types';

const KEY = 'student-schedule-v1';

const defaultState: AppState = {
  groupName: '270304-ПЭТСо-26/1',
  lessons: [],
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      groupName: parsed.groupName ?? defaultState.groupName,
      lessons: parsed.lessons ?? [],
    };
  } catch {
    return { ...defaultState };
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function replaceLessons(
  state: AppState,
  lessons: Lesson[]
): AppState {
  const next = { ...state, lessons };
  saveState(next);
  return next;
}
