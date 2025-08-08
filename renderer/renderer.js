// renderer/renderer.js

// ==========================================
// 1. 全局状态和变量
// ==========================================

let currentSearchAbort = null
let searchTimeout = null
let currentInterface = 'main'
let hasUnsavedChanges = false
let isNodeStarted = false
let selectedFiles = []
let downloadInterval = null
let isAutoStarting = false
let currentSettings = {}
let pageTransitionManager = null

// DOM元素缓存
const elements = {
  // 主要控制元素
  startNode: null,
  stopNode: null,
  openSettings: null,
  nodeStatus: null,
  nodeInfo: null,
  
  // 连接相关
  peerAddress: null,
  connectPeer: null,
  
  // DHT和统计
  dhtStats: null,
  refreshStats: null,
  
  // 文件相关
  selectFiles: null,
  shareSelected: null,
  selectedFiles: null,
  searchInput: null,
  searchFiles: null,
  localFiles: null,
  searchResults: null,
  
  // 下载相关
  activeDownloads: null,
  refreshDownloads: null,
  
  // 数据库相关
  databaseStats: null,
  refreshDatabaseStats: null,
  cleanupDatabase: null,
  exportData: null,
  importData: null
}

// ==========================================
// 2. 消息管理系统
// ==========================================

class MessageManager {
  constructor() {
    this.messages = new Map()
    this.messageCount = 0
    this.maxMessages = 5
    this.defaultDuration = 5000
    this.createMessageContainer()
  }

  createMessageContainer() {
    let container = document.getElementById('messageContainer')
    if (!container) {
      container = document.createElement('div')
      container.id = 'messageContainer'
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

// 创建全局消息管理器实例
const messageManager = new MessageManager()

// ==========================================
// 3. 消息接口函数
// ==========================================

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

// 导出消息函数到全局作用域
Object.assign(window, {
  showMessage, showSuccess, showError, showWarning, showInfo,
  clearAllMessages, showPersistent, updateMessage, closeMessage
})

// ==========================================
// 4. 页面切换动画管理器
// ==========================================

class PageTransitionManager {
  constructor() {
    this.isTransitioning = false
    this.currentPage = 'main'
    this.transitionDuration = 400 // ms
    this.init()
  }

  init() {
    this.createPageOverlay()
    this.setupInitialStates()
  }

  createPageOverlay() {
    if (document.querySelector('.page-overlay')) return

    const overlay = document.createElement('div')
    overlay.className = 'page-overlay'
    document.body.appendChild(overlay)
  }

  setupInitialStates() {
    const mainInterface = document.getElementById('mainInterface')
    const settingsInterface = document.getElementById('settingsInterface')

    if (mainInterface) {
      mainInterface.style.display = 'flex'
      mainInterface.classList.remove('slide-out-left', 'slide-in-left')
    }

    if (settingsInterface) {
      settingsInterface.style.display = 'none'
      settingsInterface.classList.remove('slide-in-right', 'slide-out-right')
    }
  }

  // 重置元素到初始状态
  resetElementState(element, isSettings = false) {
    if (!element) return

    // 移除所有动画类
    element.classList.remove('slide-out-left', 'slide-in-left', 'slide-in-right', 'slide-out-right')

    // 重置transform和opacity
    element.style.transform = ''
    element.style.opacity = ''

    // 强制重绘
    element.offsetHeight

    if (isSettings) {
      // 设置界面重置到右侧位置
      element.style.transform = 'translateX(100%)'
      element.style.opacity = '0'
    } else {
      // 主界面重置到正常位置
      element.style.transform = 'translateX(0)'
      element.style.opacity = '1'
    }

    // 再次强制重绘
    element.offsetHeight
  }

  // 切换到设置页面（向右滑入）
  async showSettings() {
    if (this.isTransitioning || this.currentPage === 'settings') return

    console.log('Starting transition to settings page')
    this.isTransitioning = true
    document.body.classList.add('page-transitioning')

    const mainInterface = document.getElementById('mainInterface')
    const settingsInterface = document.getElementById('settingsInterface')
    const overlay = document.querySelector('.page-overlay')

    try {
      // 显示遮罩
      if (overlay) {
        overlay.classList.add('active')
      }

      // 重置设置界面状态
      this.resetElementState(settingsInterface, true)

      // 显示设置界面
      settingsInterface.style.display = 'flex'

      // 等待一帧确保display生效
      await this.waitForNextFrame()

      // 开始动画
      const animationPromises = []

      // 主界面向左滑出
      if (mainInterface) {
        animationPromises.push(this.animateElement(mainInterface, () => {
          mainInterface.style.transform = 'translateX(-100%)'
          mainInterface.style.opacity = '0.8'
        }))
      }

      // 设置界面从右滑入
      if (settingsInterface) {
        animationPromises.push(this.animateElement(settingsInterface, () => {
          settingsInterface.style.transform = 'translateX(0)'
          settingsInterface.style.opacity = '1'
        }))
      }

      await Promise.all(animationPromises)

      // 隐藏主界面
      if (mainInterface) {
        mainInterface.style.display = 'none'
      }

      this.currentPage = 'settings'
      console.log('Transition to settings completed')

    } catch (error) {
      console.error('Error during settings transition:', error)
      this.forceSwitch('settings')
    } finally {
      this.isTransitioning = false
      document.body.classList.remove('page-transitioning')

      if (overlay) {
        overlay.classList.remove('active')
      }
    }
  }

  // 切换到主页面（向左滑入）
  async showMain() {
    if (this.isTransitioning || this.currentPage === 'main') return

    console.log('Starting transition to main page')
    this.isTransitioning = true
    document.body.classList.add('page-transitioning')

    const mainInterface = document.getElementById('mainInterface')
    const settingsInterface = document.getElementById('settingsInterface')
    const overlay = document.querySelector('.page-overlay')

    try {
      // 显示遮罩
      if (overlay) {
        overlay.classList.add('active')
      }

      // 重置主界面状态（从左侧位置开始）
      this.resetElementState(mainInterface, false)
      if (mainInterface) {
        mainInterface.style.transform = 'translateX(-100%)'
        mainInterface.style.opacity = '0.8'
      }

      // 显示主界面
      if (mainInterface) {
        mainInterface.style.display = 'flex'
      }

      // 等待一帧确保display生效
      await this.waitForNextFrame()

      // 开始动画
      const animationPromises = []

      // 设置界面向右滑出
      if (settingsInterface) {
        animationPromises.push(this.animateElement(settingsInterface, () => {
          settingsInterface.style.transform = 'translateX(100%)'
          settingsInterface.style.opacity = '0'
        }))
      }

      // 主界面从左滑入
      if (mainInterface) {
        animationPromises.push(this.animateElement(mainInterface, () => {
          mainInterface.style.transform = 'translateX(0)'
          mainInterface.style.opacity = '1'
        }))
      }

      await Promise.all(animationPromises)

      // 隐藏设置界面
      if (settingsInterface) {
        settingsInterface.style.display = 'none'
      }

      this.currentPage = 'main'
      console.log('Transition to main completed')

    } catch (error) {
      console.error('Error during main transition:', error)
      this.forceSwitch('main')
    } finally {
      this.isTransitioning = false
      document.body.classList.remove('page-transitioning')

      if (overlay) {
        overlay.classList.remove('active')
      }
    }
  }

  // 等待下一帧
  waitForNextFrame() {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve)
      })
    })
  }

  // 动画辅助函数
  animateElement(element, transformFn) {
    return new Promise((resolve) => {
      if (!element) {
        resolve()
        return
      }

      let resolved = false

      const handleTransitionEnd = (e) => {
        if (e.target === element && (e.propertyName === 'transform' || e.propertyName === 'opacity')) {
          if (!resolved) {
            resolved = true
            element.removeEventListener('transitionend', handleTransitionEnd)
            resolve()
          }
        }
      }

      element.addEventListener('transitionend', handleTransitionEnd)
      transformFn()

      // 超时保护
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          element.removeEventListener('transitionend', handleTransitionEnd)
          console.warn('Animation timeout, forcing completion')
          resolve()
        }
      }, this.transitionDuration + 200)
    })
  }

  // 强制切换（无动画）
  forceSwitch(targetPage) {
    const mainInterface = document.getElementById('mainInterface')
    const settingsInterface = document.getElementById('settingsInterface')

    if (targetPage === 'settings') {
      if (mainInterface) {
        mainInterface.style.display = 'none'
      }
      if (settingsInterface) {
        settingsInterface.style.display = 'flex'
        this.resetElementState(settingsInterface, false)
      }
      this.currentPage = 'settings'
    } else {
      if (settingsInterface) {
        settingsInterface.style.display = 'none'
      }
      if (mainInterface) {
        mainInterface.style.display = 'flex'
        this.resetElementState(mainInterface, false)
      }
      this.currentPage = 'main'
    }
  }

  getCurrentPage() {
    return this.currentPage
  }

  isTransitioningNow() {
    return this.isTransitioning
  }
}

// ==========================================
// 5. 初始化和DOM管理
// ==========================================

// 初始化DOM元素
function initializeDOMElements() {
  Object.keys(elements).forEach(key => {
    const element = document.getElementById(key)
    if (element) {
      elements[key] = element
    }
  })
}

// 初始化导航功能
function initializeNavigation() {
  // 主界面导航
  const mainNavItems = document.querySelectorAll('#mainInterface .nav-item')
  const contentSections = document.querySelectorAll('.content-section')

  mainNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.dataset.section

      // 更新导航
      mainNavItems.forEach(nav => nav.classList.remove('active'))
      item.classList.add('active')

      // 更新内容
      contentSections.forEach(section => section.classList.remove('active'))
      const targetSection = document.getElementById(`${sectionId}-section`)
      if (targetSection) {
        targetSection.classList.add('active')
      }
    })
  })

  // 设置导航
  const settingsNavItems = document.querySelectorAll('#settingsInterface .nav-item')

  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const category = item.dataset.category

      // 更新导航
      settingsNavItems.forEach(nav => nav.classList.remove('active'))
      item.classList.add('active')

      // 更新面板
      switchSettingsPanel(category)
    })
  })
}

// 设置事件监听器
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

  // 搜索输入回车键
  if (elements.searchInput) {
    elements.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchFiles()
      }
    })
  }

  // 对等节点地址输入回车键
  if (elements.peerAddress) {
    elements.peerAddress.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        connectToPeer()
      }
    })
  }
}

// ==========================================
// 6. 界面切换功能
// ==========================================

// 显示设置界面
function showSettings() {
  if (!pageTransitionManager) {
    pageTransitionManager = new PageTransitionManager()
  }

  console.log('showSettings called, current page:', pageTransitionManager.getCurrentPage())

  pageTransitionManager.showSettings().then(() => {
    currentInterface = 'settings'
    loadSettingsContent()
  }).catch(error => {
    console.error('Failed to show settings with animation:', error)
    // 降级到原来的切换方式
    document.getElementById('mainInterface').style.display = 'none'
    document.getElementById('settingsInterface').style.display = 'flex'
    currentInterface = 'settings'
    loadSettingsContent()
  })
}

// 返回主界面
function goBackToMain() {
  if (!pageTransitionManager) {
    pageTransitionManager = new PageTransitionManager()
  }

  console.log('goBackToMain called, current page:', pageTransitionManager.getCurrentPage())

  pageTransitionManager.showMain().then(() => {
    currentInterface = 'main'
    hasUnsavedChanges = false
  }).catch(error => {
    console.error('Failed to show main with animation:', error)
    hideSettings()
  })
}

// 隐藏设置界面（降级方案）
function hideSettings() {
  const mainInterface = document.getElementById('mainInterface')
  const settingsInterface = document.getElementById('settingsInterface')

  if (settingsInterface) {
    settingsInterface.style.display = 'none'
    settingsInterface.style.transform = ''
    settingsInterface.style.opacity = ''
  }

  if (mainInterface) {
    mainInterface.style.display = 'flex'
    mainInterface.style.transform = ''
    mainInterface.style.opacity = ''
  }

  currentInterface = 'main'
  hasUnsavedChanges = false

  if (pageTransitionManager) {
    pageTransitionManager.currentPage = 'main'
  }
}

// ==========================================
// 7. P2P节点控制功能
// ==========================================

// 打开设置
async function openSettings() {
  try {
    showSettings()
    console.log('Settings interface shown')
  } catch (error) {
    console.error('Error opening settings:', error)
    showMessage('Failed to open settings', 'error')
  }
}

// 启动节点
async function startNode() {
  if (isAutoStarting) {
    showWarning('Node is auto-starting, please wait')
    return
  }

  if (isNodeStarted) {
    showMessage('Node already started')
    return
  }

  try {
    elements.startNode.disabled = true
    elements.startNode.textContent = 'Starting...'
    updateNodeStatus('connecting')

    const result = await window.electronAPI.startP2PNode()

    if (result.success) {
      updateButtonStates(true)
      updateNodeInfo(result.nodeInfo)
      startStatsRefresh()
      showSuccess('P2P node started successfully')
    } else {
      updateButtonStates(false)
      showError(`Failed to start P2P node: ${result.error}`)
    }
  } catch (error) {
    updateButtonStates(false)
    showError(`Failed to start P2P node: ${error.message}`)
  }
}

// 停止节点
async function stopNode() {
  if (!isNodeStarted) {
    showMessage('Please start P2P node first')
    return
  }

  try {
    elements.stopNode.disabled = true
    elements.stopNode.textContent = 'Stopping...'
    updateNodeStatus('connecting')

    const result = await window.electronAPI.stopP2PNode()

    if (result.success) {
      updateButtonStates(false)
      elements.nodeInfo.innerHTML = '<p>Node stopped</p>'
      elements.dhtStats.innerHTML = '<p>DHT not running</p>'

      if (downloadInterval) {
        clearInterval(downloadInterval)
        downloadInterval = null
      }

      showSuccess('P2P node stopped')
    } else {
      elements.stopNode.disabled = false
      elements.stopNode.textContent = 'Stop Node'
      updateNodeStatus('online')
      showError(`Failed to stop P2P node: ${result.error}`)
    }
  } catch (error) {
    elements.stopNode.disabled = false
    elements.stopNode.textContent = 'Stop Node'
    updateNodeStatus('online')
    showError(`Failed to stop P2P node: ${error.message}`)
  }
}

// 更新按钮状态
function updateButtonStates(nodeStarted) {
  isNodeStarted = nodeStarted

  if (nodeStarted) {
    if (elements.startNode) {
      elements.startNode.disabled = true
      elements.startNode.textContent = 'Start Node'
    }
    if (elements.stopNode) {
      elements.stopNode.disabled = false
      elements.stopNode.textContent = 'Stop Node'
    }
    updateNodeStatus('online')
  } else {
    if (elements.startNode) {
      elements.startNode.disabled = false
      elements.startNode.textContent = 'Start Node'
    }
    if (elements.stopNode) {
      elements.stopNode.disabled = true
      elements.stopNode.textContent = 'Stop Node'
    }
    updateNodeStatus('offline')
  }
}

// 更新节点状态
function updateNodeStatus(status) {
  if (elements.nodeStatus) {
    elements.nodeStatus.className = `node-status ${status}`

    const statusTexts = {
      'online': 'Online',
      'offline': 'Offline',
      'connecting': 'Starting'
    }
    elements.nodeStatus.textContent = statusTexts[status] || status
  }
}

// 更新节点信息
function updateNodeInfo(nodeInfo) {
  if (nodeInfo && elements.nodeInfo) {
    elements.nodeInfo.innerHTML = `
      <p><strong>Node ID:</strong> ${nodeInfo.peerId}</p>
      <p><strong>Connected Peers:</strong> ${nodeInfo.connectedPeers}</p>
      <p><strong>Discovered Peers:</strong> ${nodeInfo.discoveredPeers || 0}</p>
      <p><strong>Listen Addresses:</strong></p>
      <ul>
        ${nodeInfo.addresses.map(addr => `<li>${addr}</li>`).join('')}
      </ul>
    `
  }
}

// ==========================================
// 8. 连接管理功能
// ==========================================

// 检查是否是引导节点
function isBootstrapPeerId(peerId) {
  const bootstrapPeerIds = [
    'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    'QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
  ]
  return bootstrapPeerIds.includes(peerId)
}

// 连接到对等节点
async function connectToPeer() {
  if (!isNodeStarted) {
    showWarning('Please start P2P node first')
    return
  }

  const address = elements.peerAddress.value.trim()
  if (!address) {
    showWarning('Please enter a valid peer address')
    return
  }

  try {
    elements.connectPeer.disabled = true
    elements.connectPeer.textContent = 'Connecting...'

    const result = await window.electronAPI.connectToPeer(address)

    if (result.success) {
      showSuccess('Successfully connected to peer')
      elements.peerAddress.value = ''
      await refreshStats()
    } else {
      showError(`Connection failed: ${result.error}`)
    }
  } catch (error) {
    showError(`Connection failed: ${error.message}`)
  } finally {
    elements.connectPeer.disabled = false
    elements.connectPeer.textContent = 'Connect'
  }
}

// 连接到发现的对等节点
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

// 刷新发现的对等节点
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

// ==========================================
// 9. 统计和DHT功能
// ==========================================

// 刷新统计信息
async function refreshStats() {
  if (!isNodeStarted) return

  try {
    const nodeInfo = await window.electronAPI.getNodeInfo()
    updateNodeInfo(nodeInfo)

    const dhtStats = await window.electronAPI.getDHTStats()
    if (dhtStats && elements.dhtStats) {
      elements.dhtStats.innerHTML = `
        <p><strong>Connected Peers:</strong> ${dhtStats.connectedPeers}</p>
        <p><strong>Routing Table Size:</strong> ${dhtStats.routingTableSize}</p>
        <p><strong>Local Files:</strong> ${dhtStats.localFiles}</p>
      `
    } else if (elements.dhtStats) {
      elements.dhtStats.innerHTML = '<p>DHT not initialized</p>'
    }

    await refreshLocalFiles()
    await refreshDatabaseStats()
  } catch (error) {
    console.error('Error refreshing stats:', error)
  }
}

// 开始统计刷新
function startStatsRefresh() {
  if (downloadInterval) {
    clearInterval(downloadInterval)
  }

  refreshStats()
  downloadInterval = setInterval(refreshStats, 30000)
  setInterval(refreshDownloads, 5000)
}

// ==========================================
// 10. 文件管理功能
// ==========================================

// 选择文件
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

// 更新已选择文件显示
function updateSelectedFilesDisplay() {
  if (!elements.selectedFiles) return

  if (selectedFiles.length === 0) {
    elements.selectedFiles.innerHTML = '<p>No files selected</p>'
  } else {
    const selectedText = `Selected ${selectedFiles.length} files:`

    const fileList = selectedFiles.map(filePath => {
      const fileName = filePath.split(/[/\\]/).pop()
      return `<div class="selected-file">
        <span>${fileName}</span>
        <button onclick="removeSelectedFile('${filePath}')">Remove</button>
      </div>`
    }).join('')

    elements.selectedFiles.innerHTML = `
      <p>${selectedText}</p>
      ${fileList}
    `
  }
}

// 移除选择的文件
function removeSelectedFile(filePath) {
  selectedFiles = selectedFiles.filter(path => path !== filePath)
  updateSelectedFilesDisplay()
  elements.shareSelected.disabled = selectedFiles.length === 0
}

// 分享选择的文件
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
          const fileName = filePath.split(/[/\\]/).pop()
          console.log(`File shared: ${fileName}, waiting for DHT sync...`)
          await new Promise(resolve => setTimeout(resolve, 3000))

          // 验证文件是否可以被搜索到
          try {
            const searchTest = await window.electronAPI.searchFiles(fileName.split('.')[0])
            if (searchTest.success && searchTest.results.length > 0) {
              console.log(`✓ File ${fileName} is searchable in DHT`)
            } else {
              console.warn(`⚠ File ${fileName} may not be properly indexed`)
            }
          } catch (error) {
            console.debug('Search verification failed:', error)
          }
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

// 刷新本地文件
async function refreshLocalFiles() {
  try {
    const files = await window.electronAPI.getLocalFiles()

    if (files.length === 0) {
      if (elements.localFiles) {
        elements.localFiles.innerHTML = '<p>No local files</p>'
      }
    } else {
      const localCountText = `Local Files (${files.length}):`

      const fileList = files.map(file => `
        <div class="file-item">
          <div class="file-info">
            <h4>${file.name}</h4>
            <p>Size: ${formatFileSize(file.size)}</p>
            <p>Hash: ${file.hash}</p>
            <p>Shared Time: ${formatRelativeTime(file.sharedAt || file.timestamp || file.savedAt)}</p>
          </div>
        </div>
      `).join('')

      if (elements.localFiles) {
        elements.localFiles.innerHTML = `
          <p>${localCountText}</p>
          ${fileList}
        `
      }
    }
  } catch (error) {
    console.error('Error refreshing local files:', error)
  }
}

// ==========================================
// 11. 搜索功能
// ==========================================

// 搜索文件
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

  // 取消之前的搜索
  if (currentSearchAbort) {
    currentSearchAbort.abort()
  }
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  try {
    currentSearchAbort = new AbortController()
    
    // 更新UI状态
    elements.searchFiles.disabled = true
    elements.searchFiles.textContent = 'Searching...'
    elements.searchResults.innerHTML = '<p>🔍 Searching files...</p>'

    // 设置搜索超时
    searchTimeout = setTimeout(() => {
      if (currentSearchAbort) {
        currentSearchAbort.abort()
        showMessage('Search timeout - showing partial results', 'warning')
      }
    }, 12000) // 12秒总超时

    const result = await window.electronAPI.searchFiles(query)

    // 清除超时
    clearTimeout(searchTimeout)
    searchTimeout = null
    currentSearchAbort = null

    if (result.success) {
      displaySearchResults(result.results, result.searchTime, result.sources)
      
      if (result.results.length === 0) {
        showMessage('No files found matching your search', 'info')
      } else {
        showMessage(`Found ${result.results.length} files in ${result.searchTime}ms`, 'success')
      }
    } else if (result.cancelled) {
      elements.searchResults.innerHTML = '<p>Search cancelled</p>'
    } else {
      showMessage(`Search failed: ${result.error}`, 'error')
      elements.searchResults.innerHTML = '<p>Search failed</p>'
    }
  } catch (error) {
    showMessage(`Search error: ${error.message}`, 'error')
    elements.searchResults.innerHTML = '<p>Search error</p>'
  } finally {
    // 重置UI状态
    elements.searchFiles.disabled = false
    elements.searchFiles.textContent = 'Search'
    currentSearchAbort = null
    
    if (searchTimeout) {
      clearTimeout(searchTimeout)
      searchTimeout = null
    }
  }
}

// 显示搜索结果
function displaySearchResults(results, searchTime, sources) {
  if (results.length === 0) {
    elements.searchResults.innerHTML = '<p>No matching files found</p>'
  } else {
    const sourceInfo = sources ? 
      `<p class="search-info">Found ${results.length} files in ${searchTime}ms (Local: ${sources.local}, Network: ${sources.network})</p>` 
      : ''
    
    const resultList = results.map(file => `
      <div class="file-item ${file.source === 'local' ? 'local-file' : 'network-file'}">
        <div class="file-info">
          <h4>${file.name} ${file.source === 'local' ? '📁' : '🌐'}</h4>
          <p>Size: ${formatFileSize(file.size)}</p>
          <p>Hash: ${file.hash}</p>
          <p>Source: ${file.source || 'unknown'}</p>
          <p>Time: ${new Date(file.timestamp || file.savedAt || Date.now()).toLocaleString()}</p>
        </div>
        <div class="file-actions">
          <button onclick="window.downloadFile('${file.hash}', '${file.name}')">Download</button>
        </div>
      </div>
    `).join('')

    elements.searchResults.innerHTML = sourceInfo + resultList
  }
}

// ==========================================
// 12. 下载管理功能
// ==========================================

// 下载文件
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

// 刷新下载状态
async function refreshDownloads() {
  try {
    const downloads = await window.electronAPI.getActiveDownloads()

    if (downloads.length === 0) {
      if (elements.activeDownloads) {
        elements.activeDownloads.innerHTML = '<p>No active downloads</p>'
      }
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

      if (elements.activeDownloads) {
        elements.activeDownloads.innerHTML = downloadList
      }
    }
  } catch (error) {
    console.error('Error refreshing downloads:', error)
  }
}

// 暂停下载
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

// 恢复下载
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

// 取消下载
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

// ==========================================
// 13. 数据库管理功能
// ==========================================

// 刷新数据库统计
async function refreshDatabaseStats() {
  try {
    const stats = await window.electronAPI.getDatabaseStats()

    if (stats && elements.databaseStats) {
      elements.databaseStats.innerHTML = `
        <p><strong>Node Records:</strong> ${stats.nodes}</p>
        <p><strong>File Records:</strong> ${stats.files}</p>
        <p><strong>Peer Records:</strong> ${stats.peers}</p>
        <p><strong>Transfer Records:</strong> ${stats.transfers}</p>
        <p><strong>Config Items:</strong> ${stats.config}</p>
        <p><strong>Status:</strong> ${stats.initialized ? 'Initialized' : 'Not Initialized'}</p>
      `
    } else if (elements.databaseStats) {
      elements.databaseStats.innerHTML = '<p>Database not initialized</p>'
    }
  } catch (error) {
    console.error('Error refreshing database stats:', error)
  }
}

// 清理数据库
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

// 导出数据
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

// 导入数据
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

// ==========================================
// 14. 设置管理功能
// ==========================================

// 加载设置内容
async function loadSettingsContent() {
  const settingsContent = document.getElementById('settingsContent')

  try {
    const response = await fetch('settings.html')
    const html = await response.text()
    settingsContent.innerHTML = html

    setupSettingsNavigation()
    await loadSettings()
  } catch (error) {
    console.error('Error loading settings content:', error)
    createFallbackSettings(settingsContent)
  }
}

// 创建后备设置
function createFallbackSettings(container) {
  container.innerHTML = `
    <div class="settings-panel active" id="window-panel">
      <div class="panel-header">
        <h2>Settings</h2>
        <p>Basic settings panel</p>
      </div>
      <div class="settings-group">
        <p>Settings content could not be loaded.</p>
      </div>
    </div>
  `
}

// 切换设置面板
function switchSettingsPanel(category) {
  const panels = document.querySelectorAll('#settingsContent .settings-panel')
  panels.forEach(panel => panel.classList.remove('active'))

  const targetPanel = document.getElementById(`${category}-panel`)
  if (targetPanel) {
    targetPanel.classList.add('active')
  }
}

// 设置设置导航
function setupSettingsNavigation() {
  console.log('Setting up settings navigation...')

  const navItems = document.querySelectorAll('#settingsInterface .nav-item')
  const panels = document.querySelectorAll('#settingsContent .settings-panel')

  console.log('Found nav items:', navItems.length)
  console.log('Found panels:', panels.length)

  // 移除旧事件监听器并重新绑定
  navItems.forEach((item, index) => {
    const newItem = item.cloneNode(true)
    item.parentNode.replaceChild(newItem, item)
  })

  // 重新查询导航项
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

  setupFormEventListeners()
}

// 设置表单事件监听器
function setupFormEventListeners() {
  console.log('Setting up form event listeners...')

  // 范围输入
  const rangeInputs = document.querySelectorAll('#settingsContent input[type="range"]')
  rangeInputs.forEach(input => {
    input.addEventListener('input', updateRangeValue)
    input.addEventListener('change', markUnsaved)
  })

  // 其他输入
  const inputs = document.querySelectorAll('#settingsContent input, #settingsContent select')
  inputs.forEach(input => {
    if (input.type !== 'range') {
      input.addEventListener('change', markUnsaved)
    }
  })

  updateAllRangeValues()
}

// 加载设置
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

// 填充设置表单
function populateSettingsForm(settings) {
  // 下载设置
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

  // 窗口设置
  const windowBehavior = document.getElementById('windowBehavior')
  if (windowBehavior) windowBehavior.value = settings.windowBehavior || 'close'

  const autoStartNode = document.getElementById('autoStartNode')
  if (autoStartNode) autoStartNode.checked = settings.autoStartNode !== false
}

// 更新范围值显示
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

// 更新所有范围值
function updateAllRangeValues() {
  const rangeInputs = document.querySelectorAll('#settingsContent input[type="range"]')
  rangeInputs.forEach(input => {
    updateRangeValue({ target: input })
  })
}

// 标记为未保存
function markUnsaved() {
  hasUnsavedChanges = true
  window.hasUnsavedChanges = true
}

// 保存所有设置
async function saveAllSettings() {
  console.log('Starting to save settings...')

  try {
    const settings = collectSettingsFromForm()
    console.log('Collected settings:', settings)

    const result = await window.electronAPI.saveSettings(settings)
    console.log('Save result:', result)

    if (result && result.success === false) {
      throw new Error(result.error || 'Settings save failed')
    }

    hasUnsavedChanges = false
    window.hasUnsavedChanges = false

    showMessage('Settings saved successfully', 'success')

    currentSettings = settings
    console.log('Settings saved successfully')

  } catch (error) {
    console.error('Error saving settings:', error)
    showMessage(`Failed to save settings: ${error.message}`, 'error')
  }
}

// 从表单收集设置
function collectSettingsFromForm() {
  return {
    downloadPath: document.getElementById('downloadPath')?.value || '',
    autoCreateSubfolders: document.getElementById('autoCreateSubfolders')?.checked || false,
    maxConcurrentDownloads: parseInt(document.getElementById('maxConcurrentDownloads')?.value) || 3,
    chunkSize: parseInt(document.getElementById('chunkSize')?.value) || 262144,
    enableResumeDownload: document.getElementById('enableResumeDownload')?.checked !== false,
    windowBehavior: document.getElementById('windowBehavior')?.value || 'close',
    autoStartNode: document.getElementById('autoStartNode')?.checked !== false,
  }
}

// 重置所有设置
async function resetAllSettings() {
  const confirmMessage = 'This will reset all settings to their default values. This action cannot be undone.'

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

      showMessage('All settings reset to defaults', 'success')

    } catch (error) {
      console.error('Error resetting settings:', error)
      showMessage(`Failed to reset settings: ${error.message}`, 'error')
    }
  }
}

// 选择下载路径
async function selectDownloadPath() {
  try {
    const result = await window.electronAPI.selectFolder('Select Download Location')
    if (result && result.success && !result.cancelled && result.filePaths.length > 0) {
      const downloadPath = document.getElementById('downloadPath')
      if (downloadPath) {
        downloadPath.value = result.filePaths[0]
        hasUnsavedChanges = true
      }
    }
  } catch (error) {
    console.error('Error selecting download path:', error)
    showMessage('Failed to select folder', 'error')
  }
}

// 备份和导入占位符函数
function createBackup() {
  showMessage('Creating backup...', 'info')
}

function showBackupList() {
  showMessage('Loading backup list...', 'info')
}

function exportSettings() {
  showMessage('Exporting settings...', 'info')
}

function importSettings() {
  showMessage('Opening import dialog...', 'info')
}

// ==========================================
// 15. 工具函数
// ==========================================

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化时间
function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`
}

// 格式化相对时间
function formatRelativeTime(timestamp) {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

// 获取状态文本
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

// ==========================================
// 16. 事件监听器设置
// ==========================================

// 监听自动启动事件
if (window.electronAPI) {
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

  // 监听节点状态变化事件
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
}

// ==========================================
// 17. 全局函数导出和页面初始化
// ==========================================

// 导出全局函数
Object.assign(window, {
  removeSelectedFile,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  connectToDiscoveredPeer,
  refreshDiscoveredPeers,
  goBackToMain,
  markUnsaved,
  saveAllSettings,
  resetAllSettings,
  selectDownloadPath,
  createBackup,
  showBackupList,
  exportSettings,
  importSettings,
  updateRangeValue,
  updateAllRangeValues,
  showSettings,
  pageTransitionManager,
  hasUnsavedChanges: false
})

// 调试函数
window.debugPageTransition = () => {
  if (pageTransitionManager) {
    console.log('Current page:', pageTransitionManager.getCurrentPage())
    console.log('Is transitioning:', pageTransitionManager.isTransitioningNow())

    const mainInterface = document.getElementById('mainInterface')
    const settingsInterface = document.getElementById('settingsInterface')

    console.log('Main interface:', {
      display: mainInterface?.style.display,
      transform: mainInterface?.style.transform,
      opacity: mainInterface?.style.opacity,
      classes: mainInterface?.className
    })

    console.log('Settings interface:', {
      display: settingsInterface?.style.display,
      transform: settingsInterface?.style.transform,
      opacity: settingsInterface?.style.opacity,
      classes: settingsInterface?.className
    })
  }
}

// ==========================================
// 18. 页面加载事件处理
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('P2P File Sharing System loaded')

  // 确保消息容器存在
  if (!messageManager.container) {
    messageManager.createMessageContainer()
  }

  // 初始化DOM元素
  initializeDOMElements()

  // 初始化导航
  initializeNavigation()

  // 设置事件监听器
  setupEventListeners()

  // 初始化页面状态
  updateSelectedFilesDisplay()
  refreshDatabaseStats()

  // 设置自动启动状态
  isAutoStarting = true
  if (elements.startNode) {
    elements.startNode.disabled = true
    elements.startNode.textContent = 'Auto-starting...'
  }
  if (elements.stopNode) {
    elements.stopNode.disabled = true
  }
  updateNodeStatus('connecting')

  // 延迟初始化页面切换管理器
  setTimeout(() => {
    console.log('Initializing page transition manager')
    if (!pageTransitionManager) {
      pageTransitionManager = new PageTransitionManager()
    }
  }, 100)
})