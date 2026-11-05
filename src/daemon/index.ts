import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkerBridge } from './worker-bridge'
import { ApiServer } from './api-server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function parseArgs() {
  const args = process.argv.slice(2)
  const options: Record<string, any> = {
    storage: process.env.RYVE_STORAGE_DIR || path.join(rootDir, 'data', 'storage'),
    port: parseInt(process.env.PORT || process.env.RYVE_PORT || '7890', 10),
    host: process.env.HOST || process.env.RYVE_HOST || '0.0.0.0',
    apiKey: process.env.RYVE_API_KEY || undefined,
    name: process.env.RYVE_NODE_NAME || 'Ryve-Managed-Storage-Node',
    verbose: process.env.RYVE_VERBOSE === 'true' || false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      console.log(`
Ryve Managed Storage Node Daemon

Usage:
  node dist/daemon/index.js [options]

Options:
  --storage <path>    Path to persistent storage directory (default: ./data/storage)
  --port <number>     Port for Portal Provisioning HTTP API (default: 7890)
  --host <ip>         Host address to bind HTTP API (default: 0.0.0.0)
  --api-key <secret>  Secret key for Bearer auth on modifying endpoints
  --name <string>     Display name for this storage node
  --verbose           Enable detailed debug logging
  -h, --help          Show this help message
`)
      process.exit(0)
    } else if (arg === '--storage' && args[i + 1]) {
      options.storage = args[++i]
    } else if (arg === '--port' && args[i + 1]) {
      options.port = parseInt(args[++i], 10)
    } else if (arg === '--host' && args[i + 1]) {
      options.host = args[++i]
    } else if (arg === '--api-key' && args[i + 1]) {
      options.apiKey = args[++i]
    } else if (arg === '--name' && args[i + 1]) {
      options.name = args[++i]
    } else if (arg === '--verbose') {
      options.verbose = true
    }
  }

  return options
}

async function main() {
  const config = parseArgs()

  console.log('='.repeat(64))
  console.log('       RYVE MANAGED STORAGE NODE DAEMON (HEADLESS)')
  console.log('='.repeat(64))
  console.log(`Persistent Storage Directory : ${config.storage}`)
  console.log(`Portal Provisioning API Host : ${config.host}:${config.port}`)
  console.log(`Authentication               : ${config.apiKey ? 'Enabled (Bearer Token)' : 'None (Open Local/VPC)'}`)
  console.log('-'.repeat(64))

  const workerEntryPath = path.resolve(rootDir, 'dist', 'workers', 'main.cjs')

  const bridge = new WorkerBridge({
    storageDir: config.storage,
    workerEntryPath,
    nodeDisplayName: config.name,
    verbose: config.verbose
  })

  console.log('[Daemon] Initializing Ryve Core worker and P2P Swarm...')
  await bridge.start()

  const status = await bridge.getStatus()
  const storageInfo = await bridge.getStorageInfo()

  console.log('='.repeat(64))
  console.log(`NODE ID (Public Key) : ${status.identity}`)
  console.log(`NODE STATUS          : ONLINE (${status.unlocked ? 'Unlocked' : 'Locked'})`)
  console.log(`CONNECTED PEERS      : ${status.peers || 0}`)
  console.log(`ACTIVE NETWORKS      : ${status.network?.networks?.length || 0}`)
  console.log(`DISK CAPACITY (FREE) : ${(storageInfo.totalFreeDiskBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`)
  console.log('='.repeat(64))

  const apiServer = new ApiServer({
    port: config.port,
    host: config.host,
    apiKey: config.apiKey,
    bridge
  })

  await apiServer.start()
  console.log(`[Daemon] Portal Provisioning API listening on http://${config.host}:${config.port}`)
  console.log(`[Daemon] Ready to accept storage provisioning requests.`)
  console.log('-'.repeat(64))
  console.log(`API Endpoints available:`)
  console.log(`  GET  /health                  -> Health check`)
  console.log(`  GET  /api/v1/node/status       -> Node ID, connected networks & usage`)
  console.log(`  GET  /api/v1/node/storage      -> Detailed disk allocation stats`)
  console.log(`  POST /api/v1/node/join-network -> Provision storage for customer network`)
  console.log(`  POST /api/v1/node/resize-network -> Upgrade/downgrade network capacity`)
  console.log(`  POST /api/v1/node/leave-network  -> Decommission network from this node`)
  console.log('='.repeat(64))

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Daemon] Received ${signal}. Shutting down gracefully...`)
    try {
      await apiServer.stop()
      await bridge.close()
      console.log('[Daemon] Shutdown complete. Goodbye.')
      process.exit(0)
    } catch (err) {
      console.error('[Daemon] Error during shutdown:', err)
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[Daemon:Fatal] Startup failed:', err)
  process.exit(1)
})
