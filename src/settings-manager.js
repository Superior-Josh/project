// 重构的设置管理器 - 保留所有功能但简化代码结构

import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export class SettingsManager {
  constructor(settingsDir = './settings') {
    this.settingsDir = settingsDir
    this.settingsFile = path.join(settingsDir, 'app-settings.json')
    this.settings = new Map()
    this.initialized = false

    this.defaultSettings = {
      // Window & UI Settings
      windowBehavior: 'close',
      autoStartNode: true,
      theme: 'system',

      // File & Download Settings
      downloadPath: path.join(os.homedir(), 'Downloads', 'P2P-Files'),
      autoCreateSubfolders: true,
      maxConcurrentDownloads: 3,
      chunkSize: 256 * 1024,
      enableResumeDownload: true,

      // Network Settings with NAT Traversal
      autoConnectToPeers: true,
      maxConnections: 200, // 增加以支持更多中继连接
      connectionTimeout: 45, // 增加超时时间以适应中继连接

      // NAT穿透设置
      enableNATTraversal: true,
      enableUPnP: true,
      enableHolePunching: true,
      enableAutoRelay: true,
      enableCircuitRelay: true,

      // UPnP设置
      upnpDiscoveryTimeout: 30, // 秒
      upnpPortMappingTTL: 3600, // 1小时
      enableUpnpIPv6: false,

      // 洞穿设置
      holePunchTimeout: 30, // 秒
      holePunchRetries: 3,
      enableDCUtR: true, // Direct Connection Upgrade through Relay

      // 中继设置
      maxRelayConnections: 5,
      relayConnectionTimeout: 30,
      enableRelayServer: false, // 是否作为中继服务器
      relayBandwidthLimit: 1024, // KB/s，中继带宽限制
      relayConnectionLimit: 50, // 作为中继时的最大连接数

      // 自定义引导节点和中继节点
      customBootstrapNodes: [],
      customRelayNodes: [],

      // 网络发现设置
      enableMDNS: true,
      mdnsInterval: 20, // 秒
      enableDHTDiscovery: true,
      dhtRandomWalkInterval: 300, // 秒

      // 连接策略
      preferDirectConnections: true,
      maxRelayHops: 1,
      connectionUpgradeTimeout: 10, // 从中继升级到直接连接的超时时间

      // 诊断和调试
      enableConnectionDiagnostics: false,
      natDetectionInterval: 300, // 秒，NAT类型检测间隔
      logNetworkEvents: false,

      // 性能优化
      connectionPooling: true,
      reuseConnections: true,

      // 安全设置
      allowUnencryptedConnections: false,
      trustedRelayNodes: [], // 信任的中继节点列表
      blockSuspiciousConnections: true,

      // 原有的性能设置
      memoryLimit: 512,
      diskCacheSize: 1024,
      enableFileValidation: true,
      cleanupTempFiles: true,

      // 备份设置
      autoBackupSettings: true,
      autoBackupDatabase: true,
      backupInterval: 24,
      maxBackupFiles: 5
    }
  }

  async initialize() {
    try {
      await fs.mkdir(this.settingsDir, { recursive: true })
      await this.loadSettings()
      this.initialized = true
      console.log('Settings manager initialized')
      this.setupAutoSave()
    } catch (error) {
      console.error('Error initializing settings manager:', error)
      throw error
    }
  }

  async loadSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8')
      const loadedSettings = JSON.parse(data)

      // 合并默认设置和加载的设置
      this.settings = new Map(Object.entries({
        ...this.defaultSettings,
        ...loadedSettings
      }))

      console.log('Settings loaded successfully')
    } catch (error) {
      // 使用默认设置
      this.settings = new Map(Object.entries(this.defaultSettings))
      await this.saveSettings()
      console.log('Created default settings file')
    }
  }

  async saveSettings() {
    try {
      const settingsObj = Object.fromEntries(this.settings)
      await fs.writeFile(this.settingsFile, JSON.stringify(settingsObj, null, 2))
      console.log('Settings saved successfully')
    } catch (error) {
      console.error('Error saving settings:', error)
      throw error
    }
  }

  setupAutoSave() {
    setInterval(() => {
      this.saveSettings().catch(error => {
        console.error('Auto-save settings failed:', error)
      })
    }, 5 * 60 * 1000)
  }

  get(key, defaultValue = null) {
    return this.settings.get(key) ?? defaultValue
  }

  async set(key, value) {
    if (!this.validateSetting(key, value)) {
      throw new Error(`Invalid value for setting '${key}': ${value}`)
    }

    const oldValue = this.settings.get(key)
    this.settings.set(key, value)

    await this.handleSpecialSetting(key, value, oldValue)
    await this.saveSettings()
  }

  async setMultiple(settingsObj) {
    // 验证所有设置
    for (const [key, value] of Object.entries(settingsObj)) {
      if (!this.validateSetting(key, value)) {
        throw new Error(`Invalid value for setting '${key}': ${value}`)
      }
    }

    const oldValues = {}
    for (const [key, value] of Object.entries(settingsObj)) {
      oldValues[key] = this.settings.get(key)
      this.settings.set(key, value)
    }

    for (const [key, value] of Object.entries(settingsObj)) {
      await this.handleSpecialSetting(key, value, oldValues[key])
    }

    await this.saveSettings()
  }

  async handleSpecialSetting(key, newValue, oldValue) {
    switch (key) {
      case 'downloadPath':
        if (newValue !== oldValue) {
          await this.ensureDirectoryExists(newValue)
        }
        break

      case 'customBootstrapNodes':
      case 'customRelayNodes':
        if (newValue !== oldValue) {
          console.log(`Updated ${key}:`, newValue)
          // 验证节点地址格式
          this.validateNodeAddresses(newValue, key)
        }
        break

      case 'enableNATTraversal':
        if (newValue !== oldValue) {
          console.log(`NAT traversal ${newValue ? 'enabled' : 'disabled'}`)
          if (!newValue) {
            // 如果禁用NAT穿透，也禁用相关功能
            this.settings.set('enableUPnP', false)
            this.settings.set('enableHolePunching', false)
            this.settings.set('enableAutoRelay', false)
          }
        }
        break

      case 'maxConnections':
        if (newValue !== oldValue && newValue < 50) {
          console.warn('Low max connections may affect NAT traversal performance')
        }
        break
    }
  }

  validateNodeAddresses(addresses, settingName) {
    if (!Array.isArray(addresses)) {
      throw new Error(`${settingName} must be an array`)
    }

    for (const address of addresses) {
      if (typeof address !== 'string' || !address.startsWith('/')) {
        throw new Error(`Invalid multiaddr format in ${settingName}: ${address}`)
      }

      // 基本的multiaddr格式验证
      if (!address.includes('/p2p/')) {
        console.warn(`Multiaddr may be incomplete (missing peer ID): ${address}`)
      }
    }
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true })
      console.log(`Ensured directory exists: ${dirPath}`)
    } catch (error) {
      console.warn(`Failed to create directory ${dirPath}:`, error.message)
    }
  }

  getAll() {
    return Object.fromEntries(this.settings)
  }

  async resetToDefaults() {
    this.settings = new Map(Object.entries(this.defaultSettings))
    await this.saveSettings()
  }

  validateSetting(key, value) {
    const validators = {
      // 基础设置验证
      downloadPath: (val) => typeof val === 'string' && val.length > 0,
      maxConcurrentDownloads: (val) => Number.isInteger(val) && val >= 1 && val <= 20,
      chunkSize: (val) => Number.isInteger(val) && val >= 1024 && val <= 10 * 1024 * 1024,
      windowBehavior: (val) => ['close', 'hide'].includes(val),
      theme: (val) => ['light', 'dark', 'system'].includes(val),

      // 网络设置验证
      maxConnections: (val) => Number.isInteger(val) && val >= 10 && val <= 1000,
      connectionTimeout: (val) => Number.isInteger(val) && val >= 5 && val <= 300,

      // NAT穿透设置验证
      upnpDiscoveryTimeout: (val) => Number.isInteger(val) && val >= 5 && val <= 120,
      upnpPortMappingTTL: (val) => Number.isInteger(val) && val >= 300 && val <= 86400,
      holePunchTimeout: (val) => Number.isInteger(val) && val >= 5 && val <= 120,
      holePunchRetries: (val) => Number.isInteger(val) && val >= 1 && val <= 10,

      // 中继设置验证
      maxRelayConnections: (val) => Number.isInteger(val) && val >= 1 && val <= 20,
      relayConnectionTimeout: (val) => Number.isInteger(val) && val >= 5 && val <= 120,
      relayBandwidthLimit: (val) => Number.isInteger(val) && val >= 64 && val <= 10240,
      relayConnectionLimit: (val) => Number.isInteger(val) && val >= 5 && val <= 500,

      // 发现设置验证
      mdnsInterval: (val) => Number.isInteger(val) && val >= 5 && val <= 300,
      dhtRandomWalkInterval: (val) => Number.isInteger(val) && val >= 60 && val <= 3600,
      natDetectionInterval: (val) => Number.isInteger(val) && val >= 60 && val <= 3600,

      // 连接策略验证
      maxRelayHops: (val) => Number.isInteger(val) && val >= 1 && val <= 5,
      connectionUpgradeTimeout: (val) => Number.isInteger(val) && val >= 5 && val <= 60,

      // 数组设置验证
      customBootstrapNodes: (val) => Array.isArray(val),
      customRelayNodes: (val) => Array.isArray(val),
      trustedRelayNodes: (val) => Array.isArray(val),

      // 性能设置验证
      memoryLimit: (val) => Number.isInteger(val) && val >= 128 && val <= 8192,
      diskCacheSize: (val) => Number.isInteger(val) && val >= 100 && val <= 20480,
      backupInterval: (val) => Number.isInteger(val) && val >= 1 && val <= 168,
      maxBackupFiles: (val) => Number.isInteger(val) && val >= 1 && val <= 50
    }

    const validator = validators[key]
    if (validator) {
      return validator(value)
    }

    // 默认布尔值验证
    if (typeof this.defaultSettings[key] === 'boolean') {
      return typeof value === 'boolean'
    }

    return true
  }

  // 获取NAT穿透相关设置
  getNATTraversalSettings() {
    return {
      enabled: this.get('enableNATTraversal'),
      upnp: {
        enabled: this.get('enableUPnP'),
        discoveryTimeout: this.get('upnpDiscoveryTimeout'),
        portMappingTTL: this.get('upnpPortMappingTTL'),
        enableIPv6: this.get('enableUpnpIPv6')
      },
      holePunching: {
        enabled: this.get('enableHolePunching'),
        timeout: this.get('holePunchTimeout'),
        retries: this.get('holePunchRetries'),
        enableDCUtR: this.get('enableDCUtR')
      },
      relay: {
        autoRelay: this.get('enableAutoRelay'),
        circuitRelay: this.get('enableCircuitRelay'),
        maxConnections: this.get('maxRelayConnections'),
        connectionTimeout: this.get('relayConnectionTimeout'),
        enableServer: this.get('enableRelayServer'),
        bandwidthLimit: this.get('relayBandwidthLimit'),
        connectionLimit: this.get('relayConnectionLimit')
      },
      customNodes: {
        bootstrapNodes: this.get('customBootstrapNodes'),
        relayNodes: this.get('customRelayNodes'),
        trustedRelayNodes: this.get('trustedRelayNodes')
      }
    }
  }

  // 获取网络优化建议
  getNetworkOptimizationRecommendations() {
    const recommendations = []

    if (!this.get('enableNATTraversal')) {
      recommendations.push({
        type: 'warning',
        message: 'NAT traversal is disabled. This may limit connectivity to peers behind firewalls.',
        action: 'Enable NAT traversal for better connectivity'
      })
    }

    if (!this.get('enableUPnP')) {
      recommendations.push({
        type: 'info',
        message: 'UPnP is disabled. Manual port forwarding may be required for optimal connectivity.',
        action: 'Enable UPnP for automatic port forwarding'
      })
    }

    if (!this.get('enableHolePunching')) {
      recommendations.push({
        type: 'info',
        message: 'Hole punching is disabled. Direct connections may be limited.',
        action: 'Enable hole punching for direct peer connections'
      })
    }

    if (!this.get('enableAutoRelay')) {
      recommendations.push({
        type: 'warning',
        message: 'Auto relay is disabled. Connectivity behind restrictive NATs may be limited.',
        action: 'Enable auto relay for fallback connectivity'
      })
    }

    if (this.get('maxConnections') < 50) {
      recommendations.push({
        type: 'info',
        message: 'Low maximum connections limit may affect network performance.',
        action: 'Consider increasing max connections to at least 50'
      })
    }

    if (this.get('maxRelayConnections') < 2) {
      recommendations.push({
        type: 'warning',
        message: 'Very low relay connection limit may affect fallback connectivity.',
        action: 'Consider increasing max relay connections to at least 2'
      })
    }

    const customBootstrap = this.get('customBootstrapNodes')
    const customRelay = this.get('customRelayNodes')

    if (customBootstrap.length === 0 && customRelay.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'Using default bootstrap and relay nodes only.',
        action: 'Consider adding custom nodes for better network resilience'
      })
    }

    return recommendations
  }

  // 生成网络配置摘要
  getNetworkConfigSummary() {
    const natSettings = this.getNATTraversalSettings()

    return {
      connectivity: {
        maxConnections: this.get('maxConnections'),
        autoConnect: this.get('autoConnectToPeers'),
        connectionTimeout: this.get('connectionTimeout')
      },
      natTraversal: {
        enabled: natSettings.enabled,
        methods: [
          natSettings.upnp.enabled ? 'UPnP' : null,
          natSettings.holePunching.enabled ? 'Hole Punching' : null,
          natSettings.relay.autoRelay ? 'Auto Relay' : null
        ].filter(Boolean)
      },
      discovery: {
        mdns: this.get('enableMDNS'),
        dht: this.get('enableDHTDiscovery'),
        customBootstrap: this.get('customBootstrapNodes').length,
        customRelay: this.get('customRelayNodes').length
      },
      performance: {
        preferDirect: this.get('preferDirectConnections'),
        connectionPooling: this.get('connectionPooling'),
        reuseConnections: this.get('reuseConnections')
      },
      security: {
        encryptedOnly: !this.get('allowUnencryptedConnections'),
        blockSuspicious: this.get('blockSuspiciousConnections'),
        trustedRelays: this.get('trustedRelayNodes').length
      }
    }
  }

  // 创建设置备份
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupDir = path.join(this.settingsDir, 'backups')
      await fs.mkdir(backupDir, { recursive: true })

      const backupFile = path.join(backupDir, `p2p-settings-backup-${timestamp}.json`)
      const currentSettings = Object.fromEntries(this.settings)

      const backupData = {
        version: '2.0',
        type: 'p2p-settings',
        createdAt: new Date().toISOString(),
        platform: process.platform,
        nodeVersion: process.version,
        features: {
          natTraversal: true,
          holePunching: true,
          circuitRelay: true,
          upnp: true
        },
        settings: currentSettings,
        networkConfig: this.getNetworkConfigSummary()
      }

      await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2))
      await this.cleanupOldBackups(backupDir)

      return backupFile
    } catch (error) {
      console.error('Error creating settings backup:', error)
      throw error
    }
  }

  // 从备份恢复设置
  async restoreFromBackup(backupFile) {
    try {
      const data = await fs.readFile(backupFile, 'utf8')
      const backupData = JSON.parse(data)

      // 处理不同版本的备份格式
      let backupSettings
      if (backupData.version && backupData.settings) {
        backupSettings = backupData.settings
        console.log(`Restoring from ${backupData.type || 'unknown'} backup version ${backupData.version}`)
      } else {
        backupSettings = backupData
        console.log('Restoring from legacy backup format')
      }

      // 验证和过滤设置
      const validSettings = {}
      for (const [key, value] of Object.entries(backupSettings)) {
        if (this.validateSetting(key, value)) {
          validSettings[key] = value
        } else {
          console.warn(`Skipping invalid setting during restore: ${key} = ${value}`)
        }
      }

      // 合并默认设置和有效的备份设置
      this.settings = new Map(Object.entries({
        ...this.defaultSettings,
        ...validSettings
      }))

      await this.saveSettings()
      console.log('Settings restored from backup successfully')
    } catch (error) {
      console.error('Error restoring from backup:', error)
      throw error
    }
  }

  // 清理旧备份
  async cleanupOldBackups(backupDir) {
    try {
      const files = await fs.readdir(backupDir)
      const backupFiles = []

      for (const file of files) {
        if (file.startsWith('p2p-settings-backup-') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file)
          const stats = await fs.stat(filePath)
          backupFiles.push({
            name: file,
            path: filePath,
            time: stats.mtime
          })
        }
      }

      backupFiles.sort((a, b) => b.time - a.time)

      const maxBackups = this.get('maxBackupFiles', 5)
      if (backupFiles.length > maxBackups) {
        const filesToDelete = backupFiles.slice(maxBackups)
        for (const file of filesToDelete) {
          await fs.unlink(file.path)
        }
      }
    } catch (error) {
      console.error('Error cleaning up old backups:', error)
    }
  }

  // 导出设置
  async exportSettings(filePath) {
    const exportData = {
      version: '2.0',
      type: 'p2p-settings-export',
      exportedAt: new Date().toISOString(),
      settings: Object.fromEntries(this.settings)
    }

    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2))
  }

  // 导入设置
  async importSettings(filePath) {
    const data = await fs.readFile(filePath, 'utf8')
    const importData = JSON.parse(data)

    const settings = importData.settings || importData
    await this.setMultiple(settings)
  }

  // 获取可用备份列表
  async getAvailableBackups() {
    try {
      const backupDir = path.join(this.settingsDir, 'backups')
      const files = await fs.readdir(backupDir)
      const backups = []

      for (const file of files) {
        if (file.startsWith('p2p-settings-backup-') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file)
          const stats = await fs.stat(filePath)
          backups.push({
            name: file,
            path: filePath,
            created: stats.mtime.toISOString(),
            size: stats.size
          })
        }
      }

      return backups.sort((a, b) => new Date(b.created) - new Date(a.created))
    } catch (error) {
      console.error('Error getting available backups:', error)
      return []
    }
  }
}