import type { Lesson, LessonType } from '@/types';
import { detectLessonType } from './lessonUtils';
import { uid } from './storage';

export interface ParsedLesson {
  number: number;
  startTime: string;
  endTime: string;
  type: LessonType;
  subject: string;
  subgroup: string;
  teacher: string;
  room: string;
}

const TIME_RE = /(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/;
const PAIR_NUM_RE = /(\d+)\s*[-−–]?\s*[яЯ]\s*пара/i;

// window card: "N-я пара" line immediately followed by "Окно" (within the
// next 2 lines), no ЧЧ:ММ time; caption may follow
const WINDOW_SUBJECT_RE = /\bокно\b/i;
const WINDOW_CAPTION_RE = /свобод/i;
const WINDOW_DEFAULT_CAPTION = 'Свободное время между занятиями';

// "п/г 2" / "п/г2" — lessons of subgroup 2 are ignored entirely
const SUBGROUP2_RE = /п\/г\s*2/i;

// OCR noise: any characters outside Cyrillic/Latin/digits and useful
// punctuation (hieroglyphs like 歯, icons, symbols) are stripped
const NOISE_RE = /[^A-Za-zА-ЯЁа-яё0-9\s.,:;()№#'"«»/+-]+/gu;
const HAS_CONTENT_RE = /[A-Za-zА-ЯЁа-яё0-9]/;

// bottom navigation tab names of the app the screenshots come from —
// any line containing one of these (case-insensitive) is dropped entirely
const MENU_TAB_WORDS = ['Профиль', 'Лента', 'Расписание', 'Избранное', 'Меню'];
const MENU_LINE_RE = new RegExp(
  MENU_TAB_WORDS.map((w) => w.replace(/ё/g, '[её]')).join('|'),
  'i'
);

const TEACHER_RANKS = [
  'зав\\.?\\s*каф\\.?',
  'доц',
  'проф',
  'ст\\.?\\s*преп',
  'преп',
  'асс',
  'старший преподаватель',
];
// rank may be written merged with the surname: "зав.каф.Бакурадзе А.Б."
const TEACHER_RE = new RegExp(
  `(?:${TEACHER_RANKS.join('|')})\\.?\\s*([А-ЯЁA-Z][а-яёa-z]+(?:\\s+[А-ЯЁA-Z]\\.?\\s*[А-ЯЁA-Z]?\\.?)?)`,
  'i'
);
const INITIALS_RE = /([А-ЯЁA-Z]\.\s*[А-ЯЁA-Z]\.?\s+[А-ЯЁA-Z][а-яёa-z]+)/;
const NAME_LAST_RE = /([А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z]\.?\s*[А-ЯЁA-Z]?\.?)/;

const ROOM_PATTERNS = [
  /ауд\.?\s*([0-9]+[а-яa-z]*)/i,
  /спортзал/i,
  /(?:^|\s)(?:DIST|дист)\b/i,
  /(\d+-\d+[а-яa-z]*)/,
  /(\d{2,}[а-яa-z]?)/,
];

const TYPE_PATTERNS: { type: LessonType; re: RegExp }[] = [
  { type: 'lecture', re: /^лек/i },
  { type: 'lab', re: /^лаб/i },
  { type: 'exam', re: /^экз/i },
  { type: 'credit', re: /^зач/i },
  { type: 'practice', re: /^пр/i },
  { type: 'practice', re: /^сем/i },
];

function cleanLines(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map((l) => l.replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l && HAS_CONTENT_RE.test(l))
    .filter((l) => !MENU_LINE_RE.test(l));
}

function normTime(t: string): string {
  let s = t.replace('.', ':').trim();
  if (s.length === 4) s = '0' + s;
  return s;
}

function detectType(text: string): { type: LessonType; rest: string } {
  const trimmed = text.trim();
  for (const { type, re } of TYPE_PATTERNS) {
    const m = trimmed.match(re);
    if (m) {
      const rest = trimmed.slice(m[0].length).replace(/^[\s.,:-]+/, '').trim();
      return { type, rest };
    }
  }
  return { type: detectLessonType(trimmed), rest: trimmed };
}

function extractTeacher(text: string): { teacher: string; rest: string } {
  const rankMatch = text.match(TEACHER_RE);
  if (rankMatch) {
    const full = rankMatch[0].trim();
    const name = rankMatch[1].trim();
    const teacher = `${full.replace(name, '').trim()} ${name}`.replace(/\s+/g, ' ').trim();
    return { teacher, rest: text.replace(rankMatch[0], ' ').replace(/\s+/g, ' ').trim() };
  }
  const initials = text.match(INITIALS_RE);
  if (initials) {
    return {
      teacher: initials[1].trim(),
      rest: text.replace(initials[1], ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  const nameLast = text.match(NAME_LAST_RE);
  if (nameLast && /[А-ЯЁ]\./.test(nameLast[1])) {
    return {
      teacher: nameLast[1].trim(),
      rest: text.replace(nameLast[1], ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  return { teacher: '', rest: text };
}

function extractRoom(text: string): { room: string; rest: string } {
  for (const re of ROOM_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const room = (m[1] ?? m[0]).trim();
      return { room, rest: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  return { room: '', rest: text };
}

function extractSubgroup(subject: string): { subject: string; subgroup: string } {
  const m = subject.match(/п\/г\s*([0-9]+)/i);
  if (m) {
    return {
      subgroup: `п/г ${m[1]}`,
      subject: subject.replace(m[0], '').replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim(),
    };
  }
  return { subject, subgroup: '' };
}

interface Block {
  number: number;
  startTime: string;
  endTime: string;
  lines: string[];
}

interface WindowCard {
  number: number;
  room: string; // caption
}

// find window cards: a "N-я пара" marker and an "Окно" marker (optionally a
// "свобод…" caption) appearing on the same or adjacent lines, in any order,
// with no time (ЧЧ:ММ) involved; returns cards and their line ranges
function findWindows(lines: string[]): { windows: WindowCard[]; ranges: Array<[number, number]> } {
  const windows: WindowCard[] = [];
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < lines.length; i++) {
    if (TIME_RE.test(lines[i])) continue;
    const numMatch = lines[i].match(PAIR_NUM_RE);
    const hasSubj = WINDOW_SUBJECT_RE.test(lines[i]);
    const hasCap = WINDOW_CAPTION_RE.test(lines[i]);
    if (!numMatch && !hasSubj && !hasCap) continue;

    // look ahead a couple of lines for the remaining markers
    const next = lines.slice(i + 1, i + 3);
    const numIdx = numMatch ? -1 : next.findIndex((l) => PAIR_NUM_RE.test(l) && !TIME_RE.test(l));
    const subjIdx = hasSubj ? -1 : next.findIndex((l) => WINDOW_SUBJECT_RE.test(l));
    const capIdx = hasCap ? -1 : next.findIndex((l) => WINDOW_CAPTION_RE.test(l));

    const haveNum = numMatch || numIdx >= 0;
    const haveSubjFinal = hasSubj || (subjIdx >= 0 && subjIdx <= 1);
    if (!haveNum || !haveSubjFinal) continue;

    const used = [
      numIdx >= 0 ? i + 1 + numIdx : i,
      subjIdx >= 0 ? i + 1 + subjIdx : i,
      capIdx >= 0 ? i + 1 + capIdx : i,
    ];
    const end = Math.max(...used);
    windows.push({
      number: numMatch ? parseInt(numMatch[1], 10) : parseInt(next[numIdx].match(PAIR_NUM_RE)![1], 10),
      room: hasCap || capIdx >= 0 ? (capIdx >= 0 ? next[capIdx] : lines[i]) : WINDOW_DEFAULT_CAPTION,
    });
    ranges.push([i, end]);
    i = end;
  }
  return { windows, ranges };
}

function splitIntoBlocks(lines: string[]): { blocks: Block[]; windows: WindowCard[] } {
  const { windows, ranges } = findWindows(lines);
  const inWindow = (idx: number) => ranges.some(([a, b]) => idx >= a && idx <= b);

  const timeIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TIME_RE.test(lines[i])) timeIndices.push(i);
  }

  const blocks: Block[] = [];
  for (let bi = 0; bi < timeIndices.length; bi++) {
    const start = timeIndices[bi] + 1;
    const end = bi + 1 < timeIndices.length ? timeIndices[bi + 1] : lines.length;
    const bodyLines = lines
      .slice(start, end)
      .map((l, k) => ({ l: l.trim(), idx: start + k }))
      .filter(({ l }) => l && HAS_CONTENT_RE.test(l))
      .filter(({ idx }) => !inWindow(idx))
      .map(({ l }) => l);

    const tm = lines[timeIndices[bi]].match(TIME_RE);
    if (!tm) continue;

    // pair number ("1-я пара") sits inside the block body — take it out
    let number = bi + 1;
    const numIdx = bodyLines.findIndex((l) => PAIR_NUM_RE.test(l));
    if (numIdx >= 0) {
      number = parseInt(bodyLines[numIdx].match(PAIR_NUM_RE)![1], 10);
      bodyLines.splice(numIdx, 1);
    }

    blocks.push({
      number,
      startTime: normTime(tm[1]),
      endTime: normTime(tm[2]),
      lines: bodyLines,
    });
  }
  return { blocks, windows };
}

function isRoomLine(line: string): boolean {
  return (
    /^ауд\.?/i.test(line) ||
    /^спортзал/i.test(line) ||
    /^(DIST|дист)\b/i.test(line) ||
    /^\d+-\d+[а-яa-z]*$/i.test(line) ||
    /^\d{2,}[а-яa-z]?$/i.test(line)
  );
}

// remove a room number duplicated into the subject ("Высшая математика 10-333")
function stripRoom(subject: string): { subject: string; room: string } {
  const m = subject.match(/\b\d+-\d+[а-яa-z]*\b/i);
  if (m) {
    return {
      subject: subject.replace(m[0], ' ').replace(/\s{2,}/g, ' ').replace(/\s*[,,]\s*$/, '').trim(),
      room: m[0],
    };
  }
  return { subject, room: '' };
}

// expected block layout after the time line:
//   1. type + subject ("пр Высшая математика, п/г 1")
//   2. teacher ("доц. Лановая А.В." / "зав.каф.Бакурадзе А.Б.")
//   3. room ("10-506" / "DIST" / "дист")
function parseBlock(block: Block): ParsedLesson {
  const lines = [...block.lines];

  const firstLine = lines.shift() ?? '';
  const { type, rest: subjectRaw } = detectType(firstLine);

  let teacher = '';
  const teacherIdx = lines.findIndex((l) => TEACHER_RE.test(l) || INITIALS_RE.test(l));
  if (teacherIdx >= 0) {
    teacher = extractTeacher(lines[teacherIdx]).teacher;
    lines.splice(teacherIdx, 1);
  }

  let room = '';
  const roomIdx = lines.findIndex(isRoomLine);
  if (roomIdx >= 0) {
    room = extractRoom(lines[roomIdx]).room;
    lines.splice(roomIdx, 1);
  }

  const joined = [subjectRaw, ...lines].join(' ').replace(/\s+/g, ' ').trim();
  if (!teacher) teacher = extractTeacher(joined).teacher;
  if (!room) room = extractRoom(joined).room;

  let subject = joined.replace(/[,\s]+$/, '').replace(/\s+/g, ' ');

  // the room may be duplicated into the subject text — cut it out either way
  const stripped = stripRoom(subject);
  if (stripped.room) {
    subject = stripped.subject;
    if (!room) room = stripped.room;
  }

  const sg = extractSubgroup(subject);

  return {
    number: block.number,
    startTime: block.startTime,
    endTime: block.endTime,
    type,
    subject: sg.subject.trim() || 'Предмет',
    subgroup: sg.subgroup,
    teacher: teacher.trim(),
    room: room.trim(),
  };
}

export function parseOcrText(text: string): ParsedLesson[] {
  const lines = cleanLines(text);
  if (lines.length === 0) return [];

  // drop everything before the first time occurrence (day/date headers etc.)
  const firstTimeIdx = lines.findIndex((l) => TIME_RE.test(l));
  const scope = firstTimeIdx >= 0 ? lines.slice(firstTimeIdx) : lines;

  const { blocks, windows } = splitIntoBlocks(scope);

  const lessons = blocks
    .map(parseBlock)
    .filter((p) => !SUBGROUP2_RE.test(p.subgroup) && !SUBGROUP2_RE.test(p.subject))
    .sort((a, b) => a.number - b.number);

  const windowLessons: ParsedLesson[] = windows.map((w) => ({
    number: w.number,
    startTime: '',
    endTime: '',
    type: 'practice',
    subject: 'Окно',
    subgroup: '',
    teacher: '',
    room: w.room,
  }));

  return [...lessons, ...windowLessons].sort((a, b) => a.number - b.number);
}

export function parsedToLesson(p: ParsedLesson, date: string): Lesson {
  if (p.subject === 'Окно' || p.startTime === '') {
    return {
      id: uid(),
      date,
      startTime: '',
      endTime: '',
      number: p.number,
      subject: 'Окно',
      type: 'practice',
      teacher: '',
      room: p.room,
      homework: null,
      isWindow: true,
    };
  }
  return {
    id: uid(),
    date,
    startTime: p.startTime,
    endTime: p.endTime,
    number: p.number,
    subject: p.subject,
    subgroup: p.subgroup || undefined,
    type: p.type,
    teacher: p.teacher,
    room: p.room,
    homework: null,
  };
}
