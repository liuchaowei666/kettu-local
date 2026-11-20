// The balance the local Codex's own provider reports. Kettu's Codex runs against whatever
// `~/.codex/config.toml` names (a relay such as Xingchi), and a relay that follows the DeepSeek
// usage shape answers GET <base>/usage with `{ balance }` for the key it was given. The balance is
// read from there, so the usage page and the composer show it beside the other agents'.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export interface ProviderBalance {
  label: string
  amount: number
  currency: string
}

export interface ProviderUsage {
  state: 'ready' | 'error'
  limits: never[]
  balances: ProviderBalance[]
  observedAt: number
  error: string | null
}

interface ProviderConfig {
  name: string
  baseUrl: string
  token: string | null
}

/** The provider a Codex config names, read without a TOML parser: its section, base URL and token. */
export function codexProvider(file = path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'), 'config.toml')): ProviderConfig | null {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const chosen = /^model_provider\s*=\s*"([^"]+)"/m.exec(text)?.[1] ?? null
  const sections = new Map<string, Record<string, string>>()
  let current: string | null = null
  for (const line of text.split('\n')) {
    const header = /^\s*\[model_providers\.([A-Za-z0-9_-]+)\]\s*$/.exec(line)
    if (header) {
      current = header[1]!
      sections.set(current, {})
      continue
    }
    if (/^\s*\[/.test(line)) {
      current = null
      continue
    }
    if (!current) continue
    const pair = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!pair) continue
    const value = pair[2]!.trim().replace(/^"|"$/g, '')
    sections.get(current)![pair[1]!] = value
  }
  const id = chosen && sections.has(chosen) ? chosen : [...sections.keys()][0]
  if (!id) return null
  const section = sections.get(id)!
  if (!section.base_url) return null
  const envToken = section.env_key ? process.env[section.env_key] ?? null : null
  return {
    name: section.name ?? id,
    baseUrl: section.base_url,
    token: section.experimental_bearer_token ?? envToken,
  }
}

/** The provider's balance, or a failed read; a provider with no usable /usage endpoint is failed. */
export async function readCodexUsage(now = Date.now()): Promise<ProviderUsage> {
  const provider = codexProvider()
  if (!provider?.token) return { state: 'error', limits: [], balances: [], observedAt: now, error: 'unavailable' }
  const base = provider.baseUrl.replace(/\/+$/, '')
  try {
    const response = await fetch(`${base}/usage`, {
      headers: { authorization: `Bearer ${provider.token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return { state: 'error', limits: [], balances: [], observedAt: now, error: 'unavailable' }
    const body = (await response.json()) as { balance?: unknown }
    const amount = typeof body.balance === 'number' ? body.balance : null
    if (amount === null) return { state: 'error', limits: [], balances: [], observedAt: now, error: 'unavailable' }
    return {
      state: 'ready',
      limits: [],
      balances: [{ label: provider.name, amount, currency: 'CNY' }],
      observedAt: now,
      error: null,
    }
  } catch {
    return { state: 'error', limits: [], balances: [], observedAt: now, error: 'unavailable' }
  }
}