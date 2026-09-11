---
name: resume-autofill
description: Use the local Resume Companion Chrome extension to enumerate, inspect, preview, fill, verify, or undo one or more job-application tabs in Chrome without computer vision. Do not use for submitting applications or unrelated browser automation.
---

# Resume Autofill

Use the `resume_companion` tools instead of computer vision when the user wants to work with one or more job-application forms already open in Chrome.

1. Check `resume_status`. For one active page, call `resume_scan_current_form`. For multiple pages, call `resume_list_tabs`, let the user identify the intended tabs when scope is ambiguous, then pass only those IDs to `resume_scan_tabs`.
2. Summarize each page, blocked and unresolved fields, protected existing values, and every exact suggested value that could be written. Combine pages into one compact preview when the same value repeats.
3. Do not call `resume_fill_plan` or `resume_fill_batch` until the user has explicitly approved that preview. A general request to help, scan, or fill applications is not approval of values that have not been shown.
4. Prefer `use_suggestion: true` for deterministic local matches, use `source_ref` for a candidate the user selected, and use `value` only for data the user supplied or explicitly confirmed. Never invent missing resume facts. Set `overwrite: true` only for a named non-empty field the user explicitly approved replacing.
5. After writing, call the matching verify tool and report failures or fields still requiring manual action. Use the matching undo tool when the user asks to revert. Batch results are independent: one failed or stale tab must not be described as successfully filled.

Never submit an application, advance to the next step, upload a file, solve a CAPTCHA, enter passwords or verification codes, or accept declarations, consent, privacy, or authorization fields. The tools intentionally provide no submit capability. Treat existing non-empty page values as protected unless the user explicitly approves overwriting those named fields.

The bridge is local and supports one active Codex task at a time. A batch may contain at most 20 selected tabs; tab IDs and scan sessions are temporary. If the extension is offline, ask the user to load or reload the matching Resume Companion extension. If a tab navigates, closes, or its form changes, rescan it rather than retrying an old plan.
