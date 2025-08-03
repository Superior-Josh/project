import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

const DEFAULT_CHUNK_SIZE = 256 * 1024 // 256KB
const MAX_CONCURRENT_CHUNKS = 5 // Simultaneous chunk downloads
const RETRY_ATTEMPTS = 3 // Number of retries

export class ChunkManager {
  constructor(fileManager, databaseManager) {
    this.fileManager = fileManager
    this.db = databaseManager
    this.activeDownloads = new Map() // Active download tasks
    this.chunkCache = new Map() // Chunk cache
    this.downloadQueue = new Map() // Download queue
    this.speedCalculator = new Map() // Speed calculation data
  }

  // Create file chunk information
  async createChunkInfo(filePath, chunkSize = DEFAULT_CHUNK_SIZE) {
    try {
      const fileStats = await fs.stat(filePath)
      const fileSize = fileStats.size
      const totalChunks = Math.ceil(fileSize / chunkSize)
      
      const chunks = []
      const file = await fs.open(filePath, 'r')
      
      try {
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize
          const end = Math.min(start + chunkSize, fileSize)
          const actualSize = end - start
          
          const buffer = Buffer.alloc(actualSize)
          await file.read(buffer, 0, actualSize, start)
          
          const hash = createHash('sha256').update(buffer).digest('hex')
          
          chunks.push({
            index: i,
            start,
            end,
            size: actualSize,
            hash
          })
        }
      } finally {
        await file.close()
      }

      const chunkInfo = {
        filePath,
        fileName: path.basename(filePath),
        fileSize,
        totalChunks,
        chunkSize,
        chunks,
        createdAt: Date.now()
      }

      return chunkInfo
    } catch (error) {
      console.error('Error creating chunk info:', error)
      throw error
    }
  }

  // Start chunked download
  async startChunkedDownload(fileHash, fileName, providers) {
    try {
      console.log(`Starting chunked download: ${fileName}`)
      
      const fileInfo = await this.db.getFileInfo(fileHash)
      if (!fileInfo) {
        throw new Error('File metadata not found')
      }

      const downloadId = `${fileHash}-${Date.now()}`
      const downloadPath = path.join(this.fileManager.downloadDir, fileName)
      const tempDir = path.join(this.fileManager.downloadDir, 'temp', downloadId)
      
      await fs.mkdir(tempDir, { recursive: true })

      const download = {
        id: downloadId,
        fileHash,
        fileName,
        fileSize: fileInfo.size || 0,
        downloadPath,
        tempDir,
        totalChunks: fileInfo.chunks || 1,
        completedChunks: new Set(),
        failedChunks: new Set(),
        providers: providers || [],
        startTime: Date.now(),
        status: 'downloading',
        progress: 0,
        speed: 0,
        averageSpeed: 0,
        currentSpeed: 0,
        downloadedBytes: 0,
        estimatedTime: 0,
        chunkSize: fileInfo.chunkSize || DEFAULT_CHUNK_SIZE
      }

      this.activeDownloads.set(downloadId, download)
      
      this.speedCalculator.set(downloadId, {
        samples: [],
        lastUpdate: Date.now(),
        lastBytes: 0
      })
      
      await this.downloadChunksInParallel(download)
      
      return downloadId
    } catch (error) {
      console.error('Error starting chunked download:', error)
      throw error
    }
  }

  // Download chunks in parallel
  async downloadChunksInParallel(download) {
    const { totalChunks, providers } = download
    const downloadPromises = []
    
    const chunkQueue = Array.from({ length: totalChunks }, (_, i) => i)
    
    for (let i = 0; i < Math.min(MAX_CONCURRENT_CHUNKS, providers.length); i++) {
      downloadPromises.push(this.chunkDownloadWorker(download, chunkQueue, providers))
    }

    try {
      await Promise.all(downloadPromises)
      
      await this.assembleChunkedFile(download)
      await this.cleanupTempFiles(download.tempDir)
      
      download.status = 'completed'
      download.progress = 100
      
      console.log(`Download completed: ${download.fileName}`)
    } catch (error) {
      download.status = 'failed'
      download.error = error.message
      console.error('Chunked download failed:', error)
      throw error
    } finally {
      this.activeDownloads.delete(download.id)
      this.speedCalculator.delete(download.id)
    }
  }

  // Chunk download worker
  async chunkDownloadWorker(download, chunkQueue, providers) {
    while (chunkQueue.length > 0) {
      const chunkIndex = chunkQueue.shift()
      if (chunkIndex === undefined) break

      let downloadSuccess = false
      let attempts = 0

      while (!downloadSuccess && attempts < RETRY_ATTEMPTS) {
        attempts++
        
        const provider = providers[chunkIndex % providers.length]
        
        try {
          await this.downloadSingleChunk(download, chunkIndex, provider)
          downloadSuccess = true
          download.completedChunks.add(chunkIndex)
          
          this.updateDownloadProgress(download)
          
        } catch (error) {
          console.error(`Failed to download chunk ${chunkIndex} (attempt ${attempts}):`, error)
          
          if (attempts >= RETRY_ATTEMPTS) {
            download.failedChunks.add(chunkIndex)
            throw new Error(`Failed to download chunk ${chunkIndex} after ${RETRY_ATTEMPTS} attempts`)
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
        }
      }
    }
  }

  // Download single chunk
  async downloadSingleChunk(download, chunkIndex, provider) {
    const chunkPath = path.join(download.tempDir, `chunk_${chunkIndex}`)
    
    try {
      await fs.access(chunkPath)
      return // Chunk already exists
    } catch {
      // Chunk doesn't exist, need to download
    }

    const chunk = await this.fileManager.requestChunk(
      provider.peerId, 
      download.fileHash, 
      chunkIndex
    )

    if (!chunk) {
      throw new Error(`Failed to receive chunk ${chunkIndex}`)
    }

    const isValid = this.fileManager.verifyChunk(chunk)
    if (!isValid) {
      throw new Error(`Invalid chunk ${chunkIndex}`)
    }

    await fs.writeFile(chunkPath, chunk.data)
    download.downloadedBytes += chunk.data.length
  }

  // Assemble chunked file
  async assembleChunkedFile(download) {
    const { tempDir, downloadPath, totalChunks } = download
    
    console.log(`Assembling file: ${download.fileName}`)
    
    const outputFile = await fs.open(downloadPath, 'w')
    
    try {
      for (let i = 0; i < totalChunks; i++) {
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

    console.log(`File assembled successfully: ${downloadPath}`)
  }

  // Update download progress
  updateDownloadProgress(download) {
    const completedCount = download.completedChunks.size
    const totalCount = download.totalChunks
    const progress = (completedCount / totalCount) * 100
    
    download.progress = Math.round(progress * 100) / 100
    
    const speedData = this.speedCalculator.get(download.id)
    if (speedData) {
      const now = Date.now()
      const timeDiff = (now - speedData.lastUpdate) / 1000
      
      if (timeDiff >= 1) {
        const bytesDiff = download.downloadedBytes - speedData.lastBytes
        const currentSpeed = bytesDiff / timeDiff
        
        speedData.samples.push(currentSpeed)
        if (speedData.samples.length > 10) {
          speedData.samples.shift()
        }
        
        const averageSpeed = speedData.samples.reduce((a, b) => a + b, 0) / speedData.samples.length
        
        download.currentSpeed = currentSpeed
        download.averageSpeed = averageSpeed
        
        const remainingBytes = download.fileSize - download.downloadedBytes
        if (averageSpeed > 0 && remainingBytes > 0) {
          download.estimatedTime = Math.round(remainingBytes / averageSpeed)
        }
        
        speedData.lastUpdate = now
        speedData.lastBytes = download.downloadedBytes
      }
    }
  }

  // Cleanup temporary files
  async cleanupTempFiles(tempDir) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
      console.log(`Cleaned up temp directory: ${tempDir}`)
    } catch (error) {
      console.error('Error cleaning up temp files:', error)
    }
  }

  // Pause download
  async pauseDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId)
    if (download) {
      download.status = 'paused'
      console.log(`Download paused: ${download.fileName}`)
    }
  }

  // Resume download
  async resumeDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId)
    if (download && download.status === 'paused') {
      download.status = 'downloading'
      await this.downloadChunksInParallel(download)
    }
  }

  // Cancel download
  async cancelDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId)
    if (download) {
      download.status = 'cancelled'
      
      await this.cleanupTempFiles(download.tempDir)
      
      this.activeDownloads.delete(downloadId)
      this.speedCalculator.delete(downloadId)
      console.log(`Download cancelled: ${download.fileName}`)
    }
  }

  // Get download status
  getDownloadStatus(downloadId) {
    return this.activeDownloads.get(downloadId)
  }

  // Get all active downloads
  getAllActiveDownloads() {
    return Array.from(this.activeDownloads.values()).map(download => ({
      id: download.id,
      fileName: download.fileName,
      fileHash: download.fileHash,
      fileSize: download.fileSize,
      progress: download.progress,
      status: download.status,
      currentSpeed: download.currentSpeed || 0,
      averageSpeed: download.averageSpeed || 0,
      downloadedBytes: download.downloadedBytes || 0,
      totalChunks: download.totalChunks,
      completedChunks: download.completedChunks.size,
      failedChunks: download.failedChunks.size,
      estimatedTime: download.estimatedTime || 0,
      elapsedTime: Math.floor((Date.now() - download.startTime) / 1000),
      providers: download.providers.length
    }))
  }

  // Optimize chunk allocation strategy
  optimizeChunkAllocation(providers, totalChunks) {
    const allocation = new Map()
    
    providers.forEach((provider, index) => {
      const chunksToAssign = []
      
      for (let i = index; i < totalChunks; i += providers.length) {
        chunksToAssign.push(i)
      }
      
      allocation.set(provider.peerId, chunksToAssign)
    })
    
    return allocation
  }

  // Handle chunk deduplication
  async deduplicateChunks(chunks) {
    const uniqueChunks = new Map()
    const duplicateMap = new Map()
    
    for (const chunk of chunks) {
      if (uniqueChunks.has(chunk.hash)) {
        const originalIndex = uniqueChunks.get(chunk.hash)
        duplicateMap.set(chunk.index, originalIndex)
      } else {
        uniqueChunks.set(chunk.hash, chunk.index)
      }
    }
    
    return {
      uniqueChunks: uniqueChunks.size,
      totalChunks: chunks.length,
      duplicateMap,
      compressionRatio: (chunks.length - uniqueChunks.size) / chunks.length
    }
  }
}