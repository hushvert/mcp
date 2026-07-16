// The version the MCP server reports to clients during the handshake. It must
// track package.json; tests/version.test.ts fails the build if the two drift.
// (It sat at 0.1.0 through the 0.1.1 and 0.1.2 releases before that guard existed.)
export const VERSION = '0.1.3'
