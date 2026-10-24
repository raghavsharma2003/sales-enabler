# Inbox

Subagents and workflows write proposed context here as `<name>.json` = `{"nodes": [...], "edges": [...], "events": [...]}`;
the main loop merges with `npm run context -- --merge context/inbox/<name>.json` (schema-checked, duplicate ids skipped),
runs `npm run context:check`, then deletes the merged file. See `context/PROTOCOL.md`.
