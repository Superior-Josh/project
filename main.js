// main.js

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// 在 ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入P2P相关模块
let P2PNode, DHTManager, ConnectionDebugger
let p2pNode = null
let dhtManager = null
let connectionDebugger = null // 修改变量名，避免使用保留字

async function createWindow() {
  // 获取进程ID用于区分不同实例
  const processId = process.pid
  const nodeId = Math.random().toString(36).substr(2, 6) // 生成短随机ID
  
  const mainWindow = new BrowserWindow({
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
async function autoStartP2PNode(mainWindow) {
  try {
    console.log('Auto-starting P2P node...')
    
    if (!p2pNode) {
      p2pNode = new P2PNode()
      dhtManager = new DHTManager(p2pNode)
      
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
    if (nodeInfo) {
      const shortPeerId = nodeInfo.peerId.slice(-8)
      const processId = process.pid
      mainWindow.setTitle(`P2P File Sharing - ${shortPeerId} (PID: ${processId})`)
    }
    
    // 通知渲染进程节点已启动
    mainWindow.webContents.send('p2p-node-started', {
      success: true,
      nodeInfo
    })
    
    console.log('P2P node auto-started successfully')
  } catch (error) {
    console.error('Failed to auto-start P2P node:', error)
    
    // 通知渲染进程启动失败
    mainWindow.webContents.send('p2p-node-started', {
      success: false,
      error: error.message
    })
  }
}

app.whenReady().then(async () => {
  // 动态导入ES模块
  try {
    const p2pModule = await import('./src/p2p-node.js')
    const dhtModule = await import('./src/dht-manager.js')
    
    P2PNode = p2pModule.P2PNode
    DHTManager = dhtModule.DHTManager
    
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
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC处理程序
ipcMain.handle('start-p2p-node', async () => {
  try {
    if (!p2pNode) {
      p2pNode = new P2PNode()
      dhtManager = new DHTManager(p2pNode)
      
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
    const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (mainWindow && nodeInfo) {
      const shortPeerId = nodeInfo.peerId.slice(-8)
      const processId = process.pid
      mainWindow.setTitle(`P2P File Sharing - ${shortPeerId} (PID: ${processId})`)
    }
    
    return {
      success: true,
      nodeInfo
    }
  } catch (error) {
    console.error('Error starting P2P node:', error)
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
    }
    
    // 重置窗口标题
    const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      const processId = process.pid
      const nodeId = Math.random().toString(36).substr(2, 6)
      mainWindow.setTitle(`P2P File Sharing - Node ${nodeId} (PID: ${processId}) - STOPPED`)
    }
    
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
    if (!dhtManager) {
      throw new Error('DHT manager not initialized')
    }
    
    const results = await dhtManager.searchFiles(query)
    return {
      success: true,
      results
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
  return dhtManager.getLocalFiles()
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

ipcMain.handle('share-file', async (event, filePath) => {
  try {
    // 这里需要集成文件管理器
    // 暂时返回模拟结果
    console.log(`Sharing file: ${filePath}`)
    return {
      success: true,
      message: 'File shared successfully'
    }
  } catch (error) {
    console.error('Error sharing file:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('download-file', async (event, fileHash, fileName) => {
  try {
    // 这里需要集成文件管理器
    // 暂时返回模拟结果
    console.log(`Downloading file: ${fileName} (${fileHash})`)
    return {
      success: true,
      message: 'Download started'
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
    // 暂时返回模拟状态
    return {
      success: true,
      status: null
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
    // 暂时返回空数组
    return []
  } catch (error) {
    console.error('Error getting active downloads:', error)
    return []
  }
})

ipcMain.handle('pause-download', async (event, downloadId) => {
  try {
    console.log(`Pausing download: ${downloadId}`)
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
    console.log(`Resuming download: ${downloadId}`)
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
    console.log(`Canceling download: ${downloadId}`)
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
    console.log(`Validating file: ${filePath}`)
    return {
      success: true,
      isValid: true,
      message: 'File validation not implemented yet'
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
    // 暂时返回模拟统计数据
    return {
      nodes: 0,
      files: 0,
      peers: 0,
      transfers: 0,
      config: 0,
      initialized: false
    }
  } catch (error) {
    console.error('Error getting database stats:', error)
    return null
  }
})

ipcMain.handle('cleanup-database', async () => {
  try {
    console.log('Cleaning up database...')
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
    const { dialog } = await import('electron')
    const result = await dialog.showSaveDialog({
      defaultPath: 'p2p-data-export.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (!result.canceled) {
      console.log(`Exporting data to: ${result.filePath}`)
      // 这里需要实际的导出逻辑
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
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      console.log(`Importing data from: ${result.filePaths[0]}`)
      // 这里需要实际的导入逻辑
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