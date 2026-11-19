import { useEffect, useState } from 'react'
import { PlusSignIcon, Delete02Icon, Copy01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { useTranslation } from 'react-i18next'
import { chiefPrompt, newBotId, newTeamId, type Team, type TeamBot } from '@shared/teams'
import { host } from '@renderer/lib/host'
import { openSession, useViewStore } from '@renderer/stores/view'
import { useAgentsStore } from '@renderer/stores/agents'
import { useSessionsStore } from '@renderer/stores/sessions'
import { useTeamsStore } from '@renderer/stores/teams'
import { Glyph } from '@renderer/features/shell/glyph'

/**
 * The Teams page: a team's bots, each with its own agent and role prompt, and the box that starts
 * the chief on a task. Starting writes the chief's opening message into New session, so nothing
 * happens until the user sends it.
 */
export default function TeamsPage() {
  const { t } = useTranslation('teams')
  const teams = useTeamsStore((s) => s.teams)
  const loaded = useTeamsStore((s) => s.loaded)
  const load = useTeamsStore((s) => s.load)
  const save = useTeamsStore((s) => s.save)
  const agents = useAgentsStore((s) => s.order)
  const byId = useAgentsStore((s) => s.byId)
  const agentName = (id: string): string => byId[id as TeamBot['agentId']]?.name ?? id

  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Team | null>(null)
  const [task, setTask] = useState('')
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected && teams.length > 0) setSelected(teams[0]!.id)
  }, [teams, selected])

  useEffect(() => {
    const team = teams.find((entry) => entry.id === selected) ?? null
    setDraft(team ? { ...team, bots: team.bots.map((bot) => ({ ...bot })) } : null)
  }, [selected, teams])

  const addTeam = async (): Promise<void> => {
    const team: Team = {
      id: newTeamId(),
      name: t('newTeamName'),
      bots: [
        {
          id: newBotId(),
          name: t('chief'),
          role: 'chief',
          agentId: (agents[0] ?? 'deepseek') as TeamBot['agentId'],
          prompt: '',
        },
        {
          id: newBotId(),
          name: t('member'),
          role: 'member',
          agentId: (agents[0] ?? 'deepseek') as TeamBot['agentId'],
          prompt: '',
        },
      ],
    }
    await save([...teams, team])
    setSelected(team.id)
  }

  const patch = (change: (team: Team) => void): void => {
    if (!draft) return
    const next: Team = { ...draft, bots: draft.bots.map((bot) => ({ ...bot })) }
    change(next)
    setDraft(next)
  }

  const commit = async (): Promise<void> => {
    if (!draft) return
    await save(teams.map((team) => (team.id === draft.id ? draft : team)))
  }

  const removeTeam = async (): Promise<void> => {
    if (!draft) return
    await save(teams.filter((team) => team.id !== draft.id))
    setSelected(null)
  }

  const chief = draft?.bots.find((bot) => bot.role === 'chief') ?? null
  const projectPath = useViewStore((s) => s.projectPath)

  /**
   * Talks to the team's one assistant session, which does the delegating. The first task creates
   * that session; later ones are messages into it, so the user only ever writes to one chat.
   */
  const start = async (): Promise<void> => {
    if (!draft || !chief || task.trim() === '' || starting) return
    setStarting(true)
    setProblem(null)
    try {
      const text = chiefPrompt(draft, task)
      if (draft.assistantId) {
        await host('sessions.prompt', {
          sessionId: draft.assistantId,
          content: [{ type: 'text', text }],
        })
        const known = useSessionsStore.getState().byId[draft.assistantId]
        if (known) openSession(known.id, known.projectPath)
        return
      }
      let summary
      try {
        summary = await host('sessions.create', {
          agentId: chief.agentId,
          projectPath: projectPath ?? null,
          options: { mode: 'workspace-write' },
          prompt: [{ type: 'text', text }],
        })
      } catch {
        summary = await host('sessions.create', {
          agentId: chief.agentId,
          projectPath: projectPath ?? null,
          prompt: [{ type: 'text', text }],
        })
      }
      useSessionsStore.getState().upsert(summary)
      const next: Team = { ...draft, assistantId: summary.id }
      setDraft(next)
      await save(teams.map((team) => (team.id === next.id ? next : team)))
      openSession(summary.id, summary.projectPath)
    } catch (error) {
      setProblem(String((error as { message?: string } | null)?.message ?? error))
    } finally {
      setStarting(false)
    }
  }

  const copy = async (): Promise<void> => {
    if (!draft) return
    await navigator.clipboard.writeText(chiefPrompt(draft, task))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-line p-3">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-xs font-medium text-soft">{t('title')}</span>
          <button
            type="button"
            onClick={() => void addTeam()}
            className="grid size-6 place-items-center rounded-md text-icon hover:bg-hover"
            aria-label={t('addTeam')}
            title={t('addTeam')}
          >
            <Glyph icon={PlusSignIcon} size={14} />
          </button>
        </div>
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => setSelected(team.id)}
            className={`truncate rounded-md px-2 py-1.5 text-left text-sm ${
              team.id === selected ? 'bg-selected text-strong' : 'text-soft hover:bg-hover'
            }`}
          >
            {team.name}
          </button>
        ))}
        {loaded && teams.length === 0 && <p className="px-1 text-xs text-soft">{t('empty')}</p>}
      </aside>

      <section className="min-w-0 flex-1 overflow-auto p-5">
        {!draft ? (
          <p className="text-sm text-soft">{t('emptyHint')}</p>
        ) : (
          <div className="flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-2">
              <input
                value={draft.name}
                onChange={(event) => patch((team) => (team.name = event.target.value))}
                onBlur={() => void commit()}
                className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 py-1 text-base font-semibold"
                aria-label={t('teamName')}
              />
              <button
                type="button"
                onClick={() => void removeTeam()}
                className="grid size-8 place-items-center rounded-md text-icon hover:bg-hover"
                aria-label={t('removeTeam')}
                title={t('removeTeam')}
              >
                <Glyph icon={Delete02Icon} size={15} />
              </button>
            </div>

            {draft.bots.map((bot) => (
              <div key={bot.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={bot.name}
                    onChange={(event) =>
                      patch((team) => {
                        const target = team.bots.find((entry) => entry.id === bot.id)
                        if (target) target.name = event.target.value
                      })
                    }
                    onBlur={() => void commit()}
                    className="w-32 rounded-md border border-line bg-transparent px-2 py-1 text-sm"
                    aria-label={t('botName')}
                  />
                  <select
                    value={bot.role}
                    onChange={(event) =>
                      patch((team) => {
                        const target = team.bots.find((entry) => entry.id === bot.id)
                        if (target) target.role = event.target.value as TeamBot['role']
                      })
                    }
                    onBlur={() => void commit()}
                    className="rounded-md border border-line bg-transparent px-2 py-1 text-sm"
                    aria-label={t('role')}
                  >
                    <option value="chief">{t('chief')}</option>
                    <option value="member">{t('member')}</option>
                  </select>
                  <select
                    value={bot.agentId}
                    onChange={(event) =>
                      patch((team) => {
                        const target = team.bots.find((entry) => entry.id === bot.id)
                        if (target) target.agentId = event.target.value as TeamBot['agentId']
                      })
                    }
                    onBlur={() => void commit()}
                    className="rounded-md border border-line bg-transparent px-2 py-1 text-sm"
                    aria-label={t('agent')}
                  >
                    {agents.map((id) => (
                      <option key={id} value={id}>
                        {agentName(id)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={bot.model ?? ''}
                    onChange={(event) =>
                      patch((team) => {
                        const target = team.bots.find((entry) => entry.id === bot.id)
                        if (target) target.model = event.target.value === '' ? undefined : event.target.value
                      })
                    }
                    onBlur={() => void commit()}
                    placeholder={t('modelHint')}
                    className="w-44 rounded-md border border-line bg-transparent px-2 py-1 text-sm"
                    aria-label={t('model')}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patch((team) => {
                        team.bots = team.bots.filter((entry) => entry.id !== bot.id)
                      })
                    }
                    className="ml-auto grid size-7 place-items-center rounded-md text-icon hover:bg-hover"
                    aria-label={t('removeBot')}
                  >
                    <Glyph icon={Delete02Icon} size={14} />
                  </button>
                </div>
                <textarea
                  value={bot.prompt}
                  onChange={(event) =>
                    patch((team) => {
                      const target = team.bots.find((entry) => entry.id === bot.id)
                      if (target) target.prompt = event.target.value
                    })
                  }
                  onBlur={() => void commit()}
                  rows={3}
                  placeholder={t('promptHint')}
                  className="mt-2 w-full resize-y rounded-md border border-line bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                patch((team) => {
                  team.bots.push({
                    id: newBotId(),
                    name: t('member'),
                    role: 'member',
                    agentId: (agents[0] ?? 'deepseek') as TeamBot['agentId'],
                    prompt: '',
                  })
                })
              }
              className="flex items-center gap-1.5 self-start rounded-md border border-line px-2 py-1 text-sm text-soft hover:bg-hover"
            >
              <Glyph icon={PlusSignIcon} size={13} />
              {t('addMember')}
            </button>

            <div className="mt-2 rounded-lg border border-line p-3">
              <label className="text-sm font-medium text-strong" htmlFor="team-task">
                {t('task')}
              </label>
              <textarea
                id="team-task"
                value={task}
                onChange={(event) => setTask(event.target.value)}
                rows={4}
                placeholder={t('taskHint')}
                className="mt-2 w-full resize-y rounded-md border border-line bg-transparent px-2 py-1.5 text-sm"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!chief || task.trim() === '' || starting}
                  onClick={() => void start()}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  {t('start')}
                  <Glyph icon={ArrowRight01Icon} size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-soft hover:bg-hover"
                >
                  <Glyph icon={Copy01Icon} size={13} />
                  {copied ? t('copied') : t('copyPrompt')}
                </button>
                {!chief && <span className="text-xs text-danger">{t('needChief')}</span>}
                {chief && (
                  <span className="text-xs text-soft">
                    {t('startsWith', { name: chief.name, agent: agentName(chief.agentId) })}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-soft">{t('startHint')}</p>
              {problem && <p className="mt-1 text-xs text-danger">{problem}</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}