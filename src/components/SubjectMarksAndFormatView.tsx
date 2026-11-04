import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  Check,
  CheckCircle2,
  Plus,
  Trash2,
  RotateCcw,
  UserPlus,
  UserCheck,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Edit3,
  GraduationCap,
  School,
} from 'lucide-react';
import {
  AdmitCardRecord,
  CustomExcelFormatConfig,
  ExportFormatMode,
  FacultyType,
  InterSentUpMarks,
  MatricSentUpMarks,
} from '../types/admitCard';
import {
  createBlankStudentRecord,
  getEffectiveInterSentUp,
  getEffectiveMatricSentUp,
  parseUploadedExcelTemplateAndMarks,
} from '../utils/marksAndFormat';
import {
  downloadBlankMarksTemplate,
  exportSentUp10thPdf,
  exportSentUp12thPdf,
  exportAbsent12thPdf,
  exportAbsent12thExcel,
  exportVocational12thPdf,
  exportVocational12thExcel,
  exportAbsent10thPdf,
  exportAbsent10thExcel,
  exportVisuallyImpairedSentUp10thPdf,
  exportVisuallyImpairedSentUp10thExcel,
  exportVisuallyImpairedAbsent10thPdf,
  exportVisuallyImpairedAbsent10thExcel,
  exportToExcel,
} from '../utils/exportReports';

interface SubjectMarksAndFormatViewProps {
  records: AdmitCardRecord[];
  customFormat: CustomExcelFormatConfig | null;
  exportMode: ExportFormatMode;
  initialSheetTab?: '12TH_SENTUP' | '10TH_SENTUP' | 'CUSTOM_EXCEL';
  activeModule?: 'INTERMEDIATE' | 'MATRIC';
  onSwitchModule?: (mod: 'INTERMEDIATE' | 'MATRIC') => void;
  onUpdateRecords: (updated: AdmitCardRecord[]) => void;
  onUpdateSingleRecordMark: (recordId: string, subjectName: string, markValue: string) => void;
  onSetCustomFormat: (config: CustomExcelFormatConfig | null) => void;
  onSetExportMode: (mode: ExportFormatMode) => void;
  onDeleteRecord?: (id: string) => void;
  onTriggerAdmitCardUpload?: () => void;
}

const INTER_SUBJECT_SUGGESTIONS = [
  '306-Hindi',
  '305-English',
  '307-Urdu',
  '117-PHYSICS',
  '118-CHEMISTRY',
  '119-BIOLOGY',
  '121-MATHEMATICS',
  '120-AGRICULTURE',
  '318- Music',
  '319- H.Sc.',
  '321- History',
  '322- Pol.Sc.',
  '323- Geography',
  '324- Psychology',
  '325- Sociology',
  '326- Economics',
  '217- Bus. Std.',
  '218- Entp.',
  '219- Economics',
  '220- Account.',
  '---',
];

export const SubjectMarksAndFormatView: React.FC<SubjectMarksAndFormatViewProps> = ({
  records,
  customFormat,
  exportMode,
  initialSheetTab,
  activeModule = 'INTERMEDIATE',
  onSwitchModule,
  onUpdateRecords,
  onSetCustomFormat,
  onSetExportMode,
  onDeleteRecord,
  onTriggerAdmitCardUpload,
}) => {
  const [sheetTab, setSheetTab] = useState<'12TH_SENTUP' | '10TH_SENTUP' | 'CUSTOM_EXCEL'>(
    initialSheetTab ||
      (activeModule === 'MATRIC'
        ? '10TH_SENTUP'
        : exportMode === 'BSEB_10TH_SENTUP'
        ? '10TH_SENTUP'
        : '12TH_SENTUP')
  );

  useEffect(() => {
    if (activeModule === 'INTERMEDIATE') {
      if (sheetTab !== 'CUSTOM_EXCEL') {
        setSheetTab('12TH_SENTUP');
        onSetExportMode('BSEB_12TH_SENTUP');
      }
      setDefaultSchoolCode(records[0]?.schoolCode || '31337');
      setDefaultSchoolName(
        records[0]?.schoolName ||
          'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR'
      );
    } else if (activeModule === 'MATRIC') {
      if (sheetTab !== 'CUSTOM_EXCEL') {
        setSheetTab('10TH_SENTUP');
        onSetExportMode('BSEB_10TH_SENTUP');
      }
      setDefaultSchoolCode(records[0]?.schoolCode || '51803');
      setDefaultSchoolName(records[0]?.schoolName || 'H.S.S. BERUA');
    }
  }, [activeModule]);

  const [defaultSchoolCode, setDefaultSchoolCode] = useState<string>(
    records[0]?.schoolCode || (sheetTab === '10TH_SENTUP' ? '51803' : '31337')
  );
  const [defaultSchoolName, setDefaultSchoolName] = useState<string>(
    records[0]?.schoolName ||
      (sheetTab === '10TH_SENTUP'
        ? 'H.S.S. BERUA'
        : 'UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR')
  );
  const [defaultInterFaculty, setDefaultInterFaculty] = useState<FacultyType>('SCIENCE');
  const [annualYear, setAnnualYear] = useState<string>('2027');
  const [sentUpYear, setSentUpYear] = useState<string>('2026');
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [uploadNotice, setUploadNotice] = useState<string>('');
  const [newColumnHeader, setNewColumnHeader] = useState<string>('');
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const quickStudentNameInputRef = useRef<HTMLInputElement | null>(null);
  const editorCardRef = useRef<HTMLDivElement | null>(null);
  const matricEditorCardRef = useRef<HTMLDivElement | null>(null);
  const firstMarksInputRef = useRef<HTMLInputElement | null>(null);
  const matricFirstMarksInputRef = useRef<HTMLInputElement | null>(null);
  const [advancementToast, setAdvancementToast] = useState<{
    message: string;
    submessage?: string;
    studentName: string;
    index: number;
  } | null>(null);

  const detectedSchools = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    records.forEach((r) => {
      const c = (r.schoolCode || r.rollCode || 'UNKNOWN').trim();
      const n = (r.schoolName || 'UNKNOWN SCHOOL').trim();
      if (!map.has(c)) {
        map.set(c, { code: c, name: n, count: 0 });
      }
      map.get(c)!.count++;
    });
    return Array.from(map.values());
  }, [records]);

  const handleSelectSheetTab = (next: '12TH_SENTUP' | '10TH_SENTUP' | 'CUSTOM_EXCEL') => {
    setSheetTab(next);
    if (next === '12TH_SENTUP') {
      onSetExportMode('BSEB_12TH_SENTUP');
      if (activeModule !== 'INTERMEDIATE') {
        onSwitchModule?.('INTERMEDIATE');
      }
      if (defaultSchoolCode === '51803') setDefaultSchoolCode('31337');
      if (defaultSchoolName === 'H.S.S. BERUA') {
        setDefaultSchoolName('UCHCH MADHYAMIK VIDYALAYA BERUA, GAIGHAT, MUZAFFARPUR');
      }
    } else if (next === '10TH_SENTUP') {
      onSetExportMode('BSEB_10TH_SENTUP');
      if (activeModule !== 'MATRIC') {
        onSwitchModule?.('MATRIC');
      }
      if (defaultSchoolCode === '31337') setDefaultSchoolCode('51803');
      if (defaultSchoolName.includes('UCHCH MADHYAMIK')) {
        setDefaultSchoolName('H.S.S. BERUA');
      }
    } else if (next === 'CUSTOM_EXCEL') {
      onSetExportMode('CUSTOM_UPLOADED');
    }
  };

  // Switch to specific student index with smooth scrolling and input auto-focus
  const goToStudentIndex = (
    nextIdx: number,
    toast?: { message: string; submessage?: string }
  ) => {
    if (nextIdx < 0 || nextIdx >= records.length) return;
    setActiveRowIndex(nextIdx);

    const isMatric = sheetTab === '10TH_SENTUP';
    const cardEl = isMatric ? matricEditorCardRef.current : editorCardRef.current;
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setTimeout(() => {
      const targetStudent = records[nextIdx];
      if (targetStudent?.studentName && targetStudent.studentName.trim() !== '') {
        if (isMatric) {
          matricFirstMarksInputRef.current?.focus();
        } else {
          firstMarksInputRef.current?.focus();
        }
      } else {
        quickStudentNameInputRef.current?.focus();
      }
    }, 60);

    if (toast) {
      const current = records[nextIdx];
      setAdvancementToast({
        message: toast.message,
        submessage: toast.submessage,
        studentName: current?.studentName || `Student #${nextIdx + 1}`,
        index: nextIdx + 1,
      });
      setTimeout(() => {
        setAdvancementToast(null);
      }, 4000);
    }
  };

  // Add 1 or N blank student rows and focus the newly created row
  const handleAddBlankRows = (count: number) => {
    const isMatric = sheetTab === '10TH_SENTUP';
    const examType = isMatric ? 'MATRIC (10th)' : 'INTERMEDIATE (+2)';
    const nextRows: AdmitCardRecord[] = [];
    for (let i = 0; i < count; i++) {
      nextRows.push(
        createBlankStudentRecord(
          records.length + i + 1,
          examType,
          defaultSchoolCode,
          defaultSchoolName,
          isMatric ? 'SECONDARY' : defaultInterFaculty
        )
      );
    }
    const combined = [...records, ...nextRows];
    onUpdateRecords(combined);
    const newIdx = records.length;
    setActiveRowIndex(newIdx);

    const cardEl = isMatric ? matricEditorCardRef.current : editorCardRef.current;
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setTimeout(() => {
      quickStudentNameInputRef.current?.focus();
    }, 60);

    setAdvancementToast({
      message: `✓ Added new student row #${newIdx + 1}`,
      submessage: 'Ready for student details & marks entry',
      studentName: `New Student #${newIdx + 1}`,
      index: newIdx + 1,
    });
    setTimeout(() => setAdvancementToast(null), 3500);
  };

  // Save current student in Quick Form and move to next row (or create a new row if at the end)
  const handleSaveAndNextRow = () => {
    if (records.length === 0) {
      handleAddBlankRows(1);
      return;
    }
    const curStudent = records[safeActiveIdx];
    const curName = curStudent?.studentName || `Student #${safeActiveIdx + 1}`;

    if (safeActiveIdx < records.length - 1) {
      const nextStudent = records[safeActiveIdx + 1];
      const nextName = nextStudent?.studentName || `Student #${safeActiveIdx + 2}`;
      goToStudentIndex(safeActiveIdx + 1, {
        message: `✓ ${curName} Saved!`,
        submessage: `Opening Student #${safeActiveIdx + 2}: ${nextName}`,
      });
    } else {
      // Last student reached - add a new row
      const isMatric = sheetTab === '10TH_SENTUP';
      const examType = isMatric ? 'MATRIC (10th)' : 'INTERMEDIATE (+2)';
      const nextRow = createBlankStudentRecord(
        records.length + 1,
        examType,
        defaultSchoolCode,
        defaultSchoolName,
        isMatric ? 'SECONDARY' : defaultInterFaculty
      );
      const combined = [...records, nextRow];
      onUpdateRecords(combined);
      const newIdx = records.length;
      setActiveRowIndex(newIdx);

      const cardEl = isMatric ? matricEditorCardRef.current : editorCardRef.current;
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      setTimeout(() => {
        quickStudentNameInputRef.current?.focus();
      }, 60);

      setAdvancementToast({
        message: `✓ ${curName} Saved!`,
        submessage: `Added and opened new Student #${newIdx + 1}`,
        studentName: `New Student #${newIdx + 1}`,
        index: newIdx + 1,
      });
      setTimeout(() => setAdvancementToast(null), 3500);
    }
  };

  const handleApplySchoolToAll = () => {
    if (records.length === 0) return;
    const updated = records.map((r) => ({
      ...r,
      schoolCode: defaultSchoolCode,
      rollCode: defaultSchoolCode,
      schoolName: defaultSchoolName,
    }));
    onUpdateRecords(updated);
    setUploadNotice(
      `School Code (${defaultSchoolCode}) aur Name (${defaultSchoolName}) sabhi ${records.length} students par apply ho gaya.`
    );
  };

  const updateStudentField = (
    recordId: string,
    field: keyof AdmitCardRecord,
    value: string
  ) => {
    const updated = records.map((r) => {
      if (r.id !== recordId) return r;
      return {
        ...r,
        [field]: value,
      };
    });
    onUpdateRecords(updated);
  };

  const handleStreamPresetChange = (recordId: string, faculty: FacultyType) => {
    const elec1 =
      faculty === 'SCIENCE'
        ? '117-PHYSICS'
        : faculty === 'COMMERCE'
        ? '217- Bus. Std.'
        : '321- History';
    const elec2 =
      faculty === 'SCIENCE'
        ? '118-CHEMISTRY'
        : faculty === 'COMMERCE'
        ? '218- Entp.'
        : '322- Pol.Sc.';
    const elec3 =
      faculty === 'SCIENCE'
        ? '119-BIOLOGY'
        : faculty === 'COMMERCE'
        ? '220- Account.'
        : '323- Geography';

    const updated = records.map((r) => {
      if (r.id !== recordId) return r;
      const eff = getEffectiveInterSentUp(r);
      return {
        ...r,
        faculty,
        compulsorySubject1: elec1,
        compulsorySubject2: elec2,
        compulsorySubject3: elec3,
        interSentUp: {
          ...eff,
          elective1Subject: elec1,
          elective2Subject: elec2,
          elective3Subject: elec3,
        },
      };
    });
    onUpdateRecords(updated);
  };

  const updateInterSentUpField = (
    recordId: string,
    field: keyof InterSentUpMarks,
    value: string
  ) => {
    const updated = records.map((r) => {
      if (r.id !== recordId) return r;
      const eff = getEffectiveInterSentUp(r);
      const nextInter: InterSentUpMarks = {
        lang1Subject: eff.lang1Subject,
        lang1Marks: eff.lang1Marks,
        lang2Subject: eff.lang2Subject,
        lang2Marks: eff.lang2Marks,
        elective1Subject: eff.elective1Subject,
        elective1Theory: eff.elective1Theory,
        elective1Practical: eff.elective1Practical,
        elective2Subject: eff.elective2Subject,
        elective2Theory: eff.elective2Theory,
        elective2Practical: eff.elective2Practical,
        elective3Subject: eff.elective3Subject,
        elective3Theory: eff.elective3Theory,
        elective3Practical: eff.elective3Practical,
        additionalSubject: eff.additionalSubject,
        additionalTheory: eff.additionalTheory,
        additionalPractical: eff.additionalPractical,
        vocationalSubject: eff.vocationalSubject,
        vocationalTheory: eff.vocationalTheory,
        vocationalPractical: eff.vocationalPractical,
        resultStatus: eff.resultStatus,
        [field]: value,
      };
      return {
        ...r,
        examType: 'INTERMEDIATE (+2)' as const,
        interSentUp: nextInter,
      };
    });
    onUpdateRecords(updated);
  };

  const updateMatricSentUpField = (
    recordId: string,
    field: keyof MatricSentUpMarks,
    value: string
  ) => {
    const updated = records.map((r) => {
      if (r.id !== recordId) return r;
      const eff = getEffectiveMatricSentUp(r);
      const nextMatric: MatricSentUpMarks = {
        milTheory: eff.milTheory,
        silTheory: eff.silTheory,
        matTheory: eff.matTheory,
        sciTheory: eff.sciTheory,
        sscTheory: eff.sscTheory,
        engTheory: eff.engTheory,
        optTheory: eff.optTheory,
        vocTheory: eff.vocTheory,
        sciPractical: eff.sciPractical,
        sscLitAct: eff.sscLitAct,
        sscPrWork: eff.sscPrWork,
        optPractical: eff.optPractical,
        vocPractical: eff.vocPractical,
        [field]: value,
      };
      return {
        ...r,
        examType: 'MATRIC (10th)' as const,
        matricSentUp: nextMatric,
      };
    });
    onUpdateRecords(updated);
  };

  const handleExcelFileUpload = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        setUploadNotice('Error: Uploaded Excel file has no worksheets.');
        return;
      }
      const ws = wb.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(ws, {
        header: 1,
        defval: '',
      });

      const {
        formatConfig,
        updatedRecords,
        matchedStudentCount,
        importedMarksCount,
      } = parseUploadedExcelTemplateAndMarks(rawRows, records, file.name, firstSheetName);

      onSetCustomFormat(formatConfig);
      onSetExportMode('CUSTOM_UPLOADED');

      if (importedMarksCount > 0) {
        onUpdateRecords(updatedRecords);
        setUploadNotice(
          `Format "${file.name}" (${formatConfig.headers.length} columns) saved AND imported ${importedMarksCount} subject marks across ${matchedStudentCount} students.`
        );
      } else {
        setUploadNotice(
          `Custom Excel format "${file.name}" (${formatConfig.headers.length} columns) applied.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to read Excel file';
      setUploadNotice(`Error reading Excel file: ${msg}`);
    }
  };

  const handleAddCustomHeader = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newColumnHeader.trim();
    if (!trimmed) return;
    const baseHeaders = customFormat
      ? customFormat.headers
      : [
          'S.No.',
          'Registration No.',
          'Student Name',
          "Father's Name",
          "Mother's Name",
          'Gender',
          'Language 1 Marks',
          'Language 2 Marks',
          'Subject 1 Marks',
          'Subject 2 Marks',
          'Subject 3 Marks',
          'Total Marks',
          'Result',
        ];
    if (!baseHeaders.includes(trimmed)) {
      const nextConfig: CustomExcelFormatConfig = {
        fileName: customFormat?.fileName || 'Custom_User_Format.xlsx',
        sheetName: customFormat?.sheetName || 'Student_Report',
        headers: [...baseHeaders, trimmed],
        uploadedAt: new Date().toLocaleTimeString(),
      };
      onSetCustomFormat(nextConfig);
      onSetExportMode('CUSTOM_UPLOADED');
    }
    setNewColumnHeader('');
  };

  const safeActiveIdx = Math.min(activeRowIndex, Math.max(0, records.length - 1));
  const activeStudent = records[safeActiveIdx] || null;
  const activeInter = activeStudent ? getEffectiveInterSentUp(activeStudent) : null;
  const activeMatric = activeStudent ? getEffectiveMatricSentUp(activeStudent) : null;

  return (
    <div className="space-y-5">
      <datalist id="bseb-inter-subjects-list">
        {INTER_SUBJECT_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <input
        ref={excelInputRef}
        id="custom-excel-template-input"
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        aria-label="Upload Custom Excel Format or Marks Sheet"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleExcelFileUpload(e.target.files[0]);
            e.target.value = '';
          }
        }}
        className="sr-only"
      />

      {/* Top Studio Control Bar: Flutter Material 3 SegmentedButton + FilledButton Toolbar */}
      <div className="rounded-2xl border border-indigo-100 bg-white p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Dedicated Module Header & Optional Custom Format Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {activeModule === 'INTERMEDIATE' ? (
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-indigo-950">12th Intermediate Sent-Up Panji</h2>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                  <School className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-emerald-950">10th Matric Sent-Up Panji</h2>
              </div>
            )}

            {customFormat && (
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-[#F3F5FC] p-1">
                <button
                  type="button"
                  onClick={() =>
                    handleSelectSheetTab(
                      activeModule === 'INTERMEDIATE' ? '12TH_SENTUP' : '10TH_SENTUP'
                    )
                  }
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    sheetTab !== 'CUSTOM_EXCEL'
                      ? activeModule === 'INTERMEDIATE'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {sheetTab !== 'CUSTOM_EXCEL' && <Check className="h-3 w-3" />}
                  <span>{activeModule === 'INTERMEDIATE' ? '30-Col Panji' : '23-Col Panji'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSheetTab('CUSTOM_EXCEL')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    sheetTab === 'CUSTOM_EXCEL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {sheetTab === 'CUSTOM_EXCEL' && <Check className="h-3 w-3" />}
                  <span>Custom Excel</span>
                </button>
              </div>
            )}
          </div>

          {/* Primary Action & Download Toolbar (Flutter FilledButton & FilledButton.tonal) */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto">
            {onTriggerAdmitCardUpload && (
              <button
                type="button"
                onClick={onTriggerAdmitCardUpload}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleAddBlankRows(1)}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+1 Student</span>
            </button>

            <button
              type="button"
              onClick={() => handleAddBlankRows(5)}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+5 Rows</span>
            </button>

            {sheetTab === '12TH_SENTUP' ? (
              <>
                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportToExcel(records, {
                      mode: 'BSEB_12TH_SENTUP',
                      customFormat,
                      filenamePrefix: `12th_Sent-Up_Exam.-${sentUpYear}_Annual-${annualYear}`,
                      annualYear,
                      sentUpYear,
                    })
                  }
                  title="Download 30-Column 12th Sent-Up Excel Panji"
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>12th Excel</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportSentUp12thPdf(
                      records,
                      `12th_Sent-Up_Exam.-${sentUpYear}_Annual-${annualYear}`,
                      { annualYear, sentUpYear }
                    )
                  }
                  title="Download 30-Column 12th Sent-Up PDF Panji (90° Rotated)"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1E1B4B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-950 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>12th PDF</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportAbsent12thPdf(
                      records,
                      `12th_Absent_Students_Exam-${sentUpYear}_Annual-${annualYear}`,
                      { annualYear, sentUpYear }
                    )
                  }
                  title="Download Absent / Non Sent-Up Students PDF Report (Grouped by Faculty: Science, Arts, Commerce)"
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Absent PDF</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportAbsent12thExcel(records, {
                      annualYear,
                      sentUpYear,
                      filenamePrefix: `12th_Absent_Students_Exam-${sentUpYear}_Annual-${annualYear}`,
                    })
                  }
                  title="Download Absent / Non Sent-Up Students Excel Report"
                  className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Absent Excel</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportVocational12thPdf(
                      records,
                      `12th_Vocational_Exam-${sentUpYear}_Annual-${annualYear}`,
                      { annualYear, sentUpYear }
                    )
                  }
                  title="Download 24-Column Vocational Stream Sent-Up PDF Panji"
                  className="inline-flex items-center gap-1.5 rounded-full bg-purple-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-900 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Vocational PDF</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportVocational12thExcel(records, {
                      annualYear,
                      sentUpYear,
                      filenamePrefix: `12th_Vocational_Exam-${sentUpYear}_Annual-${annualYear}`,
                    })
                  }
                  title="Download 24-Column Vocational Stream Sent-Up Excel Panji"
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Vocational Excel</span>
                </button>
              </>
            ) : sheetTab === '10TH_SENTUP' ? (
              <>
                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportToExcel(records, {
                      mode: 'BSEB_10TH_SENTUP',
                      customFormat,
                      filenamePrefix: `10th_Sent-Up_Exam.-${sentUpYear}_BSEB`,
                      annualYear,
                      sentUpYear,
                    })
                  }
                  title="Download 23-Column 10th Sent-Up Excel Panji"
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>10th Excel</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportSentUp10thPdf(
                      records,
                      `10th_Sent-Up_Exam.-${sentUpYear}_BSEB`,
                      { annualYear, sentUpYear }
                    )
                  }
                  title="Download 23-Column 10th Sent-Up PDF Panji (90° Rotated)"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1E1B4B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-950 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>10th PDF</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportAbsent10thPdf(
                      records,
                      `10th_Absent_Students_Exam-${sentUpYear}_Annual-${annualYear}`,
                      { annualYear, sentUpYear }
                    )
                  }
                  title="Download 24-Column Matric Absent / Non Sent-Up Students PDF (Form iii)"
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Absent PDF</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportAbsent10thExcel(records, {
                      annualYear,
                      sentUpYear,
                      filenamePrefix: `10th_Absent_Students_Exam-${sentUpYear}_Annual-${annualYear}`,
                    })
                  }
                  title="Download 24-Column Matric Absent / Non Sent-Up Students Excel"
                  className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Absent Excel</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportVisuallyImpairedSentUp10thPdf(
                      records,
                      `10th_Visually_Impaired_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`,
                      { annualYear, sentUpYear }
                    )
                  }
                  title="Download 23-Column Visually Impaired Sent-Up PDF (Form ii)"
                  className="inline-flex items-center gap-1.5 rounded-full bg-purple-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-900 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Blind Sent-Up PDF</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportVisuallyImpairedSentUp10thExcel(records, {
                      annualYear,
                      sentUpYear,
                      filenamePrefix: `10th_Visually_Impaired_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`,
                    })
                  }
                  title="Download 23-Column Visually Impaired Sent-Up Excel"
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Blind Sent-Up Excel</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportVisuallyImpairedAbsent10thPdf(
                      records,
                      `10th_Visually_Impaired_Non_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`,
                      { annualYear, sentUpYear }
                    )
                  }
                  title="Download 24-Column Visually Impaired Absent / Non Sent-Up PDF (Form iii)"
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Blind Absent PDF</span>
                </button>

                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() =>
                    exportVisuallyImpairedAbsent10thExcel(records, {
                      annualYear,
                      sentUpYear,
                      filenamePrefix: `10th_Visually_Impaired_Non_Sent-up_Exam-${sentUpYear}_Annual-${annualYear}`,
                    })
                  }
                  title="Download 24-Column Visually Impaired Absent / Non Sent-Up Excel"
                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-900 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Blind Absent Excel</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={records.length === 0}
                onClick={() =>
                  exportToExcel(records, {
                    mode: exportMode,
                    customFormat,
                    filenamePrefix: `BSEB_Custom_Report_${sentUpYear}`,
                    annualYear,
                    sentUpYear,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>
            )}
          </div>
        </div>

        {/* School / College Details & Exam Year Bar */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-200 grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
          {detectedSchools.length > 1 && (
            <div className="sm:col-span-12 rounded-xl bg-indigo-50 border border-indigo-200 p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-indigo-950 font-semibold">
                <School className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Multi-School Dataset Detected:</strong> {detectedSchools.length} distinct school codes in loaded records.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 font-medium">Quick set header:</span>
                {detectedSchools.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => {
                      setDefaultSchoolCode(s.code);
                      if (s.name && s.name !== 'UNKNOWN SCHOOL') setDefaultSchoolName(s.name);
                    }}
                    className="rounded-md border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100 shadow-2xs"
                  >
                    Code {s.code} ({s.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sm:col-span-2">
            <label
              htmlFor="panji-school-code"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              {sheetTab === '10TH_SENTUP' ? 'School Code' : '+2 School/College Code'}
            </label>
            <input
              id="panji-school-code"
              type="text"
              value={defaultSchoolCode}
              onChange={(e) => setDefaultSchoolCode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50/60 px-3 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div className={sheetTab === '12TH_SENTUP' ? 'sm:col-span-4' : 'sm:col-span-6'}>
            <label
              htmlFor="panji-school-name"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              {sheetTab === '10TH_SENTUP'
                ? 'School / +2 School Name'
                : '+2 School / College Name'}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="panji-school-name"
                type="text"
                value={defaultSchoolName}
                onChange={(e) => setDefaultSchoolName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50/60 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
              {records.length > 0 && (
                <button
                  type="button"
                  onClick={handleApplySchoolToAll}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Apply All
                </button>
              )}
            </div>
          </div>

          {sheetTab === '12TH_SENTUP' && (
            <div className="sm:col-span-2">
              <label
                htmlFor="default-inter-stream"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Default Stream
              </label>
              <select
                id="default-inter-stream"
                value={defaultInterFaculty}
                onChange={(e) => setDefaultInterFaculty(e.target.value as FacultyType)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50/60 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
              >
                <option value="SCIENCE">Science</option>
                <option value="ARTS">Arts</option>
                <option value="COMMERCE">Commerce</option>
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label
              htmlFor="panji-annual-year"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
              title="वार्षिक परीक्षा वर्ष (Annual Exam Year)"
            >
              Annual Exam Year
            </label>
            <input
              id="panji-annual-year"
              type="text"
              value={annualYear}
              onChange={(e) => setAnnualYear(e.target.value)}
              placeholder="2027"
              className="w-full rounded-lg border border-slate-300 bg-slate-50/60 px-3 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="panji-sentup-year"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
              title="उत्प्रेषण (Sent-Up)/जाँच परीक्षा वर्ष"
            >
              Sent-Up Year
            </label>
            <input
              id="panji-sentup-year"
              type="text"
              value={sentUpYear}
              onChange={(e) => setSentUpYear(e.target.value)}
              placeholder="2026"
              className="w-full rounded-lg border border-slate-300 bg-slate-50/60 px-3 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {uploadNotice && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-900">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>{uploadNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadNotice('')}
              className="text-xs text-emerald-700 underline hover:text-emerald-900 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Empty State when 0 records exist */}
      {records.length === 0 && sheetTab !== 'CUSTOM_EXCEL' && (
        <div className="rounded-2xl border border-indigo-100 bg-white p-8 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <UserPlus className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">
            {sheetTab === '10TH_SENTUP' ? '10th Sent-Up Marks Entry' : '12th Sent-Up Marks Entry'}
          </h3>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => handleAddBlankRows(5)}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>+ Add 5 Rows</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddBlankRows(1)}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" />
              <span>+ Add 1 Student</span>
            </button>
            {onTriggerAdmitCardUpload && (
              <button
                type="button"
                onClick={onTriggerAdmitCardUpload}
                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/70 px-4 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
              >
                <Upload className="h-4 w-4" />
                <span>Upload Admit Card PDF</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          12TH SENT-UP DATA ENTRY:
          1. Clean Focused Student & Marks Entry Card (Zero Horizontal Scroll)
          2. Official 30-Column BSEB Praptank Panji Sheet Below
         ===================================================================== */}
      {sheetTab === '12TH_SENTUP' && records.length > 0 && activeStudent && activeInter && (
        <div className="space-y-5">
          {/* Card 1: Clean Single-Screen Student & Marks Editor for Active Row */}
          <div ref={editorCardRef} className="rounded-2xl border border-indigo-100 bg-white shadow-xs overflow-hidden scroll-mt-20">
            {/* Real-time Advancement / Save Notification Banner */}
            {advancementToast && (
              <div className="bg-emerald-600 px-3.5 sm:px-5 py-2 text-white text-xs font-semibold flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" />
                  <span className="font-bold">{advancementToast.message}</span>
                  {advancementToast.submessage && (
                    <span className="text-emerald-100 hidden sm:inline truncate">— {advancementToast.submessage}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancementToast(null)}
                  className="text-emerald-200 hover:text-white text-xs shrink-0 ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/10 bg-[#283593] px-3.5 sm:px-5 py-2.5 sm:py-3 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-6 items-center rounded-md bg-white/20 px-2 font-mono text-xs font-bold shrink-0">
                  #{safeActiveIdx + 1}/{records.length}
                </span>
                <span className="text-xs font-semibold text-indigo-100 truncate">
                  {activeStudent.studentName || 'New Student'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={safeActiveIdx === 0}
                  onClick={() => goToStudentIndex(Math.max(0, safeActiveIdx - 1))}
                  className="rounded-full border border-white/25 bg-white/10 px-2.5 sm:px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndNextRow}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 shadow-xs"
                >
                  <span>
                    {safeActiveIdx < records.length - 1 ? `Next Student #${safeActiveIdx + 2} →` : '+ Add Next'}
                  </span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Horizontal Student Quick-Select Chips Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-3.5 sm:px-5 py-2 bg-slate-50 border-b border-indigo-100 scrollbar-none">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
                Students ({records.length}):
              </span>
              {records.map((rec, i) => {
                const isCurrent = i === safeActiveIdx;
                const eff = getEffectiveInterSentUp(rec);
                const hasMarks = eff.aggregate && eff.aggregate !== '0' && eff.aggregate !== '';
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => goToStudentIndex(i)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                      isCurrent
                        ? 'bg-[#283593] text-white shadow-xs ring-2 ring-indigo-300'
                        : hasMarks
                        ? 'bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>#{i + 1} {rec.studentName ? rec.studentName.split(' ')[0] : `Student ${i + 1}`}</span>
                    {hasMarks ? (
                      <span className={`text-[10px] px-1 rounded font-mono font-bold ${isCurrent ? 'bg-white/20' : 'bg-emerald-200 text-emerald-950'}`}>
                        {eff.aggregate}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">···</span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => handleAddBlankRows(1)}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-3 w-3" />
                <span>New</span>
              </button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-4 sm:space-y-5">
              {/* Row A: Student Identity */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. R-313370001-24"
                    value={activeStudent.registrationNo}
                    onChange={(e) =>
                      updateStudentField(activeStudent.id, 'registrationNo', e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Student&apos;s Name
                  </label>
                  <input
                    ref={quickStudentNameInputRef}
                    type="text"
                    placeholder="e.g. ANISHA KUMARI"
                    value={activeStudent.studentName}
                    onChange={(e) =>
                      updateStudentField(
                        activeStudent.id,
                        'studentName',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Father&apos;s Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. RAJ KUMAR SINGH"
                    value={activeStudent.fatherName}
                    onChange={(e) =>
                      updateStudentField(
                        activeStudent.id,
                        'fatherName',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mother&apos;s Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PUTUL DEVI"
                    value={activeStudent.motherName}
                    onChange={(e) =>
                      updateStudentField(
                        activeStudent.id,
                        'motherName',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Gender (M / F)
                  </label>
                  <select
                    value={activeStudent.gender === 'MALE' ? 'MALE' : 'FEMALE'}
                    onChange={(e) =>
                      updateStudentField(activeStudent.id, 'gender', e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
                  >
                    <option value="FEMALE">F (Female)</option>
                    <option value="MALE">M (Male)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Faculty / Stream Subjects
                  </label>
                  <select
                    value={activeStudent.faculty}
                    onChange={(e) =>
                      handleStreamPresetChange(
                        activeStudent.id,
                        e.target.value as FacultyType
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900"
                  >
                    <option value="SCIENCE">Science (Phy/Chem/Bio)</option>
                    <option value="ARTS">Arts (Hist/Pol/Geog)</option>
                    <option value="COMMERCE">Commerce (Bus/Entp/Acct)</option>
                  </select>
                </div>
              </div>

              {/* Row B: 12th Marks Entry Cards */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
                {/* Box 1: Compulsory Languages */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                  <div className="truncate whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                    Compulsory Languages
                  </div>
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-8">
                      <label className="block text-[10px] text-slate-500">Language 1</label>
                      <input
                        type="text"
                        list="bseb-inter-subjects-list"
                        value={activeInter.lang1Subject}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'lang1Subject',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-500">Theory Marks</label>
                      <input
                        ref={firstMarksInputRef}
                        type="text"
                        inputMode="numeric"
                        placeholder="0-100"
                        value={activeInter.lang1Marks}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'lang1Marks',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-8">
                      <label className="block text-[10px] text-slate-500">Language 2</label>
                      <input
                        type="text"
                        list="bseb-inter-subjects-list"
                        value={activeInter.lang2Subject}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'lang2Subject',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-500">Theory Marks</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0-100"
                        value={activeInter.lang2Marks}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'lang2Marks',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Box 2: Elective Subject 1 */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-1 border-b border-slate-200 pb-1">
                    <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Elective 1
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold text-emerald-700">
                      Tot: {activeInter.elective1Total && activeInter.elective1Total !== '---' ? activeInter.elective1Total : '—'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Subject Name</label>
                    <input
                      type="text"
                      list="bseb-inter-subjects-list"
                      value={activeInter.elective1Subject}
                      onChange={(e) =>
                        updateInterSentUpField(
                          activeStudent.id,
                          'elective1Subject',
                          e.target.value
                        )
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Theory</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Th."
                        value={activeInter.elective1Theory}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'elective1Theory',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Practical</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Pr."
                        value={activeInter.elective1Practical}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'elective1Practical',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Box 3: Elective Subject 2 */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-1 border-b border-slate-200 pb-1">
                    <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Elective 2
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold text-emerald-700">
                      Tot: {activeInter.elective2Total && activeInter.elective2Total !== '---' ? activeInter.elective2Total : '—'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Subject Name</label>
                    <input
                      type="text"
                      list="bseb-inter-subjects-list"
                      value={activeInter.elective2Subject}
                      onChange={(e) =>
                        updateInterSentUpField(
                          activeStudent.id,
                          'elective2Subject',
                          e.target.value
                        )
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Theory</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Th."
                        value={activeInter.elective2Theory}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'elective2Theory',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Practical</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Pr."
                        value={activeInter.elective2Practical}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'elective2Practical',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Box 4: Elective Subject 3 */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-1 border-b border-slate-200 pb-1">
                    <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Elective 3
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold text-emerald-700">
                      Tot: {activeInter.elective3Total && activeInter.elective3Total !== '---' ? activeInter.elective3Total : '—'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Subject Name</label>
                    <input
                      type="text"
                      list="bseb-inter-subjects-list"
                      value={activeInter.elective3Subject}
                      onChange={(e) =>
                        updateInterSentUpField(
                          activeStudent.id,
                          'elective3Subject',
                          e.target.value
                        )
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Theory</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Th."
                        value={activeInter.elective3Theory}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'elective3Theory',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Practical</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Pr."
                        value={activeInter.elective3Practical}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'elective3Practical',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Box 5: Additional Subject */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-1 border-b border-slate-200 pb-1">
                    <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Additional Subject
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold text-slate-700">
                      Tot: {activeInter.additionalTotal && activeInter.additionalTotal !== '---' ? activeInter.additionalTotal : '—'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Subject Name</label>
                    <input
                      type="text"
                      list="bseb-inter-subjects-list"
                      placeholder="---"
                      value={activeInter.additionalSubject}
                      onChange={(e) =>
                        updateInterSentUpField(
                          activeStudent.id,
                          'additionalSubject',
                          e.target.value
                        )
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Theory</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="---"
                        value={activeInter.additionalTheory}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'additionalTheory',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Practical</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="---"
                        value={activeInter.additionalPractical}
                        onChange={(e) =>
                          updateInterSentUpField(
                            activeStudent.id,
                            'additionalPractical',
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                {/* Box 6: Aggregate & Result Status */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 border-b border-emerald-200 pb-1">
                      Aggregate Total
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-xs font-semibold text-emerald-800">Total (500):</span>
                      <span className="font-mono text-2xl font-bold tabular-nums text-emerald-950">
                        {activeInter.aggregate || '0'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-emerald-200/80">
                    <label className="block text-[10px] font-semibold text-emerald-800 mb-1">
                      Result Status
                    </label>
                    <select
                      value={activeInter.resultStatus || 'SENT-UP'}
                      onChange={(e) =>
                        updateInterSentUpField(
                          activeStudent.id,
                          'resultStatus',
                          e.target.value
                        )
                      }
                      className="w-full rounded border border-emerald-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                    >
                      <option value="SENT-UP">SENT-UP</option>
                      <option value="ABSENT">ABSENT</option>
                      <option value="NOT SENT-UP">NOT SENT-UP</option>
                    </select>

                    <button
                      type="button"
                      onClick={handleSaveAndNextRow}
                      className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs py-2 px-3 shadow-xs transition-all"
                    >
                      <span>
                        {safeActiveIdx < records.length - 1
                          ? `Complete & Open Student #${safeActiveIdx + 2} →`
                          : '+ Save & Add Next Student'}
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Row C: Prominent Mobile & Desktop Bottom Navigation Action Bar */}
              <div className="mt-5 pt-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/80 -mx-3.5 -mb-3.5 sm:-mx-5 sm:-mb-5 p-3.5 sm:p-5 rounded-b-2xl">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="h-9 w-9 rounded-full bg-[#283593] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                    #{safeActiveIdx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-2 truncate">
                      <span>Student {safeActiveIdx + 1} of {records.length}: {activeStudent.studentName || 'New Student'}</span>
                      {activeInter.aggregate && activeInter.aggregate !== '0' && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          <Check className="h-3 w-3" /> Completed
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Total Marks: <strong className="text-emerald-700">{activeInter.aggregate || '0'} / 500</strong> · Status: <span className="font-semibold text-slate-700">{activeInter.resultStatus || 'SENT-UP'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    disabled={safeActiveIdx === 0}
                    onClick={() => goToStudentIndex(Math.max(0, safeActiveIdx - 1))}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Prev Student</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndNextRow}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all"
                  >
                    <span>
                      {safeActiveIdx < records.length - 1
                        ? `Save & Open Student #${safeActiveIdx + 2} (अगला छात्र) →`
                        : '+ Save & Add Next Student'}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Official BSEB 12th Sent-Up Praptank Panji Sheet (30 Columns Preview & Inline Table) */}
          <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
            {/* Official BSEB Patna Header Box */}
            <div className="border-b border-slate-300 bg-slate-50 px-5 py-3 text-center">
              <div className="text-sm font-bold tracking-wide text-slate-900">
                BIHAR SCHOOL EXAMINATION BOARD, PATNA
              </div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">
                इन्टरमीडिएट वार्षिक परीक्षा, {annualYear} में सम्मिलित होने वाले नियमित, स्वतन्त्र एवं क्वालिफाईंग कोटि के परीक्षार्थियों के उत्प्रेषण (Sent-up)/जाँच परीक्षा, {sentUpYear} का प्राप्तांक पंजी
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs text-slate-800">
                <div>
                  <span>+2 School/College Code :- </span>
                  <strong className="font-mono">{defaultSchoolCode}</strong>
                  <span className="mx-3 text-slate-300">|</span>
                  <span>+2 School/College Name :- </span>
                  <strong>{defaultSchoolName}</strong>
                </div>
                <div className="text-[11px] text-slate-500">
                  Click any row below to edit in the top card, or type directly inside the table cells
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-center text-[11px]">
                <thead>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-b border-slate-300 text-[10px]">
                    <th rowSpan={3} className="sticky left-0 z-10 bg-slate-100 border-r border-slate-300 px-2 py-2 w-9">
                      Sl.
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-1.5 py-2 w-12">
                      <span className="rotate-90-ccw">Registration Number</span>
                    </th>
                    <th rowSpan={3} className="sticky left-9 z-10 bg-slate-100 border-r border-slate-300 px-2.5 py-2 min-w-[165px] text-left">
                      Student&apos;s Name / Father / Mother
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-1.5 py-2 w-10">
                      M/F
                    </th>
                    <th colSpan={4} className="border-r border-b border-slate-300 px-2 py-1 bg-indigo-50/70 text-indigo-950">
                      Compulsory Language Subjects
                    </th>
                    <th colSpan={12} className="border-r border-b border-slate-300 px-2 py-1 bg-slate-100">
                      Elective Subjects (Theory + Practical = Total)
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-1 py-2 w-11 bg-emerald-50 text-emerald-950">
                      <span className="rotate-90-ccw">Aggregate &amp; Result</span>
                    </th>
                    <th colSpan={4} className="border-r border-b border-slate-300 px-2 py-1 bg-indigo-50/50">
                      Additional Subject
                    </th>
                    <th colSpan={4} className="border-r border-b border-slate-300 px-2 py-1 bg-slate-100">
                      Vocational Subject
                    </th>
                    <th rowSpan={3} className="px-2 py-2 min-w-[85px]">
                      <span className="rotate-90-ccw">Result</span>
                    </th>
                  </tr>
                  <tr className="bg-slate-50 font-semibold text-slate-700 border-b border-slate-300 text-[10px]">
                    <th colSpan={4} className="border-r border-slate-300 py-1">Marks Obtained</th>
                    <th colSpan={12} className="border-r border-slate-300 py-1">Marks Obtained</th>
                    <th colSpan={4} className="border-r border-slate-300 py-1">Marks Obtained</th>
                    <th colSpan={4} className="border-r border-slate-300 py-1">Marks Obtained</th>
                  </tr>
                  <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300 text-[10px] h-20">
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Subject-1</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Marks</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Subject-2</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Marks</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Subject-1</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Theory</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Practical</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10 bg-slate-200/70"><span className="rotate-90-ccw">Total</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Subject-2</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Theory</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Practical</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10 bg-slate-200/70"><span className="rotate-90-ccw">Total</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Subject-3</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Theory</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10"><span className="rotate-90-ccw">Practical</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-10 bg-slate-200/70"><span className="rotate-90-ccw">Total</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Add. Sub.</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Theory</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Practical</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9 bg-slate-200/70"><span className="rotate-90-ccw">Total</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Add. Sub.</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Theory</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9"><span className="rotate-90-ccw">Practical</span></th>
                    <th className="border-r border-slate-300 px-1 py-1.5 w-9 bg-slate-200/70"><span className="rotate-90-ccw">Total</span></th>
                  </tr>
                  <tr className="bg-slate-200 font-mono text-[10px] font-bold text-slate-700 border-b border-slate-300">
                    {Array.from({ length: 30 }, (_, i) => (
                      <th
                        key={i + 1}
                        className={`border-r border-slate-300 py-0.5 ${
                          i === 0 ? 'sticky left-0 z-10 bg-slate-200' : i === 2 ? 'sticky left-9 z-10 bg-slate-200' : ''
                        }`}
                      >
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {records.map((rec, idx) => {
                    const s = getEffectiveInterSentUp(rec);
                    const isSelected = idx === safeActiveIdx;
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => setActiveRowIndex(idx)}
                        className={`cursor-pointer transition-colors align-middle ${
                          isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Col 1: Sl. No. */}
                        <td
                          className={`sticky left-0 z-10 border-r border-slate-300 px-1.5 py-2 font-mono font-bold ${
                            isSelected ? 'bg-indigo-100 text-indigo-950' : 'bg-white text-slate-700'
                          }`}
                        >
                          {idx + 1}
                        </td>

                        {/* Col 2: Registration Number (90° Vertical) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 font-mono text-[10px] font-bold text-slate-900">
                          <span className="rotate-90-ccw">
                            {rec.registrationNo || 'R-31337-24'}
                          </span>
                        </td>

                        {/* Col 3: Sticky Student / Father / Mother Name */}
                        <td
                          className={`sticky left-9 z-10 border-r border-slate-300 px-2 py-1.5 text-left ${
                            isSelected ? 'bg-indigo-50/90' : 'bg-white'
                          }`}
                        >
                          <div className="font-bold text-slate-900 text-[11px] leading-tight">
                            {rec.studentName || (
                              <span className="text-slate-400 italic">Click to enter name...</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600 leading-tight mt-0.5">
                            {rec.fatherName || '—'}
                          </div>
                          <div className="text-[10px] text-slate-500 leading-tight">
                            {rec.motherName || '—'}
                          </div>
                        </td>

                        {/* Col 4: M/F */}
                        <td className="border-r border-slate-300 px-1 py-1 font-mono font-bold text-slate-900">
                          {rec.gender === 'MALE' ? 'M' : 'F'}
                        </td>

                        {/* Col 5 & 6: Lang 1 (Subject Name rotated 90 degrees!) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 text-[10px] font-bold text-indigo-950 bg-indigo-50/25">
                          <span className="rotate-90-ccw">{s.lang1Subject}</span>
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="—"
                            aria-label={`Row ${idx + 1} Compulsory Subject 1 Marks`}
                            value={s.lang1Marks}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'lang1Marks', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>

                        {/* Col 7 & 8: Lang 2 (Subject Name rotated 90 degrees!) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 text-[10px] font-bold text-indigo-950 bg-indigo-50/25">
                          <span className="rotate-90-ccw">{s.lang2Subject}</span>
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="—"
                            aria-label={`Row ${idx + 1} Compulsory Subject 2 Marks`}
                            value={s.lang2Marks}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'lang2Marks', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>

                        {/* Col 9..12: Elective 1 (Subject Name rotated 90 degrees!) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 text-[10px] font-bold text-slate-900 bg-slate-50/60">
                          <span className="rotate-90-ccw">{s.elective1Subject}</span>
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="—"
                            aria-label={`Row ${idx + 1} Elective 1 Theory`}
                            value={s.elective1Theory}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'elective1Theory', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`Row ${idx + 1} Elective 1 Practical`}
                            value={s.elective1Practical}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'elective1Practical', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 bg-slate-100/80 px-1 py-1 font-mono text-xs font-bold tabular-nums text-slate-900">
                          {s.elective1Total || '---'}
                        </td>

                        {/* Col 13..16: Elective 2 (Subject Name rotated 90 degrees!) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 text-[10px] font-bold text-slate-900 bg-slate-50/60">
                          <span className="rotate-90-ccw">{s.elective2Subject}</span>
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="—"
                            aria-label={`Row ${idx + 1} Elective 2 Theory`}
                            value={s.elective2Theory}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'elective2Theory', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`Row ${idx + 1} Elective 2 Practical`}
                            value={s.elective2Practical}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'elective2Practical', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 bg-slate-100/80 px-1 py-1 font-mono text-xs font-bold tabular-nums text-slate-900">
                          {s.elective2Total || '---'}
                        </td>

                        {/* Col 17..20: Elective 3 (Subject Name rotated 90 degrees!) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 text-[10px] font-bold text-slate-900 bg-slate-50/60">
                          <span className="rotate-90-ccw">{s.elective3Subject}</span>
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="—"
                            aria-label={`Row ${idx + 1} Elective 3 Theory`}
                            value={s.elective3Theory}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'elective3Theory', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 p-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`Row ${idx + 1} Elective 3 Practical`}
                            value={s.elective3Practical}
                            onChange={(e) =>
                              updateInterSentUpField(rec.id, 'elective3Practical', e.target.value)
                            }
                            className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 bg-slate-100/80 px-1 py-1 font-mono text-xs font-bold tabular-nums text-slate-900">
                          {s.elective3Total || '---'}
                        </td>

                        {/* Col 21: Aggregate */}
                        <td className="border-r border-slate-300 bg-emerald-50/90 px-1.5 py-1 font-mono text-xs font-bold tabular-nums text-emerald-950">
                          {s.aggregate || '---'}
                        </td>

                        {/* Col 22..25: Additional (Subject Name rotated 90 degrees!) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 text-[10px] font-semibold text-slate-700">
                          <span className="rotate-90-ccw">{s.additionalSubject || '---'}</span>
                        </td>
                        <td className="border-r border-slate-300 px-1 py-1 font-mono text-xs text-slate-600">
                          {s.additionalTheory || '---'}
                        </td>
                        <td className="border-r border-slate-300 px-1 py-1 font-mono text-xs text-slate-600">
                          {s.additionalPractical || '---'}
                        </td>
                        <td className="border-r border-slate-300 bg-slate-50 px-1 py-1 font-mono text-xs font-semibold text-slate-700">
                          {s.additionalTotal}
                        </td>

                        {/* Col 26..29: Vocational (Subject Name rotated 90 degrees!) */}
                        <td className="border-r border-slate-300 px-1 py-1.5 text-[10px] text-slate-400">
                          <span className="rotate-90-ccw">{s.vocationalSubject || '---'}</span>
                        </td>
                        <td className="border-r border-slate-300 px-1 py-1 text-slate-400">
                          {s.vocationalTheory || '---'}
                        </td>
                        <td className="border-r border-slate-300 px-1 py-1 text-slate-400">
                          {s.vocationalPractical || '---'}
                        </td>
                        <td className="border-r border-slate-300 bg-slate-50 px-1 py-1 text-slate-400">
                          {s.vocationalTotal}
                        </td>

                        {/* Col 30: Result & Actions */}
                        <td className="px-1.5 py-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[10px] font-bold text-slate-900">
                              {s.resultStatus || 'SENT-UP'}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveRowIndex(idx);
                                  quickStudentNameInputRef.current?.focus();
                                }}
                                title="Edit student in top form"
                                className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              {onDeleteRecord && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteRecord(rec.id);
                                  }}
                                  title="Delete row"
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          10TH SENT-UP DATA ENTRY:
          1. Clean Focused Student & Marks Entry Card (Zero Horizontal Scroll)
          2. Official 23-Column BSEB Matric Praptank Panji Sheet Below
         ===================================================================== */}
      {sheetTab === '10TH_SENTUP' && records.length > 0 && activeStudent && activeMatric && (
        <div className="space-y-5">
          {/* Card 1: Clean Single-Screen 10th Student & Marks Editor */}
          <div ref={matricEditorCardRef} className="rounded-2xl border border-indigo-100 bg-white shadow-xs overflow-hidden scroll-mt-20">
            {/* Real-time Advancement / Save Notification Banner */}
            {advancementToast && (
              <div className="bg-emerald-600 px-3.5 sm:px-5 py-2 text-white text-xs font-semibold flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" />
                  <span className="font-bold">{advancementToast.message}</span>
                  {advancementToast.submessage && (
                    <span className="text-emerald-100 hidden sm:inline truncate">— {advancementToast.submessage}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancementToast(null)}
                  className="text-emerald-200 hover:text-white text-xs shrink-0 ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/10 bg-[#283593] px-3.5 sm:px-5 py-2.5 sm:py-3 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-6 items-center rounded-md bg-white/20 px-2 font-mono text-xs font-bold shrink-0">
                  #{safeActiveIdx + 1}/{records.length}
                </span>
                <span className="text-xs font-semibold text-indigo-100 truncate">
                  {activeStudent.studentName || 'New 10th Student'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={safeActiveIdx === 0}
                  onClick={() => goToStudentIndex(Math.max(0, safeActiveIdx - 1))}
                  className="rounded-full border border-white/25 bg-white/10 px-2.5 sm:px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndNextRow}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400 shadow-xs"
                >
                  <span>
                    {safeActiveIdx < records.length - 1 ? `Next Student #${safeActiveIdx + 2} →` : '+ Add Next'}
                  </span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Horizontal Student Quick-Select Chips Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-3.5 sm:px-5 py-2 bg-slate-50 border-b border-indigo-100 scrollbar-none">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
                Students ({records.length}):
              </span>
              {records.map((rec, i) => {
                const isCurrent = i === safeActiveIdx;
                const eff = getEffectiveMatricSentUp(rec);
                const hasMarks = eff.aggregate && eff.aggregate !== '0' && eff.aggregate !== '';
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => goToStudentIndex(i)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                      isCurrent
                        ? 'bg-[#283593] text-white shadow-xs ring-2 ring-indigo-300'
                        : hasMarks
                        ? 'bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>#{i + 1} {rec.studentName ? rec.studentName.split(' ')[0] : `Student ${i + 1}`}</span>
                    {hasMarks ? (
                      <span className={`text-[10px] px-1 rounded font-mono font-bold ${isCurrent ? 'bg-white/20' : 'bg-emerald-200 text-emerald-950'}`}>
                        {eff.aggregate}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">···</span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => handleAddBlankRows(1)}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-3 w-3" />
                <span>New</span>
              </button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-4">
              {/* Row A: 10th Student Identity */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Registration No. &amp; Year
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 51803-00001-25"
                    value={activeStudent.registrationNo}
                    onChange={(e) =>
                      updateStudentField(activeStudent.id, 'registrationNo', e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Student Name
                  </label>
                  <input
                    ref={quickStudentNameInputRef}
                    type="text"
                    placeholder="e.g. SIPANCHU KUMARI"
                    value={activeStudent.studentName}
                    onChange={(e) =>
                      updateStudentField(
                        activeStudent.id,
                        'studentName',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mother&apos;s Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. RIBHA DEVI"
                    value={activeStudent.motherName}
                    onChange={(e) =>
                      updateStudentField(
                        activeStudent.id,
                        'motherName',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Father&apos;s Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AMRENDRA SINGH"
                    value={activeStudent.fatherName}
                    onChange={(e) =>
                      updateStudentField(
                        activeStudent.id,
                        'fatherName',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={activeStudent.dob === 'N/A' ? '' : activeStudent.dob}
                    onChange={(e) =>
                      updateStudentField(activeStudent.id, 'dob', e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Gender
                  </label>
                  <select
                    value={activeStudent.gender === 'MALE' ? 'MALE' : 'FEMALE'}
                    onChange={(e) =>
                      updateStudentField(activeStudent.id, 'gender', e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
                  >
                    <option value="FEMALE">FEMALE</option>
                    <option value="MALE">MALE</option>
                  </select>
                </div>
              </div>

              {/* Row B: 10th Marks Obtained (Theory + Internal/Practical + Aggregate) */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Theory Marks Box */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-6 space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                    Marks Obtained — Theory
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {(
                      [
                        ['milTheory', 'MIL', activeMatric.milTheory],
                        ['silTheory', 'SIL', activeMatric.silTheory],
                        ['matTheory', 'Math', activeMatric.matTheory],
                        ['sciTheory', 'Sci Th', activeMatric.sciTheory],
                        ['sscTheory', 'Soc Sci', activeMatric.sscTheory],
                        ['engTheory', 'English', activeMatric.engTheory],
                        ['optTheory', 'Optional', activeMatric.optTheory],
                        ['vocTheory', 'Vocational', activeMatric.vocTheory],
                      ] as const
                    ).map(([fieldKey, label, val]) => (
                      <div key={fieldKey}>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1 truncate">
                          {label}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={fieldKey.startsWith('opt') || fieldKey.startsWith('voc') ? '---' : '0'}
                          value={val}
                          onChange={(e) =>
                            updateMatricSentUpField(activeStudent.id, fieldKey, e.target.value)
                          }
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-1.5 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Internal Assessment & Practical Box */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-4 space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                    Internal Assessment &amp; Practical
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {(
                      [
                        ['sciPractical', 'Sci Pr.', activeMatric.sciPractical],
                        ['sscLitAct', 'Lit. Act', activeMatric.sscLitAct],
                        ['sscPrWork', 'Pr. Work', activeMatric.sscPrWork],
                        ['optPractical', 'Opt Pr.', activeMatric.optPractical],
                        ['vocPractical', 'Voc Pr.', activeMatric.vocPractical],
                      ] as const
                    ).map(([fieldKey, label, val]) => (
                      <div key={fieldKey}>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1 truncate">
                          {label}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={fieldKey.startsWith('opt') || fieldKey.startsWith('voc') ? '---' : '0'}
                          value={val}
                          onChange={(e) =>
                            updateMatricSentUpField(activeStudent.id, fieldKey, e.target.value)
                          }
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-1.5 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Aggregate Total Box */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 lg:col-span-2 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 border-b border-emerald-200 pb-1">
                      Aggregate Total
                    </div>
                    <div className="my-1 font-mono text-2xl font-bold tabular-nums text-emerald-950">
                      {activeMatric.aggregate || '0'}{' '}
                      <span className="text-xs font-normal text-emerald-700">/ 500</span>
                    </div>
                    <div className="text-[10px] text-emerald-800">
                      SCI: {activeMatric.sciTotal} · SSC: {activeMatric.sscTotal} (ENG excluded)
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveAndNextRow}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs py-2 px-3 shadow-xs transition-all"
                  >
                    <span>
                      {safeActiveIdx < records.length - 1
                        ? `Complete & Open Student #${safeActiveIdx + 2} →`
                        : '+ Save & Add Next Student'}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Row C: Prominent Mobile & Desktop Bottom Navigation Action Bar */}
              <div className="mt-5 pt-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/80 -mx-3.5 -mb-3.5 sm:-mx-5 sm:-mb-5 p-3.5 sm:p-5 rounded-b-2xl">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="h-9 w-9 rounded-full bg-[#283593] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                    #{safeActiveIdx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-2 truncate">
                      <span>Student {safeActiveIdx + 1} of {records.length}: {activeStudent.studentName || 'New 10th Student'}</span>
                      {activeMatric.aggregate && activeMatric.aggregate !== '0' && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          <Check className="h-3 w-3" /> Completed
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Total Marks: <strong className="text-emerald-700">{activeMatric.aggregate || '0'} / 500</strong> · Status: <span className="font-semibold text-slate-700">SENT-UP</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    disabled={safeActiveIdx === 0}
                    onClick={() => goToStudentIndex(Math.max(0, safeActiveIdx - 1))}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Prev Student</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndNextRow}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all"
                  >
                    <span>
                      {safeActiveIdx < records.length - 1
                        ? `Save & Open Student #${safeActiveIdx + 2} (अगला छात्र) →`
                        : '+ Save & Add Next Student'}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Official BSEB 10th Sent-Up Praptank Panji Sheet (23 Columns Preview & Inline Table) */}
          <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
            <div className="border-b border-slate-300 bg-slate-50 px-5 py-3 text-center">
              <div className="text-sm font-bold tracking-wide text-slate-900">
                BIHAR SCHOOL EXAMINATION BOARD, PATNA — SENT-UP/TEST EXAM.-{sentUpYear}
              </div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">
                -: वार्षिक माध्यमिक परीक्षा, {annualYear} में सम्मिलित होने वाले पंजीकृत नियमित एवं स्वतन्त्र कोटि के परीक्षार्थियों के उत्प्रेषण/जाँच परीक्षा, {sentUpYear} का प्राप्तांक पंजी :-
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-1.5 text-xs text-slate-800">
                <span className="font-bold">
                  (i) उत्प्रेषित (Sent-up) छात्र/छात्राओं के लिए विहित प्रपत्र :-
                </span>
                <span className="text-[11px] text-slate-500">
                  School: {defaultSchoolCode} — {defaultSchoolName}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-center text-[11px]">
                <thead>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-b border-slate-300 text-[10px]">
                    <th rowSpan={3} className="sticky left-0 z-10 bg-slate-100 border-r border-slate-300 px-1.5 py-2 w-8">
                      SL
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-1.5 py-2 w-14">
                      SCHOOL CODE
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-2 py-2 min-w-[100px]">
                      SCHOOL NAME
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-2 py-2 min-w-[115px]">
                      REGISTRATION NO.
                    </th>
                    <th rowSpan={3} className="sticky left-8 z-10 bg-slate-100 border-r border-slate-300 px-2 py-2 min-w-[135px] text-left">
                      STUDENT NAME
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-2 py-2 min-w-[120px] text-left">
                      MOTHER&apos;S NAME
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-2 py-2 min-w-[125px] text-left">
                      FATHER&apos;S NAME
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-1.5 py-2 min-w-[85px]">
                      DOB
                    </th>
                    <th rowSpan={3} className="border-r border-slate-300 px-1.5 py-2 w-16">
                      GENDER
                    </th>
                    <th colSpan={8} className="border-r border-b border-slate-300 px-2 py-1 bg-slate-200/70">
                      MARKS OBTAINED (THEORY)
                    </th>
                    <th colSpan={5} className="border-r border-b border-slate-300 px-2 py-1 bg-slate-100">
                      INTERNAL ASSESSMENT &amp; PRACTICAL
                    </th>
                    <th rowSpan={3} className="px-2 py-2 w-14 bg-emerald-50 text-emerald-950">
                      <span className="rotate-90-ccw">AGGRE-GATE</span>
                    </th>
                  </tr>
                  <tr className="bg-slate-50 font-bold text-slate-800 border-b border-slate-300 text-[10px] h-16">
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">MIL</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">SIL</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">MAT</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">SCI</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">SSC</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">ENG</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">OPT-SUB</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">VOC-SUB</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">SCI</span></th>
                    <th colSpan={2} className="border-r border-b border-slate-300 px-1 py-0.5">SSC</th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">OPT-SUB</span></th>
                    <th rowSpan={2} className="border-r border-slate-300 px-1 py-1.5 w-11"><span className="rotate-90-ccw">VOC-SUB</span></th>
                  </tr>
                  <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300 text-[9px] h-14">
                    <th className="border-r border-slate-300 px-1 py-1 w-11"><span className="rotate-90-ccw">LIT. ACT</span></th>
                    <th className="border-r border-slate-300 px-1 py-1 w-11"><span className="rotate-90-ccw">Pr. Work</span></th>
                  </tr>
                  <tr className="bg-slate-200 font-mono text-[10px] font-bold text-slate-700 border-b border-slate-300">
                    {Array.from({ length: 23 }, (_, i) => (
                      <th key={i + 1} className="border-r border-slate-300 py-0.5">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {records.map((rec, idx) => {
                    const m = getEffectiveMatricSentUp(rec);
                    const isSelected = idx === safeActiveIdx;
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => setActiveRowIndex(idx)}
                        className={`cursor-pointer transition-colors align-middle ${
                          isSelected ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td
                          className={`sticky left-0 z-10 border-r border-slate-300 px-1.5 py-2 font-mono font-bold ${
                            isSelected ? 'bg-amber-100 text-slate-900' : 'bg-white text-slate-700'
                          }`}
                        >
                          {idx + 1}
                        </td>
                        <td className="border-r border-slate-300 px-1.5 py-1.5 font-mono text-[11px] font-semibold text-slate-700">
                          {rec.schoolCode || defaultSchoolCode}
                        </td>
                        <td className="border-r border-slate-300 px-1.5 py-1.5 text-[10px] font-semibold text-slate-700">
                          {rec.schoolName || defaultSchoolName}
                        </td>
                        <td className="border-r border-slate-300 px-1.5 py-1.5 font-mono text-[11px] font-semibold text-slate-900">
                          <input
                            type="text"
                            placeholder="51803-00001-25"
                            aria-label={`Row ${idx + 1} Registration No`}
                            value={rec.registrationNo}
                            onChange={(e) =>
                              updateStudentField(rec.id, 'registrationNo', e.target.value)
                            }
                            className="w-full rounded border border-transparent hover:border-slate-300 focus:border-slate-900 bg-transparent focus:bg-white px-1 py-0.5 font-mono text-[11px] font-semibold text-slate-900 focus:outline-none"
                          />
                        </td>
                        <td
                          className={`sticky left-8 z-10 border-r border-slate-300 px-2 py-1.5 text-left font-bold text-slate-900 ${
                            isSelected ? 'bg-amber-50' : 'bg-white'
                          }`}
                        >
                          <input
                            type="text"
                            placeholder="STUDENT NAME"
                            aria-label={`Row ${idx + 1} Student Name`}
                            value={rec.studentName}
                            onChange={(e) =>
                              updateStudentField(
                                rec.id,
                                'studentName',
                                e.target.value.toUpperCase()
                              )
                            }
                            className="w-full rounded border border-transparent hover:border-slate-300 focus:border-slate-900 bg-transparent focus:bg-white px-1 py-0.5 text-[11px] font-bold text-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 px-2 py-1.5 text-left text-slate-800">
                          <input
                            type="text"
                            placeholder="MOTHER'S NAME"
                            aria-label={`Row ${idx + 1} Mother Name`}
                            value={rec.motherName}
                            onChange={(e) =>
                              updateStudentField(
                                rec.id,
                                'motherName',
                                e.target.value.toUpperCase()
                              )
                            }
                            className="w-full rounded border border-transparent hover:border-slate-300 focus:border-slate-900 bg-transparent focus:bg-white px-1 py-0.5 text-[11px] text-slate-800 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 px-2 py-1.5 text-left text-slate-800">
                          <input
                            type="text"
                            placeholder="FATHER'S NAME"
                            aria-label={`Row ${idx + 1} Father Name`}
                            value={rec.fatherName}
                            onChange={(e) =>
                              updateStudentField(
                                rec.id,
                                'fatherName',
                                e.target.value.toUpperCase()
                              )
                            }
                            className="w-full rounded border border-transparent hover:border-slate-300 focus:border-slate-900 bg-transparent focus:bg-white px-1 py-0.5 text-[11px] text-slate-800 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 px-1 py-1.5 font-mono text-[11px] text-slate-800">
                          <input
                            type="text"
                            placeholder="DD/MM/YYYY"
                            aria-label={`Row ${idx + 1} DOB`}
                            value={rec.dob === 'N/A' ? '' : rec.dob}
                            onChange={(e) => updateStudentField(rec.id, 'dob', e.target.value)}
                            className="w-full rounded border border-transparent hover:border-slate-300 focus:border-slate-900 bg-transparent focus:bg-white px-1 py-0.5 text-center font-mono text-[11px] text-slate-800 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-slate-300 px-1 py-1.5 font-mono text-[10px] font-bold text-slate-900">
                          {rec.gender}
                        </td>

                        {/* Cols 10..17 Theory */}
                        {(
                          [
                            ['milTheory', 'MIL (10)', m.milTheory],
                            ['silTheory', 'SIL (11)', m.silTheory],
                            ['matTheory', 'MAT (12)', m.matTheory],
                            ['sciTheory', 'SCI Th (13)', m.sciTheory],
                            ['sscTheory', 'SSC Th (14)', m.sscTheory],
                            ['engTheory', 'ENG (15)', m.engTheory],
                            ['optTheory', 'OPT Th (16)', m.optTheory],
                            ['vocTheory', 'VOC Th (17)', m.vocTheory],
                          ] as const
                        ).map(([fieldKey, label, val]) => (
                          <td key={fieldKey} className="border-r border-slate-300 p-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="—"
                              aria-label={`Row ${idx + 1} ${label}`}
                              value={val}
                              onChange={(e) =>
                                updateMatricSentUpField(rec.id, fieldKey, e.target.value)
                              }
                              className="w-10 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                            />
                          </td>
                        ))}

                        {/* Cols 18..22 Practical */}
                        {(
                          [
                            ['sciPractical', 'SCI Pr (18)', m.sciPractical],
                            ['sscLitAct', 'SSC Lit.Act (19)', m.sscLitAct],
                            ['sscPrWork', 'SSC Pr.Work (20)', m.sscPrWork],
                            ['optPractical', 'OPT Pr (21)', m.optPractical],
                            ['vocPractical', 'VOC Pr (22)', m.vocPractical],
                          ] as const
                        ).map(([fieldKey, label, val]) => (
                          <td key={fieldKey} className="border-r border-slate-300 p-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="—"
                              aria-label={`Row ${idx + 1} ${label}`}
                              value={val}
                              onChange={(e) =>
                                updateMatricSentUpField(rec.id, fieldKey, e.target.value)
                              }
                              className="w-10 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                            />
                          </td>
                        ))}

                        {/* Col 23: AGGRE-GATE */}
                        <td className="bg-emerald-50/90 px-2 py-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-xs font-bold tabular-nums text-emerald-950">
                              {m.aggregate || '---'}
                            </span>
                            {onDeleteRecord && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteRecord(rec.id);
                                }}
                                title="Delete row"
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Custom Excel Format Upload & Column Builder */}
      {sheetTab === 'CUSTOM_EXCEL' && (
        <div className="rounded-2xl border border-indigo-100 bg-white p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Custom Excel Format (.xlsx / .csv)
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={records.length === 0}
                onClick={() => downloadBlankMarksTemplate(records)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Blank Marks Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => excelInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Select Custom Excel File (.xlsx)</span>
              </button>
            </div>
          </div>

          {customFormat && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Active Custom Columns ({customFormat.headers.length}):
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSetCustomFormat(null);
                    onSetExportMode('BSEB_12TH_SENTUP');
                  }}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Format</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 rounded border border-slate-200 bg-slate-50 p-2.5">
                {customFormat.headers.map((h, i) => (
                  <span
                    key={`${h}-${i}`}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px]"
                  >
                    {i + 1}. {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAddCustomHeader} className="flex items-center gap-2 max-w-md">
            <input
              type="text"
              placeholder="Add custom column name..."
              value={newColumnHeader}
              onChange={(e) => setNewColumnHeader(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Column</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
