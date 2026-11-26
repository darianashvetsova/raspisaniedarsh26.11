import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Camera, PenLine, Pencil, GraduationCap, Settings, CalendarDays, ClipboardList, Coffee, Globe } from 'lucide-react';
import type { AppState, Homework, HomeworkAttachment, Lesson, LessonType, UndatedHomework } from '@/types';
import {
  uid,
  loadState,
  saveGroupName,
  upsertLessonRow,
  deleteLessonRow,
  insertHomework,
  updateHomeworkDone,
  deleteHomeworkRow,
  insertUndatedHomework,
  updateUndatedDone,
  deleteUndatedRow,
  updateLessonNote,
  persistReconcile,
  hasLegacyData,
  migrateFromLocalStorage,
  clearLegacyData,
} from '@/lib/storage';
import {
  startOfWeek,
  addWeeks,
  addDays,
  fromDateKey,
  weekDays,
  formatRange,
  weekdayShort,
  todayKey,
  toDateKey,
  shiftScheduleDay,
} from '@/lib/dates';
import { uniqueSubjects } from '@/lib/lessonUtils';
import LessonCard from '@/components/LessonCard';
import Modal from '@/components/Modal';
import LessonModal from '@/components/LessonModal';
import HomeworkModal from '@/components/HomeworkModal';
import OcrPreviewModal from '@/components/OcrPreviewModal';
import Toasts, { type Toast } from '@/components/Toasts';
import NoteModal from '@/components/NoteModal';
import HomeworkWeekTab from '@/components/HomeworkWeekTab';
import { parseOcrText, parsedToLesson, type ParsedLesson } from '@/lib/ocr';
import { preprocessImage } from '@/lib/imagePreprocess';
import { recognizeImage, getOcrApiKey, setOcrApiKey } from '@/lib/ocrSpace';
import {
  fetchScheduleDays,
  parseSiteSchedule,
  ScheduleBlockedError,
  getScheduleUrl,
  setScheduleUrl,
  DEFAULT_SCHEDULE_URL,
  type ParsedDay,
} from '@/lib/siteParse';
import { reconcileUndatedHomework } from '@/lib/undatedHw';
import { supabase } from '@/lib/supabase';

export default function App() {
  const [state, setState] = useState<AppState>({ groupName: '', lessons: [], undatedHomework: [] });
  const [loaded, setLoaded] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKey());

  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [hwModalOpen, setHwModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrParsed, setOcrParsed] = useState<ParsedLesson[]>([]);
  const [ocrRawText, setOcrRawText] = useState('');
  const [ocrPreviewOpen, setOcrPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ocrApiKeyInput, setOcrApiKeyInput] = useState(() => getOcrApiKey());
  const [scheduleUrlInput, setScheduleUrlInput] = useState(() => getScheduleUrl());
  const [siteLoading, setSiteLoading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [migrating, setMigrating] = useState(false);
  const [legacyAvailable, setLegacyAvailable] = useState(false);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteLesson, setNoteLesson] = useState<Lesson | null>(null);
  const [tab, setTab] = useState<'schedule' | 'hw-week'>('schedule');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = (text: string, kind: Toast['kind'] = 'info') => {
    setToasts((t) => [...t, { id: Date.now() + Math.random(), text, kind }]);
  };
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  // Load from database on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await loadState();
        setState(data);
        setGroupNameInput(data.groupName);
        // Run reconcile after load
        if (data.undatedHomework.length > 0) {
          runReconcileWithData(data, false);
        }
      } catch (err) {
        console.error('Failed to load state:', err);
        notify('Не удалось загрузить данные', 'warn');
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const lessonsForSelected = useMemo(() => {
    return state.lessons
      .filter((l) => l.date === selectedDate)
      .sort((a, b) => {
        if (a.isWindow !== b.isWindow) return a.isWindow ? 1 : -1;
        return a.startTime.localeCompare(b.startTime);
      });
  }, [state.lessons, selectedDate]);

  // subjects that exist on the selected week (for empty hint)
  const subjectsAll = useMemo(() => uniqueSubjects(state.lessons), [state.lessons]);

  const goToday = () => {
    const t = new Date();
    setWeekStart(startOfWeek(t));
    setSelectedDate(toDateKey(t));
  };

  const prevWeek = () => setWeekStart((w) => addWeeks(w, -1));
  const nextWeek = () => setWeekStart((w) => addWeeks(w, 1));

  // swipe navigation between days (Mon..Sat, wraps across weeks)
  const goNextDay = () => {
    const { dateKey, newWeek } = shiftScheduleDay(selectedDate, 1);
    if (newWeek) setWeekStart((w) => addWeeks(w, 1));
    setSelectedDate(dateKey);
  };
  const goPrevDay = () => {
    const { dateKey, newWeek } = shiftScheduleDay(selectedDate, -1);
    if (newWeek) setWeekStart((w) => addWeeks(w, -1));
    setSelectedDate(dateKey);
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dx < 0) goNextDay();
    else goPrevDay();
  };

  // personal notes
  const openNote = (lesson: Lesson) => {
    setNoteLesson(lesson);
    setNoteModalOpen(true);
  };
  const saveNote = (lessonId: string, text: string) => {
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, note: text } : l)),
    }));
    updateLessonNote(lessonId, text).catch((e) => {
      console.error('Failed to save note:', e);
      notify('Не удалось сохранить заметку', 'warn');
    });
    notify('Заметка сохранена', 'success');
  };
  const deleteNote = (lessonId: string) => {
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, note: null } : l)),
    }));
    updateLessonNote(lessonId, null).catch((e) => {
      console.error('Failed to delete note:', e);
    });
    notify('Заметка удалена', 'info');
  };

  // lesson CRUD
  const upsertLesson = (lesson: Lesson) => {
    setState((s) => {
      const exists = s.lessons.some((l) => l.id === lesson.id);
      const lessons = exists
        ? s.lessons.map((l) => (l.id === lesson.id ? lesson : l))
        : [...s.lessons, lesson];
      return { ...s, lessons };
    });
    upsertLessonRow(lesson).catch((e) => {
      console.error('Failed to save lesson:', e);
      notify('Не удалось сохранить пару', 'warn');
    });
    runReconcile(true);
  };

  const deleteLesson = (id: string) => {
    setState((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== id) }));
    deleteLessonRow(id).catch((e) => {
      console.error('Failed to delete lesson:', e);
      notify('Не удалось удалить пару', 'warn');
    });
  };

  const addWindow = () => {
    const dayLessons = state.lessons.filter((l) => l.date === selectedDate);
    const maxNumber = dayLessons.reduce((m, l) => Math.max(m, l.number), 0);
    const newLesson: Lesson = {
      id: uid(),
      date: selectedDate,
      startTime: '',
      endTime: '',
      number: maxNumber + 1,
      subject: 'Окно',
      type: 'practice' as const,
      teacher: '',
      room: 'Свободное время между занятиями',
      homework: [],
      isWindow: true,
    };
    setState((s) => ({ ...s, lessons: [...s.lessons, newLesson] }));
    upsertLessonRow(newLesson).catch((e) => {
      console.error('Failed to add window:', e);
      notify('Не удалось добавить окно', 'warn');
    });
    notify('Окно добавлено', 'success');
  };

  const openEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setLessonModalOpen(true);
  };
  const openNew = () => {
    setEditingLesson(null);
    setLessonModalOpen(true);
  };

  // homework
  const saveHomework = (
    lessonId: string,
    text: string,
    attachments: HomeworkAttachment[] = []
  ) => {
    const hw: Homework = { id: uid(), text, done: false, createdAt: Date.now(), attachments };
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) =>
        l.id === lessonId
          ? { ...l, homework: [...(l.homework ?? []), hw] }
          : l
      ),
    }));
    insertHomework(lessonId, hw).catch((e) => {
      console.error('Failed to save homework:', e);
      notify('Не удалось сохранить ДЗ', 'warn');
    });
  };

  const saveUndatedHomework = (entry: {
    weekKey: string;
    subject: string;
    type: LessonType | '';
    text: string;
    attachments: HomeworkAttachment[];
    createdAt: number;
  }) => {
    const item: UndatedHomework = { id: uid(), done: false, ...entry };
    setState((s) => ({
      ...s,
      undatedHomework: [...s.undatedHomework, item],
    }));
    insertUndatedHomework(item).catch((e) => {
      console.error('Failed to save undated homework:', e);
      notify('Не удалось сохранить ДЗ', 'warn');
    });
  };

  const toggleUndatedHomework = (id: string) => {
    let newDone = false;
    setState((s) => ({
      ...s,
      undatedHomework: s.undatedHomework.map((u) => {
        if (u.id === id) {
          newDone = !u.done;
          return { ...u, done: newDone };
        }
        return u;
      }),
    }));
    updateUndatedDone(id, newDone).catch((e) => {
      console.error('Failed to toggle undated homework:', e);
    });
  };

  const deleteUndatedHomework = (id: string) => {
    setState((s) => ({
      ...s,
      undatedHomework: s.undatedHomework.filter((u) => u.id !== id),
    }));
    deleteUndatedRow(id).catch((e) => {
      console.error('Failed to delete undated homework:', e);
    });
    notify('Домашнее задание удалено', 'info');
  };

  // background pass: attach matured undated homework to appeared future
  // lessons and roll stale weeks over to the current one
  const runReconcileWithData = (data: AppState, force: boolean) => {
    if (data.undatedHomework.length === 0) return;
    const res = reconcileUndatedHomework(data, force);
    if (res.moved === 0 && res.carried === 0) return;
    setState((s) => ({
      ...s,
      lessons: res.lessons,
      undatedHomework: res.undatedHomework,
    }));
    if (res.moved > 0) {
      notify(`ДЗ из раздела «ДЗ без даты» прикреплено к парам: ${res.moved}`, 'success');
    }
    persistReconcile(res.movedHomework, res.deletedUndatedIds, res.carriedUndated).catch((e) => {
      console.error('Failed to persist reconcile:', e);
    });
  };

  const runReconcile = (force: boolean) => {
    runReconcileWithData(state, force);
  };

  const toggleHw = (lessonId: string, hwId: string) => {
    let newDone = false;
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) =>
        l.id === lessonId && l.homework
          ? {
              ...l,
              homework: l.homework.map((h) => {
                if (h.id === hwId) {
                  newDone = !h.done;
                  return { ...h, done: newDone };
                }
                return h;
              }),
            }
          : l
      ),
    }));
    updateHomeworkDone(hwId, newDone).catch((e) => {
      console.error('Failed to toggle homework:', e);
    });
  };

  const deleteHw = (lessonId: string, hwId: string) => {
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) =>
        l.id === lessonId && l.homework
          ? { ...l, homework: l.homework.filter((h) => h.id !== hwId) }
          : l
      ),
    }));
    deleteHomeworkRow(hwId).catch((e) => {
      console.error('Failed to delete homework:', e);
    });
    notify('Домашнее задание удалено', 'info');
  };

  // group name
  const saveGroup = () => {
    const name = groupNameInput.trim() || state.groupName;
    setState((s) => ({ ...s, groupName: name }));
    saveGroupName(name).catch((e) => {
      console.error('Failed to save group name:', e);
      notify('Не удалось сохранить название группы', 'warn');
    });
    setGroupModalOpen(false);
  };

  // migration from localStorage
  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const result = await migrateFromLocalStorage();
      const parts: string[] = [];
      if (result.lessons > 0) parts.push(`пар: ${result.lessons}`);
      if (result.homework > 0) parts.push(`ДЗ: ${result.homework}`);
      if (result.undated > 0) parts.push(`ДЗ без даты: ${result.undated}`);
      if (parts.length === 0) {
        notify('Старые данные не найдены', 'info');
      } else {
        notify(`Перенесено — ${parts.join(', ')}`, 'success');
        // Reload state from database
        const data = await loadState();
        setState(data);
        setLegacyAvailable(false);
        clearLegacyData();
        notify('Старые данные удалены из браузера', 'info');
      }
    } catch (e) {
      console.error('Migration failed:', e);
      notify('Не удалось перенести данные', 'warn');
    } finally {
      setMigrating(false);
    }
  };

  // OCR flow
  const handleScreenshot = () => {
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOcrLoading(true);
    try {
      const { dataUrl } = await preprocessImage(file);
      const result = await recognizeImage(dataUrl);
      if (result.error) {
        notify(`Ошибка распознавания: ${result.error}`, 'warn');
        return;
      }
      const raw = result.text || '';
      setOcrRawText(raw);
      const parsed = parseOcrText(raw);
      setOcrParsed(parsed);
      setOcrPreviewOpen(true);
      if (parsed.length === 0) {
        notify('Время на скриншоте не распознано. Откройте предпросмотр и заполните поля вручную.', 'warn');
      } else {
        notify(`Распознано пар: ${parsed.length}. Проверьте поля перед сохранением.`, 'info');
      }
    } catch (err) {
      notify('Ошибка распознавания. Проверьте изображение и попробуйте снова.', 'warn');
      console.error(err);
    } finally {
      setOcrLoading(false);
    }
  };

  // Load schedule from the МГУТУ site: replace existing lessons on each
  // parsed date, carrying over user-attached homework and notes.
  const applyParsedDays = (days: ParsedDay[]) => {
    const total = days.reduce((n, d) => n + d.lessons.length, 0);
    setState((s) => {
      let lessons = [...s.lessons];
      for (const day of days) {
        const oldForDate = lessons.filter((l) => l.date === day.date);
        const kept: Lesson[] = day.lessons.map((p) => {
          const prev = oldForDate.find(
            (l) => l.subject === p.subject && l.number === p.number
          );
          return {
            ...parsedToLesson(p, day.date),
            homework: prev?.homework ?? [],
            note: prev?.note ?? null,
          };
        });
        // replace regular lessons for these dates, keep user-created windows
        lessons = [
          ...lessons.filter((l) => l.date !== day.date || l.isWindow),
          ...kept,
        ];
      }
      return { ...s, lessons };
    });

    // Persist: for each parsed day, delete non-window lessons and insert new ones
    (async () => {
      for (const day of days) {
        // Delete existing non-window lessons for this date
        const { error: delErr } = await supabase
          .from('lessons')
          .delete()
          .eq('date', day.date)
          .eq('is_window', false);
        if (delErr) {
          console.error('Failed to clear date:', delErr);
          continue;
        }
        // Insert new lessons
        const newLessons = day.lessons.map((p) => {
          const prev = state.lessons.find(
            (l) => l.date === day.date && l.subject === p.subject && l.number === p.number
          );
          const lesson = {
            ...parsedToLesson(p, day.date),
            homework: prev?.homework ?? [],
            note: prev?.note ?? null,
          };
          return lesson;
        });
        for (const lesson of newLessons) {
          await upsertLessonRow(lesson);
          // Re-insert homework rows that were carried over
          if (lesson.homework && lesson.homework.length > 0) {
            for (const hw of lesson.homework) {
              await insertHomework(lesson.id, hw);
            }
          }
        }
      }
    })().catch((e) => {
      console.error('Failed to persist parsed days:', e);
      notify('Не удалось сохранить расписание в базу', 'warn');
    });

    const firstDay = days[0];
    if (firstDay) {
      setSelectedDate(firstDay.date);
      setWeekStart(startOfWeek(fromDateKey(firstDay.date)));
    }
    notify(`Загружено с сайта МГУТУ: пар ${total} за ${days.length} дн.`, 'success');
    runReconcile(true);
  };

  const handleLoadFromSite = async () => {
    setSiteLoading(true);
    try {
      const days = await fetchScheduleDays(getScheduleUrl());
      applyParsedDays(days);
    } catch (err) {
      if (err instanceof ScheduleBlockedError) {
        setPasteText('');
        setPasteOpen(true);
      } else {
        notify(`Не удалось загрузить расписание с сайта: ${err instanceof Error ? err.message : 'ошибка'}`, 'warn');
        console.error(err);
      }
    } finally {
      setSiteLoading(false);
    }
  };

  const handlePasteParse = () => {
    const text = pasteText.trim();
    if (!text) return;
    const days = parseSiteSchedule(text);
    if (days.length === 0) {
      notify('В вставленном тексте не найдено даты расписания (ДД.ММ.ГГГГ).', 'warn');
      return;
    }
    setPasteOpen(false);
    setPasteText('');
    applyParsedDays(days);
  };

  const saveOcrLessons = (lessons: Lesson[]) => {
    setState((s) => {
      const lessonsWithDate = lessons.map((l) => ({ ...l }));
      return { ...s, lessons: [...s.lessons, ...lessonsWithDate] };
    });
    // Persist
    (async () => {
      for (const lesson of lessons) {
        await upsertLessonRow(lesson);
      }
    })().catch((e) => {
      console.error('Failed to save OCR lessons:', e);
      notify('Не удалось сохранить пары', 'warn');
    });
    const d = lessons[0]?.date;
    if (d) setSelectedDate(d);
    notify(`Сохранено пар: ${lessons.length}`, 'success');
    runReconcile(true);
  };

  const today = todayKey();
  const selectedDayLessonsCount = lessonsForSelected.length;

  if (!loaded) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white max-w-2xl mx-auto flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
          <p className="text-sm text-neutral-300">Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white max-w-2xl mx-auto relative">
      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-20 w-72 h-72 bg-sky-600/10 rounded-full blur-3xl" />
        <div className="absolute top-20 -right-20 w-72 h-72 bg-blue-700/10 rounded-full blur-3xl" />
      </div>

      <div className="relative px-4 pt-4 pb-32">
        {/* Header: group + tabs */}
        <header className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <GraduationCap size={18} className="text-sky-400 shrink-0" />
              <button
                onClick={() => {
                  setGroupNameInput(state.groupName);
                  setGroupModalOpen(true);
                }}
                className="text-base font-semibold text-white truncate hover:text-sky-300 transition-colors text-left"
              >
                {state.groupName}
                <Pencil size={11} className="inline-block ml-1.5 text-neutral-500" />
              </button>
            </div>
            <button
              onClick={() => {
                setLegacyAvailable(hasLegacyData());
                setSettingsOpen(true);
              }}
              className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              aria-label="Настройки"
            >
              <Settings size={16} />
            </button>
          </div>

          {/* tab switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-1">
            <button
              onClick={() => setTab('schedule')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'schedule'
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <CalendarDays size={15} />
              Расписание
            </button>
            <button
              onClick={() => setTab('hw-week')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'hw-week'
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ClipboardList size={15} />
              ДЗ на неделю
            </button>
          </div>

          {/* week switcher (schedule tab only) */}
          {tab === 'schedule' && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-2 py-2">
            <button
              onClick={prevWeek}
              className="p-2 rounded-xl text-neutral-300 hover:bg-neutral-800 transition-colors"
              aria-label="Предыдущая неделя"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 text-center">
              <p className="text-sm font-medium text-white">{formatRange(weekStart)}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={goToday}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 transition-colors"
              >
                Сегодня
              </button>
              <button
                onClick={nextWeek}
                className="p-2 rounded-xl text-neutral-300 hover:bg-neutral-800 transition-colors"
                aria-label="Следующая неделя"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          )}

          {/* day strip (schedule tab only) */}
          {tab === 'schedule' && (
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {days.map((d) => {
              const key = toDateKey(d);
              const active = key === selectedDate;
              const isToday = key === today;
              const hasLessons = state.lessons.some((l) => l.date === key);
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all ${
                    active
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                      : 'text-neutral-400 hover:bg-neutral-900'
                  }`}
                >
                  <span className={`text-[11px] ${active ? 'text-sky-100' : 'text-neutral-500'}`}>
                    {weekdayShort(d)}
                  </span>
                  <span className="text-sm font-semibold">{d.getDate()}</span>
                  <span
                    className={`w-1 h-1 rounded-full ${
                      hasLessons ? (active ? 'bg-white' : 'bg-sky-400') : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          )}
        </header>

        {/* Lessons list (schedule tab) */}
        {tab === 'schedule' && (
        <section onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-medium text-neutral-400">
              {selectedDayLessonsCount > 0
                ? `Пар на день: ${selectedDayLessonsCount}`
                : 'На этот день пар нет'}
            </h2>
          </div>

          <div className="space-y-3">
            {lessonsForSelected.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                onToggleHw={(lessonId, hwId) => toggleHw(lessonId, hwId)}
                onEdit={openEdit}
                onDelete={deleteLesson}
                onOpenNote={openNote}
                onDeleteHw={(lessonId, hwId) => deleteHw(lessonId, hwId)}
              />
            ))}

            {lessonsForSelected.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-12 text-center">
                <p className="text-sm text-neutral-500 mb-1">Расписание на этот день пустое</p>
                <p className="text-xs text-neutral-600">
                  Добавьте пару вручную или загрузите скриншот расписания
                </p>
              </div>
            )}

            <button
              onClick={addWindow}
              className="w-full py-2.5 rounded-xl border border-dashed border-neutral-800 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <Coffee size={13} />
              Добавить окно
            </button>
          </div>
        </section>
        )}

        {/* Homework week view (hw-week tab) */}
        {tab === 'hw-week' && (
          <HomeworkWeekTab
            weekStart={weekStart}
            lessons={state.lessons}
            undatedHomework={state.undatedHomework}
            onPrevWeek={prevWeek}
            onNextWeek={nextWeek}
            onToggleHw={toggleHw}
            onDeleteHw={deleteHw}
            onToggleUndated={toggleUndatedHomework}
            onDeleteUndated={deleteUndatedHomework}
          />
        )}
      </div>

      {/* Bottom action bar (schedule tab only) */}
      {tab === 'schedule' && (
      <div className="fixed bottom-0 inset-x-0 z-40 max-w-2xl mx-auto px-4 pb-4 pt-2 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent">
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={handleLoadFromSite}
            disabled={siteLoading || ocrLoading}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] font-medium text-white hover:border-sky-500/50 transition-colors disabled:opacity-60"
          >
            <Globe size={17} className={siteLoading ? 'text-neutral-500' : 'text-sky-400'} />
            {siteLoading ? 'Загрузка…' : 'С сайта'}
          </button>
          <button
            onClick={handleScreenshot}
            disabled={ocrLoading || siteLoading}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] font-medium text-white hover:border-sky-500/50 transition-colors disabled:opacity-60"
          >
            <Camera size={17} className={ocrLoading ? 'text-neutral-500' : 'text-sky-400'} />
            {ocrLoading ? '…' : 'Скриншотом'}
          </button>
          <button
            onClick={openNew}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] font-medium text-white hover:border-sky-500/50 transition-colors"
          >
            <PenLine size={17} className="text-sky-400" />
            Вручную
          </button>
          <button
            onClick={() => setHwModalOpen(true)}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-sky-500 text-sm font-semibold text-white hover:bg-sky-400 transition-colors"
          >
            <span className="flex items-center gap-1">
              <Plus size={17} strokeWidth={2.5} />
              ДЗ
            </span>
          </button>
        </div>
      </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      {/* Modals */}
      <LessonModal
        open={lessonModalOpen}
        onClose={() => setLessonModalOpen(false)}
        date={selectedDate}
        editing={editingLesson}
        onSave={upsertLesson}
      />
      <HomeworkModal
        open={hwModalOpen}
        onClose={() => setHwModalOpen(false)}
        lessons={state.lessons}
        today={today}
        onSave={saveHomework}
        onSaveUndated={saveUndatedHomework}
        onNotify={notify}
      />
      <OcrPreviewModal
        open={ocrPreviewOpen}
        onClose={() => setOcrPreviewOpen(false)}
        parsed={ocrParsed}
        rawText={ocrRawText}
        defaultDate={selectedDate}
        onSave={saveOcrLessons}
      />
      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Вставьте расписание вручную"
      >
        <div className="space-y-3">
          <p className="text-xs text-neutral-400 leading-relaxed">
            Сервер вуза заблокировал прямой запрос (403). Откройте расписание, выделите
            всё (Ctrl+A / Выбрать всё), скопируйте и вставьте текст ниже.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={10}
            placeholder="Вставьте сюда скопированный текст страницы расписания…"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-sky-500 transition-colors resize-none"
          />
          <button
            onClick={handlePasteParse}
            disabled={!pasteText.trim()}
            className="w-full py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Распознать и добавить
          </button>
        </div>
      </Modal>
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Настройки"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1.5">
              Ссылка на расписание (dec.mgutm.ru)
            </span>
            <input
              type="url"
              value={scheduleUrlInput}
              onChange={(e) => setScheduleUrlInput(e.target.value)}
              placeholder={DEFAULT_SCHEDULE_URL}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </label>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Ключ API OCR.space используется для распознавания скриншотов. По умолчанию
            используется бесплатный демо-ключ с ограничением 25000 запросов в месяц.
            Получить свой ключ можно на{' '}
            <a
              href="https://ocr.space/ocrapi"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline"
            >
              ocr.space/ocrapi
            </a>
            .
          </p>
          <input
            type="text"
            value={ocrApiKeyInput}
            onChange={(e) => setOcrApiKeyInput(e.target.value)}
            placeholder="API ключ OCR.space"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          />

          <div className="pt-2 border-t border-neutral-800">
            <button
              onClick={handleMigrate}
              disabled={!legacyAvailable || migrating}
              className="w-full py-2.5 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:border-sky-500/50 hover:text-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {migrating ? (
                <>
                  <span className="w-4 h-4 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
                  Перенос…
                </>
              ) : (
                'Перенести старые данные из localStorage'
              )}
            </button>
            <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
              {legacyAvailable
                ? 'Найдены старые данные в браузере. Нажмите, чтобы загрузить их в облачную базу.'
                : 'Старые данные в браузере не найдены — уже используются облачное хранилище.'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setOcrApiKey(ocrApiKeyInput);
                setScheduleUrl(scheduleUrlInput);
                setScheduleUrlInput(getScheduleUrl());
                setSettingsOpen(false);
                notify('Настройки сохранены', 'success');
              }}
              className="flex-1 py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400"
            >
              Сохранить
            </button>
            <button
              onClick={() => {
                setOcrApiKeyInput('helloworld');
                setOcrApiKey('helloworld');
                setScheduleUrl('');
                setScheduleUrlInput(DEFAULT_SCHEDULE_URL);
                setSettingsOpen(false);
                notify('Сброшено на значения по умолчанию', 'info');
              }}
              className="px-4 py-3 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:border-neutral-700"
            >
              Сбросить
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title="Название группы"
      >
        <div className="space-y-3">
          <input
            type="text"
            value={groupNameInput}
            onChange={(e) => setGroupNameInput(e.target.value)}
            placeholder="Например, 270304-ПЭТСо-26/1"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          />
          <button
            onClick={saveGroup}
            className="w-full py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400"
          >
            Сохранить
          </button>
        </div>
      </Modal>

      <NoteModal
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        lesson={noteLesson}
        onSave={saveNote}
        onDelete={deleteNote}
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {(ocrLoading || siteLoading) && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
            <p className="text-sm text-neutral-300">
              {siteLoading ? 'Загружаю расписание с сайта…' : 'Распознаю текст…'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
