// main.js

import { app, BrowserWindow, ipcMain, Tray, Menu, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 核心模块
let P2PNode, DHTManager, FileManager, DatabaseManager, ChunkManager, SettingsManager
let p2pNode = null
let dhtManager = null
let fileManager = null
let databaseManager = null
let chunkManager = null
let settingsManager = null
let mainWindow = null
let settingsWindow = null
let tray = null
let currentSearchController = null

// 应用窗口创建
async function createWindow() {
  const processId = process.pid
  const nodeId = Math.random().toString(36).substr(2, 6)
  const startMinimized = settingsManager ? settingsManager.get('startMinimized', false) : false

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    title: `P2P File Sharing - Node ${nodeId} (PID: ${processId})`,
    show: !startMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.on('close', (event) => {
    const windowBehavior = settingsManager ? settingsManager.get('windowBehavior', 'close') : 'close'
    if (windowBehavior === 'hide') {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.setTitle(`P2P File Sharing - Node ${nodeId} (PID: ${processId})`)
    const autoStartNode = settingsManager ? settingsManager.get('autoStartNode', true) : true
    if (autoStartNode) {
      setTimeout(async () => {
        try {
          await autoStartP2PNode(mainWindow)
        } catch (error) {
          console.error('Auto-start P2P node failed:', error)
        }
      }, 1000)
    }
  })

  await mainWindow.loadFile('renderer/index.html')
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }
  return mainWindow
}

// 设置窗口创建
async function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Settings - P2P File Sharing',
    parent: mainWindow,
    modal: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  await settingsWindow.loadFile('renderer/settings.html')
  if (process.env.NODE_ENV === 'development') {
    settingsWindow.webContents.openDevTools()
  }
  return settingsWindow
}

// 系统托盘创建
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')

  try {
    tray = new Tray(iconPath)
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Application',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        label: 'NAT Status',
        click: () => {
          if (p2pNode) {
            const status = p2pNode.getNATTraversalStatus()
            console.log('NAT Traversal Status:', status)
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: async () => {
          await gracefulShutdown()
          app.quit()
        }
      }
    ])

    tray.setToolTip('P2P File Sharing')
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (error) {
    console.log('Failed to create system tray:', error.message)
  }
}

// 优雅关闭
async function gracefulShutdown() {
  console.log('Starting graceful shutdown...')

  if (p2pNode) {
    try {
      await p2pNode.stop()
      console.log('P2P node stopped on app quit')
    } catch (error) {
      console.error('Error stopping P2P node:', error)
    }
  }

  if (databaseManager) {
    try {
      await databaseManager.saveAllData()
      console.log('Database saved on app quit')
    } catch (error) {
      console.error('Error saving database:', error)
    }
  }

  if (settingsManager) {
    try {
      await settingsManager.saveSettings()
      console.log('Settings saved on app quit')
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  }

  console.log('Graceful shutdown completed')
}

// 自动启动P2P节点
async function autoStartP2PNode(window) {
  let startTimeout
  
  try {
    console.log('Auto-starting P2P node...')
    
    startTimeout = setTimeout(() => {
      console.error('Auto-start timeout - sending failure message')
      if (window && !window.isDestroyed()) {
        window.webContents.send('p2p-node-started', {
          success: false,
          error: 'Node start timeout after 30 seconds'
        })
      }
    }, 30000)

    if (!p2pNode) {
      console.log('Creating P2P node instance...')
      p2pNode = new P2PNode({
        enableHolePunching: false,
        enableUPnP: false,
        enableAutoRelay: false
      })

      console.log('Creating other managers...')
      dhtManager = new DHTManager(p2pNode)
      databaseManager = new DatabaseManager(path.join('./data'))
      
      console.log('Initializing database...')
      await databaseManager.initialize()
      
      fileManager = new FileManager(p2pNode, dhtManager, './downloads')
      chunkManager = new ChunkManager(fileManager, databaseManager)
    }

    console.log('Starting P2P node...')
    await p2pNode.start()
    
    console.log('Initializing DHT...')
    await dhtManager.initialize()

    clearTimeout(startTimeout)

    const nodeInfo = p2pNode.getNodeInfo()
    console.log('Auto-start completed successfully')

    if (window && !window.isDestroyed()) {
      const shortPeerId = nodeInfo.peerId.slice(-8)
      window.setTitle(`P2P - ${shortPeerId} (Started)`)
      
      window.webContents.send('p2p-node-started', {
        success: true,
        nodeInfo
      })
    }
    
  } catch (error) {
    clearTimeout(startTimeout)
    console.error('Failed to auto-start P2P node:', error)

    if (window && !window.isDestroyed()) {
      window.webContents.send('p2p-node-started', {
        success: false,
        error: error.message
      })
    }
  }
}

// 通知所有窗口状态变化
function notifyNodeStatusChange(success, nodeInfo = null, error = null) {
  const allWindows = BrowserWindow.getAllWindows()
  allWindows.forEach(window => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('p2p-node-status-changed', {
        success,
        nodeInfo,
        natStatus: p2pNode ? p2pNode.getNATTraversalStatus() : null,
        error
      })
    }
  })
}

// 应用初始化
app.whenReady().then(async () => {
  try {
    // 加载模块
    const modules = await Promise.all([
      import('./src/p2p-node.js'),
      import('./src/dht-manager.js'),
      import('./src/file-manager.js'),
      import('./src/database.js'),
      import('./src/chunk-manager.js'),
      import('./src/settings-manager.js')
    ])

    P2PNode = modules[0].P2PNode
    DHTManager = modules[1].DHTManager
    FileManager = modules[2].FileManager
    DatabaseManager = modules[3].DatabaseManager
    ChunkManager = modules[4].ChunkManager
    SettingsManager = modules[5].SettingsManager

    // 初始化设置管理器
    settingsManager = new SettingsManager('./settings')
    await settingsManager.initialize()

    console.log('P2P modules loaded successfully')

    await createWindow()
    createTray()

  } catch (error) {
    console.error('Error loading modules:', error)
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  const windowBehavior = settingsManager ? settingsManager.get('windowBehavior', 'close') : 'close'

  if (windowBehavior === 'hide' && tray) {
    return
  }

  await gracefulShutdown()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// =================
// IPC 处理器 - 简化版本
// =================

// P2P节点控制
ipcMain.handle('start-p2p-node', async () => {
  try {
    if (p2pNode && p2pNode.isStarted) {
      const nodeInfo = p2pNode.getNodeInfo()
      const natStatus = p2pNode.getNATTraversalStatus()
      return { success: true, nodeInfo, natStatus, message: 'node is already running' }
    }

    if (!p2pNode) {
      const natSettings = settingsManager ? settingsManager.getNATTraversalSettings() : {}
      
      p2pNode = new P2PNode({
        enableHolePunching: natSettings.holePunching?.enabled !== false,
        enableUPnP: natSettings.upnp?.enabled !== false,
        enableAutoRelay: natSettings.relay?.autoRelay !== false,
        customBootstrapNodes: natSettings.customNodes?.bootstrapNodes || [],
        customRelayNodes: natSettings.customNodes?.relayNodes || []
      })
      
      dhtManager = new DHTManager(p2pNode)
      databaseManager = new DatabaseManager('./data')
      await databaseManager.initialize()
      fileManager = new FileManager(p2pNode, dhtManager, './downloads')
      chunkManager = new ChunkManager(fileManager, databaseManager)
    }

    await p2pNode.start()
    await dhtManager.initialize()

    const nodeInfo = p2pNode.getNodeInfo()
    const natStatus = p2pNode.getNATTraversalStatus()

    const currentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (currentWindow && nodeInfo) {
      const shortPeerId = nodeInfo.peerId.slice(-8)
      const processId = process.pid
      const natInfo = natStatus.isPublicNode ? 'Public' : 
                      natStatus.reachability === 'private' ? 'NAT' : 'Unknown'
      currentWindow.setTitle(`P2P - ${shortPeerId} (${natInfo})`)
    }

    notifyNodeStatusChange(true, nodeInfo)
    return { success: true, nodeInfo, natStatus }
  } catch (error) {
    console.error('Error starting P2P node:', error)
    notifyNodeStatusChange(false, null, error.message)
    return { success: false, error: error.message }
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
    }

    if (databaseManager) {
      await databaseManager.saveAllData()
    }

    const currentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (currentWindow) {
      const processId = process.pid
      const nodeId = Math.random().toString(36).substr(2, 6)
      currentWindow.setTitle(`P2P - Node ${nodeId} (STOPPED)`)
    }

    notifyNodeStatusChange(true, null, null)
    return { success: true }
  } catch (error) {
    console.error('Error stopping P2P node:', error)
    return { success: false, error: error.message }
  }
})

// 节点信息获取
ipcMain.handle('get-node-info', async () => {
  if (!p2pNode) return null
  const nodeInfo = p2pNode.getNodeInfo()
  const natStatus = p2pNode.getNATTraversalStatus()
  return { ...nodeInfo, natTraversal: natStatus }
})

ipcMain.handle('get-nat-status', async () => {
  if (!p2pNode) return null
  return p2pNode.getNATTraversalStatus()
})

ipcMain.handle('force-nat-detection', async () => {
  if (!p2pNode) return { success: false, error: 'P2P node not started' }
  try {
    const reachability = await p2pNode.forceNATDetection()
    return { success: true, reachability, natStatus: p2pNode.getNATTraversalStatus() }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('refresh-relay-connections', async () => {
  if (!p2pNode) return { success: false, error: 'P2P node not started' }
  try {
    await p2pNode.refreshRelayConnections()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 连接管理
ipcMain.handle('connect-to-peer', async (event, multiaddr) => {
  try {
    if (!p2pNode) throw new Error('P2P node not started')
    await p2pNode.connectToPeer(multiaddr)
    return { success: true }
  } catch (error) {
    console.error('Error connecting to peer:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('connect-to-discovered-peer', async (event, peerId) => {
  try {
    if (!p2pNode) throw new Error('P2P node not started')
    await p2pNode.connectToDiscoveredPeer(peerId)
    return { success: true }
  } catch (error) {
    console.error('Error connecting to discovered peer:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-discovered-peers', async () => {
  try {
    if (!p2pNode) return { success: false, error: 'P2P node not started' }
    const discoveredPeers = p2pNode.getDiscoveredPeers()
    return { success: true, peers: discoveredPeers }
  } catch (error) {
    console.error('Error getting discovered peers:', error)
    return { success: false, error: error.message }
  }
})

// DHT操作
ipcMain.handle('get-dht-stats', async () => {
  if (!dhtManager) return null
  return await dhtManager.getDHTStats()
})

ipcMain.handle('publish-file', async (event, fileHash, fileMetadata) => {
  try {
    if (!dhtManager) throw new Error('DHT manager not initialized')

    const cid = await dhtManager.publishFile(fileHash, fileMetadata)
    await dhtManager.provideFile(fileHash)

    if (databaseManager) {
      await databaseManager.saveFileInfo(fileHash, {
        ...fileMetadata,
        cid: cid.toString(),
        provider: p2pNode.node.peerId.toString()
      })
    }

    return { success: true, cid: cid.toString() }
  } catch (error) {
    console.error('Error publishing file:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('find-file', async (event, fileHash) => {
  try {
    if (!dhtManager) throw new Error('DHT manager not initialized')
    const fileInfo = await dhtManager.findFile(fileHash)
    return { success: true, fileInfo }
  } catch (error) {
    console.error('Error finding file:', error)
    return { success: false, error: error.message }
  }
})

// 搜索文件
ipcMain.handle('search-files', async (event, query) => {
  try {
    const searchStartTime = Date.now()
    
    // 取消之前的搜索
    if (currentSearchController) {
      currentSearchController.abort()
    }
    currentSearchController = new AbortController()

    if (!dhtManager || !databaseManager) {
      throw new Error('DHT manager or Database not initialized')
    }

    // 并行搜索本地数据库和DHT
    const [localResults, dhtResults] = await Promise.allSettled([
      databaseManager.searchFiles(query),
      dhtManager.searchFiles(query, {
        timeout: 8000,
        maxResults: 15,
        signal: currentSearchController.signal
      })
    ])

    // 合并结果
    const allResults = []
    
    if (localResults.status === 'fulfilled') {
      allResults.push(...localResults.value.map(r => ({...r, source: 'local'})))
    }
    
    if (dhtResults.status === 'fulfilled') {
      dhtResults.value.forEach(dhtFile => {
        if (!allResults.find(f => f.hash === dhtFile.hash)) {
          allResults.push(dhtFile)
        }
      })
    }

    currentSearchController = null

    return {
      success: true,
      results: allResults,
      searchTime: Date.now() - searchStartTime,
      sources: {
        local: allResults.filter(r => r.source === 'local').length,
        network: allResults.filter(r => r.source === 'network').length
      }
    }
  } catch (error) {
    currentSearchController = null
    
    if (error.name === 'AbortError') {
      return { success: false, error: 'Search cancelled', cancelled: true }
    }
    
    console.error('Error searching files:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-local-files', async () => {
  if (!dhtManager) return []

  const dhtFiles = dhtManager.getLocalFiles()

  if (databaseManager) {
    const dbFiles = await databaseManager.getAllFiles()
    const allFiles = [...dhtFiles, ...dbFiles]
    const uniqueFiles = Array.from(
      new Map(allFiles.map(file => [file.hash, file])).values()
    )
    return uniqueFiles
  }

  return dhtFiles
})

// 文件操作
ipcMain.handle('select-files', async () => {
  try {
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
    return { success: false, error: error.message }
  }
})

ipcMain.handle('share-file', async (event, filePath) => {
  try {
    if (!fileManager) throw new Error('File manager not initialized')

    console.log(`Sharing file: ${filePath}`)
    const result = await fileManager.shareFile(filePath)

    if (result.success) {
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
    return { success: false, error: error.message }
  }
})

ipcMain.handle('download-file', async (event, fileHash, fileName) => {
  try {
    if (!fileManager) throw new Error('File manager not initialized')
    if (!dhtManager) throw new Error('DHT manager not initialized')

    console.log(`Starting download process`)
    console.log(`File name: ${fileName}`)
    console.log(`File hash: ${fileHash}`)

    // 检查本地文件状态
    console.log('Checking local file status...')
    let isLocalFile = false
    let sourceFilePath = null

    if (databaseManager) {
      const dbFileInfo = await databaseManager.getFileInfo(fileHash)
      console.log('Database file info:', dbFileInfo)

      if (dbFileInfo && dbFileInfo.localPath) {
        console.log('Found local file path in database:', dbFileInfo.localPath)
        try {
          const fs = await import('fs/promises')
          await fs.access(dbFileInfo.localPath)
          isLocalFile = true
          sourceFilePath = dbFileInfo.localPath
          console.log('Confirmed local file exists')
        } catch (accessError) {
          console.log('Database file path invalid:', accessError.message)
        }
      }
    }

    // 检查DHT本地索引作为备份
    if (!isLocalFile) {
      const dhtLocalFiles = dhtManager.getLocalFiles()
      console.log('DHT local files count:', dhtLocalFiles.length)

      const dhtLocalFile = dhtLocalFiles.find(file => file.hash === fileHash)
      if (dhtLocalFile) {
        console.log('Found file in DHT local index')
        isLocalFile = true
      }
    }

    // 扫描已知目录查找文件（最后手段）
    if (!isLocalFile || !sourceFilePath) {
      console.log('Trying to find file in known directories...')

      const possiblePaths = [
        `./shared/${fileName}`,
        `./uploads/${fileName}`,
        `./files/${fileName}`,
        `./${fileName}`
      ]

      for (const possiblePath of possiblePaths) {
        try {
          const fs = await import('fs/promises')
          await fs.access(possiblePath)

          const { createHash } = await import('crypto')
          const fileData = await fs.readFile(possiblePath)
          const calculatedHash = createHash('sha256').update(fileData).digest('hex')

          if (calculatedHash === fileHash) {
            console.log(`Found matching file at ${possiblePath}`)
            isLocalFile = true
            sourceFilePath = possiblePath
            break
          }
        } catch (error) {
          // 文件不存在或哈希不匹配，继续搜索
        }
      }
    }

    // 如果是本地文件，直接复制
    if (isLocalFile && sourceFilePath) {
      console.log('Performing local file copy...')

      try {
        const fs = await import('fs/promises')
        const path = await import('path')

        const downloadDir = './downloads'
        await fs.mkdir(downloadDir, { recursive: true })
        const downloadPath = path.join(downloadDir, fileName)
        await fs.copyFile(sourceFilePath, downloadPath)

        console.log(`Local file copy successful: ${downloadPath}`)

        if (databaseManager) {
          await databaseManager.saveTransferRecord(`local-copy-${fileHash}-${Date.now()}`, {
            type: 'local_copy',
            fileHash,
            fileName,
            status: 'completed',
            completedAt: Date.now(),
            sourcePath: sourceFilePath,
            downloadPath: downloadPath
          })

          await databaseManager.saveFileInfo(fileHash, {
            name: fileName,
            hash: fileHash,
            localPath: sourceFilePath,
            downloadPath: downloadPath,
            downloadedAt: Date.now()
          })
        }

        return {
          success: true,
          message: 'Local file copy successful',
          filePath: downloadPath,
          source: 'local'
        }

      } catch (copyError) {
        console.error('Local file copy failed:', copyError.message)
        throw new Error(`Local file copy failed: ${copyError.message}`)
      }
    }

    // 检查网络连接状态
    const dhtStats = await dhtManager.getDHTStats()
    console.log('DHT status:', JSON.stringify(dhtStats, null, 2))

    if (dhtStats.connectedPeers === 0) {
      throw new Error(`Cannot download file: No other nodes connected, and file not found locally.

Possible causes:
1. This file needs to be downloaded from network but no network connection
2. Original file sharer is offline
3. File may have been moved or deleted

Suggestions:
1. Check network connection
2. Wait for connection to other nodes
3. Contact file sharer to confirm file availability`)
    }

    // 尝试网络下载
    console.log('Attempting network download...')

    let fileInfo = null
    try {
      fileInfo = await dhtManager.findFile(fileHash)
      console.log('DHT file info search result:', fileInfo)
    } catch (dhtError) {
      console.error('DHT file search failed:', dhtError.message)

      if (databaseManager) {
        fileInfo = await databaseManager.getFileInfo(fileHash)
        console.log('Local database file info:', fileInfo)
      }
    }

    if (!fileInfo) {
      fileInfo = {
        name: fileName,
        hash: fileHash,
        chunks: 1,
        chunkSize: 64 * 1024
      }
      console.log('Using default file info')
    }

    // 查找提供者
    let providers = []
    try {
      const providerPromise = dhtManager.findProviders(fileHash)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Provider search timeout')), 5000)
      })

      providers = await Promise.race([providerPromise, timeoutPromise])
      console.log(`Found ${providers.length} providers`)
    } catch (providerError) {
      console.error('Provider search failed:', providerError.message)
    }

    if (providers.length === 0) {
      throw new Error(`Cannot find providers for file "${fileName}".

Possible causes:
1. Nodes providing the file are currently offline
2. Network connection unstable
3. DHT service exception
4. File not fully synced to network

Suggestion: Please try again later, or contact file sharer to confirm their node is online.`)
    }

    // 开始网络下载
    console.log(`Starting download from ${providers.length} providers...`)
    const result = await fileManager.downloadFile(fileHash, fileName)

    if (result.success) {
      if (databaseManager) {
        await databaseManager.saveFileInfo(fileHash, {
          name: fileName,
          hash: fileHash,
          downloadedAt: Date.now(),
          localPath: result.filePath
        })

        await databaseManager.saveTransferRecord(`download-${fileHash}-${Date.now()}`, {
          type: 'network_download',
          fileHash,
          fileName,
          status: 'completed',
          completedAt: Date.now()
        })
      }

      console.log(`Network download completed: ${result.filePath}`)
      return {
        success: true,
        message: 'Network download completed',
        filePath: result.filePath,
        source: 'network'
      }
    } else {
      throw new Error(result.error)
    }

  } catch (error) {
    console.error('Download failed')
    console.error('Error details:', error.message)
    console.error('Error stack:', error.stack)

    return {
      success: false,
      error: error.message
    }
  }
})

// 下载管理
ipcMain.handle('get-active-downloads', async () => {
  try {
    const downloads = []

    if (fileManager) {
      const transfers = fileManager.getActiveTransfers()
      downloads.push(...transfers.map(transfer => ({
        ...transfer,
        type: 'simple',
        status: 'downloading'
      })))
    }

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

// 设置管理
ipcMain.handle('get-settings', async () => {
  try {
    if (!settingsManager) throw new Error('Settings manager not initialized')
    return settingsManager.getAll()
  } catch (error) {
    console.error('Error getting settings:', error)
    throw error
  }
})

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    if (!settingsManager) throw new Error('Settings manager not initialized')

    await settingsManager.setMultiple(settings)
    
    // 如果NAT穿透设置改变了，重新配置节点
    if (p2pNode && (
      settings.hasOwnProperty('enableNATTraversal') ||
      settings.hasOwnProperty('enableUPnP') ||
      settings.hasOwnProperty('enableHolePunching') ||
      settings.hasOwnProperty('enableAutoRelay')
    )) {
      console.log('NAT traversal settings changed, node restart may be required')
    }

    return { success: true }
  } catch (error) {
    console.error('Error saving settings:', error)
    return { success: false, error: error.message }
  }
})

// 数据库管理
ipcMain.handle('get-database-stats', async () => {
  try {
    if (!databaseManager) return null
    return databaseManager.getStats()
  } catch (error) {
    console.error('Error getting database stats:', error)
    return null
  }
})

ipcMain.handle('cleanup-database', async () => {
  try {
    if (!databaseManager) throw new Error('Database manager not initialized')
    await databaseManager.cleanupOldRecords()
    await databaseManager.saveAllData()
    return { success: true, message: 'Database cleanup completed' }
  } catch (error) {
    console.error('Error cleaning up database:', error)
    return { success: false, error: error.message }
  }
})

// 其他必要的IPC处理器
ipcMain.handle('get-node-status', async () => {
  return {
    isStarted: p2pNode ? p2pNode.isStarted : false,
    nodeInfo: p2pNode ? p2pNode.getNodeInfo() : null
  }
})

ipcMain.handle('get-process-info', () => {
  return {
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV || 'production',
    platform: process.platform,
    arch: process.arch,
    version: process.version
  }
})