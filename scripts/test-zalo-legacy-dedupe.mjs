import { compactLegacyZaloBrowserAliases } from '../apps/chat-worker-api/src/core/zalo-legacy-dedupe-core.js'

function zaloMessage(overrides = {}) {
  return {
    id: overrides.id || 'msg_default',
    channel: 'zalo',
    source: 'zalo_local_browser',
    conversation_id: 'conv_zalo_test',
    sender_type: overrides.senderType || 'customer',
    text: overrides.text || '[Hinh anh]',
    attachments: overrides.attachments || [{
      id: overrides.attachmentId || 'att_default',
      type: 'image',
      url: 'data:image/png;base64,stable-image-content',
      source: 'chat_core'
    }],
    platform_message_id: overrides.platformMessageId || 'zalo_local_conv_zalo_test_in_15:51_u8aw8k',
    created_at: overrides.createdAt || '2026-05-30T08:51:00.000Z'
  }
}

const imageAliasRows = compactLegacyZaloBrowserAliases([
  zaloMessage({
    id: 'msg_original',
    attachmentId: 'att_first_scan',
    platformMessageId: 'zalo_local_conv_zalo_test_in_15:51_u8aw8k'
  }),
  zaloMessage({
    id: 'msg_date_unknown_alias',
    attachmentId: 'att_second_scan',
    platformMessageId: 'zalo_local_conv_zalo_test_in_date_unknown_15:51_u8aw8k',
    createdAt: '2026-05-31T08:51:00.000Z'
  })
])

if (imageAliasRows.length !== 1 || imageAliasRows[0].id !== 'msg_original') {
  throw new Error(`zalo_image_alias_not_compacted:${imageAliasRows.map(item => item.id).join(',')}`)
}

const explicitDifferentDates = compactLegacyZaloBrowserAliases([
  zaloMessage({
    id: 'msg_may_30',
    platformMessageId: 'zalo_local_conv_zalo_test_in_30/05/2026_15:51_u8aw8k'
  }),
  zaloMessage({
    id: 'msg_may_31',
    platformMessageId: 'zalo_local_conv_zalo_test_in_31/05/2026_15:51_u8aw8k',
    createdAt: '2026-05-31T08:51:00.000Z'
  })
])

if (explicitDifferentDates.length !== 2) {
  throw new Error(`zalo_explicit_dates_must_remain_distinct:${explicitDifferentDates.length}`)
}

const explicitPreferredOverUnknown = compactLegacyZaloBrowserAliases([
  zaloMessage({
    id: 'msg_unknown',
    platformMessageId: 'zalo_local_conv_zalo_test_in_date_unknown_15:51_u8aw8k'
  }),
  zaloMessage({
    id: 'msg_explicit',
    platformMessageId: 'zalo_local_conv_zalo_test_in_30/05/2026_15:51_u8aw8k'
  })
])

if (explicitPreferredOverUnknown.length !== 1 || explicitPreferredOverUnknown[0].id !== 'msg_explicit') {
  throw new Error('zalo_explicit_date_must_replace_unknown_alias')
}

const explicitDirectionPreferred = compactLegacyZaloBrowserAliases([
  zaloMessage({
    id: 'msg_stale_customer_direction',
    platformMessageId: 'zalo_local_conv_zalo_test_in_15:52_22pyg',
    text: 'quên',
    attachments: []
  }),
  zaloMessage({
    id: 'msg_explicit_shop_direction',
    platformMessageId: 'zalo_local_conv_zalo_test_out_T4 27/05/2026_15:52_22pyg',
    senderType: 'shop',
    text: 'quên',
    attachments: []
  })
])

if (explicitDirectionPreferred.length !== 1 || explicitDirectionPreferred[0].sender_type !== 'shop') {
  throw new Error('zalo_explicit_direction_must_replace_stale_alias')
}

const noTimeAliasesHiddenWhenTimedRowExists = compactLegacyZaloBrowserAliases([
  zaloMessage({
    id: 'msg_timed',
    platformMessageId: 'zalo_local_conv_zalo_test_in_18:16_1go59',
    text: 'Ok a',
    attachments: []
  }),
  zaloMessage({
    id: 'msg_date_unknown_time_unknown',
    platformMessageId: 'zalo_local_conv_zalo_test_in_date_unknown_time_unknown_1go59',
    text: 'Ok a',
    attachments: [],
    createdAt: '2026-05-31T01:49:10.788Z'
  }),
  zaloMessage({
    id: 'msg_pos_alias',
    platformMessageId: 'zalo_local_conv_zalo_test_in_pos_30_1go59',
    text: 'Ok a',
    attachments: [],
    createdAt: '2026-05-31T01:57:32.129Z'
  })
])

if (noTimeAliasesHiddenWhenTimedRowExists.length !== 1 || noTimeAliasesHiddenWhenTimedRowExists[0].id !== 'msg_timed') {
  throw new Error(`zalo_no_time_aliases_must_hide_when_timed_exists:${noTimeAliasesHiddenWhenTimedRowExists.map(item => item.id).join(',')}`)
}

const noTimeOnlyCollapsed = compactLegacyZaloBrowserAliases([
  zaloMessage({
    id: 'msg_no_time_old_hash',
    platformMessageId: 'zalo_local_conv_zalo_test_in_date_unknown_time_unknown_1go59',
    text: 'Ok a',
    attachments: []
  }),
  zaloMessage({
    id: 'msg_no_time_new_hash',
    platformMessageId: 'zalo_local_conv_zalo_test_in_date_unknown_time_unknown_19csm7',
    text: 'Ok a',
    attachments: []
  })
])

if (noTimeOnlyCollapsed.length !== 1) {
  throw new Error(`zalo_no_time_aliases_must_collapse:${noTimeOnlyCollapsed.map(item => item.id).join(',')}`)
}

console.log(JSON.stringify({
  ok: true,
  image_alias_rows: imageAliasRows.length,
  explicit_date_rows: explicitDifferentDates.length,
  preferred_explicit_id: explicitPreferredOverUnknown[0].id,
  preferred_direction: explicitDirectionPreferred[0].sender_type,
  no_time_with_timed_rows: noTimeAliasesHiddenWhenTimedRowExists.length,
  no_time_only_rows: noTimeOnlyCollapsed.length
}, null, 2))
