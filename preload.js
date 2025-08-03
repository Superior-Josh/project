// preload.js

const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // P2P节点控制
  startP2PNode: () => ipcRenderer.invoke('start-p2p-node'),
  stopP2PNode: () => ipcRenderer.invoke('stop-p2p-node'),
  getNodeInfo: () => ipcRenderer.invoke('get-node-info'),
  getNodeStatus: () => ipcRenderer.invoke('get-node-status'),
  connectToPeer: (multiaddr) => ipcRenderer.invoke('connect-to-peer', multiaddr),
  
  // DHT操作
  getDHTStats: () => ipcRenderer.invoke('get-dht-stats'),
  publishFile: (fileHash, fileMetadata) => ipcRenderer.invoke('publish-file', fileHash, fileMetadata),
  findFile: (fileHash) => ipcRenderer.invoke('find-file', fileHash),
  searchFiles: (query) => ipcRenderer.invoke('search-files', query),
  getLocalFiles: () => ipcRenderer.invoke('get-local-files'),

  // 节点发现
  getDiscoveredPeers: () => ipcRenderer.invoke('get-discovered-peers'),
  connectToDiscoveredPeer: (peerId) => ipcRenderer.invoke('connect-to-discovered-peer', peerId),

  // 文件操作
  selectFiles: () => ipcRenderer.invoke('select-files'),  
  shareFile: (filePath) => ipcRenderer.invoke('share-file', filePath),
  downloadFile: (fileHash, fileName) => ipcRenderer.invoke('download-file', fileHash, fileName),
  
  // 下载管理
  getDownloadStatus: (downloadId) => ipcRenderer.invoke('get-download-status', downloadId),
  getActiveDownloads: () => ipcRenderer.invoke('get-active-downloads'),
  pauseDownload: (downloadId) => ipcRenderer.invoke('pause-download', downloadId),
  resumeDownload: (downloadId) => ipcRenderer.invoke('resume-download', downloadId),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  downloadLocalFile: (fileHash, fileName) => ipcRenderer.invoke('download-local-file', fileHash, fileName),
  
  // 文件验证
  validateFile: (filePath, expectedHashes) => ipcRenderer.invoke('validate-file', filePath, expectedHashes),
  
  // 数据库操作
  getDatabaseStats: () => ipcRenderer.invoke('get-database-stats'),
  cleanupDatabase: () => ipcRenderer.invoke('cleanup-database'),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),

  // 进程信息
  getProcessInfo: () => ipcRenderer.invoke('get-process-info'),

  // 事件监听 - 用于自动启动
  onP2PNodeStarted: (callback) => {
    ipcRenderer.on('p2p-node-started', (event, data) => callback(data))
  },
  
  // 事件监听 - 用于状态变化
  onP2PNodeStatusChanged: (callback) => {
    ipcRenderer.on('p2p-node-status-changed', (event, data) => callback(data))
  },
  
  // 移除事件监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
  
  // 移除特定监听器
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback)
  }
})