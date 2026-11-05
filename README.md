# Ryve Managed Storage Node Daemon (Headless)

Headless, terminal-only managed storage node daemon for the **Ryve P2P Encrypted Storage Network**. Built for deployment on AWS (EC2/EBS) or local testing, controlled directly via a REST API from the Ryve Portal / Control Plane.

---

## 1. Architecture Overview

- **Headless Node Daemon (`src/daemon/`)**: Runs directly on Node.js without any GUI, Electron, or browser dependencies.
- **Ryve Core Worker (`src/workers/`)**: Runs the Bare runtime engine managing Hyperswarm P2P discovery, `GlobalChunkStore` (encrypted erasure-coded chunks), and `StorageManager` (multi-network quota enforcement).
- **Single-Process Multi-Tenancy**: A single node daemon process can participate in multiple customer networks simultaneously without port conflicts or running separate VMs. Each network is allocated a dedicated storage quota (`allocatedBytes`).
- **Autonomous Provisioning**: Automatically generates and securely stores node credentials (`node-identity.json`) upon first boot. No manual wallet/seed setup required.

---

## 2. Quick Start

### Build
```bash
npm run build
```
This compiles:
- `dist/daemon/index.js` (Node.js REST API daemon)
- `dist/workers/main.cjs` (Bare P2P storage worker)

### Run the Daemon
```bash
npm start
```
Or with custom configuration:
```bash
node dist/daemon/index.js --storage ./data/storage --port 7890 --host 0.0.0.0
```

---

## 3. Configuration

Options can be supplied via command-line arguments or environment variables:

| CLI Option | Environment Variable | Default | Description |
| :--- | :--- | :--- | :--- |
| `--storage <path>` | `RYVE_STORAGE_DIR` | `./data/storage` | Persistent directory for chunks, keys, and registry |
| `--port <number>` | `PORT` / `RYVE_PORT` | `7890` | Port for Portal Provisioning HTTP API |
| `--host <ip>` | `HOST` / `RYVE_HOST` | `0.0.0.0` | Host interface to bind HTTP API |
| `--api-key <secret>`| `RYVE_API_KEY` | _None (open)_ | Optional Bearer token for API authentication |
| `--name <string>` | `RYVE_NODE_NAME` | `Ryve-Managed-Storage-Node` | Display name for the node in the P2P swarm |
| `--verbose` | `RYVE_VERBOSE` | `false` | Enable verbose debug logging |

---

## 4. Portal REST API Reference

All requests and responses use JSON. When `--api-key` is configured, pass `Authorization: Bearer <secret>` header.

### 4.1 Health Check
```http
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "nodeReady": true,
  "uptimeSeconds": 142,
  "timestamp": "2026-11-05T12:00:00.000Z"
}
```

---

### 4.2 Get Node Status & Networks
```http
GET /api/v1/node/status
```
**Response:**
```json
{
  "success": true,
  "nodeId": "d1493adf6f772311e3234cf166a7100941aa51100a79eb2da12270046c661d52",
  "displayName": "Ryve-Managed-Storage-Node",
  "online": true,
  "totalPeerCount": 4,
  "networksCount": 1,
  "networks": [
    {
      "id": "a1b2c3d4e5f6",
      "name": "Customer-Acme",
      "networkKeyHex": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      "networkLink": "p2p-drive://network/a1b2c3d4e5f6...",
      "peers": 3,
      "allocatedBytes": 107374182400,
      "allocatedGb": 100,
      "usedBytes": 45219800,
      "usedMb": 43.12,
      "availableBytes": 107328962600,
      "utilizationPercent": 0.04
    }
  ],
  "storage": {
    "totalAllocatedBytes": 107374182400,
    "totalAllocatedGb": 100,
    "totalUsedBytes": 45219800,
    "totalUsedMb": 43.12,
    "totalFreeDiskBytes": 850000000000,
    "totalFreeDiskGb": 791.62,
    "reservedSystemBytes": 2147483648
  }
}
```

---

### 4.3 Provision / Join Network
Called by the Portal when a customer orders storage for a network.

```http
POST /api/v1/node/join-network
Content-Type: application/json

{
  "networkLink": "p2p-drive://network/<64_char_hex>?name=Customer-Acme",
  "name": "Customer-Acme",
  "allocatedGb": 100
}
```
**Response:**
```json
{
  "success": true,
  "message": "Node successfully joined network and allocated 100.00 GB",
  "networkId": "a1b2c3d4e5f6",
  "networkKeyHex": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "networkLink": "p2p-drive://network/a1b2c3d4e5f6...",
  "allocatedBytes": 107374182400,
  "allocatedGb": 100
}
```

---

### 4.4 Upgrade / Resize Network Storage
```http
POST /api/v1/node/resize-network
Content-Type: application/json

{
  "networkId": "a1b2c3d4e5f6",
  "allocatedGb": 500
}
```
**Response:**
```json
{
  "success": true,
  "message": "Storage allocation updated for network a1b2c3d4e5f6",
  "networkId": "a1b2c3d4e5f6",
  "newAllocatedBytes": 536870912000,
  "newAllocatedGb": 500
}
```

---

### 4.5 Leave / Decommission Network
```http
POST /api/v1/node/leave-network
Content-Type: application/json

{
  "networkId": "a1b2c3d4e5f6"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Node successfully left network a1b2c3d4e5f6",
  "networkId": "a1b2c3d4e5f6"
}
```

---

## 5. How to Test Locally

### Step 1: Start the Daemon in Terminal 1
```bash
npm start -- --storage ./local-test-storage --port 7890
```
The terminal will display:
```text
================================================================
       RYVE MANAGED STORAGE NODE DAEMON (HEADLESS)
================================================================
Persistent Storage Directory : C:\...\local-test-storage
Portal Provisioning API Host : 0.0.0.0:7890
Authentication               : None (Open Local/VPC)
----------------------------------------------------------------
NODE ID (Public Key) : 8f4ca...
NODE STATUS          : ONLINE (Unlocked)
CONNECTED PEERS      : 0
ACTIVE NETWORKS      : 0
DISK CAPACITY (FREE) : 28.19 GB
================================================================
[Daemon] Portal Provisioning API listening on http://0.0.0.0:7890
[Daemon] Ready to accept storage provisioning requests.
```

### Step 2: Query Health & Status in Terminal 2
```bash
# Health check
curl http://localhost:7890/health

# Check initial node status
curl http://localhost:7890/api/v1/node/status
```

### Step 3: Simulate Portal Provisioning (Join Network)
Use any Ryve network link (from your desktop app or generate a test 64-character hex link):
```bash
curl -X POST http://localhost:7890/api/v1/node/join-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkLink": "p2p-drive://network/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef?name=MyTestNetwork",
    "name": "MyTestNetwork",
    "allocatedGb": 5
  }'
```
You will see Terminal 1 announce:
```text
[WorkerBridge] Joining network: p2p-drive://network/0123456789... (Allocating 5.00 GB)
[ChunkStore] Joined chunk topic for network 0123456789ab
[P2PNetwork] Joined network 0123456789ab swarm topics
```

### Step 4: Test Storage Resizing (Upgrade to 10 GB)
```bash
curl -X POST http://localhost:7890/api/v1/node/resize-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkId": "0123456789ab",
    "allocatedGb": 10
  }'
```

### Step 5: Test Network Removal
```bash
curl -X POST http://localhost:7890/api/v1/node/leave-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkId": "0123456789ab"
  }'
```

---

## 6. AWS Deployment Guide

1. **EC2 Instance**: Launch an Ubuntu / Amazon Linux 2023 instance (e.g. `t3.medium` or `c6i.large`).
2. **EBS Volume**: Attach an EBS volume formatted with XFS or ext4 mounted at `/mnt/ryve-storage`.
3. **Node Runtime**: Install Node.js 20+.
4. **Systemd Service (`/etc/systemd/system/ryve-node.service`)**:
```ini
[Unit]
Description=Ryve Managed Storage Node Daemon
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/ryve-node
ExecStart=/usr/bin/node /opt/ryve-node/dist/daemon/index.js --storage /mnt/ryve-storage --port 7890 --api-key YOUR_PORTAL_SECRET
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```
5. **Security Groups**:
   - Keep port `7890` private to your VPC / Ryve Portal backend.
   - Allow outbound UDP/TCP for Hyperswarm P2P discovery and chunk replication.
