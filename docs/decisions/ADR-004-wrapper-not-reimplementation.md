# ADR-004: Wrapper Pattern for Memory Server

**Status:** Accepted
**Date:** 2026-02-09
**Supersedes:** Initial smart-memory implementation
**Related:** ADR-001 (Memory Server), ADR-003 (Memory Organization)

---

## Context

We need team memory with:
- Automatic context detection (git repo → project namespace)
- Scope classification (org vs project)
- User attribution (who added what)

**Critical requirement:** Must stay compatible with Anthropic's official memory server as it evolves.

---

## Decision

**Use wrapper pattern, not reimplementation**

```
Official @modelcontextprotocol/server-memory
         ↓ (delegates to)
Our Smart Wrapper (adds context + attribution)
         ↓ (same schema)
team-memory.json (100% compatible)
```

---

## Rationale

### Why Wrapper > Reimplementation?

| Concern | Reimplementation | Wrapper Pattern |
|---------|------------------|-----------------|
| **Schema compatibility** | ⚠️ Manual sync needed | ✅ Always compatible |
| **Anthropic updates** | ❌ We must update code | ✅ Auto-inherited |
| **Maintenance burden** | ❌ High (full server) | ✅ Low (thin layer) |
| **Bug risk** | ⚠️ We might introduce bugs | ✅ Official server is tested |
| **Future features** | ❌ Must add manually | ✅ Get automatically |
| **Code complexity** | ❌ 500+ lines | ✅ ~200 lines |

---

## Architecture

### What We DON'T Implement (Delegate to Official)

- ❌ Entity storage logic
- ❌ Relation management
- ❌ File I/O
- ❌ Schema validation
- ❌ Search algorithms

### What We DO Implement (Thin Wrapper)

- ✅ Git repo detection → project namespace
- ✅ Scope classification (org vs project)
- ✅ User attribution (git user → metadata)
- ✅ Enhanced entity naming (`scope:name`)

---

## Implementation

### Before (Full Reimplementation)

```javascript
// ❌ BAD: Reimplementing everything
async function createEntity(name, type, observations) {
  // Custom storage logic
  // Custom schema
  // Custom file I/O
  // ... 100+ lines
}
```

**Problems:**
- If Anthropic changes schema → We break
- If Anthropic adds features → We miss them
- If Anthropic fixes bugs → We don't get fixes

### After (Wrapper Pattern)

```javascript
// ✅ GOOD: Delegate to official, enhance metadata
async function createEntity(name, type, observations) {
  // 1. Detect context
  const context = detectProjectContext();

  // 2. Enhance name with namespace
  const enhancedName = `${context}:${name}`;

  // 3. Add attribution to observations
  const gitUser = getGitUserInfo();
  observations.push(`[Created by ${gitUser.name}]`);

  // 4. DELEGATE to official server
  return await officialMemoryServer.createEntity({
    name: enhancedName,
    entityType: type,
    observations
  });
}
```

**Benefits:**
- Official server handles storage/schema/validation
- We just add metadata
- Schema changes → Automatically compatible

---

## Usage Stays The Same

```bash
# User experience doesn't change
cd LegalAI_System
claude "Remember: tRPC routers in src/server/routers/"

# Behind the scenes:
# 1. Wrapper detects context: legalai (git repo)
# 2. Wrapper classifies scope: legalai (project-specific)
# 3. Wrapper adds attribution: Brett <brett@example.com>
# 4. Wrapper calls official server with enhanced data
# 5. Official server stores: {
#      name: "legalai:api_structure",
#      entityType: "pattern",
#      observations: [
#        "tRPC routers in src/server/routers/",
#        "[Created by Brett at 2026-02-09T12:00:00Z]"
#      ]
#    }
```

---

## Schema Compatibility Guarantee

### Official Schema (What Anthropic Defines)

```typescript
interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}
```

### Our Enhancement (Metadata Only)

```typescript
// We DON'T change core schema
// We ADD metadata via:
// 1. Enhanced names: "legalai:api_structure"
// 2. Attribution in observations: "[Created by Brett]"
// 3. External metadata file (optional): team-memory-meta.json

// Core schema stays 100% compatible ✅
```

---

## Future-Proofing

### When Anthropic Adds Features

**Example:** Anthropic adds `entity.version` field

**With Reimplementation:**
```javascript
// ❌ We must update our code
// ❌ Existing memories incompatible
// ❌ Manual migration needed
```

**With Wrapper:**
```javascript
// ✅ Official server handles new field
// ✅ We just pass it through
// ✅ No code changes needed
```

### When Anthropic Changes Schema

**Example:** Anthropic renames `observations` → `notes`

**With Reimplementation:**
```javascript
// ❌ Breaking change
// ❌ Must update all our code
// ❌ Migration scripts needed
```

**With Wrapper:**
```javascript
// ✅ Official server handles migration
// ✅ We just delegate
// ✅ Zero code changes
```

---

## Consequences

### Positive

- ✅ **Zero schema maintenance** - Official server owns schema
- ✅ **Auto-updates** - `npm update` gets latest features
- ✅ **100% compatible** - Never diverge from official
- ✅ **Less code** - 200 lines vs 500+ lines
- ✅ **Lower bug risk** - Official server is battle-tested
- ✅ **Future-proof** - Anthropic's changes auto-inherited

### Negative

- ⚠️ **Dependency on official server** - If it breaks, we break
  - **Mitigation:** Official server is well-maintained by Anthropic
- ⚠️ **Limited customization** - Can't change core behavior
  - **Mitigation:** Our enhancements (context, attribution) are metadata-only

### Neutral

- 🔄 **Wrapper overhead** - Minimal (~5ms per operation)
- 🔄 **Two components** - Official server + our wrapper

---

## Implementation Plan

### Phase 1: Create Wrapper (Week 1)

1. ✅ Write thin wrapper that delegates to official server
2. ✅ Add context detection logic
3. ✅ Add scope classification logic
4. ✅ Add user attribution logic
5. Test with existing team-memory.json

### Phase 2: Validate (Week 2)

1. Ensure official server can read our enhanced files
2. Ensure our wrapper can read official memory files
3. Test schema compatibility
4. Document wrapper behavior

### Phase 3: Deploy (Week 3)

1. Update MCP configs to use wrapper
2. Migrate team to wrapper
3. Monitor for issues
4. Document troubleshooting

---

## Testing Strategy

### Compatibility Tests

```bash
# 1. Official memory → Our wrapper
# Create memory with official server
npx @modelcontextprotocol/server-memory create-entity "test" "person" --obs "hello"

# Read with our wrapper
node wrapper.js get-entity "test"
# ✅ Should work

# 2. Our wrapper → Official server
# Create memory with our wrapper
node wrapper.js create-entity "test2" "person" --obs "world"

# Read with official server
npx @modelcontextprotocol/server-memory get-entity "legalai:test2"
# ✅ Should work (reads enhanced name, ignores metadata)
```

---

## Success Metrics

### 30 Days

- [ ] Wrapper deployed to all team members
- [ ] Zero schema compatibility issues
- [ ] Official server updates applied automatically
- [ ] Team reports no breaking changes

### 90 Days

- [ ] Anthropic releases 2+ updates → Auto-compatible
- [ ] No wrapper code changes needed
- [ ] All enhancements (context, attribution) still work

---

## Alternatives Considered

### Alternative 1: Full Reimplementation

**Why rejected:** High maintenance burden, schema drift risk

### Alternative 2: Fork Official Server

**Why rejected:** Can't merge upstream changes easily

### Alternative 3: No Enhancements (Use Official As-Is)

**Why rejected:** Loses context detection and team attribution

---

## Review Date

**May 9, 2026** - Reassess after Anthropic's first major update

---

## References

- [ADR-001: Memory Server](./ADR-001-memory-server.md)
- [ADR-003: Memory Organization](./ADR-003-memory-organization.md)
- [Anthropic Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)

---

## Approvals

- [x] Engineering Lead - Brett (2026-02-09)

---

## Changelog

- **2026-02-09** - Initial decision (Brett)
- **TBD** - Review after first Anthropic update
