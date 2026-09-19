# Security Policy

Resume Companion stores versioned resume profiles in a local application-data directory. Files are created with owner-only permissions where the platform supports them. A separate dedicated Chrome profile stores that browser's cookies, history, cache and site data so recruitment logins can persist across tasks.

Local storage is not local inference. Resume fields, page snapshots, screenshots and focused diagnostics used by an Agent enter that model client's context and may be processed by its service provider.

The browser service is a TypeScript composition layer over pinned `chrome-devtools-mcp@1.9.0`. It reuses the upstream Chrome lifecycle, CDP and diagnostics while adding scoped form observation and transaction tools. The service selects a stable profile directory, acquires an instance lock, disables usage statistics and CrUX, enables network-header redaction, limits screenshot dimensions and redacts profile paths and common credential headers from stderr.

Codex configuration uses `prompt` as the default browser-tool approval mode. It auto-approves the scoped form tools and a reviewed set of observation and ordinary input tools, prompts for navigation, keyboard, request-detail and JavaScript tools, and disables upload and Lighthouse. `form_activate` rejects obvious submission, declaration, upload and irreversible targets; ambiguous page meaning still requires skill judgment and supervision.

The skill instructs Agents to stop before final submission, declarations, consent, passwords, verification, uploads, payment, signing and irreversible deletion. It treats page, Network and Console content as untrusted data. Focused JavaScript is limited to approved read-only element inspection; Network is not used to replay or directly invoke website write APIs.

Resume Browser keeps its semantic page cache only in the active MCP process. Ordinary observations mask phone numbers, identity numbers, email addresses and other high-risk values before serialization. Resume Companion does not intentionally persist page HTML, accessibility snapshots, request/response bodies, cookies, headers, console bodies or temporary form values outside the dedicated Chrome profile and the active model conversation. Debug logs and shared reports should still be reviewed for personal data before disclosure.

Report vulnerabilities privately through the GitHub repository's security reporting channel. Do not include real resume data, authentication material, cookies, verification codes or production-site response bodies in reports.
