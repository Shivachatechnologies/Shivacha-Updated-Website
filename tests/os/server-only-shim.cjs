// Lets server-only modules load in node:test outside the React Server runtime (tests only).
const id = require.resolve("server-only");
require.cache[id] = { id, filename: id, loaded: true, exports: {} };
