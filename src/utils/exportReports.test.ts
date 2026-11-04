import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  build12thSentUpWorksheet,
  build10thSentUpWorksheet,
  splitVerticalTextLines,
} from './exportReports';
import { createBlankStudentRecord } from './marksAndFormat';

test('splitVerticalTextLines splits subject codes and keeps short subject names on 1 line', () => {
  assert.deepEqual(splitVerticalTextLines('306-Hindi'), ['306-Hindi']);
  assert.deepEqual(splitVerticalTextLines('305-English'), ['305-English']);
  assert.deepEqual(splitVerticalTextLines('117-PHYSICS'), ['117-', 'PHYSICS']);
  assert.deepEqual(splitVerticalTextLines('118-CHEMISTRY'), ['118-', 'CHEMISTRY']);
  assert.deepEqual(splitVerticalTextLines('R-313370001-24'), ['R-31337000', '1-24']);
});

test('build12thSentUpWorksheet applies 90-degree textRotation on Subject Name columns and headers', () => {
  const student = createBlankStudentRecord(1, 'INTERMEDIATE (+2)', 'SCIENCE');
  student.studentName = 'ANISHA KUMARI';
  student.registrationNo = 'R-313370001-24';

  const ws = build12thSentUpWorksheet([student]);

  // Row 7 (r=6) sub-headers should have textRotation: 90
  const subHeaderCol4 = ws[XLSX.utils.encode_cell({ r: 6, c: 4 })] as XLSX.CellObject & {
    s?: { alignment?: { textRotation?: number } };
  };
  assert.equal(subHeaderCol4?.s?.alignment?.textRotation, 90);

  // Student row 9 (r=8) Subject Name columns (4, 6, 8, 12, 16, 21, 25) should have textRotation: 90
  for (const subjectCol of [4, 6, 8, 12, 16, 21, 25]) {
    const cell = ws[XLSX.utils.encode_cell({ r: 8, c: subjectCol })] as XLSX.CellObject & {
      s?: { alignment?: { textRotation?: number } };
    };
    assert.equal(
      cell?.s?.alignment?.textRotation,
      90,
      `Expected column ${subjectCol} in student row to have textRotation=90`
    );
  }

  // Marks numeric columns (5, 7, 9, 10, 11) should remain horizontal (no textRotation: 90)
  for (const marksCol of [5, 7, 9, 10, 11]) {
    const cell = ws[XLSX.utils.encode_cell({ r: 8, c: marksCol })] as XLSX.CellObject & {
      s?: { alignment?: { textRotation?: number } };
    };
    assert.equal(cell?.s?.alignment?.textRotation, undefined);
  }
});

test('build10thSentUpWorksheet applies 90-degree textRotation on Matric Subject headers', () => {
  const student = createBlankStudentRecord(1, 'MATRIC (10th)');
  student.studentName = 'SIPANCHU KUMARI';

  const ws = build10thSentUpWorksheet([student]);

  // Row 6 (r=5) subject columns MIL (c=9) through VOC (c=21) should have textRotation: 90
  for (let c = 9; c <= 21; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 5, c })] as XLSX.CellObject & {
      s?: { alignment?: { textRotation?: number } };
    };
    assert.equal(
      cell?.s?.alignment?.textRotation,
      90,
      `Expected 10th subject header column ${c} to have textRotation=90`
    );
  }
});
