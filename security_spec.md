# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Identity Ownership Invariant**: Every `/students/{studentId}` document MUST belong to an authenticated, email-verified user (`request.auth != null && request.auth.token.email_verified == true`), and `ownerId` MUST strictly match `request.auth.uid`.
2. **Immutable Ownership & Creation Time**: Once created, `ownerId` and `createdAt` on `/students/{studentId}` are strictly immutable (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
3. **Server Timestamp Enforcement**: On `create`, `createdAt == request.time` and `updatedAt == request.time`. On `update`, `updatedAt == request.time`.
4. **Strict Key & Volumetric Boundaries**: Every `/students/{studentId}` document must contain the exact 37 required keys (`hasAll` and `hasOnly`), `interSentUp` must be a Map with exact 20 bounded string keys, and `matricSentUp` must be a Map with exact 13 bounded string keys.
5. **Zero Blanket Reads / Secure List Queries**: `allow get` and `allow list` on `/students/{studentId}` explicitly check `resource.data.ownerId == request.auth.uid`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Create**: Creating `/students/stu_1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Create**: Creating `/students/stu_1` with `auth.token.email_verified == false` -> `PERMISSION_DENIED`.
3. **Cross-User Identity Spoofing (Create)**: Creating `/students/stu_1` where `ownerId: "victim_uid"` while authenticated as `"attacker_uid"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection (Create)**: Creating `/students/stu_1` with an extra key `isAdmin: true` -> `PERMISSION_DENIED`.
5. **Path ID Poisoning**: Creating `/students/bad$id!@#` with invalid characters -> `PERMISSION_DENIED`.
6. **Oversized String Denial-of-Wallet**: Creating `/students/stu_1` where `studentName` is 500 chars (> 120 max) -> `PERMISSION_DENIED`.
7. **Invalid Enum Value**: Creating `/students/stu_1` where `examType` is `"PHD"` or `gender` is `"UNKNOWN"` -> `PERMISSION_DENIED`.
8. **Nested Map Shadow Key Injection**: Updating `interSentUp` with an undeclared key `bonusMarks: "100"` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Creating or updating `/students/stu_1` with a forged past/future `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Owner Hijack on Update**: Updating `ownerId` of an existing student document to another user -> `PERMISSION_DENIED`.
11. **CreatedAt Mutation on Update**: Modifying `createdAt` during an update -> `PERMISSION_DENIED`.
12. **Unauthorized Cross-User Read/Delete**: Reading or deleting `/students/stu_1` owned by `"user_a"` while signed in as `"user_b"` -> `PERMISSION_DENIED`.
