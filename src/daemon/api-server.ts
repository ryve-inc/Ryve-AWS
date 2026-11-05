import http from 'node:http'
import { URL } from 'node:url'
import type { WorkerBridge } from './worker-bridge'
import { isAuthorized, handleCors, sendError } from './http-utils'
import {
  handleHealth,
  handleGetStatus,
  handleGetStorage,
  handleJoinNetwork,
  handleResizeNetwork,
  handleLeaveNetwork
} from './controllers/node-controller'

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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (handleCors(req, res)) return

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/'

    // Health check endpoint (always unauthenticated for load balancers)
    if (pathname === '/health' || pathname === '/api/v1/health') {
      await handleHealth(res, this.bridge)
      return
    }

    // Require Auth for API endpoints if configured
    if (!isAuthorized(req, this.apiKey)) {
      sendError(res, 401, 'Unauthorized: Invalid or missing API key')
      return
    }

    try {
      if (req.method === 'GET' && (pathname === '/api/v1/node/status' || pathname === '/api/v1/status')) {
        await handleGetStatus(res, this.bridge)
        return
      }

      if (req.method === 'GET' && pathname === '/api/v1/node/storage') {
        await handleGetStorage(res, this.bridge)
        return
      }

      if (req.method === 'POST' && pathname === '/api/v1/node/join-network') {
        await handleJoinNetwork(req, res, this.bridge)
        return
      }

      if (req.method === 'POST' && pathname === '/api/v1/node/resize-network') {
        await handleResizeNetwork(req, res, this.bridge)
        return
      }

      if (req.method === 'POST' && pathname === '/api/v1/node/leave-network') {
        await handleLeaveNetwork(req, res, this.bridge)
        return
      }

      sendError(res, 404, `Not Found: ${req.method} ${pathname}`)
    } catch (err: any) {
      console.error(`[ApiServer:Error] ${req.method} ${pathname}:`, err)
      sendError(res, 500, err?.message || 'Internal server error')
    }
  }
}
