import React, { useMemo, useState, useEffect } from 'react';
import {
  Save,
  Search,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  GraduationCap,
  School,
  LogOut,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import {
  AdmitCardRecord,
  ExamType,
  InterSentUpMarks,
  MatricSentUpMarks,
  TeacherAssignment,
} from '../types/admitCard';
import { User, updateStudentMarksAsTeacher } from '../firebase';
import { getEffectiveInterSentUp, getEffectiveMatricSentUp } from '../utils/marksAndFormat';
import {
  canonicalSubjectKey,
  findInterSubjectSlot,
  findMatricSubjectSlot,
  studentMatchesAssignedSubject,
} from '../utils/teacherSubjectMatcher';

interface TeacherMarksPortalProps {
  user: User;
  assignments: TeacherAssignment[];
  assignedStudents: AdmitCardRecord[];
  canSwitchToAdmin: boolean;
  onSwitchToAdmin?: () => void;
  onSignOut: () => Promise<void>;
}

type FilterEntered = 'ALL' | 'PENDING' | 'ENTERED';

function cleanMarkForInput(val: string | undefined): string {
  if (!val) return '';
  const t = val.trim();
  if (t === '---' || t === '--' || t === '-') return '';
  return t;
}

function parseNumericMark(val: string | undefined): number {
  const cleaned = cleanMarkForInput(val);
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export const TeacherMarksPortal: React.FC<TeacherMarksPortalProps> = ({
  user,
  assignments,
  assignedStudents,
  canSwitchToAdmin,
  onSwitchToAdmin,
  onSignOut,
}) => {
  // Unique schools assigned to this teacher
  const assignedSchools = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    assignments.forEach((a) => {
      if (!a.active) return;
      if (!map.has(a.schoolCode)) {
        map.set(a.schoolCode, { code: a.schoolCode, name: a.schoolName || `School ${a.schoolCode}` });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [assignments]);

  const [selectedSchool, setSelectedSchool] = useState<string>(assignedSchools[0]?.code || '');

  useEffect(() => {
    if (
      assignedSchools.length > 0 &&
      !assignedSchools.some((s) => s.code === selectedSchool)
    ) {
      setSelectedSchool(assignedSchools[0].code);
    }
  }, [assignedSchools, selectedSchool]);

  // Assignments for selected school
  const schoolAssignments = useMemo(
    () => assignments.filter((a) => a.active && a.schoolCode === selectedSchool),
    [assignments, selectedSchool]
  );

  // Classes assigned to this teacher in the selected school
  const assignedClasses = useMemo<ExamType[]>(() => {
    const set = new Set<ExamType>();
    schoolAssignments.forEach((a) => a.assignedClasses.forEach((c) => set.add(c)));
    const ordered: ExamType[] = [];
    if (set.has('INTERMEDIATE (+2)')) ordered.push('INTERMEDIATE (+2)');
    if (set.has('MATRIC (10th)')) ordered.push('MATRIC (10th)');
    return ordered;
  }, [schoolAssignments]);

  const [selectedClass, setSelectedClass] = useState<ExamType>(
    assignedClasses[0] || 'INTERMEDIATE (+2)'
  );

  useEffect(() => {
    if (assignedClasses.length > 0 && !assignedClasses.includes(selectedClass)) {
      setSelectedClass(assignedClasses[0]);
    }
  }, [assignedClasses, selectedClass]);

  // Students belonging to selected school & class
  const classStudents = useMemo(() => {
    const cleanSchool = selectedSchool.trim().toUpperCase();
    return assignedStudents.filter((s) => {
      const sCode = (s.schoolCode || s.rollCode || '').trim().toUpperCase();
      return sCode === cleanSchool && s.examType === selectedClass;
    });
  }, [assignedStudents, selectedSchool, selectedClass]);

  // Assigned subjects applicable to the selected school & class (deduplicated by canonical key)
  const assignedSubjectOptions = useMemo(() => {
    const map = new Map<string, { label: string; studentCount: number }>();
    schoolAssignments
      .filter((a) => a.assignedClasses.includes(selectedClass))
      .forEach((a) => {
        a.assignedSubjects.forEach((subj) => {
          const key = canonicalSubjectKey(subj);
          if (!key) return;
          const matchingCount = classStudents.filter((st) =>
            studentMatchesAssignedSubject(st, subj)
          ).length;
          // Show subjects relevant to this class (matching >= 1 student, or if class has 0 students show all assigned)
          if (!map.has(key)) {
            map.set(key, { label: subj, studentCount: matchingCount });
          }
        });
      });

    const all = Array.from(map.values());
    const withStudents = all.filter((item) => item.studentCount > 0);
    return (withStudents.length > 0 ? withStudents : all).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [schoolAssignments, selectedClass, classStudents]);

  const [selectedSubject, setSelectedSubject] = useState<string>(
    assignedSubjectOptions[0]?.label || ''
  );

  useEffect(() => {
    if (
      assignedSubjectOptions.length > 0 &&
      !assignedSubjectOptions.some(
        (opt) => canonicalSubjectKey(opt.label) === canonicalSubjectKey(selectedSubject)
      )
    ) {
      setSelectedSubject(assignedSubjectOptions[0].label);
    }
  }, [assignedSubjectOptions, selectedSubject]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterEntered>('ALL');

  // Local draft edits keyed by student.firestoreDocId
  const [draftInterByDocId, setDraftInterByDocId] = useState<Record<string, InterSentUpMarks>>({});
  const [draftMatricByDocId, setDraftMatricByDocId] = useState<Record<string, MatricSentUpMarks>>({});
  const [savingDocIds, setSavingDocIds] = useState<Record<string, boolean>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Matching students for the selected School + Class + Assigned Subject
  const subjectStudents = useMemo(() => {
    if (!selectedSubject) return [];
    return classStudents.filter((st) => studentMatchesAssignedSubject(st, selectedSubject));
  }, [classStudents, selectedSubject]);

  const getEffectiveInterDraft = (rec: AdmitCardRecord): InterSentUpMarks => {
    const docKey = rec.firestoreDocId || rec.id;
    if (draftInterByDocId[docKey]) return draftInterByDocId[docKey];
    const eff = getEffectiveInterSentUp(rec);
    return {
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
    };
  };

  const getEffectiveMatricDraft = (rec: AdmitCardRecord): MatricSentUpMarks => {
    const docKey = rec.firestoreDocId || rec.id;
    if (draftMatricByDocId[docKey]) return draftMatricByDocId[docKey];
    const eff = getEffectiveMatricSentUp(rec);
    return {
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
    };
  };

  const hasMarkEnteredForSubject = (rec: AdmitCardRecord): boolean => {
    if (rec.examType === 'INTERMEDIATE (+2)') {
      const slot = findInterSubjectSlot(rec, selectedSubject);
      if (!slot) return false;
      const d = getEffectiveInterDraft(rec);
      return cleanMarkForInput(d[slot.theoryKey]) !== '';
    }
    const slot = findMatricSubjectSlot(rec, selectedSubject);
    if (!slot) return false;
    const d = getEffectiveMatricDraft(rec);
    return cleanMarkForInput(d[slot.theoryKey]) !== '';
  };

  const visibleStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subjectStudents.filter((rec) => {
      if (statusFilter === 'ENTERED' && !hasMarkEnteredForSubject(rec)) return false;
      if (statusFilter === 'PENDING' && hasMarkEnteredForSubject(rec)) return false;
      if (!q) return true;
      return (
        rec.studentName.toLowerCase().includes(q) ||
        rec.fatherName.toLowerCase().includes(q) ||
        rec.rollNumber.toLowerCase().includes(q) ||
        rec.registrationNo.toLowerCase().includes(q) ||
        rec.bsebUniqueId.toLowerCase().includes(q)
      );
    });
  }, [subjectStudents, searchQuery, statusFilter, draftInterByDocId, draftMatricByDocId, selectedSubject]);

  const enteredCount = useMemo(
    () => subjectStudents.filter((r) => hasMarkEnteredForSubject(r)).length,
    [subjectStudents, draftInterByDocId, draftMatricByDocId, selectedSubject]
  );

  const dirtyDocIds = useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(draftInterByDocId),
      ...Object.keys(draftMatricByDocId),
    ]);
    return Array.from(set);
  }, [draftInterByDocId, draftMatricByDocId]);

  const updateInterField = (
    rec: AdmitCardRecord,
    field: keyof InterSentUpMarks,
    value: string
  ) => {
    const docKey = rec.firestoreDocId || rec.id;
    const base = getEffectiveInterDraft(rec);
    setDraftInterByDocId((prev) => ({
      ...prev,
      [docKey]: { ...base, [field]: value },
    }));
  };

  const updateMatricField = (
    rec: AdmitCardRecord,
    field: keyof MatricSentUpMarks,
    value: string
  ) => {
    const docKey = rec.firestoreDocId || rec.id;
    const base = getEffectiveMatricDraft(rec);
    setDraftMatricByDocId((prev) => ({
      ...prev,
      [docKey]: { ...base, [field]: value },
    }));
  };

  const handleSaveSingleStudent = async (rec: AdmitCardRecord) => {
    const docKey = rec.firestoreDocId || rec.id;
    setNotice(null);
    setSavingDocIds((prev) => ({ ...prev, [docKey]: true }));
    try {
      const updatedRec: AdmitCardRecord = {
        ...rec,
        interSentUp: draftInterByDocId[docKey] ?? getEffectiveInterDraft(rec),
        matricSentUp: draftMatricByDocId[docKey] ?? getEffectiveMatricDraft(rec),
      };
      await updateStudentMarksAsTeacher(updatedRec);
      setDraftInterByDocId((prev) => {
        const next = { ...prev };
        delete next[docKey];
        return next;
      });
      setDraftMatricByDocId((prev) => {
        const next = { ...prev };
        delete next[docKey];
        return next;
      });
      setNotice({
        type: 'success',
        text: `Saved ${selectedSubject} marks for ${rec.studentName}.`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save marks.',
      });
    } finally {
      setSavingDocIds((prev) => {
        const next = { ...prev };
        delete next[docKey];
        return next;
      });
    }
  };

  const handleSaveAllDirty = async () => {
    if (dirtyDocIds.length === 0) return;
    setNotice(null);
    setIsSavingAll(true);
    let savedCount = 0;
    try {
      for (const docKey of dirtyDocIds) {
        const rec = assignedStudents.find((s) => (s.firestoreDocId || s.id) === docKey);
        if (!rec) continue;
        const updatedRec: AdmitCardRecord = {
          ...rec,
          interSentUp: draftInterByDocId[docKey] ?? getEffectiveInterDraft(rec),
          matricSentUp: draftMatricByDocId[docKey] ?? getEffectiveMatricDraft(rec),
        };
        await updateStudentMarksAsTeacher(updatedRec);
        savedCount += 1;
      }
      setDraftInterByDocId({});
      setDraftMatricByDocId({});
      setNotice({
        type: 'success',
        text: `Saved marks for ${savedCount} students directly to School ${selectedSchool}.`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error while saving some marks.',
      });
    } finally {
      setIsSavingAll(false);
    }
  };

  const activeSchoolObj = assignedSchools.find((s) => s.code === selectedSchool);

  return (
    <div className="space-y-4">
      {/* Top Teacher Identity & Actions Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                Teacher Marks Entry Portal
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-600 font-mono">
              {user.displayName || assignments[0]?.teacherName || 'Subject Teacher'} ·{' '}
              {user.email} · {assignedSchools.length} School(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canSwitchToAdmin && onSwitchToAdmin && (
              <button
                type="button"
                onClick={onSwitchToAdmin}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 whitespace-nowrap shrink-0"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Admin Mode</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAllDirty}
              disabled={dirtyDocIds.length === 0 || isSavingAll}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Save className="h-3.5 w-3.5" />
              <span>
                {isSavingAll
                  ? 'Saving...'
                  : dirtyDocIds.length > 0
                  ? `Save All Changes (${dirtyDocIds.length})`
                  : 'All Saved'}
              </span>
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{notice.text}</span>
          </div>
        )}
      </section>

      {/* School, Class & Subject Selector Strip */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* School */}
          <div className="lg:col-span-3">
            <label
              htmlFor="teacher-portal-school"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Assigned School
            </label>
            {assignedSchools.length > 1 ? (
              <select
                id="teacher-portal-school"
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                {assignedSchools.map((s) => (
                  <option key={s.code} value={s.code}>
                    [{s.code}] {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 truncate font-mono">
                [{activeSchoolObj?.code || '---'}] {activeSchoolObj?.name || 'School'}
              </div>
            )}
          </div>

          {/* Class Selector (only assigned classes) */}
          <div className="lg:col-span-3">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Assigned Class
            </span>
            <div className="flex gap-1.5">
              {assignedClasses.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setSelectedClass(cls)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedClass === cls
                      ? cls === 'INTERMEDIATE (+2)'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                        : 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cls === 'INTERMEDIATE (+2)' ? (
                    <GraduationCap className="h-3.5 w-3.5" />
                  ) : (
                    <School className="h-3.5 w-3.5" />
                  )}
                  <span>{cls === 'INTERMEDIATE (+2)' ? '12th (+2)' : '10th (Matric)'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Assigned Subject Selector */}
          <div className="lg:col-span-4">
            <label
              htmlFor="teacher-portal-subject"
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              <BookOpen className="h-3 w-3" />
              <span>Assigned Subject</span>
            </label>
            <select
              id="teacher-portal-subject"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
            >
              {assignedSubjectOptions.map((opt) => (
                <option key={opt.label} value={opt.label}>
                  {opt.label} ({opt.studentCount} Students)
                </option>
              ))}
            </select>
          </div>

          {/* Progress summary */}
          <div className="lg:col-span-2 flex flex-col justify-end">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono tabular-nums text-slate-800">
              <span className="font-bold text-emerald-700">{enteredCount}</span> /{' '}
              <span>{subjectStudents.length}</span> Entered
            </div>
          </div>
        </div>

        {/* Search & Filter Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student name, roll no, reg no..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(['ALL', 'PENDING', 'ENTERED'] as FilterEntered[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setStatusFilter(mode)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  statusFilter === mode
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {mode === 'ALL' ? 'All' : mode === 'PENDING' ? 'Pending' : 'Entered'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Marks Entry Table */}
      {visibleStudents.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-2.5 text-sm font-bold text-slate-900">
            No Students Found for {selectedSubject || 'Selected Subject'}
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            {subjectStudents.length === 0
              ? 'इस School Code और Subject के लिए अभी कोई छात्र सिंक नहीं हुआ है। Admin को "Sync Permissions" दबाने को कहें।'
              : 'अपना सर्च या फ़िल्टर बदलकर देखें।'}
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  <th className="px-3 py-3">Student &amp; Father&apos;s Name</th>
                  <th className="px-3 py-3">Roll / Reg. No.</th>
                  <th className="px-3 py-3">Subject Marks ({selectedSubject})</th>
                  <th className="px-3 py-3 text-center w-20">Total</th>
                  <th className="px-3 py-3 text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleStudents.map((rec, idx) => {
                  const docKey = rec.firestoreDocId || rec.id;
                  const isDirty = Boolean(draftInterByDocId[docKey] || draftMatricByDocId[docKey]);
                  const isSavingRow = Boolean(savingDocIds[docKey]);

                  const isInter = rec.examType === 'INTERMEDIATE (+2)';
                  const interSlot = isInter ? findInterSubjectSlot(rec, selectedSubject) : null;
                  const matricSlot = !isInter ? findMatricSubjectSlot(rec, selectedSubject) : null;
                  const interDraft = isInter ? getEffectiveInterDraft(rec) : null;
                  const matricDraft = !isInter ? getEffectiveMatricDraft(rec) : null;

                  let rowTotalDisplay = '—';
                  if (isInter && interSlot && interDraft) {
                    const th = parseNumericMark(interDraft[interSlot.theoryKey]);
                    const pr =
                      interSlot.hasPractical && interSlot.practicalKey
                        ? parseNumericMark(interDraft[interSlot.practicalKey])
                        : 0;
                    const hasVal =
                      cleanMarkForInput(interDraft[interSlot.theoryKey]) !== '' ||
                      (interSlot.hasPractical &&
                        interSlot.practicalKey &&
                        cleanMarkForInput(interDraft[interSlot.practicalKey]) !== '');
                    rowTotalDisplay = hasVal ? String(th + pr) : '—';
                  } else if (!isInter && matricSlot && matricDraft) {
                    const th = parseNumericMark(matricDraft[matricSlot.theoryKey]);
                    const pr = matricSlot.practicalKey
                      ? parseNumericMark(matricDraft[matricSlot.practicalKey])
                      : 0;
                    const lit = matricSlot.litActKey
                      ? parseNumericMark(matricDraft[matricSlot.litActKey])
                      : 0;
                    const prw = matricSlot.prWorkKey
                      ? parseNumericMark(matricDraft[matricSlot.prWorkKey])
                      : 0;
                    const hasVal =
                      cleanMarkForInput(matricDraft[matricSlot.theoryKey]) !== '' ||
                      (matricSlot.practicalKey &&
                        cleanMarkForInput(matricDraft[matricSlot.practicalKey]) !== '') ||
                      (matricSlot.litActKey &&
                        cleanMarkForInput(matricDraft[matricSlot.litActKey]) !== '') ||
                      (matricSlot.prWorkKey &&
                        cleanMarkForInput(matricDraft[matricSlot.prWorkKey]) !== '');
                    rowTotalDisplay = hasVal ? String(th + pr + lit + prw) : '—';
                  }

                  return (
                    <tr
                      key={docKey}
                      className={isDirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}
                    >
                      <td className="px-3 py-3 text-center font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-slate-900 uppercase">
                          {rec.studentName || '---'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          F: {rec.fatherName || '---'} · {rec.faculty}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono tabular-nums text-[11px] text-slate-700">
                        <div className="font-semibold text-slate-900">
                          {rec.rollCode || '-'} / {rec.rollNumber || '-'}
                        </div>
                        <div className="text-slate-500">{rec.registrationNo || '---'}</div>
                      </td>
                      <td className="px-3 py-3">
                        {isInter && interSlot && interDraft ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="w-24">
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                {interSlot.hasPractical
                                  ? `Theory (/${interSlot.maxTheory})`
                                  : `Marks (/${interSlot.maxTheory})`}
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={cleanMarkForInput(interDraft[interSlot.theoryKey])}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) =>
                                  updateInterField(rec, interSlot.theoryKey, e.target.value)
                                }
                                placeholder="00"
                                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                              />
                            </div>

                            {interSlot.hasPractical && interSlot.practicalKey && (
                              <div className="w-24">
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Practical (/{interSlot.maxPractical})
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={cleanMarkForInput(interDraft[interSlot.practicalKey])}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    updateInterField(rec, interSlot.practicalKey!, e.target.value)
                                  }
                                  placeholder="00"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        ) : !isInter && matricSlot && matricDraft ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="w-24">
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Theory (/{matricSlot.maxTheory})
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={cleanMarkForInput(matricDraft[matricSlot.theoryKey])}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) =>
                                  updateMatricField(rec, matricSlot.theoryKey, e.target.value)
                                }
                                placeholder="00"
                                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                              />
                            </div>

                            {matricSlot.practicalKey && (
                              <div className="w-24">
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Practical (/{matricSlot.maxPractical || 20})
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={cleanMarkForInput(matricDraft[matricSlot.practicalKey])}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    updateMatricField(rec, matricSlot.practicalKey!, e.target.value)
                                  }
                                  placeholder="00"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                                />
                              </div>
                            )}

                            {matricSlot.litActKey && (
                              <div className="w-20">
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Lit. Act (/10)
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={cleanMarkForInput(matricDraft[matricSlot.litActKey])}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    updateMatricField(rec, matricSlot.litActKey!, e.target.value)
                                  }
                                  placeholder="00"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                                />
                              </div>
                            )}

                            {matricSlot.prWorkKey && (
                              <div className="w-20">
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Pr. Work (/10)
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={cleanMarkForInput(matricDraft[matricSlot.prWorkKey])}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    updateMatricField(rec, matricSlot.prWorkKey!, e.target.value)
                                  }
                                  placeholder="00"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Subject slot not mapped</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-mono tabular-nums font-bold text-sm text-slate-900">
                        {rowTotalDisplay}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveSingleStudent(rec)}
                          disabled={!isDirty || isSavingRow}
                          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                            isDirty
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                              : 'border border-slate-200 bg-slate-50 text-slate-400'
                          }`}
                        >
                          <Save className="h-3 w-3" />
                          <span>{isSavingRow ? '...' : isDirty ? 'Save' : 'Saved'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
