// The teams kept for this computer: a small JSON file beside Kettu's settings, read and written
// whole, so a team outlives the sessions it runs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { validateTeams, type Team } from '@shared/teams'

export function teamsFile(): string {
  return path.join(app.getPath('userData'), 'teams.json')
}

export function readTeams(): Team[] {
  try {
    const parsed = JSON.parse(readFileSync(teamsFile(), 'utf8')) as unknown
    const list = Array.isArray(parsed) ? parsed : (parsed as { teams?: unknown })?.teams
    return validateTeams(list)
  } catch {
    return []
  }
}

export function writeTeams(value: unknown): Team[] {
  const teams = validateTeams(value)
  try {
    mkdirSync(path.dirname(teamsFile()), { recursive: true })
    writeFileSync(teamsFile(), `${JSON.stringify({ teams }, null, 2)}\n`, 'utf8')
  } catch {
    // A folder that cannot be written leaves the teams as they were for this run.
  }
  return teams
}