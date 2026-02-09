# Memory Schema Compatibility

**How our smart-memory schema compares to Anthropic's official memory server**

---

## Schema Comparison

### Official Anthropic Schema

```json
{
  "entities": [
    {
      "name": "John_Smith",
      "entityType": "person",
      "observations": [
        "Speaks fluent Spanish",
        "Graduated in 2019"
      ]
    }
  ],
  "relations": [
    {
      "from": "John_Smith",
      "to": "Anthropic",
      "relationType": "works_at"
    }
  ]
}
```

### Our Smart-Memory Schema (Compatible + Enhanced)

```json
{
  "entities": {
    "org": {
      "name": "org",
      "entityType": "namespace",
      "observations": [
        "Use conventional commits",
        "Code reviews need 2 approvers"
      ]
    },
    "legalai:api": {
      "name": "api",
      "entityType": "system",
      "context": "legalai",
      "observations": [
        "tRPC routers in src/server/routers/"
      ],
      "created_at": "2026-02-09T00:00:00Z",
      "created_by": "Brett",
      "created_by_email": "brett@example.com"
    }
  },
  "relations": [
    {
      "from": "legalai",
      "to": "org",
      "relationType": "inherits_standards"
    }
  ],
  "observations": [
    {
      "content": "Use conventional commits",
      "scope": "org",
      "detected_context": "legalai",
      "timestamp": "2026-02-09T00:00:00Z",
      "author": "Brett",
      "author_email": "brett@example.com",
      "classification": {
        "method": "automatic",
        "confidence": 0.92
      }
    }
  ]
}
```

---

## Field Mapping

| Purpose | Anthropic Official | Our Smart-Memory | Compatible? |
|---------|-------------------|------------------|-------------|
| **Entity name** | `name` | `name` | ✅ Identical |
| **Entity type** | `entityType` | `entityType` | ✅ Identical |
| **Entity observations** | `observations[]` | `observations[]` | ✅ Identical |
| **Relation source** | `from` | `from` | ✅ Identical |
| **Relation target** | `to` | `to` | ✅ Identical |
| **Relation type** | `relationType` | `relationType` | ✅ Identical |

### Enhanced Fields (Not in Official)

| Field | Purpose | Why Added |
|-------|---------|-----------|
| `context` | Project namespace (legalai, adhub, org) | Auto-organize by project |
| `created_at` | Timestamp when entity created | Audit trail |
| `created_by` | Git user name | Team attribution |
| `created_by_email` | Git user email | Contact info |
| `scope` | Where observation stored (org vs project) | Smart classification |
| `detected_context` | Where user was working | Context awareness |
| `author` | Who added observation | Team tracking |
| `author_email` | Author email | Contact info |
| `classification` | How it was classified | Transparency |

---

## Compatibility

### ✅ Can Read Official Anthropic Memory Files

Our smart-memory server can read standard Anthropic memory files:

```javascript
// Official Anthropic format works
{
  "entities": [
    { "name": "x", "entityType": "y", "observations": ["z"] }
  ]
}

// Our server reads it fine ✅
```

### ✅ Official Server Can Read Our Files (Core Fields)

The official Anthropic server ignores extra fields:

```javascript
// Our format
{
  "entities": [
    {
      "name": "x",
      "entityType": "y",
      "observations": ["z"],
      "created_by": "Brett"  // ← Ignored by official server
    }
  ]
}

// Official server reads: name, entityType, observations ✅
// Official server ignores: created_by, context, etc. ✅
```

---

## User Metadata (Team Attribution)

### What We Track

Every observation includes:

```json
{
  "content": "Use conventional commits",
  "author": "Brett",
  "author_email": "brett@example.com",
  "timestamp": "2026-02-09T12:34:56Z"
}
```

### Where It Comes From

**Automatic detection via git config:**

```bash
git config user.name    → "Brett"
git config user.email   → "brett@example.com"
```

**No manual input needed** - uses your git identity.

---

## Use Cases for User Metadata

### 1. Attribution (Who Added What)

```bash
# Search who added a specific pattern
jq '.observations[] | select(.content | contains("tRPC")) | .author' team-memory.json

# Result: "Brett"
```

### 2. Team Analytics

```bash
# Count contributions per team member
jq '[.observations[] | .author] | group_by(.) | map({author: .[0], count: length})' team-memory.json

# Result:
# [
#   {"author": "Brett", "count": 45},
#   {"author": "Alice", "count": 23},
#   {"author": "Bob", "count": 18}
# ]
```

### 3. Contact for Clarification

```bash
# Find who added a pattern you don't understand
jq '.observations[] | select(.content | contains("special deployment")) | {author, email, content}' team-memory.json

# Result: Can reach out to author for clarification
```

### 4. Audit Trail

```bash
# See timeline of changes to org standards
jq '.observations[] | select(.scope == "org") | {timestamp, author, content}' team-memory.json | sort_by(.timestamp)
```

---

## Privacy Considerations

### What's Tracked

- ✅ Git username (public in commits anyway)
- ✅ Git email (public in commits anyway)
- ✅ Timestamp (when memory added)
- ✅ Project context (which repo)

### What's NOT Tracked

- ❌ IP addresses
- ❌ Session IDs
- ❌ Browse history
- ❌ File contents (only memory observations)
- ❌ Personal preferences (only team knowledge)

### Can Be Disabled

Set environment variable to disable attribution:

```bash
# In .mcp.json
{
  "env": {
    "DISABLE_USER_ATTRIBUTION": "true"
  }
}
```

Then observations won't include author info.

---

## Migration Between Formats

### From Official Anthropic → Our Smart-Memory

**No migration needed** - fully compatible ✅

Just point our server at the file:
```bash
MEMORY_FILE_PATH=/path/to/anthropic-memory.json node smart-memory/index.js
```

### From Our Smart-Memory → Official Anthropic

**Strip extra fields** (optional):

```bash
jq '{
  entities: [.entities | to_entries[] | .value | {name, entityType, observations}],
  relations: .relations
}' team-memory.json > anthropic-compatible.json
```

Or just use as-is - official server ignores extra fields.

---

## Example Team Memory with Attribution

```json
{
  "version": "1.0.0",
  "last_updated": "2026-02-09T12:00:00Z",

  "entities": {
    "org": {
      "name": "org",
      "entityType": "namespace",
      "observations": [
        "Use conventional commits",
        "Code reviews need 2 approvers"
      ],
      "created_at": "2026-02-09T08:00:00Z",
      "created_by": "Brett"
    },
    "legalai:tRPC": {
      "name": "tRPC",
      "entityType": "technology",
      "context": "legalai",
      "observations": [
        "Routers in src/server/routers/",
        "35 endpoints in actors.ts"
      ],
      "created_at": "2026-02-09T09:30:00Z",
      "created_by": "Alice",
      "created_by_email": "alice@example.com"
    }
  },

  "observations": [
    {
      "content": "Use conventional commits",
      "scope": "org",
      "detected_context": "eng-platform",
      "timestamp": "2026-02-09T08:00:00Z",
      "author": "Brett",
      "author_email": "brett@example.com",
      "classification": {
        "method": "automatic",
        "confidence": 0.95,
        "reason": "Matched org keyword: git workflow"
      }
    },
    {
      "content": "Routers in src/server/routers/",
      "scope": "legalai",
      "detected_context": "legalai",
      "timestamp": "2026-02-09T09:30:00Z",
      "author": "Alice",
      "author_email": "alice@example.com",
      "classification": {
        "method": "automatic",
        "confidence": 0.88,
        "reason": "Code-specific pattern detected"
      }
    }
  ]
}
```

---

## Sources

- [Anthropic Knowledge Graph Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- [Memory MCP Server Schema](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/README.md)

---

## Summary

| Feature | Official Anthropic | Our Smart-Memory |
|---------|-------------------|------------------|
| **Core schema** | ✅ Entities + Relations | ✅ Compatible |
| **Field names** | `entityType`, `relationType` | ✅ Same |
| **Auto-namespacing** | ❌ No | ✅ Yes (by project) |
| **User attribution** | ❌ No | ✅ Yes (git user) |
| **Scope classification** | ❌ No | ✅ Yes (org vs project) |
| **Timestamps** | ❌ No | ✅ Yes |
| **Can read official files** | N/A | ✅ Yes |
| **Can be read by official** | N/A | ✅ Yes (ignores extras) |

**100% compatible** with Anthropic's official memory server ✅
