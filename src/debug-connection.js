// debug-connection.js
import { multiaddr } from '@multiformats/multiaddr'

export class ConnectionDebugger {
  constructor(p2pNode) {
    this.p2pNode = p2pNode
    this.connectionLogs = []
  }

  // 启用详细的连接调试
  enableVerboseLogging() {
    if (!this.p2pNode.node) {
      console.log('P2P node not initialized')
      return
    }

    const node = this.p2pNode.node

    // 监听所有连接相关事件
    node.addEventListener('peer:discovery', (evt) => {
      const log = {
        type: 'discovery',
        peerId: evt.detail.id.toString(),
        multiaddrs: evt.detail.multiaddrs?.map(ma => ma.toString()) || [],
        timestamp: new Date().toISOString()
      }
      this.connectionLogs.push(log)
      console.log('🔍 Peer discovered:', log)
    })

    node.addEventListener('peer:connect', (evt) => {
      const log = {
        type: 'connect',
        peerId: evt.detail.toString(),
        timestamp: new Date().toISOString()
      }
      this.connectionLogs.push(log)
      console.log('✅ Peer connected:', log)
    })

    node.addEventListener('peer:disconnect', (evt) => {
      const log = {
        type: 'disconnect',
        peerId: evt.detail.toString(),
        timestamp: new Date().toISOString()
      }
      this.connectionLogs.push(log)
      console.log('❌ Peer disconnected:', log)
    })

    // 监听连接错误
    node.addEventListener('connection:error', (evt) => {
      const log = {
        type: 'connection_error',
        error: evt.detail.toString(),
        timestamp: new Date().toISOString()
      }
      this.connectionLogs.push(log)
      console.log('🚨 Connection error:', log)
    })

    console.log('🐛 Verbose connection logging enabled')
  }

  // 诊断连接问题
  async diagnoseConnection(targetMultiaddr) {
    console.log('🔧 Starting connection diagnosis...')
    
    try {
      const ma = multiaddr(targetMultiaddr)
      const peerId = ma.getPeerId()
      
      console.log('📋 Target analysis:')
      console.log('  - Multiaddr:', ma.toString())
      console.log('  - Peer ID:', peerId)
      console.log('  - Protocols:', ma.protos().map(p => p.name).join(', '))

      // 检查本地节点状态
      console.log('📋 Local node status:')
      console.log('  - Node ID:', this.p2pNode.node.peerId.toString())
      console.log('  - Listening on:', this.p2pNode.node.getMultiaddrs().map(ma => ma.toString()))
      console.log('  - Current connections:', this.p2pNode.node.getConnections().length)

      // 检查是否已经连接
      const existingConnection = this.p2pNode.node.getConnections().find(conn => 
        conn.remotePeer.toString() === peerId
      )
      
      if (existingConnection) {
        console.log('ℹ️ Already connected to this peer')
        return
      }

      // 尝试连接并捕获详细错误
      console.log('🔗 Attempting connection...')
      
      try {
        await this.p2pNode.node.dial(ma)
        console.log('✅ Connection successful!')
      } catch (error) {
        console.log('❌ Connection failed:', error.message)
        
        // 分析错误类型
        this.analyzeConnectionError(error)
      }

    } catch (error) {
      console.log('🚨 Diagnosis failed:', error.message)
    }
  }

  // 分析连接错误
  analyzeConnectionError(error) {
    console.log('🔍 Error analysis:')
    
    if (error.message.includes('EncryptionFailedError')) {
      console.log('  - Issue: Encryption protocol mismatch')
      console.log('  - Solution: Ensure both nodes use the same encryption protocols (noise)')
    } else if (error.message.includes('CONNECTION_DENIED')) {
      console.log('  - Issue: Connection denied by remote peer')
      console.log('  - Solution: Check if remote peer allows incoming connections')
    } else if (error.message.includes('DIAL_ERROR')) {
      console.log('  - Issue: Network dial error')
      console.log('  - Solution: Check network connectivity and firewall settings')
    } else if (error.message.includes('timeout')) {
      console.log('  - Issue: Connection timeout')
      console.log('  - Solution: Increase timeout or check if peer is responsive')
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('  - Issue: Connection refused')
      console.log('  - Solution: Check if the target port is open and peer is listening')
    } else {
      console.log('  - Issue: Unknown error')
      console.log('  - Details:', error.message)
    }
  }

  // 测试本地网络连通性
  async testLocalConnectivity() {
    console.log('🌐 Testing local network connectivity...')
    
    const node = this.p2pNode.node
    const multiaddrs = node.getMultiaddrs()
    
    console.log('📍 Local addresses:')
    multiaddrs.forEach((ma, index) => {
      console.log(`  ${index + 1}. ${ma.toString()}`)
    })

    // 检查端口
    const tcpAddrs = multiaddrs.filter(ma => ma.toString().includes('/tcp/'))
    if (tcpAddrs.length > 0) {
      console.log('✅ TCP transport is available')
    } else {
      console.log('❌ No TCP transport found')
    }

    const wsAddrs = multiaddrs.filter(ma => ma.toString().includes('/ws'))
    if (wsAddrs.length > 0) {
      console.log('✅ WebSocket transport is available')
    } else {
      console.log('❌ No WebSocket transport found')
    }
  }

  // 获取连接日志
  getConnectionLogs(limit = 50) {
    return this.connectionLogs.slice(-limit)
  }

  // 清除日志
  clearLogs() {
    this.connectionLogs = []
    console.log('🧹 Connection logs cleared')
  }

  // 生成连接报告
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      nodeId: this.p2pNode.node?.peerId?.toString(),
      listeningAddresses: this.p2pNode.node?.getMultiaddrs()?.map(ma => ma.toString()) || [],
      connectedPeers: this.p2pNode.node?.getConnections()?.map(conn => ({
        peerId: conn.remotePeer.toString(),
        remoteAddr: conn.remoteAddr.toString(),
        stat: conn.stat
      })) || [],
      discoveredPeers: this.p2pNode.getDiscoveredPeers(),
      recentLogs: this.getConnectionLogs(20)
    }

    console.log('📊 Connection Report:')
    console.log(JSON.stringify(report, null, 2))
    
    return report
  }
}