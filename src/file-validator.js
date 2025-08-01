import { createHash } from 'crypto'
import fs from 'fs/promises'

export class FileValidator {
  constructor() {
    this.validationCache = new Map() // 缓存验证结果
  }

  // 计算文件的多种哈希值
  async calculateFileHashes(filePath) {
    try {
      const data = await fs.readFile(filePath)
      
      const hashes = {
        sha256: createHash('sha256').update(data).digest('hex'),
        sha1: createHash('sha1').update(data).digest('hex'),
        md5: createHash('md5').update(data).digest('hex')
      }

      return hashes
    } catch (error) {
      console.error('Error calculating file hashes:', error)
      throw error
    }
  }

  // 验证文件完整性
  async validateFile(filePath, expectedHashes) {
    try {
      const actualHashes = await this.calculateFileHashes(filePath)
      
      const validation = {
        isValid: true,
        validatedHashes: {},
        errors: []
      }

      // 验证各种哈希值
      for (const [hashType, expectedHash] of Object.entries(expectedHashes)) {
        if (actualHashes[hashType]) {
          const isHashValid = actualHashes[hashType] === expectedHash
          validation.validatedHashes[hashType] = {
            expected: expectedHash,
            actual: actualHashes[hashType],
            valid: isHashValid
          }
          
          if (!isHashValid) {
            validation.isValid = false
            validation.errors.push(`${hashType.toUpperCase()} hash mismatch`)
          }
        }
      }

      // 缓存验证结果
      this.validationCache.set(filePath, {
        ...validation,
        timestamp: Date.now()
      })

      return validation
    } catch (error) {
      console.error('Error validating file:', error)
      return {
        isValid: false,
        errors: [error.message]
      }
    }
  }

  // 验证文件块
  validateChunk(chunkData, expectedHash, hashType = 'sha256') {
    try {
      const actualHash = createHash(hashType).update(chunkData).digest('hex')
      return {
        isValid: actualHash === expectedHash,
        expectedHash,
        actualHash
      }
    } catch (error) {
      console.error('Error validating chunk:', error)
      return {
        isValid: false,
        error: error.message
      }
    }
  }

  // 创建文件完整性签名
  async createFileSignature(filePath) {
    try {
      const stats = await fs.stat(filePath)
      const hashes = await this.calculateFileHashes(filePath)
      
      const signature = {
        fileName: filePath.split('/').pop(),
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
        hashes,
        createdAt: new Date().toISOString(),
        version: '1.0'
      }

      return signature
    } catch (error) {
      console.error('Error creating file signature:', error)
      throw error
    }
  }

  // 验证文件签名
  async verifyFileSignature(filePath, signature) {
    try {
      const currentSignature = await this.createFileSignature(filePath)
      
      const verification = {
        isValid: true,
        checks: {},
        errors: []
      }

      // 验证文件大小
      verification.checks.fileSize = {
        expected: signature.fileSize,
        actual: currentSignature.fileSize,
        valid: signature.fileSize === currentSignature.fileSize
      }

      if (!verification.checks.fileSize.valid) {
        verification.isValid = false
        verification.errors.push('File size mismatch')
      }

      // 验证哈希值
      for (const [hashType, expectedHash] of Object.entries(signature.hashes)) {
        if (currentSignature.hashes[hashType]) {
          const isHashValid = currentSignature.hashes[hashType] === expectedHash
          verification.checks[hashType] = {
            expected: expectedHash,
            actual: currentSignature.hashes[hashType],
            valid: isHashValid
          }
          
          if (!isHashValid) {
            verification.isValid = false
            verification.errors.push(`${hashType.toUpperCase()} hash mismatch`)
          }
        }
      }

      return verification
    } catch (error) {
      console.error('Error verifying file signature:', error)
      return {
        isValid: false,
        errors: [error.message]
      }
    }
  }

  // 批量验证文件
  async validateMultipleFiles(fileValidations) {
    const results = []
    
    for (const validation of fileValidations) {
      try {
        const result = await this.validateFile(validation.filePath, validation.expectedHashes)
        results.push({
          filePath: validation.filePath,
          ...result
        })
      } catch (error) {
        results.push({
          filePath: validation.filePath,
          isValid: false,
          errors: [error.message]
        })
      }
    }

    return results
  }

  // 检查文件是否被修改
  async hasFileChanged(filePath, lastKnownSignature) {
    try {
      const currentSignature = await this.createFileSignature(filePath)
      
      // 比较关键属性
      const hasChanged = 
        currentSignature.fileSize !== lastKnownSignature.fileSize ||
        currentSignature.lastModified !== lastKnownSignature.lastModified ||
        currentSignature.hashes.sha256 !== lastKnownSignature.hashes.sha256

      return {
        hasChanged,
        currentSignature,
        lastKnownSignature,
        changes: this.identifyChanges(currentSignature, lastKnownSignature)
      }
    } catch (error) {
      console.error('Error checking file changes:', error)
      return {
        hasChanged: true,
        error: error.message
      }
    }
  }

  // 识别具体的变化
  identifyChanges(current, previous) {
    const changes = []
    
    if (current.fileSize !== previous.fileSize) {
      changes.push({
        type: 'fileSize',
        from: previous.fileSize,
        to: current.fileSize
      })
    }

    if (current.lastModified !== previous.lastModified) {
      changes.push({
        type: 'lastModified',
        from: previous.lastModified,
        to: current.lastModified
      })
    }

    for (const [hashType, currentHash] of Object.entries(current.hashes)) {
      if (previous.hashes[hashType] && currentHash !== previous.hashes[hashType]) {
        changes.push({
          type: `${hashType}Hash`,
          from: previous.hashes[hashType],
          to: currentHash
        })
      }
    }

    return changes
  }

  // 获取缓存的验证结果
  getCachedValidation(filePath) {
    return this.validationCache.get(filePath)
  }

  // 清理过期的缓存
  cleanupCache(maxAge = 3600000) { // 默认1小时
    const now = Date.now()
    for (const [filePath, validation] of this.validationCache) {
      if (now - validation.timestamp > maxAge) {
        this.validationCache.delete(filePath)
      }
    }
  }

  // 生成文件完整性报告
  async generateIntegrityReport(filePaths) {
    const report = {
      generatedAt: new Date().toISOString(),
      totalFiles: filePaths.length,
      validFiles: 0,
      invalidFiles: 0,
      errors: 0,
      files: []
    }

    for (const filePath of filePaths) {
      try {
        const signature = await this.createFileSignature(filePath)
        report.files.push({
          filePath,
          status: 'valid',
          signature
        })
        report.validFiles++
      } catch (error) {
        report.files.push({
          filePath,
          status: 'error',
          error: error.message
        })
        report.errors++
      }
    }

    return report
  }
}