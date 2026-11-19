// Local providers: OpenAI-compatible endpoints (Magpie's gateway, and any other the user adds)
// that Kettu offers in the DeepSeek model menu and hands to the harness as a profile route.
//
// One file is the source of truth: %APPDATA%\Kettu\local-models.json. Adding a provider or a
// model is a edit there and a restart, with no rebuild of Kettu:
//
// {
//   "defaultModel": "magpie/group/deepseek-2",
//   "providers": [
//     {
//       "id": "magpie",
//       "displayName": "Magpie",
//       "baseURL": "http://127.0.0.1:3425/v1",
//       "api": "openai-completions",
//       "apiKeyEnv": "MAGPIE_GATEWAY_KEY",
//       "models": [{ "id": "group/deepseek-2", "name": "DeepSeek (Magpie)" }]
//     }
//   ]
// }
//
// A model is named `<provider>/<model id>`, so `providerOf` can route it without a table.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export interface LocalModel {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
  reasoningEfforts?: Record<string, string>
}

export interface LocalProvider {
  id: string
  displayName: string
  baseURL: string
  api: string
  apiKeyEnv: string
  models: LocalModel[]
}

export interface LocalConfig {
  defaultModel?: string
  providers: LocalProvider[]
}

const CONFIG_NAME = 'local-models.json'
const PROFILE = ['.dsh', 'profiles', 'sdk', 'cordis.patch.yml']
const BEGIN = '# >>> kettu-local-providers'
const END = '# <<< kettu-local-providers'

/** The user's config folder, as Kettu keeps it. */
function userDataFolder(): string {
  const appData = process.env.APPDATA
  if (appData) return path.join(appData, 'Kettu')
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config'), 'Kettu')
}

export function localModelsFile(): string {
  return path.join(userDataFolder(), CONFIG_NAME)
}

/** The default a fresh install starts from: this machine's Magpie gateway. */
function starter(): LocalConfig {
  return {
    defaultModel: 'group/deepseek-2',
    providers: [
      {
        id: 'magpie',
        displayName: 'Magpie',
        baseURL: 'http://127.0.0.1:3425/v1',
        api: 'openai-completions',
        apiKeyEnv: 'MAGPIE_GATEWAY_KEY',
        models: [
          {
            id: 'group/deepseek-2',
            name: 'DeepSeek (Magpie)',
            reasoningEfforts: { off: 'none', low: 'low', high: 'high', max: 'max' },
          },
        ],
      },
    ],
  }
}

let cache: { at: number; config: LocalConfig } | null = null

/** The config, writing the starter file on first use; a broken file leaves the built-ins only. */
export function localConfig(): LocalConfig {
  const file = localModelsFile()
  try {
    if (!existsSync(file)) {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, `${JSON.stringify(starter(), null, 2)}\n`, 'utf8')
    }
    const stat = readFileSync(file, 'utf8')
    if (cache && cache.at === stat.length) return cache.config
    const parsed = JSON.parse(stat) as unknown
    const config = validate(parsed)
    cache = { at: stat.length, config }
    return config
  } catch {
    return { providers: [] }
  }
}

/** The config's models, as the model menu lists them: provider id, model id and a name. */
export function localModels(): { value: string; name: string; provider: string; model: string }[] {
  const list: { value: string; name: string; provider: string; model: string }[] = []
  for (const provider of localConfig().providers) {
    for (const model of provider.models) {
      list.push({
        value: model.id,
        name: model.name || model.id,
        provider: provider.id,
        model: model.id,
      })
    }
  }
  return list
}

/** The provider a model id belongs to: the config's provider that lists it, else its prefix. */
export function providerOf(model: string): string | null {
  for (const provider of localConfig().providers) {
    if (provider.models.some((entry) => entry.id === model)) return provider.id
  }
  const slash = model.indexOf('/')
  return slash > 0 ? model.slice(0, slash) : null
}

/** Whether the config offers this model. */
export function isLocalModel(model: string): boolean {
  return localModels().some((entry) => entry.value === model)
}

function validate(value: unknown): LocalConfig {
  const record = (value ?? {}) as Record<string, unknown>
  const providers = Array.isArray(record.providers) ? record.providers : []
  const out: LocalProvider[] = []
  for (const item of providers) {
    const p = (item ?? {}) as Record<string, unknown>
    if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(p.id)) continue
    if (typeof p.baseURL !== 'string' || p.baseURL === '') continue
    if (typeof p.api !== 'string' || p.api === '') continue
    if (typeof p.apiKeyEnv !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(p.apiKeyEnv)) continue
    const models: LocalModel[] = []
    for (const raw of Array.isArray(p.models) ? p.models : []) {
      const m = (raw ?? {}) as Record<string, unknown>
      if (typeof m.id !== 'string' || m.id === '') continue
      models.push({
        id: m.id,
        name: typeof m.name === 'string' && m.name !== '' ? m.name : m.id,
        ...(typeof m.contextWindow === 'number' ? { contextWindow: m.contextWindow } : {}),
        ...(typeof m.maxTokens === 'number' ? { maxTokens: m.maxTokens } : {}),
        ...(Array.isArray(m.input) ? { input: m.input.filter((x): x is string => typeof x === 'string') } : {}),
        ...(m.reasoningEfforts && typeof m.reasoningEfforts === 'object'
          ? { reasoningEfforts: m.reasoningEfforts as Record<string, string> }
          : {}),
      })
    }
    if (models.length === 0) continue
    out.push({
      id: p.id,
      displayName: typeof p.displayName === 'string' && p.displayName !== '' ? p.displayName : p.id,
      baseURL: p.baseURL,
      api: p.api,
      apiKeyEnv: p.apiKeyEnv,
      models,
    })
  }
  return {
    ...(typeof record.defaultModel === 'string' ? { defaultModel: record.defaultModel } : {}),
    providers: out,
  }
}

/** The profile rows that declare every local provider, in the harness's own patch format. */
export function providersPatch(): string {
  const { providers } = localConfig()
  if (providers.length === 0) return ''
  const quote = (value: string): string => JSON.stringify(value)
  const lines = [
    BEGIN,
    '# Written from local-models.json by Kettu; edit that file, not this block.',
    '- id: llm-pi-ai',
    "  name: '@deepseek-ai/dsh-llm-pi-ai'",
    '  config:',
    '    providers:',
  ]
  for (const provider of providers) {
    lines.push(`      ${provider.id}:`)
    lines.push(`        displayName: ${quote(provider.displayName)}`)
    lines.push(`        apiKeyEnv: ${provider.apiKeyEnv}`)
    lines.push(`        api: ${provider.api}`)
    lines.push(`        baseURL: ${quote(provider.baseURL)}`)
    lines.push('        models:')
    for (const model of provider.models) {
      lines.push(`          - id: ${quote(model.id)}`)
      lines.push(`            name: ${quote(model.name)}`)
      if (model.contextWindow !== undefined) lines.push(`            contextWindow: ${model.contextWindow}`)
      if (model.maxTokens !== undefined) lines.push(`            maxTokens: ${model.maxTokens}`)
      if (model.input && model.input.length > 0) lines.push(`            input: [${model.input.join(', ')}]`)
      if (model.reasoningEfforts) {
        lines.push('            reasoningEfforts:')
        for (const [level, effort] of Object.entries(model.reasoningEfforts)) {
          lines.push(`              ${quote(level)}: ${effort}`)
        }
      }
    }
  }
  lines.push(END)
  return `${lines.join('\n')}\n`
}

/** Rewrites the managed block of the sdk profile, keeping everything outside it. */
export function syncProvidersProfile(): void {
  const file = path.join(homedir(), ...PROFILE)
  try {
    const block = providersPatch()
    if (!block) return
    const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const start = text.indexOf(BEGIN)
    const finish = text.indexOf(END)
    let next: string
    if (start >= 0 && finish > start) {
      next = text.slice(0, start).trimEnd() + '\n' + block + text.slice(finish + END.length).replace(/^\s*\n/, '')
    } else {
      const body = text.trim()
      const rest = body === '' || body === '[]' ? '' : body + '\n'
      next = rest + block
    }
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, next, 'utf8')
  } catch {
    // A profile that cannot be written is reported by the harness when the session starts.
  }
}
