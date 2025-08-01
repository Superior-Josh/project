import { createHash } from 'crypto'
import { pipeline } from 'stream/promises'
import { Readable, Writable } from 'stream'
import fs from 'fs/promises'
import path from 'path'

// 文件传输协议
const PROTOCOL_ID = '/p2p-file-sharing/1.0.0'
const CHUNK_SIZE = 64 * 1024 // 64KB chunks

export class FileManager {
  constructor(p2pNode, dhtManager, downloadDir = './downloads') {
    this.p2pNode = p2pNode
    this.dhtManager = dhtManager
    this.downloadDir = downloadDir
    this.activeTransfers = new Map() // 活跃的传输
    this.fileChunks = new Map() // 文件分块信息
    
    this.initializeProtocol()
    this.ensureDownloadDir()
  }

  async ensureDownloadDir() {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true })
    } catch (error) {
      console.error('Error creating download directory:', error)
    }
  }

  initializeProtocol() {
    // 注册文件传输协议处理器
    this.p2pNode.node.handle(PROTOCOL_ID, ({ stream, connection }) => {
      this.handleIncomingFileRequest(stream, connection)
    })
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

  // 分享文件
  async shareFile(filePath) {
    try {
      const fileName = path.basename(filePath)
      const fileStats = await fs.stat(filePath)
      const fileHash = await this.calculateFileHash(filePath)
      
      // 分割文件为块
      const chunks = await this.splitFileIntoChunks(filePath)
      
      // 存储文件块信息
      this.fileChunks.set(fileHash, {
        filePath,
        fileName,
        fileSize: fileStats.size,
        chunks,
        totalChunks: chunks.length
      })

      const fileMetadata = {
        name: fileName,
        size: fileStats.size,
        hash: fileHash,
        chunks: chunks.length,
        chunkSize: CHUNK_SIZE,
        mimeType: this.getMimeType(fileName)
      }

      // 发布到DHT
      await this.dhtManager.publishFile(fileHash, fileMetadata)
      await this.dhtManager.provideFile(fileHash)

      console.log(`File shared successfully: ${fileName} (${fileHash})`)
      return {
        success: true,
        fileHash,
        metadata: fileMetadata
      }
    } catch (error) {
      console.error('Error sharing file:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 下载文件
  async downloadFile(fileHash, fileName) {
    try {
      console.log(`Starting download for file: ${fileName} (${fileHash})`)
      
      // 查找文件提供者
      const providers = await this.dhtManager.findProviders(fileHash)
      if (providers.length === 0) {
        throw new Error('No providers found for this file')
      }

      // 获取文件元数据
      const fileInfo = await this.dhtManager.findFile(fileHash)
      if (!fileInfo) {
        throw new Error('File metadata not found in DHT')
      }

      const downloadPath = path.join(this.downloadDir, fileName)
      const transfer = {
        fileHash,
        fileName,
        downloadPath,
        totalChunks: fileInfo.chunks || 1,
        downloadedChunks: 0,
        chunks: new Map(),
        providers,
        startTime: Date.now()
      }

      this.activeTransfers.set(fileHash, transfer)

      // 从多个提供者下载块
      await this.downloadFromProviders(transfer)

      // 组装文件
      await this.assembleFile(transfer)

      this.activeTransfers.delete(fileHash)
      console.log(`Download completed: ${fileName}`)
      
      return {
        success: true,
        filePath: downloadPath
      }
    } catch (error) {
      console.error('Error downloading file:', error)
      this.activeTransfers.delete(fileHash)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 从提供者下载块
  async downloadFromProviders(transfer) {
    const { fileHash, providers, totalChunks } = transfer
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      let chunkDownloaded = false
      
      // 尝试从不同的提供者下载这个块
      for (const provider of providers) {
        try {
          const chunk = await this.requestChunk(provider.peerId, fileHash, chunkIndex)
          if (chunk && this.verifyChunk(chunk)) {
            transfer.chunks.set(chunkIndex, chunk)
            transfer.downloadedChunks++
            chunkDownloaded = true
            break
          }
        } catch (error) {
          console.error(`Failed to download chunk ${chunkIndex} from ${provider.peerId}:`, error)
        }
      }
      
      if (!chunkDownloaded) {
        throw new Error(`Failed to download chunk ${chunkIndex}`)
      }
    }
  }

  // 请求特定块
  async requestChunk(peerId, fileHash, chunkIndex) {
    const stream = await this.p2pNode.node.dialProtocol(peerId, PROTOCOL_ID)
    
    const request = {
      type: 'CHUNK_REQUEST',
      fileHash,
      chunkIndex
    }

    // 发送请求
    const requestData = JSON.stringify(request)
    const requestBuffer = Buffer.from(requestData)
    stream.write(new Uint8Array([requestBuffer.length]))
    stream.write(requestBuffer)

    // 接收响应
    return new Promise((resolve, reject) => {
      let responseBuffer = Buffer.alloc(0)
      
      stream.on('data', (data) => {
        responseBuffer = Buffer.concat([responseBuffer, Buffer.from(data)])
      })

      stream.on('end', () => {
        try {
          const response = JSON.parse(responseBuffer.toString())
          if (response.success) {
            resolve({
              index: chunkIndex,
              data: Buffer.from(response.data, 'base64'),
              hash: response.hash
            })
          } else {
            reject(new Error(response.error))
          }
        } catch (error) {
          reject(error)
        }
      })

      stream.on('error', reject)
      
      setTimeout(() => {
        reject(new Error('Chunk request timeout'))
      }, 30000) // 30秒超时
    })
  }

  // 处理传入的文件请求
  async handleIncomingFileRequest(stream, connection) {
    try {
      let requestBuffer = Buffer.alloc(0)
      
      stream.on('data', async (data) => {
        requestBuffer = Buffer.concat([requestBuffer, Buffer.from(data)])
        
        // 简单的协议：第一个字节是长度，然后是JSON请求
        if (requestBuffer.length > 1) {
          const requestLength = requestBuffer[0]
          if (requestBuffer.length >= requestLength + 1) {
            const requestData = requestBuffer.slice(1, requestLength + 1)
            const request = JSON.parse(requestData.toString())
            
            await this.processFileRequest(request, stream)
          }
        }
      })
    } catch (error) {
      console.error('Error handling file request:', error)
    }
  }

  // 处理文件请求
  async processFileRequest(request, stream) {
    try {
      if (request.type === 'CHUNK_REQUEST') {
        const { fileHash, chunkIndex } = request
        
        const fileInfo = this.fileChunks.get(fileHash)
        if (!fileInfo) {
          const errorResponse = {
            success: false,
            error: 'File not found'
          }
          stream.write(Buffer.from(JSON.stringify(errorResponse)))
          stream.end()
          return
        }

        const chunk = fileInfo.chunks[chunkIndex]
        if (!chunk) {
          const errorResponse = {
            success: false,
            error: 'Chunk not found'
          }
          stream.write(Buffer.from(JSON.stringify(errorResponse)))
          stream.end()
          return
        }

        const response = {
          success: true,
          data: chunk.data.toString('base64'),
          hash: chunk.hash,
          index: chunkIndex
        }

        stream.write(Buffer.from(JSON.stringify(response)))
        stream.end()
      }
    } catch (error) {
      console.error('Error processing file request:', error)
      const errorResponse = {
        success: false,
        error: error.message
      }
      stream.write(Buffer.from(JSON.stringify(errorResponse)))
      stream.end()
    }
  }

  // 验证块
  verifyChunk(chunk) {
    const calculatedHash = createHash('sha256').update(chunk.data).digest('hex')
    return calculatedHash === chunk.hash
  }

  // 组装文件
  async assembleFile(transfer) {
    const { downloadPath, chunks, totalChunks } = transfer
    
    // 按索引排序块
    const sortedChunks = Array.from(chunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, chunk]) => chunk)

    if (sortedChunks.length !== totalChunks) {
      throw new Error('Missing chunks, cannot assemble file')
    }

    // 写入文件
    const fileBuffer = Buffer.concat(sortedChunks.map(chunk => chunk.data))
    await fs.writeFile(downloadPath, fileBuffer)
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
      '.zip': 'application/zip'
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  // 获取传输状态
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

  // 获取所有活跃传输
  getActiveTransfers() {
    const transfers = []
    for (const [fileHash, transfer] of this.activeTransfers) {
      transfers.push({
        fileHash,
        ...this.getTransferStatus(fileHash)
      })
    }
    return transfers
  }
}