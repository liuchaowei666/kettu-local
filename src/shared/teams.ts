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

/** The opening message a chief session gets: the task, who is on the team, and how to run it. */
export function chiefPrompt(team: Team, task: string): string {
  const members = membersOf(team)
  const list = members
    .map((bot) => `- ${bot.name}（agent: ${bot.agentId}${bot.model ? `, model: ${bot.model}` : ''}）：${bot.prompt}\n  记忆文件：.team/bots/${bot.id}.md`)
    .join('\n')
  return [
    `你是团队主管${chiefOf(team)?.name ? `「${chiefOf(team)!.name}」` : ''}，团队名称：${team.name}。`,
    '',
    '用户交给团队的任务：',
    '---',
    task.trim(),
    '---',
    '',
    members.length > 0 ? `团队成员：\n${list}` : '这个团队暂时没有成员，你自己完成并直接交付。',
    '',
    '做法：',
    '1. 先拆解任务，写清范围、验收标准、给每个成员的具体分工；',
    '2. 用 kettu 的 start_session 为每个成员各开一个会话（agent 和 model 用上面写的），开场消息里要包含：任务原文、整体简报、这个成员的职责、要交付什么；',
    '   并让它在开工前先读自己的记忆文件（不存在就跳过），结束前把自己的总结追加进去；',
    '3. 等每个会话结束时 Kettu 会通知你，再用 get_session 取回它的成果；',
    '4. 对照验收标准检查成员成果，必要时把它发回给同一个会话让它改（send_message）；',
    '5. 最后给用户一份简短交付说明：做了什么、改了哪些文件、怎么验证、已知问题与建议。',
    '',
    '你自己的记忆文件是 .team/bots/chief.md：开工前读它，收尾时把你的判断与经验追加进去。',
    '',
    '注意：不要代替成员做完所有事；你的价值是拆解、调度、验收和汇总。',
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