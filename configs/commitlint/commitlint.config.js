// Commit message convention: type(scope): description
// Examples:
//   feat(tokens): add balance display component
//   fix(sql): correct JOIN syntax for identity tables
//   chore(deps): update react to 19.0.1
//   docs(readme): add deployment instructions

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allowed types
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation only
        "style", // Formatting, missing semicolons, etc.
        "refactor", // Code change that neither fixes a bug nor adds a feature
        "perf", // Performance improvement
        "test", // Adding or updating tests
        "chore", // Maintenance tasks, dependencies, CI
        "revert", // Revert a previous commit
        "ci", // CI/CD changes
        "build", // Build system changes
      ],
    ],
    // Scope is optional but encouraged
    "scope-case": [2, "always", "lower-case"],
    // Subject (description) rules
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    // Header max length
    "header-max-length": [2, "always", 100],
  },
};
