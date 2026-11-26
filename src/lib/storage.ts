import { supabase } from './supabase';
import type {
  AppState,
  Homework,
  HomeworkAttachment,
  Lesson,
  LessonType,
  UndatedHomework,
} from '@/types';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ── Row shapes from Supabase ────────────────────────────────────────────────
interface LessonRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  number: number;
  subject: string;
  subgroup: string | null;
  type: string;
  teacher: string;
  room: string;
  note: string | null;
  is_window: boolean;
  created_at: string;
}

interface HomeworkRow {
  id: string;
  lesson_id: string;
  text: string;
  done: boolean;
  created_at: string;
  attachments: HomeworkAttachment[];
}

interface UndatedRow {
  id: string;
  week_key: string;
  subject: string;
  type: string;
  text: string;
  done: boolean;
  created_at: string;
  attachments: HomeworkAttachment[];
}

interface SettingsRow {
  group_name: string;
}

// ── Conversions ─────────────────────────────────────────────────────────────
function rowToLesson(
  row: LessonRow,
  homeworkByLesson: Map<string, Homework[]>
): Lesson {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    number: row.number,
    subject: row.subject,
    subgroup: row.subgroup ?? undefined,
    type: row.type as LessonType,
    teacher: row.teacher,
    room: row.room,
    homework: homeworkByLesson.get(row.id) ?? [],
    note: row.note,
    isWindow: row.is_window,
  };
}

function hwRowToHomework(row: HomeworkRow): Homework {
  return {
    id: row.id,
    text: row.text,
    done: row.done,
    createdAt: new Date(row.created_at).getTime(),
    attachments: row.attachments ?? [],
  };
}

function undatedRowToUndated(row: UndatedRow): UndatedHomework {
  return {
    id: row.id,
    weekKey: row.week_key,
    subject: row.subject,
    type: (row.type || '') as LessonType | '',
    text: row.text,
    done: row.done,
    createdAt: new Date(row.created_at).getTime(),
    attachments: row.attachments ?? [],
  };
}

// ── Load ────────────────────────────────────────────────────────────────────
export async function loadState(): Promise<AppState> {
  const [lessonsRes, hwRes, undatedRes, settingsRes] = await Promise.all([
    supabase.from('lessons').select('*'),
    supabase.from('homework').select('*'),
    supabase.from('undated_homework').select('*'),
    supabase.from('app_settings').select('group_name').eq('id', 1).maybeSingle(),
  ]);

  if (lessonsRes.error) throw lessonsRes.error;
  if (hwRes.error) throw hwRes.error;
  if (undatedRes.error) throw undatedRes.error;
  if (settingsRes.error) throw settingsRes.error;

  const homeworkByLesson = new Map<string, Homework[]>();
  for (const hwRow of (hwRes.data as HomeworkRow[]) ?? []) {
    const hw = hwRowToHomework(hwRow);
    const arr = homeworkByLesson.get(hwRow.lesson_id) ?? [];
    arr.push(hw);
    homeworkByLesson.set(hwRow.lesson_id, arr);
  }

  const lessons = ((lessonsRes.data as LessonRow[]) ?? []).map((r) =>
    rowToLesson(r, homeworkByLesson)
  );

  const undatedHomework = ((undatedRes.data as UndatedRow[]) ?? []).map(
    undatedRowToUndated
  );

  const groupName = (settingsRes.data as SettingsRow | null)?.group_name ?? '';

  return { groupName, lessons, undatedHomework };
}

// ── Settings ────────────────────────────────────────────────────────────────
export async function saveGroupName(name: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: 1, group_name: name, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ── Lessons ─────────────────────────────────────────────────────────────────
function lessonToRow(l: Lesson) {
  return {
    id: l.id,
    date: l.date,
    start_time: l.startTime,
    end_time: l.endTime,
    number: l.number,
    subject: l.subject,
    subgroup: l.subgroup ?? null,
    type: l.type,
    teacher: l.teacher,
    room: l.room,
    note: l.note ?? null,
    is_window: l.isWindow ?? false,
  };
}

export async function upsertLessonRow(lesson: Lesson): Promise<void> {
  const { error } = await supabase
    .from('lessons')
    .upsert(lessonToRow(lesson));
  if (error) throw error;
}

export async function deleteLessonRow(id: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', id);
  if (error) throw error;
}

export async function replaceLessonsForDate(
  date: string,
  newLessons: Lesson[]
): Promise<void> {
  // Delete existing non-window lessons for this date, then insert new ones.
  // Windows are kept (user-created free slots).
  const { error: delErr } = await supabase
    .from('lessons')
    .delete()
    .eq('date', date)
    .eq('is_window', false);
  if (delErr) throw delErr;

  if (newLessons.length > 0) {
    const rows = newLessons.map(lessonToRow);
    const { error: insErr } = await supabase.from('lessons').insert(rows);
    if (insErr) throw insErr;
  }
}

// ── Homework ────────────────────────────────────────────────────────────────
export async function insertHomework(
  lessonId: string,
  hw: Homework
): Promise<void> {
  const { error } = await supabase.from('homework').insert({
    id: hw.id,
    lesson_id: lessonId,
    text: hw.text,
    done: hw.done,
    created_at: new Date(hw.createdAt).toISOString(),
    attachments: hw.attachments ?? [],
  });
  if (error) throw error;
}

export async function updateHomeworkDone(
  hwId: string,
  done: boolean
): Promise<void> {
  const { error } = await supabase
    .from('homework')
    .update({ done })
    .eq('id', hwId);
  if (error) throw error;
}

export async function deleteHomeworkRow(hwId: string): Promise<void> {
  const { error } = await supabase.from('homework').delete().eq('id', hwId);
  if (error) throw error;
}

// ── Undated homework ────────────────────────────────────────────────────────
export async function insertUndatedHomework(
  entry: UndatedHomework
): Promise<void> {
  const { error } = await supabase.from('undated_homework').insert({
    id: entry.id,
    week_key: entry.weekKey,
    subject: entry.subject,
    type: entry.type,
    text: entry.text,
    done: entry.done,
    created_at: new Date(entry.createdAt).toISOString(),
    attachments: entry.attachments,
  });
  if (error) throw error;
}

export async function updateUndatedDone(
  id: string,
  done: boolean
): Promise<void> {
  const { error } = await supabase
    .from('undated_homework')
    .update({ done })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteUndatedRow(id: string): Promise<void> {
  const { error } = await supabase
    .from('undated_homework')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function updateUndatedWeekKey(
  id: string,
  weekKey: string
): Promise<void> {
  const { error } = await supabase
    .from('undated_homework')
    .update({ week_key: weekKey })
    .eq('id', id);
  if (error) throw error;
}

// ── Note ────────────────────────────────────────────────────────────────────
export async function updateLessonNote(
  lessonId: string,
  note: string | null
): Promise<void> {
  const { error } = await supabase
    .from('lessons')
    .update({ note })
    .eq('id', lessonId);
  if (error) throw error;
}

// ── Reconcile persistence ───────────────────────────────────────────────────
// After reconcileUndatedHomework runs in-memory, call this to persist the
// side effects: moved homework rows are inserted, moved undated rows are
// deleted, carried undated rows get their week_key updated.
export async function persistReconcile(
  movedHomework: { lessonId: string; hw: Homework }[],
  deletedUndatedIds: string[],
  carriedUndated: { id: string; weekKey: string }[]
): Promise<void> {
  // Insert moved homework rows
  for (const { lessonId, hw } of movedHomework) {
    const { error } = await supabase.from('homework').insert({
      id: hw.id,
      lesson_id: lessonId,
      text: hw.text,
      done: hw.done,
      created_at: new Date(hw.createdAt).toISOString(),
      attachments: hw.attachments ?? [],
    });
    if (error) throw error;
  }

  // Delete moved undated rows (they've been attached to lessons)
  if (deletedUndatedIds.length > 0) {
    const { error } = await supabase
      .from('undated_homework')
      .delete()
      .in('id', deletedUndatedIds);
    if (error) throw error;
  }

  // Update carried undated rows' week_key
  for (const { id, weekKey } of carriedUndated) {
    const { error } = await supabase
      .from('undated_homework')
      .update({ week_key: weekKey })
      .eq('id', id);
    if (error) throw error;
  }
}

// ── Migration from localStorage ─────────────────────────────────────────────
const LEGACY_KEY = 'student-schedule-v1';

interface LegacyAppState {
  groupName: string;
  lessons: Lesson[];
  undatedHomework: UndatedHomework[];
}

export interface MigrationResult {
  lessons: number;
  homework: number;
  undated: number;
  groupName: boolean;
}

export function readLegacyState(): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LegacyAppState>;
    // Migrate old single-homework format to array format
    const lessons = (parsed.lessons ?? []).map((l) => {
      const hw = l.homework as unknown;
      if (hw === null || hw === undefined) return { ...l, homework: [] };
      if (Array.isArray(hw)) return l;
      return { ...l, homework: [hw as object] } as typeof l;
    });
    return {
      groupName: parsed.groupName ?? '',
      lessons,
      undatedHomework: parsed.undatedHomework ?? [],
    };
  } catch {
    return null;
  }
}

export function hasLegacyData(): boolean {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<LegacyAppState>;
    return (
      (parsed.lessons?.length ?? 0) > 0 ||
      (parsed.undatedHomework?.length ?? 0) > 0
    );
  } catch {
    return false;
  }
}

export async function migrateFromLocalStorage(): Promise<MigrationResult> {
  const legacy = readLegacyState();
  if (!legacy) {
    return { lessons: 0, homework: 0, undated: 0, groupName: false };
  }

  let hwCount = 0;

  // Save group name if present
  if (legacy.groupName) {
    await saveGroupName(legacy.groupName);
  }

  // Upsert lessons
  for (const lesson of legacy.lessons) {
    await upsertLessonRow(lesson);
    // Insert homework items for this lesson
    if (lesson.homework && lesson.homework.length > 0) {
      for (const hw of lesson.homework) {
        await insertHomework(lesson.id, hw);
        hwCount++;
      }
    }
  }

  // Insert undated homework
  for (const item of legacy.undatedHomework) {
    await insertUndatedHomework(item);
  }

  return {
    lessons: legacy.lessons.length,
    homework: hwCount,
    undated: legacy.undatedHomework.length,
    groupName: Boolean(legacy.groupName),
  };
}

export function clearLegacyData(): void {
  localStorage.removeItem(LEGACY_KEY);
}
