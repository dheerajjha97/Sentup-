import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeInterSubjectCell,
  inferGenderFromBsebId,
  parseMatricTextItems,
  parseInterOcrZones,
  computeSummaryStats,
  PdfTextItem,
} from './bsebParser';

test('normalizeInterSubjectCell handles exact subject codes and noisy OCR strings', () => {
  assert.equal(normalizeInterSubjectCell('206 | Hindi |', 'COMMERCE'), '206 - Hindi');
  assert.equal(normalizeInterSubjectCell('205 | English |', 'COMMERCE'), '205 - English');
  assert.equal(normalizeInterSubjectCell('217 Business Studies', 'COMMERCE'), '217 - Business Studies');
  assert.equal(normalizeInterSubjectCell('18 Chemistry', 'SCIENCE'), '118 - Chemistry');
  assert.equal(normalizeInterSubjectCell('506 | Hindi |', 'ARTS'), '306 - Hindi');
  assert.equal(normalizeInterSubjectCell('|', 'ARTS'), '');
});

test('inferGenderFromBsebId extracts gender from 4th digit of 13-digit BSEB Unique ID', () => {
  assert.equal(inferGenderFromBsebId('1261518030042'), 'MALE');
  assert.equal(inferGenderFromBsebId('1262518030060'), 'FEMALE');
  assert.equal(inferGenderFromBsebId('2252233370010'), 'FEMALE');
  assert.equal(inferGenderFromBsebId('2251233370036'), 'MALE');
});

test('parseMatricTextItems extracts Secondary (10th) admit card fields accurately', () => {
  const sampleItems: PdfTextItem[] = [
    { str: 'BIHAR SCHOOL EXAMINATION BOARD', x: 197, y: 792 },
    { str: 'ANNUAL SECONDARY EXAMINATION, 2027', x: 183, y: 776 },
    { str: '1261518030028', x: 164, y: 719 },
    { str: '51803 - HIGH SECONDARY SCHOOL BERUA', x: 164, y: 699 },
    { str: 'MOHAMMAD ARMAN', x: 164, y: 682 },
    { str: 'NAGINA KHATOON', x: 164, y: 666 },
    { str: 'BHOLA BAITHA', x: 164, y: 650 },
    { str: '8357-8761-8673', x: 164, y: 634 },
    { str: '07/12/2010', x: 164, y: 618 },
    { str: 'MALE', x: 164, y: 601 },
    { str: 'REGULAR', x: 164, y: 587 },
    { str: '51803-00004-26', x: 164, y: 574 },
    { str: '/ 20', x: 228, y: 574 },
    { str: '26', x: 242, y: 574 },
    { str: '(a)', x: 405, y: 574 },
    { str: 'EBC', x: 435, y: 574 },
    { str: ':', x: 501, y: 574 },
    { str: 'No', x: 505, y: 574 },
    { str: '51803', x: 164, y: 561 },
    { str: ': xxxxxxxxx', x: 437, y: 561 },
    { str: 'xxxxxxxxxxxxxxxxxxxxxxxx', x: 164, y: 548 },
    { str: 'MIL -', x: 142, y: 483 },
    { str: 'URDU', x: 161, y: 483 },
    { str: 'SIL -', x: 143, y: 453 },
    { str: 'HINDI', x: 160, y: 453 },
    { str: 'MATHEMATICS', x: 325, y: 491 },
    { str: 'SOCIAL SCIENCE', x: 321, y: 475 },
    { str: 'SCIENCE', x: 336, y: 460 },
    { str: 'ENGLISH', x: 336, y: 445 },
  ];

  const record = parseMatricTextItems(sampleItems, 4, 'DUMMY_ADMIT_CARD.pdf', 1);
  assert.equal(record.examType, 'MATRIC (10th)');
  assert.equal(record.bsebUniqueId, '1261518030028');
  assert.equal(record.schoolCode, '51803');
  assert.equal(record.studentName, 'MOHAMMAD ARMAN');
  assert.equal(record.motherName, 'NAGINA KHATOON');
  assert.equal(record.fatherName, 'BHOLA BAITHA');
  assert.equal(record.aadhaarNo, '8357-8761-8673');
  assert.equal(record.dob, '07/12/2010');
  assert.equal(record.gender, 'MALE');
  assert.equal(record.studentCategory, 'REGULAR');
  assert.equal(record.casteCategory, 'EBC');
  assert.equal(record.differentlyAbled, 'No');
  assert.equal(record.registrationNo, '51803-00004-26');
  assert.equal(record.langSubject1, 'MIL - URDU');
  assert.equal(record.langSubject2, 'SIL - HINDI');
  assert.equal(record.compulsorySubject1, 'MATHEMATICS');
  assert.equal(record.compulsorySubject4, 'ENGLISH');
});

test('parseMatricTextItems resists column shifts on labeled PDF with shifted Y coordinates and 2-line wrapped school name', () => {
  // Shifted down by -60px relative to standard template, with 2-line school name + English/Hindi labels
  const shiftedItems: PdfTextItem[] = [
    { str: 'BIHAR SCHOOL EXAMINATION BOARD, PATNA', x: 180, y: 740 },
    { str: 'ANNUAL SECONDARY EXAMINATION, 2027', x: 185, y: 724 },
    { str: 'BSEB Unique Id', x: 40, y: 660 },
    { str: ': 1262518030099', x: 170, y: 660 },
    { str: 'विद्यालय का नाम / School Name', x: 40, y: 642 },
    { str: ': 51803 - UCHCH MADHYAMIK VIDYALAYA BERUA,', x: 170, y: 642 },
    { str: 'GAAYGHAT, MUZAFFARPUR', x: 170, y: 628 },
    { str: 'Candidate Name', x: 40, y: 612 },
    { str: ': ANJALI KUMARI', x: 170, y: 612 },
    { str: "Mother's Name", x: 40, y: 596 },
    { str: ': SUNITA DEVI', x: 170, y: 596 },
    { str: "Father's Name", x: 40, y: 580 },
    { str: ': RAMESH PRASAD SINGH', x: 170, y: 580 },
    { str: 'Aadhaar No.', x: 40, y: 564 },
    { str: ': 9123 4567 8901', x: 170, y: 564 },
    { str: 'Date of Birth', x: 40, y: 548 },
    { str: ': 15/08/2011', x: 170, y: 548 },
    { str: 'Gender', x: 40, y: 532 },
    { str: ': FEMALE', x: 170, y: 532 },
    { str: 'Category', x: 40, y: 516 },
    { str: ': REGULAR', x: 170, y: 516 },
    { str: 'Registration No./Year', x: 40, y: 500 },
    { str: ': 51803-00099-26 / 2026', x: 170, y: 500 },
    { str: 'BC', x: 435, y: 500 },
    { str: 'Differently Abled : No', x: 470, y: 500 },
    { str: 'Roll Code', x: 40, y: 484 },
    { str: ': 51803', x: 170, y: 484 },
    { str: 'Roll Number : 2700099', x: 380, y: 484 },
    { str: 'Examination Centre', x: 40, y: 468 },
    { str: ': ZILA SCHOOL MUZAFFARPUR', x: 170, y: 468 },
    // Subject table shifted down by -70px
    { str: 'MIL -', x: 140, y: 410 },
    { str: 'HINDI', x: 162, y: 410 },
    { str: 'SIL -', x: 140, y: 385 },
    { str: 'SANSKRIT', x: 162, y: 385 },
    { str: 'MATHEMATICS', x: 325, y: 415 },
    { str: 'SCIENCE', x: 330, y: 400 },
    { str: 'SOCIAL SCIENCE', x: 320, y: 385 },
    { str: 'ENGLISH', x: 332, y: 370 },
    { str: 'HOME SCIENCE', x: 505, y: 400 },
    { str: 'IMPORTANT INSTRUCTIONS FOR CANDIDATES', x: 180, y: 320 },
  ];

  const record = parseMatricTextItems(shiftedItems, 1, 'Shifted_10th.pdf', 1);
  assert.equal(record.bsebUniqueId, '1262518030099');
  assert.equal(record.schoolCode, '51803');
  assert.equal(record.schoolName, '51803 - UCHCH MADHYAMIK VIDYALAYA BERUA, GAAYGHAT, MUZAFFARPUR');
  assert.equal(record.studentName, 'ANJALI KUMARI');
  assert.equal(record.motherName, 'SUNITA DEVI');
  assert.equal(record.fatherName, 'RAMESH PRASAD SINGH');
  assert.equal(record.aadhaarNo, '9123-4567-8901');
  assert.equal(record.dob, '15/08/2011');
  assert.equal(record.gender, 'FEMALE');
  assert.equal(record.studentCategory, 'REGULAR');
  assert.equal(record.casteCategory, 'BC');
  assert.equal(record.differentlyAbled, 'No');
  assert.equal(record.registrationNo, '51803-00099-26');
  assert.equal(record.rollCode, '51803');
  assert.equal(record.rollNumber, '2700099');
  assert.equal(record.examCenter, 'ZILA SCHOOL MUZAFFARPUR');
  assert.equal(record.langSubject1, 'MIL - HINDI');
  assert.equal(record.langSubject2, 'SIL - SANSKRIT');
  assert.equal(record.compulsorySubject1, 'MATHEMATICS');
  assert.equal(record.compulsorySubject2, 'SCIENCE');
  assert.equal(record.compulsorySubject3, 'SOCIAL SCIENCE');
  assert.equal(record.compulsorySubject4, 'ENGLISH');
  assert.equal(record.additionalSubject, 'HOME SCIENCE');
});

test('parseMatricTextItems handles unlabeled shifted PDF with 2-line school name via bottom-up anchoring', () => {
  const unlabeledWrappedItems: PdfTextItem[] = [
    { str: 'BIHAR SCHOOL EXAMINATION BOARD', x: 197, y: 760 },
    { str: 'ANNUAL SECONDARY EXAMINATION, 2027', x: 183, y: 744 },
    { str: '1261518030055', x: 164, y: 690 },
    { str: '51803 - HIGH SECONDARY SCHOOL BERUA,', x: 164, y: 672 },
    { str: 'BLOCK GAAYGHAT, DIST MUZAFFARPUR', x: 164, y: 658 },
    { str: 'RAHUL KUMAR', x: 164, y: 642 },
    { str: 'REKHA DEVI', x: 164, y: 626 },
    { str: 'MANOJ SAH', x: 164, y: 610 },
    { str: '4455-6677-8899', x: 164, y: 594 },
    { str: '12/03/2011', x: 164, y: 578 },
    { str: 'MALE', x: 164, y: 562 },
    { str: 'REGULAR', x: 164, y: 546 },
    { str: '51803-00055-26 / 2026', x: 164, y: 530 },
    { str: '51803', x: 164, y: 514 },
  ];

  const record = parseMatricTextItems(unlabeledWrappedItems, 2, 'Unlabeled_Wrapped.pdf', 2);
  assert.equal(record.schoolName, '51803 - HIGH SECONDARY SCHOOL BERUA, BLOCK GAAYGHAT, DIST MUZAFFARPUR');
  assert.equal(record.studentName, 'RAHUL KUMAR');
  assert.equal(record.motherName, 'REKHA DEVI');
  assert.equal(record.fatherName, 'MANOJ SAH');
  assert.equal(record.aadhaarNo, '4455-6677-8899');
  assert.equal(record.dob, '12/03/2011');
  assert.equal(record.registrationNo, '51803-00055-26');
});

test('parseInterOcrZones extracts Intermediate (+2) admit card fields and subjects accurately', () => {
  const topFieldsText = `
2252233370048
UCHCH MADHYAMIK VIDYALAYA BERUA, GAAYGHAT, MUZAFFARPUR
RANI KUMARI
RITA DEVI
PRAHALAD PASWAN
Unmarried
726957189054 faim wife: NO
R-313370048-25 qtemefi of Pife: REGULAR
31337 Jd PHD: XXXXXXXX fT: Female
XXXXXXXX
`;

  const record = parseInterOcrZones(
    {
      topFieldsText,
      facultyText: 'FACULTY: COMMERCE',
      comp1Text: '206 | Hindi |',
      comp2Text: '205 | English |',
      elec1Text: '217 Business Studies',
      elec2Text: '218 Entrepreneurship',
      elec3Text: '220 Accountancy',
      addl2Text: '219 | Economics',
    },
    2,
    'AdmitCards_Commerce.pdf',
    2
  );

  assert.equal(record.examType, 'INTERMEDIATE (+2)');
  assert.equal(record.faculty, 'COMMERCE');
  assert.equal(record.bsebUniqueId, '2252233370048');
  assert.equal(record.studentName, 'RANI KUMARI');
  assert.equal(record.motherName, 'RITA DEVI');
  assert.equal(record.fatherName, 'PRAHALAD PASWAN');
  assert.equal(record.maritalStatus, 'Unmarried');
  assert.equal(record.aadhaarNo, '7269-5718-9054');
  assert.equal(record.registrationNo, 'R-313370048-25');
  assert.equal(record.rollCode, '31337');
  assert.equal(record.gender, 'FEMALE');
  assert.equal(record.langSubject1, '206 - Hindi');
  assert.equal(record.langSubject2, '205 - English');
  assert.equal(record.compulsorySubject1, '217 - Business Studies');
  assert.equal(record.compulsorySubject2, '218 - Entrepreneurship');
  assert.equal(record.compulsorySubject3, '220 - Accountancy');
  assert.equal(record.additionalSubject, '219 - Economics');

  const stats = computeSummaryStats([record]);
  assert.equal(stats.totalStudents, 1);
  assert.equal(stats.femaleCount, 1);
  assert.equal(stats.interCount, 1);
  assert.equal(stats.byFaculty['COMMERCE'], 1);
});

test('parseInterOcrZones prevents column shift when College/+2 School name wraps onto 2 lines', () => {
  const wrappedTopFieldsText = `
2251233370071
31337 - UCHCH MADHYAMIK VIDYALAYA BERUA,
GAAYGHAT, MUZAFFARPUR (BIHAR)
AMIT KUMAR THAKUR
MEENA DEVI
SURESH THAKUR
Unmarried
554433221100 Differently Abled: NO
R-313370071-25 Category: REGULAR
31337 Roll Number: 2700071 Gender: Male
`;

  const record = parseInterOcrZones(
    {
      topFieldsText: wrappedTopFieldsText,
      facultyText: 'FACULTY: SCIENCE',
      comp1Text: '106 Hindi',
      comp2Text: '105 English',
      elec1Text: '117 Physics',
      elec2Text: '118 Chemistry',
      elec3Text: '121 Mathematics',
      addl2Text: '',
    },
    3,
    'Inter_Science_Wrapped.pdf',
    3
  );

  assert.equal(
    record.schoolName,
    '31337 - UCHCH MADHYAMIK VIDYALAYA BERUA, GAAYGHAT, MUZAFFARPUR (BIHAR)'
  );
  assert.equal(record.studentName, 'AMIT KUMAR THAKUR');
  assert.equal(record.motherName, 'MEENA DEVI');
  assert.equal(record.fatherName, 'SURESH THAKUR');
  assert.equal(record.aadhaarNo, '5544-3322-1100');
  assert.equal(record.rollNumber, '2700071');
  assert.equal(record.gender, 'MALE');
});

test('parseInterOcrZones recovers exact columns even if Unmarried line is dropped by OCR', () => {
  const missingUnmarriedText = `
2252233370088
UCHCH MADHYAMIK VIDYALAYA BERUA,
GAAYGHAT, MUZAFFARPUR
POOJA KUMARI
SAVITA DEVI
DINESH MANDAL
987654321012 Differently Abled: NO
R-313370088-25 REGULAR
31337 Female
`;

  const record = parseInterOcrZones(
    {
      topFieldsText: missingUnmarriedText,
      facultyText: 'FACULTY: ARTS',
      comp1Text: '306 Hindi',
      comp2Text: '305 English',
      elec1Text: '321 History',
      elec2Text: '322 Political Science',
      elec3Text: '323 Geography',
      addl2Text: '',
    },
    4,
    'Inter_Arts_NoMarital.pdf',
    4
  );

  assert.equal(record.schoolName, '31337 - UCHCH MADHYAMIK VIDYALAYA BERUA, GAAYGHAT, MUZAFFARPUR');
  assert.equal(record.studentName, 'POOJA KUMARI');
  assert.equal(record.motherName, 'SAVITA DEVI');
  assert.equal(record.fatherName, 'DINESH MANDAL');
  assert.equal(record.aadhaarNo, '9876-5432-1012');
  assert.equal(record.registrationNo, 'R-313370088-25');
});

test('parseMatricTextItems auto-routes text-layer Intermediate (+2) PDF with labels and 3-column subjects cleanly', () => {
  const interTextItems: PdfTextItem[] = [
    { str: 'BIHAR SCHOOL EXAMINATION BOARD, PATNA', x: 180, y: 780 },
    { str: 'INTERMEDIATE ANNUAL EXAMINATION, 2027', x: 180, y: 764 },
    { str: 'FACULTY : SCIENCE', x: 450, y: 764 },
    { str: 'BSEB Unique Id', x: 40, y: 720 },
    { str: ': 2251233370091', x: 170, y: 720 },
    { str: 'College/+2 School Name', x: 40, y: 702 },
    { str: ': 31337 - UCHCH MADHYAMIK VIDYALAYA BERUA,', x: 170, y: 702 },
    { str: 'GAAYGHAT, MUZAFFARPUR', x: 170, y: 688 },
    { str: 'Candidate Name', x: 40, y: 672 },
    { str: ': VIKASH KUMAR', x: 170, y: 672 },
    { str: "Mother's Name", x: 40, y: 656 },
    { str: ': GITA DEVI', x: 170, y: 656 },
    { str: "Father's Name", x: 40, y: 640 },
    { str: ': RAJESHWAR MAHTO', x: 170, y: 640 },
    { str: 'Marital Status', x: 40, y: 624 },
    { str: ': Unmarried', x: 170, y: 624 },
    { str: 'Aadhaar No.', x: 40, y: 608 },
    { str: ': 112233445566', x: 170, y: 608 },
    { str: 'Registration No.', x: 40, y: 592 },
    { str: ': R-313370091-25', x: 170, y: 592 },
    { str: 'Roll Code : 31337', x: 40, y: 576 },
    { str: 'Roll Number : 2700091', x: 250, y: 576 },
    { str: 'Gender : Male', x: 420, y: 576 },
    { str: '106 - Hindi', x: 90, y: 470 },
    { str: '105 - English', x: 90, y: 452 },
    { str: '117 - Physics', x: 280, y: 470 },
    { str: '118 - Chemistry', x: 280, y: 452 },
    { str: '119 - Biology', x: 280, y: 434 },
    { str: '121 - Mathematics', x: 470, y: 452 },
  ];

  const record = parseMatricTextItems(interTextItems, 1, 'Inter_TextLayer.pdf', 1);
  assert.equal(record.examType, 'INTERMEDIATE (+2)');
  assert.equal(record.faculty, 'SCIENCE');
  assert.equal(record.bsebUniqueId, '2251233370091');
  assert.equal(record.schoolName, '31337 - UCHCH MADHYAMIK VIDYALAYA BERUA, GAAYGHAT, MUZAFFARPUR');
  assert.equal(record.studentName, 'VIKASH KUMAR');
  assert.equal(record.motherName, 'GITA DEVI');
  assert.equal(record.fatherName, 'RAJESHWAR MAHTO');
  assert.equal(record.aadhaarNo, '1122-3344-5566');
  assert.equal(record.registrationNo, 'R-313370091-25');
  assert.equal(record.rollCode, '31337');
  assert.equal(record.rollNumber, '2700091');
  assert.equal(record.langSubject1, '106 - Hindi');
  assert.equal(record.langSubject2, '105 - English');
  assert.equal(record.compulsorySubject1, '117 - Physics');
  assert.equal(record.compulsorySubject2, '118 - Chemistry');
  assert.equal(record.compulsorySubject3, '119 - Biology');
  assert.equal(record.additionalSubject, '121 - Mathematics');
});
