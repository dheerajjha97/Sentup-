/**
 * Phase 0: Security TDD Specification for /students/{studentId} & /teacherAssignments/{assignmentId}
 * Verifies all "Dirty Dozen" attack payloads fail with PERMISSION_DENIED under firestore.rules.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: 'students' | 'teacherAssignments';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payloadSummary: string;
}

export const DIRTY_DOZEN_SECURITY_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Access',
    collection: 'students',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'auth = null attempting to create or read student records',
  },
  {
    id: 2,
    name: 'Email Spoofing (Unverified Email)',
    collection: 'teacherAssignments',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'auth.token.email matches teacherEmail but email_verified = false',
  },
  {
    id: 3,
    name: 'Cross-Owner Assignment Creation',
    collection: 'teacherAssignments',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'attacker sets ownerId = victim_uid on teacherAssignments create',
  },
  {
    id: 4,
    name: 'Teacher Self-Assignment Escalation',
    collection: 'teacherAssignments',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'teacher tries to append extra subjects/classes to admin-owned teacherAssignment',
  },
  {
    id: 5,
    name: 'Teacher Demographic Tampering',
    collection: 'students',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'assigned teacher attempts to modify studentName, schoolCode, or assignedTeacherEmails',
  },
  {
    id: 6,
    name: 'Teacher Student Deletion',
    collection: 'students',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'assigned teacher attempts to delete a student record owned by admin',
  },
  {
    id: 7,
    name: 'Shadow Field Injection',
    collection: 'teacherAssignments',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'create payload includes undeclared shadow key isAdmin: true',
  },
  {
    id: 8,
    name: 'Path ID Poisoning',
    collection: 'teacherAssignments',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'document ID contains invalid characters bad$id!@# failing isValidId()',
  },
  {
    id: 9,
    name: 'Array Overflow Denial-of-Wallet',
    collection: 'teacherAssignments',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'assignedSubjects array exceeds max 25 items or assignedTeacherEmails exceeds 30',
  },
  {
    id: 10,
    name: 'Nested Marks Value Poisoning',
    collection: 'students',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'assigned teacher sends oversized 100-char string or undeclared key inside interSentUp',
  },
  {
    id: 11,
    name: 'Client Timestamp Forgery',
    collection: 'students',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'update payload sends client timestamp updatedAt != request.time or mutates createdAt',
  },
  {
    id: 12,
    name: 'Unassigned School Cross-Read',
    collection: 'students',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'teacher assigned to school 51803 tries to read student from school 99999',
  },
];
