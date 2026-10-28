# Baseline

LeoWapi SA is built from the LeoWapi Tanzania prototype. This file records exactly which code it started from.

| | |
| --- | --- |
| Source repository | `nyamosi2014-blip/LeoWapi` (private) |
| Development baseline | commit `e1ae10612453e81aece353f305c5d605bc856caf` (`e1ae106`) on branch `claude/project-thread-9wrm2d`, 28 Oct 2026 |
| Original upload reference | commit `baf62d6`: "Baseline: LeoWapi 27 Oct 2026 upload (unmodified)" on the same branch |
| Recorded on | 28 Oct 2026 |

## What is in `legacy/tanzania-prototype/`

| File | From | SHA-256 |
| --- | --- | --- |
| `leowapi.html` | `e1ae106` | `d21a7d165e9c3286f3587f904ce66fd71a21dd6069488ac031913b6edc8a10fc` |
| `leowapi.original-upload-27oct.html` | `baf62d6` | `1d1a123d31a4cc35b3d37e047cc6faa70a418fd2dcd39c61e0cd9a41df974c36` |
| `og-image.png` | `e1ae106` | |

These files are a read-only reference. They are not built, served or deployed by LeoWapi SA, and nothing in `src/` imports them.

## What this baseline is not

Neither commit is confirmed to be the version running on the live Tanzania site. The Tanzania hosting provider and domain are unconfirmed. The only domain found in the code is `leowapi.co.tz`, used in a sample email address. LeoWapi SA never deploys to, reads from or writes to the Tanzania site or repository.

## What carries over

The prototype was a single HTML file with no backend: all data lived in the visitor's browser. LeoWapi SA keeps its business rules and rebuilds everything else on a server and database. See `docs/migration.md` for the mapping of each prototype function to its SA module.
