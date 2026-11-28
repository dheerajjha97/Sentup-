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

interface VisualLine {
  y: number;
  items: PdfTextItem[];
  text: string;
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
 * Clusters raw PDF text items into horizontal visual lines by y-coordinate (top to bottom),
 * sorting items left to right within each row. Eliminates brittle hardcoded pixel boxes.
 */
function clusterItemsIntoLines(items: PdfTextItem[], yTolerance = 4.5): VisualLine[] {
  const cleaned = items
    .filter((it) => it.str && it.str.trim() !== '')
    .map((it) => ({ str: it.str.trim(), x: it.x, y: it.y }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: VisualLine[] = [];
  for (const item of cleaned) {
    const match = lines.find((line) => Math.abs(line.y - item.y) <= yTolerance);
    if (match) {
      match.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item], text: '' });
    }
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items
      .map((it) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  lines.sort((a, b) => b.y - a.y);
  return lines;
}

const KNOWN_ANY_FIELD_LABEL_RE =
  /(bseb\s*unique\s*id|unique\s*id|school\s*name|college\s*\/?\s*\+?\s*2|name\s*of\s*school|student['’]?s?\s*name|candidate['’]?s?\s*name|mother['’]?s?\s*name|father['’]?s?\s*name|aadha?r|date\s*of\s*birth|\bd\.?o\.?b\.?\b|marital\s*status|\bgender\b|\bsex\b|student\s*category|registration\s*(no|number)|listing\s*(no|number)|roll\s*code|roll\s*(no|number)|exam(ination)?\s*cent(re|er)|caste\s*category|differently\s*abled|divyang|faculty|यूनिक\s*आईडी|विद्यालय\s*का\s*नाम|महाविद्यालय|परीक्षार्थी\s*का\s*नाम|छात्र\s*का\s*नाम|माता\s*का\s*नाम|पिता\s*का\s*नाम|आधार|जन्म\s*तिथि|वैवाहिक|लिंग|कोटि|पंजीयन|सूचीकरण|जाति|दिव्यांग|रौल\s*कोड|रोल\s*कोड|रौल\s*नम्बर|रोल\s*नंबर|परीक्षा\s*केन्द्र|संकाय)/i;

const HEADER_OR_FOOTER_NOISE_RE =
  /(bihar\s*school\s*examination|annual\s*(secondary|intermediate)|dummy\s*admit\s*card|admit\s*card|प्रवेश\s*पत्र|डमी\s*प्रवेश|बिहार\s*विद्यालय\s*परीक्षा|controller\s*of\s*exam|signature\s*of|principal|instructions|निर्देश|subject\s*offered|विषय\s*विवरण|compulsory|elective|additional|optional|language\s*subject)/i;

/**
 * Strips leading colons, dashes, Hindi label fragments, and whitespace from an extracted field value.
 */
function stripLeadingLabelDecor(raw: string): string {
  let s = raw.trim();
  // If a bilingual label leaves trailing Hindi before a colon (e.g. "परीक्षार्थी का नाम : MOHAMMAD ARMAN"), keep after ':'
  const colonIdx = s.indexOf(':');
  if (colonIdx !== -1 && colonIdx < 40) {
    const before = s.slice(0, colonIdx).trim();
    const after = s.slice(colonIdx + 1).trim();
    if (
      after &&
      (before === '' ||
        /[\u0900-\u097F]/.test(before) ||
        KNOWN_ANY_FIELD_LABEL_RE.test(before) ||
        /^[(a-z)]+$/i.test(before))
    ) {
      s = after;
    }
  }
  return s.replace(/^[\s:–—-]+/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts the value portion of a visual line strictly after a matched field label,
 * optionally stopping before a second column's label on the same row.
 */
function extractLabeledValue(
  lineText: string,
  labelRegex: RegExp,
  stopBeforeRegex?: RegExp
): string {
  const m = lineText.match(labelRegex);
  if (!m || m.index === undefined) return '';
  let remainder = lineText.slice(m.index + m[0].length);
  if (stopBeforeRegex) {
    const stopMatch = remainder.match(stopBeforeRegex);
    if (stopMatch && stopMatch.index !== undefined) {
      remainder = remainder.slice(0, stopMatch.index);
    }
  }
  return stripLeadingLabelDecor(remainder);
}

/**
 * Validates whether a string is a plausible person/school name rather than an ID, date, gender, or label.
 */
function isNonNamePattern(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (HEADER_OR_FOOTER_NOISE_RE.test(s)) return true;
  if (KNOWN_ANY_FIELD_LABEL_RE.test(s)) return true;
  if (/^\d{4,6}\s*[-–:]/.test(s)) return true; // School code prefix
  if (/^\d{12,13}$/.test(s.replace(/[\s-]/g, ''))) return true; // BSEB ID or Aadhaar
  if (/^[xX\d]{4}[- ]?[xX\d]{4}[- ]?\d{4}$/.test(s)) return true; // Masked Aadhaar
  if (/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.test(s)) return true; // DOB
  if (/^(MALE|FEMALE|OTHER|TRANSGENDER|UNMARRIED|MARRIED|REGULAR|PRIVATE|EX|COMPARTMENTAL|IMPROVEMENT|YES|NO|GENERAL|OBC|EBC|BC|SC|ST|N\/A)$/i.test(s)) {
    return true;
  }
  if (/^(R-)?[A-Z0-9]{4,6}-\d{4,10}-\d{2}/i.test(s)) return true; // Registration No
  if (/^[xX]{5,}$/.test(s.replace(/\s+/g, ''))) return true; // XXXXXXXX placeholder
  return false;
}

function cleanPersonNameValue(raw: string): string {
  const stripped = stripLeadingLabelDecor(raw)
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/[^A-Za-z.\s'()-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped || isNonNamePattern(stripped)) return '';
  const letters = (stripped.match(/[A-Za-z]/g) || []).length;
  const digits = (stripped.match(/\d/g) || []).length;
  if (letters < 2 || digits > 1) return '';
  return stripped.toUpperCase();
}

function extractAadhaarPattern(text: string, excludeBsebId: string): string {
  // Match 12-digit numeric or hyphenated Aadhaar (including masked XXXX-XXXX-1234)
  const maskedMatch = text.match(/\b([xX*]{4}[- ]?[xX*]{4}[- ]?\d{4})\b/);
  if (maskedMatch) {
    const clean = maskedMatch[1].replace(/\s+/g, '-').toUpperCase();
    return clean;
  }
  const hyphenMatch = text.match(/\b(\d{4}[-\s]\d{4}[-\s]\d{4})\b/);
  if (hyphenMatch) {
    const digits = hyphenMatch[1].replace(/\D/g, '');
    if (digits.length === 12 && digits !== excludeBsebId) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
    }
  }
  const plainMatch = text.match(/(?<!\d)(\d{12})(?!\d)/);
  if (plainMatch && plainMatch[1] !== excludeBsebId) {
    const d = plainMatch[1];
    return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}`;
  }
  return '';
}

function extractDobPattern(text: string): string {
  const m = text.match(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/);
  return m ? m[1] : '';
}

function extractMatricRegistrationNo(text: string): string {
  const m =
    text.match(/\b([A-Z0-9]{4,6}-\d{5}-\d{2})\b/i) ||
    text.match(/\b(\d{5}-\d{5}-\d{2})\b/);
  return m ? m[1].toUpperCase() : '';
}

/**
 * Cleans an extracted uppercase person/school name from OCR noise
 */
function cleanOcrNameLine(line: string): string {
  let s = line;
  const colonIdx = s.indexOf(':');
  if (colonIdx !== -1 && colonIdx < 45) {
    const after = s.slice(colonIdx + 1).trim();
    if (after) s = after;
  }
  s = s
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/[^A-Za-z\s.,'()-]+$/g, '')
    .replace(/\b[0-9]+\??\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.toUpperCase();
}

/**
 * Parses a BSEB Secondary (Matric / Class 10th) Admit Card from PDF text layer items with coordinates.
 * Uses Label-Anchored + Pattern-Anchored visual-row parsing so shifted margins or 2-line school names
 * never push student details into the wrong columns.
 */
export function parseMatricTextItems(
  items: PdfTextItem[],
  pageNumber: number,
  fileName: string,
  serialNo: number
): AdmitCardRecord {
  const fullPageStr = items.map((i) => i.str).join(' ');
  if (/INTERMEDIATE\s+ANNUAL\s+EXAMINATION|INTERMEDIATE\s+SENT-?UP|INTERMEDIATE\s+\(\+2\)/i.test(fullPageStr)) {
    return parseInterTextItems(items, pageNumber, fileName, serialNo);
  }

  const lines = clusterItemsIntoLines(items, 4.5);

  const findLineIndex = (re: RegExp, startIdx = 0): number => {
    for (let i = startIdx; i < lines.length; i++) {
      if (re.test(lines[i].text)) return i;
    }
    return -1;
  };

  // Stop-markers for left column when a 2nd field sits on the right side of the same row
  const RIGHT_COL_STOP_RE =
    /(\(a\)|\(b\)|caste|जाति|differently\s*abled|divyang|दिव्यांग|roll\s*(no|number)|रौल\s*नम्बर|रोल\s*नंबर|क्रमांक|gender|लिंग)/i;

  // 1. BSEB Unique ID (13 digits starting with 12x)
  let bsebUniqueId = '';
  let bsebIdx = findLineIndex(/bseb\s*unique\s*id|unique\s*id|यूनिक\s*आईडी/i);
  if (bsebIdx !== -1) {
    const idVal = extractLabeledValue(lines[bsebIdx].text, /bseb\s*unique\s*id|unique\s*id|यूनिक\s*आईडी/i);
    const m = idVal.match(/\b(\d{13})\b/);
    if (m) bsebUniqueId = m[1];
  }
  if (!bsebUniqueId) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].text.match(/\b(12[4-9]\d{10})\b/);
      if (m) {
        bsebUniqueId = m[1];
        bsebIdx = i;
        break;
      }
    }
  }

  // 2. School Code & School Name (supports 2-line wrapped school names!)
  let schoolCode = '';
  let schoolName = '';
  let schoolEndIdx = -1;

  const schoolLabelRe =
    /(?:name\s*of\s*(?:the\s*)?school|school\s*(?:code\s*&?\s*)?name|विद्यालय\s*का\s*नाम)/i;
  let schoolIdx = findLineIndex(schoolLabelRe);
  let schoolRaw = '';
  if (schoolIdx !== -1) {
    schoolRaw = extractLabeledValue(lines[schoolIdx].text, schoolLabelRe);
  } else {
    // Pattern anchor: "51803 - HIGH SECONDARY SCHOOL BERUA"
    for (let i = Math.max(0, bsebIdx); i < lines.length; i++) {
      if (/^\d{4,6}\s*[-–:]\s*[A-Za-z]/.test(lines[i].text) || /\b\d{4,6}\s*[-–:]\s*[A-Za-z]{3,}/.test(lines[i].text)) {
        // Avoid matching Registration No like 51803-00004-26
        if (!extractMatricRegistrationNo(lines[i].text)) {
          schoolIdx = i;
          schoolRaw = lines[i].text;
          break;
        }
      }
    }
  }

  if (schoolIdx !== -1) {
    schoolEndIdx = schoolIdx;
    // Check if the immediately following line is a continuation of a wrapped 2-line school name
    // (only when label-based parsing confirms the next line has NO new field label and looks like part of school address)
    if (schoolIdx + 1 < lines.length) {
      const nextLineText = lines[schoolIdx + 1].text;
      const hasStudentLabelAnywhere = findLineIndex(/student['’]?s?\s*name|candidate['’]?s?\s*name|परीक्षार्थी\s*का\s*नाम/i) !== -1;
      if (
        hasStudentLabelAnywhere &&
        !KNOWN_ANY_FIELD_LABEL_RE.test(nextLineText) &&
        !HEADER_OR_FOOTER_NOISE_RE.test(nextLineText) &&
        !extractAadhaarPattern(nextLineText, bsebUniqueId) &&
        !extractDobPattern(nextLineText)
      ) {
        schoolRaw = `${schoolRaw} ${stripLeadingLabelDecor(nextLineText)}`.trim();
        schoolEndIdx = schoolIdx + 1;
      }
    }

    const schoolSplit = schoolRaw.match(/(\d{4,6})\s*[-–:]\s*(.+)$/);
    if (schoolSplit) {
      schoolCode = schoolSplit[1].trim();
      schoolName = `${schoolCode} - ${schoolSplit[2].trim()}`;
    } else {
      schoolName = schoolRaw.trim();
    }
  }

  // 3. DOB, Aadhaar, Gender, Category, Registration, Caste, Divyang, Roll Code, Roll Number, Exam Centre
  // Try Label-Anchored first, then Pattern-Anchored fallback!

  // DOB
  let dob = '';
  let dobIdx = findLineIndex(/date\s*of\s*birth|\bd\.?o\.?b\.?\b|जन्म\s*तिथि/i);
  if (dobIdx !== -1) {
    dob = extractDobPattern(
      extractLabeledValue(lines[dobIdx].text, /date\s*of\s*birth|\bd\.?o\.?b\.?\b|जन्म\s*तिथि/i, RIGHT_COL_STOP_RE)
    );
  }
  if (!dob) {
    for (let i = Math.max(0, schoolIdx); i < lines.length; i++) {
      const foundDob = extractDobPattern(lines[i].text);
      if (foundDob) {
        dob = foundDob;
        dobIdx = i;
        break;
      }
    }
  }

  // Aadhaar
  let aadhaarNo = '';
  let aadhaarIdx = findLineIndex(/aadha?r|आधार/i);
  if (aadhaarIdx !== -1) {
    aadhaarNo = extractAadhaarPattern(
      extractLabeledValue(lines[aadhaarIdx].text, /aadha?r(?:\s*no\.?|\s*number)?|आधार(?:\s*संख्या|\s*नंबर)?/i, RIGHT_COL_STOP_RE),
      bsebUniqueId
    );
  }
  if (!aadhaarNo) {
    const searchEnd = dobIdx !== -1 ? dobIdx + 1 : lines.length;
    for (let i = Math.max(0, bsebIdx + 1); i < searchEnd; i++) {
      const found = extractAadhaarPattern(lines[i].text, bsebUniqueId);
      if (found) {
        aadhaarNo = found;
        aadhaarIdx = i;
        break;
      }
    }
  }

  // 4. Student Name, Mother's Name, Father's Name
  // Tier A: Label-Anchored Extraction (100% immune to vertical shift & 2-line school name!)
  let studentName = '';
  let motherName = '';
  let fatherName = '';

  const studentLabelRe = /(?:student['’]?s?\s*name|candidate['’]?s?\s*name|परीक्षार्थी\s*का\s*नाम|छात्र\s*का\s*नाम)/i;
  const motherLabelRe = /(?:mother['’]?s?\s*name|माता\s*का\s*नाम)/i;
  const fatherLabelRe = /(?:father['’]?s?\s*name|पिता\s*का\s*नाम)/i;

  const stuLabelIdx = findLineIndex(studentLabelRe);
  if (stuLabelIdx !== -1) {
    studentName = cleanPersonNameValue(extractLabeledValue(lines[stuLabelIdx].text, studentLabelRe));
  }
  const momLabelIdx = findLineIndex(motherLabelRe);
  if (momLabelIdx !== -1) {
    motherName = cleanPersonNameValue(extractLabeledValue(lines[momLabelIdx].text, motherLabelRe));
  }
  const dadLabelIdx = findLineIndex(fatherLabelRe);
  if (dadLabelIdx !== -1) {
    fatherName = cleanPersonNameValue(extractLabeledValue(lines[dadLabelIdx].text, fatherLabelRe));
  }

  // Tier B: Pattern-Anchored Bottom-Up Fallback (when labels are missing or encoded in unreadable Hindi font)
  if (!studentName || !motherName || !fatherName) {
    const topBound = schoolEndIdx !== -1 ? schoolEndIdx + 1 : bsebIdx !== -1 ? bsebIdx + 1 : 0;
    const bottomBoundCandidates = [aadhaarIdx, dobIdx].filter((idx) => idx !== -1 && idx > topBound);
    const bottomBound =
      bottomBoundCandidates.length > 0
        ? Math.min(...bottomBoundCandidates)
        : Math.min(lines.length, topBound + 6);

    const candidateLines: { idx: number; name: string }[] = [];
    for (let i = topBound; i < bottomBound; i++) {
      // Only take items from the main student value area (avoid photo/signature text far right if any)
      const leftHalfText = lines[i].items
        .filter((it) => it.x < 460)
        .map((it) => it.str)
        .join(' ')
        .trim();
      const cleanedName = cleanPersonNameValue(leftHalfText || lines[i].text);
      if (cleanedName) {
        candidateLines.push({ idx: i, name: cleanedName });
      }
    }

    if (candidateLines.length >= 3) {
      // Bottom-up anchoring from Aadhaar/DOB guarantees a 2-line wrapped school name at the top
      // gets merged into schoolName instead of shifting Student -> Mother -> Father!
      const len = candidateLines.length;
      if (!fatherName) fatherName = candidateLines[len - 1].name;
      if (!motherName) motherName = candidateLines[len - 2].name;
      if (!studentName) studentName = candidateLines[len - 3].name;

      // Any extra lines above the last 3 belong to a wrapped school name
      if (len > 3 && schoolIdx !== -1) {
        const extraSchoolLines = candidateLines.slice(0, len - 3).map((c) => c.name);
        if (extraSchoolLines.length > 0) {
          const suffix = extraSchoolLines.join(' ');
          if (!schoolName.toUpperCase().includes(suffix)) {
            schoolName = `${schoolName} ${suffix}`.trim();
          }
        }
      }
    } else if (candidateLines.length === 2) {
      if (!studentName) studentName = candidateLines[0].name;
      if (!motherName) motherName = candidateLines[1].name;
    } else if (candidateLines.length === 1) {
      if (!studentName) studentName = candidateLines[0].name;
    }
  }

  // 5. Gender
  let gender: 'MALE' | 'FEMALE' | 'OTHER' = 'OTHER';
  const genderLabelIdx = findLineIndex(/\bgender\b|\bsex\b|लिंग/i);
  if (genderLabelIdx !== -1) {
    const gVal = extractLabeledValue(lines[genderLabelIdx].text, /\bgender\b|\bsex\b|लिंग/i, RIGHT_COL_STOP_RE).toUpperCase();
    if (gVal.includes('FEMALE')) gender = 'FEMALE';
    else if (gVal.includes('MALE')) gender = 'MALE';
  }
  if (gender === 'OTHER') {
    const startSearch = dobIdx !== -1 ? dobIdx : Math.max(0, schoolEndIdx);
    const endSearch = Math.min(lines.length, startSearch + 6);
    for (let i = startSearch; i < endSearch; i++) {
      if (/\bFEMALE\b/i.test(lines[i].text)) {
        gender = 'FEMALE';
        break;
      }
      if (/\bMALE\b/i.test(lines[i].text)) {
        gender = 'MALE';
        break;
      }
    }
  }
  if (gender === 'OTHER') {
    const inferred = inferGenderFromBsebId(bsebUniqueId);
    if (inferred) gender = inferred;
  }

  // 6. Student Category
  let studentCategory = 'REGULAR';
  const catLabelIdx = findLineIndex(/student\s*category|परीक्षार्थी\s*की\s*कोटि/i);
  if (catLabelIdx !== -1) {
    const cVal = extractLabeledValue(lines[catLabelIdx].text, /student\s*category|परीक्षार्थी\s*की\s*कोटि/i, RIGHT_COL_STOP_RE);
    const m = cVal.match(/\b(REGULAR|EX|COMPARTMENTAL|IMPROVEMENT|PRIVATE)\b/i);
    if (m) studentCategory = m[1].toUpperCase();
  } else {
    const startSearch = dobIdx !== -1 ? dobIdx : 0;
    for (let i = startSearch; i < Math.min(lines.length, startSearch + 8); i++) {
      const m = lines[i].text.match(/\b(REGULAR|COMPARTMENTAL|IMPROVEMENT|PRIVATE|EX)\b/i);
      if (m) {
        studentCategory = m[1].toUpperCase();
        break;
      }
    }
  }

  // 7. Registration Number + Caste Category + Differently Abled
  let registrationNo = '';
  let regIdx = findLineIndex(/reg(?:istration)?\s*(?:no|number)|पंजीयन/i);
  if (regIdx !== -1) {
    registrationNo = extractMatricRegistrationNo(lines[regIdx].text);
  }
  if (!registrationNo) {
    for (let i = 0; i < lines.length; i++) {
      const found = extractMatricRegistrationNo(lines[i].text);
      if (found) {
        registrationNo = found;
        regIdx = i;
        break;
      }
    }
  }

  let casteCategory = 'GENERAL';
  let differentlyAbled = 'No';

  const casteLineIdx = findLineIndex(/caste|जाति|\(a\)/i);
  const casteSourceLine =
    casteLineIdx !== -1 ? lines[casteLineIdx].text : regIdx !== -1 ? lines[regIdx].text : '';
  if (casteSourceLine) {
    const casteMatch = casteSourceLine.match(/\b(GENERAL|EBC|BC|SC|ST)\b/i);
    if (casteMatch) casteCategory = casteMatch[1].toUpperCase();
  }

  const divLineIdx = findLineIndex(/differently\s*abled|divyang|दिव्यांग|\(b\)/i);
  const divSourceLine =
    divLineIdx !== -1 ? lines[divLineIdx].text : casteLineIdx !== -1 ? lines[casteLineIdx].text : regIdx !== -1 ? lines[regIdx].text : '';
  if (divSourceLine) {
    const divMatch = divSourceLine.match(/(?:differently\s*abled|divyang|दिव्यांग|\(b\)|:)\s*[:–-]?\s*(No|Yes)\b/i);
    if (divMatch) {
      differentlyAbled = divMatch[1].charAt(0).toUpperCase() + divMatch[1].slice(1).toLowerCase();
    }
  }

  // 8. Roll Code & Roll Number
  let rollCode = '';
  let rollNumber = '';
  let rollLineIdx = findLineIndex(/roll\s*code|रौल\s*कोड|रोल\s*कोड/i);
  if (rollLineIdx !== -1) {
    const rcVal = extractLabeledValue(
      lines[rollLineIdx].text,
      /roll\s*code|रौल\s*कोड|रोल\s*कोड/i,
      /roll\s*(?:no|number)|रौल\s*नम्बर|रोल\s*नंबर|क्रमांक/i
    );
    const m = rcVal.match(/\b(\d{5})\b/);
    if (m) rollCode = m[1];
  } else if (regIdx !== -1 && regIdx + 1 < lines.length) {
    // Check row right below Registration No
    const nextLine = lines[regIdx + 1];
    const leftText = nextLine.items
      .filter((it) => it.x < 395)
      .map((it) => it.str)
      .join(' ');
    const m = leftText.match(/\b(\d{5})\b/);
    if (m) {
      rollCode = m[1];
      rollLineIdx = regIdx + 1;
    }
  }
  if (!rollCode && registrationNo) {
    const m = registrationNo.match(/^(\d{5})-/);
    if (m) rollCode = m[1];
  }
  if (!rollCode && schoolCode) {
    rollCode = schoolCode.replace(/\D/g, '');
  }

  const rollNoLabelIdx = findLineIndex(/roll\s*(?:no|number)|रौल\s*नम्बर|रोल\s*नंबर|क्रमांक/i);
  if (rollNoLabelIdx !== -1) {
    const rnVal = extractLabeledValue(
      lines[rollNoLabelIdx].text,
      /roll\s*(?:no|number)\.?|रौल\s*नम्बर|रोल\s*नंबर|क्रमांक/i
    );
    const rnMatch = rnVal.match(/\b(\d{6,10}|x{5,})\b/i);
    if (rnMatch) rollNumber = rnMatch[1];
    else if (rnVal) rollNumber = rnVal.split(/\s+/)[0];
  } else if (rollLineIdx !== -1) {
    const rightText = lines[rollLineIdx].items
      .filter((it) => it.x >= 390)
      .map((it) => it.str)
      .join(' ')
      .replace(/^.*:\s*/, '')
      .trim();
    if (rightText) rollNumber = rightText;
  }
  if (!rollNumber) rollNumber = 'xxxxxxxxx';

  // 9. Exam Centre
  let examCenter = '';
  let examCenterIdx = findLineIndex(/exam(?:ination)?\s*cent(?:re|er)|परीक्षा\s*केन्द्र/i);
  if (examCenterIdx !== -1) {
    examCenter = extractLabeledValue(
      lines[examCenterIdx].text,
      /exam(?:ination)?\s*cent(?:re|er)(?:\s*name)?|परीक्षा\s*केन्द्र(?:\s*का\s*नाम)?/i
    );
  } else if (rollLineIdx !== -1 && rollLineIdx + 1 < lines.length) {
    const candidate = lines[rollLineIdx + 1].text;
    if (!/\b(MIL|SIL|MATHEMATICS|SCIENCE|SUBJECT)\b/i.test(candidate)) {
      examCenter = stripLeadingLabelDecor(candidate);
      examCenterIdx = rollLineIdx + 1;
    }
  }

  // Extract Exam Year from header
  const yearMatch = fullPageStr.match(/EXAMINATION\s*,?\s*(20\d{2})/i);
  const examYear = yearMatch ? yearMatch[1] : '2027';

  // 10. Dynamic Subject Table Parsing (NO hardcoded pixel y-coordinates!)
  const upperStopY =
    examCenterIdx !== -1
      ? lines[examCenterIdx].y - 5
      : rollLineIdx !== -1
      ? lines[rollLineIdx].y - 18
      : regIdx !== -1
      ? lines[regIdx].y - 30
      : 540;

  // Find footer boundary so instructions never leak into subjects
  const footerLineIdx = lines.findIndex(
    (l) =>
      l.y < upperStopY &&
      /(instructions|निर्देश|controller\s*of\s*exam|signature\s*of\s*principal|परीक्षा\s*नियंत्रक)/i.test(
        l.text
      )
  );
  const lowerStopY = footerLineIdx !== -1 ? lines[footerLineIdx].y + 4 : 0;

  const subjectItems = items.filter(
    (it) => it.str.trim() !== '' && it.y < upperStopY && it.y > lowerStopY
  );
  const subjectLines = clusterItemsIntoLines(subjectItems, 5.5);

  let langSubject1 = '';
  let langSubject2 = '';
  const compList: string[] = [];
  const optionalParts: string[] = [];

  const MATRIC_COMP_RE =
    /\b(MATHEMATICS|SOCIAL\s*SCIENCE|SCIENCE|ENGLISH|HOME\s*SCIENCE|ECONOMICS|COMMERCE)\b/i;
  const SUBJECT_HEADER_NOISE_RE =
    /^(subject|subjects|offered|compulsory|optional|additional|language|sitting|shift|date|time|theory|practical|s\.?no\.?|विषय|अनिवार्य|ऐच्छिक|अतिरिक्त|भाषा|पाली|तिथि)$/i;

  for (const sLine of subjectLines) {
    // Split each visual subject row into left (Languages), middle (Compulsory), right (Optional/Additional)
    const leftText = sLine.items
      .filter((it) => it.x < 260)
      .map((it) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const midText = sLine.items
      .filter((it) => it.x >= 260 && it.x < 460)
      .map((it) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const rightText = sLine.items
      .filter((it) => it.x >= 460)
      .map((it) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (leftText && /\bMIL\b/i.test(leftText)) {
      const m = leftText.match(/\bMIL\s*[-–:]?\s*[A-Za-z]+/i);
      langSubject1 = (m ? m[0] : leftText).replace(/\s*[-–:]\s*/g, ' - ').toUpperCase();
    } else if (leftText && /\bSIL\b/i.test(leftText)) {
      const m = leftText.match(/\bSIL\s*[-–:]?\s*[A-Za-z]+/i);
      langSubject2 = (m ? m[0] : leftText).replace(/\s*[-–:]\s*/g, ' - ').toUpperCase();
    }

    if (midText) {
      const cleanMid = midText.replace(/[\u0900-\u097F]+/g, '').trim();
      if (
        cleanMid &&
        !SUBJECT_HEADER_NOISE_RE.test(cleanMid) &&
        !HEADER_OR_FOOTER_NOISE_RE.test(cleanMid) &&
        (MATRIC_COMP_RE.test(cleanMid) || /^[A-Za-z][A-Za-z\s&-]{2,35}$/.test(cleanMid))
      ) {
        const normalizedMid = cleanMid.toUpperCase();
        if (!compList.includes(normalizedMid) && compList.length < 4) {
          compList.push(normalizedMid);
        }
      }
    }

    if (rightText) {
      const cleanRight = rightText.replace(/[\u0900-\u097F]+/g, '').trim();
      if (
        cleanRight &&
        !SUBJECT_HEADER_NOISE_RE.test(cleanRight) &&
        !HEADER_OR_FOOTER_NOISE_RE.test(cleanRight) &&
        !/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(cleanRight) &&
        !/^(1st|2nd|first|second)\s*(sitting|shift)/i.test(cleanRight) &&
        /[A-Za-z]{3,}/.test(cleanRight)
      ) {
        optionalParts.push(cleanRight.toUpperCase());
      }
    }
  }

  // Fallback for MIL/SIL if labels appeared anywhere in subject area regardless of x-position
  if (!langSubject1) {
    const milMatch = subjectLines
      .map((l) => l.text)
      .join('\n')
      .match(/\bMIL\s*[-–:]\s*[A-Za-z]+/i);
    if (milMatch) langSubject1 = milMatch[0].replace(/\s*[-–:]\s*/g, ' - ').toUpperCase();
  }
  if (!langSubject2) {
    const silMatch = subjectLines
      .map((l) => l.text)
      .join('\n')
      .match(/\bSIL\s*[-–:]\s*[A-Za-z]+/i);
    if (silMatch) langSubject2 = silMatch[0].replace(/\s*[-–:]\s*/g, ' - ').toUpperCase();
  }

  const additionalSubject = optionalParts.join(' ').trim();
  const allSubjects = [langSubject1, langSubject2, ...compList, additionalSubject].filter(Boolean);

  return {
    id: `${fileName}-p${pageNumber}-${bsebUniqueId || serialNo}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
    serialNo,
    examType: 'MATRIC (10th)',
    examYear,
    faculty: 'SECONDARY',
    bsebUniqueId,
    schoolCode: schoolCode || rollCode,
    schoolName: schoolName || schoolRaw,
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
 * Clusters items into visual rows, uses Label-Anchored + Bottom-Up extraction,
 * and maps all 3-digit BSEB subject codes accurately into Language / Elective / Additional columns.
 */
export function parseInterTextItems(
  items: PdfTextItem[],
  pageNumber: number,
  fileName: string,
  serialNo: number
): AdmitCardRecord {
  const lines = clusterItemsIntoLines(items, 4.5);
  const fullText = lines.map((l) => l.text).join('\n');

  // Detect faculty from visual lines or subject codes
  let faculty: FacultyType = 'ARTS';
  if (/\bCOMMERCE\b/i.test(fullText)) faculty = 'COMMERCE';
  else if (/\bSCIENCE\b/i.test(fullText)) faculty = 'SCIENCE';
  else if (/\bARTS\b/i.test(fullText)) faculty = 'ARTS';

  // Extract 3-digit BSEB subject codes directly from PDF items with x-position awareness
  const langSubjects: string[] = [];
  const electiveSubjects: string[] = [];
  const additionalSubjects: string[] = [];

  for (const line of lines) {
    // Scan each item or line segment for 3-digit BSEB Inter codes (105..123, 205..220, 305..327)
    const codeRegex = /\b([123]\d{2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = codeRegex.exec(line.text)) !== null) {
      const code = m[1];
      const info = BSEB_INTER_SUBJECTS[code];
      if (!info) continue;

      if (info.faculty && !/\b(SCIENCE|COMMERCE|ARTS)\b/i.test(fullText)) {
        faculty = info.faculty;
      }

      const formatted = `${code} - ${info.name}`;
      const subNum = Number(code.slice(1));

      // Check x-coordinate of the item containing this code to detect right-hand Additional column
      const codeItem = line.items.find((it) => it.str.includes(code));
      const isRightAdditionalCol = codeItem ? codeItem.x >= 445 : false;

      if (isRightAdditionalCol) {
        if (!additionalSubjects.includes(formatted)) additionalSubjects.push(formatted);
      } else if (subNum >= 5 && subNum <= 16) {
        if (!langSubjects.includes(formatted)) langSubjects.push(formatted);
      } else {
        if (electiveSubjects.length < 3 && !electiveSubjects.includes(formatted)) {
          electiveSubjects.push(formatted);
        } else if (!electiveSubjects.includes(formatted) && !additionalSubjects.includes(formatted)) {
          additionalSubjects.push(formatted);
        }
      }
    }
  }

  return parseInterOcrZones(
    {
      topFieldsText: fullText,
      facultyText: faculty,
      comp1Text: langSubjects[0] || '',
      comp2Text: langSubjects[1] || '',
      elec1Text: electiveSubjects[0] || '',
      elec2Text: electiveSubjects[1] || '',
      elec3Text: electiveSubjects[2] || '',
      addl1Text: additionalSubjects[0] || '',
    },
    pageNumber,
    fileName,
    serialNo,
    'PDF_TEXT_LAYER'
  );
}

/**
 * Parses Intermediate (+2) Admit Card from Multi-Zone OCR or Text-Layer lines.
 * Uses Label-Anchored extraction first, then Bottom-Up anchoring between BSEB ID and Marital/Aadhaar
 * so 2-line wrapped College/+2 School names never shift Student/Mother/Father into wrong columns.
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

  const RIGHT_COL_STOP_RE =
    /(divyang|differently\s*abled|दिव्यांग|student\s*category|कोटि|roll\s*(?:no|number)|रौल\s*नम्बर|gender|लिंग|faculty|संकाय)/i;

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

  // 3. Aadhaar Number (12 digits) & Divyang Category
  let aadhaarNo = '';
  let aadhaarLineIdx = -1;
  let differentlyAbled = 'NO';
  for (let i = 0; i < lines.length; i++) {
    const found = extractAadhaarPattern(lines[i], bsebUniqueId);
    if (found) {
      aadhaarNo = found;
      aadhaarLineIdx = i;
      if (/\bYES\b/i.test(lines[i])) differentlyAbled = 'YES';
      else differentlyAbled = 'NO';
      break;
    }
  }

  // 4. Registration / Listing No (e.g., R-313370010-25) & Student Category (REGULAR / EX / COMPARTMENTAL)
  let registrationNo = '';
  let regLineIdx = -1;
  let studentCategory = 'REGULAR';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regMatch = line.match(/\b(R-\d{7,10}-\d{2})\b/i);
    if (regMatch) {
      registrationNo = regMatch[1].toUpperCase();
      regLineIdx = i;
    }
    const catMatch = line.match(/\b(REGULAR|COMPARTMENTAL|IMPROVEMENT|PRIVATE|EX)\b/i);
    if (catMatch) {
      studentCategory = catMatch[1].toUpperCase();
    }
  }

  // 5. School/College Name, Student Name, Mother's Name, Father's Name
  // Tier A: Label-Anchored Extraction (works cleanly for text-layer PDFs & labeled OCR!)
  let schoolName = '';
  let studentName = '';
  let motherName = '';
  let fatherName = '';

  const schoolLabelRe = /(?:college\s*\/?\s*\+?\s*2\s*school\s*name|school\s*\/?\s*college\s*name|name\s*of\s*(?:the\s*)?(?:college|school)|महाविद्यालय\s*\/?\s*\+?2\s*विद्यालय\s*का\s*नाम|विद्यालय\s*का\s*नाम)/i;
  const studentLabelRe = /(?:student['’]?s?\s*name|candidate['’]?s?\s*name|परीक्षार्थी\s*का\s*नाम|छात्र\s*का\s*नाम)/i;
  const motherLabelRe = /(?:mother['’]?s?\s*name|माता\s*का\s*नाम)/i;
  const fatherLabelRe = /(?:father['’]?s?\s*name|पिता\s*का\s*नाम)/i;

  let schoolLabelIdx = -1;
  let studentLabelIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (schoolLabelIdx === -1 && schoolLabelRe.test(line)) {
      schoolLabelIdx = i;
      const val = extractLabeledValue(line, schoolLabelRe);
      if (val) schoolName = cleanOcrNameLine(val);
    } else if (!studentName && studentLabelRe.test(line)) {
      studentLabelIdx = i;
      const val = extractLabeledValue(line, studentLabelRe, RIGHT_COL_STOP_RE);
      studentName = cleanPersonNameValue(val);
    } else if (!motherName && motherLabelRe.test(line)) {
      const val = extractLabeledValue(line, motherLabelRe, RIGHT_COL_STOP_RE);
      motherName = cleanPersonNameValue(val);
    } else if (!fatherName && fatherLabelRe.test(line)) {
      const val = extractLabeledValue(line, fatherLabelRe, RIGHT_COL_STOP_RE);
      fatherName = cleanPersonNameValue(val);
    }
  }

  // If a labeled school name wrapped onto an unlabeled continuation line right before Student's Name, append it!
  if (schoolLabelIdx !== -1 && studentLabelIdx > schoolLabelIdx + 1) {
    const wrappedParts: string[] = [];
    for (let i = schoolLabelIdx + 1; i < studentLabelIdx; i++) {
      if (!KNOWN_ANY_FIELD_LABEL_RE.test(lines[i]) && !HEADER_OR_FOOTER_NOISE_RE.test(lines[i])) {
        const part = cleanOcrNameLine(lines[i]);
        if (part) wrappedParts.push(part);
      }
    }
    if (wrappedParts.length > 0) {
      schoolName = `${schoolName} ${wrappedParts.join(' ')}`.trim();
    }
  }

  // Tier B: Bottom-Up Positional Extraction between BSEB Unique ID and Marital Status / Aadhaar / Registration
  // Bottom-up anchoring ensures that if College/+2 School Name wraps onto 2+ lines, the extra line stays
  // in schoolName instead of shifting Student Name -> Mother Name -> Father Name!
  if ((!studentName || !motherName || !fatherName) && bsebLineIdx !== -1) {
    const bottomAnchorCandidates = [maritalLineIdx, aadhaarLineIdx, regLineIdx].filter(
      (idx) => idx > bsebLineIdx
    );
    const endIdx =
      bottomAnchorCandidates.length > 0
        ? Math.min(...bottomAnchorCandidates)
        : Math.min(lines.length, bsebLineIdx + 7);

    const middleLines = lines
      .slice(bsebLineIdx + 1, endIdx)
      .filter((l) => !HEADER_OR_FOOTER_NOISE_RE.test(l) && !KNOWN_ANY_FIELD_LABEL_RE.test(l))
      .map(cleanOcrNameLine)
      .filter((l) => {
        if (!l || l.length < 2) return false;
        if (isNonNamePattern(l)) return false;
        const letters = (l.match(/[A-Za-z]/g) || []).length;
        return letters >= 2;
      });

    if (middleLines.length >= 4) {
      const len = middleLines.length;
      if (!fatherName) fatherName = middleLines[len - 1];
      if (!motherName) motherName = middleLines[len - 2];
      if (!studentName) studentName = middleLines[len - 3];
      if (!schoolName) schoolName = middleLines.slice(0, len - 3).join(' ');
    } else if (middleLines.length === 3) {
      // Ambiguous 3 lines: if first line looks like a school/college name, assign school+student+mother;
      // otherwise assign student+mother+father
      const looksLikeSchool = /(SCHOOL|VIDYALAYA|COLLEGE|MAHAVIDYALAYA|HIGH\s+SEC|UCHCH|\+2|INTER|ACADEMY|H\.?\s*S\.?)/i.test(
        middleLines[0]
      );
      if (looksLikeSchool) {
        if (!schoolName) schoolName = middleLines[0];
        if (!studentName) studentName = middleLines[1];
        if (!motherName) motherName = middleLines[2];
      } else {
        if (!studentName) studentName = middleLines[0];
        if (!motherName) motherName = middleLines[1];
        if (!fatherName) fatherName = middleLines[2];
      }
    } else if (middleLines.length === 2) {
      if (!schoolName) schoolName = middleLines[0];
      if (!studentName) studentName = middleLines[1];
    } else if (middleLines.length === 1) {
      if (!studentName) studentName = middleLines[0];
    }
  }

  // 6. Roll Code (5 digits, e.g., 31337), Roll Number, Exam Centre, & Gender
  let rollCode = '';
  let rollCodeLineIdx = -1;

  // Check if school name itself starts with a 5-digit code (e.g. "31337 - UCHCH MADHYAMIK...")
  const schoolCodePrefixMatch = schoolName.match(/^(\d{4,6})\s*[-–:]\s*(.+)$/);
  if (schoolCodePrefixMatch) {
    rollCode = schoolCodePrefixMatch[1];
    schoolName = schoolCodePrefixMatch[2].trim();
  }

  if (!rollCode && registrationNo) {
    const rcFromReg = registrationNo.match(/^R-(\d{5})/);
    if (rcFromReg) rollCode = rcFromReg[1];
  }

  for (let i = Math.max(0, regLineIdx); i < lines.length; i++) {
    const rcLabelMatch = lines[i].match(/roll\s*code|रौल\s*कोड|रोल\s*कोड/i);
    if (rcLabelMatch) {
      rollCodeLineIdx = i;
      const val = extractLabeledValue(
        lines[i],
        /roll\s*code|रौल\s*कोड|रोल\s*कोड/i,
        /roll\s*(?:no|number)|gender|लिंग/i
      );
      const m = val.match(/\b(\d{5})\b/);
      if (m) rollCode = m[1];
      break;
    }
    const rcMatch = lines[i].match(/\b(\d{5})\b/);
    if (rcMatch && !lines[i].includes(bsebUniqueId) && (!aadhaarNo || !lines[i].includes(aadhaarNo.replace(/-/g, '')))) {
      if (!rollCode) rollCode = rcMatch[1];
      if (rollCodeLineIdx === -1) rollCodeLineIdx = i;
      break;
    }
  }

  // Roll Number (extract real roll number if present, otherwise 'XXXXXXXX')
  let rollNumber = 'XXXXXXXX';
  for (const line of lines) {
    const rnLabelMatch = line.match(/roll\s*(?:no|number)\.?|रौल\s*नम्बर|रोल\s*नंबर/i);
    if (rnLabelMatch) {
      const val = extractLabeledValue(
        line,
        /roll\s*(?:no|number)\.?|रौल\s*नम्बर|रोल\s*नंबर/i,
        /gender|लिंग|faculty|संकाय/i
      );
      const digitsMatch = val.match(/\b(\d{6,10})\b/);
      if (digitsMatch) {
        rollNumber = digitsMatch[1];
      }
      break;
    }
  }

  // Exam Centre (extract real exam centre if present and not XXXXXXXX)
  let examCenter = 'XXXXXXXX';
  for (const line of lines) {
    if (/exam(?:ination)?\s*cent(?:re|er)|परीक्षा\s*केन्द्र/i.test(line)) {
      const val = extractLabeledValue(
        line,
        /exam(?:ination)?\s*cent(?:re|er)(?:\s*name)?|परीक्षा\s*केन्द्र(?:\s*का\s*नाम)?/i
      );
      if (val && !/^[xX]{4,}$/.test(val.replace(/\s+/g, ''))) {
        examCenter = val.toUpperCase();
      }
      break;
    }
  }

  let gender: 'MALE' | 'FEMALE' | 'OTHER' = 'OTHER';
  if (/\bfemale\b/i.test(rawTop)) {
    gender = 'FEMALE';
  } else if (/\bmale\b/i.test(rawTop)) {
    gender = 'MALE';
  }
  const inferredGender = inferGenderFromBsebId(bsebUniqueId);
  if (inferredGender) {
    gender = inferredGender;
  }

  // 7. Determine Faculty from facultyText, rawTop, or Subject Codes
  const combinedFacultySearch = `${zones.facultyText || ''} ${rawTop}`;
  let faculty: FacultyType = 'ARTS';
  if (/\bCOMMERCE\b/i.test(combinedFacultySearch)) {
    faculty = 'COMMERCE';
  } else if (/\bSCIENCE\b/i.test(combinedFacultySearch)) {
    faculty = 'SCIENCE';
  } else if (/\bARTS\b/i.test(combinedFacultySearch)) {
    faculty = 'ARTS';
  } else {
    const allSubjRaw = `${zones.comp1Text || ''} ${zones.elec1Text || ''} ${zones.elec2Text || ''}`;
    if (/\b(117|118|119|121)\b|Physics|Chemistry|Biology/i.test(allSubjRaw)) {
      faculty = 'SCIENCE';
    } else if (/\b(217|218|219|220)\b|Business|Entrepreneurship|Accountancy/i.test(allSubjRaw)) {
      faculty = 'COMMERCE';
    }
  }

  // Extract Exam Year if present in header
  const yearMatch = rawTop.match(/EXAMINATION\s*,?\s*(20\d{2})/i);
  const examYear = yearMatch ? yearMatch[1] : '2027';

  // 8. Normalize Subjects
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
    id: `${fileName}-p${pageNumber}-${bsebUniqueId || serialNo}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
    serialNo,
    examType: 'INTERMEDIATE (+2)',
    examYear,
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
    rollNumber,
    examCenter,
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
