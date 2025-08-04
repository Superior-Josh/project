// renderer.js

// Message Manager for UI notifications

class MessageManager {
  constructor() {
    this.messages = new Map()
    this.messageCount = 0
    this.maxMessages = 5
    this.defaultDuration = 5000

    this.createMessageContainer()
  }

  createMessageContainer() {
    let container = document.getElementById('message-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'message-container'
      container.className = 'message-container'
      document.body.appendChild(container)
    }
    this.container = container
  }

  show(message, type = 'info', duration = null) {
    const messageId = ++this.messageCount
    const actualDuration = duration || this.getDurationByType(type)

    if (this.messages.size >= this.maxMessages) {
      const oldestId = Math.min(...this.messages.keys())
      this.remove(oldestId)
    }

    const messageEl = this.createMessageElement(message, type, messageId)

    this.container.appendChild(messageEl)

    this.messages.set(messageId, {
      element: messageEl,
      timer: null,
      type,
      message
    })

    if (actualDuration > 0) {
      const timer = setTimeout(() => {
        this.remove(messageId)
      }, actualDuration)

      this.messages.get(messageId).timer = timer
    }

    messageEl.addEventListener('click', () => {
      this.remove(messageId)
    })

    console.log(`[${type.toUpperCase()}] ${message}`)

    return messageId
  }

  createMessageElement(message, type, messageId) {
    const messageEl = document.createElement('div')
    messageEl.className = `message message-${type}`
    messageEl.setAttribute('data-message-id', messageId)
    messageEl.textContent = message

    messageEl.style.opacity = '0'
    messageEl.style.transform = 'translateX(100%)'

    requestAnimationFrame(() => {
      messageEl.style.opacity = '1'
      messageEl.style.transform = 'translateX(0)'
    })

    return messageEl
  }

  remove(messageId) {
    const messageInfo = this.messages.get(messageId)
    if (!messageInfo) return

    const { element, timer } = messageInfo

    if (timer) {
      clearTimeout(timer)
    }

    element.classList.add('removing')

    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
      this.messages.delete(messageId)
    }, 300)
  }

  clear() {
    for (const messageId of this.messages.keys()) {
      this.remove(messageId)
    }
  }

  getDurationByType(type) {
    const durations = {
      'success': 4000,
      'info': 5000,
      'warning': 6000,
      'error': 8000
    }
    return durations[type] || this.defaultDuration
  }

  updateOrShow(message, type = 'info', duration = null) {
    for (const [id, info] of this.messages) {
      if (info.message === message && info.type === type) {
        if (info.timer) {
          clearTimeout(info.timer)
        }

        const actualDuration = duration || this.getDurationByType(type)
        if (actualDuration > 0) {
          info.timer = setTimeout(() => {
            this.remove(id)
          }, actualDuration)
        }

        info.element.style.animation = 'none'
        requestAnimationFrame(() => {
          info.element.style.animation = 'slideInRight 0.3s ease'
        })

        return id
      }
    }

    return this.show(message, type, duration)
  }
}

// Create global message manager instance
const messageManager = new MessageManager()

// Message functions
function showMessage(message, type = 'info', duration = null) {
  return messageManager.show(message, type, duration)
}

function showSuccess(message, duration = null) {
  return messageManager.show(message, 'success', duration)
}

function showError(message, duration = null) {
  return messageManager.show(message, 'error', duration)
}

function showWarning(message, duration = null) {
  return messageManager.show(message, 'warning', duration)
}

function showInfo(message, duration = null) {
  return messageManager.show(message, 'info', duration)
}

function clearAllMessages() {
  messageManager.clear()
}

function showPersistent(message, type = 'info') {
  return messageManager.show(message, type, 0)
}

function updateMessage(message, type = 'info', duration = null) {
  return messageManager.updateOrShow(message, type, duration)
}

function closeMessage(messageId) {
  messageManager.remove(messageId)
}

// Export for compatibility
window.showMessage = showMessage
window.showSuccess = showSuccess
window.showError = showError
window.showWarning = showWarning
window.showInfo = showInfo
window.clearAllMessages = clearAllMessages
window.showPersistent = showPersistent
window.updateMessage = updateMessage
window.closeMessage = closeMessage

// Page load initialization
document.addEventListener('DOMContentLoaded', () => {
  if (!messageManager.container) {
    messageManager.createMessageContainer()
  }

  console.log('Message system initialized')
})

// Global state
let isNodeStarted = false
let selectedFiles = []
let downloadInterval = null
let isAutoStarting = false

// DOM elements
const elements = {
  startNode: document.getElementById('startNode'),
  stopNode: document.getElementById('stopNode'),
  openSettings: document.getElementById('openSettings'),
  nodeStatus: document.getElementById('nodeStatus'),
  nodeInfo: document.getElementById('nodeInfo'),
  peerAddress: document.getElementById('peerAddress'),
  connectPeer: document.getElementById('connectPeer'),
  dhtStats: document.getElementById('dhtStats'),
  refreshStats: document.getElementById('refreshStats'),
  selectFiles: document.getElementById('selectFiles'),
  shareSelected: document.getElementById('shareSelected'),
  selectedFiles: document.getElementById('selectedFiles'),
  searchInput: document.getElementById('searchInput'),
  searchFiles: document.getElementById('searchFiles'),
  localFiles: document.getElementById('localFiles'),
  searchResults: document.getElementById('searchResults'),
  activeDownloads: document.getElementById('activeDownloads'),
  refreshDownloads: document.getElementById('refreshDownloads'),
  databaseStats: document.getElementById('databaseStats'),
  refreshDatabaseStats: document.getElementById('refreshDatabaseStats'),
  cleanupDatabase: document.getElementById('cleanupDatabase'),
  exportData: document.getElementById('exportData'),
  importData: document.getElementById('importData')
}

// Initialize DOM elements after page load
function initializeDOMElements() {
  // Re-query elements in case they weren't ready before
  Object.keys(elements).forEach(key => {
    const element = document.getElementById(key === 'openSettings' ? 'openSettings' : key)
    if (element) {
      elements[key] = element
    }
  })
}

// Page load initialization
document.addEventListener('DOMContentLoaded', () => {
  if (!messageManager.container) {
    messageManager.createMessageContainer()
  }

  console.log('P2P File Sharing System loaded')

  // Initialize DOM elements
  initializeDOMElements()

  // Define global functions immediately when page loads
  window.removeSelectedFile = removeSelectedFile
  window.pauseDownload = pauseDownload
  window.resumeDownload = resumeDownload
  window.cancelDownload = cancelDownload
  window.connectToDiscoveredPeer = connectToDiscoveredPeer
  window.refreshDiscoveredPeers = refreshDiscoveredPeers
  window.goBackToMain = goBackToMain

  // Setup event listeners
  setupEventListeners()

  updateSelectedFilesDisplay()
  refreshDatabaseStats()

  // Initialize i18n
  initializeI18n()

  // Set auto-starting state
  isAutoStarting = true
  if (elements.startNode) {
    elements.startNode.disabled = true
    elements.startNode.textContent = window.i18n ? window.i18n.t('status.starting') : 'Auto-starting...'
  }
  if (elements.stopNode) {
    elements.stopNode.disabled = true
  }
  updateNodeStatus('connecting', window.i18n ? window.i18n.t('status.starting') : 'Starting')
})

// Setup event listeners
function setupEventListeners() {
  if (elements.startNode) elements.startNode.addEventListener('click', startNode)
  if (elements.stopNode) elements.stopNode.addEventListener('click', stopNode)
  if (elements.openSettings) elements.openSettings.addEventListener('click', openSettings)
  if (elements.connectPeer) elements.connectPeer.addEventListener('click', connectToPeer)
  if (elements.refreshStats) elements.refreshStats.addEventListener('click', refreshStats)
  if (elements.selectFiles) elements.selectFiles.addEventListener('click', selectFiles)
  if (elements.shareSelected) elements.shareSelected.addEventListener('click', shareSelectedFiles)
  if (elements.searchFiles) elements.searchFiles.addEventListener('click', searchFiles)
  if (elements.refreshDownloads) elements.refreshDownloads.addEventListener('click', refreshDownloads)
  if (elements.refreshDatabaseStats) elements.refreshDatabaseStats.addEventListener('click', refreshDatabaseStats)
  if (elements.cleanupDatabase) elements.cleanupDatabase.addEventListener('click', cleanupDatabase)
  if (elements.exportData) elements.exportData.addEventListener('click', exportData)
  if (elements.importData) elements.importData.addEventListener('click', importData)

  // Search input enter key
  if (elements.searchInput) {
    elements.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchFiles()
      }
    })
  }
}

// Update button states
function updateButtonStates(nodeStarted) {
  isNodeStarted = nodeStarted

  if (nodeStarted) {
    if (elements.startNode) {
      elements.startNode.disabled = true
      elements.startNode.textContent = window.i18n ? window.i18n.t('header.startNode') : 'Node Started'
    }
    if (elements.stopNode) {
      elements.stopNode.disabled = false
      elements.stopNode.textContent = window.i18n ? window.i18n.t('header.stopNode') : 'Stop Node'
    }
    updateNodeStatus('online', window.i18n ? window.i18n.t('status.online') : 'Online')
  } else {
    if (elements.startNode) {
      elements.startNode.disabled = false
      elements.startNode.textContent = window.i18n ? window.i18n.t('header.startNode') : 'Start Node'
    }
    if (elements.stopNode) {
      elements.stopNode.disabled = true
      elements.stopNode.textContent = window.i18n ? window.i18n.t('header.stopNode') : 'Stop Node'
    }
    updateNodeStatus('offline', window.i18n ? window.i18n.t('status.offline') : 'Offline')
  }
}

// Listen for auto-start events
window.electronAPI.onP2PNodeStarted((result) => {
  console.log('Received auto-start result:', result)

  isAutoStarting = false

  if (result.success) {
    updateButtonStates(true)
    updateNodeInfo(result.nodeInfo)
    startStatsRefresh()
    showMessage('P2P node auto-started successfully', 'success')
  } else {
    updateButtonStates(false)
    elements.nodeInfo.innerHTML = '<p>Auto-start failed</p>'
    showMessage(`Auto-start failed: ${result.error}`, 'error')
  }
})

// Listen for node status change events
window.electronAPI.onP2PNodeStatusChanged((result) => {
  console.log('Received node status change:', result)

  if (result.success && result.nodeInfo) {
    updateButtonStates(true)
    updateNodeInfo(result.nodeInfo)
  } else if (result.success && !result.nodeInfo) {
    updateButtonStates(false)
    elements.nodeInfo.innerHTML = '<p>Node stopped</p>'
    elements.dhtStats.innerHTML = '<p>DHT not running</p>'
  } else if (!result.success && result.error) {
    showMessage(`Node operation failed: ${result.error}`, 'error')
  }
})

// Open settings
async function openSettings() {
  try {
    const result = await window.electronAPI.openSettings()
    if (result.success) {
      console.log('Settings window opened')
    } else {
      showMessage(`Failed to open settings: ${result.error}`, 'error')
    }
  } catch (error) {
    console.error('Error opening settings:', error)
    showMessage(`Error opening settings: ${error.message}`, 'error')
  }
}

// Start node
async function startNode() {
  if (isAutoStarting) {
    showMessage('Node is auto-starting, please wait', 'info')
    return
  }

  if (isNodeStarted) {
    showMessage('Node already started', 'info')
    return
  }

  try {
    elements.startNode.disabled = true
    elements.startNode.textContent = 'Starting...'
    updateNodeStatus('connecting', 'Starting')

    const result = await window.electronAPI.startP2PNode()

    if (result.success) {
      updateButtonStates(true)
      updateNodeInfo(result.nodeInfo)
      startStatsRefresh()
      showMessage('P2P node started successfully', 'success')
    } else {
      updateButtonStates(false)
      showMessage(`Start failed: ${result.error}`, 'error')
    }
  } catch (error) {
    updateButtonStates(false)
    showMessage(`Start error: ${error.message}`, 'error')
  }
}

// Stop node
async function stopNode() {
  if (!isNodeStarted) {
    showMessage('Node not started', 'info')
    return
  }

  try {
    elements.stopNode.disabled = true
    elements.stopNode.textContent = 'Stopping...'
    updateNodeStatus('connecting', 'Stopping')

    const result = await window.electronAPI.stopP2PNode()

    if (result.success) {
      updateButtonStates(false)
      elements.nodeInfo.innerHTML = '<p>Node stopped</p>'
      elements.dhtStats.innerHTML = '<p>DHT not running</p>'

      if (downloadInterval) {
        clearInterval(downloadInterval)
        downloadInterval = null
      }

      showMessage('P2P node stopped', 'info')
    } else {
      elements.stopNode.disabled = false
      elements.stopNode.textContent = 'Stop Node'
      updateNodeStatus('online', 'Online')
      showMessage(`Stop failed: ${result.error}`, 'error')
    }
  } catch (error) {
    elements.stopNode.disabled = false
    elements.stopNode.textContent = 'Stop Node'
    updateNodeStatus('online', 'Online')
    showMessage(`Stop error: ${error.message}`, 'error')
  }
}

// Update node status
function updateNodeStatus(status, text) {
  elements.nodeStatus.className = `status ${status}`
  elements.nodeStatus.textContent = text
}

// Update node information
function updateNodeInfo(nodeInfo) {
  if (nodeInfo) {
    elements.nodeInfo.innerHTML = `
      <p><strong>Node ID:</strong> ${nodeInfo.peerId}</p>
      <p><strong>Connected Peers:</strong> ${nodeInfo.connectedPeers}</p>
      <p><strong>Discovered Peers:</strong> ${nodeInfo.discoveredPeers || 0}</p>
      <p><strong>Listen Addresses:</strong></p>
      <ul>
        ${nodeInfo.addresses.map(addr => `<li>${addr}</li>`).join('')}
      </ul>
      ${nodeInfo.discoveredPeerIds && nodeInfo.discoveredPeerIds.length > 0 ? `
        <p><strong>Discovered Peer List:</strong></p>
        <div class="discovered-peers">
          ${nodeInfo.discoveredPeerIds.map(peerId => {
      const shortPeerId = peerId
      const isBootstrap = isBootstrapPeerId(peerId)
      return `
              <div class="peer-item ${isBootstrap ? 'bootstrap-peer' : ''}">
                <span class="peer-id" title="${peerId}">
                  ${shortPeerId}${isBootstrap ? ' (Bootstrap Node)' : ''}
                </span>
                ${!isBootstrap ?
          `<button class="connect-btn" onclick="connectToDiscoveredPeer('${peerId}')">Connect</button>` :
          `<span class="bootstrap-label">Infrastructure Node</span>`
        }
              </div>
            `
    }).join('')}
        </div>
      ` : ''}
    `
  }
}

// Check if is bootstrap peer
function isBootstrapPeerId(peerId) {
  const bootstrapPeerIds = [
    'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    'QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
  ]
  return bootstrapPeerIds.includes(peerId)
}

// Connect to peer
async function connectToPeer() {
  if (!isNodeStarted) {
    showMessage('Please start P2P node first', 'warning')
    return
  }

  const address = elements.peerAddress.value.trim()
  if (!address) {
    showMessage('Please enter peer address', 'warning')
    return
  }

  try {
    elements.connectPeer.disabled = true
    elements.connectPeer.textContent = 'Connecting...'

    const result = await window.electronAPI.connectToPeer(address)

    if (result.success) {
      showMessage('Successfully connected to peer', 'success')
      elements.peerAddress.value = ''
      await refreshStats()
    } else {
      showMessage(`Connection failed: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`Connection error: ${error.message}`, 'error')
  } finally {
    elements.connectPeer.disabled = false
    elements.connectPeer.textContent = 'Connect'
  }
}

// Refresh statistics
async function refreshStats() {
  if (!isNodeStarted) return

  try {
    const nodeInfo = await window.electronAPI.getNodeInfo()
    updateNodeInfo(nodeInfo)

    const dhtStats = await window.electronAPI.getDHTStats()
    if (dhtStats) {
      elements.dhtStats.innerHTML = `
        <p><strong>Connected Peers:</strong> ${dhtStats.connectedPeers}</p>
        <p><strong>Routing Table Size:</strong> ${dhtStats.routingTableSize}</p>
        <p><strong>Local Files:</strong> ${dhtStats.localFiles}</p>
      `
    }

    await refreshLocalFiles()
    await refreshDatabaseStats()
  } catch (error) {
    console.error('Error refreshing stats:', error)
  }
}

// Start stats refresh
function startStatsRefresh() {
  if (downloadInterval) {
    clearInterval(downloadInterval)
  }

  refreshStats()
  downloadInterval = setInterval(refreshStats, 30000)
  setInterval(refreshDownloads, 5000)
}

// Select files
async function selectFiles() {
  try {
    const result = await window.electronAPI.selectFiles()

    if (result.success && !result.cancelled) {
      selectedFiles = result.filePaths
      updateSelectedFilesDisplay()
      elements.shareSelected.disabled = selectedFiles.length === 0
    }
  } catch (error) {
    showMessage(`File selection error: ${error.message}`, 'error')
  }
}

// Update selected files display
function updateSelectedFilesDisplay() {
  if (selectedFiles.length === 0) {
    elements.selectedFiles.innerHTML = '<p>No files selected</p>'
  } else {
    const fileList = selectedFiles.map(filePath => {
      const fileName = filePath.split(/[/\\]/).pop()
      return `<div class="selected-file">
        <span>${fileName}</span>
        <button onclick="removeSelectedFile('${filePath}')">Remove</button>
      </div>`
    }).join('')

    elements.selectedFiles.innerHTML = `
      <p>Selected ${selectedFiles.length} files:</p>
      ${fileList}
    `
  }
}

// Remove selected file
function removeSelectedFile(filePath) {
  selectedFiles = selectedFiles.filter(path => path !== filePath)
  updateSelectedFilesDisplay()
  elements.shareSelected.disabled = selectedFiles.length === 0
}

// Share selected files
async function shareSelectedFiles() {
  if (selectedFiles.length === 0) {
    showMessage('Please select files to share first', 'warning')
    return
  }

  if (!isNodeStarted) {
    showMessage('Please start P2P node first', 'warning')
    return
  }

  try {
    elements.shareSelected.disabled = true
    elements.shareSelected.textContent = 'Sharing...'

    let successCount = 0
    let errorCount = 0
    const errors = []

    for (const filePath of selectedFiles) {
      try {
        const result = await window.electronAPI.shareFile(filePath)

        if (result.success) {
          successCount++
        } else {
          errorCount++
          errors.push(`${filePath}: ${result.error}`)
        }
      } catch (error) {
        errorCount++
        errors.push(`${filePath}: ${error.message}`)
      }
    }

    if (successCount > 0) {
      showMessage(`Successfully shared ${successCount} files`, 'success')
    }

    if (errorCount > 0) {
      showMessage(`${errorCount} files failed to share:\n${errors.join('\n')}`, 'error')
    }

    selectedFiles = []
    updateSelectedFilesDisplay()
    await refreshLocalFiles()

  } catch (error) {
    showMessage(`Share error: ${error.message}`, 'error')
  } finally {
    elements.shareSelected.disabled = selectedFiles.length === 0
    elements.shareSelected.textContent = 'Share Selected Files'
  }
}

// Search files
async function searchFiles() {
  const query = elements.searchInput.value.trim()
  if (!query) {
    showMessage('Please enter search keywords', 'warning')
    return
  }

  if (!isNodeStarted) {
    showMessage('Please start P2P node first', 'warning')
    return
  }

  try {
    elements.searchFiles.disabled = true
    elements.searchFiles.textContent = 'Searching...'

    const result = await window.electronAPI.searchFiles(query)

    if (result.success) {
      displaySearchResults(result.results)
    } else {
      showMessage(`Search failed: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`Search error: ${error.message}`, 'error')
  } finally {
    elements.searchFiles.disabled = false
    elements.searchFiles.textContent = 'Search'
  }
}

// Display search results
function displaySearchResults(results) {
  if (results.length === 0) {
    elements.searchResults.innerHTML = '<p>No matching files found</p>'
  } else {
    const resultList = results.map(file => `
      <div class="file-item">
        <div class="file-info">
          <h4>${file.name}</h4>
          <p>Size: ${formatFileSize(file.size)}</p>
          <p>Hash: ${file.hash}</p>
          <p>Provider: ${file.provider || 'Unknown'}</p>
          <p>Time: ${new Date(file.timestamp || file.savedAt || Date.now()).toLocaleString()}</p>
        </div>
        <div class="file-actions">
          <button onclick="window.downloadFile('${file.hash}', '${file.name}')">Download</button>
        </div>
      </div>
    `).join('')

    elements.searchResults.innerHTML = `
      <p>Found ${results.length} files:</p>
      ${resultList}
    `
  }
}

// Download file
window.downloadFile = async function (fileHash, fileName) {
  console.log('Download button clicked:', { fileHash, fileName })

  if (!isNodeStarted) {
    showMessage('Please start P2P node first', 'warning')
    return
  }

  try {
    const localFiles = await window.electronAPI.getLocalFiles()
    const isLocalFile = localFiles.some(file => file.hash === fileHash)

    if (isLocalFile) {
      console.log('Detected local file, trying direct copy')
      showMessage(`Copying local file: ${fileName}`, 'info')

      const localResult = await window.electronAPI.downloadLocalFile(fileHash, fileName)

      if (localResult.success) {
        showMessage(`Local file copy successful: ${fileName}`, 'success')
        await refreshDownloads()
        return
      } else {
        console.log('Local file copy failed, trying network download:', localResult.error)
        showMessage(`Local copy failed, trying network download: ${fileName}`, 'warning')
      }
    }

    showMessage(`Looking for file: ${fileName}`, 'info')

    const result = await window.electronAPI.downloadFile(fileHash, fileName)

    if (result.success) {
      showMessage(`Download started: ${fileName}`, 'success')
      await refreshDownloads()
    } else {
      showMessage(`Download failed: ${result.error}`, 'error')
    }
  } catch (error) {
    console.error('Download error:', error)
    showMessage(`Download error: ${error.message}`, 'error')
  }
}

// Refresh local files
async function refreshLocalFiles() {
  try {
    const files = await window.electronAPI.getLocalFiles()

    if (files.length === 0) {
      elements.localFiles.innerHTML = '<p>No local files</p>'
    } else {
      const fileList = files.map(file => `
        <div class="file-item">
          <div class="file-info">
            <h4>${file.name}</h4>
            <p>Size: ${formatFileSize(file.size)}</p>
            <p>Hash: ${file.hash}</p>
            <p>Shared Time: ${new Date(file.sharedAt || file.timestamp || file.savedAt).toLocaleString()}</p>
          </div>
        </div>
      `).join('')

      elements.localFiles.innerHTML = `
        <p>Local Files (${files.length}):</p>
        ${fileList}
      `
    }
  } catch (error) {
    console.error('Error refreshing local files:', error)
  }
}

// Refresh download status
async function refreshDownloads() {
  try {
    const downloads = await window.electronAPI.getActiveDownloads()

    if (downloads.length === 0) {
      elements.activeDownloads.innerHTML = '<p>No active downloads</p>'
    } else {
      const downloadList = downloads.map(download => `
        <div class="download-item">
          <div class="download-info">
            <h4>${download.fileName}</h4>
            <p>Status: ${getStatusText(download.status)}</p>
            <p>Progress: ${download.progress?.toFixed(1) || 0}%</p>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${download.progress || 0}%"></div>
            </div>
            <p>Downloaded: ${download.downloadedChunks || 0} / ${download.totalChunks || 0} chunks</p>
            ${download.estimatedTime ? `<p>Estimated Remaining: ${formatTime(download.estimatedTime)}</p>` : ''}
          </div>
          <div class="download-actions">
            ${download.status === 'downloading' ?
          `<button onclick="pauseDownload('${download.id || download.fileHash}')">Pause</button>` :
          download.status === 'paused' ?
            `<button onclick="resumeDownload('${download.id || download.fileHash}')">Resume</button>` : ''
        }
            <button onclick="cancelDownload('${download.id || download.fileHash}')">Cancel</button>
          </div>
        </div>
      `).join('')

      elements.activeDownloads.innerHTML = downloadList
    }
  } catch (error) {
    console.error('Error refreshing downloads:', error)
  }
}

// Pause download
async function pauseDownload(downloadId) {
  try {
    const result = await window.electronAPI.pauseDownload(downloadId)
    if (result.success) {
      showMessage('Download paused', 'info')
      await refreshDownloads()
    } else {
      showMessage(`Pause failed: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`Pause error: ${error.message}`, 'error')
  }
}

// Resume download
async function resumeDownload(downloadId) {
  try {
    const result = await window.electronAPI.resumeDownload(downloadId)
    if (result.success) {
      showMessage('Download resumed', 'info')
      await refreshDownloads()
    } else {
      showMessage(`Resume failed: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`Resume error: ${error.message}`, 'error')
  }
}

// Cancel download
async function cancelDownload(downloadId) {
  if (confirm('Are you sure you want to cancel this download?')) {
    try {
      const result = await window.electronAPI.cancelDownload(downloadId)
      if (result.success) {
        showMessage('Download cancelled', 'info')
        await refreshDownloads()
      } else {
        showMessage(`Cancel failed: ${result.error}`, 'error')
      }
    } catch (error) {
      showMessage(`Cancel error: ${error.message}`, 'error')
    }
  }
}

// Connect to discovered peer
async function connectToDiscoveredPeer(peerId) {
  try {
    if (isBootstrapPeerId(peerId)) {
      showMessage('Cannot connect to bootstrap node. Bootstrap nodes are infrastructure nodes used for network discovery, direct connection not supported. Please try connecting to other discovered peers.', 'warning')
      return
    }

    const result = await window.electronAPI.connectToDiscoveredPeer(peerId)

    if (result.success) {
      showMessage(`Successfully connected to peer: ${peerId.slice(-8)}`, 'success')
      await refreshStats()
    } else {
      let errorMessage = result.error
      if (errorMessage.includes('bootstrap node')) {
        errorMessage = 'Cannot connect to bootstrap node. Please try connecting to other discovered peers.'
      } else if (errorMessage.includes('offline or unreachable')) {
        errorMessage = 'Peer offline or unreachable. Please try connecting to other peers.'
      }
      showMessage(`Connection failed: ${errorMessage}`, 'error')
    }
  } catch (error) {
    showMessage(`Connection error: ${error.message}`, 'error')
  }
}

// Refresh discovered peers
async function refreshDiscoveredPeers() {
  try {
    const result = await window.electronAPI.getDiscoveredPeers()

    if (result.success) {
      await refreshStats()
      showMessage(`Refresh completed, discovered ${result.peers.length} peers`, 'info')
    } else {
      showMessage(`Refresh failed: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`Refresh error: ${error.message}`, 'error')
  }
}

// Refresh database stats
async function refreshDatabaseStats() {
  try {
    const stats = await window.electronAPI.getDatabaseStats()

    if (stats) {
      elements.databaseStats.innerHTML = `
        <p><strong>Node Records:</strong> ${stats.nodes}</p>
        <p><strong>File Records:</strong> ${stats.files}</p>
        <p><strong>Peer Records:</strong> ${stats.peers}</p>
        <p><strong>Transfer Records:</strong> ${stats.transfers}</p>
        <p><strong>Config Items:</strong> ${stats.config}</p>
        <p><strong>Status:</strong> ${stats.initialized ? 'Initialized' : 'Not Initialized'}</p>
      `
    } else {
      elements.databaseStats.innerHTML = '<p>Database not initialized</p>'
    }
  } catch (error) {
    console.error('Error refreshing database stats:', error)
  }
}

// Cleanup database
async function cleanupDatabase() {
  if (confirm('Are you sure you want to cleanup old database records? This will delete records older than 30 days.')) {
    try {
      elements.cleanupDatabase.disabled = true
      elements.cleanupDatabase.textContent = 'Cleaning...'

      const result = await window.electronAPI.cleanupDatabase()

      if (result.success) {
        showMessage('Database cleanup completed', 'success')
        await refreshDatabaseStats()
      } else {
        showMessage(`Cleanup failed: ${result.error}`, 'error')
      }
    } catch (error) {
      showMessage(`Cleanup error: ${error.message}`, 'error')
    } finally {
      elements.cleanupDatabase.disabled = false
      elements.cleanupDatabase.textContent = 'Cleanup Database'
    }
  }
}

// Export data
async function exportData() {
  try {
    elements.exportData.disabled = true
    elements.exportData.textContent = 'Exporting...'

    const result = await window.electronAPI.exportData()

    if (result.success && !result.cancelled) {
      showMessage(`Data exported to: ${result.filePath}`, 'success')
    } else if (result.cancelled) {
      showMessage('Export cancelled', 'info')
    } else {
      showMessage(`Export failed: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`Export error: ${error.message}`, 'error')
  } finally {
    elements.exportData.disabled = false
    elements.exportData.textContent = 'Export Data'
  }
}

// Import data
async function importData() {
  if (confirm('Importing data will overwrite current database content, are you sure you want to continue?')) {
    try {
      elements.importData.disabled = true
      elements.importData.textContent = 'Importing...'

      const result = await window.electronAPI.importData()

      if (result.success && !result.cancelled) {
        showMessage(`Data imported from ${result.filePath}`, 'success')
        await refreshDatabaseStats()
        await refreshLocalFiles()
      } else if (result.cancelled) {
        showMessage('Import cancelled', 'info')
      } else {
        showMessage(`Import failed: ${result.error}`, 'error')
      }
    } catch (error) {
      showMessage(`Import error: ${error.message}`, 'error')
    } finally {
      elements.importData.disabled = false
      elements.importData.textContent = 'Import Data'
    }
  }
}

// Utility functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`
}

function getStatusText(status) {
  const statusMap = {
    'downloading': 'Downloading',
    'paused': 'Paused',
    'completed': 'Completed',
    'failed': 'Failed',
    'cancelled': 'Cancelled'
  }
  return statusMap[status] || status
}

// Page load initialization
document.addEventListener('DOMContentLoaded', () => {
  if (!messageManager.container) {
    messageManager.createMessageContainer()
  }

  console.log('Message system initialized')

  // Initialize i18n
  initializeI18n()
})

// Initialize internationalization
async function initializeI18n() {
  try {
    // Get language setting from electron
    const settings = await window.electronAPI.getSettings()
    const language = settings.language || 'en'

    // Set language
    window.i18n.setLanguage(language)

    console.log('I18n initialized with language:', language)
  } catch (error) {
    console.error('Error initializing i18n:', error)
    // Default to English if error
    window.i18n.setLanguage('en')
  }
}

// Switch between main and settings interface
function showSettings() {
  document.getElementById('mainInterface').style.display = 'none'
  document.getElementById('settingsInterface').style.display = 'flex'

  // Load settings content
  loadSettingsContent()
}

function goBackToMain() {
  // Check for unsaved changes
  if (typeof hasUnsavedChanges !== 'undefined' && hasUnsavedChanges) {
    if (typeof showConfirmDialog === 'function') {
      showConfirmDialog(
        window.i18n.t('confirm.unsavedChanges'),
        window.i18n.t('confirm.unsavedChanges'),
        () => {
          hideSettings()
        }
      )
    } else {
      if (confirm(window.i18n.t('confirm.unsavedChanges'))) {
        hideSettings()
      }
    }
  } else {
    hideSettings()
  }
}

function hideSettings() {
  document.getElementById('settingsInterface').style.display = 'none'
  document.getElementById('mainInterface').style.display = 'block'

  // Reset unsaved changes flag
  if (typeof hasUnsavedChanges !== 'undefined') {
    window.hasUnsavedChanges = false
  }
}

// Load settings content dynamically
async function loadSettingsContent() {
  const settingsContent = document.getElementById('settingsContent')

  try {
    // Create settings panels HTML
    const html = await fetch('settings.html').then(res => res.text())
    settingsContent.innerHTML = html

    // Update i18n after loading content
    window.i18n.updatePageText()

    // Setup settings functionality
    setupSettingsNavigation()
    await loadSettings()
  } catch (error) {
    console.error('Error loading settings content:', error)
    settingsContent.innerHTML = '<p>Failed to load settings</p>'
  }
}

// Handle language change
function handleLanguageChange(language) {
  window.i18n.setLanguage(language)

  // Update all text immediately
  setTimeout(() => {
    window.i18n.updatePageText()
  }, 100)

  // Mark as unsaved change
  if (typeof markUnsaved === 'function') {
    markUnsaved()
  }
}

// Settings functionality for in-app settings
let hasUnsavedChanges = false
let currentSettings = {}

// Settings functions
async function loadSettings() {
  try {
    const settings = await window.electronAPI.getSettings()
    currentSettings = settings
    populateSettingsForm(settings)
  } catch (error) {
    console.error('Error loading settings:', error)
    showMessage('Failed to load settings', 'error')
  }
}

function populateSettingsForm(settings) {
  // Download settings
  const downloadPath = document.getElementById('downloadPath')
  if (downloadPath) downloadPath.value = settings.downloadPath || ''

  const autoCreateSubfolders = document.getElementById('autoCreateSubfolders')
  if (autoCreateSubfolders) autoCreateSubfolders.checked = settings.autoCreateSubfolders || false

  const maxConcurrentDownloads = document.getElementById('maxConcurrentDownloads')
  if (maxConcurrentDownloads) maxConcurrentDownloads.value = settings.maxConcurrentDownloads || 3

  const chunkSize = document.getElementById('chunkSize')
  if (chunkSize) chunkSize.value = settings.chunkSize || 262144

  const enableResumeDownload = document.getElementById('enableResumeDownload')
  if (enableResumeDownload) enableResumeDownload.checked = settings.enableResumeDownload !== false

  // Window settings
  const windowBehavior = document.getElementById('windowBehavior')
  if (windowBehavior) windowBehavior.value = settings.windowBehavior || 'close'

  const startMinimized = document.getElementById('startMinimized')
  if (startMinimized) startMinimized.checked = settings.startMinimized || false

  const autoStartNode = document.getElementById('autoStartNode')
  if (autoStartNode) autoStartNode.checked = settings.autoStartNode !== false

  const showNotifications = document.getElementById('showNotifications')
  if (showNotifications) showNotifications.checked = settings.showNotifications !== false

  const theme = document.getElementById('theme')
  if (theme) theme.value = settings.theme || 'system'

  const language = document.getElementById('language')
  if (language) language.value = settings.language || 'en'
}

function setupSettingsNavigation() {
  console.log('Setting up settings navigation...')

  const navItems = document.querySelectorAll('#settingsInterface .nav-item')
  const panels = document.querySelectorAll('#settingsInterface .settings-panel')

  console.log('Found nav items:', navItems.length)
  console.log('Found panels:', panels.length)

  // 移除旧的事件监听器并重新绑定
  navItems.forEach((item, index) => {
    // 克隆节点以移除旧的事件监听器
    const newItem = item.cloneNode(true)
    item.parentNode.replaceChild(newItem, item)
  })

  // 重新获取导航项
  const newNavItems = document.querySelectorAll('#settingsInterface .nav-item')

  newNavItems.forEach((item) => {
    item.addEventListener('click', () => {
      const category = item.dataset.category
      console.log('Nav item clicked:', category)

      if (!category) {
        console.error('No category found for nav item')
        return
      }

      // 更新导航状态
      newNavItems.forEach(nav => nav.classList.remove('active'))
      item.classList.add('active')

      // 更新面板显示
      panels.forEach(panel => panel.classList.remove('active'))
      const targetPanel = document.getElementById(`${category}-panel`)
      if (targetPanel) {
        targetPanel.classList.add('active')
        console.log(`Switched to panel: ${category}`)
      } else {
        console.error(`Panel not found: ${category}-panel`)
      }
    })
  })

  // 设置表单事件监听器
  setupFormEventListeners()
}

// 设置表单事件监听器
function setupFormEventListeners() {
  console.log('Setting up form event listeners...')

  // Range输入
  const rangeInputs = document.querySelectorAll('#settingsInterface input[type="range"]')
  rangeInputs.forEach(input => {
    input.addEventListener('input', updateRangeValue)
    input.addEventListener('change', markUnsaved)
  })

  // 其他输入
  const inputs = document.querySelectorAll('#settingsInterface input, #settingsInterface select')
  inputs.forEach(input => {
    if (input.type !== 'range') {
      input.addEventListener('change', markUnsaved)
    }
  })

  // 更新所有range值显示
  updateAllRangeValues()
}

// 更新range值显示
function updateRangeValue(event) {
  const input = event.target
  const valueSpan = input.parentNode.querySelector('.range-value')
  if (valueSpan) {
    let value = input.value

    // 格式化特定值
    if (input.id === 'connectionTimeout') {
      value = `${value}s`
    } else if (input.id === 'memoryLimit' || input.id === 'diskCacheSize') {
      value = `${value}MB`
    } else if (input.id === 'backupInterval') {
      value = value === '1' ? '1 hour' : `${value} hours`
    }

    valueSpan.textContent = value
  }
  markUnsaved()
}

// 更新所有range值
function updateAllRangeValues() {
  const rangeInputs = document.querySelectorAll('#settingsInterface input[type="range"]')
  rangeInputs.forEach(input => {
    updateRangeValue({ target: input })
  })
}

// 标记为未保存
function markUnsaved() {
  hasUnsavedChanges = true
  window.hasUnsavedChanges = true

  const saveButton = document.querySelector('#settingsInterface .btn-primary')
  if (saveButton && !saveButton.textContent.includes('*')) {
    saveButton.textContent = (window.i18n ? window.i18n.t('settings.saveChanges') : 'Save Changes') + ' *'
  }
}

async function saveAllSettings() {
  console.log('Starting to save settings...')

  try {
    const settings = collectSettingsFromForm()
    console.log('Collected settings:', settings)

    const result = await window.electronAPI.saveSettings(settings)
    console.log('Save result:', result)

    // 检查保存结果 - 修复重复消息问题
    if (result && result.success === false) {
      throw new Error(result.error || 'Settings save failed')
    }

    // 保存成功
    hasUnsavedChanges = false
    window.hasUnsavedChanges = false

    const saveButton = document.querySelector('#settingsInterface .btn-primary')
    if (saveButton) {
      saveButton.textContent = window.i18n ? window.i18n.t('settings.saveChanges') : 'Save Changes'
    }

    showMessage(window.i18n ? window.i18n.t('message.settingsSaved') : 'Settings saved successfully', 'success')

    // 应用语言更改
    if (settings.language !== currentSettings.language) {
      if (window.i18n) {
        window.i18n.setLanguage(settings.language)
      }
    }

    currentSettings = settings
    console.log('Settings saved successfully')

  } catch (error) {
    console.error('Error saving settings:', error)
    showMessage(
      window.i18n ?
        window.i18n.t('message.settingsFailed') :
        `Failed to save settings: ${error.message}`,
      'error'
    )
  }
}

function collectSettingsFromForm() {
  return {
    downloadPath: document.getElementById('downloadPath')?.value || '',
    autoCreateSubfolders: document.getElementById('autoCreateSubfolders')?.checked || false,
    maxConcurrentDownloads: parseInt(document.getElementById('maxConcurrentDownloads')?.value) || 3,
    chunkSize: parseInt(document.getElementById('chunkSize')?.value) || 262144,
    enableResumeDownload: document.getElementById('enableResumeDownload')?.checked !== false,
    windowBehavior: document.getElementById('windowBehavior')?.value || 'close',
    startMinimized: document.getElementById('startMinimized')?.checked || false,
    autoStartNode: document.getElementById('autoStartNode')?.checked !== false,
    showNotifications: document.getElementById('showNotifications')?.checked !== false,
    theme: document.getElementById('theme')?.value || 'system',
    language: document.getElementById('language')?.value || 'en'
  }
}

async function resetAllSettings() {
  const confirmMessage = window.i18n ?
    window.i18n.t('confirm.resetSettings') :
    'This will reset all settings to their default values. This action cannot be undone.'

  if (confirm(confirmMessage)) {
    try {
      console.log('Resetting all settings...')

      const result = await window.electronAPI.resetSettings()
      console.log('Reset result:', result)

      if (result && result.success === false) {
        throw new Error(result.error || 'Settings reset failed')
      }

      await loadSettings()
      updateAllRangeValues()
      hasUnsavedChanges = false
      window.hasUnsavedChanges = false

      const saveButton = document.querySelector('#settingsInterface .btn-primary')
      if (saveButton) {
        saveButton.textContent = window.i18n ? window.i18n.t('settings.saveChanges') : 'Save Changes'
      }

      showMessage(window.i18n ? window.i18n.t('message.settingsReset') : 'All settings reset to defaults', 'success')

    } catch (error) {
      console.error('Error resetting settings:', error)
      showMessage(`Failed to reset settings: ${error.message}`, 'error')
    }
  }
}

async function selectDownloadPath() {
  try {
    const result = await window.electronAPI.selectFolder('Select Download Location')
    if (result && result.success && !result.cancelled && result.filePaths.length > 0) {
      const downloadPath = document.getElementById('downloadPath')
      if (downloadPath) {
        downloadPath.value = result.filePaths[0]
        hasUnsavedChanges = true
        const saveButton = document.querySelector('#settingsInterface .btn-primary')
        if (saveButton && !saveButton.textContent.includes('*')) {
          saveButton.textContent = window.i18n ? window.i18n.t('settings.saveChanges') + ' *' : 'Save Changes *'
        }
      }
    }
  } catch (error) {
    console.error('Error selecting download path:', error)
    showMessage('Failed to select folder', 'error')
  }
}

// Simplified confirmation dialog
function showConfirmDialog(title, message, onConfirm) {
  if (confirm(message)) {
    onConfirm()
  }
}

// Make settings functions global
window.saveAllSettings = saveAllSettings
window.resetAllSettings = resetAllSettings
window.selectDownloadPath = selectDownloadPath
window.hasUnsavedChanges = false

// Open settings - modified to show in same window
async function openSettings() {
  try {
    showSettings()
    console.log('Settings interface shown')
  } catch (error) {
    console.error('Error opening settings:', error)
    showMessage(window.i18n ? window.i18n.t('message.settingsFailed') : 'Failed to open settings', 'error')
  }
}

// 确保函数全局可用
window.handleLanguageChange = handleLanguageChange
window.updateRangeValue = updateRangeValue
window.updateAllRangeValues = updateAllRangeValues
window.markUnsaved = markUnsaved