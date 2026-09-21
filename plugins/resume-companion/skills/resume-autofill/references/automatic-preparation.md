# Automatic preparation (0.24)

Run `form_support` for the intended pages first. Its capability catalog is authoritative for normal product use. It requires both a trusted platform origin and the expected structural form family. `verified_template` identifies an employer sample with direct evidence; `compatible_platform` means the page may reuse the platform rules only for fields recognized by the live scan. If `autofill_allowed=false`, report the differences and stop writes. A `platform_candidate` is never writable until its origin is added to the trusted platform directory. 51job remains exact-template gated and Jiangsu-bank remains in development. The notes below never override this check. `form_prepare` repeats the check and returns no executable plan on failure; explicit plans and raw tools also enforce it.

Normalize the user's explicit facts once into the selected local profile. Do not repeatedly extract a resume or hand-write every browser step. A free-form `source_markdown` alone is not a structured profile: read and organize it once; the deterministic compiler does not reinterpret prose or resolve contradictions with it.

Schema 1.2 reads older 1.1 profiles without rewriting them. New fields include basic gender/birth_date/employment_status/highest_education/recent_company/self_description/portfolio_url; education college/description/gpa; experience description; project description/responsibilities/url; intent cities, current_salary, expected_salary, available_date, industry, occupation; languages, awards, competitions, campus and certificate description. Old arrays and record IDs remain intact. Dates retain supplied precision. A salary is `{amount,currency,period:"month"|"year",tax:"before"|"after"|"unknown",benefits:"included"|"excluded"|"unknown"}`. Never divide annual salary into monthly salary or infer tax treatment. A single overall language level does not supply speaking and writing levels.

`section_status` has education/work/internships/projects/languages/awards/certificates/competitions/campus keys. Each defaults to `unknown`; `none` means the user explicitly says there are no such experiences; `provided` requires records. Nonempty records imply provided for planning. `[]` does not imply none. Contradictory none-plus-records fails validation. Never add optional blank records just because the employer exposes that section. Existing unrelated records are preserved.

1. Select the intended dedicated browser page and profile/revision.
2. Call `form_prepare({page_id,profile_id,expected_revision,test_mode?})`. The service reads the full form internally; a separate full observe is unnecessary.
3. Review the compact summary. `module_selection` lists each live module, its profile sources and state, the decision, and planned record/step counts. `profile_only_sections` and `no_page_section` mean this employer does not expose that profile content; `not_provided` means no source facts; `explicit_none` means confirmed absence. Unknown custom fields, source conflicts, ambiguous existing records and incompatible choices remain explicit differences. Pagination: `form_prepare({action:"inspect",prepared_plan_id,offset:next_offset})`.
4. Call `form_run({action:"start",request_id,prepared_plan_id})`. It defaults to deferred execution, returning recovery credentials; immediately `resume` that run. Keep the resume token private. Continue paused windows under the existing budget.
5. Review final verification, all preparation differences, and page audit. New hidden fields may only become observable after record creation. `deferred_steps` are candidates for these records: the executor binds the real controls first. `not_exposed` / `page_field_absent` means this employer has no such field; no input was dispatched and there is nothing to retry. It is separate from `verified_ui`, ambiguous targets, and unsupported controls. A newly added record with no verified fields stays incomplete. A successful subset does not establish full coverage or persistence.

Policies are scoped: `policy.overwrite_fields:[{section,field}]` only for authorized ordinary value replacements. `policy.records:"append"` permits adding alongside unmatched existing experiences; default preserves them and reports ambiguity. Neither grants identity replacement or submission. Known negative-experience toggles can change when explicit source facts require it and there are no conflicting existing records; absent source facts never change them.

For a known employer field whose controls are covered but whose fact mapping is absent, save the explicit answer and pass `policy.bindings:[{scope,field,source_ref}]`. This only binds a unique currently observed field to an existing profile fact; it cannot make an unknown template or newly introduced question supported. It does not accept inline facts, scripts, selectors, automatic mapping overrides, or answers to employer-relative questions. Re-prepare after updating the source revision. Unknown questions remain unknown.

Prepared plans expire after 10 minutes, connection/lease loss or restart. A navigation or change to fields/values prevents execution. A changed profile revision stops later records. Reprepare from current state; do not replay the whole previous run. A preparation ID is not a resume token. Profile MCP and Browser MCP must use the same `RESUME_COMPANION_DATA_DIR`.

Rules describe supported controls and aliases, not a universal module checklist for an ATS. The current employer's live modules decide the target set. Beisen/Phoenix work+internship records share work only when no separate internship module is exposed. Missing modules, extra questions and unsupported controls remain differences. School/occupation catalogs still require actual equivalent options; never substitute a real school for a virtual one to claim completion.


## Dayee and 51job development adapters

Adapters reuse platform rules only inside the trusted origin directory and only when the live structural family matches. This is compatible ordinary filling, not evidence that every company variation or persistence path has been verified. Dayee uses `form_prepare` → `form_run` for long forms. School/major dictionary choices must be committed in their own modal; typing a query alone is not success. Family and research records require independent explicit facts; ordinary projects never imply research and omitted relatives never imply “none”.

For the observed 51job legacy resume workflow:

```text
form_journey(action="start", request_id="unique-request", page_id=..., profile_id=..., expected_revision=...)
form_journey(action="resume", journey_id=...)
```

Start is read-only and returns a private resume_token. Resume fills and verifies each current page, then clicks a confirmed ordinary Next, which may save that page. Continue `paused_window` with the same journey_id. The coordinator pins the company, application address, step list and profile revision; same-URL postbacks still get fresh bindings. It stops before final submission, declarations, required attachments or unresolved information. An explicitly optional attachment page can be skipped only when the UI says so. `ready_for_review` means planned UI values were verified through the last accessible page; it does not prove a saved/submitted application.

`transition_result_unknown` is never permission to repeat Next. Use status/current observation to reconcile; a later resume can accept the expected successor if it finally appears. Missing facts require a profile update and a new journey from the current page. A process/browser restart invalidates process-local checkpoints. A different connection requires the private resume_token and an explicitly authorized browser takeover; the token must not appear in reports.

51job's My97 date controls may require YYYY-MM-DD even if the resume only has YYYY-MM. Report `date_precision_required`; never invent the first/last day. Store explicit full dates as `education.<record-id>.end_date` or `internships.<record-id>.start_date/end_date` / `work.<record-id>.start_date/end_date`; their month must agree with the existing structured month. Fixed highest/other education slots are ordered only when the supplied degree levels identify a unique highest record. School/major custom names use the page's explicit Other choice and companion field, only after the dictionary explicitly reports no exact match.

## Canonical supplementary facts

Use `supplemental_fields` with unique field_key, a user-facing label and the user's explicit value. Existing structured facts take priority and contradictions stop preparation. Do not infer these values from labels alone. All entries remain in the existing local profile format; this is not a secret vault and does not make plaintext invisible to the model.

| field_key pattern | Explicit facts |
| --- | --- |
| `basic.<key>` | political_status, ethnicity, marital_status, health_status, residence_province, residence_city, native_province, native_city, target_province, target_city, phone_country, identity_type, identity_number, training_mode, highest_school, highest_major, graduation_date, major_rank, scholarship_status, failed_courses, interview_location, recruitment_channel, veteran_status, applicant_type |
| `education.<record-id>.<key>` | city_province, city, full_time, enrollment_mode, major_rank, campus_role, courses, start_date, end_date |
| `internships.<record-id>.<key>` / `work.<record-id>.<key>` | company_type, company_size, role_category, start_date, end_date |
| `languages.<record-id>.<key>` | score, exam_id, exam_month, report_number, toefl_score, ielts_score, testdaf_score, dsh_score, other_scores |
| `family.<record-id>.<key>` | name, relation, phone, birth_date, organization, role, address, status |
| `research.<record-id>.<key>` | name, start, end, participation, supervisor, description |
| `it_skills.<record-id>.<key>` | category, name, overall |
| `section_status.family` / `section_status.research` / `section_status.it_skills` | `none` only after an explicit statement of absence and no corresponding records |

The record-id is the existing profile record ID for education/experience/languages; extension records use a stable ASCII ID chosen when organizing the facts. Do not convert a general skills list into employer dictionary proficiency ratings. Only ask for supplementary fields relevant to the user's actual experiences and supported employer requirements, consolidating them into the initial information table whenever possible. A company may omit modules or add unrecognized questions; retain those as explicit differences.

Dayee major dictionary entries can include discipline, education type and region, such as `软件工程(计算机类)(普通本科)(中国大陆)`. Category names are not selectable facts. If only a short major name is supplied and no unique exact catalog entry exists, show the qualified candidates for confirmation and store the confirmed label; do not choose another discipline/level silently. The observed FAW family module exposes two blank cards on its first Add; the automatic runner claims those cards before adding more and reports an unused site-created card separately.

FAW Dayee experience calendars also require complete dates. Use explicit `<section>.<record-id>.start_date/end_date` (including projects and research) matching the structured month. “是否全日制” can use an explicit full_time/part_time study-mode fact; “学习形式” requires a separate enrollment_mode answer (统招/非统招). Never infer unified admission from full-time study.

## Guopin module saves

On the verified Guopin editor, use `form_journey` with the same start/resume protocol after ordinary draft saves are authorized. It opens one available module/editor, compiles and verifies that record locally, saves once, and checks its saved preview before continuing. Do not add all records first. The current six-module scope is intent, education, work/internships, projects, self-description and certificates. Existing account basic information is preserved; a newly opened basic-information editor or another unverified module fails support preflight. Attachments and final submission remain manual.

Supply only source-backed facts for modules actually provided by the user. Company size needs an explicit headcount for strict observed bands; monthly salary is stored in yuan and converted to the input's thousand-yuan unit. Intent `salary_min`/`salary_max` are explicit yuan amounts. `position_path`, `location_path`, `industry_path`, and education `degree_path` are JSON string arrays of complete displayed taxonomy segments. Do not split a literal slash within a category name. `guopin_major_category` holds the complete displayed path; school and major names still need committed exact search results. Education condition fields are executed first and the remaining editor is re-prepared locally.

`basic.guopin_certificate_paths` is a JSON array of full paths, each with segments separated by ` / `, such as `["英语类 / 全国性英语等级考试 / 大学英语六级CET6"]`. These are explicit equivalents of the user's actual certificates, never extra credentials. The executor verifies every branch and stages the multi-selection; the journey owns Confirm and checks the saved preview. Duplicate leaf names across paths are ambiguous. The current driver preserves unrelated existing certificates.

`saved_preview_verified` means the newly saved preview appeared, not refresh persistence. `existing_record_preserved` means an existing record was retained, not independently revalidated or rewritten. Read `detail="module_records"` for record results and `manual_tasks` for pending user items. Authentication expiry stops writes; after user login, reconcile a pending save before retrying. Never repeat an uncertain Save or Add. Unknown modules, current-employment date branches and blank account basic information remain outside the accepted scope.
