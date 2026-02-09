# ADR-002: Protection Guard Hook over Manual Checklists

**Status:** Adopted (Already Implemented)
**Date:** 2026-02-09
**Decision Makers:** AdHub Engineering Team
**Tags:** code-protection, ai-safety, automation, best-practice

---

## Context

When multiple developers use AI coding assistants (Claude, Cursor, GitHub Copilot) on the same codebase, AI can accidentally:
- Overwrite critical functionality without realizing importance
- Remove complex implementations (e.g., comprehensive logging)
- Simplify code incorrectly (breaking subtle logic)
- Delete debugging tools marked as "unnecessary"

**Problem:** How to protect critical code sections from unintended AI modifications?

**Comparison to LegalAI baseline:**
- **LegalAI:** `@protected` comments + manual PRE-FLIGHT checklists (implicit enforcement)
- **AdHub:** Protection Guard Hook (automatic real-time enforcement via Claude Code)

---

## Decision

**Use Protection Guard Hook (PreToolUse) for automatic real-time enforcement.**

AdHub's current implementation is superior to LegalAI's manual checklist approach and should be promoted to eng-platform v1.0.0.

---

## Rationale

### LegalAI Approach: Manual PRE-FLIGHT Checklists

**How it works:**
```markdown
## PRE-FLIGHT CHECKLIST (Answer OUT LOUD before coding)

1. Task Selection: What issue am I working on?
2. Existing Code: Have I searched for similar patterns?
3. Protection: Does this touch protected code? <-- Manual check
4. HANDS OFF: Does this touch forbidden areas? <-- Manual check
5. TOML Status: Is this task in the active sprint?
```

**Protection markers:**
```typescript
// @protected - DO NOT MODIFY WITHOUT APPROVAL
export class TokenService {
  // ...
}
```

**Enforcement:** AI agent *should* read checklist and respect markers (no guarantee)

**Problems:**
❌ Relies on AI following instructions (not foolproof)
❌ AI can still proceed if it misunderstands context
❌ No blocking mechanism (modification happens, then detected)
❌ Requires human code review to catch violations

### AdHub Approach: Protection Guard Hook

**How it works:**
```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "node .claude/hooks/protection-guard.js"
      }]
    }]
  }
}
```

**Enforcement flow:**
```
AI attempts Edit/Write → PreToolUse hook fires BEFORE execution
                       → protection-guard.js checks file against registry
                       → IF protected: exit code 2 (BLOCK)
                       → AI sees error, cannot proceed
                       → Shows override instructions
```

**Protection registry:**
```markdown
<!-- .ai-code-protection.md -->
| File                          | Lines   | Owner | Purpose                     |
|-------------------------------|---------|-------|-----------------------------|
| src/services/tokenService.ts  | 1-780   | Brett | Token economy singleton     |
| src/services/sqlGenerator.ts  | 1-5382  | Brett | SQL generation + REF JOINs  |
```

**Protection levels:**
1. **@protected** - Stable code, changes require approval
2. **@immutable** - Do not modify (generated code, critical logic)
3. **@maintainable** - Can modify but preserve structure

**HANDS OFF (unconditional blocks):**
- `SimpleCampaignWizard.tsx` - Angelo's campaign builder
- `CampaignBuilder/**` - Dedicated engineer
- `Step7*` - Complex data modeling

**Self-protection (no override possible):**
- `.claude/hooks/**` - Guard scripts themselves
- `.claude/settings.json` - Hook configuration
- `.ai-code-protection.md` - Protection registry

**Advantages:**
✅ **Real-time blocking** - Modification prevented *before* it happens
✅ **Foolproof** - AI cannot bypass (exit code 2 blocks execution)
✅ **Audit trail** - All override requests logged
✅ **Self-protecting** - Hook scripts cannot be modified
✅ **Session-specific overrides** - Emergency fixes allowed with expiration

---

## Override System (Emergency Fixes)

**Scenario:** Production bug in protected file requires immediate fix

**Solution:** Session-specific override file (auto-expires)

```json
// .claude/hooks/protection-overrides.json (gitignored)
[
  {
    "file": "src/services/tokenService.ts",
    "task": "BUG-042",
    "approver": "Brett",
    "reason": "Fix crash on balance calculation when wallet is null",
    "expires": "2026-02-10T23:59:59Z"  // Max 7 days
  }
]
```

**Rules:**
- Missing required field → override silently ignored
- Expired override → file re-protected automatically
- Override active → hook logs full audit trail (who, why, when)
- Gitignored → never committed, each session creates its own

**Audit trail example:**
```
[protection-guard] Override active for src/services/tokenService.ts
  Task: BUG-042
  Approver: Brett
  Reason: Fix crash on balance calculation when wallet is null
  Expires: 2026-02-10T23:59:59Z
  Remaining: 6 days 23 hours
```

---

## Comparison Matrix

| Feature | LegalAI (Manual) | AdHub (Hook) | Winner |
|---------|------------------|--------------|--------|
| **Enforcement** | Implicit (AI should follow) | Explicit (exit code 2) | AdHub |
| **Timing** | Post-modification (code review catches) | Pre-modification (blocked before) | AdHub |
| **Reliability** | Depends on AI compliance | 100% blocking | AdHub |
| **Override** | No formal process | Session-specific, audited | AdHub |
| **Self-protection** | Not applicable | Hook scripts protected | AdHub |
| **Audit trail** | Git history only | Dedicated log + expiration | AdHub |
| **Emergency fixes** | Unclear process | Override with approval + expiration | AdHub |
| **Setup complexity** | Low (markdown file) | Medium (hook script + config) | LegalAI |
| **Maintenance** | Low (update registry) | Low (update registry) | Tie |

**Verdict:** AdHub's approach is superior (real-time enforcement > manual compliance)

---

## Implementation Details

### Protection Guard Script
```javascript
// .claude/hooks/protection-guard.js (simplified)
const fs = require('fs');
const path = require('path');

// Read tool use from stdin
const toolUse = JSON.parse(process.env.TOOL_USE || '{}');
const filePath = toolUse.file_path;

// Load protection registry
const registry = parseProtectionRegistry('.ai-code-protection.md');

// Check if file is protected
const protection = registry.find(p => p.file === filePath);
if (!protection) {
  process.exit(0); // Not protected, allow
}

// Check for override
const overrides = loadOverrides('.claude/hooks/protection-overrides.json');
const override = overrides.find(o =>
  o.file === filePath &&
  new Date(o.expires) > new Date() &&
  o.task && o.approver && o.reason
);

if (override) {
  console.log(`[protection-guard] Override active for ${filePath}`);
  console.log(`  Task: ${override.task}`);
  console.log(`  Approver: ${override.approver}`);
  process.exit(0); // Override valid, allow
}

// Protected, no override → BLOCK
console.error(`❌ BLOCKED: File is AI-PROTECTED`);
console.error(`File: ${filePath}`);
console.error(`Owner: ${protection.owner}`);
console.error(`Purpose: ${protection.purpose}`);
console.error(`To override: Create .claude/hooks/protection-overrides.json`);
process.exit(2); // Exit code 2 = BLOCK
```

### Integration with Claude Code
```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",  // Hook fires before Edit or Write tools
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/protection-guard.js\""
          }
        ]
      }
    ]
  }
}
```

**Environment variables available:**
- `$CLAUDE_PROJECT_DIR` - Root directory of project
- `TOOL_USE` - JSON with tool parameters (file_path, old_string, new_string, etc.)

---

## Consequences

### Positive

✅ **100% enforcement** - AI cannot bypass protection
✅ **Prevents accidents** - Blocks before damage occurs
✅ **Clear override process** - Emergency fixes allowed with approval
✅ **Self-protecting** - Hook scripts cannot be modified
✅ **Audit trail** - All overrides logged with expiration
✅ **Team alignment** - HANDS OFF areas clearly marked
✅ **Knowledge preservation** - Registry documents critical code

### Negative

⚠️ **Initial setup** - Requires hook script + registry creation
⚠️ **False positives** - Legitimate changes require override process
⚠️ **Learning curve** - Team needs to understand override system

### Neutral

🔄 **Maintenance** - Registry must be updated when protection changes (same as manual)
🔄 **Tooling dependency** - Requires Claude Code (or adapt for other AI tools)

---

## Adoption Plan for eng-platform v1.0.0

### 1. Extract Generic Components
- `protection-guard.js` script (pattern-agnostic)
- `.claude/settings.json` hook config
- `.ai-code-protection.md` registry template
- Override JSON schema

### 2. Document Pattern
- ADR explaining real-time enforcement advantages
- Setup guide for new projects
- Override process documentation
- Troubleshooting guide

### 3. Provide Project Templates
```
eng-platform/
  templates/
    protection-guard-hook/
      .claude/
        hooks/
          protection-guard.js
        settings.json
      .ai-code-protection.md
      docs/
        PROTECTION_GUIDE.md
        OVERRIDE_PROCESS.md
```

### 4. Migration Guide (LegalAI → AdHub approach)
- Install hook script
- Convert @protected markers to registry entries
- Update CLAUDE.md to reference hook (remove manual checklist)
- Test with sample protected file

---

## Success Metrics

**AdHub (current):**
- 27 protected files in registry
- 0 accidental modifications in last 3 months (measured)
- Override process used 2 times (both approved, completed, expired)
- Self-protection: 100% effective (no hook script modifications)

**Target for eng-platform adoption:**
- LegalAI migrates to hook-based enforcement
- Other projects adopt pattern
- Reduced code review burden (protection violations caught pre-commit)

---

## References

- [AdHub Protection Registry](./../.ai-code-protection.md) (27 protected files)
- [Protection Guard Script](../../.claude/hooks/protection-guard.js)
- [Claude Code Hooks Documentation](https://docs.anthropic.com/claude-code/hooks)
- [ADR-001: Vitest Migration](./ADR-001-migrate-to-vitest.md) (testing protected code)

---

## Related Decisions

- **ADR-004: commitlint Enforcement** (similar philosophy: automate > manual compliance)
- **Sprint Protection System** (TOML task status validation)
- **HANDS OFF Areas** (unconditional blocks for critical components)

---

## Approval

**Status:** ✅ Adopted (Already Implemented in AdHub)
**Recommendation:** Promote to eng-platform v1.0.0 as best practice
**Next Step:** Extract pattern to eng-platform templates
