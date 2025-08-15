// src/settings-manager.js - 简化版

import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export class SettingsManager {
  constructor(settingsDir = './settings') {
    this.settingsDir = settingsDir
    this.settingsFile = path.join(settingsDir, 'app-settings.json')
    this.settings = new Map()
    this.initialized = false

    // 只保留核心设置
    this.defaultSettings = {
      // 窗口设置
      windowBehavior: 'close',
      autoStartNode: true,

      // 文件下载设置
      downloadPath: path.join(os.homedir(), 'Downloads', 'P2P-Files'),
      chunkSize: 64 * 1024,
      enableResumeDownload: true
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
      downloadPath: (val) => typeof val === 'string' && val.length > 0,
      chunkSize: (val) => Number.isInteger(val) && val >= 1024 && val <= 10 * 1024 * 1024,
      windowBehavior: (val) => ['close', 'hide'].includes(val)
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

  // 获取NAT穿透相关设置 - 返回默认配置以保持原功能
  getNATTraversalSettings() {
    return {
      enabled: true,
      holePunching: {
        enabled: true,
        timeout: 30,
        retries: 3,
        enableDCUtR: true
      },
      relay: {
        autoRelay: true,
        circuitRelay: true,
        maxConnections: 5,
        connectionTimeout: 30,
        enableServer: false,
        bandwidthLimit: 1024,
        connectionLimit: 50
      },
      customNodes: {
        bootstrapNodes: [],
        relayNodes: [],
        trustedRelayNodes: []
      }
    }
  }
}