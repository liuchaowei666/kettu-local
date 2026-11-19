// A team: a chief and its members, each a saved bot with its own role prompt and agent, which the
// chief starts as separate sessions for one task. The bots and their prompts live here; the
// running sessions are Kettu's own, so each task leaves the team as it was.

import type { AgentId } from './thread'

export interface TeamBot {
  id: string
  name: string
  role: 'chief' | 'member'
  agentId: AgentId
  /** The model its agent should use; empty leaves the agent's own default. */
  model?: string
  /** What this bot is for, handed to it when the chief starts it. */
  prompt: string
}

export interface Team {
  id: string
  name: string
  bots: TeamBot[]
  /** The assistant session this team answers in, once it has one. */
  assistantId?: string
}

/** The most bots a team may hold, the chief included. */
export const MAX_TEAM_BOTS = 6

const BOT_ID = /^bot-[a-z0-9]{6,20}$/
const TEAM_ID = /^team-[a-z0-9]{6,20}$/

export function newTeamId(): string {
  return `team-${Math.random().toString(36).slice(2, 10)}`
}

export function newBotId(): string {
  return `bot-${Math.random().toString(36).slice(2, 10)}`
}

/** The team a fresh install starts with: a chief and two members, all on this computer's agents. */
export function starterTeam(agents: AgentId[]): Team {
  const [first, second, third] = agents
  const chief = first ?? 'deepseek'
  const memberA = second ?? first ?? 'deepseek'
  const memberB = third ?? second ?? first ?? 'deepseek'
  return {
    id: newTeamId(),
    name: '默认团队',
    bots: [
      {
        id: newBotId(),
        name: '主管',
        role: 'chief',
        agentId: chief,
        prompt:
          '拆解用户的任务，分给成员，跟踪进度，验收成果，最后给用户一份简短的交付说明（做了什么、改了哪些文件、怎么验证、已知问题）。不要代替成员完成全部工作。',
      },
      {
        id: newBotId(),
        name: '实现',
        role: 'member',
        agentId: memberA,
        prompt:
          '按主管的简报实现功能：范围要克制，写测试并跑通，最后交出改了哪些文件、怎么验证、还剩什么问题。',
      },
      {
        id: newBotId(),
        name: '审查',
        role: 'member',
        agentId: memberB,
        prompt:
          '审查实现：对照验收标准逐条检查，找边界情况和无效测试，给出「通过」或「必须修改」的结论和具体位置。不要自己改代码。',
      },
    ],
  }
}

export function chiefOf(team: Team): TeamBot | null {
  return team.bots.find((bot) => bot.role === 'chief') ?? null
}

export function membersOf(team: Team): TeamBot[] {
  return team.bots.filter((bot) => bot.role === 'member')
}

/**
 * The opening message a chief session gets: the task, who is on the team, and how to run it.
 *
 * The rules follow the shape DS Bot (Fei2411/DS-Bot, Apache-2.0) gives its Main Bot: the chief
 * decides who does what and reports back, and never does the members' work itself. Written for
 * Kettu's own tools, which start a session per member rather than messaging long-lived bots.
 */
export function chiefPrompt(team: Team, task: string): string {
  const members = membersOf(team)
  const list = members
    .map(
      (bot) =>
        `- ${bot.name}（agent: ${bot.agentId}${bot.model ? `, model: ${bot.model}` : ''}）` +
        `\n  职责：${bot.prompt || '（未填写，按任务自行判断）'}` +
        `\n  记忆文件：.team/bots/${bot.id}.md`,
    )
    .join('\n')
  return [
    `你是团队主管${chiefOf(team)?.name ? `「${chiefOf(team)!.name}」` : ''}，团队名称：${team.name}。`,
    '',
    '## 你的职责（只做这四件事）',
    '1. 拆解任务，写清范围、验收标准、给每个成员的具体分工；',
    '2. 为**每一个**成员开一个会话，把任务派下去；',
    '3. 验收成员成果，不满意就打回重做；',
    '4. 给用户一份简短的交付说明。',
    '',
    '**你不做实现**：不写代码、不改文件、不跑会写东西的命令、不新建文件。',
    '如果你发现自己正在动手做成员的活，立刻停下来，把这件事写成任务发给对应的成员。',
    '',
    '## 用户交给团队的任务',
    '---',
    task.trim(),
    '---',
    '',
    members.length > 0
      ? `## 团队成员\n${list}`
      : '## 团队成员\n（没有预置成员：你自己按任务用 start_session 开合适的会话，写清每个会话的角色和交付要求。）',
    '',
    '## 怎么做',
    '1. **第一个动作**必须是 `start_session`：给每个成员开一个会话，agent 用上面写的、model 有写就带上。',
    '   开场消息里要有：任务原文、你的整体简报（范围/验收标准）、这个成员的职责、要交付什么、',
    '   以及「开工前先读 .team/bots/<id>.md（不存在就跳过），结束前把总结追加进去」。',
    '   成员没全部开完之前，不要调用别的工具。',
    '2. 会话开始后，你只等结果：Kettu 会在它结束时通知你，用 `get_session` 取回回复。',
    '3. 成果不符合验收标准，用 `send_message` 发回同一个会话让它改，写明具体要改什么。',
    '4. 全部通过后，做一次自查：跑 `git status --short`，**如果出现你自己改的文件，就是违规**——',
    '   回退它们，把这些改动写成任务重新发给成员。',
    '5. 收尾：给用户一份交付说明（做了什么、改了哪些文件、怎么验证、已知问题与建议）。',
    '',
    '## 团队规则（与 DS Bot 的团队约定一致）',
    '- 每个成员只做自己那部分，不要替它做；',
    '- 派活只发一次，不要反复催问，也不要发「收到」「谢谢」这类消息；',
    '- 成员之间需要配合时，由你把任务写给需要动手的那一个，不要让它俩互相等；',
    '- 你的记忆文件是 .team/bots/chief.md：开工前读它，收尾时把你的判断和经验追加进去；',
    '- 回复用户时用中文、短句、不要复述代码。',
  ].join('\n')
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

/** The teams a file holds, dropping anything that is not a team of bots this app can run. */
export function validateTeams(value: unknown): Team[] {
  const list = Array.isArray(value) ? value : []
  const teams: Team[] = []
  for (const raw of list) {
    const team = (raw ?? {}) as Record<string, unknown>
    if (typeof team.id !== 'string' || !TEAM_ID.test(team.id)) continue
    const bots: TeamBot[] = []
    for (const rawBot of Array.isArray(team.bots) ? team.bots : []) {
      const bot = (rawBot ?? {}) as Record<string, unknown>
      if (typeof bot.id !== 'string' || !BOT_ID.test(bot.id)) continue
      if (bot.role !== 'chief' && bot.role !== 'member') continue
      if (typeof bot.agentId !== 'string' || bot.agentId === '') continue
      bots.push({
        id: bot.id,
        name: text(bot.name, bot.role === 'chief' ? '主管' : '成员'),
        role: bot.role,
        agentId: bot.agentId as AgentId,
        ...(typeof bot.model === 'string' && bot.model.trim() !== '' ? { model: bot.model.trim() } : {}),
        prompt: typeof bot.prompt === 'string' ? bot.prompt : '',
      })
    }
    if (bots.length === 0 || bots.length > MAX_TEAM_BOTS) continue
    // A team without a chief cannot start its members, so the first bot is made the chief.
    if (!bots.some((bot) => bot.role === 'chief')) bots[0]!.role = 'chief'
    teams.push({
      id: team.id,
      name: text(team.name, '团队'),
      bots,
      ...(typeof team.assistantId === 'string' && team.assistantId !== ''
        ? { assistantId: team.assistantId }
        : {}),
    })
  }
  return teams
}

/** What a member session starts with: the task, the team's terms, and its own part. */
export function memberPrompt(team: Team, task: string, bot: TeamBot): string {
  const chief = chiefOf(team)
  return [
    '你是团队成员「' + bot.name + '」，团队「' + team.name + '」' +
      (chief ? '，主管是「' + chief.name + '」' : '') + '。',
    '',
    '## 任务（用户原话）',
    '---',
    task.trim(),
    '---',
    '',
    '## 团队的约定',
    '- 范围克制：只做与这个任务直接相关的改动，不顺手重构别处；',
    '- 改动要能构建、有测试（或说明为什么没有），并说清怎么验证；',
    '- 不确定的地方写进交付说明，不要猜着改。',
    '',
    '## 你的职责',
    bot.prompt || '按任务自行判断该做什么，并把范围写清楚。',
    '',
    '## 记忆',
    '开工前先读 .team/bots/' + bot.id + '.md（不存在就跳过）；结束前把这次做了什么、关键决定追加进去。',
    '',
    '## 交付',
    '最后一轮回复写清：改了哪些文件、怎么验证、还剩什么问题或风险。',
  ].join('\n')
}

/** What the assistant's session opens with: who it is, and the rules it works by. */
export function chiefStandbyPrompt(team: Team): string {
  return [
    '你是我的助理' + (chiefOf(team)?.name ? '「' + chiefOf(team)!.name + '」' : '') + '，团队「' + team.name + '」。',
    '以后我所有的活都直接发在这个会话里，由你安排，不用我操心怎么拆、找谁做。',
    '',
    '## 你只做这四件事',
    '1. 拆解我交代的事，写清范围与验收标准；',
    '2. 用 start_session 给团队里合适的成员各开一个会话，把分工发下去（agent 按成员配置，model 有写就带上）；',
    '   **成员不用我预先配置**：团队里没有合适的人，你就按任务自己开（例如一个实现的、一个审查的），在开场消息里写清它的角色、任务和交付要求；',
    '3. 等成员结束，用 get_session 收成果，不合格就用 send_message 打回重做；',
    '4. 给我一份简短汇报：做了什么、改了哪些文件、怎么验证、还有什么风险。',
    '',
    '你不做实现：不写代码、不改文件、不跑会写入的命令。发现自己动手了就停下来，转给成员。',
    '派活只发一次；不要发「收到」「谢谢」；成员没开完之前不要调别的工具。',
    '收尾前跑一次 git status --short 自查：出现你自己改的文件就是违规，回退并改派。',
    '',
    '## 现在',
    '还没有任务。只回复一句「准备就绪，把活发我就行」，然后等我安排。',
  ].join('\n')
}
export function chiefReviewPrompt(
  team: Team,
  task: string,
  members: { name: string; sessionId: string }[],
): string {
  const list = members.map((entry) => '- ' + entry.name + '：' + entry.sessionId).join('\n')
  return [
    '你是团队主管' + (chiefOf(team)?.name ? '「' + chiefOf(team)!.name + '」' : '') +
      '，团队「' + team.name + '」。',
    '',
    '## 用户交给团队的任务',
    '---',
    task.trim(),
    '---',
    '',
    '## 已经发生的事',
    'Kettu 已经按你的团队配置，为每个成员开好了会话，并把各自的分工发了下去：',
    list || '（这个团队没有成员）',
    '',
    '你的会话是只读的：你改不了文件、跑不了写入命令。这是故意的——实现由成员负责，你只做判断。',
    '',
    '## 你要做的',
    '1. 用 get_session 读每个成员的最终回复（细节不够就用 read_session_history）；',
    '2. 对照任务的验收标准逐条判断：通过，还是需要返工、具体要改什么；',
    '3. 给用户一份简短的交付说明：达成了什么、改了哪些文件、怎么验证、已知问题与建议；',
    '4. 把这次的判断与经验追加到 .team/bots/chief.md。',
    '',
    '不要自己去补成员没做完的部分。缺口就如实写出来，并说明该由谁补、补什么。',
  ].join('\n')
}