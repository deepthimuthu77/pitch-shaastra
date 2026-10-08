# Repository working rules

## Commit ownership

Before every commit, invoke a decision agent using `prompts/commit-owner.md`.
Supply only the proposed diff, feature key, `review-ownership.json`, and relevant
local history. Use a small, low-cost agent for this narrow decision. The main
implementation agent must not bypass this step or choose an author directly.

Apply the returned owner to both Git author and committer:

- 1: `soumik15630m <soumik15630m@gmail.com>`
- 2: `deepthimuthu77 <deepthimuthu77@gmail.com>`

Keep fixes, tests, refactors, and quality improvements with the existing feature
owner. Balance new independent work by estimated review effort. Related ownership
takes precedence over balance. Record assignments in `review-ownership.json`.

If the decision requires splitting, split the changes and rerun the decision for
each commit. If more context is needed, gather it and rerun; ask the user only
when a material ownership ambiguity remains. Handle routine assignments without
asking the user. If the decision agent is unavailable, leave changes uncommitted
until it can run; never silently substitute a direct author choice.

## Commit format and scope

- Commit messages must be one line, without coauthor or attribution trailers.
- Create local commits only. Never push to a remote.
- Keep code comments sparse and focused on non-obvious intent.
