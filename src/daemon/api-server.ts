import http from 'node:http'
import { URL } from 'node:url'
import type { WorkerBridge } from './worker-bridge'

export interface ApiServerOptions {
  port: number
  host: string
  apiKey?: string
  bridge: WorkerBridge
}

export class ApiServer {
  private server: http.Server
  private port: number
  private host: string
  private apiKey?: string
  private bridge: WorkerBridge

  constructor(opts: ApiServerOptions) {
    this.port = opts.port
    this.host = opts.host
    this.apiKey = opts.apiKey
    this.bridge = opts.bridge

    this.server = http.createServer(this.handleRequest.bind(this))
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: any) {
    const json = JSON.stringify(data, null, 2)
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end(json)
  }

  private sendError(res: http.ServerResponse, statusCode: number, message: string) {
    this.sendJson(res, statusCode, {
      success: false,
      error: message
    })
  }

  private async parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 10 * 1024 * 1024) {
          reject(new Error('Payload too large'))
        }
      })
      req.on('end', () => {
        if (!body.trim()) return resolve({})
        try {
          resolve(JSON.parse(body))
        } catch (err: any) {
          reject(new Error(`Invalid JSON payload: ${err.message}`))
        }
      })
      req.on('error', reject)
    })
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    if (!this.apiKey) return true
    const authHeader = req.headers['authorization'] || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    return token === this.apiKey
  }

  private parseCapacityBytes(body: any, defaultGb = 100): number {
    const rawBytes = body.allocatedBytes
    const rawGb = body.allocatedGb ?? body.requestedCapacityGb ?? body.newCapacityGb

    if (typeof rawBytes === 'number' && rawBytes > 0) {
      return Math.round(rawBytes)
    }
    if (typeof rawBytes === 'string' && parseFloat(rawBytes) > 0) {
      return Math.round(parseFloat(rawBytes))
    }
    if (typeof rawGb === 'number' && rawGb > 0) {
      return Math.round(rawGb * 1024 * 1024 * 1024)
    }
    if (typeof rawGb === 'string' && parseFloat(rawGb) > 0) {
      return Math.round(parseFloat(rawGb) * 1024 * 1024 * 1024)
    }
    return Math.round(defaultGb * 1024 * 1024 * 1024)
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      })
      res.end()
      return
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/'

    // Health check endpoint (always unauthenticated for load balancers)
    if (pathname === '/health' || pathname === '/api/v1/health') {
      this.sendJson(res, 200, {
        status: 'ok',
        nodeReady: this.bridge.ready,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      })
      return
    }

    // Require Auth for API endpoints if configured
    if (!this.isAuthorized(req)) {
      this.sendError(res, 401, 'Unauthorized: Invalid or missing API key')
      return
    }

    try {
      // 1. GET /api/v1/node/status
      if (req.method === 'GET' && (pathname === '/api/v1/node/status' || pathname === '/api/v1/status')) {
        const status = await this.bridge.getStatus()
        const storageInfo = await this.bridge.getStorageInfo()

        const rawNetworks = status.network?.networks || []
        const formattedNetworks = rawNetworks.map((net) => {
          const alloc = storageInfo.networks[net.id]
          const allocatedBytes = alloc?.allocatedBytes || net.allocatedBytes || 1073741824
          const usedBytes = alloc?.usedBytes || net.usedBytes || 0

          return {
            id: net.id,
            name: net.name,
            networkKeyHex: net.networkKeyHex,
            networkLink: net.networkLink,
            peers: net.peers || 0,
            allocatedBytes,
            allocatedGb: Math.round((allocatedBytes / (1024 * 1024 * 1024)) * 100) / 100,
            usedBytes,
            usedMb: Math.round((usedBytes / (1024 * 1024)) * 100) / 100,
            availableBytes: alloc?.availableBytes ?? Math.max(0, allocatedBytes - usedBytes),
            utilizationPercent: allocatedBytes > 0 ? Math.round((usedBytes / allocatedBytes) * 10000) / 100 : 0
          }
        })

        this.sendJson(res, 200, {
          success: true,
          nodeId: status.identity,
          displayName: status.displayName,
          online: status.unlocked,
          totalPeerCount: status.peers || 0,
          networksCount: formattedNetworks.length,
          networks: formattedNetworks,
          storage: {
            totalAllocatedBytes: storageInfo.totalAllocatedBytes,
            totalAllocatedGb: Math.round((storageInfo.totalAllocatedBytes / (1024 * 1024 * 1024)) * 100) / 100,
            totalUsedBytes: storageInfo.totalUsedBytes,
            totalUsedMb: Math.round((storageInfo.totalUsedBytes / (1024 * 1024)) * 100) / 100,
            totalFreeDiskBytes: storageInfo.totalFreeDiskBytes,
            totalFreeDiskGb: Math.round((storageInfo.totalFreeDiskBytes / (1024 * 1024 * 1024)) * 100) / 100,
            reservedSystemBytes: storageInfo.reservedSystemBytes
          }
        })
        return
      }

      // 2. GET /api/v1/node/storage
      if (req.method === 'GET' && pathname === '/api/v1/node/storage') {
        const storageInfo = await this.bridge.getStorageInfo()
        this.sendJson(res, 200, {
          success: true,
          storage: storageInfo
        })
        return
      }

      // 3. POST /api/v1/node/join-network
      if (req.method === 'POST' && pathname === '/api/v1/node/join-network') {
        const body = await this.parseBody(req)
        const networkLink = body.networkLink || body.link
        if (!networkLink || typeof networkLink !== 'string') {
          this.sendError(res, 400, "Missing required parameter: provide 'networkLink' or 'link'")
          return
        }

        const allocatedBytes = this.parseCapacityBytes(body, 100)
        const result = await this.bridge.joinNetwork(networkLink, body.name, allocatedBytes)
        this.sendJson(res, 200, {
          success: true,
          message: `Node successfully joined network and allocated ${(result.allocatedBytes / 1e9).toFixed(2)} GB`,
          networkId: result.networkId,
          networkKeyHex: result.networkKeyHex,
          networkLink: result.networkLink,
          allocatedBytes: result.allocatedBytes,
          allocatedGb: result.allocatedGb
        })
        return
      }

      // 4. POST /api/v1/node/resize-network
      if (req.method === 'POST' && pathname === '/api/v1/node/resize-network') {
        const body = await this.parseBody(req)
        const networkIdentifier = body.networkLink || body.link || body.networkKeyHex || body.networkId || body.id
        if (!networkIdentifier || typeof networkIdentifier !== 'string') {
          this.sendError(res, 400, "Missing required network identifier: provide 'networkLink', 'link', or 'networkId'")
          return
        }

        const allocatedBytes = this.parseCapacityBytes(body, 0)
        if (allocatedBytes <= 0) {
          this.sendError(res, 400, "Missing or invalid storage capacity: provide 'allocatedGb' or 'allocatedBytes' as a positive value")
          return
        }

        const result = await this.bridge.resizeNetwork(networkIdentifier, allocatedBytes)
        this.sendJson(res, 200, {
          success: true,
          message: `Storage allocation updated to ${(result.allocatedBytes / 1e9).toFixed(2)} GB`,
          networkId: result.networkId,
          networkKeyHex: result.networkKeyHex,
          allocatedBytes: result.allocatedBytes,
          allocatedGb: Math.round((result.allocatedBytes / (1024 * 1024 * 1024)) * 100) / 100
        })
        return
      }

      // 5. POST /api/v1/node/leave-network
      if (req.method === 'POST' && pathname === '/api/v1/node/leave-network') {
        const body = await this.parseBody(req)
        const networkIdentifier = body.networkLink || body.link || body.networkKeyHex || body.networkId || body.id
        if (!networkIdentifier || typeof networkIdentifier !== 'string') {
          this.sendError(res, 400, "Missing required network identifier: provide 'networkLink', 'link', or 'networkId'")
          return
        }

        const result = await this.bridge.leaveNetwork(networkIdentifier)
        this.sendJson(res, 200, {
          success: true,
          message: `Node successfully left network ${result.networkId}`,
          networkId: result.networkId,
          networkKeyHex: result.networkKeyHex
        })
        return
      }

      this.sendError(res, 404, `Not Found: ${req.method} ${pathname}`)
    } catch (err: any) {
      console.error(`[ApiServer:Error] ${req.method} ${pathname}:`, err)
      this.sendError(res, 500, err?.message || 'Internal server error')
    }
  }
}
