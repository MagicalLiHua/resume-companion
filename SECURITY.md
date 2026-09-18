# Security

Resume Companion stores resume profiles in the local MCP data directory. The Chrome extension does not store resume profiles, cookies, page bodies, form values, model API keys, or browser credentials.

The default browser driver uses Chrome Native Messaging. Chrome accepts only the registered host `com.resume_companion.bridge`, and the native host accepts only the repository's fixed extension origin. The MCP creates an owner-only connection descriptor containing a short-lived random token and a private Unix socket or Windows Named Pipe. The native host validates the descriptor permissions, protocol version, token, origin, and expiration before forwarding any message. No fixed localhost TCP port is opened.

Bridge messages are capped at 512 KiB and use a versioned allowlist of methods. Request identifiers, deadlines, cancellation, operation deduplication, current-value tokens, and readback limit accidental replay. Disconnects cancel pending work, detach debugger sessions, and clear transport state so the next call can create a fresh connection. Diagnostics expose stable error codes and do not log cookies, authorization headers, page content, form values, connection tokens, or DevTools WebSocket endpoints.

The extension requests access to ordinary HTTP/HTTPS pages, Native Messaging, tabs, scripting, alarms, storage, and `chrome.debugger`. The debugger API is attached only to the selected tab when trusted click or key input is needed; pause and disconnect paths detach active sessions. The MCP does not expose arbitrary JavaScript evaluation, CSS/XPath selectors, network inspection, file upload, extension management, or the upstream DevTools tool catalog to the model.

The explicit DevTools fallback uses the pinned official Chrome DevTools MCP runtime. Its dedicated profile lives under the Resume Companion data directory and keeps that profile's sessions across launches. Experimental current-Chrome attachment may depend on Chrome's remote-debugging authorization and a readable `DevToolsActivePort`; it is not the default browser route.

Profile files are written atomically and use owner-only permissions where supported. They are not encrypted by the application. Protect the operating-system account and disk, choose a suitable `RESUME_COMPANION_DATA_DIR`, and include the directory in backups intentionally.

The active AI client receives profile fields and webpage excerpts needed for the task. Local storage does not imply offline inference. Review the AI client's data policy before using real personal information.

Browser writes require observed references and current value tokens. Final submission, uploads, CAPTCHAs, passwords, verification codes, declarations, consent, and record deletion remain user actions. Unknown write or save results require fresh observation before retrying.

Do not include real resumes, local data directories, browser profiles, exported files, credentials, cookies, captured applications, or connection descriptors in public bug reports. Use synthetic data.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/MagicalLiHua/resume-companion/security/advisories/new).
