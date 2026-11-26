import { useState } from 'react';
import Modal from './Modal';
import type { Lesson, LessonType } from '@/types';
import { uid } from '@/lib/storage';
import { detectLessonType, typeLabel } from '@/lib/lessonUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  editing: Lesson | null;
  onSave: (lesson: Lesson) => void;
}

const TYPES: LessonType[] = ['lecture', 'practice', 'lab', 'credit', 'exam'];

export default function LessonModal({ open, onClose, date, editing, onSave }: Props) {
  const [startTime, setStartTime] = useState(editing?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(editing?.endTime ?? '10:30');
  const [number, setNumber] = useState(editing?.number ?? 1);
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [subgroup, setSubgroup] = useState(editing?.subgroup ?? '');
  const [type, setType] = useState<LessonType>(editing?.type ?? 'practice');
  const [teacher, setTeacher] = useState(editing?.teacher ?? '');
  const [room, setRoom] = useState(editing?.room ?? '');

  // re-seed when opening with a different lesson
  const [seeded, setSeeded] = useState<string | null>(null);
  if (open && seeded !== (editing?.id ?? 'new')) {
    setSeeded(editing?.id ?? 'new');
    setStartTime(editing?.startTime ?? '09:00');
    setEndTime(editing?.endTime ?? '10:30');
    setNumber(editing?.number ?? 1);
    setSubject(editing?.subject ?? '');
    setSubgroup(editing?.subgroup ?? '');
    setType(editing?.type ?? 'practice');
    setTeacher(editing?.teacher ?? '');
    setRoom(editing?.room ?? '');
  }
  if (!open && seeded !== null) setSeeded(null);

  const handleSave = () => {
    if (!subject.trim()) return;
    const lesson: Lesson = {
      id: editing?.id ?? uid(),
      date,
      startTime,
      endTime,
      number,
      subject: subject.trim(),
      subgroup: subgroup.trim() || undefined,
      type,
      teacher: teacher.trim(),
      room: room.trim(),
      homework: editing?.homework ?? null,
    };
    onSave(lesson);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Редактировать пару' : 'Новая пара'}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Начало">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Конец">
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="№ пары">
            <input
              type="number"
              min={1}
              max={10}
              value={number}
              onChange={(e) => setNumber(parseInt(e.target.value) || 1)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Предмет">
          <input
            type="text"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setType(detectLessonType(e.target.value));
            }}
            placeholder="Напр. Высшая математика"
            className={inputCls}
          />
        </Field>

        <Field label="Подгруппа (необязательно)">
          <input
            type="text"
            value={subgroup}
            onChange={(e) => setSubgroup(e.target.value)}
            placeholder="Напр. п/г 1"
            className={inputCls}
          />
        </Field>

        <Field label="Тип пары">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 min-w-[80px] py-2 rounded-xl text-sm border transition-colors ${
                  type === t
                    ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                {typeLabel(t)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Преподаватель">
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="ФИО"
              className={inputCls}
            />
          </Field>
          <Field label="Аудитория">
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Напр. 304"
              className={inputCls}
            />
          </Field>
        </div>

        <button
          onClick={handleSave}
          disabled={!subject.trim()}
          className="w-full py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Сохранить
        </button>
      </div>
    </Modal>
  );
}

const inputCls =
  'w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-sky-500 transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
