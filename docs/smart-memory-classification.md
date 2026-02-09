# Smart Memory Classification Guide

**How the system decides: Org vs Project**

---

## Classification Logic

```
User says: "Remember: Improve code review process"

1. Detect git repo    → LegalAI_System
2. Classify scope     → "code review process" matches org keyword
3. Store in scope     → org (not legalai)
4. Result            → Organization-wide memory ✅
```

---

## Automatic Classification Rules

### Org-Wide Indicators (Stored in `org` namespace)

**Keywords that trigger org classification:**
- "all projects", "team standard", "organization", "company-wide"
- "engineering process", "code review", "deployment process"
- "git workflow", "testing strategy", "security policy"
- "onboarding", "documentation standard"
- "ci/cd", "monitoring", "logging strategy"
- "error handling pattern", "authentication strategy"

**Pattern detection:**
- Sentences with "should/must/always/never" + no specific code mentions
- Examples:
  - ✅ "We should always use conventional commits" → org
  - ✅ "Code reviews must have 2 approvers" → org
  - ❌ "This function should use try/catch" → project (specific code)

**Location-based:**
- If you're in `eng-platform` repo → Defaults to org

---

### Project-Specific Indicators (Stored in detected project namespace)

**Keywords that trigger project classification:**
- "this project", "our api", "database schema"
- "deployment to", "specific to", "codebase"
- "this app", "feature flag", "environment variable"

**Code-specific patterns:**
- Mentions files, functions, classes, components, routes, endpoints
- Examples:
  - ✅ "actors.ts router has 35 endpoints" → project
  - ✅ "tRPC server runs on port 3030" → project

---

## Explicit Overrides (Manual Control)

### Force Org-Wide

```bash
# Any of these patterns:
claude "Remember for org: Use ESLint strict mode"
claude "Organization standard: All PRs need 2 approvers"
claude "Team convention: Use kebab-case for file names"
```

### Force Project-Specific

```bash
# Any of these patterns:
claude "Remember for this project: API uses tRPC"
claude "Project-specific: Deploy to Hetzner 178.156.192.12"
```

---

## Examples with Classification

### Example 1: Process Improvement

```bash
cd LegalAI_System
claude "Remember: Improve code review process by adding architecture review step"

Classification:
- Detected context: legalai (from git repo)
- Keywords matched: "code review process" (org keyword)
- Decision: Store in "org" namespace ✅
- Reason: Process improvements affect all projects
```

### Example 2: Project API Pattern

```bash
cd LegalAI_System
claude "Remember: tRPC routers are in src/server/routers/"

Classification:
- Detected context: legalai (from git repo)
- Keywords matched: None specific
- Code patterns: Mentions "routers" (code-specific)
- Decision: Store in "legalai" namespace ✅
- Reason: Project-specific file structure
```

### Example 3: Ambiguous Case

```bash
cd LegalAI_System
claude "Remember: Use TypeScript strict mode"

Classification:
- Detected context: legalai
- Keywords matched: None specific
- Pattern: "Use ... mode" (prescriptive pattern)
- No specific code mentioned
- Decision: Store in "org" namespace ✅
- Reason: Prescriptive without code specifics → likely org standard
```

### Example 4: Deployment (Tricky)

```bash
cd LegalAI_System
claude "Remember: Always use blue-green deployments"

Classification:
- Detected context: legalai
- Keywords matched: "Always" (org pattern)
- Pattern: Prescriptive, no project-specific details
- Decision: Store in "org" namespace ✅
- Reason: General deployment pattern for all projects
```

```bash
cd LegalAI_System
claude "Remember: Deploy to Hetzner 178.156.192.12"

Classification:
- Detected context: legalai
- Keywords matched: "Deploy to" (project keyword)
- Pattern: Specific server address
- Decision: Store in "legalai" namespace ✅
- Reason: Project-specific deployment target
```

---

## Edge Cases & Handling

### Case 1: Standard Applied Specifically

```bash
cd LegalAI_System
claude "Remember: In this project, we use conventional commits"

- Keywords: "this project" (project keyword)
- Decision: Store in "legalai" ✅
- Note: Even though conventional commits is org-wide,
        the explicit "this project" keeps it project-specific
```

### Case 2: Working in eng-platform

```bash
cd eng-platform
claude "Remember: All projects should use Vitest"

- Location: eng-platform repo
- Keywords: "All projects" (org keyword)
- Decision: Store in "org" ✅
- Note: eng-platform context defaults to org
```

### Case 3: Unsure → Ask User

If confidence < 70%, the system could ask:

```
⚠️ Classification uncertain (confidence: 65%)

Your memory: "Use Redux for state management"

Is this:
1. Organization-wide standard (applies to all projects)
2. LegalAI-specific (applies to this project only)

Reply: org or legalai
```

*(This requires interactive mode - future enhancement)*

---

## Tuning Classification

### Adding Custom Keywords

Edit `config.json`:

```json
{
  "classification_rules": {
    "org_keywords": [
      "company policy",     // ← Add your terms
      "team guideline"
    ],
    "project_keywords": [
      "feature in this app" // ← Add your terms
    ]
  }
}
```

### Git Repo Mapping

Update `config.json` with your actual repo URLs:

```json
{
  "git_repo_mapping": {
    "github.com/acme/LegalAI_System": "legalai",
    "github.com/acme/AdHub": "adhub"
  }
}
```

---

## Verification Commands

```bash
# Check current context
claude "What project am I in?"
# → Returns: legalai (from git remote)

# Check scope of last memory
claude "Where did you store that last memory?"
# → Returns: Stored in org namespace (code review process keyword)

# Search by scope
claude "Show me all org-wide standards"
# → Searches org namespace only
```

---

## Best Practices

### ✅ Do

- Let the system auto-classify (it's pretty good)
- Use explicit overrides when unsure
- Add project-specific details to help classification
- Review `team-memory.json` periodically to check accuracy

### ❌ Don't

- Mix org and project details in one statement
  - Bad: "Use tRPC (org standard) in LegalAI at port 3030"
  - Good: Two separate statements:
    - "Remember for org: Prefer tRPC over REST for TypeScript APIs"
    - "Remember: LegalAI tRPC server runs on port 3030"

---

## Confidence Levels

```json
{
  "classification": {
    "method": "automatic",
    "confidence": 0.95,  // 95% confident
    "reason": "Matched org keyword: 'code review process'"
  }
}
```

| Confidence | Meaning | Action |
|------------|---------|--------|
| 0.9 - 1.0 | Very confident | Auto-classify |
| 0.7 - 0.89 | Confident | Auto-classify |
| 0.5 - 0.69 | Uncertain | Could ask user (future) |
| < 0.5 | Very uncertain | Default to project |

---

## Future Enhancements

1. **ML-based classification** - Train on past corrections
2. **Interactive prompts** - Ask user when confidence < 70%
3. **Bulk reclassification** - Move memories between namespaces
4. **Analytics** - Show classification accuracy over time

---

## Questions?

If the classification seems wrong, you can:
1. Use explicit overrides ("Remember for org:")
2. Update `config.json` keywords
3. Open issue in eng-platform repo
4. Manually edit `team-memory.json` (last resort)
