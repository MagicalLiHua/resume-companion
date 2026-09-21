# Store a resume parsed by the host Agent

Use the host Agent's existing PDF/Word reader. ApplyMCP receives explicit facts through its profile tools; it does not parse files. If the host cannot read part of a document, report that gap and retain unknown values. Do not substitute fictional facts or advertise complete extraction.

## Map once, preserve meaning

- Put name, phone and email in `basic`. Reuse them from the resume; ask only for missing or conflicting information. Put job preferences in `intent`.
- Use `education` for each school record. Keep `education_level`, awarded `degree`, `expected_degree`, `completed`, and `study_mode` distinct. In-progress study does not prove an awarded degree. Dates use the precision supported by the tool schema; a month does not establish its first day. Do not infer `completed` solely from an end date.
- Put internships and jobs in `experience`, using the stated `kind`; ambiguous employment type stays unknown. Keep project work in `projects`, with descriptions and responsibilities separate where supplied. Use the named language, award, campus, competition and certificate collections when applicable.
- An omitted section is unknown. Set its `section_status` to `none` only when the user explicitly says they have no such experience. Do not create placeholder records for absent sections.
- Prefer structured fields over copying everything to `source_markdown` or custom answers. Additional explicit facts use canonical supplemental keys from the preparation questions/schema; do not invent a new key to bypass an ambiguous mapping. Keep ordinary source excerpts in `source_markdown` when useful, with original page/paragraph labels only if the reader supplied them.

## Save and update without losing records

1. Call `resume_profile_list` and choose the intended profile; create a new profile only when appropriate. Do not treat an unrelated profile as the user's target.
2. For updates, read the current revision and the sections being changed. Match records using stable IDs and the actual school/employer/project plus dates. Same names alone are insufficient; surface ambiguity instead of silently merging.
3. Call `resume_profile_save` with explicit facts and the exact `expected_revision`. Supplied arrays replace the whole collection: retain all unrelated records and their IDs. Read source text before replacing it, and preserve unrelated useful excerpts. Unknown values are `null`; omit unchanged basic fields rather than clearing them.
4. On a stale revision or an uncertain save response, reread before retrying. Re-importing the same file must not append duplicate records. Never blindly replay a create or array replacement.
5. Use the returned revision to call `resume_prepare`. Follow [profile preparation](profile-preparation.md) to present one combined missing-information sheet and merge explicit answers. Do not ask the user again for facts already saved.

The tool's input schema is authoritative for types and required record members. Give the user a short summary of saved sections, uncertain extraction and remaining questions; do not dump the full profile back into chat.

## Document numbers

Do not request ID/passport numbers in chat or copy them into ordinary `source_markdown`, supplemental fields or preparation answers. The private local-entry feature is pending: leave these items deferred for the user to enter on the website. Phone/email remain ordinary resume facts.

If the user already supplied a file to their Agent, do not claim that its contents never reached the Agent provider. Local storage does not undo earlier processing, and an opaque-looking string alone is not private storage.
