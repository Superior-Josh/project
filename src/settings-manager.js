// settings-manager.js - Enhanced Settings Manager with i18n support
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export class SettingsManager {
  constructor(settingsDir = './settings') {
    this.settingsDir = settingsDir
    this.settingsFile = path.join(settingsDir, 'app-settings.json')
    this.settings = new Map()
    this.initialized = false
    
    // Default settings with i18n support
    this.defaultSettings = {
      // File & Download Settings
      downloadPath: path.join(os.homedir(), 'Downloads', 'P2P-Files'),
      autoCreateSubfolders: true,
      maxConcurrentDownloads: 3,
      chunkSize: 256 * 1024, // 256KB
      enableResumeDownload: true,
      
      // Window & UI Settings
      windowBehavior: 'minimize', // 'close', 'minimize', 'hide'
      startMinimized: false,
      autoStartNode: true,
      showNotifications: true,
      theme: 'system', // 'light', 'dark', 'system'
      
      // Network Settings
      autoConnectToPeers: true,
      maxConnections: 50,
      connectionTimeout: 30, // in seconds for UI display
      enableUpnp: true,
      customBootstrapNodes: [],
      
      // Privacy & Security
      enableEncryption: true,
      shareFileByDefault: false,
      autoAcceptConnections: true,
      logLevel: 'info', // 'debug', 'info', 'warn', 'error'
      
      // Performance Settings
      memoryLimit: 512, // MB
      diskCacheSize: 1024, // MB
      enableFileValidation: true,
      cleanupTempFiles: true,
      
      // Backup & Sync
      autoBackupSettings: true,
      autoBackupDatabase: true,
      backupInterval: 24, // hours
      maxBackupFiles: 5
    }
  }

  async initialize() {
    try {
      await fs.mkdir(this.settingsDir, { recursive: true })
      await this.loadSettings()
      this.initialized = true
      console.log('Settings manager initialized')
      
      // Setup auto-save
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
      
      // Merge with defaults (in case new settings were added)
      this.settings = new Map(Object.entries({
        ...this.defaultSettings,
        ...loadedSettings
      }))
      
      console.log('Settings loaded successfully')
    } catch (error) {
      // File doesn't exist or invalid, use defaults
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
    // Auto-save every 5 minutes
    setInterval(() => {
      this.saveSettings().catch(error => {
        console.error('Auto-save settings failed:', error)
      })
    }, 5 * 60 * 1000)
  }

  // Get setting value
  get(key, defaultValue = null) {
    return this.settings.get(key) ?? defaultValue
  }

  // Set setting value
  async set(key, value) {
    // Validate setting before saving
    if (!this.validateSetting(key, value)) {
      throw new Error(`Invalid value for setting '${key}': ${value}`)
    }
    
    const oldValue = this.settings.get(key)
    this.settings.set(key, value)
    
    // Handle special settings that need immediate application
    await this.handleSpecialSetting(key, value, oldValue)
    
    await this.saveSettings()
  }

  // Set multiple settings at once
  async setMultiple(settingsObj) {
    // Validate all settings first
    for (const [key, value] of Object.entries(settingsObj)) {
      if (!this.validateSetting(key, value)) {
        throw new Error(`Invalid value for setting '${key}': ${value}`)
      }
    }
    
    // Apply all settings
    const oldValues = {}
    for (const [key, value] of Object.entries(settingsObj)) {
      oldValues[key] = this.settings.get(key)
      this.settings.set(key, value)
    }
    
    // Handle special settings
    for (const [key, value] of Object.entries(settingsObj)) {
      await this.handleSpecialSetting(key, value, oldValues[key])
    }
    
    await this.saveSettings()
  }

  // Handle special settings that need immediate application
  async handleSpecialSetting(key, newValue, oldValue) {
    switch (key) {
      case 'theme':
        if (newValue !== oldValue) {
          this.applyThemeSetting(newValue)
          console.log(`Theme changed from '${oldValue}' to '${newValue}'`)
        }
        break
        
      case 'downloadPath':
        if (newValue !== oldValue) {
          await this.ensureDirectoryExists(newValue)
        }
        break
        
      default:
        // No special handling needed
        break
    }
  }

  // Apply theme setting
  applyThemeSetting(theme) {
    if (typeof document !== 'undefined') {
      const body = document.body
      
      // Remove existing theme classes
      body.classList.remove('theme-light', 'theme-dark', 'theme-system')
      
      // Apply new theme class
      body.classList.add(`theme-${theme}`)
      
      // Handle system theme
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        body.classList.toggle('theme-system-dark', prefersDark)
        body.classList.toggle('theme-system-light', !prefersDark)
      }
    }
  }

  // Ensure directory exists
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true })
      console.log(`Ensured directory exists: ${dirPath}`)
    } catch (error) {
      console.warn(`Failed to create directory ${dirPath}:`, error.message)
    }
  }

  // Get all settings
  getAll() {
    return Object.fromEntries(this.settings)
  }

  // Reset to defaults
  async resetToDefaults() {
    this.settings = new Map(Object.entries(this.defaultSettings))
    await this.saveSettings()
  }

  // Reset specific category
  async resetCategory(category) {
    const categorySettings = this.getSettingsByCategory(category)
    for (const key of Object.keys(categorySettings)) {
      if (this.defaultSettings[key] !== undefined) {
        this.settings.set(key, this.defaultSettings[key])
      }
    }
    await this.saveSettings()
  }

  // Get settings by category
  getSettingsByCategory(category) {
    const categories = {
      download: ['downloadPath', 'autoCreateSubfolders', 'maxConcurrentDownloads', 'chunkSize', 'enableResumeDownload'],
      window: ['windowBehavior', 'startMinimized', 'autoStartNode', 'showNotifications', 'theme'],
      network: ['autoConnectToPeers', 'maxConnections', 'connectionTimeout', 'enableUpnp', 'customBootstrapNodes'],
      privacy: ['enableEncryption', 'shareFileByDefault', 'autoAcceptConnections', 'logLevel'],
      performance: ['memoryLimit', 'diskCacheSize', 'enableFileValidation', 'cleanupTempFiles'],
      backup: ['autoBackupSettings', 'autoBackupDatabase', 'backupInterval', 'maxBackupFiles']
    }

    const categoryKeys = categories[category] || []
    const result = {}
    
    for (const key of categoryKeys) {
      result[key] = this.settings.get(key)
    }
    
    return result
  }

  // Validate setting value
  validateSetting(key, value) {
    const validators = {
      downloadPath: (val) => typeof val === 'string' && val.length > 0,
      maxConcurrentDownloads: (val) => Number.isInteger(val) && val >= 1 && val <= 10,
      chunkSize: (val) => Number.isInteger(val) && val >= 1024 && val <= 10 * 1024 * 1024,
      windowBehavior: (val) => ['close', 'minimize', 'hide'].includes(val),
      theme: (val) => ['light', 'dark', 'system'].includes(val),
      maxConnections: (val) => Number.isInteger(val) && val >= 1 && val <= 200,
      connectionTimeout: (val) => Number.isInteger(val) && val >= 5 && val <= 120,
      logLevel: (val) => ['debug', 'info', 'warn', 'error'].includes(val),
      memoryLimit: (val) => Number.isInteger(val) && val >= 128 && val <= 4096,
      diskCacheSize: (val) => Number.isInteger(val) && val >= 100 && val <= 10240,
      backupInterval: (val) => Number.isInteger(val) && val >= 1 && val <= 168,
      maxBackupFiles: (val) => Number.isInteger(val) && val >= 1 && val <= 50
    }

    const validator = validators[key]
    if (validator) {
      return validator(value)
    }
    
    // Default validation for boolean values
    if (typeof this.defaultSettings[key] === 'boolean') {
      return typeof value === 'boolean'
    }
    
    return true
  }

  // Create backup of current settings
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupDir = path.join(this.settingsDir, 'backups')
      await fs.mkdir(backupDir, { recursive: true })
      
      const backupFile = path.join(backupDir, `settings-backup-${timestamp}.json`)
      const currentSettings = Object.fromEntries(this.settings)
      
      // Add metadata to backup
      const backupData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        platform: process.platform,
        nodeVersion: process.version,
        settings: currentSettings
      }
      
      await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2))
      
      // Clean up old backups
      await this.cleanupOldBackups(backupDir)
      
      return backupFile
    } catch (error) {
      console.error('Error creating settings backup:', error)
      throw error
    }
  }

  // Restore from backup
  async restoreFromBackup(backupFile) {
    try {
      const data = await fs.readFile(backupFile, 'utf8')
      const backupData = JSON.parse(data)
      
      // Handle both old format (direct settings) and new format (with metadata)
      const backupSettings = backupData.settings || backupData
      
      // Validate backup settings
      for (const [key, value] of Object.entries(backupSettings)) {
        if (!this.validateSetting(key, value)) {
          console.warn(`Invalid setting in backup, skipping: ${key} = ${value}`)
          delete backupSettings[key]
        }
      }
      
      this.settings = new Map(Object.entries({
        ...this.defaultSettings,
        ...backupSettings
      }))
      
      await this.saveSettings()
      
      console.log('Settings restored from backup successfully')
    } catch (error) {
      console.error('Error restoring from backup:', error)
      throw error
    }
  }

  // Clean up old backup files
  async cleanupOldBackups(backupDir) {
    try {
      const files = await fs.readdir(backupDir)
      const backupFiles = []
      
      for (const file of files) {
        if (file.startsWith('settings-backup-') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file)
          const stats = await fs.stat(filePath)
          backupFiles.push({
            name: file,
            path: filePath,
            time: stats.mtime
          })
        }
      }
      
      // Sort by modification time (newest first)
      backupFiles.sort((a, b) => b.time - a.time)
      
      // Keep only the specified number of backups
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

  // Get available backup files
  async getAvailableBackups() {
    try {
      const backupDir = path.join(this.settingsDir, 'backups')
      
      try {
        await fs.access(backupDir)
      } catch {
        // Backup directory doesn't exist
        return []
      }
      
      const files = await fs.readdir(backupDir)
      const backupFiles = []
      
      for (const file of files) {
        if (file.startsWith('settings-backup-') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file)
          const stats = await fs.stat(filePath)
          
          // Try to read backup metadata
          let metadata = null
          try {
            const data = await fs.readFile(filePath, 'utf8')
            const backupData = JSON.parse(data)
            if (backupData.version && backupData.createdAt) {
              metadata = {
                version: backupData.version,
                createdAt: backupData.createdAt,
                platform: backupData.platform,
                nodeVersion: backupData.nodeVersion
              }
            }
          } catch {
            // Backup is in old format, ignore metadata
          }
          
          backupFiles.push({
            name: file,
            path: filePath,
            created: stats.mtime,
            size: stats.size,
            metadata
          })
        }
      }
      
      // Sort by creation time (newest first)
      backupFiles.sort((a, b) => b.created - a.created)
      
      return backupFiles
    } catch (error) {
      console.error('Error getting available backups:', error)
      return []
    }
  }

  // Export settings to file
  async exportSettings(exportPath) {
    try {
      const settings = Object.fromEntries(this.settings)
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        platform: process.platform,
        nodeVersion: process.version,
        appVersion: '1.0.0', // This could be read from package.json
        settings
      }
      
      await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2))
      console.log(`Settings exported to: ${exportPath}`)
    } catch (error) {
      console.error('Error exporting settings:', error)
      throw error
    }
  }

  // Import settings from file
  async importSettings(importPath) {
    try {
      const data = await fs.readFile(importPath, 'utf8')
      const importData = JSON.parse(data)
      
      // Handle both old format (direct settings) and new format (with metadata)
      const importedSettings = importData.settings || importData
      
      if (!importedSettings || typeof importedSettings !== 'object') {
        throw new Error('Invalid settings file format')
      }
      
      // Validate imported settings
      const validSettings = {}
      for (const [key, value] of Object.entries(importedSettings)) {
        if (this.validateSetting(key, value)) {
          validSettings[key] = value
        } else {
          console.warn(`Skipping invalid setting during import: ${key} = ${value}`)
        }
      }
      
      // Merge with current settings
      const mergedSettings = {
        ...this.getAll(),
        ...validSettings
      }
      
      this.settings = new Map(Object.entries(mergedSettings))
      
      await this.saveSettings()
      
      console.log(`Settings imported from: ${importPath}`)
    } catch (error) {
      console.error('Error importing settings:', error)
      throw error
    }
  }

  // Get localized settings schema for UI generation
  getLocalizedSettingsSchema() {
    // This method would be called from the renderer process where i18n is available
    const t = (typeof window !== 'undefined' && window.t) ? window.t : (key) => key
    
    return {
      download: {
        title: t('settings.download'),
        icon: 'download',
        description: t('settings.download.desc'),
        settings: {
          downloadPath: {
            type: 'folder',
            title: t('settings.downloadPath'),
            description: t('settings.downloadPath.desc')
          },
          autoCreateSubfolders: {
            type: 'boolean',
            title: t('settings.autoCreateSubfolders'),
            description: t('settings.autoCreateSubfolders.desc')
          },
          maxConcurrentDownloads: {
            type: 'range',
            title: t('settings.maxConcurrentDownloads'),
            description: t('settings.maxConcurrentDownloads.desc'),
            min: 1,
            max: 10,
            step: 1
          },
          chunkSize: {
            type: 'select',
            title: t('settings.chunkSize'),
            description: t('settings.chunkSize.desc'),
            options: [
              { value: 64 * 1024, label: '64KB' },
              { value: 128 * 1024, label: '128KB' },
              { value: 256 * 1024, label: '256KB' },
              { value: 512 * 1024, label: '512KB' },
              { value: 1024 * 1024, label: '1MB' }
            ]
          },
          enableResumeDownload: {
            type: 'boolean',
            title: t('settings.enableResumeDownload'),
            description: t('settings.enableResumeDownload.desc')
          }
        }
      },
      window: {
        title: t('settings.window'),
        icon: 'window',
        description: t('settings.window.desc'),
        settings: {
          windowBehavior: {
            type: 'select',
            title: t('settings.windowBehavior'),
            description: t('settings.windowBehavior.desc'),
            options: [
              { value: 'close', label: t('settings.windowBehavior.close') },
              { value: 'minimize', label: t('settings.windowBehavior.minimize') },
              { value: 'hide', label: t('settings.windowBehavior.hide') }
            ]
          },
          startMinimized: {
            type: 'boolean',
            title: t('settings.startMinimized'),
            description: t('settings.startMinimized.desc')
          },
          autoStartNode: {
            type: 'boolean',
            title: t('settings.autoStartNode'),
            description: t('settings.autoStartNode.desc')
          },
          showNotifications: {
            type: 'boolean',
            title: t('settings.showNotifications'),
            description: t('settings.showNotifications.desc')
          },
          theme: {
            type: 'select',
            title: t('settings.theme'),
            description: t('settings.theme.desc'),
            options: [
              { value: 'system', label: t('settings.theme.system') },
              { value: 'light', label: t('settings.theme.light') },
              { value: 'dark', label: t('settings.theme.dark') }
            ]
          },
        }
      },
      network: {
        title: t('settings.network'),
        icon: 'network',
        description: t('settings.network.desc'),
        settings: {
          autoConnectToPeers: {
            type: 'boolean',
            title: t('settings.autoConnectToPeers'),
            description: t('settings.autoConnectToPeers.desc')
          },
          maxConnections: {
            type: 'range',
            title: t('settings.maxConnections'),
            description: t('settings.maxConnections.desc'),
            min: 1,
            max: 200,
            step: 1
          },
          connectionTimeout: {
            type: 'range',
            title: t('settings.connectionTimeout'),
            description: t('settings.connectionTimeout.desc'),
            min: 5,
            max: 120,
            step: 5,
            unit: 's'
          },
          enableUpnp: {
            type: 'boolean',
            title: t('settings.enableUpnp'),
            description: t('settings.enableUpnp.desc')
          }
        }
      },
      privacy: {
        title: t('settings.privacy'),
        icon: 'shield',
        description: t('settings.privacy.desc'),
        settings: {
          enableEncryption: {
            type: 'boolean',
            title: t('settings.enableEncryption'),
            description: t('settings.enableEncryption.desc')
          },
          shareFileByDefault: {
            type: 'boolean',
            title: t('settings.shareFileByDefault'),
            description: t('settings.shareFileByDefault.desc')
          },
          autoAcceptConnections: {
            type: 'boolean',
            title: t('settings.autoAcceptConnections'),
            description: t('settings.autoAcceptConnections.desc')
          },
          logLevel: {
            type: 'select',
            title: t('settings.logLevel'),
            description: t('settings.logLevel.desc'),
            options: [
              { value: 'error', label: t('settings.logLevel.error') },
              { value: 'warn', label: t('settings.logLevel.warn') },
              { value: 'info', label: t('settings.logLevel.info') },
              { value: 'debug', label: t('settings.logLevel.debug') }
            ]
          }
        }
      },
      performance: {
        title: t('settings.performance'),
        icon: 'gauge',
        description: t('settings.performance.desc'),
        settings: {
          memoryLimit: {
            type: 'range',
            title: t('settings.memoryLimit'),
            description: t('settings.memoryLimit.desc'),
            min: 128,
            max: 4096,
            step: 64,
            unit: 'MB'
          },
          diskCacheSize: {
            type: 'range',
            title: t('settings.diskCacheSize'),
            description: t('settings.diskCacheSize.desc'),
            min: 100,
            max: 10240,
            step: 100,
            unit: 'MB'
          },
          enableFileValidation: {
            type: 'boolean',
            title: t('settings.enableFileValidation'),
            description: t('settings.enableFileValidation.desc')
          },
          cleanupTempFiles: {
            type: 'boolean',
            title: t('settings.cleanupTempFiles'),
            description: t('settings.cleanupTempFiles.desc')
          }
        }
      },
      backup: {
        title: t('settings.backup'),
        icon: 'archive',
        description: t('settings.backup.desc'),
        settings: {
          autoBackupSettings: {
            type: 'boolean',
            title: t('settings.autoBackupSettings'),
            description: t('settings.autoBackupSettings.desc')
          },
          autoBackupDatabase: {
            type: 'boolean',
            title: t('settings.autoBackupDatabase'),
            description: t('settings.autoBackupDatabase.desc')
          },
          backupInterval: {
            type: 'range',
            title: t('settings.backupInterval'),
            description: t('settings.backupInterval.desc'),
            min: 1,
            max: 168,
            step: 1,
            unit: 'h'
          },
          maxBackupFiles: {
            type: 'range',
            title: t('settings.maxBackupFiles'),
            description: t('settings.maxBackupFiles.desc'),
            min: 1,
            max: 50,
            step: 1
          }
        }
      }
    }
  }

  // Get setting metadata for validation and UI hints
  getSettingMetadata(key) {
    const metadata = {
      downloadPath: {
        type: 'string',
        required: true,
        category: 'download'
      },
      autoCreateSubfolders: {
        type: 'boolean',
        category: 'download'
      },
      maxConcurrentDownloads: {
        type: 'number',
        min: 1,
        max: 10,
        category: 'download'
      },
      chunkSize: {
        type: 'number',
        min: 1024,
        max: 10 * 1024 * 1024,
        category: 'download'
      },
      enableResumeDownload: {
        type: 'boolean',
        category: 'download'
      },
      windowBehavior: {
        type: 'string',
        enum: ['close', 'minimize', 'hide'],
        category: 'window'
      },
      startMinimized: {
        type: 'boolean',
        category: 'window'
      },
      autoStartNode: {
        type: 'boolean',
        category: 'window'
      },
      showNotifications: {
        type: 'boolean',
        category: 'window'
      },
      theme: {
        type: 'string',
        enum: ['light', 'dark', 'system'],
        category: 'window'
      },
    }
    
    return metadata[key] || { type: 'unknown' }
  }

  // Get settings validation report
  getValidationReport() {
    const report = {
      valid: [],
      invalid: [],
      warnings: []
    }
    
    for (const [key, value] of this.settings) {
      if (this.validateSetting(key, value)) {
        report.valid.push({ key, value })
      } else {
        report.invalid.push({ key, value, expected: this.getSettingMetadata(key) })
      }
    }
    
    return report
  }
}