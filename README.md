# Ryve Managed Storage Node Daemon (Headless)

Headless, terminal-only managed storage node daemon for the **Ryve P2P Encrypted Storage Network**. Built for deployment on AWS (EC2/EBS) or local testing, controlled directly via a REST API from the Ryve Portal / Control Plane.

---

## 1. Architecture Overview

- **Headless Node Daemon (`src/daemon/`)**: Runs directly on Node.js without any GUI, Electron, or browser dependencies.
- **Ryve Core Worker (`src/workers/`)**: Runs the Bare runtime engine managing Hyperswarm P2P discovery, `GlobalChunkStore` (encrypted erasure-coded chunks), and `StorageManager` (multi-network quota enforcement).
- **Single-Process Multi-Tenancy**: A single node daemon process can participate in multiple customer networks simultaneously without port conflicts or running separate VMs. Each network is allocated a dedicated storage quota (`allocatedBytes`).
- **Autonomous Provisioning**: Automatically generates and securely stores node credentials (`node-identity.json`) upon first boot. No manual wallet/seed setup required.

---

## 2. Build & Launch Commands

### 2.1 Build the Daemon & Worker
```bash
npm run build
```
*(Bundles `dist/daemon/index.js` and `dist/workers/main.cjs` in ~3 seconds).*

### 2.2 Start the Daemon

#### Option A: Quick Start (Default `./data/storage` on port `7890`)
```bash
npm start
```

#### Option B: Custom Storage Directory & Port
```bash
node dist/daemon/index.js --storage ./local-node-data --port 7890
```

#### Option C: Production Mode with API Authentication
```bash
node dist/daemon/index.js --storage /mnt/ryve-storage --port 7890 --api-key ryve_secret_token_123
```

---

## 3. Configuration Reference

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

## 4. Local Testing Guide (Step-by-Step)

Open two terminal windows to test locally.

### Step 1: Start the Daemon (Terminal 1)
```bash
node dist/daemon/index.js --storage ./local-test-storage --port 7890
```

*Expected Terminal 1 Output:*
```text
================================================================
       RYVE MANAGED STORAGE NODE DAEMON (HEADLESS)
================================================================
Persistent Storage Directory : C:\...\local-test-storage
Portal Provisioning API Host : 0.0.0.0:7890
Authentication               : None (Open Local/VPC)
----------------------------------------------------------------
NODE ID (Public Key) : 22863cbf985b32a1ec416f70fc9a070a1046...
NODE STATUS          : ONLINE (Unlocked)
CONNECTED PEERS      : 0
ACTIVE NETWORKS      : 0
DISK CAPACITY (FREE) : 28.19 GB
================================================================
[Daemon] Portal Provisioning API listening on http://0.0.0.0:7890
[Daemon] Ready to accept storage provisioning requests.
```

---

### Step 2: Query Health & Node Status (Terminal 2)

#### Health Check

**Windows (PowerShell):**
```powershell
curl.exe http://localhost:7890/health
```

**Linux / macOS (Bash):**
```bash
curl http://localhost:7890/health
```

**Expected JSON Response:**
```json
{
  "status": "ok",
  "nodeReady": true,
  "uptimeSeconds": 18,
  "timestamp": "2026-11-05T12:00:00.000Z"
}
```

---

#### Get Node Status & Storage Overview

**Windows (PowerShell):**
```powershell
curl.exe http://localhost:7890/api/v1/node/status
```

**Linux / macOS (Bash):**
```bash
curl http://localhost:7890/api/v1/node/status
```

**Expected JSON Response:**
```json
{
  "success": true,
  "nodeId": "22863cbf985b32a1ec416f70fc9a070a1046...",
  "displayName": "Ryve-Managed-Storage-Node",
  "online": true,
  "totalPeerCount": 0,
  "networksCount": 0,
  "networks": [],
  "storage": {
    "totalAllocatedBytes": 0,
    "totalAllocatedGb": 0,
    "totalUsedBytes": 0,
    "totalUsedMb": 0,
    "totalFreeDiskBytes": 30254411776,
    "totalFreeDiskGb": 28.18,
    "reservedSystemBytes": 2147483648
  }
}
```

---

### Step 3: Provision / Join Customer Network

Simulate what the Ryve Portal backend does when a customer purchases storage for their network.

> **Note:** Replace the `networkLink` with any valid 64-character hex link from your Ryve network, or use the sample link below.

#### Windows (PowerShell):
```powershell
curl.exe -X POST http://localhost:7890/api/v1/node/join-network `
  -H "Content-Type: application/json" `
  -d '{\"networkLink\":\"p2p-drive://network/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?name=Customer-Acme\",\"name\":\"Customer-Acme\",\"allocatedGb\":5}'
```

#### Linux / macOS (Bash):
```bash
curl -X POST http://localhost:7890/api/v1/node/join-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkLink": "p2p-drive://network/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?name=Customer-Acme",
    "name": "Customer-Acme",
    "allocatedGb": 5
  }'
```

**Expected JSON Response:**
```json
{
  "success": true,
  "message": "Node successfully joined network and allocated 5.00 GB",
  "networkId": "a1b2c3d4e5f6",
  "networkKeyHex": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "networkLink": "p2p-drive://network/a1b2c3d4e5f6...",
  "allocatedBytes": 5368709120,
  "allocatedGb": 5
}
```

*In Terminal 1 (Daemon logs), you will see:*
```text
[WorkerBridge] Joining network: p2p-drive://network/a1b2c3d4e5... (Allocating 5.00 GB)
[ChunkStore] Joined chunk topic for network a1b2c3d4e5f6
[P2PNetwork] Joined network a1b2c3d4e5f6 swarm topics (total joined: 1)
```

---

### Step 4: Upgrade Storage Capacity (Resize Network)

When the customer upgrades their storage plan (e.g. from 5 GB to 10 GB). **You can pass either the `networkLink` or the `networkId`**:

#### Option A: Using `networkLink` (Easiest)

**Windows (PowerShell):**
```powershell
curl.exe -X POST http://localhost:7890/api/v1/node/resize-network `
  -H "Content-Type: application/json" `
  -d '{\"networkLink\":\"p2p-drive://network/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?name=Customer-Acme\",\"allocatedGb\":10}'
```

**Linux / macOS (Bash):**
```bash
curl -X POST http://localhost:7890/api/v1/node/resize-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkLink": "p2p-drive://network/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?name=Customer-Acme",
    "allocatedGb": 10
  }'
```

#### Option B: Using `networkId`

**Windows (PowerShell):**
```powershell
curl.exe -X POST http://localhost:7890/api/v1/node/resize-network `
  -H "Content-Type: application/json" `
  -d '{\"networkId\":\"a1b2c3d4e5f6\",\"allocatedGb\":10}'
```

**Linux / macOS (Bash):**
```bash
curl -X POST http://localhost:7890/api/v1/node/resize-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkId": "a1b2c3d4e5f6",
    "allocatedGb": 10
  }'
```

**Expected JSON Response:**
```json
{
  "success": true,
  "message": "Storage allocation updated to 10.00 GB",
  "networkId": "a1b2c3d4e5f6",
  "networkKeyHex": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "allocatedBytes": 10737418240,
  "allocatedGb": 10
}
```

---

### Step 5: Verify Updated Status & Usage

#### Windows (PowerShell):
```powershell
curl.exe http://localhost:7890/api/v1/node/status
```

#### Linux / macOS (Bash):
```bash
curl http://localhost:7890/api/v1/node/status
```

**Expected JSON Response:**
```json
{
  "success": true,
  "nodeId": "22863cbf985b32a1ec416f70fc9a070a1046...",
  "displayName": "Ryve-Managed-Storage-Node",
  "online": true,
  "totalPeerCount": 0,
  "networksCount": 1,
  "networks": [
    {
      "id": "a1b2c3d4e5f6",
      "name": "Customer-Acme",
      "networkKeyHex": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      "networkLink": "p2p-drive://network/a1b2c3d4e5f6...",
      "peers": 0,
      "allocatedBytes": 10737418240,
      "allocatedGb": 10,
      "usedBytes": 0,
      "usedMb": 0,
      "availableBytes": 10737418240,
      "utilizationPercent": 0
    }
  ],
  "storage": {
    "totalAllocatedBytes": 10737418240,
    "totalAllocatedGb": 10,
    "totalUsedBytes": 0,
    "totalUsedMb": 0,
    "totalFreeDiskBytes": 30254411776,
    "totalFreeDiskGb": 28.18,
    "reservedSystemBytes": 2147483648
  }
}
```

---

### Step 6: Query Detailed Storage Breakdown

#### Windows (PowerShell):
```powershell
curl.exe http://localhost:7890/api/v1/node/storage
```

#### Linux / macOS (Bash):
```bash
curl http://localhost:7890/api/v1/node/storage
```

---

### Step 7: Decommission / Leave Network

When a customer removes storage or cancels their subscription. **You can pass either `networkLink` or `networkId`**:

#### Option A: Using `networkLink` (Easiest)

**Windows (PowerShell):**
```powershell
curl.exe -X POST http://localhost:7890/api/v1/node/leave-network `
  -H "Content-Type: application/json" `
  -d '{\"networkLink\":\"p2p-drive://network/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?name=Customer-Acme\"}'
```

**Linux / macOS (Bash):**
```bash
curl -X POST http://localhost:7890/api/v1/node/leave-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkLink": "p2p-drive://network/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?name=Customer-Acme"
  }'
```

#### Option B: Using `networkId`

**Windows (PowerShell):**
```powershell
curl.exe -X POST http://localhost:7890/api/v1/node/leave-network `
  -H "Content-Type: application/json" `
  -d '{\"networkId\":\"a1b2c3d4e5f6\"}'
```

**Linux / macOS (Bash):**
```bash
curl -X POST http://localhost:7890/api/v1/node/leave-network \
  -H "Content-Type: application/json" \
  -d '{
    "networkId": "a1b2c3d4e5f6"
  }'
```

**Expected JSON Response:**
```json
{
  "success": true,
  "message": "Node successfully left network a1b2c3d4e5f6",
  "networkId": "a1b2c3d4e5f6",
  "networkKeyHex": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
}
```

---

## 5. Testing with API Key Authentication (Optional)

If running the daemon with an API key:
```bash
node dist/daemon/index.js --port 7890 --api-key my_portal_secret
```

Pass the `Authorization: Bearer <secret>` header in your requests:

#### Windows (PowerShell):
```powershell
curl.exe -H "Authorization: Bearer my_portal_secret" http://localhost:7890/api/v1/node/status
```

#### Linux / macOS (Bash):
```bash
curl -H "Authorization: Bearer my_portal_secret" http://localhost:7890/api/v1/node/status
```

---

## 6. AWS Production Deployment Guide

### 1. Launch EC2 Instance
- **OS**: Ubuntu 22.04 LTS / 24.04 LTS or Amazon Linux 2023.
- **Instance Type**: `t3.medium` (or larger depending on network count).
- **Storage**: Attach an EBS gp3 volume formatted with ext4/XFS, mounted to `/mnt/ryve-storage`.

### 2. Install Node.js 20+
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Deploy Code & Build
```bash
cd /opt/ryve-node
npm ci --omit=dev
npm run build
```

### 4. Create Systemd Service
Create `/etc/systemd/system/ryve-node.service`:
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

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ryve-node
sudo journalctl -u ryve-node -f
```

### 5. AWS Security Group Rules
- **Port 7890 (TCP)**: Restrict to VPC CIDR / Ryve Portal Backend IP only.
- **Outbound (TCP/UDP)**: Allow outbound internet traffic for Hyperswarm DHT discovery and peer chunk replication.
