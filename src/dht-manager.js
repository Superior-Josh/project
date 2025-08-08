// src/dht-manager.js

import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import { peerIdFromString } from '@libp2p/peer-id'

export class DHTManager {
  constructor(p2pNode) {
    this.p2pNode = p2pNode
    this.dht = null
    this.fileIndex = new Map() // 本地文件索引
    this.networkFileIndex = new Map() // 网络文件索引（新增）
  }

  async initialize() {
    if (!this.p2pNode.node) {
      throw new Error('P2P node must be started first')
    }

    this.dht = this.p2pNode.node.services.dht

    if (!this.dht) {
      throw new Error('DHT service not available on P2P node')
    }

    console.log('DHT Manager initialized')

    // 注册文件查询协议 - 用于节点间直接通信
    this.p2pNode.node.handle('/p2p-file-sharing/query/1.0.0', ({ stream, connection }) => {
      this.handleDirectQuery(stream, connection)
    })

    // 注册文件通知协议 - 用于新文件广播
    this.p2pNode.node.handle('/p2p-file-sharing/notify/1.0.0', ({ stream, connection }) => {
      this.handleFileNotification(stream, connection)
    })

    // 启动定期同步机制
    this.startPeriodicSync()

    // 延迟执行DHT测试，不阻塞初始化
    setTimeout(() => {
      this.testDHTFunctionality().catch(error => {
        console.debug('DHT test failed:', error.message)
      })
    }, 10000)
  }

  // 启动定期同步
  startPeriodicSync() {
    // 3秒后开始第一次同步
    setTimeout(() => {
      this.syncWithPeers().catch(error => {
        console.debug('Initial sync failed:', error.message)
      })
    }, 3000)

    // 每30秒同步一次
    setInterval(() => {
      this.syncWithPeers().catch(error => {
        console.debug('Periodic sync failed:', error.message)
      })
    }, 30000)
  }

  // 从对等节点请求文件列表
  async requestFileListFromPeer(peerId) {
    try {
      console.log(`Requesting file list from peer: ${peerId}`)

      // 将字符串转换为 PeerId 对象
      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/query/1.0.0')

      const request = {
        type: 'GET_FILE_LIST',
        timestamp: Date.now()
      }

      // 发送请求
      await this.sendMessage(stream, request)

      // 接收响应
      const response = await this.receiveMessage(stream)

      if (response.success && response.files) {
        console.log(`Received ${response.files.length} file entries from ${peerId}`)

        // 更新网络文件索引
        response.files.forEach(file => {
          const key = `${file.hash}-${peerId}`
          this.networkFileIndex.set(key, {
            ...file,
            sourceNode: peerId,
            receivedAt: Date.now()
          })
        })

        console.log(`Updated network index. Total network files: ${this.networkFileIndex.size}`)
      }

    } catch (error) {
      console.debug(`Failed to request file list from ${peerId}:`, error.message)
    }
  }

  // 直接查询节点
  async queryPeerDirectly(peerId, query) {
    try {
      console.log(`Directly querying peer ${peerId} for: "${query}"`)

      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/query/1.0.0')

      const request = {
        type: 'SEARCH',
        query: query,
        timestamp: Date.now()
      }

      await this.sendMessage(stream, request)
      const response = await this.receiveMessage(stream)

      if (response.success && response.results) {
        console.log(`Received ${response.results.length} search results from ${peerId}`)
        return response.results
      }

      return []
    } catch (error) {
      console.debug(`Direct query failed for peer ${peerId}:`, error.message)
      return []
    }
  }

  // 通知节点新文件
  async notifyPeerNewFile(peerId, fileInfo) {
    try {
      console.log(`Notifying peer ${peerId} about new file: ${fileInfo.name}`)

      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, '/p2p-file-sharing/notify/1.0.0')

      const notification = {
        type: 'NEW_FILE',
        file: fileInfo,
        timestamp: Date.now()
      }

      await this.sendMessage(stream, notification)
      console.log(`✓ Notified peer ${peerId} about new file`)

    } catch (error) {
      console.debug(`Failed to notify peer ${peerId}:`, error.message)
    }
  }

  // 发送消息
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

  // 接收消息
  async receiveMessage(stream) {
    let responseData = []
    let expectedLength = null
    let receivedLength = 0

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message receive timeout'))
      }, 10000)

      const processData = async () => {
        try {
          for await (const chunk of stream.source) {
            // 更安全的转换方式
            let buffer
            if (Buffer.isBuffer(chunk)) {
              buffer = chunk
            } else if (chunk instanceof Uint8Array) {
              buffer = Buffer.from(chunk)
            } else if (chunk && typeof chunk.subarray === 'function') {
              // 处理 Uint8ArrayList
              buffer = Buffer.from(chunk.subarray())
            } else {
              // 最后的备选方案
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

  // 与对等节点同步
  async syncWithPeers() {
    const connectedPeers = this.p2pNode.getConnectedPeers()
    if (connectedPeers.length === 0) return

    console.log(`Syncing with ${connectedPeers.length} peers`)

    for (const peerId of connectedPeers) {
      try {
        await this.requestFileListFromPeer(peerId.toString())
      } catch (error) {
        console.debug(`Sync failed with ${peerId}:`, error.message)
      }
    }
  }

  // 处理直接查询
  async handleDirectQuery(stream, connection) {
    try {
      const request = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      console.log(`Received query from ${peerId}:`, request.type)

      if (request.type === 'SEARCH') {
        // 搜索本地文件
        const results = this.searchLocalFiles(request.query)

        const response = {
          success: true,
          results: results,
          nodeId: this.p2pNode.node.peerId.toString()
        }

        await this.sendMessage(stream, response)
        console.log(`Sent ${results.length} results to ${peerId}`)

      } else if (request.type === 'GET_FILE_LIST') {
        // 返回文件列表
        const files = Array.from(this.fileIndex.values())

        const response = {
          success: true,
          files: files,
          nodeId: this.p2pNode.node.peerId.toString()
        }

        await this.sendMessage(stream, response)
        console.log(`Sent file list (${files.length} files) to ${peerId}`)
      }

    } catch (error) {
      console.error('Error handling direct query:', error)
    }
  }

  // 处理文件通知
  async handleFileNotification(stream, connection) {
    try {
      const notification = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      console.log(`Received notification from ${peerId}:`, notification.type)

      if (notification.type === 'NEW_FILE' && notification.file) {
        // 将新文件添加到网络索引
        const key = `${notification.file.hash}-${peerId}`
        this.networkFileIndex.set(key, {
          ...notification.file,
          sourceNode: peerId,
          receivedAt: Date.now()
        })

        console.log(`Added file to network index: ${notification.file.name}`)
      }

    } catch (error) {
      console.error('Error handling file notification:', error)
    }
  }

  // 搜索本地文件
  searchLocalFiles(query) {
    const results = []
    const lowerQuery = query.toLowerCase()

    for (const [hash, fileInfo] of this.fileIndex) {
      if (fileInfo.name && fileInfo.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          ...fileInfo,
          source: 'local'
        })
      }
    }

    return results
  }

  // 搜索网络文件索引
  searchNetworkFiles(query) {
    const results = []
    const lowerQuery = query.toLowerCase()

    console.log(`Searching network index for: "${query}"`)
    console.log(`Network index has ${this.networkFileIndex.size} entries`)

    for (const [key, fileInfo] of this.networkFileIndex) {
      console.log(`Checking file: ${fileInfo.name} against query: ${query}`)

      if (fileInfo.name && fileInfo.name.toLowerCase().includes(lowerQuery)) {
        console.log(`✓ Match found: ${fileInfo.name}`)
        results.push({
          ...fileInfo,
          source: 'network'
        })
      } else {
        console.log(`✗ No match: ${fileInfo.name}`)
      }
    }

    console.log(`Network search found ${results.length} files`)
    return results
  }

  // DHT功能测试
  async testDHTFunctionality() {
    try {
      console.log('Testing DHT functionality...')
      const testKey = new TextEncoder().encode('dht-test-key')
      const testValue = new TextEncoder().encode('dht-test-value')
      await this.dht.put(testKey, testValue)
      console.log('DHT PUT operation successful')
    } catch (dhtTestError) {
      console.debug('DHT functionality test failed:', dhtTestError)
    }
  }

  // 发布文件到DHT
  async publishFile(fileHash, fileMetadata) {
    try {
      console.log(`Publishing file: ${fileMetadata.name} (${fileHash})`)

      const cid = await this.createCID(fileHash)
      const fileInfo = {
        name: fileMetadata.name,
        size: fileMetadata.size,
        hash: fileHash,
        timestamp: Date.now(),
        provider: this.p2pNode.node.peerId.toString()
      }

      const data = new TextEncoder().encode(JSON.stringify(fileInfo))

      // 发布到DHT
      await this.dht.put(cid.bytes, data)
      console.log(`✓ File published to DHT with CID: ${cid.toString()}`)

      // 宣告为提供者
      await this.dht.provide(cid)
      console.log(`✓ Announced as provider for: ${fileHash}`)

      // 添加到本地索引
      this.fileIndex.set(fileHash, fileInfo)

      // 发布搜索索引 - 确保其他节点能搜索到
      await this.publishSearchIndices(fileMetadata.name, fileInfo)

      // 验证发布
      setTimeout(() => this.verifyPublication(fileHash, cid), 5000)

      // 在文件发布成功后，直接通知连接的节点
      setTimeout(async () => {
        const connectedPeers = this.p2pNode.getConnectedPeers()
        console.log(`Broadcasting new file to ${connectedPeers.length} connected peers`)
        for (const peerId of connectedPeers) {
          try {
            await this.notifyPeerNewFile(peerId.toString(), fileInfo)
          } catch (error) {
            console.debug(`Failed to notify peer ${peerId}:`, error.message)
          }
        }
      }, 2000)

      // DHT验证测试
      setTimeout(async () => {
        console.log('=== DHT Verification Test ===')
        const searchKeyString = `file-search:${fileMetadata.name.toLowerCase().split(/\s+/)[0]}`
        const searchKey = await this.createCID(searchKeyString)
        console.log(`Verifying search key: ${searchKey.toString()}`)

        const verifyResults = this.dht.get(searchKey.bytes)
        let foundSelf = false

        for await (const result of verifyResults) {
          console.log('Verification result:', {
            from: result.from?.toString(),
            hasValue: !!result.value,
            isSelf: result.from?.toString() === this.p2pNode.node.peerId.toString()
          })

          if (result.value) {
            foundSelf = true
          }
        }

        console.log(`Self-verification ${foundSelf ? 'PASSED' : 'FAILED'}`)
      }, 8000) // 8秒后验证

      return cid
    } catch (error) {
      console.error('Error publishing file to DHT:', error)
      throw error
    }
  }

  // 发布搜索索引
  async publishSearchIndices(fileName, fileInfo) {
    const words = fileName.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2)

    console.log(`Publishing search indices for words: ${words.join(', ')}`)

    for (const word of words) {
      try {
        const searchKeyString = `file-search:${word}`
        const searchKey = await this.createCID(searchKeyString)
        const searchData = new TextEncoder().encode(JSON.stringify(fileInfo))

        console.log(`Publishing search key for "${word}": ${searchKey.toString()}`)

        // 发布到DHT
        await this.dht.put(searchKey.bytes, searchData)
        console.log(`✓ Data written to DHT for term: "${word}"`)

        // 宣告为提供者
        await this.dht.provide(searchKey)
        console.log(`✓ Announced as provider for term: "${word}"`)

        // 等待传播
        await new Promise(resolve => setTimeout(resolve, 2000))

      } catch (error) {
        console.warn(`Failed to index word "${word}":`, error.message)
      }
    }

    // 发布完成后等待传播
    console.log('Waiting for DHT propagation...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    console.log('DHT propagation wait completed')
  }

  // DHT关键字搜索
  async searchDHTKey(word) {
    const results = []
    const maxWaitTime = 15000 // 增加到15秒

    try {
      // 检查DHT状态
      if (!this.dht) {
        console.error('DHT service not initialized')
        return results
      }

      console.log('DHT service status:', {
        isStarted: this.p2pNode.isStarted,
        dhtEnabled: !!this.dht,
        nodeId: this.p2pNode.node.peerId.toString()
      })

      const searchKeyString = `file-search:${word}`
      const searchKey = await this.createCID(searchKeyString)

      console.log(`Searching for key "${word}": ${searchKey.toString()}`)
      console.log(`DHT connected peers: ${this.p2pNode.getConnectedPeers().length}`)

      // 添加DHT查询前的验证
      console.log('Starting DHT.get() operation...')
      const startTime = Date.now()

      const dhtResults = this.dht.get(searchKey.bytes)
      console.log('DHT.get() returned iterator')

      let resultCount = 0
      let hasAnyResult = false

      try {
        // 使用Promise.race来控制等待时间
        const iteratorPromise = (async () => {
          for await (const result of dhtResults) {
            hasAnyResult = true
            resultCount++
            const elapsed = Date.now() - startTime

            console.log(`DHT result ${resultCount} for "${word}" (${elapsed}ms):`, {
              from: result.from?.toString()?.slice(-8),
              hasValue: !!result.value,
              type: result.type
            })

            if (result.value) {
              try {
                const fileInfo = JSON.parse(new TextDecoder().decode(result.value))
                results.push(fileInfo)
                console.log(`✓ Found file via DHT: ${fileInfo.name}`)
              } catch (parseError) {
                console.debug(`Failed to parse DHT result:`, parseError)
              }
            }

            // 找到结果后可以提前返回
            if (results.length > 0) {
              console.log(`Early return with ${results.length} results`)
              break
            }

            // 防止无限循环
            if (resultCount >= 5) {
              console.log('Limiting DHT results to 5')
              break
            }
          }
        })()

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('DHT iterator timeout')), maxWaitTime)
        })

        await Promise.race([iteratorPromise, timeoutPromise])

      } catch (iteratorError) {
        if (iteratorError.message === 'DHT iterator timeout') {
          console.warn(`DHT iterator timeout for "${word}" after ${maxWaitTime}ms`)
        } else {
          console.error('DHT iterator error:', iteratorError.message)
        }
      }

      const totalTime = Date.now() - startTime

      if (!hasAnyResult) {
        console.warn(`DHT search for "${word}" returned NO results after ${totalTime}ms`)
      } else {
        console.log(`DHT search for "${word}" returned ${resultCount} total results, ${results.length} valid files in ${totalTime}ms`)
      }

    } catch (error) {
      console.error(`DHT get failed for "${word}":`, error.message)
    }

    return results
  }

  // 搜索文件（修复版）
  async searchFiles(query, options = {}) {
    const { timeout = 15000, maxResults = 20 } = options
    console.log(`Starting enhanced search for: "${query}"`)

    const results = []
    const searchWords = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2)

    // 1. 本地搜索
    const localResults = this.searchLocalFiles(query)
    results.push(...localResults)
    console.log(`Local search found ${localResults.length} files`)

    // 2. 网络文件索引搜索
    const networkResults = this.searchNetworkFiles(query)
    networkResults.forEach(result => {
      if (!results.find(r => r.hash === result.hash)) {
        results.push({ ...result, source: 'network' })
      }
    })
    console.log(`Network index search found ${networkResults.length} files, total so far: ${results.length}`)

    // 3. 直接向连接的节点查询
    const connectedPeers = this.p2pNode.getConnectedPeers()
    if (connectedPeers.length > 0) {
      console.log(`Directly querying ${connectedPeers.length} connected peers`)
      for (const peerId of connectedPeers) {
        try {
          const peerResults = await this.queryPeerDirectly(peerId.toString(), query)
          console.log(`Peer ${peerId.toString()} returned ${peerResults.length} results`)

          peerResults.forEach(result => {
            if (!results.find(r => r.hash === result.hash)) {
              results.push({ ...result, source: 'direct' })
              console.log(`Added new result from peer: ${result.name}`)
            } else {
              console.log(`Skipped duplicate result: ${result.name}`)
            }
          })
        } catch (error) {
          console.debug(`Direct query failed for peer ${peerId}:`, error.message)
        }
      }
    }

    console.log(`After direct peer queries, total results: ${results.length}`)

    // 4. DHT搜索（作为补充）
    if (searchWords.length > 0) {
      console.log(`DHT search for words: ${searchWords.join(', ')}`)

      for (const word of searchWords) {
        try {
          console.log(`Starting DHT search for word: "${word}"`)

          // 创建超时控制
          const searchPromise = new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('DHT search timeout'))
            }, 8000) // 8秒超时

            try {
              const dhtResults = await this.searchDHTKey(word)
              clearTimeout(timeoutId)
              resolve(dhtResults)
            } catch (error) {
              clearTimeout(timeoutId)
              reject(error)
            }
          })

          try {
            const dhtResults = await searchPromise

            dhtResults.forEach(result => {
              if (!results.find(r => r.hash === result.hash)) {
                results.push({ ...result, source: 'dht' })
              }
            })

            console.log(`DHT search for "${word}" found ${dhtResults.length} files`)
          } catch (timeoutError) {
            console.warn(`DHT search timeout for word: ${word}`)
          }

        } catch (error) {
          console.warn(`DHT search failed for "${word}":`, error.message)
        }
      }
    }

    console.log(`Final search results: ${results.length}`)

    // 打印所有结果用于调试
    results.forEach((result, index) => {
      console.log(`Result ${index + 1}: ${result.name} (source: ${result.source}, hash: ${result.hash})`)
    })

    return results.slice(0, maxResults)
  }

  // 验证发布
  async verifyPublication(fileHash, cid) {
    try {
      console.log(`Verifying publication of ${fileHash}...`)

      // 尝试从DHT获取刚发布的数据
      const results = this.dht.get(cid.bytes)
      let found = false

      for await (const result of results) {
        if (result.value) {
          found = true
          console.log(`✓ Publication verified: ${fileHash}`)
          break
        }
      }

      if (!found) {
        console.warn(`⚠ Publication verification failed: ${fileHash}`)
      }
    } catch (error) {
      console.warn(`Publication verification error: ${error.message}`)
    }
  }

  // 查找文件
  async findFile(fileHash) {
    try {
      console.log(`Starting file search: ${fileHash}`)

      // 首先检查本地索引
      const localFile = this.fileIndex.get(fileHash)
      if (localFile) {
        console.log('File found in local index:', localFile.name)
        return localFile
      }

      // 检查网络文件索引
      for (const [key, fileInfo] of this.networkFileIndex) {
        if (fileInfo.hash === fileHash) {
          console.log('File found in network index:', fileInfo.name)
          return fileInfo
        }
      }

      console.log('Not found in local indexes, querying DHT...')
      const cid = await this.createCID(fileHash)
      console.log('Querying CID:', cid.toString())

      // 设置合理的超时
      const searchTimeout = 15000 // 15秒超时
      const startTime = Date.now()
      let found = false

      try {
        const results = this.dht.get(cid.bytes)

        for await (const event of results) {
          console.log(`DHT event: ${event.type}`)

          if (event.value && !found) {
            try {
              const fileInfo = JSON.parse(new TextDecoder().decode(event.value))
              console.log('File found in DHT:', fileInfo.name)
              found = true
              return fileInfo
            } catch (parseError) {
              console.error('Failed to parse DHT data:', parseError.message)
              continue
            }
          }

          // 检查超时
          if (Date.now() - startTime > searchTimeout) {
            console.log('DHT query timeout')
            break
          }
        }
      } catch (dhtError) {
        console.error('DHT query error:', dhtError.message)
      }

      if (!found) {
        console.log('File not found in DHT')
      }

      return null
    } catch (error) {
      console.error('Error during file search:', error.message)
      return null
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

  // 查找文件提供者
  async findProviders(fileHash) {
    const cid = await this.createCID(fileHash)
    const providers = []

    try {
      for await (const provider of this.dht.findProviders(cid)) {
        providers.push({ peerId: provider.id.toString() })
      }
    } catch (error) {
      console.debug('Error finding providers:', error.message)
    }

    return providers
  }

  // 专门的DHT搜索方法
  async searchDHT(query, maxResults, signal) {
    const results = []
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)

    if (searchTerms.length === 0) return results

    for (const term of searchTerms) {
      if (signal?.aborted) break
      if (results.length >= maxResults) break

      try {
        const searchKey = new TextEncoder().encode(`file-search:${term}`)
        const searchResults = this.dht.get(searchKey)

        let count = 0
        for await (const result of searchResults) {
          if (signal?.aborted) break
          if (count >= 5) break // 每个词最多5个结果

          if (result.value) {
            try {
              const networkFile = JSON.parse(new TextDecoder().decode(result.value))
              if (!results.find(f => f.hash === networkFile.hash)) {
                results.push(networkFile)
                count++
              }
            } catch (parseError) {
              continue
            }
          }
        }
      } catch (error) {
        console.debug(`Search failed for term "${term}":`, error.message)
        continue
      }
    }

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
      // 确保字符串编码的一致性
      bytes = new TextEncoder().encode(data)
    } else if (data instanceof Uint8Array) {
      bytes = data
    } else {
      bytes = new TextEncoder().encode(String(data))
    }

    const hash = await sha256.digest(bytes)
    const cid = CID.create(1, raw.code, hash)

    // 添加调试日志
    console.log(`createCID input: "${data}" -> CID: ${cid.toString()}`)

    return cid
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
        networkFiles: this.networkFileIndex.size,
        dhtEnabled: !!this.dht
      }
    } catch (error) {
      console.error('Error getting DHT stats:', error)
      // 返回安全的默认值
      return {
        connectedPeers: this.p2pNode.getConnectedPeers()?.length || 0,
        routingTableSize: 0,
        localFiles: this.fileIndex.size,
        networkFiles: 0,
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

  // 清理方法
  destroy() {
    // 清理定时器和资源
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }

    // 清理索引
    this.fileIndex.clear()
    this.networkFileIndex.clear()

    console.log('DHT Manager destroyed')
  }
}