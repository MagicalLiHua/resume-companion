# One-time profile preparation

Use `resume_prepare({profile_id,expected_revision})` after known facts are stored. It reads only the selected local profile and uses a union of mapped requirements from verified employer templates. Requirements describe possible needs, not universal mandatory fields. It excludes templates still in development, employer-relative declarations and uploads.

Collect pages with `offset=next_offset`, the same revision and `expected_questionnaire_id`. Present one combined readable Markdown sheet to the user; do not display internal question IDs or turn every question into a separate chat round. The structured `items` provide IDs, record IDs, input format and uses for matching their numbered answers. A same-name school or employer never identifies a record on its own. Use the record ID.

Preserve the returned `catalog_version` and `questionnaire_id`. Merge only explicitly answered items with `resume_prepare_apply({profile_id,expected_revision,catalog_version,questionnaire_id,answers:[{question_id,action:"set",value:...}]})`. The whole batch validates before one revisioned save; untouched records remain intact. Use the returned revision afterward. On `profile_changed`, `catalog_changed` or `questionnaire_changed`, regenerate and rematch explicit answers; never blindly retry the old payload or invent missing facts.

- `none` applies only to a section with no records and an explicit “没有”. An omitted section remains unknown.
- `not_applicable`, `withheld`, and `deferred` record user decisions without creating a website answer. They are omitted from subsequent default sheets. Inspect with `include_marked=true`; `reopen` asks again only at the user's request.
- When the user says they have an unknown experience, collect their records in the same reply and save them through `resume_profile_save`, preserving all existing array entries and IDs. Then regenerate at the new revision. Do not create empty experiences or mark `provided` without records.
- Phone/email use existing resume facts. Ask only if absent. `local_only` identity/certificate-number items must not be passed to this tool as plaintext. The local private-entry feature is pending; mark deferred or leave it for the user rather than claiming a hidden-secret workflow is available.
- Salaries use the listed structured format, retaining currency, period, tax and benefit status. Do not equate expected and awarded degrees or substitute approximate dropdown options.

For a later employer-specific check, use `scope="selected_modules", targets:[{template_id,modules:[...]}]` from a successful live support check, not from a guessed domain. This filter does not shrink the first-time all-supported preparation sheet. Carry the same scope/targets into `resume_prepare_apply`.

If a website requires a fact the user marked withheld/not applicable/deferred, report that conflict and leave it blank. Planning reports `user_withheld`, `user_not_applicable` or `user_deferred` where mapped; do not silently convert that decision to “否” or repeatedly demand the same answer. A completed questionnaire is not a saved application and cannot promise zero future manual steps.
