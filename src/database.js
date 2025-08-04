import fs from 'fs/promises'
import path from 'path'

export class DatabaseManager {
  constructor(dataDir = './data') {
    this.dataDir = dataDir
    this.dbFiles = {
      nodes: path.join(dataDir, 'nodes.json'),
      files: path.join(dataDir, 'files.json'),
      peers: path.join(dataDir, 'peers.json'),
      config: path.join(dataDir, 'config.json'),
      transfers: path.join(dataDir, 'transfers.json')
    }
    
    this.cache = {
      nodes: new Map(),
      files: new Map(),
      peers: new Map(),
      config: new Map(),
      transfers: new Map()
    }
    
    this.initialized = false
  }

  async initialize() {
    try {
      // 确保数据目录存在
      await fs.mkdir(this.dataDir, { recursive: true })
      
      // 加载所有数据
      await this.loadAllData()
      
      // 设置自动保存
      this.setupAutoSave()
      
      this.initialized = true
      // console.log('Database manager initialized')
    } catch (error) {
      console.error('Error initializing database:', error)
      throw error
    }
  }

  async loadAllData() {
    const loadPromises = Object.entries(this.dbFiles).map(async ([type, filePath]) => {
      try {
        const data = await fs.readFile(filePath, 'utf8')
        const parsed = JSON.parse(data)
        
        // 将数组转换为Map（如果需要）
        if (Array.isArray(parsed)) {
          this.cache[type] = new Map(parsed)
        } else {
          this.cache[type] = new Map(Object.entries(parsed))
        }
        
        console.log(`Loaded ${this.cache[type].size} ${type} records`)
      } catch (error) {
        // 文件不存在或无法读取，初始化为空Map
        this.cache[type] = new Map()
        console.log(`Initialized empty ${type} cache`)
      }
    })

    await Promise.all(loadPromises)
  }

  setupAutoSave() {
    // 每5分钟自动保存一次
    setInterval(() => {
      this.saveAllData().catch(error => {
        console.error('Error during auto-save:', error)
      })
    }, 5 * 60 * 1000) // 5分钟

    // 程序退出时保存数据
    process.on('beforeExit', () => {
      this.saveAllData()
    })
  }

  async saveAllData() {
    const savePromises = Object.entries(this.dbFiles).map(async ([type, filePath]) => {
      try {
        const data = Object.fromEntries(this.cache[type])
        await fs.writeFile(filePath, JSON.stringify(data, null, 2))
      } catch (error) {
        console.error(`Error saving ${type} data:`, error)
      }
    })

    await Promise.all(savePromises)
    console.log('All data saved to disk')
  }

  // 节点相关操作
  async saveNodeInfo(nodeId, nodeInfo) {
    this.cache.nodes.set(nodeId, {
      ...nodeInfo,
      lastSeen: Date.now(),
      updatedAt: Date.now()
    })
  }

  async getNodeInfo(nodeId) {
    return this.cache.nodes.get(nodeId)
  }

  async getAllNodes() {
    return Array.from(this.cache.nodes.entries()).map(([id, info]) => ({
      id,
      ...info
    }))
  }

  async removeNode(nodeId) {
    return this.cache.nodes.delete(nodeId)
  }

  // 文件相关操作
  async saveFileInfo(fileHash, fileInfo) {
    this.cache.files.set(fileHash, {
      ...fileInfo,
      savedAt: Date.now(),
      updatedAt: Date.now()
    })
  }

  async getFileInfo(fileHash) {
    return this.cache.files.get(fileHash)
  }

  async getAllFiles() {
    return Array.from(this.cache.files.entries()).map(([hash, info]) => ({
      hash,
      ...info
    }))
  }

  async searchFiles(query) {
    const results = []
    const lowerQuery = query.toLowerCase()
    
    for (const [hash, fileInfo] of this.cache.files) {
      if (fileInfo.name && fileInfo.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          hash,
          ...fileInfo
        })
      }
    }
    
    return results
  }

  async removeFile(fileHash) {
    return this.cache.files.delete(fileHash)
  }

  // 对等节点相关操作
  async savePeerInfo(peerId, peerInfo) {
    this.cache.peers.set(peerId, {
      ...peerInfo,
      lastSeen: Date.now(),
      updatedAt: Date.now()
    })
  }

  async getPeerInfo(peerId) {
    return this.cache.peers.get(peerId)
  }

  async getAllPeers() {
    return Array.from(this.cache.peers.entries()).map(([id, info]) => ({
      id,
      ...info
    }))
  }

  async updatePeerLastSeen(peerId) {
    const peerInfo = this.cache.peers.get(peerId)
    if (peerInfo) {
      peerInfo.lastSeen = Date.now()
      this.cache.peers.set(peerId, peerInfo)
    }
  }

  async removePeer(peerId) {
    return this.cache.peers.delete(peerId)
  }

  // 配置相关操作
  async saveConfig(key, value) {
    this.cache.config.set(key, {
      value,
      updatedAt: Date.now()
    })
  }

  async getConfig(key, defaultValue = null) {
    const config = this.cache.config.get(key)
    return config ? config.value : defaultValue
  }

  async getAllConfig() {
    return Object.fromEntries(
      Array.from(this.cache.config.entries()).map(([key, config]) => [
        key,
        config.value
      ])
    )
  }

  // 传输记录相关操作
  async saveTransferRecord(transferId, transferInfo) {
    this.cache.transfers.set(transferId, {
      ...transferInfo,
      recordedAt: Date.now()
    })
  }

  async getTransferRecord(transferId) {
    return this.cache.transfers.get(transferId)
  }

  async getAllTransfers() {
    return Array.from(this.cache.transfers.entries()).map(([id, info]) => ({
      id,
      ...info
    }))
  }

  async getRecentTransfers(limit = 50) {
    const transfers = this.getAllTransfers()
    return transfers
      .sort((a, b) => b.recordedAt - a.recordedAt)
      .slice(0, limit)
  }

  async removeTransferRecord(transferId) {
    return this.cache.transfers.delete(transferId)
  }

  // 清理操作
  async cleanupOldRecords() {
    const now = Date.now()
    const maxAge = 30 * 24 * 60 * 60 * 1000 // 30天

    // 清理旧的节点记录
    for (const [nodeId, nodeInfo] of this.cache.nodes) {
      if (now - nodeInfo.lastSeen > maxAge) {
        this.cache.nodes.delete(nodeId)
      }
    }

    // 清理旧的对等节点记录
    for (const [peerId, peerInfo] of this.cache.peers) {
      if (now - peerInfo.lastSeen > maxAge) {
        this.cache.peers.delete(peerId)
      }
    }

    // 清理旧的传输记录
    for (const [transferId, transferInfo] of this.cache.transfers) {
      if (now - transferInfo.recordedAt > maxAge) {
        this.cache.transfers.delete(transferId)
      }
    }

    console.log('Cleanup completed')
  }

  // 导出数据
  async exportData() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      nodes: Object.fromEntries(this.cache.nodes),
      files: Object.fromEntries(this.cache.files),
      peers: Object.fromEntries(this.cache.peers),
      config: Object.fromEntries(this.cache.config),
      transfers: Object.fromEntries(this.cache.transfers)
    }

    return exportData
  }

  // 导入数据
  async importData(importData) {
    try {
      if (importData.nodes) {
        this.cache.nodes = new Map(Object.entries(importData.nodes))
      }
      if (importData.files) {
        this.cache.files = new Map(Object.entries(importData.files))
      }
      if (importData.peers) {
        this.cache.peers = new Map(Object.entries(importData.peers))
      }
      if (importData.config) {
        this.cache.config = new Map(Object.entries(importData.config))
      }
      if (importData.transfers) {
        this.cache.transfers = new Map(Object.entries(importData.transfers))
      }

      await this.saveAllData()
      console.log('Data imported successfully')
    } catch (error) {
      console.error('Error importing data:', error)
      throw error
    }
  }

  // 获取统计信息
  getStats() {
    return {
      nodes: this.cache.nodes.size,
      files: this.cache.files.size,
      peers: this.cache.peers.size,
      config: this.cache.config.size,
      transfers: this.cache.transfers.size,
      initialized: this.initialized
    }
  }
}