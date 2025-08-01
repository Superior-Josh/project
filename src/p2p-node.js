import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { mdns } from '@libp2p/mdns'
import { ping } from '@libp2p/ping'
import { identify } from '@libp2p/identify'
import { multiaddr } from '@multiformats/multiaddr'

export class P2PNode {
  constructor(options = {}) {
    this.node = null
    this.isStarted = false
    this.discoveredPeers = new Set()
    this.connectionManager = null
  }

  async createNode() {
    try {
      // 极简配置，专注解决连接问题
      this.node = await createLibp2p({
        addresses: {
          listen: [
            '/ip4/0.0.0.0/tcp/0'
          ]
        },
        transports: [
          tcp()
        ],
        connectionEncryption: [
          noise()
        ],
        streamMuxers: [
          yamux()
        ],
        peerDiscovery: [
          mdns({
            interval: 20e3
          })
        ],
        services: {
          ping: ping({
            protocolPrefix: 'ipfs', // 添加协议前缀
            maxEchoWait: 2000,
            maxPings: 10
          }),
          identify: identify({
            protocolPrefix: 'ipfs' // 添加协议前缀
          })
        },
        connectionManager: {
          maxConnections: 100,
          minConnections: 1,
          pollInterval: 2000,
          autoDialInterval: 10000,
          inboundUpgradeTimeout: 30000,
          outboundUpgradeTimeout: 30000
        },
        connectionGater: {
          // 添加连接网关配置
          denyDialMultiaddr: () => false,
          denyDialPeer: () => false,
          denyInboundConnection: () => false,
          denyOutboundConnection: () => false,
          denyInboundEncryptedConnection: () => false,
          denyOutboundEncryptedConnection: () => false,
          denyInboundUpgradedConnection: () => false,
          denyOutboundUpgradedConnection: () => false
        }
      })

      // 设置事件监听器
      this.setupEventListeners()

      console.log('P2P node created successfully')
      console.log('Node ID:', this.node.peerId.toString())
      console.log('Supported protocols:', this.node.getProtocols())

      return this.node
    } catch (error) {
      console.error('Error creating P2P node:', error)
      throw error
    }
  }

  setupEventListeners() {
    // 连接事件
    this.node.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.toString()
      console.log('✅ Connected to peer:', peerId)
      this.discoveredPeers.add(peerId)
    })

    // 断开连接事件
    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString()
      console.log('❌ Disconnected from peer:', peerId)
    })

    // 发现新节点事件
    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString()
      console.log('🔍 Discovered peer:', peerId)
      this.discoveredPeers.add(peerId)
    })

    // 监听协议事件
    this.node.addEventListener('peer:identify', (evt) => {
      console.log('🆔 Peer identified:', {
        peerId: evt.detail.peerId.toString(),
        protocols: evt.detail.protocols,
        connection: evt.detail.connection.remoteAddr.toString()
      })
    })
  }

  async start() {
    if (!this.node) {
      await this.createNode()
    }

    await this.node.start()
    this.isStarted = true

    const listenAddrs = this.node.getMultiaddrs()
    console.log('🚀 Node started, listening on:')
    listenAddrs.forEach(addr => {
      console.log('  📍', addr.toString())
    })

    return this.node
  }

  async stop() {
    if (this.node && this.isStarted) {
      await this.node.stop()
      this.isStarted = false
      console.log('🛑 Node stopped')
    }
  }

  // 获取连接的节点列表
  getConnectedPeers() {
    if (!this.node) return []
    return this.node.getPeers()
  }

  // 调试版本的连接方法
  async connectToPeer(multiaddrString) {
    if (!this.node) {
      throw new Error('Node not initialized')
    }

    if (!this.isStarted) {
      throw new Error('Node is not started')
    }

    try {
      console.log('🔗 Attempting to connect to:', multiaddrString)
      
      // 解析 multiaddr
      const ma = multiaddr(multiaddrString)
      console.log('📋 Parsed multiaddr:', ma.toString())
      
      // 检查协议组件 - 修复版本
      try {
        const protoNames = ma.protoNames()
        console.log('🔧 Multiaddr protocols:', protoNames)
      } catch (protoError) {
        console.log('⚠️ Could not get protocols:', protoError.message)
      }
      
      // 提取 peer ID
      const peerIdStr = ma.getPeerId()
      if (!peerIdStr) {
        throw new Error('Multiaddr does not contain a peer ID')
      }
      console.log('🆔 Target peer ID:', peerIdStr)

      // 检查是否已经连接
      const connections = this.node.getConnections()
      const isAlreadyConnected = connections.some(conn => 
        conn.remotePeer.toString() === peerIdStr
      )
      
      if (isAlreadyConnected) {
        console.log('✅ Already connected to peer:', peerIdStr)
        return
      }

      console.log('📊 Current connections:', connections.length)
      console.log('🔐 Local protocols:', this.node.getProtocols())

      // 尝试连接
      console.log('⏳ Dialing...')
      const dialOptions = {
        signal: AbortSignal.timeout(30000)
      }

      const connection = await this.node.dial(ma, dialOptions)
      
      console.log('🎉 Connection successful!')
      console.log('📊 Connection details:', {
        status: connection.status,
        remoteAddr: connection.remoteAddr.toString(),
        remotePeer: connection.remotePeer.toString(),
        direction: connection.direction,
        timeline: connection.timeline
      })

      // 尝试 ping 测试连接
      try {
        console.log('🏓 Testing connection with ping...')
        const latency = await this.node.services.ping.ping(connection.remotePeer)
        console.log('✅ Ping successful, latency:', latency, 'ms')
      } catch (pingError) {
        console.log('⚠️ Ping failed (but connection exists):', pingError.message)
      }

    } catch (error) {
      console.error('❌ Connection failed:', error.message)
      console.error('🔍 Error details:', {
        name: error.name,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3)
      })
      
      // 针对特定错误提供建议
      if (error.message.includes('At least one protocol must be specified')) {
        console.error('💡 Suggestions:')
        console.error('   1. Check if both nodes use the same libp2p version')
        console.error('   2. Verify encryption configuration (noise)')
        console.error('   3. Check stream muxer configuration (yamux)')
        console.error('   4. Ensure both nodes are properly started')
      }
      
      throw error
    }
  }

  // 获取节点信息
  getNodeInfo() {
    if (!this.node) return null

    return {
      peerId: this.node.peerId.toString(),
      addresses: this.node.getMultiaddrs().map(addr => addr.toString()),
      connectedPeers: this.getConnectedPeers().length,
      discoveredPeers: this.discoveredPeers.size,
      isStarted: this.isStarted,
      protocols: this.node.getProtocols()
    }
  }

  // 获取连接详情
  getConnectionDetails() {
    if (!this.node) return []
    
    return this.node.getConnections().map(conn => ({
      remotePeer: conn.remotePeer.toString(),
      remoteAddr: conn.remoteAddr.toString(),
      status: conn.status,
      direction: conn.direction,
      timeline: conn.timeline
    }))
  }
}