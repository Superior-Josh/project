// i18n.js - Internationalization support

class I18n {
  constructor() {
    this.currentLanguage = 'en'
    this.translations = {
      en: {
        // Header
        'app.title': 'P2P File Sharing System',
        'header.startNode': 'Start Node',
        'header.stopNode': 'Stop Node',
        'header.settings': 'Settings',
        'header.back': 'Back',
        'status.online': 'Online',
        'status.offline': 'Offline',
        'status.starting': 'Starting',
        'status.stopping': 'Stopping',
        
        // Main sections
        'section.nodeInfo': 'Node Information',
        'section.connectPeer': 'Connect to Peer',
        'section.dhtStats': 'DHT Statistics',
        'section.fileSharing': 'File Sharing',
        'section.activeDownloads': 'Active Downloads',
        'section.localFiles': 'Local Files',
        'section.searchResults': 'Search Results',
        'section.databaseManagement': 'Database Management',
        
        // Node Info
        'node.notStarted': 'Node not started',
        'node.nodeId': 'Node ID',
        'node.connectedPeers': 'Connected Peers',
        'node.discoveredPeers': 'Discovered Peers',
        'node.listenAddresses': 'Listen Addresses',
        'node.discoveredPeerList': 'Discovered Peer List',
        'node.bootstrapNode': 'Bootstrap Node',
        'node.infrastructureNode': 'Infrastructure Node',
        'node.refreshPeers': 'Refresh Discovered Peers',
        'node.connect': 'Connect',
        
        // Connect to Peer
        'connect.placeholder': 'Enter peer address (e.g., /ip4/192.168.1.100/tcp/4001/p2p/12D3K...)',
        'connect.button': 'Connect',
        
        // DHT Stats
        'dht.notInitialized': 'DHT not initialized',
        'dht.notRunning': 'DHT not running',
        'dht.connectedPeers': 'Connected Peers',
        'dht.routingTableSize': 'Routing Table Size',
        'dht.localFiles': 'Local Files',
        'dht.refreshStats': 'Refresh Stats',
        
        // File Sharing
        'file.selectFiles': 'Select Files',
        'file.shareSelected': 'Share Selected Files',
        'file.searchPlaceholder': 'Search files...',
        'file.search': 'Search',
        'file.noFilesSelected': 'No files selected',
        'file.selectedFiles': 'Selected {count} files:',
        'file.remove': 'Remove',
        'file.download': 'Download',
        'file.size': 'Size',
        'file.hash': 'Hash',
        'file.provider': 'Provider',
        'file.time': 'Time',
        'file.sharedTime': 'Shared Time',
        'file.unknown': 'Unknown',
        
        // Downloads
        'download.noActive': 'No active downloads',
        'download.refreshDownloads': 'Refresh Downloads',
        'download.status': 'Status',
        'download.progress': 'Progress',
        'download.downloaded': 'Downloaded',
        'download.estimatedTime': 'Estimated Remaining',
        'download.pause': 'Pause',
        'download.resume': 'Resume',
        'download.cancel': 'Cancel',
        'download.downloading': 'Downloading',
        'download.paused': 'Paused',
        'download.completed': 'Completed',
        'download.failed': 'Failed',
        'download.cancelled': 'Cancelled',
        
        // Files
        'files.noLocal': 'No local files',
        'files.localCount': 'Local Files ({count})',
        'files.noSearchResults': 'No search results',
        'files.foundFiles': 'Found {count} files:',
        'files.noMatching': 'No matching files found',
        
        // Database
        'db.notInitialized': 'Database not initialized',
        'db.nodeRecords': 'Node Records',
        'db.fileRecords': 'File Records',
        'db.peerRecords': 'Peer Records',
        'db.transferRecords': 'Transfer Records',
        'db.configItems': 'Config Items',
        'db.status': 'Status',
        'db.initialized': 'Initialized',
        'db.notInit': 'Not Initialized',
        'db.refreshStats': 'Refresh Stats',
        'db.cleanup': 'Cleanup Database',
        'db.export': 'Export Data',
        'db.import': 'Import Data',
        
        // Settings
        'settings.title': 'Settings',
        'settings.saveChanges': 'Save Changes',
        'settings.resetAll': 'Reset All',
        'settings.cancel': 'Cancel',
        'settings.confirm': 'Confirm',
        
        // Settings Categories
        'settings.download': 'Download & Files',
        'settings.window': 'Window & Interface',
        'settings.network': 'Network & Connections',
        'settings.privacy': 'Privacy & Security',
        'settings.performance': 'Performance',
        'settings.backup': 'Backup & Import',
        
        // Settings Descriptions
        'settings.download.desc': 'Configure file download and storage settings',
        'settings.window.desc': 'Customize application appearance and behavior',
        'settings.network.desc': 'Configure P2P network settings',
        'settings.privacy.desc': 'Configure privacy and security options',
        'settings.performance.desc': 'Optimize application performance',
        'settings.backup.desc': 'Manage settings and data backup',
        
        // Download Settings
        'settings.downloadPath': 'Download Location',
        'settings.downloadPath.desc': 'Where downloaded files will be saved',
        'settings.downloadPath.browse': 'Browse',
        'settings.autoCreateSubfolders': 'Auto Create Subfolders',
        'settings.autoCreateSubfolders.desc': 'Automatically create subfolders for different file types',
        'settings.maxConcurrentDownloads': 'Max Concurrent Downloads',
        'settings.maxConcurrentDownloads.desc': 'Maximum number of files to download simultaneously',
        'settings.chunkSize': 'Chunk Size',
        'settings.chunkSize.desc': 'Size of file chunks for downloading',
        'settings.enableResumeDownload': 'Enable Resume Download',
        'settings.enableResumeDownload.desc': 'Allow resuming interrupted downloads',
        
        // Window Settings
        'settings.windowBehavior': 'When Closing Window',
        'settings.windowBehavior.desc': 'What happens when you close the main window',
        'settings.windowBehavior.close': 'Exit Application',
        'settings.windowBehavior.hide': 'Hide to System Tray',
        'settings.startMinimized': 'Start Minimized',
        'settings.startMinimized.desc': 'Start the application minimized',
        'settings.autoStartNode': 'Auto Start P2P Node',
        'settings.autoStartNode.desc': 'Automatically start the P2P node when app launches',
        'settings.showNotifications': 'Show Notifications',
        'settings.showNotifications.desc': 'Show desktop notifications for downloads and connections',
        'settings.theme': 'Theme',
        'settings.theme.desc': 'Application theme',
        'settings.theme.system': 'System Default',
        'settings.theme.light': 'Light',
        'settings.theme.dark': 'Dark',
        'settings.language': 'Language',
        'settings.language.desc': 'Application language',
        'settings.language.en': 'English',
        'settings.language.zh': '中文',
        
        // Messages
        'message.nodeStartSuccess': 'P2P node started successfully',
        'message.nodeStartFailed': 'Failed to start P2P node: {error}',
        'message.nodeStopSuccess': 'P2P node stopped',
        'message.nodeStopFailed': 'Failed to stop P2P node: {error}',
        'message.connectSuccess': 'Successfully connected to peer',
        'message.connectFailed': 'Connection failed: {error}',
        'message.shareSuccess': 'Successfully shared {count} files',
        'message.shareFailed': '{count} files failed to share',
        'message.downloadStart': 'Download started: {fileName}',
        'message.downloadFailed': 'Download failed: {error}',
        'message.settingsSaved': 'Settings saved successfully',
        'message.settingsFailed': 'Failed to save settings',
        'message.settingsReset': 'All settings reset to defaults',
        
        // Confirmations
        'confirm.cancelDownload': 'Are you sure you want to cancel this download?',
        'confirm.resetSettings': 'This will reset all settings to their default values. This action cannot be undone.',
        'confirm.cleanupDatabase': 'Are you sure you want to cleanup old database records? This will delete records older than 30 days.',
        'confirm.importData': 'Importing data will overwrite current database content, are you sure you want to continue?',
        'confirm.unsavedChanges': 'You have unsaved changes. Are you sure you want to close without saving?'
      },
      zh: {
        // 头部
        'app.title': 'P2P文件共享系统',
        'header.startNode': '启动节点',
        'header.stopNode': '停止节点',
        'header.settings': '设置',
        'header.back': '返回',
        'status.online': '在线',
        'status.offline': '离线',
        'status.starting': '启动中',
        'status.stopping': '停止中',
        
        // 主要部分
        'section.nodeInfo': '节点信息',
        'section.connectPeer': '连接到节点',
        'section.dhtStats': 'DHT统计',
        'section.fileSharing': '文件共享',
        'section.activeDownloads': '活跃下载',
        'section.localFiles': '本地文件',
        'section.searchResults': '搜索结果',
        'section.databaseManagement': '数据库管理',
        
        // 节点信息
        'node.notStarted': '节点未启动',
        'node.nodeId': '节点ID',
        'node.connectedPeers': '已连接节点',
        'node.discoveredPeers': '发现的节点',
        'node.listenAddresses': '监听地址',
        'node.discoveredPeerList': '发现的节点列表',
        'node.bootstrapNode': '引导节点',
        'node.infrastructureNode': '基础设施节点',
        'node.refreshPeers': '刷新发现的节点',
        'node.connect': '连接',
        
        // 连接节点
        'connect.placeholder': '输入节点地址 (例: /ip4/192.168.1.100/tcp/4001/p2p/12D3K...)',
        'connect.button': '连接',
        
        // DHT统计
        'dht.notInitialized': 'DHT未初始化',
        'dht.notRunning': 'DHT未运行',
        'dht.connectedPeers': '已连接节点',
        'dht.routingTableSize': '路由表大小',
        'dht.localFiles': '本地文件',
        'dht.refreshStats': '刷新统计',
        
        // 文件共享
        'file.selectFiles': '选择文件',
        'file.shareSelected': '分享选中文件',
        'file.searchPlaceholder': '搜索文件...',
        'file.search': '搜索',
        'file.noFilesSelected': '未选择文件',
        'file.selectedFiles': '已选择 {count} 个文件:',
        'file.remove': '移除',
        'file.download': '下载',
        'file.size': '大小',
        'file.hash': '哈希',
        'file.provider': '提供者',
        'file.time': '时间',
        'file.sharedTime': '分享时间',
        'file.unknown': '未知',
        
        // 下载
        'download.noActive': '暂无活跃下载',
        'download.refreshDownloads': '刷新下载',
        'download.status': '状态',
        'download.progress': '进度',
        'download.downloaded': '已下载',
        'download.estimatedTime': '预计剩余',
        'download.pause': '暂停',
        'download.resume': '恢复',
        'download.cancel': '取消',
        'download.downloading': '下载中',
        'download.paused': '已暂停',
        'download.completed': '已完成',
        'download.failed': '失败',
        'download.cancelled': '已取消',
        
        // 文件
        'files.noLocal': '暂无本地文件',
        'files.localCount': '本地文件 ({count})',
        'files.noSearchResults': '暂无搜索结果',
        'files.foundFiles': '找到 {count} 个文件:',
        'files.noMatching': '未找到匹配的文件',
        
        // 数据库
        'db.notInitialized': '数据库未初始化',
        'db.nodeRecords': '节点记录',
        'db.fileRecords': '文件记录',
        'db.peerRecords': '节点记录',
        'db.transferRecords': '传输记录',
        'db.configItems': '配置项',
        'db.status': '状态',
        'db.initialized': '已初始化',
        'db.notInit': '未初始化',
        'db.refreshStats': '刷新统计',
        'db.cleanup': '清理数据库',
        'db.export': '导出数据',
        'db.import': '导入数据',
        
        // 设置
        'settings.title': '设置',
        'settings.saveChanges': '保存更改',
        'settings.resetAll': '重置所有',
        'settings.cancel': '取消',
        'settings.confirm': '确认',
        
        // 设置分类
        'settings.download': '下载与文件',
        'settings.window': '窗口与界面',
        'settings.network': '网络与连接',
        'settings.privacy': '隐私与安全',
        'settings.performance': '性能',
        'settings.backup': '备份与导入',
        
        // 设置描述
        'settings.download.desc': '配置文件下载和存储设置',
        'settings.window.desc': '自定义应用程序外观和行为',
        'settings.network.desc': '配置P2P网络设置',
        'settings.privacy.desc': '配置隐私和安全选项',
        'settings.performance.desc': '优化应用程序性能',
        'settings.backup.desc': '管理设置和数据备份',
        
        // 下载设置
        'settings.downloadPath': '下载位置',
        'settings.downloadPath.desc': '下载文件的保存位置',
        'settings.downloadPath.browse': '浏览',
        'settings.autoCreateSubfolders': '自动创建子文件夹',
        'settings.autoCreateSubfolders.desc': '为不同文件类型自动创建子文件夹',
        'settings.maxConcurrentDownloads': '最大并发下载数',
        'settings.maxConcurrentDownloads.desc': '同时下载的最大文件数量',
        'settings.chunkSize': '分块大小',
        'settings.chunkSize.desc': '文件下载的分块大小',
        'settings.enableResumeDownload': '启用断点续传',
        'settings.enableResumeDownload.desc': '允许恢复中断的下载',
        
        // 窗口设置
        'settings.windowBehavior': '关闭窗口时',
        'settings.windowBehavior.desc': '关闭主窗口时的行为',
        'settings.windowBehavior.close': '退出应用程序',
        'settings.windowBehavior.hide': '隐藏到系统托盘',
        'settings.startMinimized': '启动时最小化',
        'settings.startMinimized.desc': '应用程序启动时最小化',
        'settings.autoStartNode': '自动启动P2P节点',
        'settings.autoStartNode.desc': '应用启动时自动启动P2P节点',
        'settings.showNotifications': '显示通知',
        'settings.showNotifications.desc': '显示下载和连接的桌面通知',
        'settings.theme': '主题',
        'settings.theme.desc': '应用程序主题',
        'settings.theme.system': '系统默认',
        'settings.theme.light': '浅色',
        'settings.theme.dark': '深色',
        'settings.language': '语言',
        'settings.language.desc': '应用程序语言',
        'settings.language.en': 'English',
        'settings.language.zh': '中文',
        
        // 消息
        'message.nodeStartSuccess': 'P2P节点启动成功',
        'message.nodeStartFailed': '启动P2P节点失败: {error}',
        'message.nodeStopSuccess': 'P2P节点已停止',
        'message.nodeStopFailed': '停止P2P节点失败: {error}',
        'message.connectSuccess': '成功连接到节点',
        'message.connectFailed': '连接失败: {error}',
        'message.shareSuccess': '成功分享 {count} 个文件',
        'message.shareFailed': '{count} 个文件分享失败',
        'message.downloadStart': '开始下载: {fileName}',
        'message.downloadFailed': '下载失败: {error}',
        'message.settingsSaved': '设置保存成功',
        'message.settingsFailed': '保存设置失败',
        'message.settingsReset': '所有设置已重置为默认值',
        
        // 确认对话框
        'confirm.cancelDownload': '确定要取消此下载吗？',
        'confirm.resetSettings': '这将把所有设置重置为默认值。此操作无法撤销。',
        'confirm.cleanupDatabase': '确定要清理旧的数据库记录吗？这将删除30天前的记录。',
        'confirm.importData': '导入数据将覆盖当前的数据库内容，确定要继续吗？',
        'confirm.unsavedChanges': '您有未保存的更改。确定要在不保存的情况下关闭吗？'
      }
    }
  }

  setLanguage(language) {
    if (this.translations[language]) {
      this.currentLanguage = language
      this.updatePageText()
    }
  }

  t(key, params = {}) {
    let text = this.translations[this.currentLanguage][key] || this.translations['en'][key] || key
    
    // Replace parameters
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`{${param}}`, 'g'), params[param])
    })
    
    return text
  }

  updatePageText() {
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n')
      const text = this.t(key)
      
      if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'search')) {
        element.placeholder = text
      } else {
        element.textContent = text
      }
    })

    // Update title
    document.title = this.t('app.title')
  }

  getCurrentLanguage() {
    return this.currentLanguage
  }
}

// Create global instance
window.i18n = new I18n()