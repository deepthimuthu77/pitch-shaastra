# Commit and review ownership

Commits identify the person responsible for reviewing and maintaining that feature.
Ownership follows related code, rather than alternating names on unrelated commits.

- Give each coherent feature or module a stable key and register its files or directories.
- Keep fixes, tests, quality improvements, and refactors under its existing owner.
- Assign new independent work to the person with less assigned review effort. When effort
  is tied, select 1 or 2 using a computer-time-seeded random integer modulo 2.
- Use a consistent estimate of review effort in the registry. These are planning weights,
  not measured working hours or commit counts. Related work takes precedence over balance.
- If a change touches scopes belonging to both people, split it into separate commits.
  Shared integration changes need an explicit feature owner; avoid claiming the entire repo.
- Keep commit messages to one line without attribution trailers. Keep commits local.

Use the compact decision-agent prompt in `prompts/commit-owner.md` with the proposed
diff, feature key, registry, and recent local history. Its only job is to choose the
owner or flag a change that needs splitting. Run it with the lowest-cost agent
available for this narrow task; it does not need the full implementation context.

The committing agent applies that decision and updates `review-ownership.json` in
the same commit. Use the chosen identity for both Git author and committer. Preserve
existing feature owners when fixes or quality improvements arrive later.
Registry entries are shared bookkeeping; updating one feature does not transfer
responsibility for another entry or require a mixed-owner commit.

The two identities are:

- `soumik15630m <soumik15630m@gmail.com>`
- `deepthimuthu77 <deepthimuthu77@gmail.com>`
