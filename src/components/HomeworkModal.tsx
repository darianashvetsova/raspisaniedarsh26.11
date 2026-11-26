import { useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import Modal from './Modal';
import type { HomeworkAttachment, Lesson, LessonType } from '@/types';
import { uniqueSubjects, findNextLesson, typeLabel } from '@/lib/lessonUtils';
import { fromDateKey, startOfWeek, toDateKey } from '@/lib/dates';
import { uid } from '@/lib/storage';

interface Props {
  open: boolean;
  onClose: () => void;
  lessons: Lesson[];
  today: string;
  onSave: (lessonId: string, text: string, attachments: HomeworkAttachment[]) => void;
  onSaveUndated: (entry: {
    weekKey: string;
    subject: string;
    type: LessonType | '';
    text: string;
    attachments: HomeworkAttachment[];
    createdAt: number;
  }) => void;
  onNotify: (text: string, kind?: 'info' | 'warn' | 'success') => void;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024; // localStorage-safe attachment size

export default function HomeworkModal({
  open,
  onClose,
  lessons,
  today,
  onSave,
  onSaveUndated,
  onNotify,
}: Props) {
  const subjects = uniqueSubjects(lessons);
  const [subject, setSubject] = useState('');
  const [typeFilter, setTypeFilter] = useState<LessonType | ''>('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<HomeworkAttachment[]>([]);
  const [readingFile, setReadingFile] = useState(false);

  // re-seed on open
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setSubject(subjects[0] ?? '');
    setTypeFilter('');
    setText('');
    setAttachments([]);
  }
  if (!open && seeded) setSeeded(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReadingFile(true);
    try {
      const added: HomeworkAttachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES) {
          onNotify(`Файл «${file.name}» слишком большой (до 2 МБ)`, 'warn');
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        added.push({ name: file.name, dataUrl });
      }
      if (added.length) setAttachments((a) => [...a, ...added]);
    } catch {
      onNotify('Не удалось прочитать файл', 'warn');
    } finally {
      setReadingFile(false);
    }
  };

  const handleSave = () => {
    if (!subject || !text.trim()) return;
    const next = findNextLesson(lessons, subject, today, typeFilter || undefined);
    if (next) {
      onSave(next.id, text.trim(), attachments);
      const d = fromDateKey(next.date);
      onNotify(
        `ДЗ прикреплено к паре «${next.subject}» на ${d.getDate()} ${MONTHS[d.getMonth()]} (${typeLabel(next.type)}).`,
        'success'
      );
    } else {
      onSaveUndated({
        weekKey: toDateKey(startOfWeek(new Date())),
        subject,
        type: typeFilter,
        text: text.trim(),
        attachments,
        createdAt: Date.now(),
      });
      onNotify('ДЗ добавлено в раздел «ДЗ без даты» на текущую неделю', 'success');
    }
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

        {/* attachments */}
        <div className="space-y-2">
          <label className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-neutral-800 text-xs text-neutral-400 hover:border-sky-500/50 hover:text-sky-300 transition-colors cursor-pointer">
            <Paperclip size={14} />
            {readingFile ? 'Читаю файл…' : 'Прикрепить файл (до 2 МБ)'}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          {attachments.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              className="flex items-center gap-2 rounded-xl bg-neutral-950/60 border border-neutral-800 px-3 py-2"
            >
              <Paperclip size={13} className="shrink-0 text-neutral-500" />
              <span className="flex-1 min-w-0 truncate text-xs text-neutral-300">{a.name}</span>
              <button
                onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                className="shrink-0 p-1 rounded text-neutral-500 hover:text-red-400 transition-colors"
                aria-label={`Убрать файл ${a.name}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 px-3 py-2.5 text-xs text-neutral-400 leading-relaxed">
          ДЗ прикрепится к ближайшей будущей паре по этому предмету (дата строго позже
          сегодняшней). Если такой пары пока нет — задание сохранится в раздел
          «ДЗ без даты» на текущую неделю.
        </div>

        <button
          onClick={handleSave}
          disabled={!subject || !text.trim() || readingFile}
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
