import { AdmitCardRecord, ExamType } from '../types/admitCard';

export type SchoolCodeClassLock = '10TH_ONLY' | '12TH_ONLY' | 'BOTH';

export interface SchoolCodeRule {
  code: string;
  lock: SchoolCodeClassLock;
  updatedAt: string;
}

export interface SchoolCodePair {
  id: string;
  schoolName: string;
  matricCode: string;
  interCode: string;
}

export interface EffectiveCodeLock {
  code: string;
  lock: SchoolCodeClassLock;
  source: 'manual' | 'auto';
}

export interface CodeValidationResult {
  valid: boolean;
  code: string;
  lock: SchoolCodeClassLock | null;
  lockSource?: 'manual' | 'auto';
  reason?: string;
  suggestedCode?: string;
}

export interface UploadCodeViolation {
  code: string;
  lockedTo: '10TH_ONLY' | '12TH_ONLY';
  uploadedClass: ExamType;
  count: number;
  suggestedCode?: string;
}

export interface UploadBatchAnalysis {
  needsConfirmation: boolean;
  hasCodeViolation: boolean;
  hasTabMismatch: boolean;
  activeModule: 'INTERMEDIATE' | 'MATRIC';
  matricCount: number;
  interCount: number;
  detectedCodes: string[];
  codeViolations: UploadCodeViolation[];
  validRecords: AdmitCardRecord[];
  violatingRecords: AdmitCardRecord[];
}

const RULES_STORAGE_KEY = 'bseb_school_code_class_locks_v1';
const PAIRS_STORAGE_KEY = 'bseb_school_code_pairs_v1';

export function normalizeSchoolCode(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim().toUpperCase();
  const digits = trimmed.replace(/\D/g, '');
  // Standard BSEB school/college codes are 5 digits; prefer pure digits if present
  if (digits.length >= 4 && digits.length <= 6) {
    return digits;
  }
  return trimmed;
}

export function loadSchoolCodeRules(): Record<string, SchoolCodeRule> {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, SchoolCodeRule>;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

export function saveSchoolCodeRules(rules: Record<string, SchoolCodeRule>): void {
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore storage errors
  }
}

export function loadSchoolCodePairs(): SchoolCodePair[] {
  try {
    const raw = localStorage.getItem(PAIRS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (p): p is SchoolCodePair =>
          Boolean(p && typeof p.matricCode === 'string' && typeof p.interCode === 'string')
      );
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function saveSchoolCodePairs(pairs: SchoolCodePair[]): void {
  try {
    localStorage.setItem(PAIRS_STORAGE_KEY, JSON.stringify(pairs));
  } catch {
    // ignore storage errors
  }
}

/**
 * Determines the effective class lock for a given school code:
 * 1. Manual rule set by Admin takes highest priority.
 * 2. Otherwise auto-inferred from existing saved student records for that code.
 */
export function getEffectiveCodeLock(
  rawCode: string,
  records: AdmitCardRecord[],
  manualRules: Record<string, SchoolCodeRule>,
  pairs: SchoolCodePair[] = []
): EffectiveCodeLock | null {
  const code = normalizeSchoolCode(rawCode);
  if (!code || code === 'UNKNOWN') return null;

  const manual = manualRules[code];
  if (manual) {
    return { code, lock: manual.lock, source: 'manual' };
  }

  // If explicitly paired as Matric or Inter code, enforce that role unless overridden manually
  const asMatricPair = pairs.some((p) => normalizeSchoolCode(p.matricCode) === code);
  const asInterPair = pairs.some((p) => normalizeSchoolCode(p.interCode) === code);
  if (asMatricPair && !asInterPair) {
    return { code, lock: '10TH_ONLY', source: 'manual' };
  }
  if (asInterPair && !asMatricPair) {
    return { code, lock: '12TH_ONLY', source: 'manual' };
  }

  let matricCount = 0;
  let interCount = 0;
  for (const r of records) {
    const rCode = normalizeSchoolCode(r.schoolCode || r.rollCode);
    if (rCode !== code) continue;
    if (r.examType === 'MATRIC (10th)') matricCount++;
    else if (r.examType === 'INTERMEDIATE (+2)') interCount++;
  }

  if (matricCount > 0 && interCount === 0) {
    return { code, lock: '10TH_ONLY', source: 'auto' };
  }
  if (interCount > 0 && matricCount === 0) {
    return { code, lock: '12TH_ONLY', source: 'auto' };
  }
  if (matricCount > 0 && interCount > 0) {
    return { code, lock: 'BOTH', source: 'auto' };
  }

  return null;
}

/**
 * Finds the best valid school code for a target examType (e.g. if user tried 51803 for 12th, suggests 31337).
 */
export function findSuggestedCodeForClass(
  targetExamType: ExamType,
  conflictingCode: string,
  records: AdmitCardRecord[],
  manualRules: Record<string, SchoolCodeRule>,
  pairs: SchoolCodePair[] = []
): string | undefined {
  const normConflict = normalizeSchoolCode(conflictingCode);

  // 1. Check linked school code pair first
  for (const pair of pairs) {
    const mCode = normalizeSchoolCode(pair.matricCode);
    const iCode = normalizeSchoolCode(pair.interCode);
    if (targetExamType === 'INTERMEDIATE (+2)' && mCode === normConflict && iCode) {
      return iCode;
    }
    if (targetExamType === 'MATRIC (10th)' && iCode === normConflict && mCode) {
      return mCode;
    }
  }

  // 2. Check existing records of the target class
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.examType !== targetExamType) continue;
    const c = normalizeSchoolCode(r.schoolCode || r.rollCode);
    if (!c || c === normConflict || c === 'UNKNOWN') continue;
    const eff = getEffectiveCodeLock(c, records, manualRules, pairs);
    if (
      (targetExamType === 'MATRIC (10th)' && eff?.lock === '12TH_ONLY') ||
      (targetExamType === 'INTERMEDIATE (+2)' && eff?.lock === '10TH_ONLY')
    ) {
      continue;
    }
    counts.set(c, (counts.get(c) || 0) + 1);
  }

  let bestCode: string | undefined;
  let bestCount = 0;
  counts.forEach((cnt, c) => {
    if (cnt > bestCount) {
      bestCount = cnt;
      bestCode = c;
    }
  });
  if (bestCode) return bestCode;

  // 3. Check manual rules matching target class
  const desiredLock: SchoolCodeClassLock =
    targetExamType === 'MATRIC (10th)' ? '10TH_ONLY' : '12TH_ONLY';
  for (const rule of Object.values(manualRules)) {
    if (rule.lock === desiredLock && rule.code !== normConflict) {
      return rule.code;
    }
  }

  return undefined;
}

/**
 * Validates whether a school code is allowed for the specified ExamType.
 */
export function validateCodeForExamType(
  rawCode: string,
  examType: ExamType,
  records: AdmitCardRecord[],
  manualRules: Record<string, SchoolCodeRule>,
  pairs: SchoolCodePair[] = []
): CodeValidationResult {
  const code = normalizeSchoolCode(rawCode);
  if (!code) {
    return { valid: true, code: '', lock: null };
  }

  const effective = getEffectiveCodeLock(code, records, manualRules, pairs);
  if (!effective || effective.lock === 'BOTH') {
    return {
      valid: true,
      code,
      lock: effective?.lock ?? null,
      lockSource: effective?.source,
    };
  }

  if (effective.lock === '10TH_ONLY' && examType === 'INTERMEDIATE (+2)') {
    const suggestedCode = findSuggestedCodeForClass(
      'INTERMEDIATE (+2)',
      code,
      records,
      manualRules,
      pairs
    );
    return {
      valid: false,
      code,
      lock: '10TH_ONLY',
      lockSource: effective.source,
      suggestedCode,
      reason: suggestedCode
        ? `Code ${code} sirf 10th Matric ke liye locked hai. 12th Inter ka data Code ${suggestedCode} me rakhein.`
        : `Code ${code} sirf 10th Matric ke liye locked hai. Isme 12th Inter ka data allow nahi hai.`,
    };
  }

  if (effective.lock === '12TH_ONLY' && examType === 'MATRIC (10th)') {
    const suggestedCode = findSuggestedCodeForClass(
      'MATRIC (10th)',
      code,
      records,
      manualRules,
      pairs
    );
    return {
      valid: false,
      code,
      lock: '12TH_ONLY',
      lockSource: effective.source,
      suggestedCode,
      reason: suggestedCode
        ? `Code ${code} sirf 12th Inter ke liye locked hai. 10th Matric ka data Code ${suggestedCode} me rakhein.`
        : `Code ${code} sirf 12th Inter ke liye locked hai. Isme 10th Matric ka data allow nahi hai.`,
    };
  }

  return {
    valid: true,
    code,
    lock: effective.lock,
    lockSource: effective.source,
  };
}

/**
 * Inspects an extracted PDF upload batch BEFORE committing it to state / Firestore.
 * Flags both:
 * 1) Code-to-Class lock violations (e.g. 12th student tagged with 10th-only code 51803)
 * 2) Active-module mismatch (e.g. user is inside 10th Matric tab and uploaded a 12th Inter PDF)
 */
export function analyzeUploadBatchMismatch(
  batchRecords: AdmitCardRecord[],
  activeModule: 'INTERMEDIATE' | 'MATRIC',
  activeTab: string,
  existingRecords: AdmitCardRecord[],
  manualRules: Record<string, SchoolCodeRule>,
  pairs: SchoolCodePair[] = []
): UploadBatchAnalysis {
  let matricCount = 0;
  let interCount = 0;
  const codeSet = new Set<string>();
  const violationMap = new Map<string, UploadCodeViolation>();
  const validRecords: AdmitCardRecord[] = [];
  const violatingRecords: AdmitCardRecord[] = [];

  for (const rec of batchRecords) {
    if (rec.examType === 'MATRIC (10th)') matricCount++;
    else interCount++;

    const code = normalizeSchoolCode(rec.schoolCode || rec.rollCode);
    if (code) codeSet.add(code);

    const check = validateCodeForExamType(
      code,
      rec.examType,
      existingRecords,
      manualRules,
      pairs
    );

    if (!check.valid && (check.lock === '10TH_ONLY' || check.lock === '12TH_ONLY')) {
      violatingRecords.push(rec);
      const key = `${code}__${rec.examType}`;
      const existing = violationMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        violationMap.set(key, {
          code,
          lockedTo: check.lock,
          uploadedClass: rec.examType,
          count: 1,
          suggestedCode: check.suggestedCode,
        });
      }
    } else {
      validRecords.push(rec);
    }
  }

  const codeViolations = Array.from(violationMap.values());
  const hasCodeViolation = codeViolations.length > 0;

  // Check active tab/module mismatch when user is working inside a class-specific module
  // (skip warning only if workspace is completely empty on first-ever upload or on universal dashboard)
  const isClassSpecificContext = activeTab !== 'dashboard' && existingRecords.length > 0;
  const hasTabMismatch =
    isClassSpecificContext &&
    ((activeModule === 'MATRIC' && interCount > 0) ||
      (activeModule === 'INTERMEDIATE' && matricCount > 0));

  return {
    needsConfirmation: hasCodeViolation || hasTabMismatch,
    hasCodeViolation,
    hasTabMismatch,
    activeModule,
    matricCount,
    interCount,
    detectedCodes: Array.from(codeSet),
    codeViolations,
    validRecords,
    violatingRecords,
  };
}

export function getLockBadgeLabel(lock: SchoolCodeClassLock | null): string {
  if (lock === '10TH_ONLY') return '10th Only';
  if (lock === '12TH_ONLY') return '12th Only';
  if (lock === 'BOTH') return '10th + 12th';
  return 'Auto';
}
