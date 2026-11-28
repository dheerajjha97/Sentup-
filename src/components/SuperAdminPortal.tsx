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
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Check,
  SlidersHorizontal,
  Edit3,
  X,
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
  deleteAdminAccountRecord,
  deleteAdminFeatureOverride,
  deleteSchoolFeaturePolicy,
  isSuperAdminUserEmail,
  normalizePolicySchoolCode,
  saveAdminFeatureOverride,
  saveGlobalFeatureFlags,
  saveSchoolFeaturePolicy,
  setStaffAssignmentActiveAsSuperAdmin,
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
}

const FEATURE_LIST: FeatureDefinition[] = [
  {
    key: 'randomMarksGenerator',
    label: 'Random Marks Generator',
    shortLabel: 'Random Marks',
    shortDesc: '1-Click Auto / Random Marks Generator inside Marks Settings',
    Icon: Sparkles,
  },
  {
    key: 'excelDownload',
    label: 'Excel Download (.xlsx)',
    shortLabel: 'Excel (.xlsx)',
    shortDesc: 'Sent-Up Panji, Absent, Vocational, Blind & Attendance Excel downloads',
    Icon: FileSpreadsheet,
  },
  {
    key: 'pdfDownload',
    label: 'PDF Reports Download',
    shortLabel: 'PDF Reports',
    shortDesc: 'All Sent-Up Panji, Absent, Vocational & Attendance PDF reports',
    Icon: FileText,
  },
  {
    key: 'completeZipDownload',
    label: '1-Click Complete ZIP Pack',
    shortLabel: '1-Click ZIP',
    shortDesc: 'Download All 12th / 10th PDFs, Excels, Letter Pad & Lifafa ZIP folder',
    Icon: FolderArchive,
  },
  {
    key: 'letterPadAndLifafa',
    label: 'Letter Pad & Lifafa Studio',
    shortLabel: 'Letter Pad & Lifafa',
    shortDesc: 'Official Letter Pad & Envelope (Lifafa) Print Studio tab',
    Icon: Printer,
  },
  {
    key: 'attendanceSheet',
    label: 'Attendance Sheet',
    shortLabel: 'Attendance Sheet',
    shortDesc: 'Exam Attendance Sheet (उपस्थिति पत्रक) print & export tab',
    Icon: ClipboardCheck,
  },
  {
    key: 'teacherClerkManagement',
    label: 'Teachers & Clerks Panel',
    shortLabel: 'Teachers & Clerks',
    shortDesc: 'Assign or remove Subject Teachers & Print Clerks access',
    Icon: Users,
  },
  {
    key: 'bulkDeleteData',
    label: 'Clear All / Bulk Delete',
    shortLabel: 'Bulk Delete',
    shortDesc: 'One-click Clear All students button in Admit Cards header',
    Icon: Trash2,
  },
];

const TRIAL_LOCKED_FLAGS: AdminFeatureFlags = {
  randomMarksGenerator: false,
  excelDownload: false,
  pdfDownload: true,
  completeZipDownload: false,
  letterPadAndLifafa: true,
  attendanceSheet: true,
  teacherClerkManagement: true,
  bulkDeleteData: false,
};

interface AggregatedSchoolSummary {
  schoolCode: string;
  schoolName: string;
  classes: ExamType[];
  studentCount: number;
  admins: { email: string; name: string }[];
  teachers: {
    id: string;
    email: string;
    name: string;
    active: boolean;
    classes: ExamType[];
    subjects: string[];
  }[];
  clerks: {
    id: string;
    email: string;
    name: string;
    active: boolean;
    classes: ExamType[];
  }[];
  policy: SchoolFeaturePolicyRecord | null;
  effectiveFlags: AdminFeatureFlags;
  disabledCount: number;
}

interface EnrichedAdminSummary {
  uid: string;
  email: string;
  displayName: string;
  createdAt?: string;
  lastLoginAt?: string;
  lastLoginMs: number;
  isSuperAdmin: boolean;
  schoolCodes: { schoolCode: string; schoolName: string; studentCount: number }[];
  totalStudents: number;
  teacherCount: number;
  clerkCount: number;
  override: AdminFeatureOverrideRecord | null;
}

type SuperAdminTab = 'SCHOOLS' | 'ADMINS' | 'STAFF' | 'DEFAULTS';
type SchoolFilterMode = 'ALL' | 'CUSTOM' | 'RESTRICTED';
type AdminFilterMode = 'ALL' | 'WITH_SCHOOLS' | 'NO_SCHOOLS' | 'OVERRIDES';
type StaffRoleFilter = 'ALL' | 'TEACHER' | 'CLERK';

function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  firebaseUser,
  authReady,
  onExitToMainPortal,
}) => {
  const [loginBusy, setLoginBusy] = useState(false);
  const [authErr, setAuthErr] = useState('');

  // Primary navigation tab
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('SCHOOLS');

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
  const [copiedKey, setCopiedKey] = useState<string>('');

  // Tab 1: Schools workspace state
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState<SchoolFilterMode>('ALL');
  const [showAddSchoolForm, setShowAddSchoolForm] = useState(false);
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolNote, setNewSchoolNote] = useState('');
  const [busySchoolKey, setBusySchoolKey] = useState<string | null>(null);
  const [expandedStaffCodes, setExpandedStaffCodes] = useState<Record<string, boolean>>({});
  const [editingNoteCode, setEditingNoteCode] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Tab 2: Logged-in Admins workspace state
  const [adminSearch, setAdminSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState<AdminFilterMode>('ALL');
  const [showAddAdminRuleForm, setShowAddAdminRuleForm] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminNote, setNewAdminNote] = useState('');
  const [expandedAdminEmail, setExpandedAdminEmail] = useState<string | null>(null);
  const [busyOverrideId, setBusyOverrideId] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  // Tab 3: Staff Directory workspace state
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<StaffRoleFilter>('ALL');
  const [busyStaffId, setBusyStaffId] = useState<string | null>(null);

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

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? '' : prev));
      }, 1500);
    } catch {
      // Clipboard blocked in iframe fallback
    }
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
        teachers: AggregatedSchoolSummary['teachers'];
        clerks: AggregatedSchoolSummary['clerks'];
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
          teachers: [],
          clerks: [],
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
      entry.teachers.push({
        id: t.id,
        email: (t.teacherEmail || '').toLowerCase(),
        name: t.teacherName || t.teacherEmail,
        active: Boolean(t.active),
        classes: t.assignedClasses || [],
        subjects: t.assignedSubjects || [],
      });
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
      entry.clerks.push({
        id: c.id,
        email: (c.clerkEmail || '').toLowerCase(),
        name: c.clerkName || c.clerkEmail,
        active: Boolean(c.active),
        classes: c.assignedClasses || [],
      });
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
        teachers: entry.teachers,
        clerks: entry.clerks,
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

  const overrideByEmail = useMemo(() => {
    const map = new Map<string, AdminFeatureOverrideRecord>();
    overrides.forEach((o) => map.set(o.adminEmail.toLowerCase(), o));
    return map;
  }, [overrides]);

  // Aggregate EVERY Logged-in Admin (from adminAccounts + any email present in schoolRegistry / assignments / overrides)
  const enrichedAdmins: EnrichedAdminSummary[] = useMemo(() => {
    const byEmail = new Map<string, EnrichedAdminSummary>();

    const ensureAdmin = (
      rawEmail: string,
      opts?: {
        uid?: string;
        displayName?: string;
        createdAt?: string;
        lastLoginAt?: string;
        lastLoginMs?: number;
      }
    ) => {
      const email = rawEmail.trim().toLowerCase();
      if (!email) return null;
      let item = byEmail.get(email);
      if (!item) {
        item = {
          uid: opts?.uid || '',
          email,
          displayName: opts?.displayName || email.split('@')[0],
          createdAt: opts?.createdAt,
          lastLoginAt: opts?.lastLoginAt,
          lastLoginMs: opts?.lastLoginMs || 0,
          isSuperAdmin: email === SUPER_ADMIN_EMAIL,
          schoolCodes: [],
          totalStudents: 0,
          teacherCount: 0,
          clerkCount: 0,
          override: overrideByEmail.get(email) || null,
        };
        byEmail.set(email, item);
      } else {
        if (opts?.uid && !item.uid) item.uid = opts.uid;
        if (opts?.displayName && item.displayName === email.split('@')[0]) {
          item.displayName = opts.displayName;
        }
        if (opts?.createdAt && !item.createdAt) item.createdAt = opts.createdAt;
        if ((opts?.lastLoginMs || 0) > item.lastLoginMs) {
          item.lastLoginMs = opts?.lastLoginMs || 0;
          item.lastLoginAt = opts?.lastLoginAt;
        }
      }
      return item;
    };

    for (const acc of adminAccounts) {
      ensureAdmin(acc.email, {
        uid: acc.uid,
        displayName: acc.displayName,
        createdAt: acc.createdAt,
        lastLoginAt: acc.lastLoginAt,
        lastLoginMs: acc.lastLoginMs,
      });
    }

    for (const reg of schoolRegistry) {
      const admin = ensureAdmin(reg.adminEmail, {
        uid: reg.adminUid,
        displayName: reg.adminName,
      });
      if (!admin) continue;
      if (!admin.schoolCodes.some((s) => s.schoolCode === reg.schoolCode)) {
        admin.schoolCodes.push({
          schoolCode: reg.schoolCode,
          schoolName: reg.schoolName,
          studentCount: reg.studentCount || 0,
        });
      }
      admin.totalStudents += reg.studentCount || 0;
    }

    for (const t of allTeacherAssignments) {
      if (!t.ownerEmail) continue;
      const admin = ensureAdmin(t.ownerEmail, { uid: t.ownerId });
      if (!admin) continue;
      if (t.active) admin.teacherCount += 1;
      const code = normalizePolicySchoolCode(t.schoolCode);
      if (code && !admin.schoolCodes.some((s) => s.schoolCode === code)) {
        admin.schoolCodes.push({
          schoolCode: code,
          schoolName: t.schoolName || '',
          studentCount: 0,
        });
      }
    }

    for (const c of allClerkAssignments) {
      if (!c.ownerEmail) continue;
      const admin = ensureAdmin(c.ownerEmail, { uid: c.ownerId });
      if (!admin) continue;
      if (c.active) admin.clerkCount += 1;
      const code = normalizePolicySchoolCode(c.schoolCode);
      if (code && !admin.schoolCodes.some((s) => s.schoolCode === code)) {
        admin.schoolCodes.push({
          schoolCode: code,
          schoolName: c.schoolName || '',
          studentCount: 0,
        });
      }
    }

    for (const ov of overrides) {
      const admin = ensureAdmin(ov.adminEmail, {
        displayName: ov.note || ov.adminEmail.split('@')[0],
      });
      if (admin) {
        admin.override = ov;
      }
    }

    const list = Array.from(byEmail.values()).filter((a) => !a.isSuperAdmin);
    list.sort((a, b) => (b.lastLoginMs || 0) - (a.lastLoginMs || 0) || a.email.localeCompare(b.email));
    return list;
  }, [adminAccounts, schoolRegistry, allTeacherAssignments, allClerkAssignments, overrides, overrideByEmail]);

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
      if (s.teachers.some((t) => t.email.includes(q) || t.name.toLowerCase().includes(q))) return true;
      if (s.clerks.some((c) => c.email.includes(q) || c.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [aggregatedSchools, schoolSearch, schoolFilter]);

  const filteredAdmins = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    return enrichedAdmins.filter((a) => {
      if (adminFilter === 'WITH_SCHOOLS' && a.schoolCodes.length === 0) return false;
      if (adminFilter === 'NO_SCHOOLS' && a.schoolCodes.length > 0) return false;
      if (adminFilter === 'OVERRIDES' && !a.override) return false;
      if (!q) return true;
      if (a.email.includes(q)) return true;
      if (a.displayName.toLowerCase().includes(q)) return true;
      if (a.schoolCodes.some((s) => s.schoolCode.toLowerCase().includes(q) || s.schoolName.toLowerCase().includes(q))) {
        return true;
      }
      return false;
    });
  }, [enrichedAdmins, adminSearch, adminFilter]);

  const combinedStaff = useMemo(() => {
    const teacherRows = allTeacherAssignments.map((t) => ({
      id: t.id,
      role: 'TEACHER' as const,
      name: t.teacherName || 'Subject Teacher',
      email: (t.teacherEmail || '').toLowerCase(),
      schoolCode: normalizePolicySchoolCode(t.schoolCode),
      schoolName: t.schoolName || '',
      classes: t.assignedClasses || [],
      subjects: t.assignedSubjects || [],
      ownerEmail: (t.ownerEmail || '').toLowerCase(),
      active: Boolean(t.active),
    }));
    const clerkRows = allClerkAssignments.map((c) => ({
      id: c.id,
      role: 'CLERK' as const,
      name: c.clerkName || 'Office Clerk',
      email: (c.clerkEmail || '').toLowerCase(),
      schoolCode: normalizePolicySchoolCode(c.schoolCode),
      schoolName: c.schoolName || '',
      classes: c.assignedClasses || [],
      subjects: [] as string[],
      ownerEmail: (c.ownerEmail || '').toLowerCase(),
      active: Boolean(c.active),
    }));
    const all = [...teacherRows, ...clerkRows];
    all.sort((a, b) => a.schoolCode.localeCompare(b.schoolCode) || a.name.localeCompare(b.name));
    return all;
  }, [allTeacherAssignments, allClerkAssignments]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return combinedStaff.filter((s) => {
      if (staffRoleFilter !== 'ALL' && s.role !== staffRoleFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.email.includes(q) ||
        s.schoolCode.toLowerCase().includes(q) ||
        s.schoolName.toLowerCase().includes(q) ||
        s.ownerEmail.includes(q) ||
        s.subjects.some((sub) => sub.toLowerCase().includes(q))
      );
    });
  }, [combinedStaff, staffSearch, staffRoleFilter]);

  const dashboardMetrics = useMemo(() => {
    const customCount = aggregatedSchools.filter((s) => Boolean(s.policy)).length;
    const restrictedCount = aggregatedSchools.filter((s) => s.disabledCount > 0).length;
    const totalStudents = aggregatedSchools.reduce((sum, s) => sum + s.studentCount, 0);
    const activeTeachers = allTeacherAssignments.filter((t) => t.active).length;
    const activeClerks = allClerkAssignments.filter((c) => c.active).length;
    const adminsWithSchools = enrichedAdmins.filter((a) => a.schoolCodes.length > 0).length;
    return {
      customCount,
      restrictedCount,
      totalStudents,
      activeTeachers,
      activeClerks,
      adminsWithSchools,
    };
  }, [aggregatedSchools, allTeacherAssignments, allClerkAssignments, enrichedAdmins]);

  // Auth Actions
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

  // Export CSV Summary (Schools + Logged-in Admins)
  const handleExportSummaryCsv = () => {
    const header = [
      'School Code',
      'School Name',
      'Classes',
      'Students',
      'Admin Gmail(s)',
      'Active Teachers',
      'Active Clerks',
      'Policy Type',
      'Disabled Features',
      'Note',
    ];
    const rows = aggregatedSchools.map((s) => {
      const disabledNames = FEATURE_LIST.filter((f) => !s.effectiveFlags[f.key]).map((f) => f.shortLabel);
      return [
        s.schoolCode,
        s.schoolName || '-',
        s.classes.join(' / ') || '-',
        s.studentCount,
        s.admins.map((a) => a.email).join('; ') || '-',
        s.teachers.filter((t) => t.active).length,
        s.clerks.filter((c) => c.active).length,
        s.policy ? 'Custom Policy' : 'Global Default',
        disabledNames.join(', ') || 'None (All ON)',
        s.policy?.note || '',
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SuperAdmin_Schools_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Schools summary CSV download ho gaya.');
  };

  const handleExportAdminsCsv = () => {
    const header = [
      'Admin Name',
      'Admin Gmail',
      'Linked School Codes',
      'Total Students',
      'Active Teachers',
      'Active Clerks',
      'Joined At',
      'Last Login At',
      'Gmail Override',
    ];
    const rows = enrichedAdmins.map((a) => [
      a.displayName,
      a.email,
      a.schoolCodes.map((s) => s.schoolCode).join('; ') || 'None yet',
      a.totalStudents,
      a.teacherCount,
      a.clerkCount,
      a.createdAt || '-',
      a.lastLoginAt || '-',
      a.override ? 'Custom Rule Active' : 'Default',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SuperAdmin_LoggedIn_Admins_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Logged-in Admins list CSV download ho gaya.');
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
      setShowAddSchoolForm(false);
      setSchoolSearch(code);
      showToast(`School Code ${code} add ho gaya.`);
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
        `School ${school.schoolCode}: ${label} ab ${nextFlags[key] ? 'ON' : 'OFF'} ho gaya.`
      );
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update school feature.');
    } finally {
      setBusySchoolKey(null);
    }
  };

  const handleApplySchoolPreset = async (
    school: AggregatedSchoolSummary,
    nextFlags: AdminFeatureFlags,
    label: string
  ) => {
    setBusySchoolKey(`${school.schoolCode}__all`);
    setPanelError('');
    try {
      await saveSchoolFeaturePolicy(
        school.schoolCode,
        nextFlags,
        school.schoolName,
        school.policy?.note || ''
      );
      showToast(`School ${school.schoolCode}: ${label} apply ho gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update school policy.');
    } finally {
      setBusySchoolKey(null);
    }
  };

  const handleSaveSchoolNote = async (school: AggregatedSchoolSummary) => {
    setBusySchoolKey(`note_${school.schoolCode}`);
    setPanelError('');
    try {
      await saveSchoolFeaturePolicy(
        school.schoolCode,
        school.effectiveFlags,
        school.schoolName,
        editingNoteText.trim()
      );
      setEditingNoteCode(null);
      setEditingNoteText('');
      showToast(`School ${school.schoolCode} ka note save ho gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to save school note.');
    } finally {
      setBusySchoolKey(null);
    }
  };

  const handleResetSchoolToGlobal = async (school: AggregatedSchoolSummary) => {
    setBusySchoolKey(`del_${school.schoolCode}`);
    setPanelError('');
    try {
      await deleteSchoolFeaturePolicy(school.schoolCode);
      showToast(`School ${school.schoolCode} ab Global Default follow karega.`);
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
      showToast(`Global Default: ${label} ab ${nextFlags[key] ? 'ON' : 'OFF'} ho gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to save global flag.');
    } finally {
      setSavingGlobalKey(null);
    }
  };

  const handleApplyGlobalPreset = async (nextFlags: AdminFeatureFlags, label: string) => {
    setGlobalFlags(nextFlags);
    setSavingGlobalKey('__all__');
    setPanelError('');
    try {
      await saveGlobalFeatureFlags(nextFlags);
      showToast(`Global Default: ${label} apply ho gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update global flags.');
    } finally {
      setSavingGlobalKey(null);
    }
  };

  // Per-Admin Gmail Override Actions
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
      setShowAddAdminRuleForm(false);
      setExpandedAdminEmail(cleanEmail);
      showToast(`${cleanEmail} ke liye custom Gmail rule active ho gaya.`);
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
      showToast(`${ov.adminEmail}: ${label} ab ${nextFlags[key] ? 'ON' : 'OFF'} ho gaya.`);
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
      if (expandedAdminEmail === ov.adminEmail) {
        setExpandedAdminEmail(null);
      }
      showToast(`${ov.adminEmail} ka custom Gmail rule hata diya gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to remove override.');
    } finally {
      setBusyOverrideId(null);
    }
  };

  const handleDeleteAdminLoginRecord = async (uid: string, email: string) => {
    setBusyOverrideId(`del_acc_${uid}`);
    setPanelError('');
    try {
      await deleteAdminAccountRecord(uid);
      setConfirmDeleteUid(null);
      showToast(`${email} ka login record directory se hata diya gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to remove login record.');
    } finally {
      setBusyOverrideId(null);
    }
  };

  // Staff Pause / Resume Action
  const handleToggleStaffActive = async (
    role: 'TEACHER' | 'CLERK',
    id: string,
    currentActive: boolean,
    name: string
  ) => {
    setBusyStaffId(`${role}_${id}`);
    setPanelError('');
    try {
      await setStaffAssignmentActiveAsSuperAdmin(role, id, !currentActive);
      showToast(`${name} (${role === 'TEACHER' ? 'Teacher' : 'Clerk'}) ab ${!currentActive ? 'ACTIVE' : 'PAUSED'} ho gaya.`);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update staff status.');
    } finally {
      setBusyStaffId(null);
    }
  };

  // Jump from Admin row directly to that School Code in Tab 1
  const jumpToSchoolCode = (code: string) => {
    setSchoolFilter('ALL');
    setSchoolSearch(code);
    setActiveTab('SCHOOLS');
  };

  // 1. Auth Loading
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-6 py-4 text-slate-100">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          <span className="text-sm font-semibold">Loading Super Admin Console...</span>
        </div>
      </div>
    );
  }

  // 2. Login Screen
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Super Admin Console
              </h1>
              <p className="text-xs text-slate-500">School Code &amp; Admin Feature Control</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
            Is console se aap sabhi login karne wale <b>Admins</b>, unke <b>School Codes</b>,
            assigned <b>Teachers &amp; Clerks</b> ko dekh sakte hain aur <b>Random Marks</b>,{' '}
            <b>Excel Download</b>, <b>PDF</b>, <b>ZIP Pack</b> jaise features ko real-time me ON /
            OFF kar sakte hain.
          </p>

          {authErr && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{authErr}</span>
            </div>
          )}

          <button
            type="button"
            disabled={loginBusy}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loginBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            <span>{loginBusy ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onExitToMainPortal}
              className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Main Portal</span>
            </button>
            <span className="text-[11px] text-slate-400">Authorized access only</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Access Denied Screen
  if (!isAuthorizedSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 sm:p-8 shadow-xl space-y-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-slate-900">Access Denied</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Signed-in account{' '}
              <span className="font-mono font-semibold text-slate-900">{firebaseUser.email}</span> ko
              Super Admin panel ka access nahi hai.
            </p>
            <p className="text-xs text-rose-700 font-medium">
              Kripya authorized Super Admin Google account se sign in karein.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out &amp; Switch Account</span>
            </button>
            <button
              type="button"
              onClick={onExitToMainPortal}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
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

  const navItems: {
    id: SuperAdminTab;
    label: string;
    count: number;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'SCHOOLS', label: 'Schools & Features', count: aggregatedSchools.length, Icon: Building2 },
    { id: 'ADMINS', label: 'Logged-in Admins', count: enrichedAdmins.length, Icon: UserCog },
    { id: 'STAFF', label: 'Teachers & Clerks', count: combinedStaff.length, Icon: Users },
    { id: 'DEFAULTS', label: 'Global Defaults', count: enabledGlobalCount, Icon: Globe },
  ];

  const activeNavTitle =
    activeTab === 'SCHOOLS'
      ? 'Schools & Feature Controls'
      : activeTab === 'ADMINS'
      ? 'Logged-in Admins Directory'
      : activeTab === 'STAFF'
      ? 'Teachers & Print Clerks'
      : 'Global Default Policy';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2.5 px-5 border-b border-slate-200">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Super Admin
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ id, label, count, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  {id === 'DEFAULTS' ? `${count}/${FEATURE_LIST.length}` : count}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 truncate">
              {firebaseUser.displayName || 'Super Admin'}
            </div>
            <div className="font-mono text-[11px] text-slate-500 truncate">{firebaseUser.email}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExitToMainPortal}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Portal</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Clean Top Header Bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="font-semibold text-slate-400 hidden sm:inline">Super Admin</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-bold text-slate-900 truncate">{activeNavTitle}</h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeTab === 'SCHOOLS' && (
                <button
                  type="button"
                  onClick={handleExportSummaryCsv}
                  disabled={aggregatedSchools.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              )}
              {activeTab === 'ADMINS' && (
                <button
                  type="button"
                  onClick={handleExportAdminsCsv}
                  disabled={enrichedAdmins.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export Admins</span>
                </button>
              )}
              <button
                type="button"
                onClick={onExitToMainPortal}
                className="lg:hidden inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Portal</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="lg:hidden inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-2 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile Horizontal Tab Bar */}
          <div className="lg:hidden border-t border-slate-100 px-3 py-2 flex items-center gap-1 overflow-x-auto">
            {navItems.map(({ id, label, count, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                  <span className={`font-mono tabular-nums text-[11px] ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6">
          {/* Status Toast & Error Banner */}
          {statusToast && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{statusToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusToast('')}
                className="text-emerald-700 hover:underline text-xs font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {panelError && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-900">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{panelError}</span>
              </div>
              <button
                type="button"
                onClick={() => setPanelError('')}
                className="text-rose-700 hover:underline text-xs font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Top KPI Strip (Clickable Quick Jumpers, Single-Level Flat Surface) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border border-slate-200 rounded-xl bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveTab('ADMINS')}
              className="p-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="text-xs font-medium text-slate-500">Logged-in Admins</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-indigo-700">
                {enrichedAdmins.length}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {dashboardMetrics.adminsWithSchools} with schools
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SCHOOLS')}
              className="p-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="text-xs font-medium text-slate-500">Registered Schools</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {aggregatedSchools.length}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {dashboardMetrics.customCount} custom policies
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSchoolFilter('RESTRICTED');
                setActiveTab('SCHOOLS');
              }}
              className="p-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="text-xs font-medium text-slate-500">Restricted Schools</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-600">
                {dashboardMetrics.restrictedCount}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {overrides.length} Gmail overrides
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('STAFF')}
              className="p-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="text-xs font-medium text-slate-500">Active Staff</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {dashboardMetrics.activeTeachers + dashboardMetrics.activeClerks}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {dashboardMetrics.activeTeachers} Teachers · {dashboardMetrics.activeClerks} Clerks
              </div>
            </button>

            <div className="p-4 col-span-2 sm:col-span-1">
              <div className="text-xs font-medium text-slate-500">Total Students</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {dashboardMetrics.totalStudents}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">Across all school codes</div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* TAB 1: SCHOOLS & FEATURE CONTROLS                                */}
          {/* ================================================================ */}
          {activeTab === 'SCHOOLS' && (
            <section className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={schoolSearch}
                    onChange={(e) => setSchoolSearch(e.target.value)}
                    placeholder="Search School Code (51803, 31337), School Name, Admin Gmail, Teacher or Clerk..."
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                  {schoolSearch && (
                    <button
                      type="button"
                      onClick={() => setSchoolSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'ALL', label: `All (${aggregatedSchools.length})` },
                        { id: 'CUSTOM', label: `Custom (${dashboardMetrics.customCount})` },
                        { id: 'RESTRICTED', label: `Restricted (${dashboardMetrics.restrictedCount})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSchoolFilter(tab.id)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          schoolFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddSchoolForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add School Code</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Add School Code Form */}
              {showAddSchoolForm && (
                <form
                  onSubmit={handleAddSchoolPolicy}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-xl border border-indigo-200 bg-white p-4"
                >
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      School Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={newSchoolCode}
                      onChange={(e) => setNewSchoolCode(e.target.value)}
                      placeholder="e.g. 51803 or 31337"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      School Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      placeholder="e.g. High Secondary School Berua"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Plan / Remark Note
                    </label>
                    <input
                      type="text"
                      value={newSchoolNote}
                      onChange={(e) => setNewSchoolNote(e.target.value)}
                      placeholder="e.g. Trial / Paid / Locked"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-end gap-1.5">
                    <button
                      type="submit"
                      disabled={busySchoolKey !== null}
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddSchoolForm(false)}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Schools List */}
              {filteredSchools.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-3">
                  <Building2 className="mx-auto h-7 w-7 text-slate-400" />
                  <div className="text-sm font-bold text-slate-800">
                    {aggregatedSchools.length === 0
                      ? 'Abhi koi School Code sync nahi hua hai'
                      : 'Search / filter me koi School Code match nahi hua'}
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Jab bhi koi School Admin admit card upload karega ya Teacher/Clerk assign
                    karega, uska School Code yahan automatically aa jayega. Aap manually bhi naya
                    School Code add kar sakte hain.
                  </p>
                  {aggregatedSchools.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAddSchoolForm(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add First School Code</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSchools.map((school) => {
                    const isCustom = Boolean(school.policy);
                    const activeTeachers = school.teachers.filter((t) => t.active);
                    const activeClerks = school.clerks.filter((c) => c.active);
                    const staffExpanded = Boolean(expandedStaffCodes[school.schoolCode]);
                    const isEditingNote = editingNoteCode === school.schoolCode;

                    return (
                      <div
                        key={school.schoolCode}
                        className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                      >
                        {/* School Header Row */}
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 px-4 py-3.5 border-b border-slate-100">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-indigo-700">
                                {school.schoolCode}
                              </span>
                              <span className="text-sm font-bold text-slate-900">
                                {school.schoolName || 'School Name Not Synced Yet'}
                              </span>
                            </div>

                            {/* Clean Unboxed Metadata Line */}
                            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                              <span className="font-medium text-slate-700">
                                {school.classes.length > 0
                                  ? school.classes
                                      .map((c) => (c === 'MATRIC (10th)' ? '10th' : '12th'))
                                      .join(' & ')
                                  : 'No class synced'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {school.studentCount} Students
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                Admin:{' '}
                                <span className="font-mono text-slate-700">
                                  {school.admins.length > 0
                                    ? school.admins.map((a) => a.email).join(', ')
                                    : 'Not synced yet'}
                                </span>
                              </span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  school.disabledCount > 0
                                    ? 'font-semibold text-rose-600'
                                    : isCustom
                                    ? 'font-semibold text-indigo-700'
                                    : 'font-semibold text-emerald-700'
                                }
                              >
                                {school.disabledCount > 0
                                  ? `${school.disabledCount} Disabled`
                                  : isCustom
                                  ? 'Custom · All ON'
                                  : 'Global Default'}
                              </span>
                            </div>

                            {/* Inline Note + Staff Toggle Line */}
                            <div className="flex items-center gap-3 flex-wrap text-xs">
                              {isEditingNote ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingNoteText}
                                    onChange={(e) => setEditingNoteText(e.target.value)}
                                    placeholder="e.g. Paid / Trial / Demo"
                                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    disabled={busySchoolKey !== null}
                                    onClick={() => handleSaveSchoolNote(school)}
                                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingNoteCode(null)}
                                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteCode(school.schoolCode);
                                    setEditingNoteText(school.policy?.note || '');
                                  }}
                                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700 cursor-pointer"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  <span>
                                    {school.policy?.note
                                      ? `Note: ${school.policy.note}`
                                      : 'Add Plan / Remark Note'}
                                  </span>
                                </button>
                              )}

                              <span className="text-slate-300">·</span>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedStaffCodes((prev) => ({
                                    ...prev,
                                    [school.schoolCode]: !prev[school.schoolCode],
                                  }))
                                }
                                className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline cursor-pointer"
                              >
                                <span>
                                  Staff: {activeTeachers.length} Teachers, {activeClerks.length}{' '}
                                  Clerks
                                </span>
                                {staffExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* School Quick Presets */}
                          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                            <button
                              type="button"
                              disabled={busySchoolKey !== null}
                              onClick={() =>
                                handleApplySchoolPreset(
                                  school,
                                  { ...DEFAULT_ADMIN_FEATURE_FLAGS },
                                  'Full Access (All ON)'
                                )
                              }
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              All ON
                            </button>
                            <button
                              type="button"
                              disabled={busySchoolKey !== null}
                              onClick={() =>
                                handleApplySchoolPreset(
                                  school,
                                  TRIAL_LOCKED_FLAGS,
                                  'Trial Lock (Excel/Random Marks/ZIP OFF)'
                                )
                              }
                              title="Disable Random Marks, Excel Download, ZIP Pack & Bulk Delete"
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              Trial Lock
                            </button>
                            <button
                              type="button"
                              disabled={busySchoolKey !== null}
                              onClick={() =>
                                handleApplySchoolPreset(
                                  school,
                                  {
                                    randomMarksGenerator: false,
                                    excelDownload: false,
                                    pdfDownload: false,
                                    completeZipDownload: false,
                                    letterPadAndLifafa: false,
                                    attendanceSheet: false,
                                    teacherClerkManagement: false,
                                    bulkDeleteData: false,
                                  },
                                  'All OFF'
                                )
                              }
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              All OFF
                            </button>
                            {isCustom && (
                              <button
                                type="button"
                                disabled={busySchoolKey !== null}
                                onClick={() => handleResetSchoolToGlobal(school)}
                                title="Reset to Global Default"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Reset</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Staff List for this School */}
                        {staffExpanded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 px-4 py-3 border-b border-slate-100 text-xs">
                            <div>
                              <div className="font-semibold text-slate-700 mb-2">
                                Assigned Teachers ({school.teachers.length})
                              </div>
                              {school.teachers.length === 0 ? (
                                <div className="text-slate-400">Koi teacher assign nahi hai.</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {school.teachers.map((t) => (
                                    <div
                                      key={t.id}
                                      className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 last:border-b-0"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-slate-900">{t.name}</span>{' '}
                                        <span className="font-mono text-[11px] text-slate-500">
                                          ({t.email})
                                        </span>
                                        <div className="text-[11px] text-slate-500 truncate">
                                          {t.subjects.join(', ') || 'No subjects'}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={busyStaffId === `TEACHER_${t.id}`}
                                        onClick={() =>
                                          handleToggleStaffActive('TEACHER', t.id, t.active, t.name)
                                        }
                                        className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                                          t.active
                                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                            : 'text-slate-600 bg-slate-200 hover:bg-slate-300'
                                        }`}
                                      >
                                        {t.active ? 'Active' : 'Paused'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="font-semibold text-slate-700 mb-2">
                                Assigned Print Clerks ({school.clerks.length})
                              </div>
                              {school.clerks.length === 0 ? (
                                <div className="text-slate-400">Koi clerk assign nahi hai.</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {school.clerks.map((c) => (
                                    <div
                                      key={c.id}
                                      className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 last:border-b-0"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-slate-900">{c.name}</span>{' '}
                                        <span className="font-mono text-[11px] text-slate-500">
                                          ({c.email})
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={busyStaffId === `CLERK_${c.id}`}
                                        onClick={() =>
                                          handleToggleStaffActive('CLERK', c.id, c.active, c.name)
                                        }
                                        className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                                          c.active
                                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                            : 'text-slate-600 bg-slate-200 hover:bg-slate-300'
                                        }`}
                                      >
                                        {c.active ? 'Active' : 'Paused'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 8 Feature Toggle Grid */}
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
                                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer disabled:opacity-50 ${
                                  isOn
                                    ? 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                                    : 'border-rose-200 bg-rose-50/70 text-rose-950 hover:bg-rose-100/70'
                                }`}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <Icon
                                    className={`h-3.5 w-3.5 shrink-0 ${
                                      isOn ? 'text-slate-500' : 'text-rose-600'
                                    }`}
                                  />
                                  <span className="text-xs font-semibold truncate">{shortLabel}</span>
                                </span>
                                <span
                                  className={`shrink-0 font-mono text-[11px] font-bold ${
                                    isOn ? 'text-emerald-700' : 'text-rose-700'
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
          )}

          {/* ================================================================ */}
          {/* TAB 2: LOGGED-IN ADMINS DIRECTORY & GMAIL OVERRIDES              */}
          {/* ================================================================ */}
          {activeTab === 'ADMINS' && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    placeholder="Search Admin Name, Gmail or School Code..."
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                  {adminSearch && (
                    <button
                      type="button"
                      onClick={() => setAdminSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'ALL', label: `All (${enrichedAdmins.length})` },
                        {
                          id: 'WITH_SCHOOLS',
                          label: `With Schools (${dashboardMetrics.adminsWithSchools})`,
                        },
                        {
                          id: 'NO_SCHOOLS',
                          label: `No Data (${enrichedAdmins.length - dashboardMetrics.adminsWithSchools})`,
                        },
                        { id: 'OVERRIDES', label: `Custom Rule (${overrides.length})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAdminFilter(tab.id)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          adminFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddAdminRuleForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Gmail Rule</span>
                  </button>
                </div>
              </div>

              {showAddAdminRuleForm && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateOrStartOverride(newAdminEmail, newAdminNote);
                  }}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-xl border border-indigo-200 bg-white p-4"
                >
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Admin Gmail Address *
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        placeholder="schooladmin@gmail.com"
                        className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Note / School Label (Optional)
                    </label>
                    <input
                      type="text"
                      value={newAdminNote}
                      onChange={(e) => setNewAdminNote(e.target.value)}
                      placeholder="e.g. Principal / Operator"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-end gap-1.5">
                    <button
                      type="submit"
                      disabled={busyOverrideId !== null}
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                    >
                      Save Rule
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddAdminRuleForm(false)}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Admins Table */}
              {filteredAdmins.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-2">
                  <UserCog className="mx-auto h-7 w-7 text-slate-400" />
                  <div className="text-sm font-bold text-slate-800">
                    {enrichedAdmins.length === 0
                      ? 'Abhi tak kisi doosre Admin ne login nahi kiya hai'
                      : 'Is search/filter me koi Admin nahi mila'}
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Jaise hi koi bhi Admin portal par Google se login karega, unka naam, Gmail,
                    linked school codes aur last login time yahan live show hone lagega.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                          <th className="py-3 px-4">#</th>
                          <th className="py-3 px-4">Admin Name &amp; Gmail</th>
                          <th className="py-3 px-4">Linked School Codes</th>
                          <th className="py-3 px-4 text-right">Students</th>
                          <th className="py-3 px-4 text-right">Staff</th>
                          <th className="py-3 px-4">Last Login</th>
                          <th className="py-3 px-4 text-right">Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredAdmins.map((admin, idx) => {
                          const isExpanded = expandedAdminEmail === admin.email;
                          const ov = admin.override;
                          const disabledOverrideCount = ov
                            ? FEATURE_LIST.filter((f) => !ov[f.key]).length
                            : 0;

                          return (
                            <React.Fragment key={admin.email}>
                              <tr className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-3 px-4 font-mono tabular-nums text-slate-400">
                                  {idx + 1}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-slate-900">
                                    {admin.displayName}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono text-[11px] text-slate-500">
                                      {admin.email}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(admin.email, admin.email)}
                                      title="Copy Gmail"
                                      className="text-slate-400 hover:text-indigo-700 cursor-pointer"
                                    >
                                      {copiedKey === admin.email ? (
                                        <Check className="h-3 w-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  {admin.schoolCodes.length === 0 ? (
                                    <span className="text-slate-400">No school uploaded yet</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {admin.schoolCodes.map((sc) => (
                                        <button
                                          key={sc.schoolCode}
                                          type="button"
                                          onClick={() => jumpToSchoolCode(sc.schoolCode)}
                                          title={`Open ${sc.schoolCode} feature controls`}
                                          className="font-mono text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer"
                                        >
                                          {sc.schoolCode}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-800">
                                  {admin.totalStudents}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                  {admin.teacherCount}T · {admin.clerkCount}C
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <div className="font-mono tabular-nums text-[11px] text-slate-700">
                                    {admin.lastLoginAt || 'Not recorded'}
                                  </div>
                                  {admin.createdAt && (
                                    <div className="text-[10px] text-slate-400">
                                      Joined {admin.createdAt}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5 justify-end">
                                    {ov ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedAdminEmail(isExpanded ? null : admin.email)
                                        }
                                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                                          disabledOverrideCount > 0
                                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                            : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                        }`}
                                      >
                                        <SlidersHorizontal className="h-3 w-3" />
                                        <span>
                                          {disabledOverrideCount > 0
                                            ? `${disabledOverrideCount} Off`
                                            : 'Edit Rule'}
                                        </span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={busyOverrideId !== null}
                                        onClick={() =>
                                          handleCreateOrStartOverride(
                                            admin.email,
                                            admin.displayName
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                      >
                                        <SlidersHorizontal className="h-3 w-3" />
                                        <span>Set Rule</span>
                                      </button>
                                    )}

                                    {admin.uid &&
                                      (confirmDeleteUid === admin.uid ? (
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            disabled={busyOverrideId === `del_acc_${admin.uid}`}
                                            onClick={() =>
                                              handleDeleteAdminLoginRecord(admin.uid, admin.email)
                                            }
                                            className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 cursor-pointer"
                                          >
                                            Confirm
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteUid(null)}
                                            className="text-[11px] text-slate-500 hover:text-slate-800 px-1 cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteUid(admin.uid)}
                                          title="Remove login record from directory"
                                          className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      ))}
                                  </div>
                                </td>
                              </tr>

                              {/* Inline Feature Toggle Drawer for this Admin Gmail */}
                              {isExpanded && ov && (
                                <tr className="bg-slate-50/80">
                                  <td colSpan={7} className="px-4 py-3.5 border-t border-slate-100">
                                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                                      <div className="text-xs text-slate-600">
                                        Gmail Override for{' '}
                                        <span className="font-mono font-semibold text-slate-900">
                                          {ov.adminEmail}
                                        </span>{' '}
                                        <span className="text-slate-400">
                                          (Applies when no School Code Policy overrides it)
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={busyOverrideId === `del_${ov.id}`}
                                        onClick={() => handleRemoveOverride(ov)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                        <span>Remove Gmail Rule</span>
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                      {FEATURE_LIST.map(({ key, shortLabel, Icon }) => {
                                        const isOn = ov[key];
                                        const isBusy = busyOverrideId === `${ov.id}_${key}`;
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => handleToggleOverrideFlag(ov, key)}
                                            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer disabled:opacity-50 ${
                                              isOn
                                                ? 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                                                : 'border-rose-200 bg-rose-50 text-rose-950 hover:bg-rose-100'
                                            }`}
                                          >
                                            <span className="flex items-center gap-2 min-w-0">
                                              <Icon className="h-3.5 w-3.5 shrink-0 opacity-75" />
                                              <span className="text-xs font-semibold truncate">
                                                {shortLabel}
                                              </span>
                                            </span>
                                            <span
                                              className={`shrink-0 font-mono text-[11px] font-bold ${
                                                isOn ? 'text-emerald-700' : 'text-rose-700'
                                              }`}
                                            >
                                              {isOn ? 'ON' : 'OFF'}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ================================================================ */}
          {/* TAB 3: TEACHERS & PRINT CLERKS DIRECTORY                         */}
          {/* ================================================================ */}
          {activeTab === 'STAFF' && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Search Teacher/Clerk Name, Gmail, School Code, Subject or Admin Gmail..."
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                  {staffSearch && (
                    <button
                      type="button"
                      onClick={() => setStaffSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
                  {(
                    [
                      { id: 'ALL', label: `All (${combinedStaff.length})` },
                      { id: 'TEACHER', label: `Teachers (${allTeacherAssignments.length})` },
                      { id: 'CLERK', label: `Clerks (${allClerkAssignments.length})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStaffRoleFilter(tab.id)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        staffRoleFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredStaff.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-2">
                  <Users className="mx-auto h-7 w-7 text-slate-400" />
                  <div className="text-sm font-bold text-slate-800">
                    Koi Teacher ya Print Clerk record nahi mila
                  </div>
                  <p className="text-xs text-slate-500">
                    Jab school admins teachers ya print clerks ko access denge, unki poori list
                    yahan dikhegi.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                          <th className="py-3 px-4">Role</th>
                          <th className="py-3 px-4">Name &amp; Gmail</th>
                          <th className="py-3 px-4">School Code</th>
                          <th className="py-3 px-4">Classes &amp; Subjects</th>
                          <th className="py-3 px-4">Assigned By</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredStaff.map((staff) => {
                          const isBusy = busyStaffId === `${staff.role}_${staff.id}`;
                          return (
                            <tr
                              key={`${staff.role}_${staff.id}`}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              <td className="py-3 px-4 font-semibold whitespace-nowrap">
                                <span
                                  className={
                                    staff.role === 'TEACHER'
                                      ? 'text-indigo-700'
                                      : 'text-sky-700'
                                  }
                                >
                                  {staff.role === 'TEACHER' ? 'Teacher' : 'Print Clerk'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">{staff.name}</div>
                                <div className="font-mono text-[11px] text-slate-500">
                                  {staff.email}
                                </div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => jumpToSchoolCode(staff.schoolCode)}
                                  className="font-mono font-semibold text-indigo-700 hover:underline cursor-pointer"
                                >
                                  {staff.schoolCode}
                                </button>
                                {staff.schoolName && (
                                  <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                    {staff.schoolName}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-slate-800">
                                  {staff.classes
                                    .map((c) => (c === 'MATRIC (10th)' ? '10th' : '12th'))
                                    .join(', ') || '-'}
                                </div>
                                {staff.role === 'TEACHER' ? (
                                  <div className="text-[11px] text-slate-500 max-w-[240px] truncate">
                                    {staff.subjects.join(', ') || '-'}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-400">
                                    Read-Only Print Desk
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                                {staff.ownerEmail || '-'}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleToggleStaffActive(
                                      staff.role,
                                      staff.id,
                                      staff.active,
                                      staff.name
                                    )
                                  }
                                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                                    staff.active
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                      : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {staff.active ? 'Active' : 'Paused'}
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
            </section>
          )}

          {/* ================================================================ */}
          {/* TAB 4: GLOBAL DEFAULTS & RULE PRIORITY                           */}
          {/* ================================================================ */}
          {activeTab === 'DEFAULTS' && (
            <section className="space-y-5">
              {/* Clear 3-Step Rule Priority Explanation */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
                <div className="text-sm font-bold text-slate-900">
                  Rule Priority Order (Kaunsa Control Pehle Lagta Hai)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs text-slate-600">
                  <div className="space-y-1">
                    <div className="font-bold text-indigo-700">1. School Code Policy</div>
                    <p>
                      Agar kisi School Code (jaise 51803) par custom toggle set hai, toh wahi sabse
                      pehle apply hoga—Admin aur Clerk dono par.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900">2. Admin Gmail Override</div>
                    <p>
                      Agar School Code policy nahi hai, par Admin Gmail par rule set hai, toh wo
                      apply hoga.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900">3. Global Default (Neeche)</div>
                    <p>
                      Baaki sabhi naye aur general schools automatically neeche diye gaye Global
                      Default flags follow karte hain.
                    </p>
                  </div>
                </div>
              </div>

              {/* Master Global Switches */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Global Default Feature Switches
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {enabledGlobalCount}/{FEATURE_LIST.length} Enabled by default
                      {globalUpdatedAt ? ` · Last updated ${globalUpdatedAt}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={savingGlobalKey !== null}
                      onClick={() =>
                        handleApplyGlobalPreset(
                          { ...DEFAULT_ADMIN_FEATURE_FLAGS },
                          'Full Access (All ON)'
                        )
                      }
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      Enable All
                    </button>
                    <button
                      type="button"
                      disabled={savingGlobalKey !== null}
                      onClick={() =>
                        handleApplyGlobalPreset(
                          TRIAL_LOCKED_FLAGS,
                          'Trial Mode (Excel/Random Marks/ZIP OFF)'
                        )
                      }
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      Trial Lock Preset
                    </button>
                    <button
                      type="button"
                      disabled={savingGlobalKey !== null}
                      onClick={() =>
                        handleApplyGlobalPreset(
                          {
                            randomMarksGenerator: false,
                            excelDownload: false,
                            pdfDownload: false,
                            completeZipDownload: false,
                            letterPadAndLifafa: false,
                            attendanceSheet: false,
                            teacherClerkManagement: false,
                            bulkDeleteData: false,
                          },
                          'All Disabled'
                        )
                      }
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      Disable All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {FEATURE_LIST.map(({ key, label, shortDesc, Icon }) => {
                    const isOn = globalFlags[key];
                    const isBusy = savingGlobalKey === key || savingGlobalKey === '__all__';
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                          isOn ? 'border-slate-200 bg-white' : 'border-rose-200 bg-rose-50/40'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900">{label}</span>
                              <span
                                className={`font-mono text-[11px] font-bold ${
                                  isOn ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {isOn ? 'ON' : 'OFF'}
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
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                            isOn ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ${
                              isOn ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
