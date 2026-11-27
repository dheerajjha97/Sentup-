export type ExamType = 'MATRIC (10th)' | 'INTERMEDIATE (+2)';

export type FacultyType = 'SECONDARY' | 'ARTS' | 'SCIENCE' | 'COMMERCE' | 'VOCATIONAL';

export type ExportFormatMode =
  | 'BSEB_12TH_SENTUP'
  | 'BSEB_10TH_SENTUP'
  | 'BSEB_12TH_VOCATIONAL'
  | 'BSEB_12TH_ABSENT'
  | 'BSEB_10TH_ABSENT'
  | 'BSEB_10TH_VISUALLY_IMPAIRED'
  | 'BSEB_10TH_VISUALLY_IMPAIRED_ABSENT'
  | 'CUSTOM_UPLOADED'
  | 'SUBJECT_WISE_MATRIX'
  | 'SLOT_WISE_DETAILED';

export interface CustomExcelFormatConfig {
  fileName: string;
  sheetName: string;
  headers: string[];
  uploadedAt: string;
}

/**
 * Exact 23-column BSEB Matric (10th) Sent-Up Exam Praptank Panji marks structure
 * (Matches 10th_Sent-Up_Exam.-2025_BSEB.pdf columns 10 to 23)
 */
export interface MatricSentUpMarks {
  milTheory: string;       // Col 10: MIL (out of 100)
  silTheory: string;       // Col 11: SIL (out of 100)
  matTheory: string;       // Col 12: MAT (out of 100)
  sciTheory: string;       // Col 13: SCI Theory (out of 80)
  sscTheory: string;       // Col 14: SSC Theory (out of 80)
  engTheory: string;       // Col 15: ENG Theory (out of 100, not added to Aggregate)
  optTheory: string;       // Col 16: OPT-SUB Theory
  vocTheory: string;       // Col 17: OPT-SUB (Vocational) Theory
  sciPractical: string;    // Col 18: SCI Internal/Practical (out of 20)
  sscLitAct: string;       // Col 19: SSC Literacy Activity (out of 10)
  sscPrWork: string;       // Col 20: SSC Project Work (out of 10)
  optPractical: string;    // Col 21: OPT-SUB Practical
  vocPractical: string;    // Col 22: OPT-SUB (Vocational) Practical
}

/**
 * Exact 30-column BSEB Intermediate (+2 / 12th) Sent-Up Exam Praptank Panji marks structure
 * (Matches 12th_Sent-Up_Exam.-2025.pdf columns 5 to 30)
 */
export interface InterSentUpMarks {
  lang1Subject: string;        // Col 5: e.g. "306-Hindi"
  lang1Marks: string;          // Col 6: e.g. "55"
  lang2Subject: string;        // Col 7: e.g. "305-English" or "307-Urdu"
  lang2Marks: string;          // Col 8: e.g. "54"
  elective1Subject: string;    // Col 9: e.g. "117-PHYSICS" or "319- H.Sc."
  elective1Theory: string;     // Col 10: e.g. "54"
  elective1Practical: string;  // Col 11: e.g. "24" or "0"
  elective2Subject: string;    // Col 13: e.g. "118-CHEMISTRY" or "322- Pol.Sc."
  elective2Theory: string;     // Col 14: e.g. "51"
  elective2Practical: string;  // Col 15: e.g. "20" or "0"
  elective3Subject: string;    // Col 17: e.g. "119-BIOLOGY" or "323- Geography"
  elective3Theory: string;     // Col 18: e.g. "37"
  elective3Practical: string;  // Col 19: e.g. "20" or "0"
  additionalSubject: string;   // Col 22: e.g. "121-MATHEMATICS" or "---"
  additionalTheory: string;    // Col 23: e.g. "64" or "---"
  additionalPractical: string; // Col 24: e.g. "24" or "---"
  vocationalSubject: string;   // Col 26: e.g. "---"
  vocationalTheory: string;    // Col 27: e.g. "---"
  vocationalPractical: string; // Col 28: e.g. "---"
  resultStatus: string;        // Col 30: e.g. "SENT-UP"
}

export interface AdmitCardRecord {
  id: string;
  serialNo: number;
  examType: ExamType;
  examYear: string;
  faculty: FacultyType;
  bsebUniqueId: string;
  schoolCode: string;
  schoolName: string;
  studentName: string;
  motherName: string;
  fatherName: string;
  dob: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  maritalStatus: string;
  aadhaarNo: string;
  studentCategory: string; // REGULAR, EX, COMPARTMENTAL, PRIVATE, IMPROVEMENT
  casteCategory: string;   // GENERAL, BC, EBC, SC, ST, N/A
  differentlyAbled: string; // No / Yes
  registrationNo: string;
  rollCode: string;
  rollNumber: string;
  examCenter: string;
  // Subjects
  langSubject1: string;       // MIL - HINDI / 306 - Hindi / 105 - English
  langSubject2: string;       // SIL - SANSKRIT / 305 - English / 106 - Hindi
  compulsorySubject1: string; // Math (10th) or Elective 1 (12th: e.g. 117 - Physics / 319 - Home Science)
  compulsorySubject2: string; // Social Science (10th) or Elective 2 (12th: e.g. 118 - Chemistry / 322 - Political Science)
  compulsorySubject3: string; // Science (10th) or Elective 3 (12th: e.g. 119 - Biology / 323 - Geography)
  compulsorySubject4: string; // English (10th) or empty (12th)
  additionalSubject: string;  // Optional (10th) or Additional Subject (12th: e.g. 121 - Mathematics / 321 - History)
  allSubjectsSummary: string;
  // Subject-wise Marks (keyed by exact subject string, e.g. "306 - Hindi": "78" or "MATHEMATICS": "85")
  subjectMarks?: Record<string, string>;
  // Official BSEB Sent-Up Praptank Panji structured marks (10th 23-col & 12th 30-col)
  matricSentUp?: MatricSentUpMarks;
  interSentUp?: InterSentUpMarks;
  // Media crops from the admit card page
  photoDataUrl?: string;
  signatureDataUrl?: string;
  pagePreviewDataUrl?: string;
  // Provenance
  sourceFileName: string;
  sourcePageNumber: number;
  extractionMethod: 'PDF_TEXT_LAYER' | 'HYBRID_OCR' | 'GEMINI_VISION';
  remarks?: string;
  // Firestore Cloud Sync & Teacher RBAC metadata
  ownerId?: string;
  firestoreDocId?: string;
  assignedTeacherEmails?: string[];
}

export interface TeacherAssignment {
  id: string;
  ownerId: string;
  ownerEmail: string;
  teacherName: string;
  teacherEmail: string;
  schoolCode: string;
  schoolName: string;
  assignedClasses: ExamType[];
  assignedSubjects: string[];
  active: boolean;
}

export interface StudentMarksSummary {
  mainSubjectsCount: number;
  enteredCount: number;
  totalMarks: number;
  maxMarks: number;
  percentage: string;
  division: '1st Division' | '2nd Division' | '3rd Division' | 'Fail / Compartmental' | 'Pending';
  englishMatricMarks?: string;
  additionalSubjectMarks?: string;
}

export interface ExtractionProgress {
  isExtracting: boolean;
  totalFiles: number;
  currentFileIndex: number;
  currentFileName: string;
  totalPagesInFile: number;
  currentPage: number;
  extractedCount: number;
  statusMessage: string;
  errors: string[];
}

export interface FilterState {
  searchQuery: string;
  examType: 'ALL' | ExamType;
  faculty: 'ALL' | FacultyType;
  gender: 'ALL' | 'MALE' | 'FEMALE';
  studentCategory: string;
  casteCategory: string;
  sourceFile: string;
  schoolCode: string;
}

export interface SummaryStats {
  totalStudents: number;
  maleCount: number;
  femaleCount: number;
  matricCount: number;
  interCount: number;
  byFaculty: Record<string, number>;
  byStudentCategory: Record<string, number>;
  byCasteCategory: Record<string, number>;
  bySubject: Record<string, number>;
  bySchool: Record<string, number>;
}
