import { create } from 'zustand'
import type { AgentId } from '@shared/thread'
import { chiefStandbyPrompt, starterTeam, type Team, type TeamBot } from '@shared/teams'
import { host } from '@renderer/lib/host'
import { useAgentsStore } from '@renderer/stores/agents'
import { useSessionsStore } from '@renderer/stores/sessions'
import { useViewStore } from '@renderer/stores/view'

// The teams kept on this computer, read once and written whole. A machine with none starts with a
// chief and two members on the agents it has.

interface TeamsState {
  teams: Team[]
  loaded: boolean
  error: string | null
  load(): Promise<void>
  ensureAssistant(): Promise<void>
  save(teams: Team[]): Promise<void>
}

/** The agents that can start a session now: not uninstalled, not turned off, ready. */
export function usableAgents(): AgentId[] {
  const { order, byId } = useAgentsStore.getState()
  return order.filter((id) => {
    const status = byId[id]
    return Boolean(status && !status.uninstalled && !status.disabled && status.state === 'available')
  })
}

export const useTeamsStore = create<TeamsState>((set, get) => ({
  teams: [],
  loaded: false,
  error: null,
  async load() {
    if (get().loaded) return
    try {
      const kept = await window.kettu.teams.read()
      const agents = usableAgents()
      const teams = kept.length > 0 ? kept : agents.length > 0 ? [starterTeam(agents)] : []
      if (kept.length === 0 && teams.length > 0) await window.kettu.teams.write(teams)
      set({ teams, loaded: true })
    } catch {
      set({ teams: [], loaded: true })
    }
  },
  /**
   * Makes sure the team has its assistant session, so the app opens with one chat to talk to
   * rather than making the user set anything up.
   */
  async ensureAssistant() {
    if (!get().loaded) await get().load()
    const available = usableAgents()
    if (available.length === 0) return
    const first = get().teams[0]
    if (!first) return
    // A team saved with an agent that is not installed is repaired to one that is.
    const repairedBots = first.bots.map((bot, index) =>
      available.includes(bot.agentId)
        ? bot
        : { ...bot, agentId: available[index % available.length] as TeamBot['agentId'] },
    )
    const team: Team = { ...first, bots: repairedBots }
    if (repairedBots.some((bot, index) => bot.agentId !== first.bots[index]!.agentId)) {
      await get().save(get().teams.map((entry) => (entry.id === team.id ? team : entry)))
    }
    const chief = team.bots.find((bot) => bot.role === 'chief')
    if (!chief) return
    if (team.assistantId && useSessionsStore.getState().byId[team.assistantId]) return
    try {
      const prompt = [{ type: 'text' as const, text: chiefStandbyPrompt(team) }]
      let summary
      try {
        summary = await host('sessions.create', {
          agentId: chief.agentId,
          projectPath: useViewStore.getState().projectPath ?? null,
          options: { mode: 'workspace-write' },
          prompt,
          title: '助理',
        })
      } catch {
        summary = await host('sessions.create', {
          agentId: chief.agentId,
          projectPath: useViewStore.getState().projectPath ?? null,
          prompt,
          title: '助理',
        })
      }
      useSessionsStore.getState().upsert(summary)
      const next: Team = { ...team, assistantId: summary.id }
      await get().save(get().teams.map((entry) => (entry.id === next.id ? next : entry)))
    } catch (cause) {
      set({ error: String((cause as { message?: string } | null)?.message ?? cause) })
    }
  },
  async save(teams) {
    try {
      set({ teams: await window.kettu.teams.write(teams) })
    } catch {
      set({ teams })
    }
  },
}))