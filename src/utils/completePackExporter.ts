import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { AdmitCardRecord } from '../types/admitCard';
import {
  exportAbsent10thExcel,
  exportAbsent10thPdf,
  exportAbsent12thExcel,
  exportAbsent12thPdf,
  exportAttendanceSheetExcel,
  exportAttendanceSheetPdf,
  exportSentUp10thPdf,
  exportSentUp12thPdf,
  exportToExcel,
  exportToPdfReport,
  exportVisuallyImpairedAbsent10thExcel,
  exportVisuallyImpairedAbsent10thPdf,
  exportVisuallyImpairedSentUp10thExcel,
  exportVisuallyImpairedSentUp10thPdf,
  exportVocational12thExcel,
  exportVocational12thPdf,
  runWithWorkbookCapture,
  sort12thRecordsByFaculty,
} from './exportReports';
import { runWithPdfCapture } from './pdfPreviewBus';
import {
  LetterClassMode,
  SavedLetterProfile,
  compute10thLetterCounts,
  compute12thLetterCounts,
  loadSavedProfile,
  padTwoDigits,
} from './letterPadProfile';
import { normalizeSchoolCode } from './teacherSubjectMatcher';

export interface CompletePackOptions {
  classMode: LetterClassMode;
  records: AdmitCardRecord[];
  schoolCode?: string;
  schoolName?: string;
  onProgress?: (status: string) => void;
}

const FONT_HINDI = `'Noto Sans Devanagari', 'Mangal', 'Kohinoor Devanagari', sans-serif`;
const FONT_MONO = `'JetBrains Mono', monospace`;

function drawWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  firstLineIndent = 0
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let currentY = y;
  let isFirstLine = true;

  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    const allowedWidth = isFirstLine ? maxWidth - firstLineIndent : maxWidth;
    if (ctx.measureText(testLine).width > allowedWidth && line) {
      ctx.fillText(line, isFirstLine ? x + firstLineIndent : x, currentY);
      line = words[i];
      currentY += lineHeight;
      isFirstLine = false;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, isFirstLine ? x + firstLineIndent : x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

interface RichSegment {
  text: string;
  bold?: boolean;
}

function drawRichLine(
  ctx: CanvasRenderingContext2D,
  segments: RichSegment[],
  x: number,
  y: number,
  fontSizePx: number
): void {
  let cursorX = x;
  segments.forEach((seg) => {
    ctx.font = `${seg.bold ? '700' : '400'} ${fontSizePx}px ${FONT_HINDI}`;
    ctx.fillText(seg.text, cursorX, y);
    cursorX += ctx.measureText(seg.text).width;
  });
}

function canvasToA4PdfBytes(canvas: HTMLCanvasElement): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const dataUrl = canvas.toDataURL('image/png');
  doc.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  return new Uint8Array(doc.output('arraybuffer'));
}

async function renderLetterPadPdfBytes(params: {
  classMode: LetterClassMode;
  profile: SavedLetterProfile;
  records: AdmitCardRecord[];
  effectiveSchoolCode: string;
  withHeader: boolean;
}): Promise<Uint8Array> {
  const { classMode, profile, records, effectiveSchoolCode, withHeader } = params;
  const isInter = classMode === 'INTERMEDIATE';

  // High-DPI A4 portrait canvas (~192 DPI -> 1588 x 2246 px)
  const W = 1588;
  const H = 2246;
  const mmToPx = W / 210;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  const sidePad = Math.max(8, Math.min(28, profile.sideMarginMm || 16)) * mmToPx;
  const contentW = W - sidePad * 2;
  const isColor = profile.headerTheme === 'OFFICIAL_COLOR';

  let y = 0;

  if (!withHeader) {
    // Blank top margin for feeding physical pre-printed school letter pad
    y = Math.max(12, profile.topMarginMm || 42) * mmToPx + 36;
  } else {
    y = 14 * mmToPx;
    const primary = isColor ? '#881337' : '#000000';
    const secondary = isColor ? '#1e3a8a' : '#000000';

    // Top Strip: Email | Dept Line | Phone
    if (profile.headerDeptLine.trim() || profile.headerEmail.trim() || profile.headerPhone.trim()) {
      ctx.fillStyle = secondary;
      if (profile.headerEmail.trim()) {
        ctx.font = `600 22px ${FONT_MONO}`;
        ctx.textAlign = 'left';
        ctx.fillText(`Email: ${profile.headerEmail.trim()}`, sidePad, y);
      }
      if (profile.headerDeptLine.trim()) {
        ctx.font = `700 25px ${FONT_HINDI}`;
        ctx.textAlign = 'center';
        ctx.fillText(profile.headerDeptLine.trim(), W / 2, y);
      }
      if (profile.headerPhone.trim()) {
        ctx.font = `600 22px ${FONT_MONO}`;
        ctx.textAlign = 'right';
        ctx.fillText(`मो०: ${profile.headerPhone.trim()}`, W - sidePad, y);
      }
      y += 34;
    }

    // Main Header Row: Centered Official School Title (No Logo)
    ctx.textAlign = 'center';
    if (profile.headerOfficeLine.trim()) {
      ctx.fillStyle = secondary;
      ctx.font = `700 26px ${FONT_HINDI}`;
      ctx.fillText(profile.headerOfficeLine.trim(), W / 2, y + 26);
    }

    ctx.fillStyle = primary;
    ctx.font = `800 50px ${FONT_HINDI}`;
    ctx.fillText(profile.schoolNameHindi, W / 2, y + 84);

    ctx.fillStyle = secondary;
    ctx.font = `700 29px ${FONT_HINDI}`;
    ctx.fillText(profile.blockDistrictHindi, W / 2, y + 126);

    y += 156;

    // Codes Bar
    const codeParts: string[] = [];
    if (effectiveSchoolCode) {
      codeParts.push(`${isInter ? '+2 विद्यालय कोड' : 'विद्यालय कोड'} : ${effectiveSchoolCode}`);
    }
    if (profile.headerUdiseCode.trim()) {
      codeParts.push(`UDISE कोड : ${profile.headerUdiseCode.trim()}`);
    }
    if (profile.headerEstYear.trim()) {
      codeParts.push(`स्थापना वर्ष : ${profile.headerEstYear.trim()}`);
    }
    if (codeParts.length > 0) {
      ctx.fillStyle = '#000000';
      ctx.font = `600 24px ${FONT_HINDI}`;
      ctx.textAlign = 'center';
      ctx.fillText(codeParts.join('     |     '), W / 2, y);
      y += 22;
    }

    // Double Rule Divider
    ctx.fillStyle = primary;
    ctx.fillRect(sidePad, y, contentW, 5);
    ctx.fillStyle = secondary;
    ctx.fillRect(sidePad, y + 9, contentW, 2);
    y += 54;
  }

  // Main Letter Body
  ctx.fillStyle = '#000000';
  const bodyFont = 29;
  const lineH = 52;

  // Row 1: Patrank & Dinank
  ctx.font = `600 ${bodyFont}px ${FONT_HINDI}`;
  ctx.textAlign = 'left';
  ctx.fillText('पत्रांक :-  .............../', sidePad, y);
  ctx.textAlign = 'right';
  ctx.fillText(`दिनांक :-  ........../......../ ${profile.sentUpYear}`, W - sidePad, y);
  y += 74;

  // Preshak
  const colLabelW = 190;
  ctx.textAlign = 'left';
  ctx.font = `400 ${bodyFont}px ${FONT_HINDI}`;
  ctx.fillText('प्रेषक :-', sidePad, y);
  ctx.fillText(`${profile.designation},`, sidePad + colLabelW, y);
  y += 46;
  ctx.fillText(`${profile.schoolNameHindi},`, sidePad + colLabelW, y);
  y += 46;
  ctx.fillText(`${profile.blockDistrictHindi}।`, sidePad + colLabelW, y);
  y += 66;

  // Sewa Mein
  ctx.fillText('सेवा में,', sidePad, y);
  y += 48;
  ctx.fillText(`${profile.recipientTitle},`, sidePad + colLabelW, y);
  y += 46;
  ctx.fillText(`${profile.recipientDistrict}।`, sidePad + colLabelW, y);
  y += 66;

  // Subject
  ctx.fillText('विषय :-', sidePad, y);
  const subjectText = isInter
    ? `इन्टरमीडिएट वार्षिक परीक्षा, ${profile.annualYear} में सम्मिलित होने वाले परीक्षार्थियों के उत्प्रेषण (Sent-Up)/जाँच परीक्षा, ${profile.sentUpYear} का परीक्षाफल (हार्ड एवं सॉफ्ट कॉपी) का विहित प्रपत्र में आवश्यक कार्यार्थ प्रेषण।`
    : `वार्षिक माध्यमिक परीक्षा, ${profile.annualYear} में सम्मिलित होने वाले परीक्षार्थियों के उत्प्रेषण (Sent-Up)/जाँच परीक्षा, ${profile.sentUpYear} का परीक्षाफल (हार्ड एवं सॉफ्ट कॉपी) का विहित प्रपत्र में आवश्यक कार्यार्थ प्रेषण।`;
  y = drawWrappedLines(ctx, subjectText, sidePad + colLabelW, y, contentW - colLabelW, 48);
  y += 32;

  // Mahashay + Paragraph
  ctx.fillText('महाशय,', sidePad, y);
  y += 50;
  const bodyParagraph = isInter
    ? `उपर्युक्त विषयक प्रासंगिक पत्र के सम्बन्ध में अंकित करना है कि इन्टरमीडिएट वार्षिक परीक्षा, ${profile.annualYear} में सम्मिलित होने वाले पंजीकृत छात्र/छात्राओं का उत्प्रेषण (Sent-up)/जाँच परीक्षा दिनांक ${profile.examStartDate} से दिनांक ${profile.examEndDate} तक विद्यालय में संचालित की गई।`
    : `उपर्युक्त विषयक प्रासंगिक पत्र के सम्बन्ध में अंकित करना है कि वार्षिक माध्यमिक परीक्षा, ${profile.annualYear} में सम्मिलित होने वाले पंजीकृत छात्र/छात्राओं का उत्प्रेषण (Sent-up)/जाँच परीक्षा–${profile.sentUpYear} दिनांक ${profile.examStartDate} से दिनांक ${profile.examEndDate} तक विद्यालय में संचालित की गई।`;
  y = drawWrappedLines(ctx, bodyParagraph, sidePad, y, contentW, lineH, 128);
  y += 24;

  // Bold Underlined Lead-in
  const leadInText = 'परीक्षा में उपस्थित/अनुपस्थित नियमित/स्वतन्त्र छात्र–छात्राओं की विवरणी निम्नांकित है :-';
  ctx.font = `700 ${bodyFont}px ${FONT_HINDI}`;
  ctx.fillText(leadInText, sidePad, y);
  const leadW = ctx.measureText(leadInText).width;
  ctx.fillRect(sidePad, y + 6, Math.min(leadW, contentW), 2.5);
  y += 58;

  // Rows
  const colonX = W - sidePad - 175;
  const valueX = W - sidePad - 60;
  const rowFont = 27.5;
  const rowH = isInter ? 54 : 50;

  if (isInter) {
    const counts = compute12thLetterCounts(records);
    const rows: Array<{ num: string; segments: RichSegment[]; val: string }> = [
      {
        num: '1.',
        segments: [{ text: 'उत्प्रेषित (Sent-Up)/जाँच परीक्षा में उपस्थित नियमित छात्र–छात्राओं की संख्या' }],
        val: counts.presentRegular,
      },
      {
        num: '2.',
        segments: [{ text: 'व्यवसायिक पाठ्यक्रम के परीक्षार्थियों की संख्या' }],
        val: counts.vocational,
      },
      {
        num: '3.',
        segments: [{ text: 'अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) नियमित छात्र–छात्राओं की संख्या' }],
        val: counts.absentNonSentUp,
      },
      {
        num: '4.',
        segments: [{ text: 'दृष्टिबाधित (Visually Impaired/Blind) छात्र–छात्राओं की संख्या' }],
        val: counts.visuallyImpaired,
      },
      {
        num: '5.',
        segments: [{ text: 'स्वतन्त्र (Private) छात्र–छात्राओं की संख्या' }],
        val: counts.privateStudents,
      },
    ];

    rows.forEach((row) => {
      ctx.textAlign = 'left';
      ctx.font = `400 ${rowFont}px ${FONT_MONO}`;
      ctx.fillText(row.num, sidePad, y);
      drawRichLine(ctx, row.segments, sidePad + 54, y, rowFont);
      ctx.textAlign = 'center';
      ctx.font = `400 ${rowFont}px ${FONT_HINDI}`;
      ctx.fillText(':-', colonX, y);
      ctx.font = `700 ${rowFont}px ${FONT_MONO}`;
      ctx.fillText(row.val, valueX, y);
      y += rowH;
    });
  } else {
    const counts = compute10thLetterCounts(records);
    const rows: Array<{ num: string; segments: RichSegment[]; val: string }> = [
      {
        num: '1.',
        segments: [
          { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
          { text: 'उपस्थित नियमित', bold: true },
          { text: ' छात्र–छात्राओं की संख्या' },
        ],
        val: counts.presentRegular,
      },
      {
        num: '2.',
        segments: [
          { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
          { text: 'उपस्थित पूर्ववर्ती', bold: true },
          { text: ' छात्र–छात्राओं की संख्या' },
        ],
        val: counts.presentEx,
      },
      {
        num: '3.',
        segments: [
          { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
          { text: 'अनुपस्थित/अनुत्तीर्ण', bold: true },
          { text: ' छात्र–छात्राओं की संख्या' },
        ],
        val: counts.absentFail,
      },
      {
        num: '4.',
        segments: [
          { text: 'दृष्टिबाधित (Visually Impaired/Blind) ' },
          { text: 'उत्प्रेषित (Sent-Up)', bold: true },
          { text: ' छात्र–छात्राओं की संख्या' },
        ],
        val: counts.blindSentUp,
      },
      {
        num: '5.',
        segments: [
          { text: 'दृष्टिबाधित (Visually Impaired/Blind) ' },
          { text: 'अनुपस्थित/अनुत्तीर्ण', bold: true },
          { text: ' छात्र–छात्राओं की संख्या' },
        ],
        val: counts.blindAbsent,
      },
      {
        num: '6.',
        segments: [
          { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
          { text: 'उपस्थित स्वतन्त्र', bold: true },
          { text: ' (Private) छात्र–छात्राओं की संख्या' },
        ],
        val: counts.presentPrivate,
      },
    ];

    rows.forEach((row) => {
      ctx.textAlign = 'left';
      ctx.font = `400 ${rowFont}px ${FONT_MONO}`;
      ctx.fillText(row.num, sidePad, y);
      drawRichLine(ctx, row.segments, sidePad + 54, y, rowFont);
      ctx.textAlign = 'center';
      ctx.font = `400 ${rowFont}px ${FONT_HINDI}`;
      ctx.fillText(':-', colonX, y);
      ctx.font = `700 ${rowFont}px ${FONT_MONO}`;
      ctx.fillText(row.val, valueX, y);
      y += rowH;
    });
  }

  y += 32;

  // Closing Sentence
  ctx.textAlign = 'left';
  ctx.font = `400 ${bodyFont}px ${FONT_HINDI}`;
  y = drawWrappedLines(
    ctx,
    'अतः परीक्षोपरान्त विहित प्रपत्र में परीक्षाफल की हार्ड एवं सॉफ्ट कॉपी आवश्यक कार्यार्थ भवदीय को सादर समर्पित।',
    sidePad,
    y,
    contentW,
    lineH,
    80
  );
  y += 66;

  // Enclosure + Vishwasbhajan Signature Block
  ctx.font = `700 ${bodyFont}px ${FONT_HINDI}`;
  ctx.textAlign = 'left';
  const sanlagnak = 'संलग्नक';
  ctx.fillText(sanlagnak, sidePad, y);
  const sanW = ctx.measureText(sanlagnak).width;
  ctx.fillRect(sidePad, y + 6, sanW, 2.5);
  ctx.font = `600 ${bodyFont}px ${FONT_HINDI}`;
  ctx.fillText(' :- यथोक्त।', sidePad + sanW, y);

  const sigCenterX = W - sidePad - 230;
  ctx.textAlign = 'center';
  ctx.font = `400 ${bodyFont}px ${FONT_HINDI}`;
  ctx.fillText('विश्वासभाजन', sigCenterX, y);

  const sigY = y + 148;
  ctx.font = `700 ${bodyFont}px ${FONT_HINDI}`;
  ctx.fillText(profile.signatureDesignation, sigCenterX, sigY);
  ctx.font = `400 ${bodyFont}px ${FONT_HINDI}`;
  ctx.fillText(profile.schoolNameHindi, sigCenterX, sigY + 46);
  ctx.fillText(profile.blockDistrictHindi, sigCenterX, sigY + 92);

  return canvasToA4PdfBytes(canvas);
}

async function renderEnvelopeSlipPdfBytes(params: {
  classMode: LetterClassMode;
  profile: SavedLetterProfile;
  records: AdmitCardRecord[];
  effectiveSchoolCode: string;
  copiesPerPage: 1 | 2;
}): Promise<Uint8Array> {
  const { classMode, profile, records, effectiveSchoolCode, copiesPerPage } = params;
  const isInter = classMode === 'INTERMEDIATE';

  const W = 1588;
  const H = 2246;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  const drawSingleSlip = (topY: number, slipHeight: number) => {
    const outerMarginX = 95;
    const slipW = W - outerMarginX * 2;
    const padX = 52;

    // Optional Dashed Cut Border
    if (profile.envelopeShowCutBorder) {
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(outerMarginX, topY, slipW, slipHeight);
      ctx.restore();
    }

    // Double-Bordered Header Box
    const boxW = slipW * 0.88;
    const boxX = outerMarginX + (slipW - boxW) / 2;
    const boxY = topY + 40;
    const boxH = 225;

    ctx.fillStyle = profile.envelopeBoxStyle === 'CREAM' ? '#fff6d6' : '#ffffff';
    ctx.fillRect(boxX + 8, boxY + 8, boxW - 16, boxH - 16);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX + 9, boxY + 9, boxW - 18, boxH - 18);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = `700 35px ${FONT_HINDI}`;
    if (isInter) {
      ctx.fillText(
        `इन्टरमीडिएट वार्षिक परीक्षा—${profile.annualYear} में सम्मिलित होने वाले`,
        W / 2,
        boxY + 72
      );
      ctx.fillText(
        `परीक्षार्थियों का उत्प्रेषण (Sent-Up)/जाँच परीक्षा—${profile.sentUpYear} का`,
        W / 2,
        boxY + 132
      );
      ctx.fillText('प्राप्तांक विहित प्रपत्रों में (हार्ड एवं सॉफ्ट कॉपी में)', W / 2, boxY + 192);
    } else {
      ctx.fillText(
        `माध्यमिक वार्षिक परीक्षा—${profile.annualYear} में सम्मिलित होने वाले परीक्षार्थियों का`,
        W / 2,
        boxY + 72
      );
      ctx.fillText(
        `उत्प्रेषण (Sent-Up)/जाँच परीक्षा—${profile.sentUpYear} का प्राप्तांक विहित प्रपत्रों में`,
        W / 2,
        boxY + 132
      );
      ctx.fillText('(हार्ड एवं सॉफ्ट कॉपी में)', W / 2, boxY + 192);
    }

    // Underlined Bold Sub-heading
    let y = boxY + boxH + 62;
    const leadIn = 'परीक्षा में उपस्थित/अनुपस्थित नियमित/स्वतन्त्र छात्र–छात्राओं की विवरणी निम्नांकित है :—';
    ctx.textAlign = 'left';
    ctx.font = `700 28.5px ${FONT_HINDI}`;
    ctx.fillText(leadIn, outerMarginX + padX, y);
    const leadW = ctx.measureText(leadIn).width;
    ctx.fillRect(outerMarginX + padX, y + 6, Math.min(leadW, slipW - padX * 2), 2.5);
    y += 56;

    const leftX = outerMarginX + padX;
    const colonX = outerMarginX + slipW - padX - 160;
    const valX = outerMarginX + slipW - padX - 52;
    const rowFont = 27;
    const rowH = isInter ? 54 : 49;

    if (isInter) {
      const counts = compute12thLetterCounts(records);
      const totalStr = padTwoDigits(records.length);
      const rows: Array<{ num: string; segments: RichSegment[]; val: string }> = [
        {
          num: '1.',
          segments: [{ text: 'उत्प्रेषित (Sent-Up)/जाँच परीक्षा में उपस्थित नियमित छात्र–छात्राओं की संख्या' }],
          val: counts.presentRegular,
        },
        {
          num: '2.',
          segments: [{ text: 'व्यवसायिक पाठ्यक्रम के परीक्षार्थियों की संख्या' }],
          val: counts.vocational,
        },
        {
          num: '3.',
          segments: [{ text: 'अनुपस्थित/अनुत्तीर्ण (Absent/Non Sent-up) नियमित छात्र–छात्राओं की संख्या' }],
          val: counts.absentNonSentUp,
        },
        {
          num: '4.',
          segments: [{ text: 'दृष्टिबाधित (Visually Impaired/Blind) छात्र–छात्राओं की संख्या' }],
          val: counts.visuallyImpaired,
        },
        {
          num: '5.',
          segments: [{ text: 'स्वतन्त्र (Private) छात्र–छात्राओं की संख्या' }],
          val: counts.privateStudents,
        },
      ];

      rows.forEach((row) => {
        ctx.textAlign = 'left';
        ctx.font = `400 ${rowFont}px ${FONT_MONO}`;
        ctx.fillText(row.num, leftX, y);
        drawRichLine(ctx, row.segments, leftX + 52, y, rowFont);
        ctx.textAlign = 'center';
        ctx.font = `400 ${rowFont}px ${FONT_HINDI}`;
        ctx.fillText(':-', colonX, y);
        ctx.font = `700 ${rowFont}px ${FONT_MONO}`;
        ctx.fillText(row.val, valX, y);
        y += rowH;
      });

      // Bottom Total Row (12th)
      y += 20;
      ctx.font = `700 30px ${FONT_HINDI}`;
      ctx.textAlign = 'right';
      ctx.fillText('विद्यालय में नामांकित कुल छात्रों की संख्या:—', colonX + 26, y);
      ctx.font = `700 31px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(totalStr, valX, y);
    } else {
      const counts = compute10thLetterCounts(records);
      const totalStr = padTwoDigits(records.length);
      const rows: Array<{ num: string; segments: RichSegment[]; val: string }> = [
        {
          num: '1.',
          segments: [
            { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
            { text: 'उपस्थित नियमित', bold: true },
            { text: ' छात्र–छात्राओं की संख्या' },
          ],
          val: counts.presentRegular,
        },
        {
          num: '2.',
          segments: [
            { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
            { text: 'उपस्थित पूर्ववर्ती', bold: true },
            { text: ' छात्र–छात्राओं की संख्या' },
          ],
          val: counts.presentEx,
        },
        {
          num: '3.',
          segments: [
            { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
            { text: 'अनुपस्थित/अनुत्तीर्ण', bold: true },
            { text: ' छात्र–छात्राओं की संख्या' },
          ],
          val: counts.absentFail,
        },
        {
          num: '4.',
          segments: [
            { text: 'दृष्टिबाधित (Visually Impaired/Blind) ' },
            { text: 'उत्प्रेषित (Sent-Up)', bold: true },
            { text: ' छात्र–छात्राओं की संख्या' },
          ],
          val: counts.blindSentUp,
        },
        {
          num: '5.',
          segments: [
            { text: 'दृष्टिबाधित (Visually Impaired/Blind) ' },
            { text: 'अनुपस्थित/अनुत्तीर्ण', bold: true },
            { text: ' छात्र–छात्राओं की संख्या' },
          ],
          val: counts.blindAbsent,
        },
        {
          num: '6.',
          segments: [
            { text: 'उत्प्रेषण (Sent-Up)/जाँच परीक्षा में ' },
            { text: 'उपस्थित स्वतन्त्र', bold: true },
            { text: ' (Private) छात्र–छात्राओं की संख्या' },
          ],
          val: counts.presentPrivate,
        },
      ];

      rows.forEach((row) => {
        ctx.textAlign = 'left';
        ctx.font = `400 ${rowFont}px ${FONT_MONO}`;
        ctx.fillText(row.num, leftX, y);
        drawRichLine(ctx, row.segments, leftX + 52, y, rowFont);
        ctx.textAlign = 'center';
        ctx.font = `400 ${rowFont}px ${FONT_HINDI}`;
        ctx.fillText(':-', colonX, y);
        ctx.font = `700 ${rowFont}px ${FONT_MONO}`;
        ctx.fillText(row.val, valX, y);
        y += rowH;
      });

      // Bottom Total Row (10th)
      y += 20;
      ctx.font = `700 30px ${FONT_HINDI}`;
      ctx.textAlign = 'right';
      ctx.fillText('विद्यालय में पंजीकृत कुल छात्रों की संख्या:—', colonX + 26, y);
      ctx.font = `700 31px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(totalStr, valX, y);
    }

    // Optional School Footer
    if (profile.envelopeShowSchoolFooter) {
      y += 42;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX, y - 24);
      ctx.lineTo(outerMarginX + slipW - padX, y - 24);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `600 24px ${FONT_HINDI}`;
      ctx.textAlign = 'left';
      ctx.fillText(`प्रेषक: ${profile.schoolNameHindi}, ${profile.blockDistrictHindi}`, leftX, y + 6);
      if (effectiveSchoolCode) {
        ctx.font = `700 23px ${FONT_MONO}`;
        ctx.textAlign = 'right';
        ctx.fillText(
          `${isInter ? '+2 Code' : 'Code'}: ${effectiveSchoolCode}`,
          outerMarginX + slipW - padX,
          y + 6
        );
      }
    }
  };

  const singleHeight = profile.envelopeShowSchoolFooter ? 830 : 770;

  if (copiesPerPage === 1) {
    drawSingleSlip(130, singleHeight);
  } else {
    drawSingleSlip(110, singleHeight);

    // Scissor Cut Divider Line
    const midY = 110 + singleHeight + 135;
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(95, midY);
    ctx.lineTo(W / 2 - 210, midY);
    ctx.moveTo(W / 2 + 210, midY);
    ctx.lineTo(W - 95, midY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#000000';
    ctx.font = `600 22px ${FONT_HINDI}`;
    ctx.textAlign = 'center';
    ctx.fillText('✂  काटने की रेखा (Cut Here)  ✂', W / 2, midY + 7);

    drawSingleSlip(midY + 135, singleHeight);
  }

  return canvasToA4PdfBytes(canvas);
}

/**
 * Generates and downloads a single organized ZIP folder pack containing ALL PDF reports,
 * Excel registers, Attendance Sheets, Official Letter Pad PDFs, and Lifafa Paste Slips
 * for the selected class (12th Intermediate or 10th Matric).
 */
export async function downloadCompleteClassPackZip(options: CompletePackOptions): Promise<void> {
  const { classMode, records, onProgress } = options;
  const isInter = classMode === 'INTERMEDIATE';
  const targetExamType = isInter ? 'INTERMEDIATE (+2)' : 'MATRIC (10th)';

  const rawClassRecords = records.filter((r) => r.examType === targetExamType);
  if (rawClassRecords.length === 0) {
    throw new Error(`No ${isInter ? '12th Intermediate' : '10th Matric'} students available to bundle.`);
  }

  const classRecords = isInter ? sort12thRecordsByFaculty(rawClassRecords) : rawClassRecords;
  const profile = loadSavedProfile(classMode);

  // Resolve school metadata
  const detectedCode =
    options.schoolCode ||
    normalizeSchoolCode(classRecords[0]?.schoolCode, classRecords[0]?.rollCode) ||
    'ALL';
  const detectedName =
    options.schoolName || classRecords[0]?.schoolName || profile.schoolNameHindi || 'School';
  const effectiveSchoolCode =
    profile.headerSchoolCode.trim() || (detectedCode !== 'ALL' ? detectedCode : '');

  const dateStamp = new Date().toISOString().slice(0, 10);
  const classSlug = isInter ? '12th_Intermediate' : '10th_Matric';
  const safeCode = (detectedCode || 'ALL').replace(/[^A-Za-z0-9_-]/g, '');
  const rootFolderName = `BSEB_${classSlug}_${safeCode}_Complete_Pack`;

  const zip = new JSZip();
  const rootFolder = zip.folder(rootFolderName)!;
  const excelFolder = rootFolder.folder('01_Excel_Reports')!;
  const pdfFolder = rootFolder.folder('02_PDF_Reports')!;
  const attendanceFolder = rootFolder.folder('03_Attendance_Sheets')!;
  const letterFolder = rootFolder.folder('04_Letter_Pad_and_Lifafa')!;

  const manifestLines: string[] = [
    `====================================================================`,
    `BSEB COMPLETE SUBMISSION PACK — ${isInter ? 'INTERMEDIATE (12th)' : 'MATRIC (10th)'}`,
    `====================================================================`,
    `School Name  : ${profile.schoolNameHindi} (${detectedName})`,
    `School Code  : ${effectiveSchoolCode || 'ALL'}`,
    `Total Roster : ${classRecords.length} Students`,
    `Exam Years   : Annual ${profile.annualYear} / Sent-Up ${profile.sentUpYear}`,
    `Generated On : ${new Date().toLocaleString('en-IN')}`,
    ``,
    `INCLUDED FILES:`,
  ];

  // Ensure Devanagari web font is ready before rendering Letter Pad & Lifafa PDFs
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const annualYear = profile.annualYear || '2027';
  const sentUpYear = profile.sentUpYear || '2026';

  // 1. Capture ALL Excel Reports
  onProgress?.('Generating Excel Reports...');
  const excelFiles = runWithWorkbookCapture(() => {
    if (isInter) {
      exportToExcel(classRecords, {
        mode: 'BSEB_12TH_SENTUP',
        filenamePrefix: `01_12th_SentUp_Praptank_Panji_${safeCode}`,
        annualYear,
        sentUpYear,
      });
      exportAbsent12thExcel(classRecords, {
        filenamePrefix: `02_12th_Absent_NonSentUp_${safeCode}`,
        annualYear,
        sentUpYear,
      });
      exportVocational12thExcel(classRecords, {
        filenamePrefix: `03_12th_Vocational_${safeCode}`,
        annualYear,
        sentUpYear,
      });
      exportToExcel(classRecords, {
        mode: 'SLOT_WISE_DETAILED',
        filenamePrefix: `04_12th_Master_Register_${safeCode}`,
        annualYear,
        sentUpYear,
      });
    } else {
      exportToExcel(classRecords, {
        mode: 'BSEB_10TH_SENTUP',
        filenamePrefix: `01_10th_SentUp_Praptank_Panji_${safeCode}`,
        annualYear,
        sentUpYear,
      });
      exportAbsent10thExcel(classRecords, {
        filenamePrefix: `02_10th_Absent_NonSentUp_${safeCode}`,
        annualYear,
        sentUpYear,
      });
      exportVisuallyImpairedSentUp10thExcel(classRecords, {
        filenamePrefix: `03_10th_VisuallyImpaired_SentUp_${safeCode}`,
        annualYear,
        sentUpYear,
      });
      exportVisuallyImpairedAbsent10thExcel(classRecords, {
        filenamePrefix: `04_10th_VisuallyImpaired_Absent_${safeCode}`,
        annualYear,
        sentUpYear,
      });
      exportToExcel(classRecords, {
        mode: 'SLOT_WISE_DETAILED',
        filenamePrefix: `05_10th_Master_Register_${safeCode}`,
        annualYear,
        sentUpYear,
      });
    }
  });

  excelFiles.forEach((f) => {
    excelFolder.file(f.filename, f.bytes);
    manifestLines.push(`  [Excel]      01_Excel_Reports/${f.filename}`);
  });

  // 2. Capture ALL PDF Reports
  onProgress?.('Generating PDF Reports...');
  const pdfFiles = runWithPdfCapture(() => {
    if (isInter) {
      exportSentUp12thPdf(classRecords, `01_12th_SentUp_Praptank_Panji_${safeCode}`, {
        annualYear,
        sentUpYear,
      });
      exportAbsent12thPdf(classRecords, `02_12th_Absent_NonSentUp_${safeCode}`, {
        annualYear,
        sentUpYear,
      });
      exportVocational12thPdf(classRecords, `03_12th_Vocational_${safeCode}`, {
        annualYear,
        sentUpYear,
      });
      exportToPdfReport(classRecords, true, `04_12th_Master_Summary_${safeCode}`);
    } else {
      exportSentUp10thPdf(classRecords, `01_10th_SentUp_Praptank_Panji_${safeCode}`, {
        annualYear,
        sentUpYear,
      });
      exportAbsent10thPdf(classRecords, `02_10th_Absent_NonSentUp_${safeCode}`, {
        annualYear,
        sentUpYear,
      });
      exportVisuallyImpairedSentUp10thPdf(
        classRecords,
        `03_10th_VisuallyImpaired_SentUp_${safeCode}`,
        { annualYear, sentUpYear }
      );
      exportVisuallyImpairedAbsent10thPdf(
        classRecords,
        `04_10th_VisuallyImpaired_Absent_${safeCode}`,
        { annualYear, sentUpYear }
      );
      exportToPdfReport(classRecords, true, `05_10th_Master_Summary_${safeCode}`);
    }
  });

  pdfFiles.forEach((f) => {
    pdfFolder.file(f.filename, f.bytes);
    manifestLines.push(`  [PDF]        02_PDF_Reports/${f.filename}`);
  });

  // 3. Capture Attendance Sheets (PDF + Excel)
  onProgress?.('Generating Attendance Sheets...');
  const attendanceConfig = {
    examTitle: `BSEB SENT-UP / TEST EXAMINATION ${sentUpYear}`,
    examDate: dateStamp,
    sitting: '1st Sitting (09:30 AM – 12:45 PM)',
    classLabel: isInter ? 'Intermediate (+2 / 12th)' : 'Matric (10th)',
    facultyLabel: isInter ? 'ALL (Science → Arts → Commerce)' : 'ALL (Secondary)',
    subjectLabel: 'All Registered Students',
    schoolCode: effectiveSchoolCode,
    schoolName: detectedName,
    includePhoto: true,
    studentsPerPage: 25,
  };

  const attPdfFiles = runWithPdfCapture(() => {
    exportAttendanceSheetPdf(classRecords, attendanceConfig);
  });
  attPdfFiles.forEach((f) => {
    const cleanName = `${isInter ? '12th' : '10th'}_Attendance_Sheet_${safeCode}.pdf`;
    attendanceFolder.file(cleanName, f.bytes);
    manifestLines.push(`  [Attendance] 03_Attendance_Sheets/${cleanName}`);
  });

  const attExcelFiles = runWithWorkbookCapture(() => {
    exportAttendanceSheetExcel(classRecords, attendanceConfig);
  });
  attExcelFiles.forEach((f) => {
    const cleanName = `${isInter ? '12th' : '10th'}_Attendance_Sheet_${safeCode}.xlsx`;
    attendanceFolder.file(cleanName, f.bytes);
    manifestLines.push(`  [Attendance] 03_Attendance_Sheets/${cleanName}`);
  });

  // 4. Generate Official Hindi Letter Pad PDFs & Lifafa Paste Slip PDFs
  onProgress?.('Generating Letter Pad & Lifafa PDFs...');
  const letterPrefix = isInter ? '12th' : '10th';

  const letterWithHeaderBytes = await renderLetterPadPdfBytes({
    classMode,
    profile,
    records: classRecords,
    effectiveSchoolCode,
    withHeader: true,
  });
  const f1 = `01_${letterPrefix}_Letter_Pad_With_Header.pdf`;
  letterFolder.file(f1, letterWithHeaderBytes);
  manifestLines.push(`  [Letter Pad] 04_Letter_Pad_and_Lifafa/${f1}`);

  const letterPrePrintedBytes = await renderLetterPadPdfBytes({
    classMode,
    profile,
    records: classRecords,
    effectiveSchoolCode,
    withHeader: false,
  });
  const f2 = `02_${letterPrefix}_Letter_Pad_PrePrinted_Blank_Top.pdf`;
  letterFolder.file(f2, letterPrePrintedBytes);
  manifestLines.push(`  [Letter Pad] 04_Letter_Pad_and_Lifafa/${f2}`);

  const lifafa1Bytes = await renderEnvelopeSlipPdfBytes({
    classMode,
    profile,
    records: classRecords,
    effectiveSchoolCode,
    copiesPerPage: 1,
  });
  const f3 = `03_${letterPrefix}_Lifafa_Slip_1_Per_A4.pdf`;
  letterFolder.file(f3, lifafa1Bytes);
  manifestLines.push(`  [Lifafa]     04_Letter_Pad_and_Lifafa/${f3}`);

  const lifafa2Bytes = await renderEnvelopeSlipPdfBytes({
    classMode,
    profile,
    records: classRecords,
    effectiveSchoolCode,
    copiesPerPage: 2,
  });
  const f4 = `04_${letterPrefix}_Lifafa_Slip_2_Per_A4_Cut.pdf`;
  letterFolder.file(f4, lifafa2Bytes);
  manifestLines.push(`  [Lifafa]     04_Letter_Pad_and_Lifafa/${f4}`);

  rootFolder.file('README_INDEX.txt', manifestLines.join('\n'));

  // 5. Compress ZIP and Trigger Browser Download
  onProgress?.('Packaging ZIP Folder...');
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${rootFolderName}_${dateStamp}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
