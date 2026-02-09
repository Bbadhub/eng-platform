# Team Analytics MCP Server

**Proactive engineer health monitoring and training recommendations**

## Overview

This MCP server automatically tracks engineer performance across multiple dimensions and provides proactive alerts when team members need support.

## Features

- **Automated Health Scoring** (0-100 per engineer)
  - Code Quality (35% weight)
  - Knowledge Sharing (25% weight)
  - Velocity (25% weight)
  - Collaboration (15% weight)

- **Proactive Alerts**
  - 🔴 Critical: Immediate intervention needed
  - 🟡 Warning: Monitor closely
  - 🟢 Positive: Improvement trends

- **Training Recommendations**
  - Auto-identifies skill gaps
  - Suggests targeted training
  - Groups engineers by need

- **Mentoring Pairs**
  - Matches high performers with those needing support
  - Skill-specific pairings
  - Estimated impact assessment

## Data Sources

- `team-memory.json` - Knowledge sharing contributions
- Git history - Code quality, velocity, commit patterns
- (Future) PR reviews - Collaboration patterns
- (Future) CI/CD - Test failure rates

## MCP Tools

### 1. `engineer_health`
Get detailed health report for a specific engineer

```json
{
  "engineer_name": "Alice Thompson",
  "engineer_email": "alice@example.com",
  "timeframe": 30
}
```

Returns:
- Overall health score
- Breakdown by category
- Detailed metrics
- Proactive alerts
- Recommendations

### 2. `team_insights`
Get organization-wide team health

```json
{
  "timeframe": 30
}
```

Returns:
- Team average scores
- At-risk engineers
- High performers
- Training recommendations
- Mentoring opportunities

### 3. `daily_summary`
Get daily health check summary

```json
{
  "timeframe": 30
}
```

Returns:
- Critical alerts
- Warnings
- Positive trends
- Focus areas
- Action items

### 4. `training_recommendations`
Get suggested training programs

```json
{
  "urgency": "high"
}
```

Returns:
- Training topics
- Attendee lists
- Urgency levels
- Reasons

### 5. `find_mentors`
Get mentoring pair suggestions

```json
{
  "mentee": "Alice Thompson"
}
```

Returns:
- Mentor-mentee pairs
- Focus skills
- Estimated impact

## Configuration

Edit `config.json`:

```json
{
  "memoryPath": "../../.shared/team-memory.json",
  "repoPath": "../../../LegalAI_System",
  "engineers": [
    {
      "name": "Brett",
      "email": "brett@example.com"
    }
  ]
}
```

## Usage in Claude Code

### Morning Standup
```
"Show me team health for standup"
```

### Before 1-on-1
```
"Prepare insights for my 1-on-1 with Alice"
```

### Sprint Review
```
"Team performance summary for Sprint 19"
```

### Training Planning
```
"What training do we need this month?"
```

## Privacy & Ethics

✅ **Used for coaching, NOT punishment**
✅ **Engineers see their own scores**
✅ **No public rankings**
✅ **Anonymized team averages**
✅ **Focus on support**

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure engineers:**
   Edit `config.json` with your team

3. **Add to .mcp.json:**
   ```json
   {
     "mcpServers": {
       "team-analytics": {
         "command": "node",
         "args": ["C:\\path\\to\\eng-platform\\mcp-servers\\team-analytics\\server.js"]
       }
     }
   }
   ```

4. **Restart Claude Code**

5. **Test:**
   ```
   "Show me team health"
   ```

## Scoring Algorithms

### Code Quality (0-100)
- Bug fix ratio (lower is better)
- Commit size (smaller is better)
- Reverted commits (fewer is better)
- Clean commit messages

### Knowledge Sharing (0-100)
- Org-wide contributions (10 points each)
- Project contributions (5 points each)
- Average confidence (30 points)
- References by others (5 points each)
- Corrections received (-3 points each)

### Velocity (0-100)
- Commits per week (target: 12)
- Lines changed per week
- Velocity trend (improving/declining)

## Alert Thresholds

### Critical (Immediate Action)
- Overall score < 50
- Code quality < 50
- Bug rate > 25%

### Warning (Monitor Closely)
- Overall score < 65
- Code quality < 65
- Velocity drop > 20%
- Knowledge sharing < 40

### Positive (Acknowledge)
- Overall score >= 90
- Improvement > 15%
- High collaboration >= 85

## Roadmap

- [ ] GitHub PR API integration (collaboration metrics)
- [ ] CI/CD integration (test failure tracking)
- [ ] Slack notifications (daily alerts)
- [ ] Dashboard UI (visual reports)
- [ ] Historical trends (6-month view)
- [ ] Team-level OKRs

## License

MIT
