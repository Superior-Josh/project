// renderer/renderer.js

// 改进的消息显示系统 - 支持上下分布和手动关闭

// 消息管理器
class MessageManager {
  constructor() {
    this.messages = new Map() // 存储活跃的消息
    this.messageCount = 0 // 消息计数器
    this.maxMessages = 5 // 最大显示消息数量
    this.defaultDuration = 5000 // 默认显示时间（毫秒）
    
    // 创建消息容器
    this.createMessageContainer()
  }
  
  createMessageContainer() {
    // 检查是否已存在容器
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
    
    // 如果消息太多，移除最旧的
    if (this.messages.size >= this.maxMessages) {
      const oldestId = Math.min(...this.messages.keys())
      this.remove(oldestId)
    }
    
    // 创建消息元素
    const messageEl = this.createMessageElement(message, type, messageId)
    
    // 添加到容器
    this.container.appendChild(messageEl)
    
    // 存储消息信息
    this.messages.set(messageId, {
      element: messageEl,
      timer: null,
      type,
      message
    })
    
    // 设置自动关闭定时器
    if (actualDuration > 0) {
      const timer = setTimeout(() => {
        this.remove(messageId)
      }, actualDuration)
      
      this.messages.get(messageId).timer = timer
    }
    
    // 添加点击关闭事件
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
    
    // 添加进入动画
    messageEl.style.opacity = '0'
    messageEl.style.transform = 'translateX(100%)'
    
    // 触发动画
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
    
    // 清除定时器
    if (timer) {
      clearTimeout(timer)
    }
    
    // 添加移除动画
    element.classList.add('removing')
    
    // 动画完成后移除元素
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
      this.messages.delete(messageId)
    }, 300) // 与CSS动画时间匹配
  }
  
  clear() {
    // 清除所有消息
    for (const messageId of this.messages.keys()) {
      this.remove(messageId)
    }
  }
  
  getDurationByType(type) {
    const durations = {
      'success': 4000,
      'info': 5000,
      'warning': 6000,
      'error': 8000 // 错误消息显示更久
    }
    return durations[type] || this.defaultDuration
  }
  
  // 更新现有消息（如果存在相同内容）
  updateOrShow(message, type = 'info', duration = null) {
    // 查找是否有相同内容的消息
    for (const [id, info] of this.messages) {
      if (info.message === message && info.type === type) {
        // 重置定时器
        if (info.timer) {
          clearTimeout(info.timer)
        }
        
        const actualDuration = duration || this.getDurationByType(type)
        if (actualDuration > 0) {
          info.timer = setTimeout(() => {
            this.remove(id)
          }, actualDuration)
        }
        
        // 添加闪烁效果表示更新
        info.element.style.animation = 'none'
        requestAnimationFrame(() => {
          info.element.style.animation = 'slideInRight 0.3s ease'
        })
        
        return id
      }
    }
    
    // 如果没找到相同消息，创建新的
    return this.show(message, type, duration)
  }
}

// 创建全局消息管理器实例
const messageManager = new MessageManager()

// 替换原有的 showMessage 函数
function showMessage(message, type = 'info', duration = null) {
  return messageManager.show(message, type, duration)
}

// 新增的便捷方法
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

// 清除所有消息
function clearAllMessages() {
  messageManager.clear()
}

// 显示持久消息（不自动关闭）
function showPersistent(message, type = 'info') {
  return messageManager.show(message, type, 0)
}

// 更新或显示消息（避免重复）
function updateMessage(message, type = 'info', duration = null) {
  return messageManager.updateOrShow(message, type, duration)
}

// 手动关闭特定消息
function closeMessage(messageId) {
  messageManager.remove(messageId)
}

// 为了兼容性，保留原有的函数名
window.showMessage = showMessage
window.showSuccess = showSuccess
window.showError = showError
window.showWarning = showWarning
window.showInfo = showInfo
window.clearAllMessages = clearAllMessages
window.showPersistent = showPersistent
window.updateMessage = updateMessage
window.closeMessage = closeMessage

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  // 确保消息管理器已初始化
  if (!messageManager.container) {
    messageManager.createMessageContainer()
  }
  
  console.log('消息系统已初始化')
})

// 全局状态
let isNodeStarted = false
let selectedFiles = []
let downloadInterval = null
let isAutoStarting = false

// DOM元素
const elements = {
  startNode: document.getElementById('startNode'),
  stopNode: document.getElementById('stopNode'),
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

// 更新按钮状态的统一函数
function updateButtonStates(nodeStarted) {
  isNodeStarted = nodeStarted

  if (nodeStarted) {
    // 节点已启动状态
    elements.startNode.disabled = true
    elements.startNode.textContent = '节点已启动'
    elements.stopNode.disabled = false
    elements.stopNode.textContent = '停止节点'
    updateNodeStatus('online', '在线')
  } else {
    // 节点未启动状态
    elements.startNode.disabled = false
    elements.startNode.textContent = '启动节点'
    elements.stopNode.disabled = true
    elements.stopNode.textContent = '停止节点'
    updateNodeStatus('offline', '离线')
  }
}

// 事件监听器
elements.startNode.addEventListener('click', startNode)
elements.stopNode.addEventListener('click', stopNode)
elements.connectPeer.addEventListener('click', connectToPeer)
elements.refreshStats.addEventListener('click', refreshStats)
elements.selectFiles.addEventListener('click', selectFiles)
elements.shareSelected.addEventListener('click', shareSelectedFiles)
elements.searchFiles.addEventListener('click', searchFiles)
elements.refreshDownloads.addEventListener('click', refreshDownloads)
elements.refreshDatabaseStats.addEventListener('click', refreshDatabaseStats)
elements.cleanupDatabase.addEventListener('click', cleanupDatabase)
elements.exportData.addEventListener('click', exportData)
elements.importData.addEventListener('click', importData)

// 搜索输入框回车事件
elements.searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchFiles()
  }
})

// 监听自动启动事件
window.electronAPI.onP2PNodeStarted((result) => {
  console.log('Received auto-start result:', result)

  isAutoStarting = false

  if (result.success) {
    updateButtonStates(true)
    updateNodeInfo(result.nodeInfo)

    // 开始定期刷新统计信息
    startStatsRefresh()

    showMessage('P2P节点自动启动成功', 'success')
  } else {
    updateButtonStates(false)
    elements.nodeInfo.innerHTML = '<p>自动启动失败</p>'
    showMessage(`自动启动失败: ${result.error}`, 'error')
  }
})

// 监听节点状态变化事件
window.electronAPI.onP2PNodeStatusChanged((result) => {
  console.log('Received node status change:', result)

  if (result.success && result.nodeInfo) {
    // 节点启动成功
    updateButtonStates(true)
    updateNodeInfo(result.nodeInfo)
  } else if (result.success && !result.nodeInfo) {
    // 节点停止成功
    updateButtonStates(false)
    elements.nodeInfo.innerHTML = '<p>节点已停止</p>'
    elements.dhtStats.innerHTML = '<p>DHT未运行</p>'
  } else if (!result.success && result.error) {
    // 操作失败
    showMessage(`节点操作失败: ${result.error}`, 'error')
  }
})

// 启动节点
async function startNode() {
  if (isAutoStarting) {
    showMessage('节点正在自动启动中，请稍候', 'info')
    return
  }

  if (isNodeStarted) {
    showMessage('节点已经启动', 'info')
    return
  }

  try {
    // 设置启动中状态
    elements.startNode.disabled = true
    elements.startNode.textContent = '启动中...'
    updateNodeStatus('connecting', '启动中')

    const result = await window.electronAPI.startP2PNode()

    if (result.success) {
      updateButtonStates(true)
      updateNodeInfo(result.nodeInfo)

      // 开始定期刷新统计信息
      startStatsRefresh()

      showMessage('P2P节点启动成功', 'success')
    } else {
      updateButtonStates(false)
      showMessage(`启动失败: ${result.error}`, 'error')
    }
  } catch (error) {
    updateButtonStates(false)
    showMessage(`启动错误: ${error.message}`, 'error')
  }
}

// 停止节点
async function stopNode() {
  if (!isNodeStarted) {
    showMessage('节点未启动', 'info')
    return
  }

  try {
    // 设置停止中状态
    elements.stopNode.disabled = true
    elements.stopNode.textContent = '停止中...'
    updateNodeStatus('connecting', '停止中')

    const result = await window.electronAPI.stopP2PNode()

    if (result.success) {
      updateButtonStates(false)

      elements.nodeInfo.innerHTML = '<p>节点已停止</p>'
      elements.dhtStats.innerHTML = '<p>DHT未运行</p>'

      // 停止统计信息刷新
      if (downloadInterval) {
        clearInterval(downloadInterval)
        downloadInterval = null
      }

      showMessage('P2P节点已停止', 'info')
    } else {
      // 恢复按钮状态
      elements.stopNode.disabled = false
      elements.stopNode.textContent = '停止节点'
      updateNodeStatus('online', '在线')
      showMessage(`停止失败: ${result.error}`, 'error')
    }
  } catch (error) {
    // 恢复按钮状态
    elements.stopNode.disabled = false
    elements.stopNode.textContent = '停止节点'
    updateNodeStatus('online', '在线')
    showMessage(`停止错误: ${error.message}`, 'error')
  }
}

// 更新节点状态
function updateNodeStatus(status, text) {
  elements.nodeStatus.className = `status ${status}`
  elements.nodeStatus.textContent = text
}

// 更新节点信息
function updateNodeInfo(nodeInfo) {
  if (nodeInfo) {
    elements.nodeInfo.innerHTML = `
      <p><strong>节点ID:</strong> ${nodeInfo.peerId}</p>
      <p><strong>连接的节点:</strong> ${nodeInfo.connectedPeers}</p>
      <p><strong>发现的节点:</strong> ${nodeInfo.discoveredPeers || 0}</p>
      <p><strong>监听地址:</strong></p>
      <ul>
        ${nodeInfo.addresses.map(addr => `<li>${addr}</li>`).join('')}
      </ul>
      ${nodeInfo.discoveredPeerIds && nodeInfo.discoveredPeerIds.length > 0 ? `
        <p><strong>发现的节点列表:</strong></p>
        <div class="discovered-peers">
          ${nodeInfo.discoveredPeerIds.map(peerId => {
      const shortPeerId = peerId
      const isBootstrap = isBootstrapPeerId(peerId)
      return `
              <div class="peer-item ${isBootstrap ? 'bootstrap-peer' : ''}">
                <span class="peer-id" title="${peerId}">
                  ${shortPeerId}${isBootstrap ? ' (引导节点)' : ''}
                </span>
                ${!isBootstrap ?
          `<button class="connect-btn" onclick="connectToDiscoveredPeer('${peerId}')">连接</button>` :
          `<span class="bootstrap-label">基础设施节点</span>`
        }
              </div>
            `
    }).join('')}
        </div>
      ` : ''}
    `
  }
}

// 检查是否是引导节点
function isBootstrapPeerId(peerId) {
  const bootstrapPeerIds = [
    'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    'QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
  ]
  return bootstrapPeerIds.includes(peerId)
}

// 连接到节点
async function connectToPeer() {
  if (!isNodeStarted) {
    showMessage('请先启动P2P节点', 'warning')
    return
  }

  const address = elements.peerAddress.value.trim()
  if (!address) {
    showMessage('请输入节点地址', 'warning')
    return
  }

  try {
    elements.connectPeer.disabled = true
    elements.connectPeer.textContent = '连接中...'

    const result = await window.electronAPI.connectToPeer(address)

    if (result.success) {
      showMessage('成功连接到节点', 'success')
      elements.peerAddress.value = ''
      await refreshStats()
    } else {
      showMessage(`连接失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`连接错误: ${error.message}`, 'error')
  } finally {
    elements.connectPeer.disabled = false
    elements.connectPeer.textContent = '连接'
  }
}

// 刷新统计信息
async function refreshStats() {
  if (!isNodeStarted) return

  try {
    // 更新节点信息
    const nodeInfo = await window.electronAPI.getNodeInfo()
    updateNodeInfo(nodeInfo)

    // 更新DHT统计
    const dhtStats = await window.electronAPI.getDHTStats()
    if (dhtStats) {
      elements.dhtStats.innerHTML = `
        <p><strong>连接的节点:</strong> ${dhtStats.connectedPeers}</p>
        <p><strong>路由表大小:</strong> ${dhtStats.routingTableSize}</p>
        <p><strong>本地文件:</strong> ${dhtStats.localFiles}</p>
      `
    }

    // 更新本地文件列表
    await refreshLocalFiles()

    // 更新数据库统计
    await refreshDatabaseStats()
  } catch (error) {
    console.error('Error refreshing stats:', error)
  }
}

// 开始统计信息刷新
function startStatsRefresh() {
  // 停止之前的刷新定时器
  if (downloadInterval) {
    clearInterval(downloadInterval)
  }

  // 立即刷新一次
  refreshStats()

  // 每30秒刷新一次
  downloadInterval = setInterval(refreshStats, 30000)

  // 每5秒刷新下载状态
  setInterval(refreshDownloads, 5000)
}

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
    showMessage(`选择文件错误: ${error.message}`, 'error')
  }
}

// 更新选中文件显示
function updateSelectedFilesDisplay() {
  if (selectedFiles.length === 0) {
    elements.selectedFiles.innerHTML = '<p>未选择文件</p>'
  } else {
    const fileList = selectedFiles.map(filePath => {
      const fileName = filePath.split(/[/\\]/).pop()
      return `<div class="selected-file">
        <span>${fileName}</span>
        <button onclick="removeSelectedFile('${filePath}')">移除</button>
      </div>`
    }).join('')

    elements.selectedFiles.innerHTML = `
      <p>已选择 ${selectedFiles.length} 个文件:</p>
      ${fileList}
    `
  }
}

// 移除选中的文件
function removeSelectedFile(filePath) {
  selectedFiles = selectedFiles.filter(path => path !== filePath)
  updateSelectedFilesDisplay()
  elements.shareSelected.disabled = selectedFiles.length === 0
}

// 分享选中的文件
async function shareSelectedFiles() {
  if (selectedFiles.length === 0) {
    showMessage('请先选择要分享的文件', 'warning')
    return
  }

  if (!isNodeStarted) {
    showMessage('请先启动P2P节点', 'warning')
    return
  }

  try {
    elements.shareSelected.disabled = true
    elements.shareSelected.textContent = '分享中...'

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

    // 显示结果
    if (successCount > 0) {
      showMessage(`成功分享 ${successCount} 个文件`, 'success')
    }

    if (errorCount > 0) {
      showMessage(`${errorCount} 个文件分享失败:\n${errors.join('\n')}`, 'error')
    }

    // 清空选择
    selectedFiles = []
    updateSelectedFilesDisplay()

    // 刷新本地文件列表
    await refreshLocalFiles()

  } catch (error) {
    showMessage(`分享错误: ${error.message}`, 'error')
  } finally {
    elements.shareSelected.disabled = selectedFiles.length === 0
    elements.shareSelected.textContent = '分享选中文件'
  }
}

// 搜索文件
async function searchFiles() {
  const query = elements.searchInput.value.trim()
  if (!query) {
    showMessage('请输入搜索关键词', 'warning')
    return
  }

  if (!isNodeStarted) {
    showMessage('请先启动P2P节点', 'warning')
    return
  }

  try {
    elements.searchFiles.disabled = true
    elements.searchFiles.textContent = '搜索中...'

    const result = await window.electronAPI.searchFiles(query)

    if (result.success) {
      displaySearchResults(result.results)
    } else {
      showMessage(`搜索失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`搜索错误: ${error.message}`, 'error')
  } finally {
    elements.searchFiles.disabled = false
    elements.searchFiles.textContent = '搜索'
  }
}

// 显示搜索结果
function displaySearchResults(results) {
  if (results.length === 0) {
    elements.searchResults.innerHTML = '<p>未找到匹配的文件</p>'
  } else {
    const resultList = results.map(file => `
      <div class="file-item">
        <div class="file-info">
          <h4>${file.name}</h4>
          <p>大小: ${formatFileSize(file.size)}</p>
          <p>哈希: ${file.hash}</p>
          <p>提供者: ${file.provider || '未知'}</p>
          <p>时间: ${new Date(file.timestamp || file.savedAt || Date.now()).toLocaleString()}</p>
        </div>
        <div class="file-actions">
          <button onclick="window.downloadFile('${file.hash}', '${file.name}')">下载</button>
        </div>
      </div>
    `).join('')

    elements.searchResults.innerHTML = `
      <p>找到 ${results.length} 个文件:</p>
      ${resultList}
    `
  }
}

// 下载文件 - 修复并确保为全局函数
// window.downloadFile = async function(fileHash, fileName) {
//   console.log('Download button clicked:', { fileHash, fileName })
  
//   if (!isNodeStarted) {
//     showMessage('请先启动P2P节点', 'warning')
//     return
//   }

//   try {
//     showMessage(`正在查找文件: ${fileName}`, 'info')
    
//     const result = await window.electronAPI.downloadFile(fileHash, fileName)

//     if (result.success) {
//       showMessage(`开始下载: ${fileName}`, 'success')
//       // 立即刷新下载列表
//       await refreshDownloads()
//     } else {
//       showMessage(`下载失败: ${result.error}`, 'error')
//     }
//   } catch (error) {
//     console.error('Download error:', error)
//     showMessage(`下载错误: ${error.message}`, 'error')
//   }
// }

window.downloadFile = async function(fileHash, fileName) {
  console.log('Download button clicked:', { fileHash, fileName })
  
  if (!isNodeStarted) {
    showMessage('请先启动P2P节点', 'warning')
    return
  }

  try {
    // 首先检查是否是本地文件
    const localFiles = await window.electronAPI.getLocalFiles()
    const isLocalFile = localFiles.some(file => file.hash === fileHash)
    
    if (isLocalFile) {
      console.log('检测到本地文件，尝试直接复制')
      showMessage(`正在复制本地文件: ${fileName}`, 'info')
      
      // 尝试本地文件复制
      const localResult = await window.electronAPI.downloadLocalFile(fileHash, fileName)
      
      if (localResult.success) {
        showMessage(`本地文件复制成功: ${fileName}`, 'success')
        await refreshDownloads()
        return
      } else {
        console.log('本地文件复制失败，尝试网络下载:', localResult.error)
        showMessage(`本地复制失败，尝试网络下载: ${fileName}`, 'warning')
      }
    }
    
    // 网络下载
    showMessage(`正在查找文件: ${fileName}`, 'info')
    
    const result = await window.electronAPI.downloadFile(fileHash, fileName)

    if (result.success) {
      showMessage(`开始下载: ${fileName}`, 'success')
      await refreshDownloads()
    } else {
      showMessage(`下载失败: ${result.error}`, 'error')
    }
  } catch (error) {
    console.error('Download error:', error)
    showMessage(`下载错误: ${error.message}`, 'error')
  }
}

// 刷新本地文件
async function refreshLocalFiles() {
  try {
    const files = await window.electronAPI.getLocalFiles()

    if (files.length === 0) {
      elements.localFiles.innerHTML = '<p>暂无本地文件</p>'
    } else {
      const fileList = files.map(file => `
        <div class="file-item">
          <div class="file-info">
            <h4>${file.name}</h4>
            <p>大小: ${formatFileSize(file.size)}</p>
            <p>哈希: ${file.hash}</p>
            <p>分享时间: ${new Date(file.sharedAt || file.timestamp || file.savedAt).toLocaleString()}</p>
          </div>
        </div>
      `).join('')

      elements.localFiles.innerHTML = `
        <p>本地文件 (${files.length}):</p>
        ${fileList}
      `
    }
  } catch (error) {
    console.error('Error refreshing local files:', error)
  }
}

// 刷新下载状态
async function refreshDownloads() {
  try {
    const downloads = await window.electronAPI.getActiveDownloads()

    if (downloads.length === 0) {
      elements.activeDownloads.innerHTML = '<p>暂无活跃下载</p>'
    } else {
      const downloadList = downloads.map(download => `
        <div class="download-item">
          <div class="download-info">
            <h4>${download.fileName}</h4>
            <p>状态: ${getStatusText(download.status)}</p>
            <p>进度: ${download.progress?.toFixed(1) || 0}%</p>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${download.progress || 0}%"></div>
            </div>
            <p>已下载: ${download.downloadedChunks || 0} / ${download.totalChunks || 0} 块</p>
            ${download.estimatedTime ? `<p>预计剩余: ${formatTime(download.estimatedTime)}</p>` : ''}
          </div>
          <div class="download-actions">
            ${download.status === 'downloading' ?
          `<button onclick="pauseDownload('${download.id || download.fileHash}')">暂停</button>` :
          download.status === 'paused' ?
            `<button onclick="resumeDownload('${download.id || download.fileHash}')">恢复</button>` : ''
        }
            <button onclick="cancelDownload('${download.id || download.fileHash}')">取消</button>
          </div>
        </div>
      `).join('')

      elements.activeDownloads.innerHTML = downloadList
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
      showMessage('下载已暂停', 'info')
      await refreshDownloads()
    } else {
      showMessage(`暂停失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`暂停错误: ${error.message}`, 'error')
  }
}

// 恢复下载
async function resumeDownload(downloadId) {
  try {
    const result = await window.electronAPI.resumeDownload(downloadId)
    if (result.success) {
      showMessage('下载已恢复', 'info')
      await refreshDownloads()
    } else {
      showMessage(`恢复失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`恢复错误: ${error.message}`, 'error')
  }
}

// 取消下载
async function cancelDownload(downloadId) {
  if (confirm('确定要取消这个下载吗？')) {
    try {
      const result = await window.electronAPI.cancelDownload(downloadId)
      if (result.success) {
        showMessage('下载已取消', 'info')
        await refreshDownloads()
      } else {
        showMessage(`取消失败: ${result.error}`, 'error')
      }
    } catch (error) {
      showMessage(`取消错误: ${error.message}`, 'error')
    }
  }
}

// 连接到发现的节点 - 改进版本
async function connectToDiscoveredPeer(peerId) {
  try {
    // 检查是否是引导节点
    if (isBootstrapPeerId(peerId)) {
      showMessage('无法连接到引导节点。引导节点是基础设施节点，用于网络发现，不支持直接连接。请尝试连接其他发现的节点。', 'warning')
      return
    }

    const result = await window.electronAPI.connectToDiscoveredPeer(peerId)

    if (result.success) {
      showMessage(`成功连接到节点: ${peerId.slice(-8)}`, 'success')
      await refreshStats()
    } else {
      // 提供更友好的错误信息
      let errorMessage = result.error
      if (errorMessage.includes('bootstrap node')) {
        errorMessage = '无法连接到引导节点。请尝试连接其他发现的节点。'
      } else if (errorMessage.includes('offline or unreachable')) {
        errorMessage = '节点离线或不可达。请尝试连接其他节点。'
      }
      showMessage(`连接失败: ${errorMessage}`, 'error')
    }
  } catch (error) {
    showMessage(`连接错误: ${error.message}`, 'error')
  }
}

// 刷新发现的节点列表
async function refreshDiscoveredPeers() {
  try {
    const result = await window.electronAPI.getDiscoveredPeers()

    if (result.success) {
      // 更新节点信息显示
      await refreshStats()
      showMessage(`刷新完成，发现 ${result.peers.length} 个节点`, 'info')
    } else {
      showMessage(`刷新失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`刷新错误: ${error.message}`, 'error')
  }
}

// 刷新数据库统计
async function refreshDatabaseStats() {
  try {
    const stats = await window.electronAPI.getDatabaseStats()

    if (stats) {
      elements.databaseStats.innerHTML = `
        <p><strong>节点记录:</strong> ${stats.nodes}</p>
        <p><strong>文件记录:</strong> ${stats.files}</p>
        <p><strong>对等节点:</strong> ${stats.peers}</p>
        <p><strong>传输记录:</strong> ${stats.transfers}</p>
        <p><strong>配置项:</strong> ${stats.config}</p>
        <p><strong>状态:</strong> ${stats.initialized ? '已初始化' : '未初始化'}</p>
      `
    } else {
      elements.databaseStats.innerHTML = '<p>数据库未初始化</p>'
    }
  } catch (error) {
    console.error('Error refreshing database stats:', error)
  }
}

// 清理数据库
async function cleanupDatabase() {
  if (confirm('确定要清理旧的数据库记录吗？这将删除30天前的记录。')) {
    try {
      elements.cleanupDatabase.disabled = true
      elements.cleanupDatabase.textContent = '清理中...'

      const result = await window.electronAPI.cleanupDatabase()

      if (result.success) {
        showMessage('数据库清理完成', 'success')
        await refreshDatabaseStats()
      } else {
        showMessage(`清理失败: ${result.error}`, 'error')
      }
    } catch (error) {
      showMessage(`清理错误: ${error.message}`, 'error')
    } finally {
      elements.cleanupDatabase.disabled = false
      elements.cleanupDatabase.textContent = '清理数据库'
    }
  }
}

// 导出数据
async function exportData() {
  try {
    elements.exportData.disabled = true
    elements.exportData.textContent = '导出中...'

    const result = await window.electronAPI.exportData()

    if (result.success && !result.cancelled) {
      showMessage(`数据已导出到: ${result.filePath}`, 'success')
    } else if (result.cancelled) {
      showMessage('导出已取消', 'info')
    } else {
      showMessage(`导出失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showMessage(`导出错误: ${error.message}`, 'error')
  } finally {
    elements.exportData.disabled = false
    elements.exportData.textContent = '导出数据'
  }
}

// 导入数据
async function importData() {
  if (confirm('导入数据将覆盖当前的数据库内容，确定要继续吗？')) {
    try {
      elements.importData.disabled = true
      elements.importData.textContent = '导入中...'

      const result = await window.electronAPI.importData()

      if (result.success && !result.cancelled) {
        showMessage(`数据已从 ${result.filePath} 导入`, 'success')
        await refreshDatabaseStats()
        await refreshLocalFiles()
      } else if (result.cancelled) {
        showMessage('导入已取消', 'info')
      } else {
        showMessage(`导入失败: ${result.error}`, 'error')
      }
    } catch (error) {
      showMessage(`导入错误: ${error.message}`, 'error')
    } finally {
      elements.importData.disabled = false
      elements.importData.textContent = '导入数据'
    }
  }
}

// 工具函数
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
  return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`
}

function getStatusText(status) {
  const statusMap = {
    'downloading': '下载中',
    'paused': '已暂停',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  }
  return statusMap[status] || status
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('P2P文件共享系统已加载')

  // 立即定义全局函数，确保它们在页面加载时就可用
  window.removeSelectedFile = removeSelectedFile
  window.pauseDownload = pauseDownload
  window.resumeDownload = resumeDownload
  window.cancelDownload = cancelDownload
  window.connectToDiscoveredPeer = connectToDiscoveredPeer
  window.refreshDiscoveredPeers = refreshDiscoveredPeers

  // 初始化显示
  updateSelectedFilesDisplay()
  refreshDatabaseStats()

  // 设置自动启动状态
  isAutoStarting = true
  elements.startNode.disabled = true
  elements.startNode.textContent = '自动启动中...'
  elements.stopNode.disabled = true
  updateNodeStatus('connecting', '启动中')
})