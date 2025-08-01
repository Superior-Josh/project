// preload.js

const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // P2P节点控制
  startP2PNode: () => ipcRenderer.invoke('start-p2p-node'),
  stopP2PNode: () => ipcRenderer.invoke('stop-p2p-node'),
  getNodeInfo: () => ipcRenderer.invoke('get-node-info'),
  connectToPeer: (multiaddr) => ipcRenderer.invoke('connect-to-peer', multiaddr),
  
  // DHT操作
  getDHTStats: () => ipcRenderer.invoke('get-dht-stats'),
  publishFile: (fileHash, fileMetadata) => ipcRenderer.invoke('publish-file', fileHash, fileMetadata),
  findFile: (fileHash) => ipcRenderer.invoke('find-file', fileHash),
  searchFiles: (query) => ipcRenderer.invoke('search-files', query),
  getLocalFiles: () => ipcRenderer.invoke('get-local-files'),

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
  
  // 文件验证
  validateFile: (filePath, expectedHashes) => ipcRenderer.invoke('validate-file', filePath, expectedHashes),
  
  // 数据库操作
  getDatabaseStats: () => ipcRenderer.invoke('get-database-stats'),
  cleanupDatabase: () => ipcRenderer.invoke('cleanup-database'),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data')
})