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
import { peerIdFromString } from '@libp2p/peer-id'

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
    // 提取引导节点的 peer ID 用于过滤
    this.bootstrapPeerIds = new Set()
    this.extractBootstrapPeerIds()
    this.connectionManager = null
  }

  // 提取引导节点的 peer ID
  extractBootstrapPeerIds() {
    this.bootstrapNodes.forEach(bootstrapAddr => {
      try {
        const ma = multiaddr(bootstrapAddr)
        const peerId = ma.getPeerId()
        if (peerId) {
          this.bootstrapPeerIds.add(peerId)
        }
      } catch (error) {
        // 忽略无效的引导节点地址
        console.debug('Invalid bootstrap node address:', bootstrapAddr)
      }
    })
    console.log('Bootstrap peer IDs:', Array.from(this.bootstrapPeerIds))
  }

  // 检查是否是引导节点
  isBootstrapPeer(peerId) {
    return this.bootstrapPeerIds.has(peerId)
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
            interval: 20e3, // 每20秒扫描一次
            broadcast: true,
            serviceTag: 'p2p-file-sharing'
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
          pubsub: gossipsub({
            enabled: true,
            emitSelf: false,
            gossipIncoming: true,
            fallbackToFloodsub: true,
            floodPublish: true,
            doPX: true,
            msgIdFn: (msg) => {
              return new TextEncoder().encode(msg.data.toString())
            },
            messageProcessingConcurrency: 10
          }),
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
            clientMode: false,
            validators: {},
            selectors: {}
          }),
          ping: ping({
            protocolPrefix: 'ipfs',
            maxInboundStreams: 32,
            maxOutboundStreams: 64,
            timeout: 10000
          }),
          identify: identify({
            protocolPrefix: 'ipfs',
            agentVersion: 'p2p-file-sharing/1.0.0',
            clientVersion: '1.0.0'
          })
        },
        connectionManager: {
          maxConnections: 100,
          minConnections: 5,
          pollInterval: 2000,
          autoDialInterval: 10000,
          inboundUpgradeTimeout: 10000,
          outboundUpgradeTimeout: 10000,
          connectionGater: {
            denyDialMultiaddr: () => false,
            denyDialPeer: () => false,
            denyInboundConnection: () => false,
            denyOutboundConnection: () => false,
            denyInboundEncryptedConnection: () => false,
            denyOutboundEncryptedConnection: () => false,
            denyInboundUpgradedConnection: () => false,
            denyOutboundUpgradedConnection: () => false,
            filterMultiaddrForPeer: (peer, multiaddr) => true
          }
        },
        // 确保协议协商正确
        connectionProtector: undefined, // 确保没有连接保护器干扰
        // 添加更好的连接超时设置
        transportManager: {
          faultTolerance: 3
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
      
      // 只添加非引导节点到发现列表
      if (!this.isBootstrapPeer(peerId)) {
        this.discoveredPeers.add(peerId)
        
        // 更新节点信息
        this.peerInfoMap.set(peerId, {
          id: peerId,
          status: 'connected',
          connectedAt: Date.now(),
          type: 'regular'
        })
      } else {
        console.log('Connected to bootstrap node (not added to discovered peers):', peerId)
      }
    })

    // 断开连接事件
    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString()
      console.log('Disconnected from peer:', peerId)
      
      // 更新节点状态（如果不是引导节点）
      if (!this.isBootstrapPeer(peerId)) {
        const peerInfo = this.peerInfoMap.get(peerId)
        if (peerInfo) {
          peerInfo.status = 'disconnected'
          peerInfo.disconnectedAt = Date.now()
        }
      }
    })

    // 发现新节点事件
    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString()
      
      // 过滤掉引导节点
      if (this.isBootstrapPeer(peerId)) {
        console.debug('Discovered bootstrap node (ignored):', peerId)
        return
      }
      
      console.log('Discovered peer:', peerId)
      this.discoveredPeers.add(peerId)

      // 存储节点信息，确保包含multiaddrs
      const multiaddrs = evt.detail.multiaddrs ? 
        evt.detail.multiaddrs.map(ma => {
          // 确保multiaddr包含peer ID
          const maStr = ma.toString()
          if (!maStr.includes(`/p2p/${peerId}`)) {
            return ma.encapsulate(`/p2p/${peerId}`).toString()
          }
          return maStr
        }) : []

      this.peerInfoMap.set(peerId, {
        id: peerId,
        status: 'discovered',
        discoveredAt: Date.now(),
        multiaddrs,
        type: 'regular'
      })

      console.log(`Stored ${multiaddrs.length} multiaddrs for discovered peer ${peerId}`)

      // 自动尝试连接到发现的节点
      this.attemptConnection(evt.detail)
    })

    // DHT查询事件
    this.node.addEventListener('peer:update', (evt) => {
      const peerId = evt.detail.peer.id.toString()
      
      // 过滤掉引导节点
      if (this.isBootstrapPeer(peerId)) {
        return
      }
      
      console.log('Peer updated:', peerId)
      
      // 更新节点信息
      const existingInfo = this.peerInfoMap.get(peerId)
      this.peerInfoMap.set(peerId, {
        ...existingInfo,
        id: peerId,
        updatedAt: Date.now(),
        multiaddrs: evt.detail.peer.multiaddrs ? evt.detail.peer.multiaddrs.map(ma => ma.toString()) : [],
        type: 'regular'
      })
    })
  }

  // 尝试连接到发现的节点
  async attemptConnection(peer) {
    try {
      const peerId = peer.id.toString()
      
      // 跳过引导节点
      if (this.isBootstrapPeer(peerId)) {
        return
      }

      const connections = this.node.getConnections()
      const currentConnections = connections.length
      const maxConnections = 50 // 降低最大连接数

      // 避免过多连接
      if (currentConnections >= maxConnections) {
        return
      }

      // 检查是否已经连接
      const isConnected = connections.some(conn =>
        conn.remotePeer.toString() === peerId
      )

      if (!isConnected && peer.multiaddrs && peer.multiaddrs.length > 0) {
        console.log(`Attempting to connect to discovered peer: ${peerId}`)
        
        // 过滤有效的multiaddrs
        const validMultiaddrs = peer.multiaddrs.filter(ma => {
          try {
            const maObj = typeof ma === 'string' ? multiaddr(ma) : ma
            const protocols = maObj.protos()
            
            // 检查是否有有效的传输协议
            const hasValidTransport = protocols.some(p => 
              p.name === 'tcp' || p.name === 'ws' || p.name === 'wss'
            )
            
            // 检查是否是可达的地址（避免无效的IP）
            const maStr = maObj.toString()
            const isLocalhost = maStr.includes('/ip4/127.0.0.1')
            const isPrivateNetwork = maStr.includes('/ip4/192.168.') || 
                                   maStr.includes('/ip4/10.') || 
                                   maStr.includes('/ip4/172.')
            const isPublicNetwork = maStr.includes('/ip4/') && !isLocalhost && !isPrivateNetwork
            
            // 只尝试本地或私有网络地址，避免连接到无效的公网地址
            return hasValidTransport && (isLocalhost || isPrivateNetwork)
          } catch (error) {
            return false
          }
        })
        
        if (validMultiaddrs.length === 0) {
          console.debug(`No valid multiaddrs found for peer ${peerId}`)
          return
        }
        
        // 只尝试第一个有效地址，避免过多的连接尝试
        try {
          const firstValidAddr = validMultiaddrs[0]
          const ma = typeof firstValidAddr === 'string' ? multiaddr(firstValidAddr) : firstValidAddr
          
          // 设置较短的超时时间用于自动连接
          const dialPromise = this.node.dial(ma)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Auto-connect timeout')), 10000) // 10秒超时
          })
          
          await Promise.race([dialPromise, timeoutPromise])
          console.log(`Auto-connected to peer: ${peerId}`)
          
        } catch (error) {
          // 自动连接失败是正常的，不需要详细日志
          console.debug(`Auto-connect failed for ${peerId}:`, error.message)
        }
      }
    } catch (error) {
      // 连接失败是正常的，不需要打印错误
      console.debug(`Auto-connect attempt failed:`, error.message)
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
        
        // 跳过引导节点
        if (this.isBootstrapPeer(peerId)) {
          continue
        }
        
        this.discoveredPeers.add(peerId)
        
        // 存储发现的节点信息
        this.peerInfoMap.set(peerId, {
          id: peerId,
          status: 'discovered',
          discoveredAt: Date.now(),
          source: 'dht',
          type: 'regular'
        })
        
        await this.attemptConnection({ id: peer })
      }

      console.log(`Discovered ${this.discoveredPeers.size} regular peers`)
    } catch (error) {
      console.error('Error during peer discovery:', error)
    }
  }

  // 获取发现的节点列表（排除引导节点）
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers).filter(peerId => !this.isBootstrapPeer(peerId))
  }

  // 获取节点详细信息（排除引导节点）
  getDiscoveredPeersInfo() {
    return Array.from(this.peerInfoMap.values()).filter(peerInfo => 
      peerInfo.type === 'regular'
    )
  }

  // 连接到发现的节点（通过 peer ID）- 简化版本
  async connectToDiscoveredPeer(peerId) {
    try {
      console.log(`Attempting to connect to discovered peer: ${peerId}`)
      
      // 检查是否是引导节点
      if (this.isBootstrapPeer(peerId)) {
        throw new Error(`Cannot connect to bootstrap node ${peerId}. Bootstrap nodes are infrastructure nodes, not regular peers. Please try connecting to other discovered peers instead.`)
      }
      
      // 检查是否已经连接
      const connections = this.node.getConnections()
      const isAlreadyConnected = connections.some(conn => 
        conn.remotePeer.toString() === peerId
      )
      
      if (isAlreadyConnected) {
        console.log(`Already connected to peer: ${peerId}`)
        return
      }

      // 获取节点的 multiaddr 信息
      const peerInfo = this.peerInfoMap.get(peerId)
      let connectionSuccessful = false
      
      // 方法1: 尝试使用存储的multiaddrs
      if (peerInfo && peerInfo.multiaddrs && peerInfo.multiaddrs.length > 0) {
        console.log(`Found ${peerInfo.multiaddrs.length} stored multiaddrs for peer`)
        
        for (const multiaddrStr of peerInfo.multiaddrs) {
          try {
            const ma = multiaddr(multiaddrStr)
            console.log(`Trying to connect via stored multiaddr: ${multiaddrStr}`)
            
            // 验证multiaddr格式
            const protocols = ma.protos()
            const hasValidTransport = protocols.some(p => 
              p.name === 'tcp' || p.name === 'ws' || p.name === 'wss'
            )
            
            if (!hasValidTransport) {
              console.log(`Invalid transport in multiaddr: ${multiaddrStr}`)
              continue
            }
            
            // 验证peer ID
            const maPeerId = ma.getPeerId()
            if (!maPeerId || maPeerId !== peerId) {
              console.log(`Multiaddr ${multiaddrStr} does not contain correct peer ID, skipping`)
              continue
            }
            
            // 设置连接超时
            const dialPromise = this.node.dial(ma)
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Connection timeout')), 15000)
            })
            
            await Promise.race([dialPromise, timeoutPromise])
            
            // 连接成功
            peerInfo.status = 'connected'
            peerInfo.connectedAt = Date.now()
            console.log(`Successfully connected to discovered peer: ${peerId}`)
            connectionSuccessful = true
            break
            
          } catch (error) {
            console.log(`Failed to connect via stored multiaddr ${multiaddrStr}:`, error.message)
            continue
          }
        }
      }
      
      // 方法2: 如果存储的地址都失败了，尝试从peerStore获取
      if (!connectionSuccessful) {
        console.log('Stored multiaddrs failed, trying peerStore...')
        
        try {
          const peer = await this.node.peerStore.get(peerIdFromString(peerId))
          
          if (peer && peer.addresses && peer.addresses.length > 0) {
            console.log(`Found ${peer.addresses.length} addresses in peerStore`)
            
            for (const addressInfo of peer.addresses) {
              try {
                let ma = addressInfo.multiaddr
                
                // 确保multiaddr包含peer ID
                if (!ma.getPeerId()) {
                  ma = ma.encapsulate(`/p2p/${peerId}`)
                }
                
                console.log(`Trying to connect via peerStore address: ${ma.toString()}`)
                
                const dialPromise = this.node.dial(ma)
                const timeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('Connection timeout')), 15000)
                })
                
                await Promise.race([dialPromise, timeoutPromise])
                
                // 连接成功，更新状态
                if (peerInfo) {
                  peerInfo.status = 'connected'
                  peerInfo.connectedAt = Date.now()
                  if (!peerInfo.multiaddrs) {
                    peerInfo.multiaddrs = [ma.toString()]
                  }
                } else {
                  this.peerInfoMap.set(peerId, {
                    id: peerId,
                    status: 'connected',
                    connectedAt: Date.now(),
                    multiaddrs: [ma.toString()],
                    source: 'peerStore',
                    type: 'regular'
                  })
                }
                
                console.log(`Successfully connected to discovered peer via peerStore: ${peerId}`)
                connectionSuccessful = true
                break
                
              } catch (error) {
                console.log(`Failed to connect via peerStore address ${addressInfo.multiaddr.toString()}:`, error.message)
                continue
              }
            }
          }
        } catch (peerStoreError) {
          console.log(`PeerStore lookup failed:`, peerStoreError.message)
        }
      }
      
      // 如果所有方法都失败了
      if (!connectionSuccessful) {
        throw new Error(`Unable to connect to peer ${peerId}. All connection methods failed. 

Possible reasons:
- The peer is offline or unreachable
- Network connectivity issues (firewall, NAT)
- Peer is on a different network segment
- Protocol version incompatibility

Suggestions:
- Ensure both peers are on the same network
- Check firewall settings
- Try having the other peer connect to you instead
- Verify both peers are using the same P2P protocols`)
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

  // 获取连接的节点列表（排除引导节点）
  getConnectedPeers() {
    if (!this.node) return []
    return this.node.getPeers().filter(peerId => !this.isBootstrapPeer(peerId.toString()))
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
        console.log('Connecting using peer ID:', peerIdStr)
        
        // 检查是否是引导节点
        if (this.isBootstrapPeer(peerIdStr)) {
          throw new Error(`Cannot manually connect to bootstrap node ${peerIdStr}. Bootstrap nodes are used automatically for network discovery. Try connecting to regular peers instead.`)
        }
        
        // 检查是否已经连接
        const connections = this.node.getConnections()
        const isAlreadyConnected = connections.some(conn => 
          conn.remotePeer.toString() === peerIdStr
        )
        
        if (isAlreadyConnected) {
          console.log(`Already connected to peer: ${peerIdStr}`)
          return
        }

        // 验证multiaddr格式和协议
        const protocols = ma.protos()
        const hasValidTransport = protocols.some(p => 
          p.name === 'tcp' || p.name === 'ws' || p.name === 'wss'
        )
        
        if (!hasValidTransport) {
          throw new Error('Multiaddr must include a valid transport protocol (tcp, ws, or wss)')
        }

        // 使用完整的 multiaddr 进行连接
        try {
          console.log('Attempting dial with timeout...')
          
          // 设置连接超时
          const dialPromise = this.node.dial(ma)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout after 30 seconds')), 30000)
          })
          
          const connection = await Promise.race([dialPromise, timeoutPromise])
          
          // 等待连接稳定
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // 验证连接是否仍然有效
          const currentConnections = this.node.getConnections()
          const activeConnection = currentConnections.find(conn => 
            conn.remotePeer.toString() === peerIdStr
          )
          
          if (!activeConnection) {
            throw new Error('Connection was established but immediately dropped')
          }
          
          // 添加到发现的节点列表
          this.discoveredPeers.add(peerIdStr)
          this.peerInfoMap.set(peerIdStr, {
            id: peerIdStr,
            status: 'connected',
            connectedAt: Date.now(),
            multiaddrs: [ma.toString()],
            source: 'manual',
            type: 'regular'
          })
          
          console.log('Successfully connected to peer:', peerIdStr)
          
        } catch (error) {
          console.error('Detailed connection error:', error)
          
          // 分析具体的错误类型并提供解决方案
          if (error.message.includes('ECONNREFUSED')) {
            throw new Error(`Connection refused. The target peer is not listening on the specified address/port. Please verify:
- The peer is running and listening
- The address and port are correct
- No firewall is blocking the connection`)
          } else if (error.message.includes('EncryptionFailedError')) {
            throw new Error(`Encryption protocol negotiation failed. This usually means:
- The peers are using incompatible libp2p versions
- Protocol configuration mismatch
- Network interference during handshake`)
          } else if (error.message.includes('timeout')) {
            throw new Error(`Connection timeout. The peer may be:
- Behind a NAT/firewall
- On a different network
- Temporarily unavailable
- Using a slow connection`)
          } else if (error.message.includes('unreachable') || error.message.includes('EHOSTUNREACH')) {
            throw new Error(`Host unreachable. Check:
- Network connectivity
- IP address is correct
- No routing issues`)
          } else {
            throw new Error(`Connection failed: ${error.message}`)
          }
        }
      } else {
        throw new Error('No peer ID found in multiaddr. Please provide a complete multiaddr with peer ID (e.g., /ip4/127.0.0.1/tcp/4001/p2p/12D3K...)')
      }
    } catch (error) {
      console.error('Failed to connect to peer:', error)
      throw error
    }
  }

  // 获取节点信息
  getNodeInfo() {
    if (!this.node) return null

    const connectedPeers = this.getConnectedPeers()
    const discoveredPeers = this.getDiscoveredPeers()

    return {
      peerId: this.node.peerId.toString(),
      addresses: this.node.getMultiaddrs().map(addr => addr.toString()),
      connectedPeers: connectedPeers.length,
      discoveredPeers: discoveredPeers.length,
      discoveredPeerIds: discoveredPeers,
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