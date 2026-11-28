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
} from 'lucide-react';
import {
  AdminAccountRecord,
  AdminFeatureFlags,
  AdminFeatureOverrideRecord,
  DEFAULT_ADMIN_FEATURE_FLAGS,
  SUPER_ADMIN_EMAIL,
  User,
  deleteAdminFeatureOverride,
  isSuperAdminUserEmail,
  saveAdminFeatureOverride,
  saveGlobalFeatureFlags,
  signInWithGooglePopup,
  signOutFromFirebase,
  subscribeToAllAdminAccounts,
  subscribeToAllAdminFeatureOverrides,
  subscribeToGlobalFeatureFlags,
} from '../firebase';

interface SuperAdminPortalProps {
  firebaseUser: User | null;
  authReady: boolean;
  onExitToMainPortal: () => void;
}

interface FeatureDefinition {
  key: keyof AdminFeatureFlags;
  label: string;
  shortDesc: string;
  Icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}

const FEATURE_LIST: FeatureDefinition[] = [
  {
    key: 'randomMarksGenerator',
    label: 'Random Marks Generator',
    shortDesc: '1-Click Auto / Random Marks Generator inside Marks Settings',
    Icon: Sparkles,
    accentClass: 'bg-indigo-50 text-indigo-700',
  },
  {
    key: 'excelDownload',
    label: 'Excel Download (.xlsx)',
    shortDesc: 'Sent-Up Panji, Absent, Vocational, Blind & Attendance Excel downloads',
    Icon: FileSpreadsheet,
    accentClass: 'bg-emerald-50 text-emerald-700',
  },
  {
    key: 'pdfDownload',
    label: 'PDF Reports Download',
    shortDesc: 'All Sent-Up Panji, Absent, Vocational & Attendance PDF reports',
    Icon: FileText,
    accentClass: 'bg-slate-100 text-slate-800',
  },
  {
    key: 'completeZipDownload',
    label: '1-Click Complete ZIP Pack',
    shortDesc: 'Download All 12th / 10th PDFs, Excels, Letter Pad & Lifafa ZIP folder',
    Icon: FolderArchive,
    accentClass: 'bg-teal-50 text-teal-700',
  },
  {
    key: 'letterPadAndLifafa',
    label: 'Letter Pad & Lifafa Studio',
    shortDesc: 'Official Letter Pad & Envelope (Lifafa) Print Studio tab',
    Icon: Printer,
    accentClass: 'bg-violet-50 text-violet-700',
  },
  {
    key: 'attendanceSheet',
    label: 'Attendance Sheet',
    shortDesc: 'Exam Attendance Sheet (उपस्थिति पत्रक) print & export tab',
    Icon: ClipboardCheck,
    accentClass: 'bg-sky-50 text-sky-700',
  },
  {
    key: 'teacherClerkManagement',
    label: 'Teachers & Clerks Panel',
    shortDesc: 'Assign or remove Subject Teachers & Print Clerks access',
    Icon: Users,
    accentClass: 'bg-amber-50 text-amber-700',
  },
  {
    key: 'bulkDeleteData',
    label: 'Clear All / Bulk Delete',
    shortDesc: 'One-click Clear All students button in Admit Cards header',
    Icon: Trash2,
    accentClass: 'bg-rose-50 text-rose-700',
  },
];

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  firebaseUser,
  authReady,
  onExitToMainPortal,
}) => {
  const [loginBusy, setLoginBusy] = useState(false);
  const [authErr, setAuthErr] = useState('');

  const [globalFlags, setGlobalFlags] = useState<AdminFeatureFlags>({
    ...DEFAULT_ADMIN_FEATURE_FLAGS,
  });
  const [globalUpdatedAt, setGlobalUpdatedAt] = useState<string | undefined>(undefined);
  const [savingGlobalKey, setSavingGlobalKey] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<AdminFeatureOverrideRecord[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRecord[]>([]);
  const [statusToast, setStatusToast] = useState<string>('');
  const [panelError, setPanelError] = useState<string>('');

  // Add / Edit Per-Admin Override form state
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
        `${label} ab sabhi Other Admins ke liye ${nextFlags[key] ? 'ENABLED' : 'DISABLED'} ho gaya.`
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
          ? 'Sabhi features sabhi Admins ke liye ENABLE kar diye gaye.'
          : 'Sabhi controllable features sabhi Other Admins ke liye DISABLE kar diye gaye.'
      );
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update global flags.');
    } finally {
      setSavingGlobalKey(null);
    }
  };

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
      showToast(`${cleanEmail} ke liye custom feature policy add ho gayi.`);
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
      const label = FEATURE_LIST.find((f) => f.key === key)?.label || key;
      showToast(
        `${ov.adminEmail}: ${label} ${nextFlags[key] ? 'ENABLED' : 'DISABLED'}.`
      );
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
      showToast(`${ov.adminEmail} ab Global Default policy follow karega.`);
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

  // 2. Login Screen (Not signed in yet)
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                  Super Admin Control
                </h1>
                <p className="text-xs font-mono text-indigo-700">/supadm · Feature Access Console</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs text-indigo-950 space-y-1">
            <div className="font-bold">Authorized Super Admin Only</div>
            <p className="text-indigo-800/90 leading-relaxed">
              Is panel se aap sabhi Other Admins ke liye <b>Random Marks Generator</b>,{' '}
              <b>Excel Download</b>, <b>PDF Download</b>, <b>ZIP Pack</b>, aur doosre modules ko
              real-time me Enable / Disable kar sakte hain.
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

  // 3. Access Denied Screen (Signed in as a non-Super-Admin email)
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

  // 4. Authorized Super Admin Dashboard (nehajha.gyanora@gmail.com)
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
              <p className="text-[11px] text-slate-500 truncate font-mono">
                {firebaseUser.email}
              </p>
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

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
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
              className="text-emerald-700 hover:underline text-[11px] font-bold"
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
              className="text-rose-700 hover:underline text-[11px] font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Section 1: Global Feature Controls for All Other Admins */}
        <section className="rounded-3xl border border-indigo-100 bg-white p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 shrink-0">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Global Feature Controls (All Other Admins)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Yahan se koi bhi feature OFF karne par sabhi Other Admins ke portal se turant
                  hide/disable ho jayega. ({enabledGlobalCount}/{FEATURE_LIST.length} Enabled
                  {globalUpdatedAt ? ` · Last updated ${globalUpdatedAt}` : ''})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition-colors ${
                    isOn
                      ? 'border-slate-200 bg-white'
                      : 'border-rose-200 bg-rose-50/40'
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
                        <span className="text-xs sm:text-sm font-bold text-slate-900">{label}</span>
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
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{shortDesc}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`Toggle ${label}`}
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
        </section>

        {/* Section 2: Per-Admin Custom Overrides */}
        <section className="rounded-3xl border border-indigo-100 bg-white p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 shrink-0">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Specific Admin Override (Per-Gmail Control)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Agar kisi particular Admin Gmail ke liye alag permission set karni ho (jaise sirf ek
                admin ka Random Marks Generator ya Excel Download band/chalu karna), toh uska Gmail
                add karein ya neeche logged-in Admins list se select karein.
              </p>
            </div>
          </div>

          {/* Add Specific Admin Form */}
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
                School / Label (Optional)
              </label>
              <input
                type="text"
                value={newAdminNote}
                onChange={(e) => setNewAdminNote(e.target.value)}
                placeholder="e.g. Berua High School Admin"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                disabled={busyOverrideId !== null}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Custom Policy</span>
              </button>
            </div>
          </form>

          {/* Detected Logged-In Admins Directory */}
          {otherAdminAccounts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Detected Admin Accounts ({otherAdminAccounts.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {otherAdminAccounts.map((acc) => {
                  const hasCustom = overrideByEmail.has(acc.email);
                  return (
                    <div
                      key={acc.uid}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate max-w-[200px]">
                          {acc.displayName || acc.email}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500 truncate max-w-[220px]">
                          {acc.email}
                          {acc.lastLoginAt ? ` · ${acc.lastLoginAt}` : ''}
                        </div>
                      </div>
                      {hasCustom ? (
                        <button
                          type="button"
                          onClick={() => setEditingOverrideEmail(acc.email)}
                          className="rounded-lg bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-800 hover:bg-violet-200 cursor-pointer"
                        >
                          Custom Active
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleCreateOrStartOverride(acc.email, acc.displayName || '')
                          }
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                        >
                          Customize
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Per-Admin Overrides List */}
          {overrides.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
              Abhi kisi particular Admin par custom override set nahi hai. Sabhi Other Admins upar
              wali <b>Global Feature Controls</b> policy follow kar rahe hain.
            </div>
          ) : (
            <div className="space-y-3">
              {overrides.map((ov) => {
                const isExpanded = editingOverrideEmail === ov.adminEmail || overrides.length <= 3;
                const disabledList = FEATURE_LIST.filter((f) => !ov[f.key]);
                return (
                  <div
                    key={ov.id}
                    className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 border-b border-slate-100">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs sm:text-sm font-bold text-slate-900">
                            {ov.adminEmail}
                          </span>
                          {ov.note && (
                            <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {ov.note}
                            </span>
                          )}
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              disabledList.length > 0
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {disabledList.length > 0
                              ? `${disabledList.length} Disabled`
                              : 'All Enabled'}
                          </span>
                        </div>
                        {ov.updatedAt && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Updated: {ov.updatedAt}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {overrides.length > 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingOverrideEmail(isExpanded ? null : ov.adminEmail)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            {isExpanded ? 'Hide' : 'Edit Toggles'}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyOverrideId === `del_${ov.id}`}
                          onClick={() => handleRemoveOverride(ov)}
                          title="Reset this admin to Global Defaults"
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset to Global</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3.5">
                        {FEATURE_LIST.map(({ key, label, Icon }) => {
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
                                  ? 'border-emerald-200 bg-emerald-50/50 text-slate-900 hover:bg-emerald-50'
                                  : 'border-rose-200 bg-rose-50/70 text-rose-950 hover:bg-rose-100/70'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Icon className="h-3.5 w-3.5 shrink-0 opacity-75" />
                                <span className="text-[11px] font-bold truncate">{label}</span>
                              </div>
                              <span
                                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                                  isOn
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-rose-600 text-white'
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
        </section>
      </main>
    </div>
  );
};
