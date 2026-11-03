# Triage Labels

> Current upstream routing: use `xnohat/webobsidian` for issues, labels and specs.
> The source-fork conventions below are historical; references to Pham or a ban on
> filing upstream do not override this contribution target.

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (`phamtruonghung/webobsidian`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

The label strings match the roles one-to-one, so `/triage` creates them as-is on first use and never
duplicates a role under a second name.

## Repo-specific labels used alongside them

- `deploy` — touches the LXC 107 deployment or the deploy workflow.
- `upstream-sync` — syncing later PRs from `xnohat/webobsidian` (see `docs/UPSTREAM_PR_MERGES.md`).

Edit the right-hand column to match whatever vocabulary you actually use.
