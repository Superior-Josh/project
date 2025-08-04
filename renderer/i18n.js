// i18n.js - Enhanced Internationalization support

class I18n {
  constructor() {
    this.currentLanguage = 'en'
    this.fallbackLanguage = 'en'
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
        'file.sharing': 'Sharing...',
        'file.downloading': 'Downloading...',
        'file.failed': 'Failed',
        'file.completed': 'Completed',
        
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
        'download.speed': 'Speed',
        'download.remaining': 'Remaining',
        'download.chunks': 'Chunks',
        
        // Files
        'files.noLocal': 'No local files',
        'files.localCount': 'Local Files ({count})',
        'files.noSearchResults': 'No search results',
        'files.foundFiles': 'Found {count} files:',
        'files.noMatching': 'No matching files found',
        'files.bytes': 'bytes',
        'files.kb': 'KB',
        'files.mb': 'MB',
        'files.gb': 'GB',
        'files.tb': 'TB',
        
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
        'db.cleaning': 'Cleaning up...',
        'db.exporting': 'Exporting...',
        'db.importing': 'Importing...',
        
        // Settings
        'settings.title': 'Settings',
        'settings.saveChanges': 'Save Changes',
        'settings.resetAll': 'Reset All',
        'settings.cancel': 'Cancel',
        'settings.confirm': 'Confirm',
        'settings.saving': 'Saving...',
        'settings.resetting': 'Resetting...',
        
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
        'settings.windowBehavior.minimize': 'Minimize to Taskbar',
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
        'settings.language.zh': '中文 (Chinese)',
        
        // Network Settings
        'settings.autoConnectToPeers': 'Auto Connect to Peers',
        'settings.autoConnectToPeers.desc': 'Automatically connect to discovered peers',
        'settings.maxConnections': 'Max Connections',
        'settings.maxConnections.desc': 'Maximum number of peer connections',
        'settings.connectionTimeout': 'Connection Timeout',
        'settings.connectionTimeout.desc': 'Timeout for peer connections (seconds)',
        'settings.enableUpnp': 'Enable UPnP',
        'settings.enableUpnp.desc': 'Automatically configure router port forwarding',
        
        // Privacy Settings
        'settings.enableEncryption': 'Enable Encryption',
        'settings.enableEncryption.desc': 'Encrypt all P2P communications',
        'settings.shareFileByDefault': 'Share Files by Default',
        'settings.shareFileByDefault.desc': 'Automatically share new files with the network',
        'settings.autoAcceptConnections': 'Auto Accept Connections',
        'settings.autoAcceptConnections.desc': 'Automatically accept incoming peer connections',
        'settings.logLevel': 'Log Level',
        'settings.logLevel.desc': 'Application logging level',
        'settings.logLevel.error': 'Error Only',
        'settings.logLevel.warn': 'Warnings',
        'settings.logLevel.info': 'Information',
        'settings.logLevel.debug': 'Debug (Verbose)',
        
        // Performance Settings
        'settings.memoryLimit': 'Memory Limit (MB)',
        'settings.memoryLimit.desc': 'Maximum memory usage',
        'settings.diskCacheSize': 'Disk Cache Size (MB)',
        'settings.diskCacheSize.desc': 'Size of disk cache for files',
        'settings.enableFileValidation': 'Enable File Validation',
        'settings.enableFileValidation.desc': 'Verify file integrity after download',
        'settings.cleanupTempFiles': 'Cleanup Temp Files',
        'settings.cleanupTempFiles.desc': 'Automatically cleanup temporary files',
        
        // Backup Settings
        'settings.autoBackupSettings': 'Auto Backup Settings',
        'settings.autoBackupSettings.desc': 'Automatically backup settings periodically',
        'settings.autoBackupDatabase': 'Auto Backup Database',
        'settings.autoBackupDatabase.desc': 'Automatically backup file database',
        'settings.backupInterval': 'Backup Interval (hours)',
        'settings.backupInterval.desc': 'How often to create automatic backups',
        'settings.maxBackupFiles': 'Max Backup Files',
        'settings.maxBackupFiles.desc': 'Maximum number of backup files to keep',
        'settings.createBackup': 'Create Backup Now',
        'settings.viewBackups': 'View Backups',
        'settings.exportSettings': 'Export Settings',
        'settings.importSettings': 'Import Settings',
        'settings.availableBackups': 'Available Backups',
        'settings.backupCreated': 'Created',
        'settings.backupSize': 'Size',
        'settings.restore': 'Restore',
        'settings.delete': 'Delete',
        
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
        'message.settingsFailed': 'Failed to save settings: {error}',
        'message.settingsReset': 'All settings reset to defaults',
        'message.backupCreated': 'Backup created successfully',
        'message.backupRestored': 'Settings restored from backup',
        'message.settingsExported': 'Settings exported to: {path}',
        'message.settingsImported': 'Settings imported successfully',
        'message.dataExported': 'Data exported to: {path}',
        'message.dataImported': 'Data imported successfully',
        'message.databaseCleaned': 'Database cleanup completed',
        
        // Errors
        'error.nodeNotStarted': 'Please start P2P node first',
        'error.noFilesSelected': 'Please select files to share first',
        'error.invalidAddress': 'Please enter a valid peer address',
        'error.connectionTimeout': 'Connection timeout',
        'error.fileNotFound': 'File not found',
        'error.downloadFailed': 'Download failed',
        'error.invalidSettings': 'Invalid settings',
        'error.backupFailed': 'Backup operation failed',
        'error.importFailed': 'Import operation failed',
        
        // Confirmations
        'confirm.cancelDownload': 'Are you sure you want to cancel this download?',
        'confirm.resetSettings': 'This will reset all settings to their default values. This action cannot be undone.',
        'confirm.cleanupDatabase': 'Are you sure you want to cleanup old database records? This will delete records older than 30 days.',
        'confirm.importData': 'Importing data will overwrite current database content. Are you sure you want to continue?',
        'confirm.unsavedChanges': 'You have unsaved changes. Are you sure you want to close without saving?',
        'confirm.deleteBackup': 'Are you sure you want to delete this backup?',
        'confirm.restoreBackup': 'This will overwrite your current settings. Are you sure you want to restore from this backup?',
        
        // Time and date
        'time.seconds': 'seconds',
        'time.minutes': 'minutes',
        'time.hours': 'hours',
        'time.days': 'days',
        'time.ago': '{time} ago',
        'time.remaining': '{time} remaining',
        'time.never': 'Never',
        'time.now': 'Now',
        
        // Common actions
        'action.ok': 'OK',
        'action.cancel': 'Cancel',
        'action.apply': 'Apply',
        'action.close': 'Close',
        'action.save': 'Save',
        'action.load': 'Load',
        'action.delete': 'Delete',
        'action.edit': 'Edit',
        'action.add': 'Add',
        'action.remove': 'Remove',
        'action.clear': 'Clear',
        'action.refresh': 'Refresh',
        'action.retry': 'Retry',
        'action.skip': 'Skip',
        'action.continue': 'Continue',
        'action.finish': 'Finish',
        'action.next': 'Next',
        'action.previous': 'Previous',
        'action.select': 'Select',
        'action.browse': 'Browse',
        'action.upload': 'Upload',
        'action.download': 'Download',
        'action.share': 'Share',
        'action.copy': 'Copy',
        'action.paste': 'Paste',
        'action.cut': 'Cut',
        'action.undo': 'Undo',
        'action.redo': 'Redo'
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
        'file.sharing': '分享中...',
        'file.downloading': '下载中...',
        'file.failed': '失败',
        'file.completed': '已完成',
        
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
        'download.speed': '速度',
        'download.remaining': '剩余',
        'download.chunks': '分块',
        
        // 文件
        'files.noLocal': '暂无本地文件',
        'files.localCount': '本地文件 ({count})',
        'files.noSearchResults': '暂无搜索结果',
        'files.foundFiles': '找到 {count} 个文件:',
        'files.noMatching': '未找到匹配的文件',
        'files.bytes': '字节',
        'files.kb': 'KB',
        'files.mb': 'MB',
        'files.gb': 'GB',
        'files.tb': 'TB',
        
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
        'db.cleaning': '清理中...',
        'db.exporting': '导出中...',
        'db.importing': '导入中...',
        
        // 设置
        'settings.title': '设置',
        'settings.saveChanges': '保存更改',
        'settings.resetAll': '重置所有',
        'settings.cancel': '取消',
        'settings.confirm': '确认',
        'settings.saving': '保存中...',
        'settings.resetting': '重置中...',
        
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
        'settings.windowBehavior.minimize': '最小化到任务栏',
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
        'settings.language.en': 'English (英语)',
        'settings.language.zh': '中文',
        
        // 网络设置
        'settings.autoConnectToPeers': '自动连接到节点',
        'settings.autoConnectToPeers.desc': '自动连接到发现的节点',
        'settings.maxConnections': '最大连接数',
        'settings.maxConnections.desc': '最大节点连接数量',
        'settings.connectionTimeout': '连接超时',
        'settings.connectionTimeout.desc': '节点连接超时时间（秒）',
        'settings.enableUpnp': '启用UPnP',
        'settings.enableUpnp.desc': '自动配置路由器端口转发',
        
        // 隐私设置
        'settings.enableEncryption': '启用加密',
        'settings.enableEncryption.desc': '加密所有P2P通信',
        'settings.shareFileByDefault': '默认分享文件',
        'settings.shareFileByDefault.desc': '自动将新文件分享到网络',
        'settings.autoAcceptConnections': '自动接受连接',
        'settings.autoAcceptConnections.desc': '自动接受传入的节点连接',
        'settings.logLevel': '日志级别',
        'settings.logLevel.desc': '应用程序日志级别',
        'settings.logLevel.error': '仅错误',
        'settings.logLevel.warn': '警告',
        'settings.logLevel.info': '信息',
        'settings.logLevel.debug': '调试（详细）',
        
        // 性能设置
        'settings.memoryLimit': '内存限制 (MB)',
        'settings.memoryLimit.desc': '最大内存使用量',
        'settings.diskCacheSize': '磁盘缓存大小 (MB)',
        'settings.diskCacheSize.desc': '文件磁盘缓存大小',
        'settings.enableFileValidation': '启用文件验证',
        'settings.enableFileValidation.desc': '下载后验证文件完整性',
        'settings.cleanupTempFiles': '清理临时文件',
        'settings.cleanupTempFiles.desc': '自动清理临时文件',
        
        // 备份设置
        'settings.autoBackupSettings': '自动备份设置',
        'settings.autoBackupSettings.desc': '定期自动备份设置',
        'settings.autoBackupDatabase': '自动备份数据库',
        'settings.autoBackupDatabase.desc': '自动备份文件数据库',
        'settings.backupInterval': '备份间隔（小时）',
        'settings.backupInterval.desc': '创建自动备份的频率',
        'settings.maxBackupFiles': '最大备份文件数',
        'settings.maxBackupFiles.desc': '保留的最大备份文件数量',
        'settings.createBackup': '立即创建备份',
        'settings.viewBackups': '查看备份',
        'settings.exportSettings': '导出设置',
        'settings.importSettings': '导入设置',
        'settings.availableBackups': '可用备份',
        'settings.backupCreated': '创建时间',
        'settings.backupSize': '大小',
        'settings.restore': '恢复',
        'settings.delete': '删除',
        
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
        'message.settingsFailed': '保存设置失败: {error}',
        'message.settingsReset': '所有设置已重置为默认值',
        'message.backupCreated': '备份创建成功',
        'message.backupRestored': '从备份恢复设置成功',
        'message.settingsExported': '设置已导出到: {path}',
        'message.settingsImported': '设置导入成功',
        'message.dataExported': '数据已导出到: {path}',
        'message.dataImported': '数据导入成功',
        'message.databaseCleaned': '数据库清理完成',
        
        // 错误
        'error.nodeNotStarted': '请先启动P2P节点',
        'error.noFilesSelected': '请先选择要分享的文件',
        'error.invalidAddress': '请输入有效的节点地址',
        'error.connectionTimeout': '连接超时',
        'error.fileNotFound': '文件未找到',
        'error.downloadFailed': '下载失败',
        'error.invalidSettings': '设置无效',
        'error.backupFailed': '备份操作失败',
        'error.importFailed': '导入操作失败',
        
        // 确认对话框
        'confirm.cancelDownload': '确定要取消此下载吗？',
        'confirm.resetSettings': '这将把所有设置重置为默认值。此操作无法撤销。',
        'confirm.cleanupDatabase': '确定要清理旧的数据库记录吗？这将删除30天前的记录。',
        'confirm.importData': '导入数据将覆盖当前的数据库内容。确定要继续吗？',
        'confirm.unsavedChanges': '您有未保存的更改。确定要在不保存的情况下关闭吗？',
        'confirm.deleteBackup': '确定要删除此备份吗？',
        'confirm.restoreBackup': '这将覆盖您当前的设置。确定要从此备份恢复吗？',
        
        // 时间和日期
        'time.seconds': '秒',
        'time.minutes': '分钟',
        'time.hours': '小时',
        'time.days': '天',
        'time.ago': '{time}前',
        'time.remaining': '剩余{time}',
        'time.never': '从未',
        'time.now': '现在',
        
        // 常用操作
        'action.ok': '确定',
        'action.cancel': '取消',
        'action.apply': '应用',
        'action.close': '关闭',
        'action.save': '保存',
        'action.load': '加载',
        'action.delete': '删除',
        'action.edit': '编辑',
        'action.add': '添加',
        'action.remove': '移除',
        'action.clear': '清除',
        'action.refresh': '刷新',
        'action.retry': '重试',
        'action.skip': '跳过',
        'action.continue': '继续',
        'action.finish': '完成',
        'action.next': '下一步',
        'action.previous': '上一步',
        'action.select': '选择',
        'action.browse': '浏览',
        'action.upload': '上传',
        'action.download': '下载',
        'action.share': '分享',
        'action.copy': '复制',
        'action.paste': '粘贴',
        'action.cut': '剪切',
        'action.undo': '撤销',
        'action.redo': '重做'
      }
    }
    
    // 语言变更回调
    this.languageChangeCallbacks = []
    
    // 初始化时从localStorage加载保存的语言设置
    this.loadSavedLanguage()
  }

  // 从localStorage加载保存的语言设置
  loadSavedLanguage() {
    try {
      const savedLanguage = localStorage.getItem('app-language')
      if (savedLanguage && this.translations[savedLanguage]) {
        this.currentLanguage = savedLanguage
      } else {
        // 检测浏览器语言
        const browserLanguage = this.detectBrowserLanguage()
        if (browserLanguage && this.translations[browserLanguage]) {
          this.currentLanguage = browserLanguage
        }
      }
    } catch (error) {
      console.warn('Failed to load saved language:', error)
    }
  }

  // 检测浏览器语言
  detectBrowserLanguage() {
    const languages = navigator.languages || [navigator.language || navigator.userLanguage]
    
    for (const lang of languages) {
      // 检查完整语言代码 (zh-CN)
      if (this.translations[lang]) {
        return lang
      }
      
      // 检查语言前缀 (zh)
      const prefix = lang.split('-')[0]
      if (this.translations[prefix]) {
        return prefix
      }
    }
    
    return this.fallbackLanguage
  }

  // 设置语言
  setLanguage(language) {
    if (!this.translations[language]) {
      console.warn(`Language '${language}' not found, using fallback '${this.fallbackLanguage}'`)
      language = this.fallbackLanguage
    }
    
    const oldLanguage = this.currentLanguage
    this.currentLanguage = language
    
    // 保存到localStorage
    try {
      localStorage.setItem('app-language', language)
    } catch (error) {
      console.warn('Failed to save language preference:', error)
    }
    
    // 更新页面文本
    this.updatePageText()
    
    // 通知语言变更回调
    this.notifyLanguageChange(language, oldLanguage)
    
    console.log(`Language changed from '${oldLanguage}' to '${language}'`)
  }

  // 获取翻译文本
  t(key, params = {}) {
    let text = this.translations[this.currentLanguage][key] || 
               this.translations[this.fallbackLanguage][key] || 
               key
    
    // 替换参数
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(param => {
        const placeholder = new RegExp(`{${param}}`, 'g')
        text = text.replace(placeholder, params[param])
      })
    }
    
    return text
  }

  // 获取当前语言
  getCurrentLanguage() {
    return this.currentLanguage
  }

  // 获取可用语言列表
  getAvailableLanguages() {
    return Object.keys(this.translations).map(code => ({
      code,
      name: this.translations[code]['settings.language.' + code] || code,
      nativeName: this.getNativeLanguageName(code)
    }))
  }

  // 获取语言的本地名称
  getNativeLanguageName(code) {
    const nativeNames = {
      'en': 'English',
      'zh': '中文'
    }
    return nativeNames[code] || code
  }

  // 更新页面文本
  updatePageText() {
    // 更新所有带有 data-i18n 属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n')
      const params = this.extractParamsFromElement(element)
      const text = this.t(key, params)
      
      if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'search')) {
        element.placeholder = text
      } else if (element.tagName === 'INPUT' && element.type === 'button') {
        element.value = text
      } else if (element.tagName === 'OPTION') {
        element.textContent = text
      } else {
        element.textContent = text
      }
    })

    // 更新页面标题
    const titleElement = document.querySelector('title')
    if (titleElement) {
      titleElement.textContent = this.t('app.title')
    }
    
    // 更新select选项的翻译
    this.updateSelectOptions()
    
    // 更新动态内容
    this.updateDynamicContent()
  }

  // 从元素中提取参数
  extractParamsFromElement(element) {
    const params = {}
    
    // 从data属性中提取参数
    Array.from(element.attributes).forEach(attr => {
      if (attr.name.startsWith('data-i18n-')) {
        const paramName = attr.name.replace('data-i18n-', '')
        params[paramName] = attr.value
      }
    })
    
    return params
  }

  // 更新select选项
  updateSelectOptions() {
    // 更新主题选项
    const themeSelect = document.getElementById('theme')
    if (themeSelect) {
      Array.from(themeSelect.options).forEach(option => {
        const key = `settings.theme.${option.value}`
        if (this.translations[this.currentLanguage][key] || this.translations[this.fallbackLanguage][key]) {
          option.textContent = this.t(key)
        }
      })
    }
    
    // 更新语言选项
    const languageSelect = document.getElementById('language')
    if (languageSelect) {
      Array.from(languageSelect.options).forEach(option => {
        const key = `settings.language.${option.value}`
        if (this.translations[this.currentLanguage][key] || this.translations[this.fallbackLanguage][key]) {
          option.textContent = this.t(key)
        }
      })
    }
    
    // 更新窗口行为选项
    const windowBehaviorSelect = document.getElementById('windowBehavior')
    if (windowBehaviorSelect) {
      Array.from(windowBehaviorSelect.options).forEach(option => {
        const key = `settings.windowBehavior.${option.value}`
        if (this.translations[this.currentLanguage][key] || this.translations[this.fallbackLanguage][key]) {
          option.textContent = this.t(key)
        }
      })
    }
    
    // 更新日志级别选项
    const logLevelSelect = document.getElementById('logLevel')
    if (logLevelSelect) {
      Array.from(logLevelSelect.options).forEach(option => {
        const key = `settings.logLevel.${option.value}`
        if (this.translations[this.currentLanguage][key] || this.translations[this.fallbackLanguage][key]) {
          option.textContent = this.t(key)
        }
      })
    }
  }

  // 更新动态内容
  updateDynamicContent() {
    // 更新消息通知
    this.updateMessageNotifications()
    
    // 更新下载进度状态
    this.updateDownloadStatuses()
    
    // 更新文件大小显示
    this.updateFileSizes()
  }

  // 更新消息通知
  updateMessageNotifications() {
    const messages = document.querySelectorAll('.message')
    messages.forEach(message => {
      // 这里可以根据需要更新消息内容
      // 通常消息是动态生成的，所以可能不需要特别处理
    })
  }

  // 更新下载状态
  updateDownloadStatuses() {
    const statusElements = document.querySelectorAll('[data-status]')
    statusElements.forEach(element => {
      const status = element.getAttribute('data-status')
      const key = `download.${status}`
      if (this.translations[this.currentLanguage][key] || this.translations[this.fallbackLanguage][key]) {
        element.textContent = this.t(key)
      }
    })
  }

  // 更新文件大小显示
  updateFileSizes() {
    // 这个通常由formatFileSize函数处理，这里只是示例
    const sizeElements = document.querySelectorAll('[data-file-size]')
    sizeElements.forEach(element => {
      const bytes = parseInt(element.getAttribute('data-file-size'))
      if (!isNaN(bytes)) {
        element.textContent = this.formatFileSize(bytes)
      }
    })
  }

  // 格式化文件大小（带国际化）
  formatFileSize(bytes) {
    if (bytes === 0) return `0 ${this.t('files.bytes')}`
    
    const k = 1024
    const sizes = ['bytes', 'kb', 'mb', 'gb', 'tb']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(2))
    
    return `${size} ${this.t('files.' + sizes[i])}`
  }

  // 格式化时间（带国际化）
  formatTime(seconds) {
    if (seconds < 60) {
      return this.t('time.remaining', { time: `${seconds} ${this.t('time.seconds')}` })
    }
    
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
      const remainingSeconds = seconds % 60
      if (remainingSeconds === 0) {
        return this.t('time.remaining', { time: `${minutes} ${this.t('time.minutes')}` })
      } else {
        return this.t('time.remaining', { 
          time: `${minutes} ${this.t('time.minutes')} ${remainingSeconds} ${this.t('time.seconds')}`
        })
      }
    }
    
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return this.t('time.remaining', { 
      time: `${hours} ${this.t('time.hours')} ${remainingMinutes} ${this.t('time.minutes')}`
    })
  }

  // 格式化相对时间
  formatRelativeTime(timestamp) {
    const now = Date.now()
    const diff = now - timestamp
    
    if (diff < 1000) {
      return this.t('time.now')
    }
    
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) {
      return this.t('time.ago', { time: `${seconds} ${this.t('time.seconds')}` })
    }
    
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
      return this.t('time.ago', { time: `${minutes} ${this.t('time.minutes')}` })
    }
    
    const hours = Math.floor(minutes / 60)
    if (hours < 24) {
      return this.t('time.ago', { time: `${hours} ${this.t('time.hours')}` })
    }
    
    const days = Math.floor(hours / 24)
    return this.t('time.ago', { time: `${days} ${this.t('time.days')}` })
  }

  // 添加语言变更监听器
  onLanguageChange(callback) {
    if (typeof callback === 'function') {
      this.languageChangeCallbacks.push(callback)
    }
  }

  // 移除语言变更监听器
  offLanguageChange(callback) {
    const index = this.languageChangeCallbacks.indexOf(callback)
    if (index > -1) {
      this.languageChangeCallbacks.splice(index, 1)
    }
  }

  // 通知语言变更
  notifyLanguageChange(newLanguage, oldLanguage) {
    this.languageChangeCallbacks.forEach(callback => {
      try {
        callback(newLanguage, oldLanguage)
      } catch (error) {
        console.error('Error in language change callback:', error)
      }
    })
  }

  // 添加翻译
  addTranslations(language, translations) {
    if (!this.translations[language]) {
      this.translations[language] = {}
    }
    
    Object.assign(this.translations[language], translations)
  }

  // 检查翻译是否存在
  hasTranslation(key, language = null) {
    const lang = language || this.currentLanguage
    return !!(this.translations[lang] && this.translations[lang][key])
  }

  // 获取缺失的翻译键
  getMissingTranslations(language = null) {
    const lang = language || this.currentLanguage
    const fallbackKeys = Object.keys(this.translations[this.fallbackLanguage])
    const currentKeys = Object.keys(this.translations[lang] || {})
    
    return fallbackKeys.filter(key => !currentKeys.includes(key))
  }

  // 验证翻译完整性
  validateTranslations() {
    const languages = Object.keys(this.translations)
    const report = {}
    
    languages.forEach(lang => {
      const missing = this.getMissingTranslations(lang)
      report[lang] = {
        total: Object.keys(this.translations[this.fallbackLanguage]).length,
        translated: Object.keys(this.translations[lang]).length,
        missing: missing.length,
        missingKeys: missing,
        completeness: ((Object.keys(this.translations[lang]).length / Object.keys(this.translations[this.fallbackLanguage]).length) * 100).toFixed(1) + '%'
      }
    })
    
    return report
  }

  // 导出翻译为JSON
  exportTranslations(language = null) {
    if (language) {
      return JSON.stringify(this.translations[language], null, 2)
    } else {
      return JSON.stringify(this.translations, null, 2)
    }
  }

  // 从JSON导入翻译
  importTranslations(jsonString) {
    try {
      const imported = JSON.parse(jsonString)
      
      if (typeof imported === 'object' && imported !== null) {
        Object.keys(imported).forEach(language => {
          if (typeof imported[language] === 'object') {
            this.addTranslations(language, imported[language])
          }
        })
        
        // 更新页面文本
        this.updatePageText()
        
        return true
      }
    } catch (error) {
      console.error('Failed to import translations:', error)
    }
    
    return false
  }

  // 初始化应用程序时调用
  initialize() {
    // 更新页面文本
    this.updatePageText()
    
    // 监听DOM变化以自动更新新添加的元素
    this.observeDOM()
    
    console.log(`I18n initialized with language: ${this.currentLanguage}`)
  }

  // 监听DOM变化
  observeDOM() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 更新新添加的元素
            this.updateElementTranslations(node)
          }
        })
      })
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  // 更新单个元素的翻译
  updateElementTranslations(element) {
    // 更新元素本身
    if (element.hasAttribute && element.hasAttribute('data-i18n')) {
      const key = element.getAttribute('data-i18n')
      const params = this.extractParamsFromElement(element)
      const text = this.t(key, params)
      
      if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'search')) {
        element.placeholder = text
      } else {
        element.textContent = text
      }
    }
    
    // 更新子元素
    if (element.querySelectorAll) {
      element.querySelectorAll('[data-i18n]').forEach(child => {
        this.updateElementTranslations(child)
      })
    }
  }
}

// 创建全局实例
window.i18n = new I18n()

// 导出常用函数到全局作用域
window.t = (key, params) => window.i18n.t(key, params)
window.formatFileSize = (bytes) => window.i18n.formatFileSize(bytes)
window.formatTime = (seconds) => window.i18n.formatTime(seconds)
window.formatRelativeTime = (timestamp) => window.i18n.formatRelativeTime(timestamp)

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.i18n.initialize()
  })
} else {
  window.i18n.initialize()
}