// src/dht-manager.js - Enhanced for Network File Sharing

import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import { peerIdFromString } from '@libp2p/peer-id'

export class DHTManager {
  constructor(p2pNode) {
    this.p2pNode = p2pNode
    this.dht = null
    this.fileIndex = new Map() // 本地文件索引
    this.networkFileIndex = new Map() // 网络文件索引
    this.networkProviders = new Map() // 网络文件提供者映射
    this.fileAnnouncements = new Map() // 文件公告缓存
    this.globalFileRegistry = new Map() // 全局文件注册表
    this.peerCapabilities = new Map() // 对等节点能力映射
    
    // 网络文件共享配置
    this.shareConfig = {
      announceInterval: 30000, // 30秒公告一次
      maxAnnouncementAge: 300000, // 5分钟过期
      maxFileSearchResults: 50,
      enableGlobalSharing: true,
      enableFileReplication: true,
      replicationFactor: 3 // 文件复制因子
    }

    // 性能监控
    this.stats = {
      filesShared: 0,
      filesDiscovered: 0,
      networkQueries: 0,
      successfulDownloads: 0,
      failedDownloads: 0
    }
  }

  async initialize() {
    if (!this.p2pNode.node) {
      throw new Error('P2P node must be started first')
    }

    this.dht = this.p2pNode.node.services.dht

    if (!this.dht) {
      throw new Error('DHT service not available on P2P node')
    }

    console.log('DHT Manager initialized for network file sharing')

    // 注册网络文件共享协议
    this.setupNetworkProtocols()

    // 启动网络文件发现和同步
    this.startNetworkFileDiscovery()

    // 启动定期文件公告
    this.startFileAnnouncements()

    // 启动对等节点能力交换
    this.startCapabilityExchange()

    // 延迟执行DHT测试
    setTimeout(() => {
      this.testNetworkConnectivity().catch(error => {
        console.debug('Network connectivity test failed:', error.message)
      })
    }, 10000)
  }

  // 设置网络协议
  setupNetworkProtocols() {
    // 文件查询协议 - 增强版
    this.p2pNode.node.handle('/p2p-file-sharing/network-query/1.0.0', ({ stream, connection }) => {
      this.handleNetworkQuery(stream, connection)
    })

    // 文件公告协议
    this.p2pNode.node.handle('/p2p-file-sharing/file-announce/1.0.0', ({ stream, connection }) => {
      this.handleFileAnnouncement(stream, connection)
    })

    // 全局文件目录同步协议
    this.p2pNode.node.handle('/p2p-file-sharing/global-sync/1.0.0', ({ stream, connection }) => {
      this.handleGlobalSync(stream, connection)
    })

    // 文件可用性检查协议
    this.p2pNode.node.handle('/p2p-file-sharing/availability/1.0.0', ({ stream, connection }) => {
      this.handleAvailabilityCheck(stream, connection)
    })

    // 对等节点能力交换协议
    this.p2pNode.node.handle('/p2p-file-sharing/capabilities/1.0.0', ({ stream, connection }) => {
      this.handleCapabilityExchange(stream, connection)
    })
  }

  // 启动网络文件发现
  startNetworkFileDiscovery() {
    // 初始延迟
    setTimeout(() => {
      this.discoverNetworkFiles().catch(error => {
        console.debug('Initial network file discovery failed:', error.message)
      })
    }, 5000)

    // 定期发现网络文件
    setInterval(() => {
      this.discoverNetworkFiles().catch(error => {
        console.debug('Periodic network file discovery failed:', error.message)
      })
    }, 60000) // 每分钟一次
  }

  // 启动文件公告
  startFileAnnouncements() {
    // 初始公告
    setTimeout(() => {
      this.announceLocalFiles().catch(error => {
        console.debug('Initial file announcement failed:', error.message)
      })
    }, 10000)

    // 定期公告
    setInterval(() => {
      this.announceLocalFiles().catch(error => {
        console.debug('Periodic file announcement failed:', error.message)
      })
    }, this.shareConfig.announceInterval)
  }

  // 启动能力交换
  startCapabilityExchange() {
    setTimeout(() => {
      this.exchangeCapabilities().catch(error => {
        console.debug('Capability exchange failed:', error.message)
      })
    }, 15000)

    setInterval(() => {
      this.exchangeCapabilities().catch(error => {
        console.debug('Periodic capability exchange failed:', error.message)
      })
    }, 120000) // 每2分钟一次
  }

  // 发现网络文件
  async discoverNetworkFiles() {
    console.log('🔍 Starting network file discovery...')
    
    const connectedPeers = this.p2pNode.getConnectedPeers()
    if (connectedPeers.length === 0) {
      console.log('No connected peers for file discovery')
      return
    }

    console.log(`Discovering files from ${connectedPeers.length} connected peers`)

    const discoveryPromises = connectedPeers.map(async (peerId) => {
      try {
        await this.requestNetworkFileList(peerId.toString())
      } catch (error) {
        console.debug(`File discovery failed for peer ${peerId}:`, error.message)
      }
    })

    await Promise.allSettled(discoveryPromises)

    // 同步全局文件注册表
    await this.syncGlobalRegistry()

    console.log(`📁 Network discovery completed. Total network files: ${this.networkFileIndex.size}`)
    this.stats.filesDiscovered = this.networkFileIndex.size
  }

  // 请求网络文件列表
  async requestNetworkFileList(peerId) {
    try {
      console.log(`📡 Requesting file list from peer: ${peerId}`)

      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/network-query/1.0.0')

      const request = {
        type: 'GET_NETWORK_FILE_LIST',
        requestId: this.generateRequestId(),
        timestamp: Date.now(),
        requesterCapabilities: this.getLocalCapabilities()
      }

      await this.sendMessage(stream, request)
      const response = await this.receiveMessage(stream)

      if (response.success && response.files) {
        console.log(`📥 Received ${response.files.length} file entries from ${peerId}`)
        
        // 处理接收到的文件信息
        this.processNetworkFiles(response.files, peerId)
        
        // 更新对等节点能力
        if (response.peerCapabilities) {
          this.peerCapabilities.set(peerId, {
            ...response.peerCapabilities,
            lastUpdated: Date.now()
          })
        }
      }

    } catch (error) {
      console.debug(`Failed to request file list from ${peerId}:`, error.message)
    }
  }

  // 处理网络文件信息
  processNetworkFiles(files, sourceNode) {
    files.forEach(file => {
      const fileKey = `${file.hash}-${sourceNode}`
      const networkFile = {
        ...file,
        sourceNode,
        discoveredAt: Date.now(),
        verified: false,
        replicas: [sourceNode],
        popularity: 1
      }

      this.networkFileIndex.set(fileKey, networkFile)

      // 更新全局注册表
      if (!this.globalFileRegistry.has(file.hash)) {
        this.globalFileRegistry.set(file.hash, {
          ...file,
          providers: [sourceNode],
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          downloadCount: 0,
          verified: false
        })
      } else {
        const globalEntry = this.globalFileRegistry.get(file.hash)
        if (!globalEntry.providers.includes(sourceNode)) {
          globalEntry.providers.push(sourceNode)
          globalEntry.lastSeen = Date.now()
        }
      }

      // 更新网络提供者映射
      if (!this.networkProviders.has(file.hash)) {
        this.networkProviders.set(file.hash, new Set())
      }
      this.networkProviders.get(file.hash).add(sourceNode)
    })

    console.log(`🌐 Processed ${files.length} files from ${sourceNode}. Global registry size: ${this.globalFileRegistry.size}`)
  }

  // 公告本地文件到网络
  async announceLocalFiles() {
    const connectedPeers = this.p2pNode.getConnectedPeers()
    if (connectedPeers.length === 0) return

    const localFiles = Array.from(this.fileIndex.values())
    if (localFiles.length === 0) return

    console.log(`📢 Announcing ${localFiles.length} local files to ${connectedPeers.length} peers`)

    const announcement = {
      type: 'FILE_ANNOUNCEMENT',
      nodeId: this.p2pNode.node.peerId.toString(),
      files: localFiles,
      timestamp: Date.now(),
      capabilities: this.getLocalCapabilities()
    }

    const announcePromises = connectedPeers.map(async (peerId) => {
      try {
        await this.sendFileAnnouncement(peerId.toString(), announcement)
      } catch (error) {
        console.debug(`Failed to announce to peer ${peerId}:`, error.message)
      }
    })

    await Promise.allSettled(announcePromises)
  }

  // 发送文件公告
  async sendFileAnnouncement(peerId, announcement) {
    try {
      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/file-announce/1.0.0')

      await this.sendMessage(stream, announcement)
      console.log(`✅ File announcement sent to ${peerId}`)

    } catch (error) {
      console.debug(`Failed to send announcement to ${peerId}:`, error.message)
    }
  }

  // 处理网络查询
  async handleNetworkQuery(stream, connection) {
    try {
      const request = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      console.log(`🔍 Received network query from ${peerId}:`, request.type)

      let response = { success: false }

      switch (request.type) {
        case 'GET_NETWORK_FILE_LIST':
          response = await this.handleFileListRequest(request, peerId)
          break
        case 'NETWORK_SEARCH':
          response = await this.handleNetworkSearch(request, peerId)
          break
        case 'FILE_AVAILABILITY':
          response = await this.handleFileAvailability(request, peerId)
          break
        case 'GLOBAL_SYNC':
          response = await this.handleGlobalSyncRequest(request, peerId)
          break
        default:
          response = { success: false, error: 'Unknown request type' }
      }

      await this.sendMessage(stream, response)

    } catch (error) {
      console.error('Error handling network query:', error)
      await this.sendMessage(stream, { success: false, error: error.message })
    }
  }

  // 处理文件列表请求
  async handleFileListRequest(request, peerId) {
    const localFiles = Array.from(this.fileIndex.values())
    const networkFiles = Array.from(this.networkFileIndex.values())
    
    // 合并本地文件和已验证的网络文件
    const allFiles = [
      ...localFiles.map(f => ({ ...f, source: 'local', verified: true })),
      ...networkFiles.filter(f => f.verified).map(f => ({ ...f, source: 'network' }))
    ]

    console.log(`📤 Sending ${allFiles.length} files to ${peerId}`)

    return {
      success: true,
      files: allFiles,
      nodeId: this.p2pNode.node.peerId.toString(),
      peerCapabilities: this.getLocalCapabilities(),
      timestamp: Date.now()
    }
  }

  // 处理网络搜索
  async handleNetworkSearch(request, peerId) {
    const query = request.query?.toLowerCase() || ''
    const results = []

    // 搜索本地文件
    for (const [hash, fileInfo] of this.fileIndex) {
      if (fileInfo.name && fileInfo.name.toLowerCase().includes(query)) {
        results.push({
          ...fileInfo,
          source: 'local',
          provider: this.p2pNode.node.peerId.toString(),
          verified: true,
          availability: 1.0
        })
      }
    }

    // 搜索网络文件
    for (const [key, fileInfo] of this.networkFileIndex) {
      if (fileInfo.name && fileInfo.name.toLowerCase().includes(query)) {
        const globalEntry = this.globalFileRegistry.get(fileInfo.hash)
        results.push({
          ...fileInfo,
          source: 'network',
          providers: globalEntry?.providers || [fileInfo.sourceNode],
          verified: fileInfo.verified,
          availability: this.calculateFileAvailability(fileInfo.hash)
        })
      }
    }

    console.log(`🔎 Network search for "${query}" returned ${results.length} results to ${peerId}`)

    return {
      success: true,
      results: results.slice(0, this.shareConfig.maxFileSearchResults),
      searchTime: Date.now() - request.timestamp,
      nodeId: this.p2pNode.node.peerId.toString()
    }
  }

  // 处理文件公告
  async handleFileAnnouncement(stream, connection) {
    try {
      const announcement = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      console.log(`📢 Received file announcement from ${peerId}:`, announcement.type)

      if (announcement.type === 'FILE_ANNOUNCEMENT' && announcement.files) {
        this.processNetworkFiles(announcement.files, peerId)
        
        // 更新对等节点能力
        if (announcement.capabilities) {
          this.peerCapabilities.set(peerId, {
            ...announcement.capabilities,
            lastUpdated: Date.now()
          })
        }

        console.log(`📁 Processed announcement of ${announcement.files.length} files from ${peerId}`)
      }

    } catch (error) {
      console.error('Error handling file announcement:', error)
    }
  }

  // 发布文件到网络（增强版）
  async publishFile(fileHash, fileMetadata) {
    try {
      console.log(`🌐 Publishing file to network: ${fileMetadata.name} (${fileHash})`)

      // 创建CID和发布到DHT
      const cid = await this.createCID(fileHash)
      const fileInfo = {
        name: fileMetadata.name,
        size: fileMetadata.size,
        hash: fileHash,
        timestamp: Date.now(),
        provider: this.p2pNode.node.peerId.toString(),
        mimeType: fileMetadata.mimeType || 'application/octet-stream',
        chunks: fileMetadata.chunks || 1,
        chunkSize: fileMetadata.chunkSize || 64 * 1024,
        verified: true,
        networkShared: true
      }

      const data = new TextEncoder().encode(JSON.stringify(fileInfo))

      // 发布到DHT
      await this.dht.put(cid.bytes, data)
      console.log(`✅ File published to DHT with CID: ${cid.toString()}`)

      // 宣告为提供者
      await this.dht.provide(cid)
      console.log(`✅ Announced as provider for: ${fileHash}`)

      // 添加到本地索引
      this.fileIndex.set(fileHash, fileInfo)

      // 发布搜索索引
      await this.publishNetworkSearchIndices(fileMetadata.name, fileInfo)

      // 立即公告到连接的节点
      await this.announceNewFileToNetwork(fileInfo)

      // 更新统计
      this.stats.filesShared++

      console.log(`🎉 File successfully published to network: ${fileMetadata.name}`)

      return cid
    } catch (error) {
      console.error('Error publishing file to network:', error)
      throw error
    }
  }

  // 公告新文件到网络
  async announceNewFileToNetwork(fileInfo) {
    const connectedPeers = this.p2pNode.getConnectedPeers()
    console.log(`📢 Broadcasting new file to ${connectedPeers.length} connected peers`)

    const announcement = {
      type: 'NEW_FILE_ANNOUNCEMENT',
      file: fileInfo,
      nodeId: this.p2pNode.node.peerId.toString(),
      timestamp: Date.now()
    }

    const announcePromises = connectedPeers.map(async (peerId) => {
      try {
        await this.sendFileAnnouncement(peerId.toString(), announcement)
      } catch (error) {
        console.debug(`Failed to announce new file to ${peerId}:`, error.message)
      }
    })

    await Promise.allSettled(announcePromises)
  }

  // 发布网络搜索索引
  async publishNetworkSearchIndices(fileName, fileInfo) {
    const words = fileName.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2)

    console.log(`🔍 Publishing network search indices for: ${words.join(', ')}`)

    for (const word of words) {
      try {
        const searchKeyString = `network-file-search:${word}`
        const searchKey = await this.createCID(searchKeyString)
        const searchData = new TextEncoder().encode(JSON.stringify({
          ...fileInfo,
          searchTerm: word,
          networkSearchable: true
        }))

        // 发布到DHT
        await this.dht.put(searchKey.bytes, searchData)
        await this.dht.provide(searchKey)

        console.log(`✅ Network search index published for term: "${word}"`)

        // 等待传播
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.warn(`Failed to index word "${word}" for network search:`, error.message)
      }
    }
  }

  // 网络文件搜索（增强版）
  async searchFiles(query, options = {}) {
    const { timeout = 20000, maxResults = 50 } = options
    console.log(`🔍 Starting enhanced network search for: "${query}"`)

    const results = []
    const searchWords = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2)

    // 1. 本地搜索
    const localResults = this.searchLocalFiles(query)
    results.push(...localResults)
    console.log(`📁 Local search found ${localResults.length} files`)

    // 2. 网络索引搜索
    const networkResults = this.searchNetworkFiles(query)
    networkResults.forEach(result => {
      if (!results.find(r => r.hash === result.hash)) {
        results.push({ ...result, source: 'network' })
      }
    })
    console.log(`🌐 Network index search found ${networkResults.length} files`)

    // 3. 直接网络查询
    const connectedPeers = this.p2pNode.getConnectedPeers()
    if (connectedPeers.length > 0) {
      console.log(`📡 Querying ${connectedPeers.length} connected peers`)
      
      const queryPromises = connectedPeers.map(async (peerId) => {
        try {
          return await this.queryNetworkPeer(peerId.toString(), query)
        } catch (error) {
          console.debug(`Network query failed for peer ${peerId}:`, error.message)
          return []
        }
      })

      const peerResults = await Promise.allSettled(queryPromises)
      
      peerResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          result.value.forEach(file => {
            if (!results.find(r => r.hash === file.hash)) {
              results.push({ ...file, source: 'network' })
            }
          })
        }
      })
    }

    // 4. DHT网络搜索
    if (searchWords.length > 0) {
      console.log(`🔎 DHT network search for words: ${searchWords.join(', ')}`)

      for (const word of searchWords) {
        try {
          const dhtResults = await this.searchNetworkDHT(word)
          dhtResults.forEach(result => {
            if (!results.find(r => r.hash === result.hash)) {
              results.push({ ...result, source: 'dht' })
            }
          })
        } catch (error) {
          console.warn(`DHT network search failed for "${word}":`, error.message)
        }
      }
    }

    // 5. 添加文件可用性和提供者信息
    const enhancedResults = results.map(file => ({
      ...file,
      providers: this.getFileProviders(file.hash),
      availability: this.calculateFileAvailability(file.hash),
      networkShared: true
    }))

    // 更新统计
    this.stats.networkQueries++

    console.log(`🎯 Enhanced network search completed: ${enhancedResults.length} total results`)
    return enhancedResults.slice(0, maxResults)
  }

  // 查询网络对等节点
  async queryNetworkPeer(peerId, query) {
    try {
      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/network-query/1.0.0')

      const request = {
        type: 'NETWORK_SEARCH',
        query: query,
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      }

      await this.sendMessage(stream, request)
      const response = await this.receiveMessage(stream)

      if (response.success && response.results) {
        console.log(`📥 Received ${response.results.length} search results from ${peerId}`)
        return response.results
      }

      return []
    } catch (error) {
      console.debug(`Network peer query failed for ${peerId}:`, error.message)
      return []
    }
  }

  // DHT网络搜索
  async searchNetworkDHT(word) {
    const results = []
    
    try {
      const searchKeyString = `network-file-search:${word}`
      const searchKey = await this.createCID(searchKeyString)

      console.log(`🔍 Searching network DHT for word: "${word}"`)

      const dhtResults = this.dht.get(searchKey.bytes)
      let resultCount = 0

      for await (const result of dhtResults) {
        if (result.value) {
          try {
            const fileInfo = JSON.parse(new TextDecoder().decode(result.value))
            if (fileInfo.networkSearchable) {
              results.push({
                ...fileInfo,
                source: 'network-dht',
                foundVia: `dht-search:${word}`
              })
              resultCount++
            }
          } catch (parseError) {
            console.debug('Failed to parse DHT search result:', parseError)
          }
        }

        if (resultCount >= 10) break // 限制每个词的结果数量
      }

      console.log(`📊 DHT search for "${word}" found ${results.length} files`)
    } catch (error) {
      console.warn(`DHT network search failed for "${word}":`, error.message)
    }

    return results
  }

  // 获取文件提供者
  getFileProviders(fileHash) {
    const providers = []
    
    // 检查本地文件
    if (this.fileIndex.has(fileHash)) {
      providers.push(this.p2pNode.node.peerId.toString())
    }

    // 检查网络提供者
    if (this.networkProviders.has(fileHash)) {
      providers.push(...Array.from(this.networkProviders.get(fileHash)))
    }

    // 检查全局注册表
    const globalEntry = this.globalFileRegistry.get(fileHash)
    if (globalEntry && globalEntry.providers) {
      providers.push(...globalEntry.providers)
    }

    // 去重并返回
    return [...new Set(providers)]
  }

  // 计算文件可用性
  calculateFileAvailability(fileHash) {
    const providers = this.getFileProviders(fileHash)
    const connectedPeers = this.p2pNode.getConnectedPeers()
    
    if (providers.length === 0) return 0

    // 计算在线提供者比例
    const onlineProviders = providers.filter(provider => {
      if (provider === this.p2pNode.node.peerId.toString()) return true
      return connectedPeers.some(peer => peer.toString() === provider)
    })

    return onlineProviders.length / providers.length
  }

  // 获取本地能力
  getLocalCapabilities() {
    return {
      networkSharing: true,
      fileReplication: this.shareConfig.enableFileReplication,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      supportedProtocols: ['network-query', 'file-announce', 'global-sync', 'availability'],
      nodeVersion: '2.0.0',
      lastUpdated: Date.now()
    }
  }

  // 交换能力信息
  async exchangeCapabilities() {
    const connectedPeers = this.p2pNode.getConnectedPeers()
    if (connectedPeers.length === 0) return

    console.log(`🔄 Exchanging capabilities with ${connectedPeers.length} peers`)

    const capabilities = this.getLocalCapabilities()

    const exchangePromises = connectedPeers.map(async (peerId) => {
      try {
        const peerIdObj = peerIdFromString(peerId.toString())
        const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/capabilities/1.0.0')

        await this.sendMessage(stream, {
          type: 'CAPABILITY_EXCHANGE',
          capabilities,
          nodeId: this.p2pNode.node.peerId.toString(),
          timestamp: Date.now()
        })

        const response = await this.receiveMessage(stream)
        if (response.success && response.capabilities) {
          this.peerCapabilities.set(peerId.toString(), {
            ...response.capabilities,
            lastUpdated: Date.now()
          })
        }

      } catch (error) {
        console.debug(`Capability exchange failed with ${peerId}:`, error.message)
      }
    })

    await Promise.allSettled(exchangePromises)
  }

  // 处理能力交换
  async handleCapabilityExchange(stream, connection) {
    try {
      const request = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      if (request.type === 'CAPABILITY_EXCHANGE' && request.capabilities) {
        this.peerCapabilities.set(peerId, {
          ...request.capabilities,
          lastUpdated: Date.now()
        })

        const response = {
          success: true,
          capabilities: this.getLocalCapabilities(),
          nodeId: this.p2pNode.node.peerId.toString(),
          timestamp: Date.now()
        }

        await this.sendMessage(stream, response)
        console.log(`🤝 Capability exchange completed with ${peerId}`)
      }

    } catch (error) {
      console.error('Error handling capability exchange:', error)
    }
  }

  // 同步全局注册表
  async syncGlobalRegistry() {
    // 清理过期条目
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24小时

    for (const [hash, entry] of this.globalFileRegistry) {
      if (now - entry.lastSeen > maxAge) {
        this.globalFileRegistry.delete(hash)
        this.networkProviders.delete(hash)
      }
    }

    console.log(`🔄 Global registry synced. Active files: ${this.globalFileRegistry.size}`)
  }

  // 测试网络连接性
  async testNetworkConnectivity() {
    try {
      console.log('🧪 Testing network connectivity...')
      
      const connectedPeers = this.p2pNode.getConnectedPeers()
      if (connectedPeers.length === 0) {
        console.log('❌ No connected peers for network test')
        return false
      }

      // 测试DHT可达性
      const testKey = new TextEncoder().encode('network-connectivity-test')
      const testValue = new TextEncoder().encode(JSON.stringify({
        nodeId: this.p2pNode.node.peerId.toString(),
        timestamp: Date.now(),
        test: true
      }))

      await this.dht.put(testKey, testValue)
      console.log('✅ DHT write test successful')

      // 测试文件发现
      await this.discoverNetworkFiles()
      console.log('✅ Network file discovery test successful')

      return true
    } catch (error) {
      console.error('❌ Network connectivity test failed:', error)
      return false
    }
  }

  // 处理全局同步
  async handleGlobalSync(stream, connection) {
    try {
      const request = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      console.log(`🔄 Received global sync request from ${peerId}`)

      if (request.type === 'GLOBAL_SYNC_REQUEST') {
        const syncData = {
          globalFiles: Array.from(this.globalFileRegistry.entries()).slice(0, 100), // 限制数量
          timestamp: Date.now(),
          nodeId: this.p2pNode.node.peerId.toString()
        }

        const response = {
          success: true,
          syncData,
          timestamp: Date.now()
        }

        await this.sendMessage(stream, response)
        console.log(`📤 Global sync data sent to ${peerId}`)
      }

    } catch (error) {
      console.error('Error handling global sync:', error)
    }
  }

  // 处理可用性检查
  async handleAvailabilityCheck(stream, connection) {
    try {
      const request = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      if (request.type === 'FILE_AVAILABILITY_CHECK' && request.fileHashes) {
        const availability = {}

        for (const fileHash of request.fileHashes) {
          availability[fileHash] = {
            available: this.fileIndex.has(fileHash),
            providers: this.getFileProviders(fileHash),
            lastSeen: this.globalFileRegistry.get(fileHash)?.lastSeen || null
          }
        }

        const response = {
          success: true,
          availability,
          nodeId: this.p2pNode.node.peerId.toString(),
          timestamp: Date.now()
        }

        await this.sendMessage(stream, response)
        console.log(`📊 Availability check response sent to ${peerId}`)
      }

    } catch (error) {
      console.error('Error handling availability check:', error)
    }
  }

  // 工具函数
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  async sendMessage(stream, message) {
    const messageData = JSON.stringify(message)
    const messageBuffer = Buffer.from(messageData)
    const lengthBuffer = Buffer.allocUnsafe(4)
    lengthBuffer.writeUInt32BE(messageBuffer.length, 0)

    await stream.sink(async function* () {
      yield lengthBuffer
      yield messageBuffer
    }())
  }

  async receiveMessage(stream) {
    let responseData = []
    let expectedLength = null
    let receivedLength = 0

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message receive timeout'))
      }, 15000)

      const processData = async () => {
        try {
          for await (const chunk of stream.source) {
            let buffer
            if (Buffer.isBuffer(chunk)) {
              buffer = chunk
            } else if (chunk instanceof Uint8Array) {
              buffer = Buffer.from(chunk)
            } else if (chunk && typeof chunk.subarray === 'function') {
              buffer = Buffer.from(chunk.subarray())
            } else {
              buffer = Buffer.from(new Uint8Array(chunk))
            }

            responseData.push(buffer)
            receivedLength += buffer.length

            if (expectedLength === null && receivedLength >= 4) {
              const allData = Buffer.concat(responseData)
              expectedLength = allData.readUInt32BE(0)
              responseData = [allData.slice(4)]
              receivedLength -= 4
            }

            if (expectedLength !== null && receivedLength >= expectedLength) {
              clearTimeout(timeout)
              const responseBuffer = Buffer.concat(responseData).slice(0, expectedLength)
              const response = JSON.parse(responseBuffer.toString())
              resolve(response)
              break
            }
          }
        } catch (error) {
          clearTimeout(timeout)
          reject(error)
        }
      }

      processData()
    })
  }

  // 搜索本地文件
  searchLocalFiles(query) {
    const results = []
    const lowerQuery = query.toLowerCase()

    for (const [hash, fileInfo] of this.fileIndex) {
      if (fileInfo.name && fileInfo.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          ...fileInfo,
          source: 'local',
          provider: this.p2pNode.node.peerId.toString(),
          verified: true,
          availability: 1.0
        })
      }
    }

    return results
  }

  // 搜索网络文件
  searchNetworkFiles(query) {
    const results = []
    const lowerQuery = query.toLowerCase()

    console.log(`🔍 Searching network index for: "${query}"`)
    console.log(`🗂️ Network index has ${this.networkFileIndex.size} entries`)

    for (const [key, fileInfo] of this.networkFileIndex) {
      if (fileInfo.name && fileInfo.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          ...fileInfo,
          source: 'network',
          providers: this.getFileProviders(fileInfo.hash),
          availability: this.calculateFileAvailability(fileInfo.hash)
        })
      }
    }

    console.log(`🌐 Network search found ${results.length} files`)
    return results
  }

  // 查找文件（增强版）
  async findFile(fileHash) {
    try {
      console.log(`🔍 Starting enhanced file search: ${fileHash}`)

      // 1. 检查本地索引
      const localFile = this.fileIndex.get(fileHash)
      if (localFile) {
        console.log('📁 File found in local index:', localFile.name)
        return { ...localFile, source: 'local', verified: true }
      }

      // 2. 检查网络文件索引
      for (const [key, fileInfo] of this.networkFileIndex) {
        if (fileInfo.hash === fileHash) {
          console.log('🌐 File found in network index:', fileInfo.name)
          return {
            ...fileInfo,
            source: 'network',
            providers: this.getFileProviders(fileHash),
            availability: this.calculateFileAvailability(fileHash)
          }
        }
      }

      // 3. 检查全局注册表
      const globalEntry = this.globalFileRegistry.get(fileHash)
      if (globalEntry) {
        console.log('🗂️ File found in global registry:', globalEntry.name)
        return {
          ...globalEntry,
          source: 'global',
          providers: globalEntry.providers,
          availability: this.calculateFileAvailability(fileHash)
        }
      }

      // 4. 查询DHT
      console.log('🔎 Querying DHT for file...')
      const cid = await this.createCID(fileHash)
      
      try {
        const results = this.dht.get(cid.bytes)
        for await (const event of results) {
          if (event.value) {
            try {
              const fileInfo = JSON.parse(new TextDecoder().decode(event.value))
              console.log('✅ File found in DHT:', fileInfo.name)
              return {
                ...fileInfo,
                source: 'dht',
                providers: this.getFileProviders(fileHash),
                availability: this.calculateFileAvailability(fileHash)
              }
            } catch (parseError) {
              console.error('Failed to parse DHT data:', parseError.message)
              continue
            }
          }
        }
      } catch (dhtError) {
        console.debug('DHT query failed:', dhtError.message)
      }

      // 5. 网络查询所有连接的节点
      console.log('📡 Querying network peers for file...')
      const connectedPeers = this.p2pNode.getConnectedPeers()
      
      for (const peerId of connectedPeers) {
        try {
          const result = await this.queryPeerForFile(peerId.toString(), fileHash)
          if (result) {
            console.log(`✅ File found via network peer ${peerId}:`, result.name)
            return result
          }
        } catch (error) {
          console.debug(`Network query failed for peer ${peerId}:`, error.message)
        }
      }

      console.log('❌ File not found in any source')
      return null

    } catch (error) {
      console.error('Error during enhanced file search:', error.message)
      return null
    }
  }

  // 查询对等节点文件
  async queryPeerForFile(peerId, fileHash) {
    try {
      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/network-query/1.0.0')

      const request = {
        type: 'FILE_AVAILABILITY',
        fileHash: fileHash,
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      }

      await this.sendMessage(stream, request)
      const response = await this.receiveMessage(stream)

      if (response.success && response.fileInfo) {
        return {
          ...response.fileInfo,
          source: 'network-peer',
          provider: peerId,
          verified: response.verified || false
        }
      }

      return null
    } catch (error) {
      console.debug(`Failed to query peer ${peerId} for file:`, error.message)
      return null
    }
  }

  // 查找提供者（增强版）
  async findProviders(fileHash) {
    const providers = []

    try {
      // 1. 本地提供者
      if (this.fileIndex.has(fileHash)) {
        providers.push({
          peerId: this.p2pNode.node.peerId.toString(),
          source: 'local',
          verified: true,
          lastSeen: Date.now()
        })
      }

      // 2. 网络提供者
      if (this.networkProviders.has(fileHash)) {
        const networkProviders = Array.from(this.networkProviders.get(fileHash))
        networkProviders.forEach(peerId => {
          providers.push({
            peerId,
            source: 'network',
            verified: false,
            lastSeen: Date.now()
          })
        })
      }

      // 3. DHT提供者查询
      const cid = await this.createCID(fileHash)
      try {
        for await (const provider of this.dht.findProviders(cid)) {
          const peerId = provider.id.toString()
          if (!providers.find(p => p.peerId === peerId)) {
            providers.push({
              peerId,
              source: 'dht',
              verified: false,
              lastSeen: Date.now()
            })
          }
        }
      } catch (dhtError) {
        console.debug('DHT provider search failed:', dhtError.message)
      }

      // 4. 验证提供者可用性
      const verifiedProviders = []
      for (const provider of providers) {
        try {
          const available = await this.verifyProviderAvailability(provider.peerId, fileHash)
          if (available) {
            verifiedProviders.push({
              ...provider,
              verified: true,
              lastVerified: Date.now()
            })
          }
        } catch (error) {
          console.debug(`Provider verification failed for ${provider.peerId}:`, error.message)
          // 仍然包含未验证的提供者
          verifiedProviders.push(provider)
        }
      }

      console.log(`🔍 Found ${verifiedProviders.length} providers for file ${fileHash}`)
      return verifiedProviders

    } catch (error) {
      console.error('Error finding providers:', error)
      return providers
    }
  }

  // 验证提供者可用性
  async verifyProviderAvailability(peerId, fileHash) {
    try {
      // 如果是本地文件，直接返回true
      if (peerId === this.p2pNode.node.peerId.toString()) {
        return this.fileIndex.has(fileHash)
      }

      // 查询远程提供者
      const result = await this.queryPeerForFile(peerId, fileHash)
      return result !== null
    } catch (error) {
      console.debug(`Provider availability check failed for ${peerId}:`, error.message)
      return false
    }
  }

  // 获取本地文件列表
  getLocalFiles() {
    return Array.from(this.fileIndex.values()).map(file => ({
      ...file,
      source: 'local',
      networkShared: true,
      verified: true
    }))
  }

  // 获取网络文件列表
  getNetworkFiles() {
    return Array.from(this.networkFileIndex.values()).map(file => ({
      ...file,
      providers: this.getFileProviders(file.hash),
      availability: this.calculateFileAvailability(file.hash)
    }))
  }

  // 获取全局文件统计
  getGlobalFileStats() {
    return {
      localFiles: this.fileIndex.size,
      networkFiles: this.networkFileIndex.size,
      globalRegistry: this.globalFileRegistry.size,
      totalProviders: this.networkProviders.size,
      connectedPeers: this.p2pNode.getConnectedPeers().length,
      ...this.stats
    }
  }

  // 宣告自己是文件的提供者
  async provideFile(fileHash) {
    try {
      const cid = await this.createCID(fileHash)
      // 宣告提供文件
      await this.dht.provide(cid)
      console.log(`✅ Announced as provider for file: ${fileHash}`)
      
      // 添加到网络提供者映射
      if (!this.networkProviders.has(fileHash)) {
        this.networkProviders.set(fileHash, new Set())
      }
      this.networkProviders.get(fileHash).add(this.p2pNode.node.peerId.toString())
      
      return true
    } catch (error) {
      console.error('Error providing file:', error)
      throw error
    }
  }

  // 创建CID
  async createCID(data) {
    let bytes
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data)
    } else if (data instanceof Uint8Array) {
      bytes = data
    } else {
      bytes = new TextEncoder().encode(String(data))
    }

    const hash = await sha256.digest(bytes)
    const cid = CID.create(1, raw.code, hash)
    return cid
  }

  // 获取DHT统计信息（增强版）
  async getDHTStats() {
    try {
      const connectedPeers = this.p2pNode.getConnectedPeers().length
      let routingTableSize = 0

      try {
        if (this.dht && typeof this.dht.getRoutingTable === 'function') {
          const routingTable = await this.dht.getRoutingTable()
          routingTableSize = routingTable?.size || 0
        } else if (this.dht && this.dht.routingTable) {
          routingTableSize = this.dht.routingTable.size || 0
        }
      } catch (dhtError) {
        console.debug('Could not get routing table info:', dhtError.message)
      }

      return {
        connectedPeers,
        routingTableSize,
        localFiles: this.fileIndex.size,
        networkFiles: this.networkFileIndex.size,
        globalRegistry: this.globalFileRegistry.size,
        dhtEnabled: !!this.dht,
        networkSharing: this.shareConfig.enableGlobalSharing,
        ...this.stats
      }
    } catch (error) {
      console.error('Error getting enhanced DHT stats:', error)
      return {
        connectedPeers: this.p2pNode.getConnectedPeers()?.length || 0,
        routingTableSize: 0,
        localFiles: this.fileIndex.size,
        networkFiles: 0,
        globalRegistry: 0,
        dhtEnabled: false,
        networkSharing: false,
        error: error.message
      }
    }
  }

  // 清理方法
  destroy() {
    // 清理定时器
    if (this.announceInterval) {
      clearInterval(this.announceInterval)
    }
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval)
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }

    // 清理索引
    this.fileIndex.clear()
    this.networkFileIndex.clear()
    this.globalFileRegistry.clear()
    this.networkProviders.clear()
    this.fileAnnouncements.clear()
    this.peerCapabilities.clear()

    console.log('🧹 Enhanced DHT Manager destroyed')
  }
}