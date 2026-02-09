# Playwright Custom Reporters

Custom reporters for Playwright E2E tests.

## PostHog Reporter

`posthog-reporter.ts` sends test results to PostHog for the automated feedback loop.

### Events Sent

| Event | When | Key Properties |
|-------|------|----------------|
| `playwright_suite_started` | Test run begins | total_tests, branch, commit |
| `playwright_test_started` | Each test starts | test_title, test_file |
| `playwright_test_completed` | Each test ends | **status**, error_message, duration_ms |
| `playwright_suite_completed` | All tests done | pass_rate, total_failed |

### Configuration

In `playwright.config.ts`:
```typescript
reporter: [
  ['./e2e/reporters/posthog-reporter.ts', {
    enabled: true,  // Always send to PostHog
  }],
],
```

### Environment Variables

- `REACT_APP_POSTHOG_KEY` or `POSTHOG_API_KEY` - Required
- `POSTHOG_HOST` - Optional (default: us.i.posthog.com)

### Query Failures in PostHog

```sql
SELECT * FROM events
WHERE event = 'playwright_test_completed'
AND properties.status = 'failed'
```

### Full Documentation

See `docs/testing/POSTHOG_PLAYWRIGHT_INTEGRATION.md`
