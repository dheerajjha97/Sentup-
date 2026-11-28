import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  LogOut,
  ArrowLeft,
  Sparkles,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Printer,
  ClipboardCheck,
  Users,
  Trash2,
  CheckCircle2,
  Loader2,
  Plus,
  RotateCcw,
  Globe,
  UserCog,
  Mail,
  AlertCircle,
  Building2,
  Search,
  GraduationCap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AdminAccountRecord,
  AdminFeatureFlags,
  AdminFeatureOverrideRecord,
  DEFAULT_ADMIN_FEATURE_FLAGS,
  SUPER_ADMIN_EMAIL,
  SchoolFeaturePolicyRecord,
  SchoolRegistryEntry,
  User,
  deleteAdminFeatureOverride,
  deleteSchoolFeaturePolicy,
  isSuperAdminUserEmail,
  normalizePolicySchoolCode,
  saveAdminFeatureOverride,
  saveGlobalFeatureFlags,
  saveSchoolFeaturePolicy,
  signInWithGooglePopup,
  signOutFromFirebase,
  subscribeToAllAdminAccounts,
  subscribeToAllAdminFeatureOverrides,
  subscribeToAllClerkAssignmentsForSuperAdmin,
  subscribeToAllSchoolFeaturePolicies,
  subscribeToAllSchoolRegistryEntries,
  subscribeToAllTeacherAssignmentsForSuperAdmin,
  subscribeToGlobalFeatureFlags,
} from '../firebase';
import { ClerkAssignment, ExamType, TeacherAssignment } from '../types/admitCard';

interface SuperAdminPortalProps {
  firebaseUser: User | null;
  authReady: boolean;
  onExitToMainPortal: () => void;
}

interface FeatureDefinition {
  key: keyof AdminFeatureFlags;
  label: string;
  shortLabel: string;
  shortDesc: string;
  Icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}

const FEATURE_LIST: FeatureDefinition[] = [
  {
    key: 'randomMarksGenerator',
    label: 'Random Marks Generator',
    shortLabel: 'Random Marks',
    shortDesc: '1-Click Auto / Random Marks Generator inside Marks Settings',
    Icon: Sparkles,
    accentClass: 'bg-indigo-50 text-indigo-700',
  },
  {
    key: 'excelDownload',
    label: 'Excel Download (.xlsx)',
    shortLabel: 'Excel (.xlsx)',
    shortDesc: 'Sent-Up Panji, Absent, Vocational, Blind & Attendance Excel downloads',
    Icon: FileSpreadsheet,
    accentClass: 'bg-emerald-50 text-emerald-700',
  },
  {
    key: 'pdfDownload',
    label: 'PDF Reports Download',
    shortLabel: 'PDF Reports',
    shortDesc: 'All Sent-Up Panji, Absent, Vocational & Attendance PDF reports',
    Icon: FileText,
    accentClass: 'bg-slate-100 text-slate-800',
  },
  {
    key: 'completeZipDownload',
    label: '1-Click Complete ZIP Pack',
    shortLabel: '1-Click ZIP',
    shortDesc: 'Download All 12th / 10th PDFs, Excels, Letter Pad & Lifafa ZIP folder',
    Icon: FolderArchive,
    accentClass: 'bg-teal-50 text-teal-700',
  },
  {
    key: 'letterPadAndLifafa',
    label: 'Letter Pad & Lifafa Studio',
    shortLabel: 'Letter Pad & Lifafa',
    shortDesc: 'Official Letter Pad & Envelope (Lifafa) Print Studio tab',
    Icon: Printer,
    accentClass: 'bg-violet-50 text-violet-700',
  },
  {
    key: 'attendanceSheet',
    label: 'Attendance Sheet',
    shortLabel: 'Attendance Sheet',
    shortDesc: 'Exam Attendance Sheet (उपस्थिति पत्रक) print & export tab',
    Icon: ClipboardCheck,
    accentClass: 'bg-sky-50 text-sky-700',
  },
  {
    key: 'teacherClerkManagement',
    label: 'Teachers & Clerks Panel',
    shortLabel: 'Teachers & Clerks',
    shortDesc: 'Assign or remove Subject Teachers & Print Clerks access',
    Icon: Users,
    accentClass: 'bg-amber-50 text-amber-700',
  },
  {
    key: 'bulkDeleteData',
    label: 'Clear All / Bulk Delete',
    shortLabel: 'Bulk Delete',
    shortDesc: 'One-click Clear All students button in Admit Cards header',
    Icon: Trash2,
    accentClass: 'bg-rose-50 text-rose-700',
  },
];

interface AggregatedSchoolSummary {
  schoolCode: string;
  schoolName: string;
  classes: ExamType[];
  studentCount: number;
  admins: { email: string; name: string }[];
  teachers: { email: string; name: string; active: boolean }[];
  clerks: { email: string; name: string; active: boolean }[];
  policy: SchoolFeaturePolicyRecord | null;
  effectiveFlags: AdminFeatureFlags;
  disabledCount: number;
}

type SchoolFilterMode = 'ALL' | 'CUSTOM' | 'RESTRICTED';

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  firebaseUser,
  authReady,
  onExitToMainPortal,
}) => {
  const [loginBusy, setLoginBusy] = useState(false);
  const [authErr, setAuthErr] = useState('');

  // Live Firestore collections
  const [globalFlags, setGlobalFlags] = useState<AdminFeatureFlags>({
    ...DEFAULT_ADMIN_FEATURE_FLAGS,
  });
  const [globalUpdatedAt, setGlobalUpdatedAt] = useState<string | undefined>(undefined);
  const [savingGlobalKey, setSavingGlobalKey] = useState<string | null>(null);

  const [schoolPolicies, setSchoolPolicies] = useState<SchoolFeaturePolicyRecord[]>([]);
  const [schoolRegistry, setSchoolRegistry] = useState<SchoolRegistryEntry[]>([]);
  const [allTeacherAssignments, setAllTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [allClerkAssignments, setAllClerkAssignments] = useState<ClerkAssignment[]>([]);
  const [overrides, setOverrides] = useState<AdminFeatureOverrideRecord[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRecord[]>([]);

  const [statusToast, setStatusToast] = useState<string>('');
  const [panelError, setPanelError] = useState<string>('');

  // School Code workspace state
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState<SchoolFilterMode>('ALL');
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolNote, setNewSchoolNote] = useState('');
  const [busySchoolKey, setBusySchoolKey] = useState<string | null>(null);
  const [expandedStaffCodes, setExpandedStaffCodes] = useState<Record<string, boolean>>({});

  // Secondary collapsible sections
  const [showGlobalSection, setShowGlobalSection] = useState(false);
  const [showAdminOverridesSection, setShowAdminOverridesSection] = useState(false);

  // Per-Admin Gmail Override form state (optional secondary control)
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminNote, setNewAdminNote] = useState('');
  const [editingOverrideEmail, setEditingOverrideEmail] = useState<string | null>(null);
  const [busyOverrideId, setBusyOverrideId] = useState<string | null>(null);

  const isAuthorizedSuperAdmin = Boolean(
    firebaseUser && isSuperAdminUserEmail(firebaseUser.email)
  );

  useEffect(() => {
    if (!isAuthorizedSuperAdmin) return;
    setPanelError('');

    const unsubGlobal = subscribeToGlobalFeatureFlags(
      (flags, updatedAt) => {
        setGlobalFlags(flags);
        setGlobalUpdatedAt(updatedAt);
      },
      (err) => setPanelError(err)
    );

    const unsubSchoolPolicies = subscribeToAllSchoolFeaturePolicies(
      (list) => setSchoolPolicies(list),
      (err) => setPanelError(err)
    );

    const unsubRegistry = subscribeToAllSchoolRegistryEntries(
      (list) => setSchoolRegistry(list),
      (err) => setPanelError(err)
    );

    const unsubTeachers = subscribeToAllTeacherAssignmentsForSuperAdmin(
      (list) => setAllTeacherAssignments(list),
      (err) => setPanelError(err)
    );

    const unsubClerks = subscribeToAllClerkAssignmentsForSuperAdmin(
      (list) => setAllClerkAssignments(list),
      (err) => setPanelError(err)
    );

    const unsubOverrides = subscribeToAllAdminFeatureOverrides(
      (list) => setOverrides(list),
      (err) => setPanelError(err)
    );

    const unsubAccounts = subscribeToAllAdminAccounts(
      (list) => setAdminAccounts(list),
      (err) => setPanelError(err)
    );

    return () => {
      unsubGlobal();
      unsubSchoolPolicies();
      unsubRegistry();
      unsubTeachers();
      unsubClerks();
      unsubOverrides();
      unsubAccounts();
    };
  }, [isAuthorizedSuperAdmin]);

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => {
      setStatusToast((prev) => (prev === msg ? '' : prev));
    }, 3500);
  };

  // Aggregate EVERY School Code across schoolRegistry + teacherAssignments + clerkAssignments + schoolPolicies
  const aggregatedSchools: AggregatedSchoolSummary[] = useMemo(() => {
    const map = new Map<
      string,
      {
        schoolCode: string;
        schoolName: string;
        classes: Set<ExamType>;
        studentCount: number;
        adminsMap: Map<string, string>;
        teachersMap: Map<string, { name: string; active: boolean }>;
        clerksMap: Map<string, { name: string; active: boolean }>;
        policy: SchoolFeaturePolicyRecord | null;
      }
    >();

    const ensureSchool = (rawCode: string, rawName?: string) => {
      const code = normalizePolicySchoolCode(rawCode);
      if (!code) return null;
      let entry = map.get(code);
      if (!entry) {
        entry = {
          schoolCode: code,
          schoolName: (rawName || '').trim(),
          classes: new Set<ExamType>(),
          studentCount: 0,
          adminsMap: new Map<string, string>(),
          teachersMap: new Map<string, { name: string; active: boolean }>(),
          clerksMap: new Map<string, { name: string; active: boolean }>(),
          policy: null,
        };
        map.set(code, entry);
      } else if (!entry.schoolName && rawName && rawName.trim()) {
        entry.schoolName = rawName.trim();
      }
      return entry;
    };

    for (const reg of schoolRegistry) {
      const entry = ensureSchool(reg.schoolCode, reg.schoolName);
      if (!entry) continue;
      entry.studentCount += reg.studentCount || 0;
      if (reg.adminEmail) {
        entry.adminsMap.set(reg.adminEmail.toLowerCase(), reg.adminName || reg.adminEmail);
      }
      for (const cls of reg.classes || []) {
        entry.classes.add(cls);
      }
    }

    for (const t of allTeacherAssignments) {
      const entry = ensureSchool(t.schoolCode, t.schoolName);
      if (!entry) continue;
      if (t.ownerEmail) {
        const ownerEmail = t.ownerEmail.toLowerCase();
        if (!entry.adminsMap.has(ownerEmail)) {
          entry.adminsMap.set(ownerEmail, ownerEmail.split('@')[0]);
        }
      }
      if (t.teacherEmail) {
        const email = t.teacherEmail.toLowerCase();
        const prev = entry.teachersMap.get(email);
        entry.teachersMap.set(email, {
          name: t.teacherName || prev?.name || email,
          active: Boolean(t.active || prev?.active),
        });
      }
      for (const cls of t.assignedClasses || []) {
        entry.classes.add(cls);
      }
    }

    for (const c of allClerkAssignments) {
      const entry = ensureSchool(c.schoolCode, c.schoolName);
      if (!entry) continue;
      if (c.ownerEmail) {
        const ownerEmail = c.ownerEmail.toLowerCase();
        if (!entry.adminsMap.has(ownerEmail)) {
          entry.adminsMap.set(ownerEmail, ownerEmail.split('@')[0]);
        }
      }
      if (c.clerkEmail) {
        const email = c.clerkEmail.toLowerCase();
        const prev = entry.clerksMap.get(email);
        entry.clerksMap.set(email, {
          name: c.clerkName || prev?.name || email,
          active: Boolean(c.active || prev?.active),
        });
      }
      for (const cls of c.assignedClasses || []) {
        entry.classes.add(cls);
      }
    }

    for (const pol of schoolPolicies) {
      const entry = ensureSchool(pol.schoolCode, pol.schoolName);
      if (!entry) continue;
      entry.policy = pol;
      if (!entry.schoolName && pol.schoolName) {
        entry.schoolName = pol.schoolName;
      }
    }

    const list: AggregatedSchoolSummary[] = Array.from(map.values()).map((entry) => {
      const effectiveFlags: AdminFeatureFlags = entry.policy
        ? {
            randomMarksGenerator: entry.policy.randomMarksGenerator,
            excelDownload: entry.policy.excelDownload,
            pdfDownload: entry.policy.pdfDownload,
            completeZipDownload: entry.policy.completeZipDownload,
            letterPadAndLifafa: entry.policy.letterPadAndLifafa,
            attendanceSheet: entry.policy.attendanceSheet,
            teacherClerkManagement: entry.policy.teacherClerkManagement,
            bulkDeleteData: entry.policy.bulkDeleteData,
          }
        : { ...globalFlags };

      const disabledCount = FEATURE_LIST.filter((f) => !effectiveFlags[f.key]).length;

      return {
        schoolCode: entry.schoolCode,
        schoolName: entry.schoolName,
        classes: Array.from(entry.classes),
        studentCount: entry.studentCount,
        admins: Array.from(entry.adminsMap.entries()).map(([email, name]) => ({ email, name })),
        teachers: Array.from(entry.teachersMap.entries()).map(([email, info]) => ({
          email,
          name: info.name,
          active: info.active,
        })),
        clerks: Array.from(entry.clerksMap.entries()).map(([email, info]) => ({
          email,
          name: info.name,
          active: info.active,
        })),
        policy: entry.policy,
        effectiveFlags,
        disabledCount,
      };
    });

    list.sort((a, b) => {
      if (Boolean(a.policy) !== Boolean(b.policy)) return a.policy ? -1 : 1;
      return a.schoolCode.localeCompare(b.schoolCode);
    });

    return list;
  }, [schoolRegistry, allTeacherAssignments, allClerkAssignments, schoolPolicies, globalFlags]);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    return aggregatedSchools.filter((s) => {
      if (schoolFilter === 'CUSTOM' && !s.policy) return false;
      if (schoolFilter === 'RESTRICTED' && s.disabledCount === 0) return false;
      if (!q) return true;
      if (s.schoolCode.toLowerCase().includes(q)) return true;
      if (s.schoolName.toLowerCase().includes(q)) return true;
      if (s.policy?.note && s.policy.note.toLowerCase().includes(q)) return true;
      if (s.admins.some((a) => a.email.includes(q) || a.name.toLowerCase().includes(q))) return true;
      if (s.teachers.some((t) => t.email.includes(q) || t.name.toLowerCase().includes(q)))
        return true;
      if (s.clerks.some((c) => c.email.includes(q) || c.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [aggregatedSchools, schoolSearch, schoolFilter]);

  const schoolMetrics = useMemo(() => {
    const customCount = aggregatedSchools.filter((s) => Boolean(s.policy)).length;
    const restrictedCount = aggregatedSchools.filter((s) => s.disabledCount > 0).length;
    const totalTeachers = aggregatedSchools.reduce(
      (sum, s) => sum + s.teachers.filter((t) => t.active).length,
      0
    );
    const totalClerks = aggregatedSchools.reduce(
      (sum, s) => sum + s.clerks.filter((c) => c.active).length,
      0
    );
    return { customCount, restrictedCount, totalTeachers, totalClerks };
  }, [aggregatedSchools]);

  const handleGoogleSignIn = async () => {
    setAuthErr('');
    setLoginBusy(true);
    try {
      await signInWithGooglePopup();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      if (msg.includes('popup-closed-by-user')) {
        setAuthErr('Google Sign-In window band ho gaya. Dobara try karein.');
      } else {
        setAuthErr(msg);
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthErr('');
    await signOutFromFirebase();
  };

  // School-Code Policy Actions
  const handleAddSchoolPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizePolicySchoolCode(newSchoolCode);
    if (!code) {
      setPanelError('Valid School Code enter karein (jaise 51803 ya 31337).');
      return;
    }
    setPanelError('');
    setBusySchoolKey(`add_${code}`);
    try {
      const existing = aggregatedSchools.find((s) => s.schoolCode === code);
      const baseFlags: AdminFeatureFlags = existing ? existing.effectiveFlags : { ...globalFlags };
      await saveSchoolFeaturePolicy(
        code,
        baseFlags,
        newSchoolName.trim() || existing?.schoolName || '',
        newSchoolNote.trim() || existing?.policy?.note || ''
      );
      setNewSchoolCode('');
      setNewSchoolName('');
      setNewSchoolNote('');
      setSchoolSearch(code);
      showToast(`School Code ${code} ke liye feature policy ready ho gayi.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to add School Code policy.');
    } finally {
      setBusySchoolKey(null);
    }
  };

  const handleToggleSchoolFeature = async (
    school: AggregatedSchoolSummary,
    key: keyof AdminFeatureFlags
  ) => {
    const nextFlags: AdminFeatureFlags = {
      ...school.effectiveFlags,
      [key]: !school.effectiveFlags[key],
    };
    setBusySchoolKey(`${school.schoolCode}_${key}`);
    setPanelError('');
    try {
      await saveSchoolFeaturePolicy(
        school.schoolCode,
        nextFlags,
        school.schoolName,
        school.policy?.note || ''
      );
      const label = FEATURE_LIST.find((f) => f.key === key)?.shortLabel || key;
      showToast(
        `School ${school.schoolCode}: ${label} ab ${nextFlags[key] ? 'ENABLED' : 'DISABLED'} ho gaya.`
      );
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update school feature.');
    } finally {
      setBusySchoolKey(null);
    }
  };

  const handleSetAllForSchool = async (school: AggregatedSchoolSummary, enabled: boolean) => {
    const nextFlags: AdminFeatureFlags = {
      randomMarksGenerator: enabled,
      excelDownload: enabled,
      pdfDownload: enabled,
      completeZipDownload: enabled,
      letterPadAndLifafa: enabled,
      attendanceSheet: enabled,
      teacherClerkManagement: enabled,
      bulkDeleteData: enabled,
    };
    setBusySchoolKey(`${school.schoolCode}__all`);
    setPanelError('');
    try {
      await saveSchoolFeaturePolicy(
        school.schoolCode,
        nextFlags,
        school.schoolName,
        school.policy?.note || ''
      );
      showToast(
        `School ${school.schoolCode}: Sabhi features ${enabled ? 'ENABLE' : 'DISABLE'} kar diye gaye.`
      );
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update school policy.');
    } finally {
      setBusySchoolKey(null);
    }
  };

  const handleResetSchoolToGlobal = async (school: AggregatedSchoolSummary) => {
    setBusySchoolKey(`del_${school.schoolCode}`);
    setPanelError('');
    try {
      await deleteSchoolFeaturePolicy(school.schoolCode);
      showToast(`School ${school.schoolCode} ab Global Default policy follow karega.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to reset school policy.');
    } finally {
      setBusySchoolKey(null);
    }
  };

  // Global Default Actions
  const handleToggleGlobalFlag = async (key: keyof AdminFeatureFlags) => {
    const nextFlags: AdminFeatureFlags = {
      ...globalFlags,
      [key]: !globalFlags[key],
    };
    setGlobalFlags(nextFlags);
    setSavingGlobalKey(key);
    setPanelError('');
    try {
      await saveGlobalFeatureFlags(nextFlags);
      const label = FEATURE_LIST.find((f) => f.key === key)?.label || key;
      showToast(
        `Global Default: ${label} ab ${nextFlags[key] ? 'ENABLED' : 'DISABLED'} ho gaya.`
      );
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to save global flag.');
    } finally {
      setSavingGlobalKey(null);
    }
  };

  const handleSetAllGlobal = async (enabled: boolean) => {
    const nextFlags: AdminFeatureFlags = {
      randomMarksGenerator: enabled,
      excelDownload: enabled,
      pdfDownload: enabled,
      completeZipDownload: enabled,
      letterPadAndLifafa: enabled,
      attendanceSheet: enabled,
      teacherClerkManagement: enabled,
      bulkDeleteData: enabled,
    };
    setGlobalFlags(nextFlags);
    setSavingGlobalKey('__all__');
    setPanelError('');
    try {
      await saveGlobalFeatureFlags(nextFlags);
      showToast(
        enabled
          ? 'Global Default: Sabhi features ENABLE ho gaye.'
          : 'Global Default: Sabhi controllable features DISABLE ho gaye.'
      );
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update global flags.');
    } finally {
      setSavingGlobalKey(null);
    }
  };

  // Secondary Per-Admin Override Actions
  const handleCreateOrStartOverride = async (emailRaw: string, noteRaw = '') => {
    const cleanEmail = emailRaw.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setPanelError('Valid Admin Gmail address enter karein (e.g. admin@gmail.com).');
      return;
    }
    if (cleanEmail === SUPER_ADMIN_EMAIL) {
      setPanelError('Super Admin account par restriction apply nahi hoti.');
      return;
    }
    setPanelError('');
    setBusyOverrideId(cleanEmail);
    try {
      const existing = overrides.find((o) => o.adminEmail === cleanEmail);
      const baseFlags: AdminFeatureFlags = existing
        ? {
            randomMarksGenerator: existing.randomMarksGenerator,
            excelDownload: existing.excelDownload,
            pdfDownload: existing.pdfDownload,
            completeZipDownload: existing.completeZipDownload,
            letterPadAndLifafa: existing.letterPadAndLifafa,
            attendanceSheet: existing.attendanceSheet,
            teacherClerkManagement: existing.teacherClerkManagement,
            bulkDeleteData: existing.bulkDeleteData,
          }
        : { ...globalFlags };

      await saveAdminFeatureOverride(cleanEmail, baseFlags, noteRaw || existing?.note || '');
      setNewAdminEmail('');
      setNewAdminNote('');
      setEditingOverrideEmail(cleanEmail);
      showToast(`${cleanEmail} ke liye custom Gmail policy add ho gayi.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to create admin policy.');
    } finally {
      setBusyOverrideId(null);
    }
  };

  const handleToggleOverrideFlag = async (
    ov: AdminFeatureOverrideRecord,
    key: keyof AdminFeatureFlags
  ) => {
    const nextFlags: AdminFeatureFlags = {
      randomMarksGenerator: ov.randomMarksGenerator,
      excelDownload: ov.excelDownload,
      pdfDownload: ov.pdfDownload,
      completeZipDownload: ov.completeZipDownload,
      letterPadAndLifafa: ov.letterPadAndLifafa,
      attendanceSheet: ov.attendanceSheet,
      teacherClerkManagement: ov.teacherClerkManagement,
      bulkDeleteData: ov.bulkDeleteData,
      [key]: !ov[key],
    };
    setBusyOverrideId(`${ov.id}_${key}`);
    setPanelError('');
    try {
      await saveAdminFeatureOverride(ov.adminEmail, nextFlags, ov.note);
      const label = FEATURE_LIST.find((f) => f.key === key)?.shortLabel || key;
      showToast(`${ov.adminEmail}: ${label} ${nextFlags[key] ? 'ENABLED' : 'DISABLED'}.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update admin policy.');
    } finally {
      setBusyOverrideId(null);
    }
  };

  const handleRemoveOverride = async (ov: AdminFeatureOverrideRecord) => {
    setBusyOverrideId(`del_${ov.id}`);
    setPanelError('');
    try {
      await deleteAdminFeatureOverride(ov.id);
      if (editingOverrideEmail === ov.adminEmail) {
        setEditingOverrideEmail(null);
      }
      showToast(`${ov.adminEmail} ka Gmail override hata diya gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to remove override.');
    } finally {
      setBusyOverrideId(null);
    }
  };

  const otherAdminAccounts = useMemo(
    () => adminAccounts.filter((acc) => acc.email !== SUPER_ADMIN_EMAIL),
    [adminAccounts]
  );

  const overrideByEmail = useMemo(() => {
    const map = new Map<string, AdminFeatureOverrideRecord>();
    overrides.forEach((o) => map.set(o.adminEmail, o));
    return map;
  }, [overrides]);

  // 1. Auth Loading
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 text-slate-100">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          <span className="text-sm font-semibold">Loading Super Admin Portal...</span>
        </div>
      </div>
    );
  }

  // 2. Login Screen
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                Super Admin Control
              </h1>
              <p className="text-xs font-mono text-indigo-700">/supadm · School Code Feature Console</p>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs text-indigo-950 space-y-1">
            <div className="font-bold">Authorized Super Admin Only</div>
            <p className="text-indigo-800/90 leading-relaxed">
              Is panel se aap har <b>School Code</b> (aur uske Admin, Teachers &amp; Clerks) ke liye{' '}
              <b>Random Marks Generator</b>, <b>Excel Download</b>, <b>PDF Reports</b>, <b>ZIP Pack</b>,{' '}
              aur doosre features ko real-time me Enable / Disable kar sakte hain.
            </p>
          </div>

          {authErr && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{authErr}</span>
            </div>
          )}

          <button
            type="button"
            disabled={loginBusy}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
          >
            {loginBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            <span>{loginBusy ? 'Signing in...' : 'Sign in with Google (Super Admin)'}</span>
          </button>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onExitToMainPortal}
              className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-indigo-700 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Main Portal</span>
            </button>
            <span className="font-mono text-[11px] text-slate-400">BSEB Sent-Up Studio</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Access Denied Screen
  if (!isAuthorizedSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-rose-950/60 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 sm:p-8 shadow-2xl space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-extrabold text-slate-900">Access Denied</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Signed-in account{' '}
              <span className="font-mono font-bold text-slate-900">{firebaseUser.email}</span> ko{' '}
              <span className="font-mono font-semibold">/supadm</span> Super Admin panel ka access
              nahi hai.
            </p>
            <p className="text-[11px] text-rose-700 font-medium pt-1">
              Kripya authorized Super Admin Google account se login karein.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out &amp; Switch Account</span>
            </button>
            <button
              type="button"
              onClick={onExitToMainPortal}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Main Portal</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized Super Admin Dashboard
  const enabledGlobalCount = FEATURE_LIST.filter((f) => globalFlags[f.key]).length;

  return (
    <div className="min-h-screen bg-[#F4F6FB] text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-indigo-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xs shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 truncate">
                  Super Admin Control Panel
                </h1>
                <span className="hidden sm:inline rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                  /supadm
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate font-mono">{firebaseUser.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onExitToMainPortal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Main Portal</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
        {/* Live Toast & Errors */}
        {statusToast && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-950 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusToast('')}
              className="text-emerald-700 hover:underline text-[11px] font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {panelError && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{panelError}</span>
            </div>
            <button
              type="button"
              onClick={() => setPanelError('')}
              className="text-rose-700 hover:underline text-[11px] font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick Overview Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500">Registered School Codes</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">
                {aggregatedSchools.length}
              </span>
              <span className="text-[11px] font-semibold text-indigo-700">Schools</span>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500">Custom School Policies</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-violet-700">
                {schoolMetrics.customCount}
              </span>
              <span className="text-[11px] font-semibold text-rose-700">
                {schoolMetrics.restrictedCount} restricted
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500">Active Teachers</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-700">
                {schoolMetrics.totalTeachers}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">Assigned</span>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500">Active Print Clerks</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-sky-700">
                {schoolMetrics.totalClerks}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">Assigned</span>
            </div>
          </div>
        </div>

        {/* PRIMARY SECTION: School Code Feature Control */}
        <section className="rounded-3xl border border-indigo-100 bg-white p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  School Code Wise Feature Control
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Har School Code (jaise <span className="font-mono font-bold text-slate-700">51803</span>,{' '}
                  <span className="font-mono font-bold text-slate-700">31337</span>) ke liye features alag-alag
                  Enable / Disable karein. Ye settings us school ke <b>Admin</b> aur <b>Clerk</b> dono par
                  real-time apply hoti hain.
                </p>
              </div>
            </div>
          </div>

          {/* Add School Code Policy Form */}
          <form
            onSubmit={handleAddSchoolPolicy}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5"
          >
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                School Code *
              </label>
              <input
                type="text"
                required
                value={newSchoolCode}
                onChange={(e) => setNewSchoolCode(e.target.value)}
                placeholder="e.g. 51803 or 31337"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                School Name (Optional)
              </label>
              <input
                type="text"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder="e.g. High Secondary School Berua"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Remark / Plan Note (Optional)
              </label>
              <input
                type="text"
                value={newSchoolNote}
                onChange={(e) => setNewSchoolNote(e.target.value)}
                placeholder="e.g. Trial / Paid / Locked"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={busySchoolKey !== null}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add School</span>
              </button>
            </div>
          </form>

          {/* Search + Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                placeholder="Search by School Code, School Name, Admin Gmail, Teacher or Clerk Gmail..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {(
                [
                  { id: 'ALL', label: `All (${aggregatedSchools.length})` },
                  { id: 'CUSTOM', label: `Custom (${schoolMetrics.customCount})` },
                  { id: 'RESTRICTED', label: `Restricted (${schoolMetrics.restrictedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSchoolFilter(tab.id)}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                    schoolFilter === tab.id
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Schools List */}
          {filteredSchools.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-2">
              <Building2 className="mx-auto h-7 w-7 text-slate-400" />
              <div className="text-sm font-bold text-slate-700">
                {aggregatedSchools.length === 0
                  ? 'Abhi koi School Code registered nahi mila'
                  : 'Is search/filter me koi School Code match nahi hua'}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Jaise hi koi Admin login karke student data upload karega ya Teacher/Clerk assign karega,
                uska School Code yahan automatically aa jayega. Aap upar se manually bhi koi School Code
                add karke pehle se control set kar sakte hain.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredSchools.map((school) => {
                const isCustom = Boolean(school.policy);
                const activeTeachers = school.teachers.filter((t) => t.active);
                const activeClerks = school.clerks.filter((c) => c.active);
                const staffExpanded = Boolean(expandedStaffCodes[school.schoolCode]);
                const totalStaff = school.admins.length + school.teachers.length + school.clerks.length;

                return (
                  <div
                    key={school.schoolCode}
                    className={`rounded-2xl border overflow-hidden transition-colors ${
                      school.disabledCount > 0
                        ? 'border-rose-200 bg-white'
                        : isCustom
                        ? 'border-indigo-200 bg-white'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* School Header */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/90 px-4 py-3 border-b border-slate-100">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 font-mono text-xs font-extrabold text-white shadow-2xs">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>{school.schoolCode}</span>
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate max-w-[340px]">
                            {school.schoolName || 'School Name Not Set'}
                          </span>
                          {school.classes.map((cls) => (
                            <span
                              key={cls}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700"
                            >
                              {cls === 'MATRIC (10th)' ? '10th' : '12th'}
                            </span>
                          ))}
                          {school.studentCount > 0 && (
                            <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {school.studentCount} Students
                            </span>
                          )}
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                              school.disabledCount > 0
                                ? 'bg-rose-100 text-rose-800'
                                : isCustom
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {school.disabledCount > 0
                              ? `${school.disabledCount} Disabled`
                              : isCustom
                              ? 'Custom Policy · All ON'
                              : 'Global Default'}
                          </span>
                          {school.policy?.note && (
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              {school.policy.note}
                            </span>
                          )}
                        </div>

                        {/* Admin / Teacher / Clerk Summary Strip */}
                        <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <UserCog className="h-3.5 w-3.5 text-indigo-600" />
                            <b>Admin:</b>{' '}
                            {school.admins.length > 0
                              ? school.admins.map((a) => a.email).join(', ')
                              : 'Not synced yet'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GraduationCap className="h-3.5 w-3.5 text-emerald-600" />
                            <b>Teachers:</b> {activeTeachers.length}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Printer className="h-3.5 w-3.5 text-sky-600" />
                            <b>Clerks:</b> {activeClerks.length}
                          </span>
                          {totalStaff > 0 && (school.teachers.length > 0 || school.clerks.length > 0) && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStaffCodes((prev) => ({
                                  ...prev,
                                  [school.schoolCode]: !prev[school.schoolCode],
                                }))
                              }
                              className="inline-flex items-center gap-0.5 font-bold text-indigo-700 hover:underline cursor-pointer"
                            >
                              <span>{staffExpanded ? 'Hide Staff' : 'View Teachers & Clerks'}</span>
                              {staffExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick School Actions */}
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <button
                          type="button"
                          disabled={busySchoolKey !== null}
                          onClick={() => handleSetAllForSchool(school, true)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                        >
                          All ON
                        </button>
                        <button
                          type="button"
                          disabled={busySchoolKey !== null}
                          onClick={() => handleSetAllForSchool(school, false)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                        >
                          All OFF
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            disabled={busySchoolKey !== null}
                            onClick={() => handleResetSchoolToGlobal(school)}
                            title="Remove custom school policy and follow Global Default"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Teachers & Clerks Directory for this School Code */}
                    {staffExpanded && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-indigo-50/30 px-4 py-3 border-b border-slate-100 text-[11px]">
                        <div>
                          <div className="font-bold text-slate-700 mb-1.5">
                            Assigned Teachers ({school.teachers.length})
                          </div>
                          {school.teachers.length === 0 ? (
                            <div className="text-slate-400">Koi teacher assign nahi hai.</div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {school.teachers.map((t) => (
                                <span
                                  key={t.email}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] ${
                                    t.active
                                      ? 'border-emerald-200 bg-white text-slate-800'
                                      : 'border-slate-200 bg-slate-100 text-slate-400 line-through'
                                  }`}
                                >
                                  <span className="font-sans font-bold">{t.name}</span>
                                  <span className="text-slate-500">({t.email})</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-700 mb-1.5">
                            Assigned Print Clerks ({school.clerks.length})
                          </div>
                          {school.clerks.length === 0 ? (
                            <div className="text-slate-400">Koi clerk assign nahi hai.</div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {school.clerks.map((c) => (
                                <span
                                  key={c.email}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] ${
                                    c.active
                                      ? 'border-sky-200 bg-white text-slate-800'
                                      : 'border-slate-200 bg-slate-100 text-slate-400 line-through'
                                  }`}
                                >
                                  <span className="font-sans font-bold">{c.name}</span>
                                  <span className="text-slate-500">({c.email})</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 8 Instant Feature Toggles for this School Code */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-3.5">
                      {FEATURE_LIST.map(({ key, shortLabel, Icon }) => {
                        const isOn = school.effectiveFlags[key];
                        const isBusy =
                          busySchoolKey === `${school.schoolCode}_${key}` ||
                          busySchoolKey === `${school.schoolCode}__all`;
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleSchoolFeature(school, key)}
                            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer disabled:opacity-50 ${
                              isOn
                                ? 'border-emerald-200 bg-emerald-50/45 text-slate-900 hover:bg-emerald-50'
                                : 'border-rose-200 bg-rose-50/75 text-rose-950 hover:bg-rose-100/70'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                              <span className="text-[11px] font-bold truncate">{shortLabel}</span>
                            </div>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                                isOn ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                              }`}
                            >
                              {isOn ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SECONDARY SECTION 1: Global Default Controls (Collapsible) */}
        <section className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowGlobalSection((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 shrink-0">
                <Globe className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">
                  Global Default Policy (All Other Schools Without Custom Policy)
                </div>
                <div className="text-[11px] text-slate-500">
                  {enabledGlobalCount}/{FEATURE_LIST.length} Enabled by default
                  {globalUpdatedAt ? ` · Updated ${globalUpdatedAt}` : ''}
                </div>
              </div>
            </div>
            {showGlobalSection ? (
              <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
            )}
          </button>

          {showGlobalSection && (
            <div className="border-t border-slate-100 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-slate-500">
                  Jin School Codes par koi custom policy set nahi hai, un par ye Global Default flags
                  apply honge.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingGlobalKey !== null}
                    onClick={() => handleSetAllGlobal(true)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                  >
                    Enable All
                  </button>
                  <button
                    type="button"
                    disabled={savingGlobalKey !== null}
                    onClick={() => handleSetAllGlobal(false)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                  >
                    Disable All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FEATURE_LIST.map(({ key, label, shortDesc, Icon, accentClass }) => {
                  const isOn = globalFlags[key];
                  const isBusy = savingGlobalKey === key || savingGlobalKey === '__all__';
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors ${
                        isOn ? 'border-slate-200 bg-white' : 'border-rose-200 bg-rose-50/40'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accentClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900">{label}</span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                isOn
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isOn ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {shortDesc}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={isOn}
                        aria-label={`Toggle Global ${label}`}
                        disabled={isBusy}
                        onClick={() => handleToggleGlobalFlag(key)}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                          isOn ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                            isOn ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* SECONDARY SECTION 2: Optional Per-Admin Gmail Override (Collapsible) */}
        <section className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdminOverridesSection((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700 shrink-0">
                <UserCog className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">
                  Admin Gmail Override (Optional Fallback)
                </div>
                <div className="text-[11px] text-slate-500">
                  {overrides.length} active Gmail overrides · {otherAdminAccounts.length} logged-in
                  Admin accounts
                </div>
              </div>
            </div>
            {showAdminOverridesSection ? (
              <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
            )}
          </button>

          {showAdminOverridesSection && (
            <div className="border-t border-slate-100 p-5 sm:p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Priority order: <b>1) School Code Policy</b> → <b>2) Admin Gmail Override</b> →{' '}
                <b>3) Global Default</b>. Agar kisi specific Admin Gmail par (bina school code ke)
                rule lagana ho toh yahan se set karein.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateOrStartOverride(newAdminEmail, newAdminNote);
                }}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5"
              >
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Admin Gmail Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="schooladmin@gmail.com"
                      className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Label (Optional)
                  </label>
                  <input
                    type="text"
                    value={newAdminNote}
                    onChange={(e) => setNewAdminNote(e.target.value)}
                    placeholder="e.g. Operator Gmail"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-3 flex items-end">
                  <button
                    type="submit"
                    disabled={busyOverrideId !== null}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Gmail Rule</span>
                  </button>
                </div>
              </form>

              {otherAdminAccounts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {otherAdminAccounts.map((acc) => {
                    const hasCustom = overrideByEmail.has(acc.email);
                    return (
                      <div
                        key={acc.uid}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate max-w-[180px]">
                            {acc.displayName || acc.email}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500 truncate max-w-[200px]">
                            {acc.email}
                          </div>
                        </div>
                        {hasCustom ? (
                          <button
                            type="button"
                            onClick={() => setEditingOverrideEmail(acc.email)}
                            className="rounded-lg bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-800 cursor-pointer"
                          >
                            Active
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateOrStartOverride(acc.email, acc.displayName || '')
                            }
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                          >
                            Customize
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {overrides.length > 0 && (
                <div className="space-y-2.5">
                  {overrides.map((ov) => {
                    const isExpanded =
                      editingOverrideEmail === ov.adminEmail || overrides.length <= 3;
                    return (
                      <div
                        key={ov.id}
                        className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {ov.adminEmail}
                            </span>
                            {ov.note && (
                              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600">
                                {ov.note}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {overrides.length > 3 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingOverrideEmail(isExpanded ? null : ov.adminEmail)
                                }
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 cursor-pointer"
                              >
                                {isExpanded ? 'Hide' : 'Edit'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyOverrideId === `del_${ov.id}`}
                              onClick={() => handleRemoveOverride(ov)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-3">
                            {FEATURE_LIST.map(({ key, shortLabel, Icon }) => {
                              const isOn = ov[key];
                              const isBusy = busyOverrideId === `${ov.id}_${key}`;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleToggleOverrideFlag(ov, key)}
                                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer disabled:opacity-50 ${
                                    isOn
                                      ? 'border-emerald-200 bg-emerald-50/45 text-slate-900'
                                      : 'border-rose-200 bg-rose-50/75 text-rose-950'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                    <span className="text-[11px] font-bold truncate">
                                      {shortLabel}
                                    </span>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                                      isOn ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                    }`}
                                  >
                                    {isOn ? 'ON' : 'OFF'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
