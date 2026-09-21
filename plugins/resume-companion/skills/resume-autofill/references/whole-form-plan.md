# Whole-form plan recipe

Read the resume once and complete the lightweight page catalog. Use its record bindings for existing records, including blank cards. Use `new` only for additional cards. `reveal` applies to an empty optional section; either direct fields or one newly created card can be bound after activation. Never guess record ordinals.

The following is a schema example, not permission to fill these facts. Replace all metadata and facts using the current observation and the user's actual source. Here the user has explicitly authorized changing the experience toggle, and an existing blank education card is available.

```json
{
  "action": "start",
  "request_id": "unique-request-id",
  "defer_execution": true,
  "plan": {
    "schema_version": 1,
    "page_id": 1,
    "navigation_id": "from-observation",
    "observation_id": "from-observation",
    "profile_revision": "pinned-profile-revision-or-source-digest",
    "facts": {
      "school": {"value": "用户提供的学校", "source": "resume.education[0].school"},
      "dates": {"value": {"start": "2020-09", "end": "2024-06"}, "source": "resume.education[0].dates"},
      "hasInternships": {"value": false, "source": "resume.internships contains explicit experience"},
      "company": {"value": "用户提供的实习单位", "source": "resume.internships[0].company"}
    },
    "records": [
      {"id": "education1", "section": "教育经历", "mode": "existing", "binding": "from-observation-record",
        "steps": [
          {"id": "school1", "action": "fill", "field": "学校名称", "source_ref": "school"},
          {"id": "dates1", "action": "date", "field": "起止时间", "source_ref": "dates"}
        ]},
      {"id": "internshipToggle", "section": "实习经历", "mode": "existing", "binding": "from-observation-toggle-record",
        "steps": [{"id": "enableInternships", "action": "fill", "field": "没有实习经历", "source_ref": "hasInternships", "overwrite": true}]},
      {"id": "internship1", "section": "实习经历", "mode": "new",
        "steps": [{"id": "company1", "action": "fill", "field": "公司名称", "source_ref": "company", "depends_on": ["enableInternships"]}]}
    ],
    "unresolved": [{"record_id": "education1", "field": "学院", "status": "missing_information", "reason": "资料未提供学院"}]
  }
}
```

Immediately resume with the returned `run_id`; retain `resume_token` privately for recovery. All explicitly authorized overrides need `overwrite:true`. Keep identity preservation in existing records with `protected_fields`. `depends_on` references step IDs, not record IDs; every step in a card dependent on an experience toggle must reference that prerequisite.

Use observed labels and `input_mode`, not the example's labels: `text`/confirmed `choice_or_custom` → `fill`; `choice` → `select`; `date` → `date`. SD split year/month fields have a parent `date_group`: send the whole range once. Do not map language proficiency to a non-equivalent choice. Record the ambiguity, then continue unrelated steps.

A `partial` result can include all supplied facts verified plus unresolved missing information. Check `counts`, `results`, `page_audit`, `added_records`, `uncertain_adds`, and `unassigned_created_records`; reconcile a local recovery in the final report. Never replay successful records to clear a historical error.

For a searchable name, a select step can set `query_from_value:true` to use its fact as the search query. Set `allow_custom:true` only when the observed field explicitly provides a local custom school/major entry. The executor uses that entry only when no exact ordinary option exists, submits the exact supplied name, and verifies the committed value. This does not permit inventing schools or writing global dictionaries. In individual tools use `query` plus `allow_custom`; never create an extra experience record to handle a missing school candidate.

Moka SD forms can start with one blank card per repeated section: bind each first card as `existing`, then use `new` for additional entries. Use the catalog's actual scopes (`教育背景 / 第1条`, etc.). The observed age-displaying birth picker selects a year and month, not a day; use `YYYY-MM` only after this precision is confirmed. Its age suffix is presentation, not a second fact. Keep locked basic identity fields protected and omit unknown salary fields. A language level still needs an equivalent visible option; do not reuse mappings from another ATS.

Beisen Phoenix forms also reuse their initial blank education, work and project cards. Bind each existing card, then use `new` with the observed section and exact `add_target` (for example `添加教育经历`). Birth date and each separate experience endpoint use `date`; do not merge separate fields into an invented date-group reference. Use the observed precision: a birthday can be `YYYY-MM-DD`, education and work endpoints can be `YYYY-MM`.

Phoenix school autocomplete is a dictionary choice, not ordinary text. Use `select` with the exact supplied name; the transaction searches and clicks the matching candidate, then verifies after blur. A query is not a committed school. When this site's dictionary has no exact match and no visible custom entry, report `option_not_found`; do not substitute a real school for a fictional test name. City and industry multiple selection use a string-array fact and `select`; the transaction checks the pending set, confirms locally, and reads the committed tags. The profession directory can use a scalar fact. Provide an explicit equivalent directory label; do not infer industry or proficiency from a job title. Directory confirmation is handled within the transaction and is distinct from saving or submitting the resume.
