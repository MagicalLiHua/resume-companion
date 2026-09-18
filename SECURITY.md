# Security

Resume Companion stores profiles in the local MCP data directory. The Chrome extension stores only its bridge setting and temporary operation metadata; it does not store resume text or model API keys.

The bridge listens on 127.0.0.1:43117, accepts the fixed extension origin, and is disabled by default. Origin checking is not strong isolation from malicious software already running under the same local account. Enable it only on a trusted machine.

Profile files are written atomically and use owner-only permissions where supported. They are not encrypted by the application. Protect the operating-system account and disk, choose a suitable RESUME_COMPANION_DATA_DIR, and include the directory in backups intentionally.

The active AI client receives profile fields and webpage excerpts needed for the task. Local storage does not imply offline inference. Review the AI client's data policy before using real personal information.

Browser writes require observed references and current value tokens. Final submission, uploads, CAPTCHAs, passwords, verification codes, declarations and record deletion remain user actions. Unknown write or save results require fresh observation before retrying.

Do not include real resumes, local data directories, browser profiles, exported files, credentials or captured applications in public bug reports. Use synthetic data.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/MagicalLiHua/resume-companion/security/advisories/new).
