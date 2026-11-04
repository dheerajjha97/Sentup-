import { AdmitCardRecord, ExamType, FacultyType, SummaryStats } from '../types/admitCard';

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

export interface InterOcrZonesInput {
  topFieldsText: string;
  facultyText?: string;
  comp1Text?: string;
  comp2Text?: string;
  elec1Text?: string;
  elec2Text?: string;
  elec3Text?: string;
  addl1Text?: string;
  addl2Text?: string;
  addl3Text?: string;
}

/**
 * Official BSEB Intermediate (+2) Subject Code Dictionary
 */
export const BSEB_INTER_SUBJECTS: Record<string, { name: string; faculty?: FacultyType }> = {
  // Science Compulsory Languages (105..116)
  '105': { name: 'English', faculty: 'SCIENCE' },
  '106': { name: 'Hindi', faculty: 'SCIENCE' },
  '107': { name: 'Urdu', faculty: 'SCIENCE' },
  '108': { name: 'Maithili', faculty: 'SCIENCE' },
  '109': { name: 'Sanskrit', faculty: 'SCIENCE' },
  // Science Electives (117..124)
  '117': { name: 'Physics', faculty: 'SCIENCE' },
  '118': { name: 'Chemistry', faculty: 'SCIENCE' },
  '119': { name: 'Biology', faculty: 'SCIENCE' },
  '120': { name: 'Agriculture', faculty: 'SCIENCE' },
  '121': { name: 'Mathematics', faculty: 'SCIENCE' },
  '122': { name: 'Computer Science', faculty: 'SCIENCE' },
  '123': { name: 'Multimedia & Web Tech', faculty: 'SCIENCE' },

  // Commerce Compulsory Languages (205..216)
  '205': { name: 'English', faculty: 'COMMERCE' },
  '206': { name: 'Hindi', faculty: 'COMMERCE' },
  '207': { name: 'Urdu', faculty: 'COMMERCE' },
  '208': { name: 'Maithili', faculty: 'COMMERCE' },
  '209': { name: 'Sanskrit', faculty: 'COMMERCE' },
  // Commerce Electives (217..222)
  '217': { name: 'Business Studies', faculty: 'COMMERCE' },
  '218': { name: 'Entrepreneurship', faculty: 'COMMERCE' },
  '219': { name: 'Economics', faculty: 'COMMERCE' },
  '220': { name: 'Accountancy', faculty: 'COMMERCE' },

  // Arts Compulsory Languages (305..316)
  '305': { name: 'English', faculty: 'ARTS' },
  '306': { name: 'Hindi', faculty: 'ARTS' },
  '307': { name: 'Urdu', faculty: 'ARTS' },
  '308': { name: 'Maithili', faculty: 'ARTS' },
  '309': { name: 'Sanskrit', faculty: 'ARTS' },
  '310': { name: 'Prakrit', faculty: 'ARTS' },
  '311': { name: 'Pali', faculty: 'ARTS' },
  '312': { name: 'Persian', faculty: 'ARTS' },
  '313': { name: 'Arabic', faculty: 'ARTS' },
  '314': { name: 'Bhojpuri', faculty: 'ARTS' },
  '315': { name: 'Magahi', faculty: 'ARTS' },
  '316': { name: 'Bangla', faculty: 'ARTS' },
  // Arts Electives (317..330)
  '317': { name: 'Yoga & Physical Edu', faculty: 'ARTS' },
  '318': { name: 'Music', faculty: 'ARTS' },
  '319': { name: 'Home Science', faculty: 'ARTS' },
  '320': { name: 'Philosophy', faculty: 'ARTS' },
  '321': { name: 'History', faculty: 'ARTS' },
  '322': { name: 'Political Science', faculty: 'ARTS' },
  '323': { name: 'Geography', faculty: 'ARTS' },
  '324': { name: 'Psychology', faculty: 'ARTS' },
  '325': { name: 'Sociology', faculty: 'ARTS' },
  '326': { name: 'Economics', faculty: 'ARTS' },
  '327': { name: 'Mathematics', faculty: 'ARTS' },
};

/**
 * Normalizes a raw OCR subject cell string (e.g. "| 105 | English", "18 Chemistry", "506 | Hindi |", "217 Business Studies")
 * into a clean "CODE - Subject Name" string using BSEB_INTER_SUBJECTS.
 */
export function normalizeInterSubjectCell(raw: string, facultyHint?: FacultyType): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/[|[\]{}()~_—–=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length <= 2) return '';

  // Check if there is a 3-digit code directly matching BSEB_INTER_SUBJECTS
  const codeMatch = cleaned.match(/\b([123]\d{2})\b/);
  if (codeMatch && BSEB_INTER_SUBJECTS[codeMatch[1]]) {
    const code = codeMatch[1];
    return `${code} - ${BSEB_INTER_SUBJECTS[code].name}`;
  }

  // Match by subject name keywords in case the code digit was clipped or misread (e.g. "18 Chemistry" or "506 Hindi")
  const lower = cleaned.toLowerCase();
  const prefix = facultyHint === 'SCIENCE' ? '1' : facultyHint === 'COMMERCE' ? '2' : '3';

  if (lower.includes('english') || lower.includes('eng')) {
    return `${prefix}05 - English`;
  }
  if (lower.includes('hindi') || lower.includes('hin') || lower.includes('and:')) {
    return `${prefix}06 - Hindi`;
  }
  if (lower.includes('urdu')) {
    return `${prefix}07 - Urdu`;
  }
  if (lower.includes('maithili')) {
    return `${prefix}08 - Maithili`;
  }
  if (lower.includes('sanskrit')) {
    return `${prefix}09 - Sanskrit`;
  }
  if (lower.includes('physics') || lower.includes('phys')) {
    return '117 - Physics';
  }
  if (lower.includes('chemistry') || lower.includes('chem')) {
    return '118 - Chemistry';
  }
  if (lower.includes('biology') || lower.includes('biol')) {
    return '119 - Biology';
  }
  if (lower.includes('agriculture')) {
    return '120 - Agriculture';
  }
  if (lower.includes('mathematics') || lower.includes('math')) {
    return facultyHint === 'ARTS' ? '327 - Mathematics' : '121 - Mathematics';
  }
  if (lower.includes('business') || lower.includes('studies')) {
    return '217 - Business Studies';
  }
  if (lower.includes('entrepreneur')) {
    return '218 - Entrepreneurship';
  }
  if (lower.includes('accountancy') || lower.includes('account')) {
    return '220 - Accountancy';
  }
  if (lower.includes('economics') || lower.includes('econ')) {
    return facultyHint === 'COMMERCE' ? '219 - Economics' : '326 - Economics';
  }
  if (lower.includes('music')) {
    return '318 - Music';
  }
  if (lower.includes('home') && lower.includes('science')) {
    return '319 - Home Science';
  }
  if (lower.includes('philosophy')) {
    return '320 - Philosophy';
  }
  if (lower.includes('history') || lower.includes('hist')) {
    return '321 - History';
  }
  if (lower.includes('political')) {
    return '322 - Political Science';
  }
  if (lower.includes('geography') || lower.includes('geog')) {
    return '323 - Geography';
  }
  if (lower.includes('psychology') || lower.includes('psych')) {
    return '324 - Psychology';
  }
  if (lower.includes('sociology') || lower.includes('socio')) {
    return '325 - Sociology';
  }

  return '';
}

/**
 * Infers gender from BSEB Unique ID when possible:
 * - 13-digit Matric ID: 126[1/2]518030042 -> 4th digit '1' = MALE, '2' = FEMALE
 * - 13-digit Inter ID:  225[1/2]233370010 -> 4th digit '1' = MALE, '2' = FEMALE
 */
export function inferGenderFromBsebId(bsebId: string): 'MALE' | 'FEMALE' | null {
  const digits = bsebId.replace(/\D/g, '');
  if (digits.length === 13) {
    const fourth = digits[3];
    if (fourth === '1') return 'MALE';
    if (fourth === '2') return 'FEMALE';
  }
  return null;
}

/**
 * Parses a BSEB Secondary (Matric / Class 10th) Admit Card from PDF text layer items with coordinates.
 */
export function parseMatricTextItems(
  items: PdfTextItem[],
  pageNumber: number,
  fileName: string,
  serialNo: number
): AdmitCardRecord {
  // Check if this page is actually an Intermediate text-layer page
  const fullPageStr = items.map((i) => i.str).join(' ');
  if (/INTERMEDIATE\s+ANNUAL\s+EXAMINATION/i.test(fullPageStr)) {
    return parseInterTextItems(items, pageNumber, fileName, serialNo);
  }

  // Helper to get text in a y-range [yMin, yMax] and x-range [xMin, xMax]
  const getTextInBox = (yMin: number, yMax: number, xMin = 135, xMax = 590): string => {
    const matched = items
      .filter((it) => it.y >= yMin && it.y <= yMax && it.x >= xMin && it.x <= xMax && it.str.trim() !== '')
      .sort((a, b) => a.x - b.x);
    return matched
      .map((m) => m.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  let bsebUniqueId = getTextInBox(712, 728, 135, 450).replace(/[^0-9]/g, '');
  if (!bsebUniqueId) {
    const idMatch = fullPageStr.match(/\b(12[56]\d{10})\b/);
    if (idMatch) bsebUniqueId = idMatch[1];
  }

  let schoolRaw = getTextInBox(692, 706, 135, 580);
  let schoolCode = '';
  let schoolName = schoolRaw;
  const schoolSplit = schoolRaw.match(/^(\d{4,6})\s*[-–:]\s*(.+)$/);
  if (schoolSplit) {
    schoolCode = schoolSplit[1].trim();
    schoolName = schoolSplit[2].trim();
  }

  const studentName = getTextInBox(676, 689, 135, 450);
  const motherName = getTextInBox(660, 673, 135, 450);
  const fatherName = getTextInBox(644, 657, 135, 450);
  const aadhaarNo = getTextInBox(628, 641, 135, 450);
  const dob = getTextInBox(612, 625, 135, 450);

  let genderRaw = getTextInBox(595, 608, 135, 380).toUpperCase();
  let gender: 'MALE' | 'FEMALE' | 'OTHER' =
    genderRaw.includes('FEMALE') ? 'FEMALE' : genderRaw.includes('MALE') ? 'MALE' : 'OTHER';
  if (gender === 'OTHER') {
    const inferred = inferGenderFromBsebId(bsebUniqueId);
    if (inferred) gender = inferred;
  }

  const studentCategory = getTextInBox(581, 593, 135, 390) || 'REGULAR';
  const registrationNo = getTextInBox(568, 580, 135, 390)
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\/\s*20\s+(\d{2})\b/, '/ 20$1');

  // Right side of y=568..580 has "(a) जाति : BC (b) दिव्यांग कोटि : No"
  const casteAndDivyangRaw = getTextInBox(568, 580, 395, 590);
  let casteCategory = 'GENERAL';
  const casteMatch = casteAndDivyangRaw.match(/\b(GENERAL|EBC|BC|SC|ST)\b/i);
  if (casteMatch) {
    casteCategory = casteMatch[1].toUpperCase();
  }
  let differentlyAbled = 'No';
  const divMatch = casteAndDivyangRaw.match(/:\s*(No|Yes)\b/i);
  if (divMatch) {
    differentlyAbled = divMatch[1];
  }

  const rollCode = getTextInBox(555, 567, 135, 390) || schoolCode;
  const rollNumberRaw = getTextInBox(555, 567, 395, 590);
  const rollNumber = rollNumberRaw.replace(/^.*:\s*/, '').trim() || 'xxxxxxxxx';

  const examCenter = getTextInBox(542, 554, 135, 590);

  // Extract Exam Year from header
  const yearMatch = fullPageStr.match(/EXAMINATION\s*,\s*(20\d{2})/i);
  const examYear = yearMatch ? yearMatch[1] : '2027';

  // Subject Table in Matric Admit Card:
  // Language 1 (upper row, y=472..498, x=115..215)
  const langSubject1 = getTextInBox(472, 498, 115, 215).replace(/\s*-\s*/g, ' - ');
  // Language 2 (lower row, y=440..471, x=115..215)
  const langSubject2 = getTextInBox(440, 471, 115, 215).replace(/\s*-\s*/g, ' - ');

  // Compulsory Subjects (x=285..420, 4 rows at y ≈ 491, 475, 460, 445)
  const compRow1 = getTextInBox(485, 499, 285, 420);
  const compRow2 = getTextInBox(469, 484, 285, 420);
  const compRow3 = getTextInBox(454, 468, 285, 420);
  const compRow4 = getTextInBox(438, 453, 285, 420);

  const compList = [compRow1, compRow2, compRow3, compRow4].filter(Boolean);

  // Optional Subjects (x=495..590, y=438..499)
  const additionalSubject = getTextInBox(438, 499, 495, 590);

  const allSubjects = [langSubject1, langSubject2, ...compList, additionalSubject].filter(Boolean);

  return {
    id: `${fileName}-p${pageNumber}-${bsebUniqueId || serialNo}`,
    serialNo,
    examType: 'MATRIC (10th)',
    examYear,
    faculty: 'SECONDARY',
    bsebUniqueId,
    schoolCode: schoolCode || rollCode,
    schoolName: schoolRaw || schoolName,
    studentName,
    motherName,
    fatherName,
    dob,
    gender,
    maritalStatus: 'N/A',
    aadhaarNo,
    studentCategory,
    casteCategory,
    differentlyAbled,
    registrationNo,
    rollCode,
    rollNumber,
    examCenter,
    langSubject1,
    langSubject2,
    compulsorySubject1: compList[0] || '',
    compulsorySubject2: compList[1] || '',
    compulsorySubject3: compList[2] || '',
    compulsorySubject4: compList[3] || '',
    additionalSubject,
    allSubjectsSummary: allSubjects.join(', '),
    sourceFileName: fileName,
    sourcePageNumber: pageNumber,
    extractionMethod: 'PDF_TEXT_LAYER',
  };
}

/**
 * Parses a BSEB Intermediate (+2) Admit Card when selectable PDF text items exist.
 */
export function parseInterTextItems(
  items: PdfTextItem[],
  pageNumber: number,
  fileName: string,
  serialNo: number
): AdmitCardRecord {
  const fullText = items.map((i) => i.str).join('\n');
  return parseInterOcrZones({ topFieldsText: fullText }, pageNumber, fileName, serialNo, 'PDF_TEXT_LAYER');
}

/**
 * Cleans an extracted uppercase person/school name from OCR noise
 */
function cleanOcrNameLine(line: string): string {
  // Remove leading Hindi-garbled prefix before ':' if any
  let s = line.includes(':') ? line.split(':').slice(1).join(':') : line;
  // Remove common trailing/leading OCR artifacts (single numbers/punctuation)
  s = s
    .replace(/^[^A-Za-z]+/, '')
    .replace(/[^A-Za-z\s.,()-]+$/g, '')
    .replace(/\b[0-9]+\??\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.toUpperCase();
}

/**
 * Parses Intermediate (+2) Admit Card from Multi-Zone OCR text.
 */
export function parseInterOcrZones(
  zones: InterOcrZonesInput,
  pageNumber: number,
  fileName: string,
  serialNo: number,
  method: 'HYBRID_OCR' | 'PDF_TEXT_LAYER' | 'GEMINI_VISION' = 'HYBRID_OCR'
): AdmitCardRecord {
  const rawTop = zones.topFieldsText || '';
  const lines = rawTop
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Find BSEB Unique ID (13 digits starting with 22 or 12)
  let bsebUniqueId = '';
  let bsebLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\b([12]\d{12})\b/);
    if (m) {
      bsebUniqueId = m[1];
      bsebLineIdx = i;
      break;
    }
  }

  // 2. Find Marital Status line index ("Unmarried" or "Married")
  let maritalLineIdx = -1;
  let maritalStatus = 'Unmarried';
  for (let i = 0; i < lines.length; i++) {
    if (/\bunmarried\b/i.test(lines[i])) {
      maritalLineIdx = i;
      maritalStatus = 'Unmarried';
      break;
    } else if (/\bmarried\b/i.test(lines[i])) {
      maritalLineIdx = i;
      maritalStatus = 'Married';
      break;
    }
  }

  // Lines between bsebLineIdx and maritalLineIdx are:
  // [bsebLineIdx + 1]: College/+2 School Name
  // [bsebLineIdx + 2]: Student Name
  // [bsebLineIdx + 3]: Mother's Name
  // [bsebLineIdx + 4]: Father's Name
  let schoolName = '';
  let studentName = '';
  let motherName = '';
  let fatherName = '';

  if (bsebLineIdx !== -1) {
    const endIdx = maritalLineIdx !== -1 ? maritalLineIdx : Math.min(lines.length, bsebLineIdx + 6);
    const middleLines = lines.slice(bsebLineIdx + 1, endIdx).map(cleanOcrNameLine).filter(Boolean);
    if (middleLines.length >= 4) {
      schoolName = middleLines[0];
      studentName = middleLines[1];
      motherName = middleLines[2];
      fatherName = middleLines[3];
    } else if (middleLines.length === 3) {
      schoolName = middleLines[0];
      studentName = middleLines[1];
      motherName = middleLines[2];
    }
  }

  // 3. Aadhaar Number (12 digits) & Divyang Category
  let aadhaarNo = '';
  let differentlyAbled = 'NO';
  for (const line of lines) {
    const aadhaarMatch = line.match(/\b(\d{12}|\d{4}-\d{4}-\d{4})\b/);
    if (aadhaarMatch && aadhaarMatch[1].replace(/\D/g, '') !== bsebUniqueId) {
      const digits = aadhaarMatch[1].replace(/\D/g, '');
      aadhaarNo = `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
      if (/\bYES\b/i.test(line)) differentlyAbled = 'YES';
      else differentlyAbled = 'NO';
      break;
    }
  }

  // 4. Registration / Listing No (e.g., R-313370010-25) & Student Category (REGULAR / EX / COMPARTMENTAL)
  let registrationNo = '';
  let studentCategory = 'REGULAR';
  for (const line of lines) {
    const regMatch = line.match(/\b(R-\d{7,10}-\d{2})\b/i);
    if (regMatch) {
      registrationNo = regMatch[1].toUpperCase();
    }
    const catMatch = line.match(/\b(REGULAR|COMPARTMENTAL|IMPROVEMENT|PRIVATE|EX)\b/i);
    if (catMatch) {
      studentCategory = catMatch[1].toUpperCase();
    }
  }

  // 5. Roll Code (5 digits, e.g., 31337) & Gender & Roll Number
  let rollCode = '';
  if (registrationNo) {
    const rcFromReg = registrationNo.match(/^R-(\d{5})/);
    if (rcFromReg) rollCode = rcFromReg[1];
  }
  if (!rollCode) {
    for (const line of lines) {
      const rcMatch = line.match(/\b(\d{5})\b/);
      if (rcMatch) {
        rollCode = rcMatch[1];
        break;
      }
    }
  }

  let gender: 'MALE' | 'FEMALE' | 'OTHER' = 'OTHER';
  if (/\bfemale\b/i.test(rawTop)) {
    gender = 'FEMALE';
  } else if (/\bmale\b/i.test(rawTop)) {
    gender = 'MALE';
  }
  // Cross-verify with BSEB Unique ID 4th digit invariant
  const inferredGender = inferGenderFromBsebId(bsebUniqueId);
  if (inferredGender) {
    gender = inferredGender;
  }

  // 6. Determine Faculty from facultyText, rawTop, or Subject Codes
  const combinedFacultySearch = `${zones.facultyText || ''} ${rawTop}`;
  let faculty: FacultyType = 'ARTS';
  if (/COMMERCE/i.test(combinedFacultySearch)) {
    faculty = 'COMMERCE';
  } else if (/SCIENCE/i.test(combinedFacultySearch)) {
    faculty = 'SCIENCE';
  } else if (/ARTS/i.test(combinedFacultySearch)) {
    faculty = 'ARTS';
  } else {
    // Infer from subject codes in elec1/elec2/comp1
    const allSubjRaw = `${zones.comp1Text || ''} ${zones.elec1Text || ''} ${zones.elec2Text || ''}`;
    if (/\b(117|118|119|121)\b|Physics|Chemistry|Biology/i.test(allSubjRaw)) {
      faculty = 'SCIENCE';
    } else if (/\b(217|218|219|220)\b|Business|Entrepreneurship|Accountancy/i.test(allSubjRaw)) {
      faculty = 'COMMERCE';
    }
  }

  // 7. Normalize Subjects
  const langSubject1 = normalizeInterSubjectCell(zones.comp1Text || '', faculty);
  const langSubject2 = normalizeInterSubjectCell(zones.comp2Text || '', faculty);
  const compulsorySubject1 = normalizeInterSubjectCell(zones.elec1Text || '', faculty);
  const compulsorySubject2 = normalizeInterSubjectCell(zones.elec2Text || '', faculty);
  const compulsorySubject3 = normalizeInterSubjectCell(zones.elec3Text || '', faculty);
  const additionalSubject =
    normalizeInterSubjectCell(zones.addl1Text || '', faculty) ||
    normalizeInterSubjectCell(zones.addl2Text || '', faculty) ||
    normalizeInterSubjectCell(zones.addl3Text || '', faculty);

  const allSubjects = [
    langSubject1,
    langSubject2,
    compulsorySubject1,
    compulsorySubject2,
    compulsorySubject3,
    additionalSubject,
  ].filter(Boolean);

  return {
    id: `${fileName}-p${pageNumber}-${bsebUniqueId || serialNo}`,
    serialNo,
    examType: 'INTERMEDIATE (+2)',
    examYear: '2027',
    faculty,
    bsebUniqueId,
    schoolCode: rollCode,
    schoolName: schoolName ? (rollCode ? `${rollCode} - ${schoolName}` : schoolName) : '',
    studentName,
    motherName,
    fatherName,
    dob: 'N/A',
    gender,
    maritalStatus,
    aadhaarNo,
    studentCategory,
    casteCategory: 'N/A',
    differentlyAbled,
    registrationNo,
    rollCode,
    rollNumber: 'XXXXXXXX',
    examCenter: 'XXXXXXXX',
    langSubject1,
    langSubject2,
    compulsorySubject1,
    compulsorySubject2,
    compulsorySubject3,
    compulsorySubject4: '',
    additionalSubject,
    allSubjectsSummary: allSubjects.join(', '),
    sourceFileName: fileName,
    sourcePageNumber: pageNumber,
    extractionMethod: method,
  };
}

/**
 * Computes comprehensive school & exam summary statistics from extracted AdmitCardRecords.
 */
export function computeSummaryStats(records: AdmitCardRecord[]): SummaryStats {
  const stats: SummaryStats = {
    totalStudents: records.length,
    maleCount: 0,
    femaleCount: 0,
    matricCount: 0,
    interCount: 0,
    byFaculty: {},
    byStudentCategory: {},
    byCasteCategory: {},
    bySubject: {},
    bySchool: {},
  };

  for (const r of records) {
    if (r.gender === 'MALE') stats.maleCount++;
    else if (r.gender === 'FEMALE') stats.femaleCount++;

    if (r.examType === 'MATRIC (10th)') stats.matricCount++;
    else stats.interCount++;

    const fac = r.faculty || 'UNKNOWN';
    stats.byFaculty[fac] = (stats.byFaculty[fac] || 0) + 1;

    const cat = r.studentCategory || 'REGULAR';
    stats.byStudentCategory[cat] = (stats.byStudentCategory[cat] || 0) + 1;

    if (r.casteCategory && r.casteCategory !== 'N/A') {
      stats.byCasteCategory[r.casteCategory] = (stats.byCasteCategory[r.casteCategory] || 0) + 1;
    }

    const schoolKey = r.schoolName || r.schoolCode || 'Unspecified School';
    stats.bySchool[schoolKey] = (stats.bySchool[schoolKey] || 0) + 1;

    const subjects = [
      r.langSubject1,
      r.langSubject2,
      r.compulsorySubject1,
      r.compulsorySubject2,
      r.compulsorySubject3,
      r.compulsorySubject4,
      r.additionalSubject,
    ].filter(Boolean);

    for (const sub of subjects) {
      stats.bySubject[sub] = (stats.bySubject[sub] || 0) + 1;
    }
  }

  return stats;
}
