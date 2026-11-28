import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStudentRegisteredSubjects,
  calculateStudentMarksSummary,
  resolveCustomColumnValue,
  parseUploadedExcelTemplateAndMarks,
  getEffectiveMatricSentUp,
  getEffectiveInterSentUp,
  createBlankStudentRecord,
} from './marksAndFormat';
import { AdmitCardRecord } from '../types/admitCard';

const sampleInterStudent: AdmitCardRecord = {
  id: 'test-1',
  serialNo: 1,
  examType: 'INTERMEDIATE (+2)',
  examYear: '2027',
  faculty: 'COMMERCE',
  bsebUniqueId: '2252233370048',
  schoolCode: '31337',
  schoolName: '31337 - UCHCH MADHYAMIK VIDYALAYA BERUA',
  studentName: 'RANI KUMARI',
  motherName: 'RITA DEVI',
  fatherName: 'PRAHALAD PASWAN',
  dob: 'N/A',
  gender: 'FEMALE',
  maritalStatus: 'Unmarried',
  aadhaarNo: '7269-5718-9054',
  studentCategory: 'REGULAR',
  casteCategory: 'N/A',
  differentlyAbled: 'NO',
  registrationNo: 'R-313370048-25',
  rollCode: '31337',
  rollNumber: 'XXXXXXXX',
  examCenter: 'XXXXXXXX',
  langSubject1: '206 - Hindi',
  langSubject2: '205 - English',
  compulsorySubject1: '217 - Business Studies',
  compulsorySubject2: '218 - Entrepreneurship',
  compulsorySubject3: '220 - Accountancy',
  compulsorySubject4: '',
  additionalSubject: '219 - Economics',
  allSubjectsSummary:
    '206 - Hindi, 205 - English, 217 - Business Studies, 218 - Entrepreneurship, 220 - Accountancy, 219 - Economics',
  subjectMarks: {
    '206 - Hindi': '75',
    '205 - English': '68',
    '217 - Business Studies': '82',
    '218 - Entrepreneurship': '79',
    '220 - Accountancy': '86',
    '219 - Economics': '71',
  },
  sourceFileName: 'AdmitCards.pdf',
  sourcePageNumber: 2,
  extractionMethod: 'HYBRID_OCR',
};

test('getStudentRegisteredSubjects returns main and additional subjects accurately', () => {
  const slots = getStudentRegisteredSubjects(sampleInterStudent);
  assert.equal(slots.length, 6);
  assert.equal(slots.filter((s) => s.isAggregateMain).length, 5);
  assert.equal(slots[5].subjectName, '219 - Economics');
  assert.equal(slots[5].isAggregateMain, false);
});

test('calculateStudentMarksSummary computes total out of 500, percentage, and 1st Division', () => {
  const summary = calculateStudentMarksSummary(sampleInterStudent);
  // 75 + 68 + 82 + 79 + 86 = 390
  assert.equal(summary.totalMarks, 390);
  assert.equal(summary.maxMarks, 500);
  assert.equal(summary.percentage, '78.00%');
  assert.equal(summary.division, '1st Division');
  assert.equal(summary.additionalSubjectMarks, '71');
});

test('resolveCustomColumnValue maps custom English/Hindi and subject-specific headers accurately', () => {
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'S.No.'), 1);
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'BSEB Unique ID'), '2252233370048');
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'परीक्षार्थी का नाम'), 'RANI KUMARI');
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'पिता का नाम'), 'PRAHALAD PASWAN');
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'Hindi'), '75');
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'Accountancy (Marks)'), '86');
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'Physics'), '');
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'Total Marks'), 390);
  assert.equal(resolveCustomColumnValue(sampleInterStudent, 0, 'Division'), '1st Division');
});

test('parseUploadedExcelTemplateAndMarks captures custom headers and imports student subject marks', () => {
  const studentWithoutMarks: AdmitCardRecord = {
    ...sampleInterStudent,
    subjectMarks: {},
  };

  const uploadedSheetRows = [
    ['Sr No', 'BSEB Unique ID', 'Student Name', 'Hindi', 'English', 'Business Studies', 'Entrepreneurship', 'Accountancy', 'Total Marks'],
    [1, '2252233370048', 'RANI KUMARI', 80, 70, 85, 75, 90, 400],
  ];

  const result = parseUploadedExcelTemplateAndMarks(
    uploadedSheetRows,
    [studentWithoutMarks],
    'My_Custom_Format.xlsx',
    'Sheet1'
  );

  assert.equal(result.formatConfig.headers.length, 9);
  assert.equal(result.matchedStudentCount, 1);
  assert.equal(result.importedMarksCount, 5);

  const updated = result.updatedRecords[0];
  const summary = calculateStudentMarksSummary(updated);
  assert.equal(summary.totalMarks, 400);
  assert.equal(summary.division, '1st Division');
});

test('parseUploadedExcelTemplateAndMarks preserves exact column indices when blank/merged headers exist', () => {
  const studentWithoutMarks: AdmitCardRecord = {
    ...sampleInterStudent,
    subjectMarks: {},
  };

  // Blank header cells at index 0 and index 3 simulate merged/empty template columns
  const uploadedSheetRows = [
    ['', 'Sr No', 'BSEB Unique ID', '', 'Student Name', 'Hindi', '', 'English', 'Business Studies', 'Entrepreneurship', 'Accountancy'],
    ['', 1, '2252233370048', 'EXTRA', 'RANI KUMARI', 84, 'NOTE', 76, 88, 72, 91],
  ];

  const result = parseUploadedExcelTemplateAndMarks(
    uploadedSheetRows,
    [studentWithoutMarks],
    'Merged_Headers_Format.xlsx',
    'Sheet1'
  );

  assert.equal(result.matchedStudentCount, 1);
  assert.equal(result.importedMarksCount, 5);
  const marks = result.updatedRecords[0].subjectMarks || {};
  assert.equal(marks['206 - Hindi'], '84');
  assert.equal(marks['205 - English'], '76');
  assert.equal(marks['217 - Business Studies'], '88');
  assert.equal(marks['218 - Entrepreneurship'], '72');
  assert.equal(marks['220 - Accountancy'], '91');
});

test('getEffectiveInterSentUp matches 12th_Sent-Up_Exam.-2025 30-column formula (Theory + Practical = Total & Aggregate)', () => {
  const anishaRow = createBlankStudentRecord(1, 'INTERMEDIATE (+2)', '31337', 'UCHCH MADHYAMIK VIDYALAYA BERUA', 'SCIENCE');
  anishaRow.studentName = 'ANISHA KUMARI';
  anishaRow.fatherName = 'RAJ KUMAR SINGH';
  anishaRow.motherName = 'PUTUL DEVI';
  anishaRow.registrationNo = 'R-313370001-24';
  anishaRow.interSentUp = {
    lang1Subject: '306-Hindi',
    lang1Marks: '55',
    lang2Subject: '305-English',
    lang2Marks: '54',
    elective1Subject: '117-PHYSICS',
    elective1Theory: '54',
    elective1Practical: '24',
    elective2Subject: '118-CHEMISTRY',
    elective2Theory: '51',
    elective2Practical: '20',
    elective3Subject: '119-BIOLOGY',
    elective3Theory: '37',
    elective3Practical: '20',
    additionalSubject: '---',
    additionalTheory: '',
    additionalPractical: '',
    vocationalSubject: '---',
    vocationalTheory: '',
    vocationalPractical: '',
    resultStatus: 'SENT-UP',
  };

  const eff = getEffectiveInterSentUp(anishaRow);
  assert.equal(eff.elective1Total, '78');
  assert.equal(eff.elective2Total, '71');
  assert.equal(eff.elective3Total, '57');
  assert.equal(eff.aggregate, '315');
});

test('getEffectiveMatricSentUp matches 10th_Sent-Up_Exam.-2025_BSEB 23-column formula (excludes ENG from AGGRE-GATE)', () => {
  const sipanchuRow = createBlankStudentRecord(1, 'MATRIC (10th)', '51803', 'H.S.S. BERUA', 'SECONDARY');
  sipanchuRow.studentName = 'SIPANCHU KUMARI';
  sipanchuRow.motherName = 'RIBHA DEVI';
  sipanchuRow.fatherName = 'AMRENDRA SINGH';
  sipanchuRow.registrationNo = '51803-00001-25';
  sipanchuRow.matricSentUp = {
    milTheory: '47',
    silTheory: '68',
    matTheory: '87',
    sciTheory: '65',
    sscTheory: '60',
    engTheory: '41',
    optTheory: '',
    vocTheory: '',
    sciPractical: '19',
    sscLitAct: '8',
    sscPrWork: '9',
    optPractical: '',
    vocPractical: '',
  };

  const eff = getEffectiveMatricSentUp(sipanchuRow);
  // 47 + 68 + 87 + 65 + 60 + 19 + 8 + 9 = 363 (ENG 41 is not added)
  assert.equal(eff.sciTotal, 84);
  assert.equal(eff.sscTotal, 77);
  assert.equal(eff.aggregate, '363');
});
