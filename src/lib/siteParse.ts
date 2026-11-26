import type { LessonType } from '@/types';
import { detectType, extractTeacher, type ParsedLesson } from './ocr';

export interface ParsedDay {
  date: string; // YYYY-MM-DD
  lessons: ParsedLesson[];
}

export const DEFAULT_SCHEDULE_URL =
  'https://dec.mgutm.ru/Rasp/Rasp.aspx?group=33602&sem=1';

const URL_STORAGE_KEY = 'schedule-site-url';

export function getScheduleUrl(): string {
  try {
    return localStorage.getItem(URL_STORAGE_KEY) || DEFAULT_SCHEDULE_URL;
  } catch {
    return DEFAULT_SCHEDULE_URL;
  }
}

export function setScheduleUrl(url: string): void {
  try {
    const trimmed = url.trim();
    if (trimmed) localStorage.setItem(URL_STORAGE_KEY, trimmed);
    else localStorage.removeItem(URL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// The schedule page has no CORS headers, so it is fetched through public
// proxies. The portal's JSON API endpoint is tried first, then the HTML page.
const PROXIES = [
  (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
];

// thrown when every source/proxy combo answered 403 — the site blocks
// proxy (foreign-IP) requests; the user can paste the page text instead
export class ScheduleBlockedError extends Error {
  constructor() {
    super('403');
  }
}

export function extractIdGroup(url: string): string | null {
  const m = url.match(/[?&]group=(\d+)/i);
  return m ? m[1] : null;
}

async function fetchWithTimeout(url: string, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// try one URL through every proxy, return the first response text
async function fetchViaProxies(url: string): Promise<string> {
  let lastError = 'Не удалось загрузить страницу';
  let saw403 = false;
  for (const wrap of PROXIES) {
    try {
      const resp = await fetchWithTimeout(wrap(url));
      if (!resp.ok) {
        if (resp.status === 403) saw403 = true;
        lastError = `сервер вернул ошибку ${resp.status}`;
        continue;
      }
      const text = await resp.text();
      if (text.trim()) return text;
      lastError = 'ответ пуст';
    } catch (err) {
      lastError =
        err instanceof Error && err.name === 'AbortError'
          ? 'превышено время ожидания'
          : err instanceof Error
            ? err.message
            : String(err);
    }
  }
  if (saw403) throw new ScheduleBlockedError();
  throw new Error(lastError);
}

// fetch the schedule (API endpoint first, then the HTML page) and parse it;
// returns the first source that yields at least one day
export async function fetchScheduleDays(url: string): Promise<ParsedDay[]> {
  const idGroup = extractIdGroup(url);
  const sources: string[] = [];
  if (idGroup) sources.push(`https://dec.mgutm.ru/api/Rasp?idGroup=${idGroup}`);
  sources.push(url);

  let lastError: unknown = null;
  let blocked = false;
  for (const src of sources) {
    let text: string;
    try {
      text = await fetchViaProxies(src);
    } catch (err) {
      if (err instanceof ScheduleBlockedError) {
        blocked = true;
        lastError = err;
      } else {
        lastError = err;
      }
      continue;
    }
    const days = parseSiteSchedule(text);
    if (days.length > 0) return days;
    lastError = new Error('в ответе не найдено даты расписания');
  }
  if (blocked) throw new ScheduleBlockedError();
  throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить расписание');
}

// --- parsing ---

const DATE_RE = /\b(\d{2})\.(\d{2})\.(\d{4})\b/;
const TIME_ONLY_RE = /^(\d{1,2})[:.](\d{2})$/;
const SUBGROUP_RE = /п\/г\s*([0-9]+)/i;
const SUBGROUP2_RE = /п\/г\s*2/i;
const NOISE_RE = /[^A-Za-zА-ЯЁа-яё0-9\s.,:;()№#'"«»/+-]+/gu;
const HAS_CONTENT_RE = /[A-Za-zА-ЯЁа-яё0-9]/;

// lesson start time → pair number (as on dec.mgutm.ru)
const START_TO_PAIR: Record<string, number> = {
  '09:00': 1,
  '10:40': 2,
  '12:40': 3,
  '14:20': 4,
  '16:20': 5,
  '18:00': 6,
};

function htmlToLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body) return [];
  body.querySelectorAll('script,style,noscript').forEach((el) => el.remove());
  body.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
  // force line breaks after block/cell elements so textContent keeps structure
  body.querySelectorAll('td,th,tr,div,p,li,h1,h2,h3,h4').forEach((el) => el.append('\n'));
  return (body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n+/)
    .map((l) => l.replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l && HAS_CONTENT_RE.test(l));
}

function normTime(h: string, m: string): string {
  return `${h.padStart(2, '0')}:${m}`;
}

export function parseSiteSchedule(html: string): ParsedDay[] {
  const lines = htmlToLines(html);
  const days: ParsedDay[] = [];

  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(DATE_RE);
    if (!dm) continue;
    const dateKey = `${dm[3]}-${dm[2]}-${dm[1]}`;
    let day = days.find((d) => d.date === dateKey);
    if (!day) {
      day = { date: dateKey, lessons: [] };
      days.push(day);
    }

    let j = i + 1;
    while (j < lines.length && !DATE_RE.test(lines[j])) {
      const t1 = lines[j].match(TIME_ONLY_RE);
      const t2 = j + 1 < lines.length ? lines[j + 1].match(TIME_ONLY_RE) : null;
      if (!t1 || !t2) {
        j++;
        continue;
      }

      // two consecutive time-only lines → one lesson: start + end
      const startTime = normTime(t1[1], t1[2]);
      const endTime = normTime(t2[1], t2[2]);
      j += 2;

      let subject = '';
      let subgroup = '';
      let teacher = '';
      let room = '';
      let type: LessonType = 'practice';
      let skip = false;

      while (j < lines.length && !DATE_RE.test(lines[j])) {
        const n1 = lines[j].match(TIME_ONLY_RE);
        const n2 = j + 1 < lines.length ? lines[j + 1].match(TIME_ONLY_RE) : null;
        if (n1 && n2) break; // next lesson starts
        const line = lines[j];
        j++;

        // lessons of subgroup 2 are ignored entirely
        if (SUBGROUP2_RE.test(line)) {
          skip = true;
          continue;
        }
        // standalone subgroup marker ("п/г 1")
        const sgOnly = line.match(/^\s*п\/г\s*([0-9]+)\s*$/i);
        if (sgOnly) {
          if (!subgroup) subgroup = `п/г ${sgOnly[1]}`;
          continue;
        }
        if (!subject) {
          const det = detectType(line);
          type = det.type;
          subject = det.rest.trim() || line.trim();
          const sg = subject.match(SUBGROUP_RE);
          if (sg) {
            subgroup = `п/г ${sg[1]}`;
            subject = subject.replace(sg[0], '').replace(/[,\s]+$/, '').trim();
          }
          continue;
        }
        if (!teacher) {
          const t = extractTeacher(line);
          if (t.teacher) {
            teacher = t.teacher;
            continue;
          }
        }
        if (!room) {
          const aud = line.match(/^ауд\.?\s*(.+)$/i);
          if (aud) {
            room = aud[1].trim();
            continue;
          }
          if (/^спортзал$/i.test(line)) {
            room = 'спортзал';
            continue;
          }
          if (/^(DIST|дист)$/i.test(line)) {
            room = 'DIST';
            continue;
          }
        }
        // unrecognized trailing line — try teacher once more, else append
        if (!teacher) {
          const t = extractTeacher(line);
          if (t.teacher) {
            teacher = t.teacher;
            continue;
          }
        }
        subject = `${subject} ${line}`.trim();
      }

      if (!subject || skip || SUBGROUP2_RE.test(subject)) continue;
      day.lessons.push({
        number: START_TO_PAIR[startTime] ?? day.lessons.length + 1,
        startTime,
        endTime,
        type,
        subject,
        subgroup,
        teacher,
        room,
      });
    }
  }

  return days;
}
