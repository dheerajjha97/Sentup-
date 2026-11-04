import {
  AdmitCardRecord,
  CustomExcelFormatConfig,
  ExamType,
  FacultyType,
  InterSentUpMarks,
  MatricSentUpMarks,
  StudentMarksSummary,
} from '../types/admitCard';

export interface SubjectSlotInfo {
  slotKey:
    | 'langSubject1'
    | 'langSubject2'
    | 'compulsorySubject1'
    | 'compulsorySubject2'
    | 'compulsorySubject3'
    | 'compulsorySubject4'
    | 'additionalSubject';
  slotLabel: string;
  subjectName: string;
  isAggregateMain: boolean;
}

function parseSafeNumber(val: string | undefined | null): number | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '---' || trimmed === '-' || trimmed === 'N/A') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formats an Intermediate subject name into compact BSEB Sent-Up Panji notation
 * (e.g. "117 - Physics" -> "117-PHYSICS", "306 - Hindi" -> "306-Hindi", "319 - Home Science" -> "319- H.Sc.")
 */
export function formatCompactInterSubject(subj: string): string {
  const s = (subj || '').trim();
  if (!s || s === '---') return '---';
  if (/306/i.test(s) || /^hindi$/i.test(s)) return '306-Hindi';
  if (/305/i.test(s)) return '305-English';
  if (/307/i.test(s) || /urdu/i.test(s)) return '307-Urdu';
  if (/106/i.test(s)) return '106-Hindi';
  if (/105/i.test(s)) return '105-English';
  if (/206/i.test(s)) return '206-Hindi';
  if (/205/i.test(s)) return '205-English';
  if (/117/i.test(s) || /physics/i.test(s)) return '117-PHYSICS';
  if (/118/i.test(s) || /chemistry/i.test(s)) return '118-CHEMISTRY';
  if (/119/i.test(s) || /biology/i.test(s)) return '119-BIOLOGY';
  if (/120/i.test(s) || /agricult/i.test(s)) return '120-AGRICULTURE';
  if (/121/i.test(s) || (/math/i.test(s) && !/327/i.test(s))) return '121-MATHEMATICS';
  if (/318/i.test(s) || /music/i.test(s)) return '318- Music';
  if (/319/i.test(s) || /home\s*sc/i.test(s) || /h\.?\s*sc/i.test(s)) return '319- H.Sc.';
  if (/321/i.test(s) || /history/i.test(s)) return '321- History';
  if (/322/i.test(s) || /pol/i.test(s)) return '322- Pol.Sc.';
  if (/323/i.test(s) || /geog/i.test(s)) return '323- Geography';
  if (/324/i.test(s) || /psych/i.test(s)) return '324- Psychology';
  if (/325/i.test(s) || /socio/i.test(s)) return '325- Sociology';
  if (/326/i.test(s) || /econ/i.test(s)) return '326- Economics';
  if (/217/i.test(s) || /bus\.?\s*st/i.test(s)) return '217- Bus. Std.';
  if (/218/i.test(s) || /entp|entre/i.test(s)) return '218- Entp.';
  if (/219/i.test(s)) return '219- Economics';
  if (/220/i.test(s) || /account/i.test(s)) return '220- Account.';
  return s.replace(/\s*-\s*/, '-');
}

/**
 * Returns the complete 10th (Matric) Sent-Up Praptank Panji fields & calculated totals (Cols 10..23)
 * Exact formula per 10th_Sent-Up_Exam.-2025_BSEB.pdf:
 * AGGRE-GATE (Col 23) = MIL(10) + SIL(11) + MAT(12) + SCI_TH(13) + SSC_TH(14) + SCI_PR(18) + SSC_LIT(19) + SSC_PR(20)
 * (Note: ENG Col 15 and OPT-SUB Col 16/21 are displayed in their columns but NOT added to AGGRE-GATE)
 */
export function getEffectiveMatricSentUp(record: AdmitCardRecord): MatricSentUpMarks & {
  sciTotal: number;
  sscTotal: number;
  aggregate: string;
  aggregateNumber: number;
  hasAnyMarks: boolean;
} {
  const m = record.matricSentUp;
  const milTheory = m?.milTheory ?? getSubjectMark(record, record.langSubject1 || 'HINDI');
  const silTheory = m?.silTheory ?? getSubjectMark(record, record.langSubject2 || 'SANSKRIT');
  const matTheory = m?.matTheory ?? getSubjectMark(record, record.compulsorySubject1 || 'MATHEMATICS');
  const sciTheory = m?.sciTheory ?? getSubjectMark(record, record.compulsorySubject3 || 'SCIENCE');
  const sscTheory = m?.sscTheory ?? getSubjectMark(record, record.compulsorySubject2 || 'SOCIAL SCIENCE');
  const engTheory = m?.engTheory ?? getSubjectMark(record, record.compulsorySubject4 || 'ENGLISH');
  const optTheory = m?.optTheory ?? (record.additionalSubject ? getSubjectMark(record, record.additionalSubject) : '');
  const vocTheory = m?.vocTheory ?? '';
  const sciPractical = m?.sciPractical ?? '';
  const sscLitAct = m?.sscLitAct ?? '';
  const sscPrWork = m?.sscPrWork ?? '';
  const optPractical = m?.optPractical ?? '';
  const vocPractical = m?.vocPractical ?? '';

  const nMil = parseSafeNumber(milTheory);
  const nSil = parseSafeNumber(silTheory);
  const nMat = parseSafeNumber(matTheory);
  const nSciTh = parseSafeNumber(sciTheory);
  const nSscTh = parseSafeNumber(sscTheory);
  const nEng = parseSafeNumber(engTheory);
  const nSciPr = parseSafeNumber(sciPractical);
  const nSscLit = parseSafeNumber(sscLitAct);
  const nSscPr = parseSafeNumber(sscPrWork);

  const hasAnyMarks =
    nMil !== null ||
    nSil !== null ||
    nMat !== null ||
    nSciTh !== null ||
    nSscTh !== null ||
    nEng !== null ||
    nSciPr !== null ||
    nSscLit !== null ||
    nSscPr !== null;

  const sciTotal = (nSciTh ?? 0) + (nSciPr ?? 0);
  const sscTotal = (nSscTh ?? 0) + (nSscLit ?? 0) + (nSscPr ?? 0);
  const aggregateNumber =
    (nMil ?? 0) +
    (nSil ?? 0) +
    (nMat ?? 0) +
    (nSciTh ?? 0) +
    (nSscTh ?? 0) +
    (nSciPr ?? 0) +
    (nSscLit ?? 0) +
    (nSscPr ?? 0);

  return {
    milTheory,
    silTheory,
    matTheory,
    sciTheory,
    sscTheory,
    engTheory,
    optTheory,
    vocTheory,
    sciPractical,
    sscLitAct,
    sscPrWork,
    optPractical,
    vocPractical,
    sciTotal,
    sscTotal,
    aggregate: hasAnyMarks ? String(aggregateNumber) : '',
    aggregateNumber,
    hasAnyMarks,
  };
}

/**
 * Returns the complete 12th (Intermediate +2) Sent-Up Praptank Panji fields & calculated totals (Cols 5..30)
 * Exact formula per 12th_Sent-Up_Exam.-2025.pdf:
 * - Elective 1 Total (Col 12) = Theory (Col 10) + Practical (Col 11)
 * - Elective 2 Total (Col 16) = Theory (Col 14) + Practical (Col 15)
 * - Elective 3 Total (Col 20) = Theory (Col 18) + Practical (Col 19)
 * - Aggregate (Col 21) = Col 6 + Col 8 + Col 12 + Col 16 + Col 20
 * - Additional Total (Col 25) = Theory (Col 23) + Practical (Col 24)
 * - Vocational Total (Col 29) = Theory (Col 27) + Practical (Col 28)
 */
export function getEffectiveInterSentUp(record: AdmitCardRecord): InterSentUpMarks & {
  elective1Total: string;
  elective2Total: string;
  elective3Total: string;
  additionalTotal: string;
  vocationalTotal: string;
  aggregate: string;
  aggregateNumber: number;
  hasAnyMarks: boolean;
} {
  const s = record.interSentUp;

  const lang1Subject =
    s?.lang1Subject !== undefined
      ? s.lang1Subject
      : formatCompactInterSubject(record.langSubject1 || '306-Hindi');
  const lang2Subject =
    s?.lang2Subject !== undefined
      ? s.lang2Subject
      : formatCompactInterSubject(record.langSubject2 || '305-English');

  const defaultElec1 =
    record.compulsorySubject1 ||
    (record.faculty === 'SCIENCE'
      ? '117-PHYSICS'
      : record.faculty === 'COMMERCE'
      ? '217- Bus. Std.'
      : '321- History');
  const defaultElec2 =
    record.compulsorySubject2 ||
    (record.faculty === 'SCIENCE'
      ? '118-CHEMISTRY'
      : record.faculty === 'COMMERCE'
      ? '218- Entp.'
      : '322- Pol.Sc.');
  const defaultElec3 =
    record.compulsorySubject3 ||
    (record.faculty === 'SCIENCE'
      ? '119-BIOLOGY'
      : record.faculty === 'COMMERCE'
      ? '220- Account.'
      : '323- Geography');

  const elective1Subject =
    s?.elective1Subject !== undefined
      ? s.elective1Subject
      : formatCompactInterSubject(defaultElec1);
  const elective2Subject =
    s?.elective2Subject !== undefined
      ? s.elective2Subject
      : formatCompactInterSubject(defaultElec2);
  const elective3Subject =
    s?.elective3Subject !== undefined
      ? s.elective3Subject
      : formatCompactInterSubject(defaultElec3);

  const additionalSubject =
    s?.additionalSubject !== undefined
      ? s.additionalSubject
      : record.additionalSubject
      ? formatCompactInterSubject(record.additionalSubject)
      : '---';
  const vocationalSubject =
    s?.vocationalSubject !== undefined ? s.vocationalSubject : '---';

  const lang1Marks = s?.lang1Marks ?? getSubjectMark(record, record.langSubject1);
  const lang2Marks = s?.lang2Marks ?? getSubjectMark(record, record.langSubject2);

  const elective1Theory =
    s?.elective1Theory ?? getSubjectMark(record, record.compulsorySubject1);
  const elective1Practical = s?.elective1Practical ?? '';

  const elective2Theory =
    s?.elective2Theory ?? getSubjectMark(record, record.compulsorySubject2);
  const elective2Practical = s?.elective2Practical ?? '';

  const elective3Theory =
    s?.elective3Theory ?? getSubjectMark(record, record.compulsorySubject3);
  const elective3Practical = s?.elective3Practical ?? '';

  const additionalTheory =
    s?.additionalTheory ??
    (record.additionalSubject ? getSubjectMark(record, record.additionalSubject) : '');
  const additionalPractical = s?.additionalPractical ?? '';

  const vocationalTheory = s?.vocationalTheory ?? '';
  const vocationalPractical = s?.vocationalPractical ?? '';
  const resultStatus = s?.resultStatus || 'SENT-UP';

  const nL1 = parseSafeNumber(lang1Marks);
  const nL2 = parseSafeNumber(lang2Marks);
  const nE1Th = parseSafeNumber(elective1Theory);
  const nE1Pr = parseSafeNumber(elective1Practical);
  const nE2Th = parseSafeNumber(elective2Theory);
  const nE2Pr = parseSafeNumber(elective2Practical);
  const nE3Th = parseSafeNumber(elective3Theory);
  const nE3Pr = parseSafeNumber(elective3Practical);
  const nAddTh = parseSafeNumber(additionalTheory);
  const nAddPr = parseSafeNumber(additionalPractical);
  const nVocTh = parseSafeNumber(vocationalTheory);
  const nVocPr = parseSafeNumber(vocationalPractical);

  const e1Has = nE1Th !== null || nE1Pr !== null;
  const e2Has = nE2Th !== null || nE2Pr !== null;
  const e3Has = nE3Th !== null || nE3Pr !== null;
  const addHas = nAddTh !== null || nAddPr !== null;
  const vocHas = nVocTh !== null || nVocPr !== null;

  const e1TotNum = (nE1Th ?? 0) + (nE1Pr ?? 0);
  const e2TotNum = (nE2Th ?? 0) + (nE2Pr ?? 0);
  const e3TotNum = (nE3Th ?? 0) + (nE3Pr ?? 0);
  const addTotNum = (nAddTh ?? 0) + (nAddPr ?? 0);
  const vocTotNum = (nVocTh ?? 0) + (nVocPr ?? 0);

  const hasAnyMarks = nL1 !== null || nL2 !== null || e1Has || e2Has || e3Has;
  const aggregateNumber = (nL1 ?? 0) + (nL2 ?? 0) + e1TotNum + e2TotNum + e3TotNum;

  return {
    lang1Subject,
    lang1Marks,
    lang2Subject,
    lang2Marks,
    elective1Subject,
    elective1Theory,
    elective1Practical,
    elective2Subject,
    elective2Theory,
    elective2Practical,
    elective3Subject,
    elective3Theory,
    elective3Practical,
    additionalSubject,
    additionalTheory,
    additionalPractical,
    vocationalSubject,
    vocationalTheory,
    vocationalPractical,
    resultStatus,
    elective1Total: e1Has ? String(e1TotNum) : '',
    elective2Total: e2Has ? String(e2TotNum) : '',
    elective3Total: e3Has ? String(e3TotNum) : '',
    additionalTotal: addHas ? String(addTotNum) : '---',
    vocationalTotal: vocHas ? String(vocTotNum) : '---',
    aggregate: hasAnyMarks ? String(aggregateNumber) : '',
    aggregateNumber,
    hasAnyMarks,
  };
}

/**
 * Creates a new blank student record for rapid manual data entry on the Sent-Up Marks page.
 */
export function createBlankStudentRecord(
  serialNo: number,
  examType: ExamType,
  schoolCode = '',
  schoolName = '',
  faculty: FacultyType = examType === 'MATRIC (10th)' ? 'SECONDARY' : 'ARTS'
): AdmitCardRecord {
  const isMatric = examType === 'MATRIC (10th)';
  const defaultElec1 =
    faculty === 'SCIENCE'
      ? '117-PHYSICS'
      : faculty === 'COMMERCE'
      ? '217- Bus. Std.'
      : '321- History';
  const defaultElec2 =
    faculty === 'SCIENCE'
      ? '118-CHEMISTRY'
      : faculty === 'COMMERCE'
      ? '218- Entp.'
      : '322- Pol.Sc.';
  const defaultElec3 =
    faculty === 'SCIENCE'
      ? '119-BIOLOGY'
      : faculty === 'COMMERCE'
      ? '220- Account.'
      : '323- Geography';

  return {
    id: `manual-row-${Date.now()}-${serialNo}-${Math.random().toString(36).slice(2, 6)}`,
    serialNo,
    examType,
    examYear: '2026',
    faculty: isMatric ? 'SECONDARY' : faculty,
    bsebUniqueId: '',
    schoolCode: schoolCode || (isMatric ? '51803' : '31337'),
    schoolName:
      schoolName ||
      (isMatric
        ? 'H.S.S. BERUA'
        : 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR'),
    studentName: '',
    motherName: '',
    fatherName: '',
    dob: '',
    gender: 'FEMALE',
    maritalStatus: 'UNMARRIED',
    aadhaarNo: '',
    studentCategory: 'REGULAR',
    casteCategory: 'N/A',
    differentlyAbled: 'No',
    registrationNo: '',
    rollCode: schoolCode || (isMatric ? '51803' : '31337'),
    rollNumber: '',
    examCenter: '',
    langSubject1: isMatric ? 'MIL - HINDI' : '306-Hindi',
    langSubject2: isMatric ? 'SIL - SANSKRIT' : '305-English',
    compulsorySubject1: isMatric ? 'MATHEMATICS' : defaultElec1,
    compulsorySubject2: isMatric ? 'SOCIAL SCIENCE' : defaultElec2,
    compulsorySubject3: isMatric ? 'SCIENCE' : defaultElec3,
    compulsorySubject4: isMatric ? 'ENGLISH' : '',
    additionalSubject: '',
    allSubjectsSummary: isMatric
      ? 'MIL - HINDI, SIL - SANSKRIT, MATHEMATICS, SOCIAL SCIENCE, SCIENCE, ENGLISH'
      : `306-Hindi, 305-English, ${defaultElec1}, ${defaultElec2}, ${defaultElec3}`,
    subjectMarks: {},
    matricSentUp: isMatric
      ? {
          milTheory: '',
          silTheory: '',
          matTheory: '',
          sciTheory: '',
          sscTheory: '',
          engTheory: '',
          optTheory: '',
          vocTheory: '',
          sciPractical: '',
          sscLitAct: '',
          sscPrWork: '',
          optPractical: '',
          vocPractical: '',
        }
      : undefined,
    interSentUp: !isMatric
      ? {
          lang1Subject: '306-Hindi',
          lang1Marks: '',
          lang2Subject: '305-English',
          lang2Marks: '',
          elective1Subject: defaultElec1,
          elective1Theory: '',
          elective1Practical: '',
          elective2Subject: defaultElec2,
          elective2Theory: '',
          elective2Practical: '',
          elective3Subject: defaultElec3,
          elective3Theory: '',
          elective3Practical: '',
          additionalSubject: '---',
          additionalTheory: '',
          additionalPractical: '',
          vocationalSubject: '---',
          vocationalTheory: '',
          vocationalPractical: '',
          resultStatus: 'SENT-UP',
        }
      : undefined,
    sourceFileName: 'Manual Data Entry',
    sourcePageNumber: serialNo,
    extractionMethod: 'PDF_TEXT_LAYER',
    remarks: 'SENT-UP',
  };
}

/**
 * Returns the ordered list of subjects registered on a student's Admit Card.
 */
export function getStudentRegisteredSubjects(record: AdmitCardRecord): SubjectSlotInfo[] {
  const slots: SubjectSlotInfo[] = [];
  const isMatric = record.examType === 'MATRIC (10th)';

  if (record.langSubject1) {
    slots.push({
      slotKey: 'langSubject1',
      slotLabel: isMatric ? 'MIL (Lang 1)' : 'Compulsory Lang 1',
      subjectName: record.langSubject1,
      isAggregateMain: true,
    });
  }
  if (record.langSubject2) {
    slots.push({
      slotKey: 'langSubject2',
      slotLabel: isMatric ? 'SIL (Lang 2)' : 'Compulsory Lang 2',
      subjectName: record.langSubject2,
      isAggregateMain: true,
    });
  }
  if (record.compulsorySubject1) {
    slots.push({
      slotKey: 'compulsorySubject1',
      slotLabel: isMatric ? 'Compulsory 1' : 'Elective 1',
      subjectName: record.compulsorySubject1,
      isAggregateMain: true,
    });
  }
  if (record.compulsorySubject2) {
    slots.push({
      slotKey: 'compulsorySubject2',
      slotLabel: isMatric ? 'Compulsory 2' : 'Elective 2',
      subjectName: record.compulsorySubject2,
      isAggregateMain: true,
    });
  }
  if (record.compulsorySubject3) {
    slots.push({
      slotKey: 'compulsorySubject3',
      slotLabel: isMatric ? 'Compulsory 3' : 'Elective 3',
      subjectName: record.compulsorySubject3,
      isAggregateMain: true,
    });
  }
  if (record.compulsorySubject4) {
    const isEnglishMatric =
      isMatric && /english/i.test(record.compulsorySubject4);
    slots.push({
      slotKey: 'compulsorySubject4',
      slotLabel: isMatric ? 'Compulsory 4 (Eng)' : 'Subject 4',
      subjectName: record.compulsorySubject4,
      isAggregateMain: !isEnglishMatric,
    });
  }
  if (record.additionalSubject) {
    slots.push({
      slotKey: 'additionalSubject',
      slotLabel: 'Additional / Optional',
      subjectName: record.additionalSubject,
      isAggregateMain: false,
    });
  }

  return slots;
}

/**
 * Retrieves the mark entered for a given subject on a student record.
 */
export function getSubjectMark(record: AdmitCardRecord, subjectName: string): string {
  if (!subjectName || !record.subjectMarks) return '';
  if (record.subjectMarks[subjectName] !== undefined) {
    return record.subjectMarks[subjectName];
  }
  const normTarget = normalizeSubjectKeyword(subjectName);
  for (const [k, val] of Object.entries(record.subjectMarks)) {
    if (normalizeSubjectKeyword(k) === normTarget && val !== undefined) {
      return val;
    }
  }
  return '';
}

/**
 * Strips numeric subject codes and prefixes ("306 - Hindi", "MIL - HINDI") to a canonical lowercase subject keyword.
 */
export function normalizeSubjectKeyword(subj: string): string {
  return subj
    .toLowerCase()
    .replace(/^[0-9]+\s*[-–:]\s*/, '')
    .replace(/^(mil|sil|sub|opt|addl)\s*[-–:]\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Calculates total marks, percentage, and BSEB division for a student record.
 * Automatically integrates marks entered via either the Sent-Up Praptank Panji Grid OR the Subject Marks Grid.
 */
export function calculateStudentMarksSummary(record: AdmitCardRecord): StudentMarksSummary {
  // Check if structured Sent-Up marks are populated
  if (record.examType === 'MATRIC (10th)' && record.matricSentUp) {
    const m = getEffectiveMatricSentUp(record);
    if (m.hasAnyMarks) {
      const totalMarks = m.aggregateNumber;
      const maxMarks = 500;
      const percentage = `${((totalMarks / maxMarks) * 100).toFixed(2)}%`;
      const division: StudentMarksSummary['division'] =
        totalMarks >= 300
          ? '1st Division'
          : totalMarks >= 225
          ? '2nd Division'
          : totalMarks >= 150
          ? '3rd Division'
          : 'Fail / Compartmental';
      return {
        mainSubjectsCount: 5,
        enteredCount: 5,
        totalMarks,
        maxMarks,
        percentage,
        division,
        englishMatricMarks: m.engTheory,
        additionalSubjectMarks: m.optTheory,
      };
    }
  } else if (record.examType === 'INTERMEDIATE (+2)' && record.interSentUp) {
    const s = getEffectiveInterSentUp(record);
    if (s.hasAnyMarks) {
      const totalMarks = s.aggregateNumber;
      const maxMarks = 500;
      const percentage = `${((totalMarks / maxMarks) * 100).toFixed(2)}%`;
      const division: StudentMarksSummary['division'] =
        totalMarks >= 300
          ? '1st Division'
          : totalMarks >= 225
          ? '2nd Division'
          : totalMarks >= 150
          ? '3rd Division'
          : 'Fail / Compartmental';
      return {
        mainSubjectsCount: 5,
        enteredCount: 5,
        totalMarks,
        maxMarks,
        percentage,
        division,
        additionalSubjectMarks: s.additionalTotal !== '---' ? s.additionalTotal : undefined,
      };
    }
  }

  const slots = getStudentRegisteredSubjects(record);
  const mainSlots = slots.filter((s) => s.isAggregateMain);
  let totalMarks = 0;
  let enteredCount = 0;
  let hasFailedSubject = false;

  for (const slot of mainSlots) {
    const rawVal = getSubjectMark(record, slot.subjectName).trim();
    if (!rawVal) continue;
    enteredCount++;
    if (/^(ab|absent|f|fail)$/i.test(rawVal)) {
      hasFailedSubject = true;
      continue;
    }
    const num = Number(rawVal);
    if (!Number.isNaN(num)) {
      totalMarks += num;
      if (num < 30) {
        hasFailedSubject = true;
      }
    }
  }

  const maxMarks = Math.max(100, mainSlots.length * 100);
  const pctNum = enteredCount > 0 ? (totalMarks / maxMarks) * 100 : 0;
  const percentage = enteredCount > 0 ? `${pctNum.toFixed(2)}%` : '';

  let division: StudentMarksSummary['division'] = 'Pending';
  if (enteredCount > 0) {
    if (hasFailedSubject || totalMarks < 150) {
      division = 'Fail / Compartmental';
    } else if (totalMarks >= 300) {
      division = '1st Division';
    } else if (totalMarks >= 225) {
      division = '2nd Division';
    } else {
      division = '3rd Division';
    }
  }

  const engSlot = slots.find((s) => s.slotKey === 'compulsorySubject4');
  const addlSlot = slots.find((s) => s.slotKey === 'additionalSubject');

  return {
    mainSubjectsCount: mainSlots.length,
    enteredCount,
    totalMarks,
    maxMarks,
    percentage,
    division,
    englishMatricMarks: engSlot ? getSubjectMark(record, engSlot.subjectName) : undefined,
    additionalSubjectMarks: addlSlot ? getSubjectMark(record, addlSlot.subjectName) : undefined,
  };
}

/**
 * Returns all unique subjects across the current batch of records.
 */
export function getAllUniqueSubjectsInBatch(records: AdmitCardRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    for (const slot of getStudentRegisteredSubjects(r)) {
      if (slot.subjectName) {
        seen.add(slot.subjectName);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Checks if a student record has a subject matching a given column header.
 */
export function findStudentMatchingSubject(
  record: AdmitCardRecord,
  columnHeader: string
): string | null {
  const slots = getStudentRegisteredSubjects(record);
  const cleanHeader = columnHeader
    .replace(/\b(marks?|score|obtained|theory|total|ank|अंक|प्राप्तांक)\b/gi, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanHeader) return null;

  const codeMatch = cleanHeader.match(/\b([123]\d{2})\b/);
  if (codeMatch) {
    const code = codeMatch[1];
    const foundByCode = slots.find((s) => s.subjectName.includes(code));
    if (foundByCode) return foundByCode.subjectName;
  }

  const normHeader = normalizeSubjectKeyword(cleanHeader);
  if (!normHeader || normHeader.length < 2) return null;

  for (const slot of slots) {
    const normSubj = normalizeSubjectKeyword(slot.subjectName);
    if (
      normSubj === normHeader ||
      normSubj.includes(normHeader) ||
      normHeader.includes(normSubj)
    ) {
      return slot.subjectName;
    }
  }

  return null;
}

/**
 * Maps a single custom Excel column header to the corresponding value for a given AdmitCardRecord.
 */
export function resolveCustomColumnValue(
  record: AdmitCardRecord,
  rowIndex: number,
  header: string
): string | number {
  const h = header.trim();
  const lower = h.toLowerCase();
  const summary = calculateStudentMarksSummary(record);

  if (
    /^(s\.?\s*no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|serial\s*no\.?|#|क्र\.?\s*सं\.?|क्रमांक)$/i.test(
      h
    )
  ) {
    return rowIndex + 1;
  }

  if (
    lower.includes('unique id') ||
    lower.includes('bseb id') ||
    lower.includes('bseb unique') ||
    lower === 'unique_id' ||
    lower.includes('यूनिक')
  ) {
    return record.bsebUniqueId;
  }

  if (
    (lower.includes('school') || lower.includes('college') || lower.includes('विद्यालय') || lower.includes('कॉलेज')) &&
    lower.includes('code') &&
    !lower.includes('name')
  ) {
    return record.schoolCode;
  }
  if (
    lower.includes('school') ||
    lower.includes('college') ||
    lower.includes('institution') ||
    lower.includes('विद्यालय') ||
    lower.includes('कॉलेज')
  ) {
    return record.schoolName;
  }

  if (
    lower === 'name' ||
    lower.includes('student name') ||
    lower.includes("student's name") ||
    lower.includes('candidate name') ||
    lower.includes('examinee name') ||
    lower.includes('परीक्षार्थी का नाम') ||
    lower.includes('छात्र का नाम') ||
    lower.includes('विद्यार्थी का नाम')
  ) {
    return record.studentName;
  }

  if (lower.includes('father') || lower.includes('पिता')) {
    return record.fatherName;
  }

  if (lower.includes('mother') || lower.includes('माता')) {
    return record.motherName;
  }

  if (
    lower === 'dob' ||
    lower.includes('date of birth') ||
    lower.includes('birth') ||
    lower.includes('जन्म तिथि')
  ) {
    return record.dob;
  }

  if (lower === 'gender' || lower === 'sex' || lower === 'm/f' || lower.includes('लिंग')) {
    return record.gender;
  }

  if (lower.includes('marital') || lower.includes('वैवाहिक')) {
    return record.maritalStatus;
  }

  if (
    lower.includes('aadhaar') ||
    lower.includes('aadhar') ||
    lower.includes('uidai') ||
    lower.includes('आधार')
  ) {
    return record.aadhaarNo;
  }

  if (
    lower.includes('reg') ||
    lower.includes('listing') ||
    lower.includes('पंजीयन') ||
    lower.includes('सूचीकरण')
  ) {
    return record.registrationNo;
  }

  if (lower.includes('roll code') || lower.includes('रौल कोड') || lower.includes('रोल कोड')) {
    return record.rollCode;
  }
  if (
    lower.includes('roll no') ||
    lower.includes('roll number') ||
    lower.includes('रौल नम्बर') ||
    lower.includes('रौल क्रमांक') ||
    lower.includes('रोल नंबर')
  ) {
    return record.rollNumber;
  }

  if (lower.includes('center') || lower.includes('centre') || lower.includes('केन्द्र') || lower.includes('केंद्र')) {
    return record.examCenter;
  }

  if (lower.includes('caste') || lower.includes('जाति')) {
    return record.casteCategory;
  }
  if (lower.includes('divyang') || lower.includes('pwd') || lower.includes('disabled') || lower.includes('दिव्यांग')) {
    return record.differentlyAbled;
  }
  if (lower.includes('category') || lower.includes('status') || lower.includes('कोटि')) {
    return record.studentCategory;
  }

  if (lower.includes('exam type') || lower.includes('exam level') || lower === 'class') {
    return record.examType;
  }
  if (lower.includes('faculty') || lower.includes('stream') || lower.includes('संकाय')) {
    return record.faculty;
  }

  const isAskingMarks = /\b(marks?|score|obtained|प्राप्तांक|अंक)\b/i.test(h);

  if (/\b(lang(uage)?\s*(subject)?\s*1|mil|भाषा\s*विषय\s*-?\s*1)\b/i.test(h)) {
    return isAskingMarks
      ? getSubjectMark(record, record.langSubject1)
      : record.langSubject1;
  }
  if (/\b(lang(uage)?\s*(subject)?\s*2|sil|भाषा\s*विषय\s*-?\s*2)\b/i.test(h)) {
    return isAskingMarks
      ? getSubjectMark(record, record.langSubject2)
      : record.langSubject2;
  }
  if (/\b((compulsory|elective|subject|sub)\s*[-_]?\s*1|ऐच्छिक\s*विषय\s*-?\s*1)\b/i.test(h)) {
    return isAskingMarks
      ? getSubjectMark(record, record.compulsorySubject1)
      : record.compulsorySubject1;
  }
  if (/\b((compulsory|elective|subject|sub)\s*[-_]?\s*2|ऐच्छिक\s*विषय\s*-?\s*2)\b/i.test(h)) {
    return isAskingMarks
      ? getSubjectMark(record, record.compulsorySubject2)
      : record.compulsorySubject2;
  }
  if (/\b((compulsory|elective|subject|sub)\s*[-_]?\s*3|ऐच्छिक\s*विषय\s*-?\s*3)\b/i.test(h)) {
    return isAskingMarks
      ? getSubjectMark(record, record.compulsorySubject3)
      : record.compulsorySubject3;
  }
  if (/\b((compulsory|elective|subject|sub)\s*[-_]?\s*4)\b/i.test(h)) {
    return isAskingMarks
      ? getSubjectMark(record, record.compulsorySubject4)
      : record.compulsorySubject4;
  }
  if (/\b(add(itional)?|optional|extra|अतिरिक्त|ऐच्छिक)\b/i.test(h)) {
    return isAskingMarks
      ? getSubjectMark(record, record.additionalSubject)
      : record.additionalSubject;
  }
  if (lower.includes('all subjects') || lower === 'subjects' || lower.includes('परीक्षा के विषय')) {
    return record.allSubjectsSummary;
  }

  if (
    lower === 'total' ||
    lower.includes('total marks') ||
    lower.includes('grand total') ||
    lower.includes('aggregate') ||
    lower.includes('aggre-gate') ||
    lower.includes('कुल अंक') ||
    lower.includes('प्राप्तांक योग')
  ) {
    return summary.enteredCount > 0 ? summary.totalMarks : '';
  }
  if (lower.includes('max marks') || lower.includes('full marks') || lower.includes('पूर्णांक')) {
    return summary.maxMarks;
  }
  if (lower === '%' || lower.includes('percent') || lower.includes('प्रतिशत')) {
    return summary.percentage;
  }
  if (
    lower.includes('division') ||
    lower.includes('result') ||
    lower.includes('grade') ||
    lower.includes('श्रेणी') ||
    lower.includes('परिणाम')
  ) {
    return summary.enteredCount > 0 ? summary.division : '';
  }
  if (lower.includes('remark') || lower.includes('अभ्युक्ति')) {
    return record.remarks || '';
  }

  const matchedSubj = findStudentMatchingSubject(record, h);
  if (matchedSubj) {
    const mark = getSubjectMark(record, matchedSubj);
    return mark !== '' ? mark : '';
  }

  return '';
}

/**
 * Parses an uploaded Excel/CSV 2D array (rows of cells) to:
 * 1. Extract the exact header format (CustomExcelFormatConfig)
 * 2. Import any subject marks present in the rows into matching AdmitCardRecords
 */
export function parseUploadedExcelTemplateAndMarks(
  rawRows: Array<Array<string | number | null | undefined>>,
  existingRecords: AdmitCardRecord[],
  fileName: string,
  sheetName: string
): {
  formatConfig: CustomExcelFormatConfig;
  updatedRecords: AdmitCardRecord[];
  matchedStudentCount: number;
  importedMarksCount: number;
} {
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const nonEmptyCount = (rawRows[i] || []).filter(
      (cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''
    ).length;
    if (nonEmptyCount >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  const rawHeaderRow = rawRows[headerRowIdx] || [];
  const headers = rawHeaderRow
    .map((cell, idx) => {
      const s = cell !== null && cell !== undefined ? String(cell).trim() : '';
      return s || `Column_${idx + 1}`;
    })
    .filter((h) => !h.startsWith('Column_'));

  const formatConfig: CustomExcelFormatConfig = {
    fileName,
    sheetName,
    headers: headers.length > 0 ? headers : ['S.No.', 'BSEB Unique ID', 'Student Name'],
    uploadedAt: new Date().toLocaleTimeString(),
  };

  const dataRows = rawRows.slice(headerRowIdx + 1);
  if (dataRows.length === 0 || existingRecords.length === 0) {
    return {
      formatConfig,
      updatedRecords: existingRecords,
      matchedStudentCount: 0,
      importedMarksCount: 0,
    };
  }

  const bsebIdCol = headers.findIndex((h) => /unique\s*id|bseb\s*id|यूनिक/i.test(h));
  const regNoCol = headers.findIndex((h) => /reg|listing|पंजीयन|सूचीकरण/i.test(h));
  const nameCol = headers.findIndex((h) =>
    /^(name|student\s*name|candidate\s*name|परीक्षार्थी का नाम|छात्र का नाम)$/i.test(h.trim())
  );

  let matchedStudentCount = 0;
  let importedMarksCount = 0;

  const updatedRecords = existingRecords.map((rec) => {
    const matchingRow = dataRows.find((row) => {
      if (!row) return false;
      if (bsebIdCol !== -1 && rec.bsebUniqueId) {
        const cellVal = String(row[bsebIdCol] ?? '').replace(/\D/g, '');
        if (cellVal && cellVal === rec.bsebUniqueId.replace(/\D/g, '')) return true;
      }
      if (regNoCol !== -1 && rec.registrationNo) {
        const cellVal = String(row[regNoCol] ?? '').trim().toUpperCase();
        if (cellVal && cellVal === rec.registrationNo.trim().toUpperCase()) return true;
      }
      if (nameCol !== -1 && rec.studentName) {
        const cellVal = String(row[nameCol] ?? '').trim().toUpperCase();
        if (cellVal && cellVal === rec.studentName.trim().toUpperCase()) return true;
      }
      return false;
    });

    if (!matchingRow) return rec;
    matchedStudentCount++;

    const nextMarks: Record<string, string> = { ...(rec.subjectMarks || {}) };

    headers.forEach((h, colIdx) => {
      const rawCell = matchingRow[colIdx];
      if (rawCell === null || rawCell === undefined || String(rawCell).trim() === '') return;
      const cellStr = String(rawCell).trim();

      if (/\b(lang(uage)?\s*(subject)?\s*1|mil)\b.*\b(marks?|score|अंक)\b/i.test(h) && rec.langSubject1) {
        nextMarks[rec.langSubject1] = cellStr;
        importedMarksCount++;
        return;
      }
      if (/\b(lang(uage)?\s*(subject)?\s*2|sil)\b.*\b(marks?|score|अंक)\b/i.test(h) && rec.langSubject2) {
        nextMarks[rec.langSubject2] = cellStr;
        importedMarksCount++;
        return;
      }
      if (/\b(compulsory|elective|subject|sub)\s*[-_]?\s*1\b.*\b(marks?|score|अंक)\b/i.test(h) && rec.compulsorySubject1) {
        nextMarks[rec.compulsorySubject1] = cellStr;
        importedMarksCount++;
        return;
      }
      if (/\b(compulsory|elective|subject|sub)\s*[-_]?\s*2\b.*\b(marks?|score|अंक)\b/i.test(h) && rec.compulsorySubject2) {
        nextMarks[rec.compulsorySubject2] = cellStr;
        importedMarksCount++;
        return;
      }
      if (/\b(compulsory|elective|subject|sub)\s*[-_]?\s*3\b.*\b(marks?|score|अंक)\b/i.test(h) && rec.compulsorySubject3) {
        nextMarks[rec.compulsorySubject3] = cellStr;
        importedMarksCount++;
        return;
      }
      if (/\b(compulsory|elective|subject|sub)\s*[-_]?\s*4\b.*\b(marks?|score|अंक)\b/i.test(h) && rec.compulsorySubject4) {
        nextMarks[rec.compulsorySubject4] = cellStr;
        importedMarksCount++;
        return;
      }
      if (/\b(add(itional)?|optional)\b.*\b(marks?|score|अंक)\b/i.test(h) && rec.additionalSubject) {
        nextMarks[rec.additionalSubject] = cellStr;
        importedMarksCount++;
        return;
      }

      const matchedSubj = findStudentMatchingSubject(rec, h);
      if (matchedSubj && /^(\d{1,3}(\.\d+)?|AB|Absent|F|Pass)$/i.test(cellStr)) {
        nextMarks[matchedSubj] = cellStr;
        importedMarksCount++;
      }
    });

    return {
      ...rec,
      subjectMarks: nextMarks,
    };
  });

  return {
    formatConfig,
    updatedRecords,
    matchedStudentCount,
    importedMarksCount,
  };
}
