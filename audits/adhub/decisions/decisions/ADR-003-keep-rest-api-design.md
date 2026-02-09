# ADR-003: Keep REST API Design (Do Not Migrate to tRPC)

**Status:** Adopted
**Date:** 2026-02-09
**Decision Makers:** Engineering Team
**Tags:** api-design, architecture, backend

---

## Context

AdHub uses REST APIs with a custom `ApiError` class for error handling. The audit compared this to LegalAI's tRPC approach (end-to-end type-safe RPC).

**AdHub's current stack:**
```
Frontend: React + TypeScript
Backend:
  - AWS Lambdas (Python) - column_resolver.py, value_normalizer.py, ingestion_normalizer.py
  - AWS Lambdas (Node.js) - tokens/balance.js, wallet/deposit.js, identity/resolve.js
  - Supabase Edge Functions (TypeScript) - receive-sync, process-sync, backfill-sync
  - Supabase RPC (PostgreSQL) - acknowledge_alert, etc.
```

**LegalAI's stack:**
```
Frontend: React + TypeScript
Backend: Node.js + TypeScript (tRPC)
```

**Key difference:** AdHub has a **polyglot backend** (Python + Node.js + SQL), LegalAI is **TypeScript-only**.

---

## Decision

**Keep REST API design with custom ApiError class. Do NOT migrate to tRPC.**

**Optional future enhancement:** Consider tRPC for Supabase Edge Functions only (TypeScript-only endpoints).

---

## Rationale

### Why tRPC Doesn't Fit AdHub

**tRPC requirement:** TypeScript on both frontend AND backend

**AdHub's Python lambdas (can't use tRPC):**
```python
# api/shared/column_resolver.py (490 lines)
# Critical data pipeline - CSV column name resolution
def resolve_column_names(uploaded_columns, schema):
    # Complex logic for mapping uploaded CSV columns to database schema
    return resolved_mapping

# api/shared/value_normalizer.py (380 lines)
# Critical data pipeline - value normalization
def normalize_values(raw_data):
    return normalized_data
```

**These are protected files** (AI-PROTECTED, cannot modify without approval)

**Impact if migrating to tRPC:**
❌ Would require rewriting 1,080+ lines of Python to TypeScript
❌ Would lose mature, battle-tested data pipeline code
❌ Python has better data processing libraries (pandas, numpy)
❌ Would need to retrain team on TypeScript data processing

### Why REST Works for AdHub

**1. Polyglot Backend Support**
```typescript
// Frontend can call ANY backend language via REST
await fetch('/api/python/normalize-data');  // Python lambda
await fetch('/api/node/tokens/balance');    // Node.js lambda
await fetch('/api/edge/receive-sync');      // Supabase Edge Function
await supabase.rpc('acknowledge_alert');    // PostgreSQL function
```

**2. Custom ApiError Class Works Well**
```typescript
// src/api/baseApi.ts (AdHub's pattern)
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,      // HTTP status code
    public data: any,           // Response body
    public endpoint: string     // For logging
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Usage
try {
  const data = await TokenApi.getBalance();
} catch (error) {
  if (error instanceof ApiError) {
    // Structured error handling
    console.error(`[${error.endpoint}] ${error.status}: ${error.data.message}`);
  }
}
```

**Advantages:**
✅ Works with any backend language
✅ Structured error information (status, data, endpoint)
✅ Retry logic built-in (BaseApi handles)
✅ Timeout enforcement (30s default)
✅ Type-safe on frontend (manually defined types)

**3. REST Endpoint Naming Convention**
```
/api/{feature}/{action}

Examples:
  /api/tokens/balance          - GET user wallet balance
  /api/tokens/deduct           - POST deduct tokens
  /api/identity/resolve        - POST resolve email to records
  /api/canonical-fields/*      - GET/POST canonical field registry
  /api/connect/onboard         - POST Stripe Connect onboarding
  /api/wallet/balance          - GET cached wallet balance
  /api/wallet/deposit          - POST add funds
  /api/wallet/payout           - POST bank withdrawal
```

**Pattern is:**
✅ Consistent
✅ RESTful (resource-oriented)
✅ Self-documenting

---

## tRPC Advantages (What AdHub Sacrifices)

### What tRPC Provides

**1. End-to-End Type Safety**
```typescript
// Backend (server/routers/tokens.ts)
export const tokensRouter = router({
  getBalance: protectedProcedure
    .query(async ({ ctx }) => {
      const balance = await getBalance(ctx.user.id);
      return { balance: balance.amount, currency: 'USD' };
    })
});

// Frontend (anywhere)
const { data } = trpc.tokens.getBalance.useQuery();
//     ^^^^
//     TypeScript KNOWS: { balance: number, currency: string }
//     No manual type definition needed
```

**If backend changes response shape:**
```typescript
// Backend changes:
return { amount: balance.amount, currency: 'USD' }; // Renamed 'balance' to 'amount'

// Frontend INSTANTLY shows TypeScript error:
const { data } = trpc.tokens.getBalance.useQuery();
console.log(data.balance); // ❌ TypeScript error: Property 'balance' does not exist
```

**AdHub's REST equivalent:**
```typescript
// Backend changes (api/tokens/balance.js):
res.json({ amount: balance.amount, currency: 'USD' }); // Renamed

// Frontend (src/api/tokenApi.ts):
export interface TokenBalance {
  balance: number;  // ⚠️ Still says 'balance'
  currency: string;
}

// Runtime error (not caught by TypeScript):
const data = await TokenApi.getBalance();
console.log(data.balance); // undefined (should be data.amount)
```

**Trade-off:** AdHub accepts this risk for polyglot backend flexibility

**2. Auto-Generated API Client**
```typescript
// tRPC: No manual fetch, no manual types
const { data } = trpc.tokens.getBalance.useQuery();

// REST: Manual fetch + manual types
const data = await fetch('/api/tokens/balance');
export interface TokenBalance { ... } // Manual
```

**3. Built-in React Query Integration**
```typescript
// tRPC: React Query built-in
const { data, error, isLoading, refetch } = trpc.tokens.getBalance.useQuery();

// REST: Manual integration
const [data, setData] = useState(null);
const [error, setError] = useState(null);
useEffect(() => {
  TokenApi.getBalance().then(setData).catch(setError);
}, []);
```

---

## Mitigation Strategy (Type Safety for REST)

### 1. Generate Types from OpenAPI Spec

**Option:** Use OpenAPI (Swagger) to define REST APIs, generate TypeScript types

```yaml
# openapi.yaml
paths:
  /api/tokens/balance:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  balance:
                    type: number
                  currency:
                    type: string
```

```bash
# Generate TypeScript types
npx openapi-typescript openapi.yaml --output src/types/api.ts
```

**Pros:**
✅ Type safety from spec
✅ Works with polyglot backend
✅ Industry standard (OpenAPI)

**Cons:**
⚠️ Requires maintaining OpenAPI spec
⚠️ Types not auto-updated (manual sync)

**Status:** Not currently used in AdHub (could be added)

### 2. Shared TypeScript Types (Manual)

**AdHub's current approach:**
```typescript
// src/types/tokens.ts (manually defined)
export interface TokenBalance {
  balance: number;
  currency: string;
}

export interface TokenDeductionRequest {
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
}
```

**Pros:**
✅ Simple
✅ No tooling required

**Cons:**
❌ No enforcement (backend can drift)
❌ Manual updates required

### 3. Zod Schemas (Runtime Validation)

**Future option:** Use Zod for runtime validation + type inference

```typescript
import { z } from 'zod';

// Define schema
const TokenBalanceSchema = z.object({
  balance: z.number(),
  currency: z.string(),
});

// Infer TypeScript type
type TokenBalance = z.infer<typeof TokenBalanceSchema>;

// Runtime validation
const data = await fetch('/api/tokens/balance').then(r => r.json());
const validated = TokenBalanceSchema.parse(data); // Throws if shape wrong
```

**Pros:**
✅ Runtime validation (catches backend drift)
✅ TypeScript type inference
✅ Works with polyglot backend

**Cons:**
⚠️ Requires writing schemas
⚠️ Runtime overhead (validation on every call)

**Status:** Not currently used in AdHub (could be added)

---

## Hybrid Approach (Future Consideration)

### Use tRPC for Supabase Edge Functions Only

**Supabase Edge Functions are TypeScript:**
```typescript
// supabase/functions/receive-sync/index.ts (TypeScript)
// supabase/functions/process-sync/index.ts (TypeScript)
// supabase/functions/backfill-sync/index.ts (TypeScript)
```

**Could use tRPC for these:**
```typescript
// Frontend
const { data } = trpc.sync.receiveNotification.useMutation();

// Backend (Supabase Edge Function)
export const syncRouter = router({
  receiveNotification: publicProcedure
    .input(z.object({ syncId: z.string() }))
    .mutation(async ({ input }) => {
      // Handle sync notification
    })
});
```

**Pros:**
✅ Type safety for TypeScript-only endpoints
✅ Doesn't affect Python lambdas
✅ Gradual adoption (REST + tRPC coexist)

**Cons:**
⚠️ Mixed API styles (REST + tRPC)
⚠️ Team needs to know both patterns
⚠️ More complexity

**Decision:** Consider for future (not urgent)

---

## Comparison Matrix

| Aspect | REST (AdHub) | tRPC (LegalAI) | Winner |
|--------|--------------|----------------|--------|
| **Polyglot backend support** | ✅ Yes (Python + Node.js) | ❌ No (TypeScript only) | REST |
| **Type safety** | ⚠️ Manual (can drift) | ✅ Automatic | tRPC |
| **Setup complexity** | ✅ Simple (fetch + types) | ⚠️ Medium (router + procedures) | REST |
| **Backend language flexibility** | ✅ Any language | ❌ TypeScript only | REST |
| **Catch breaking changes** | ❌ Runtime only | ✅ Build time | tRPC |
| **React Query integration** | ⚠️ Manual | ✅ Built-in | tRPC |
| **Third-party APIs** | ✅ Works | ❌ Own APIs only | REST |
| **Industry adoption** | ✅ Universal | ⚠️ Growing | REST |

**Verdict for AdHub:** REST is the correct choice (polyglot backend requires it)

---

## Decision Summary

### Keep REST Because:
1. **Python lambdas** cannot use tRPC (1,080+ lines of critical data pipeline code)
2. **Battle-tested code** - column_resolver.py, value_normalizer.py are AI-PROTECTED
3. **Team expertise** - Existing Python data processing knowledge
4. **Flexibility** - Can use any backend language (Python, Node.js, Go, etc.)
5. **Third-party APIs** - REST works with external services

### Do NOT Migrate to tRPC Because:
1. Would require rewriting Python → TypeScript (high risk)
2. Python has better data processing ecosystem (pandas, numpy)
3. Mixed API styles (REST + tRPC) add complexity
4. Current ApiError class works well

### Future Enhancements (Optional):
1. **OpenAPI spec** - Generate types from REST API spec
2. **Zod schemas** - Runtime validation for REST responses
3. **tRPC for Supabase Edge Functions** - Type-safe TypeScript-only endpoints (coexist with REST)

---

## Consequences

### Positive

✅ **No migration needed** - Keep working Python code
✅ **Polyglot flexibility** - Can add Go/Rust lambdas if needed
✅ **Team productivity** - No retraining required
✅ **Lower risk** - Don't touch AI-PROTECTED data pipeline

### Negative

❌ **No automatic type safety** - Backend changes can break frontend at runtime
❌ **Manual type definitions** - Must sync manually
❌ **More boilerplate** - Manual fetch + error handling

### Mitigation

🔄 **Add Zod validation** (future) - Runtime validation catches drift
🔄 **Consider tRPC for new TypeScript-only endpoints** (gradual adoption)
🔄 **Document API contracts** - Clear type definitions in code

---

## References

- [AdHub BaseApi](../../src/api/baseApi.ts) (REST client with ApiError)
- [AdHub Python Lambdas](../../api/shared/) (column_resolver.py, value_normalizer.py)
- [tRPC Documentation](https://trpc.io/)
- [OpenAPI TypeScript](https://github.com/drwpow/openapi-typescript)
- [Zod Validation](https://github.com/colinhacks/zod)

---

## Related Decisions

- **ADR-001: Vitest Migration** (testing REST endpoints)
- **ADR-002: Protection Guard Hook** (Python files are AI-PROTECTED)
- **Python Data Pipeline Protection** (cannot modify without approval)

---

## Approval

**Status:** ✅ Adopted (Keep REST)
**Recommendation:** Add Zod validation for runtime type safety (future enhancement)
**Next Step:** Document API contracts with JSDoc or OpenAPI spec
