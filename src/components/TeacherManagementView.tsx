import React, { useMemo, useState, useEffect } from 'react';
import {
  UserPlus,
  Mail,
  School,
  GraduationCap,
  Check,
  Trash2,
  Edit3,
  RefreshCw,
  Cloud,
  Copy,
  PauseCircle,
  PlayCircle,
  Plus,
  AlertCircle,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { AdmitCardRecord, ExamType, TeacherAssignment } from '../types/admitCard';
import { User } from '../firebase';
import {
  canonicalSubjectKey,
  getRecordSubjectList,
  normalizeSchoolCode,
  studentMatchesAssignedSubject,
} from '../utils/teacherSubjectMatcher';

interface TeacherManagementViewProps {
  records: AdmitCardRecord[];
  assignments: TeacherAssignment[];
  firebaseUser: User | null;
  onSignIn: () => Promise<void>;
  onSaveAssignment: (
    input: Omit<TeacherAssignment, 'ownerId' | 'ownerEmail'>
  ) => Promise<void>;
  onDeleteAssignment: (assignmentId: string) => Promise<void>;
  onResyncAllAccess: () => Promise<number>;
}

const DEFAULT_10TH_SUBJECTS = [
  'MIL - HINDI',
  'SIL - SANSKRIT',
  'SIL - URDU',
  'MATHEMATICS',
  'SCIENCE',
  'SOCIAL SCIENCE',
  'ENGLISH',
];

const DEFAULT_12TH_SUBJECTS = [
  '306 - Hindi',
  '305 - English',
  '117 - Physics',
  '118 - Chemistry',
  '119 - Biology',
  '121 - Mathematics',
  '321 - History',
  '322 - Political Science',
  '323 - Geography',
  '324 - Psychology',
  '325 - Sociology',
  '326 - Economics',
  '319 - Home Science',
  '220 - Accountancy',
  '217 - Business Studies',
  '218 - Entrepreneurship',
];

export const TeacherManagementView: React.FC<TeacherManagementViewProps> = ({
  records,
  assignments,
  firebaseUser,
  onSignIn,
  onSaveAssignment,
  onDeleteAssignment,
  onResyncAllAccess,
}) => {
  // Unique schools extracted from loaded Admit Cards
  const availableSchools = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count10: number; count12: number }>();
    records.forEach((r) => {
      const code = normalizeSchoolCode(r.schoolCode, r.rollCode);
      if (!code) return;
      const name = (r.schoolName || `School ${code}`).trim();
      const prev = map.get(code) || { code, name, count10: 0, count12: 0 };
      if (prev.name.startsWith('School ') && !name.startsWith('School ')) {
        prev.name = name;
      }
      if (r.examType === 'MATRIC (10th)') prev.count10 += 1;
      else prev.count12 += 1;
      map.set(code, prev);
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [records]);

  const [editingId, setEditingId] = useState<string>('');
  const [schoolCode, setSchoolCode] = useState<string>(availableSchools[0]?.code || '');
  const [schoolName, setSchoolName] = useState<string>(availableSchools[0]?.name || '');
  const [teacherName, setTeacherName] = useState<string>('');
  const [teacherEmail, setTeacherEmail] = useState<string>('');
  const [assignedClasses, setAssignedClasses] = useState<ExamType[]>(['INTERMEDIATE (+2)']);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);
  const [customSubjectInput, setCustomSubjectInput] = useState<string>('');
  const [filterSchool, setFilterSchool] = useState<string>('ALL');

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [copiedLink, setCopiedLink] = useState(false);

  // Auto-select first loaded school if schoolCode is empty
  useEffect(() => {
    if (!schoolCode && availableSchools.length > 0) {
      setSchoolCode(availableSchools[0].code);
      setSchoolName(availableSchools[0].name);
    }
  }, [availableSchools, schoolCode]);

  // Dynamic subjects available for the selected School Code and Classes
  const subjectCatalogByClass = useMemo(() => {
    const cleanSchool = normalizeSchoolCode(schoolCode);
    const schoolRecs = cleanSchool
      ? records.filter(
          (r) => normalizeSchoolCode(r.schoolCode, r.rollCode) === cleanSchool
        )
      : records;

    const extractForExam = (examType: ExamType, fallbackList: string[]) => {
      const recs = schoolRecs.filter((r) => r.examType === examType);
      const map = new Map<string, { label: string; count: number }>();

      recs.forEach((rec) => {
        getRecordSubjectList(rec).forEach((entry) => {
          const prev = map.get(entry.key);
          if (prev) {
            prev.count += 1;
            if (entry.label.length > prev.label.length) prev.label = entry.label;
          } else {
            map.set(entry.key, { label: entry.label, count: 1 });
          }
        });
      });

      if (map.size === 0) {
        fallbackList.forEach((subj) => {
          const k = canonicalSubjectKey(subj);
          if (k && !map.has(k)) map.set(k, { label: subj, count: 0 });
        });
      }

      return Array.from(map.entries())
        .map(([key, v]) => ({ key, label: v.label, count: v.count }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    return {
      inter: extractForExam('INTERMEDIATE (+2)', DEFAULT_12TH_SUBJECTS),
      matric: extractForExam('MATRIC (10th)', DEFAULT_10TH_SUBJECTS),
    };
  }, [records, schoolCode]);

  // Preview count of currently loaded students matching this form
  const matchedStudentPreviewCount = useMemo(() => {
    const cleanSchool = normalizeSchoolCode(schoolCode);
    if (!cleanSchool || assignedClasses.length === 0 || assignedSubjects.length === 0) return 0;
    return records.filter((rec) => {
      const recSchool = normalizeSchoolCode(rec.schoolCode, rec.rollCode);
      if (recSchool !== cleanSchool) return false;
      if (!assignedClasses.includes(rec.examType)) return false;
      return assignedSubjects.some((subj) => studentMatchesAssignedSubject(rec, subj));
    }).length;
  }, [records, schoolCode, assignedClasses, assignedSubjects]);

  const toggleClass = (examType: ExamType) => {
    setAssignedClasses((prev) =>
      prev.includes(examType) ? prev.filter((c) => c !== examType) : [...prev, examType]
    );
  };

  const isSubjectSelected = (subjectLabel: string) => {
    const k = canonicalSubjectKey(subjectLabel);
    return assignedSubjects.some((s) => canonicalSubjectKey(s) === k);
  };

  const toggleSubject = (subjectLabel: string) => {
    const k = canonicalSubjectKey(subjectLabel);
    setAssignedSubjects((prev) => {
      const exists = prev.some((s) => canonicalSubjectKey(s) === k);
      if (exists) {
        return prev.filter((s) => canonicalSubjectKey(s) !== k);
      }
      if (prev.length >= 25) return prev;
      return [...prev, subjectLabel];
    });
  };

  const handleAddCustomSubject = () => {
    const trimmed = customSubjectInput.trim();
    if (!trimmed) return;
    if (!isSubjectSelected(trimmed) && assignedSubjects.length < 25) {
      setAssignedSubjects((prev) => [...prev, trimmed]);
    }
    setCustomSubjectInput('');
  };

  const resetForm = () => {
    setEditingId('');
    setTeacherName('');
    setTeacherEmail('');
    setAssignedClasses(['INTERMEDIATE (+2)']);
    setAssignedSubjects([]);
    setCustomSubjectInput('');
  };

  const handleEditAssignment = (item: TeacherAssignment) => {
    setEditingId(item.id);
    setSchoolCode(item.schoolCode);
    setSchoolName(item.schoolName);
    setTeacherName(item.teacherName);
    setTeacherEmail(item.teacherEmail);
    setAssignedClasses(item.assignedClasses.length > 0 ? item.assignedClasses : ['INTERMEDIATE (+2)']);
    setAssignedSubjects(item.assignedSubjects);
    setStatusNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusNotice(null);

    const cleanCode = schoolCode.trim();
    const cleanEmail = teacherEmail.trim().toLowerCase();
    const cleanName = teacherName.trim();

    if (!cleanCode) {
      setStatusNotice({ type: 'error', text: 'Please select or enter a School Code.' });
      return;
    }
    if (!cleanName) {
      setStatusNotice({ type: 'error', text: 'Please enter the Teacher Name.' });
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setStatusNotice({ type: 'error', text: 'Please enter a valid Google Email (Gmail) address.' });
      return;
    }
    if (assignedClasses.length === 0) {
      setStatusNotice({ type: 'error', text: 'Select at least one Class (10th or 12th).' });
      return;
    }
    if (assignedSubjects.length === 0) {
      setStatusNotice({ type: 'error', text: 'Select at least one Subject for this teacher.' });
      return;
    }

    setIsSaving(true);
    try {
      await onSaveAssignment({
        id: editingId,
        teacherName: cleanName,
        teacherEmail: cleanEmail,
        schoolCode: cleanCode,
        schoolName: schoolName.trim() || `School ${cleanCode}`,
        assignedClasses,
        assignedSubjects,
        active: true,
      });
      setStatusNotice({
        type: 'success',
        text: editingId
          ? `Updated ${cleanName} (${cleanEmail}) and synced student access.`
          : `Assigned ${cleanName} (${cleanEmail}) to School ${cleanCode}. Teacher can now sign in with Google.`,
      });
      resetForm();
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save teacher assignment.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (item: TeacherAssignment) => {
    setStatusNotice(null);
    setIsSaving(true);
    try {
      await onSaveAssignment({
        id: item.id,
        teacherName: item.teacherName,
        teacherEmail: item.teacherEmail,
        schoolCode: item.schoolCode,
        schoolName: item.schoolName,
        assignedClasses: item.assignedClasses,
        assignedSubjects: item.assignedSubjects,
        active: !item.active,
      });
      setStatusNotice({
        type: 'success',
        text: !item.active
          ? `Re-activated ${item.teacherName} (${item.teacherEmail}).`
          : `Paused marks entry access for ${item.teacherName}.`,
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update status.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: TeacherAssignment) => {
    setStatusNotice(null);
    setIsSaving(true);
    try {
      await onDeleteAssignment(item.id);
      if (editingId === item.id) resetForm();
      setStatusNotice({
        type: 'success',
        text: `Removed ${item.teacherName} and revoked access from School ${item.schoolCode}.`,
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove teacher.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResync = async () => {
    setStatusNotice(null);
    setIsSyncing(true);
    try {
      const count = await onResyncAllAccess();
      setStatusNotice({
        type: 'success',
        text:
          count > 0
            ? `Synced teacher access permissions across ${count} student cloud records.`
            : 'All student records are already up to date with teacher permissions.',
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Permission sync failed.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyAppUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.origin).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      });
    }
  };

  const filteredAssignments = useMemo(() => {
    if (filterSchool === 'ALL') return assignments;
    return assignments.filter((a) => a.schoolCode === filterSchool);
  }, [assignments, filterSchool]);

  const assignmentSchools = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => set.add(a.schoolCode));
    return Array.from(set).sort();
  }, [assignments]);

  if (!firebaseUser) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center max-w-2xl mx-auto">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Cloud className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">
          Sign in with Google to Assign Subject Teachers
        </h2>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
          School Code के अनुसार टीचर्स को एक से ज़्यादा Class (10th / 12th) और Subjects असाइन करने के लिए पहले अपने Admin Google अकाउंट से लॉगिन करें।
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          <Cloud className="h-4 w-4" />
          <span>Sign in with Google (Admin)</span>
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Teacher Login Share Strip */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Teacher Subject Assignment · स्कूल-कोड अनुसार शिक्षक प्रबंधन
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {assignments.length} Assigned Teachers · {availableSchools.length} Schools Loaded · एक टीचर को एक से ज़्यादा Class (10th/12th) और Subjects दे सकते हैं
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAppUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Link Copied' : 'Copy Teacher Login Link'}</span>
            </button>
            <button
              type="button"
              onClick={handleResync}
              disabled={isSyncing || records.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync Permissions ({records.length})</span>
            </button>
          </div>
        </div>

        {statusNotice && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
              statusNotice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {statusNotice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{statusNotice.text}</span>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Assign / Edit Teacher Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                {editingId ? 'Edit Teacher Assignment' : 'Assign New Subject Teacher'}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {/* School Code & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="teacher-school-code"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                School Code *
              </label>
              {availableSchools.length > 0 ? (
                <select
                  id="teacher-school-code"
                  value={schoolCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSchoolCode(code);
                    const found = availableSchools.find((s) => s.code === code);
                    if (found) setSchoolName(found.name);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {availableSchools.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name.slice(0, 26)} ({s.count12 + s.count10})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="teacher-school-code"
                  type="text"
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value)}
                  placeholder="e.g. 51803"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              )}
            </div>

            <div>
              <label
                htmlFor="teacher-school-name"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                School Name
              </label>
              <input
                id="teacher-school-name"
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. H.S.S. BERUA"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Teacher Name & Gmail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="teacher-name-input"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                Teacher Name *
              </label>
              <input
                id="teacher-name-input"
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="teacher-email-input"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                Teacher Gmail (Login ID) *
              </label>
              <input
                id="teacher-email-input"
                type="email"
                value={teacherEmail}
                onChange={(e) => setTeacherEmail(e.target.value)}
                placeholder="teacher@gmail.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Multi-Class Selection */}
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Assigned Classes (एक या दोनों चुनें) *
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleClass('INTERMEDIATE (+2)')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  assignedClasses.includes('INTERMEDIATE (+2)')
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span>Class 12th (+2)</span>
                {assignedClasses.includes('INTERMEDIATE (+2)') && (
                  <Check className="h-3.5 w-3.5 text-indigo-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleClass('MATRIC (10th)')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  assignedClasses.includes('MATRIC (10th)')
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <School className="h-3.5 w-3.5" />
                <span>Class 10th (Matric)</span>
                {assignedClasses.includes('MATRIC (10th)') && (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                )}
              </button>
            </div>
          </div>

          {/* Multi-Subject Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Assigned Subjects ({assignedSubjects.length} Selected) *
              </span>
              {assignedSubjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAssignedSubjects([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
                >
                  Clear All
                </button>
              )}
            </div>

            {assignedClasses.includes('INTERMEDIATE (+2)') && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-indigo-700">
                  12th Intermediate Subjects
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {subjectCatalogByClass.inter.map((subj) => {
                    const checked = isSubjectSelected(subj.label);
                    return (
                      <button
                        key={`12_${subj.key}`}
                        type="button"
                        onClick={() => toggleSubject(subj.label)}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          checked
                            ? 'border-indigo-600 bg-indigo-50 font-semibold text-indigo-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{subj.label}</span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">
                          {subj.count > 0 ? subj.count : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {assignedClasses.includes('MATRIC (10th)') && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-emerald-700">
                  10th Matric Subjects
                </div>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {subjectCatalogByClass.matric.map((subj) => {
                    const checked = isSubjectSelected(subj.label);
                    return (
                      <button
                        key={`10_${subj.key}`}
                        type="button"
                        onClick={() => toggleSubject(subj.label)}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          checked
                            ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{subj.label}</span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">
                          {subj.count > 0 ? subj.count : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add custom subject */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customSubjectInput}
                onChange={(e) => setCustomSubjectInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomSubject();
                  }
                }}
                placeholder="Add custom subject (e.g. 122 - Computer Science)"
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomSubject}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </div>

            {assignedSubjects.length > 0 && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Selected: </span>
                {assignedSubjects.join(' · ')}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3">
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Matches {matchedStudentPreviewCount} loaded students
            </span>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Check className="h-3.5 w-3.5" />
              <span>
                {isSaving
                  ? 'Saving...'
                  : editingId
                  ? 'Update & Sync Access'
                  : 'Save & Assign Teacher'}
              </span>
            </button>
          </div>
        </form>

        {/* Right: Assigned Teachers Directory */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Assigned Subject Teachers ({filteredAssignments.length})
              </h2>
            </div>

            {assignmentSchools.length > 1 && (
              <select
                aria-label="Filter teachers by school code"
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800"
              >
                <option value="ALL">All Schools ({assignmentSchools.length})</option>
                {assignmentSchools.map((code) => (
                  <option key={code} value={code}>
                    School Code {code}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="py-10 text-center">
              <Mail className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">
                No Teachers Assigned Yet
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                बाईं ओर फॉर्म में School Code, Teacher Gmail, Class (10th/12th) और Subjects चुनकर पहला टीचर जोड़ें।
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAssignments.map((item) => {
                const normAssignSchool = normalizeSchoolCode(item.schoolCode);
                const cleanEmail = item.teacherEmail.trim().toLowerCase();
                const matchedStudents = records.filter((rec) => {
                  const recSchool = normalizeSchoolCode(rec.schoolCode, rec.rollCode);
                  if (recSchool !== normAssignSchool) return false;
                  if (!item.assignedClasses.includes(rec.examType)) return false;
                  return item.assignedSubjects.some((subj) =>
                    studentMatchesAssignedSubject(rec, subj)
                  );
                });
                const matchedCount = matchedStudents.length;
                const syncedCount = matchedStudents.filter((rec) =>
                  (rec.assignedTeacherEmails || []).includes(cleanEmail)
                ).length;

                return (
                  <div
                    key={item.id}
                    className={`py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 ${
                      !item.active ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-slate-900">
                          {item.teacherName}
                        </span>
                        <span className="text-xs font-mono text-indigo-700 break-all">
                          {item.teacherEmail}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            item.active ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          · {item.active ? 'Active' : 'Paused'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 font-mono tabular-nums">
                        School {item.schoolCode} ({item.schoolName}) ·{' '}
                        {item.assignedClasses
                          .map((c) => (c === 'MATRIC (10th)' ? '10th' : '12th'))
                          .join(' & ')}{' '}
                        · {matchedCount} Students
                        {item.active && matchedCount > 0 && (
                          <span
                            className={`ml-1.5 font-semibold ${
                              syncedCount === matchedCount ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            ({syncedCount}/{matchedCount} Synced)
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-800">
                        <span className="font-semibold text-slate-500">Subjects: </span>
                        {item.assignedSubjects.join(' · ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditAssignment(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        disabled={isSaving}
                        title={item.active ? 'Pause teacher access' : 'Activate teacher access'}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {item.active ? (
                          <>
                            <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Enable</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isSaving}
                        aria-label={`Remove ${item.teacherName}`}
                        className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Teacher Login Quick Guide */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <div className="font-bold text-slate-800">Teacher कैसे Login करेंगे?</div>
            <p>
              1. टीचर को ऐप का लिंक भेजें और ऊपर दर्ज उनके <strong>Gmail</strong> से <strong>Sign in with Google</strong> करने को कहें।
            </p>
            <p>
              2. लॉगिन होते ही उन्हें केवल अपने <strong>School Code</strong>, <strong>Assigned Class</strong> और <strong>Assigned Subjects</strong> के छात्र व मार्क्स बॉक्स दिखेंगे।
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
