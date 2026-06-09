import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

const agents = readFileSync(repoFile('AGENTS.md'), 'utf8')
const skill = readFileSync(repoFile('skills/shophuyvan-warehouse-core-guard/SKILL.md'), 'utf8')
const state = readFileSync(repoFile('docs/PROJECT-CURRENT-STATE.md'), 'utf8')

for (const source of [agents, skill, state]) {
  assert.ok(source.includes('Open Platform'), 'Guard phải yêu cầu kiểm Open Platform trước khi kết luận thiếu endpoint')
  assert.ok(source.includes('api_permission_missing'), 'Guard phải có trạng thái api_permission_missing')
  assert.ok(source.includes('token_scope_missing'), 'Guard phải có trạng thái token_scope_missing')
  assert.ok(source.includes('endpoint_not_available'), 'Guard phải có trạng thái endpoint_not_available')
}

assert.ok(agents.includes('Project Current State Rule'), 'AGENTS phải có Project Current State Rule')
assert.ok(skill.includes('Project State Guard'), 'Skill phải có Project State Guard')
assert.ok(state.includes('PROJECT CURRENT STATE'), 'PROJECT-CURRENT-STATE.md phải tồn tại làm bộ nhớ điều phối')
assert.ok(state.includes('Không làm lại phần đã chốt'), 'PROJECT-CURRENT-STATE.md phải chặn làm lại phần đã chốt')
assert.ok(state.includes('TikTok được auto theo lịch nếu an toàn'), 'State phải ghi TikTok không manual-only vĩnh viễn')
