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
  // async findFile(fileHash) {
  //   try {
  //     const cid = await this.createCID(fileHash)

  //     // 从DHT获取数据
  //     const data = await this.dht.get(cid.bytes)

  //     if (data) {
  //       console.log('data:',data)
  //       const fileInfo = JSON.parse(new TextDecoder().decode(data))
  //       console.log('File found in DHT:', fileInfo)
  //       return fileInfo
  //     } else {
  //       console.log('File not found in DHT')
  //       return null
  //     }
  //   } catch (error) {
  //     console.error('Error finding file in DHT:', error)
  //     return null
  //   }
  // }

  async findFile(fileHash) {
    try {
      const cid = await this.createCID(fileHash)

      // 获取异步迭代器
      const results = this.dht.get(cid.bytes)

      for await (const event of results) {
        if (event.value) {  // 只取包含 value 的事件
          const fileInfo = JSON.parse(new TextDecoder().decode(event.value))
          console.log('fileInfo:', fileInfo)
          console.log('File found in DHT:', fileInfo)
          return fileInfo
        }
      }

      console.log('File not found in DHT')
      return null
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
      // 获取基本的连接信息
      const connectedPeers = this.p2pNode.getConnectedPeers().length

      // 尝试获取DHT特定信息，但要安全处理可能不存在的方法
      let routingTableSize = 0

      try {
        // 尝试不同的方式获取路由表信息
        if (this.dht && typeof this.dht.getRoutingTable === 'function') {
          const routingTable = await this.dht.getRoutingTable()
          routingTableSize = routingTable?.size || 0
        } else if (this.dht && this.dht.routingTable) {
          // 如果直接有routingTable属性
          routingTableSize = this.dht.routingTable.size || 0
        } else if (this.dht && typeof this.dht.getKBuckets === 'function') {
          // 尝试通过K-buckets获取信息
          const kBuckets = this.dht.getKBuckets()
          routingTableSize = kBuckets ? kBuckets.length : 0
        }
      } catch (dhtError) {
        console.debug('Could not get routing table info:', dhtError.message)
        // 如果获取DHT特定信息失败，继续使用默认值
      }

      return {
        connectedPeers,
        routingTableSize,
        localFiles: this.fileIndex.size,
        dhtEnabled: !!this.dht
      }
    } catch (error) {
      console.error('Error getting DHT stats:', error)
      // 返回安全的默认值
      return {
        connectedPeers: this.p2pNode.getConnectedPeers()?.length || 0,
        routingTableSize: 0,
        localFiles: this.fileIndex.size,
        dhtEnabled: false,
        error: error.message
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