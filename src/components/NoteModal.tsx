import { useState } from 'react';
import Modal from './Modal';
import type { Lesson } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  onSave: (lessonId: string, text: string) => void;
  onDelete: (lessonId: string) => void;
}

export default function NoteModal({ open, onClose, lesson, onSave, onDelete }: Props) {
  const [text, setText] = useState('');

  // re-seed on open
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setText(lesson?.note ?? '');
  }
  if (!open && seeded) setSeeded(false);

  if (!lesson) return null;

  const handleSave = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onSave(lesson.id, trimmed);
    } else {
      onDelete(lesson.id);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Заметка к паре">
      <div className="space-y-3">
        <p className="text-xs text-neutral-400 leading-relaxed">
          {lesson.subject}
          {lesson.subgroup ? `, ${lesson.subgroup}` : ''} — {lesson.number}-я пара
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Например: принести конспект, пересдать тему у Кабинетова…"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-sky-500 transition-colors resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400 transition-colors"
          >
            Сохранить
          </button>
          {lesson.note && (
            <button
              onClick={() => {
                onDelete(lesson.id);
                onClose();
              }}
              className="px-4 py-3 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400 transition-colors"
            >
              Удалить заметку
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
