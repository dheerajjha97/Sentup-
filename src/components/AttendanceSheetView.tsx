import React, { useMemo, useState, useEffect } from 'react';
import {
  Printer,
  FileText,
  FileSpreadsheet,
  Calendar,
  BookOpen,
  GraduationCap,
  School,
  Users,
  Upload,
  Building2,
  Clock,
  SlidersHorizontal,
  Image as ImageIcon,
} from 'lucide-react';
import { AdmitCardRecord, FacultyType } from '../types/admitCard';
import {
  getEffectiveInterSentUp,
  getStudentRegisteredSubjects,
  normalizeSubjectKeyword,
} from '../utils/marksAndFormat';
import {
  AttendanceSheetConfig,
  exportAttendanceSheetExcel,
  exportAttendanceSheetPdf,
} from '../utils/exportReports';

interface AttendanceSheetViewProps {
  records: AdmitCardRecord[];
  activeModule: 'INTERMEDIATE' | 'MATRIC';
  onTriggerAdmitCardUpload?: () => void;
  allowExcelDownload?: boolean;
  allowPdfDownload?: boolean;
}

interface SubjectGroupOption {
  key: string;
  label: string;
  count: number;
}

type SortMode = 'SERIAL' | 'REG_NO' | 'ROLL_NO' | 'NAME';

const SITTING_OPTIONS = [
  '1st Sitting (09:30 AM - 12:45 PM)',
  '2nd Sitting (02:00 PM - 05:15 PM)',
  'Practical / Internal Assessment',
  'Full Day / Special Sitting',
];

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatReadableDate(iso: string): string {
  if (!iso) return '____/____/______';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayStr = Number.isNaN(dt.getTime()) ? '' : ` (${days[dt.getDay()]})`;
  return `${d}/${m}/${y}${dayStr}`;
}

/**
 * Extracts every normalized subject key + display label registered by a student
 * across both Admit Card subject slots and any edited Sent-Up Panji subject slots.
 */
function getStudentSubjectEntries(record: AdmitCardRecord): Array<{ key: string; label: string }> {
  const rawNames: string[] = [];

  for (const slot of getStudentRegisteredSubjects(record)) {
    if (slot.subjectName) rawNames.push(slot.subjectName);
  }

  if (record.examType === 'INTERMEDIATE (+2)' && record.interSentUp) {
    const eff = getEffectiveInterSentUp(record);
    [
      eff.lang1Subject,
      eff.lang2Subject,
      eff.elective1Subject,
      eff.elective2Subject,
      eff.elective3Subject,
      eff.additionalSubject,
      eff.vocationalSubject,
    ].forEach((s) => {
      if (s && s !== '---' && s !== 'N/A') rawNames.push(s);
    });
  }

  // Matric students always have the 6 core subjects if admit card fields were partially blank
  if (record.examType === 'MATRIC (10th)' && rawNames.length === 0) {
    rawNames.push(
      'MIL - HINDI',
      'SIL - SANSKRIT',
      'MATHEMATICS',
      'SCIENCE',
      'SOCIAL SCIENCE',
      'ENGLISH'
    );
  }

  const uniqueByKey = new Map<string, string>();
  for (const raw of rawNames) {
    const clean = raw.trim();
    if (!clean || clean === '---' || clean === '-' || clean.toUpperCase() === 'N/A') continue;
    const key = normalizeSubjectKeyword(clean);
    if (!key) continue;
    const existing = uniqueByKey.get(key);
    // Prefer the more descriptive label (e.g., with 3-digit subject code or longer name)
    if (!existing || clean.length > existing.length) {
      uniqueByKey.set(key, clean);
    }
  }

  return Array.from(uniqueByKey.entries()).map(([key, label]) => ({ key, label }));
}

export const AttendanceSheetView: React.FC<AttendanceSheetViewProps> = ({
  records,
  activeModule,
  onTriggerAdmitCardUpload,
  allowExcelDownload = true,
  allowPdfDownload = true,
}) => {
  const [selectedClass, setSelectedClass] = useState<'INTERMEDIATE' | 'MATRIC'>(activeModule);
  const [selectedSchool, setSelectedSchool] = useState<string>('ALL');
  const [selectedFaculty, setSelectedFaculty] = useState<'ALL' | FacultyType>('ALL');
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>('ALL');
  const [examDate, setExamDate] = useState<string>(getTodayIso);
  const [sitting, setSitting] = useState<string>(SITTING_OPTIONS[0]);
  const [examTitle, setExamTitle] = useState<string>('SENT-UP / TEST EXAMINATION - 2026');
  const [roomNo, setRoomNo] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('SERIAL');
  const [studentsPerPage, setStudentsPerPage] = useState<number>(25);
  const [includePhoto, setIncludePhoto] = useState<boolean>(true);

  // Sync default class selection if user switches module from drawer and current class has 0 students
  useEffect(() => {
    setSelectedClass(activeModule);
    setSelectedFaculty('ALL');
    setSelectedSchool('ALL');
    setSelectedSubjectKey('ALL');
  }, [activeModule]);

  const interCount = useMemo(
    () => records.filter((r) => r.examType === 'INTERMEDIATE (+2)').length,
    [records]
  );
  const matricCount = useMemo(
    () => records.filter((r) => r.examType === 'MATRIC (10th)').length,
    [records]
  );

  // Step 1: Filter by selected Class
  const classRecords = useMemo(() => {
    return records.filter((r) =>
      selectedClass === 'INTERMEDIATE'
        ? r.examType === 'INTERMEDIATE (+2)'
        : r.examType === 'MATRIC (10th)'
    );
  }, [records, selectedClass]);

  // Unique schools in selected class
  const schoolsInClass = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    classRecords.forEach((r) => {
      const code = (r.schoolCode || r.rollCode || 'UNKNOWN').trim();
      const name = (r.schoolName || `School ${code}`).trim();
      const existing = map.get(code);
      if (existing) {
        existing.count += 1;
        if (existing.name.startsWith('School ') && !name.startsWith('School ')) {
          existing.name = name;
        }
      } else {
        map.set(code, { code, name, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [classRecords]);

  // Step 2: Filter by School + Faculty
  const baseFilteredRecords = useMemo(() => {
    return classRecords.filter((r) => {
      if (selectedSchool !== 'ALL') {
        const code = (r.schoolCode || r.rollCode || 'UNKNOWN').trim();
        if (code !== selectedSchool) return false;
      }
      if (selectedClass === 'INTERMEDIATE' && selectedFaculty !== 'ALL') {
        if (r.faculty !== selectedFaculty) return false;
      }
      return true;
    });
  }, [classRecords, selectedSchool, selectedClass, selectedFaculty]);

  // Dynamic unique subject list from baseFilteredRecords with exact student counts
  const subjectOptions = useMemo<SubjectGroupOption[]>(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const rec of baseFilteredRecords) {
      const entries = getStudentSubjectEntries(rec);
      for (const entry of entries) {
        const prev = map.get(entry.key);
        if (prev) {
          prev.count += 1;
          if (entry.label.length > prev.label.length) {
            prev.label = entry.label;
          }
        } else {
          map.set(entry.key, { label: entry.label, count: 1 });
        }
      }
    }
    return Array.from(map.entries())
      .map(([key, val]) => ({ key, label: val.label, count: val.count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [baseFilteredRecords]);

  // Reset subject selection if the selected subject no longer exists after class/stream change
  useEffect(() => {
    if (
      selectedSubjectKey !== 'ALL' &&
      !subjectOptions.some((opt) => opt.key === selectedSubjectKey)
    ) {
      setSelectedSubjectKey('ALL');
    }
  }, [subjectOptions, selectedSubjectKey]);

  // Step 3: Filter by Subject + Sort
  const matchingStudents = useMemo(() => {
    const filtered =
      selectedSubjectKey === 'ALL'
        ? baseFilteredRecords
        : baseFilteredRecords.filter((rec) =>
            getStudentSubjectEntries(rec).some((e) => e.key === selectedSubjectKey)
          );

    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortMode === 'NAME') {
        return (a.studentName || '').localeCompare(b.studentName || '');
      }
      if (sortMode === 'REG_NO') {
        return (a.registrationNo || '').localeCompare(b.registrationNo || '');
      }
      if (sortMode === 'ROLL_NO') {
        const ra = `${a.rollCode || ''}-${a.rollNumber || ''}`;
        const rb = `${b.rollCode || ''}-${b.rollNumber || ''}`;
        return ra.localeCompare(rb, undefined, { numeric: true });
      }
      return (a.serialNo || 0) - (b.serialNo || 0);
    });
    return copy;
  }, [baseFilteredRecords, selectedSubjectKey, sortMode]);

  const selectedSubjectLabel = useMemo(() => {
    if (selectedSubjectKey === 'ALL') return 'All Registered Subjects';
    return subjectOptions.find((o) => o.key === selectedSubjectKey)?.label || 'Selected Subject';
  }, [selectedSubjectKey, subjectOptions]);

  const resolvedSchoolMeta = useMemo(() => {
    if (selectedSchool !== 'ALL') {
      const found = schoolsInClass.find((s) => s.code === selectedSchool);
      if (found) return { code: found.code, name: found.name };
    }
    if (schoolsInClass.length === 1) {
      return { code: schoolsInClass[0].code, name: schoolsInClass[0].name };
    }
    const first = matchingStudents[0];
    return {
      code: schoolsInClass.length > 1 ? 'MULTIPLE' : first?.schoolCode || first?.rollCode || '',
      name:
        schoolsInClass.length > 1
          ? `All Loaded Schools (${schoolsInClass.length})`
          : first?.schoolName || 'School / +2 College',
    };
  }, [selectedSchool, schoolsInClass, matchingStudents]);

  const classLabel =
    selectedClass === 'INTERMEDIATE' ? 'Class 12th (Intermediate +2)' : 'Class 10th (Matric)';
  const facultyLabel =
    selectedClass === 'INTERMEDIATE'
      ? selectedFaculty === 'ALL'
        ? 'ALL STREAMS'
        : selectedFaculty
      : 'SECONDARY';

  const sheetConfig: AttendanceSheetConfig = useMemo(
    () => ({
      examTitle: examTitle.trim() || 'SENT-UP / TEST EXAMINATION - 2026',
      examDate,
      sitting,
      classLabel,
      facultyLabel,
      subjectLabel: selectedSubjectLabel,
      schoolCode: resolvedSchoolMeta.code,
      schoolName: resolvedSchoolMeta.name,
      roomNo: roomNo.trim(),
      includePhoto,
      studentsPerPage,
    }),
    [
      examTitle,
      examDate,
      sitting,
      classLabel,
      facultyLabel,
      selectedSubjectLabel,
      resolvedSchoolMeta,
      roomNo,
      includePhoto,
      studentsPerPage,
    ]
  );

  // Split preview pages when studentsPerPage > 0
  const sheetChunks = useMemo(() => {
    if (matchingStudents.length === 0) return [];
    if (studentsPerPage <= 0) {
      return [{ startIdx: 0, rows: matchingStudents }];
    }
    const chunks: Array<{ startIdx: number; rows: AdmitCardRecord[] }> = [];
    for (let i = 0; i < matchingStudents.length; i += studentsPerPage) {
      chunks.push({ startIdx: i, rows: matchingStudents.slice(i, i + studentsPerPage) });
    }
    return chunks;
  }, [matchingStudents, studentsPerPage]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    if (matchingStudents.length === 0) return;
    exportAttendanceSheetPdf(matchingStudents, sheetConfig);
  };

  const handleDownloadExcel = () => {
    if (matchingStudents.length === 0) return;
    exportAttendanceSheetExcel(matchingStudents, sheetConfig);
  };

  return (
    <div className="space-y-4 print:space-y-0">
      {/* Interactive Configuration & Action Bar (Hidden when printing) */}
      <section className="print:hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        {/* Top Row: Heading + Primary Print / Export Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3.5">
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Attendance Sheet · उपस्थिति पत्रक
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
              {matchingStudents.length} Students · {classLabel} · {selectedSubjectLabel} ·{' '}
              {formatReadableDate(examDate)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={matchingStudents.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Sheet</span>
            </button>

            {allowPdfDownload && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={matchingStudents.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </button>
            )}

            {allowExcelDownload && (
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={matchingStudents.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Excel</span>
            </button>
            )}
          </div>
        </div>

        {/* Row 1: Class, Stream, Subject, Date & Sitting */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Class Selector */}
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Class (कक्षा)
            </label>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedClass('INTERMEDIATE');
                  setSelectedFaculty('ALL');
                  setSelectedSchool('ALL');
                  setSelectedSubjectKey('ALL');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedClass === 'INTERMEDIATE'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                <span>12th ({interCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedClass('MATRIC');
                  setSelectedFaculty('ALL');
                  setSelectedSchool('ALL');
                  setSelectedSubjectKey('ALL');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedClass === 'MATRIC'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <School className="h-3.5 w-3.5 shrink-0" />
                <span>10th ({matricCount})</span>
              </button>
            </div>
          </div>

          {/* Subject Selector */}
          <div className="lg:col-span-4">
            <label
              htmlFor="attendance-subject-select"
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5"
            >
              <BookOpen className="h-3 w-3" />
              <span>Subject (विषय चुनें)</span>
            </label>
            <select
              id="attendance-subject-select"
              value={selectedSubjectKey}
              onChange={(e) => setSelectedSubjectKey(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
            >
              <option value="ALL">
                All Students in Class ({baseFilteredRecords.length})
              </option>
              {subjectOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label} ({opt.count} Students)
                </option>
              ))}
            </select>
          </div>

          {/* Exam Date */}
          <div className="lg:col-span-2">
            <label
              htmlFor="attendance-exam-date"
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5"
            >
              <Calendar className="h-3 w-3" />
              <span>Exam Date (दिनांक)</span>
            </label>
            <input
              id="attendance-exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          {/* Sitting / Shift */}
          <div className="lg:col-span-3">
            <label
              htmlFor="attendance-sitting-select"
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5"
            >
              <Clock className="h-3 w-3" />
              <span>Sitting / Shift (पाली)</span>
            </label>
            <select
              id="attendance-sitting-select"
              value={sitting}
              onChange={(e) => setSitting(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
            >
              {SITTING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Secondary Options (Stream, School, Exam Title, Room, Sort, Per Page, Photo Toggle) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          {selectedClass === 'INTERMEDIATE' && (
            <div className="lg:col-span-2">
              <label
                htmlFor="attendance-faculty-select"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                Stream (संकाय)
              </label>
              <select
                id="attendance-faculty-select"
                value={selectedFaculty}
                onChange={(e) => {
                  setSelectedFaculty(e.target.value as 'ALL' | FacultyType);
                  setSelectedSubjectKey('ALL');
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="ALL">All Streams</option>
                <option value="SCIENCE">SCIENCE</option>
                <option value="ARTS">ARTS</option>
                <option value="COMMERCE">COMMERCE</option>
                <option value="VOCATIONAL">VOCATIONAL</option>
              </select>
            </div>
          )}

          {schoolsInClass.length > 1 && (
            <div className="lg:col-span-2">
              <label
                htmlFor="attendance-school-select"
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                <Building2 className="h-3 w-3" />
                <span>School Code</span>
              </label>
              <select
                id="attendance-school-select"
                value={selectedSchool}
                onChange={(e) => {
                  setSelectedSchool(e.target.value);
                  setSelectedSubjectKey('ALL');
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="ALL">All Schools ({schoolsInClass.length})</option>
                {schoolsInClass.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} ({s.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            className={
              selectedClass === 'INTERMEDIATE'
                ? schoolsInClass.length > 1
                  ? 'lg:col-span-3'
                  : 'lg:col-span-4'
                : schoolsInClass.length > 1
                ? 'lg:col-span-4'
                : 'lg:col-span-5'
            }
          >
            <label
              htmlFor="attendance-exam-title"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Exam Heading
            </label>
            <input
              id="attendance-exam-title"
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="e.g. SENT-UP / TEST EXAMINATION - 2026"
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="attendance-room-no"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Room / Hall No.
            </label>
            <input
              id="attendance-room-no"
              type="text"
              value={roomNo}
              onChange={(e) => setRoomNo(e.target.value)}
              placeholder="Optional (e.g. 01)"
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-3 flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="attendance-sort-select"
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Order &amp; Split</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  id="attendance-sort-select"
                  aria-label="Sort students by"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="SERIAL">Sl. No.</option>
                  <option value="ROLL_NO">Roll No.</option>
                  <option value="REG_NO">Reg. No.</option>
                  <option value="NAME">Name (A-Z)</option>
                </select>
                <select
                  aria-label="Students per sheet page"
                  value={studentsPerPage}
                  onChange={(e) => setStudentsPerPage(Number(e.target.value))}
                  className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
                >
                  <option value={0}>Auto Flow</option>
                  <option value={20}>20 / Page</option>
                  <option value={25}>25 / Page</option>
                  <option value={30}>30 / Page</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIncludePhoto((prev) => !prev)}
              aria-pressed={includePhoto}
              title="Toggle candidate photo column"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 h-[30px] ${
                includePhoto
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Photo</span>
            </button>
          </div>
        </div>
      </section>

      {/* Empty State when no matching students exist */}
      {matchingStudents.length === 0 ? (
        <section className="print:hidden rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Users className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-900">
            No Students Found for Selected Class / Subject
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            {classRecords.length === 0
              ? `Abhi ${classLabel} me koi student data loaded nahi hai. Admit Card PDF upload karein ya doosri class chunein.`
              : 'Selected stream/subject ke liye koi student nahi mila. Subject ya Stream filter badalkar dekhein.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {onTriggerAdmitCardUpload && (
              <button
                type="button"
                onClick={onTriggerAdmitCardUpload}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Admit Card PDF</span>
              </button>
            )}
            {classRecords.length === 0 && records.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedClass(selectedClass === 'INTERMEDIATE' ? 'MATRIC' : 'INTERMEDIATE');
                  setSelectedFaculty('ALL');
                  setSelectedSchool('ALL');
                  setSelectedSubjectKey('ALL');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <span>
                  Switch to {selectedClass === 'INTERMEDIATE' ? '10th Matric' : '12th Intermediate'}
                </span>
              </button>
            )}
          </div>
        </section>
      ) : (
        /* Printable A4 Attendance Sheets */
        <div className="space-y-6 print:space-y-0">
          {sheetChunks.map((chunk, chunkIdx) => (
            <article
              key={`${chunkIdx}-${chunk.startIdx}`}
              className="attendance-sheet-page mx-auto max-w-[210mm] rounded-2xl border border-slate-300 bg-white p-4 sm:p-6 text-slate-950 print:max-w-none print:rounded-none print:border-none print:p-0"
            >
              {/* Official BSEB Header */}
              <header className="border border-slate-900 px-3 py-2.5 text-center">
                <div className="text-sm sm:text-base font-extrabold tracking-wide uppercase text-slate-950">
                  BIHAR SCHOOL EXAMINATION BOARD, PATNA
                </div>
                <div className="text-xs sm:text-sm font-bold uppercase text-slate-900 mt-0.5">
                  {sheetConfig.examTitle}
                </div>
                <div className="text-[11px] sm:text-xs font-bold tracking-wider uppercase text-slate-800 mt-0.5">
                  ATTENDANCE SHEET / उपस्थिति पत्रक
                  {sheetChunks.length > 1
                    ? ` — SHEET ${chunkIdx + 1} OF ${sheetChunks.length}`
                    : ''}
                </div>
              </header>

              {/* Official Metadata Grid */}
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 border border-slate-900 text-[11px] sm:text-xs divide-y sm:divide-y-0 divide-slate-900">
                <div className="divide-y divide-slate-900 sm:border-r border-slate-900">
                  <div className="px-2.5 py-1.5 flex items-baseline gap-1.5">
                    <span className="font-bold shrink-0">School / +2:</span>
                    <span className="font-medium truncate">
                      {sheetConfig.schoolCode ? `[${sheetConfig.schoolCode}] ` : ''}
                      {sheetConfig.schoolName}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-baseline gap-1.5">
                    <span className="font-bold shrink-0">Class &amp; Stream:</span>
                    <span className="font-medium">
                      {sheetConfig.classLabel} · {sheetConfig.facultyLabel}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-baseline gap-1.5">
                    <span className="font-bold shrink-0">Subject (विषय):</span>
                    <span className="font-bold text-slate-950">{sheetConfig.subjectLabel}</span>
                  </div>
                </div>

                <div className="divide-y divide-slate-900">
                  <div className="px-2.5 py-1.5 flex items-baseline gap-1.5">
                    <span className="font-bold shrink-0">Exam Date (दिनांक):</span>
                    <span className="font-mono tabular-nums font-semibold">
                      {formatReadableDate(sheetConfig.examDate)}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-baseline gap-1.5">
                    <span className="font-bold shrink-0">Sitting (पाली):</span>
                    <span className="font-medium">{sheetConfig.sitting}</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-baseline justify-between gap-2">
                    <div>
                      <span className="font-bold">Room / Hall: </span>
                      <span className="font-mono font-semibold">
                        {sheetConfig.roomNo || '________'}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums font-bold">
                      Candidates: {chunk.rows.length}
                      {sheetChunks.length > 1
                        ? ` (${chunk.startIdx + 1}–${chunk.startIdx + chunk.rows.length})`
                        : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="mt-2.5 overflow-x-auto print:overflow-visible">
                <table className="attendance-print-table w-full border-collapse border border-slate-900 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-950">
                      <th className="border border-slate-900 px-1.5 py-2 text-center font-bold w-9">
                        Sl.
                      </th>
                      {includePhoto && (
                        <th className="border border-slate-900 px-1 py-2 text-center font-bold w-12">
                          Photo
                        </th>
                      )}
                      <th className="border border-slate-900 px-2 py-2 text-left font-bold w-36">
                        Roll Code / Roll No.
                        <div className="text-[9.5px] font-semibold text-slate-700">
                          &amp; Reg. No.
                        </div>
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 text-center font-bold w-24">
                        BSEB Unique ID
                      </th>
                      <th className="border border-slate-900 px-2 py-2 text-left font-bold">
                        Student&apos;s Name &amp; Father&apos;s Name
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 text-center font-bold w-24">
                        Copy / OMR Sl. No.
                      </th>
                      <th className="border border-slate-900 px-1 py-2 text-center font-bold w-11">
                        P / A
                      </th>
                      <th className="border border-slate-900 px-2 py-2 text-center font-bold w-32">
                        Candidate&apos;s Signature
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.rows.map((rec, localIdx) => {
                      const sl = chunk.startIdx + localIdx + 1;
                      const rollText =
                        rec.rollCode || rec.rollNumber
                          ? `${rec.rollCode || '-'} / ${rec.rollNumber || '-'}`
                          : '---';

                      return (
                        <tr key={rec.id} className="align-middle">
                          <td className="border border-slate-900 px-1.5 py-1.5 text-center font-mono tabular-nums font-bold">
                            {sl}
                          </td>
                          {includePhoto && (
                            <td className="border border-slate-900 p-1 text-center">
                              {rec.photoDataUrl ? (
                                <img
                                  src={rec.photoDataUrl}
                                  alt={rec.studentName || `Candidate ${sl}`}
                                  className="mx-auto h-10 w-8 object-cover border border-slate-400"
                                />
                              ) : (
                                <div className="mx-auto flex h-10 w-8 items-center justify-center border border-dashed border-slate-400 text-[8px] text-slate-400">
                                  Photo
                                </div>
                              )}
                            </td>
                          )}
                          <td className="border border-slate-900 px-2 py-1.5 font-mono tabular-nums text-[10.5px] leading-tight">
                            <div className="font-bold text-slate-950">{rollText}</div>
                            <div className="text-slate-700 mt-0.5">{rec.registrationNo || '---'}</div>
                          </td>
                          <td className="border border-slate-900 px-1.5 py-1.5 text-center font-mono tabular-nums text-[10.5px]">
                            {rec.bsebUniqueId || '---'}
                          </td>
                          <td className="border border-slate-900 px-2 py-1.5 leading-tight">
                            <div className="font-bold uppercase text-slate-950">
                              {rec.studentName || '---'}
                            </div>
                            <div className="text-[10px] text-slate-700 mt-0.5">
                              F: {rec.fatherName || '---'}
                            </div>
                          </td>
                          <td className="border border-slate-900 px-2 py-1.5">&nbsp;</td>
                          <td className="border border-slate-900 px-1 py-1.5 text-center">&nbsp;</td>
                          <td className="border border-slate-900 px-2 py-1.5">&nbsp;</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Official Summary & Invigilator / Principal Signature Footer */}
              <footer className="mt-3 break-inside-avoid">
                <div className="grid grid-cols-3 border border-slate-900 text-xs font-bold divide-x divide-slate-900">
                  <div className="px-2.5 py-1.5 font-mono tabular-nums">
                    Total Allotted: {chunk.rows.length}
                  </div>
                  <div className="px-2.5 py-1.5">Total Present: ___________</div>
                  <div className="px-2.5 py-1.5">Total Absent: ___________</div>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-8 px-2 text-xs text-slate-900">
                  <div className="text-center">
                    <div className="border-t border-slate-900 pt-1 font-semibold">
                      Signature of Invigilator (with Date)
                    </div>
                    <div className="text-[10px] text-slate-600">वीक्षक का हस्ताक्षर एवं तिथि</div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-900 pt-1 font-semibold">
                      Centre Superintendent / Principal Signature &amp; Seal
                    </div>
                    <div className="text-[10px] text-slate-600">
                      केंद्राधीक्षक / प्राचार्य का हस्ताक्षर एवं मुहर
                    </div>
                  </div>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
