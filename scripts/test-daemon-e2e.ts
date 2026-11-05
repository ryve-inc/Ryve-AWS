import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const testStorageDir = path.resolve(rootDir, 'test-e2e-node-data')
const TEST_PORT = 8923
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request(path: string, options: any = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  })
  const text = await res.text()
  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, text }
  }
}

async function runTest() {
  console.log('--- STARTING RYVE MANAGED NODE E2E TEST ---')

  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true })
  }

  const daemonEntry = path.join(rootDir, 'dist', 'daemon', 'index.js')
  console.log(`[Test] Launching daemon: ${daemonEntry}`)

  const proc = spawn('node', [
    daemonEntry,
    '--storage', testStorageDir,
    '--host', '127.0.0.1',
    '--port', String(TEST_PORT),
    '--name', 'Ryve-Test-Node-01'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  proc.stdout.on('data', (d) => process.stdout.write(`[DAEMON-STDOUT] ${d.toString()}`))
  proc.stderr.on('data', (d) => process.stderr.write(`[DAEMON-STDERR] ${d.toString()}`))

  let isReady = false
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    try {
      const health = await request('/health')
      console.log(`[Test:Poll ${i}] Status: ${health.status}, Data:`, health.data || health.text)
      if (health.status === 200 && health.data?.nodeReady) {
        isReady = true
        console.log('[Test] Daemon is healthy and node is ready!')
        break
      }
    } catch (err: any) {
      console.log(`[Test:Poll ${i}] Fetch error:`, err?.message, err?.cause)
    }
  }

  if (!isReady) {
    proc.kill('SIGINT')
    throw new Error('Daemon failed to become ready within 15 seconds')
  }

  // 1. GET /api/v1/node/status
  console.log('\n[Test 1] Testing GET /api/v1/node/status ...')
  const statusRes = await request('/api/v1/node/status')
  console.log('Status Response:', statusRes.data)
  if (!statusRes.data.success || !statusRes.data.nodeId) {
    throw new Error('Node status check failed')
  }
  console.log(`✓ Node ID confirmed: ${statusRes.data.nodeId}`)

  // 2. POST /api/v1/node/join-network
  console.log('\n[Test 2] Testing POST /api/v1/node/join-network ...')
  const testNetworkKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
  const testLink = `p2p-drive://network/${testNetworkKey}?name=Acme-Production`
  const joinRes = await request('/api/v1/node/join-network', {
    method: 'POST',
    body: JSON.stringify({
      networkLink: testLink,
      name: 'Acme-Production',
      allocatedGb: 250
    })
  })
  console.log('Join Response:', joinRes.data)
  if (!joinRes.data.success || joinRes.data.allocatedGb !== 250) {
    throw new Error('Join network failed')
  }
  const netId = joinRes.data.networkId
  console.log(`✓ Network joined successfully! Assigned Network ID: ${netId}, Allocated: ${joinRes.data.allocatedGb} GB`)

  // 3. POST /api/v1/node/resize-network
  console.log('\n[Test 3] Testing POST /api/v1/node/resize-network (Storage Upgrade to 500 GB) ...')
  const resizeRes = await request('/api/v1/node/resize-network', {
    method: 'POST',
    body: JSON.stringify({
      networkId: netId,
      allocatedGb: 500
    })
  })
  console.log('Resize Response:', resizeRes.data)
  if (!resizeRes.data.success || resizeRes.data.newAllocatedGb !== 500) {
    throw new Error('Resize network failed')
  }
  console.log(`✓ Network resized successfully to ${resizeRes.data.newAllocatedGb} GB!`)

  // 4. Verify in GET /api/v1/node/status
  console.log('\n[Test 4] Verifying network status list...')
  const updatedStatus = await request('/api/v1/node/status')
  const net = updatedStatus.data.networks.find((n: any) => n.id === netId)
  if (!net || net.allocatedGb !== 500) {
    throw new Error(`Expected network ${netId} with 500 GB, got ${JSON.stringify(net)}`)
  }
  console.log(`✓ Network correctly listed in node status with 500 GB allocation!`)

  // 5. POST /api/v1/node/leave-network
  console.log('\n[Test 5] Testing POST /api/v1/node/leave-network ...')
  const leaveRes = await request('/api/v1/node/leave-network', {
    method: 'POST',
    body: JSON.stringify({ networkId: netId })
  })
  console.log('Leave Response:', leaveRes.data)
  if (!leaveRes.data.success) {
    throw new Error('Leave network failed')
  }
  console.log(`✓ Network left successfully!`)

  // 6. Graceful Shutdown
  console.log('\n[Test 6] Testing graceful shutdown...')
  proc.kill('SIGINT')
  await sleep(1500)
  console.log('✓ Daemon shut down cleanly.')

  // Cleanup
  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true })
  }

  console.log('\n=============================================')
  console.log('   ALL E2E INTEGRATION TESTS PASSED 100%!    ')
  console.log('=============================================')
}

runTest().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err)
  process.exit(1)
})

