import { create } from 'zustand'
import { chiefStandbyPrompt, starterTeam, type Team } from '@shared/teams'
import { host } from '@renderer/lib/host'
import { useAgentsStore } from '@renderer/stores/agents'
import { useSessionsStore } from '@renderer/stores/sessions'
import { useViewStore } from '@renderer/stores/view'

// The teams kept on this computer, read once and written whole. A machine with none starts with a
// chief and two members on the agents it has.

interface TeamsState {
  teams: Team[]
  loaded: boolean
  load(): Promise<void>
  ensureAssistant(): Promise<void>
  save(teams: Team[]): Promise<void>
}

export const useTeamsStore = create<TeamsState>((set, get) => ({
  teams: [],
  loaded: false,
  async load() {
    if (get().loaded) return
    try {
      const kept = await window.kettu.teams.read()
      const agents = useAgentsStore.getState().order
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
    const team = get().teams[0]
    const chief = team?.bots.find((bot) => bot.role === 'chief')
    if (!team || !chief) return
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
        })
      } catch {
        summary = await host('sessions.create', {
          agentId: chief.agentId,
          projectPath: useViewStore.getState().projectPath ?? null,
          prompt,
        })
      }
      useSessionsStore.getState().upsert(summary)
      const next: Team = { ...team, assistantId: summary.id }
      await get().save(get().teams.map((entry) => (entry.id === next.id ? next : entry)))
    } catch {
      // An agent that cannot start leaves the team without an assistant until one runs.
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