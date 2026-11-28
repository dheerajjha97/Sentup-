import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  AdmitCardRecord,
  ClerkAssignment,
  ExamType,
  InterSentUpMarks,
  MatricSentUpMarks,
  TeacherAssignment,
} from './types/admitCard';
import { getEffectiveInterSentUp, getEffectiveMatricSentUp } from './utils/marksAndFormat';
import {
  computeAssignedClerkEmailsForStudent,
  computeAssignedTeacherEmailsForStudent,
  normalizeSchoolCode,
} from './utils/teacherSubjectMatcher';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

const clampStr = (val: unknown, maxLen: number, fallback = ''): string => {
  const s = typeof val === 'string' ? val.trim() : val != null ? String(val).trim() : fallback;
  return s.slice(0, maxLen);
};

export function sanitizeDocId(rawId: string): string {
  const cleaned = (rawId || 'stu_1').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || 'stu_1';
}

export function sanitizeInterSentUpForFirestore(record: AdmitCardRecord): InterSentUpMarks {
  const eff = getEffectiveInterSentUp(record);
  return {
    lang1Subject: clampStr(eff.lang1Subject, 64, '306-Hindi'),
    lang1Marks: clampStr(eff.lang1Marks, 16, ''),
    lang2Subject: clampStr(eff.lang2Subject, 64, '305-English'),
    lang2Marks: clampStr(eff.lang2Marks, 16, ''),
    elective1Subject: clampStr(eff.elective1Subject, 64, '117-PHYSICS'),
    elective1Theory: clampStr(eff.elective1Theory, 16, ''),
    elective1Practical: clampStr(eff.elective1Practical, 16, '0'),
    elective2Subject: clampStr(eff.elective2Subject, 64, '118-CHEMISTRY'),
    elective2Theory: clampStr(eff.elective2Theory, 16, ''),
    elective2Practical: clampStr(eff.elective2Practical, 16, '0'),
    elective3Subject: clampStr(eff.elective3Subject, 64, '119-BIOLOGY'),
    elective3Theory: clampStr(eff.elective3Theory, 16, ''),
    elective3Practical: clampStr(eff.elective3Practical, 16, '0'),
    additionalSubject: clampStr(eff.additionalSubject, 64, '---'),
    additionalTheory: clampStr(eff.additionalTheory, 16, '---'),
    additionalPractical: clampStr(eff.additionalPractical, 16, '---'),
    vocationalSubject: clampStr(eff.vocationalSubject, 64, '---'),
    vocationalTheory: clampStr(eff.vocationalTheory, 16, '---'),
    vocationalPractical: clampStr(eff.vocationalPractical, 16, '---'),
    resultStatus: clampStr(eff.resultStatus, 32, 'SENT-UP'),
  };
}

export function sanitizeMatricSentUpForFirestore(record: AdmitCardRecord): MatricSentUpMarks {
  const eff = getEffectiveMatricSentUp(record);
  return {
    milTheory: clampStr(eff.milTheory, 16, ''),
    silTheory: clampStr(eff.silTheory, 16, ''),
    matTheory: clampStr(eff.matTheory, 16, ''),
    sciTheory: clampStr(eff.sciTheory, 16, ''),
    sscTheory: clampStr(eff.sscTheory, 16, ''),
    engTheory: clampStr(eff.engTheory, 16, ''),
    optTheory: clampStr(eff.optTheory, 16, '---'),
    vocTheory: clampStr(eff.vocTheory, 16, '---'),
    sciPractical: clampStr(eff.sciPractical, 16, ''),
    sscLitAct: clampStr(eff.sscLitAct, 16, ''),
    sscPrWork: clampStr(eff.sscPrWork, 16, ''),
    optPractical: clampStr(eff.optPractical, 16, '---'),
    vocPractical: clampStr(eff.vocPractical, 16, '---'),
  };
}

export function buildStudentFirestorePayload(
  record: AdmitCardRecord,
  ownerId: string,
  assignedTeacherEmails?: string[],
  assignedClerkEmails?: string[]
) {
  const validExamType =
    record.examType === 'MATRIC (10th)' ? 'MATRIC (10th)' : 'INTERMEDIATE (+2)';
  const validFaculty = ['SECONDARY', 'ARTS', 'SCIENCE', 'COMMERCE', 'VOCATIONAL'].includes(
    record.faculty
  )
    ? record.faculty
    : 'SCIENCE';
  const validGender = ['MALE', 'FEMALE', 'OTHER'].includes(record.gender)
    ? record.gender
    : 'FEMALE';

  const sanitizedEmails = Array.from(
    new Set(
      (assignedTeacherEmails ?? record.assignedTeacherEmails ?? [])
        .map((e) => clampStr(e, 160).toLowerCase())
        .filter((e) => e.length >= 3)
    )
  ).slice(0, 30);

  const sanitizedClerkEmails = Array.from(
    new Set(
      (assignedClerkEmails ?? record.assignedClerkEmails ?? [])
        .map((e) => clampStr(e, 160).toLowerCase())
        .filter((e) => e.length >= 3)
    )
  ).slice(0, 30);

  return {
    ownerId: clampStr(ownerId, 128),
    serialNo: Math.max(0, Math.min(100000, Number(record.serialNo) || 1)),
    examType: validExamType,
    examYear: clampStr(record.examYear || '2026', 16),
    faculty: validFaculty,
    bsebUniqueId: clampStr(record.bsebUniqueId, 64),
    schoolCode: clampStr(record.schoolCode, 32),
    schoolName: clampStr(record.schoolName, 200),
    studentName: clampStr(record.studentName, 120),
    motherName: clampStr(record.motherName, 120),
    fatherName: clampStr(record.fatherName, 120),
    dob: clampStr(record.dob, 32),
    gender: validGender,
    maritalStatus: clampStr(record.maritalStatus || 'UNMARRIED', 32),
    aadhaarNo: clampStr(record.aadhaarNo, 32),
    studentCategory: clampStr((record.studentCategory || 'REGULAR').replace(/[\u0900-\u097F]/g, '').trim(), 32),
    casteCategory: clampStr(record.casteCategory || 'GENERAL', 32),
    differentlyAbled: clampStr(record.differentlyAbled || 'NO', 32),
    registrationNo: clampStr((record.registrationNo || '').replace(/\s*\/\s*20\d{2}.*/, '').replace(/[\u0900-\u097F]/g, '').trim(), 64),
    rollCode: clampStr((record.rollCode || '').replace(/[\u0900-\u097F]/g, '').trim(), 32),
    rollNumber: clampStr(record.rollNumber, 32),
    examCenter: clampStr(record.examCenter, 200),
    langSubject1: clampStr(record.langSubject1, 80),
    langSubject2: clampStr(record.langSubject2, 80),
    compulsorySubject1: clampStr(record.compulsorySubject1, 80),
    compulsorySubject2: clampStr(record.compulsorySubject2, 80),
    compulsorySubject3: clampStr(record.compulsorySubject3, 80),
    compulsorySubject4: clampStr(record.compulsorySubject4, 80),
    additionalSubject: clampStr(record.additionalSubject, 80),
    allSubjectsSummary: clampStr(record.allSubjectsSummary, 500),
    sourceFileName: clampStr(record.sourceFileName || 'Manual Entry', 200),
    sourcePageNumber: Math.max(0, Math.min(10000, Number(record.sourcePageNumber) || 1)),
    extractionMethod: clampStr(record.extractionMethod || 'PDF_TEXT_LAYER', 32),
    interSentUp: sanitizeInterSentUpForFirestore(record),
    matricSentUp: sanitizeMatricSentUpForFirestore(record),
    assignedTeacherEmails: sanitizedEmails,
    assignedClerkEmails: sanitizedClerkEmails,
  };
}

export async function upsertStudentInFirestore(
  record: AdmitCardRecord,
  activeAssignments?: TeacherAssignment[],
  activeClerkAssignments?: ClerkAssignment[]
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const docId = sanitizeDocId(`${currentUser.uid}_${record.id}`);
  const path = `students/${docId}`;
  const docRef = doc(db, 'students', docId);
  const computedEmails = activeAssignments
    ? computeAssignedTeacherEmailsForStudent(record, activeAssignments)
    : record.assignedTeacherEmails;
  const computedClerkEmails = activeClerkAssignments
    ? computeAssignedClerkEmailsForStudent(record, activeClerkAssignments)
    : record.assignedClerkEmails;
  const basePayload = buildStudentFirestorePayload(
    record,
    currentUser.uid,
    computedEmails,
    computedClerkEmails
  );

  let exists = false;
  let existingCreatedAt: Timestamp | null = null;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
    if (exists) {
      const rawCreatedAt = snap.data()?.createdAt;
      existingCreatedAt = rawCreatedAt instanceof Timestamp ? rawCreatedAt : null;
    }
  } catch (error) {
    console.warn('Pre-write document check failed, defaulting to creation mode:', error);
    exists = false;
  }

  if (exists) {
    try {
      await setDoc(docRef, {
        ...basePayload,
        createdAt: existingCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(docRef, {
        ...basePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function syncAllStudentsToFirestore(
  records: AdmitCardRecord[],
  activeAssignments?: TeacherAssignment[],
  activeClerkAssignments?: ClerkAssignment[]
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || records.length === 0) return;

  for (const rec of records) {
    await upsertStudentInFirestore(rec, activeAssignments, activeClerkAssignments);
  }
}

export async function deleteStudentFromFirestore(recordId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const docId = sanitizeDocId(`${currentUser.uid}_${recordId}`);
  const path = `students/${docId}`;
  try {
    await deleteDoc(doc(db, 'students', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearAllUserStudentsFromFirestore(records: AdmitCardRecord[]): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || records.length === 0) return;

  const batch = writeBatch(db);
  for (const r of records) {
    const docId = sanitizeDocId(`${currentUser.uid}_${r.id}`);
    batch.delete(doc(db, 'students', docId));
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'students');
  }
}

function mapFirestoreDocToAdmitCardRecord(
  docId: string,
  data: Record<string, unknown>,
  stripPrefix?: string
): AdmitCardRecord {
  const rawId = stripPrefix && docId.startsWith(stripPrefix) ? docId.slice(stripPrefix.length) : docId;
  return {
    id: rawId,
    firestoreDocId: docId,
    ownerId: String(data.ownerId || ''),
    assignedTeacherEmails: Array.isArray(data.assignedTeacherEmails)
      ? data.assignedTeacherEmails.map((e) => String(e).toLowerCase())
      : [],
    assignedClerkEmails: Array.isArray(data.assignedClerkEmails)
      ? data.assignedClerkEmails.map((e) => String(e).toLowerCase())
      : [],
    serialNo: Number(data.serialNo) || 1,
    examType: data.examType === 'MATRIC (10th)' ? 'MATRIC (10th)' : 'INTERMEDIATE (+2)',
    examYear: String(data.examYear || '2026'),
    faculty: (data.faculty || 'SCIENCE') as AdmitCardRecord['faculty'],
    bsebUniqueId: String(data.bsebUniqueId || ''),
    schoolCode: String(data.schoolCode || ''),
    schoolName: String(data.schoolName || ''),
    studentName: String(data.studentName || ''),
    motherName: String(data.motherName || ''),
    fatherName: String(data.fatherName || ''),
    dob: String(data.dob || ''),
    gender: (data.gender || 'FEMALE') as AdmitCardRecord['gender'],
    maritalStatus: String(data.maritalStatus || 'UNMARRIED'),
    aadhaarNo: String(data.aadhaarNo || ''),
    studentCategory:
      String(data.studentCategory || 'REGULAR')
        .replace(/[\u0900-\u097F]/g, '')
        .trim() || 'REGULAR',
    casteCategory: String(data.casteCategory || 'GENERAL'),
    differentlyAbled: String(data.differentlyAbled || 'NO'),
    registrationNo: String(data.registrationNo || '')
      .replace(/\s*\/\s*20\d{2}.*/, '')
      .replace(/[\u0900-\u097F]/g, '')
      .trim(),
    rollCode: String(data.rollCode || '')
      .replace(/[\u0900-\u097F]/g, '')
      .trim(),
    rollNumber: String(data.rollNumber || ''),
    examCenter: String(data.examCenter || ''),
    langSubject1: String(data.langSubject1 || ''),
    langSubject2: String(data.langSubject2 || ''),
    compulsorySubject1: String(data.compulsorySubject1 || ''),
    compulsorySubject2: String(data.compulsorySubject2 || ''),
    compulsorySubject3: String(data.compulsorySubject3 || ''),
    compulsorySubject4: String(data.compulsorySubject4 || ''),
    additionalSubject: String(data.additionalSubject || ''),
    allSubjectsSummary: String(data.allSubjectsSummary || ''),
    sourceFileName: String(data.sourceFileName || 'Firestore Cloud'),
    sourcePageNumber: Number(data.sourcePageNumber) || 1,
    extractionMethod: (data.extractionMethod ||
      'PDF_TEXT_LAYER') as AdmitCardRecord['extractionMethod'],
    interSentUp: data.interSentUp as InterSentUpMarks | undefined,
    matricSentUp: data.matricSentUp as MatricSentUpMarks | undefined,
  };
}

export function subscribeToUserStudents(
  user: User,
  onData: (records: AdmitCardRecord[]) => void
): () => void {
  const q = query(collection(db, 'students'), where('ownerId', '==', user.uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const prefix = `${user.uid}_`;
      const loaded: AdmitCardRecord[] = snapshot.docs.map((d) =>
        mapFirestoreDocToAdmitCardRecord(d.id, d.data() as Record<string, unknown>, prefix)
      );
      loaded.sort((a, b) => a.serialNo - b.serialNo);
      onData(loaded.map((r, i) => ({ ...r, serialNo: i + 1 })));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    }
  );
}

/**
 * Maps a Firestore document snapshot into a TeacherAssignment.
 */
function mapDocToTeacherAssignment(docId: string, data: Record<string, unknown>): TeacherAssignment {
  const rawClasses = Array.isArray(data.assignedClasses) ? data.assignedClasses : [];
  const validClasses: ExamType[] = rawClasses
    .map((c) => String(c))
    .filter((c): c is ExamType => c === 'MATRIC (10th)' || c === 'INTERMEDIATE (+2)');

  const rawSubjects = Array.isArray(data.assignedSubjects)
    ? data.assignedSubjects.map((s) => String(s).trim()).filter(Boolean)
    : [];

  return {
    id: docId,
    ownerId: String(data.ownerId || ''),
    ownerEmail: String(data.ownerEmail || ''),
    teacherName: String(data.teacherName || ''),
    teacherEmail: String(data.teacherEmail || '').toLowerCase(),
    schoolCode: String(data.schoolCode || ''),
    schoolName: String(data.schoolName || ''),
    assignedClasses: validClasses,
    assignedSubjects: rawSubjects,
    active: Boolean(data.active),
  };
}

/**
 * Admin: Creates or updates a School-Code -> Teacher Email -> Multi-Class & Multi-Subject assignment.
 */
export async function saveTeacherAssignmentInFirestore(
  input: Omit<TeacherAssignment, 'ownerId' | 'ownerEmail'>
): Promise<TeacherAssignment> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in with Google first to assign teachers.');
  }

  const docId = sanitizeDocId(input.id || `ta_${currentUser.uid.slice(0, 8)}_${Date.now()}`);
  const path = `teacherAssignments/${docId}`;
  const docRef = doc(db, 'teacherAssignments', docId);

  const cleanClasses = Array.from(
    new Set(
      input.assignedClasses.filter(
        (c): c is ExamType => c === 'MATRIC (10th)' || c === 'INTERMEDIATE (+2)'
      )
    )
  ).slice(0, 2);

  const cleanSubjects = Array.from(
    new Set(input.assignedSubjects.map((s) => clampStr(s, 120)).filter(Boolean))
  ).slice(0, 25);

  if (cleanClasses.length === 0) {
    throw new Error('Select at least one class (10th or 12th).');
  }
  if (cleanSubjects.length === 0) {
    throw new Error('Select at least one subject.');
  }

  const cleanSchoolCode = normalizeSchoolCode(input.schoolCode) || clampStr(input.schoolCode.trim(), 32);

  const payload = {
    ownerId: clampStr(currentUser.uid, 128),
    ownerEmail: clampStr((currentUser.email || 'admin@school.local').toLowerCase(), 160),
    teacherName: clampStr(input.teacherName || 'Subject Teacher', 120),
    teacherEmail: clampStr(input.teacherEmail.trim().toLowerCase(), 160),
    schoolCode: clampStr(cleanSchoolCode, 32),
    schoolName: clampStr(input.schoolName.trim(), 200),
    assignedClasses: cleanClasses,
    assignedSubjects: cleanSubjects,
    active: Boolean(input.active),
  };

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      const { ownerId: _omitOwner, ...updateFields } = payload;
      await updateDoc(docRef, {
        ...updateFields,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  return { id: docId, ...payload };
}

/**
 * Admin: Deletes a TeacherAssignment document from Firestore.
 */
export async function deleteTeacherAssignmentFromFirestore(assignmentId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const docId = sanitizeDocId(assignmentId);
  const path = `teacherAssignments/${docId}`;
  try {
    await deleteDoc(doc(db, 'teacherAssignments', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Admin: Synchronizes `assignedTeacherEmails` and `assignedClerkEmails` on all owner student documents in Firestore
 * whenever teacher or clerk assignments are created, edited, paused, or removed.
 * Queries existing docs first so `createdAt` is preserved and legacy docs are cleanly normalized.
 */
export async function syncTeacherAccessToOwnerStudents(
  records: AdmitCardRecord[],
  assignments: TeacherAssignment[],
  clerkAssignments?: ClerkAssignment[]
): Promise<number> {
  const currentUser = auth.currentUser;
  if (!currentUser || records.length === 0) return 0;

  // Fetch existing owner docs once to know exact doc presence and original valid Timestamp createdAt
  const existingMetaById = new Map<
    string,
    {
      createdAt: Timestamp | null;
      existingEmails: string[];
      existingClerkEmails: string[];
      rawKeys: string[];
    }
  >();
  try {
    const q = query(collection(db, 'students'), where('ownerId', '==', currentUser.uid));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data();
      const rawCreatedAt = data.createdAt;
      existingMetaById.set(d.id, {
        createdAt: rawCreatedAt instanceof Timestamp ? rawCreatedAt : null,
        existingEmails: Array.isArray(data.assignedTeacherEmails)
          ? data.assignedTeacherEmails.map((e: unknown) => String(e).toLowerCase())
          : [],
        existingClerkEmails: Array.isArray(data.assignedClerkEmails)
          ? data.assignedClerkEmails.map((e: unknown) => String(e).toLowerCase())
          : [],
        rawKeys: Object.keys(data),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'students');
  }

  interface PendingSyncWrite {
    docId: string;
    payload: Record<string, unknown>;
  }

  const pendingWrites: PendingSyncWrite[] = [];
  const seenDocIds = new Set<string>();

  for (const rec of records) {
    const rawDocId = rec.firestoreDocId || sanitizeDocId(`${currentUser.uid}_${rec.id}`);
    const docId = /^[a-zA-Z0-9_-]{1,256}$/.test(rawDocId) ? rawDocId : sanitizeDocId(rawDocId);
    if (seenDocIds.has(docId)) continue;
    seenDocIds.add(docId);

    const existingMeta = existingMetaById.get(docId);
    const targetEmails = computeAssignedTeacherEmailsForStudent(rec, assignments);
    const targetClerkEmails = clerkAssignments
      ? computeAssignedClerkEmailsForStudent(rec, clerkAssignments)
      : existingMeta?.existingClerkEmails || rec.assignedClerkEmails || [];

    const currentEmailsSorted = (existingMeta?.existingEmails || []).slice().sort().join(',');
    const nextEmailsSorted = targetEmails.slice().sort().join(',');
    const currentClerkSorted = (existingMeta?.existingClerkEmails || []).slice().sort().join(',');
    const nextClerkSorted = targetClerkEmails.slice().sort().join(',');

    if (
      existingMeta &&
      currentEmailsSorted === nextEmailsSorted &&
      currentClerkSorted === nextClerkSorted
    ) {
      continue;
    }

    const basePayload = buildStudentFirestorePayload(
      rec,
      currentUser.uid,
      targetEmails,
      targetClerkEmails
    );
    pendingWrites.push({
      docId,
      payload: {
        ...basePayload,
        createdAt: existingMeta?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    });
  }

  let updatedCount = 0;
  const CHUNK_SIZE = 300;

  for (let i = 0; i < pendingWrites.length; i += CHUNK_SIZE) {
    const slice = pendingWrites.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of slice) {
      batch.set(doc(db, 'students', item.docId), item.payload);
    }

    try {
      await batch.commit();
      updatedCount += slice.length;
    } catch {
      // Fallback to individual writes so one malformed legacy doc never blocks syncing all other students
      let firstErr: unknown = null;
      let firstFailPath = 'students';
      for (const item of slice) {
        try {
          await setDoc(doc(db, 'students', item.docId), item.payload);
          updatedCount += 1;
        } catch (docErr) {
          if (!firstErr) {
            firstErr = docErr;
            firstFailPath = `students/${item.docId}`;
          }
          console.error(`Failed syncing student doc ${item.docId}:`, docErr);
        }
      }
      if (firstErr && updatedCount === 0) {
        handleFirestoreError(firstErr, OperationType.UPDATE, firstFailPath);
      }
    }
  }

  return updatedCount;
}

/**
 * Admin: Real-time subscription to all teacher assignments created by the logged-in school admin.
 */
export function subscribeToOwnerTeacherAssignments(
  user: User,
  onData: (assignments: TeacherAssignment[]) => void
): () => void {
  const q = query(collection(db, 'teacherAssignments'), where('ownerId', '==', user.uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        mapDocToTeacherAssignment(d.id, d.data() as Record<string, unknown>)
      );
      list.sort((a, b) => a.schoolCode.localeCompare(b.schoolCode) || a.teacherName.localeCompare(b.teacherName));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'teacherAssignments');
    }
  );
}

/**
 * Teacher: Real-time subscription to assignments matching the logged-in user's Google Email.
 */
export function subscribeToMyTeacherAssignments(
  user: User,
  onData: (assignments: TeacherAssignment[]) => void,
  onError?: (message: string) => void
): () => void {
  const email = (user.email || '').trim().toLowerCase();
  if (!email) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, 'teacherAssignments'), where('teacherEmail', '==', email));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapDocToTeacherAssignment(d.id, d.data() as Record<string, unknown>))
        .filter((a) => a.active);
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      handleFirestoreError(error, OperationType.LIST, 'teacherAssignments');
    }
  );
}

/**
 * Teacher: Real-time subscription to ONLY the students where this teacher's email is authorized.
 */
export function subscribeToTeacherAssignedStudents(
  user: User,
  onData: (records: AdmitCardRecord[]) => void,
  onError?: (message: string) => void
): () => void {
  const email = (user.email || '').trim().toLowerCase();
  if (!email) {
    onData([]);
    return () => {};
  }

  const q = query(
    collection(db, 'students'),
    where('assignedTeacherEmails', 'array-contains', email)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const loaded = snapshot.docs.map((d) =>
        mapFirestoreDocToAdmitCardRecord(d.id, d.data() as Record<string, unknown>)
      );
      loaded.sort((a, b) => a.serialNo - b.serialNo);
      onData(loaded);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      handleFirestoreError(error, OperationType.LIST, 'students');
    }
  );
}

/**
 * Teacher (Tier-2): Updates ONLY the student's marks (`interSentUp`, `matricSentUp`, `updatedAt`)
 * strictly complying with Firestore Security Rules Tier-2 allowlist.
 */
export async function updateStudentMarksAsTeacher(record: AdmitCardRecord): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in with Google to save marks.');
  }
  const docId = record.firestoreDocId;
  if (!docId) {
    throw new Error('Student cloud document reference is missing.');
  }

  const path = `students/${docId}`;
  const docRef = doc(db, 'students', docId);
  try {
    await updateDoc(docRef, {
      interSentUp: sanitizeInterSentUpForFirestore(record),
      matricSentUp: sanitizeMatricSentUpForFirestore(record),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Maps a Firestore document snapshot into a ClerkAssignment.
 */
function mapDocToClerkAssignment(docId: string, data: Record<string, unknown>): ClerkAssignment {
  const rawClasses = Array.isArray(data.assignedClasses) ? data.assignedClasses : [];
  const validClasses: ExamType[] = rawClasses
    .map((c) => String(c))
    .filter((c): c is ExamType => c === 'MATRIC (10th)' || c === 'INTERMEDIATE (+2)');

  return {
    id: docId,
    ownerId: String(data.ownerId || ''),
    ownerEmail: String(data.ownerEmail || ''),
    clerkName: String(data.clerkName || ''),
    clerkEmail: String(data.clerkEmail || '').toLowerCase(),
    schoolCode: String(data.schoolCode || ''),
    schoolName: String(data.schoolName || ''),
    assignedClasses: validClasses,
    active: Boolean(data.active),
  };
}

/**
 * Admin: Creates or updates a Read-Only Print Clerk assignment for a School Code & Classes.
 */
export async function saveClerkAssignmentInFirestore(
  input: Omit<ClerkAssignment, 'ownerId' | 'ownerEmail'>
): Promise<ClerkAssignment> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in with Google first to assign clerks.');
  }

  const docId = sanitizeDocId(input.id || `ca_${currentUser.uid.slice(0, 8)}_${Date.now()}`);
  const path = `clerkAssignments/${docId}`;
  const docRef = doc(db, 'clerkAssignments', docId);

  const cleanClasses = Array.from(
    new Set(
      input.assignedClasses.filter(
        (c): c is ExamType => c === 'MATRIC (10th)' || c === 'INTERMEDIATE (+2)'
      )
    )
  ).slice(0, 2);

  if (cleanClasses.length === 0) {
    throw new Error('Select at least one class (10th or 12th).');
  }

  const cleanSchoolCode = normalizeSchoolCode(input.schoolCode) || clampStr(input.schoolCode.trim(), 32);

  const payload = {
    ownerId: clampStr(currentUser.uid, 128),
    ownerEmail: clampStr((currentUser.email || 'admin@school.local').toLowerCase(), 160),
    clerkName: clampStr(input.clerkName || 'Office Clerk', 120),
    clerkEmail: clampStr(input.clerkEmail.trim().toLowerCase(), 160),
    schoolCode: clampStr(cleanSchoolCode, 32),
    schoolName: clampStr(input.schoolName.trim(), 200),
    assignedClasses: cleanClasses,
    active: Boolean(input.active),
  };

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      const { ownerId: _omitOwner, ...updateFields } = payload;
      await updateDoc(docRef, {
        ...updateFields,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  return { id: docId, ...payload };
}

/**
 * Admin: Deletes a ClerkAssignment document from Firestore.
 */
export async function deleteClerkAssignmentFromFirestore(assignmentId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const docId = sanitizeDocId(assignmentId);
  const path = `clerkAssignments/${docId}`;
  try {
    await deleteDoc(doc(db, 'clerkAssignments', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Admin: Real-time subscription to all Print Clerk assignments created by the logged-in school admin.
 */
export function subscribeToOwnerClerkAssignments(
  user: User,
  onData: (assignments: ClerkAssignment[]) => void
): () => void {
  const q = query(collection(db, 'clerkAssignments'), where('ownerId', '==', user.uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        mapDocToClerkAssignment(d.id, d.data() as Record<string, unknown>)
      );
      list.sort(
        (a, b) => a.schoolCode.localeCompare(b.schoolCode) || a.clerkName.localeCompare(b.clerkName)
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clerkAssignments');
    }
  );
}

/**
 * Clerk (Read-Only): Real-time subscription to active Print Clerk assignments matching logged-in email.
 */
export function subscribeToMyClerkAssignments(
  user: User,
  onData: (assignments: ClerkAssignment[]) => void,
  onError?: (message: string) => void
): () => void {
  const email = (user.email || '').trim().toLowerCase();
  if (!email) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, 'clerkAssignments'), where('clerkEmail', '==', email));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapDocToClerkAssignment(d.id, d.data() as Record<string, unknown>))
        .filter((a) => a.active);
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      handleFirestoreError(error, OperationType.LIST, 'clerkAssignments');
    }
  );
}

/**
 * Clerk (Read-Only): Real-time subscription to ONLY the students where this clerk's email is authorized.
 */
export function subscribeToClerkAssignedStudents(
  user: User,
  onData: (records: AdmitCardRecord[]) => void,
  onError?: (message: string) => void
): () => void {
  const email = (user.email || '').trim().toLowerCase();
  if (!email) {
    onData([]);
    return () => {};
  }

  const q = query(
    collection(db, 'students'),
    where('assignedClerkEmails', 'array-contains', email)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const loaded = snapshot.docs.map((d) =>
        mapFirestoreDocToAdmitCardRecord(d.id, d.data() as Record<string, unknown>)
      );
      loaded.sort((a, b) => a.serialNo - b.serialNo);
      onData(loaded);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      handleFirestoreError(error, OperationType.LIST, 'students');
    }
  );
}

export const SUPER_ADMIN_EMAIL = 'nehajha.gyanora@gmail.com';

export function isSuperAdminUserEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export interface AdminFeatureFlags {
  randomMarksGenerator: boolean;
  excelDownload: boolean;
  pdfDownload: boolean;
  completeZipDownload: boolean;
  letterPadAndLifafa: boolean;
  attendanceSheet: boolean;
  teacherClerkManagement: boolean;
  bulkDeleteData: boolean;
}

export const DEFAULT_ADMIN_FEATURE_FLAGS: AdminFeatureFlags = {
  randomMarksGenerator: true,
  excelDownload: true,
  pdfDownload: true,
  completeZipDownload: true,
  letterPadAndLifafa: true,
  attendanceSheet: true,
  teacherClerkManagement: true,
  bulkDeleteData: true,
};

export interface AdminFeatureOverrideRecord extends AdminFeatureFlags {
  id: string;
  adminEmail: string;
  note: string;
  updatedAt?: string;
}

export interface AdminAccountRecord {
  uid: string;
  email: string;
  displayName: string;
  createdAt?: string;
  lastLoginAt?: string;
  lastLoginMs?: number;
}

export function emailToOverrideDocId(rawEmail: string): string {
  const normalized = rawEmail.trim().toLowerCase().slice(0, 120);
  let hex = '';
  for (let i = 0; i < normalized.length; i++) {
    hex += normalized.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return `ov_${hex}`.slice(0, 250);
}

function parseFeatureFlagsData(data?: Record<string, unknown> | null): AdminFeatureFlags {
  if (!data) return { ...DEFAULT_ADMIN_FEATURE_FLAGS };
  return {
    randomMarksGenerator:
      typeof data.randomMarksGenerator === 'boolean' ? data.randomMarksGenerator : true,
    excelDownload: typeof data.excelDownload === 'boolean' ? data.excelDownload : true,
    pdfDownload: typeof data.pdfDownload === 'boolean' ? data.pdfDownload : true,
    completeZipDownload:
      typeof data.completeZipDownload === 'boolean' ? data.completeZipDownload : true,
    letterPadAndLifafa:
      typeof data.letterPadAndLifafa === 'boolean' ? data.letterPadAndLifafa : true,
    attendanceSheet: typeof data.attendanceSheet === 'boolean' ? data.attendanceSheet : true,
    teacherClerkManagement:
      typeof data.teacherClerkManagement === 'boolean' ? data.teacherClerkManagement : true,
    bulkDeleteData: typeof data.bulkDeleteData === 'boolean' ? data.bulkDeleteData : true,
  };
}

function formatFirestoreTimestamp(ts: unknown): string | undefined {
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return undefined;
}

export function subscribeToGlobalFeatureFlags(
  onData: (flags: AdminFeatureFlags, updatedAt?: string) => void,
  onError?: (message: string) => void
): () => void {
  const docRef = doc(db, 'appFeatureConfig', 'global');
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        onData({ ...DEFAULT_ADMIN_FEATURE_FLAGS }, undefined);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      onData(parseFeatureFlagsData(data), formatFirestoreTimestamp(data.updatedAt));
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.GET, 'appFeatureConfig/global');
      }
    }
  );
}

export async function saveGlobalFeatureFlags(flags: AdminFeatureFlags): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !isSuperAdminUserEmail(currentUser.email)) {
    throw new Error('Unauthorized: Only Super Admin can update feature controls.');
  }

  const path = 'appFeatureConfig/global';
  const docRef = doc(db, 'appFeatureConfig', 'global');
  const payload = {
    randomMarksGenerator: Boolean(flags.randomMarksGenerator),
    excelDownload: Boolean(flags.excelDownload),
    pdfDownload: Boolean(flags.pdfDownload),
    completeZipDownload: Boolean(flags.completeZipDownload),
    letterPadAndLifafa: Boolean(flags.letterPadAndLifafa),
    attendanceSheet: Boolean(flags.attendanceSheet),
    teacherClerkManagement: Boolean(flags.teacherClerkManagement),
    bulkDeleteData: Boolean(flags.bulkDeleteData),
    updatedByUid: clampStr(currentUser.uid, 128),
    updatedAt: serverTimestamp(),
  };

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      await updateDoc(docRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(docRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export function subscribeToMyAdminFeatureOverride(
  user: User,
  onData: (override: AdminFeatureOverrideRecord | null) => void
): () => void {
  const email = (user.email || '').trim().toLowerCase();
  if (!email) {
    onData(null);
    return () => {};
  }
  const q = query(collection(db, 'adminFeatureOverrides'), where('adminEmail', '==', email));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(null);
        return;
      }
      const d = snapshot.docs[0];
      const data = d.data() as Record<string, unknown>;
      onData({
        id: d.id,
        adminEmail: String(data.adminEmail || email).toLowerCase(),
        note: String(data.note || ''),
        ...parseFeatureFlagsData(data),
        updatedAt: formatFirestoreTimestamp(data.updatedAt),
      });
    },
    (error) => {
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'adminFeatureOverrides');
      }
    }
  );
}

export function subscribeToAllAdminFeatureOverrides(
  onData: (overrides: AdminFeatureOverrideRecord[]) => void,
  onError?: (message: string) => void
): () => void {
  return onSnapshot(
    collection(db, 'adminFeatureOverrides'),
    (snapshot) => {
      const list: AdminFeatureOverrideRecord[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          adminEmail: String(data.adminEmail || '').toLowerCase(),
          note: String(data.note || ''),
          ...parseFeatureFlagsData(data),
          updatedAt: formatFirestoreTimestamp(data.updatedAt),
        };
      });
      list.sort((a, b) => a.adminEmail.localeCompare(b.adminEmail));
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'adminFeatureOverrides');
      }
    }
  );
}

export async function saveAdminFeatureOverride(
  rawAdminEmail: string,
  flags: AdminFeatureFlags,
  note = ''
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !isSuperAdminUserEmail(currentUser.email)) {
    throw new Error('Unauthorized: Only Super Admin can manage per-admin controls.');
  }

  const cleanEmail = clampStr(rawAdminEmail, 160).toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid Admin Gmail address.');
  }

  const docId = emailToOverrideDocId(cleanEmail);
  const path = `adminFeatureOverrides/${docId}`;
  const docRef = doc(db, 'adminFeatureOverrides', docId);

  const mutableFields = {
    note: clampStr(note, 200),
    randomMarksGenerator: Boolean(flags.randomMarksGenerator),
    excelDownload: Boolean(flags.excelDownload),
    pdfDownload: Boolean(flags.pdfDownload),
    completeZipDownload: Boolean(flags.completeZipDownload),
    letterPadAndLifafa: Boolean(flags.letterPadAndLifafa),
    attendanceSheet: Boolean(flags.attendanceSheet),
    teacherClerkManagement: Boolean(flags.teacherClerkManagement),
    bulkDeleteData: Boolean(flags.bulkDeleteData),
    updatedAt: serverTimestamp(),
  };

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      await updateDoc(docRef, mutableFields);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(docRef, {
        adminEmail: cleanEmail,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function deleteAdminFeatureOverride(overrideDocId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !isSuperAdminUserEmail(currentUser.email)) {
    throw new Error('Unauthorized: Only Super Admin can delete per-admin overrides.');
  }
  const cleanId = sanitizeDocId(overrideDocId);
  const path = `adminFeatureOverrides/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'adminFeatureOverrides', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function registerAdminAccountLogin(user: User): Promise<void> {
  const cleanEmail = clampStr(user.email || '', 160).toLowerCase();
  if (!cleanEmail || !user.uid) return;
  const docId = sanitizeDocId(user.uid);
  const path = `adminAccounts/${docId}`;
  const docRef = doc(db, 'adminAccounts', docId);
  const displayName = clampStr(user.displayName || cleanEmail.split('@')[0] || 'School Admin', 120);

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      await updateDoc(docRef, {
        email: cleanEmail,
        displayName,
        lastLoginAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('Admin login timestamp update skipped:', error);
    }
  } else {
    try {
      await setDoc(docRef, {
        uid: clampStr(user.uid, 128),
        email: cleanEmail,
        displayName,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export function subscribeToAllAdminAccounts(
  onData: (accounts: AdminAccountRecord[]) => void,
  onError?: (message: string) => void
): () => void {
  return onSnapshot(
    collection(db, 'adminAccounts'),
    (snapshot) => {
      const list: AdminAccountRecord[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const rawTs = data.lastLoginAt instanceof Timestamp ? data.lastLoginAt.toMillis() : 0;
        return {
          uid: String(data.uid || d.id),
          email: String(data.email || '').toLowerCase(),
          displayName: String(data.displayName || ''),
          createdAt: formatFirestoreTimestamp(data.createdAt),
          lastLoginAt: formatFirestoreTimestamp(data.lastLoginAt),
          lastLoginMs: rawTs,
        };
      });
      list.sort((a, b) => (b.lastLoginMs || 0) - (a.lastLoginMs || 0));
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'adminAccounts');
      }
    }
  );
}

export async function deleteAdminAccountRecord(accountUid: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !isSuperAdminUserEmail(currentUser.email)) {
    throw new Error('Unauthorized: Only Super Admin can remove admin login records.');
  }
  const cleanId = sanitizeDocId(accountUid);
  const path = `adminAccounts/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'adminAccounts', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function setStaffAssignmentActiveAsSuperAdmin(
  role: 'TEACHER' | 'CLERK',
  assignmentId: string,
  active: boolean
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !isSuperAdminUserEmail(currentUser.email)) {
    throw new Error('Unauthorized: Only Super Admin can update staff assignment status.');
  }
  const colName = role === 'TEACHER' ? 'teacherAssignments' : 'clerkAssignments';
  const cleanId = sanitizeDocId(assignmentId);
  const path = `${colName}/${cleanId}`;
  try {
    await updateDoc(doc(db, colName, cleanId), {
      active: Boolean(active),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface SchoolFeaturePolicyRecord extends AdminFeatureFlags {
  id: string;
  schoolCode: string;
  schoolName: string;
  note: string;
  updatedAt?: string;
}

export interface SchoolRegistryEntry {
  id: string;
  schoolCode: string;
  schoolName: string;
  adminUid: string;
  adminEmail: string;
  adminName: string;
  studentCount: number;
  teacherCount: number;
  clerkCount: number;
  classes: ExamType[];
  updatedAt?: string;
}

export function normalizePolicySchoolCode(rawCode: string): string {
  const normalized = normalizeSchoolCode(rawCode || '');
  const clean = (normalized || (rawCode || '').trim())
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
  return clean;
}

export async function upsertAdminSchoolRegistryEntries(
  user: User,
  records: AdmitCardRecord[],
  teacherAssignments: TeacherAssignment[],
  clerkAssignments: ClerkAssignment[]
): Promise<void> {
  const cleanEmail = clampStr(user.email || '', 160).toLowerCase();
  if (!user.uid || !cleanEmail) return;

  const adminName = clampStr(user.displayName || cleanEmail.split('@')[0] || 'School Admin', 120);

  const byCode = new Map<
    string,
    {
      schoolName: string;
      studentCount: number;
      teacherEmails: Set<string>;
      clerkEmails: Set<string>;
      classes: Set<ExamType>;
    }
  >();

  const ensureBucket = (rawCode: string, rawName?: string) => {
    const code = normalizePolicySchoolCode(rawCode);
    if (!code) return null;
    let bucket = byCode.get(code);
    if (!bucket) {
      bucket = {
        schoolName: clampStr(rawName || '', 200),
        studentCount: 0,
        teacherEmails: new Set<string>(),
        clerkEmails: new Set<string>(),
        classes: new Set<ExamType>(),
      };
      byCode.set(code, bucket);
    } else if (!bucket.schoolName && rawName) {
      bucket.schoolName = clampStr(rawName, 200);
    }
    return bucket;
  };

  for (const r of records) {
    const bucket = ensureBucket(r.schoolCode, r.schoolName);
    if (!bucket) continue;
    bucket.studentCount += 1;
    if (r.examType === 'MATRIC (10th)' || r.examType === 'INTERMEDIATE (+2)') {
      bucket.classes.add(r.examType);
    }
  }

  for (const t of teacherAssignments) {
    const bucket = ensureBucket(t.schoolCode, t.schoolName);
    if (!bucket) continue;
    if (t.active && t.teacherEmail) {
      bucket.teacherEmails.add(t.teacherEmail.trim().toLowerCase());
    }
    for (const c of t.assignedClasses || []) {
      if (c === 'MATRIC (10th)' || c === 'INTERMEDIATE (+2)') {
        bucket.classes.add(c);
      }
    }
  }

  for (const c of clerkAssignments) {
    const bucket = ensureBucket(c.schoolCode, c.schoolName);
    if (!bucket) continue;
    if (c.active && c.clerkEmail) {
      bucket.clerkEmails.add(c.clerkEmail.trim().toLowerCase());
    }
    for (const cls of c.assignedClasses || []) {
      if (cls === 'MATRIC (10th)' || cls === 'INTERMEDIATE (+2)') {
        bucket.classes.add(cls);
      }
    }
  }

  for (const [code, bucket] of byCode.entries()) {
    const docId = sanitizeDocId(`${user.uid}_${code}`);
    const docRef = doc(db, 'schoolRegistry', docId);
    const classesList = Array.from(bucket.classes).slice(0, 2);

    let exists = false;
    try {
      const snap = await getDoc(docRef);
      exists = snap.exists();
    } catch {
      exists = false;
    }

    const mutableFields = {
      schoolName: clampStr(bucket.schoolName, 200),
      adminEmail: cleanEmail,
      adminName,
      studentCount: Math.max(0, Math.min(100000, bucket.studentCount)),
      teacherCount: Math.max(0, Math.min(1000, bucket.teacherEmails.size)),
      clerkCount: Math.max(0, Math.min(1000, bucket.clerkEmails.size)),
      classes: classesList,
      updatedAt: serverTimestamp(),
    };

    try {
      if (exists) {
        await updateDoc(docRef, mutableFields);
      } else {
        await setDoc(docRef, {
          schoolCode: code,
          adminUid: clampStr(user.uid, 128),
          ...mutableFields,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.warn(`School registry sync skipped for ${code}:`, error);
    }
  }
}

export function subscribeToAllSchoolRegistryEntries(
  onData: (entries: SchoolRegistryEntry[]) => void,
  onError?: (message: string) => void
): () => void {
  return onSnapshot(
    collection(db, 'schoolRegistry'),
    (snapshot) => {
      const list: SchoolRegistryEntry[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const rawClasses = Array.isArray(data.classes) ? data.classes : [];
        const validClasses: ExamType[] = rawClasses
          .map((c) => String(c))
          .filter((c): c is ExamType => c === 'MATRIC (10th)' || c === 'INTERMEDIATE (+2)');

        return {
          id: d.id,
          schoolCode: normalizePolicySchoolCode(String(data.schoolCode || '')),
          schoolName: String(data.schoolName || ''),
          adminUid: String(data.adminUid || ''),
          adminEmail: String(data.adminEmail || '').toLowerCase(),
          adminName: String(data.adminName || ''),
          studentCount: Number(data.studentCount) || 0,
          teacherCount: Number(data.teacherCount) || 0,
          clerkCount: Number(data.clerkCount) || 0,
          classes: validClasses,
          updatedAt: formatFirestoreTimestamp(data.updatedAt),
        };
      });
      list.sort((a, b) => a.schoolCode.localeCompare(b.schoolCode));
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'schoolRegistry');
      }
    }
  );
}

export function subscribeToAllTeacherAssignmentsForSuperAdmin(
  onData: (assignments: TeacherAssignment[]) => void,
  onError?: (message: string) => void
): () => void {
  return onSnapshot(
    collection(db, 'teacherAssignments'),
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        mapDocToTeacherAssignment(d.id, d.data() as Record<string, unknown>)
      );
      list.sort(
        (a, b) => a.schoolCode.localeCompare(b.schoolCode) || a.teacherEmail.localeCompare(b.teacherEmail)
      );
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'teacherAssignments');
      }
    }
  );
}

export function subscribeToAllClerkAssignmentsForSuperAdmin(
  onData: (assignments: ClerkAssignment[]) => void,
  onError?: (message: string) => void
): () => void {
  return onSnapshot(
    collection(db, 'clerkAssignments'),
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        mapDocToClerkAssignment(d.id, d.data() as Record<string, unknown>)
      );
      list.sort(
        (a, b) => a.schoolCode.localeCompare(b.schoolCode) || a.clerkEmail.localeCompare(b.clerkEmail)
      );
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'clerkAssignments');
      }
    }
  );
}

export function subscribeToAllSchoolFeaturePolicies(
  onData: (policies: SchoolFeaturePolicyRecord[]) => void,
  onError?: (message: string) => void
): () => void {
  return onSnapshot(
    collection(db, 'schoolFeaturePolicies'),
    (snapshot) => {
      const list: SchoolFeaturePolicyRecord[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          schoolCode: normalizePolicySchoolCode(String(data.schoolCode || d.id)),
          schoolName: String(data.schoolName || ''),
          note: String(data.note || ''),
          ...parseFeatureFlagsData(data),
          updatedAt: formatFirestoreTimestamp(data.updatedAt),
        };
      });
      list.sort((a, b) => a.schoolCode.localeCompare(b.schoolCode));
      onData(list);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (onError) onError(msg);
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'schoolFeaturePolicies');
      }
    }
  );
}

export async function saveSchoolFeaturePolicy(
  rawSchoolCode: string,
  flags: AdminFeatureFlags,
  schoolName = '',
  note = ''
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !isSuperAdminUserEmail(currentUser.email)) {
    throw new Error('Unauthorized: Only Super Admin can manage School Code feature policies.');
  }

  const code = normalizePolicySchoolCode(rawSchoolCode);
  if (!code) {
    throw new Error('Valid School Code enter karein (e.g. 51803 ya 31337).');
  }

  const path = `schoolFeaturePolicies/${code}`;
  const docRef = doc(db, 'schoolFeaturePolicies', code);

  const mutableFields = {
    schoolName: clampStr(schoolName, 200),
    note: clampStr(note, 200),
    randomMarksGenerator: Boolean(flags.randomMarksGenerator),
    excelDownload: Boolean(flags.excelDownload),
    pdfDownload: Boolean(flags.pdfDownload),
    completeZipDownload: Boolean(flags.completeZipDownload),
    letterPadAndLifafa: Boolean(flags.letterPadAndLifafa),
    attendanceSheet: Boolean(flags.attendanceSheet),
    teacherClerkManagement: Boolean(flags.teacherClerkManagement),
    bulkDeleteData: Boolean(flags.bulkDeleteData),
    updatedByUid: clampStr(currentUser.uid, 128),
    updatedAt: serverTimestamp(),
  };

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      await updateDoc(docRef, mutableFields);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(docRef, {
        schoolCode: code,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function deleteSchoolFeaturePolicy(rawSchoolCode: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !isSuperAdminUserEmail(currentUser.email)) {
    throw new Error('Unauthorized: Only Super Admin can reset School Code feature policies.');
  }

  const code = normalizePolicySchoolCode(rawSchoolCode);
  if (!code) return;

  const path = `schoolFeaturePolicies/${code}`;
  try {
    await deleteDoc(doc(db, 'schoolFeaturePolicies', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Admin & Clerk: Real-time single-doc listeners for each active School Code (no collection list needed).
 */
export function subscribeToSchoolFeaturePoliciesByCodes(
  schoolCodes: string[],
  onData: (policiesByCode: Record<string, SchoolFeaturePolicyRecord>) => void
): () => void {
  const uniqueCodes = Array.from(
    new Set(schoolCodes.map((c) => normalizePolicySchoolCode(c)).filter(Boolean))
  );

  if (uniqueCodes.length === 0) {
    onData({});
    return () => {};
  }

  const state: Record<string, SchoolFeaturePolicyRecord> = {};
  const emit = () => onData({ ...state });

  const unsubscribers = uniqueCodes.map((code) => {
    const docRef = doc(db, 'schoolFeaturePolicies', code);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          state[code] = {
            id: snap.id,
            schoolCode: code,
            schoolName: String(data.schoolName || ''),
            note: String(data.note || ''),
            ...parseFeatureFlagsData(data),
            updatedAt: formatFirestoreTimestamp(data.updatedAt),
          };
        } else {
          delete state[code];
        }
        emit();
      },
      (error) => {
        if (auth.currentUser) {
          console.warn(`School feature policy watch failed for ${code}:`, error);
        }
      }
    );
  });

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFromFirebase(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };



