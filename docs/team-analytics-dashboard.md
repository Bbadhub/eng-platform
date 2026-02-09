# Team Analytics Dashboard
**Proactive Engineer Health Monitoring & Training Recommendations**

---

## Overview

**Goal:** Automatically identify engineers who are struggling and provide proactive training recommendations before issues escalate.

**Data Sources:**
- team-memory.json (knowledge sharing, contributions)
- Git history (commits, code quality)
- PR reviews (collaboration patterns)
- Optional: CI/CD test results, production errors

**Works at:**
- ✅ Organization level (eng-platform)
- ✅ Individual project level (legalai, adhub)

---

## Health Metrics (Automated Scoring)

### 1. **Knowledge Sharing Score** (0-100)
**What it measures:** How much an engineer shares learnings with the team

```javascript
// From team-memory.json
const knowledgeScore = {
  org_contributions: 15,      // Org-wide memories shared
  project_contributions: 30,  // Project-specific memories
  avg_confidence: 0.87,       // Avg classification confidence
  corrections_received: 2     // How often their memories get corrected
};

// Score calculation
score = (org_contributions * 10) + (project_contributions * 5)
        - (corrections_received * 5);

// 🚨 Alert if score < 30: "Low knowledge sharing - needs coaching"
```

### 2. **Code Quality Score** (0-100)
**What it measures:** Quality of code contributions

```javascript
// From git history
const codeQuality = {
  commits_last_30d: 45,
  avg_commit_size: 120,      // Lines changed per commit
  bug_fix_ratio: 0.15,       // % of commits that fix bugs
  reverted_commits: 2,       // Commits that got reverted
  pr_approval_rate: 0.92     // % of PRs approved first time
};

// 🚨 Alert if:
// - bug_fix_ratio > 0.25: "High bug introduction rate"
// - reverted_commits > 5: "Code quality issues"
// - pr_approval_rate < 0.7: "Needs code review coaching"
```

### 3. **Velocity Score** (0-100)
**What it measures:** Productivity trends

```javascript
const velocity = {
  commits_per_week: 12,
  lines_changed_per_week: 850,
  prs_merged_per_week: 3,
  velocity_trend: -0.15      // -15% vs last month
};

// 🚨 Alert if:
// - velocity_trend < -0.3: "Significant slowdown - check blockers"
// - commits_per_week < 5: "Low activity - check engagement"
```

### 4. **Collaboration Score** (0-100)
**What it measures:** Teamwork and helping others

```javascript
const collaboration = {
  pr_reviews_given: 18,      // How many PRs reviewed
  helpful_comments: 25,      // Comments marked helpful
  memory_references: 8,      // Times their memories are cited
  pair_programming_hours: 4  // Optional: from calendar
};

// 🚨 Alert if:
// - pr_reviews_given < 5: "Not participating in code review"
// - helpful_comments < 10: "Limited collaboration"
```

### 5. **Learning Curve Score** (0-100)
**What it measures:** Rate of improvement

```javascript
const learning = {
  month_1_quality: 65,
  month_2_quality: 72,
  month_3_quality: 78,
  improvement_rate: +0.20,   // +20% improvement
  new_patterns_learned: 5    // From memory classifications
};

// 🚨 Alert if:
// - improvement_rate < 0: "Not improving - needs mentoring"
// - new_patterns_learned < 2: "Limited learning"
```

---

## Dashboard Views

### **Organization Level** (eng-platform)
**Aggregate across all projects**

```
┌─────────────────────────────────────────────────────────┐
│ Team Health Overview (Last 30 Days)                    │
├─────────────────────────────────────────────────────────┤
│ Total Engineers: 8                                      │
│ 🟢 Healthy: 5    🟡 Watch: 2    🔴 Needs Help: 1       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Engineers Needing Attention                             │
├─────────────────────────────────────────────────────────┤
│ 🔴 Alice Thompson                                       │
│    • Code quality: 42/100 (↓ -15% from last month)     │
│    • High bug fix ratio: 32% (team avg: 12%)           │
│    • Low PR approval rate: 68% (team avg: 89%)         │
│    📋 Recommendations:                                  │
│       - Pair with Brett on code reviews                 │
│       - Review: docs/code-quality-standards.md          │
│       - Schedule: TDD workshop this week                │
│                                                         │
│ 🟡 Bob Martinez                                         │
│    • Velocity: 58/100 (↓ -22% from last month)         │
│    • Low commits: 4/week (team avg: 12/week)           │
│    • Knowledge sharing: 35/100                          │
│    📋 Recommendations:                                  │
│       - Check for blockers in 1-on-1                    │
│       - Suggest breaking work into smaller chunks       │
│       - Encourage sharing learnings in team-memory      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Top Performers (Models for Others)                      │
├─────────────────────────────────────────────────────────┤
│ 🌟 Brett (Overall: 94/100)                              │
│    Best at: Code Quality (98), Knowledge Sharing (92)   │
│    Available for: Mentoring, Pair Programming           │
│                                                         │
│ 🌟 Charlie Lee (Overall: 89/100)                        │
│    Best at: Collaboration (95), Velocity (87)           │
│    Available for: Code Reviews, Onboarding              │
└─────────────────────────────────────────────────────────┘
```

### **Project Level** (legalai, adhub, etc.)
**Per-project breakdown**

```
┌─────────────────────────────────────────────────────────┐
│ LegalAI Project - Team Health                          │
├─────────────────────────────────────────────────────────┤
│ Active Contributors: 4                                  │
│ Project Velocity: 78/100 (↑ +5% from last sprint)      │
│ Code Quality: 85/100                                    │
│ Knowledge Coverage: 67% (33% of features undocumented)  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Individual Contributions (LegalAI)                      │
├─────────────────────────────────────────────────────────┤
│ Brett:    Commits: 28  PRs: 6  Quality: 96/100         │
│ Alice:    Commits: 12  PRs: 3  Quality: 48/100 🔴      │
│ Charlie:  Commits: 19  PRs: 4  Quality: 88/100         │
│ David:    Commits: 15  PRs: 5  Quality: 82/100         │
└─────────────────────────────────────────────────────────┘
```

---

## Automated Alerts (Proactive)

### **Daily Health Check** (Runs automatically)

```bash
# Run daily at 9am
cd eng-platform && node scripts/team-health-check.js

# Output:
🚨 ALERTS - 2026-02-09
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 CRITICAL: Alice Thompson needs immediate support
   - Code quality drop: 42/100 (was 78/100 last month)
   - Bug introduction rate: 32% (3x team average)
   - Action: Schedule 1-on-1 today, assign mentor

🟡 WARNING: Bob Martinez velocity declining
   - Commits down 22% this week
   - No team-memory contributions in 14 days
   - Action: Check for blockers in standup

🟢 POSITIVE: Charlie Lee improving rapidly
   - Quality up 15% this month
   - High collaboration score (95/100)
   - Action: Consider for mentorship role

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### **Weekly Trend Report** (Runs Monday morning)

```
📊 WEEKLY TEAM TRENDS - Week of Feb 9, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Team Velocity: 78/100 (↓ -3%)
Code Quality:  85/100 (↑ +2%)
Collaboration: 72/100 (↑ +8%)

🎯 Focus Areas This Week:
1. Alice needs pairing on code quality
2. Bob needs unblocking (check in 1-on-1)
3. Team knowledge sharing up 8% - keep it up!

📚 Recommended Training:
- TDD Workshop (Alice, Bob) - Thursday 2pm
- Advanced Git (David, Emily) - Friday 10am

👥 Suggested Mentoring Pairs:
- Brett → Alice (code quality focus)
- Charlie → Bob (velocity optimization)
```

---

## Query API (MCP Tools)

### **1. Get Engineer Health**
```javascript
// MCP Tool: engineer_health
{
  "name": "Alice Thompson",
  "overall_score": 58,
  "breakdown": {
    "code_quality": 42,
    "velocity": 65,
    "collaboration": 71,
    "knowledge_sharing": 48,
    "learning_curve": 62
  },
  "alerts": [
    {
      "severity": "critical",
      "category": "code_quality",
      "message": "High bug introduction rate (32%)",
      "recommendation": "Pair programming with Brett, TDD workshop"
    }
  ],
  "trending": "declining",
  "needs_support": true
}
```

### **2. Get Team Insights**
```javascript
// MCP Tool: team_insights
{
  "org_health": 78,
  "at_risk": ["Alice Thompson", "Bob Martinez"],
  "high_performers": ["Brett", "Charlie Lee"],
  "training_recommendations": [
    {
      "topic": "Test-Driven Development",
      "attendees": ["Alice", "Bob"],
      "urgency": "high",
      "reason": "Low code quality scores"
    }
  ],
  "mentoring_opportunities": [
    {
      "mentor": "Brett",
      "mentee": "Alice",
      "focus": "Code Quality",
      "estimated_impact": "high"
    }
  ]
}
```

### **3. Get Project Health**
```javascript
// MCP Tool: project_health
{
  "project": "legalai",
  "overall_score": 82,
  "velocity_trend": "+5%",
  "quality_trend": "+2%",
  "knowledge_gaps": [
    "tRPC advanced patterns",
    "Prisma migrations",
    "WebSocket authentication"
  ],
  "contributors": [
    {"name": "Brett", "health": 94},
    {"name": "Alice", "health": 58},
    {"name": "Charlie", "health": 89}
  ]
}
```

---

## Implementation

### **Architecture**

```
┌──────────────────────────────────────────────────┐
│ Team Analytics MCP Server                        │
├──────────────────────────────────────────────────┤
│ Reads:                                           │
│  • eng-platform/.shared/team-memory.json         │
│  • Git history (all repos)                       │
│  • PR metadata (GitHub API)                      │
│  • Optional: CI/CD results                       │
│                                                  │
│ Analyzes:                                        │
│  • Contribution patterns                         │
│  • Code quality trends                           │
│  • Learning curves                               │
│  • Collaboration patterns                        │
│                                                  │
│ Outputs:                                         │
│  • Health scores (0-100)                         │
│  • Automated alerts (critical/warning)           │
│  • Training recommendations                      │
│  • Mentoring suggestions                         │
└──────────────────────────────────────────────────┘
```

### **File Structure**

```
eng-platform/
├── mcp-servers/
│   └── team-analytics/
│       ├── server.js              ← MCP server
│       ├── analyzers/
│       │   ├── code-quality.js    ← Git analysis
│       │   ├── knowledge.js       ← Memory analysis
│       │   ├── velocity.js        ← Productivity tracking
│       │   └── collaboration.js   ← PR review patterns
│       ├── scoring/
│       │   ├── health-score.js    ← Overall health calculation
│       │   └── alert-engine.js    ← Proactive alerts
│       └── config.json
│
├── scripts/
│   ├── team-health-check.js       ← Daily automated check
│   └── weekly-report.js           ← Weekly summary
│
└── .shared/
    ├── team-memory.json            ← Source of truth
    └── analytics-cache.json        ← Computed scores
```

### **MCP Tools Provided**

```json
{
  "tools": [
    {
      "name": "engineer_health",
      "description": "Get health score and alerts for an engineer",
      "input": { "engineer_name": "Alice Thompson" }
    },
    {
      "name": "team_insights",
      "description": "Get org-wide team health and recommendations",
      "input": { "timeframe": "30d" }
    },
    {
      "name": "project_health",
      "description": "Get project-specific health metrics",
      "input": { "project": "legalai" }
    },
    {
      "name": "training_recommendations",
      "description": "Get suggested training for engineers",
      "input": { "urgency": "high" }
    },
    {
      "name": "find_mentors",
      "description": "Suggest mentoring pairs based on skills",
      "input": { "mentee": "Alice", "skill": "code_quality" }
    }
  ]
}
```

---

## Scoring Algorithms

### **Code Quality Score**

```javascript
function calculateCodeQuality(engineer, timeframe = '30d') {
  const commits = getCommits(engineer, timeframe);

  const metrics = {
    // Positive factors
    test_coverage: analyzeTestCoverage(commits),
    clean_commits: commits.filter(c => c.size < 200).length / commits.length,
    descriptive_messages: analyzeCommitMessages(commits),

    // Negative factors
    bug_fixes: commits.filter(c => isBugFix(c)).length / commits.length,
    reverted_commits: getRevertedCommits(engineer, timeframe).length,
    pr_rejections: getPRRejections(engineer, timeframe).length,
  };

  const score =
    (metrics.test_coverage * 30) +
    (metrics.clean_commits * 25) +
    (metrics.descriptive_messages * 20) -
    (metrics.bug_fixes * 30) -
    (metrics.reverted_commits * 10) -
    (metrics.pr_rejections * 15);

  return Math.max(0, Math.min(100, score));
}

function isBugFix(commit) {
  const message = commit.message.toLowerCase();
  return message.includes('fix') ||
         message.includes('bug') ||
         message.includes('hotfix');
}
```

### **Knowledge Sharing Score**

```javascript
function calculateKnowledgeSharing(engineer, timeframe = '30d') {
  const memories = getEngineerMemories(engineer, timeframe);

  const metrics = {
    org_contributions: memories.filter(m => m.scope === 'org').length,
    project_contributions: memories.filter(m => m.scope !== 'org').length,
    avg_confidence: avgConfidence(memories),
    memory_references: countMemoryReferences(engineer),  // How often cited
    corrections_received: countCorrections(engineer),
  };

  const score =
    (metrics.org_contributions * 10) +  // Org-wide sharing worth more
    (metrics.project_contributions * 5) +
    (metrics.avg_confidence * 30) +
    (metrics.memory_references * 5) -
    (metrics.corrections_received * 3);

  return Math.max(0, Math.min(100, score));
}
```

### **Alert Thresholds**

```javascript
const ALERT_THRESHOLDS = {
  critical: {
    code_quality: 50,          // Below 50 = immediate intervention
    velocity_drop: -0.30,      // -30% velocity
    bug_rate: 0.25,            // >25% commits are bug fixes
    learning_stagnation: 0     // No improvement
  },

  warning: {
    code_quality: 65,
    velocity_drop: -0.20,
    bug_rate: 0.18,
    knowledge_sharing: 40,
    collaboration: 50
  },

  positive: {
    code_quality_gain: +0.15,  // +15% improvement
    high_collaboration: 85,
    mentor_potential: 90       // Could mentor others
  }
};
```

---

## Sample Queries (Claude Code)

### **Daily Standup Check**
```bash
# In Claude Code
"Show me team health for today's standup"

# Returns:
🚨 2 engineers need attention:
  - Alice: Code quality declining (42/100)
  - Bob: Low velocity last week (4 commits)

🟢 Charlie showing strong improvement (+15% quality)
```

### **Before 1-on-1 Meeting**
```bash
"Prepare insights for my 1-on-1 with Alice"

# Returns:
📊 Alice Thompson - Health Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overall: 58/100 (↓ -18% from last month)

🔴 Areas of Concern:
  • Code Quality: 42/100
    - High bug fix ratio (32% vs 12% team avg)
    - Low PR approval rate (68% vs 89% team avg)
    - 3 commits reverted last month

  • Knowledge Sharing: 48/100
    - Only 2 org-wide memories shared
    - 5 corrections received on contributions

🟢 Strengths:
  • Velocity: Consistent (12 commits/week)
  • Collaboration: Active in PR reviews (15/week)

💡 Recommended Actions:
  1. Pair with Brett on next 3 PRs (code quality focus)
  2. Attend TDD workshop this Thursday
  3. Review: docs/code-review-best-practices.md
  4. Set goal: Reduce bug fix ratio to <15% by end of month
```

### **End of Sprint Review**
```bash
"Team performance summary for Sprint 19"

# Returns:
📊 Sprint 19 Performance Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Team Velocity: 82/100 (↑ +7% from Sprint 18)
Code Quality:  85/100 (↑ +3%)
Collaboration: 79/100 (↑ +12%)

🎯 Sprint Goals: 8/10 completed (80%)

🌟 MVP: Charlie Lee
  - Highest velocity (18 commits/week)
  - 95/100 collaboration score
  - Mentored Bob effectively

⚠️ Needs Support: Alice Thompson
  - Quality concerns persist
  - Recommend extending pairing sessions

📚 Training Impact:
  - TDD Workshop: +8% quality for attendees
  - Git Workshop: +5% commit quality
```

---

## Privacy & Ethics

### **What We Track**
✅ Code metrics (commits, PRs, quality)
✅ Knowledge contributions (team-memory)
✅ Collaboration patterns (reviews, pairing)
✅ Learning trends (improvement over time)

### **What We DON'T Track**
❌ Keystrokes or screen time
❌ Personal communications
❌ Off-hours activity
❌ Comparison rankings (no leaderboards)

### **How Scores Are Used**
✅ **For coaching** - Identify who needs help
✅ **For training** - Target skill gaps
✅ **For mentoring** - Match mentors with mentees
❌ **NOT for performance reviews** - This is a support tool, not evaluation

### **Engineer Access**
- Engineers can see their OWN scores
- Engineers can see team averages (anonymized)
- Engineers CANNOT see other individual scores
- Only engineering managers see individual details

---

## Next Steps

1. **Deploy team-analytics MCP server** (2-3 days)
2. **Integrate with existing team-memory** (already done)
3. **Add git history analysis** (1 day)
4. **Set up daily health checks** (automated)
5. **Configure alerts** (Slack integration)
6. **Train managers on using insights** (1 workshop)

---

## Success Metrics

**30 days:**
- [ ] 100% of team health tracked daily
- [ ] At least 1 proactive intervention per week
- [ ] Zero "surprise" performance issues in 1-on-1s

**90 days:**
- [ ] All struggling engineers identified and supported
- [ ] Training completion rate >80%
- [ ] Avg team code quality +10%
- [ ] Knowledge sharing +25%

---

## Alerts to Your Inbox (Example)

```
From: Team Analytics <team-health@eng-platform>
Subject: 🚨 Daily Health Alert - Feb 9, 2026

Brett,

2 engineers need your attention today:

🔴 CRITICAL: Alice Thompson
   Code quality: 42/100 (↓ -15% this month)
   Suggested action: Schedule 1-on-1 today
   Recommended mentor: Brett (you!)
   Estimated time: 2 hours of pairing this week

🟡 WARNING: Bob Martinez
   Velocity: 58/100 (↓ -22% this week)
   Suggested action: Check for blockers in standup

🟢 POSITIVE: Charlie Lee
   Improving rapidly (+15% quality)
   Consider for mentorship program

Full report: http://analytics.eng-platform/daily/2026-02-09
```

---

**Want me to implement the team-analytics MCP server now?**
