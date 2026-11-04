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
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AdmitCardRecord, InterSentUpMarks, MatricSentUpMarks } from './types/admitCard';
import { getEffectiveInterSentUp, getEffectiveMatricSentUp } from './utils/marksAndFormat';

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

export function buildStudentFirestorePayload(record: AdmitCardRecord, ownerId: string) {
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
    studentCategory: clampStr(record.studentCategory || 'REGULAR', 32),
    casteCategory: clampStr(record.casteCategory || 'GENERAL', 32),
    differentlyAbled: clampStr(record.differentlyAbled || 'NO', 32),
    registrationNo: clampStr(record.registrationNo, 64),
    rollCode: clampStr(record.rollCode, 32),
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
  };
}

export async function upsertStudentInFirestore(record: AdmitCardRecord): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const docId = sanitizeDocId(`${currentUser.uid}_${record.id}`);
  const path = `students/${docId}`;
  const docRef = doc(db, 'students', docId);
  const basePayload = buildStudentFirestorePayload(record, currentUser.uid);

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (exists) {
    try {
      const { ownerId: _omitOwner, ...updateFields } = basePayload;
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
        ...basePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function syncAllStudentsToFirestore(records: AdmitCardRecord[]): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || records.length === 0) return;

  for (const rec of records) {
    await upsertStudentInFirestore(rec);
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

export function subscribeToUserStudents(
  user: User,
  onData: (records: AdmitCardRecord[]) => void
): () => void {
  const q = query(collection(db, 'students'), where('ownerId', '==', user.uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const prefix = `${user.uid}_`;
      const loaded: AdmitCardRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const rawId = d.id.startsWith(prefix) ? d.id.slice(prefix.length) : d.id;
        return {
          id: rawId,
          serialNo: Number(data.serialNo) || 1,
          examType:
            data.examType === 'MATRIC (10th)' ? 'MATRIC (10th)' : 'INTERMEDIATE (+2)',
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
          studentCategory: String(data.studentCategory || 'REGULAR'),
          casteCategory: String(data.casteCategory || 'GENERAL'),
          differentlyAbled: String(data.differentlyAbled || 'NO'),
          registrationNo: String(data.registrationNo || ''),
          rollCode: String(data.rollCode || ''),
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
      });
      loaded.sort((a, b) => a.serialNo - b.serialNo);
      onData(loaded.map((r, i) => ({ ...r, serialNo: i + 1 })));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    }
  );
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
