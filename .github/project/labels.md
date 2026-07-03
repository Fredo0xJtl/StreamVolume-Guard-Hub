# Labels

Create or verify these labels before importing backlog items.

| Label | Color | Purpose |
| --- | --- | --- |
| `audio-test` | `0e8a16` | Real audio validation with apps, browser sites, or OBS. |
| `browser` | `1d76db` | Browser extension, browser bridge, or web source behavior. |
| `desktop` | `5319e7` | Windows desktop app and WPF UI. |
| `bridge` | `0052cc` | Local 127.0.0.1 bridge behavior. |
| `protocol` | `0366d6` | Shared desktop/extension contract. |
| `diagnostics` | `fbca04` | Logs, reports, local diagnostic exports. |
| `packaging` | `c2e0c6` | Tester package, installer, zip, launcher. |
| `release` | `d93f0b` | Release or pre-release readiness. |
| `docs` | `0075ca` | README, checklists, GitHub docs, onboarding. |
| `github` | `bfd4f2` | Issues, project board, workflows, templates. |
| `obs` | `5319e7` | OBS test flow or future integration research. |
| `youtube` | `ff0000` | YouTube-specific test evidence, not engine patching. |
| `tiktok` | `000000` | TikTok-specific test evidence, not engine patching. |
| `spotify` | `1db954` | Spotify Web/Desktop test evidence. |
| `maintainability` | `f9d0c4` | Structure, ownership, docs, long-term maintenance. |

Do not use labels to hide control limits. If a test shows `ObserveOnly` or
`Unknown`, keep that visible in the issue body and project fields.
