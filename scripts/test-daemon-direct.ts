import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WorkerBridge } from '../src/daemon/worker-bridge'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const testStorageDir = path.resolve(rootDir, 'test-direct-node-data')

async function runDirectTest() {
  console.log('--- TESTING RYVE MANAGED NODE WORKER BRIDGE DIRECTLY ---')

  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true })
  }

  const workerEntryPath = path.resolve(rootDir, 'dist', 'workers', 'main.cjs')
  const bridge = new WorkerBridge({
    storageDir: testStorageDir,
    workerEntryPath,
    nodeDisplayName: 'Ryve-Direct-Test-Node'
  })

  console.log('[Test] Starting WorkerBridge...')
  await bridge.start()
  console.log('[Test] WorkerBridge started and unlocked!')

  // 1. Get Status
  console.log('\n[Test 1] Testing bridge.getStatus() ...')
  const status = await bridge.getStatus()
  console.log('Node Identity:', status.identity)
  console.log('Unlocked:', status.unlocked)
  if (!status.identity || !status.unlocked) {
    throw new Error('Expected node identity and unlocked state')
  }

  // 2. Get Storage Info
  console.log('\n[Test 2] Testing bridge.getStorageInfo() ...')
  const storageInfo = await bridge.getStorageInfo()
  console.log('Free Disk Bytes:', storageInfo.totalFreeDiskBytes)
  console.log('Total Allocated Bytes:', storageInfo.totalAllocatedBytes)

  // 3. Join Network with 5 GB
  console.log('\n[Test 3] Testing bridge.joinNetwork() ...')
  const testNetworkKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
  const testLink = `p2p-drive://network/${testNetworkKey}?name=Acme-Production`
  const allocatedBytes = 5 * 1024 * 1024 * 1024

  const joinRes = await bridge.joinNetwork(testLink, 'Acme-Production', allocatedBytes)
  console.log('Join Result:', {
    success: joinRes.success,
    networkId: joinRes.networkId,
    allocatedGb: joinRes.allocatedGb
  })
  if (!joinRes.success || joinRes.allocatedGb !== 5) {
    throw new Error('Failed to join network with allocated capacity')
  }

  // 4. Resize Network to 10 GB
  console.log('\n[Test 4] Testing bridge.resizeNetwork() to 10 GB ...')
  const newAllocatedBytes = 10 * 1024 * 1024 * 1024
  await bridge.resizeNetwork(joinRes.networkId, newAllocatedBytes)
  console.log('Resize command executed!')

  // 5. Verify Updated Status
  console.log('\n[Test 5] Verifying updated allocation in getStatus() ...')
  const updatedStatus = await bridge.getStatus()
  const net = updatedStatus.network?.networks?.find((n) => n.id === joinRes.networkId)
  console.log('Updated Network Entry:', net)
  if (!net || net.allocatedBytes !== newAllocatedBytes) {
    throw new Error(`Expected allocatedBytes to be ${newAllocatedBytes}, got ${net?.allocatedBytes}`)
  }
  console.log(`✓ Confirmed: Network ${joinRes.networkId} successfully resized to 10 GB!`)

  // 6. Leave Network
  console.log('\n[Test 6] Testing bridge.leaveNetwork() ...')
  await bridge.leaveNetwork(joinRes.networkId)
  const finalStatus = await bridge.getStatus()
  const remaining = finalStatus.network?.networks?.find((n) => n.id === joinRes.networkId)
  if (remaining) {
    throw new Error('Network was not removed')
  }
  console.log(`✓ Confirmed: Network ${joinRes.networkId} successfully removed!`)

  // 7. Teardown
  console.log('\n[Test 7] Closing bridge...')
  await bridge.close()
  console.log('✓ Bridge closed cleanly.')

  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true })
  }

  console.log('\n=============================================')
  console.log('   CORE BACKEND & BRIDGE TEST PASSED 100%!   ')
  console.log('=============================================')
}

runDirectTest().catch((err) => {
  console.error('\n❌ DIRECT TEST FAILED:', err)
  process.exit(1)
})

