// settings.js

// Current settings storage
let currentSettings = {}
let hasUnsavedChanges = false

// Toast notification system
class Toast {
  static show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container')
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.textContent = message
    
    container.appendChild(toast)
    
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease'
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast)
        }
      }, 300)
    }, duration)
  }
}

// Initialize settings page
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings()
  setupNavigation()
  setupEventListeners()
  updateRangeValues()
  applyTheme()
})

// Load settings from main process
async function loadSettings() {
  try {
    const settings = await window.electronAPI.getSettings()
    currentSettings = settings
    populateSettingsForm(settings)
  } catch (error) {
    console.error('Error loading settings:', error)
    Toast.show('Failed to load settings', 'error')
  }
}

// Populate form with settings
function populateSettingsForm(settings) {
  // Download settings
  document.getElementById('downloadPath').value = settings.downloadPath || ''
  document.getElementById('autoCreateSubfolders').checked = settings.autoCreateSubfolders || false
  document.getElementById('maxConcurrentDownloads').value = settings.maxConcurrentDownloads || 3
  document.getElementById('chunkSize').value = settings.chunkSize || 262144
  document.getElementById('enableResumeDownload').checked = settings.enableResumeDownload || true
  
  // Window settings
  document.getElementById('windowBehavior').value = settings.windowBehavior || 'minimize'
  document.getElementById('startMinimized').checked = settings.startMinimized || false
  document.getElementById('autoStartNode').checked = settings.autoStartNode !== false // default true
  document.getElementById('showNotifications').checked = settings.showNotifications !== false // default true
  document.getElementById('theme').value = settings.theme || 'system'
  document.getElementById('language').value = settings.language || 'en'
  
  // Network settings
  document.getElementById('autoConnectToPeers').checked = settings.autoConnectToPeers !== false // default true
  document.getElementById('maxConnections').value = settings.maxConnections || 50
  document.getElementById('connectionTimeout').value = (settings.connectionTimeout || 30000) / 1000 // Convert to seconds
  document.getElementById('enableUpnp').checked = settings.enableUpnp !== false // default true
  
  // Privacy settings
  document.getElementById('enableEncryption').checked = settings.enableEncryption !== false // default true
  document.getElementById('shareFileByDefault').checked = settings.shareFileByDefault || false
  document.getElementById('autoAcceptConnections').checked = settings.autoAcceptConnections !== false // default true
  document.getElementById('logLevel').value = settings.logLevel || 'info'
  
  // Performance settings
  document.getElementById('memoryLimit').value = settings.memoryLimit || 512
  document.getElementById('diskCacheSize').value = settings.diskCacheSize || 1024
  document.getElementById('enableFileValidation').checked = settings.enableFileValidation !== false // default true
  document.getElementById('cleanupTempFiles').checked = settings.cleanupTempFiles !== false // default true
  
  // Backup settings
  document.getElementById('autoBackupSettings').checked = settings.autoBackupSettings !== false // default true
  document.getElementById('autoBackupDatabase').checked = settings.autoBackupDatabase !== false // default true
  document.getElementById('backupInterval').value = settings.backupInterval || 24
  document.getElementById('maxBackupFiles').value = settings.maxBackupFiles || 5
}

// Setup navigation
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item')
  const panels = document.querySelectorAll('.settings-panel')
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const category = item.dataset.category
      
      // Update navigation
      navItems.forEach(nav => nav.classList.remove('active'))
      item.classList.add('active')
      
      // Update panels
      panels.forEach(panel => panel.classList.remove('active'))
      const targetPanel = document.getElementById(`${category}-panel`)
      if (targetPanel) {
        targetPanel.classList.add('active')
      }
    })
  })
}

// Setup event listeners
function setupEventListeners() {
  // Range inputs
  const rangeInputs = document.querySelectorAll('input[type="range"]')
  rangeInputs.forEach(input => {
    input.addEventListener('input', updateRangeValue)
    input.addEventListener('change', markUnsaved)
  })
  
  // All other inputs
  const inputs = document.querySelectorAll('input, select')
  inputs.forEach(input => {
    if (input.type !== 'range') {
      input.addEventListener('change', markUnsaved)
    }
  })
  
  // Theme change
  document.getElementById('theme').addEventListener('change', (e) => {
    applyTheme(e.target.value)
    markUnsaved()
  })
  
  // Prevent accidental navigation away
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
}

// Update range value display
function updateRangeValue(event) {
  const input = event.target
  const valueSpan = input.parentNode.querySelector('.range-value')
  if (valueSpan) {
    let value = input.value
    
    // Format specific values
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

// Update all range values on load
function updateRangeValues() {
  const rangeInputs = document.querySelectorAll('input[type="range"]')
  rangeInputs.forEach(input => {
    updateRangeValue({ target: input })
  })
}

// Mark as having unsaved changes
function markUnsaved() {
  hasUnsavedChanges = true
  const saveButton = document.querySelector('.btn-primary')
  if (saveButton && !saveButton.textContent.includes('*')) {
    saveButton.textContent = 'Save Changes *'
  }
}

// Apply theme
function applyTheme(theme = null) {
  const selectedTheme = theme || document.getElementById('theme').value
  document.body.className = `theme-${selectedTheme}`
}

// Close settings
function closeSettings() {
  if (hasUnsavedChanges) {
    showConfirmDialog(
      'Unsaved Changes',
      'You have unsaved changes. Are you sure you want to close without saving?',
      () => {
        if (window.electronAPI && window.electronAPI.closeSettings) {
          window.electronAPI.closeSettings()
        } else {
          window.close()
        }
      }
    )
  } else {
    if (window.electronAPI && window.electronAPI.closeSettings) {
      window.electronAPI.closeSettings()
    } else {
      window.close()
    }
  }
}

// Save all settings
async function saveAllSettings() {
  try {
    const settings = collectSettingsFromForm()
    
    // Validate settings
    const validation = validateSettings(settings)
    if (!validation.isValid) {
      Toast.show(`Validation error: ${validation.errors.join(', ')}`, 'error')
      return
    }
    
    await window.electronAPI.saveSettings(settings)
    
    hasUnsavedChanges = false
    const saveButton = document.querySelector('.btn-primary')
    saveButton.textContent = 'Save Changes'
    
    Toast.show('Settings saved successfully', 'success')
    
    // Apply theme if changed
    if (settings.theme !== currentSettings.theme) {
      applyTheme(settings.theme)
    }
    
    currentSettings = settings
  } catch (error) {
    console.error('Error saving settings:', error)
    Toast.show('Failed to save settings', 'error')
  }
}

// Collect settings from form
function collectSettingsFromForm() {
  return {
    // Download settings
    downloadPath: document.getElementById('downloadPath').value,
    autoCreateSubfolders: document.getElementById('autoCreateSubfolders').checked,
    maxConcurrentDownloads: parseInt(document.getElementById('maxConcurrentDownloads').value),
    chunkSize: parseInt(document.getElementById('chunkSize').value),
    enableResumeDownload: document.getElementById('enableResumeDownload').checked,
    
    // Window settings
    windowBehavior: document.getElementById('windowBehavior').value,
    startMinimized: document.getElementById('startMinimized').checked,
    autoStartNode: document.getElementById('autoStartNode').checked,
    showNotifications: document.getElementById('showNotifications').checked,
    theme: document.getElementById('theme').value,
    language: document.getElementById('language').value,
    
    // Network settings
    autoConnectToPeers: document.getElementById('autoConnectToPeers').checked,
    maxConnections: parseInt(document.getElementById('maxConnections').value),
    connectionTimeout: parseInt(document.getElementById('connectionTimeout').value) * 1000, // Convert to ms
    enableUpnp: document.getElementById('enableUpnp').checked,
    
    // Privacy settings
    enableEncryption: document.getElementById('enableEncryption').checked,
    shareFileByDefault: document.getElementById('shareFileByDefault').checked,
    autoAcceptConnections: document.getElementById('autoAcceptConnections').checked,
    logLevel: document.getElementById('logLevel').value,
    
    // Performance settings
    memoryLimit: parseInt(document.getElementById('memoryLimit').value),
    diskCacheSize: parseInt(document.getElementById('diskCacheSize').value),
    enableFileValidation: document.getElementById('enableFileValidation').checked,
    cleanupTempFiles: document.getElementById('cleanupTempFiles').checked,
    
    // Backup settings
    autoBackupSettings: document.getElementById('autoBackupSettings').checked,
    autoBackupDatabase: document.getElementById('autoBackupDatabase').checked,
    backupInterval: parseInt(document.getElementById('backupInterval').value),
    maxBackupFiles: parseInt(document.getElementById('maxBackupFiles').value)
  }
}

// Validate settings
function validateSettings(settings) {
  const errors = []
  
  // Download path validation
  if (!settings.downloadPath || settings.downloadPath.trim() === '') {
    errors.push('Download path is required')
  }
  
  // Numeric validations
  if (settings.maxConcurrentDownloads < 1 || settings.maxConcurrentDownloads > 10) {
    errors.push('Max concurrent downloads must be between 1 and 10')
  }
  
  if (settings.maxConnections < 1 || settings.maxConnections > 200) {
    errors.push('Max connections must be between 1 and 200')
  }
  
  if (settings.connectionTimeout < 5000 || settings.connectionTimeout > 120000) {
    errors.push('Connection timeout must be between 5 and 120 seconds')
  }
  
  if (settings.memoryLimit < 128 || settings.memoryLimit > 4096) {
    errors.push('Memory limit must be between 128MB and 4GB')
  }
  
  if (settings.diskCacheSize < 100 || settings.diskCacheSize > 10240) {
    errors.push('Disk cache size must be between 100MB and 10GB')
  }
  
  if (settings.backupInterval < 1 || settings.backupInterval > 168) {
    errors.push('Backup interval must be between 1 and 168 hours')
  }
  
  if (settings.maxBackupFiles < 1 || settings.maxBackupFiles > 50) {
    errors.push('Max backup files must be between 1 and 50')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Reset all settings
function resetAllSettings() {
  showConfirmDialog(
    'Reset All Settings',
    'This will reset all settings to their default values. This action cannot be undone.',
    async () => {
      try {
        await window.electronAPI.resetSettings()
        await loadSettings()
        updateRangeValues()
        hasUnsavedChanges = false
        const saveButton = document.querySelector('.btn-primary')
        saveButton.textContent = 'Save Changes'
        Toast.show('All settings reset to defaults', 'success')
      } catch (error) {
        console.error('Error resetting settings:', error)
        Toast.show('Failed to reset settings', 'error')
      }
    }
  )
}

// Select download path
async function selectDownloadPath() {
  try {
    const result = await window.electronAPI.selectFolder('Select Download Location')
    if (result && result.success && !result.cancelled && result.filePaths.length > 0) {
      document.getElementById('downloadPath').value = result.filePaths[0]
      markUnsaved()
    }
  } catch (error) {
    console.error('Error selecting download path:', error)
    Toast.show('Failed to select folder', 'error')
  }
}

// Create backup
async function createBackup() {
  try {
    const result = await window.electronAPI.createSettingsBackup()
    if (result.success) {
      Toast.show('Backup created successfully', 'success')
      await loadBackupList()
    } else {
      Toast.show('Failed to create backup', 'error')
    }
  } catch (error) {
    console.error('Error creating backup:', error)
    Toast.show('Failed to create backup', 'error')
  }
}

// Show backup list
async function showBackupList() {
  const backupList = document.getElementById('backupList')
  const isVisible = backupList.style.display !== 'none'
  
  if (isVisible) {
    backupList.style.display = 'none'
  } else {
    await loadBackupList()
    backupList.style.display = 'block'
  }
}

// Load backup list
async function loadBackupList() {
  try {
    const backups = await window.electronAPI.getAvailableBackups()
    const backupItems = document.getElementById('backupItems')
    
    if (backups.length === 0) {
      backupItems.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">No backups available</p>'
      return
    }
    
    backupItems.innerHTML = backups.map(backup => `
      <div class="backup-item">
        <div class="backup-info">
          <div class="backup-name">${backup.name}</div>
          <div class="backup-date">${new Date(backup.created).toLocaleString()}</div>
        </div>
        <div class="backup-actions-small">
          <button class="btn-outline" onclick="restoreBackup('${backup.path.replace(/\\/g, '\\\\')}')">Restore</button>
          <button class="btn-secondary" onclick="deleteBackup('${backup.path.replace(/\\/g, '\\\\')}')">Delete</button>
        </div>
      </div>
    `).join('')
  } catch (error) {
    console.error('Error loading backup list:', error)
    Toast.show('Failed to load backups', 'error')
  }
}

// Restore backup
async function restoreBackup(backupPath) {
  showConfirmDialog(
    'Restore Backup',
    'This will restore settings from the selected backup. Current settings will be overwritten.',
    async () => {
      try {
        const result = await window.electronAPI.restoreSettingsBackup(backupPath)
        if (result.success) {
          await loadSettings()
          updateRangeValues()
          hasUnsavedChanges = false
          const saveButton = document.querySelector('.btn-primary')
          saveButton.textContent = 'Save Changes'
          Toast.show('Settings restored from backup', 'success')
        } else {
          Toast.show('Failed to restore backup', 'error')
        }
      } catch (error) {
        console.error('Error restoring backup:', error)
        Toast.show('Failed to restore backup', 'error')
      }
    }
  )
}

// Delete backup
async function deleteBackup(backupPath) {
  showConfirmDialog(
    'Delete Backup',
    'Are you sure you want to delete this backup? This action cannot be undone.',
    async () => {
      try {
        const result = await window.electronAPI.deleteSettingsBackup(backupPath)
        if (result.success) {
          await loadBackupList()
          Toast.show('Backup deleted', 'success')
        } else {
          Toast.show('Failed to delete backup', 'error')
        }
      } catch (error) {
        console.error('Error deleting backup:', error)
        Toast.show('Failed to delete backup', 'error')
      }
    }
  )
}

// Export settings
async function exportSettings() {
  try {
    const result = await window.electronAPI.exportSettings()
    if (result.success && !result.cancelled) {
      Toast.show(`Settings exported to ${result.filePath}`, 'success')
    } else if (result.cancelled) {
      Toast.show('Export cancelled', 'info')
    } else {
      Toast.show('Failed to export settings', 'error')
    }
  } catch (error) {
    console.error('Error exporting settings:', error)
    Toast.show('Failed to export settings', 'error')
  }
}

// Import settings
async function importSettings() {
  try {
    const result = await window.electronAPI.importSettings()
    if (result.success && !result.cancelled) {
      await loadSettings()
      updateRangeValues()
      hasUnsavedChanges = false
      const saveButton = document.querySelector('.btn-primary')
      saveButton.textContent = 'Save Changes'
      Toast.show(`Settings imported from ${result.filePath}`, 'success')
    } else if (result.cancelled) {
      Toast.show('Import cancelled', 'info')
    } else {
      Toast.show('Failed to import settings', 'error')
    }
  } catch (error) {
    console.error('Error importing settings:', error)
    Toast.show('Failed to import settings', 'error')
  }
}

// Show confirmation dialog
function showConfirmDialog(title, message, onConfirm) {
  const dialog = document.getElementById('confirmDialog')
  const titleEl = document.getElementById('confirmTitle')
  const messageEl = document.getElementById('confirmMessage')
  const confirmBtn = document.getElementById('confirmButton')
  
  titleEl.textContent = title
  messageEl.textContent = message
  
  // Remove previous event listeners
  const newConfirmBtn = confirmBtn.cloneNode(true)
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn)
  
  // Add new event listener
  document.getElementById('confirmButton').addEventListener('click', () => {
    closeConfirmDialog()
    onConfirm()
  })
  
  dialog.style.display = 'flex'
}

// Close confirmation dialog
function closeConfirmDialog() {
  document.getElementById('confirmDialog').style.display = 'none'
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + S to save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveAllSettings()
  }
  
  // Escape to close
  if (e.key === 'Escape') {
    const confirmDialog = document.getElementById('confirmDialog')
    if (confirmDialog.style.display === 'flex') {
      closeConfirmDialog()
    } else {
      closeSettings()
    }
  }
})

// Auto-save settings every 30 seconds if there are unsaved changes
setInterval(() => {
  if (hasUnsavedChanges) {
    console.log('Auto-saving settings...')
    saveAllSettings()
  }
}, 30000)

// Make functions available globally
window.closeSettings = closeSettings
window.saveAllSettings = saveAllSettings
window.resetAllSettings = resetAllSettings
window.selectDownloadPath = selectDownloadPath
window.createBackup = createBackup
window.showBackupList = showBackupList
window.restoreBackup = restoreBackup
window.deleteBackup = deleteBackup
window.exportSettings = exportSettings
window.importSettings = importSettings
window.closeConfirmDialog = closeConfirmDialog

// Initialize theme on load
window.addEventListener('load', () => {
  applyTheme()
})