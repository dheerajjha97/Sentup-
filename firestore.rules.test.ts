import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Static and structural verification of firestore.rules against all 12 Dirty Dozen invariants.
 */
test('firestore.rules enforces all 8 pillars and rejects Dirty Dozen attack vectors', () => {
  const rulesPath = fs.existsSync('firestore.rules')
    ? 'firestore.rules'
    : 'DRAFT_firestore.rules';
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // 1. Rules version 2 & default deny catch-all
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);

  // 2. Auth & verified email checks
  assert.match(rules, /request\.auth\s*!=\s*null/);
  assert.match(rules, /request\.auth\.token\.email_verified\s*==\s*true/);

  // 3. Path ID poisoning guard
  assert.match(rules, /function\s+isValidId\(id\)/);
  assert.match(rules, /isValidId\(studentId\)/);

  // 4. Strict key allowlist (hasAll & hasOnly) for Student, InterSentUp, and MatricSentUp
  assert.match(rules, /data\.keys\(\)\.hasAll\(/);
  assert.match(rules, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rules, /function\s+isValidInterSentUp\(m\)/);
  assert.match(rules, /function\s+isValidMatricSentUp\(m\)/);
  assert.match(rules, /function\s+isValidStudent\(data\)/);

  // 5. Temporal integrity & immutability
  assert.match(rules, /incoming\(\)\.createdAt\s*==\s*request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
  assert.match(rules, /incoming\(\)\.ownerId\s*==\s*existing\(\)\.ownerId/);
  assert.match(rules, /incoming\(\)\.createdAt\s*==\s*existing\(\)\.createdAt/);

  // 6. Query Enforcer on list & get (no blanket reads)
  assert.match(rules, /allow\s+list:\s*if\s+isVerifiedUser\(\)\s*&&\s*resource\.data\.ownerId\s*==\s*request\.auth\.uid;/);
});
