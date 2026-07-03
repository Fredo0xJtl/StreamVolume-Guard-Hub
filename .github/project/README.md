# GitHub Project Setup

This folder is the public source of truth for the GitHub Projects tab.

Use it when creating or updating the repository project board. Keep it aligned
with `README.md`, `CHANGELOG.md`, `docs/product-next-plan.md`,
`docs/tester-checklist.md`, and release notes.

## Recommended Project

Direct board URL:

```text
https://github.com/users/Fredo0xJtl/projects/1
```

Repository Projects page:

```text
https://github.com/Fredo0xJtl/StreamVolume-Guard-Hub/projects
```

GitHub Projects v2 keeps the canonical URL under the `Fredo0xJtl` account even
when the board is linked to `Fredo0xJtl/StreamVolume-Guard-Hub`.

Name:

```text
StreamVolume Guard Hub - V1 Testable
```

Purpose:

```text
Track the Windows desktop, browser extension, local bridge, real-source tests,
tester packaging, and pre-release readiness for StreamVolume Guard Hub.
```

## Files

- `board.md`: project views, columns, fields, and update rules.
- `backlog.csv`: import/reference backlog for issues and project items.
- `labels.md`: labels to create or verify before importing issues.
- `release-checklist.md`: pre-release and stable-release readiness checklist.

## Update Rule

Update these files whenever one of these changes:

- product direction;
- browser/desktop control behavior;
- known limits such as `ObserveOnly` or `Unknown`;
- test checklist;
- release/pre-release readiness;
- package or installer flow;
- GitHub issue templates, labels, or project status.

Do not use this folder for generated artifacts, local logs, private notes, or
machine-specific paths.
