import {
  AdmitCardRecord,
  ClerkAssignment,
  InterSentUpMarks,
  MatricSentUpMarks,
  TeacherAssignment,
} from '../types/admitCard';
import {
  getEffectiveInterSentUp,
  getStudentRegisteredSubjects,
} from './marksAndFormat';

/**
 * Extracts a clean uppercase BSEB school/roll code (e.g. "31337 - UCHCH..." -> "31337", " 51803 " -> "51803")
 * so Admin assignments, Student records, and Teacher Portal filtering always match consistently.
 */
export function normalizeSchoolCode(schoolCode?: string, rollCode?: string): string {
  const candidates = [schoolCode, rollCode];
  for (const raw of candidates) {
    const trimmed = (raw || '').trim().toUpperCase();
    if (!trimmed || trimmed === 'N/A' || trimmed === 'UNKNOWN' || trimmed === '---') continue;
    const prefixCode = trimmed.match(/^([A-Z0-9]{4,8})\s*[-–:|/]\s*/);
    if (prefixCode) return prefixCode[1];
    const numericMatch = trimmed.match(/(?:^|\D)(\d{4,6})(?:\D|$)/);
    if (numericMatch) return numericMatch[1];
    return trimmed;
  }
  return '';
}

/**
 * Normalizes any BSEB subject string (e.g. "117 - Physics", "117-PHYSICS", "319- H.Sc.", "MIL - HINDI")
 * to a canonical lowercase subject key so Admin assignments, Admit Card slots, and Sent-Up Panji slots always match.
 */
export function canonicalSubjectKey(raw: string): string {
  const cleaned = (raw || '')
    .toLowerCase()
    .replace(/^[0-9]+\s*[-–:]\s*/, '')
    .replace(/^(mil|sil|sub|opt|addl|comp|elec|mt|nlh)\s*[-–:]\s*/i, '')
    .replace(/\((comp|opt|addl|mt|th|pr|theory|practical|mil|sil)\)/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!cleaned || cleaned === 'n a' || cleaned === 'na') return '';

  const compact = cleaned.replace(/\s+/g, ' ');

  if (/^(phy|physics)$/.test(compact) || compact.includes('physics')) return 'physics';
  if (/^(chem|chemistry)$/.test(compact) || compact.includes('chemistry')) return 'chemistry';
  if (/^(bio|biology)$/.test(compact) || compact.includes('biology')) return 'biology';
  if (/^(mat|math|maths|mathematics)$/.test(compact) || compact.includes('math')) return 'mathematics';
  if (/^(h sc|hsc|home sc|home sci|home science)$/.test(compact) || compact.includes('home sc')) return 'home science';
  if (/^(pol sc|pol sci|political sc|political science)$/.test(compact) || compact.includes('pol')) return 'political science';
  if (/^(bus std|bst|business std|business studies|business study)$/.test(compact) || compact.includes('business')) return 'business studies';
  if (/^(entp|eps|entrepreneurship)$/.test(compact) || compact.includes('entre')) return 'entrepreneurship';
  if (/^(acc|account|accountancy|accounts)$/.test(compact) || compact.includes('account')) return 'accountancy';
  if (
    /^(ssc|sst|s st|soc sc|soc sci|soc science|social sc|social sci|social science)$/.test(compact) ||
    compact.includes('social') ||
    compact.includes('soc sc')
  ) {
    return 'social science';
  }
  if (/^(sci|science)(\s+comp)?$/.test(compact) || (compact.includes('science') && !compact.includes('home') && !compact.includes('political') && !compact.includes('social') && !compact.includes('computer'))) {
    return 'science';
  }
  if (/^(eng|english)(\s+comp)?$/.test(compact) || compact.includes('english')) return 'english';
  if (/^(hin|hindi|mil|mt hindi|non hindi|nlh)$/.test(compact) || compact.includes('hindi')) return 'hindi';
  if (/^(san|sanskrit|sil)$/.test(compact) || compact.includes('sanskrit')) return 'sanskrit';
  if (/^(urd|urdu)$/.test(compact) || compact.includes('urdu')) return 'urdu';
  if (/^(mai|maithili)$/.test(compact) || compact.includes('maithili')) return 'maithili';
  if (/^(hist|history)$/.test(compact) || compact.includes('history')) return 'history';
  if (/^(geo|geog|geography)$/.test(compact) || compact.includes('geog')) return 'geography';
  if (/^(psy|psych|psychology)$/.test(compact) || compact.includes('psych')) return 'psychology';
  if (/^(soc|socio|sociology)$/.test(compact) || compact.includes('socio')) return 'sociology';
  if (/^(eco|econ|economics)$/.test(compact) || compact.includes('econ')) return 'economics';
  if (/^(phil|philosophy)$/.test(compact) || compact.includes('phil')) return 'philosophy';
  if (/^(mus|music)$/.test(compact) || compact.includes('music')) return 'music';
  if (/^(agri|agriculture)$/.test(compact) || compact.includes('agricult')) return 'agriculture';
  if (/^(comp|computer|computer science)$/.test(compact) || compact.includes('computer')) return 'computer science';

  return compact;
}

/**
 * Extracts unique registered subjects for a student record.
 */
export function getRecordSubjectList(
  record: AdmitCardRecord
): Array<{ key: string; label: string }> {
  const rawNames: string[] = [];

  for (const slot of getStudentRegisteredSubjects(record)) {
    if (slot.subjectName) rawNames.push(slot.subjectName);
  }

  if (record.allSubjectsSummary) {
    record.allSubjectsSummary
      .split(/[,;|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => rawNames.push(s));
  }

  if (record.examType === 'INTERMEDIATE (+2)') {
    const eff = getEffectiveInterSentUp(record);
    [
      eff.lang1Subject,
      eff.lang2Subject,
      eff.elective1Subject,
      eff.elective2Subject,
      eff.elective3Subject,
      eff.additionalSubject,
      eff.vocationalSubject,
    ].forEach((s) => {
      if (s && s !== '---' && s !== 'N/A') rawNames.push(s);
    });
  }

  if (record.examType === 'MATRIC (10th)') {
    // Every BSEB Matric student takes core subjects (Math, Science, Social Science, English) + MIL/SIL
    if (!record.langSubject1) rawNames.push('MIL - HINDI');
    if (!record.langSubject2) rawNames.push('SIL - SANSKRIT');
    rawNames.push('MATHEMATICS', 'SCIENCE', 'SOCIAL SCIENCE', 'ENGLISH');
  }

  const byKey = new Map<string, string>();
  for (const raw of rawNames) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '---' || trimmed === '-' || trimmed.toUpperCase() === 'N/A') continue;
    const key = canonicalSubjectKey(trimmed);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || trimmed.length > prev.length) {
      byKey.set(key, trimmed);
    }
  }

  return Array.from(byKey.entries()).map(([key, label]) => ({ key, label }));
}

export function studentMatchesAssignedSubject(
  record: AdmitCardRecord,
  assignedSubject: string
): boolean {
  const targetKey = canonicalSubjectKey(assignedSubject);
  if (!targetKey) return false;
  return getRecordSubjectList(record).some((s) => s.key === targetKey);
}

/**
 * Checks whether a 12th Intermediate subject typically carries Practical marks in BSEB.
 */
export function isInterPracticalSubject(subjectName: string): boolean {
  const k = canonicalSubjectKey(subjectName);
  return [
    'physics',
    'chemistry',
    'biology',
    'agriculture',
    'computer science',
    'home science',
    'geography',
    'psychology',
    'music',
  ].includes(k);
}

export interface InterSubjectSlotMatch {
  slotType: 'LANG' | 'ELECTIVE' | 'ADDITIONAL' | 'VOCATIONAL';
  subjectLabel: string;
  theoryKey: keyof InterSentUpMarks;
  practicalKey?: keyof InterSentUpMarks;
  hasPractical: boolean;
  maxTheory: number;
  maxPractical: number;
}

/**
 * Maps an assigned subject name to the exact InterSentUpMarks fields on a 12th student.
 */
export function findInterSubjectSlot(
  record: AdmitCardRecord,
  assignedSubject: string
): InterSubjectSlotMatch | null {
  const targetKey = canonicalSubjectKey(assignedSubject);
  if (!targetKey) return null;

  const eff = getEffectiveInterSentUp(record);

  if (
    canonicalSubjectKey(eff.lang1Subject) === targetKey ||
    canonicalSubjectKey(record.langSubject1) === targetKey
  ) {
    return {
      slotType: 'LANG',
      subjectLabel: eff.lang1Subject || record.langSubject1 || assignedSubject,
      theoryKey: 'lang1Marks',
      hasPractical: false,
      maxTheory: 100,
      maxPractical: 0,
    };
  }

  if (
    canonicalSubjectKey(eff.lang2Subject) === targetKey ||
    canonicalSubjectKey(record.langSubject2) === targetKey
  ) {
    return {
      slotType: 'LANG',
      subjectLabel: eff.lang2Subject || record.langSubject2 || assignedSubject,
      theoryKey: 'lang2Marks',
      hasPractical: false,
      maxTheory: 100,
      maxPractical: 0,
    };
  }

  const electiveCandidates: Array<{
    subj: string;
    admitSubj: string;
    theoryKey: keyof InterSentUpMarks;
    practicalKey: keyof InterSentUpMarks;
    slotType: 'ELECTIVE' | 'ADDITIONAL' | 'VOCATIONAL';
  }> = [
    {
      subj: eff.elective1Subject,
      admitSubj: record.compulsorySubject1,
      theoryKey: 'elective1Theory',
      practicalKey: 'elective1Practical',
      slotType: 'ELECTIVE',
    },
    {
      subj: eff.elective2Subject,
      admitSubj: record.compulsorySubject2,
      theoryKey: 'elective2Theory',
      practicalKey: 'elective2Practical',
      slotType: 'ELECTIVE',
    },
    {
      subj: eff.elective3Subject,
      admitSubj: record.compulsorySubject3,
      theoryKey: 'elective3Theory',
      practicalKey: 'elective3Practical',
      slotType: 'ELECTIVE',
    },
    {
      subj: eff.additionalSubject,
      admitSubj: record.additionalSubject,
      theoryKey: 'additionalTheory',
      practicalKey: 'additionalPractical',
      slotType: 'ADDITIONAL',
    },
    {
      subj: eff.vocationalSubject,
      admitSubj: '',
      theoryKey: 'vocationalTheory',
      practicalKey: 'vocationalPractical',
      slotType: 'VOCATIONAL',
    },
  ];

  for (const cand of electiveCandidates) {
    if (
      canonicalSubjectKey(cand.subj) === targetKey ||
      canonicalSubjectKey(cand.admitSubj) === targetKey
    ) {
      const label = (cand.subj && cand.subj !== '---' ? cand.subj : cand.admitSubj) || assignedSubject;
      const prac = isInterPracticalSubject(label);
      return {
        slotType: cand.slotType,
        subjectLabel: label,
        theoryKey: cand.theoryKey,
        practicalKey: cand.practicalKey,
        hasPractical: prac,
        maxTheory: prac ? 70 : 100,
        maxPractical: prac ? 30 : 0,
      };
    }
  }

  return null;
}

export interface MatricSubjectSlotMatch {
  label: string;
  theoryKey: keyof MatricSentUpMarks;
  practicalKey?: keyof MatricSentUpMarks;
  litActKey?: keyof MatricSentUpMarks;
  prWorkKey?: keyof MatricSentUpMarks;
  maxTheory: number;
  maxPractical?: number;
}

/**
 * Maps an assigned subject name to the exact MatricSentUpMarks columns for a 10th student.
 */
export function findMatricSubjectSlot(
  record: AdmitCardRecord,
  assignedSubject: string
): MatricSubjectSlotMatch | null {
  const k = canonicalSubjectKey(assignedSubject);
  if (!k) return null;

  const lang1Key = canonicalSubjectKey(record.langSubject1 || 'HINDI');
  const lang2Key = canonicalSubjectKey(record.langSubject2 || 'SANSKRIT');
  const addlKey = canonicalSubjectKey(record.additionalSubject || '');

  if (k === lang1Key || k === 'hindi' || /mil/i.test(assignedSubject)) {
    return {
      label: record.langSubject1 || 'MIL (Hindi)',
      theoryKey: 'milTheory',
      maxTheory: 100,
    };
  }
  if (k === lang2Key || k === 'sanskrit' || k === 'urdu' || /sil/i.test(assignedSubject)) {
    return {
      label: record.langSubject2 || 'SIL (Sanskrit / Urdu)',
      theoryKey: 'silTheory',
      maxTheory: 100,
    };
  }
  if (k === 'mathematics') {
    return {
      label: 'Mathematics',
      theoryKey: 'matTheory',
      maxTheory: 100,
    };
  }
  if (k === 'science') {
    return {
      label: 'Science',
      theoryKey: 'sciTheory',
      practicalKey: 'sciPractical',
      maxTheory: 80,
      maxPractical: 20,
    };
  }
  if (k === 'social science') {
    return {
      label: 'Social Science',
      theoryKey: 'sscTheory',
      litActKey: 'sscLitAct',
      prWorkKey: 'sscPrWork',
      maxTheory: 80,
      maxPractical: 20,
    };
  }
  if (k === 'english') {
    return {
      label: 'English',
      theoryKey: 'engTheory',
      maxTheory: 100,
    };
  }
  if (addlKey && k === addlKey) {
    return {
      label: record.additionalSubject || 'Optional Subject',
      theoryKey: 'optTheory',
      practicalKey: 'optPractical',
      maxTheory: 100,
      maxPractical: 20,
    };
  }
  if (/vocational|voc/i.test(assignedSubject)) {
    return {
      label: 'Vocational Subject',
      theoryKey: 'vocTheory',
      practicalKey: 'vocPractical',
      maxTheory: 100,
      maxPractical: 30,
    };
  }
  return null;
}

/**
 * Computes the exact bounded list (max 30) of active lowercase teacher emails
 * authorized to view and enter marks for a given student record.
 */
export function computeAssignedTeacherEmailsForStudent(
  record: AdmitCardRecord,
  assignments: TeacherAssignment[]
): string[] {
  const studentSchool = normalizeSchoolCode(record.schoolCode, record.rollCode);
  const emails = new Set<string>();

  for (const a of assignments) {
    if (!a.active) continue;
    const assignSchool = normalizeSchoolCode(a.schoolCode);
    if (!assignSchool || assignSchool !== studentSchool) continue;
    if (!a.assignedClasses.includes(record.examType)) continue;

    // Grant access only if the student is registered in at least one of the teacher's assigned subjects
    const matchesAnySubject = a.assignedSubjects.some((subj) =>
      studentMatchesAssignedSubject(record, subj)
    );
    if (!matchesAnySubject) continue;

    const cleanEmail = (a.teacherEmail || '').trim().toLowerCase();
    if (cleanEmail) {
      emails.add(cleanEmail);
    }
    if (emails.size >= 30) break;
  }

  return Array.from(emails);
}

/**
 * Computes the exact bounded list (max 30) of active lowercase clerk emails
 * granted strictly read-only print access for a given student record.
 */
export function computeAssignedClerkEmailsForStudent(
  record: AdmitCardRecord,
  clerkAssignments: ClerkAssignment[]
): string[] {
  const studentSchool = normalizeSchoolCode(record.schoolCode, record.rollCode);
  const emails = new Set<string>();

  for (const c of clerkAssignments) {
    if (!c.active) continue;
    const assignSchool = normalizeSchoolCode(c.schoolCode);
    if (!assignSchool || assignSchool !== studentSchool) continue;
    if (!c.assignedClasses.includes(record.examType)) continue;

    const cleanEmail = (c.clerkEmail || '').trim().toLowerCase();
    if (cleanEmail) {
      emails.add(cleanEmail);
    }
    if (emails.size >= 30) break;
  }

  return Array.from(emails);
}
