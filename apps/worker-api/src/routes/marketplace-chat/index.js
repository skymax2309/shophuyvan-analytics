// NEO: Route wrapper backend chat sàn, export hàm cho index và core khác không trùng tên frontend.
import '../worker-chat-marketplace/worker-chat-index.js'

export async function ensureProductKnowledgeTables(...args) {
  return globalThis.ensureProductKnowledgeTables(...args)
}

export async function ensureChatTables(...args) {
  return globalThis.ensureChatTables(...args)
}

export async function saveProductKnowledgeBatch(...args) {
  return globalThis.saveProductKnowledgeBatch(...args)
}

export async function notifyOrderSubscribers(...args) {
  return globalThis.notifyOrderSubscribers(...args)
}

export async function notifyChatSubscribers(...args) {
  return globalThis.notifyChatSubscribers(...args)
}

export async function runChatAiAutoReplyBatch(...args) {
  return globalThis.runChatAiAutoReplyBatch(...args)
}

export function extractChatMessageFromWebhook(...args) {
  return globalThis.extractChatMessageFromWebhook(...args)
}

export async function recordChatWebhook(...args) {
  return globalThis.recordChatWebhook(...args)
}

export async function handleChat(...args) {
  return globalThis.handleChat(...args)
}
