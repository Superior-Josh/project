// settings-manager.js
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
      windowBehavior: 'close', // 'close', 'hide'
      autoStartNode: true,
      theme: 'system', // 默认设置为system主题

      // File & Download Settings
      downloadPath: path.join(os.homedir(), 'Downloads', 'P2P-Files'),
      autoCreateSubfolders: true,
      maxConcurrentDownloads: 3,
      chunkSize: 256 * 1024, // 256KB
      enableResumeDownload: true,

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
      // console.log('Settings manager initialized')
      
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
      
      // console.log('Settings loaded successfully')
    } catch (error) {
      // File doesn't exist or invalid, use defaults
      this.settings = new Map(Object.entries(this.defaultSettings))
      await this.saveSettings()
      console.log('Created default settings file with system theme')
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
          console.log(`Theme changed from '${oldValue}' to '${newValue}'`)
          // 主题应用逻辑在前端处理
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
      window: ['windowBehavior', 'autoStartNode', 'theme'],
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
      windowBehavior: (val) => ['close', 'hide'].includes(val),
      theme: (val) => ['light', 'dark', 'system'].includes(val), // 验证主题值
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

  // Get settings schema for UI generation (English only)
  getSettingsSchema() {
    return {
      download: {
        title: 'Download & Files',
        icon: 'download',
        description: 'Configure file download and storage settings',
        settings: {
          downloadPath: {
            type: 'folder',
            title: 'Download Location',
            description: 'Where downloaded files will be saved'
          },
          autoCreateSubfolders: {
            type: 'boolean',
            title: 'Auto Create Subfolders',
            description: 'Automatically create subfolders for different file types'
          },
          maxConcurrentDownloads: {
            type: 'range',
            title: 'Max Concurrent Downloads',
            description: 'Maximum number of files to download simultaneously',
            min: 1,
            max: 10,
            step: 1
          },
          chunkSize: {
            type: 'select',
            title: 'Chunk Size',
            description: 'Size of file chunks for downloading',
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
            title: 'Enable Resume Download',
            description: 'Allow resuming interrupted downloads'
          }
        }
      },
      window: {
        title: 'Window & Interface',
        icon: 'window',
        description: 'Customize application appearance and behavior',
        settings: {
          windowBehavior: {
            type: 'select',
            title: 'When Closing Window',
            description: 'What happens when you close the main window',
            options: [
              { value: 'close', label: 'Exit Application' },
              { value: 'hide', label: 'Hide to System Tray' }
            ]
          },
          autoStartNode: {
            type: 'boolean',
            title: 'Auto Start P2P Node',
            description: 'Automatically start the P2P node when app launches'
          },
          theme: {
            type: 'select',
            title: 'Theme',
            description: 'Application theme',
            options: [
              { value: 'system', label: 'System Default' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]
          },
        }
      },
      network: {
        title: 'Network & Connections',
        icon: 'network',
        description: 'Configure P2P network settings',
        settings: {
          autoConnectToPeers: {
            type: 'boolean',
            title: 'Auto Connect to Peers',
            description: 'Automatically connect to discovered peers'
          },
          maxConnections: {
            type: 'range',
            title: 'Max Connections',
            description: 'Maximum number of peer connections',
            min: 1,
            max: 200,
            step: 1
          },
          connectionTimeout: {
            type: 'range',
            title: 'Connection Timeout',
            description: 'Timeout for peer connections (seconds)',
            min: 5,
            max: 120,
            step: 5,
            unit: 's'
          },
          enableUpnp: {
            type: 'boolean',
            title: 'Enable UPnP',
            description: 'Automatically configure router port forwarding'
          }
        }
      },
      privacy: {
        title: 'Privacy & Security',
        icon: 'shield',
        description: 'Configure privacy and security options',
        settings: {
          enableEncryption: {
            type: 'boolean',
            title: 'Enable Encryption',
            description: 'Encrypt all P2P communications'
          },
          shareFileByDefault: {
            type: 'boolean',
            title: 'Share Files by Default',
            description: 'Automatically share new files with the network'
          },
          autoAcceptConnections: {
            type: 'boolean',
            title: 'Auto Accept Connections',
            description: 'Automatically accept incoming peer connections'
          },
          logLevel: {
            type: 'select',
            title: 'Log Level',
            description: 'Application logging level',
            options: [
              { value: 'error', label: 'Error Only' },
              { value: 'warn', label: 'Warnings' },
              { value: 'info', label: 'Information' },
              { value: 'debug', label: 'Debug (Verbose)' }
            ]
          }
        }
      },
      performance: {
        title: 'Performance',
        icon: 'gauge',
        description: 'Optimize application performance',
        settings: {
          memoryLimit: {
            type: 'range',
            title: 'Memory Limit (MB)',
            description: 'Maximum memory usage',
            min: 128,
            max: 4096,
            step: 64,
            unit: 'MB'
          },
          diskCacheSize: {
            type: 'range',
            title: 'Disk Cache Size (MB)',
            description: 'Size of disk cache for files',
            min: 100,
            max: 10240,
            step: 100,
            unit: 'MB'
          },
          enableFileValidation: {
            type: 'boolean',
            title: 'Enable File Validation',
            description: 'Verify file integrity after download'
          },
          cleanupTempFiles: {
            type: 'boolean',
            title: 'Cleanup Temp Files',
            description: 'Automatically cleanup temporary files'
          }
        }
      },
      backup: {
        title: 'Backup & Import',
        icon: 'archive',
        description: 'Manage settings and data backup',
        settings: {
          autoBackupSettings: {
            type: 'boolean',
            title: 'Auto Backup Settings',
            description: 'Automatically backup settings periodically'
          },
          autoBackupDatabase: {
            type: 'boolean',
            title: 'Auto Backup Database',
            description: 'Automatically backup file database'
          },
          backupInterval: {
            type: 'range',
            title: 'Backup Interval (hours)',
            description: 'How often to create automatic backups',
            min: 1,
            max: 168,
            step: 1,
            unit: 'h'
          },
          maxBackupFiles: {
            type: 'range',
            title: 'Max Backup Files',
            description: 'Maximum number of backup files to keep',
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
        enum: ['close', 'hide'],
        category: 'window'
      },
      autoStartNode: {
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