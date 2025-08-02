// main.js

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// 在 ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入P2P相关模块
let P2PNode, DHTManager, ConnectionDebugger, FileManager, DatabaseManager, ChunkManager
let p2pNode = null
let dhtManager = null
let connectionDebugger = null
let fileManager = null
let databaseManager = null
let chunkManager = null
let mainWindow = null // 保存主窗口引用

async function createWindow() {
  // 获取进程ID用于区分不同实例
  const processId = process.pid
  const nodeId = Math.random().toString(36).substr(2, 6) // 生成短随机ID
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: `P2P File Sharing - Node ${nodeId} (PID: ${processId})`, // 在标题中显示信息
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // 当页面加载完成后也更新标题
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.setTitle(`P2P File Sharing - Node ${nodeId} (PID: ${processId})`)
    
    // 页面加载完成后自动启动P2P节点
    setTimeout(async () => {
      try {
        await autoStartP2PNode(mainWindow)
      } catch (error) {
        console.error('Auto-start P2P node failed:', error)
      }
    }, 1000) // 延迟1秒确保页面完全加载
  })

  await mainWindow.loadFile('renderer/index.html')
  
  // 开发时打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  return mainWindow
}

// 自动启动P2P节点
async function autoStartP2PNode(window) {
  try {
    console.log('Auto-starting P2P node...')
    
    if (!p2pNode) {
      p2pNode = new P2PNode()
      dhtManager = new DHTManager(p2pNode)
      
      // 初始化数据库管理器
      databaseManager = new DatabaseManager('./data')
      await databaseManager.initialize()
      
      // 初始化文件管理器
      fileManager = new FileManager(p2pNode, dhtManager, './downloads')
      
      // 初始化分块管理器
      chunkManager = new ChunkManager(fileManager, databaseManager)
      
      // 初始化调试器
      if (process.env.NODE_ENV === 'development' && ConnectionDebugger) {
        connectionDebugger = new ConnectionDebugger(p2pNode)
      }
    }
    
    await p2pNode.start()
    await dhtManager.initialize()
    
    // 启用调试日志（仅在开发模式）
    if (connectionDebugger) {
      connectionDebugger.enableVerboseLogging()
      await connectionDebugger.testLocalConnectivity()
    }
    
    const nodeInfo = p2pNode.getNodeInfo()
    
    // 更新窗口标题，包含peer ID的前8位
    if (nodeInfo && window) {
      const shortPeerId = nodeInfo.peerId.slice(-8)
      const processId = process.pid
      window.setTitle(`P2P File Sharing - ${shortPeerId} (PID: ${processId})`)
    }
    
    // 通知渲染进程节点已启动
    if (window) {
      window.webContents.send('p2p-node-started', {
        success: true,
        nodeInfo
      })
    }
    
    console.log('P2P node auto-started successfully')
  } catch (error) {
    console.error('Failed to auto-start P2P node:', error)
    
    // 通知渲染进程启动失败
    if (window) {
      window.webContents.send('p2p-node-started', {
        success: false,
        error: error.message
      })
    }
  }
}

app.whenReady().then(async () => {
  // 动态导入ES模块
  try {
    const p2pModule = await import('./src/p2p-node.js')
    const dhtModule = await import('./src/dht-manager.js')
    const fileModule = await import('./src/file-manager.js')
    const dbModule = await import('./src/database.js')
    const chunkModule = await import('./src/chunk-manager.js')
    
    P2PNode = p2pModule.P2PNode
    DHTManager = dhtModule.DHTManager
    FileManager = fileModule.FileManager
    DatabaseManager = dbModule.DatabaseManager
    ChunkManager = chunkModule.ChunkManager
    
    // 导入调试器（仅在开发模式）
    if (process.env.NODE_ENV === 'development') {
      try {
        const debugModule = await import('./src/debug-connection.js')
        ConnectionDebugger = debugModule.ConnectionDebugger
      } catch (error) {
        console.log('Debug module not available:', error.message)
      }
    }
    
    console.log('P2P modules loaded successfully')
  } catch (error) {
    console.error('Error loading P2P modules:', error)
  }

  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  // 停止P2P节点
  if (p2pNode) {
    try {
      await p2pNode.stop()
      console.log('P2P node stopped on app quit')
    } catch (error) {
      console.error('Error stopping P2P node:', error)
    }
  }
  
  // 保存数据库
  if (databaseManager) {
    try {
      await databaseManager.saveAllData()
      console.log('Database saved on app quit')
    } catch (error) {
      console.error('Error saving database:', error)
    }
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 通知所有窗口状态变化
function notifyNodeStatusChange(success, nodeInfo = null, error = null) {
  const allWindows = BrowserWindow.getAllWindows()
  allWindows.forEach(window => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('p2p-node-status-changed', {
        success,
        nodeInfo,
        error
      })
    }
  })
}

// IPC处理程序
ipcMain.handle('start-p2p-node', async () => {
  try {
    // 如果节点已经启动，直接返回成功
    if (p2pNode && p2pNode.isStarted) {
      const nodeInfo = p2pNode.getNodeInfo()
      return {
        success: true,
        nodeInfo,
        message: 'Node is already running'
      }
    }

    if (!p2pNode) {
      p2pNode = new P2PNode()
      dhtManager = new DHTManager(p2pNode)
      
      // 初始化数据库管理器
      databaseManager = new DatabaseManager('./data')
      await databaseManager.initialize()
      
      // 初始化文件管理器
      fileManager = new FileManager(p2pNode, dhtManager, './downloads')
      
      // 初始化分块管理器
      chunkManager = new ChunkManager(fileManager, databaseManager)
      
      // 初始化调试器
      if (process.env.NODE_ENV === 'development' && ConnectionDebugger) {
        connectionDebugger = new ConnectionDebugger(p2pNode)
      }
    }
    
    await p2pNode.start()
    await dhtManager.initialize()
    
    // 启用调试日志（仅在开发模式）
    if (connectionDebugger) {
      connectionDebugger.enableVerboseLogging()
      await connectionDebugger.testLocalConnectivity()
    }
    
    const nodeInfo = p2pNode.getNodeInfo()
    
    // 更新窗口标题，包含peer ID的前8位
    const currentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (currentWindow && nodeInfo) {
      const shortPeerId = nodeInfo.peerId.slice(-8)
      const processId = process.pid
      currentWindow.setTitle(`P2P File Sharing - ${shortPeerId} (PID: ${processId})`)
    }
    
    // 通知状态变化
    notifyNodeStatusChange(true, nodeInfo)
    
    return {
      success: true,
      nodeInfo
    }
  } catch (error) {
    console.error('Error starting P2P node:', error)
    
    // 通知状态变化
    notifyNodeStatusChange(false, null, error.message)
    
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('stop-p2p-node', async () => {
  try {
    if (p2pNode) {
      await p2pNode.stop()
      p2pNode = null
      dhtManager = null
      fileManager = null
      chunkManager = null
      connectionDebugger = null
    }
    
    // 保存数据库
    if (databaseManager) {
      await databaseManager.saveAllData()
    }
    
    // 重置窗口标题
    const currentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (currentWindow) {
      const processId = process.pid
      const nodeId = Math.random().toString(36).substr(2, 6)
      currentWindow.setTitle(`P2P File Sharing - Node ${nodeId} (PID: ${processId}) - STOPPED`)
    }
    
    // 通知状态变化
    notifyNodeStatusChange(true, null, null)
    
    return { success: true }
  } catch (error) {
    console.error('Error stopping P2P node:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('get-node-info', async () => {
  if (!p2pNode) {
    return null
  }
  
  const nodeInfo = p2pNode.getNodeInfo()
  if (nodeInfo) {
    // 添加发现的节点ID列表
    const discoveredPeerIds = p2pNode.getDiscoveredPeers()
    nodeInfo.discoveredPeerIds = discoveredPeerIds
  }
  
  return nodeInfo
})

ipcMain.handle('connect-to-peer', async (event, multiaddr) => {
  try {
    if (!p2pNode) {
      throw new Error('P2P node not started')
    }
    
    // 使用调试器诊断连接（如果可用）
    if (connectionDebugger && process.env.NODE_ENV === 'development') {
      console.log('🔧 Running connection diagnosis...')
      await connectionDebugger.diagnoseConnection(multiaddr)
    }
    
    await p2pNode.connectToPeer(multiaddr)
    return { success: true }
  } catch (error) {
    console.error('Error connecting to peer:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('get-dht-stats', async () => {
  if (!dhtManager) {
    return null
  }
  return await dhtManager.getDHTStats()
})

ipcMain.handle('publish-file', async (event, fileHash, fileMetadata) => {
  try {
    if (!dhtManager) {
      throw new Error('DHT manager not initialized')
    }
    
    const cid = await dhtManager.publishFile(fileHash, fileMetadata)
    await dhtManager.provideFile(fileHash)
    
    // 保存文件信息到数据库
    if (databaseManager) {
      await databaseManager.saveFileInfo(fileHash, {
        ...fileMetadata,
        cid: cid.toString(),
        provider: p2pNode.node.peerId.toString()
      })
    }
    
    return {
      success: true,
      cid: cid.toString()
    }
  } catch (error) {
    console.error('Error publishing file:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('find-file', async (event, fileHash) => {
  try {
    if (!dhtManager) {
      throw new Error('DHT manager not initialized')
    }
    
    const fileInfo = await dhtManager.findFile(fileHash)
    return {
      success: true,
      fileInfo
    }
  } catch (error) {
    console.error('Error finding file:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('search-files', async (event, query) => {
  try {
    if (!dhtManager || !databaseManager) {
      throw new Error('DHT manager or Database not initialized')
    }
    
    // 首先搜索本地数据库
    const localResults = await databaseManager.searchFiles(query)
    
    // 然后搜索DHT
    const dhtResults = await dhtManager.searchFiles(query)
    
    // 合并结果并去重
    const allResults = [...localResults, ...dhtResults]
    const uniqueResults = Array.from(
      new Map(allResults.map(item => [item.hash, item])).values()
    )
    
    return {
      success: true,
      results: uniqueResults
    }
  } catch (error) {
    console.error('Error searching files:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('get-local-files', async () => {
  if (!dhtManager) {
    return []
  }
  
  // 从DHT获取本地文件列表
  const dhtFiles = dhtManager.getLocalFiles()
  
  // 如果有数据库，也从数据库获取
  if (databaseManager) {
    const dbFiles = await databaseManager.getAllFiles()
    
    // 合并并去重
    const allFiles = [...dhtFiles, ...dbFiles]
    const uniqueFiles = Array.from(
      new Map(allFiles.map(file => [file.hash, file])).values()
    )
    
    return uniqueFiles
  }
  
  return dhtFiles
})

ipcMain.handle('get-discovered-peers', async () => {
  try {
    if (!p2pNode) {
      return {
        success: false,
        error: 'P2P node not started'
      }
    }
    
    const discoveredPeers = p2pNode.getDiscoveredPeers()
    return {
      success: true,
      peers: discoveredPeers
    }
  } catch (error) {
    console.error('Error getting discovered peers:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('connect-to-discovered-peer', async (event, peerId) => {
  try {
    if (!p2pNode) {
      throw new Error('P2P node not started')
    }
    
    await p2pNode.connectToDiscoveredPeer(peerId)
    return { success: true }
  } catch (error) {
    console.error('Error connecting to discovered peer:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 文件操作相关的IPC处理器
ipcMain.handle('select-files', async () => {
  try {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Documents', extensions: ['pdf', 'txt', 'doc', 'docx'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] },
        { name: 'Videos', extensions: ['mp4', 'avi', 'mkv'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac'] }
      ]
    })
    
    return {
      success: true,
      cancelled: result.canceled,
      filePaths: result.filePaths
    }
  } catch (error) {
    console.error('Error selecting files:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 实际的文件分享实现
ipcMain.handle('share-file', async (event, filePath) => {
  try {
    if (!fileManager) {
      throw new Error('File manager not initialized')
    }
    
    console.log(`Sharing file: ${filePath}`)
    
    // 使用文件管理器分享文件
    const result = await fileManager.shareFile(filePath)
    
    if (result.success) {
      // 保存到数据库
      if (databaseManager) {
        await databaseManager.saveFileInfo(result.fileHash, {
          ...result.metadata,
          sharedAt: Date.now(),
          localPath: filePath
        })
      }
      
      return {
        success: true,
        message: 'File shared successfully',
        fileHash: result.fileHash,
        metadata: result.metadata
      }
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('Error sharing file:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 实际的文件下载实现
ipcMain.handle('download-file', async (event, fileHash, fileName) => {
  try {
    if (!fileManager) {
      throw new Error('File manager not initialized')
    }
    
    if (!dhtManager) {
      throw new Error('DHT manager not initialized')
    }
    
    console.log(`Starting download: ${fileName} (${fileHash})`)
    
    // 先尝试查找文件信息
    const fileInfo = await dhtManager.findFile(fileHash)
    if (!fileInfo) {
      throw new Error('File not found in DHT network')
    }
    
    // 查找文件提供者
    const providers = await dhtManager.findProviders(fileHash)
    
    if (providers.length === 0) {
      throw new Error('No providers found for this file')
    }
    
    console.log(`Found ${providers.length} providers for file ${fileHash}`)
    
    let downloadId
    
    // 检查是否需要分块下载
    if (fileInfo && fileInfo.chunks && fileInfo.chunks > 1 && chunkManager) {
      // 使用分块下载
      console.log(`Starting chunked download for ${fileName} (${fileInfo.chunks} chunks)`)
      downloadId = await chunkManager.startChunkedDownload(fileHash, fileName, providers)
    } else {
      // 使用简单下载
      console.log(`Starting simple download for ${fileName}`)
      const result = await fileManager.downloadFile(fileHash, fileName)
      
      if (result.success) {
        // 保存到数据库
        if (databaseManager) {
          await databaseManager.saveFileInfo(fileHash, {
            name: fileName,
            hash: fileHash,
            downloadedAt: Date.now(),
            localPath: result.filePath
          })
          
          // 记录传输
          await databaseManager.saveTransferRecord(`download-${fileHash}-${Date.now()}`, {
            type: 'download',
            fileHash,
            fileName,
            status: 'completed',
            completedAt: Date.now()
          })
        }
        
        return {
          success: true,
          message: 'Download completed',
          filePath: result.filePath
        }
      } else {
        throw new Error(result.error)
      }
    }
    
    return {
      success: true,
      message: 'Download started',
      downloadId
    }
  } catch (error) {
    console.error('Error downloading file:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 下载管理相关的IPC处理器
ipcMain.handle('get-download-status', async (event, downloadId) => {
  try {
    if (!chunkManager) {
      return {
        success: false,
        error: 'Chunk manager not initialized'
      }
    }
    
    const status = chunkManager.getDownloadStatus(downloadId)
    
    return {
      success: true,
      status
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('get-active-downloads', async () => {
  try {
    const downloads = []
    
    // 从文件管理器获取简单下载
    if (fileManager) {
      const transfers = fileManager.getActiveTransfers()
      downloads.push(...transfers.map(transfer => ({
        ...transfer,
        type: 'simple',
        status: 'downloading'
      })))
    }
    
    // 从分块管理器获取分块下载
    if (chunkManager) {
      const chunkedDownloads = chunkManager.getAllActiveDownloads()
      downloads.push(...chunkedDownloads.map(download => ({
        ...download,
        type: 'chunked',
        fileHash: download.fileHash,
        fileName: download.fileName,
        progress: download.progress,
        status: download.status,
        downloadedChunks: download.completedChunks.size,
        totalChunks: download.totalChunks,
        estimatedTime: download.estimatedTime
      })))
    }
    
    return downloads
  } catch (error) {
    console.error('Error getting active downloads:', error)
    return []
  }
})

ipcMain.handle('pause-download', async (event, downloadId) => {
  try {
    if (!chunkManager) {
      return {
        success: false,
        error: 'Chunk manager not initialized'
      }
    }
    
    await chunkManager.pauseDownload(downloadId)
    
    return {
      success: true,
      message: 'Download paused'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('resume-download', async (event, downloadId) => {
  try {
    if (!chunkManager) {
      return {
        success: false,
        error: 'Chunk manager not initialized'
      }
    }
    
    await chunkManager.resumeDownload(downloadId)
    
    return {
      success: true,
      message: 'Download resumed'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('cancel-download', async (event, downloadId) => {
  try {
    if (!chunkManager) {
      return {
        success: false,
        error: 'Chunk manager not initialized'
      }
    }
    
    await chunkManager.cancelDownload(downloadId)
    
    return {
      success: true,
      message: 'Download cancelled'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

// 文件验证相关的IPC处理器
ipcMain.handle('validate-file', async (event, filePath, expectedHashes) => {
  try {
    const { FileValidator } = await import('./src/file-validator.js')
    const validator = new FileValidator()
    
    const validation = await validator.validateFile(filePath, expectedHashes)
    
    return {
      success: true,
      isValid: validation.isValid,
      validatedHashes: validation.validatedHashes,
      errors: validation.errors
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

// 数据库相关的IPC处理器
ipcMain.handle('get-database-stats', async () => {
  try {
    if (!databaseManager) {
      return null
    }
    
    return databaseManager.getStats()
  } catch (error) {
    console.error('Error getting database stats:', error)
    return null
  }
})

ipcMain.handle('cleanup-database', async () => {
  try {
    if (!databaseManager) {
      throw new Error('Database manager not initialized')
    }
    
    await databaseManager.cleanupOldRecords()
    await databaseManager.saveAllData()
    
    return {
      success: true,
      message: 'Database cleanup completed'
    }
  } catch (error) {
    console.error('Error cleaning up database:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('export-data', async () => {
  try {
    if (!databaseManager) {
      throw new Error('Database manager not initialized')
    }
    
    const { dialog } = await import('electron')
    const result = await dialog.showSaveDialog({
      defaultPath: `p2p-data-export-${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (!result.canceled) {
      const exportData = await databaseManager.exportData()
      const fs = await import('fs/promises')
      await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2))
      
      return {
        success: true,
        cancelled: false,
        filePath: result.filePath
      }
    } else {
      return {
        success: true,
        cancelled: true
      }
    }
  } catch (error) {
    console.error('Error exporting data:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('import-data', async () => {
  try {
    if (!databaseManager) {
      throw new Error('Database manager not initialized')
    }
    
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      const fs = await import('fs/promises')
      const data = await fs.readFile(result.filePaths[0], 'utf8')
      const importData = JSON.parse(data)
      
      await databaseManager.importData(importData)
      
      return {
        success: true,
        cancelled: false,
        filePath: result.filePaths[0]
      }
    } else {
      return {
        success: true,
        cancelled: true
      }
    }
  } catch (error) {
    console.error('Error importing data:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 调试相关的IPC处理器（仅在开发模式）
if (process.env.NODE_ENV === 'development') {
  ipcMain.handle('debug-connection', async (event, multiaddr) => {
    try {
      if (!connectionDebugger) {
        return {
          success: false,
          error: 'Debugger not available'
        }
      }
      
      await connectionDebugger.diagnoseConnection(multiaddr)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  ipcMain.handle('get-debug-report', async () => {
    try {
      if (!connectionDebugger) {
        return {
          success: false,
          error: 'Debugger not available'
        }
      }
      
      const report = connectionDebugger.generateReport()
      return {
        success: true,
        report
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  })
}

// 获取节点状态
ipcMain.handle('get-node-status', async () => {
  return {
    isStarted: p2pNode ? p2pNode.isStarted : false,
    nodeInfo: p2pNode ? p2pNode.getNodeInfo() : null
  }
})

// 获取进程信息
ipcMain.handle('get-process-info', () => {
  return {
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV || 'production',
    platform: process.platform,
    arch: process.arch,
    version: process.version
  }
})