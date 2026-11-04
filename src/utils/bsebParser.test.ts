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
  assert.equal(record.registrationNo, '51803-00004-26 / 2026');
  assert.equal(record.langSubject1, 'MIL - URDU');
  assert.equal(record.langSubject2, 'SIL - HINDI');
  assert.equal(record.compulsorySubject1, 'MATHEMATICS');
  assert.equal(record.compulsorySubject4, 'ENGLISH');
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
