# [PROJECT_NAME] - AI Context File

**Last Updated:** [DATE]
**Pattern:** Pattern-CONTEXT-002 (Content-Addressable Context System)

---

## 📍 QUICK PATTERN INDEX

> Use these references to find detailed information. Read files on-demand to reduce context.

| Pattern | Reference | When to Use |
|---------|-----------|-------------|
| `@sot` | [docs/SOURCE_OF_TRUTH/INDEX.md](docs/SOURCE_OF_TRUTH/INDEX.md) | Architecture, data models, API docs |
| `@protected` | [PROTECTED_CODE.md](PROTECTED_CODE.md) | Before modifying stable code |
| `@deploy` | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment procedures |

### Critical Code Files (read before modifying)

| Shorthand | File | Purpose |
|-----------|------|---------|
| `@core:api` | [src/api/index.ts](src/api/index.ts) | API entry point |
| `@core:db` | [src/db/schema.ts](src/db/schema.ts) | Database schema |

---

## ⚡ QUICK REFERENCE

### Server Access
```bash
# SSH command
ssh user@host

# Key services
# - Service 1: http://host:port
# - Service 2: http://host:port
```

### Key URLs
| Service | URL |
|---------|-----|
| **Production** | [URL] |
| **Staging** | [URL] |
| **API Docs** | [URL] |

### Credentials
```
# Add to .env (NEVER commit actual values)
API_KEY=xxx
DATABASE_URL=xxx
```

---

## 🔍 INVESTIGATION MODE (AUTO-DETECT)

**Trigger phrases** - invoke investigation workflow when user says:
- "Find...", "Search for...", "Investigate..."
- "What files...", "Where is..."

### Investigation Commands

| Command | Description |
|---------|-------------|
| `grep -r "pattern" src/` | Search codebase |
| `git log --grep="keyword"` | Search commit history |

---

## ⚠️ PROTECTED CODE

**Last Audit:** [DATE]

### STABLE Components (@protected)

| Component | Status | Test Checklist |
|-----------|--------|----------------|
| [Component Name] | ✅ STABLE | [Key tests to verify] |

### PRE-FLIGHT CHECKLISTS

**Before modifying [Component]:**
1. ✅ [Test case 1]?
2. ✅ [Test case 2]?
3. ✅ [Test case 3]?

---

## 🛡️ KNOWN PATTERNS

| Pattern ID | Description | Location |
|------------|-------------|----------|
| PATTERN-001 | [Description] | [File:line] |

---

## 🚨 BUG PATTERNS (PREVENT THESE)

### BUG-001: [Bug Name]
**Date:** [DATE]
**Severity:** [CRITICAL/HIGH/MEDIUM]
**Root Cause:** [Description]

**What Went Wrong:**
```
[Code example]
```

**Prevention Checklist:**
1. ✅ [Step 1]
2. ✅ [Step 2]

**Correct Pattern:**
```
[Fixed code example]
```

---

## 📝 DOCUMENTATION UPDATES

After completing features, update:
1. **CLAUDE.md** - New workflows, endpoints, warnings
2. **SOURCE_OF_TRUTH/** - Architecture changes
3. **README.md** - User-facing changes

---

**Full architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
