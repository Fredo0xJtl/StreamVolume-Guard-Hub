# Project Board

Direct board:

```text
https://github.com/users/Fredo0xJtl/projects/1
```

Repository Projects page:

```text
https://github.com/Fredo0xJtl/StreamVolume-Guard-Hub/projects
```

## Views

Recommended GitHub Project views:

1. `Roadmap`
   - Group by `Target`.
   - Sort by `Priority`, then `Area`.
2. `Current Sprint`
   - Filter: `Status` is not `Done` and `Target` is `Alpha testeur`.
   - Group by `Status`.
3. `Real Audio Tests`
   - Filter: `Area` is `Testing` or label contains `audio-test`.
   - Group by `Status`.
4. `Release Readiness`
   - Filter: label contains `release` or `packaging`.
   - Group by `Status`.

## Fields

Create these custom fields if they do not exist:

| Field | Type | Values |
| --- | --- | --- |
| Status | Native single select | Todo, In Progress, Done |
| Workflow status | Single select | Inbox, Ready, In progress, Testing, Blocked, Done |
| Priority | Single select | P0, P1, P2, P3 |
| Area | Single select | Desktop, Browser Extension, Bridge, Protocol, Testing, Packaging, Docs, GitHub, Release, OBS |
| Target | Single select | Alpha testeur, V1 stable, Later |
| Control surface | Single select | WindowsSessionVolume, BrowserGain, ObserveOnly, Unknown, Not applicable |
| Item type | Single select | Task, Test, Feature, Docs, Refactor, Research |

## Status Rules

GitHub's native `Status` field stays simple:

- `Todo`: inbox, ready, blocked, and later work.
- `In Progress`: implementation or test validation in progress.
- `Done`: verified and closed.

Use `Workflow status` for the more precise product workflow:

- `Inbox`: captured but not triaged.
- `Ready`: scoped and ready to work.
- `In progress`: actively being implemented.
- `Testing`: code/docs done, waiting for command or manual validation.
- `Blocked`: cannot move without user logs, external data, browser behavior, or a product decision.
- `Done`: verified and reflected in docs/changelog when relevant.

## Control-Surface Rules

Every audio-related item must stay honest about the control surface:

- `WindowsSessionVolume`: app can change Windows mixer volume for the whole app/process.
- `BrowserGain`: extension can actively control the browser source.
- `ObserveOnly`: source is visible but cannot be controlled directly.
- `Unknown`: not classified yet.
- `Not applicable`: non-audio project work.

Never mark a browser source as complete for fine control if the real logs only
show `ObserveOnly` or `Unknown`. In that case the item can be complete only for
honest fallback behavior.

## Maintenance

- When an issue is closed, make sure `CHANGELOG.md` or the relevant docs mention
  the user-visible change if needed.
- When a real test changes product direction, update `backlog.csv` and
  `docs/product-next-plan.md`.
- Before a pre-release, run `.github/project/release-checklist.md`.
