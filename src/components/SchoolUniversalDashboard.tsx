import React, { useState, useMemo } from 'react';
import {
  Building2,
  Users,
  GraduationCap,
  Award,
  BarChart3,
  FileSpreadsheet,
  FileText,
  Search,
  BookOpen,
  Printer,
  ChevronRight,
  Sparkles,
  School,
  CheckCircle2,
  Eye,
  Filter,
} from 'lucide-react';
import { AdmitCardRecord, ExamType, FacultyType } from '../types/admitCard';
import {
  calculateStudentMarksSummary,
} from '../utils/marksAndFormat';
import {
  exportToExcel,
  exportSentUp12thPdf,
  exportSentUp10thPdf,
} from '../utils/exportReports';

interface SchoolUniversalDashboardProps {
  records: AdmitCardRecord[];
  activeModule?: 'INTERMEDIATE' | 'MATRIC';
  onSwitchModule?: (mod: 'INTERMEDIATE' | 'MATRIC') => void;
  onNavigateToMarks: () => void;
  onSelectStudentForEdit: (student: AdmitCardRecord) => void;
}

export const SchoolUniversalDashboard: React.FC<SchoolUniversalDashboardProps> = ({
  records,
  onNavigateToMarks,
  onSelectStudentForEdit,
}) => {
  const [selectedSchoolCode, setSelectedSchoolCode] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<'ALL' | '12TH' | '10TH'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [facultyFilter, setFacultyFilter] = useState<string>('ALL');

  // Filter records by Combined Class Selection (ALL / 12TH / 10TH)
  const filteredRecordsByClass = useMemo(() => {
    return records.filter((r) => {
      if (classFilter === '12TH') return r.examType === 'INTERMEDIATE (+2)';
      if (classFilter === '10TH') return r.examType === 'MATRIC (10th)';
      return true; // Combined ALL
    });
  }, [records, classFilter]);

  // Group all records by unique School Code
  const schoolGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        code: string;
        name: string;
        center: string;
        interCount: number;
        matricCount: number;
        records: AdmitCardRecord[];
      }
    >();

    filteredRecordsByClass.forEach((r) => {
      const code = (r.schoolCode || r.rollCode || 'UNKNOWN').trim();
      const name = (r.schoolName || 'UNKNOWN SCHOOL').trim();
      const center = (r.examCenter || 'NOT ASSIGNED').trim();
      const isInter = r.examType === 'INTERMEDIATE (+2)';

      if (!map.has(code)) {
        map.set(code, {
          code,
          name,
          center,
          interCount: 0,
          matricCount: 0,
          records: [],
        });
      }
      const item = map.get(code)!;
      item.records.push(r);
      if (isInter) item.interCount++;
      else item.matricCount++;
    });

    return Array.from(map.values()).sort((a, b) => b.records.length - a.records.length);
  }, [filteredRecordsByClass]);

  // Determine active school record subset
  const currentSchoolGroup = useMemo(() => {
    if (selectedSchoolCode === 'ALL') {
      return {
        code: 'ALL',
        name: `All Detected Schools (${schoolGroups.length})`,
        center: 'Multiple Centers',
        records: filteredRecordsByClass,
      };
    }
    const found = schoolGroups.find((s) => s.code === selectedSchoolCode);
    return (
      found || {
        code: selectedSchoolCode,
        name: 'School',
        center: 'N/A',
        records: [],
      }
    );
  }, [selectedSchoolCode, schoolGroups, filteredRecordsByClass]);

  // Minimalist student directory search
  const directoryStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return currentSchoolGroup.records.filter((r) => {
      if (facultyFilter !== 'ALL' && r.faculty !== facultyFilter) return false;
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.fatherName.toLowerCase().includes(q) ||
        r.registrationNo.toLowerCase().includes(q) ||
        r.bsebUniqueId.toLowerCase().includes(q) ||
        (r.rollNumber || '').toLowerCase().includes(q)
      );
    });
  }, [currentSchoolGroup, searchQuery, facultyFilter]);

  // Vital Analytics Metrics
  const analytics = useMemo(() => {
    const activeRecords = currentSchoolGroup.records;
    const total = activeRecords.length;

    let interCount = 0;
    let matricCount = 0;
    let male = 0;
    let female = 0;
    let marksEnteredCount = 0;
    let totalMarksSum = 0;
    let firstDivCount = 0;
    let secondDivCount = 0;
    let thirdDivCount = 0;
    let failedCount = 0;

    activeRecords.forEach((r) => {
      if (r.examType === 'INTERMEDIATE (+2)') interCount++;
      else matricCount++;

      if (r.gender === 'MALE') male++;
      else female++;

      const summary = calculateStudentMarksSummary(r);
      if (summary.enteredCount > 0) {
        marksEnteredCount++;
        totalMarksSum += summary.totalMarks;
        if (summary.division === '1st Division') firstDivCount++;
        else if (summary.division === '2nd Division') secondDivCount++;
        else if (summary.division === '3rd Division') thirdDivCount++;
        else failedCount++;
      }
    });

    const passPercentage =
      marksEnteredCount > 0
        ? `${(((firstDivCount + secondDivCount + thirdDivCount) / marksEnteredCount) * 100).toFixed(0)}%`
        : '0%';

    const panjiCompletionRate =
      total > 0 ? Math.round((marksEnteredCount / total) * 100) : 0;

    return {
      total,
      interCount,
      matricCount,
      male,
      female,
      marksEnteredCount,
      panjiCompletionRate,
      passPercentage,
      firstDivCount,
      secondDivCount,
      thirdDivCount,
      failedCount,
    };
  }, [currentSchoolGroup]);

  // Quick Export Handlers
  const handleExportExcel = () => {
    exportToExcel(currentSchoolGroup.records, {
      mode: classFilter === '10TH' ? 'BSEB_10TH_SENTUP' : 'BSEB_12TH_SENTUP',
      filenamePrefix: `Combined_School_${currentSchoolGroup.code}`,
      annualYear: '2027',
      sentUpYear: '2026',
    });
  };

  const handleExportPdf = () => {
    if (classFilter === '10TH') {
      exportSentUp10thPdf(
        currentSchoolGroup.records,
        `School_${currentSchoolGroup.code}_10th_SentUp`,
        { annualYear: '2027', sentUpYear: '2026' }
      );
    } else {
      exportSentUp12thPdf(
        currentSchoolGroup.records,
        `School_${currentSchoolGroup.code}_12th_SentUp`,
        { annualYear: '2027', sentUpYear: '2026' }
      );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      {/* Flutter Glassmorphic Top Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-4 sm:p-6 shadow-xl shadow-indigo-100/50 backdrop-blur-xl">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-400/20 via-purple-400/20 to-teal-400/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-gradient-to-tr from-blue-400/20 via-indigo-400/20 to-emerald-400/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white shadow-lg shadow-indigo-500/20 shrink-0">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Universal School Dashboard
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 font-mono text-[11px] font-bold text-indigo-800">
                  <Sparkles className="h-3 w-3 text-indigo-600" />
                  {schoolGroups.length} {schoolGroups.length === 1 ? 'School' : 'Schools'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Combined 10th Matric &amp; 12th Intermediate Analytics
              </p>
            </div>
          </div>

          {/* Class Filter Segmented Control & School Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Flutter Material 3 Glass Segmented Pills */}
            <div className="inline-flex items-center rounded-2xl border border-indigo-200/60 bg-indigo-50/60 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setClassFilter('ALL')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  classFilter === 'ALL'
                    ? 'bg-white text-indigo-950 shadow-md shadow-indigo-100 ring-1 ring-indigo-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>✨ All Combined</span>
              </button>
              <button
                type="button"
                onClick={() => setClassFilter('12TH')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  classFilter === '12TH'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🎓 12th Inter</span>
              </button>
              <button
                type="button"
                onClick={() => setClassFilter('10TH')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  classFilter === '10TH'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🏫 10th Matric</span>
              </button>
            </div>

            {/* School Selector Dropdown */}
            <select
              aria-label="Select School Code"
              value={selectedSchoolCode}
              onChange={(e) => setSelectedSchoolCode(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-none min-w-[180px]"
            >
              <option value="ALL">All Schools ({filteredRecordsByClass.length})</option>
              {schoolGroups.map((sch) => (
                <option key={sch.code} value={sch.code}>
                  Code {sch.code} ({sch.records.length})
                </option>
              ))}
            </select>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={currentSchoolGroup.records.length === 0}
                className="inline-flex items-center gap-1 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm disabled:opacity-40"
                title="Export Excel"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={currentSchoolGroup.records.length === 0}
                className="inline-flex items-center gap-1 rounded-2xl bg-indigo-950 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-900 shadow-sm disabled:opacity-40"
                title="Export PDF"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={currentSchoolGroup.records.length === 0}
                className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title="Print Summary"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Selected School Sub-Bar */}
        {selectedSchoolCode !== 'ALL' && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-indigo-50/70 border border-indigo-100 px-4 py-2 text-xs text-indigo-950">
            <div className="flex items-center gap-2 truncate">
              <School className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="font-bold">Active School:</span>
              <span className="truncate font-semibold text-indigo-900">
                [{currentSchoolGroup.code}] {currentSchoolGroup.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSchoolCode('ALL')}
              className="font-bold text-indigo-700 hover:underline shrink-0 text-[11px]"
            >
              Reset to All Schools &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Minimalist Glassmorphic KPI Highlights Grid (4 Key Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Combined Enrolled Students */}
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-4 shadow-lg shadow-indigo-100/40 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Total Enrolled</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-100/70 text-indigo-700">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {analytics.total}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100/80 px-2 py-0.5 font-bold text-indigo-900">
              🎓 12th: {analytics.interCount}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100/80 px-2 py-0.5 font-bold text-emerald-900">
              🏫 10th: {analytics.matricCount}
            </span>
          </div>
        </div>

        {/* Card 2: Gender Balance */}
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-4 shadow-lg shadow-indigo-100/40 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Gender Breakdown</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-purple-100/70 text-purple-700">
              <GraduationCap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {analytics.female} <span className="text-xs font-semibold text-slate-500">Girls</span> / {analytics.male} <span className="text-xs font-semibold text-slate-500">Boys</span>
          </div>
          <div className="mt-2 w-full bg-slate-200/70 h-2 rounded-full overflow-hidden flex">
            <div
              className="bg-indigo-600 h-full"
              style={{ width: `${analytics.total > 0 ? (analytics.female / analytics.total) * 100 : 50}%` }}
              title="Girls"
            />
            <div
              className="bg-purple-400 h-full"
              style={{ width: `${analytics.total > 0 ? (analytics.male / analytics.total) * 100 : 50}%` }}
              title="Boys"
            />
          </div>
        </div>

        {/* Card 3: Praptank Panji Completion Rate */}
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-4 shadow-lg shadow-indigo-100/40 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Panji Progress</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-amber-100/70 text-amber-800">
              <BookOpen className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {analytics.marksEnteredCount}/{analytics.total}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-bold text-emerald-700">{analytics.panjiCompletionRate}% Done</span>
            <button
              type="button"
              onClick={onNavigateToMarks}
              className="font-bold text-indigo-700 hover:underline"
            >
              Enter Marks &rarr;
            </button>
          </div>
        </div>

        {/* Card 4: Sent-Up Results & Division */}
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-4 shadow-lg shadow-indigo-100/40 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Sent-Up Status</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-100/70 text-emerald-800">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-800 tracking-tight">
            1st Div: {analytics.firstDivCount}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
            <span>2nd: <b>{analytics.secondDivCount}</b></span>
            <span>Pass Rate: <b className="text-emerald-700">{analytics.passPercentage}</b></span>
          </div>
        </div>
      </div>

      {/* School Matrix Table (When 2+ schools detected in records) */}
      {schoolGroups.length > 1 && selectedSchoolCode === 'ALL' && (
        <div className="rounded-3xl border border-white/80 bg-white/70 p-4 sm:p-5 shadow-lg shadow-indigo-100/30 backdrop-blur-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-600" />
              <span>School Distribution Summary ({schoolGroups.length} Schools)</span>
            </h2>
            <span className="text-[11px] text-slate-500">Tap school to view stats</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">School Code &amp; Name</th>
                  <th className="px-3 py-2.5 text-center">Combined</th>
                  <th className="px-3 py-2.5 text-center">12th Inter</th>
                  <th className="px-3 py-2.5 text-center">10th Matric</th>
                  <th className="px-3 py-2.5 text-center">Panji Done</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schoolGroups.map((sch) => {
                  let schDone = 0;
                  sch.records.forEach((r) => {
                    const s = calculateStudentMarksSummary(r);
                    if (s.enteredCount > 0) schDone++;
                  });

                  return (
                    <tr key={sch.code} className="hover:bg-indigo-50/40 transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">
                        <div className="font-mono text-indigo-800 font-bold">Code {sch.code}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{sch.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-900">
                        {sch.records.length}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-indigo-900 font-bold">
                        {sch.interCount}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-emerald-900 font-bold">
                        {sch.matricCount}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          schDone === sch.records.length && schDone > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : schDone > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {schDone}/{sch.records.length}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedSchoolCode(sch.code)}
                          className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                        >
                          <span>Select</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Minimalist Combined Student Directory */}
      <div className="rounded-3xl border border-white/80 bg-white/70 p-4 sm:p-5 shadow-lg shadow-indigo-100/30 backdrop-blur-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              <span>Student Master Directory ({directoryStudents.length})</span>
            </h2>
            <p className="text-[11px] text-slate-500">
              Showing students for {selectedSchoolCode === 'ALL' ? 'All Schools' : `Code ${selectedSchoolCode}`}
            </p>
          </div>

          {/* Directory Search Box */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search Student Name, Reg No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-slate-200/90 bg-white/90 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none shadow-2xs"
              />
            </div>

            {classFilter === '12TH' && (
              <select
                aria-label="Filter Stream"
                value={facultyFilter}
                onChange={(e) => setFacultyFilter(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Streams</option>
                <option value="SCIENCE">SCIENCE</option>
                <option value="ARTS">ARTS</option>
                <option value="COMMERCE">COMMERCE</option>
              </select>
            )}
          </div>
        </div>

        {/* Minimal Directory Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 w-8 text-center">#</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Student Name &amp; Reg No</th>
                <th className="px-3 py-2">Stream / Gender</th>
                <th className="px-3 py-2">Sent-Up Score</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {directoryStudents.slice(0, 40).map((r, idx) => {
                const summary = calculateStudentMarksSummary(r);
                const isInter = r.examType === 'INTERMEDIATE (+2)';

                return (
                  <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-center text-slate-400 font-bold text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        isInter
                          ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      }`}>
                        {isInter ? '12th Inter' : '10th Matric'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900 text-xs">{r.studentName || 'Unnamed'}</div>
                      <div className="text-[10px] font-mono text-slate-500">Reg: {r.registrationNo || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 text-[11px]">
                      <span className="font-semibold">{r.faculty}</span>
                      <span className="text-[10px] text-slate-500 block">{r.gender === 'MALE' ? 'Male' : 'Female'}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {summary.enteredCount > 0 ? (
                        <div>
                          <b className="text-emerald-800 text-xs">{summary.totalMarks}/500</b>
                          <span className="text-[10px] text-slate-500 block">{summary.percentage} ({summary.division})</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No Marks</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectStudentForEdit(r)}
                        className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {directoryStudents.length > 40 && (
            <div className="bg-slate-50/70 p-2 text-center text-[11px] text-slate-500 font-medium">
              Showing top 40 of {directoryStudents.length} students. Use search box to filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
