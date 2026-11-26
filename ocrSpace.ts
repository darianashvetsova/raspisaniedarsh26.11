// OCR.space API client — sends image to https://api.ocr.space/parse/image
// as base64. Tries OCREngine 2 first, retries with OCREngine 1 on failure.
// Uses free 'helloworld' key by default, or a user-provided key from localStorage.

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';
const DEFAULT_API_KEY = 'helloworld';
const STORAGE_KEY = 'ocr-space-api-key';

export function getOcrApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_KEY;
  } catch {
    return DEFAULT_API_KEY;
  }
}

export function setOcrApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export interface OcrResult {
  text: string;
  exitCode: number;
  error: string | null;
}

interface OcrSpaceResponse {
  OCRExitCode?: number;
  ExitCode?: number;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
  ParsedResults?: Array<{ ParsedText?: string }>;
}

function buildFormData(apiKey: string, base64Image: string, engine: '1' | '2'): FormData {
  const formData = new FormData();
  formData.append('apikey', apiKey);
  formData.append('base64Image', base64Image);
  formData.append('language', 'rus');
  formData.append('isOverlayRequired', 'false');
  formData.append('scale', 'true');
  formData.append('OCREngine', engine);
  return formData;
}

function extractErrorMessage(data: OcrSpaceResponse, exitCode: number): string {
  const parts: string[] = [];
  if (Array.isArray(data.ErrorMessage)) {
    parts.push(...data.ErrorMessage.filter(Boolean));
  } else if (typeof data.ErrorMessage === 'string' && data.ErrorMessage.trim()) {
    parts.push(data.ErrorMessage.trim());
  }
  if (data.ErrorDetails?.trim()) parts.push(data.ErrorDetails.trim());
  if (parts.length === 0) {
    parts.push(`OCR.space вернул ошибку (ExitCode ${exitCode})`);
  }
  return parts.join('; ');
}

async function requestOcr(apiKey: string, base64Image: string, engine: '1' | '2') {
  const resp = await fetch(OCR_SPACE_URL, {
    method: 'POST',
    body: buildFormData(apiKey, base64Image, engine),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }

  const data: OcrSpaceResponse = await resp.json();
  const exitCode = data.OCRExitCode ?? data.ExitCode ?? -1;
  const errored = data.IsErroredOnProcessing === true || exitCode !== 1;

  return { data, exitCode, errored };
}

export async function recognizeImage(dataUrl: string): Promise<OcrResult> {
  const apiKey = getOcrApiKey();

  let lastError = '';
  let lastExitCode = -1;

  for (const engine of ['2', '1'] as const) {
    try {
      const { data, exitCode, errored } = await requestOcr(apiKey, dataUrl, engine);

      if (!errored) {
        const text = (data.ParsedResults ?? []).map((r) => r.ParsedText ?? '').join('\n');
        if (text.trim()) {
          return { text, exitCode, error: null };
        }
        lastError = 'Текст не распознан';
        lastExitCode = exitCode;
        continue;
      }

      lastError = extractErrorMessage(data, exitCode);
      lastExitCode = exitCode;
      console.error(`OCR.space error (OCREngine ${engine}):`, lastError, data);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastExitCode = -1;
      console.error(`OCR.space request failed (OCREngine ${engine}):`, err);
    }
  }

  return { text: '', exitCode: lastExitCode, error: lastError };
}
