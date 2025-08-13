// src/file-manager.js

import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { peerIdFromString } from '@libp2p/peer-id'

// 文件传输协议
const PROTOCOL_ID = '/p2p-file-sharing/1.0.0'
const NETWORK_PROTOCOL_ID = '/p2p-file-sharing/network-transfer/1.0.0'
const CHUNK_SIZE = 64 * 1024 // 64KB chunks

// src/file-manager.js - 修改部分

export class FileManager {
  constructor(p2pNode, dhtManager, downloadDir = './downloads') {
    this.p2pNode = p2pNode
    this.dhtManager = dhtManager
    this.downloadDir = downloadDir
    this.activeTransfers = new Map() // 活跃的传输
    this.fileChunks = new Map() // 文件分块信息
    this.networkTransfers = new Map() // 网络传输状态
    this.downloadQueue = new Map() // 下载队列
    this.transferStats = new Map() // 传输统计

    // 网络文件下载配置
    this.networkConfig = {
      maxConcurrentDownloads: 3,
      maxProvidersPerDownload: 5,
      chunkRetryAttempts: 3,
      providerTimeout: 30000,
      downloadTimeout: 300000, // 5分钟
      enableRedundantDownload: true,
      enableLoadBalancing: true
    }

    this.initializeProtocols()
    this.ensureDownloadDir()
  }

  async ensureDownloadDir() {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true })
      // 创建网络下载临时目录
      await fs.mkdir(path.join(this.downloadDir, '.tmp'), { recursive: true })
      console.log(`Download directory ensured: ${this.downloadDir}`)
    } catch (error) {
      console.error('Error creating download directory:', error)
    }
  }

  // 新增：更新下载目录
  async updateDownloadDirectory(newDownloadDir) {
    console.log(`Updating download directory from ${this.downloadDir} to ${newDownloadDir}`)
    this.downloadDir = newDownloadDir
    await this.ensureDownloadDir()
  }

  // 新增：获取当前下载目录
  getDownloadDirectory() {
    return this.downloadDir
  }

  // 修改：创建网络下载任务，使用当前设置的下载目录
  async createNetworkDownloadTask(fileHash, fileName, fileInfo, providers) {
    const downloadId = `net_${fileHash}_${Date.now()}`
    
    // 使用当前的下载目录
    const downloadPath = path.join(this.downloadDir, fileName)
    const tempDir = path.join(this.downloadDir, '.tmp', downloadId)

    // 确保目录存在
    await fs.mkdir(tempDir, { recursive: true })

    // 选择最佳提供者
    const selectedProviders = await this.selectOptimalProviders(providers, fileHash)

    const downloadTask = {
      id: downloadId,
      fileHash,
      fileName,
      fileInfo,
      downloadPath,
      tempDir,
      providers: selectedProviders,
      totalChunks: fileInfo.chunks || 1,
      chunkSize: fileInfo.chunkSize || CHUNK_SIZE,
      completedChunks: new Set(),
      failedChunks: new Set(),
      activeChunks: new Map(),
      startTime: Date.now(),
      status: 'initializing',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: fileInfo.size || 0,
      currentSpeed: 0,
      averageSpeed: 0,
      estimatedTime: 0,
      providerStats: new Map()
    }

    this.networkTransfers.set(fileHash, downloadTask)
    return downloadTask
  }

  // 修改：简单网络下载，使用当前下载目录
  async executeSimpleNetworkDownload(downloadTask) {
    const { fileHash, fileName, providers } = downloadTask
    
    // 使用当前的下载目录
    const downloadPath = path.join(this.downloadDir, fileName)

    console.log(`📥 Executing simple network download for ${fileName} to ${downloadPath}`)

    for (const provider of providers) {
      try {
        console.log(`📡 Attempting download from provider: ${provider.peerId}`)

        const fileData = await this.requestNetworkFile(provider.peerId, fileHash, fileName)
        
        if (fileData) {
          // 验证文件哈希
          const receivedHash = createHash('sha256').update(fileData).digest('hex')
          if (receivedHash !== fileHash) {
            throw new Error('File hash verification failed')
          }

          // 保存文件到设置的下载目录
          await fs.writeFile(downloadPath, fileData)
          
          downloadTask.status = 'completed'
          downloadTask.progress = 100
          downloadTask.downloadedBytes = fileData.length

          console.log(`✅ Simple network download completed: ${downloadPath}`)

          return {
            success: true,
            filePath: downloadPath,
            downloadTime: Date.now() - downloadTask.startTime,
            provider: provider.peerId
          }
        }

      } catch (error) {
        console.warn(`Provider ${provider.peerId} failed:`, error.message)
        continue
      }
    }

    throw new Error('All providers failed for simple download')
  }

  // 修改：组装网络文件，使用正确的下载路径
  async assembleNetworkFile(downloadTask) {
    const { tempDir, fileName } = downloadTask
    
    // 使用当前的下载目录
    const downloadPath = path.join(this.downloadDir, fileName)
    downloadTask.downloadPath = downloadPath

    console.log(`🔧 Assembling network file: ${fileName} to ${downloadPath}`)

    const outputFile = await fs.open(downloadPath, 'w')

    try {
      for (let i = 0; i < downloadTask.totalChunks; i++) {
        const chunkPath = path.join(tempDir, `chunk_${i}`)

        try {
          const chunkData = await fs.readFile(chunkPath)
          await outputFile.write(chunkData)
        } catch (error) {
          throw new Error(`Failed to read chunk ${i}: ${error.message}`)
        }
      }
    } finally {
      await outputFile.close()
    }

    // 验证最终文件哈希
    const finalFileData = await fs.readFile(downloadPath)
    const finalHash = createHash('sha256').update(finalFileData).digest('hex')
    
    if (finalHash !== downloadTask.fileHash) {
      throw new Error('Final file hash verification failed')
    }

    console.log(`✅ Network file assembled and verified: ${downloadPath}`)
  }

  // 新增：检查下载目录是否可写
  async checkDownloadDirectoryWritable() {
    try {
      const testFile = path.join(this.downloadDir, '.write-test')
      await fs.writeFile(testFile, 'test')
      await fs.unlink(testFile)
      return true
    } catch (error) {
      console.error('Download directory is not writable:', error)
      return false
    }
  }

  // 新增：获取下载目录信息
  async getDownloadDirectoryInfo() {
    try {
      const stats = await fs.stat(this.downloadDir)
      const isWritable = await this.checkDownloadDirectoryWritable()
      
      return {
        path: this.downloadDir,
        exists: true,
        isDirectory: stats.isDirectory(),
        isWritable,
        size: stats.size,
        modified: stats.mtime
      }
    } catch (error) {
      return {
        path: this.downloadDir,
        exists: false,
        isDirectory: false,
        isWritable: false,
        error: error.message
      }
    }
  }

  // 新增：清理下载目录中的临时文件
  async cleanupDownloadDirectory() {
    try {
      const tempDir = path.join(this.downloadDir, '.tmp')
      
      // 清理临时目录
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
        console.log('Cleaned up temporary download files')
      } catch (error) {
        console.debug('No temporary files to clean up')
      }

      // 重新创建临时目录
      await fs.mkdir(tempDir, { recursive: true })
      
      return { success: true, message: 'Download directory cleaned up' }
    } catch (error) {
      console.error('Error cleaning up download directory:', error)
      return { success: false, error: error.message }
    }
  }

  initializeProtocols() {
    // 等待节点启动后再注册协议
    if (this.p2pNode.node) {
      this.registerProtocolHandlers()
    } else {
      setTimeout(() => {
        if (this.p2pNode.node) {
          this.registerProtocolHandlers()
        }
      }, 1000)
    }
  }

  registerProtocolHandlers() {
    try {
      // 原有协议
      this.p2pNode.node.handle(PROTOCOL_ID, ({ stream, connection }) => {
        this.handleIncomingFileRequest(stream, connection)
      })

      // 网络传输协议
      this.p2pNode.node.handle(NETWORK_PROTOCOL_ID, ({ stream, connection }) => {
        this.handleNetworkTransferRequest(stream, connection)
      })

      console.log('✅ Enhanced file transfer protocols registered')
    } catch (error) {
      console.error('Error registering protocol handlers:', error)
    }
  }

  // 计算文件哈希
  async calculateFileHash(filePath) {
    const hash = createHash('sha256')
    const data = await fs.readFile(filePath)
    hash.update(data)
    return hash.digest('hex')
  }

  // 将文件分割成块
  async splitFileIntoChunks(filePath) {
    const fileData = await fs.readFile(filePath)
    const chunks = []
    const totalChunks = Math.ceil(fileData.length / CHUNK_SIZE)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, fileData.length)
      const chunk = fileData.slice(start, end)
      const chunkHash = createHash('sha256').update(chunk).digest('hex')

      chunks.push({
        index: i,
        data: chunk,
        hash: chunkHash,
        size: chunk.length
      })
    }

    return chunks
  }

  // 分享文件（增强版 - 支持网络分享）
  async shareFile(filePath) {
    try {
      const fileName = path.basename(filePath)
      const fileStats = await fs.stat(filePath)
      const fileHash = await this.calculateFileHash(filePath)

      console.log(`🌐 Sharing file to network: ${fileName}`)

      // 分割文件为块
      const chunks = await this.splitFileIntoChunks(filePath)

      // 存储文件块信息
      this.fileChunks.set(fileHash, {
        filePath,
        fileName,
        fileSize: fileStats.size,
        chunks,
        totalChunks: chunks.length,
        sharedAt: Date.now(),
        networkShared: true
      })

      const fileMetadata = {
        name: fileName,
        size: fileStats.size,
        hash: fileHash,
        chunks: chunks.length,
        chunkSize: CHUNK_SIZE,
        mimeType: this.getMimeType(fileName),
        networkShared: true,
        sharedAt: Date.now()
      }

      // 发布到网络DHT
      await this.dhtManager.publishFile(fileHash, fileMetadata)
      await this.dhtManager.provideFile(fileHash)

      console.log(`✅ File shared to network successfully: ${fileName} (${fileHash})`)
      
      return {
        success: true,
        fileHash,
        metadata: fileMetadata,
        networkShared: true
      }
    } catch (error) {
      console.error('Error sharing file to network:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 网络文件下载（增强版）
  async downloadFile(fileHash, fileName) {
    try {
      console.log(`🌐 Starting network download: ${fileName} (${fileHash})`)

      // 检查是否已在下载
      if (this.networkTransfers.has(fileHash)) {
        throw new Error('File is already being downloaded')
      }

      // 查找网络文件信息和提供者
      const fileInfo = await this.dhtManager.findFile(fileHash)
      if (!fileInfo) {
        throw new Error('File not found in network')
      }

      const providers = await this.dhtManager.findProviders(fileHash)
      if (providers.length === 0) {
        throw new Error('No providers found for this file')
      }

      console.log(`📊 Found file info and ${providers.length} providers`)

      // 创建网络下载任务
      const downloadTask = await this.createNetworkDownloadTask(fileHash, fileName, fileInfo, providers)
      
      // 开始网络下载
      const result = await this.executeNetworkDownload(downloadTask)

      if (result.success) {
        console.log(`✅ Network download completed: ${fileName}`)
        return {
          success: true,
          filePath: result.filePath,
          source: 'network',
          providers: providers.length,
          downloadTime: result.downloadTime
        }
      } else {
        throw new Error(result.error)
      }

    } catch (error) {
      console.error('Network download failed:', error)
      this.networkTransfers.delete(fileHash)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 选择最佳提供者
  async selectOptimalProviders(providers, fileHash) {
    console.log(`🔍 Selecting optimal providers from ${providers.length} available`)

    const validProviders = []
    const connectedPeers = this.p2pNode.getConnectedPeers().map(p => p.toString())

    // 优先选择已连接的提供者
    for (const provider of providers) {
      const peerId = provider.peerId || provider.id?.toString() || provider

      // 跳过自己
      if (peerId === this.p2pNode.node.peerId.toString()) {
        continue
      }

      // 检查提供者可用性
      const isConnected = connectedPeers.includes(peerId)
      const isVerified = provider.verified || false

      validProviders.push({
        peerId,
        connected: isConnected,
        verified: isVerified,
        lastSeen: provider.lastSeen || Date.now(),
        priority: this.calculateProviderPriority(provider, isConnected, isVerified)
      })
    }

    // 按优先级排序并选择前N个
    validProviders.sort((a, b) => b.priority - a.priority)
    const selectedProviders = validProviders.slice(0, this.networkConfig.maxProvidersPerDownload)

    console.log(`✅ Selected ${selectedProviders.length} optimal providers`)
    return selectedProviders
  }

  // 计算提供者优先级
  calculateProviderPriority(provider, isConnected, isVerified) {
    let priority = 0

    // 已连接的提供者优先级更高
    if (isConnected) priority += 100

    // 已验证的提供者优先级更高
    if (isVerified) priority += 50

    // 最近见过的提供者优先级更高
    const timeSinceLastSeen = Date.now() - (provider.lastSeen || 0)
    if (timeSinceLastSeen < 300000) priority += 30 // 5分钟内
    else if (timeSinceLastSeen < 3600000) priority += 10 // 1小时内

    return priority
  }

  // 执行网络下载
  async executeNetworkDownload(downloadTask) {
    try {
      downloadTask.status = 'downloading'
      console.log(`🚀 Starting network download execution for ${downloadTask.fileName}`)

      // 如果只有一个块，使用简单下载
      if (downloadTask.totalChunks === 1) {
        return await this.executeSimpleNetworkDownload(downloadTask)
      } else {
        return await this.executeChunkedNetworkDownload(downloadTask)
      }

    } catch (error) {
      downloadTask.status = 'failed'
      downloadTask.error = error.message
      console.error('Network download execution failed:', error)
      throw error
    } finally {
      // 清理临时文件
      await this.cleanupNetworkDownload(downloadTask)
    }
  }

  // 分块网络下载
  async executeChunkedNetworkDownload(downloadTask) {
    const { fileHash, fileName, providers, totalChunks } = downloadTask

    console.log(`🧩 Executing chunked network download for ${fileName} (${totalChunks} chunks)`)

    // 创建下载工作队列
    const chunkQueue = Array.from({ length: totalChunks }, (_, i) => i)
    const downloadPromises = []

    // 启动并发下载工作器
    const concurrency = Math.min(this.networkConfig.maxConcurrentDownloads, providers.length)
    for (let i = 0; i < concurrency; i++) {
      downloadPromises.push(this.networkChunkDownloadWorker(downloadTask, chunkQueue, providers))
    }

    // 等待所有块下载完成
    await Promise.all(downloadPromises)

    // 检查下载完整性
    if (downloadTask.completedChunks.size !== totalChunks) {
      throw new Error(`Download incomplete: ${downloadTask.completedChunks.size}/${totalChunks} chunks`)
    }

    // 组装文件
    await this.assembleNetworkFile(downloadTask)

    downloadTask.status = 'completed'
    downloadTask.progress = 100

    console.log(`✅ Chunked network download completed: ${fileName}`)

    return {
      success: true,
      filePath: downloadTask.downloadPath,
      downloadTime: Date.now() - downloadTask.startTime,
      providers: providers.length,
      chunks: totalChunks
    }
  }

  // 网络块下载工作器
  async networkChunkDownloadWorker(downloadTask, chunkQueue, providers) {
    while (chunkQueue.length > 0 && downloadTask.status === 'downloading') {
      const chunkIndex = chunkQueue.shift()
      if (chunkIndex === undefined) break

      let downloadSuccess = false
      let attempts = 0

      while (!downloadSuccess && attempts < this.networkConfig.chunkRetryAttempts) {
        attempts++

        // 选择提供者（轮询）
        const provider = providers[chunkIndex % providers.length]

        try {
          await this.downloadNetworkChunk(downloadTask, chunkIndex, provider)
          downloadSuccess = true
          downloadTask.completedChunks.add(chunkIndex)

          // 更新进度
          this.updateNetworkDownloadProgress(downloadTask)

          console.log(`✅ Chunk ${chunkIndex} downloaded from ${provider.peerId}`)

        } catch (error) {
          console.warn(`Failed to download chunk ${chunkIndex} from ${provider.peerId} (attempt ${attempts}):`, error.message)

          if (attempts >= this.networkConfig.chunkRetryAttempts) {
            downloadTask.failedChunks.add(chunkIndex)
            // 重新添加到队列，尝试其他提供者
            if (providers.length > 1) {
              chunkQueue.push(chunkIndex)
            }
          }

          // 等待重试
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
        }
      }
    }
  }

  // 下载网络块
  async downloadNetworkChunk(downloadTask, chunkIndex, provider) {
    const chunkPath = path.join(downloadTask.tempDir, `chunk_${chunkIndex}`)

    // 检查块是否已存在
    try {
      await fs.access(chunkPath)
      return // 块已存在
    } catch {
      // 块不存在，需要下载
    }

    console.log(`📦 Downloading chunk ${chunkIndex} from ${provider.peerId}`)

    const chunk = await this.requestNetworkChunk(provider.peerId, downloadTask.fileHash, chunkIndex)

    if (!chunk || !chunk.data) {
      throw new Error(`No chunk data received for chunk ${chunkIndex}`)
    }

    // 验证块哈希（如果提供）
    if (chunk.hash) {
      const receivedHash = createHash('sha256').update(chunk.data).digest('hex')
      if (receivedHash !== chunk.hash) {
        throw new Error(`Chunk ${chunkIndex} hash verification failed`)
      }
    }

    // 保存块
    await fs.writeFile(chunkPath, chunk.data)
    downloadTask.downloadedBytes += chunk.data.length

    // 更新提供者统计
    if (!downloadTask.providerStats.has(provider.peerId)) {
      downloadTask.providerStats.set(provider.peerId, { chunks: 0, bytes: 0, errors: 0 })
    }
    const stats = downloadTask.providerStats.get(provider.peerId)
    stats.chunks++
    stats.bytes += chunk.data.length
  }

  // 请求网络文件
  async requestNetworkFile(peerId, fileHash, fileName) {
    try {
      console.log(`📡 Requesting complete file ${fileName} from ${peerId}`)

      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, NETWORK_PROTOCOL_ID)

      const request = {
        type: 'NETWORK_FILE_REQUEST',
        fileHash,
        fileName,
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      }

      await this.sendMessage(stream, request)
      const response = await this.receiveMessage(stream)

      if (response.success && response.fileData) {
        console.log(`✅ Received complete file data from ${peerId}`)
        return Buffer.from(response.fileData, 'base64')
      } else {
        throw new Error(response.error || 'No file data received')
      }

    } catch (error) {
      console.error(`Failed to request file from ${peerId}:`, error.message)
      throw error
    }
  }

  // 请求网络块
  async requestNetworkChunk(peerId, fileHash, chunkIndex) {
    try {
      console.log(`📦 Requesting chunk ${chunkIndex} from ${peerId}`)

      const peerIdObj = peerIdFromString(peerId)
      const stream = await this.p2pNode.node.dialProtocol(peerIdObj, NETWORK_PROTOCOL_ID)

      const request = {
        type: 'NETWORK_CHUNK_REQUEST',
        fileHash,
        chunkIndex,
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      }

      await this.sendMessage(stream, request)
      const response = await this.receiveMessage(stream)

      if (response.success && response.chunkData) {
        return {
          index: chunkIndex,
          data: Buffer.from(response.chunkData, 'base64'),
          hash: response.chunkHash
        }
      } else {
        throw new Error(response.error || 'No chunk data received')
      }

    } catch (error) {
      console.error(`Failed to request chunk ${chunkIndex} from ${peerId}:`, error.message)
      throw error
    }
  }

  // 处理网络传输请求
  async handleNetworkTransferRequest(stream, connection) {
    try {
      const request = await this.receiveMessage(stream)
      const peerId = connection.remotePeer.toString()

      console.log(`📡 Received network transfer request from ${peerId}:`, request.type)

      let response = { success: false }

      switch (request.type) {
        case 'NETWORK_FILE_REQUEST':
          response = await this.handleNetworkFileRequest(request, peerId)
          break
        case 'NETWORK_CHUNK_REQUEST':
          response = await this.handleNetworkChunkRequest(request, peerId)
          break
        default:
          response = { success: false, error: 'Unknown request type' }
      }

      await this.sendMessage(stream, response)

    } catch (error) {
      console.error('Error handling network transfer request:', error)
      await this.sendMessage(stream, { success: false, error: error.message })
    }
  }

  // 处理网络文件请求
  async handleNetworkFileRequest(request, peerId) {
    try {
      const { fileHash, fileName } = request

      console.log(`📤 Handling file request for ${fileName} from ${peerId}`)

      const fileInfo = this.fileChunks.get(fileHash)
      if (!fileInfo) {
        return { success: false, error: 'File not found' }
      }

      // 读取完整文件
      const fileData = await fs.readFile(fileInfo.filePath)
      
      const response = {
        success: true,
        fileData: fileData.toString('base64'),
        fileSize: fileData.length,
        fileName: fileInfo.fileName,
        provider: this.p2pNode.node.peerId.toString()
      }

      console.log(`✅ Sent complete file ${fileName} to ${peerId}`)
      return response

    } catch (error) {
      console.error('Error handling network file request:', error)
      return { success: false, error: error.message }
    }
  }

  // 处理网络块请求
  async handleNetworkChunkRequest(request, peerId) {
    try {
      const { fileHash, chunkIndex } = request

      console.log(`📦 Handling chunk request ${chunkIndex} from ${peerId}`)

      const fileInfo = this.fileChunks.get(fileHash)
      if (!fileInfo) {
        return { success: false, error: 'File not found' }
      }

      const chunk = fileInfo.chunks[chunkIndex]
      if (!chunk) {
        return { success: false, error: 'Chunk not found' }
      }

      const response = {
        success: true,
        chunkData: chunk.data.toString('base64'),
        chunkHash: chunk.hash,
        chunkIndex: chunkIndex,
        chunkSize: chunk.size,
        provider: this.p2pNode.node.peerId.toString()
      }

      console.log(`✅ Sent chunk ${chunkIndex} to ${peerId}`)
      return response

    } catch (error) {
      console.error('Error handling network chunk request:', error)
      return { success: false, error: error.message }
    }
  }

  // 更新网络下载进度
  updateNetworkDownloadProgress(downloadTask) {
    const completedCount = downloadTask.completedChunks.size
    const totalCount = downloadTask.totalChunks
    const progress = (completedCount / totalCount) * 100

    downloadTask.progress = Math.round(progress * 100) / 100

    // 计算速度
    const elapsedTime = (Date.now() - downloadTask.startTime) / 1000
    if (elapsedTime > 0) {
      downloadTask.currentSpeed = downloadTask.downloadedBytes / elapsedTime
      
      if (downloadTask.currentSpeed > 0) {
        const remainingBytes = downloadTask.totalBytes - downloadTask.downloadedBytes
        downloadTask.estimatedTime = Math.round(remainingBytes / downloadTask.currentSpeed)
      }
    }
  }

  // 清理网络下载
  async cleanupNetworkDownload(downloadTask) {
    try {
      if (downloadTask.tempDir) {
        await fs.rm(downloadTask.tempDir, { recursive: true, force: true })
        console.log(`🧹 Cleaned up temp directory: ${downloadTask.tempDir}`)
      }
    } catch (error) {
      console.error('Error cleaning up network download:', error)
    }
  }

  // 处理传入的文件请求（原有逻辑保持不变）
  async handleIncomingFileRequest(stream, connection) {
    try {
      let requestData = []
      let expectedLength = null
      let receivedLength = 0

      for await (const chunk of stream.source) {
        requestData.push(chunk)
        receivedLength += chunk.length

        // 读取消息长度
        if (expectedLength === null && receivedLength >= 4) {
          const allData = Buffer.concat(requestData)
          expectedLength = allData.readUInt32BE(0)
          requestData = [allData.slice(4)]
          receivedLength -= 4
        }

        // 处理完整的请求
        if (expectedLength !== null && receivedLength >= expectedLength) {
          const requestBuffer = Buffer.concat(requestData).slice(0, expectedLength)
          const request = JSON.parse(requestBuffer.toString())

          await this.processFileRequest(request, stream)
          break
        }
      }
    } catch (error) {
      console.error('Error handling file request:', error)
      const errorResponse = { success: false, error: error.message }
      await this.sendResponse(stream, errorResponse)
    }
  }

  // 处理文件请求（原有逻辑）
  async processFileRequest(request, stream) {
    try {
      if (request.type === 'CHUNK_REQUEST') {
        const { fileHash, chunkIndex } = request

        const fileInfo = this.fileChunks.get(fileHash)
        if (!fileInfo) {
          const errorResponse = { success: false, error: 'File not found' }
          await this.sendResponse(stream, errorResponse)
          return
        }

        const chunk = fileInfo.chunks[chunkIndex]
        if (!chunk) {
          const errorResponse = { success: false, error: 'Chunk not found' }
          await this.sendResponse(stream, errorResponse)
          return
        }

        const response = {
          success: true,
          data: chunk.data.toString('base64'),
          hash: chunk.hash,
          index: chunkIndex
        }

        await this.sendResponse(stream, response)
      }
    } catch (error) {
      console.error('Error processing file request:', error)
      const errorResponse = { success: false, error: error.message }
      await this.sendResponse(stream, errorResponse)
    }
  }

  // 发送响应
  async sendResponse(stream, response) {
    const responseData = JSON.stringify(response)
    const responseBuffer = Buffer.from(responseData)

    const lengthBuffer = Buffer.allocUnsafe(4)
    lengthBuffer.writeUInt32BE(responseBuffer.length, 0)

    stream.sink(async function* () {
      yield lengthBuffer
      yield responseBuffer
    }())
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
      }, this.networkConfig.providerTimeout)

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

  // 验证块
  verifyChunk(chunk) {
    const calculatedHash = createHash('sha256').update(chunk.data).digest('hex')
    return calculatedHash === chunk.hash
  }

  // 获取MIME类型
  getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase()
    const mimeTypes = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript'
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  // 获取网络传输状态
  getNetworkTransferStatus(fileHash) {
    const transfer = this.networkTransfers.get(fileHash)
    if (!transfer) return null

    return {
      id: transfer.id,
      fileName: transfer.fileName,
      fileHash: transfer.fileHash,
      progress: transfer.progress,
      status: transfer.status,
      downloadedChunks: transfer.completedChunks.size,
      totalChunks: transfer.totalChunks,
      downloadedBytes: transfer.downloadedBytes,
      totalBytes: transfer.totalBytes,
      currentSpeed: transfer.currentSpeed,
      averageSpeed: transfer.averageSpeed,
      estimatedTime: transfer.estimatedTime,
      elapsedTime: Date.now() - transfer.startTime,
      providers: transfer.providers.length,
      providerStats: Object.fromEntries(transfer.providerStats)
    }
  }

  // 获取所有活跃传输（包括网络传输）
  getActiveTransfers() {
    const transfers = []

    // 原有传输
    for (const [fileHash, transfer] of this.activeTransfers) {
      transfers.push({
        fileHash,
        type: 'local',
        ...this.getTransferStatus(fileHash)
      })
    }

    // 网络传输
    for (const [fileHash, transfer] of this.networkTransfers) {
      transfers.push({
        fileHash,
        type: 'network',
        ...this.getNetworkTransferStatus(fileHash)
      })
    }

    return transfers
  }

  // 获取传输状态（原有逻辑）
  getTransferStatus(fileHash) {
    const transfer = this.activeTransfers.get(fileHash)
    if (!transfer) return null

    return {
      fileName: transfer.fileName,
      progress: (transfer.downloadedChunks / transfer.totalChunks) * 100,
      downloadedChunks: transfer.downloadedChunks,
      totalChunks: transfer.totalChunks,
      elapsedTime: Date.now() - transfer.startTime
    }
  }

  // 获取网络文件统计
  getNetworkFileStats() {
    return {
      sharedFiles: this.fileChunks.size,
      activeNetworkTransfers: this.networkTransfers.size,
      totalNetworkDownloads: this.transferStats.size,
      networkProtocolsActive: true
    }
  }

  // 生成请求ID
  generateRequestId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 清理资源
  destroy() {
    // 清理活跃传输
    this.activeTransfers.clear()
    this.networkTransfers.clear()
    this.fileChunks.clear()
    this.downloadQueue.clear()
    this.transferStats.clear()

    console.log('🧹 Enhanced File Manager destroyed')
  }
}