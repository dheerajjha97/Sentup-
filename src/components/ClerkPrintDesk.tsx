import React, { useEffect, useMemo, useState } from 'react';
import {
  Printer,
  FileText,
  FileSpreadsheet,
  ClipboardCheck,
  Building2,
  GraduationCap,
  School,
  Search,
  LogOut,
  Loader2,
  AlertCircle,
  Lock,
  Users,
  FolderArchive,
} from 'lucide-react';
import { AdmitCardRecord, ClerkAssignment, ExamType, FacultyType } from '../types/admitCard';
import { User } from '../firebase';
import { normalizeSchoolCode } from '../utils/teacherSubjectMatcher';
import {
  exportAbsent10thExcel,
  exportAbsent10thPdf,
  exportAbsent12thExcel,
  exportAbsent12thPdf,
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
  sort12thRecordsByFaculty,
} from '../utils/exportReports';
import { AttendanceSheetView } from './AttendanceSheetView';
import { IntermediateLetterPadView } from './IntermediateLetterPadView';
import { PWAInstallButton } from './PWAInstallButton';
import { downloadCompleteClassPackZip } from '../utils/completePackExporter';

interface ClerkPrintDeskProps {
  user: User;
  assignments: ClerkAssignment[];
  assignedStudents: AdmitCardRecord[];
  isLoadingAssignments: boolean;
  isLoadingStudents: boolean;
  studentsError?: string;
  onSignOut: () => Promise<void>;
}

type ClerkTab = 'reports' | 'attendance' | 'letterpad';

interface AssignedSchoolSummary {
  code: string;
  name: string;
  classes: ExamType[];
  studentCount: number;
}

export const ClerkPrintDesk: React.FC<ClerkPrintDeskProps> = ({
  user,
  assignments,
  assignedStudents,
  isLoadingAssignments,
  isLoadingStudents,
  studentsError,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<ClerkTab>('reports');
  const [selectedSchoolCode, setSelectedSchoolCode] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<ExamType>('INTERMEDIATE (+2)');
  const [selectedFaculty, setSelectedFaculty] = useState<'ALL' | FacultyType>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [zipPackStatus, setZipPackStatus] = useState<string>('');

  // Unique active schools assigned to this Clerk (supports 1 or both 12th + 10th school codes)
  const assignedSchools = useMemo<AssignedSchoolSummary[]>(() => {
    const map = new Map<
      string,
      { code: string; name: string; classes: Set<ExamType>; studentCount: number }
    >();

    assignments.forEach((a) => {
      const code = normalizeSchoolCode(a.schoolCode);
      if (!code) return;
      const existing = map.get(code) || {
        code,
        name: a.schoolName || `School ${code}`,
        classes: new Set<ExamType>(),
        studentCount: 0,
      };
      if (existing.name.startsWith('School ') && a.schoolName && !a.schoolName.startsWith('School ')) {
        existing.name = a.schoolName;
      }
      a.assignedClasses.forEach((c) => existing.classes.add(c));
      map.set(code, existing);
    });

    assignedStudents.forEach((st) => {
      const code = normalizeSchoolCode(st.schoolCode, st.rollCode);
      if (!code) return;
      const entry = map.get(code);
      if (entry && entry.classes.has(st.examType)) {
        entry.studentCount += 1;
        if (entry.name.startsWith('School ') && st.schoolName) {
          entry.name = st.schoolName;
        }
      }
    });

    return Array.from(map.values())
      .map((item) => ({
        code: item.code,
        name: item.name,
        classes: Array.from(item.classes),
        studentCount: item.studentCount,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [assignments, assignedStudents]);

  // Keep selectedSchoolCode valid when assignments load
  useEffect(() => {
    if (assignedSchools.length === 0) {
      setSelectedSchoolCode('');
      return;
    }
    if (!selectedSchoolCode || !assignedSchools.some((s) => s.code === selectedSchoolCode)) {
      setSelectedSchoolCode(assignedSchools[0].code);
    }
  }, [assignedSchools, selectedSchoolCode]);

  const activeSchool = useMemo(
    () => assignedSchools.find((s) => s.code === selectedSchoolCode) || assignedSchools[0] || null,
    [assignedSchools, selectedSchoolCode]
  );

  // Keep selectedClass valid for the currently selected school
  useEffect(() => {
    if (!activeSchool || activeSchool.classes.length === 0) return;
    if (!activeSchool.classes.includes(selectedClass)) {
      setSelectedClass(activeSchool.classes[0]);
      setSelectedFaculty('ALL');
    }
  }, [activeSchool, selectedClass]);

  // All students belonging to the selected school (for Attendance Sheet view)
  const schoolAllStudents = useMemo(() => {
    if (!activeSchool) return [];
    const allowedClasses = new Set(activeSchool.classes);
    return assignedStudents.filter(
      (st) =>
        normalizeSchoolCode(st.schoolCode, st.rollCode) === activeSchool.code &&
        allowedClasses.has(st.examType)
    );
  }, [assignedStudents, activeSchool]);

  // Students for the active school + selected class (12th sorted Science -> Arts -> Commerce)
  const classStudents = useMemo(() => {
    const list = schoolAllStudents.filter((st) => st.examType === selectedClass);
    return selectedClass === 'INTERMEDIATE (+2)' ? sort12thRecordsByFaculty(list) : list;
  }, [schoolAllStudents, selectedClass]);

  // Faculty counts for 12th
  const facultyCounts = useMemo(() => {
    const counts = { SCIENCE: 0, ARTS: 0, COMMERCE: 0, VOCATIONAL: 0 };
    classStudents.forEach((st) => {
      if (st.faculty === 'SCIENCE') counts.SCIENCE += 1;
      else if (st.faculty === 'ARTS') counts.ARTS += 1;
      else if (st.faculty === 'COMMERCE') counts.COMMERCE += 1;
      else if (st.faculty === 'VOCATIONAL') counts.VOCATIONAL += 1;
    });
    return counts;
  }, [classStudents]);

  // Filtered list for read-only roster preview & optional faculty-scoped export
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classStudents.filter((st) => {
      if (
        selectedClass === 'INTERMEDIATE (+2)' &&
        selectedFaculty !== 'ALL' &&
        st.faculty !== selectedFaculty
      ) {
        return false;
      }
      if (!q) return true;
      return (
        st.studentName.toLowerCase().includes(q) ||
        st.fatherName.toLowerCase().includes(q) ||
        st.registrationNo.toLowerCase().includes(q) ||
        st.rollNumber.toLowerCase().includes(q) ||
        st.bsebUniqueId.toLowerCase().includes(q)
      );
    });
  }, [classStudents, selectedClass, selectedFaculty, searchQuery]);

  // Export records: respects faculty filter if clerk picked a single faculty, otherwise full class (Science -> Arts -> Commerce)
  const exportTargetRecords = useMemo(() => {
    if (selectedClass === 'INTERMEDIATE (+2)' && selectedFaculty !== 'ALL') {
      return classStudents.filter((st) => st.faculty === selectedFaculty);
    }
    return classStudents;
  }, [classStudents, selectedClass, selectedFaculty]);

  const clerkDisplayName =
    assignments[0]?.clerkName || user.displayName || user.email?.split('@')[0] || 'Office Clerk';

  const fileTag = activeSchool ? `_${activeSchool.code}` : '';
  const facultyTag =
    selectedClass === 'INTERMEDIATE (+2)' && selectedFaculty !== 'ALL' ? `_${selectedFaculty}` : '';

  const isInter = selectedClass === 'INTERMEDIATE (+2)';

  const handleDownloadClerkCompletePack = async () => {
    if (classStudents.length === 0 || zipPackStatus) return;
    try {
      setZipPackStatus('Bundling ZIP...');
      await downloadCompleteClassPackZip({
        classMode: isInter ? 'INTERMEDIATE' : 'MATRIC',
        records: classStudents,
        schoolCode: activeSchool?.code,
        schoolName: activeSchool?.name,
        onProgress: (msg) => setZipPackStatus(msg),
      });
    } catch (err) {
      console.error('Clerk ZIP pack error:', err);
    } finally {
      setZipPackStatus('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Bar: Quiet Identity & Read-Only Print Desk Header */}
      <header className="print:hidden rounded-2xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shrink-0">
              <Printer className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                  Clerk Print Desk
                </h1>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                  <Lock className="h-3 w-3" />
                  <span>Read-Only</span>
                </span>
              </div>
              <div className="text-xs text-slate-500 truncate font-mono tabular-nums">
                {clerkDisplayName} · {user.email} · {assignedSchools.length} School
                {assignedSchools.length === 1 ? '' : 's'} · {assignedStudents.length} Students
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {studentsError && (
        <div
          role="alert"
          className="print:hidden flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
        >
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <span>{studentsError}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoadingAssignments ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600" />
          <p className="mt-3 text-sm font-semibold text-slate-800">
            Loading Assigned Schools...
          </p>
        </section>
      ) : assignedSchools.length === 0 ? (
        /* Empty Assignment State */
        <section className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center max-w-xl mx-auto">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <Printer className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base sm:text-lg font-bold text-slate-900">
            No School Assigned to Print Desk Yet
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
            Aapka Gmail (<span className="font-mono font-semibold text-slate-800">{user.email}</span>) abhi kisi School Code ke Print Desk se tag nahi hai. Apne School Admin se kahein ki <strong>Teachers &amp; Clerks → Print Clerks</strong> tab me aapka Gmail add karein.
          </p>
        </section>
      ) : (
        <>
          {/* Multi-School Switcher & Workspace Mode Tabs */}
          <section className="print:hidden rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3">
            {/* Multi-School Selector (when 2+ schools assigned, e.g., 12th & 10th) */}
            {assignedSchools.length > 1 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Assigned Schools ({assignedSchools.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {assignedSchools.map((sch) => {
                    const isSelected = activeSchool?.code === sch.code;
                    return (
                      <button
                        key={sch.code}
                        type="button"
                        onClick={() => {
                          setSelectedSchoolCode(sch.code);
                          setSelectedFaculty('ALL');
                          setSearchQuery('');
                        }}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-sky-600 bg-sky-50/70 text-sky-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-slate-900">
                            <Building2 className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                            <span>{sch.code}</span>
                            <span className="font-sans font-medium text-slate-600 truncate">
                              {sch.name}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
                            {sch.classes
                              .map((c) => (c === 'MATRIC (10th)' ? '10th' : '12th'))
                              .join(' & ')}{' '}
                            · {sch.studentCount} Students
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Controls Row: Workspace Tabs + Class Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              {/* Primary Workspace Tabs */}
              <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1 self-start gap-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === 'reports'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Reports &amp; Registers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === 'attendance'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  <span>Attendance Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('letterpad')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === 'letterpad'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Letter Pad &amp; Lifafa</span>
                </button>
              </div>

              {/* Active School Label + Class Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                {activeSchool && (
                  <span className="text-xs font-mono text-slate-600 truncate max-w-[260px]">
                    [{activeSchool.code}] {activeSchool.name}
                  </span>
                )}

                {activeSchool && activeSchool.classes.length > 1 && (
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                    {activeSchool.classes.includes('INTERMEDIATE (+2)') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClass('INTERMEDIATE (+2)');
                          setSelectedFaculty('ALL');
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                          selectedClass === 'INTERMEDIATE (+2)'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        <span>12th (+2)</span>
                      </button>
                    )}
                    {activeSchool.classes.includes('MATRIC (10th)') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClass('MATRIC (10th)');
                          setSelectedFaculty('ALL');
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                          selectedClass === 'MATRIC (10th)'
                            ? 'bg-emerald-700 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <School className="h-3.5 w-3.5" />
                        <span>10th (Matric)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* TAB 1: REPORTS & REGISTERS (STRICTLY READ-ONLY PRINT/DOWNLOAD) */}
          {activeTab === 'reports' ? (
            <div className="space-y-4">
              {/* Print & Download Hub */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      {isInter
                        ? '12th Intermediate Print & Export Desk'
                        : '10th Matric Print & Export Desk'}
                    </h2>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      {isInter
                        ? `Science (${facultyCounts.SCIENCE}) → Arts (${facultyCounts.ARTS}) → Commerce (${facultyCounts.COMMERCE}) · Total ${exportTargetRecords.length} Students ready to print`
                        : `Total ${exportTargetRecords.length} Matric Students ready to print`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1-Click Complete Folder Pack (ZIP) for Clerk */}
                    <button
                      type="button"
                      onClick={handleDownloadClerkCompletePack}
                      disabled={classStudents.length === 0 || Boolean(zipPackStatus)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 shadow-2xs whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {zipPackStatus ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FolderArchive className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {zipPackStatus ||
                          `Download All ${isInter ? '12th' : '10th'} Pack (ZIP)`}
                      </span>
                    </button>

                    {/* Faculty Scope Filter for 12th */}
                    {isInter && (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        {(
                          [
                            { id: 'ALL', label: `All (${classStudents.length})` },
                            { id: 'SCIENCE', label: `Science (${facultyCounts.SCIENCE})` },
                            { id: 'ARTS', label: `Arts (${facultyCounts.ARTS})` },
                            { id: 'COMMERCE', label: `Commerce (${facultyCounts.COMMERCE})` },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSelectedFaculty(opt.id)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                              selectedFaculty === opt.id
                                ? 'border-sky-600 bg-sky-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isLoadingStudents ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-sky-600 mb-2" />
                    Loading student records...
                  </div>
                ) : exportTargetRecords.length === 0 ? (
                  <div className="py-8 text-center">
                    <Users className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      No Students Found in Selected Class / Stream
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Admin dwara is School Code ka data upload aur sync hone par reports yahan print ke liye ready milengi.
                    </p>
                  </div>
                ) : isInter ? (
                  /* 12th INTERMEDIATE PRINT CARDS */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 1. Sent-Up Marks Panji */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          12th Sent-Up Marks Panji (30-Column BSEB)
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Ordered strictly Science → Arts → Commerce. PDF opens 3-page preview before download.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            exportSentUp12thPdf(
                              exportTargetRecords,
                              `12th_Sent-Up_Panji${fileTag}${facultyTag}`,
                              { annualYear: '2027', sentUpYear: '2026' }
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Preview &amp; Print PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportToExcel(exportTargetRecords, {
                              mode: 'BSEB_12TH_SENTUP',
                              customFormat: null,
                              filenamePrefix: `12th_Sent-Up_Panji${fileTag}${facultyTag}`,
                              annualYear: '2027',
                              sentUpYear: '2026',
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          <span>Download Excel</span>
                        </button>
                      </div>
                    </div>

                    {/* 2. Absent Students Report */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          12th Absent / Non-Sent-Up List
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Official BSEB format for absent &amp; non-sent-up students (Science → Arts → Commerce).
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            exportAbsent12thPdf(
                              exportTargetRecords,
                              `12th_Absent_List${fileTag}${facultyTag}`,
                              { annualYear: '2027', sentUpYear: '2026' }
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 whitespace-nowrap cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Absent PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportAbsent12thExcel(exportTargetRecords, {
                              annualYear: '2027',
                              sentUpYear: '2026',
                              filenamePrefix: `12th_Absent_List${fileTag}${facultyTag}`,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-teal-700" />
                          <span>Absent Excel</span>
                        </button>
                      </div>
                    </div>

                    {/* 3. Vocational Report */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          12th Vocational Trade Panji
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Separate BSEB Vocational marks sheet for trade candidates.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            exportVocational12thPdf(
                              exportTargetRecords,
                              `12th_Vocational_Panji${fileTag}${facultyTag}`,
                              { annualYear: '2027', sentUpYear: '2026' }
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5 text-purple-700" />
                          <span>Vocational PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportVocational12thExcel(exportTargetRecords, {
                              annualYear: '2027',
                              sentUpYear: '2026',
                              filenamePrefix: `12th_Vocational_Panji${fileTag}${facultyTag}`,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-700" />
                          <span>Vocational Excel</span>
                        </button>
                      </div>
                    </div>

                    {/* 4. Admit Card Register PDF */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          12th Admit Card Master Register
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Complete student list with Registration No., BSEB ID &amp; Subjects (Science → Arts → Commerce).
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            exportToPdfReport(
                              exportTargetRecords,
                              false,
                              `12th_AdmitCard_Register${fileTag}${facultyTag}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5 text-sky-700" />
                          <span>Print Register PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 10th MATRIC PRINT CARDS */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 1. Matric Sent-Up Marks Panji */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          10th Matric Sent-Up Marks Panji (24-Column BSEB)
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Complete Secondary Sent-Up register with MIL, SIL, Math, Science, Social Science &amp; English.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            exportSentUp10thPdf(
                              exportTargetRecords,
                              `10th_Sent-Up_Panji${fileTag}`,
                              { annualYear: '2027', sentUpYear: '2026' }
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Preview &amp; Print PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportToExcel(exportTargetRecords, {
                              mode: 'BSEB_10TH_SENTUP',
                              customFormat: null,
                              filenamePrefix: `10th_Sent-Up_Panji${fileTag}`,
                              annualYear: '2027',
                              sentUpYear: '2026',
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          <span>Download Excel</span>
                        </button>
                      </div>
                    </div>

                    {/* 2. Matric Absent List */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          10th Matric Absent / Non-Sent-Up List
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Official BSEB Secondary format for absent &amp; non-sent-up students.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            exportAbsent10thPdf(
                              exportTargetRecords,
                              `10th_Absent_List${fileTag}`,
                              { annualYear: '2027', sentUpYear: '2026' }
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 whitespace-nowrap cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Absent PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportAbsent10thExcel(exportTargetRecords, {
                              annualYear: '2027',
                              sentUpYear: '2026',
                              filenamePrefix: `10th_Absent_List${fileTag}`,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-teal-700" />
                          <span>Absent Excel</span>
                        </button>
                      </div>
                    </div>

                    {/* 3. Visually Impaired Reports */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          10th Visually Impaired (Sent-Up &amp; Absent)
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Dedicated BSEB reports for visually impaired candidates.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            exportVisuallyImpairedSentUp10thPdf(
                              exportTargetRecords,
                              `10th_VI_SentUp${fileTag}`,
                              { annualYear: '2027', sentUpYear: '2026' }
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5 text-purple-700" />
                          <span>VI Sent-Up PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportVisuallyImpairedSentUp10thExcel(exportTargetRecords, {
                              annualYear: '2027',
                              sentUpYear: '2026',
                              filenamePrefix: `10th_VI_SentUp${fileTag}`,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-700" />
                          <span>VI Excel</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportVisuallyImpairedAbsent10thPdf(
                              exportTargetRecords,
                              `10th_VI_Absent${fileTag}`,
                              { annualYear: '2027', sentUpYear: '2026' }
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5 text-rose-700" />
                          <span>VI Absent PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportVisuallyImpairedAbsent10thExcel(exportTargetRecords, {
                              annualYear: '2027',
                              sentUpYear: '2026',
                              filenamePrefix: `10th_VI_Absent${fileTag}`,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-teal-700" />
                          <span>VI Absent XLS</span>
                        </button>
                      </div>
                    </div>

                    {/* 4. Admit Card Register PDF */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          10th Admit Card Master Register
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Printable master list with Roll Code, Reg. No., BSEB ID &amp; Subjects.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            exportToPdfReport(
                              exportTargetRecords,
                              false,
                              `10th_AdmitCard_Register${fileTag}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5 text-sky-700" />
                          <span>Print Register PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Read-Only Student Roster Preview */}
              {classStudents.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Student Roster Preview (Read-Only · {filteredStudents.length})
                      </h3>
                      <p className="text-xs text-slate-500">
                        {isInter
                          ? 'Preview sorted Science → Arts → Commerce. Editing and deletion are disabled on Clerk Login.'
                          : 'View-only list for print verification. Editing and deletion are disabled on Clerk Login.'}
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        aria-label="Search students in print roster"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search name, reg no, roll..."
                        className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 text-center w-12">Sl.</th>
                          <th className="px-3 py-2.5">Student &amp; Father&apos;s Name</th>
                          <th className="px-3 py-2.5">Faculty</th>
                          <th className="px-3 py-2.5">Reg. No. / Roll</th>
                          <th className="px-3 py-2.5">BSEB ID</th>
                          <th className="px-3 py-2.5">Subjects</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.slice(0, 100).map((st, idx) => (
                          <tr key={st.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2 text-center font-mono tabular-nums text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-900">{st.studentName || '—'}</div>
                              <div className="text-[11px] text-slate-500">F: {st.fatherName || '—'}</div>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                              {st.faculty}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-[11px] text-slate-700 whitespace-nowrap">
                              <div>{st.registrationNo || '—'}</div>
                              {(st.rollCode || st.rollNumber) && (
                                <div className="text-slate-500">
                                  {st.rollCode || '-'} / {st.rollNumber || '-'}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-[11px] text-slate-700 whitespace-nowrap">
                              {st.bsebUniqueId || '—'}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[260px] truncate">
                              {st.allSubjectsSummary ||
                                [
                                  st.langSubject1,
                                  st.langSubject2,
                                  st.compulsorySubject1,
                                  st.compulsorySubject2,
                                  st.compulsorySubject3,
                                ]
                                  .filter(Boolean)
                                  .join(', ') ||
                                '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredStudents.length > 100 && (
                    <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                      Showing first 100 of {filteredStudents.length} students in preview. PDF &amp; Excel exports include all {exportTargetRecords.length} students.
                    </p>
                  )}
                </section>
              )}
            </div>
          ) : activeTab === 'letterpad' ? (
            /* TAB 3: OFFICIAL 12th / 10th SCHOOL LETTER PAD PRINT */
            <IntermediateLetterPadView
              records={schoolAllStudents}
              initialClassMode={selectedClass === 'INTERMEDIATE (+2)' ? 'INTERMEDIATE' : 'MATRIC'}
              allowedClasses={
                activeSchool
                  ? activeSchool.classes.map((c) =>
                      c === 'INTERMEDIATE (+2)' ? 'INTERMEDIATE' : 'MATRIC'
                    )
                  : ['INTERMEDIATE', 'MATRIC']
              }
            />
          ) : (
            /* TAB 2: ATTENDANCE SHEET (PRINT / PDF / EXCEL - NO UPLOAD BUTTON) */
            <AttendanceSheetView
              records={schoolAllStudents}
              activeModule={selectedClass === 'INTERMEDIATE (+2)' ? 'INTERMEDIATE' : 'MATRIC'}
            />
          )}
        </>
      )}
    </div>
  );
};
