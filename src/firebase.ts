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
  ExamType,
  InterSentUpMarks,
  MatricSentUpMarks,
  TeacherAssignment,
} from './types/admitCard';
import { getEffectiveInterSentUp, getEffectiveMatricSentUp } from './utils/marksAndFormat';
import {
  computeAssignedTeacherEmailsForStudent,
  normalizeSchoolCode,
} from './utils/teacherSubjectMatcher';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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
  assignedTeacherEmails?: string[]
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
  };
}

export async function upsertStudentInFirestore(
  record: AdmitCardRecord,
  activeAssignments?: TeacherAssignment[]
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const docId = sanitizeDocId(`${currentUser.uid}_${record.id}`);
  const path = `students/${docId}`;
  const docRef = doc(db, 'students', docId);
  const computedEmails = activeAssignments
    ? computeAssignedTeacherEmailsForStudent(record, activeAssignments)
    : record.assignedTeacherEmails;
  const basePayload = buildStudentFirestorePayload(record, currentUser.uid, computedEmails);

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
  activeAssignments?: TeacherAssignment[]
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || records.length === 0) return;

  for (const rec of records) {
    await upsertStudentInFirestore(rec, activeAssignments);
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
 * Admin: Synchronizes `assignedTeacherEmails` on all owner student documents in Firestore
 * whenever teacher assignments are created, edited, paused, or removed.
 * Queries existing docs first so `createdAt` is preserved and legacy docs are cleanly normalized.
 */
export async function syncTeacherAccessToOwnerStudents(
  records: AdmitCardRecord[],
  assignments: TeacherAssignment[]
): Promise<number> {
  const currentUser = auth.currentUser;
  if (!currentUser || records.length === 0) return 0;

  // Fetch existing owner docs once to know exact doc presence and original valid Timestamp createdAt
  const existingMetaById = new Map<
    string,
    { createdAt: Timestamp | null; existingEmails: string[]; rawKeys: string[] }
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

    const currentEmailsSorted = (existingMeta?.existingEmails || []).slice().sort().join(',');
    const nextEmailsSorted = targetEmails.slice().sort().join(',');
    if (existingMeta && currentEmailsSorted === nextEmailsSorted) {
      continue;
    }

    const basePayload = buildStudentFirestorePayload(rec, currentUser.uid, targetEmails);
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

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFromFirebase(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

