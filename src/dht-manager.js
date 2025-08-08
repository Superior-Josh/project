// 重构的DHT管理器 - 保留所有功能但简化代码结构

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

    if (!this.dht) {
      throw new Error('DHT service not available on P2P node')
    }

    console.log('DHT Manager initialized')

    // 延迟执行DHT测试，不阻塞初始化
    setTimeout(() => {
      this.testDHTFunctionality().catch(error => {
        console.debug('DHT test failed:', error.message)
      })
    }, 10000)
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
    const maxWaitTime = 10000 // 10秒最大等待时间

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

  // 搜索文件
  async searchFiles(query, options = {}) {
    const { timeout = 15000, maxResults = 20 } = options
    console.log(`Starting search for: "${query}"`)

    const results = []
    const searchWords = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2)

    // 1. 本地搜索
    for (const [hash, fileInfo] of this.fileIndex) {
      if (fileInfo.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({ ...fileInfo, source: 'local' })
      }
    }

    console.log(`Local search found ${results.length} files`)

    // 2. DHT网络搜索
    if (searchWords.length > 0) {
      console.log(`Searching DHT for words: ${searchWords.join(', ')}`)

      for (const word of searchWords) {
        try {
          console.log(`Starting DHT search for word: "${word}"`)

          // 创建超时控制
          const searchPromise = new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('DHT search timeout'))
            }, 15000) // 15秒超时

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
                results.push({ ...result, source: 'network' })
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

    console.log(`Total search results: ${results.length}`)
    return results
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

      console.log('Not found in local index, querying DHT...')
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
    
    for await (const provider of this.dht.findProviders(cid)) {
      providers.push({ peerId: provider.id.toString() })
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