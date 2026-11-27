# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Verified Identity Invariant**: Every read/write on `/students/{studentId}` and `/teacherAssignments/{assignmentId}` requires an authenticated user with a verified email (`request.auth != null && request.auth.token.email_verified == true && request.auth.token.email is string`).
2. **Ownership & Immutability**:
   - On `/students/{studentId}`, `ownerId` MUST match `request.auth.uid` on `create`, and both `ownerId` and `createdAt` are strictly immutable on `update`.
   - On `/teacherAssignments/{assignmentId}`, `ownerId` MUST match `request.auth.uid` on `create`, and `ownerId` + `createdAt` are strictly immutable on `update`.
3. **Tiered Marks-Only Teacher Access**:
   - Teachers whose verified lowercase email appears in `existing().assignedTeacherEmails` on `/students/{studentId}` MAY read that student and update ONLY `['interSentUp', 'matricSentUp', 'updatedAt']` (plus `updatedAt == request.time`), strictly passing `isValidStudent(incoming())`.
   - Teachers CANNOT create or delete students, CANNOT modify student demographics, `schoolCode`, `ownerId`, or `assignedTeacherEmails`, and CANNOT create/modify/delete `/teacherAssignments`.
4. **Strict Bounded Schemas & Arrays**:
   - `assignedTeacherEmails` on `/students/{studentId}` is strictly bounded to `<= 30` strings.
   - `assignedClasses` on `/teacherAssignments/{assignmentId}` is bounded to `1..2` strings.
   - `assignedSubjects` on `/teacherAssignments/{assignmentId}` is bounded to `1..25` strings.
5. **Zero Blanket Reads / Cost-Safe List Queries**:
   - `allow list` on `/students/{studentId}` explicitly enforces `resource.data.ownerId == request.auth.uid || request.auth.token.email.lower() in resource.data.assignedTeacherEmails || isSuperAdminEmail()` with zero `get()`/`exists()` calls.
   - `allow list` on `/teacherAssignments/{assignmentId}` explicitly enforces `resource.data.ownerId == request.auth.uid || resource.data.teacherEmail == request.auth.token.email.lower() || isSuperAdminEmail()` with zero `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Access**: Reading or creating `/students/stu_1` or `/teacherAssignments/ta_1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Email Spoofing (Unverified Email)**: Accessing `/teacherAssignments/ta_1` or updating `/students/stu_1` with a matching `email` but `email_verified == false` -> `PERMISSION_DENIED`.
3. **Cross-Owner Assignment Creation**: Creating `/teacherAssignments/ta_1` with `ownerId: "victim_uid"` while authenticated as `"attacker_uid"` -> `PERMISSION_DENIED`.
4. **Teacher Self-Assignment Escalation**: Teacher trying to create or modify `/teacherAssignments/ta_1` owned by the school admin -> `PERMISSION_DENIED`.
5. **Teacher Demographic Tampering**: Assigned teacher trying to change `studentName`, `schoolCode`, `rollNumber`, or `assignedTeacherEmails` on `/students/stu_1` -> `PERMISSION_DENIED`.
6. **Teacher Student Deletion**: Assigned teacher attempting `delete` on `/students/stu_1` -> `PERMISSION_DENIED`.
7. **Shadow Field Injection**: Creating/updating `/students/stu_1` or `/teacherAssignments/ta_1` with an undeclared key `isAdmin: true` -> `PERMISSION_DENIED`.
8. **Path ID Poisoning**: Creating `/teacherAssignments/bad$id!@#` with invalid characters -> `PERMISSION_DENIED`.
9. **Array Overflow Denial-of-Wallet**: Creating `/teacherAssignments/ta_1` with 40 subjects (> 25 max) or `/students/stu_1` with 35 teacher emails (> 30 max) -> `PERMISSION_DENIED`.
10. **Nested Marks Value Poisoning**: Assigned teacher updating `interSentUp.elective1Theory` with a 100-char string (> 16 max) or number type instead of string -> `PERMISSION_DENIED`.
11. **Client Timestamp Forgery**: Creating or updating with a forged `createdAt` or `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
12. **Unassigned School Cross-Read**: Teacher assigned only to School `51803` trying to read/update a student belonging to School `99999` (where their email is not in `assignedTeacherEmails`) -> `PERMISSION_DENIED`.
