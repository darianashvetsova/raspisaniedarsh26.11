import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Camera, PenLine, Pencil, GraduationCap, Settings, CalendarDays, ClipboardList, Coffee } from 'lucide-react';
import type { AppState, Lesson } from '@/types';
import { loadState, saveState, uid } from '@/lib/storage';
import {
  startOfWeek,
  addWeeks,
  addDays,
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
import { parseOcrText, type ParsedLesson } from '@/lib/ocr';
import { preprocessImage } from '@/lib/imagePreprocess';
import { recognizeImage, getOcrApiKey, setOcrApiKey } from '@/lib/ocrSpace';

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKey());

  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [hwModalOpen, setHwModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState(state.groupName);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrParsed, setOcrParsed] = useState<ParsedLesson[]>([]);
  const [ocrRawText, setOcrRawText] = useState('');
  const [ocrPreviewOpen, setOcrPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ocrApiKeyInput, setOcrApiKeyInput] = useState(() => getOcrApiKey());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteLesson, setNoteLesson] = useState<Lesson | null>(null);
  const [tab, setTab] = useState<'schedule' | 'hw-week'>('schedule');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = (text: string, kind: Toast['kind'] = 'info') => {
    setToasts((t) => [...t, { id: Date.now() + Math.random(), text, kind }]);
  };
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

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
    notify('Заметка сохранена', 'success');
  };
  const deleteNote = (lessonId: string) => {
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, note: null } : l)),
    }));
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
  };

  const deleteLesson = (id: string) => {
    setState((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== id) }));
  };

  const addWindow = () => {
    const dayLessons = state.lessons.filter((l) => l.date === selectedDate);
    const maxNumber = dayLessons.reduce((m, l) => Math.max(m, l.number), 0);
    setState((s) => ({
      ...s,
      lessons: [
        ...s.lessons,
        {
          id: uid(),
          date: selectedDate,
          startTime: '',
          endTime: '',
          number: maxNumber + 1,
          subject: 'Окно',
          type: 'practice' as const,
          teacher: '',
          room: 'Свободное время между занятиями',
          homework: null,
          isWindow: true,
        },
      ],
    }));
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
  const saveHomework = (lessonId: string, text: string) => {
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) =>
        l.id === lessonId
          ? { ...l, homework: { id: uid(), text, done: false, createdAt: Date.now() } }
          : l
      ),
    }));
  };

  const toggleHw = (lessonId: string) => {
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) =>
        l.id === lessonId && l.homework
          ? { ...l, homework: { ...l.homework, done: !l.homework.done } }
          : l
      ),
    }));
  };

  const deleteHw = (lessonId: string) => {
    setState((s) => ({
      ...s,
      lessons: s.lessons.map((l) =>
        l.id === lessonId ? { ...l, homework: null } : l
      ),
    }));
    notify('Домашнее задание удалено', 'info');
  };

  // group name
  const saveGroup = () => {
    setState((s) => ({ ...s, groupName: groupNameInput.trim() || s.groupName }));
    setGroupModalOpen(false);
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

  const saveOcrLessons = (lessons: Lesson[]) => {
    setState((s) => {
      // remove existing lessons on that date to avoid duplicates? Keep existing, just add.
      const lessonsWithDate = lessons.map((l) => ({ ...l }));
      return { ...s, lessons: [...s.lessons, ...lessonsWithDate] };
    });
    const d = lessons[0]?.date;
    if (d) setSelectedDate(d);
    notify(`Сохранено пар: ${lessons.length}`, 'success');
  };

  const today = todayKey();
  const selectedDayLessonsCount = lessonsForSelected.length;

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
              onClick={() => setSettingsOpen(true)}
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
                onToggleHw={toggleHw}
                onEdit={openEdit}
                onDelete={deleteLesson}
                onOpenNote={openNote}
                onDeleteHw={deleteHw}
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
            onPrevWeek={prevWeek}
            onNextWeek={nextWeek}
            onToggleHw={toggleHw}
            onDeleteHw={deleteHw}
          />
        )}
      </div>

      {/* Bottom action bar (schedule tab only) */}
      {tab === 'schedule' && (
      <div className="fixed bottom-0 inset-x-0 z-40 max-w-2xl mx-auto px-4 pb-4 pt-2 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent">
        <div className="flex gap-2">
          <button
            onClick={handleScreenshot}
            disabled={ocrLoading}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 text-sm font-medium text-white hover:border-sky-500/50 transition-colors disabled:opacity-60"
          >
            <Camera size={18} className="text-sky-400" />
            {ocrLoading ? 'Распознавание…' : 'По скриншоту'}
          </button>
          <button
            onClick={openNew}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 text-sm font-medium text-white hover:border-sky-500/50 transition-colors"
          >
            <PenLine size={18} className="text-sky-400" />
            Вручную
          </button>
          <button
            onClick={() => setHwModalOpen(true)}
            disabled={subjectsAll.length === 0}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-sky-500 text-sm font-medium text-white hover:bg-sky-400 transition-colors disabled:opacity-40"
          >
            <Plus size={18} />
            ДЗ
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
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Настройки OCR"
      >
        <div className="space-y-3">
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
          <div className="flex gap-2">
            <button
              onClick={() => {
                setOcrApiKey(ocrApiKeyInput);
                setSettingsOpen(false);
                notify('Ключ API сохранён', 'success');
              }}
              className="flex-1 py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400"
            >
              Сохранить
            </button>
            <button
              onClick={() => {
                setOcrApiKeyInput('helloworld');
                setOcrApiKey('helloworld');
                setSettingsOpen(false);
                notify('Сброшено на демо-ключ', 'info');
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

      {ocrLoading && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
            <p className="text-sm text-neutral-300">Распознаю текст…</p>
          </div>
        </div>
      )}
    </div>
  );
}
