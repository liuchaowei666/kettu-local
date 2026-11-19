import { create } from 'zustand'
import { starterTeam, type Team } from '@shared/teams'
import { useAgentsStore } from '@renderer/stores/agents'

// The teams kept on this computer, read once and written whole. A machine with none starts with a
// chief and two members on the agents it has.

interface TeamsState {
  teams: Team[]
  loaded: boolean
  load(): Promise<void>
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
  async save(teams) {
    try {
      set({ teams: await window.kettu.teams.write(teams) })
    } catch {
      set({ teams })
    }
  },
}))