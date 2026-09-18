# Security

Resume Companion is local-first, but job applications and resumes contain sensitive personal data. The browser extension stores profiles in Chrome local storage and exposes no remote business backend.

The optional Codex bridge listens only on `127.0.0.1:43117`, accepts the fixed extension origin, and is disabled by default. Origin checking is not strong isolation from a malicious process already running on the same computer. Enable the bridge only on a trusted machine while using Codex, then disable it when it is not needed.

Core tools can save individual records, save drafts and advance ordinary steps within the authorized filling task. Final application submission, uploads, CAPTCHAs, passwords, verification codes and declarations remain user actions. Writes require observed references, current value tokens and source revisions. Cancellation stops pending core actions; an already dispatched save cannot be rolled back by local field undo. Unknown results require fresh observation before retrying. Legacy tools remain for compatibility and keep their existing preview workflow. Necessary profile and page excerpts are sent to the active Codex context.

Do not include real resumes, API keys, exported backups, browser profiles, or captured application pages in bug reports. Reproduce issues with synthetic data whenever possible.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/MagicalLiHua/resume-companion/security/advisories/new). Do not post credentials or personal data in public issues.
