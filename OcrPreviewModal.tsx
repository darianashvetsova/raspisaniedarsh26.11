import { useState } from 'react';
import Modal from './Modal';
import type { Lesson, LessonType } from '@/types';
import { uid } from '@/lib/storage';
import { detectLessonType, typeLabel } from '@/lib/lessonUtils';
import { fromDateKey, toDateKey, addDays } from '@/lib/dates';
import type { ParsedLesson } from '@/lib/ocr';

interface Props {
  open: boolean;
  onClose: () => void;
  parsed: ParsedLesson[];
  rawText: string;
  defaultDate: string;
  onSave: (lessons: Lesson[]) => void;
}

interface EditableRow extends ParsedLesson {
  _id: string;
}

export default function OcrPreviewModal({
  open,
  onClose,
  parsed,
  rawText,
  defaultDate,
  onSave,
}: Props) {
  const [date, setDate] = useState(defaultDate);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  // tracks which `parsed` array the rows were seeded from; a new scan always
  // produces a new array reference, so every open/scan reseeds exactly once
  const [seededFrom, setSeededFrom] = useState<ParsedLesson[] | null>(null);

  if (open && seededFrom !== parsed) {
    setSeededFrom(parsed);
    setDate(defaultDate);
    setRows(parsed.map((p) => ({ ...p, _id: uid() })));
    setShowRaw(false);
  }
  if (!open && seededFrom !== null) {
    setSeededFrom(null);
  }

  const update = (id: string, patch: Partial<EditableRow>) => {
    setRows((r) => r.map((row) => (row._id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setRows((r) => r.filter((row) => row._id !== id));
  };

  const handleSave = () => {
    const lessons: Lesson[] = rows
      .filter((r) => r.subject.trim())
      .map((r) =>
        r.subject.trim() === 'Окно' || !r.startTime
          ? {
              id: uid(),
              date,
              startTime: '',
              endTime: '',
              number: r.number,
              subject: 'Окно',
              type: 'practice' as const,
              teacher: '',
              room: r.room.trim(),
              homework: null,
              isWindow: true,
            }
          : {
              id: uid(),
              date,
              startTime: r.startTime,
              endTime: r.endTime,
              number: r.number,
              subject: r.subject.trim(),
              subgroup: r.subgroup.trim() || undefined,
              type: r.type,
              teacher: r.teacher.trim(),
              room: r.room.trim(),
              homework: null,
            }
      );
    onSave(lessons);
    onClose();
  };

  const dateLabel = (() => {
    const d = fromDateKey(date);
    return `${weekday(d)} ${d.getDate()}`;
  })();

  return (
    <Modal open={open} onClose={onClose} title="Предпросмотр распознанных пар">
      <div className="space-y-4">
        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1.5">
            Дата (на этот день сохранятся пары)
          </span>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
            />
            <button
              onClick={() => setDate(toDateKey(addDays(new Date(), 1)))}
              className="px-3 rounded-xl border border-neutral-800 text-xs text-neutral-300 hover:border-neutral-700"
            >
              Завтра
            </button>
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">Выбрано: {dateLabel}</p>
        </label>

        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-6 text-center">
              <p className="text-sm text-neutral-400 mb-1">Не удалось автоматически разобрать пары</p>
              <p className="text-xs text-neutral-500">
                Поля ниже пустые — заполните их вручную или нажмите «Показать распознанный текст», чтобы скопировать данные.
              </p>
            </div>
          )}
          {rows.map((row) => (
            <div
              key={row._id}
              className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={row.startTime}
                    onChange={(e) => update(row._id, { startTime: e.target.value })}
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                  <span className="text-neutral-600 text-xs">–</span>
                  <input
                    type="time"
                    value={row.endTime}
                    onChange={(e) => update(row._id, { endTime: e.target.value })}
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  onClick={() => removeRow(row._id)}
                  className="text-neutral-500 hover:text-red-400 text-xs"
                >
                  Удалить
                </button>
              </div>
              <input
                type="text"
                value={row.subject}
                onChange={(e) =>
                  update(row._id, {
                    subject: e.target.value,
                    type: detectLessonType(e.target.value),
                  })
                }
                placeholder="Предмет"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {(['lecture', 'practice', 'lab', 'credit', 'exam'] as LessonType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => update(row._id, { type: t })}
                    className={`flex-1 min-w-[60px] py-1.5 rounded-lg text-xs border transition-colors ${
                      row.type === t
                        ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'
                    }`}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={row.teacher}
                  onChange={(e) => update(row._id, { teacher: e.target.value })}
                  placeholder="Преподаватель"
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <input
                  type="text"
                  value={row.room}
                  onChange={(e) => update(row._id, { room: e.target.value })}
                  placeholder="Аудитория"
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          ))}
        </div>

        {/* manual add row */}
        <button
          onClick={() =>
            setRows((r) => [
              ...r,
              {
                _id: uid(),
                number: r.length + 1,
                startTime: '09:00',
                endTime: '10:30',
                type: 'practice',
                subject: '',
                subgroup: '',
                teacher: '',
                room: '',
              },
            ])
          }
          className="w-full py-2.5 rounded-xl border border-dashed border-neutral-700 text-sm text-neutral-400 hover:border-sky-500/50 hover:text-sky-300 transition-colors"
        >
          + Добавить пару вручную
        </button>

        {/* raw text collapsible */}
        {rawText.trim() && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 overflow-hidden">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              <span>Показать распознанный сырой текст</span>
              <span className="text-neutral-600">{showRaw ? '▲' : '▼'}</span>
            </button>
            {showRaw && (
              <pre className="px-3 pb-3 text-[11px] leading-relaxed text-neutral-400 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {rawText}
              </pre>
            )}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={rows.length === 0}
          className="w-full py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Сохранить в расписание
        </button>
      </div>
    </Modal>
  );
}

function weekday(d: Date): string {
  return ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][(d.getDay() + 6) % 7];
}
