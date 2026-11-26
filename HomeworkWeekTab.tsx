import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { Lesson } from '@/types';
import { weekDays, fromDateKey, isSameDay, toDateKey } from '@/lib/dates';
import { formatDayHeader } from '@/lib/dates';
import { formatRange } from '@/lib/dates';

interface Props {
  weekStart: Date;
  lessons: Lesson[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToggleHw: (lessonId: string) => void;
  onDeleteHw: (lessonId: string) => void;
}

export default function HomeworkWeekTab({
  weekStart,
  lessons,
  onPrevWeek,
  onNextWeek,
  onToggleHw,
  onDeleteHw,
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

  // days of the selected week that have at least one homework
  const daysWithHw = useMemo(() => {
    return weekDays(weekStart)
      .map((d) => {
        const key = toDateKey(d);
        const dayLessons = lessons
          .filter((l) => l.date === key && l.homework && l.homework.text)
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
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={() => onToggleHw(lesson.id)}
                      aria-label={lesson.homework!.done ? 'Снять отметку' : 'Отметить выполненным'}
                      className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                        lesson.homework!.done
                          ? 'bg-sky-500 border-sky-500 text-white'
                          : 'border-neutral-600 text-transparent hover:border-neutral-400'
                      }`}
                    >
                      <Check size={13} strokeWidth={3} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold leading-snug text-white">
                        {lesson.subject}
                        {lesson.subgroup ? (
                          <span className="text-neutral-400 font-normal">, {lesson.subgroup}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {lesson.startTime} · {lesson.number}-я пара
                      </p>
                      <p
                        className={`mt-2 text-[13px] leading-relaxed ${
                          lesson.homework!.done ? 'text-neutral-500 line-through' : 'text-neutral-200'
                        }`}
                      >
                        {lesson.homework!.text}
                      </p>
                    </div>
                    <button
                      onClick={() => onDeleteHw(lesson.id)}
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
        ))}
      </div>
    </div>
  );
}
