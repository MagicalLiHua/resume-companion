# Security

Resume Companion stores profiles in the local MCP data directory. Its browser driver connects to Chrome through the official Chrome DevTools protocol. It does not store model API keys.

Current-Chrome access requires the user to accept Chrome's own remote-debugging prompt. This grants the MCP visibility into pages in that authorized browser context, including their rendered form content. Close the MCP task or Chrome debugging session when it is no longer needed. Resume Companion does not modify the Chrome application bundle and does not require macOS permission to modify applications.

The DevTools driver exposes only an internal allowlist for page enumeration, selection, accessibility snapshots, filling, clicks and key presses. Arbitrary JavaScript evaluation, network inspection, performance tools, file upload, extension management and upstream tool discovery are disabled. A dedicated Chrome profile remains available for users who prefer stronger browser-context isolation.

Profile files are written atomically and use owner-only permissions where supported. They are not encrypted by the application. Protect the operating-system account and disk, choose a suitable RESUME_COMPANION_DATA_DIR, and include the directory in backups intentionally.

The active AI client receives profile fields and webpage excerpts needed for the task. Local storage does not imply offline inference. Review the AI client's data policy before using real personal information.

Browser writes require observed references and current value tokens. Final submission, uploads, CAPTCHAs, passwords, verification codes, declarations and record deletion remain user actions. Unknown write or save results require fresh observation before retrying.

Do not include real resumes, local data directories, browser profiles, exported files, credentials or captured applications in public bug reports. Use synthetic data.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/MagicalLiHua/resume-companion/security/advisories/new).
