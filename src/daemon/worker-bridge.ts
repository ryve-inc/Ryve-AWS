import path from 'node:path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import PearRuntime from 'pear-runtime'
import FramedStream from 'framed-stream'
import type { AppStatus, StorageInfo } from '../shared/types'
import { bootstrapNodeIdentity } from './identity-bootstrap'

export interface WorkerBridgeOptions {
  storageDir: string
  workerEntryPath: string
  upgradeLink?: string
  nodeDisplayName?: string
  verbose?: boolean
}

export interface JoinNetworkResult {
  success: boolean
  networkId: string
  networkKeyHex: string
  networkLink: string
  allocatedBytes: number
  allocatedGb: number
  status: AppStatus
}

export interface ResizeNetworkResult {
  networkId: string
  networkKeyHex: string
  allocatedBytes: number
  status: AppStatus
}

export interface LeaveNetworkResult {
  networkId: string
  networkKeyHex: string
  status: AppStatus
}

export class WorkerBridge extends EventEmitter {
  private worker: any = null
  private pipe: any = null
  private storageDir: string
  private workerEntryPath: string
  private upgradeLink: string
  private nodeDisplayName: string
  private verbose: boolean

  private msgIdCounter = 1
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: any) => void
      reject: (err: any) => void
      timer: NodeJS.Timeout
      method: string
    }
  >()

  private isUnlocked = false
  private currentStatus: AppStatus | null = null
  private readyPromise: Promise<void>
  private readyResolver!: () => void

  constructor(opts: WorkerBridgeOptions) {
    super()
    this.storageDir = path.resolve(opts.storageDir)
    this.workerEntryPath = path.resolve(opts.workerEntryPath)
    this.upgradeLink = opts.upgradeLink || 'pear://8no91jctbqfwzfqjqwznaqnq19ebp3imyrbua13qu9fjdc7meygo'
    this.nodeDisplayName = opts.nodeDisplayName || 'Ryve-Managed-Storage-Node'
    this.verbose = !!opts.verbose

    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve
    })
  }

  async start(): Promise<void> {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true })
    }

    if (!fs.existsSync(this.workerEntryPath)) {
      throw new Error(`Worker bundle not found at: ${this.workerEntryPath}. Run "npm run build" first.`)
    }

    const workerArgs = [
      'false', // no updates
      '1.0.0', // version
      this.upgradeLink, // upgrade link
      'ryve-storage-node', // app name
      this.storageDir, // persistent dir
      null // appPath
    ]

    if (this.verbose) {
      console.log(`[WorkerBridge] Spawning Bare worker: ${this.workerEntryPath}`)
      console.log(`[WorkerBridge] Storage directory: ${this.storageDir}`)
    }

    this.worker = PearRuntime.run(this.workerEntryPath, workerArgs)
    this.pipe = new FramedStream(this.worker)

    this.worker.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.log(`[RyveCore] ${text}`)
    })

    this.worker.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.error(`[RyveCore:Err] ${text}`)
    })

    this.worker.on('exit', (code: number) => {
      console.warn(`[WorkerBridge] Worker process exited with code: ${code}`)
      this.emit('exit', code)
    })

    this.pipe.on('data', (raw: Buffer) => {
      this.handleIncomingMessage(raw.toString())
    })

    await this.readyPromise
  }

  private handleIncomingMessage(rawStr: string): void {
    let msg: any
    try {
      msg = JSON.parse(rawStr)
    } catch {
      if (this.verbose) console.log(`[WorkerBridge:Raw] ${rawStr}`)
      return
    }

    // Handle RPC Responses
    if (typeof msg.id === 'number' && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!
      this.pendingRequests.delete(msg.id)
      clearTimeout(pending.timer)

      if (msg.ok) {
        pending.resolve(msg.result)
      } else {
        pending.reject(new Error(msg.error || `RPC error in ${pending.method}`))
      }
      return
    }

    // Handle Worker Push Events
    if (msg.type === 'event') {
      if (this.verbose) console.log(`[WorkerBridge:Event] ${msg.name}`)

      switch (msg.name) {
        case 'status':
          if (msg.data) {
            this.currentStatus = msg.data as AppStatus
            this.emit('status', this.currentStatus)
          }
          break

        case 'auth':
          this.handleAuthEvent(msg.data).catch((err) => {
            console.error('[WorkerBridge] Auto-auth failed:', err)
          })
          break
      }
    }
  }

  private async handleAuthEvent(data: any): Promise<void> {
    if (data?.needsAuth) {
      if (this.verbose) {
        console.log('[WorkerBridge] Node identity uninitialized. Initializing autonomous credentials...')
      }
      const res = await bootstrapNodeIdentity(
        this.storageDir,
        this.nodeDisplayName,
        this.callRpc.bind(this),
        this.verbose
      )
      this.currentStatus = res.status
    } else {
      if (data?.status) this.currentStatus = data.status
    }
    this.isUnlocked = true
    this.readyResolver()
  }

  callRpc<T = any>(method: string, params: any = {}, timeoutMs = 30000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.msgIdCounter++
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC request '${method}' (ID ${id}) timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer, method })

      const payload = JSON.stringify({
        type: 'rpc',
        id,
        method,
        params
      })

      try {
        this.pipe.write(payload)
      } catch (err) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        reject(err)
      }
    })
  }

  async getStatus(): Promise<AppStatus> {
    const status = await this.callRpc<AppStatus>('getStatus', {})
    this.currentStatus = status
    return status
  }

  async getStorageInfo(): Promise<StorageInfo> {
    return this.callRpc<StorageInfo>('getStorageInfo', {})
  }

  async joinNetwork(
    networkLink: string,
    name?: string,
    allocatedBytes = 100 * 1024 * 1024 * 1024
  ): Promise<JoinNetworkResult> {
    console.log(`[WorkerBridge] Joining network: ${networkLink.slice(0, 30)}... (Allocating ${(allocatedBytes / 1e9).toFixed(2)} GB)`)

    // 1. Call joinNetwork with extended timeout for DHT discovery
    const joinRes = await this.callRpc<{
      status: AppStatus
      networkLink: string
      networkKeyHex: string
    }>('joinNetwork', { link: networkLink, name }, 120000)

    const networkKeyHex = joinRes.networkKeyHex
    const networkId = networkKeyHex.slice(0, 12)

    // 2. Set storage allocation for this specific network
    const allocRes = await this.callRpc<any>('setNetworkStorageAllocation', {
      id: networkId,
      networkLink,
      allocatedBytes
    })

    this.currentStatus = allocRes.status || allocRes
    const finalAllocated = allocRes.allocatedBytes || allocatedBytes

    return {
      success: true,
      networkId,
      networkKeyHex,
      networkLink: joinRes.networkLink,
      allocatedBytes: finalAllocated,
      allocatedGb: Math.round((finalAllocated / (1024 * 1024 * 1024)) * 100) / 100,
      status: this.currentStatus!
    }
  }

  async resizeNetwork(networkIdentifier: string, allocatedBytes: number): Promise<ResizeNetworkResult> {
    console.log(`[WorkerBridge] Resizing network '${networkIdentifier.slice(0, 30)}...' to ${(allocatedBytes / 1e9).toFixed(2)} GB`)
    const res = await this.callRpc<{
      ok: boolean
      networkId: string
      networkKeyHex: string
      allocatedBytes: number
      requestedBytes: number
      status: AppStatus
    }>('setNetworkStorageAllocation', {
      id: networkIdentifier,
      networkLink: networkIdentifier,
      allocatedBytes
    })
    this.currentStatus = res.status
    return {
      networkId: res.networkId,
      networkKeyHex: res.networkKeyHex,
      allocatedBytes: res.allocatedBytes,
      status: res.status
    }
  }

  async leaveNetwork(networkIdentifier: string): Promise<LeaveNetworkResult> {
    console.log(`[WorkerBridge] Leaving network: '${networkIdentifier.slice(0, 30)}...'`)
    const res = await this.callRpc<{
      ok: boolean
      networkId: string
      networkKeyHex: string
      status: AppStatus
    }>('removeNetwork', {
      id: networkIdentifier,
      networkLink: networkIdentifier
    })
    this.currentStatus = res.status
    return {
      networkId: res.networkId,
      networkKeyHex: res.networkKeyHex,
      status: res.status
    }
  }

  async close(): Promise<void> {
    if (this.pipe) {
      try {
        this.pipe.destroy()
      } catch {}
    }
  }

  get status(): AppStatus | null {
    return this.currentStatus
  }

  get ready(): boolean {
    return this.isUnlocked
  }
}
