// Library entry. The package is primarily the `hushvert-mcp` binary, but the
// server factory and client are exported so they can be embedded or driven by a
// test harness over an in-memory transport.

export { createServer } from './server'
export { loadConfig, type Config } from './config'
export { HushvertClient } from './api'
export type { SubmitResult, StatusResult, UsageResult, FormatsResult, FormatPair } from './api'
export { HushvertApiError, agentMessage } from './errors'
export {
  convertFile,
  convertPoll,
  listFormats,
  checkUsage,
  type ConvertContext,
  type ConvertFileArgs,
  type ConvertPollArgs,
  type ToolResult,
} from './tools'
export { buildPairSlug, inferFormatFromPath, normalizeFormatId } from './formats'
