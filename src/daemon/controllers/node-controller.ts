import http from 'node:http'
import type { WorkerBridge } from '../worker-bridge'
import { sendJson, sendError, parseBody, parseCapacityBytes } from '../http-utils'

export async function handleHealth(res: http.ServerResponse, bridge: WorkerBridge): Promise<void> {
  sendJson(res, 200, {
    status: 'ok',
    nodeReady: bridge.ready,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  })
}

export async function handleGetStatus(res: http.ServerResponse, bridge: WorkerBridge): Promise<void> {
  const status = await bridge.getStatus()
  const storageInfo = await bridge.getStorageInfo()

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

  sendJson(res, 200, {
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
}

export async function handleGetStorage(res: http.ServerResponse, bridge: WorkerBridge): Promise<void> {
  const storageInfo = await bridge.getStorageInfo()
  sendJson(res, 200, {
    success: true,
    storage: storageInfo
  })
}

export async function handleJoinNetwork(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bridge: WorkerBridge
): Promise<void> {
  const body = await parseBody(req)
  const networkLink = body.networkLink || body.link
  if (!networkLink || typeof networkLink !== 'string') {
    sendError(res, 400, "Missing required parameter: provide 'networkLink' or 'link'")
    return
  }

  const allocatedBytes = parseCapacityBytes(body, 100)
  const result = await bridge.joinNetwork(networkLink, body.name, allocatedBytes)
  sendJson(res, 200, {
    success: true,
    message: `Node successfully joined network and allocated ${(result.allocatedBytes / 1e9).toFixed(2)} GB`,
    networkId: result.networkId,
    networkKeyHex: result.networkKeyHex,
    networkLink: result.networkLink,
    allocatedBytes: result.allocatedBytes,
    allocatedGb: result.allocatedGb
  })
}

export async function handleResizeNetwork(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bridge: WorkerBridge
): Promise<void> {
  const body = await parseBody(req)
  const networkIdentifier = body.networkLink || body.link || body.networkKeyHex || body.networkId || body.id
  if (!networkIdentifier || typeof networkIdentifier !== 'string') {
    sendError(res, 400, "Missing required network identifier: provide 'networkLink', 'link', or 'networkId'")
    return
  }

  const allocatedBytes = parseCapacityBytes(body, 0)
  if (allocatedBytes <= 0) {
    sendError(res, 400, "Missing or invalid storage capacity: provide 'allocatedGb' or 'allocatedBytes' as a positive value")
    return
  }

  const result = await bridge.resizeNetwork(networkIdentifier, allocatedBytes)
  sendJson(res, 200, {
    success: true,
    message: `Storage allocation updated to ${(result.allocatedBytes / 1e9).toFixed(2)} GB`,
    networkId: result.networkId,
    networkKeyHex: result.networkKeyHex,
    allocatedBytes: result.allocatedBytes,
    allocatedGb: Math.round((result.allocatedBytes / (1024 * 1024 * 1024)) * 100) / 100
  })
}

export async function handleLeaveNetwork(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bridge: WorkerBridge
): Promise<void> {
  const body = await parseBody(req)
  const networkIdentifier = body.networkLink || body.link || body.networkKeyHex || body.networkId || body.id
  if (!networkIdentifier || typeof networkIdentifier !== 'string') {
    sendError(res, 400, "Missing required network identifier: provide 'networkLink', 'link', or 'networkId'")
    return
  }

  const result = await bridge.leaveNetwork(networkIdentifier)
  sendJson(res, 200, {
    success: true,
    message: `Node successfully left network ${result.networkId}`,
    networkId: result.networkId,
    networkKeyHex: result.networkKeyHex
  })
}

