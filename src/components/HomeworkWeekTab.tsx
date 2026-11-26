import { useMemo, useRef } from 'react';
import { CalendarX2, Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { Lesson, UndatedHomework } from '@/types';
import { weekDays, fromDateKey, isSameDay, toDateKey, startOfWeek } from '@/lib/dates';
import { formatDayHeader } from '@/lib/dates';
import { formatRange } from '@/lib/dates';
import { typeShort } from '@/lib/lessonUtils';

interface Props {
  weekStart: Date;
  lessons: Lesson[];
  undatedHomework: UndatedHomework[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToggleHw: (lessonId: string, hwId: string) => void;
  onDeleteHw: (lessonId: string, hwId: string) => void;
  onToggleUndated: (id: string) => void;
  onDeleteUndated: (id: string) => void;
}

export default function HomeworkWeekTab({
  weekStart,
  lessons,
  undatedHomework,
  onPrevWeek,
  onNextWeek,
  onToggleHw,
  onDeleteHw,
  onToggleUndated,
  onDeleteUndated,
}: Props) {
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
    if (dx < 0) onNextWeek();
    else onPrevWeek();
  };

  // undated homework tied to the calendar week being viewed
  const weekKey = toDateKey(startOfWeek(weekStart));
  const undatedForWeek = useMemo(
    () =>
      undatedHomework
        .filter((u) => u.weekKey === weekKey)
        .sort((a, b) => a.createdAt - b.createdAt),
    [undatedHomework, weekKey]
  );

  // days of the selected week that have at least one homework
  const daysWithHw = useMemo(() => {
    return weekDays(weekStart)
      .map((d) => {
        const key = toDateKey(d);
        const dayLessons = lessons
          .filter((l) => l.date === key && l.homework && l.homework.length > 0)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        return { key, date: d, dayLessons };
      })
      .filter((d) => d.dayLessons.length > 0);
  }, [weekStart, lessons]);

  const today = toDateKey(new Date());

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* week switcher */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-2 py-2 mb-4">
        <button
          onClick={onPrevWeek}
          className="p-2 rounded-xl text-neutral-300 hover:bg-neutral-800 transition-colors"
          aria-label="Предыдущая неделя"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="flex-1 text-center text-sm font-medium text-white">
          {formatRange(weekStart)}
        </p>
        <button
          onClick={onNextWeek}
          className="p-2 rounded-xl text-neutral-300 hover:bg-neutral-800 transition-colors"
          aria-label="Следующая неделя"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* undated homework block */}
      {undatedForWeek.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/20">
            <CalendarX2 size={15} className="text-amber-400/90" />
            <h3 className="text-sm font-semibold text-amber-200">ДЗ без даты</h3>
          </div>
          <div className="p-3 space-y-2">
            {undatedForWeek.map((u) => (
              <div
                key={u.id}
                className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-3"
              >
                <div className="flex items-start gap-2.5">
                  <button
                    onClick={() => onToggleUndated(u.id)}
                    aria-label={u.done ? 'Снять отметку' : 'Отметить выполненным'}
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                      u.done
                        ? 'bg-sky-500 border-sky-500 text-white'
                        : 'border-neutral-600 text-transparent hover:border-neutral-400'
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold leading-snug text-white">
                      {u.subject}
                      {u.type && (
                        <span className="text-neutral-400 font-normal"> ({typeShort(u.type)})</span>
                      )}
                    </p>
                    <p
                      className={`mt-1.5 text-[13px] leading-relaxed ${
                        u.done ? 'text-neutral-500 line-through' : 'text-neutral-200'
                      }`}
                    >
                      {u.text}
                    </p>
                    {u.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {u.attachments.map((a, i) => (
                          <a
                            key={i}
                            href={a.dataUrl}
                            download={a.name}
                            className="inline-flex items-center rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300 hover:border-neutral-600 transition-colors"
                          >
                            {a.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteUndated(u.id)}
                    className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                    aria-label="Удалить домашнее задание"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {daysWithHw.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500 mb-1">На этой неделе ДЗ нет</p>
          <p className="text-xs text-neutral-600">
            Добавьте домашнее задание кнопкой «ДЗ» на главной вкладке
          </p>
        </div>
      )}

      <div className="space-y-6">
        {daysWithHw.map(({ key, date, dayLessons }) => (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2.5 px-1">
              <h3
                className={`text-sm font-semibold ${
                  isSameDay(fromDateKey(key), new Date()) ? 'text-sky-300' : 'text-neutral-300'
                }`}
              >
                {formatDayHeader(date)}
                {key === today && <span className="text-neutral-500 font-normal"> · сегодня</span>}
              </h3>
              <div className="flex-1 h-px bg-neutral-800" />
            </div>
            <div className="space-y-2.5">
              {dayLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4"
                >
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold leading-snug text-white">
                        {lesson.subject}
                        <span className="text-neutral-400 font-normal">
                          {' '}
                          ({typeShort(lesson.type)})
                        </span>
                        {lesson.subgroup ? (
                          <span className="text-neutral-400 font-normal">, {lesson.subgroup}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {lesson.startTime} · {lesson.number}-я пара
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {lesson.homework!.map((hw) => (
                      <div key={hw.id} className="flex items-start gap-2.5">
                        <button
                          onClick={() => onToggleHw(lesson.id, hw.id)}
                          aria-label={hw.done ? 'Снять отметку' : 'Отметить выполненным'}
                          className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            hw.done
                              ? 'bg-sky-500 border-sky-500 text-white'
                              : 'border-neutral-600 text-transparent hover:border-neutral-400'
                          }`}
                        >
                          <Check size={13} strokeWidth={3} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[13px] leading-relaxed ${
                              hw.done ? 'text-neutral-500 line-through' : 'text-neutral-200'
                            }`}
                          >
                            {hw.text}
                          </p>
                          {hw.attachments && hw.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {hw.attachments.map((a, i) => (
                                <a
                                  key={i}
                                  href={a.dataUrl}
                                  download={a.name}
                                  className="inline-flex items-center rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300 hover:border-neutral-600 transition-colors"
                                >
                                  {a.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => onDeleteHw(lesson.id, hw.id)}
                          className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                          aria-label="Удалить домашнее задание"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
