import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'

export class DHTManager {
  constructor(p2pNode) {
    this.p2pNode = p2pNode
    this.dht = null
    this.fileIndex = new Map() // 本地文件索引
  }

  async initialize() {
    if (!this.p2pNode.node) {
      throw new Error('P2P node must be started first')
    }

    this.dht = this.p2pNode.node.services.dht
    console.log('DHT Manager initialized')
  }

  // 将文件信息发布到DHT
  async publishFile(fileHash, fileMetadata) {
    try {
      // 创建CID
      const cid = await this.createCID(fileHash)
      
      // 准备要存储的数据
      const fileInfo = {
        name: fileMetadata.name,
        size: fileMetadata.size,
        hash: fileHash,
        timestamp: Date.now(),
        provider: this.p2pNode.node.peerId.toString()
      }

      // 将文件信息序列化
      const data = new TextEncoder().encode(JSON.stringify(fileInfo))
      
      // 发布到DHT
      await this.dht.put(cid.bytes, data)
      
      // 同时添加到本地索引
      this.fileIndex.set(fileHash, fileInfo)
      
      console.log(`File published to DHT: ${fileMetadata.name} (${fileHash})`)
      return cid
    } catch (error) {
      console.error('Error publishing file to DHT:', error)
      throw error
    }
  }

  // 从DHT查找文件
  async findFile(fileHash) {
    try {
      const cid = await this.createCID(fileHash)
      
      // 从DHT获取数据
      const data = await this.dht.get(cid.bytes)
      
      if (data) {
        const fileInfo = JSON.parse(new TextDecoder().decode(data))
        console.log('File found in DHT:', fileInfo)
        return fileInfo
      } else {
        console.log('File not found in DHT')
        return null
      }
    } catch (error) {
      console.error('Error finding file in DHT:', error)
      return null
    }
  }

  // 查找提供文件的节点
  async findProviders(fileHash) {
    try {
      const cid = await this.createCID(fileHash)
      
      // 查找提供者
      const providers = []
      for await (const provider of this.dht.findProviders(cid)) {
        providers.push({
          peerId: provider.id.toString(),
          multiaddrs: provider.multiaddrs.map(addr => addr.toString())
        })
      }
      
      console.log(`Found ${providers.length} providers for file ${fileHash}`)
      return providers
    } catch (error) {
      console.error('Error finding providers:', error)
      return []
    }
  }

  // 宣告自己是文件的提供者
  async provideFile(fileHash) {
    try {
      const cid = await this.createCID(fileHash)
      
      // 宣告提供文件
      await this.dht.provide(cid)
      
      console.log(`Announced as provider for file: ${fileHash}`)
    } catch (error) {
      console.error('Error providing file:', error)
      throw error
    }
  }

  // 搜索文件（按名称或关键词）
  async searchFiles(query) {
    const results = []
    
    // 首先搜索本地索引
    for (const [hash, fileInfo] of this.fileIndex) {
      if (fileInfo.name.toLowerCase().includes(query.toLowerCase())) {
        results.push(fileInfo)
      }
    }

    // TODO: 实现分布式搜索
    // 可以通过遍历已知节点来查询他们的文件列表
    
    return results
  }

  // 获取本地文件列表
  getLocalFiles() {
    return Array.from(this.fileIndex.values())
  }

  // 创建CID
  async createCID(data) {
    let bytes
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data)
    } else {
      bytes = data
    }
    
    const hash = await sha256.digest(bytes)
    return CID.create(1, raw.code, hash)
  }

  // 获取DHT统计信息
  async getDHTStats() {
    try {
      const routingTable = await this.dht.getRoutingTable()
      return {
        connectedPeers: this.p2pNode.getConnectedPeers().length,
        routingTableSize: routingTable?.size || 0,
        localFiles: this.fileIndex.size
      }
    } catch (error) {
      console.error('Error getting DHT stats:', error)
      return {
        connectedPeers: 0,
        routingTableSize: 0,
        localFiles: this.fileIndex.size
      }
    }
  }

  // 刷新DHT连接
  async refreshDHT() {
    try {
      // 触发随机游走来发现更多节点
      await this.dht.refreshRoutingTable()
      console.log('DHT routing table refreshed')
    } catch (error) {
      console.error('Error refreshing DHT:', error)
    }
  }
}