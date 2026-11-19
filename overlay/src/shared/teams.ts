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
    members.length > 0 ? `## 团队成员\n${list}` : '这个团队没有成员：你自己完成后直接交付。',
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
    teams.push({ id: team.id, name: text(team.name, '团队'), bots })
  }
  return teams
}