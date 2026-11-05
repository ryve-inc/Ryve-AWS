import path from 'node:path'
import fs from 'node:fs'
import type { AppStatus } from '../shared/types'

export interface BootstrapResult {
  identity: string
  status: AppStatus
}

export async function bootstrapNodeIdentity(
  storageDir: string,
  nodeDisplayName: string,
  callRpc: <T = any>(method: string, params: any) => Promise<T>,
  verbose = false
): Promise<BootstrapResult> {
  const credsPath = path.join(storageDir, 'node-identity.json')
  let mnemonic = ''

  if (fs.existsSync(credsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
      if (parsed?.mnemonic) {
        mnemonic = parsed.mnemonic
      }
    } catch (err) {
      console.warn('[IdentityBootstrap] Failed to read existing credentials file:', err)
    }
  }

  if (!mnemonic) {
    const acct = await callRpc<{ mnemonic: string; previewIdentity: string }>('createAccount', {})
    mnemonic = acct.mnemonic
    const payload = {
      identity: acct.previewIdentity,
      mnemonic,
      createdAt: new Date().toISOString(),
      displayName: nodeDisplayName
    }
    fs.writeFileSync(credsPath, JSON.stringify(payload, null, 2), { mode: 0o600 })
    console.log(`[IdentityBootstrap] Generated new node identity: ${acct.previewIdentity}`)
    console.log(`[IdentityBootstrap] Node credentials saved to: ${credsPath}`)

    const confirmRes = await callRpc<{ status: AppStatus }>('confirmCreateAccount', {
      mnemonic,
      displayName: nodeDisplayName
    })
    return { identity: acct.previewIdentity, status: confirmRes.status }
  }

  if (verbose) {
    console.log('[IdentityBootstrap] Unlocking node with saved credentials...')
  }
  const unlockRes = await callRpc<{ status: AppStatus }>('unlock', {
    mnemonic,
    displayName: nodeDisplayName
  })
  return { identity: unlockRes.status.identity || '', status: unlockRes.status }
}

