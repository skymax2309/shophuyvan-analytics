import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const bridgePath = process.env.ZALO_HELPER_BRIDGE_PATH || 'E:\\tool zalo\\src\\services\\shophuyvanChatBridge.js'
const { buildZaloBrowserHelperPayload } = await import(pathToFileURL(bridgePath).href)

const payload = buildZaloBrowserHelperPayload({
  account: { id: 'acc_test', name: 'Nghiem Chi Huy', phone: '0848881111' },
  conversations: [{ id: '6975238965683388769', title: 'Suleo Vina', lastMessage: 'U' }],
  messagesByConversation: {
    '6975238965683388769': [
      { direction: 'out', senderName: 'Nghiem Chi Huy', text: 'viet nam ban nhieu vay', dateText: '02/06/2026', atText: '11:52' },
      { direction: 'out', senderName: 'Nghiem Chi Huy', text: 'dat ve chac hon 700k', dateText: '02/06/2026', atText: '11:52' },
      { direction: 'in', senderName: 'Suleo Vina', text: '1 cu', dateText: '02/06/2026', atText: '11:52' },
      { direction: 'in', senderName: 'Suleo Vina', text: 'Vay thoi', dateText: '02/06/2026', atText: '11:52' }
    ]
  }
})

const messages = payload.conversations[0]?.messages || []
assert.equal(messages.length, 4)
assert.deepEqual(messages.map(item => item.text), [
  'viet nam ban nhieu vay',
  'dat ve chac hon 700k',
  '1 cu',
  'Vay thoi'
])

for (let index = 1; index < messages.length; index += 1) {
  assert.ok(
    Date.parse(messages[index].created_at) > Date.parse(messages[index - 1].created_at),
    `message ${index} should sort after previous message`
  )
}

assert.ok(messages.every(item => item.created_at.startsWith('2026-06-02T04:52:00.')))
