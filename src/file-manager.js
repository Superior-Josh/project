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
    // 等待节点启动后再注册协议
    if (this.p2pNode.node) {
      this.registerProtocolHandler()
    } else {
      // 如果节点还未启动，等待启动后注册
      setTimeout(() => {
        if (this.p2pNode.node) {
          this.registerProtocolHandler()
        }
      }, 1000)
    }
  }

  registerProtocolHandler() {
    try {
      this.p2pNode.node.handle(PROTOCOL_ID, ({ stream, connection }) => {
        this.handleIncomingFileRequest(stream, connection)
      })
      console.log('File transfer protocol registered')
    } catch (error) {
      console.error('Error registering protocol handler:', error)
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
  // async downloadFile(fileHash, fileName) {
  //   try {
  //     console.log(`Starting download for file: ${fileName} (${fileHash})`)
      
  //     // 查找文件提供者
  //     const providers = await this.dhtManager.findProviders(fileHash)
  //     if (providers.length === 0) {
  //       throw new Error('No providers found for this file')
  //     }

  //     // 获取文件元数据
  //     const fileInfo = await this.dhtManager.findFile(fileHash)
  //     if (!fileInfo) {
  //       throw new Error('File metadata not found in DHT')
  //     }

  //     const downloadPath = path.join(this.downloadDir, fileName)
  //     const transfer = {
  //       fileHash,
  //       fileName,
  //       downloadPath,
  //       totalChunks: fileInfo.chunks || 1,
  //       downloadedChunks: 0,
  //       chunks: new Map(),
  //       providers,
  //       startTime: Date.now()
  //     }

  //     this.activeTransfers.set(fileHash, transfer)

  //     // 从多个提供者下载块
  //     await this.downloadFromProviders(transfer)

  //     // 组装文件
  //     await this.assembleFile(transfer)

  //     this.activeTransfers.delete(fileHash)
  //     console.log(`Download completed: ${fileName}`)
      
  //     return {
  //       success: true,
  //       filePath: downloadPath
  //     }
  //   } catch (error) {
  //     console.error('Error downloading file:', error)
  //     this.activeTransfers.delete(fileHash)
  //     return {
  //       success: false,
  //       error: error.message
  //     }
  //   }
  // }
  async downloadFile(fileHash, fileName) {
  try {
    console.log(`Starting download for file: ${fileName} (${fileHash})`)
    
    // Find file providers
    const providers = await this.dhtManager.findProviders(fileHash)
    if (providers.length === 0) {
      throw new Error('No providers found for this file')
    }

    // Get file metadata
    const fileInfo = await this.dhtManager.findFile(fileHash)
    if (!fileInfo) {
      console.log('No file metadata found, proceeding with basic info')
    }

    const downloadPath = path.join(this.downloadDir, fileName)
    const transfer = {
      fileHash,
      fileName,
      downloadPath,
      totalChunks: fileInfo?.chunks || 1,
      downloadedChunks: 0,
      chunks: new Map(),
      providers,
      startTime: Date.now()
    }

    this.activeTransfers.set(fileHash, transfer)

    console.log(`Download transfer created for: ${fileName}`)
    console.log(`Total chunks expected: ${transfer.totalChunks}`)
    console.log(`Using ${providers.length} providers`)

    // Download from multiple providers
    await this.downloadFromProviders(transfer)

    // Assemble file
    await this.assembleFile(transfer)

    this.activeTransfers.delete(fileHash)
    console.log(`Download completed successfully: ${fileName}`)
    
    return {
      success: true,
      filePath: downloadPath
    }
  } catch (error) {
    console.error('Download error:', error.message)
    console.error('Download error stack:', error.stack)
    this.activeTransfers.delete(fileHash)
    return {
      success: false,
      error: error.message
    }
  }
}

  // 从提供者下载块
  // async downloadFromProviders(transfer) {
  //   const { fileHash, providers, totalChunks } = transfer
    
  //   for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
  //     let chunkDownloaded = false
      
  //     // 尝试从不同的提供者下载这个块
  //     for (const provider of providers) {
  //       try {
  //         const chunk = await this.requestChunk(provider.peerId, fileHash, chunkIndex)
  //         if (chunk && this.verifyChunk(chunk)) {
  //           transfer.chunks.set(chunkIndex, chunk)
  //           transfer.downloadedChunks++
  //           chunkDownloaded = true
  //           break
  //         }
  //       } catch (error) {
  //         console.error(`Failed to download chunk ${chunkIndex} from ${provider.peerId}:`, error)
  //       }
  //     }
      
  //     if (!chunkDownloaded) {
  //       throw new Error(`Failed to download chunk ${chunkIndex}`)
  //     }
  //   }
  // }
async downloadFromProviders(transfer) {
  const { fileHash, providers, totalChunks } = transfer
  
  console.log(`Starting download from providers for ${totalChunks} chunks`)
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    let chunkDownloaded = false
    let lastError = null
    
    console.log(`Downloading chunk ${chunkIndex + 1}/${totalChunks}`)
    
    // Try different providers for this chunk
    for (const provider of providers) {
      try {
        console.log(`Requesting chunk ${chunkIndex} from provider: ${provider.peerId}`)
        const chunk = await this.requestChunk(provider.peerId, fileHash, chunkIndex)
        
        if (chunk && this.verifyChunk(chunk)) {
          transfer.chunks.set(chunkIndex, chunk)
          transfer.downloadedChunks++
          chunkDownloaded = true
          console.log(`Successfully downloaded chunk ${chunkIndex} from ${provider.peerId}`)
          break
        } else {
          console.log(`Invalid chunk ${chunkIndex} from ${provider.peerId}`)
        }
      } catch (error) {
        console.error(`Failed to download chunk ${chunkIndex} from ${provider.peerId}:`, error.message)
        lastError = error
      }
    }
    
    if (!chunkDownloaded) {
      throw new Error(`Failed to download chunk ${chunkIndex}. Last error: ${lastError?.message || 'Unknown error'}`)
    }
  }
  
  console.log(`All ${totalChunks} chunks downloaded successfully`)
}

  // 请求特定块
  // async requestChunk(peerId, fileHash, chunkIndex) {
  //   try {
  //     // 确保节点已启动
  //     if (!this.p2pNode.node) {
  //       throw new Error('P2P node not initialized')
  //     }

  //     const stream = await this.p2pNode.node.dialProtocol(peerId, PROTOCOL_ID)
      
  //     const request = {
  //       type: 'CHUNK_REQUEST',
  //       fileHash,
  //       chunkIndex
  //     }

  //     // 发送请求
  //     const requestData = JSON.stringify(request)
  //     const requestBuffer = Buffer.from(requestData)
      
  //     // 发送长度和数据
  //     const lengthBuffer = Buffer.allocUnsafe(4)
  //     lengthBuffer.writeUInt32BE(requestBuffer.length, 0)
      
  //     stream.sink(async function* () {
  //       yield lengthBuffer
  //       yield requestBuffer
  //     }())

  //     // 接收响应
  //     return new Promise((resolve, reject) => {
  //       let responseData = []
  //       let expectedLength = null
  //       let receivedLength = 0

  //       const processData = async () => {
  //         try {
  //           for await (const chunk of stream.source) {
  //             responseData.push(chunk)
  //             receivedLength += chunk.length

  //             // 如果还没有读取长度信息
  //             if (expectedLength === null && receivedLength >= 4) {
  //               const allData = Buffer.concat(responseData)
  //               expectedLength = allData.readUInt32BE(0)
  //               responseData = [allData.slice(4)]
  //               receivedLength -= 4
  //             }

  //             // 如果已经接收到完整数据
  //             if (expectedLength !== null && receivedLength >= expectedLength) {
  //               const responseBuffer = Buffer.concat(responseData).slice(0, expectedLength)
  //               const response = JSON.parse(responseBuffer.toString())
                
  //               if (response.success) {
  //                 resolve({
  //                   index: chunkIndex,
  //                   data: Buffer.from(response.data, 'base64'),
  //                   hash: response.hash
  //                 })
  //               } else {
  //                 reject(new Error(response.error))
  //               }
  //               break
  //             }
  //           }
  //         } catch (error) {
  //           reject(error)
  //         }
  //       }

  //       processData()

  //       // 设置超时
  //       setTimeout(() => {
  //         reject(new Error('Chunk request timeout'))
  //       }, 30000) // 30秒超时
  //     })
  //   } catch (error) {
  //     console.error('Error requesting chunk:', error)
  //     throw error
  //   }
  // }
  async requestChunk(peerId, fileHash, chunkIndex) {
  try {
    console.log(`Requesting chunk ${chunkIndex} for file ${fileHash} from peer ${peerId}`)
    
    // Ensure node is started
    if (!this.p2pNode.node) {
      throw new Error('P2P node not initialized')
    }

    console.log(`Dialing protocol ${PROTOCOL_ID} to peer ${peerId}`)
    const stream = await this.p2pNode.node.dialProtocol(peerId, PROTOCOL_ID)
    
    const request = {
      type: 'CHUNK_REQUEST',
      fileHash,
      chunkIndex
    }

    console.log(`Sending chunk request:`, request)

    // Send request
    const requestData = JSON.stringify(request)
    const requestBuffer = Buffer.from(requestData)
    
    // Send length and data
    const lengthBuffer = Buffer.allocUnsafe(4)
    lengthBuffer.writeUInt32BE(requestBuffer.length, 0)
    
    await stream.sink(async function* () {
      yield lengthBuffer
      yield requestBuffer
    }())

    console.log(`Request sent, waiting for response...`)

    // Receive response
    return new Promise((resolve, reject) => {
      let responseData = []
      let expectedLength = null
      let receivedLength = 0
      let timeoutId

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }

      const processData = async () => {
        try {
          for await (const chunk of stream.source) {
            responseData.push(chunk)
            receivedLength += chunk.length

            // If we haven't read length info yet
            if (expectedLength === null && receivedLength >= 4) {
              const allData = Buffer.concat(responseData)
              expectedLength = allData.readUInt32BE(0)
              responseData = [allData.slice(4)]
              receivedLength -= 4
              console.log(`Expected response length: ${expectedLength} bytes`)
            }

            // If we have received complete data
            if (expectedLength !== null && receivedLength >= expectedLength) {
              cleanup()
              const responseBuffer = Buffer.concat(responseData).slice(0, expectedLength)
              const response = JSON.parse(responseBuffer.toString())
              
              console.log(`Received response for chunk ${chunkIndex}:`, {
                success: response.success,
                hasData: !!response.data,
                error: response.error
              })
              
              if (response.success) {
                resolve({
                  index: chunkIndex,
                  data: Buffer.from(response.data, 'base64'),
                  hash: response.hash
                })
              } else {
                reject(new Error(response.error))
              }
              break
            }
          }
        } catch (error) {
          cleanup()
          reject(error)
        }
      }

      processData()

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error(`Chunk request timeout for chunk ${chunkIndex}`))
      }, 30000) // 30 second timeout
    })
  } catch (error) {
    console.error(`Error requesting chunk ${chunkIndex}:`, error.message)
    throw error
  }
}

  // 处理传入的文件请求
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
      // 发送错误响应
      const errorResponse = {
        success: false,
        error: error.message
      }
      await this.sendResponse(stream, errorResponse)
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
          await this.sendResponse(stream, errorResponse)
          return
        }

        const chunk = fileInfo.chunks[chunkIndex]
        if (!chunk) {
          const errorResponse = {
            success: false,
            error: 'Chunk not found'
          }
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
      const errorResponse = {
        success: false,
        error: error.message
      }
      await this.sendResponse(stream, errorResponse)
    }
  }

  // 发送响应
  async sendResponse(stream, response) {
    const responseData = JSON.stringify(response)
    const responseBuffer = Buffer.from(responseData)
    
    // 发送长度和数据
    const lengthBuffer = Buffer.allocUnsafe(4)
    lengthBuffer.writeUInt32BE(responseBuffer.length, 0)
    
    stream.sink(async function* () {
      yield lengthBuffer
      yield responseBuffer
    }())
  }

  // 验证块
  verifyChunk(chunk) {
    const calculatedHash = createHash('sha256').update(chunk.data).digest('hex')
    return calculatedHash === chunk.hash
  }

  // 组装文件
  // async assembleFile(transfer) {
  //   const { downloadPath, chunks, totalChunks } = transfer
    
  //   // 按索引排序块
  //   const sortedChunks = Array.from(chunks.entries())
  //     .sort(([a], [b]) => a - b)
  //     .map(([, chunk]) => chunk)

  //   if (sortedChunks.length !== totalChunks) {
  //     throw new Error('Missing chunks, cannot assemble file')
  //   }

  //   // 写入文件
  //   const fileBuffer = Buffer.concat(sortedChunks.map(chunk => chunk.data))
  //   await fs.writeFile(downloadPath, fileBuffer)
  // }
async assembleFile(transfer) {
  const { downloadPath, chunks, totalChunks } = transfer
  
  console.log(`Assembling file: ${transfer.fileName}`)
  console.log(`Total chunks to assemble: ${totalChunks}`)
  
  // Sort chunks by index
  const sortedChunks = Array.from(chunks.entries())
    .sort(([a], [b]) => a - b)
    .map(([, chunk]) => chunk)

  if (sortedChunks.length !== totalChunks) {
    throw new Error(`Missing chunks, cannot assemble file. Expected: ${totalChunks}, Got: ${sortedChunks.length}`)
  }

  console.log(`All chunks present, writing to file: ${downloadPath}`)

  // Write file
  const fileBuffer = Buffer.concat(sortedChunks.map(chunk => chunk.data))
  await fs.writeFile(downloadPath, fileBuffer)
  
  console.log(`File assembly completed: ${downloadPath}`)
  console.log(`Final file size: ${fileBuffer.length} bytes`)
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