# Contributing

The 0.15 architecture keeps Resume Companion focused: a versioned local profile MCP, a TypeScript Resume Browser MCP built on the pinned Chrome DevTools foundation, and an Agent skill that composes both. Browser automation changes should use semantic form primitives and general component behavior instead of recruitment-site selectors or replaying private APIs.

Before a pull request:

~~~sh
npm ci
npm ci --prefix plugins/resume-companion
npm run typecheck
npm run build
npm test
npm run test:core
npm run test:e2e
~~~

Use synthetic data and the local fixture for automated tests. Do not commit real resumes, browser profiles, cookies, tokens, site responses or screenshots containing personal information.

Keep new product code in strict TypeScript. Do not hand-edit generated bundles or the copied upstream runtime. When changing tool permissions, update `.mcp.json`, the skill, security documentation and a policy regression test together. When changing profile data, preserve atomic writes, file permissions, history and revision conflict behavior.

Upstream version upgrades require a deliberate review of CLI options, tool names, schemas, annotations, lifecycle and default browser behavior. Run direct MCP integration tests before changing the pinned version.

The legacy extension and Native Messaging route is frozen at Git tag `archive/extension-0.10.0`; fixes for the current main branch should target the two-MCP architecture.
