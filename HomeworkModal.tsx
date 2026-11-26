import { useState } from 'react';
import Modal from './Modal';
import type { Lesson, LessonType } from '@/types';
import { uniqueSubjects, findNextLesson, typeLabel } from '@/lib/lessonUtils';
import { fromDateKey } from '@/lib/dates';

interface Props {
  open: boolean;
  onClose: () => void;
  lessons: Lesson[];
  today: string;
  onSave: (lessonId: string, text: string) => void;
  onNotify: (text: string, kind?: 'info' | 'warn' | 'success') => void;
}

export default function HomeworkModal({
  open,
  onClose,
  lessons,
  today,
  onSave,
  onNotify,
}: Props) {
  const subjects = uniqueSubjects(lessons);
  const [subject, setSubject] = useState('');
  const [typeFilter, setTypeFilter] = useState<LessonType | ''>('');
  const [text, setText] = useState('');

  // re-seed on open
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setSubject(subjects[0] ?? '');
    setTypeFilter('');
    setText('');
  }
  if (!open && seeded) setSeeded(false);

  const handleSave = () => {
    if (!subject || !text.trim()) return;
    const next = findNextLesson(lessons, subject, today, typeFilter || undefined);
    if (!next) {
      onNotify(
        typeFilter
          ? `Для предмета «${subject}» нет будущих пар типа «${typeLabel(typeFilter)}».`
          : `Для предмета «${subject}» нет будущих пар в расписании. Выберите дату вручную через редактирование пары.`,
        'warn'
      );
      return;
    }
    onSave(next.id, text.trim());
    const d = fromDateKey(next.date);
    onNotify(
      `ДЗ прикреплено к паре «${next.subject}» на ${d.getDate()} ${MONTHS[d.getMonth()]} (${typeLabel(next.type)}).`,
      'success'
    );
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Добавить домашнее задание">
      <div className="space-y-4">
        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1.5">Предмет</span>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
          >
            {subjects.length === 0 && <option value="">Нет предметов в расписании</option>}
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1.5">Тип пары</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as LessonType | '')}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="">Любой тип</option>
            <option value="lecture">Лекция</option>
            <option value="practice">Практика</option>
            <option value="lab">Лабораторная</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1.5">Текст задания</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Что нужно сделать?"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-sky-500 transition-colors resize-none"
          />
        </label>

        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 px-3 py-2.5 text-xs text-neutral-400 leading-relaxed">
          ДЗ автоматически прикрепится к ближайшей будущей паре по этому предмету
          (дата строго позже сегодняшней).
        </div>

        <button
          onClick={handleSave}
          disabled={!subject || !text.trim()}
          className="w-full py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Сохранить
        </button>
      </div>
    </Modal>
  );
}

const MONTHS = [
  'янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июня',
  'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
];
