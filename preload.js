// preload.js

const { contextBridge, ipcRenderer } = require('electron')

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // P2P node control
  startP2PNode: () => ipcRenderer.invoke('start-p2p-node'),
  stopP2PNode: () => ipcRenderer.invoke('stop-p2p-node'),
  getNodeInfo: () => ipcRenderer.invoke('get-node-info'),
  getNodeStatus: () => ipcRenderer.invoke('get-node-status'),
  connectToPeer: (multiaddr) => ipcRenderer.invoke('connect-to-peer', multiaddr),
  
  // DHT operations
  getDHTStats: () => ipcRenderer.invoke('get-dht-stats'),
  publishFile: (fileHash, fileMetadata) => ipcRenderer.invoke('publish-file', fileHash, fileMetadata),
  findFile: (fileHash) => ipcRenderer.invoke('find-file', fileHash),
  searchFiles: (query) => ipcRenderer.invoke('search-files', query),
  getLocalFiles: () => ipcRenderer.invoke('get-local-files'),

  // Peer discovery
  getDiscoveredPeers: () => ipcRenderer.invoke('get-discovered-peers'),
  connectToDiscoveredPeer: (peerId) => ipcRenderer.invoke('connect-to-discovered-peer', peerId),

  // File operations
  selectFiles: () => ipcRenderer.invoke('select-files'),  
  shareFile: (filePath) => ipcRenderer.invoke('share-file', filePath),
  downloadFile: (fileHash, fileName) => ipcRenderer.invoke('download-file', fileHash, fileName),
  
  // Download management
  getDownloadStatus: (downloadId) => ipcRenderer.invoke('get-download-status', downloadId),
  getActiveDownloads: () => ipcRenderer.invoke('get-active-downloads'),
  pauseDownload: (downloadId) => ipcRenderer.invoke('pause-download', downloadId),
  resumeDownload: (downloadId) => ipcRenderer.invoke('resume-download', downloadId),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  downloadLocalFile: (fileHash, fileName) => ipcRenderer.invoke('download-local-file', fileHash, fileName),
  
  // File validation
  validateFile: (filePath, expectedHashes) => ipcRenderer.invoke('validate-file', filePath, expectedHashes),
  
  // Database operations
  getDatabaseStats: () => ipcRenderer.invoke('get-database-stats'),
  cleanupDatabase: () => ipcRenderer.invoke('cleanup-database'),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),

  // Settings operations
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  selectFolder: (title) => ipcRenderer.invoke('select-folder', title),
  
  // Settings backup management
  createSettingsBackup: () => ipcRenderer.invoke('create-settings-backup'),
  getAvailableBackups: () => ipcRenderer.invoke('get-available-backups'),
  restoreSettingsBackup: (backupPath) => ipcRenderer.invoke('restore-settings-backup', backupPath),
  deleteSettingsBackup: (backupPath) => ipcRenderer.invoke('delete-settings-backup', backupPath),

  // Process information
  getProcessInfo: () => ipcRenderer.invoke('get-process-info'),

  // Event listeners - for auto-start
  onP2PNodeStarted: (callback) => {
    ipcRenderer.on('p2p-node-started', (event, data) => callback(data))
  },
  
  // Event listeners - for status changes
  onP2PNodeStatusChanged: (callback) => {
    ipcRenderer.on('p2p-node-status-changed', (event, data) => callback(data))
  },
  
  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
  
  // Remove specific listener
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback)
  }
})