import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Search,
  Trash2,
  Edit3,
  Plus,
  User as UserIcon,
  Square,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Check,
  BookOpen,
  Menu,
  X,
  Cloud,
  LogOut,
  BarChart3,
  SlidersHorizontal,
  GraduationCap,
  School,
  Settings,
  Building2,
  ClipboardCheck,
  Users,
  Loader2,
} from 'lucide-react';
import {
  AdmitCardRecord,
  CustomExcelFormatConfig,
  ExamType,
  ExportFormatMode,
  ExtractionProgress,
  FacultyType,
  FilterState,
  TeacherAssignment,
} from './types/admitCard';
import { computeSummaryStats } from './utils/bsebParser';
import { extractFromUploadedFile } from './utils/pdfExtractor';
import {
  exportToExcel,
  exportToPdfReport,
  exportSentUp12thPdf,
  exportSentUp10thPdf,
  exportAbsent12thPdf,
  exportAbsent12thExcel,
  exportVocational12thPdf,
  exportVocational12thExcel,
  exportAbsent10thPdf,
  exportAbsent10thExcel,
  exportVisuallyImpairedSentUp10thPdf,
  exportVisuallyImpairedSentUp10thExcel,
  exportVisuallyImpairedAbsent10thPdf,
  exportVisuallyImpairedAbsent10thExcel,
} from './utils/exportReports';
import {
  calculateStudentMarksSummary,
  getSubjectMark,
  parseUploadedExcelTemplateAndMarks,
} from './utils/marksAndFormat';
import {
  auth,
  onAuthStateChanged,
  signInWithGooglePopup,
  signOutFromFirebase,
  subscribeToUserStudents,
  upsertStudentInFirestore,
  syncAllStudentsToFirestore,
  deleteStudentFromFirestore,
  clearAllUserStudentsFromFirestore,
  saveTeacherAssignmentInFirestore,
  deleteTeacherAssignmentFromFirestore,
  syncTeacherAccessToOwnerStudents,
  subscribeToOwnerTeacherAssignments,
  subscribeToMyTeacherAssignments,
  subscribeToTeacherAssignedStudents,
  User,
} from './firebase';
import { StudentDetailModal } from './components/StudentDetailModal';
import { SummaryAnalyticsView } from './components/SummaryAnalyticsView';
import { ManualEntryModal } from './components/ManualEntryModal';
import { SubjectMarksAndFormatView } from './components/SubjectMarksAndFormatView';
import { SettingsModal } from './components/SettingsModal';
import { SchoolUniversalDashboard } from './components/SchoolUniversalDashboard';
import { AttendanceSheetView } from './components/AttendanceSheetView';
import { TeacherManagementView } from './components/TeacherManagementView';
import { TeacherMarksPortal } from './components/TeacherMarksPortal';
import { LoginPage, PortalRole } from './components/LoginPage';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { computeAssignedTeacherEmailsForStudent } from './utils/teacherSubjectMatcher';

export type SchoolModule = 'INTERMEDIATE' | 'MATRIC';

const getSavedPortalRole = (uid: string): PortalRole | null => {
  try {
    const val = window.localStorage.getItem(`bseb_portal_role_${uid}`);
    if (val === 'ADMIN' || val === 'TEACHER') return val;
  } catch {
    // ignore storage restrictions
  }
  return null;
};

const savePortalRole = (uid: string, role: PortalRole) => {
  try {
    window.localStorage.setItem(`bseb_portal_role_${uid}`, role);
  } catch {
    // ignore storage restrictions
  }
};

const clearSavedPortalRole = (uid: string) => {
  try {
    window.localStorage.removeItem(`bseb_portal_role_${uid}`);
  } catch {
    // ignore storage restrictions
  }
};

export default function App() {
  const [records, setRecordsState] = useState<AdmitCardRecord[]>([]);
  const [activeModule, setActiveModule] = useState<SchoolModule>('INTERMEDIATE');
  const [activeTab, setActiveTab] = useState<
    'register' | 'marks' | 'analytics' | 'dashboard' | 'attendance' | 'teachers'
  >('dashboard');
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [activePortalRole, setActivePortalRole] = useState<PortalRole | null>(null);
  const [loginLoadingRole, setLoginLoadingRole] = useState<PortalRole | null>(null);
  const [ownerAssignments, setOwnerAssignments] = useState<TeacherAssignment[]>([]);
  const [myTeacherAssignments, setMyTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [teacherAssignmentsLoading, setTeacherAssignmentsLoading] = useState<boolean>(false);
  const [teacherAssignedStudents, setTeacherAssignedStudents] = useState<AdmitCardRecord[]>([]);
  const [teacherStudentsLoading, setTeacherStudentsLoading] = useState<boolean>(false);
  const [teacherStudentsError, setTeacherStudentsError] = useState<string>('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AdmitCardRecord | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Firebase Auth & Cloud Sync state
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [authError, setAuthError] = useState<string>('');

  // Custom Excel Format & Export Mode state
  const [customFormat, setCustomFormat] = useState<CustomExcelFormatConfig | null>(null);
  const [exportMode, setExportMode] = useState<ExportFormatMode>('BSEB_12TH_SENTUP');
  const [formatBannerNotice, setFormatBannerNotice] = useState<string>('');

  const [progress, setProgress] = useState<ExtractionProgress>({
    isExtracting: false,
    totalFiles: 0,
    currentFileIndex: 0,
    currentFileName: '',
    totalPagesInFile: 0,
    currentPage: 0,
    extractedCount: 0,
    statusMessage: '',
    errors: [],
  });

  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    examType: 'ALL',
    faculty: 'ALL',
    gender: 'ALL',
    studentCategory: 'ALL',
    casteCategory: 'ALL',
    sourceFile: 'ALL',
    schoolCode: 'ALL',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const excelFormatInputRef = useRef<HTMLInputElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const cancelExtractionRef = useRef(false);
  const recordsRef = useRef<AdmitCardRecord[]>(records);
  recordsRef.current = records;
  const ownerAssignmentsRef = useRef<TeacherAssignment[]>(ownerAssignments);
  ownerAssignmentsRef.current = ownerAssignments;
  const pendingRoleRef = useRef<PortalRole | null>(null);
  const lastAutoSyncKeyRef = useRef<string>('');

  const handleSwitchTab = (
    tab: 'register' | 'marks' | 'analytics' | 'dashboard' | 'attendance' | 'teachers'
  ) => {
    setActiveTab(tab);
    setIsDrawerOpen(false);
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 1. Listen strictly to Firebase Auth state and resolve separate ADMIN vs TEACHER role cleanly
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        const chosenRole = pendingRoleRef.current || getSavedPortalRole(user.uid);
        pendingRoleRef.current = null;
        if (chosenRole) {
          savePortalRole(user.uid, chosenRole);
          setActivePortalRole(chosenRole);
        } else {
          setActivePortalRole(null);
        }
      } else {
        pendingRoleRef.current = null;
        setActivePortalRole(null);
        setCloudStatus('idle');
        recordsRef.current = [];
        setRecordsState([]);
        setSelectedRecord(null);
        setOwnerAssignments([]);
        setMyTeacherAssignments([]);
        setTeacherAssignedStudents([]);
        setTeacherAssignmentsLoading(false);
        setTeacherStudentsLoading(false);
        setTeacherStudentsError('');
        setIsDrawerOpen(false);
        lastAutoSyncKeyRef.current = '';
      }
      setAuthReady(true);
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // 2. Role-isolated Firestore subscriptions (ADMIN module never loads Teacher queries; TEACHER module never loads Admin records)
  useEffect(() => {
    if (!firebaseUser || !activePortalRole) return;

    if (activePortalRole === 'ADMIN') {
      let unsubscribeStudents: (() => void) | null = null;
      let unsubscribeOwnerAssignments: (() => void) | null = null;

      setCloudStatus('syncing');
      setMyTeacherAssignments([]);
      setTeacherAssignedStudents([]);
      setTeacherAssignmentsLoading(false);
      setTeacherStudentsLoading(false);
      setTeacherStudentsError('');

      // Clear any foreign records before subscribing
      const unsavedOfflineRecords = recordsRef.current.filter(
        (r) => !r.ownerId && !r.firestoreDocId
      );
      if (recordsRef.current.some((r) => r.ownerId && r.ownerId !== firebaseUser.uid)) {
        recordsRef.current = unsavedOfflineRecords;
        setRecordsState(unsavedOfflineRecords);
      }

      if (unsavedOfflineRecords.length > 0) {
        syncAllStudentsToFirestore(unsavedOfflineRecords, ownerAssignmentsRef.current).catch(
          (err) => {
            console.error('Initial Firestore sync error:', err);
          }
        );
      }

      unsubscribeStudents = subscribeToUserStudents(firebaseUser, (cloudRecords) => {
        setRecordsState((prev) => {
          const normalizeId = (id: string) => (id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const mediaById = new Map(
            prev
              .filter((r) => !r.ownerId || r.ownerId === firebaseUser.uid)
              .map((r) => [
                normalizeId(r.id),
                {
                  photoDataUrl: r.photoDataUrl,
                  signatureDataUrl: r.signatureDataUrl,
                  pagePreviewDataUrl: r.pagePreviewDataUrl,
                },
              ])
          );

          const recordMap = new Map<string, AdmitCardRecord>();
          for (const cr of cloudRecords) {
            const normKey = normalizeId(cr.id);
            const media = mediaById.get(normKey) || mediaById.get(cr.id);
            recordMap.set(normKey, {
              ...cr,
              id: normKey,
              ...media,
            });
          }

          for (const pr of prev) {
            if (pr.ownerId || pr.firestoreDocId) continue;
            const normKey = normalizeId(pr.id);
            if (!recordMap.has(normKey)) {
              recordMap.set(normKey, {
                ...pr,
                id: normKey,
              });
            }
          }

          const uniqueRecords = Array.from(recordMap.values());
          uniqueRecords.sort((a, b) => a.serialNo - b.serialNo);
          return uniqueRecords.map((r, i) => ({ ...r, serialNo: i + 1 }));
        });
        setCloudStatus('synced');
      });

      unsubscribeOwnerAssignments = subscribeToOwnerTeacherAssignments(firebaseUser, (list) => {
        setOwnerAssignments(list);
      });

      return () => {
        if (unsubscribeStudents) unsubscribeStudents();
        if (unsubscribeOwnerAssignments) unsubscribeOwnerAssignments();
      };
    }

    // TEACHER MODULE: Strictly isolated subscriptions for assigned schools & students only
    recordsRef.current = [];
    setRecordsState([]);
    setOwnerAssignments([]);
    setTeacherAssignmentsLoading(true);
    setTeacherStudentsLoading(true);
    setTeacherStudentsError('');

    const unsubscribeMyAssignments = subscribeToMyTeacherAssignments(
      firebaseUser,
      (list) => {
        setMyTeacherAssignments(list);
        setTeacherAssignmentsLoading(false);
      },
      (errMsg) => {
        setTeacherAssignmentsLoading(false);
        setTeacherStudentsError(errMsg);
      }
    );

    const unsubscribeTeacherStudents = subscribeToTeacherAssignedStudents(
      firebaseUser,
      (list) => {
        setTeacherAssignedStudents(list);
        setTeacherStudentsLoading(false);
        setTeacherStudentsError('');
      },
      (errMsg) => {
        setTeacherStudentsLoading(false);
        setTeacherStudentsError(errMsg);
      }
    );

    return () => {
      unsubscribeMyAssignments();
      unsubscribeTeacherStudents();
    };
  }, [firebaseUser, activePortalRole]);

  // Admin-only: automatically sync assignedTeacherEmails on owner student documents whenever out of sync
  useEffect(() => {
    if (
      activePortalRole !== 'ADMIN' ||
      !firebaseUser ||
      records.length === 0 ||
      ownerAssignments.length === 0
    ) {
      return;
    }

    const staleCount = records.filter((rec) => {
      const currentEmails = (rec.assignedTeacherEmails || []).slice().sort().join(',');
      const expectedEmails = computeAssignedTeacherEmailsForStudent(rec, ownerAssignments)
        .slice()
        .sort()
        .join(',');
      return currentEmails !== expectedEmails;
    }).length;

    if (staleCount === 0) return;

    const syncFingerprint = `${firebaseUser.uid}|${records.length}|${ownerAssignments
      .map(
        (a) =>
          `${a.id}:${a.active}:${a.schoolCode}:${a.assignedClasses.join(',')}:${a.assignedSubjects.join(',')}`
      )
      .join(';')}|stale:${staleCount}`;

    if (lastAutoSyncKeyRef.current === syncFingerprint) return;
    lastAutoSyncKeyRef.current = syncFingerprint;

    syncTeacherAccessToOwnerStudents(records, ownerAssignments).catch((err) => {
      console.error('Auto-sync teacher permissions warning:', err);
    });
  }, [activePortalRole, firebaseUser, records, ownerAssignments]);

  // Wrapper that updates local state and persists changes to Firebase Firestore
  const setRecords = (
    updater: AdmitCardRecord[] | ((prev: AdmitCardRecord[]) => AdmitCardRecord[])
  ) => {
    setRecordsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (auth.currentUser && activePortalRole === 'ADMIN') {
        setCloudStatus('syncing');
        syncAllStudentsToFirestore(next, ownerAssignmentsRef.current)
          .then(() => setCloudStatus('synced'))
          .catch(() => setCloudStatus('error'));
      }
      return next;
    });
  };

  const handleSaveTeacherAssignment = async (
    input: Omit<TeacherAssignment, 'ownerId' | 'ownerEmail'>
  ) => {
    const saved = await saveTeacherAssignmentInFirestore(input);
    const nextAssignments = ownerAssignmentsRef.current.some((a) => a.id === saved.id)
      ? ownerAssignmentsRef.current.map((a) => (a.id === saved.id ? saved : a))
      : [...ownerAssignmentsRef.current, saved];
    setOwnerAssignments(nextAssignments);
    await syncTeacherAccessToOwnerStudents(recordsRef.current, nextAssignments);
  };

  const handleDeleteTeacherAssignment = async (assignmentId: string) => {
    await deleteTeacherAssignmentFromFirestore(assignmentId);
    const nextAssignments = ownerAssignmentsRef.current.filter((a) => a.id !== assignmentId);
    setOwnerAssignments(nextAssignments);
    await syncTeacherAccessToOwnerStudents(recordsRef.current, nextAssignments);
  };

  const handleResyncAllTeacherAccess = async (): Promise<number> => {
    return syncTeacherAccessToOwnerStudents(recordsRef.current, ownerAssignmentsRef.current);
  };

  const handleRoleLogin = async (role: PortalRole) => {
    setAuthError('');
    setLoginLoadingRole(role);
    pendingRoleRef.current = role;
    try {
      const signedInUser = await signInWithGooglePopup();
      savePortalRole(signedInUser.uid, role);
      setActivePortalRole(role);
      if (role === 'ADMIN') {
        setActiveTab('dashboard');
      }
    } catch (err: unknown) {
      pendingRoleRef.current = null;
      const rawMsg = err instanceof Error ? err.message : 'Sign-in failed';
      if (rawMsg.includes('popup-closed-by-user')) {
        setAuthError('Google sign-in window was closed before completing login.');
      } else {
        setAuthError(rawMsg);
      }
    } finally {
      setLoginLoadingRole(null);
    }
  };

  const handleFirebaseSignIn = async () => {
    await handleRoleLogin('ADMIN');
  };

  const handleFirebaseSignOut = async () => {
    if (firebaseUser) {
      clearSavedPortalRole(firebaseUser.uid);
    }
    setActivePortalRole(null);
    setIsDrawerOpen(false);
    await signOutFromFirebase();
  };

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const allFiles = Array.from(fileList);
    const excelFiles = allFiles.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    const pdfOrImgFiles = allFiles.filter(
      (f) =>
        f.type === 'application/pdf' ||
        f.name.toLowerCase().endsWith('.pdf') ||
        f.type.startsWith('image/') ||
        /\.(jpe?g|png|webp)$/i.test(f.name)
    );

    if (excelFiles.length > 0) {
      await handleCustomExcelUploaded(excelFiles[0]);
    }

    if (pdfOrImgFiles.length === 0) {
      if (excelFiles.length === 0) {
        setProgress((prev) => ({
          ...prev,
          errors: ['Select valid PDF (.pdf), Image (.jpg/.png), or Excel (.xlsx) files.'],
        }));
      }
      return;
    }

    cancelExtractionRef.current = false;
    let runningSerialNo = records.length + 1;
    let totalExtractedInBatch = 0;
    const batchErrors: string[] = [];

    setCurrentPage(1);

    setProgress({
      isExtracting: true,
      totalFiles: pdfOrImgFiles.length,
      currentFileIndex: 1,
      currentFileName: pdfOrImgFiles[0].name,
      totalPagesInFile: 1,
      currentPage: 1,
      extractedCount: 0,
      statusMessage: `Reading ${pdfOrImgFiles[0].name}...`,
      errors: [],
    });

    const batchRecords: AdmitCardRecord[] = [];

    for (let fIdx = 0; fIdx < pdfOrImgFiles.length; fIdx++) {
      if (cancelExtractionRef.current) break;
      const file = pdfOrImgFiles[fIdx];

      try {
        await extractFromUploadedFile(
          file,
          runningSerialNo,
          (pageNum, totalPages, latestRecord) => {
            if (latestRecord) {
              totalExtractedInBatch++;
              runningSerialNo++;
              batchRecords.push(latestRecord);

              if (totalExtractedInBatch === 1) {
                if (latestRecord.examType === 'MATRIC (10th)') {
                  setActiveModule('MATRIC');
                  setExportMode('BSEB_10TH_SENTUP');
                } else if (latestRecord.examType === 'INTERMEDIATE (+2)') {
                  setActiveModule('INTERMEDIATE');
                  setExportMode('BSEB_12TH_SENTUP');
                }
              }

              setRecordsState((prev) => {
                const existingIdx = prev.findIndex((r) => r.id === latestRecord.id);
                if (existingIdx !== -1) {
                  const updated = [...prev];
                  updated[existingIdx] = latestRecord;
                  return updated;
                }
                return [...prev, latestRecord];
              });
              if (auth.currentUser) {
                upsertStudentInFirestore(latestRecord, ownerAssignmentsRef.current).catch(console.error);
              }
            }
            setProgress((prev) => ({
              ...prev,
              currentFileIndex: fIdx + 1,
              currentFileName: file.name,
              totalPagesInFile: totalPages,
              currentPage: pageNum,
              extractedCount: totalExtractedInBatch,
              statusMessage: `${file.name} · Page ${pageNum}/${totalPages}`,
            }));
          },
          () => cancelExtractionRef.current
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to parse file';
        batchErrors.push(`${file.name}: ${msg}`);
      }
    }

    if (batchRecords.length > 0) {
      const matricCount = batchRecords.filter((r) => r.examType === 'MATRIC (10th)').length;
      const interCount = batchRecords.filter((r) => r.examType === 'INTERMEDIATE (+2)').length;
      if (matricCount > 0 && interCount === 0) {
        setActiveModule('MATRIC');
        setExportMode('BSEB_10TH_SENTUP');
      } else if (interCount > 0 && matricCount === 0) {
        setActiveModule('INTERMEDIATE');
        setExportMode('BSEB_12TH_SENTUP');
      }
    }

    setProgress((prev) => ({
      ...prev,
      isExtracting: false,
      statusMessage:
        totalExtractedInBatch > 0 ? `${totalExtractedInBatch} admit cards extracted.` : '',
      errors: batchErrors,
    }));

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCustomExcelUploaded = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) return;
      const ws = wb.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(ws, {
        header: 1,
        defval: '',
      });

      const {
        formatConfig,
        updatedRecords,
        matchedStudentCount,
        importedMarksCount,
      } = parseUploadedExcelTemplateAndMarks(rawRows, records, file.name, firstSheetName);

      setCustomFormat(formatConfig);
      setExportMode('CUSTOM_UPLOADED');

      if (importedMarksCount > 0) {
        setRecords(updatedRecords);
        setFormatBannerNotice(
          `Format "${file.name}" applied (${importedMarksCount} marks imported for ${matchedStudentCount} students).`
        );
      } else {
        setFormatBannerNotice(
          `Format "${file.name}" (${formatConfig.headers.length} columns) saved.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid Excel file';
      setProgress((prev) => ({
        ...prev,
        errors: [`Excel Error: ${msg}`],
      }));
    }
  };

  const handleStopExtraction = () => {
    cancelExtractionRef.current = true;
  };

  const handleSwitchModule = (mod: SchoolModule) => {
    setActiveModule(mod);
    setCurrentPage(1);
    if (mod === 'INTERMEDIATE') {
      setExportMode('BSEB_12TH_SENTUP');
    } else {
      setExportMode('BSEB_10TH_SENTUP');
    }
  };

  const intermediateRecords = useMemo(
    () => records.filter((r) => r.examType === 'INTERMEDIATE (+2)'),
    [records]
  );

  const matricRecords = useMemo(
    () => records.filter((r) => r.examType === 'MATRIC (10th)'),
    [records]
  );

  const currentModuleRecords = useMemo(
    () => (activeModule === 'INTERMEDIATE' ? intermediateRecords : matricRecords),
    [activeModule, intermediateRecords, matricRecords]
  );

  const handleClearCurrentModule = async () => {
    const isInter = activeModule === 'INTERMEDIATE';
    const toRemove = records.filter((r) =>
      isInter ? r.examType === 'INTERMEDIATE (+2)' : r.examType === 'MATRIC (10th)'
    );
    const remaining = records.filter((r) =>
      isInter ? r.examType !== 'INTERMEDIATE (+2)' : r.examType !== 'MATRIC (10th)'
    );
    setRecordsState(remaining);
    setCurrentPage(1);
    setProgress((prev) => ({
      ...prev,
      extractedCount: 0,
      statusMessage: '',
      errors: [],
    }));
    if (auth.currentUser && toRemove.length > 0) {
      await clearAllUserStudentsFromFirestore(toRemove);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    setRecordsState((prev) =>
      prev
        .filter((r) => r.id !== id)
        .map((r, idx) => ({
          ...r,
          serialNo: idx + 1,
        }))
    );
    if (auth.currentUser) {
      await deleteStudentFromFirestore(id);
    }
  };

  const handleUpdateRecord = (updated: AdmitCardRecord) => {
    setRecordsState((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (auth.currentUser) {
      upsertStudentInFirestore(updated, ownerAssignmentsRef.current).catch(console.error);
    }
  };

  const handleUpdateSingleRecordMark = (
    recordId: string,
    subjectName: string,
    markValue: string
  ) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== recordId) return r;
        return {
          ...r,
          subjectMarks: {
            ...(r.subjectMarks || {}),
            [subjectName]: markValue,
          },
        };
      })
    );
  };

  const handleUpdateModuleRecords = (updatedModuleRecords: AdmitCardRecord[]) => {
    setRecords((prev) => {
      const isInter = activeModule === 'INTERMEDIATE';
      const otherRecords = prev.filter((r) =>
        isInter ? r.examType !== 'INTERMEDIATE (+2)' : r.examType !== 'MATRIC (10th)'
      );
      return [...otherRecords, ...updatedModuleRecords];
    });
    if (auth.currentUser) {
      syncAllStudentsToFirestore(updatedModuleRecords, ownerAssignmentsRef.current).catch(console.error);
    }
  };

  const handleAddManualRecord = (newRecord: AdmitCardRecord) => {
    setRecordsState((prev) => [...prev, newRecord]);
    if (auth.currentUser) {
      upsertStudentInFirestore(newRecord, ownerAssignmentsRef.current).catch(console.error);
    }
  };

  const uniqueSchoolsInModule = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    currentModuleRecords.forEach((r) => {
      const code = (r.schoolCode || r.rollCode || 'UNKNOWN').trim();
      const name = (r.schoolName || 'UNKNOWN SCHOOL').trim();
      if (!map.has(code)) {
        map.set(code, { code, name, count: 0 });
      }
      map.get(code)!.count++;
    });
    return Array.from(map.values());
  }, [currentModuleRecords]);

  const resetFilters = () => {
    setFilters({
      searchQuery: '',
      examType: 'ALL',
      faculty: 'ALL',
      gender: 'ALL',
      studentCategory: 'ALL',
      casteCategory: 'ALL',
      sourceFile: 'ALL',
      schoolCode: 'ALL',
    });
    setCurrentPage(1);
  };

  const filteredRecords = useMemo(() => {
    const q = filters.searchQuery.trim().toLowerCase();
    return currentModuleRecords.filter((r) => {
      if (filters.faculty !== 'ALL' && r.faculty !== filters.faculty) return false;
      if (filters.gender !== 'ALL' && r.gender !== filters.gender) return false;
      if (
        filters.studentCategory !== 'ALL' &&
        r.studentCategory.toUpperCase() !== filters.studentCategory
      ) {
        return false;
      }
      if (
        filters.casteCategory !== 'ALL' &&
        r.casteCategory.toUpperCase() !== filters.casteCategory
      ) {
        return false;
      }
      if (filters.sourceFile !== 'ALL' && r.sourceFileName !== filters.sourceFile) {
        return false;
      }
      if (filters.schoolCode !== 'ALL') {
        const sc = (r.schoolCode || r.rollCode || '').trim();
        if (sc !== filters.schoolCode) return false;
      }
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.fatherName.toLowerCase().includes(q) ||
        r.motherName.toLowerCase().includes(q) ||
        r.bsebUniqueId.toLowerCase().includes(q) ||
        r.registrationNo.toLowerCase().includes(q) ||
        r.aadhaarNo.toLowerCase().includes(q) ||
        (r.schoolCode || '').toLowerCase().includes(q) ||
        (r.rollCode || '').toLowerCase().includes(q) ||
        r.schoolName.toLowerCase().includes(q) ||
        r.allSubjectsSummary.toLowerCase().includes(q)
      );
    });
  }, [currentModuleRecords, filters]);

  const stats = useMemo(() => computeSummaryStats(filteredRecords), [filteredRecords]);
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecords = useMemo(
    () => filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRecords, safePage]
  );

  // Top-level screen routing with smooth GPU-composited AnimatePresence transitions
  const screenKey = !authReady
    ? 'auth-loading'
    : !firebaseUser || !activePortalRole
    ? 'login-screen'
    : activePortalRole === 'TEACHER'
    ? 'teacher-module'
    : 'admin-module';

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {screenKey === 'auth-loading' ? (
          <motion.div
            key="auth-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen w-full bg-gradient-to-b from-[#0B3B91] via-[#3B82F6]/35 to-[#FFFFFF] flex items-center justify-center p-6"
          >
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/80 bg-white/90 backdrop-blur-xl px-8 py-7 shadow-xl shadow-blue-950/10">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              <span className="text-sm font-semibold text-slate-800">Loading Portal...</span>
            </div>
          </motion.div>
        ) : screenKey === 'login-screen' ? (
          <motion.div
            key="login-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <LoginPage
              loadingRole={loginLoadingRole}
              errorMessage={authError}
              onClearError={() => setAuthError('')}
              onLogin={handleRoleLogin}
            />
          </motion.div>
        ) : screenKey === 'teacher-module' && firebaseUser ? (
          <motion.div
            key="teacher-module"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen bg-gradient-to-b from-[#EFF6FF] via-[#F8FAFF] to-[#FFFFFF] text-[#191C20]"
          >
            <main className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 py-4 sm:py-6">
              <TeacherMarksPortal
                user={firebaseUser}
                assignments={myTeacherAssignments}
                assignedStudents={teacherAssignedStudents}
                isLoadingAssignments={teacherAssignmentsLoading}
                isLoadingStudents={teacherStudentsLoading}
                studentsError={teacherStudentsError}
                onSignOut={handleFirebaseSignOut}
              />
            </main>
          </motion.div>
        ) : (
          <motion.div
            key="admin-module"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="h-screen overflow-hidden flex flex-col bg-[#F4F6FB] text-[#191C20] print:h-auto print:overflow-visible print:block print:bg-white"
          >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        id="admit-card-file-input"
        type="file"
        multiple
        accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.xlsx,.xls,.csv"
        aria-label="Upload Admit Card PDF or Image files"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
          }
        }}
        className="sr-only"
      />

      <input
        ref={excelFormatInputRef}
        id="header-excel-format-input"
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        aria-label="Upload Your Custom Excel Format or Marks Sheet"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleCustomExcelUploaded(e.target.files[0]);
            e.target.value = '';
          }
        }}
        className="sr-only"
      />

      {/* Flutter Material 3 Slide-Out Navigation Drawer with smooth spring animation */}
      <AnimatePresence>
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex print:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
            onClick={() => setIsDrawerOpen(false)}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Navigation Drawer"
            className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl rounded-r-3xl overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="bg-indigo-600 p-5 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 font-bold text-sm">
                    BSEB
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">BSEB Report Studio</div>
                    <div className="text-[11px] text-indigo-100 font-mono">
                      {records.length} Total Students
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close Drawer"
                  className="rounded-full p-1.5 text-indigo-100 hover:bg-white/15"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Firebase Cloud Status inside Drawer Header */}
              <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between gap-2">
                {firebaseUser ? (
                  <div className="truncate text-xs text-indigo-50">
                    <div className="font-semibold truncate">{firebaseUser.displayName || firebaseUser.email}</div>
                    <div className="text-[10px] text-emerald-200 flex items-center gap-1">
                      <Cloud className="h-3 w-3" /> Firebase Synced
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-indigo-100">Firebase Cloud Backup</span>
                )}
                {firebaseUser ? (
                  <button
                    type="button"
                    onClick={handleFirebaseSignOut}
                    className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/25 shrink-0"
                  >
                    <LogOut className="h-3 w-3" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFirebaseSignIn}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 shrink-0"
                  >
                    <Cloud className="h-3 w-3" />
                    <span>Sign In</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dedicated Module Switcher in Drawer */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/70">
              <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                School Module
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    handleSwitchModule('INTERMEDIATE');
                    setIsDrawerOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                    activeModule === 'INTERMEDIATE'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <GraduationCap className="h-4 w-4" />
                    <div className="text-left">
                      <div className="leading-tight">Intermediate (+2)</div>
                      <div className={`text-[10px] font-normal ${activeModule === 'INTERMEDIATE' ? 'text-indigo-100' : 'text-slate-400'}`}>
                        Science · Arts · Commerce
                      </div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                    activeModule === 'INTERMEDIATE' ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {intermediateRecords.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSwitchModule('MATRIC');
                    setIsDrawerOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                    activeModule === 'MATRIC'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <School className="h-4 w-4" />
                    <div className="text-left">
                      <div className="leading-tight">Matric (10th)</div>
                      <div className={`text-[10px] font-normal ${activeModule === 'MATRIC' ? 'text-emerald-100' : 'text-slate-400'}`}>
                        Secondary Sent-Up Panji
                      </div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                    activeModule === 'MATRIC' ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {matricRecords.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Drawer Navigation Destinations */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Screens ({activeModule === 'INTERMEDIATE' ? 'Intermediate' : 'Matric'})
              </div>
              <button
                type="button"
                onClick={() => handleSwitchTab('dashboard')}
                className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-100 text-indigo-950'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-indigo-600" />
                  <span>Universal School Dashboard</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('register')}
                className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === 'register'
                    ? 'bg-indigo-100 text-indigo-950'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <FileText className="h-4 w-4" />
                  <span>Admit Cards</span>
                </span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-[10px] text-indigo-900 font-bold">
                  {currentModuleRecords.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('marks')}
                className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === 'marks'
                    ? 'bg-indigo-100 text-indigo-950'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <BookOpen className="h-4 w-4" />
                  <span>{activeModule === 'INTERMEDIATE' ? '12th Marks Panji' : '10th Marks Panji'}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('attendance')}
                className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === 'attendance'
                    ? 'bg-indigo-100 text-indigo-950'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <ClipboardCheck className="h-4 w-4 text-indigo-600" />
                  <span>Attendance Sheet (Print)</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('teachers')}
                className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === 'teachers'
                    ? 'bg-indigo-100 text-indigo-950'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-indigo-600" />
                  <span>Assign Teachers</span>
                </span>
                {ownerAssignments.length > 0 && (
                  <span className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-[10px] text-indigo-900 font-bold">
                    {ownerAssignments.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('analytics')}
                className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-indigo-100 text-indigo-950'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <BarChart3 className="h-4 w-4" />
                  <span>Analytics</span>
                </span>
              </button>

              <div className="pt-3 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Actions &amp; Exports
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Upload className="h-4 w-4 text-indigo-600" />
                <span>Upload Admit Card PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  excelFormatInputRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Upload Custom Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setIsManualModalOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-4 w-4 text-indigo-600" />
                <span>Add Student ({activeModule === 'INTERMEDIATE' ? '12th' : '10th'})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setIsSettingsOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-semibold bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              >
                <Settings className="h-4 w-4 text-indigo-600" />
                <span>Marks Posting Settings & Tagging</span>
              </button>

              <PWAInstallButton variant="drawer" onAction={() => setIsDrawerOpen(false)} />

              {currentModuleRecords.length > 0 && (
                <>
                  {activeModule === 'INTERMEDIATE' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportToExcel(currentModuleRecords, {
                            mode: 'BSEB_12TH_SENTUP',
                            customFormat,
                            filenamePrefix: '12th_Sent-Up_Exam.-2026_Annual-2027',
                            annualYear: '2027',
                            sentUpYear: '2026',
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        <span>Download 12th Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportSentUp12thPdf(
                            currentModuleRecords,
                            '12th_Sent-Up_Exam.-2026_Annual-2027',
                            { annualYear: '2027', sentUpYear: '2026' }
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-indigo-900" />
                        <span>Download 12th PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportAbsent12thPdf(
                            currentModuleRecords,
                            '12th_Absent_Students_Exam-2026_Annual-2027',
                            { annualYear: '2027', sentUpYear: '2026' }
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-rose-700" />
                        <span>Download Absent PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportAbsent12thExcel(currentModuleRecords, {
                            annualYear: '2027',
                            sentUpYear: '2026',
                            filenamePrefix: '12th_Absent_Students_Exam-2026_Annual-2027',
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-teal-700" />
                        <span>Download Absent Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportVocational12thPdf(
                            currentModuleRecords,
                            '12th_Vocational_Exam-2026_Annual-2027',
                            { annualYear: '2027', sentUpYear: '2026' }
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-purple-700" />
                        <span>Download Vocational PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportVocational12thExcel(currentModuleRecords, {
                            annualYear: '2027',
                            sentUpYear: '2026',
                            filenamePrefix: '12th_Vocational_Exam-2026_Annual-2027',
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-indigo-700" />
                        <span>Download Vocational Excel</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportToExcel(currentModuleRecords, {
                            mode: 'BSEB_10TH_SENTUP',
                            customFormat,
                            filenamePrefix: '10th_Sent-Up_Exam.-2026_BSEB',
                            annualYear: '2027',
                            sentUpYear: '2026',
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        <span>Download 10th Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportSentUp10thPdf(
                            currentModuleRecords,
                            '10th_Sent-Up_Exam.-2026_BSEB',
                            { annualYear: '2027', sentUpYear: '2026' }
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-indigo-900" />
                        <span>Download 10th PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportAbsent10thPdf(
                            currentModuleRecords,
                            '10th_Absent_Students_Exam-2026_Annual-2027',
                            { annualYear: '2027', sentUpYear: '2026' }
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-rose-700" />
                        <span>Download Matric Absent PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportAbsent10thExcel(currentModuleRecords, {
                            annualYear: '2027',
                            sentUpYear: '2026',
                            filenamePrefix: '10th_Absent_Students_Exam-2026_Annual-2027',
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-teal-700" />
                        <span>Download Matric Absent Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportVisuallyImpairedSentUp10thPdf(
                            currentModuleRecords,
                            '10th_Visually_Impaired_Sent-up_Exam-2026_Annual-2027',
                            { annualYear: '2027', sentUpYear: '2026' }
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-purple-700" />
                        <span>Download Blind Sent-Up PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportVisuallyImpairedSentUp10thExcel(currentModuleRecords, {
                            annualYear: '2027',
                            sentUpYear: '2026',
                            filenamePrefix: '10th_Visually_Impaired_Sent-up_Exam-2026_Annual-2027',
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-indigo-700" />
                        <span>Download Blind Sent-Up Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportVisuallyImpairedAbsent10thPdf(
                            currentModuleRecords,
                            '10th_Visually_Impaired_Non_Sent-up_Exam-2026_Annual-2027',
                            { annualYear: '2027', sentUpYear: '2026' }
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-amber-700" />
                        <span>Download Blind Absent PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          exportVisuallyImpairedAbsent10thExcel(currentModuleRecords, {
                            annualYear: '2027',
                            sentUpYear: '2026',
                            filenamePrefix: '10th_Visually_Impaired_Non_Sent-up_Exam-2026_Annual-2027',
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-cyan-700" />
                        <span>Download Blind Absent Excel</span>
                      </button>
                    </>
                  )}
                </>
              )}
            </nav>
          </motion.aside>
        </div>
      )}
      </AnimatePresence>

      {/* Flutter Material 3 Top AppBar (Mobile-First & Desktop-Second) */}
      <header className="print:hidden shrink-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-indigo-100 bg-white px-3 sm:px-6 shadow-2xs">
        {/* Left: Hamburger Drawer Button + App Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open Navigation Drawer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-indigo-50 active:scale-95 transition-all shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {activeModule === 'INTERMEDIATE' ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-sm sm:text-base font-bold tracking-tight text-indigo-950 truncate">
                    Intermediate (+2) Module
                  </span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-800 shrink-0">
                    {intermediateRecords.length}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                  <School className="h-4 w-4" />
                </div>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-sm sm:text-base font-bold tracking-tight text-emerald-950 truncate">
                    Matric (10th) Module
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 shrink-0">
                    {matricRecords.length}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: PWA Install + Firebase Cloud Sync + Primary Actions (Strictly Admin Module) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PWAInstallButton variant="header" />
          {firebaseUser ? (
            <div
              title={`Firebase: ${firebaseUser.email || firebaseUser.displayName} (${cloudStatus === 'syncing' ? 'Syncing...' : 'Saved'})`}
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 sm:px-3 py-1.5 text-xs font-semibold text-emerald-900"
            >
              <Cloud className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">
                {cloudStatus === 'syncing' ? 'Syncing...' : 'Saved'}
              </span>
              <button
                type="button"
                onClick={handleFirebaseSignOut}
                title="Sign out of Firebase"
                className="ml-0.5 rounded-full p-0.5 text-emerald-700 hover:bg-emerald-200/60"
              >
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleFirebaseSignIn}
              title="Save data to Firebase Firestore"
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-indigo-200 bg-[#EEF1FA] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 whitespace-nowrap shrink-0"
            >
              <Cloud className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              <span className="hidden xs:inline sm:inline">Firebase</span>
            </button>
          )}

          {activeTab !== 'marks' && filteredRecords.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  exportToExcel(filteredRecords, {
                    mode: exportMode,
                    customFormat,
                    filenamePrefix:
                      activeModule === 'INTERMEDIATE'
                        ? '12th_Sent-Up_Exam.-2026_Annual-2027'
                        : '10th_Sent-Up_Exam.-2026_BSEB',
                    annualYear: '2027',
                    sentUpYear: '2026',
                  })
                }
                title="Download Excel Report"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-2xs whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeModule === 'INTERMEDIATE') {
                    exportSentUp12thPdf(
                      filteredRecords,
                      '12th_Sent-Up_Exam.-2026_Annual-2027',
                      { annualYear: '2027', sentUpYear: '2026' }
                    );
                  } else {
                    exportSentUp10thPdf(
                      filteredRecords,
                      '10th_Sent-Up_Exam.-2026_BSEB',
                      { annualYear: '2027', sentUpYear: '2026' }
                    );
                  }
                }}
                title="Download PDF Report"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1E1B4B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-950 shadow-2xs whitespace-nowrap shrink-0"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>PDF</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Practical & Random Marks Posting Settings"
            className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-indigo-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-50 shadow-2xs whitespace-nowrap shrink-0"
          >
            <Settings className="h-3.5 w-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={progress.isExtracting}
            title="Upload Admit Card PDF"
            className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-indigo-600 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 shadow-2xs disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Upload PDF</span>
            <span className="sm:hidden">Upload</span>
          </button>

          {currentModuleRecords.length > 0 && (
            <button
              type="button"
              onClick={handleClearCurrentModule}
              title={`Clear all ${activeModule === 'INTERMEDIATE' ? '12th Intermediate' : '10th Matric'} students`}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>



      {/* Main Scrollable Scaffold Body */}
      <div
        ref={mainScrollRef}
        className="flex-1 overflow-y-auto scroll-smooth print:overflow-visible print:flex-none"
      >
        <main id="top" className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-4 space-y-4 print:max-w-none print:p-0 print:space-y-0">
        {authError && (
          <div className="print:hidden flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError('')}
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active Extraction Progress Banner */}
        {(progress.isExtracting || progress.statusMessage || progress.errors.length > 0) && (
          <section className="print:hidden rounded-2xl border border-indigo-100 bg-white px-4 py-3 shadow-xs space-y-2">
            {(progress.isExtracting || progress.statusMessage) && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs font-medium text-slate-700">
                    <span>{progress.statusMessage}</span>
                    {progress.totalPagesInFile > 0 && progress.isExtracting && (
                      <span className="ml-2 font-mono tabular-nums text-indigo-600">
                        ({Math.round((progress.currentPage / progress.totalPagesInFile) * 100)}%)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Extracted: {progress.extractedCount}
                    </span>
                    {progress.isExtracting && (
                      <button
                        type="button"
                        onClick={handleStopExtraction}
                        className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap shrink-0"
                      >
                        <Square className="h-3 w-3 fill-current" />
                        <span>Stop</span>
                      </button>
                    )}
                  </div>
                </div>
                {progress.isExtracting && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-150"
                      style={{
                        width: `${Math.max(
                          5,
                          Math.round(
                            (progress.currentPage / Math.max(1, progress.totalPagesInFile)) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {progress.errors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Error:</span>
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {progress.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Admit Cards Tab: Action Bar & Multi-Filter Strip (Only when current module records exist) */}
        {activeTab === 'register' && currentModuleRecords.length > 0 && (
          <section className="rounded-2xl border border-indigo-100 bg-white p-3.5 sm:p-4 shadow-xs space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFilesSelected(e.dataTransfer.files);
                }
              }}
              className={`flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-dashed px-3.5 py-2.5 sm:px-4 sm:py-3 transition-colors ${
                isDragging
                  ? 'border-indigo-600 bg-indigo-50/70'
                  : 'border-indigo-200 bg-[#F8F9FE]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl bg-indigo-100 text-indigo-700 shrink-0">
                  <Upload className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    <span className="sm:hidden">
                      {activeModule === 'INTERMEDIATE' ? '12th Module' : '10th Module'}
                    </span>
                    <span className="hidden sm:inline">
                      {activeModule === 'INTERMEDIATE'
                        ? 'Intermediate (+2) Admit Cards & Excel'
                        : 'Matric (10th) Admit Cards & Excel'}
                    </span>
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-500">
                    {currentModuleRecords.length} {activeModule === 'INTERMEDIATE' ? '12th' : '10th'} students loaded
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={progress.isExtracting}
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs disabled:opacity-50 whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('marks')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-50 whitespace-nowrap"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{activeModule === 'INTERMEDIATE' ? '12th Panji' : '10th Panji'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Add Student</span>
                </button>
              </div>
            </div>

            {formatBannerNotice && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-900">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{formatBannerNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormatBannerNotice('')}
                  className="text-xs text-emerald-700 underline hover:text-emerald-900 shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Mobile Filter Chips Row (Module-Specific) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {activeModule === 'INTERMEDIATE'
                ? [
                    { label: 'All 12th', faculty: 'ALL' as const },
                    { label: 'Science', faculty: 'SCIENCE' as const },
                    { label: 'Arts', faculty: 'ARTS' as const },
                    { label: 'Commerce', faculty: 'COMMERCE' as const },
                    { label: 'Vocational', faculty: 'VOCATIONAL' as const },
                  ].map((chip) => {
                    const isActive = filters.faculty === chip.faculty;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            faculty: chip.faculty,
                          }));
                          setCurrentPage(1);
                        }}
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'border border-indigo-200 bg-white text-slate-700 hover:bg-indigo-50'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })
                : [
                    { label: 'All 10th', studentCategory: 'ALL' as const },
                    { label: 'Regular', studentCategory: 'REGULAR' as const },
                    { label: 'Ex / Compartmental', studentCategory: 'EX' as const },
                  ].map((chip) => {
                    const isActive = filters.studentCategory === chip.studentCategory;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            studentCategory: chip.studentCategory,
                          }));
                          setCurrentPage(1);
                        }}
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                          isActive
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'border border-emerald-200 bg-white text-slate-700 hover:bg-emerald-50'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
            </div>

            {/* Multi-School Detection & Filter Chips Bar */}
            {uniqueSchoolsInModule.length > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-indigo-50/80 border border-indigo-100 rounded-xl text-xs text-indigo-950">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="font-bold flex items-center gap-1 shrink-0 text-indigo-900">
                    <School className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{uniqueSchoolsInModule.length} Schools Detected:</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1 overflow-x-auto scrollbar-none">
                    <button
                      type="button"
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, schoolCode: 'ALL' }));
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all shrink-0 ${
                        filters.schoolCode === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white border border-indigo-200 text-indigo-900 hover:bg-indigo-100'
                      }`}
                    >
                      All ({currentModuleRecords.length})
                    </button>
                    {uniqueSchoolsInModule.map((sch) => (
                      <button
                        key={sch.code}
                        type="button"
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, schoolCode: sch.code }));
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all shrink-0 ${
                          filters.schoolCode === sch.code
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white border border-indigo-200 text-indigo-900 hover:bg-indigo-100'
                        }`}
                        title={`School ${sch.code}: ${sch.name}`}
                      >
                        Code {sch.code} ({sch.count})
                      </button>
                    ))}
                  </div>
                </div>
                {filters.schoolCode !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, schoolCode: 'ALL' }));
                      setCurrentPage(1);
                    }}
                    className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline shrink-0"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            )}

            {/* Search Input & Mobile Filter Toggle */}
            <div className="flex items-center gap-2 pt-1 border-t border-indigo-50">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  aria-label="Search students"
                  placeholder="Search Name, School Code, BSEB ID, Reg No..."
                  value={filters.searchQuery}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, searchQuery: e.target.value }));
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowMobileFilters((prev) => !prev)}
                title="Toggle more filters"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  showMobileFilters ||
                  filters.gender !== 'ALL' ||
                  filters.studentCategory !== 'ALL' ||
                  filters.casteCategory !== 'ALL' ||
                  filters.schoolCode !== 'ALL'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              <button
                type="button"
                onClick={resetFilters}
                aria-label="Reset filters"
                title="Reset filters"
                className="rounded-xl border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            {/* Expandable Advanced Filters (School Code, Gender, Category, Caste, Exam) */}
            {(showMobileFilters || window.innerWidth >= 1024) && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-indigo-50">
                {uniqueSchoolsInModule.length > 1 && (
                  <select
                    aria-label="Filter by School Code"
                    value={filters.schoolCode}
                    onChange={(e) => {
                      setFilters((prev) => ({ ...prev, schoolCode: e.target.value }));
                      setCurrentPage(1);
                    }}
                    className="rounded-xl border border-indigo-300 bg-indigo-50/70 px-2.5 py-1.5 text-xs font-bold text-indigo-900"
                  >
                    <option value="ALL">🏫 All Schools ({uniqueSchoolsInModule.length})</option>
                    {uniqueSchoolsInModule.map((s) => (
                      <option key={s.code} value={s.code}>
                        School Code {s.code} ({s.count})
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label="Filter by Exam Type"
                  value={filters.examType}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      examType: e.target.value as 'ALL' | ExamType,
                    }));
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="ALL">All Exams</option>
                  <option value="MATRIC (10th)">MATRIC (10th)</option>
                  <option value="INTERMEDIATE (+2)">INTERMEDIATE (+2)</option>
                </select>

                <select
                  aria-label="Filter by Gender"
                  value={filters.gender}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      gender: e.target.value as 'ALL' | 'MALE' | 'FEMALE',
                    }));
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="ALL">All Genders</option>
                  <option value="MALE">MALE</option>
                  <option value="FEMALE">FEMALE</option>
                </select>

                <select
                  aria-label="Filter by Student Category"
                  value={filters.studentCategory}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, studentCategory: e.target.value }));
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="ALL">All Categories</option>
                  <option value="REGULAR">REGULAR</option>
                  <option value="EX">EX</option>
                  <option value="COMPARTMENTAL">COMPARTMENTAL</option>
                </select>

                <select
                  aria-label="Filter by Caste"
                  value={filters.casteCategory}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, casteCategory: e.target.value }));
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="ALL">All Castes</option>
                  <option value="GENERAL">GENERAL</option>
                  <option value="BC">BC</option>
                  <option value="EBC">EBC</option>
                  <option value="SC">SC</option>
                  <option value="ST">ST</option>
                </select>
              </div>
            )}
          </section>
        )}

        {/* Main Screen Body with smooth GPU page-switch transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${activeModule}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4 print:transform-none print:opacity-100"
          >
        {activeTab === 'dashboard' ? (
          <SchoolUniversalDashboard
            records={records}
            activeModule={activeModule}
            onSwitchModule={handleSwitchModule}
            onNavigateToMarks={() => handleSwitchTab('marks')}
            onSelectStudentForEdit={setSelectedRecord}
          />
        ) : activeTab === 'attendance' ? (
          <AttendanceSheetView
            records={records}
            activeModule={activeModule}
            onTriggerAdmitCardUpload={() => fileInputRef.current?.click()}
          />
        ) : activeTab === 'teachers' ? (
          <TeacherManagementView
            records={records}
            assignments={ownerAssignments}
            firebaseUser={firebaseUser}
            onSignIn={handleFirebaseSignIn}
            onSaveAssignment={handleSaveTeacherAssignment}
            onDeleteAssignment={handleDeleteTeacherAssignment}
            onResyncAllAccess={handleResyncAllTeacherAccess}
          />
        ) : activeTab === 'analytics' ? (
          <SummaryAnalyticsView stats={stats} />
        ) : activeTab === 'marks' ? (
          <SubjectMarksAndFormatView
            records={filteredRecords}
            customFormat={customFormat}
            exportMode={exportMode}
            activeModule={activeModule}
            onSwitchModule={handleSwitchModule}
            onUpdateRecords={handleUpdateModuleRecords}
            onUpdateSingleRecordMark={handleUpdateSingleRecordMark}
            onSetCustomFormat={setCustomFormat}
            onSetExportMode={setExportMode}
            onDeleteRecord={handleDeleteRecord}
            onTriggerAdmitCardUpload={() => fileInputRef.current?.click()}
          />
        ) : currentModuleRecords.length === 0 ? (
          /* Single Unified Mobile-First Hero Card for the Active Module */
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFilesSelected(e.dataTransfer.files);
              }
            }}
            className={`rounded-3xl border p-6 sm:p-10 text-center shadow-xs transition-colors ${
              isDragging
                ? 'border-indigo-600 bg-indigo-50/70'
                : 'border-indigo-100 bg-white'
            }`}
          >
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
                activeModule === 'INTERMEDIATE'
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {activeModule === 'INTERMEDIATE' ? (
                <GraduationCap className="h-7 w-7" />
              ) : (
                <School className="h-7 w-7" />
              )}
            </div>
            <h2 className="mt-3.5 text-base sm:text-lg font-bold text-slate-900">
              {activeModule === 'INTERMEDIATE'
                ? 'Intermediate (+2) Module'
                : 'Matric (10th) Module'}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              {activeModule === 'INTERMEDIATE'
                ? 'Upload 12th Sent-Up Admit Card PDF or enter marks directly in Praptank Panji (Science, Arts, Commerce).'
                : 'Upload 10th Sent-Up Admit Card PDF or enter marks directly in Praptank Panji.'}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={progress.isExtracting}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-md transition-all active:scale-98 ${
                  activeModule === 'INTERMEDIATE'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                <Upload className="h-4 w-4" />
                <span>Upload Admit Card PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('marks')}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3 text-xs sm:text-sm font-semibold transition-all ${
                  activeModule === 'INTERMEDIATE'
                    ? 'border-indigo-200 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>
                  Open {activeModule === 'INTERMEDIATE' ? '12th' : '10th'} Marks Panji
                </span>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsManualModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add {activeModule === 'INTERMEDIATE' ? '12th' : '10th'} Student Manually</span>
              </button>
              <button
                type="button"
                onClick={() => excelFormatInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                <span>Upload Custom Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Menu className="h-3.5 w-3.5 text-slate-500" />
                <span>Open Menu / Change Module</span>
              </button>
            </div>
          </section>
        ) : (
          /* Student Records View: Mobile Cards (Mobile-First) & Desktop Data Table (Desktop-Second) */
          <section className="space-y-4">
            {/* 1. Mobile Cards View (Visible on mobile/tablets < 768px) */}
            <div className="space-y-3 block md:hidden">
              {paginatedRecords.map((rec) => {
                const marksSummary = calculateStudentMarksSummary(rec);
                return (
                  <div
                    key={rec.id}
                    className="rounded-2xl border border-indigo-100 bg-white p-3.5 shadow-xs space-y-2.5 transition-all"
                  >
                    {/* Top Row: Photo + Name + Serial No */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {rec.photoDataUrl ? (
                          <img
                            src={rec.photoDataUrl}
                            alt={`${rec.studentName} photo`}
                            referrerPolicy="no-referrer"
                            className="h-12 w-10 rounded-xl border border-slate-200 object-cover shrink-0"
                          />
                        ) : (
                          <div className="flex h-12 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 font-bold text-xs shrink-0">
                            {rec.studentName ? rec.studentName.charAt(0) : '#'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">
                            {rec.studentName || 'Unnamed Student'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            Reg: {rec.registrationNo || '—'}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            F: {rec.fatherName || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                          #{rec.serialNo}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {rec.examType === 'MATRIC (10th)' ? '10th' : rec.faculty}
                        </span>
                      </div>
                    </div>

                    {/* Chips Strip */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 text-slate-700 font-medium">
                        {rec.gender || '—'}
                      </span>
                      <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 text-slate-700">
                        {rec.studentCategory || 'REGULAR'}
                      </span>
                      {rec.rollCode && (
                        <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 font-mono text-slate-600">
                          Code: {rec.rollCode}
                        </span>
                      )}
                      {rec.bsebUniqueId && (
                        <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 font-mono text-slate-600">
                          ID: {rec.bsebUniqueId}
                        </span>
                      )}
                    </div>

                    {/* Marks Summary Pill */}
                    {marksSummary.enteredCount > 0 ? (
                      <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 border border-emerald-100">
                        <span className="font-medium">Sent-Up Marks:</span>
                        <span className="font-mono font-bold">
                          {marksSummary.totalMarks}/500 ({marksSummary.percentage})
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic px-1">
                        No marks entered yet in Panji
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <button
                        type="button"
                        onClick={() => setActiveTab('marks')}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-200 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Marks Panji</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(rec)}
                        className="inline-flex items-center justify-center gap-1 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(rec.id)}
                        aria-label="Delete Student"
                        className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Desktop High-Density Data Grid (Visible on md+ >= 768px) */}
            <div className="hidden md:block rounded-2xl border border-indigo-100 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-indigo-100 bg-[#F3F5FC] text-[11px] font-semibold text-indigo-950">
                    <tr>
                      <th className="px-3 py-3 text-center w-10">#</th>
                      <th className="px-3 py-3 w-24">Photo / Sign</th>
                      <th className="px-3 py-3">BSEB Unique ID &amp; Reg. No</th>
                      <th className="px-3 py-3">Student &amp; Parents Name</th>
                      <th className="px-3 py-3">Stream &amp; School Code</th>
                      <th className="px-3 py-3">DOB / Gender</th>
                      <th className="px-3 py-3">Category / Caste / Aadhaar</th>
                      <th className="px-3 py-3">Subjects &amp; Marks</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedRecords.map((rec) => {
                      const marksSummary = calculateStudentMarksSummary(rec);
                      const formatSubjWithMark = (s: string) => {
                        if (!s) return '';
                        const m = getSubjectMark(rec, s);
                        return m !== '' ? `${s} [${m}]` : s;
                      };

                      return (
                        <tr key={rec.id} className="hover:bg-indigo-50/40 transition-colors">
                          <td className="px-3 py-2.5 text-center font-mono tabular-nums font-semibold text-slate-600">
                            {rec.serialNo}
                          </td>

                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {rec.photoDataUrl ? (
                                <img
                                  src={rec.photoDataUrl}
                                  alt={`${rec.studentName} photo`}
                                  referrerPolicy="no-referrer"
                                  className="h-11 w-9 rounded border border-slate-200 bg-white object-contain shrink-0"
                                />
                              ) : (
                                <div className="flex h-11 w-9 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400 shrink-0">
                                  <UserIcon className="h-4 w-4" />
                                </div>
                              )}
                              {rec.signatureDataUrl && (
                                <img
                                  src={rec.signatureDataUrl}
                                  alt={`${rec.studentName} signature`}
                                  referrerPolicy="no-referrer"
                                  className="h-6 w-12 rounded border border-slate-200 bg-white object-contain shrink-0 hidden xl:block"
                                />
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-mono font-semibold tabular-nums text-slate-900">
                              {rec.bsebUniqueId || '—'}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                              Reg: {rec.registrationNo || '—'}
                            </div>
                          </td>

                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-900">{rec.studentName || '—'}</div>
                            <div className="mt-0.5 text-[11px] text-slate-600">
                              F: {rec.fatherName || '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              M: {rec.motherName || '—'}
                            </div>
                          </td>

                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900 whitespace-nowrap">
                              {rec.examType === 'MATRIC (10th)' ? 'MATRIC (10th)' : `INTER (${rec.faculty})`}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600 whitespace-nowrap">
                              Code: {rec.rollCode || rec.schoolCode || '—'}
                            </div>
                          </td>

                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{rec.gender}</div>
                            {rec.dob && rec.dob !== 'N/A' && (
                              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600">
                                {rec.dob}
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="text-slate-800">
                              <span className="font-medium">{rec.studentCategory}</span>
                              {rec.casteCategory && rec.casteCategory !== 'N/A' && (
                                <>
                                  <span className="mx-1 text-slate-400">·</span>
                                  <span>{rec.casteCategory}</span>
                                </>
                              )}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600">
                              {rec.aadhaarNo || '—'}
                            </div>
                          </td>

                          <td className="px-3 py-2.5 max-w-[280px]">
                            <div className="text-[11px] font-medium text-slate-800 leading-snug">
                              {[
                                formatSubjWithMark(rec.langSubject1),
                                formatSubjWithMark(rec.langSubject2),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-600 leading-snug">
                              {[
                                formatSubjWithMark(rec.compulsorySubject1),
                                formatSubjWithMark(rec.compulsorySubject2),
                                formatSubjWithMark(rec.compulsorySubject3),
                                formatSubjWithMark(rec.compulsorySubject4),
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            </div>
                            {marksSummary.enteredCount > 0 && (
                              <div className="mt-1 font-mono text-[11px] font-semibold tabular-nums text-emerald-700">
                                Total: {marksSummary.totalMarks}/500 ({marksSummary.percentage})
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedRecord(rec)}
                                aria-label={`Edit ${rec.studentName || `Student ${rec.serialNo}`}`}
                                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-50 whitespace-nowrap shrink-0"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(rec.id)}
                                aria-label={`Delete ${rec.studentName || `Student ${rec.serialNo}`}`}
                                className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls (Mobile & Desktop) */}
            {filteredRecords.length > pageSize && (
              <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-xs text-slate-600 shadow-xs">
                <div className="font-mono tabular-nums">
                  {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredRecords.length)} of{' '}
                  {filteredRecords.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Prev</span>
                  </button>
                  <span className="font-mono tabular-nums px-2">
                    {safePage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
          </motion.div>
        </AnimatePresence>
        </main>
      </div>

      {/* Flutter Material 3 BottomNavigationBar with Smooth Animated Active Pill */}
      <nav
        aria-label="Bottom Navigation Bar"
        className="print:hidden shrink-0 z-30 flex h-16 items-center justify-around border-t border-indigo-100 bg-white px-2 sm:px-4 shadow-sm select-none"
      >
        {(
          [
            { id: 'dashboard' as const, label: 'Dashboard', Icon: Building2 },
            { id: 'register' as const, label: `Admit (${currentModuleRecords.length})`, Icon: FileText },
            {
              id: 'marks' as const,
              label: `Marks (${activeModule === 'INTERMEDIATE' ? '12th' : '10th'})`,
              Icon: BookOpen,
            },
            { id: 'attendance' as const, label: 'Attendance', Icon: ClipboardCheck },
            { id: 'teachers' as const, label: 'Teachers', Icon: Users },
          ] as const
        ).map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleSwitchTab(id)}
              className="group relative flex flex-col items-center justify-center gap-0.5 focus:outline-none min-w-0 cursor-pointer"
            >
              <span
                className={`relative flex h-8 w-12 sm:w-16 items-center justify-center rounded-full transition-colors ${
                  isActive ? 'text-indigo-950' : 'text-slate-500 group-hover:bg-slate-100'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="adminBottomNavActive"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-indigo-100"
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" />
              </span>
              <span
                className={`text-[10px] sm:text-[11px] truncate transition-colors ${
                  isActive ? 'font-bold text-indigo-950' : 'font-medium text-slate-600'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      {selectedRecord && (
        <StudentDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onSave={handleUpdateRecord}
        />
      )}

      {isManualModalOpen && (
        <ManualEntryModal
          nextSerialNo={currentModuleRecords.length + 1}
          initialExamType={activeModule === 'INTERMEDIATE' ? 'INTERMEDIATE (+2)' : 'MATRIC (10th)'}
          onClose={() => setIsManualModalOpen(false)}
          onAdd={handleAddManualRecord}
        />
      )}

      <SettingsModal
        records={records}
        activeModule={activeModule}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSwitchTab={handleSwitchTab}
        onUpdateRecords={(updated) => {
          setRecordsState(updated);
          if (auth.currentUser && activePortalRole === 'ADMIN') {
            syncAllStudentsToFirestore(updated, ownerAssignmentsRef.current).catch(console.error);
          }
        }}
      />
          </motion.div>
        )}
      </AnimatePresence>
      <OfflineIndicator />
    </MotionConfig>
  );
}
