# Security

Resume Companion is local-first, but job applications and resumes contain sensitive personal data. The browser extension stores profiles in Chrome local storage and exposes no remote business backend.

The optional Codex bridge listens only on `127.0.0.1:43117`, accepts the fixed extension origin, and is disabled by default. Origin checking is not strong isolation from a malicious process already running on the same computer. Enable the bridge only on a trusted machine while using Codex, then disable it when it is not needed.

The Codex tools cannot submit applications, advance application steps, upload files, solve CAPTCHAs, enter passwords or verification codes, or accept declarations and consent fields. Existing non-empty values require explicit overwrite approval. A changed page, form structure, or resume revision invalidates the previous plan.

Do not include real resumes, API keys, exported backups, browser profiles, or captured application pages in bug reports. Reproduce issues with synthetic data whenever possible.
