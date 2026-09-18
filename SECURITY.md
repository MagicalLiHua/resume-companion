# Security Policy

Resume Companion stores versioned resume profiles in a local application-data directory. Files are created with owner-only permissions where the platform supports them. A separate dedicated Chrome profile stores that browser's cookies, history, cache and site data so recruitment logins can persist across tasks.

Local storage is not local inference. Resume fields, page snapshots, screenshots and focused diagnostics used by an Agent enter that model client's context and may be processed by its service provider.

The browser service is the pinned official `chrome-devtools-mcp@1.9.0`, launched through a thin TypeScript wrapper. The wrapper selects a stable profile directory, acquires an instance lock, disables usage statistics and CrUX, enables network-header redaction, limits screenshot dimensions and redacts profile paths and common credential headers from stderr. It does not proxy or reinterpret the upstream MCP protocol.

Codex configuration uses `prompt` as the default browser-tool approval mode. It auto-approves a reviewed set of observation and ordinary input tools, prompts for navigation, keyboard, request-detail and JavaScript tools, and disables upload and Lighthouse. Tool-name approval cannot enforce a parameter-level final-submit boundary; this release is intended for supervised use.

The skill instructs Agents to stop before final submission, declarations, consent, passwords, verification, uploads, payment, signing and irreversible deletion. It treats page, Network and Console content as untrusted data. Focused JavaScript is limited to approved read-only element inspection; Network is not used to replay or directly invoke website write APIs.

Resume Companion does not intentionally persist page HTML, accessibility snapshots, request/response bodies, cookies, headers, console bodies or temporary form values outside the dedicated Chrome profile and the active model conversation. Debug logs and shared reports should still be reviewed for personal data before disclosure.

Report vulnerabilities privately through the GitHub repository's security reporting channel. Do not include real resume data, authentication material, cookies, verification codes or production-site response bodies in reports.
