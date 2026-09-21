# WorkBuddy connectors

WorkBuddy limits each connector package to one MCP server, while ApplyMCP intentionally exposes a profile service and a browser service. The release package therefore contains two connectors:

- `applymcp-profile`: local versioned profiles plus the shared `resume-autofill` skill.
- `applymcp-browser`: the dedicated Chrome and recruitment-form tools.

Install both connectors. The source directories contain connector metadata; `npm run package` adds the built bundles, pinned browser runtime and shared skill to the installable release directories.
