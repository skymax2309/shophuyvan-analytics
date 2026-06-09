import assert from 'node:assert/strict'
import {
  approveAiSuggestion,
  listKnowledgeEntries,
  listLearningAuditLogs,
  saveKnowledgeEntry,
  updateKnowledgeEntry
} from '../apps/chat-worker-api/src/core/ai-knowledge-core.js'
import { sanitizeApprovedLearningPair } from '../apps/chat-worker-api/src/core/ai-learning-sanitize-core.js'

const privatePair = sanitizeApprovedLearningPair({
  question: 'Em là Nguyễn Văn An, số 0909128999, email an@example.com, nhận tại 12 Nguyễn Trãi, Hà Nội.',
  answer: 'Shop gửi thông tin qua https://shophuyvan.vn và mã đơn 260525BY4BCTM7 nhé.',
  private_values: ['Nguyễn Văn An']
})

assert.equal(privatePair.ok, true)
assert.equal(privatePair.question.includes('0909128999'), false)
assert.equal(privatePair.question.includes('an@example.com'), false)
assert.equal(privatePair.question.includes('Nguyễn Văn An'), false)
assert.equal(privatePair.answer.includes('https://shophuyvan.vn'), false)
assert.equal(privatePair.answer.includes('260525BY4BCTM7'), false)
assert.equal(privatePair.pii_redacted_count >= 5, true)

const env = {
  __CHAT_CORE_MEMORY: {
    conversations: [{
      id: 'conv_1',
      channel: 'zalo',
      shop_id: 'zalo_shop_huy_van',
      customer_id: 'customer_123',
      customer_name: 'Nguyễn Văn An'
    }],
    messages: [{
      id: 'msg_customer_1',
      conversation_id: 'conv_1',
      sender_type: 'customer',
      text: 'Em là Nguyễn Văn An, số 0909128999, shop kiểm tra đơn 260525BY4BCTM7 giúp em.'
    }, {
      id: 'msg_shop_1',
      conversation_id: 'conv_1',
      sender_type: 'shop',
      status: 'sent',
      text: 'Dạ shop sẽ kiểm tra đơn 260525BY4BCTM7 và phản hồi qua an@example.com.'
    }],
    ai_suggestions: [{
      id: 'ai_1',
      conversation_id: 'conv_1',
      message_id: 'msg_customer_1',
      suggested_text: 'Dạ shop kiểm tra giúp mình.',
      prompt_context: {
        simple_intent: { intent: 'order_status_simple', simple: true },
        agent_source_labels: ['Đơn hàng đã kiểm', 'Câu trả lời đã duyệt']
      },
      final_state: 'draft'
    }],
    ai_knowledge_base: []
  }
}

const approved = await approveAiSuggestion(env, {
  suggestion_id: 'ai_1',
  approved_answer: 'Dạ shop sẽ kiểm tra đơn 260525BY4BCTM7 và phản hồi qua an@example.com.',
  approved_message_id: 'msg_shop_1',
  approved_by: 'operator',
  save_to_knowledge: true
})

assert.equal(approved.ok, true)
assert.equal(approved.knowledge.intent, 'order_status_simple')
assert.deepEqual(approved.knowledge.source_tags, ['Đơn hàng đã kiểm', 'Câu trả lời đã duyệt'])
assert.equal(approved.knowledge.suggestion_id, 'ai_1')
assert.equal(approved.knowledge.conversation_id, 'conv_1')
assert.equal(approved.knowledge.source_message_id, 'msg_customer_1')
assert.equal(approved.knowledge.question.includes('0909128999'), false)
assert.equal(approved.knowledge.answer.includes('an@example.com'), false)
assert.equal(approved.knowledge.status, 'active')

const duplicate = await approveAiSuggestion(env, {
  suggestion_id: 'ai_1',
  approved_answer: 'Dạ shop sẽ kiểm tra đơn 260525BY4BCTM7 và phản hồi qua an@example.com.',
  approved_message_id: 'msg_shop_1',
  approved_by: 'operator',
  save_to_knowledge: true
})
assert.equal(duplicate.ok, true)
assert.equal((await listKnowledgeEntries(env, { include_disabled: true })).length, 1)

const entryId = approved.knowledge.id
const disabled = await updateKnowledgeEntry(env, entryId, {
  status: 'disabled',
  approved_by: 'operator'
})
assert.equal(disabled.ok, true)
assert.equal((await listKnowledgeEntries(env)).length, 0)
assert.equal((await listKnowledgeEntries(env, { include_disabled: true })).length, 1)

const edited = await updateKnowledgeEntry(env, entryId, {
  question: 'Khách hỏi số 0912345678 về đơn 260525BY4BCTM7',
  answer: 'Dạ shop kiểm tra tại https://shophuyvan.vn.',
  status: 'active',
  approved_by: 'operator'
})
assert.equal(edited.ok, true)
assert.equal(edited.entry.question.includes('0912345678'), false)
assert.equal(edited.entry.answer.includes('https://shophuyvan.vn'), false)

const manual = await saveKnowledgeEntry(env, {
  question: 'Shop có hỗ trợ giao nhanh không?',
  answer: 'Dạ shop sẽ kiểm tra thời gian giao dự kiến giúp mình.',
  source: 'manual',
  approved_by: 'operator'
})
assert.equal(manual.ok, true)

const audit = await listLearningAuditLogs(env, { limit: 20 })
assert.equal(audit.some(item => item.action === 'approved_learning_saved'), true)
assert.equal(audit.some(item => item.action === 'knowledge_disabled'), true)
assert.equal(audit.some(item => item.action === 'knowledge_updated'), true)
assert.equal(audit.every(item => !String(item.question_preview || '').includes('0909128999')), true)

console.log('chat AI approved learning guard passed')
