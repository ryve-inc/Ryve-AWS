import http from 'node:http'

export function sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
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

export function sendError(res: http.ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, {
    success: false,
    error: message
  })
}

export async function parseBody(req: http.IncomingMessage): Promise<any> {
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

export function parseCapacityBytes(body: any, defaultGb = 100): number {
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

export function isAuthorized(req: http.IncomingMessage, apiKey?: string): boolean {
  if (!apiKey) return true
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  return token === apiKey
}

export function handleCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end()
    return true
  }
  return false
}

