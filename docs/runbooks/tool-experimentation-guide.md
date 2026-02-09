# Tool Experimentation Guide

**Goal:** Data-driven tool standardization through controlled experiments

---

## 🎯 Overview

Instead of guessing which tools work best, **measure** their effectiveness through A/B testing.

**The Problem:**
- Team uses different tools (ESLint strict vs base, Cursor vs VS Code, etc.)
- No data on which tools actually improve quality/velocity
- Standardization decisions based on opinions, not evidence

**The Solution:**
- Track which tools each engineer uses ([tools-registry.json](../../tools-registry.json))
- Run controlled experiments ([experiments/](../../experiments/))
- Measure impact on code quality, velocity, satisfaction
- Promote winning tools to standards

---

## 📊 How It Works

### 1. **Tool Registry** - What's Available

[tools-registry.json](../../tools-registry.json) catalogs:
- **7 categories:** linting, testing, git_workflow, ide, commit_style, code_review, ai_assistant
- **Tool options:** eslint-strict, vitest, trunk-based, cursor, claude-code, etc.
- **Tracked metrics:** code_quality, velocity, pr_approval_rate, bug_rate, satisfaction
- **Status:** standard, experimental, deprecated, proposed

**Example:**
```json
{
  "id": "eslint-strict",
  "status": "experimental",
  "tracked_metrics": ["code_quality_score", "pr_approval_rate", "violation_count"]
}
```

### 2. **Engineer Tool Profiles** - Who Uses What

[tool-tracking-schema.json](../../mcp-servers/team-analytics/schemas/tool-tracking-schema.json) tracks:
- Current tool stack per engineer
- Tool history (before/after metrics)
- Experiment participation
- Satisfaction scores

**Example:**
```json
{
  "engineer": "Alice",
  "tool_stack": {
    "linting": "eslint-strict",
    "ide": "cursor"
  },
  "tool_history": [
    {
      "tool_id": "eslint-strict",
      "metrics_before": {"code_quality": 72},
      "metrics_after": {"code_quality": 85},
      "satisfaction_score": 4.5
    }
  ]
}
```

### 3. **Experiments** - A/B Testing

[experiments/tool-experiments.json](../../experiments/tool-experiments.json) defines:
- Treatment cohort (new tool) vs Control cohort (baseline)
- Duration (typically 4-8 weeks)
- Success criteria
- Weekly checkpoints

**Example:**
```json
{
  "id": "exp-001-strict-linting",
  "hypothesis": "Stricter linting improves code quality by 10%",
  "cohorts": {
    "treatment": {"tool_id": "eslint-strict", "engineers": ["Alice", "Bob"]},
    "control": {"tool_id": "eslint-base", "engineers": ["Charlie", "David"]}
  },
  "success_criteria": {
    "min_improvement_percent": 10,
    "max_p_value": 0.05
  }
}
```

### 4. **Analytics** - What Works Best

[team-analytics MCP](../../mcp-servers/team-analytics/) provides:
- Tool effectiveness comparison
- Engineer health by tool choice
- Statistical significance testing
- Promotion recommendations

---

## 🚀 Running an Experiment

### **Phase 1: Define Experiment (15 min)**

1. **Choose tools to compare:**
   ```
   Question: Which linting config improves code quality?
   Treatment: eslint-strict (stricter rules)
   Control: eslint-base (current standard)
   ```

2. **Form hypothesis:**
   ```
   "Stricter linting will improve code quality by 10% with minimal velocity impact"
   ```

3. **Assign cohorts:**
   ```
   Treatment: Alice, Bob (4 weeks on eslint-strict)
   Control: Charlie, David (continue eslint-base)
   ```

4. **Define success criteria:**
   ```json
   {
     "min_improvement_percent": 10,
     "max_velocity_loss_percent": 5,
     "min_satisfaction_score": 4.0,
     "max_p_value": 0.05
   }
   ```

5. **Add to experiments/tool-experiments.json:**
   ```bash
   # Copy template from experiments/tool-experiments.json
   # Fill in: id, name, dates, cohorts, criteria
   ```

---

### **Phase 2: Start Experiment (5 min)**

```bash
# Start experiment
node scripts/manage-experiments.js start exp-001-strict-linting

# Output:
✅ Experiment exp-001-strict-linting started
📅 Duration: 4 weeks (2026-02-15 to 2026-03-15)
🔬 Hypothesis: Stricter linting improves code quality by 10%

👥 Cohorts:
   Treatment (eslint-strict): Alice, Bob
   Control (eslint-base): Charlie, David
```

**Team onboarding:**
1. Notify treatment cohort: "You're trying eslint-strict for 4 weeks"
2. Share setup instructions
3. Schedule weekly feedback surveys

---

### **Phase 3: Weekly Checkpoints (10 min/week)**

**Every Monday:**

1. **Record checkpoint:**
   ```bash
   node scripts/manage-experiments.js checkpoint exp-001-strict-linting
   ```

2. **Collect metrics from team-analytics MCP:**
   ```bash
   # Query metrics for treatment cohort
   # Query metrics for control cohort
   # Calculate deltas
   ```

3. **Update checkpoint in experiments/tool-experiments.json:**
   ```json
   {
     "week": 2,
     "date": "2026-02-22",
     "treatment_metrics": {
       "code_quality_score": 82,
       "velocity_commits_per_week": 12
     },
     "control_metrics": {
       "code_quality_score": 78,
       "velocity_commits_per_week": 11
     },
     "delta": {
       "code_quality_score": +5.1
     },
     "observations": "Treatment cohort reports initial learning curve, but catching more bugs"
   }
   ```

4. **Survey participants:**
   ```
   Questions:
   1. Satisfaction this week (1-5)?
   2. Challenges faced?
   3. Wins or improvements noticed?
   ```

---

### **Phase 4: Complete & Analyze (30 min)**

**After 4 weeks:**

1. **Complete experiment:**
   ```bash
   node scripts/manage-experiments.js complete exp-001-strict-linting
   ```

2. **Calculate statistical significance:**
   ```python
   # Use t-test or similar
   from scipy import stats

   treatment = [82, 84, 85, 87]  # Weekly quality scores
   control = [78, 79, 78, 80]

   t_stat, p_value = stats.ttest_ind(treatment, control)
   # p_value < 0.05 = statistically significant
   ```

3. **Update results in experiments/tool-experiments.json:**
   ```json
   {
     "results": {
       "conclusion": "treatment_wins",
       "winner": "eslint-strict",
       "statistical_significance": {
         "p_value": 0.032,
         "effect_size": 0.68
       },
       "improvement_percent": 12.3,
       "meets_success_criteria": true,
       "recommendation": "promote_to_standard"
     }
   }
   ```

4. **Generate report:**
   ```bash
   node scripts/manage-experiments.js report exp-001-strict-linting
   ```

---

### **Phase 5: Promote to Standard (1 week)**

**If experiment succeeds:**

1. **Update tools-registry.json:**
   ```json
   {
     "id": "eslint-strict",
     "status": "standard"  // Changed from "experimental"
   }
   ```

2. **Create migration plan:**
   ```markdown
   ## Migration: eslint-base → eslint-strict

   **Timeline:** 2 weeks
   **Rollout:** Gradual (2 projects/week)

   **Steps:**
   1. Update configs/eslint/base.js with strict rules
   2. Create migration guide
   3. Schedule training: "Working with Stricter Linting"
   4. Roll out to Project A, Project B (week 1)
   5. Roll out to remaining projects (week 2)
   ```

3. **Execute rollout:**
   ```bash
   # For each project:
   cd project-a
   npm install @your-org/eslint-config-strict
   npm test  # Ensure tests pass
   git commit -m "chore: migrate to eslint-strict (eng-platform standard)"
   ```

4. **Document decision:**
   ```bash
   # Create ADR
   docs/decisions/ADR-XXX-eslint-strict-standard.md
   ```

---

## 📋 Experiment Templates

### **Template 1: Linting Tool Comparison**

```json
{
  "id": "exp-002-biome-vs-eslint",
  "name": "Biome vs ESLint Performance",
  "hypothesis": "Biome is 50% faster with equivalent quality",
  "category": "linting",
  "duration_weeks": 4,
  "cohorts": {
    "treatment": {"tool_id": "biome", "engineers": ["Alice", "Bob"]},
    "control": {"tool_id": "eslint-base", "engineers": ["Charlie", "David"]}
  },
  "metrics_to_track": [
    "code_quality_score",
    "linting_time_ms",
    "developer_satisfaction"
  ],
  "success_criteria": {
    "min_speed_improvement_percent": 50,
    "min_quality_parity_percent": 95,
    "min_satisfaction_score": 4.0
  }
}
```

### **Template 2: IDE Comparison**

```json
{
  "id": "exp-003-cursor-vs-vscode",
  "name": "Cursor vs VS Code for AI-Assisted Development",
  "hypothesis": "Cursor improves velocity by 20% via AI suggestions",
  "category": "ide",
  "duration_weeks": 6,
  "cohorts": {
    "treatment": {"tool_id": "cursor", "engineers": ["Alice", "Bob", "Eve"]},
    "control": {"tool_id": "vscode", "engineers": ["Charlie", "David", "Frank"]}
  },
  "metrics_to_track": [
    "velocity_commits_per_week",
    "code_quality_score",
    "ai_suggestion_acceptance_rate",
    "developer_satisfaction"
  ],
  "success_criteria": {
    "min_velocity_improvement_percent": 20,
    "min_satisfaction_score": 4.5,
    "max_p_value": 0.05
  }
}
```

### **Template 3: Git Workflow Comparison**

```json
{
  "id": "exp-004-trunk-vs-gitflow",
  "name": "Trunk-Based Development vs GitFlow",
  "hypothesis": "Trunk-based reduces lead time by 30%",
  "category": "git_workflow",
  "duration_weeks": 8,
  "cohorts": {
    "treatment": {"tool_id": "trunk-based", "projects": ["project-a"]},
    "control": {"tool_id": "gitflow", "projects": ["project-b"]}
  },
  "metrics_to_track": [
    "deployment_frequency",
    "lead_time_hours",
    "merge_conflict_rate",
    "developer_satisfaction"
  ],
  "success_criteria": {
    "min_lead_time_reduction_percent": 30,
    "max_conflict_increase_percent": 10,
    "min_satisfaction_score": 4.0
  }
}
```

---

## 📊 Interpreting Results

### **Statistical Significance**

```
p-value < 0.05 = Statistically significant (95% confident result is real)
p-value < 0.01 = Highly significant (99% confident)
p-value > 0.05 = Not significant (could be random chance)
```

**Example:**
```
Treatment (eslint-strict): Quality = 85 ± 3
Control (eslint-base):     Quality = 78 ± 4
Improvement: +9%
p-value: 0.032
Conclusion: Significant! eslint-strict wins.
```

### **Effect Size (Cohen's d)**

```
d < 0.2 = Small effect
d = 0.5 = Medium effect
d > 0.8 = Large effect
```

**Example:**
```
Cohen's d = 0.68 (Medium-to-Large effect)
Interpretation: Meaningful improvement, not just statistical noise
```

### **Decision Matrix**

| p-value | Improvement | Decision |
|---------|-------------|----------|
| < 0.05  | > 10%      | ✅ Promote to standard |
| < 0.05  | 5-10%      | ✅ Promote if high satisfaction |
| < 0.05  | < 5%       | ⚠️ Keep as option |
| > 0.05  | Any        | ❌ No evidence of improvement |

---

## 🎯 Best Practices

### **Experiment Design**

1. **Balance cohorts:** Similar skill levels, project complexity
2. **Long enough:** 4-8 weeks minimum for behavior change
3. **Clear hypothesis:** Falsifiable predictions
4. **One variable:** Change only one thing at a time
5. **Survey early:** Collect qualitative feedback weekly

### **Common Pitfalls**

❌ **Too short:** 2 weeks isn't enough to overcome learning curves
❌ **Unbalanced cohorts:** Senior engineers vs juniors
❌ **Multiple changes:** Changing IDE + linter + workflow simultaneously
❌ **Ignoring satisfaction:** Forcing tools people hate
❌ **No baseline:** Not measuring pre-experiment metrics

### **Promotion Criteria**

**Promote to standard if:**
- ✅ Statistically significant (p < 0.05)
- ✅ Meaningful improvement (> 10%)
- ✅ High satisfaction (> 4.0/5.0)
- ✅ No velocity loss (< -5%)
- ✅ Team willing to adopt (> 75%)

---

## 🔄 Continuous Improvement Cycle

```
1. Monitor: team-analytics tracks tool usage
2. Identify: "Team A uses X, Team B uses Y, who performs better?"
3. Experiment: Run A/B test to confirm
4. Promote: Winning tool becomes standard
5. Iterate: Repeat every quarter with new tools
```

---

## 📚 Related Documentation

- [tools-registry.json](../../tools-registry.json) - Tool catalog
- [experiments/tool-experiments.json](../../experiments/tool-experiments.json) - Active experiments
- [team-analytics MCP](../../mcp-servers/team-analytics/README.md) - Health monitoring
- [apply-to-existing-project.md](./apply-to-existing-project.md) - Setup guide

---

**Questions?** Open an issue or check [CONTRIBUTING.md](../../CONTRIBUTING.md)
