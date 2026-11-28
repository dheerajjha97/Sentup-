import React, { useState, useMemo } from 'react';
import {
  Building2,
  Users,
  GraduationCap,
  Award,
  Search,
  BookOpen,
  ChevronRight,
  School,
  Eye,
  Lock,
  Link2,
  Unlink,
  AlertTriangle,
} from 'lucide-react';
import { AdmitCardRecord } from '../types/admitCard';
import {
  calculateStudentMarksSummary,
} from '../utils/marksAndFormat';
import {
  SchoolCodeClassLock,
  SchoolCodePair,
  SchoolCodeRule,
  getEffectiveCodeLock,
  normalizeSchoolCode,
} from '../utils/schoolCodeGuard';

interface SchoolUniversalDashboardProps {
  records: AdmitCardRecord[];
  activeModule?: 'INTERMEDIATE' | 'MATRIC';
  onSwitchModule?: (mod: 'INTERMEDIATE' | 'MATRIC') => void;
  onNavigateToMarks: () => void;
  onSelectStudentForEdit: (student: AdmitCardRecord) => void;
  codeRules?: Record<string, SchoolCodeRule>;
  onUpdateCodeRule?: (code: string, lock: SchoolCodeClassLock) => void;
  codePairs?: SchoolCodePair[];
  onSaveCodePairs?: (pairs: SchoolCodePair[]) => void;
}

export const SchoolUniversalDashboard: React.FC<SchoolUniversalDashboardProps> = ({
  records,
  onNavigateToMarks,
  onSelectStudentForEdit,
  codeRules = {},
  onUpdateCodeRule,
  codePairs = [],
  onSaveCodePairs,
}) => {
  const [selectedSchoolCode, setSelectedSchoolCode] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<'ALL' | '12TH' | '10TH'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [facultyFilter, setFacultyFilter] = useState<string>('ALL');
  const [pairMatricCode, setPairMatricCode] = useState<string>('');
  const [pairInterCode, setPairInterCode] = useState<string>('');
  const [pairSchoolName, setPairSchoolName] = useState<string>('');

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

  // Compute available unlinked 10th-only and 12th-only codes for 1-click pairing
  const unlinkedPairingCandidates = useMemo(() => {
    const linkedMatric = new Set(codePairs.map((p) => normalizeSchoolCode(p.matricCode)));
    const linkedInter = new Set(codePairs.map((p) => normalizeSchoolCode(p.interCode)));
    const matricCodes: Array<{ code: string; name: string }> = [];
    const interCodes: Array<{ code: string; name: string }> = [];

    schoolGroups.forEach((sch) => {
      const norm = normalizeSchoolCode(sch.code);
      const eff = getEffectiveCodeLock(norm, records, codeRules, codePairs);
      if (eff?.lock === '10TH_ONLY' && !linkedMatric.has(norm)) {
        matricCodes.push({ code: norm, name: sch.name });
      } else if (eff?.lock === '12TH_ONLY' && !linkedInter.has(norm)) {
        interCodes.push({ code: norm, name: sch.name });
      }
    });

    return { matricCodes, interCodes };
  }, [schoolGroups, records, codeRules, codePairs]);

  const effectivePairMatric =
    pairMatricCode && unlinkedPairingCandidates.matricCodes.some((c) => c.code === pairMatricCode)
      ? pairMatricCode
      : unlinkedPairingCandidates.matricCodes[0]?.code || '';

  const effectivePairInter =
    pairInterCode && unlinkedPairingCandidates.interCodes.some((c) => c.code === pairInterCode)
      ? pairInterCode
      : unlinkedPairingCandidates.interCodes[0]?.code || '';

  const handleLinkSchoolPair = () => {
    if (!onSaveCodePairs || !effectivePairMatric || !effectivePairInter) return;
    const defaultName =
      pairSchoolName.trim() ||
      unlinkedPairingCandidates.interCodes.find((c) => c.code === effectivePairInter)?.name ||
      unlinkedPairingCandidates.matricCodes.find((c) => c.code === effectivePairMatric)?.name ||
      `School (${effectivePairMatric} / ${effectivePairInter})`;
    const nextPair: SchoolCodePair = {
      id: `pair_${effectivePairMatric}_${effectivePairInter}`,
      schoolName: defaultName.replace(/^\d+\s*[-–:]\s*/, '').trim(),
      matricCode: effectivePairMatric,
      interCode: effectivePairInter,
    };
    onSaveCodePairs([...codePairs, nextPair]);
    if (onUpdateCodeRule) {
      onUpdateCodeRule(effectivePairMatric, '10TH_ONLY');
      onUpdateCodeRule(effectivePairInter, '12TH_ONLY');
    }
    setPairSchoolName('');
  };

  const handleRemoveSchoolPair = (pairId: string) => {
    if (!onSaveCodePairs) return;
    onSaveCodePairs(codePairs.filter((p) => p.id !== pairId));
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Universal School Dashboard
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                {schoolGroups.length} {schoolGroups.length === 1 ? 'School Code' : 'School Codes'} · Combined 10th Matric &amp; 12th Intermediate Analytics
              </p>
            </div>
          </div>

          {/* Class Filter Segmented Control & School Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setClassFilter('ALL')}
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  classFilter === 'ALL'
                    ? 'bg-white text-indigo-950 shadow-2xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Combined
              </button>
              <button
                type="button"
                onClick={() => setClassFilter('12TH')}
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  classFilter === '12TH'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                12th Inter
              </button>
              <button
                type="button"
                onClick={() => setClassFilter('10TH')}
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  classFilter === '10TH'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                10th Matric
              </button>
            </div>

            {/* School Selector Dropdown */}
            <select
              aria-label="Select School Code"
              value={selectedSchoolCode}
              onChange={(e) => setSelectedSchoolCode(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none min-w-[170px]"
            >
              <option value="ALL">All Schools ({filteredRecordsByClass.length})</option>
              {schoolGroups.map((sch) => (
                <option key={sch.code} value={sch.code}>
                  Code {sch.code} ({sch.records.length})
                </option>
              ))}
            </select>
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

      {/* School Matrix Table (When 1+ schools detected in records) */}
      {schoolGroups.length >= 1 && selectedSchoolCode === 'ALL' && (
        <div className="rounded-3xl border border-white/80 bg-white/70 p-4 sm:p-5 shadow-lg shadow-indigo-100/30 backdrop-blur-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-600" />
              <span>
                School Distribution Summary ({schoolGroups.length}{' '}
                {schoolGroups.length === 1 ? 'Code' : 'Codes'})
              </span>
            </h2>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Lock className="h-3 w-3 text-indigo-500" />
              <span>Code-to-Class Lock active — galat class upload blocked</span>
            </span>
          </div>

          {/* Linked +2 School Unified Cards (when 10th + 12th codes are paired) */}
          {codePairs.length > 0 && (
            <div className="space-y-1.5">
              {codePairs.map((pair) => {
                const mGroup = schoolGroups.find(
                  (g) => normalizeSchoolCode(g.code) === normalizeSchoolCode(pair.matricCode)
                );
                const iGroup = schoolGroups.find(
                  (g) => normalizeSchoolCode(g.code) === normalizeSchoolCode(pair.interCode)
                );
                const combinedTotal = (mGroup?.records.length || 0) + (iGroup?.records.length || 0);
                return (
                  <div
                    key={pair.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/80 via-white to-emerald-50/80 px-3.5 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
                        <Link2 className="h-3 w-3" />
                        Linked +2 School
                      </span>
                      <span className="font-bold text-slate-900 truncate max-w-xs">
                        {pair.schoolName}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-emerald-100 border border-emerald-200 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                        10th: {pair.matricCode} ({mGroup?.matricCount || 0})
                      </span>
                      <span className="inline-flex items-center rounded-md bg-indigo-100 border border-indigo-200 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-900">
                        12th: {pair.interCode} ({iGroup?.interCount || 0})
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-700">
                        Total: {combinedTotal}
                      </span>
                    </div>
                    {onSaveCodePairs && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSchoolPair(pair.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
                      >
                        <Unlink className="h-3 w-3" />
                        <span>Unlink</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 1-Click Same-School Pairing Bar (when both unlinked 10th & 12th codes exist) */}
          {onSaveCodePairs &&
            unlinkedPairingCandidates.matricCodes.length > 0 &&
            unlinkedPairingCandidates.interCodes.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-indigo-950">
                  <Link2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span className="font-semibold">Same +2 School ke codes link karein:</span>
                  <select
                    aria-label="Select 10th Matric Code to Link"
                    value={effectivePairMatric}
                    onChange={(e) => setPairMatricCode(e.target.value)}
                    className="rounded-lg border border-emerald-300 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-900"
                  >
                    {unlinkedPairingCandidates.matricCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        10th: {c.code}
                      </option>
                    ))}
                  </select>
                  <span className="font-bold text-slate-400">+</span>
                  <select
                    aria-label="Select 12th Inter Code to Link"
                    value={effectivePairInter}
                    onChange={(e) => setPairInterCode(e.target.value)}
                    className="rounded-lg border border-indigo-300 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-900"
                  >
                    {unlinkedPairingCandidates.interCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        12th: {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleLinkSchoolPair}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 shadow-2xs transition-colors"
                >
                  <Link2 className="h-3 w-3" />
                  <span>Link Same School</span>
                </button>
              </div>
            )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">School Code &amp; Name</th>
                  <th className="px-3 py-2.5 text-center">Class Lock</th>
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

                  const normCode = normalizeSchoolCode(sch.code);
                  const effLock = getEffectiveCodeLock(normCode, records, codeRules, codePairs);
                  const currentLock: SchoolCodeClassLock = effLock?.lock || 'BOTH';
                  const hasInterViolation = currentLock === '10TH_ONLY' && sch.interCount > 0;
                  const hasMatricViolation = currentLock === '12TH_ONLY' && sch.matricCount > 0;
                  const linkedPair = codePairs.find(
                    (p) =>
                      normalizeSchoolCode(p.matricCode) === normCode ||
                      normalizeSchoolCode(p.interCode) === normCode
                  );

                  return (
                    <tr key={sch.code} className="hover:bg-indigo-50/40 transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-indigo-800 font-bold">
                            Code {sch.code}
                          </span>
                          {linkedPair && (
                            <span
                              title={`Linked with ${
                                normalizeSchoolCode(linkedPair.matricCode) === normCode
                                  ? `12th Code ${linkedPair.interCode}`
                                  : `10th Code ${linkedPair.matricCode}`
                              }`}
                              className="inline-flex items-center gap-0.5 rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700"
                            >
                              <Link2 className="h-2.5 w-2.5" />
                              Linked
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          {sch.name}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {onUpdateCodeRule ? (
                          <select
                            aria-label={`Class lock for school code ${sch.code}`}
                            value={currentLock}
                            onChange={(e) =>
                              onUpdateCodeRule(normCode, e.target.value as SchoolCodeClassLock)
                            }
                            className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold cursor-pointer focus:outline-none ${
                              currentLock === '10TH_ONLY'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : currentLock === '12TH_ONLY'
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                                : 'border-slate-300 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <option value="10TH_ONLY">10th Only 🔒</option>
                            <option value="12TH_ONLY">12th Only 🔒</option>
                            <option value="BOTH">Both (10th+12th)</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              currentLock === '10TH_ONLY'
                                ? 'bg-emerald-100 text-emerald-800'
                                : currentLock === '12TH_ONLY'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Lock className="h-2.5 w-2.5" />
                            {currentLock === '10TH_ONLY'
                              ? '10th Only'
                              : currentLock === '12TH_ONLY'
                              ? '12th Only'
                              : 'Both'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-900">
                        {sch.records.length}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold">
                        {currentLock === '10TH_ONLY' && sch.interCount === 0 ? (
                          <span
                            className="text-slate-300 font-normal"
                            title="Code 10th Only ke liye locked hai"
                          >
                            —
                          </span>
                        ) : hasInterViolation ? (
                          <span
                            title="Mismatch: 10th Only code me 12th records mile!"
                            className="inline-flex items-center gap-1 rounded-md bg-rose-100 border border-rose-300 px-1.5 py-0.5 text-[10px] font-bold text-rose-800"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {sch.interCount}
                          </span>
                        ) : (
                          <span className="text-indigo-900">{sch.interCount}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold">
                        {currentLock === '12TH_ONLY' && sch.matricCount === 0 ? (
                          <span
                            className="text-slate-300 font-normal"
                            title="Code 12th Only ke liye locked hai"
                          >
                            —
                          </span>
                        ) : hasMatricViolation ? (
                          <span
                            title="Mismatch: 12th Only code me 10th records mile!"
                            className="inline-flex items-center gap-1 rounded-md bg-rose-100 border border-rose-300 px-1.5 py-0.5 text-[10px] font-bold text-rose-800"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {sch.matricCount}
                          </span>
                        ) : (
                          <span className="text-emerald-900">{sch.matricCount}</span>
                        )}
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
