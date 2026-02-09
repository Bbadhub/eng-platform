# Protected Code Process

**Purpose:** Mark stable, critical code with `@protected` annotations to prevent regressions.

**Principle:** "If it works and it's critical, protect it."

---

## 🎯 When to Protect Code

### ✅ **DO protect:**
- Code stable for 2+ sprints/months
- Critical business logic (payments, auth, data integrity)
- Complex integrations tested in production
- Public APIs with external consumers
- Code that caused production incidents when changed

### ❌ **DON'T protect:**
- New experimental features
- Code under active development
- Simple utility functions
- Easily testable pure functions
- Throwaway/temporary code

---

## 📝 Protection Annotation Format

### TypeScript/JavaScript
```typescript
/**
 * @protected
 * Locked: YYYY-MM-DD (Sprint XX)
 * Status: STABLE - Brief description
 *
 * DO NOT modify without testing:
 * 1. [Test case 1]
 * 2. [Test case 2]
 * 3. [Test case 3]
 *
 * Last incident: [DATE] - [Description if applicable]
 */
export function criticalFunction() {
  // ...
}
```

### Python
```python
"""
@protected
Locked: YYYY-MM-DD (Sprint XX)
Status: STABLE - Brief description

DO NOT modify without testing:
1. [Test case 1]
2. [Test case 2]

Last incident: [DATE] - [Description if applicable]
"""
def critical_function():
    pass
```

---

## 🛠️ Protection Workflow

### Step 1: Identify Candidates
```bash
# After sprint completion
git log --since="2 months ago" --pretty=format:"%s" | grep -i "fix\|bug\|hotfix"

# Look for:
# - Files that haven't changed in 2+ months
# - Files that caused incidents when modified
# - Files with >80% test coverage
```

### Step 2: Add Annotation
```bash
# Use script (coming soon)
./eng-platform/scripts/protect-code.sh src/api/payments.ts

# Or manually add annotation (see format above)
```

### Step 3: Document in CLAUDE.md
```markdown
## ⚠️ PROTECTED CODE

### STABLE Components (@protected)

| Component | Status | Test Checklist |
|-----------|--------|----------------|
| [payments.ts](src/api/payments.ts) | ✅ STABLE | Charge succeeds, refund works, webhook fires |
```

### Step 4: Create PRE-FLIGHT Checklist
```markdown
**Before modifying payments.ts:**
1. ✅ Test charges in staging?
2. ✅ Test refunds work?
3. ✅ Webhooks fire correctly?
4. ✅ No breaking API changes?
```

---

## 🔒 Enforcement Levels

### Level 1: Documentation Only (Current)
- `@protected` annotation in comments
- PRE-FLIGHT checklist in CLAUDE.md
- Manual code review catches violations

### Level 2: Linter Warnings (Future - v2.0)
```javascript
// ESLint plugin detects @protected
// Warns: "This file is protected. Run checklist first."
```

### Level 3: CI Gates (Future - v3.0)
```yaml
# GitHub Actions
- name: Check protected files
  run: ./scripts/check-protected.sh
  # Requires --force flag to bypass
```

---

## 🚨 What If You Must Change Protected Code?

### Option A: Follow the Checklist
1. Read the `@protected` annotation
2. Complete the PRE-FLIGHT checklist
3. Run all tests
4. Add new tests if behavior changes
5. Get extra code review

### Option B: Unprotect First
If the code needs significant refactoring:
1. Remove `@protected` annotation
2. Add TODO: "Stabilize and re-protect after Sprint XX"
3. Refactor
4. Re-test extensively
5. Re-protect after stabilization

---

## 📊 Protected Code Audit

**Quarterly audit checklist:**
- [ ] Review all `@protected` files
- [ ] Remove protection from frequently-changing files
- [ ] Add protection to newly-stable files
- [ ] Update PRE-FLIGHT checklists
- [ ] Verify tests still cover protected code

**Last audit:** [DATE]
**Next audit:** [DATE + 3 months]

---

## 🏆 Success Metrics

**Good:**
- Protected files have <5 changes/year
- Zero production incidents from protected code
- PRE-FLIGHT checklists completed before changes

**Bad:**
- Protected files change weekly (shouldn't be protected)
- Production incidents from skipping checklists
- Annotations outdated (>1 year old)

---

## 📚 Examples from LegalAI_System

### Example 1: useActorsWithESData.ts
```typescript
/**
 * @protected
 * Locked: 2025-01-17 (Sprint 17)
 * Status: STABLE - tRPC + ES federation working
 *
 * DO NOT modify without testing:
 * 1. Actor list loads (dismissed: false filter)
 * 2. Validation badges display correctly
 * 3. Update/dismiss/delete mutations work
 * 4. ES data merges with PG data
 */
```

**Why protected:** Core data layer, stable for 2 sprints, feeds entire UI.

---

## 🔗 Related Docs

- [Code Review Process](code-review.md)
- [Testing Standards](testing-standards.md)
- [Incident Response](incident-response.md)
