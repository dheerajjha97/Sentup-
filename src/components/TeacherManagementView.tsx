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
  Building2,
  Printer,
  Lock,
} from 'lucide-react';
import {
  AdmitCardRecord,
  ClerkAssignment,
  ExamType,
  TeacherAssignment,
} from '../types/admitCard';
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
  clerkAssignments?: ClerkAssignment[];
  firebaseUser: User | null;
  onSignIn: () => Promise<void>;
  onSaveAssignment: (
    input: Omit<TeacherAssignment, 'ownerId' | 'ownerEmail'>
  ) => Promise<void>;
  onSaveMultipleAssignments?: (
    inputs: Array<Omit<TeacherAssignment, 'ownerId' | 'ownerEmail'>>
  ) => Promise<number>;
  onDeleteAssignment: (assignmentId: string) => Promise<void>;
  onSaveClerkAssignment?: (
    input: Omit<ClerkAssignment, 'ownerId' | 'ownerEmail'>
  ) => Promise<void>;
  onSaveMultipleClerkAssignments?: (
    inputs: Array<Omit<ClerkAssignment, 'ownerId' | 'ownerEmail'>>
  ) => Promise<number>;
  onDeleteClerkAssignment?: (assignmentId: string) => Promise<void>;
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
  clerkAssignments = [],
  firebaseUser,
  onSignIn,
  onSaveAssignment,
  onSaveMultipleAssignments,
  onDeleteAssignment,
  onSaveClerkAssignment,
  onSaveMultipleClerkAssignments,
  onDeleteClerkAssignment,
  onResyncAllAccess,
}) => {
  const [staffTab, setStaffTab] = useState<'TEACHERS' | 'CLERKS'>('TEACHERS');

  // Unique schools extracted from loaded Admit Cards AND existing teacher/clerk assignments
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

    assignments.forEach((a) => {
      const code = normalizeSchoolCode(a.schoolCode);
      if (!code || map.has(code)) return;
      map.set(code, {
        code,
        name: a.schoolName || `School ${code}`,
        count10: 0,
        count12: 0,
      });
    });

    clerkAssignments.forEach((c) => {
      const code = normalizeSchoolCode(c.schoolCode);
      if (!code || map.has(code)) return;
      map.set(code, {
        code,
        name: c.schoolName || `School ${code}`,
        count10: 0,
        count12: 0,
      });
    });

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [records, assignments, clerkAssignments]);

  const [editingId, setEditingId] = useState<string>('');
  const [selectedSchoolCodes, setSelectedSchoolCodes] = useState<string[]>(() =>
    availableSchools.map((s) => s.code)
  );
  const [manualSchoolCode, setManualSchoolCode] = useState<string>('');
  const [manualSchoolName, setManualSchoolName] = useState<string>('');
  const [teacherName, setTeacherName] = useState<string>('');
  const [teacherEmail, setTeacherEmail] = useState<string>('');
  const [assignedClasses, setAssignedClasses] = useState<ExamType[]>(['INTERMEDIATE (+2)']);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);
  const [customSubjectInput, setCustomSubjectInput] = useState<string>('');
  const [filterSchool, setFilterSchool] = useState<string>('ALL');

  // Clerk form state (Read-Only Print Desk assignment)
  const [editingClerkId, setEditingClerkId] = useState<string>('');
  const [clerkSelectedSchools, setClerkSelectedSchools] = useState<string[]>(() =>
    availableSchools.map((s) => s.code)
  );
  const [clerkManualSchoolCode, setClerkManualSchoolCode] = useState<string>('');
  const [clerkManualSchoolName, setClerkManualSchoolName] = useState<string>('');
  const [clerkName, setClerkName] = useState<string>('');
  const [clerkEmail, setClerkEmail] = useState<string>('');
  const [clerkClasses, setClerkClasses] = useState<ExamType[]>([
    'INTERMEDIATE (+2)',
    'MATRIC (10th)',
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [copiedLink, setCopiedLink] = useState(false);

  // Auto-select loaded schools for Clerk form too when they first arrive
  useEffect(() => {
    if (clerkSelectedSchools.length === 0 && availableSchools.length > 0 && !editingClerkId) {
      setClerkSelectedSchools(availableSchools.map((s) => s.code));
      const autoClasses: ExamType[] = [];
      if (availableSchools.some((s) => s.count12 > 0)) autoClasses.push('INTERMEDIATE (+2)');
      if (availableSchools.some((s) => s.count10 > 0)) autoClasses.push('MATRIC (10th)');
      if (autoClasses.length > 0) setClerkClasses(autoClasses);
    }
  }, [availableSchools, clerkSelectedSchools.length, editingClerkId]);

  // Auto-select loaded schools when they first arrive and nothing is chosen yet
  useEffect(() => {
    if (selectedSchoolCodes.length === 0 && availableSchools.length > 0 && !editingId) {
      const codes = availableSchools.map((s) => s.code);
      setSelectedSchoolCodes(codes);

      const has12 = availableSchools.some((s) => s.count12 > 0);
      const has10 = availableSchools.some((s) => s.count10 > 0);
      const autoClasses: ExamType[] = [];
      if (has12) autoClasses.push('INTERMEDIATE (+2)');
      if (has10) autoClasses.push('MATRIC (10th)');
      if (autoClasses.length > 0) {
        setAssignedClasses(autoClasses);
      }
    }
  }, [availableSchools, selectedSchoolCodes.length, editingId]);

  const effectiveSelectedSchools = useMemo(() => {
    const cleanManual = normalizeSchoolCode(manualSchoolCode);
    const merged = new Set<string>(selectedSchoolCodes.map((c) => normalizeSchoolCode(c)).filter(Boolean));
    if (cleanManual) merged.add(cleanManual);
    return Array.from(merged);
  }, [selectedSchoolCodes, manualSchoolCode]);

  const toggleSchoolCode = (code: string) => {
    setSelectedSchoolCodes((prev) => {
      const exists = prev.includes(code);
      const next = exists ? prev.filter((c) => c !== code) : [...prev, code];

      // Smartly auto-enable classes present in the newly selected school
      if (!exists) {
        const sch = availableSchools.find((s) => s.code === code);
        if (sch) {
          setAssignedClasses((prevClasses) => {
            const set = new Set<ExamType>(prevClasses);
            if (sch.count12 > 0) set.add('INTERMEDIATE (+2)');
            if (sch.count10 > 0) set.add('MATRIC (10th)');
            return Array.from(set);
          });
        }
      }
      return next;
    });
  };

  const handleSelectAllSchools = () => {
    setSelectedSchoolCodes(availableSchools.map((s) => s.code));
    const nextClasses: ExamType[] = [];
    if (availableSchools.some((s) => s.count12 > 0)) nextClasses.push('INTERMEDIATE (+2)');
    if (availableSchools.some((s) => s.count10 > 0)) nextClasses.push('MATRIC (10th)');
    if (nextClasses.length > 0) setAssignedClasses(nextClasses);
  };

  // Dynamic subjects available across ALL selected School Codes & Classes
  const subjectCatalogByClass = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedSchools);
    const schoolRecs =
      selectedSet.size > 0
        ? records.filter((r) => selectedSet.has(normalizeSchoolCode(r.schoolCode, r.rollCode)))
        : records;

    const extractForExam = (examType: ExamType, fallbackList: string[]) => {
      const recs = schoolRecs.filter((r) => r.examType === examType);
      const map = new Map<string, { label: string; count: number; schools: Set<string> }>();

      recs.forEach((rec) => {
        const recSch = normalizeSchoolCode(rec.schoolCode, rec.rollCode);
        getRecordSubjectList(rec).forEach((entry) => {
          const prev = map.get(entry.key);
          if (prev) {
            prev.count += 1;
            if (recSch) prev.schools.add(recSch);
            if (entry.label.length > prev.label.length) prev.label = entry.label;
          } else {
            const schools = new Set<string>();
            if (recSch) schools.add(recSch);
            map.set(entry.key, { label: entry.label, count: 1, schools });
          }
        });
      });

      if (map.size === 0) {
        fallbackList.forEach((subj) => {
          const k = canonicalSubjectKey(subj);
          if (k && !map.has(k)) map.set(k, { label: subj, count: 0, schools: new Set() });
        });
      }

      return Array.from(map.entries())
        .map(([key, v]) => ({
          key,
          label: v.label,
          count: v.count,
          schools: Array.from(v.schools),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    return {
      inter: extractForExam('INTERMEDIATE (+2)', DEFAULT_12TH_SUBJECTS),
      matric: extractForExam('MATRIC (10th)', DEFAULT_10TH_SUBJECTS),
    };
  }, [records, effectiveSelectedSchools]);

  // Per-school & total preview count of loaded students matching this form
  const matchedPreviewBySchool = useMemo(() => {
    if (
      effectiveSelectedSchools.length === 0 ||
      assignedClasses.length === 0 ||
      assignedSubjects.length === 0
    ) {
      return { total: 0, bySchool: [] as Array<{ code: string; count: number }> };
    }

    const bySchool = effectiveSelectedSchools.map((code) => {
      const count = records.filter((rec) => {
        const recSchool = normalizeSchoolCode(rec.schoolCode, rec.rollCode);
        if (recSchool !== code) return false;
        if (!assignedClasses.includes(rec.examType)) return false;
        return assignedSubjects.some((subj) => studentMatchesAssignedSubject(rec, subj));
      }).length;
      return { code, count };
    });

    const total = bySchool.reduce((sum, item) => sum + item.count, 0);
    return { total, bySchool };
  }, [records, effectiveSelectedSchools, assignedClasses, assignedSubjects]);

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
    setManualSchoolCode('');
    setManualSchoolName('');
    setSelectedSchoolCodes(availableSchools.map((s) => s.code));
    const defaultClasses: ExamType[] = [];
    if (availableSchools.some((s) => s.count12 > 0)) defaultClasses.push('INTERMEDIATE (+2)');
    if (availableSchools.some((s) => s.count10 > 0)) defaultClasses.push('MATRIC (10th)');
    setAssignedClasses(defaultClasses.length > 0 ? defaultClasses : ['INTERMEDIATE (+2)']);
    setAssignedSubjects([]);
    setCustomSubjectInput('');
  };

  const handleEditAssignment = (item: TeacherAssignment) => {
    const normCode = normalizeSchoolCode(item.schoolCode) || item.schoolCode;
    setEditingId(item.id);
    setSelectedSchoolCodes([normCode]);
    setManualSchoolCode('');
    setManualSchoolName('');
    setTeacherName(item.teacherName);
    setTeacherEmail(item.teacherEmail);
    setAssignedClasses(item.assignedClasses.length > 0 ? item.assignedClasses : ['INTERMEDIATE (+2)']);
    setAssignedSubjects(item.assignedSubjects);
    setStatusNotice(null);
  };

  // Pre-fill teacher details to quickly tag them to another School Code (e.g. Matric or Inter school)
  const handleAddAnotherSchoolForTeacher = (item: TeacherAssignment) => {
    const cleanEmail = item.teacherEmail.trim().toLowerCase();
    const alreadyAssignedCodes = new Set(
      assignments
        .filter((a) => a.teacherEmail.trim().toLowerCase() === cleanEmail)
        .map((a) => normalizeSchoolCode(a.schoolCode))
    );
    const unassignedSchools = availableSchools.filter((s) => !alreadyAssignedCodes.has(s.code));

    setEditingId('');
    setTeacherName(item.teacherName);
    setTeacherEmail(item.teacherEmail);
    setManualSchoolCode('');
    setManualSchoolName('');

    if (unassignedSchools.length > 0) {
      setSelectedSchoolCodes(unassignedSchools.map((s) => s.code));
      const nextClasses: ExamType[] = [];
      if (unassignedSchools.some((s) => s.count12 > 0)) nextClasses.push('INTERMEDIATE (+2)');
      if (unassignedSchools.some((s) => s.count10 > 0)) nextClasses.push('MATRIC (10th)');
      setAssignedClasses(nextClasses.length > 0 ? nextClasses : ['MATRIC (10th)', 'INTERMEDIATE (+2)']);
    } else {
      setSelectedSchoolCodes([]);
      setAssignedClasses(['INTERMEDIATE (+2)', 'MATRIC (10th)']);
    }
    setAssignedSubjects([]);
    setStatusNotice({
      type: 'success',
      text: `Ready to tag ${item.teacherName} (${item.teacherEmail}) to another School Code. Select subjects and click Save.`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusNotice(null);

    const cleanEmail = teacherEmail.trim().toLowerCase();
    const cleanName = teacherName.trim();

    if (effectiveSelectedSchools.length === 0) {
      setStatusNotice({ type: 'error', text: 'Please select or enter at least one School Code.' });
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
      const payloads: Array<Omit<TeacherAssignment, 'ownerId' | 'ownerEmail'>> = [];

      effectiveSelectedSchools.forEach((code, idx) => {
        const schoolInfo = availableSchools.find((s) => s.code === code);
        const resolvedSchoolName =
          schoolInfo?.name ||
          (normalizeSchoolCode(manualSchoolCode) === code && manualSchoolName.trim()) ||
          `School ${code}`;

        // Determine classes relevant for this specific school code
        let schoolClasses: ExamType[] = [...assignedClasses];
        if (schoolInfo && (schoolInfo.count10 > 0 || schoolInfo.count12 > 0)) {
          const matchingClasses = assignedClasses.filter((cls) =>
            cls === 'MATRIC (10th)' ? schoolInfo.count10 > 0 : schoolInfo.count12 > 0
          );
          if (matchingClasses.length > 0) {
            schoolClasses = matchingClasses;
          }
        }

        // Determine subjects relevant for this school code (if students are loaded for it, keep subjects matching those students; otherwise keep all selected)
        const schoolStudentsInClasses = records.filter(
          (r) =>
            normalizeSchoolCode(r.schoolCode, r.rollCode) === code &&
            schoolClasses.includes(r.examType)
        );
        let schoolSubjects = [...assignedSubjects];
        if (schoolStudentsInClasses.length > 0) {
          const matchingSubjects = assignedSubjects.filter((subj) =>
            schoolStudentsInClasses.some((st) => studentMatchesAssignedSubject(st, subj))
          );
          if (matchingSubjects.length > 0) {
            schoolSubjects = matchingSubjects;
          }
        }

        // Reuse existing assignment ID if editing this school OR if same (teacherEmail, schoolCode) already exists
        const existingSameSchool = assignments.find(
          (a) =>
            a.teacherEmail.trim().toLowerCase() === cleanEmail &&
            normalizeSchoolCode(a.schoolCode) === code
        );
        const targetId =
          editingId && effectiveSelectedSchools.length === 1
            ? editingId
            : existingSameSchool?.id || `ta_${code}_${Date.now()}_${idx}`;

        payloads.push({
          id: targetId,
          teacherName: cleanName,
          teacherEmail: cleanEmail,
          schoolCode: code,
          schoolName: resolvedSchoolName,
          assignedClasses: schoolClasses,
          assignedSubjects: schoolSubjects,
          active: true,
        });
      });

      if (onSaveMultipleAssignments) {
        await onSaveMultipleAssignments(payloads);
      } else {
        for (const p of payloads) {
          await onSaveAssignment(p);
        }
      }

      const codesText = effectiveSelectedSchools.join(' & ');
      setStatusNotice({
        type: 'success',
        text: editingId
          ? `Updated ${cleanName} (${cleanEmail}) for School ${codesText} and synced student access.`
          : `Assigned ${cleanName} (${cleanEmail}) to School ${codesText} (${matchedPreviewBySchool.total} students matched & synced). Teacher can now sign in with Google.`,
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
          ? `Re-activated ${item.teacherName} (${item.teacherEmail}) for School ${item.schoolCode}.`
          : `Paused marks entry access for ${item.teacherName} (School ${item.schoolCode}).`,
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
    return assignments.filter((a) => normalizeSchoolCode(a.schoolCode) === filterSchool);
  }, [assignments, filterSchool]);

  const assignmentSchools = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => {
      const code = normalizeSchoolCode(a.schoolCode);
      if (code) set.add(code);
    });
    return Array.from(set).sort();
  }, [assignments]);

  // Count how many schools each teacher email is tagged to
  const schoolCountByTeacherEmail = useMemo(() => {
    const map = new Map<string, Set<string>>();
    assignments.forEach((a) => {
      const email = a.teacherEmail.trim().toLowerCase();
      const code = normalizeSchoolCode(a.schoolCode);
      if (!email || !code) return;
      if (!map.has(email)) map.set(email, new Set());
      map.get(email)!.add(code);
    });
    return map;
  }, [assignments]);

  // --- CLERK ASSIGNMENT HELPERS ---
  const effectiveClerkSchools = useMemo(() => {
    const cleanManual = normalizeSchoolCode(clerkManualSchoolCode);
    const merged = new Set<string>(
      clerkSelectedSchools.map((c) => normalizeSchoolCode(c)).filter(Boolean)
    );
    if (cleanManual) merged.add(cleanManual);
    return Array.from(merged);
  }, [clerkSelectedSchools, clerkManualSchoolCode]);

  const clerkMatchedPreview = useMemo(() => {
    if (effectiveClerkSchools.length === 0 || clerkClasses.length === 0) return 0;
    const schoolSet = new Set(effectiveClerkSchools);
    return records.filter(
      (rec) =>
        schoolSet.has(normalizeSchoolCode(rec.schoolCode, rec.rollCode)) &&
        clerkClasses.includes(rec.examType)
    ).length;
  }, [records, effectiveClerkSchools, clerkClasses]);

  const toggleClerkSchoolCode = (code: string) => {
    setClerkSelectedSchools((prev) => {
      const exists = prev.includes(code);
      const next = exists ? prev.filter((c) => c !== code) : [...prev, code];
      if (!exists) {
        const sch = availableSchools.find((s) => s.code === code);
        if (sch) {
          setClerkClasses((prevCls) => {
            const set = new Set<ExamType>(prevCls);
            if (sch.count12 > 0) set.add('INTERMEDIATE (+2)');
            if (sch.count10 > 0) set.add('MATRIC (10th)');
            return Array.from(set);
          });
        }
      }
      return next;
    });
  };

  const toggleClerkClass = (examType: ExamType) => {
    setClerkClasses((prev) =>
      prev.includes(examType) ? prev.filter((c) => c !== examType) : [...prev, examType]
    );
  };

  const resetClerkForm = () => {
    setEditingClerkId('');
    setClerkName('');
    setClerkEmail('');
    setClerkManualSchoolCode('');
    setClerkManualSchoolName('');
    setClerkSelectedSchools(availableSchools.map((s) => s.code));
    const defaults: ExamType[] = [];
    if (availableSchools.some((s) => s.count12 > 0)) defaults.push('INTERMEDIATE (+2)');
    if (availableSchools.some((s) => s.count10 > 0)) defaults.push('MATRIC (10th)');
    setClerkClasses(defaults.length > 0 ? defaults : ['INTERMEDIATE (+2)', 'MATRIC (10th)']);
  };

  const handleEditClerk = (item: ClerkAssignment) => {
    const normCode = normalizeSchoolCode(item.schoolCode) || item.schoolCode;
    setEditingClerkId(item.id);
    setClerkSelectedSchools([normCode]);
    setClerkManualSchoolCode('');
    setClerkManualSchoolName('');
    setClerkName(item.clerkName);
    setClerkEmail(item.clerkEmail);
    setClerkClasses(
      item.assignedClasses.length > 0 ? item.assignedClasses : ['INTERMEDIATE (+2)', 'MATRIC (10th)']
    );
    setStatusNotice(null);
  };

  const handleClerkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusNotice(null);

    const cleanEmail = clerkEmail.trim().toLowerCase();
    const cleanName = clerkName.trim();

    if (effectiveClerkSchools.length === 0) {
      setStatusNotice({ type: 'error', text: 'Please select or enter at least one School Code.' });
      return;
    }
    if (!cleanName) {
      setStatusNotice({ type: 'error', text: 'Please enter the Clerk Name.' });
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setStatusNotice({ type: 'error', text: 'Please enter a valid Google Email (Gmail) address.' });
      return;
    }
    if (clerkClasses.length === 0) {
      setStatusNotice({ type: 'error', text: 'Select at least one Class (10th or 12th).' });
      return;
    }

    setIsSaving(true);
    try {
      const payloads: Array<Omit<ClerkAssignment, 'ownerId' | 'ownerEmail'>> = [];

      effectiveClerkSchools.forEach((code, idx) => {
        const schoolInfo = availableSchools.find((s) => s.code === code);
        const resolvedName =
          schoolInfo?.name ||
          (normalizeSchoolCode(clerkManualSchoolCode) === code && clerkManualSchoolName.trim()) ||
          `School ${code}`;

        let schoolClasses: ExamType[] = [...clerkClasses];
        if (schoolInfo && (schoolInfo.count10 > 0 || schoolInfo.count12 > 0)) {
          const matching = clerkClasses.filter((cls) =>
            cls === 'MATRIC (10th)' ? schoolInfo.count10 > 0 : schoolInfo.count12 > 0
          );
          if (matching.length > 0) schoolClasses = matching;
        }

        const existingSameSchool = clerkAssignments.find(
          (c) =>
            c.clerkEmail.trim().toLowerCase() === cleanEmail &&
            normalizeSchoolCode(c.schoolCode) === code
        );
        const targetId =
          editingClerkId && effectiveClerkSchools.length === 1
            ? editingClerkId
            : existingSameSchool?.id || `ca_${code}_${Date.now()}_${idx}`;

        payloads.push({
          id: targetId,
          clerkName: cleanName,
          clerkEmail: cleanEmail,
          schoolCode: code,
          schoolName: resolvedName,
          assignedClasses: schoolClasses,
          active: true,
        });
      });

      if (onSaveMultipleClerkAssignments) {
        await onSaveMultipleClerkAssignments(payloads);
      } else if (onSaveClerkAssignment) {
        for (const p of payloads) {
          await onSaveClerkAssignment(p);
        }
      }

      const codesText = effectiveClerkSchools.join(' & ');
      setStatusNotice({
        type: 'success',
        text: editingClerkId
          ? `Updated Clerk ${cleanName} (${cleanEmail}) for School ${codesText} and synced Read-Only print access.`
          : `Assigned Read-Only Print Clerk ${cleanName} (${cleanEmail}) to School ${codesText} (${clerkMatchedPreview} students synced).`,
      });
      resetClerkForm();
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save clerk assignment.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleClerkActive = async (item: ClerkAssignment) => {
    if (!onSaveClerkAssignment) return;
    setStatusNotice(null);
    setIsSaving(true);
    try {
      await onSaveClerkAssignment({
        id: item.id,
        clerkName: item.clerkName,
        clerkEmail: item.clerkEmail,
        schoolCode: item.schoolCode,
        schoolName: item.schoolName,
        assignedClasses: item.assignedClasses,
        active: !item.active,
      });
      setStatusNotice({
        type: 'success',
        text: !item.active
          ? `Re-activated Read-Only Print Desk for ${item.clerkName} (School ${item.schoolCode}).`
          : `Paused Print Desk access for ${item.clerkName} (School ${item.schoolCode}).`,
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update clerk status.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClerk = async (item: ClerkAssignment) => {
    if (!onDeleteClerkAssignment) return;
    setStatusNotice(null);
    setIsSaving(true);
    try {
      await onDeleteClerkAssignment(item.id);
      if (editingClerkId === item.id) resetClerkForm();
      setStatusNotice({
        type: 'success',
        text: `Removed Print Clerk ${item.clerkName} from School ${item.schoolCode}.`,
      });
    } catch (err) {
      setStatusNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove clerk.',
      });
    } finally {
      setIsSaving(false);
    }
  };

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
          School Code के अनुसार टीचर्स को एक से ज़्यादा School Codes (10th / 12th) और Subjects असाइन करने के लिए पहले अपने Admin Google अकाउंट से लॉगिन करें।
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
        >
          <Cloud className="h-4 w-4" />
          <span>Sign in with Google (Admin)</span>
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Staff Role Switcher */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Teachers &amp; Print Clerks · मल्टी-स्कूल स्टाफ प्रबंधन
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {assignments.length} Subject Teachers · {clerkAssignments.length} Print Clerks · {availableSchools.length} School Codes Loaded
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAppUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Link Copied' : 'Copy Portal Link'}</span>
            </button>
            <button
              type="button"
              onClick={handleResync}
              disabled={isSyncing || records.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync Permissions ({records.length})</span>
            </button>
          </div>
        </div>

        {/* Clean 2-Tab Switcher: Subject Teachers vs Print Clerks */}
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => {
              setStaffTab('TEACHERS');
              setStatusNotice(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              staffTab === 'TEACHERS'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Subject Teachers ({assignments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStaffTab('CLERKS');
              setStatusNotice(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              staffTab === 'CLERKS'
                ? 'bg-sky-600 text-white shadow-2xs'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Clerks · Read-Only ({clerkAssignments.length})</span>
          </button>
        </div>

        {statusNotice && (
          <div
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
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

      {staffTab === 'CLERKS' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left: Assign / Edit Print Clerk Form (Read-Only Print Desk) */}
          <form
            onSubmit={handleClerkSubmit}
            className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-sky-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  {editingClerkId ? 'Edit Print Clerk' : 'Assign Print Clerk (Read-Only)'}
                </h2>
              </div>
              {editingClerkId && (
                <button
                  type="button"
                  onClick={resetClerkForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Multi-School Code Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  School Codes (एक या दोनों चुनें) *
                </span>
                {availableSchools.length > 1 && !editingClerkId && (
                  <button
                    type="button"
                    onClick={() => {
                      setClerkSelectedSchools(availableSchools.map((s) => s.code));
                      const nextCls: ExamType[] = [];
                      if (availableSchools.some((s) => s.count12 > 0)) nextCls.push('INTERMEDIATE (+2)');
                      if (availableSchools.some((s) => s.count10 > 0)) nextCls.push('MATRIC (10th)');
                      if (nextCls.length > 0) setClerkClasses(nextCls);
                    }}
                    className="text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer"
                  >
                    Select All ({availableSchools.length})
                  </button>
                )}
              </div>

              {availableSchools.length > 0 && (
                <div className="space-y-1.5">
                  {availableSchools.map((sch) => {
                    const isSelected = clerkSelectedSchools.includes(sch.code);
                    return (
                      <button
                        key={`clerk_${sch.code}`}
                        type="button"
                        disabled={Boolean(editingClerkId)}
                        onClick={() => toggleClerkSchoolCode(sch.code)}
                        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer disabled:cursor-default ${
                          isSelected
                            ? 'border-sky-600 bg-sky-50/70 text-sky-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                              isSelected
                                ? 'border-sky-600 bg-sky-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-slate-900">
                              <span>{sch.code}</span>
                              <span className="font-sans font-medium text-slate-600 truncate">
                                {sch.name}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500">
                              {sch.count12 > 0 && `12th (+2): ${sch.count12}`}
                              {sch.count12 > 0 && sch.count10 > 0 && ' · '}
                              {sch.count10 > 0 && `10th (Matric): ${sch.count10}`}
                              {sch.count12 === 0 && sch.count10 === 0 && '0 loaded students'}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!editingClerkId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <input
                    id="clerk-manual-school-code"
                    type="text"
                    value={clerkManualSchoolCode}
                    onChange={(e) => setClerkManualSchoolCode(e.target.value)}
                    placeholder={
                      availableSchools.length > 0
                        ? '+ Extra School Code (optional)'
                        : 'Enter School Code (e.g. 51803)'
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                  <input
                    id="clerk-manual-school-name"
                    type="text"
                    value={clerkManualSchoolName}
                    onChange={(e) => setClerkManualSchoolName(e.target.value)}
                    placeholder="School Name (optional)"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Clerk Name & Gmail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="clerk-name-input"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
                >
                  Clerk Name *
                </label>
                <input
                  id="clerk-name-input"
                  type="text"
                  value={clerkName}
                  onChange={(e) => setClerkName(e.target.value)}
                  placeholder="e.g. Amit Kumar (Clerk)"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="clerk-email-input"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
                >
                  Clerk Gmail (Login ID) *
                </label>
                <input
                  id="clerk-email-input"
                  type="email"
                  value={clerkEmail}
                  onChange={(e) => setClerkEmail(e.target.value)}
                  placeholder="clerk@gmail.com"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Classes Allowed to Print */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Print Access Classes (एक या दोनों चुनें) *
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => toggleClerkClass('INTERMEDIATE (+2)')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    clerkClasses.includes('INTERMEDIATE (+2)')
                      ? 'border-sky-600 bg-sky-50 text-sky-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>Class 12th (+2)</span>
                  {clerkClasses.includes('INTERMEDIATE (+2)') && (
                    <Check className="h-3.5 w-3.5 text-sky-600" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleClerkClass('MATRIC (10th)')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    clerkClasses.includes('MATRIC (10th)')
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <School className="h-3.5 w-3.5" />
                  <span>Class 10th (Matric)</span>
                  {clerkClasses.includes('MATRIC (10th)') && (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 px-3 py-2 text-[11px] text-sky-900 flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-sky-700 shrink-0 mt-0.5" />
              <span>
                Clerk को केवल <strong>Print &amp; Download (PDF / Excel / Attendance Sheet)</strong> की अनुमति होगी। वे कोई भी नंबर या छात्र रिकॉर्ड बदल या डिलीट नहीं कर सकते।
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-100 gap-2.5">
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                Grants read-only access to {clerkMatchedPreview} students
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>
                  {isSaving
                    ? 'Saving...'
                    : editingClerkId
                    ? 'Update Clerk Access'
                    : effectiveClerkSchools.length > 1
                    ? `Save Clerk (${effectiveClerkSchools.length} Schools)`
                    : 'Save & Assign Clerk'}
                </span>
              </button>
            </div>
          </form>

          {/* Right: Assigned Print Clerks Directory */}
          <section className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-sky-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Assigned Print Clerks ({clerkAssignments.length})
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-sky-700">Read-Only Desk</span>
            </div>

            {clerkAssignments.length === 0 ? (
              <div className="py-10 text-center">
                <Printer className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  No Print Clerks Assigned Yet
                </p>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  बाईं ओर फॉर्म में School Codes, Clerk का नाम और Gmail डालकर सेव करें। फिर Clerk अपने Gmail से <strong>Clerk Login</strong> करके केवल प्रिंट निकाल सकेंगे।
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {clerkAssignments.map((item) => {
                  const normSchool = normalizeSchoolCode(item.schoolCode);
                  const cleanEmail = item.clerkEmail.trim().toLowerCase();
                  const matched = records.filter(
                    (rec) =>
                      normalizeSchoolCode(rec.schoolCode, rec.rollCode) === normSchool &&
                      item.assignedClasses.includes(rec.examType)
                  );
                  const synced = matched.filter((rec) =>
                    (rec.assignedClerkEmails || []).includes(cleanEmail)
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
                          <span className="text-sm font-bold text-slate-900">{item.clerkName}</span>
                          <span className="text-xs font-mono text-sky-700 break-all">
                            {item.clerkEmail}
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
                          · {matched.length} Students
                          {item.active && matched.length > 0 && (
                            <span
                              className={`ml-1.5 font-semibold ${
                                synced === matched.length ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              ({synced}/{matched.length} Synced)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditClerk(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleClerkActive(item)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
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
                          onClick={() => handleDeleteClerk(item)}
                          disabled={isSaving}
                          aria-label={`Remove clerk ${item.clerkName}`}
                          className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800">Clerk Print Desk कैसे काम करेगा?</div>
              <p>
                1. Clerk को लॉगिन पेज पर <strong>Clerk Login</strong> बटन पर क्लिक करके अपने असाइन किए गए Gmail से साइन इन करना होगा।
              </p>
              <p>
                2. वहां केवल Attendance Sheet, 12th/10th Sent-Up Panji (PDF/Excel), Absent List और Admit Card Register प्रिंट/डाउनलोड करने के बटन होंगे — कोई Edit/Delete विकल्प नहीं होगा।
              </p>
            </div>
          </section>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Assign / Edit Teacher Form (Supports Tagging Multiple School Codes Together) */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                {editingId ? 'Edit Teacher Assignment' : 'Assign Subject Teacher (1 or Both Schools)'}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {/* Multi-School Code Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                School Codes (एक या दोनों चुनें) *
              </span>
              {availableSchools.length > 1 && !editingId && (
                <button
                  type="button"
                  onClick={handleSelectAllSchools}
                  className="text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer"
                >
                  Select All ({availableSchools.length})
                </button>
              )}
            </div>

            {availableSchools.length > 0 ? (
              <div className="space-y-1.5">
                {availableSchools.map((sch) => {
                  const isSelected = selectedSchoolCodes.includes(sch.code);
                  return (
                    <button
                      key={sch.code}
                      type="button"
                      disabled={Boolean(editingId)}
                      onClick={() => toggleSchoolCode(sch.code)}
                      className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer disabled:cursor-default ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-slate-900">
                            <span>{sch.code}</span>
                            <span className="font-sans font-medium text-slate-600 truncate">
                              {sch.name}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                            {sch.count12 > 0 && `12th (+2): ${sch.count12}`}
                            {sch.count12 > 0 && sch.count10 > 0 && ' · '}
                            {sch.count10 > 0 && `10th (Matric): ${sch.count10}`}
                            {sch.count12 === 0 && sch.count10 === 0 && '0 loaded students'}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Optional Manual School Code Entry (when no schools loaded or adding a new code) */}
            {!editingId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <input
                  id="teacher-manual-school-code"
                  type="text"
                  value={manualSchoolCode}
                  onChange={(e) => setManualSchoolCode(e.target.value)}
                  placeholder={
                    availableSchools.length > 0
                      ? '+ Extra School Code (optional)'
                      : 'Enter School Code (e.g. 51803)'
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
                <input
                  id="teacher-manual-school-name"
                  type="text"
                  value={manualSchoolName}
                  onChange={(e) => setManualSchoolName(e.target.value)}
                  placeholder="School Name (optional)"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            )}
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
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
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
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
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
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600 cursor-pointer"
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
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          checked
                            ? 'border-indigo-600 bg-indigo-50 font-semibold text-indigo-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{subj.label}</span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums">
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
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          checked
                            ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{subj.label}</span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums">
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
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
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

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-100 gap-2.5">
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              <div>Matches {matchedPreviewBySchool.total} loaded students</div>
              {matchedPreviewBySchool.bySchool.length > 1 && (
                <div className="text-[10px] text-slate-400">
                  {matchedPreviewBySchool.bySchool
                    .map((s) => `${s.code}: ${s.count}`)
                    .join(' · ')}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>
                {isSaving
                  ? 'Saving...'
                  : editingId
                  ? 'Update & Sync Access'
                  : effectiveSelectedSchools.length > 1
                  ? `Save & Tag ${effectiveSelectedSchools.length} Schools`
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
                बाईं ओर फॉर्म में एक या दोनों School Codes, Teacher Gmail, Class (10th/12th) और Subjects चुनकर टीचर जोड़ें।
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAssignments.map((item) => {
                const normAssignSchool = normalizeSchoolCode(item.schoolCode);
                const cleanEmail = item.teacherEmail.trim().toLowerCase();
                const teacherTaggedSchoolCount =
                  schoolCountByTeacherEmail.get(cleanEmail)?.size || 1;
                const hasMoreSchoolsAvailable =
                  availableSchools.length > teacherTaggedSchoolCount;

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
                        {teacherTaggedSchoolCount > 1 && (
                          <span className="text-[11px] font-semibold text-indigo-700">
                            · {teacherTaggedSchoolCount} Schools Tagged
                          </span>
                        )}
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

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {hasMoreSchoolsAvailable && (
                        <button
                          type="button"
                          onClick={() => handleAddAnotherSchoolForTeacher(item)}
                          title="Tag this same teacher email to your other school code"
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 whitespace-nowrap cursor-pointer"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          <span>+ Tag 2nd School</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditAssignment(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        disabled={isSaving}
                        title={item.active ? 'Pause teacher access' : 'Activate teacher access'}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
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
                        className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 cursor-pointer"
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
            <div className="font-bold text-slate-800">Multi-School Teacher कैसे काम करेंगे?</div>
            <p>
              1. अगर एक Admin के पास <strong>12th (Intermediate)</strong> और <strong>10th (Matric)</strong> के अलग-अलग School Codes हैं, तो बाईं ओर दोनों School Codes टिक करके एक ही Teacher Gmail पर दोनों के विषय एक साथ सेव करें।
            </p>
            <p>
              2. Teacher अपने उसी <strong>Gmail</strong> से <strong>Teacher Login</strong> करेंगे और ऊपर दोनों School Codes के बीच एक क्लिक में स्विच करके सभी छात्रों के अंक भर सकेंगे।
            </p>
          </div>
        </section>
      </div>
      )}
    </div>
  );
};
