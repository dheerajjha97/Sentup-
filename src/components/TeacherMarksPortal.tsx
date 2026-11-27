import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  Loader2,
  ArrowRight,
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
  normalizeSchoolCode,
  studentMatchesAssignedSubject,
} from '../utils/teacherSubjectMatcher';

interface TeacherMarksPortalProps {
  user: User;
  assignments: TeacherAssignment[];
  assignedStudents: AdmitCardRecord[];
  isLoadingAssignments?: boolean;
  isLoadingStudents?: boolean;
  studentsError?: string;
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

function getDisplayStudentName(rec: AdmitCardRecord, index: number): string {
  const name = (rec.studentName || '').trim();
  if (name) return name;
  if (rec.registrationNo?.trim()) return `Reg: ${rec.registrationNo.trim()}`;
  if (rec.rollNumber?.trim() && !/^x+$/i.test(rec.rollNumber.trim())) {
    return `Roll: ${rec.rollNumber.trim()}`;
  }
  return `Student #${index + 1}`;
}

export const TeacherMarksPortal: React.FC<TeacherMarksPortalProps> = ({
  user,
  assignments,
  assignedStudents,
  isLoadingAssignments = false,
  isLoadingStudents = false,
  studentsError = '',
  onSignOut,
}) => {
  // Unique schools assigned to this teacher (normalized school codes)
  const assignedSchools = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    assignments.forEach((a) => {
      if (!a.active) return;
      const code = normalizeSchoolCode(a.schoolCode) || a.schoolCode.trim().toUpperCase();
      if (!code) return;
      if (!map.has(code)) {
        map.set(code, { code, name: a.schoolName || `School ${code}` });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [assignments]);

  const userPickedSchoolRef = useRef(false);
  const userPickedClassRef = useRef(false);

  const [selectedSchool, setSelectedSchool] = useState<string>(assignedSchools[0]?.code || '');

  useEffect(() => {
    if (assignedSchools.length === 0) return;
    const isCurrentValid = assignedSchools.some((s) => s.code === selectedSchool);
    if (!isCurrentValid) {
      setSelectedSchool(assignedSchools[0].code);
      return;
    }
    if (!userPickedSchoolRef.current && assignedStudents.length > 0) {
      const hasInCurrent = assignedStudents.some(
        (st) => normalizeSchoolCode(st.schoolCode, st.rollCode) === selectedSchool
      );
      if (!hasInCurrent) {
        const firstWithStudents = assignedSchools.find((sch) =>
          assignedStudents.some(
            (st) => normalizeSchoolCode(st.schoolCode, st.rollCode) === sch.code
          )
        );
        if (firstWithStudents) {
          setSelectedSchool(firstWithStudents.code);
        }
      }
    }
  }, [assignedSchools, selectedSchool, assignedStudents]);

  // Assignments for selected school
  const schoolAssignments = useMemo(
    () =>
      assignments.filter(
        (a) =>
          a.active &&
          (normalizeSchoolCode(a.schoolCode) || a.schoolCode.trim().toUpperCase()) === selectedSchool
      ),
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

  // Count of loaded students per class within the selected school
  const classStudentCounts = useMemo(() => {
    const counts: Record<ExamType, number> = {
      'INTERMEDIATE (+2)': 0,
      'MATRIC (10th)': 0,
    };
    assignedStudents.forEach((st) => {
      if (normalizeSchoolCode(st.schoolCode, st.rollCode) === selectedSchool) {
        counts[st.examType] = (counts[st.examType] || 0) + 1;
      }
    });
    return counts;
  }, [assignedStudents, selectedSchool]);

  const [selectedClass, setSelectedClass] = useState<ExamType>(
    assignedClasses[0] || 'INTERMEDIATE (+2)'
  );

  useEffect(() => {
    if (assignedClasses.length === 0) return;
    if (!assignedClasses.includes(selectedClass)) {
      setSelectedClass(assignedClasses[0]);
      return;
    }
    // Auto-switch to whichever assigned class actually has synced students if current class has 0
    if (
      !userPickedClassRef.current &&
      classStudentCounts[selectedClass] === 0 &&
      assignedStudents.length > 0
    ) {
      const nonEmptyClass = assignedClasses.find((cls) => classStudentCounts[cls] > 0);
      if (nonEmptyClass) {
        setSelectedClass(nonEmptyClass);
      }
    }
  }, [assignedClasses, selectedClass, classStudentCounts, assignedStudents.length]);

  // Students belonging to selected school & class
  const classStudents = useMemo(() => {
    return assignedStudents.filter((s) => {
      const sCode = normalizeSchoolCode(s.schoolCode, s.rollCode);
      return sCode === selectedSchool && s.examType === selectedClass;
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

  // Detect if assignedStudents exist in another school/class so teacher gets a 1-click jump button
  const alternatePopulatedTarget = useMemo(() => {
    if (subjectStudents.length > 0 || assignedStudents.length === 0) return null;
    for (const sch of assignedSchools) {
      const schAssignments = assignments.filter(
        (a) =>
          a.active &&
          (normalizeSchoolCode(a.schoolCode) || a.schoolCode.trim().toUpperCase()) === sch.code
      );
      for (const cls of ['INTERMEDIATE (+2)', 'MATRIC (10th)'] as ExamType[]) {
        const clsAssignments = schAssignments.filter((a) => a.assignedClasses.includes(cls));
        if (clsAssignments.length === 0) continue;
        const count = assignedStudents.filter(
          (st) =>
            normalizeSchoolCode(st.schoolCode, st.rollCode) === sch.code && st.examType === cls
        ).length;
        if (count > 0) {
          return { schoolCode: sch.code, schoolName: sch.name, examType: cls, count };
        }
      }
    }
    return null;
  }, [subjectStudents.length, assignedStudents, assignedSchools, assignments]);

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
        text: `Saved ${selectedSubject} marks for ${getDisplayStudentName(rec, 0)}.`,
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

  const computeRowMeta = (rec: AdmitCardRecord) => {
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

    return { isInter, interSlot, matricSlot, interDraft, matricDraft, rowTotalDisplay };
  };

  const renderMarkInputs = (
    rec: AdmitCardRecord,
    meta: ReturnType<typeof computeRowMeta>
  ) => {
    const { isInter, interSlot, matricSlot, interDraft, matricDraft } = meta;
    if (isInter && interSlot && interDraft) {
      return (
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
              onChange={(e) => updateInterField(rec, interSlot.theoryKey, e.target.value)}
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
                onChange={(e) => updateInterField(rec, interSlot.practicalKey!, e.target.value)}
                placeholder="00"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          )}
        </div>
      );
    }

    if (!isInter && matricSlot && matricDraft) {
      return (
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
              onChange={(e) => updateMatricField(rec, matricSlot.theoryKey, e.target.value)}
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
                onChange={(e) => updateMatricField(rec, matricSlot.practicalKey!, e.target.value)}
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
                onChange={(e) => updateMatricField(rec, matricSlot.litActKey!, e.target.value)}
                placeholder="00"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
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
                onChange={(e) => updateMatricField(rec, matricSlot.prWorkKey!, e.target.value)}
                placeholder="00"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}
        </div>
      );
    }

    return <span className="text-xs text-slate-400">Subject slot not mapped</span>;
  };

  const activeSchoolObj = assignedSchools.find((s) => s.code === selectedSchool);

  return (
    <div className="space-y-4">
      {/* Top Teacher Identity & Actions Bar (Strictly Separate Teacher Module) */}
      <section className="rounded-2xl border border-blue-100 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                Teacher Marks Portal
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-600 font-mono">
              {user.displayName || assignments[0]?.teacherName || 'Subject Teacher'} ·{' '}
              {user.email} · {assignedSchools.length} School(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {assignedSchools.length > 0 && (
              <button
                type="button"
                onClick={handleSaveAllDirty}
                disabled={dirtyDocIds.length === 0 || isSavingAll}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-45 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
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
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {studentsError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>Students load error: {studentsError}</span>
          </div>
        )}

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

      {isLoadingAssignments ? (
        <section className="rounded-2xl border border-blue-100 bg-white p-10 text-center shadow-xs">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" />
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Loading your assigned schools &amp; subjects...
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Checking assignments for <span className="font-mono">{user.email}</span>
          </p>
        </section>
      ) : assignedSchools.length === 0 ? (
        <section className="rounded-2xl border border-blue-100 bg-white p-8 sm:p-10 text-center shadow-xs max-w-xl mx-auto">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base sm:text-lg font-bold text-slate-900">
            No Subject Assigned Yet
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            Aapke Google account{' '}
            <span className="font-mono font-semibold text-slate-900">{user.email}</span> par abhi
            koi School Code ya Subject assign nahi hai. Apne School Admin se{' '}
            <span className="font-semibold text-slate-900">Assign Teachers</span> panel me isi
            email par class aur subject assign karne ko kahein.
          </p>
          <div className="mt-6 flex items-center justify-center">
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Back to Login Screen</span>
            </button>
          </div>
        </section>
      ) : (
        <>
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
                onChange={(e) => {
                  userPickedSchoolRef.current = true;
                  setSelectedSchool(e.target.value);
                }}
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
                  onClick={() => {
                    userPickedClassRef.current = true;
                    setSelectedClass(cls);
                  }}
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
                  <span>
                    {cls === 'INTERMEDIATE (+2)' ? '12th (+2)' : '10th (Matric)'}
                  </span>
                  <span className="font-mono text-[10px] opacity-80">
                    ({classStudentCounts[cls] || 0})
                  </span>
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

      {/* Marks Entry List (Mobile Card View + Desktop Table View) */}
      {isLoadingStudents && assignedStudents.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600" />
          <h2 className="mt-2.5 text-sm font-bold text-slate-900">
            Loading Assigned Students...
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            School {selectedSchool} के छात्रों की सूची लोड हो रही है...
          </p>
        </section>
      ) : visibleStudents.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-10 text-center space-y-3">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="text-sm font-bold text-slate-900">
            No Students Found for {selectedSubject || 'Selected Subject'}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {subjectStudents.length === 0
              ? assignedStudents.length === 0
                ? 'इस Teacher Email के लिए अभी छात्र सिंक नहीं हुए हैं। कृपया Admin से एक बार ऐप खोलने या "Assign Teachers -> Sync Permissions" बटन दबाने को कहें।'
                : `इस School (${selectedSchool}) और Class (${selectedClass === 'INTERMEDIATE (+2)' ? '12th' : '10th'}) में "${selectedSubject}" विषय के लिए 0 छात्र मिले।`
              : 'अपना सर्च या फ़िल्टर बदलकर देखें।'}
          </p>
          {alternatePopulatedTarget && (
            <button
              type="button"
              onClick={() => {
                userPickedSchoolRef.current = true;
                userPickedClassRef.current = true;
                setSelectedSchool(alternatePopulatedTarget.schoolCode);
                setSelectedClass(alternatePopulatedTarget.examType);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <span>
                Open School {alternatePopulatedTarget.schoolCode} ·{' '}
                {alternatePopulatedTarget.examType === 'INTERMEDIATE (+2)' ? '12th (+2)' : '10th'}{' '}
                ({alternatePopulatedTarget.count} Students)
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </section>
      ) : (
        <>
          {/* Mobile Card Layout (< 768px): Student Name & Marks always visible together */}
          <section className="md:hidden space-y-2.5">
            {visibleStudents.map((rec, idx) => {
              const docKey = rec.firestoreDocId || rec.id;
              const isDirty = Boolean(draftInterByDocId[docKey] || draftMatricByDocId[docKey]);
              const isSavingRow = Boolean(savingDocIds[docKey]);
              const meta = computeRowMeta(rec);
              const displayName = getDisplayStudentName(rec, idx);

              return (
                <div
                  key={docKey}
                  className={`rounded-2xl border p-3.5 space-y-3 ${
                    isDirty
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {/* Student Identity Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-400 shrink-0">
                          #{idx + 1}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 uppercase leading-snug break-words">
                          {displayName}
                        </h3>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        F: {rec.fatherName || '---'} · {rec.faculty}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                        Roll: {rec.rollCode || '-'}/{rec.rollNumber || '-'} · Reg:{' '}
                        {rec.registrationNo || '---'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-semibold uppercase text-slate-400">
                        Total
                      </div>
                      <div className="font-mono text-base font-bold tabular-nums text-slate-900">
                        {meta.rowTotalDisplay}
                      </div>
                    </div>
                  </div>

                  {/* Marks Inputs + Row Save Button */}
                  <div className="flex items-end justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex-1">{renderMarkInputs(rec, meta)}</div>
                    <button
                      type="button"
                      onClick={() => handleSaveSingleStudent(rec)}
                      disabled={!isDirty || isSavingRow}
                      className={`inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        isDirty
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border border-slate-200 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{isSavingRow ? '...' : isDirty ? 'Save' : 'Saved'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Desktop Table Layout (>= 768px) */}
          <section className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3 py-3 w-10 text-center">#</th>
                    <th className="px-3 py-3 min-w-[220px]">Student &amp; Father&apos;s Name</th>
                    <th className="px-3 py-3 min-w-[150px]">Roll / Reg. No.</th>
                    <th className="px-3 py-3">Subject Marks ({selectedSubject})</th>
                    <th className="px-3 py-3 text-center w-20">Total</th>
                    <th className="px-3 py-3 text-right w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleStudents.map((rec, idx) => {
                    const docKey = rec.firestoreDocId || rec.id;
                    const isDirty = Boolean(
                      draftInterByDocId[docKey] || draftMatricByDocId[docKey]
                    );
                    const isSavingRow = Boolean(savingDocIds[docKey]);
                    const meta = computeRowMeta(rec);
                    const displayName = getDisplayStudentName(rec, idx);

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
                            {displayName}
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
                        <td className="px-3 py-3">{renderMarkInputs(rec, meta)}</td>
                        <td className="px-3 py-3 text-center font-mono tabular-nums font-bold text-sm text-slate-900">
                          {meta.rowTotalDisplay}
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
        </>
      )}
        </>
      )}
    </div>
  );
};
