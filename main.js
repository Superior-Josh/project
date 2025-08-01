// main.js

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// 在 ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入P2P相关模块
let P2PNode, DHTManager
let p2pNode = null
let dhtManager = null

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
  })

  await mainWindow.loadFile('renderer/index.html')
  
  // 开发时打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  return mainWindow
}

app.whenReady().then(async () => {
  // 动态导入ES模块
  try {
    const p2pModule = await import('./src/p2p-node.js')
    const dhtModule = await import('./src/dht-manager.js')
    
    P2PNode = p2pModule.P2PNode
    DHTManager = dhtModule.DHTManager
    
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
    await p2pNode.stop()
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
    }
    
    await p2pNode.start()
    await dhtManager.initialize()
    
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
  return p2pNode.getNodeInfo()
})

ipcMain.handle('connect-to-peer', async (event, multiaddr) => {
  try {
    if (!p2pNode) {
      throw new Error('P2P node not started')
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