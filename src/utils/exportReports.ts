import * as XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AdmitCardRecord,
  CustomExcelFormatConfig,
  ExportFormatMode,
} from '../types/admitCard';
import { computeSummaryStats } from './bsebParser';
import {
  calculateStudentMarksSummary,
  getAllUniqueSubjectsInBatch,
  getEffectiveInterSentUp,
  getEffectiveMatricSentUp,
  getStudentRegisteredSubjects,
  getSubjectMark,
  resolveCustomColumnValue,
} from './marksAndFormat';
import { deliverGeneratedPdf } from './pdfPreviewBus';

export interface ExcelExportOptions {
  mode?: ExportFormatMode;
  customFormat?: CustomExcelFormatConfig | null;
  filenamePrefix?: string;
  annualYear?: string;
  sentUpYear?: string;
}

const BORDER_THIN_BLACK = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

/**
 * Splits a subject name or registration number into 1 or 2 vertical lines
 * to match the official BSEB Sent-Up Praptank Panji 90-degree vertical cells.
 */
export function splitVerticalTextLines(rawText: string, maxCharsPerLine = 11): string[] {
  const clean = (rawText || '').trim();
  if (!clean) return ['---'];
  if (clean.includes('\n')) {
    return clean
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Subject code pattern e.g. "117-PHYSICS", "118-CHEMISTRY", "121-MATHEMATICS", "323-Geography"
  const codeMatch = clean.match(/^(\d{3}-\s*)(.+)$/);
  if (codeMatch) {
    const prefix = codeMatch[1].trim();
    const rest = codeMatch[2].trim();
    const isCompulsoryLang = /^(305|306|307|105|106|205|206)-/.test(prefix);
    if (isCompulsoryLang && clean.length <= maxCharsPerLine) {
      return [clean];
    }
    if (!isCompulsoryLang || clean.length > maxCharsPerLine) {
      if (rest.length > 10) {
        return [prefix, rest.slice(0, 9), rest.slice(9)];
      }
      return [prefix, rest];
    }
  }

  if (clean.length <= maxCharsPerLine) {
    return [clean];
  }

  // Registration number pattern e.g. "R-313370001-24"
  if (/^[RP]-\d+/i.test(clean) && clean.length > 10) {
    const splitAt = Math.min(10, clean.length - 3);
    return [clean.slice(0, splitAt), clean.slice(splitAt)];
  }

  // Generic split on space or slash
  const spaceIdx = clean.indexOf(' ');
  if (spaceIdx > 0 && spaceIdx < clean.length - 1) {
    return [clean.slice(0, spaceIdx), clean.slice(spaceIdx + 1)];
  }

  return [clean];
}

/**
 * Draws text rotated 90 degrees counter-clockwise (vertical reading bottom-to-top)
 * centered inside a jsPDF-AutoTable cell.
 */
function drawRotated90CellText(
  doc: jsPDF,
  rawText: string,
  cell: { x: number; y: number; width: number; height: number },
  options: { fontSizePt?: number; bold?: boolean } = {}
): void {
  const { fontSizePt = 5.8, bold = false } = options;
  const lines = splitVerticalTextLines(rawText, 11);
  if (lines.length === 0) return;

  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(fontSizePt);
  doc.setTextColor(0, 0, 0);

  const ptToMm = 0.352778;
  const capHeightMm = fontSizePt * ptToMm * 0.72;
  const lineStepMm = fontSizePt * ptToMm * 1.12;
  const n = lines.length;

  for (let i = 0; i < n; i++) {
    const line = lines[i];
    const textWidthMm = doc.getTextWidth(line);
    const startY = cell.y + (cell.height + textWidthMm) / 2;
    const offsetMm = (i - (n - 1) / 2) * lineStepMm;
    const startX = cell.x + cell.width / 2 + offsetMm + capHeightMm / 2;
    doc.text(line, startX, startY, { angle: 90 });
  }
}

/**
 * Renders a Unicode/Hindi text line onto a crisp high-DPI PNG data URL using the browser's native font engine
 * so that Devanagari headers & footers appear accurately inside jsPDF.
 */
function renderUnicodeTextToPngDataUrl(
  text: string,
  options: {
    widthPx?: number;
    heightPx?: number;
    fontSizePx?: number;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
  } = {}
): string | null {
  if (typeof document === 'undefined') return null;
  const {
    widthPx = 1600,
    heightPx = 48,
    fontSizePx = 22,
    align = 'center',
    bold = true,
  } = options;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = '#0f172a';
    ctx.font = `${bold ? '700' : '600'} ${fontSizePx}px "Noto Sans Devanagari", "Mangal", "Nirmala UI", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    const x =
      align === 'center' ? widthPx / 2 : align === 'right' ? widthPx - 12 : 12;
    ctx.fillText(text, x, heightPx / 2);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Applies OpenXML cell styles (including 90-degree textRotation, borders, bold headers, and alignment)
 * to a worksheet so Excel opens with rotated 90-degree Subject Names & Headers.
 */
function styleWorksheetCells(
  ws: XLSX.WorkSheet,
  shouldRotate90: (r: number, c: number) => boolean,
  isHeaderRow: (r: number) => boolean,
  isLeftAlignedCell?: (r: number, c: number) => boolean
): void {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) {
        ws[addr] = { t: 's', v: '' };
      }
      const cell = ws[addr] as XLSX.CellObject & { s?: Record<string, unknown> };
      const rotate90 = shouldRotate90(r, c);
      const header = isHeaderRow(r);
      const leftAlign = isLeftAlignedCell ? isLeftAlignedCell(r, c) : false;

      cell.s = {
        font: {
          name: 'Arial',
          sz: r === 0 ? 13 : header ? 9.5 : 9,
          bold: header || c === 0 || c === 20 || c === 29,
          color: { rgb: '000000' },
        },
        alignment: {
          horizontal: leftAlign ? 'left' : 'center',
          vertical: 'center',
          wrapText: true,
          ...(rotate90 ? { textRotation: 90 } : {}),
        },
        border: BORDER_THIN_BLACK,
        ...(header && r >= 4
          ? {
              fill: {
                patternType: 'solid',
                fgColor: { rgb: r === 7 ? 'E2E8F0' : 'F1F5F9' },
              },
            }
          : {}),
      };
    }
  }
}

/**
 * Builds the exact 30-Column BSEB 12th (Intermediate +2) Sent-Up Praptank Panji Worksheet
 * with 90-degree vertical rotation on Subject Name columns and sub-headers
 * (Matches 12th_Sent-Up_Exam.-2025.pdf columns 1 to 30)
 */
export function build12thSentUpWorksheet(
  records: AdmitCardRecord[],
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const schoolCode = records[0]?.schoolCode || '31337';
  const schoolName =
    records[0]?.schoolName || 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR';

  // Subject Name columns in 0-indexed 30-column sheet:
  // Col 4 (#5 Compulsory Sub-1), Col 6 (#7 Compulsory Sub-2),
  // Col 8 (#9 Elective Sub-1), Col 12 (#13 Elective Sub-2), Col 16 (#17 Elective Sub-3),
  // Col 21 (#22 Additional Sub), Col 25 (#26 Vocational Sub)
  const SUBJECT_NAME_COLS_12TH = new Set([4, 6, 8, 12, 16, 21, 25]);

  const aoa: Array<Array<string | number>> = [
    ['BIHAR SCHOOL EXAMINATION BOARD, PATNA'],
    [
      `इन्टरमीडिएट वार्षिक परीक्षा, ${annualYear} में सम्मिलित होने वाले नियमित, स्वतन्त्र एवं क्वालिफाईंग कोटि के परीक्षार्थियों के उत्प्रेषण (Sent-up)/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी`,
    ],
    ['+2 School/College Code :-', schoolCode],
    ['+2 School/College Name :-', schoolName],
    // Row 5 (index 4): Group Header 1
    [
      'Sl. No.',
      'Registration Number',
      "Student's Name\nMother's Name\nFather's Name",
      'M/F',
      'Compulsory Language Subjects',
      '',
      '',
      '',
      'Elective Subjects',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Aggregate & Result',
      'Additional Subject',
      '',
      '',
      '',
      'Vocational Subject',
      '',
      '',
      '',
      'Result',
    ],
    // Row 6 (index 5): Group Header 2
    [
      '',
      '',
      '',
      '',
      'Marks Obtained',
      '',
      '',
      '',
      'Marks Obtained',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Marks Obtained',
      '',
      '',
      '',
      'Marks Obtained',
      '',
      '',
      '',
      '',
    ],
    // Row 7 (index 6): Column Sub-headers (Rotated 90 degrees in Excel & PDF)
    [
      'Sl. No.',
      'Registration Number',
      "Student's Name / Father's Name / Mother's Name",
      'M/F',
      'Subject-1',
      'Marks',
      'Subject-2',
      'Marks',
      'Subject-1',
      'Theory',
      'Practical',
      'Total',
      'Subject-2',
      'Theory',
      'Practical',
      'Total',
      'Subject-3',
      'Theory',
      'Practical',
      'Total',
      'Aggregate & Result',
      'Add. Sub.',
      'Theory',
      'Practical',
      'Total',
      'Add. Sub.',
      'Theory',
      'Practical',
      'Total',
      'Result',
    ],
    // Row 8 (index 7): Column Numbers 1..30
    Array.from({ length: 30 }, (_, i) => i + 1),
  ];

  records.forEach((r, idx) => {
    const s = getEffectiveInterSentUp(r);
    const mf = r.gender === 'MALE' ? 'M' : 'F';
    const stackedNames = [r.studentName, r.fatherName, r.motherName]
      .filter(Boolean)
      .join('\n');

    aoa.push([
      idx + 1,
      r.registrationNo || '---',
      stackedNames || r.studentName || '---',
      mf,
      s.lang1Subject || '306-Hindi',
      s.lang1Marks !== '' ? Number(s.lang1Marks) || s.lang1Marks : '---',
      s.lang2Subject || '305-English',
      s.lang2Marks !== '' ? Number(s.lang2Marks) || s.lang2Marks : '---',
      s.elective1Subject || '---',
      s.elective1Theory !== '' ? Number(s.elective1Theory) || s.elective1Theory : '---',
      s.elective1Practical !== '' ? Number(s.elective1Practical) || s.elective1Practical : '0',
      s.elective1Total !== '' ? Number(s.elective1Total) || s.elective1Total : '---',
      s.elective2Subject || '---',
      s.elective2Theory !== '' ? Number(s.elective2Theory) || s.elective2Theory : '---',
      s.elective2Practical !== '' ? Number(s.elective2Practical) || s.elective2Practical : '0',
      s.elective2Total !== '' ? Number(s.elective2Total) || s.elective2Total : '---',
      s.elective3Subject || '---',
      s.elective3Theory !== '' ? Number(s.elective3Theory) || s.elective3Theory : '---',
      s.elective3Practical !== '' ? Number(s.elective3Practical) || s.elective3Practical : '0',
      s.elective3Total !== '' ? Number(s.elective3Total) || s.elective3Total : '---',
      s.aggregate !== '' ? Number(s.aggregate) || s.aggregate : '---',
      s.additionalSubject || '---',
      s.additionalTheory !== '' ? s.additionalTheory : '---',
      s.additionalPractical !== '' ? s.additionalPractical : '---',
      s.additionalTotal || '---',
      s.vocationalSubject || '---',
      s.vocationalTheory !== '' ? s.vocationalTheory : '---',
      s.vocationalPractical !== '' ? s.vocationalPractical : '---',
      s.vocationalTotal || '---',
      s.resultStatus || 'SENT-UP',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 29 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 29 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 29 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 29 } },
    // Group header merges
    { s: { r: 4, c: 0 }, e: { r: 6, c: 0 } },
    { s: { r: 4, c: 1 }, e: { r: 6, c: 1 } },
    { s: { r: 4, c: 2 }, e: { r: 6, c: 2 } },
    { s: { r: 4, c: 3 }, e: { r: 6, c: 3 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 7 } },
    { s: { r: 5, c: 4 }, e: { r: 5, c: 7 } },
    { s: { r: 4, c: 8 }, e: { r: 4, c: 19 } },
    { s: { r: 5, c: 8 }, e: { r: 5, c: 19 } },
    { s: { r: 4, c: 20 }, e: { r: 6, c: 20 } },
    { s: { r: 4, c: 21 }, e: { r: 4, c: 24 } },
    { s: { r: 5, c: 21 }, e: { r: 5, c: 24 } },
    { s: { r: 4, c: 25 }, e: { r: 4, c: 28 } },
    { s: { r: 5, c: 25 }, e: { r: 5, c: 28 } },
    { s: { r: 4, c: 29 }, e: { r: 6, c: 29 } },
  ];

  // Compact column widths for 90-degree vertical Subject Name columns
  ws['!cols'] = [
    { wch: 5 },  // 1 Sl. No.
    { wch: 8 },  // 2 Reg No (90 deg)
    { wch: 26 }, // 3 Student/Father/Mother Name
    { wch: 5 },  // 4 M/F
    { wch: 6 },  // 5 Subject-1 (90 deg)
    { wch: 6 },  // 6 Marks
    { wch: 6 },  // 7 Subject-2 (90 deg)
    { wch: 6 },  // 8 Marks
    { wch: 7 },  // 9 Elective Sub-1 (90 deg)
    { wch: 6 },  // 10 Theory
    { wch: 6 },  // 11 Practical
    { wch: 6 },  // 12 Total
    { wch: 7 },  // 13 Elective Sub-2 (90 deg)
    { wch: 6 },  // 14 Theory
    { wch: 6 },  // 15 Practical
    { wch: 6 },  // 16 Total
    { wch: 7 },  // 17 Elective Sub-3 (90 deg)
    { wch: 6 },  // 18 Theory
    { wch: 6 },  // 19 Practical
    { wch: 6 },  // 20 Total
    { wch: 9 },  // 21 Aggregate
    { wch: 7 },  // 22 Add. Sub. (90 deg)
    { wch: 6 },  // 23 Theory
    { wch: 6 },  // 24 Practical
    { wch: 6 },  // 25 Total
    { wch: 7 },  // 26 Voc. Sub. (90 deg)
    { wch: 6 },  // 27 Theory
    { wch: 6 },  // 28 Practical
    { wch: 6 },  // 29 Total
    { wch: 10 }, // 30 Result
  ];

  // Set row heights so 90-degree rotated subject names & headers fit vertically
  ws['!rows'] = [
    { hpt: 22 }, // Row 1 Title
    { hpt: 20 }, // Row 2 Hindi Subtitle
    { hpt: 18 }, // Row 3 School Code
    { hpt: 18 }, // Row 4 School Name
    { hpt: 22 }, // Row 5 Group Header 1
    { hpt: 18 }, // Row 6 Marks Obtained
    { hpt: 68 }, // Row 7 90-degree rotated sub-headers (Subject-1, Marks, Theory, Practical...)
    { hpt: 18 }, // Row 8 Column Numbers 1..30
    ...records.map(() => ({ hpt: 64 })), // Student rows (90-degree rotated Subject Names)
  ];

  styleWorksheetCells(
    ws,
    (r, c) => {
      // Rotate Registration No (col 1), Aggregate (col 20), Result (col 29) in merged header rows 4..6
      if (r >= 4 && r <= 6 && (c === 1 || c === 20 || c === 29)) return true;
      // Rotate all sub-headers in row 6 (index 6) for columns 4..19 and 21..28
      if (r === 6 && ((c >= 4 && c <= 19) || (c >= 21 && c <= 28))) return true;
      // Rotate Registration No (col 1) and all Subject Name columns in student data rows (r >= 8)
      if (r >= 8 && (c === 1 || SUBJECT_NAME_COLS_12TH.has(c))) return true;
      return false;
    },
    (r) => r <= 7,
    (r, c) => (r >= 8 && c === 2) || (r === 2 && c === 1) || (r === 3 && c === 1)
  );

  return ws;
}

/**
 * Builds the exact 23-Column BSEB 10th (Matric) Sent-Up Praptank Panji Worksheet
 * with 90-degree vertical rotation on Subject headers (MIL, SIL, MAT, SCI, SSC, ENG, OPT, VOC)
 * (Matches 10th_Sent-Up_Exam.-2025_BSEB.pdf columns 1 to 23)
 */
export function build10thSentUpWorksheet(
  records: AdmitCardRecord[],
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [
    ['BIHAR SCHOOL EXAMINATION BOARD, PATNA'],
    [`SENT-UP/TEST EXAM.-${sentUpYear}`],
    [
      `-: वार्षिक माध्यमिक परीक्षा, ${annualYear} में सम्मिलित होने वाले पंजीकृत नियमित एवं स्वतन्त्र कोटि के परीक्षार्थियों के उत्प्रेषण/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी :-`,
    ],
    ['(i) उत्प्रेषित (Sent-up) छात्र/छात्राओं के लिए विहित प्रपत्र :-'],
    // Row 5 (index 4): Group Header 1
    [
      'SL NO',
      'SCHOOL CODE',
      'SCHOOL/+2 SCHOOL NAME',
      'REGISTRATION NO. & YEAR',
      'STUDENT NAME',
      "MOTHER'S NAME",
      "FATHER'S NAME",
      'DATE OF BIRTH',
      'GENDER',
      'MARKS OBTAINED (THEORY)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'MARKS OBTAINED (INTERNAL ASSESSMENT & PRACTICAL)',
      '',
      '',
      '',
      '',
      'AGGRE-GATE',
    ],
    // Row 6 (index 5): Group Header 2 (Subject Names rotated 90 degrees)
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'MIL',
      'SIL',
      'MAT',
      'SCI',
      'SSC',
      'ENG',
      'OPT-SUB',
      'OPT-SUB (Vocational)',
      'SCI',
      'SSC',
      '',
      'OPT-SUB',
      'OPT-SUB (Vocational)',
      '',
    ],
    // Row 7 (index 6): Sub-header for SSC Lit. Act & Pr. Work
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'LIT. ACT',
      'Pr. Work',
      '',
      '',
      '',
    ],
    // Row 8 (index 7): Column Numbers 1..23
    Array.from({ length: 23 }, (_, i) => i + 1),
  ];

  records.forEach((r, idx) => {
    const m = getEffectiveMatricSentUp(r);
    aoa.push([
      idx + 1,
      r.schoolCode || r.rollCode || '51803',
      r.schoolName || 'H.S.S. BERUA',
      r.registrationNo || '---',
      r.studentName || '---',
      r.motherName || '---',
      r.fatherName || '---',
      r.dob && r.dob !== 'N/A' ? r.dob : '---',
      r.gender || 'FEMALE',
      m.milTheory !== '' ? Number(m.milTheory) || m.milTheory : '---',
      m.silTheory !== '' ? Number(m.silTheory) || m.silTheory : '---',
      m.matTheory !== '' ? Number(m.matTheory) || m.matTheory : '---',
      m.sciTheory !== '' ? Number(m.sciTheory) || m.sciTheory : '---',
      m.sscTheory !== '' ? Number(m.sscTheory) || m.sscTheory : '---',
      m.engTheory !== '' ? Number(m.engTheory) || m.engTheory : '---',
      m.optTheory !== '' ? m.optTheory : '---',
      m.vocTheory !== '' ? m.vocTheory : '---',
      m.sciPractical !== '' ? Number(m.sciPractical) || m.sciPractical : '---',
      m.sscLitAct !== '' ? Number(m.sscLitAct) || m.sscLitAct : '---',
      m.sscPrWork !== '' ? Number(m.sscPrWork) || m.sscPrWork : '---',
      m.optPractical !== '' ? m.optPractical : '---',
      m.vocPractical !== '' ? m.vocPractical : '---',
      m.aggregate !== '' ? Number(m.aggregate) || m.aggregate : '---',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 22 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 22 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 22 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 22 } },
    // Columns 1..9 span rows 5..7
    ...Array.from({ length: 9 }, (_, c) => ({
      s: { r: 4, c },
      e: { r: 6, c },
    })),
    // MARKS OBTAINED (THEORY) cols 9..16
    { s: { r: 4, c: 9 }, e: { r: 4, c: 16 } },
    ...Array.from({ length: 8 }, (_, idx) => ({
      s: { r: 5, c: 9 + idx },
      e: { r: 6, c: 9 + idx },
    })),
    // MARKS OBTAINED (INTERNAL ASSESSMENT & PRACTICAL) cols 17..21
    { s: { r: 4, c: 17 }, e: { r: 4, c: 21 } },
    { s: { r: 5, c: 17 }, e: { r: 6, c: 17 } },
    { s: { r: 5, c: 18 }, e: { r: 5, c: 19 } },
    { s: { r: 5, c: 20 }, e: { r: 6, c: 20 } },
    { s: { r: 5, c: 21 }, e: { r: 6, c: 21 } },
    // AGGRE-GATE col 22
    { s: { r: 4, c: 22 }, e: { r: 6, c: 22 } },
  ];
  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 13 },
    { wch: 9 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 7 },
    { wch: 8 },
    { wch: 6 },
    { wch: 7 },
    { wch: 7 },
    { wch: 7 },
    { wch: 8 },
    { wch: 10 },
  ];

  ws['!rows'] = [
    { hpt: 22 },
    { hpt: 18 },
    { hpt: 20 },
    { hpt: 18 },
    { hpt: 22 },
    { hpt: 44 }, // 90-degree rotated subject headers
    { hpt: 36 }, // 90-degree rotated LIT. ACT / Pr. Work
    { hpt: 18 },
    ...records.map(() => ({ hpt: 24 })),
  ];

  styleWorksheetCells(
    ws,
    (r, c) => {
      // Rotate Subject Name header columns 9..21 in rows 5..6 and Aggregate col 22
      if ((r === 5 || r === 6) && c >= 9 && c <= 21) return true;
      if (r >= 4 && r <= 6 && c === 22) return true;
      return false;
    },
    (r) => r <= 7,
    (r, c) => r >= 8 && (c === 4 || c === 5 || c === 6)
  );

  return ws;
}

/**
 * Builds the exact 24-Column BSEB 12th Vocational Stream Sent-Up Praptank Panji Worksheet
 * (Matches Vocational_af5f0ca8.pdf)
 */
export function build12thVocationalWorksheet(
  records: AdmitCardRecord[],
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const schoolCode = records[0]?.schoolCode || '31337';
  const schoolName =
    records[0]?.schoolName || 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR';

  // Rotated column indexes in 24-col sheet:
  // Col 1 (Registration No), Col 4 (Sub-1), Col 6 (Sub-2), Col 8 (Foundation),
  // Col 10 (Paper 1), Col 14 (Paper 2), Col 18 (Aggregate), Col 19 (Add. Sub), Col 23 (Result)
  const ROTATED_VOC_COLS = new Set([1, 4, 6, 8, 10, 14, 18, 19, 23]);

  const aoa: Array<Array<string | number>> = [
    ['BIHAR SCHOOL EXAMINATION BOARD, PATNA'],
    [
      `इन्टरमीडिएट वार्षिक परीक्षा, ${annualYear} में सम्मिलित होने वाले व्यावसायिक पाठ्यक्रम के परीक्षार्थियों के उत्प्रेषण (Sent-up)/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी`,
    ],
    ['+2 School/College Code :-', schoolCode],
    ['+2 School/College Name :-', schoolName],
    // Row 5 (index 4): Super Header 1
    [
      'Sl. No.',
      'Registration Number',
      "Student's Name\nMother's Name\nFather's Name",
      'M/F',
      'Compulsory Language Subjects',
      '',
      '',
      '',
      'Elective Subjects',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Aggregate & Result',
      'Additional Subject',
      '',
      '',
      '',
      'Result',
    ],
    // Row 6 (index 5): Super Header 2
    [
      '',
      '',
      '',
      '',
      'Marks Obtained',
      '',
      '',
      '',
      'Marks Obtained',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Marks Obtained',
      '',
      '',
      '',
      '',
    ],
    // Row 7 (index 6): Sub-headers
    [
      '',
      '',
      '',
      '',
      'Subject-1',
      'Marks',
      'Subject-2',
      'Marks',
      '(Fondation Course)',
      'Marks',
      'Paper',
      'Theory',
      'Practical',
      'Total',
      'Paper',
      'Theory',
      'Practical',
      'Total',
      '',
      'Add. Sub.',
      'Theory',
      'Practical',
      'Total',
      '',
    ],
    // Row 8 (index 7): Col numbers 1 to 24
    Array.from({ length: 24 }, (_, i) => i + 1),
  ];

  const vocRecords = records.filter(
    (r) =>
      r.faculty === 'VOCATIONAL' ||
      Boolean(r.interSentUp?.vocationalSubject && r.interSentUp.vocationalSubject !== '---')
  );

  if (vocRecords.length === 0) {
    aoa.push([
      1, 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL',
      'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL',
    ]);
  } else {
    vocRecords.forEach((r, idx) => {
      const s = getEffectiveInterSentUp(r);
      const mf = r.gender === 'MALE' ? 'M' : 'F';
      const stackedNames = [r.studentName, r.motherName, r.fatherName]
        .filter(Boolean)
        .join('\n');

      aoa.push([
        idx + 1,
        r.registrationNo || '---',
        stackedNames || r.studentName || '---',
        mf,
        s.lang1Subject || '---',
        s.lang1Marks !== '' ? s.lang1Marks : '---',
        s.lang2Subject || '---',
        s.lang2Marks !== '' ? s.lang2Marks : '---',
        s.elective1Subject || '(Fondation Course)',
        s.elective1Theory !== '' ? s.elective1Theory : '---',
        s.elective2Subject || 'Paper 1',
        s.elective2Theory !== '' ? s.elective2Theory : '---',
        s.elective2Practical !== '' ? s.elective2Practical : '0',
        s.elective2Total !== '' ? s.elective2Total : '---',
        s.elective3Subject || 'Paper 2',
        s.elective3Theory !== '' ? s.elective3Theory : '---',
        s.elective3Practical !== '' ? s.elective3Practical : '0',
        s.elective3Total !== '' ? s.elective3Total : '---',
        s.aggregate !== '' ? s.aggregate : '---',
        s.additionalSubject || '---',
        s.additionalTheory !== '' ? s.additionalTheory : '---',
        s.additionalPractical !== '' ? s.additionalPractical : '---',
        s.additionalTotal || '---',
        s.resultStatus || 'SENT-UP',
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 28 },
    { wch: 6 },
    { wch: 11 },
    { wch: 7 },
    { wch: 11 },
    { wch: 7 },
    { wch: 14 },
    { wch: 7 },
    { wch: 11 },
    { wch: 7 },
    { wch: 7 },
    { wch: 7 },
    { wch: 11 },
    { wch: 7 },
    { wch: 7 },
    { wch: 7 },
    { wch: 11 },
    { wch: 11 },
    { wch: 7 },
    { wch: 7 },
    { wch: 7 },
    { wch: 10 },
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 23 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 23 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 23 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 23 } },
    { s: { r: 4, c: 0 }, e: { r: 6, c: 0 } },
    { s: { r: 4, c: 1 }, e: { r: 6, c: 1 } },
    { s: { r: 4, c: 2 }, e: { r: 6, c: 2 } },
    { s: { r: 4, c: 3 }, e: { r: 6, c: 3 } },
    { s: { r: 4, c: 18 }, e: { r: 6, c: 18 } },
    { s: { r: 4, c: 23 }, e: { r: 6, c: 23 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 7 } },
    { s: { r: 4, c: 8 }, e: { r: 4, c: 17 } },
    { s: { r: 4, c: 19 }, e: { r: 4, c: 22 } },
    { s: { r: 5, c: 4 }, e: { r: 5, c: 7 } },
    { s: { r: 5, c: 8 }, e: { r: 5, c: 17 } },
    { s: { r: 5, c: 19 }, e: { r: 5, c: 22 } },
  ];

  styleWorksheetCells(
    ws,
    (r, c) => (r === 6 && (c === 4 || c === 5 || c === 6 || c === 7 || c === 8 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 14 || c === 15 || c === 16 || c === 17 || c === 19 || c === 20 || c === 21 || c === 22)) || (r >= 8 && ROTATED_VOC_COLS.has(c)),
    (r) => r >= 4 && r <= 7,
    (r, c) => r >= 8 && c === 2
  );

  return ws;
}

/**
 * Generates and downloads the BSEB 12th Vocational Sent-Up Excel report.
 */
export function exportVocational12thExcel(
  records: AdmitCardRecord[],
  options: { annualYear?: string; sentUpYear?: string; filenamePrefix?: string } = {}
): void {
  const {
    annualYear = '2027',
    sentUpYear = '2026',
    filenamePrefix = '12th_Vocational_Exam-2026_Annual-2027',
  } = options;

  const wb = XLSXStyle.utils.book_new();
  const wsVoc = build12thVocationalWorksheet(records, annualYear, sentUpYear);
  XLSXStyle.utils.book_append_sheet(wb, wsVoc, '12th_Vocational_2026');

  XLSXStyle.writeFile(wb, `${filenamePrefix}.xlsx`);
}

/**
 * Builds the exact 8-Column BSEB 12th Absent / Non Sent-Up Students Worksheet
 * for a specific faculty (SCIENCE / ARTS / COMMERCE) matching Absent_62ae20ba.pdf
 */
export function build12thAbsentWorksheet(
  records: AdmitCardRecord[],
  faculty: 'SCIENCE' | 'ARTS' | 'COMMERCE' = 'SCIENCE',
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const schoolCode = records[0]?.schoolCode || '31337';
  const schoolName =
    records[0]?.schoolName || 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR';

  const aoa: Array<Array<string | number>> = [
    ['BIHAR SCHOOL EXAMINATION BOARD, PATNA'],
    [
      `इन्टरमीडिएट वार्षिक परीक्षा, ${annualYear} में सम्मिलित होने वाले उत्प्रेषण (Sent-up)/जाँच परीक्षा, ${sentUpYear} में अनुपस्थित/अनुत्तीर्ण (Non Sent-up) परीक्षार्थियों की सूची`,
    ],
    ['+2 School/College Code :-', schoolCode],
    ['+2 School/College Name :-', schoolName],
    // Row 5: Column Headers
    [
      'Sl. No.',
      'Registration Number',
      'Faculty',
      "Student's Name",
      'M/F',
      "Mother's Name",
      "Father's Name",
      'Absent/Fail',
    ],
    // Row 6: Column Numbers 1 to 8
    [1, 2, 3, 4, 5, 6, 7, 8],
  ];

  const facultyRecords = records.filter(
    (r) => (r.faculty || 'SCIENCE').toUpperCase() === faculty
  );

  const absentStudents = facultyRecords.filter((r) => {
    const s = getEffectiveInterSentUp(r);
    const st = (s.resultStatus || r.studentCategory || '').toUpperCase();
    return (
      st.includes('ABSENT') ||
      st.includes('NOT SENT-UP') ||
      st.includes('NON SENT-UP') ||
      st.includes('FAIL')
    );
  });

  if (absentStudents.length === 0) {
    aoa.push([1, 'NIL', faculty, 'NIL', 'NIL', 'NIL', 'NIL', 'NIL']);
  } else {
    absentStudents.forEach((r, idx) => {
      const s = getEffectiveInterSentUp(r);
      const st = (s.resultStatus || 'ABSENT').toUpperCase();
      aoa.push([
        idx + 1,
        r.registrationNo || '---',
        faculty,
        r.studentName || '---',
        r.gender === 'MALE' ? 'M' : 'F',
        r.motherName || '---',
        r.fatherName || '---',
        st.includes('ABSENT') ? 'ABSENT' : 'NOT SENT-UP',
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 14 },
    { wch: 28 },
    { wch: 8 },
    { wch: 24 },
    { wch: 24 },
    { wch: 16 },
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 7 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 7 } },
  ];

  styleWorksheetCells(
    ws,
    () => false,
    (r) => r === 4 || r === 5,
    (r, c) => r >= 6 && (c === 3 || c === 5 || c === 6)
  );

  return ws;
}

/**
 * Generates and downloads the BSEB 12th Absent / Non Sent-Up Students Excel report
 * with dedicated tabs for SCIENCE, ARTS, and COMMERCE matching Absent_62ae20ba.pdf.
 */
export function exportAbsent12thExcel(
  records: AdmitCardRecord[],
  options: { annualYear?: string; sentUpYear?: string; filenamePrefix?: string } = {}
): void {
  const {
    annualYear = '2027',
    sentUpYear = '2026',
    filenamePrefix = '12th_Absent_Students_Exam-2026_Annual-2027',
  } = options;

  const wb = XLSXStyle.utils.book_new();
  const wsScience = build12thAbsentWorksheet(records, 'SCIENCE', annualYear, sentUpYear);
  const wsArts = build12thAbsentWorksheet(records, 'ARTS', annualYear, sentUpYear);
  const wsComm = build12thAbsentWorksheet(records, 'COMMERCE', annualYear, sentUpYear);

  XLSXStyle.utils.book_append_sheet(wb, wsScience, 'SCIENCE_Absent');
  XLSXStyle.utils.book_append_sheet(wb, wsArts, 'ARTS_Absent');
  XLSXStyle.utils.book_append_sheet(wb, wsComm, 'COMMERCE_Absent');

  XLSXStyle.writeFile(wb, `${filenamePrefix}.xlsx`);
}

/**
 * Checks if a Matric student is Visually Impaired (दृष्टिबाधित).
 */
export function isMatricVisuallyImpaired(record: AdmitCardRecord): boolean {
  const da = (record.differentlyAbled || '').toLowerCase();
  const rem = (record.remarks || '').toLowerCase();
  const sub = (record.allSubjectsSummary || '').toLowerCase();
  return (
    da.includes('visual') ||
    da.includes('blind') ||
    da.includes('दृष्टि') ||
    rem.includes('visual') ||
    rem.includes('blind') ||
    rem.includes('दृष्टि') ||
    sub.includes('music')
  );
}

/**
 * Checks if a Matric student is Absent or Non Sent-Up (अनुपस्थित / अनुत्तीर्ण).
 */
export function isMatricAbsentOrNonSentUp(record: AdmitCardRecord): boolean {
  const rem = (record.remarks || '').toLowerCase();
  const cat = (record.studentCategory || '').toLowerCase();
  const m = record.matricSentUp;
  if (
    rem.includes('absent') ||
    rem.includes('fail') ||
    rem.includes('non sent-up') ||
    rem.includes('not sent-up') ||
    rem.includes('non-sentup') ||
    rem.includes('अनुपस्थित') ||
    rem.includes('अनुत्तीर्ण') ||
    cat.includes('absent') ||
    cat.includes('fail')
  ) {
    return true;
  }
  if (m) {
    if (m.milTheory === 'ABS' || m.matTheory === 'ABS' || m.sciTheory === 'ABS' || m.sscTheory === 'ABS') {
      return true;
    }
  }
  return false;
}

/**
 * Generic builder for 24-Column BSEB Matric Sent-Up Worksheets
 * Matches Non_Sent-up_Students_e7fed56b.pdf and Visually_Impaired_Non_Sent-up_388ee456.pdf
 */
export function build10th24ColWorksheet(
  records: AdmitCardRecord[],
  headerFormTitle: string,
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const schoolCode = records[0]?.schoolCode || records[0]?.rollCode || '51803';
  const schoolName = records[0]?.schoolName || 'H.S.S. BERUA';

  const aoa: Array<Array<string | number>> = [
    ['BIHAR SCHOOL EXAMINATION BOARD, PATNA'],
    [`SENT-UP/TEST EXAM.-${sentUpYear}`],
    [
      `-: वार्षिक माध्यमिक परीक्षा, ${annualYear} में सम्मिलित होने वाले पंजीकृत नियमित एवं स्वतन्त्र कोटि के परीक्षार्थियों के उत्प्रेषण/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी :-`,
    ],
    [headerFormTitle],
    // Row 5 (index 4): Super Header 1
    [
      'SL.\nNO.',
      'SCHOO\nL CODE',
      'SCHOOL\nNAME',
      'REG. NO.\n& YEAR',
      "STUDENT'S\nNAME",
      "MOTHER'S\nNAME",
      "FATHER'S\nNAME",
      'DATE OF\nBIRTH',
      'GEN\nDER',
      'NON SENT-\nUP/ABSEN\nT',
      'MARKS OBTAINDE\n(THEORY)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'MARKS OBTAINED\n(INTERNAL ASSEMENT & PRACTICAL)',
      '',
      '',
      '',
      '',
      'AGGREGA-\nTATE',
    ],
    // Row 6 (index 5): Sub Header 2
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'MIL',
      'SIL',
      'MAT',
      'SCI',
      'SSC',
      'ENG',
      'OPT-\nSUB',
      'OPT-SUB\n(Vocatonal)',
      'SCI',
      'SSC',
      '',
      'OPT-\nSUB',
      'OPT-SUB\n(Vocatonal)',
      '',
    ],
    // Row 7 (index 6): Sub Header 3
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'LIT. ACT',
      'PR. WO',
      '',
      '',
      '',
    ],
    // Row 8 (index 7): Column numbers 1..24
    [1, 2, 3, 4, 5, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  ];

  if (records.length > 0) {
    records.forEach((r, idx) => {
      const m = getEffectiveMatricSentUp(r);
      const isFail = (r.remarks || '').toUpperCase().includes('FAIL');
      const statusText = isFail ? 'FAIL' : 'ABSENT';
      aoa.push([
        idx + 1,
        r.schoolCode || r.rollCode || '51803',
        r.schoolName || 'H.S.S. BERUA',
        r.registrationNo || '---',
        r.studentName || '---',
        r.motherName || '---',
        r.fatherName || '---',
        r.dob && r.dob !== 'N/A' ? r.dob : '---',
        r.gender || 'FEMALE',
        statusText,
        m.milTheory !== '' ? Number(m.milTheory) || m.milTheory : 'ABS',
        m.silTheory !== '' ? Number(m.silTheory) || m.silTheory : 'ABS',
        m.matTheory !== '' ? Number(m.matTheory) || m.matTheory : 'ABS',
        m.sciTheory !== '' ? Number(m.sciTheory) || m.sciTheory : 'ABS',
        m.sscTheory !== '' ? Number(m.sscTheory) || m.sscTheory : 'ABS',
        m.engTheory !== '' ? Number(m.engTheory) || m.engTheory : 'ABS',
        m.optTheory !== '' ? m.optTheory : '---',
        m.vocTheory !== '' ? m.vocTheory : '---',
        m.sciPractical !== '' ? Number(m.sciPractical) || m.sciPractical : '---',
        m.sscLitAct !== '' ? Number(m.sscLitAct) || m.sscLitAct : '---',
        m.sscPrWork !== '' ? Number(m.sscPrWork) || m.sscPrWork : '---',
        m.optPractical !== '' ? m.optPractical : '---',
        m.vocPractical !== '' ? m.vocPractical : '---',
        m.aggregate !== '' ? Number(m.aggregate) || m.aggregate : '---',
      ]);
    });
  } else {
    // Official BSEB NIL row
    aoa.push([
      1,
      schoolCode,
      schoolName,
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 23 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 23 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 23 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 23 } },
    // Columns 0..9 span rows 4..6
    ...Array.from({ length: 10 }, (_, c) => ({
      s: { r: 4, c },
      e: { r: 6, c },
    })),
    // MARKS OBTAINDE (THEORY) cols 10..17
    { s: { r: 4, c: 10 }, e: { r: 4, c: 17 } },
    ...Array.from({ length: 8 }, (_, idx) => ({
      s: { r: 5, c: 10 + idx },
      e: { r: 6, c: 10 + idx },
    })),
    // MARKS OBTAINED (INTERNAL ASSEMENT & PRACTICAL) cols 18..22
    { s: { r: 4, c: 18 }, e: { r: 4, c: 22 } },
    { s: { r: 5, c: 18 }, e: { r: 6, c: 18 } },
    { s: { r: 5, c: 19 }, e: { r: 5, c: 20 } },
    { s: { r: 5, c: 21 }, e: { r: 6, c: 21 } },
    { s: { r: 5, c: 22 }, e: { r: 6, c: 22 } },
    // AGGREGA-TATE col 23
    { s: { r: 4, c: 23 }, e: { r: 6, c: 23 } },
  ];

  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 13 },
    { wch: 9 },
    { wch: 14 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 7 },
    { wch: 8 },
    { wch: 6 },
    { wch: 7 },
    { wch: 7 },
    { wch: 7 },
    { wch: 8 },
    { wch: 10 },
  ];

  ws['!rows'] = [
    { hpt: 22 },
    { hpt: 18 },
    { hpt: 20 },
    { hpt: 18 },
    { hpt: 22 },
    { hpt: 44 }, // 90-degree rotated subject headers
    { hpt: 36 }, // 90-degree rotated LIT. ACT / PR. WO
    { hpt: 18 },
    ...records.map(() => ({ hpt: 24 })),
  ];

  styleWorksheetCells(
    ws,
    (r, c) => {
      if ((r === 5 || r === 6) && c >= 10 && c <= 22) return true;
      if (r >= 4 && r <= 6 && (c === 9 || c === 23)) return true;
      return false;
    },
    (r) => r <= 7,
    (r, c) => r >= 8 && (c === 4 || c === 5 || c === 6)
  );

  return ws;
}

/**
 * Builds the 24-Column BSEB Matric Absent / Non Sent-Up Students Worksheet
 * (Matches Non_Sent-up_Students_e7fed56b.pdf)
 */
export function build10thAbsentWorksheet(
  records: AdmitCardRecord[],
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const absentRecords = records.filter((r) => isMatricAbsentOrNonSentUp(r));
  return build10th24ColWorksheet(
    absentRecords,
    `(iii) उत्प्रेषित (Sent-up)/जाँच परीक्षा, ${sentUpYear} में अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) परीक्षार्थियों के लिए विहित प्रपत्र :-`,
    annualYear,
    sentUpYear
  );
}

/**
 * Generates and downloads the BSEB Matric Absent / Non Sent-Up Students Excel report.
 */
export function exportAbsent10thExcel(
  records: AdmitCardRecord[],
  options: { annualYear?: string; sentUpYear?: string; filenamePrefix?: string } = {}
): void {
  const {
    annualYear = '2027',
    sentUpYear = '2026',
    filenamePrefix = `10th_Absent_Students_Exam-${sentUpYear}_Annual-${annualYear}`,
  } = options;

  const wb = XLSXStyle.utils.book_new();
  const ws = build10thAbsentWorksheet(records, annualYear, sentUpYear);
  XLSXStyle.utils.book_append_sheet(wb, ws, `10th_Absent_${sentUpYear}`);
  XLSXStyle.writeFile(wb, `${filenamePrefix}.xlsx`);
}

/**
 * Builds the 23-Column BSEB Matric Visually Impaired Sent-Up Students Worksheet
 * (Matches Visually_Impaired_Sent-up_2382274f.pdf)
 */
export function build10thVisuallyImpairedSentUpWorksheet(
  records: AdmitCardRecord[],
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const viSentUp = records.filter(
    (r) => isMatricVisuallyImpaired(r) && !isMatricAbsentOrNonSentUp(r)
  );
  const schoolCode = records[0]?.schoolCode || records[0]?.rollCode || '51803';
  const schoolName = records[0]?.schoolName || 'H.S.S. BERUA';

  const aoa: Array<Array<string | number>> = [
    ['BIHAR SCHOOL EXAMINATION BOARD, PATNA'],
    [`SENT-UP/TEST EXAM.-${sentUpYear}`],
    [
      `-: वार्षिक माध्यमिक परीक्षा, ${annualYear} में सम्मिलित होने वाले पंजीकृत नियमित एवं स्वतन्त्र कोटि के परीक्षार्थियों के उत्प्रेषण/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी :-`,
    ],
    ['(ii) दृष्टिबाधित (Visually Impaired/Blind) उत्प्रेषित (Sent-up) छात्र/छात्राओं के लिए विहित प्रपत्र :-'],
    // Row 5 (index 4): Super Header 1
    [
      'SL.\nNO.',
      'SCHOO\nL CODE',
      'SCHOOL\nNAME',
      'REG. NO.\n& YEAR',
      "STUDENT'S\nNAME",
      "MOTHER'S\nNAME",
      "FATHER'S\nNAME",
      'DATE OF\nBIRTH',
      'GEN\nDER',
      'MARKS OBTAINDE\n(THEORY)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'MARKS OBTAINED\n(INTERNAL ASSEMENT & PRACTICAL)',
      '',
      '',
      '',
      '',
      'AGGREGA-\nTATE',
    ],
    // Row 6 (index 5): Sub Header 2
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'MIL',
      'SIL',
      'MAT',
      'SCI',
      'SSC',
      'ENG',
      'OPT-\nSUB',
      'OPT-SUB\n(Vocatonal)',
      'SCI',
      'SSC',
      '',
      'OPT-\nSUB',
      'OPT-SUB\n(Vocatonal)',
      '',
    ],
    // Row 7 (index 6): Sub Header 3
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'LIT. ACT',
      'PR. WO',
      '',
      '',
      '',
    ],
    // Row 8 (index 7): Column numbers 1..23
    [1, 2, 3, 4, 5, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  ];

  if (viSentUp.length > 0) {
    viSentUp.forEach((r, idx) => {
      const m = getEffectiveMatricSentUp(r);
      aoa.push([
        idx + 1,
        r.schoolCode || r.rollCode || '51803',
        r.schoolName || 'H.S.S. BERUA',
        r.registrationNo || '---',
        r.studentName || '---',
        r.motherName || '---',
        r.fatherName || '---',
        r.dob && r.dob !== 'N/A' ? r.dob : '---',
        r.gender || 'FEMALE',
        m.milTheory !== '' ? Number(m.milTheory) || m.milTheory : '---',
        m.silTheory !== '' ? Number(m.silTheory) || m.silTheory : '---',
        m.matTheory !== '' ? Number(m.matTheory) || m.matTheory : '---',
        m.sciTheory !== '' ? Number(m.sciTheory) || m.sciTheory : '---',
        m.sscTheory !== '' ? Number(m.sscTheory) || m.sscTheory : '---',
        m.engTheory !== '' ? Number(m.engTheory) || m.engTheory : '---',
        m.optTheory !== '' ? m.optTheory : '---',
        m.vocTheory !== '' ? m.vocTheory : '---',
        m.sciPractical !== '' ? Number(m.sciPractical) || m.sciPractical : '---',
        m.sscLitAct !== '' ? Number(m.sscLitAct) || m.sscLitAct : '---',
        m.sscPrWork !== '' ? Number(m.sscPrWork) || m.sscPrWork : '---',
        m.optPractical !== '' ? m.optPractical : '---',
        m.vocPractical !== '' ? m.vocPractical : '---',
        m.aggregate !== '' ? Number(m.aggregate) || m.aggregate : '---',
      ]);
    });
  } else {
    // Official BSEB NIL row
    aoa.push([
      1,
      schoolCode,
      schoolName,
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
      'NIL',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 22 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 22 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 22 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 22 } },
    // Columns 0..8 span rows 4..6
    ...Array.from({ length: 9 }, (_, c) => ({
      s: { r: 4, c },
      e: { r: 6, c },
    })),
    // MARKS OBTAINDE (THEORY) cols 9..16
    { s: { r: 4, c: 9 }, e: { r: 4, c: 16 } },
    ...Array.from({ length: 8 }, (_, idx) => ({
      s: { r: 5, c: 9 + idx },
      e: { r: 6, c: 9 + idx },
    })),
    // MARKS OBTAINED (INTERNAL ASSEMENT & PRACTICAL) cols 17..21
    { s: { r: 4, c: 17 }, e: { r: 4, c: 21 } },
    { s: { r: 5, c: 17 }, e: { r: 6, c: 17 } },
    { s: { r: 5, c: 18 }, e: { r: 5, c: 19 } },
    { s: { r: 5, c: 20 }, e: { r: 6, c: 20 } },
    { s: { r: 5, c: 21 }, e: { r: 6, c: 21 } },
    // AGGREGA-TATE col 22
    { s: { r: 4, c: 22 }, e: { r: 6, c: 22 } },
  ];

  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 13 },
    { wch: 9 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 7 },
    { wch: 8 },
    { wch: 6 },
    { wch: 7 },
    { wch: 7 },
    { wch: 7 },
    { wch: 8 },
    { wch: 10 },
  ];

  ws['!rows'] = [
    { hpt: 22 },
    { hpt: 18 },
    { hpt: 20 },
    { hpt: 18 },
    { hpt: 22 },
    { hpt: 44 },
    { hpt: 36 },
    { hpt: 18 },
    ...viSentUp.map(() => ({ hpt: 24 })),
  ];

  styleWorksheetCells(
    ws,
    (r, c) => {
      if ((r === 5 || r === 6) && c >= 9 && c <= 21) return true;
      if (r >= 4 && r <= 6 && c === 22) return true;
      return false;
    },
    (r) => r <= 7,
    (r, c) => r >= 8 && (c === 4 || c === 5 || c === 6)
  );

  return ws;
}

/**
 * Generates and downloads the BSEB Matric Visually Impaired Sent-Up Excel report.
 */
export function exportVisuallyImpairedSentUp10thExcel(
  records: AdmitCardRecord[],
  options: { annualYear?: string; sentUpYear?: string; filenamePrefix?: string } = {}
): void {
  const {
    annualYear = '2027',
    sentUpYear = '2026',
    filenamePrefix = `10th_Visually_Impaired_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`,
  } = options;

  const wb = XLSXStyle.utils.book_new();
  const ws = build10thVisuallyImpairedSentUpWorksheet(records, annualYear, sentUpYear);
  XLSXStyle.utils.book_append_sheet(wb, ws, `10th_VI_SentUp_${sentUpYear}`);
  XLSXStyle.writeFile(wb, `${filenamePrefix}.xlsx`);
}

/**
 * Builds the 24-Column BSEB Matric Visually Impaired Absent / Non Sent-Up Students Worksheet
 * (Matches Visually_Impaired_Non_Sent-up_388ee456.pdf)
 */
export function build10thVisuallyImpairedAbsentWorksheet(
  records: AdmitCardRecord[],
  annualYear = '2027',
  sentUpYear = '2026'
): XLSX.WorkSheet {
  const viAbsent = records.filter(
    (r) => isMatricVisuallyImpaired(r) && isMatricAbsentOrNonSentUp(r)
  );
  return build10th24ColWorksheet(
    viAbsent,
    '(iii) दृष्टिबाधित (Visually Impaired/Blind) अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) परीक्षार्थियों के लिए विहित प्रपत्र :-',
    annualYear,
    sentUpYear
  );
}

/**
 * Generates and downloads the BSEB Matric Visually Impaired Absent Excel report.
 */
export function exportVisuallyImpairedAbsent10thExcel(
  records: AdmitCardRecord[],
  options: { annualYear?: string; sentUpYear?: string; filenamePrefix?: string } = {}
): void {
  const {
    annualYear = '2027',
    sentUpYear = '2026',
    filenamePrefix = `10th_Visually_Impaired_Non_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`,
  } = options;

  const wb = XLSXStyle.utils.book_new();
  const ws = build10thVisuallyImpairedAbsentWorksheet(records, annualYear, sentUpYear);
  XLSXStyle.utils.book_append_sheet(wb, ws, `10th_VI_Absent_${sentUpYear}`);
  XLSXStyle.writeFile(wb, `${filenamePrefix}.xlsx`);
}

/**
 * Builds the Subject-Wise Matrix rows (each unique subject in the batch has its own column).
 */
function buildSubjectMatrixRows(records: AdmitCardRecord[]): Array<Record<string, string | number>> {
  const uniqueSubjects = getAllUniqueSubjectsInBatch(records);

  return records.map((r, idx) => {
    const summary = calculateStudentMarksSummary(r);
    const enrolledSet = new Set(getStudentRegisteredSubjects(r).map((s) => s.subjectName));

    const row: Record<string, string | number> = {
      'S.No.': idx + 1,
      'BSEB Unique ID': r.bsebUniqueId,
      'Registration No.': r.registrationNo,
      'Roll Code': r.rollCode,
      'Roll Number': r.rollNumber,
      'Student Name': r.studentName,
      "Father's Name": r.fatherName,
      "Mother's Name": r.motherName,
      'DOB': r.dob,
      'Gender': r.gender,
      'Category': r.studentCategory,
      'Caste': r.casteCategory,
      'Stream / Faculty': r.faculty,
    };

    for (const subj of uniqueSubjects) {
      const isEnrolled = enrolledSet.has(subj);
      const mark = getSubjectMark(r, subj);
      row[`${subj} (Marks)`] = isEnrolled ? (mark !== '' ? mark : '') : '—';
    }

    row['Total Marks (500)'] = summary.enteredCount > 0 ? summary.totalMarks : '';
    row['Percentage (%)'] = summary.percentage;
    row['Division / Result'] = summary.enteredCount > 0 ? summary.division : '';
    row['Remarks'] = r.remarks || '';
    return row;
  });
}

/**
 * Builds the Slot-Wise Master rows.
 */
function buildSlotWiseRows(records: AdmitCardRecord[]): Array<Record<string, string | number>> {
  return records.map((r, idx) => {
    const summary = calculateStudentMarksSummary(r);
    return {
      'S.No.': idx + 1,
      'Exam Type': r.examType,
      'Faculty / Stream': r.faculty,
      'BSEB Unique ID': r.bsebUniqueId,
      'School / College Code': r.schoolCode,
      'School / College Name': r.schoolName,
      'Student Name': r.studentName,
      "Father's Name": r.fatherName,
      "Mother's Name": r.motherName,
      'Date of Birth': r.dob,
      Gender: r.gender,
      'Marital Status': r.maritalStatus,
      'Student Category': r.studentCategory,
      'Caste Category': r.casteCategory,
      'Divyang (PwD)': r.differentlyAbled,
      'Aadhaar Number': r.aadhaarNo,
      'Registration / Listing No.': r.registrationNo,
      'Roll Code': r.rollCode,
      'Roll Number': r.rollNumber,
      'Exam Center': r.examCenter,
      'Language Subject 1': r.langSubject1,
      'Language 1 Marks': getSubjectMark(r, r.langSubject1),
      'Language Subject 2': r.langSubject2,
      'Language 2 Marks': getSubjectMark(r, r.langSubject2),
      'Subject / Elective 1': r.compulsorySubject1,
      'Subject 1 Marks': getSubjectMark(r, r.compulsorySubject1),
      'Subject / Elective 2': r.compulsorySubject2,
      'Subject 2 Marks': getSubjectMark(r, r.compulsorySubject2),
      'Subject / Elective 3': r.compulsorySubject3,
      'Subject 3 Marks': getSubjectMark(r, r.compulsorySubject3),
      'Subject 4 (Matric Eng)': r.compulsorySubject4,
      'Subject 4 Marks': getSubjectMark(r, r.compulsorySubject4),
      'Additional / Optional Subject': r.additionalSubject,
      'Additional Subject Marks': getSubjectMark(r, r.additionalSubject),
      'Total Marks (500)': summary.enteredCount > 0 ? summary.totalMarks : '',
      'Percentage (%)': summary.percentage,
      'Division / Result': summary.enteredCount > 0 ? summary.division : '',
      Remarks: r.remarks || '',
      'Source PDF / File': r.sourceFileName,
      'PDF Page No.': r.sourcePageNumber,
    };
  });
}

/**
 * Builds rows matching the user's exact uploaded Custom Excel Format headers.
 */
function buildCustomFormatRows(
  records: AdmitCardRecord[],
  headers: string[]
): Array<Record<string, string | number>> {
  return records.map((r, idx) => {
    const rowObj: Record<string, string | number> = {};
    for (const h of headers) {
      rowObj[h] = resolveCustomColumnValue(r, idx, h);
    }
    return rowObj;
  });
}

/**
 * Downloads a ready-to-fill Blank Marks Entry Excel Template (.xlsx) with 90-degree rotated Subject headers.
 */
export function downloadBlankMarksTemplate(records: AdmitCardRecord[]): void {
  if (records.length === 0) return;
  const uniqueSubjects = getAllUniqueSubjectsInBatch(records);

  const templateRows = records.map((r, idx) => {
    const enrolledSet = new Set(getStudentRegisteredSubjects(r).map((s) => s.subjectName));
    const row: Record<string, string | number> = {
      'S.No.': idx + 1,
      'BSEB Unique ID': r.bsebUniqueId,
      'Registration No.': r.registrationNo,
      'Roll Code': r.rollCode,
      'Student Name': r.studentName,
      "Father's Name": r.fatherName,
      'Stream / Faculty': r.faculty,
      'Registered Subjects': r.allSubjectsSummary,
    };

    for (const subj of uniqueSubjects) {
      const existingMark = getSubjectMark(r, subj);
      row[subj] = enrolledSet.has(subj) ? existingMark : 'N/A';
    }

    return row;
  });

  const wb = XLSXStyle.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateRows);
  ws['!cols'] = [
    { wch: 7 },
    { wch: 16 },
    { wch: 22 },
    { wch: 10 },
    { wch: 24 },
    { wch: 24 },
    { wch: 14 },
    { wch: 42 },
    ...uniqueSubjects.map(() => ({ wch: 8 })),
  ];
  ws['!rows'] = [{ hpt: 72 }, ...records.map(() => ({ hpt: 22 }))];

  styleWorksheetCells(
    ws,
    (r, c) => r === 0 && c >= 8,
    (r) => r === 0,
    (r, c) => r >= 1 && (c === 4 || c === 5 || c === 7)
  );

  XLSXStyle.utils.book_append_sheet(wb, ws, 'Marks_Entry_Sheet');
  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSXStyle.writeFile(wb, `BSEB_Marks_Entry_Template_${records.length}_Students_${dateStamp}.xlsx`);
}

/**
 * Downloads the Excel (.xlsx) report in the selected format using `xlsx-js-style`
 * so 90-degree rotated Subject Names (`textRotation: 90`) are preserved in Excel.
 */
export function exportToExcel(
  records: AdmitCardRecord[],
  options: ExcelExportOptions = {}
): void {
  if (records.length === 0) return;

  const {
    mode = options.customFormat ? 'CUSTOM_UPLOADED' : 'BSEB_12TH_SENTUP',
    customFormat = null,
    filenamePrefix = 'BSEB_SentUp_Report',
    annualYear = '2027',
    sentUpYear = '2026',
  } = options;

  const wb = XLSXStyle.utils.book_new();

  if (mode === 'BSEB_12TH_SENTUP') {
    const ws12 = build12thSentUpWorksheet(records, annualYear, sentUpYear);
    XLSXStyle.utils.book_append_sheet(wb, ws12, `12th_SentUp_${sentUpYear}`);
  } else if (mode === 'BSEB_10TH_SENTUP') {
    const ws10 = build10thSentUpWorksheet(records, annualYear, sentUpYear);
    XLSXStyle.utils.book_append_sheet(wb, ws10, `10th_SentUp_${sentUpYear}`);
  } else if (mode === 'BSEB_10TH_ABSENT') {
    const ws10Absent = build10thAbsentWorksheet(records, annualYear, sentUpYear);
    XLSXStyle.utils.book_append_sheet(wb, ws10Absent, `10th_Absent_${sentUpYear}`);
  } else if (mode === 'BSEB_10TH_VISUALLY_IMPAIRED') {
    const ws10VI = build10thVisuallyImpairedSentUpWorksheet(records, annualYear, sentUpYear);
    XLSXStyle.utils.book_append_sheet(wb, ws10VI, `10th_VI_SentUp_${sentUpYear}`);
  } else if (mode === 'BSEB_10TH_VISUALLY_IMPAIRED_ABSENT') {
    const ws10VIAbsent = build10thVisuallyImpairedAbsentWorksheet(records, annualYear, sentUpYear);
    XLSXStyle.utils.book_append_sheet(wb, ws10VIAbsent, `10th_VI_Absent_${sentUpYear}`);
  } else if (mode === 'BSEB_12TH_VOCATIONAL') {
    const wsVoc = build12thVocationalWorksheet(records, annualYear, sentUpYear);
    XLSXStyle.utils.book_append_sheet(wb, wsVoc, `12th_Vocational_${sentUpYear}`);
  } else if (mode === 'BSEB_12TH_ABSENT') {
    const wsScience = build12thAbsentWorksheet(records, 'SCIENCE', annualYear, sentUpYear);
    const wsArts = build12thAbsentWorksheet(records, 'ARTS', annualYear, sentUpYear);
    const wsComm = build12thAbsentWorksheet(records, 'COMMERCE', annualYear, sentUpYear);
    XLSXStyle.utils.book_append_sheet(wb, wsScience, 'SCIENCE_Absent');
    XLSXStyle.utils.book_append_sheet(wb, wsArts, 'ARTS_Absent');
    XLSXStyle.utils.book_append_sheet(wb, wsComm, 'COMMERCE_Absent');
  } else if (mode === 'CUSTOM_UPLOADED' && customFormat && customFormat.headers.length > 0) {
    const customRows = buildCustomFormatRows(records, customFormat.headers);
    const wsCustom = XLSX.utils.json_to_sheet(customRows, {
      header: customFormat.headers,
    });
    const isSubjectCol = (c: number) => {
      const h = (customFormat.headers[c] || '').toLowerCase();
      return (
        h.includes('subject') ||
        h.includes('sub-') ||
        h.includes('lang') ||
        h.includes('elective') ||
        h.includes('additional')
      );
    };
    wsCustom['!cols'] = customFormat.headers.map((h, idx) => ({
      wch: isSubjectCol(idx) ? 8 : Math.max(12, Math.min(32, h.length + 5)),
    }));
    wsCustom['!rows'] = [
      { hpt: 64 },
      ...records.map(() => ({ hpt: 58 })),
    ];
    styleWorksheetCells(
      wsCustom,
      (r, c) => isSubjectCol(c) && r >= 0,
      (r) => r === 0
    );
    const sheetTitle = (customFormat.sheetName || 'Custom_Format_Report').slice(0, 31);
    XLSXStyle.utils.book_append_sheet(wb, wsCustom, sheetTitle);
  } else if (mode === 'SUBJECT_WISE_MATRIX') {
    const uniqueSubjects = getAllUniqueSubjectsInBatch(records);
    const matrixRows = buildSubjectMatrixRows(records);
    const wsMatrix = XLSX.utils.json_to_sheet(matrixRows);
    wsMatrix['!rows'] = [{ hpt: 72 }, ...records.map(() => ({ hpt: 22 }))];
    styleWorksheetCells(
      wsMatrix,
      (r, c) => r === 0 && c >= 13 && c < 13 + uniqueSubjects.length,
      (r) => r === 0
    );
    XLSXStyle.utils.book_append_sheet(wb, wsMatrix, 'Subject_Marks_Matrix');
  } else {
    const slotRows = buildSlotWiseRows(records);
    const wsSlot = XLSX.utils.json_to_sheet(slotRows);
    const slotSubjectCols = new Set([20, 22, 24, 26, 28, 30, 32]);
    wsSlot['!rows'] = [{ hpt: 64 }, ...records.map(() => ({ hpt: 60 }))];
    styleWorksheetCells(
      wsSlot,
      (r, c) => slotSubjectCols.has(c) && r >= 0,
      (r) => r === 0
    );
    XLSXStyle.utils.book_append_sheet(wb, wsSlot, 'Student_Master_Report');
  }

  // Also include both 12th Sent-Up and 10th Sent-Up sheets in the workbook for immediate convenience
  if (mode !== 'BSEB_12TH_SENTUP') {
    XLSXStyle.utils.book_append_sheet(wb, build12thSentUpWorksheet(records, annualYear, sentUpYear), `12th_SentUp_${sentUpYear}`);
  }
  if (mode !== 'BSEB_10TH_SENTUP') {
    XLSXStyle.utils.book_append_sheet(wb, build10thSentUpWorksheet(records, annualYear, sentUpYear), `10th_SentUp_${sentUpYear}`);
  }

  const stats = computeSummaryStats(records);
  const summaryRows: Array<Record<string, string | number>> = [
    { Category: 'OVERALL SUMMARY', Metric: 'Total Students', Count: stats.totalStudents },
    { Category: 'OVERALL SUMMARY', Metric: 'Male Students', Count: stats.maleCount },
    { Category: 'OVERALL SUMMARY', Metric: 'Female Students', Count: stats.femaleCount },
    { Category: 'OVERALL SUMMARY', Metric: 'Matric (10th) Students', Count: stats.matricCount },
    { Category: 'OVERALL SUMMARY', Metric: 'Intermediate (+2) Students', Count: stats.interCount },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 32 }, { wch: 14 }];
  XLSXStyle.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSXStyle.writeFile(wb, `${filenamePrefix}_${records.length}_Students_${dateStamp}.xlsx`);
}

/**
 * Downloads a UTF-8 CSV file of all extracted student records.
 */
export function exportToCsv(
  records: AdmitCardRecord[],
  customFormat?: CustomExcelFormatConfig | null,
  filenamePrefix = 'BSEB_SentUp_Report'
): void {
  if (records.length === 0) return;

  const ws =
    customFormat && customFormat.headers.length > 0
      ? XLSX.utils.json_to_sheet(buildCustomFormatRows(records, customFormat.headers))
      : build12thSentUpWorksheet(records);

  const csvContent = '\uFEFF' + XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenamePrefix}_${records.length}_Students_${dateStamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads the exact 30-Column BSEB Intermediate (+2 / 12th) Sent-Up Praptank Panji PDF
 * with 90-degree vertical rotation on Subject Name columns, Registration Number, and Sub-headers
 * (Matches 12th_Sent-Up_Exam.-2025_0ef477cb.pdf)
 */
export function exportSentUp12thPdf(
  records: AdmitCardRecord[],
  filenamePrefix = '12th_Sent-Up_Exam.-2026_Annual-2027',
  options: { annualYear?: string; sentUpYear?: string } = {}
): void {
  const { annualYear = '2027', sentUpYear = '2026' } = options;
  if (records.length === 0) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const schoolCode = records[0]?.schoolCode || '31337';
  const schoolName =
    records[0]?.schoolName || 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR';

  // 0-indexed columns in the 30-column table whose body values are rotated 90 degrees:
  // Col 1 (#2 Registration No) + Subject Name cols: 4 (#5), 6 (#7), 8 (#9), 12 (#13), 16 (#17), 21 (#22), 25 (#26)
  const ROTATED_BODY_COLS_12TH = new Set([1, 4, 6, 8, 12, 16, 21, 25]);

  const hindiSubHeaderPng = renderUnicodeTextToPngDataUrl(
    `इन्टरमीडिएट वार्षिक परीक्षा, ${annualYear} में सम्मिलित होने वाले नियमित, स्वतन्त्र एवं क्वालिफाईंग कोटि के परीक्षार्थियों के उत्प्रेषण (Sent-up)/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी`,
    { widthPx: 2200, heightPx: 44, fontSizePx: 23, align: 'center', bold: true }
  );
  const hindiFooterPng = renderUnicodeTextToPngDataUrl(
    '+2 विद्यालय/महाविद्यालय प्रधान का हस्ताक्षर एवं मुहर',
    { widthPx: 900, heightPx: 40, fontSizePx: 22, align: 'right', bold: true }
  );

  const drawPageHeader = () => {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text('BIHAR SCHOOL EXAMINATION BOARD, PATNA', 148.5, 9, { align: 'center' });

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.rect(8, 11, 281, 6.5);
    if (hindiSubHeaderPng) {
      try {
        doc.addImage(hindiSubHeaderPng, 'PNG', 12, 11.6, 273, 5.3);
      } catch {
        doc.setFontSize(8.5);
        doc.text(
          `Intermediate Annual Exam ${annualYear} - Sent-Up / Test Exam ${sentUpYear} Marks Register (Praptank Panji)`,
          148.5,
          15.3,
          { align: 'center' }
        );
      }
    } else {
      doc.setFontSize(8.5);
      doc.text(
        `Intermediate Annual Exam ${annualYear} - Sent-Up / Test Exam ${sentUpYear} Marks Register (Praptank Panji)`,
        148.5,
        15.3,
        { align: 'center' }
      );
    }

    doc.rect(8, 17.5, 281, 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('+2 School/College Code :-', 14, 21.3);
    doc.setFont('helvetica', 'bold');
    doc.text(String(schoolCode), 58, 21.3);

    doc.rect(8, 23, 281, 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text('+2 School/College Name :-', 14, 26.8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(schoolName).toUpperCase(), 58, 26.8);
  };

  drawPageHeader();

  const bodyRows = records.map((r, idx) => {
    const s = getEffectiveInterSentUp(r);
    const mf = r.gender === 'MALE' ? 'M' : 'F';
    const stackedNames = [r.studentName, r.fatherName, r.motherName]
      .filter(Boolean)
      .join('\n');

    return [
      String(idx + 1),
      r.registrationNo || '---',
      stackedNames || r.studentName || '---',
      mf,
      s.lang1Subject || '306-Hindi',
      s.lang1Marks !== '' ? s.lang1Marks : '---',
      s.lang2Subject || '305-English',
      s.lang2Marks !== '' ? s.lang2Marks : '---',
      s.elective1Subject || '---',
      s.elective1Theory !== '' ? s.elective1Theory : '---',
      s.elective1Practical !== '' ? s.elective1Practical : '0',
      s.elective1Total !== '' ? s.elective1Total : '---',
      s.elective2Subject || '---',
      s.elective2Theory !== '' ? s.elective2Theory : '---',
      s.elective2Practical !== '' ? s.elective2Practical : '0',
      s.elective2Total !== '' ? s.elective2Total : '---',
      s.elective3Subject || '---',
      s.elective3Theory !== '' ? s.elective3Theory : '---',
      s.elective3Practical !== '' ? s.elective3Practical : '0',
      s.elective3Total !== '' ? s.elective3Total : '---',
      s.aggregate !== '' ? s.aggregate : '---',
      s.additionalSubject || '---',
      s.additionalTheory !== '' ? s.additionalTheory : '---',
      s.additionalPractical !== '' ? s.additionalPractical : '---',
      s.additionalTotal || '---',
      s.vocationalSubject || '---',
      s.vocationalTheory !== '' ? s.vocationalTheory : '---',
      s.vocationalPractical !== '' ? s.vocationalPractical : '---',
      s.vocationalTotal || '---',
      s.resultStatus || 'SENT-UP',
    ];
  });

  autoTable(doc, {
    startY: 28.5,
    margin: { top: 28.5, left: 8, right: 8, bottom: 15 },
    head: [
      [
        { content: 'Sl.\nNo.', rowSpan: 3 },
        { content: 'Registration Number', rowSpan: 3 },
        { content: "Student's Name\nMother's Name\nFather's Name", rowSpan: 3 },
        { content: 'M/F', rowSpan: 3 },
        { content: 'Compulsory Language\nSubjects', colSpan: 4 },
        { content: 'Elective Subjects', colSpan: 12 },
        { content: 'Aggregate\n& Result', rowSpan: 3 },
        { content: 'Additional Subject', colSpan: 4 },
        { content: 'Vocational Subject', colSpan: 4 },
        { content: 'Result', rowSpan: 3 },
      ],
      [
        { content: 'Marks Obtained', colSpan: 4 },
        { content: 'Marks Obtained', colSpan: 12 },
        { content: 'Marks Obtained', colSpan: 4 },
        { content: 'Marks Obtained', colSpan: 4 },
      ],
      [
        'Subject-1',
        'Marks',
        'Subject-2',
        'Marks',
        'Subject-1',
        'Theory',
        'Practical',
        'Total',
        'Subject-2',
        'Theory',
        'Practical',
        'Total',
        'Subject-3',
        'Theory',
        'Practical',
        'Total',
        'Add. Sub.',
        'Theory',
        'Practical',
        'Total',
        'Add. Sub.',
        'Theory',
        'Practical',
        'Total',
      ],
      Array.from({ length: 30 }, (_, i) => String(i + 1)),
    ],
    body: bodyRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6,
      cellPadding: 1,
      valign: 'middle',
      halign: 'center',
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [232, 232, 224],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 6,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 6.5 },
      1: { cellWidth: 9.5, fontStyle: 'bold' },
      2: { cellWidth: 42, halign: 'left', fontStyle: 'bold' },
      3: { cellWidth: 6.5, fontStyle: 'bold' },
      4: { cellWidth: 8.5 },
      5: { cellWidth: 7.5, fontStyle: 'bold' },
      6: { cellWidth: 8.5 },
      7: { cellWidth: 7.5, fontStyle: 'bold' },
      8: { cellWidth: 9.5 },
      9: { cellWidth: 7 },
      10: { cellWidth: 7 },
      11: { cellWidth: 7.5, fontStyle: 'bold' },
      12: { cellWidth: 9.5 },
      13: { cellWidth: 7 },
      14: { cellWidth: 7 },
      15: { cellWidth: 7.5, fontStyle: 'bold' },
      16: { cellWidth: 9.5 },
      17: { cellWidth: 7 },
      18: { cellWidth: 7 },
      19: { cellWidth: 7.5, fontStyle: 'bold' },
      20: { cellWidth: 10.5, fontStyle: 'bold', fontSize: 6.8 },
      21: { cellWidth: 9 },
      22: { cellWidth: 6.5 },
      23: { cellWidth: 6.5 },
      24: { cellWidth: 7 },
      25: { cellWidth: 8.5 },
      26: { cellWidth: 6.5 },
      27: { cellWidth: 6.5 },
      28: { cellWidth: 6.5 },
      29: { cellWidth: 12, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const isRow0Rotated =
          data.row.index === 0 &&
          (data.column.index === 1 || data.column.index === 20 || data.column.index === 29);
        const isRow2Rotated = data.row.index === 2;
        if (isRow0Rotated || isRow2Rotated) {
          const raw = data.cell.text.join('\n').trim();
          (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
          data.cell.text = [''];
          if (isRow2Rotated) {
            data.cell.styles.minCellHeight = 17;
          }
        }
      } else if (data.section === 'body') {
        data.cell.styles.minCellHeight = 16.5;
        if (ROTATED_BODY_COLS_12TH.has(data.column.index)) {
          const raw = data.cell.text.join('\n').trim();
          (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
          data.cell.text = [''];
        }
      }
    },
    didDrawCell: (data) => {
      const rotatedText = (data.cell as unknown as { _rotated90Text?: string })._rotated90Text;
      if (rotatedText) {
        drawRotated90CellText(doc, rotatedText, data.cell, {
          fontSizePt: data.section === 'head' ? 6.2 : 5.6,
          bold: true,
        });
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawPageHeader();
      }
      const totalPages = doc.getNumberOfPages();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(`Page ${data.pageNumber} of ${totalPages}`, 148.5, 202, {
        align: 'center',
      });
      if (hindiFooterPng) {
        try {
          doc.addImage(hindiFooterPng, 'PNG', 195, 197.5, 92, 5.5);
        } catch {
          doc.text('+2 Principal / Headmaster Signature & Seal', 287, 202, {
            align: 'right',
          });
        }
      } else {
        doc.text('+2 Principal / Headmaster Signature & Seal', 287, 202, {
          align: 'right',
        });
      }
    },
  });

  deliverGeneratedPdf(
    doc,
    `${filenamePrefix}.pdf`,
    '12th Sent-Up Praptank Panji (30-Col)'
  );
}

/**
 * Generates and downloads the exact 23-Column BSEB Matric (10th) Sent-Up Praptank Panji PDF
 * with 90-degree vertical rotation on Subject Name headers (MIL, SIL, MAT, SCI, SSC, ENG, OPT, VOC)
 * (Matches 10th_Sent-Up_Exam.-2025_BSEB_014357e0.pdf)
 */
export function exportSentUp10thPdf(
  records: AdmitCardRecord[],
  filenamePrefix = '10th_Sent-Up_Exam.-2026_BSEB',
  options: { annualYear?: string; sentUpYear?: string } = {}
): void {
  const { annualYear = '2027', sentUpYear = '2026' } = options;
  if (records.length === 0) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const hindiBanner1Png = renderUnicodeTextToPngDataUrl(
    `-: वार्षिक माध्यमिक परीक्षा, ${annualYear} में सम्मिलित होने वाले पंजीकृत नियमित एवं स्वतन्त्र कोटि के परीक्षार्थियों के उत्प्रेषण/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी :-`,
    { widthPx: 2200, heightPx: 42, fontSizePx: 22, align: 'center', bold: true }
  );
  const hindiBanner2Png = renderUnicodeTextToPngDataUrl(
    '(i) उत्प्रेषित (Sent-up) छात्र/छात्राओं के लिए विहित प्रपत्र :-',
    { widthPx: 1400, heightPx: 40, fontSizePx: 22, align: 'left', bold: true }
  );
  const hindiFooter10Png = renderUnicodeTextToPngDataUrl(
    'विद्यालय प्रधान का हस्ताक्षर व मुहर',
    { widthPx: 800, heightPx: 40, fontSizePx: 22, align: 'right', bold: true }
  );

  const drawPageHeader10 = () => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(8, 7, 281, 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('BIHAR SCHOOL EXAMINATION BOARD, PATNA', 148.5, 11.2, { align: 'center' });
    doc.setFontSize(8.5);
    doc.text(`SENT-UP/TEST EXAM.-${sentUpYear}`, 148.5, 15.5, { align: 'center' });

    doc.rect(8, 17, 281, 5);
    if (hindiBanner1Png) {
      try {
        doc.addImage(hindiBanner1Png, 'PNG', 12, 17.4, 273, 4.2);
      } catch {
        doc.setFontSize(7.5);
        doc.text(
          `Annual Secondary Examination ${annualYear} - Sent-Up / Test Examination ${sentUpYear} Marks Register (Praptank Panji)`,
          148.5,
          20.6,
          { align: 'center' }
        );
      }
    }

    doc.rect(8, 22, 281, 5);
    if (hindiBanner2Png) {
      try {
        doc.addImage(hindiBanner2Png, 'PNG', 9, 22.4, 140, 4.2);
      } catch {
        doc.setFontSize(7.5);
        doc.text('(i) Prescribed Format for Sent-Up Candidates :-', 11, 25.5);
      }
    }
  };

  drawPageHeader10();

  const bodyRows = records.map((r, idx) => {
    const m = getEffectiveMatricSentUp(r);
    return [
      String(idx + 1),
      r.schoolCode || r.rollCode || '51803',
      r.schoolName || 'H.S.S.\nBERUA',
      r.registrationNo || '---',
      r.studentName || '---',
      r.motherName || '---',
      r.fatherName || '---',
      r.dob && r.dob !== 'N/A' ? r.dob : '---',
      r.gender || 'FEMALE',
      m.milTheory !== '' ? m.milTheory : '---',
      m.silTheory !== '' ? m.silTheory : '---',
      m.matTheory !== '' ? m.matTheory : '---',
      m.sciTheory !== '' ? m.sciTheory : '---',
      m.sscTheory !== '' ? m.sscTheory : '---',
      m.engTheory !== '' ? m.engTheory : '---',
      m.optTheory !== '' ? m.optTheory : '---',
      m.vocTheory !== '' ? m.vocTheory : '---',
      m.sciPractical !== '' ? m.sciPractical : '---',
      m.sscLitAct !== '' ? m.sscLitAct : '---',
      m.sscPrWork !== '' ? m.sscPrWork : '---',
      m.optPractical !== '' ? m.optPractical : '---',
      m.vocPractical !== '' ? m.vocPractical : '---',
      m.aggregate !== '' ? m.aggregate : '---',
    ];
  });

  autoTable(doc, {
    startY: 27,
    margin: { top: 27, left: 8, right: 8, bottom: 14 },
    head: [
      [
        { content: 'SL\nNO', rowSpan: 3 },
        { content: 'SCHOOL\nCODE', rowSpan: 3 },
        { content: 'SCHOOL/+2\nSCHOOL NAME', rowSpan: 3 },
        { content: 'REGISTRATION NO.\n& YEAR', rowSpan: 3 },
        { content: 'STUDENT NAME', rowSpan: 3 },
        { content: "MOTHER'S NAME", rowSpan: 3 },
        { content: "FATHER'S NAME", rowSpan: 3 },
        { content: 'DATE OF\nBIRTH', rowSpan: 3 },
        { content: 'GENDER', rowSpan: 3 },
        { content: 'MARKS OBTAINED (THEORY)', colSpan: 8 },
        { content: 'MARKS OBTAINED (INTERNAL ASSESSMENT & PRACTICAL)', colSpan: 5 },
        { content: 'AGGRE-GATE', rowSpan: 3 },
      ],
      [
        { content: 'MIL', rowSpan: 2 },
        { content: 'SIL', rowSpan: 2 },
        { content: 'MAT', rowSpan: 2 },
        { content: 'SCI', rowSpan: 2 },
        { content: 'SSC', rowSpan: 2 },
        { content: 'ENG', rowSpan: 2 },
        { content: 'OPT-SUB', rowSpan: 2 },
        { content: 'OPT-SUB\n(Voc.)', rowSpan: 2 },
        { content: 'SCI', rowSpan: 2 },
        { content: 'SSC', colSpan: 2 },
        { content: 'OPT-SUB', rowSpan: 2 },
        { content: 'OPT-SUB\n(Voc.)', rowSpan: 2 },
      ],
      ['LIT. ACT', 'Pr. Work'],
      Array.from({ length: 23 }, (_, i) => String(i + 1)),
    ],
    body: bodyRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 5.8,
      cellPadding: 1.1,
      valign: 'middle',
      halign: 'center',
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 5.6,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 6.5 },
      1: { cellWidth: 8.5, fontStyle: 'bold' },
      2: { cellWidth: 16, fontStyle: 'bold' },
      3: { cellWidth: 22, fontStyle: 'bold' },
      4: { cellWidth: 27, fontStyle: 'bold' },
      5: { cellWidth: 24 },
      6: { cellWidth: 26 },
      7: { cellWidth: 15, fontStyle: 'bold' },
      8: { cellWidth: 11, fontStyle: 'bold' },
      9: { cellWidth: 8, fontStyle: 'bold' },
      10: { cellWidth: 8, fontStyle: 'bold' },
      11: { cellWidth: 8, fontStyle: 'bold' },
      12: { cellWidth: 8, fontStyle: 'bold' },
      13: { cellWidth: 8, fontStyle: 'bold' },
      14: { cellWidth: 8, fontStyle: 'bold' },
      15: { cellWidth: 9 },
      16: { cellWidth: 10 },
      17: { cellWidth: 8, fontStyle: 'bold' },
      18: { cellWidth: 8.5, fontStyle: 'bold' },
      19: { cellWidth: 8.5, fontStyle: 'bold' },
      20: { cellWidth: 9 },
      21: { cellWidth: 10 },
      22: { cellWidth: 13.5, fontStyle: 'bold', fontSize: 6.8 },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const isSubjectHeader =
          (data.row.index === 1 && data.column.index >= 9 && data.column.index <= 21 && data.column.index !== 18) ||
          data.row.index === 2 ||
          (data.row.index === 0 && data.column.index === 22);
        if (isSubjectHeader) {
          const raw = data.cell.text.join('\n').trim();
          (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
          data.cell.text = [''];
          if (data.row.index === 1 || data.row.index === 2) {
            data.cell.styles.minCellHeight = 14;
          }
        }
      }
    },
    didDrawCell: (data) => {
      const rotatedText = (data.cell as unknown as { _rotated90Text?: string })._rotated90Text;
      if (rotatedText) {
        drawRotated90CellText(doc, rotatedText, data.cell, {
          fontSizePt: 5.8,
          bold: true,
        });
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawPageHeader10();
      }
      if (hindiFooter10Png) {
        try {
          doc.addImage(hindiFooter10Png, 'PNG', 202, 198, 84, 5.2);
        } catch {
          doc.setFontSize(8);
          doc.text('Headmaster Signature & Seal', 286, 202, { align: 'right' });
        }
      } else {
        doc.setFontSize(8);
        doc.text('Headmaster Signature & Seal', 286, 202, { align: 'right' });
      }
    },
  });

  deliverGeneratedPdf(
    doc,
    `${filenamePrefix}.pdf`,
    '10th Sent-Up Praptank Panji (23-Col)'
  );
}

/**
 * Generates and downloads the exact 24-Column BSEB Intermediate (+2) Vocational Stream Sent-Up Praptank Panji PDF
 * with 90-degree vertical rotation on Subject Name columns and headers matching Vocational_af5f0ca8.pdf
 */
export function exportVocational12thPdf(
  records: AdmitCardRecord[],
  filenamePrefix = '12th_Vocational_Exam-2026_Annual-2027',
  options: { annualYear?: string; sentUpYear?: string } = {}
): void {
  const { annualYear = '2027', sentUpYear = '2026' } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const schoolCode = records[0]?.schoolCode || '31337';
  const schoolName =
    records[0]?.schoolName || 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR';

  // 0-indexed columns in 24-col table whose body values are rotated 90 degrees:
  // Col 1 (Registration No), Col 4 (Sub-1), Col 6 (Sub-2), Col 8 (Foundation),
  // Col 10 (Paper 1), Col 14 (Paper 2), Col 19 (Add Sub)
  const ROTATED_VOC_BODY_COLS = new Set([1, 4, 6, 8, 10, 14, 19]);

  const hindiSubHeaderPng = renderUnicodeTextToPngDataUrl(
    `इन्टरमीडिएट वार्षिक परीक्षा, ${annualYear} में सम्मिलित होने वाले व्यावसायिक पाठ्यक्रम के परीक्षार्थियों के उत्प्रेषण (Sent-up)/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी`,
    { widthPx: 2200, heightPx: 44, fontSizePx: 23, align: 'center', bold: true }
  );
  const hindiFooterPng = renderUnicodeTextToPngDataUrl(
    '+2 विद्यालय/महाविद्यालय प्रधान का हस्ताक्षर एवं मुहर',
    { widthPx: 900, heightPx: 40, fontSizePx: 22, align: 'right', bold: true }
  );

  const drawPageHeader = () => {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text('BIHAR SCHOOL EXAMINATION BOARD, PATNA', 148.5, 9, { align: 'center' });

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.rect(8, 11, 281, 6.5);
    if (hindiSubHeaderPng) {
      try {
        doc.addImage(hindiSubHeaderPng, 'PNG', 12, 11.6, 273, 5.3);
      } catch {
        doc.setFontSize(8.5);
        doc.text(
          `Intermediate Annual Exam ${annualYear} - Sent-Up / Test Exam ${sentUpYear} Vocational Marks Panji`,
          148.5,
          15.3,
          { align: 'center' }
        );
      }
    } else {
      doc.setFontSize(8.5);
      doc.text(
        `Intermediate Annual Exam ${annualYear} - Sent-Up / Test Exam ${sentUpYear} Vocational Marks Panji`,
        148.5,
        15.3,
        { align: 'center' }
      );
    }

    doc.rect(8, 17.5, 281, 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('+2 School/College Code :-', 14, 21.3);
    doc.setFont('helvetica', 'bold');
    doc.text(String(schoolCode), 58, 21.3);

    doc.rect(8, 23, 281, 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text('+2 School/College Name :-', 14, 26.8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(schoolName).toUpperCase(), 58, 26.8);
  };

  drawPageHeader();

  const vocRecords = records.filter(
    (r) =>
      r.faculty === 'VOCATIONAL' ||
      Boolean(r.interSentUp?.vocationalSubject && r.interSentUp.vocationalSubject !== '---')
  );

  const bodyRows =
    vocRecords.length > 0
      ? vocRecords.map((r, idx) => {
          const s = getEffectiveInterSentUp(r);
          const mf = r.gender === 'MALE' ? 'M' : 'F';
          const stackedNames = [r.studentName, r.motherName, r.fatherName]
            .filter(Boolean)
            .join('\n');
          return [
            String(idx + 1),
            r.registrationNo || '---',
            stackedNames || r.studentName || '---',
            mf,
            s.lang1Subject || '---',
            s.lang1Marks !== '' ? s.lang1Marks : '---',
            s.lang2Subject || '---',
            s.lang2Marks !== '' ? s.lang2Marks : '---',
            s.elective1Subject || '(Fondation Course)',
            s.elective1Theory !== '' ? s.elective1Theory : '---',
            s.elective2Subject || 'Paper 1',
            s.elective2Theory !== '' ? s.elective2Theory : '---',
            s.elective2Practical !== '' ? s.elective2Practical : '0',
            s.elective2Total !== '' ? s.elective2Total : '---',
            s.elective3Subject || 'Paper 2',
            s.elective3Theory !== '' ? s.elective3Theory : '---',
            s.elective3Practical !== '' ? s.elective3Practical : '0',
            s.elective3Total !== '' ? s.elective3Total : '---',
            s.aggregate !== '' ? s.aggregate : '---',
            s.additionalSubject || '---',
            s.additionalTheory !== '' ? s.additionalTheory : '---',
            s.additionalPractical !== '' ? s.additionalPractical : '---',
            s.additionalTotal || '---',
            s.resultStatus || 'SENT-UP',
          ];
        })
      : [
          [
            '1', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL',
            'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL', 'NIL',
            'NIL', 'NIL', 'NIL', 'NIL',
          ],
        ];

  autoTable(doc, {
    startY: 28.5,
    margin: { top: 28.5, left: 8, right: 8, bottom: 15 },
    head: [
      [
        { content: 'Sl.\nNo.', rowSpan: 3 },
        { content: 'Registration Number', rowSpan: 3 },
        { content: "Student's Name\nMother's Name\nFather's Name", rowSpan: 3 },
        { content: 'M/F', rowSpan: 3 },
        { content: 'Compulsory Language\nSubjects', colSpan: 4 },
        { content: 'Elective Subjects', colSpan: 10 },
        { content: 'Aggregate\n& Result', rowSpan: 3 },
        { content: 'Additional Subject', colSpan: 4 },
        { content: 'Result', rowSpan: 3 },
      ],
      [
        { content: 'Marks Obtained', colSpan: 4 },
        { content: 'Marks Obtained', colSpan: 10 },
        { content: 'Marks Obtained', colSpan: 4 },
      ],
      [
        'Subject-1',
        'Marks',
        'Subject-2',
        'Marks',
        '(Fondation\nCourse)',
        'Marks',
        'Paper',
        'Theory',
        'Practical',
        'Total',
        'Paper',
        'Theory',
        'Practical',
        'Total',
        'Add. Sub.',
        'Theory',
        'Practical',
        'Total',
      ],
      Array.from({ length: 24 }, (_, i) => String(i + 1)),
    ],
    body: bodyRows,
    theme: 'grid',
    styles: {
      fontSize: 5.8,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 0.8,
      valign: 'middle',
      halign: 'center',
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [248, 249, 250],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 34, halign: 'left' },
      3: { cellWidth: 7, halign: 'center' },
      4: { cellWidth: 11, halign: 'center' },
      5: { cellWidth: 8, halign: 'center' },
      6: { cellWidth: 11, halign: 'center' },
      7: { cellWidth: 8, halign: 'center' },
      8: { cellWidth: 14, halign: 'center' },
      9: { cellWidth: 8, halign: 'center' },
      10: { cellWidth: 12, halign: 'center' },
      11: { cellWidth: 8, halign: 'center' },
      12: { cellWidth: 8, halign: 'center' },
      13: { cellWidth: 8, halign: 'center' },
      14: { cellWidth: 12, halign: 'center' },
      15: { cellWidth: 8, halign: 'center' },
      16: { cellWidth: 8, halign: 'center' },
      17: { cellWidth: 8, halign: 'center' },
      18: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      19: { cellWidth: 12, halign: 'center' },
      20: { cellWidth: 8, halign: 'center' },
      21: { cellWidth: 8, halign: 'center' },
      22: { cellWidth: 8, halign: 'center' },
      23: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const isHeaderRotated =
          (data.row.index === 0 && (data.column.index === 1 || data.column.index === 18 || data.column.index === 23)) ||
          data.row.index === 2;
        if (isHeaderRotated) {
          const raw = data.cell.text.join('\n').trim();
          (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
          data.cell.text = [''];
          data.cell.styles.minCellHeight = 22;
        }
      } else if (data.section === 'body') {
        data.cell.styles.minCellHeight = 16.5;
        if (ROTATED_VOC_BODY_COLS.has(data.column.index)) {
          const raw = data.cell.text.join('\n').trim();
          (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
          data.cell.text = [''];
        }
      }
    },
    didDrawCell: (data) => {
      const rotatedText = (data.cell as unknown as { _rotated90Text?: string })._rotated90Text;
      if (rotatedText) {
        drawRotated90CellText(doc, rotatedText, data.cell, {
          fontSizePt: data.section === 'head' ? 6.2 : 5.6,
          bold: true,
        });
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawPageHeader();
      }
      const totalPages = doc.getNumberOfPages();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(`Page ${data.pageNumber} of ${totalPages}`, 148.5, 202, {
        align: 'center',
      });
      if (hindiFooterPng) {
        try {
          doc.addImage(hindiFooterPng, 'PNG', 195, 197.5, 92, 5.5);
        } catch {
          doc.text('+2 Principal / Headmaster Signature & Seal', 287, 202, {
            align: 'right',
          });
        }
      } else {
        doc.text('+2 Principal / Headmaster Signature & Seal', 287, 202, {
          align: 'right',
        });
      }
    },
  });

  deliverGeneratedPdf(
    doc,
    `${filenamePrefix}.pdf`,
    '12th Vocational Sent-Up Panji'
  );
}

/**
 * Generates and downloads the exact 8-Column BSEB Intermediate (+2) Absent / Non Sent-Up Students PDF
 * with separate pages for SCIENCE, ARTS, and COMMERCE matching Absent_62ae20ba.pdf
 */
export function exportAbsent12thPdf(
  records: AdmitCardRecord[],
  filenamePrefix = '12th_Absent_Students_Exam-2026_Annual-2027',
  options: { annualYear?: string; sentUpYear?: string } = {}
): void {
  const { annualYear = '2027', sentUpYear = '2026' } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const schoolCode = records[0]?.schoolCode || '31337';
  const schoolName =
    records[0]?.schoolName || 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR';

  const hindiSubHeaderPng = renderUnicodeTextToPngDataUrl(
    `इन्टरमीडिएट वार्षिक परीक्षा, ${annualYear} में सम्मिलित होने वाले उत्प्रेषण (Sent-up)/जाँच परीक्षा, ${sentUpYear} में अनुपस्थित/अनुत्तीर्ण (Non Sent-up) परीक्षार्थियों की सूची`,
    { widthPx: 2200, heightPx: 44, fontSizePx: 23, align: 'center', bold: true }
  );
  const hindiFooterPng = renderUnicodeTextToPngDataUrl(
    '+2 विद्यालय/महाविद्यालय प्रधान का हस्ताक्षर एवं मुहर',
    { widthPx: 900, heightPx: 40, fontSizePx: 22, align: 'right', bold: true }
  );

  const drawPageHeader = () => {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text('BIHAR SCHOOL EXAMINATION BOARD, PATNA', 148.5, 9, { align: 'center' });

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.rect(8, 11, 281, 6.5);
    if (hindiSubHeaderPng) {
      try {
        doc.addImage(hindiSubHeaderPng, 'PNG', 12, 11.6, 273, 5.3);
      } catch {
        doc.setFontSize(8.5);
        doc.text(
          `Intermediate Annual Exam ${annualYear} - Sent-Up / Test Exam ${sentUpYear} Absent List`,
          148.5,
          15.3,
          { align: 'center' }
        );
      }
    } else {
      doc.setFontSize(8.5);
      doc.text(
        `Intermediate Annual Exam ${annualYear} - Sent-Up / Test Exam ${sentUpYear} Absent List`,
        148.5,
        15.3,
        { align: 'center' }
      );
    }

    doc.rect(8, 17.5, 281, 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('+2 School/College Code :-', 14, 21.3);
    doc.setFont('helvetica', 'bold');
    doc.text(String(schoolCode), 58, 21.3);

    doc.rect(8, 23, 281, 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text('+2 School/College Name :-', 14, 26.8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(schoolName).toUpperCase(), 58, 26.8);
  };

  const faculties = ['SCIENCE', 'ARTS', 'COMMERCE'] as const;

  faculties.forEach((fac, facIdx) => {
    if (facIdx > 0) {
      doc.addPage('a4', 'landscape');
    }
    drawPageHeader();

    const facultyRecords = records.filter(
      (r) => (r.faculty || 'SCIENCE').toUpperCase() === fac
    );

    const absentStudents = facultyRecords.filter((r) => {
      const s = getEffectiveInterSentUp(r);
      const st = (s.resultStatus || r.studentCategory || '').toUpperCase();
      return (
        st.includes('ABSENT') ||
        st.includes('NOT SENT-UP') ||
        st.includes('NON SENT-UP') ||
        st.includes('FAIL')
      );
    });

    const bodyRows =
      absentStudents.length > 0
        ? absentStudents.map((r, i) => [
            String(i + 1),
            r.registrationNo || '---',
            fac,
            r.studentName || '---',
            r.gender === 'MALE' ? 'M' : 'F',
            r.motherName || '---',
            r.fatherName || '---',
            (r.interSentUp?.resultStatus || 'ABSENT').toUpperCase(),
          ])
        : [['1', 'NIL', fac, 'NIL', 'NIL', 'NIL', 'NIL', 'NIL']];

    autoTable(doc, {
      startY: 28.5,
      margin: { top: 28.5, left: 8, right: 8, bottom: 15 },
      head: [
        [
          'Sl. No.',
          'Registration\nNumber',
          'Faculty',
          "Student's Name",
          'M/F',
          "Mother's Name",
          "Father's Name",
          'Absent/Fail',
        ],
        ['1', '2', '3', '4', '5', '6', '7', '8'],
      ],
      body: bodyRows,
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
        cellPadding: 2,
        valign: 'middle',
        font: 'helvetica',
      },
      headStyles: {
        fillColor: [248, 249, 250],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 16, halign: 'center' },
        1: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 52 },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 48 },
        6: { cellWidth: 48 },
        7: { cellWidth: 41, halign: 'center', fontStyle: 'bold' },
      },
    });

    const pageNum = facIdx + 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`Page ${pageNum} of ${faculties.length}`, 148.5, 202, { align: 'center' });
    if (hindiFooterPng) {
      try {
        doc.addImage(hindiFooterPng, 'PNG', 195, 197.5, 92, 5.5);
      } catch {
        doc.text('+2 Principal / Headmaster Signature & Seal', 287, 202, { align: 'right' });
      }
    } else {
      doc.text('+2 Principal / Headmaster Signature & Seal', 287, 202, { align: 'right' });
    }
  });

  deliverGeneratedPdf(
    doc,
    `${filenamePrefix}.pdf`,
    '12th Absent / Non Sent-Up Students List'
  );
}

/**
 * Generic PDF generator for 24-Column BSEB Matric Reports
 * (Used for Absent Students and Visually Impaired Absent Students)
 */
function generate10th24ColPdf(
  records: AdmitCardRecord[],
  options: {
    bannerTitleHindi: string;
    englishFallback: string;
    filenamePrefix: string;
    annualYear?: string;
    sentUpYear?: string;
    emptyConditionDescription?: string;
  }
): void {
  const {
    bannerTitleHindi,
    englishFallback,
    filenamePrefix,
    annualYear = '2027',
    sentUpYear = '2026',
  } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const schoolCode = records[0]?.schoolCode || records[0]?.rollCode || '51803';
  const schoolName = records[0]?.schoolName || 'H.S.S. BERUA';

  const hindiBanner1Png = renderUnicodeTextToPngDataUrl(
    `-: वार्षिक माध्यमिक परीक्षा, ${annualYear} में सम्मिलित होने वाले पंजीकृत नियमित एवं स्वतन्त्र कोटि के परीक्षार्थियों के उत्प्रेषण/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी :-`,
    { widthPx: 2200, heightPx: 42, fontSizePx: 22, align: 'center', bold: true }
  );
  const hindiBanner2Png = renderUnicodeTextToPngDataUrl(bannerTitleHindi, {
    widthPx: 1600,
    heightPx: 40,
    fontSizePx: 22,
    align: 'left',
    bold: true,
  });
  const hindiFooter10Png = renderUnicodeTextToPngDataUrl('विद्यालय प्रधान का हस्ताक्षर एवं मुहर', {
    widthPx: 800,
    heightPx: 40,
    fontSizePx: 22,
    align: 'right',
    bold: true,
  });

  const drawPageHeader = () => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(8, 7, 281, 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('BIHAR SCHOOL EXAMINATION BOARD, PATNA', 148.5, 11.2, { align: 'center' });
    doc.setFontSize(8.5);
    doc.text(`SENT-UP/TEST EXAM.-${sentUpYear}`, 148.5, 15.5, { align: 'center' });

    doc.rect(8, 17, 281, 5);
    if (hindiBanner1Png) {
      try {
        doc.addImage(hindiBanner1Png, 'PNG', 12, 17.4, 273, 4.2);
      } catch {
        doc.setFontSize(7.5);
        doc.text(
          `Annual Secondary Examination ${annualYear} - Sent-Up / Test Examination ${sentUpYear} Marks Register`,
          148.5,
          20.6,
          { align: 'center' }
        );
      }
    }

    doc.rect(8, 22, 281, 5);
    if (hindiBanner2Png) {
      try {
        doc.addImage(hindiBanner2Png, 'PNG', 9, 22.4, 160, 4.2);
      } catch {
        doc.setFontSize(7.5);
        doc.text(englishFallback, 11, 25.5);
      }
    }
  };

  drawPageHeader();

  const bodyRows =
    records.length > 0
      ? records.map((r, idx) => {
          const m = getEffectiveMatricSentUp(r);
          const isFail = (r.remarks || '').toUpperCase().includes('FAIL');
          const statusText = isFail ? 'FAIL' : 'ABSENT';
          return [
            String(idx + 1),
            r.schoolCode || r.rollCode || '51803',
            r.schoolName || 'H.S.S.\nBERUA',
            r.registrationNo || '---',
            r.studentName || '---',
            r.motherName || '---',
            r.fatherName || '---',
            r.dob && r.dob !== 'N/A' ? r.dob : '---',
            r.gender || 'FEMALE',
            statusText,
            m.milTheory !== '' ? m.milTheory : 'ABS',
            m.silTheory !== '' ? m.silTheory : 'ABS',
            m.matTheory !== '' ? m.matTheory : 'ABS',
            m.sciTheory !== '' ? m.sciTheory : 'ABS',
            m.sscTheory !== '' ? m.sscTheory : 'ABS',
            m.engTheory !== '' ? m.engTheory : 'ABS',
            m.optTheory !== '' ? m.optTheory : '---',
            m.vocTheory !== '' ? m.vocTheory : '---',
            m.sciPractical !== '' ? m.sciPractical : '---',
            m.sscLitAct !== '' ? m.sscLitAct : '---',
            m.sscPrWork !== '' ? m.sscPrWork : '---',
            m.optPractical !== '' ? m.optPractical : '---',
            m.vocPractical !== '' ? m.vocPractical : '---',
            m.aggregate !== '' ? m.aggregate : '---',
          ];
        })
      : [
          [
            { content: '1' },
            { content: schoolCode },
            { content: schoolName },
            {
              content: '<----------------- NIL ----------------->',
              colSpan: 21,
              styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 },
            },
          ],
        ];

  autoTable(doc, {
    startY: 27,
    margin: { top: 27, left: 8, right: 8, bottom: 14 },
    head: [
      [
        { content: 'SL\nNO.', rowSpan: 3 },
        { content: 'SCHOO\nL CODE', rowSpan: 3 },
        { content: 'SCHOOL\nNAME', rowSpan: 3 },
        { content: 'REG. NO.\n& YEAR', rowSpan: 3 },
        { content: "STUDENT'S\nNAME", rowSpan: 3 },
        { content: "MOTHER'S\nNAME", rowSpan: 3 },
        { content: "FATHER'S\nNAME", rowSpan: 3 },
        { content: 'DATE OF\nBIRTH', rowSpan: 3 },
        { content: 'GEN\nDER', rowSpan: 3 },
        { content: 'NON SENT-\nUP/ABSEN\nT', rowSpan: 3 },
        { content: 'MARKS OBTAINDE (THEORY)', colSpan: 8 },
        { content: 'MARKS OBTAINED (INTERNAL ASSEMENT & PRACTICAL)', colSpan: 5 },
        { content: 'AGGREGA-\nTATE', rowSpan: 3 },
      ],
      [
        { content: 'MIL' },
        { content: 'SIL' },
        { content: 'MAT' },
        { content: 'SCI' },
        { content: 'SSC' },
        { content: 'ENG' },
        { content: 'OPT-\nSUB' },
        { content: 'OPT-SUB\n(Vocatonal)' },
        { content: 'SCI', rowSpan: 2 },
        { content: 'SSC', colSpan: 2 },
        { content: 'OPT-\nSUB', rowSpan: 2 },
        { content: 'OPT-SUB\n(Vocatonal)', rowSpan: 2 },
      ],
      [
        { content: 'LIT. ACT' },
        { content: 'PR. WO' },
      ],
      [
        '1',
        '2',
        '3',
        '4',
        '5',
        '7',
        '6',
        '8',
        '9',
        '10',
        '11',
        '12',
        '13',
        '14',
        '15',
        '16',
        '17',
        '18',
        '19',
        '20',
        '21',
        '22',
        '23',
        '24',
      ],
    ],
    body: bodyRows as never,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 5.6,
      cellPadding: 1,
      valign: 'middle',
      halign: 'center',
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 5.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 6.5 },
      1: { cellWidth: 8, fontStyle: 'bold' },
      2: { cellWidth: 15, fontStyle: 'bold' },
      3: { cellWidth: 20, fontStyle: 'bold' },
      4: { cellWidth: 25, fontStyle: 'bold' },
      5: { cellWidth: 22 },
      6: { cellWidth: 24 },
      7: { cellWidth: 14, fontStyle: 'bold' },
      8: { cellWidth: 10, fontStyle: 'bold' },
      9: { cellWidth: 11, fontStyle: 'bold' },
      10: { cellWidth: 7.5, fontStyle: 'bold' },
      11: { cellWidth: 7.5, fontStyle: 'bold' },
      12: { cellWidth: 7.5, fontStyle: 'bold' },
      13: { cellWidth: 7.5, fontStyle: 'bold' },
      14: { cellWidth: 7.5, fontStyle: 'bold' },
      15: { cellWidth: 7.5, fontStyle: 'bold' },
      16: { cellWidth: 8.5 },
      17: { cellWidth: 9.5 },
      18: { cellWidth: 7.5, fontStyle: 'bold' },
      19: { cellWidth: 7.5, fontStyle: 'bold' },
      20: { cellWidth: 7.5, fontStyle: 'bold' },
      21: { cellWidth: 8.5 },
      22: { cellWidth: 9.5 },
      23: { cellWidth: 12, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const isSubjectHeader =
          (data.row.index === 1 &&
            data.column.index >= 10 &&
            data.column.index <= 22 &&
            data.column.index !== 19) ||
          data.row.index === 2 ||
          (data.row.index === 0 && (data.column.index === 9 || data.column.index === 23));
        if (isSubjectHeader) {
          const raw = data.cell.text.join('\n').trim();
          (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
          data.cell.text = [''];
          if (data.row.index === 1 || data.row.index === 2) {
            data.cell.styles.minCellHeight = 14;
          }
        }
      }
    },
    didDrawCell: (data) => {
      const rotatedText = (data.cell as unknown as { _rotated90Text?: string })._rotated90Text;
      if (rotatedText) {
        drawRotated90CellText(doc, rotatedText, data.cell, {
          fontSizePt: 5.6,
          bold: true,
        });
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawPageHeader();
      }
      const totalPages = doc.getNumberOfPages();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(`Page ${data.pageNumber} of ${totalPages}`, 148.5, 202, {
        align: 'center',
      });
      if (hindiFooter10Png) {
        try {
          doc.addImage(hindiFooter10Png, 'PNG', 200, 197.5, 85, 5);
        } catch {
          doc.text('विद्यालय प्रधान का हस्ताक्षर एवं मुहर', 287, 202, {
            align: 'right',
          });
        }
      } else {
        doc.text('विद्यालय प्रधान का हस्ताक्षर एवं मुहर', 287, 202, {
          align: 'right',
        });
      }
    },
  });

  const reportTitle = filenamePrefix.toLowerCase().includes('visually_impaired')
    ? '10th Visually Impaired Absent List'
    : '10th Absent / Non Sent-Up Students List';
  deliverGeneratedPdf(doc, `${filenamePrefix}.pdf`, reportTitle);
}

/**
 * Generates and downloads the exact 24-Column BSEB Matric Absent / Non Sent-Up Students PDF
 * (Matches Non_Sent-up_Students_e7fed56b.pdf)
 */
export function exportAbsent10thPdf(
  records: AdmitCardRecord[],
  filenamePrefix?: string,
  options: { annualYear?: string; sentUpYear?: string } = {}
): void {
  const { annualYear = '2027', sentUpYear = '2026' } = options;
  const prefix = filenamePrefix || `10th_Absent_Students_Exam-${sentUpYear}_Annual-${annualYear}`;
  const absentRecords = records.filter((r) => isMatricAbsentOrNonSentUp(r));

  generate10th24ColPdf(absentRecords, {
    bannerTitleHindi: `(iii) उत्प्रेषित (Sent-up)/जाँच परीक्षा, ${sentUpYear} में अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) परीक्षार्थियों के लिए विहित प्रपत्र :-`,
    englishFallback: `(iii) Format for Absent / Non Sent-Up Candidates in Sent-up Exam ${sentUpYear} :-`,
    filenamePrefix: prefix,
    annualYear,
    sentUpYear,
  });
}

/**
 * Generates and downloads the exact 23-Column BSEB Matric Visually Impaired Sent-Up Students PDF
 * (Matches Visually_Impaired_Sent-up_2382274f.pdf)
 */
export function exportVisuallyImpairedSentUp10thPdf(
  records: AdmitCardRecord[],
  filenamePrefix?: string,
  options: { annualYear?: string; sentUpYear?: string } = {}
): void {
  const { annualYear = '2027', sentUpYear = '2026' } = options;
  const prefix =
    filenamePrefix || `10th_Visually_Impaired_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`;
  const viSentUp = records.filter(
    (r) => isMatricVisuallyImpaired(r) && !isMatricAbsentOrNonSentUp(r)
  );

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const schoolCode = records[0]?.schoolCode || records[0]?.rollCode || '51803';
  const schoolName = records[0]?.schoolName || 'H.S.S. BERUA';

  const hindiBanner1Png = renderUnicodeTextToPngDataUrl(
    `-: वार्षिक माध्यमिक परीक्षा, ${annualYear} में सम्मिलित होने वाले पंजीकृत नियमित एवं स्वतन्त्र कोटि के परीक्षार्थियों के उत्प्रेषण/जाँच परीक्षा, ${sentUpYear} का प्राप्तांक पंजी :-`,
    { widthPx: 2200, heightPx: 42, fontSizePx: 22, align: 'center', bold: true }
  );
  const hindiBanner2Png = renderUnicodeTextToPngDataUrl(
    '(ii) दृष्टिबाधित (Visually Impaired/Blind) उत्प्रेषित (Sent-up) छात्र/छात्राओं के लिए विहित प्रपत्र :-',
    { widthPx: 1600, heightPx: 40, fontSizePx: 22, align: 'left', bold: true }
  );
  const hindiFooter10Png = renderUnicodeTextToPngDataUrl('विद्यालय प्रधान का हस्ताक्षर व मुहर', {
    widthPx: 800,
    heightPx: 40,
    fontSizePx: 22,
    align: 'right',
    bold: true,
  });

  const drawPageHeader = () => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(8, 7, 281, 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('BIHAR SCHOOL EXAMINATION BOARD, PATNA', 148.5, 11.2, { align: 'center' });
    doc.setFontSize(8.5);
    doc.text(`SENT-UP/TEST EXAM.-${sentUpYear}`, 148.5, 15.5, { align: 'center' });

    doc.rect(8, 17, 281, 5);
    if (hindiBanner1Png) {
      try {
        doc.addImage(hindiBanner1Png, 'PNG', 12, 17.4, 273, 4.2);
      } catch {
        doc.setFontSize(7.5);
        doc.text(
          `Annual Secondary Examination ${annualYear} - Sent-Up / Test Examination ${sentUpYear} Marks Register`,
          148.5,
          20.6,
          { align: 'center' }
        );
      }
    }

    doc.rect(8, 22, 281, 5);
    if (hindiBanner2Png) {
      try {
        doc.addImage(hindiBanner2Png, 'PNG', 9, 22.4, 160, 4.2);
      } catch {
        doc.setFontSize(7.5);
        doc.text('(ii) Prescribed Format for Visually Impaired Sent-Up Candidates :-', 11, 25.5);
      }
    }
  };

  drawPageHeader();

  const bodyRows =
    viSentUp.length > 0
      ? viSentUp.map((r, idx) => {
          const m = getEffectiveMatricSentUp(r);
          return [
            String(idx + 1),
            r.schoolCode || r.rollCode || '51803',
            r.schoolName || 'H.S.S.\nBERUA',
            r.registrationNo || '---',
            r.studentName || '---',
            r.motherName || '---',
            r.fatherName || '---',
            r.dob && r.dob !== 'N/A' ? r.dob : '---',
            r.gender || 'FEMALE',
            m.milTheory !== '' ? m.milTheory : '---',
            m.silTheory !== '' ? m.silTheory : '---',
            m.matTheory !== '' ? m.matTheory : '---',
            m.sciTheory !== '' ? m.sciTheory : '---',
            m.sscTheory !== '' ? m.sscTheory : '---',
            m.engTheory !== '' ? m.engTheory : '---',
            m.optTheory !== '' ? m.optTheory : '---',
            m.vocTheory !== '' ? m.vocTheory : '---',
            m.sciPractical !== '' ? m.sciPractical : '---',
            m.sscLitAct !== '' ? m.sscLitAct : '---',
            m.sscPrWork !== '' ? m.sscPrWork : '---',
            m.optPractical !== '' ? m.optPractical : '---',
            m.vocPractical !== '' ? m.vocPractical : '---',
            m.aggregate !== '' ? m.aggregate : '---',
          ];
        })
      : [
          [
            { content: '1' },
            { content: schoolCode },
            { content: schoolName },
            {
              content: '<----------------- NIL ----------------->',
              colSpan: 20,
              styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 },
            },
          ],
        ];

  autoTable(doc, {
    startY: 27,
    margin: { top: 27, left: 8, right: 8, bottom: 14 },
    head: [
      [
        { content: 'SL.\nNO.', rowSpan: 3 },
        { content: 'SCHOO\nL CODE', rowSpan: 3 },
        { content: 'SCHOOL\nNAME', rowSpan: 3 },
        { content: 'REG. NO.\n& YEAR', rowSpan: 3 },
        { content: "STUDENT'S\nNAME", rowSpan: 3 },
        { content: "MOTHER'S\nNAME", rowSpan: 3 },
        { content: "FATHER'S\nNAME", rowSpan: 3 },
        { content: 'DATE OF\nBIRTH', rowSpan: 3 },
        { content: 'GEN\nDER', rowSpan: 3 },
        { content: 'MARKS OBTAINDE (THEORY)', colSpan: 8 },
        { content: 'MARKS OBTAINED (INTERNAL ASSEMENT & PRACTICAL)', colSpan: 5 },
        { content: 'AGGREGA-\nTATE', rowSpan: 3 },
      ],
      [
        { content: 'MIL' },
        { content: 'SIL' },
        { content: 'MAT' },
        { content: 'SCI' },
        { content: 'SSC' },
        { content: 'ENG' },
        { content: 'OPT-\nSUB' },
        { content: 'OPT-SUB\n(Vocatonal)' },
        { content: 'SCI', rowSpan: 2 },
        { content: 'SSC', colSpan: 2 },
        { content: 'OPT-\nSUB', rowSpan: 2 },
        { content: 'OPT-SUB\n(Vocatonal)', rowSpan: 2 },
      ],
      [
        { content: 'LIT. ACT' },
        { content: 'PR. WO' },
      ],
      [
        '1',
        '2',
        '3',
        '4',
        '5',
        '7',
        '6',
        '8',
        '9',
        '10',
        '11',
        '12',
        '13',
        '14',
        '15',
        '16',
        '17',
        '18',
        '19',
        '20',
        '21',
        '22',
        '23',
      ],
    ],
    body: bodyRows as never,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 5.8,
      cellPadding: 1.1,
      valign: 'middle',
      halign: 'center',
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 5.6,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 6.5 },
      1: { cellWidth: 8.5, fontStyle: 'bold' },
      2: { cellWidth: 16, fontStyle: 'bold' },
      3: { cellWidth: 22, fontStyle: 'bold' },
      4: { cellWidth: 27, fontStyle: 'bold' },
      5: { cellWidth: 24 },
      6: { cellWidth: 26 },
      7: { cellWidth: 15, fontStyle: 'bold' },
      8: { cellWidth: 11, fontStyle: 'bold' },
      9: { cellWidth: 8, fontStyle: 'bold' },
      10: { cellWidth: 8, fontStyle: 'bold' },
      11: { cellWidth: 8, fontStyle: 'bold' },
      12: { cellWidth: 8, fontStyle: 'bold' },
      13: { cellWidth: 8, fontStyle: 'bold' },
      14: { cellWidth: 8, fontStyle: 'bold' },
      15: { cellWidth: 9 },
      16: { cellWidth: 10 },
      17: { cellWidth: 8, fontStyle: 'bold' },
      18: { cellWidth: 8.5, fontStyle: 'bold' },
      19: { cellWidth: 8.5, fontStyle: 'bold' },
      20: { cellWidth: 9 },
      21: { cellWidth: 10 },
      22: { cellWidth: 13.5, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const isSubjectHeader =
          (data.row.index === 1 &&
            data.column.index >= 9 &&
            data.column.index <= 21 &&
            data.column.index !== 18) ||
          data.row.index === 2 ||
          (data.row.index === 0 && data.column.index === 22);
        if (isSubjectHeader) {
          const raw = data.cell.text.join('\n').trim();
          (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
          data.cell.text = [''];
          if (data.row.index === 1 || data.row.index === 2) {
            data.cell.styles.minCellHeight = 14;
          }
        }
      }
    },
    didDrawCell: (data) => {
      const rotatedText = (data.cell as unknown as { _rotated90Text?: string })._rotated90Text;
      if (rotatedText) {
        drawRotated90CellText(doc, rotatedText, data.cell, {
          fontSizePt: 5.8,
          bold: true,
        });
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawPageHeader();
      }
      const totalPages = doc.getNumberOfPages();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(`Page ${data.pageNumber} of ${totalPages}`, 148.5, 202, {
        align: 'center',
      });
      if (hindiFooter10Png) {
        try {
          doc.addImage(hindiFooter10Png, 'PNG', 195, 197.5, 92, 5.5);
        } catch {
          doc.text('विद्यालय प्रधान का हस्ताक्षर व मुहर', 287, 202, {
            align: 'right',
          });
        }
      } else {
        doc.text('विद्यालय प्रधान का हस्ताक्षर व मुहर', 287, 202, {
          align: 'right',
        });
      }
    },
  });

  deliverGeneratedPdf(
    doc,
    `${prefix}.pdf`,
    '10th Visually Impaired Sent-Up Panji'
  );
}

/**
 * Generates and downloads the exact 24-Column BSEB Matric Visually Impaired Absent Students PDF
 * (Matches Visually_Impaired_Non_Sent-up_388ee456.pdf)
 */
export function exportVisuallyImpairedAbsent10thPdf(
  records: AdmitCardRecord[],
  filenamePrefix?: string,
  options: { annualYear?: string; sentUpYear?: string } = {}
): void {
  const { annualYear = '2027', sentUpYear = '2026' } = options;
  const prefix =
    filenamePrefix ||
    `10th_Visually_Impaired_Non_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`;
  const viAbsent = records.filter(
    (r) => isMatricVisuallyImpaired(r) && isMatricAbsentOrNonSentUp(r)
  );

  generate10th24ColPdf(viAbsent, {
    bannerTitleHindi:
      '(iii) दृष्टिबाधित (Visually Impaired/Blind) अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) परीक्षार्थियों के लिए विहित प्रपत्र :-',
    englishFallback:
      '(iii) Format for Visually Impaired Absent/Non Sent-Up Candidates :-',
    filenamePrefix: prefix,
    annualYear,
    sentUpYear,
  });
}

/**
 * Generates and downloads a print-ready Landscape A4 PDF Report.
 * Dispatches to 12th Sent-Up 30-Col PDF, 10th Sent-Up 23-Col PDF, Vocational PDF, or Absent PDF.
 */
export function exportToPdfReport(
  records: AdmitCardRecord[],
  includePhotos = true,
  filenamePrefix = 'BSEB_AdmitCard_Register',
  mode?: ExportFormatMode
): void {
  if (records.length === 0) return;

  if (mode === 'BSEB_12TH_SENTUP') {
    exportSentUp12thPdf(records, '12th_Sent-Up_Exam.-2026_Annual-2027');
    return;
  }
  if (mode === 'BSEB_10TH_SENTUP') {
    exportSentUp10thPdf(records, '10th_Sent-Up_Exam.-2026_BSEB');
    return;
  }
  if (mode === 'BSEB_10TH_ABSENT') {
    exportAbsent10thPdf(records);
    return;
  }
  if (mode === 'BSEB_10TH_VISUALLY_IMPAIRED') {
    exportVisuallyImpairedSentUp10thPdf(records);
    return;
  }
  if (mode === 'BSEB_10TH_VISUALLY_IMPAIRED_ABSENT') {
    exportVisuallyImpairedAbsent10thPdf(records);
    return;
  }
  if (mode === 'BSEB_12TH_VOCATIONAL') {
    exportVocational12thPdf(records);
    return;
  }
  if (mode === 'BSEB_12TH_ABSENT') {
    exportAbsent12thPdf(records);
    return;
  }

  // If no photos exist (manual entry), automatically use the official Sent-Up format!
  const hasAnyPhotos = records.some((r) => Boolean(r.photoDataUrl));
  if (!hasAnyPhotos) {
    const isMostlyMatric =
      records.filter((r) => r.examType === 'MATRIC (10th)').length > records.length / 2;
    if (isMostlyMatric) {
      exportSentUp10thPdf(records, '10th_Sent-Up_Exam.-2026_BSEB');
      return;
    } else {
      exportSentUp12thPdf(records, '12th_Sent-Up_Exam.-2026_Annual-2027');
      return;
    }
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const stats = computeSummaryStats(records);
  const primarySchool = Object.keys(stats.bySchool)[0] || 'BIHAR SCHOOL EXAMINATION BOARD';
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  doc.setFillColor(24, 38, 79);
  doc.rect(10, 8, 277, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(
    'BIHAR SCHOOL EXAMINATION BOARD - ADMIT CARD & MARKS VERIFICATION REGISTER',
    14,
    15
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Institution: ${primarySchool}   |   Total Students: ${stats.totalStudents} (Male: ${stats.maleCount}, Female: ${stats.femaleCount})   |   Date: ${dateStr}`,
    14,
    22
  );

  const tableRows = records.map((r, index) => {
    const marksSummary = calculateStudentMarksSummary(r);
    const marksColText =
      marksSummary.enteredCount > 0
        ? `Total: ${marksSummary.totalMarks}/${marksSummary.maxMarks}\n${marksSummary.percentage}\n${marksSummary.division}`
        : 'Not Entered';

    return [
      String(index + 1),
      r.bsebUniqueId || '-',
      `${r.studentName}\nF: ${r.fatherName}\nM: ${r.motherName}`,
      `Reg: ${r.registrationNo}\nRoll: ${r.rollCode}-${r.rollNumber}\nDOB: ${r.dob} (${r.gender})`,
      r.langSubject1 || '---',
      r.langSubject2 || '---',
      r.compulsorySubject1 || '---',
      r.compulsorySubject2 || '---',
      r.compulsorySubject3 || '---',
      r.additionalSubject && r.additionalSubject !== 'N/A' ? r.additionalSubject : '---',
      marksColText,
      includePhotos ? '' : `${r.sourceFileName} (p.${r.sourcePageNumber})`,
    ];
  });

  const ROTATED_SUBJ_COLS = new Set([4, 5, 6, 7, 8, 9]);

  autoTable(doc, {
    startY: 29,
    margin: { left: 10, right: 10, bottom: 16 },
    head: [
      [
        '#',
        'BSEB Unique ID',
        'Student & Parents Name',
        'Reg. No / Roll / DOB',
        'Sub-1 (Lang 1)',
        'Sub-2 (Lang 2)',
        'Elective / Sub 1',
        'Elective / Sub 2',
        'Elective / Sub 3',
        'Add. Subject',
        'Total / Division',
        includePhotos ? 'Photo / Sign' : 'Source Page',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.5,
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      minCellHeight: includePhotos ? 19 : 16,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 24, fontStyle: 'bold' },
      2: { cellWidth: 50 },
      3: { cellWidth: 42 },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 18, halign: 'center' },
      9: { cellWidth: 16, halign: 'center' },
      10: { cellWidth: 25, fontStyle: 'bold', halign: 'center' },
      11: { cellWidth: 26, halign: 'center' },
    },
    didParseCell: (data) => {
      if (ROTATED_SUBJ_COLS.has(data.column.index)) {
        const raw = data.cell.text.join('\n').trim();
        (data.cell as unknown as { _rotated90Text?: string })._rotated90Text = raw;
        data.cell.text = [''];
        if (data.section === 'head') {
          data.cell.styles.minCellHeight = 16;
        }
      }
    },
    didDrawCell: (data) => {
      const rotatedText = (data.cell as unknown as { _rotated90Text?: string })._rotated90Text;
      if (rotatedText) {
        if (data.section === 'head') {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(255, 255, 255);
          const textW = doc.getTextWidth(rotatedText);
          const startY = data.cell.y + (data.cell.height + textW) / 2;
          const startX = data.cell.x + data.cell.width / 2 + 0.8;
          doc.text(rotatedText, startX, startY, { angle: 90 });
        } else {
          drawRotated90CellText(doc, rotatedText, data.cell, {
            fontSizePt: 6,
            bold: true,
          });
        }
      }

      if (includePhotos && data.section === 'body' && data.column.index === 11) {
        const rec = records[data.row.index];
        if (rec?.photoDataUrl) {
          try {
            doc.addImage(
              rec.photoDataUrl,
              'JPEG',
              data.cell.x + 2,
              data.cell.y + 1.5,
              11,
              13.5
            );
          } catch {
            // Ignore image embed failure
          }
        }
        if (rec?.signatureDataUrl) {
          try {
            doc.addImage(
              rec.signatureDataUrl,
              'JPEG',
              data.cell.x + 13.5,
              data.cell.y + 5,
              10.5,
              6
            );
          } catch {
            // Ignore signature embed failure
          }
        }
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}   |   Principal / Headmaster Signature & Seal: ___________________________`,
        10,
        203
      );
    },
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  deliverGeneratedPdf(
    doc,
    `${filenamePrefix}_${records.length}_Students_${dateStamp}.pdf`,
    'BSEB Admit Card Register Report'
  );
}

export interface AttendanceSheetConfig {
  examTitle: string;
  examDate: string; // YYYY-MM-DD
  sitting: string;
  classLabel: string;
  facultyLabel: string;
  subjectLabel: string;
  schoolCode: string;
  schoolName: string;
  roomNo?: string;
  includePhoto: boolean;
  studentsPerPage?: number; // 0 = continuous
}

function formatIsoDateForSheet(isoDate: string): string {
  if (!isoDate) return '____/____/______';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = Number.isNaN(dt.getTime()) ? '' : ` (${dayNames[dt.getDay()]})`;
  return `${d}/${m}/${y}${dayName}`;
}

function sanitizeFileSegment(raw: string): string {
  return (raw || 'All')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Sheet';
}

/**
 * Generates an official A4 Portrait BSEB Subject, Date & Class-wise Exam Attendance Sheet PDF.
 */
export function exportAttendanceSheetPdf(
  students: AdmitCardRecord[],
  config: AttendanceSheetConfig
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const marginX = 10;
  const contentW = pageWidth - marginX * 2;
  const formattedDate = formatIsoDateForSheet(config.examDate);
  const perPage = config.studentsPerPage && config.studentsPerPage > 0 ? config.studentsPerPage : 0;

  const chunks: Array<{ startIdx: number; rows: AdmitCardRecord[] }> = [];
  if (perPage > 0 && students.length > 0) {
    for (let i = 0; i < students.length; i += perPage) {
      chunks.push({ startIdx: i, rows: students.slice(i, i + perPage) });
    }
  } else {
    chunks.push({ startIdx: 0, rows: students });
  }

  chunks.forEach((chunk, chunkIdx) => {
    if (chunkIdx > 0) {
      doc.addPage();
    }

    const drawHeader = (batchIndex: number, totalBatches: number) => {
      // Top Bordered Official Header
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.35);
      doc.rect(marginX, 8, contentW, 18);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('BIHAR SCHOOL EXAMINATION BOARD, PATNA', pageWidth / 2, 13.5, { align: 'center' });

      doc.setFontSize(9.5);
      doc.text(
        (config.examTitle || 'SENT-UP / TEST EXAMINATION').toUpperCase(),
        pageWidth / 2,
        18.5,
        { align: 'center' }
      );

      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      const batchSuffix =
        totalBatches > 1 ? `  |  SHEET ${batchIndex + 1} OF ${totalBatches}` : '';
      doc.text(`EXAMINATION ATTENDANCE SHEET${batchSuffix}`, pageWidth / 2, 23.5, {
        align: 'center',
      });

      // Metadata Grid Box
      const metaY = 27.5;
      const rowH = 6.5;
      doc.setLineWidth(0.25);
      doc.rect(marginX, metaY, contentW, rowH * 3);
      doc.line(marginX, metaY + rowH, marginX + contentW, metaY + rowH);
      doc.line(marginX, metaY + rowH * 2, marginX + contentW, metaY + rowH * 2);
      const midX = marginX + contentW * 0.56;
      doc.line(midX, metaY, midX, metaY + rowH * 3);

      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);

      // Row 1
      doc.setFont('helvetica', 'bold');
      doc.text('School:', marginX + 2, metaY + 4.4);
      doc.setFont('helvetica', 'normal');
      const schoolDisplay = `${config.schoolCode ? `[${config.schoolCode}] ` : ''}${config.schoolName || 'All Schools'}`;
      doc.text(schoolDisplay.slice(0, 50), marginX + 15, metaY + 4.4);

      doc.setFont('helvetica', 'bold');
      doc.text('Exam Date:', midX + 2, metaY + 4.4);
      doc.setFont('helvetica', 'normal');
      doc.text(formattedDate, midX + 20, metaY + 4.4);

      // Row 2
      doc.setFont('helvetica', 'bold');
      doc.text('Class & Stream:', marginX + 2, metaY + rowH + 4.4);
      doc.setFont('helvetica', 'normal');
      doc.text(`${config.classLabel}  |  ${config.facultyLabel}`, marginX + 26, metaY + rowH + 4.4);

      doc.setFont('helvetica', 'bold');
      doc.text('Sitting:', midX + 2, metaY + rowH + 4.4);
      doc.setFont('helvetica', 'normal');
      doc.text((config.sitting || '1st Sitting').slice(0, 32), midX + 15, metaY + rowH + 4.4);

      // Row 3
      doc.setFont('helvetica', 'bold');
      doc.text('Subject:', marginX + 2, metaY + rowH * 2 + 4.4);
      doc.setFont('helvetica', 'bold');
      doc.text((config.subjectLabel || 'All Subjects').slice(0, 48), marginX + 16, metaY + rowH * 2 + 4.4);

      doc.setFont('helvetica', 'bold');
      doc.text('Room / Count:', midX + 2, metaY + rowH * 2 + 4.4);
      doc.setFont('helvetica', 'normal');
      const roomPart = config.roomNo?.trim() ? `Room ${config.roomNo.trim()}  |  ` : '';
      doc.text(
        `${roomPart}Candidates: ${chunk.rows.length}`,
        midX + 24,
        metaY + rowH * 2 + 4.4
      );
    };

    drawHeader(chunkIdx, chunks.length);

    const headRow = config.includePhoto
      ? [
          'Sl.',
          'Photo',
          'Roll Code / Roll No.\n& Reg. No.',
          'BSEB\nUnique ID',
          "Student's Name &\nFather's Name",
          'Copy / OMR\nSl. No.',
          'P / A',
          "Candidate's\nSignature",
        ]
      : [
          'Sl.',
          'Roll Code / Roll No.\n& Reg. No.',
          'BSEB\nUnique ID',
          "Student's Name &\nFather's Name",
          'Copy / OMR\nSl. No.',
          'P / A',
          "Candidate's\nSignature",
        ];

    const bodyRows = chunk.rows.map((rec, localIdx) => {
      const globalSl = chunk.startIdx + localIdx + 1;
      const rollLine =
        rec.rollCode || rec.rollNumber
          ? `${rec.rollCode || '-'} / ${rec.rollNumber || '-'}`
          : '---';
      const regLine = rec.registrationNo || '---';
      const nameBlock = `${rec.studentName || '---'}\nF: ${rec.fatherName || '---'}`;

      if (config.includePhoto) {
        return [
          String(globalSl),
          '',
          `${rollLine}\n${regLine}`,
          rec.bsebUniqueId || '---',
          nameBlock,
          '',
          '',
          '',
        ];
      }
      return [
        String(globalSl),
        `${rollLine}\n${regLine}`,
        rec.bsebUniqueId || '---',
        nameBlock,
        '',
        '',
        '',
      ];
    });

    const columnStyles: Record<number, Record<string, unknown>> = config.includePhoto
      ? {
          0: { cellWidth: 9, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 14, halign: 'center' },
          2: { cellWidth: 33, fontSize: 6.8 },
          3: { cellWidth: 22, halign: 'center', fontSize: 6.8 },
          4: { cellWidth: 46, fontSize: 7.2 },
          5: { cellWidth: 23, halign: 'center' },
          6: { cellWidth: 11, halign: 'center' },
          7: { cellWidth: 32, halign: 'center' },
        }
      : {
          0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 36, fontSize: 7 },
          2: { cellWidth: 25, halign: 'center', fontSize: 7 },
          3: { cellWidth: 51, fontSize: 7.4 },
          4: { cellWidth: 24, halign: 'center' },
          5: { cellWidth: 12, halign: 'center' },
          6: { cellWidth: 32, halign: 'center' },
        };

    autoTable(doc, {
      startY: 49,
      margin: { left: marginX, right: marginX, top: 14, bottom: 26 },
      head: [headRow],
      body: bodyRows,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        cellPadding: 1.5,
        valign: 'middle',
        textColor: [15, 23, 42],
        lineColor: [30, 41, 59],
        lineWidth: 0.2,
        minCellHeight: config.includePhoto ? 13.5 : 10,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.2,
        halign: 'center',
        lineColor: [15, 23, 42],
        lineWidth: 0.25,
      },
      columnStyles,
      didDrawCell: (data) => {
        if (config.includePhoto && data.section === 'body' && data.column.index === 1) {
          const rec = chunk.rows[data.row.index];
          if (rec?.photoDataUrl) {
            try {
              const imgW = 9.5;
              const imgH = 11.2;
              const x = data.cell.x + (data.cell.width - imgW) / 2;
              const y = data.cell.y + (data.cell.height - imgH) / 2;
              doc.addImage(rec.photoDataUrl, 'JPEG', x, y, imgW, imgH);
            } catch {
              // Ignore broken image embed
            }
          }
        }
      },
    });

    // Draw Summary & Signature Footer after this chunk's table
    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 240;
    let footerY = finalY + 5;
    if (footerY > 266) {
      doc.addPage();
      footerY = 18;
    }

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.25);
    doc.rect(marginX, footerY, contentW, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`Total Allotted: ${chunk.rows.length}`, marginX + 4, footerY + 5.3);
    doc.text('Total Present: ______________', marginX + 62, footerY + 5.3);
    doc.text('Total Absent: ______________', marginX + 130, footerY + 5.3);

    const signY = footerY + 21;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.line(marginX + 2, signY - 4, marginX + 66, signY - 4);
    doc.text('Signature of Invigilator (with Date)', marginX + 34, signY, { align: 'center' });

    doc.line(pageWidth - marginX - 72, signY - 4, pageWidth - marginX - 2, signY - 4);
    doc.text('Centre Superintendent / Principal Signature & Seal', pageWidth - marginX - 37, signY, {
      align: 'center',
    });
  });

  // Page numbering footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Attendance Sheet  |  ${config.classLabel}  |  ${config.subjectLabel}  |  Date: ${formattedDate}`,
      marginX,
      292
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, 292, { align: 'right' });
  }

  const classSlug = sanitizeFileSegment(config.classLabel.includes('10') ? '10th' : '12th');
  const subjSlug = sanitizeFileSegment(config.subjectLabel);
  const dateSlug = config.examDate || new Date().toISOString().slice(0, 10);
  deliverGeneratedPdf(
    doc,
    `Attendance_${classSlug}_${subjSlug}_${dateSlug}.pdf`,
    `Attendance Sheet — ${config.subjectLabel}`
  );
}

/**
 * Generates and downloads a formatted Excel (.xlsx) Attendance Sheet for the selected Class, Subject & Date.
 */
export function exportAttendanceSheetExcel(
  students: AdmitCardRecord[],
  config: AttendanceSheetConfig
): void {
  const formattedDate = formatIsoDateForSheet(config.examDate);
  const schoolDisplay = `${config.schoolCode ? `[${config.schoolCode}] ` : ''}${config.schoolName || 'All Schools'}`;

  const aoa: Array<Array<string | number>> = [
    ['BIHAR SCHOOL EXAMINATION BOARD, PATNA'],
    [`${(config.examTitle || 'SENT-UP / TEST EXAMINATION').toUpperCase()} — ATTENDANCE SHEET`],
    [
      `School: ${schoolDisplay}`,
      '',
      '',
      '',
      `Exam Date: ${formattedDate}`,
      '',
      '',
      '',
    ],
    [
      `Class: ${config.classLabel} (${config.facultyLabel})`,
      '',
      '',
      '',
      `Sitting: ${config.sitting}`,
      '',
      '',
      '',
    ],
    [
      `Subject: ${config.subjectLabel}`,
      '',
      '',
      '',
      `Room / Hall: ${config.roomNo?.trim() || '_______'}   |   Total Allotted: ${students.length}`,
      '',
      '',
      '',
    ],
    [
      'SL. NO.',
      'ROLL CODE / ROLL NO.',
      'REGISTRATION NO.',
      'BSEB UNIQUE ID',
      "STUDENT'S NAME",
      "FATHER'S NAME",
      'COPY / OMR SL. NO.',
      'P / A',
      "CANDIDATE'S SIGNATURE",
    ],
  ];

  students.forEach((rec, idx) => {
    const rollInfo =
      rec.rollCode || rec.rollNumber
        ? `${rec.rollCode || '-'} / ${rec.rollNumber || '-'}`
        : '---';
    aoa.push([
      idx + 1,
      rollInfo,
      rec.registrationNo || '---',
      rec.bsebUniqueId || '---',
      rec.studentName || '---',
      rec.fatherName || '---',
      '',
      '',
      '',
    ]);
  });

  aoa.push([]);
  aoa.push([
    `Total Allotted: ${students.length}`,
    '',
    '',
    'Total Present: ___________',
    '',
    '',
    'Total Absent: ___________',
    '',
    '',
  ]);
  aoa.push([]);
  aoa.push([
    'Invigilator Signature & Date: _______________________',
    '',
    '',
    '',
    '',
    'Principal / Centre Supt. Signature & Seal: _______________________',
    '',
    '',
    '',
  ]);

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
  const summaryRowIdx = 6 + students.length + 1;
  const signRowIdx = summaryRowIdx + 2;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
    { s: { r: 2, c: 4 }, e: { r: 2, c: 8 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 8 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 3 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 8 } },
    { s: { r: summaryRowIdx, c: 0 }, e: { r: summaryRowIdx, c: 2 } },
    { s: { r: summaryRowIdx, c: 3 }, e: { r: summaryRowIdx, c: 5 } },
    { s: { r: summaryRowIdx, c: 6 }, e: { r: summaryRowIdx, c: 8 } },
    { s: { r: signRowIdx, c: 0 }, e: { r: signRowIdx, c: 4 } },
    { s: { r: signRowIdx, c: 5 }, e: { r: signRowIdx, c: 8 } },
  ];

  ws['!cols'] = [
    { wch: 7 },
    { wch: 18 },
    { wch: 20 },
    { wch: 17 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
    { wch: 8 },
    { wch: 24 },
  ];

  ws['!rows'] = [
    { hpt: 22 },
    { hpt: 20 },
    { hpt: 18 },
    { hpt: 18 },
    { hpt: 18 },
    { hpt: 26 },
    ...students.map(() => ({ hpt: 26 })),
  ];

  const lastDataRow = 5 + students.length;
  for (let r = 0; r <= signRowIdx; r++) {
    for (let c = 0; c <= 8; c++) {
      const addr = XLSXStyle.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };

      if (r === 0 || r === 1) {
        ws[addr].s = {
          font: { name: 'Arial', sz: r === 0 ? 13 : 11, bold: true, color: { rgb: '0F172A' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      } else if (r >= 2 && r <= 4) {
        ws[addr].s = {
          font: { name: 'Arial', sz: 10, bold: r === 4 && c < 4, color: { rgb: '0F172A' } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: BORDER_THIN_BLACK,
        };
      } else if (r === 5) {
        ws[addr].s = {
          font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: 'F1F5F9' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: BORDER_THIN_BLACK,
        };
      } else if (r >= 6 && r <= lastDataRow) {
        ws[addr].s = {
          font: { name: 'Arial', sz: 9.5, bold: c === 0 || c === 4, color: { rgb: '0F172A' } },
          alignment: {
            horizontal: c === 4 || c === 5 ? 'left' : 'center',
            vertical: 'center',
            wrapText: true,
          },
          border: BORDER_THIN_BLACK,
        };
      } else if (r === summaryRowIdx || r === signRowIdx) {
        ws[addr].s = {
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '0F172A' } },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      }
    }
  }

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Attendance_Sheet');
  const classSlug = sanitizeFileSegment(config.classLabel.includes('10') ? '10th' : '12th');
  const subjSlug = sanitizeFileSegment(config.subjectLabel);
  const dateSlug = config.examDate || new Date().toISOString().slice(0, 10);
  XLSXStyle.writeFile(wb, `Attendance_${classSlug}_${subjSlug}_${dateSlug}.xlsx`);
}

