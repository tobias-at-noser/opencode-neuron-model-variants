# Commit messages

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>[optional scope]: <description>
```

Use `fix` for fixes (SemVer PATCH) and `feat` for features (SemVer MINOR).
Mark breaking changes with `!` before the colon (for example, `feat(api)!: change response`)
or a `BREAKING CHANGE: <description>` footer; breaking changes correspond to SemVer MAJOR.
