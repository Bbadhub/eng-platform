# ADR-001: Migrate from Jest to Vitest

**Status:** Proposed
**Date:** 2026-02-09
**Decision Makers:** Engineering Team
**Tags:** testing, infrastructure, high-priority

---

## Context

AdHub currently uses Jest for unit testing, but coverage reporting is disabled due to `babel-plugin-istanbul` incompatibility with Node 20+. Additionally, 39 test files are excluded due to ESM transformation issues.

**Current state:**
- Jest with coverage disabled (broken with Node 20+)
- 39 test files excluded (ESM issues, Snowflake SDK incompatibilities)
- Slow test runs (Babel transformation overhead)
- `react-scripts` locked to older version to avoid Jest issues

**Comparison to LegalAI baseline:**
- LegalAI uses Vitest (1,577 tests, working coverage)
- Native ESM support (no transformation needed)
- Faster test runs (10x improvement reported)

---

## Decision

**Migrate AdHub from Jest to Vitest.**

---

## Rationale

### Problem: Coverage Disabled
```javascript
// .github/workflows/test.yml (current state)
- name: Run tests
  # Coverage disabled due to babel-plugin-istanbul incompatibility with Node 20+
  # TODO: Re-enable coverage after upgrading react-scripts or migrating to Vitest
  run: npm test -- --ci --maxWorkers=2
```

**Impact:** No visibility into test coverage, can't enforce coverage thresholds

### Problem: ESM Transformation Issues
```javascript
// jest.config.js (39 files excluded)
testPathIgnorePatterns: [
  "snowflakeClient.test.ts",           // Snowflake SDK ESM/uuid incompatibility
  "workflow-create-view.test.js",      // ESM issues
  "overlapCalculations.test.ts",       // ESM edge cases
  // ... 36 more files
]
```

**Impact:** Large parts of codebase untested

### Solution: Vitest Advantages

1. **Native ESM Support**
   - No Babel transformation needed
   - Works with modern `import`/`export` syntax
   - Compatible with Node 20+ out of the box

2. **Coverage Works**
   ```typescript
   // vitest.config.ts
   export default defineConfig({
     test: {
       coverage: {
         provider: 'v8',  // Built-in, no babel needed
         reporter: ['text', 'html', 'lcov'],
         thresholds: {
           global: { lines: 70, functions: 70, branches: 70 },
           'src/services/tokenService.ts': { lines: 80, functions: 80 }
         }
       }
     }
   })
   ```

3. **Jest API Compatible**
   - Same `expect()`, `describe()`, `it()` syntax
   - Minimal test code changes required
   - Can migrate incrementally

4. **Faster**
   - Instant watch mode
   - Parallel execution by default
   - 10x faster than Jest (reported)

5. **Modern Tooling**
   - Vite integration (AdHub uses Vite via react-scripts)
   - Active development (released 2021, rapidly improving)
   - Growing ecosystem

---

## Alternatives Considered

### Alternative 1: Stay with Jest, downgrade Node.js
**Rejected because:**
- Node 20+ is required for AWS SDK v3.970+ (already in use)
- Downgrading Node blocks future dependency updates
- Doesn't solve ESM transformation issues

### Alternative 2: Stay with Jest, fix babel-plugin-istanbul
**Rejected because:**
- No upstream fix available (babel-plugin-istanbul abandoned)
- Community migrating to Vitest/native ESM
- Doesn't solve 39 excluded test files

### Alternative 3: Upgrade react-scripts
**Rejected because:**
- react-scripts 5.0.1 is latest stable (no newer version)
- CRA (Create React App) is in maintenance mode
- Migration to Vite would happen anyway (long-term)

### Alternative 4: Complete Vite migration (remove react-scripts)
**Considered for future:**
- Vitest migration is step 1
- Full Vite migration is step 2 (larger effort)
- Can be done incrementally

---

## Migration Plan

### Phase 1: Install Vitest (1-2 hours)
```bash
npm install -D vitest @vitest/ui @vitest/coverage-v8
```

### Phase 2: Create vitest.config.ts (1 hour)
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setupTests.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json', 'cobertura'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/*',
        'src/index.tsx',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        'src/services/tokenService.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Phase 3: Update package.json scripts (15 minutes)
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:ci": "vitest run --coverage"
  }
}
```

### Phase 4: Re-enable excluded tests (2-4 hours)
- Remove `testPathIgnorePatterns` from jest.config.js
- Fix ESM imports in 39 excluded files
- Snowflake SDK: mock or use vitest-compatible approach

### Phase 5: Update CI workflow (30 minutes)
```yaml
# .github/workflows/test.yml
- name: Run tests with coverage
  run: npm run test:ci

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
```

### Phase 6: Remove Jest dependencies (15 minutes)
```bash
npm uninstall jest ts-jest @types/jest babel-jest
```

**Total Effort:** 5-8 hours (1 day)

---

## Consequences

### Positive

✅ **Coverage reporting restored** - Can enforce thresholds, track trends
✅ **39 tests re-enabled** - Better test coverage
✅ **Faster test runs** - 10x improvement (instant watch mode)
✅ **Future-proof** - Native ESM, Node 20+ compatible
✅ **Better DX** - Vitest UI, better error messages
✅ **CI improvements** - Coverage gates, Codecov integration

### Negative

⚠️ **Learning curve** - Team needs to learn Vitest-specific features (minimal, Jest-compatible)
⚠️ **Migration effort** - 5-8 hours initial investment
⚠️ **Ecosystem smaller** - Fewer Vitest plugins than Jest (growing rapidly)

### Neutral

🔄 **Test code mostly unchanged** - Jest API compatible
🔄 **Can run Jest + Vitest in parallel** - Incremental migration possible

---

## Implementation Checklist

- [ ] Install Vitest + plugins
- [ ] Create vitest.config.ts
- [ ] Update package.json scripts
- [ ] Migrate 5 test files (pilot)
- [ ] Verify coverage works
- [ ] Update CI workflow
- [ ] Re-enable 39 excluded tests (or prioritize critical ones)
- [ ] Remove Jest dependencies
- [ ] Update documentation (README, CLAUDE.md)
- [ ] Team training session (30 minutes)

---

## Success Metrics

**Before migration:**
- Coverage: Disabled ❌
- Test count: ~150 (39 excluded) ❌
- Test run time: ~45 seconds ⚠️
- CI coverage reporting: None ❌

**After migration (target):**
- Coverage: 70% global, 80% critical services ✅
- Test count: ~189 (0 excluded) ✅
- Test run time: ~5 seconds ✅
- CI coverage reporting: Codecov + thresholds ✅

---

## References

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Migration Guide from Jest](https://vitest.dev/guide/migration.html)
- [LegalAI Vitest Config](../../../eng-platform/configs/vitest/) (reference)
- [AdHub Phase 1 Audit](../phase1-audit.json) (coverage disabled evidence)

---

## Approval

**Proposed by:** Claude Code Audit
**Status:** Awaiting approval
**Next Step:** Team review + pilot migration (5 test files)
