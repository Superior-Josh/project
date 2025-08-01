import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { kadDHT } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { mdns } from '@libp2p/mdns'
import { ping } from '@libp2p/ping'
import { identify } from '@libp2p/identify'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery'
import { multiaddr } from '@multiformats/multiaddr'

export class P2PNode {
  constructor(options = {}) {
    this.node = null
    this.isStarted = false
    this.discoveredPeers = new Set()
    this.peerInfoMap = new Map() // 存储节点详细信息
    this.bootstrapNodes = options.bootstrapNodes || [
      // 添加一些默认的引导节点
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
    ]
    this.connectionManager = null
  }

  async createNode() {
    try {
      this.node = await createLibp2p({
        addresses: {
          listen: [
            '/ip4/127.0.0.1/tcp/0',
            // '/ip4/0.0.0.0/tcp/0/ws'
          ]
        },
        transports: [
          tcp(),
          webSockets()
        ],
        connectionEncryption: [
          noise()
        ],
        streamMuxers: [
          yamux()
        ],
        peerDiscovery: [
          // 本地网络发现 (mDNS)
          mdns({
            interval: 20e3 // 每20秒扫描一次
          }),
          // 引导节点发现
          bootstrap({
            list: this.bootstrapNodes,
            timeout: 10000,
            tagName: 'bootstrap',
            tagValue: 50,
            tagTTL: 120000
          }),
          // 基于PubSub的节点发现
          pubsubPeerDiscovery({
            interval: 10000,
            topics: ['p2p-file-sharing-discovery'], // 发现主题
            listenOnly: false
          })
        ],
        services: {
          pubsub: gossipsub(),
          dht: kadDHT({
            // Kademlia DHT配置
            kBucketSize: 20,
            enabled: true,
            randomWalk: {
              enabled: true,
              interval: 300e3, // 5分钟
              timeout: 10e3 // 10秒
            },
            servers: false, // 设为false让所有节点都参与DHT
            clientMode: false
          }),
          ping: ping(),
          identify: identify()
        },
        connectionManager: {
          maxConnections: 100,
          minConnections: 5,
          pollInterval: 2000,
          autoDialInterval: 10000,
          inboundUpgradeTimeout: 10000
        }
      })

      // 设置事件监听器
      this.setupEventListeners()

      // 初始化连接管理器
      this.connectionManager = new ConnectionManager(this.node)

      console.log('P2P node created successfully')
      console.log('Node ID:', this.node.peerId.toString())

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
      console.log('Connected to peer:', peerId)
      this.discoveredPeers.add(peerId)
      
      // 更新节点信息
      this.peerInfoMap.set(peerId, {
        id: peerId,
        status: 'connected',
        connectedAt: Date.now()
      })
    })

    // 断开连接事件
    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString()
      console.log('Disconnected from peer:', peerId)
      
      // 更新节点状态
      const peerInfo = this.peerInfoMap.get(peerId)
      if (peerInfo) {
        peerInfo.status = 'disconnected'
        peerInfo.disconnectedAt = Date.now()
      }
    })

    // 发现新节点事件
    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString()
      console.log('Discovered peer:', peerId)
      this.discoveredPeers.add(peerId)

      // 存储节点信息
      this.peerInfoMap.set(peerId, {
        id: peerId,
        status: 'discovered',
        discoveredAt: Date.now(),
        multiaddrs: evt.detail.multiaddrs ? evt.detail.multiaddrs.map(ma => ma.toString()) : []
      })

      // 自动尝试连接到发现的节点
      this.attemptConnection(evt.detail)
    })

    // DHT查询事件
    this.node.addEventListener('peer:update', (evt) => {
      const peerId = evt.detail.peer.id.toString()
      console.log('Peer updated:', peerId)
      
      // 更新节点信息
      const existingInfo = this.peerInfoMap.get(peerId)
      this.peerInfoMap.set(peerId, {
        ...existingInfo,
        id: peerId,
        updatedAt: Date.now(),
        multiaddrs: evt.detail.peer.multiaddrs ? evt.detail.peer.multiaddrs.map(ma => ma.toString()) : []
      })
    })
  }

  // 尝试连接到发现的节点
  async attemptConnection(peer) {
    try {
      const connections = this.node.getConnections()
      const currentConnections = connections.length
      const maxConnections = 100

      // 避免过多连接
      if (currentConnections >= maxConnections) {
        return
      }

      // 检查是否已经连接
      const isConnected = connections.some(conn =>
        conn.remotePeer.toString() === peer.id.toString()
      )

      if (!isConnected && peer.multiaddrs && peer.multiaddrs.length > 0) {
        console.log(`Attempting to connect to discovered peer: ${peer.id.toString()}`)
        await this.node.dial(peer.id)
      }
    } catch (error) {
      // 连接失败是正常的，不需要打印错误
      if (error.code !== 'ERR_ALREADY_CONNECTED') {
        console.debug(`Failed to connect to ${peer.id.toString()}:`, error.message)
      }
    }
  }

  // 主动发现节点
  async discoverPeers() {
    try {
      console.log('Starting peer discovery...')

      // 通过DHT查找随机节点
      const randomKey = new Uint8Array(32)
      crypto.getRandomValues(randomKey)

      for await (const peer of this.node.services.dht.getClosestPeers(randomKey)) {
        const peerId = peer.toString()
        this.discoveredPeers.add(peerId)
        
        // 存储发现的节点信息
        this.peerInfoMap.set(peerId, {
          id: peerId,
          status: 'discovered',
          discoveredAt: Date.now(),
          source: 'dht'
        })
        
        await this.attemptConnection({ id: peer })
      }

      console.log(`Discovered ${this.discoveredPeers.size} peers`)
    } catch (error) {
      console.error('Error during peer discovery:', error)
    }
  }

  // 获取发现的节点列表
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers)
  }

  // 获取节点详细信息
  getDiscoveredPeersInfo() {
    return Array.from(this.peerInfoMap.values())
  }

  // 连接到发现的节点（通过 peer ID）
  async connectToDiscoveredPeer(peerId) {
    try {
      console.log(`Attempting to connect to discovered peer: ${peerId}`)
      
      // 检查是否已经连接
      const connections = this.node.getConnections()
      const isAlreadyConnected = connections.some(conn => 
        conn.remotePeer.toString() === peerId
      )
      
      if (isAlreadyConnected) {
        console.log(`Already connected to peer: ${peerId}`)
        return
      }

      // 尝试直接通过 peer ID 连接
      await this.node.dial(peerId)
      
      console.log(`Successfully connected to discovered peer: ${peerId}`)
      
      // 更新节点状态
      const peerInfo = this.peerInfoMap.get(peerId)
      if (peerInfo) {
        peerInfo.status = 'connected'
        peerInfo.connectedAt = Date.now()
      }
      
    } catch (error) {
      console.error(`Failed to connect to discovered peer ${peerId}:`, error)
      throw error
    }
  }

  async start() {
    if (!this.node) {
      await this.createNode()
    }

    await this.node.start()
    this.isStarted = true

    const listenAddrs = this.node.getMultiaddrs()
    console.log('Node started, listening on:')
    listenAddrs.forEach(addr => {
      console.log('  ', addr.toString())
    })

    // 启动节点发现
    setTimeout(() => {
      this.discoverPeers().catch(console.error)
    }, 5000) // 5秒后开始发现

    return this.node
  }

  async stop() {
    if (this.node && this.isStarted) {
      await this.node.stop()
      this.isStarted = false
      console.log('Node stopped')
    }
  }

  // 获取连接的节点列表
  getConnectedPeers() {
    if (!this.node) return []
    return this.node.getPeers()
  }

  // 手动连接到特定节点 - 修复版本
  async connectToPeer(multiaddrString) {
    if (!this.node) {
      throw new Error('Node not initialized')
    }

    try {
      // 处理 multiaddr 字符串
      let ma
      if (typeof multiaddrString === 'string') {
        ma = multiaddr(multiaddrString)
      } else if (multiaddrString && typeof multiaddrString.toString === 'function') {
        ma = multiaddr(multiaddrString.toString())
      } else {
        throw new Error('Invalid multiaddr format')
      }

      console.log('Connecting to multiaddr:', ma.toString())

      // 尝试从 multiaddr 中提取 peer ID
      const peerIdStr = ma.getPeerId()
      
      if (peerIdStr) {
        // 如果有 peer ID，使用 peer ID 连接
        console.log('Connecting using peer ID:', peerIdStr)
        await this.node.dial(ma)
        
        // 添加到发现的节点列表
        this.discoveredPeers.add(peerIdStr)
        this.peerInfoMap.set(peerIdStr, {
          id: peerIdStr,
          status: 'connected',
          connectedAt: Date.now(),
          multiaddrs: [ma.toString()],
          source: 'manual'
        })
      } else {
        // 如果没有 peer ID，直接使用 multiaddr
        console.log('Connecting using multiaddr directly')
        await this.node.dial(ma)
      }

      console.log('Successfully connected to:', ma.toString())
    } catch (error) {
      console.error('Failed to connect to peer:', error)
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
      isStarted: this.isStarted
    }
  }
}

// 连接管理器类
class ConnectionManager {
  constructor(node) {
    this.node = node
    this.connectionStats = new Map()
    this.startMonitoring()
  }

  startMonitoring() {
    // 每30秒检查连接状态
    setInterval(() => {
      this.monitorConnections()
    }, 30000)
  }

  monitorConnections() {
    const connections = this.node.getConnections()

    // 更新连接统计
    connections.forEach(conn => {
      const peerId = conn.remotePeer.toString()
      if (!this.connectionStats.has(peerId)) {
        this.connectionStats.set(peerId, {
          firstConnected: Date.now(),
          lastSeen: Date.now(),
          connectionCount: 1
        })
      } else {
        const stats = this.connectionStats.get(peerId)
        stats.lastSeen = Date.now()
        stats.connectionCount++
      }
    })

    // 清理过期的统计信息
    this.cleanupOldStats()
  }

  cleanupOldStats() {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24小时

    for (const [peerId, stats] of this.connectionStats) {
      if (now - stats.lastSeen > maxAge) {
        this.connectionStats.delete(peerId)
      }
    }
  }

  getConnectionStats() {
    return Array.from(this.connectionStats.entries()).map(([peerId, stats]) => ({
      peerId,
      ...stats
    }))
  }
}