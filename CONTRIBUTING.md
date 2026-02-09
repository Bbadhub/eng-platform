# Contributing to Engineering Platform

Thank you for contributing to our engineering standards!

---

## 🎯 What This Repo Is

The **Engineering Platform** contains shared standards, configs, and tools for all projects.

**Important:** This is NOT project code. This is the *foundation* that projects build on.

---

## 🤝 How to Contribute

### 1. **Propose New Standards**

Open an issue using the "New Standard Proposal" template:
- What problem does this solve?
- Which projects benefit?
- What's the cost (time, complexity)?

### 2. **Update Existing Standards**

For changes to existing configs/docs:
1. Fork the repo
2. Make changes
3. Test on at least one project
4. Open PR with evidence it works

### 3. **Add MCP Server Evaluation**

See [mcp/evaluation-criteria.md](mcp/evaluation-criteria.md) and use the template:
1. Run full evaluation (score /100)
2. Test in one project
3. Add to evaluation-log.md
4. PR with results

---

## ✅ Contribution Guidelines

### DO:
- ✅ Test changes on real projects first
- ✅ Document the "why" not just "what"
- ✅ Keep backward compatibility when possible
- ✅ Update CHANGELOG.md with your changes

### DON'T:
- ❌ Add project-specific code (belongs in projects, not platform)
- ❌ Break existing projects without migration guide
- ❌ Add MCP servers without full evaluation
- ❌ Copy-paste configs from internet without testing

---

## 🔄 Review Process

1. **Issue Discussion** (1-3 days)
   - Team reviews proposal
   - Discusses trade-offs
   - Votes: Approve / Revise / Reject

2. **PR Review** (1-5 days)
   - Code review
   - Test on 1+ projects
   - Documentation complete

3. **Merge & Release** (1 day)
   - Merge to main
   - Tag version (semver)
   - Announce in team channel

---

## 📋 PR Template

When opening a PR:
```markdown
## What Changed
[Brief description]

## Why
[Problem this solves]

## Testing
- [ ] Tested on [Project Name]
- [ ] All checks pass
- [ ] Documentation updated

## Breaking Changes
- [ ] None
- [ ] Yes (see CHANGELOG.md for migration)

## Related Issues
Closes #XX
```

---

## 🏷️ Versioning (Semver)

- **Major (v2.0.0):** Breaking changes (requires project updates)
- **Minor (v1.1.0):** New features (backward compatible)
- **Patch (v1.0.1):** Bug fixes (no project changes needed)

---

## 🚀 Release Process

1. Update CHANGELOG.md
2. Bump version in package.json (if applicable)
3. Tag release: `git tag v1.0.0`
4. Push: `git push --tags`
5. Announce to team

---

## 🐛 Reporting Issues

**Found a bug in platform configs?**
1. Open issue with:
   - What's broken
   - Which project/config
   - Steps to reproduce
   - Expected vs actual behavior

**Have a question?**
- Check docs/ first
- Ask in team channel
- Open issue if unanswered

---

## 📚 Resources

- [Protected Code Process](docs/processes/protected-code.md)
- [MCP Evaluation Criteria](mcp/evaluation-criteria.md)
- [New Project Setup](docs/runbooks/new-project-setup.md)

---

## 🙏 Thank You!

Your contributions help the entire team ship better code faster.
