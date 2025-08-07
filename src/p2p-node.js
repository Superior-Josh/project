// p2p-node.js

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
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { autoNAT } from '@libp2p/autonat'
// import { upnpNAT } from '@libp2p/upnp-nat'
import { dcutr } from '@libp2p/dcutr'
import { multiaddr } from '@multiformats/multiaddr'
import { peerIdFromString } from '@libp2p/peer-id'
import { createHash } from 'crypto'

export class P2PNode {
  constructor(options = {}) {
    this.node = null
    this.isStarted = false
    this.discoveredPeers = new Set()
    this.peerInfoMap = new Map()
    this.bootstrapNodes = options.bootstrapNodes || [
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
      // 添加更多公共引导节点以改善发现
      '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
      '/ip4/104.236.179.241/tcp/4001/p2p/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM'
    ]
    
    // 公共中继节点列表
    this.publicRelayNodes = options.publicRelayNodes || [
      '/ip4/139.178.68.217/tcp/4002/p2p/12D3KooWAJjbRkp8FPF5MKgMU53aUTxWkqvDrs4zc1VMbwRwfsbE',
      '/ip4/147.75.83.83/tcp/4002/p2p/12D3KooWB3AVrKXRkCiTyNFh8TwxfcSeZn2pGePrqR8GqWKKLCw1'
    ]

    this.bootstrapPeerIds = new Set()
    this.relayPeerIds = new Set()
    this.extractBootstrapPeerIds()
    this.connectionManager = null
    this.nodeInstanceId = this.generateNodeInstanceId()
    this.natManager = null
    this.holePunchingEnabled = options.enableHolePunching !== false
    this.upnpEnabled = options.enableUPnP !== false
    this.autoRelayEnabled = options.enableAutoRelay !== false
    this.isPublicNode = false
    this.natType = 'unknown'
    this.reachability = 'unknown'
    
    // 连接统计
    this.connectionStats = {
      directConnections: 0,
      relayedConnections: 0,
      holePunchAttempts: 0,
      holePunchSuccesses: 0,
      upnpMappings: 0
    }
  }

  generateNodeInstanceId() {
    const randomBytes = new Uint8Array(8)
    crypto.getRandomValues(randomBytes)
    return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  extractBootstrapPeerIds() {
    this.bootstrapNodes.forEach(bootstrapAddr => {
      try {
        const ma = multiaddr(bootstrapAddr)
        const peerId = ma.getPeerId()
        if (peerId) {
          this.bootstrapPeerIds.add(peerId)
        }
      } catch (error) {
        console.debug('Invalid bootstrap node address:', bootstrapAddr)
      }
    })
    
    this.publicRelayNodes.forEach(relayAddr => {
      try {
        const ma = multiaddr(relayAddr)
        const peerId = ma.getPeerId()
        if (peerId) {
          this.relayPeerIds.add(peerId)
        }
      } catch (error) {
        console.debug('Invalid relay node address:', relayAddr)
      }
    })
    
    console.log('Bootstrap peer IDs:', Array.from(this.bootstrapPeerIds))
    console.log('Relay peer IDs:', Array.from(this.relayPeerIds))
  }

  isBootstrapPeer(peerId) {
    return this.bootstrapPeerIds.has(peerId)
  }

  isRelayPeer(peerId) {
    return this.relayPeerIds.has(peerId)
  }

  createCustomMsgIdFn() {
    return (msg) => {
      try {
        const content = msg.data ? msg.data.toString() : ''
        const sender = msg.from ? msg.from.toString() : 'unknown'
        const seqno = msg.seqno ? Array.from(msg.seqno).join('') : Date.now().toString()
        
        const uniqueStr = `${content}-${sender}-${seqno}`
        const hash = createHash('sha256').update(uniqueStr).digest('hex')
        
        return new TextEncoder().encode(hash.substring(0, 32))
      } catch (error) {
        console.debug('Error generating message ID:', error)
        const timestamp = Date.now().toString()
        return new TextEncoder().encode(timestamp)
      }
    }
  }

  async createNode() {
    try {
      // 创建增强的libp2p节点，支持所有NAT穿透功能
      this.node = await createLibp2p({
        addresses: {
          listen: [
            '/ip4/0.0.0.0/tcp/0', // 监听所有接口，端口自动分配
            // '/ip6/::/tcp/0',      // IPv6支持
            // '/ip4/0.0.0.0/tcp/0/ws',
            // '/ip6/::/tcp/0/ws'
          ]
        },
        transports: [
          tcp(),
          webSockets(),
          // Circuit Relay v2 传输层，支持中继连接
          circuitRelayTransport({
            discoverRelays: 2, // 自动发现2个中继节点
            reservationConcurrency: 2,
            maxReservations: 5,
            // 限制中继资源使用
            reservationCompletionTimeout: 30000
          })
        ],
        connectionEncrypters: [
          noise()
        ],
        streamMuxers: [
          yamux()
        ],
        peerDiscovery: [
          // 本地网络发现 (mDNS)
          mdns({
            interval: 20e3,
            broadcast: true,
            serviceTag: 'p2p-file-sharing'
          }),
          // 引导节点发现（包括中继节点）
          bootstrap({
            list: [...this.bootstrapNodes, ...this.publicRelayNodes],
            timeout: 15000,
            tagName: 'bootstrap',
            tagValue: 50,
            tagTTL: 120000
          }),
          // 基于PubSub的节点发现
          pubsubPeerDiscovery({
            interval: 10000,
            topics: ['p2p-file-sharing-discovery'],
            listenOnly: false
          })
        ],
        services: {
          // AutoNAT服务 - 检测NAT类型和可达性
          autoNAT: autoNAT({
            enableService: true, // 为其他节点提供NAT检测服务
            maxInboundStreams: 32,
            maxOutboundStreams: 32,
            timeout: 30000,
            // 节流配置，防止滥用
            throttle: {
              globalLimit: 100,
              peerLimit: 10,
              interval: 60000
            }
          }),
          
          // 洞穿协议 (DCUtR - Direct Connection Upgrade through Relay)
          dcutr: dcutr({
            maxInboundStreams: 32,
            maxOutboundStreams: 32,
            timeout: 30000
          }),
          
          // PubSub
          pubsub: gossipsub({
            enabled: true,
            emitSelf: false,
            gossipIncoming: true,
            fallbackToFloodsub: true,
            floodPublish: false, // 减少网络负载
            doPX: true,
            msgIdFn: this.createCustomMsgIdFn(),
            messageProcessingConcurrency: 10,
            seenTTL: 60000,
            heartbeatInterval: 1000,
            mcacheLength: 5,
            mcacheGossip: 3,
            allowPublishToZeroPeers: true,
            scoreParams: {
              IPColocationFactorWeight: 0,
              behaviourPenaltyWeight: 0,
            }
          }),
          
          // Kademlia DHT
          dht: kadDHT({
            kBucketSize: 20,
            enabled: true,
            randomWalk: {
              enabled: true,
              interval: 300e3,
              timeout: 10e3
            },
            servers: false,
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
            agentVersion: 'p2p-file-sharing/2.0.0',
            clientVersion: '2.0.0'
          })
        },
        connectionManager: {
          maxConnections: 200, // 增加最大连接数以支持更多中继连接
          minConnections: 10,
          pollInterval: 2000,
          autoDialInterval: 5000, // 更频繁的自动拨号
          inboundUpgradeTimeout: 30000,
          outboundUpgradeTimeout: 30000,
          // 连接门控 - 允许中继连接
          connectionGater: {
            denyDialMultiaddr: (multiaddr) => {
              // 不拒绝任何中继连接
              return multiaddr.toString().includes('/p2p-circuit') ? false : false
            },
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
        connectionProtector: undefined,
        transportManager: {
          faultTolerance: 5 // 增加容错性
        }
      })

      // 如果启用了UPnP，初始化NAT管理器
      if (this.upnpEnabled) {
        try {
          this.natManager = new NATManager(this.node)
          await this.natManager.initialize()
        } catch (error) {
          console.warn('UPnP initialization failed:', error.message)
          this.upnpEnabled = false
        }
      }

      // 设置事件监听器
      this.setupEventListeners()

      // 初始化连接管理器
      this.connectionManager = new ConnectionManager(this.node, this)

      console.log('P2P node created successfully')
      console.log('Node ID:', this.node.peerId.toString())
      console.log('Instance ID:', this.nodeInstanceId)
      console.log('UPnP enabled:', this.upnpEnabled)
      console.log('Hole punching enabled:', this.holePunchingEnabled)
      console.log('Auto relay enabled:', this.autoRelayEnabled)

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
      const connection = this.node.getConnections(evt.detail)[0]
      
      console.log('Connected to peer:', peerId)
      
      // 统计连接类型
      if (connection && connection.remoteAddr.toString().includes('/p2p-circuit')) {
        this.connectionStats.relayedConnections++
        console.log('Relayed connection established with:', peerId)
      } else {
        this.connectionStats.directConnections++
        console.log('Direct connection established with:', peerId)
      }
      
      // 只添加非引导节点到发现列表
      if (!this.isBootstrapPeer(peerId) && !this.isRelayPeer(peerId)) {
        this.discoveredPeers.add(peerId)
        
        this.peerInfoMap.set(peerId, {
          id: peerId,
          status: 'connected',
          connectedAt: Date.now(),
          type: 'regular',
          connectionType: connection?.remoteAddr.toString().includes('/p2p-circuit') ? 'relayed' : 'direct'
        })
      }
    })

    // 断开连接事件
    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString()
      console.log('Disconnected from peer:', peerId)
      
      // 更新节点状态（如果不是引导节点）
      if (!this.isBootstrapPeer(peerId) && !this.isRelayPeer(peerId)) {
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
      
      // 过滤掉引导节点和中继节点
      if (this.isBootstrapPeer(peerId) || this.isRelayPeer(peerId)) {
        return
      }
      
      console.log('Discovered peer:', peerId)
      this.discoveredPeers.add(peerId)

      const multiaddrs = evt.detail.multiaddrs ? 
        evt.detail.multiaddrs.map(ma => {
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

      // 自动尝试连接
      this.attemptConnection(evt.detail)
    })

    // AutoNAT事件 - 检测NAT类型和可达性
    this.node.services.autoNAT.addEventListener('autonat:reachability', (evt) => {
      this.reachability = evt.detail.reachability
      this.isPublicNode = evt.detail.reachability === 'public'
      
      console.log('Reachability status:', this.reachability)
      console.log('Is public node:', this.isPublicNode)
      
      // 如果检测到是私有网络，启用中继服务
      if (this.reachability === 'private' && this.autoRelayEnabled) {
        this.enableAutoRelay()
      }
    })

    // DCUtR (洞穿) 事件
    if (this.node.services.dcutr) {
      this.node.services.dcutr.addEventListener('dcutr:hole-punch-success', (evt) => {
        this.connectionStats.holePunchSuccesses++
        console.log('Hole punch successful to peer:', evt.detail.remotePeer.toString())
      })

      this.node.services.dcutr.addEventListener('dcutr:hole-punch-failed', (evt) => {
        console.log('Hole punch failed to peer:', evt.detail.remotePeer.toString(), 'Error:', evt.detail.error)
      })

      this.node.services.dcutr.addEventListener('dcutr:attempt', (evt) => {
        this.connectionStats.holePunchAttempts++
        console.log('Hole punch attempt to peer:', evt.detail.remotePeer.toString())
      })
    }

    // 中继事件
    this.node.addEventListener('relay:reservation:success', (evt) => {
      console.log('Relay reservation successful with:', evt.detail.relay.toString())
    })

    this.node.addEventListener('relay:reservation:failed', (evt) => {
      console.log('Relay reservation failed with:', evt.detail.relay.toString(), 'Error:', evt.detail.error)
    })
  }

  async enableAutoRelay() {
    try {
      console.log('Enabling auto relay for private node...')
      
      // 连接到公共中继节点
      for (const relayAddr of this.publicRelayNodes) {
        try {
          const ma = multiaddr(relayAddr)
          await this.node.dial(ma)
          console.log('Connected to relay node:', relayAddr)
        } catch (error) {
          console.warn('Failed to connect to relay node:', relayAddr, error.message)
        }
      }
    } catch (error) {
      console.error('Error enabling auto relay:', error)
    }
  }

  async attemptConnection(peer) {
    try {
      const peerId = peer.id.toString()
      
      // 跳过特殊节点
      if (this.isBootstrapPeer(peerId) || this.isRelayPeer(peerId)) {
        return
      }

      const connections = this.node.getConnections()
      const currentConnections = connections.length
      const maxConnections = 100

      if (currentConnections >= maxConnections) {
        return
      }

      // 检查是否已经连接
      const isConnected = connections.some(conn =>
        conn.remotePeer.toString() === peerId
      )

      if (!isConnected && peer.multiaddrs && peer.multiaddrs.length > 0) {
        console.log(`Attempting to connect to discovered peer: ${peerId}`)
        
        // 尝试直接连接
        const validMultiaddrs = this.filterValidMultiaddrs(peer.multiaddrs, peerId)
        
        if (validMultiaddrs.length > 0) {
          try {
            const firstValidAddr = validMultiaddrs[0]
            const ma = typeof firstValidAddr === 'string' ? multiaddr(firstValidAddr) : firstValidAddr
            
            const dialPromise = this.node.dial(ma)
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Direct connection timeout')), 15000)
            })
            
            await Promise.race([dialPromise, timeoutPromise])
            console.log(`Direct connection successful to peer: ${peerId}`)
            
          } catch (directError) {
            console.debug(`Direct connection failed for ${peerId}:`, directError.message)
            
            // 如果直接连接失败，尝试通过中继连接
            if (this.autoRelayEnabled) {
              await this.attemptRelayConnection(peerId)
            }
          }
        }
      }
    } catch (error) {
      console.debug(`Connection attempt failed:`, error.message)
    }
  }

  async attemptRelayConnection(peerId) {
    try {
      // 查找可用的中继节点
      const relayConnections = this.node.getConnections().filter(conn =>
        this.isRelayPeer(conn.remotePeer.toString())
      )

      if (relayConnections.length === 0) {
        console.debug('No relay connections available for peer:', peerId)
        return
      }

      for (const relayConn of relayConnections) {
        try {
          const relayPeerId = relayConn.remotePeer.toString()
          const relayMultiaddr = multiaddr(`/p2p/${relayPeerId}/p2p-circuit/p2p/${peerId}`)
          
          console.log(`Attempting relay connection to ${peerId} via ${relayPeerId}`)
          
          const dialPromise = this.node.dial(relayMultiaddr)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Relay connection timeout')), 20000)
          })
          
          await Promise.race([dialPromise, timeoutPromise])
          console.log(`Relay connection successful to peer: ${peerId}`)
          break
          
        } catch (relayError) {
          console.debug(`Relay connection failed via ${relayConn.remotePeer.toString()}:`, relayError.message)
        }
      }
    } catch (error) {
      console.debug('Relay connection attempt failed:', error.message)
    }
  }

  filterValidMultiaddrs(multiaddrs, peerId) {
    return multiaddrs.filter(ma => {
      try {
        const maObj = typeof ma === 'string' ? multiaddr(ma) : ma
        const protocols = maObj.protos()
        
        // 检查是否有有效的传输协议
        const hasValidTransport = protocols.some(p => 
          p.name === 'tcp' || p.name === 'ws' || p.name === 'wss'
        )
        
        if (!hasValidTransport) return false
        
        // 允许所有类型的地址（本地、私有、公共）
        const maStr = maObj.toString()
        
        // 过滤掉明显无效的地址
        if (maStr.includes('/ip4/0.0.0.0') || 
            maStr.includes('/ip4/255.255.255.255') ||
            maStr.includes('/ip6/::') ||
            maStr.includes('/ip6/ff')) {
          return false
        }
        
        return true
      } catch (error) {
        return false
      }
    })
  }

  // 手动连接到节点（支持直接连接和中继连接）
  async connectToPeer(multiaddrString) {
    if (!this.node) {
      throw new Error('Node not initialized')
    }

    try {
      let ma
      if (typeof multiaddrString === 'string') {
        ma = multiaddr(multiaddrString)
      } else {
        throw new Error('Invalid multiaddr format')
      }

      console.log('Connecting to multiaddr:', ma.toString())

      const peerIdStr = ma.getPeerId()
      const isCircuitRelay = ma.toString().includes('/p2p-circuit')
      
      if (peerIdStr) {
        // 检查是否已经连接
        const connections = this.node.getConnections()
        const isAlreadyConnected = connections.some(conn => 
          conn.remotePeer.toString() === peerIdStr
        )
        
        if (isAlreadyConnected) {
          console.log(`Already connected to peer: ${peerIdStr}`)
          return
        }

        try {
          console.log(`Attempting to ${isCircuitRelay ? 'relay' : 'direct'} connect...`)
          
          const dialPromise = this.node.dial(ma)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout after 45 seconds')), 45000)
          })
          
          const connection = await Promise.race([dialPromise, timeoutPromise])
          
          // 等待连接稳定
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // 验证连接
          const currentConnections = this.node.getConnections()
          const activeConnection = currentConnections.find(conn => 
            conn.remotePeer.toString() === peerIdStr
          )
          
          if (!activeConnection) {
            throw new Error('Connection was established but immediately dropped')
          }
          
          // 更新统计和信息
          if (isCircuitRelay) {
            this.connectionStats.relayedConnections++
          } else {
            this.connectionStats.directConnections++
          }
          
          this.discoveredPeers.add(peerIdStr)
          this.peerInfoMap.set(peerIdStr, {
            id: peerIdStr,
            status: 'connected',
            connectedAt: Date.now(),
            multiaddrs: [ma.toString()],
            source: 'manual',
            type: 'regular',
            connectionType: isCircuitRelay ? 'relayed' : 'direct'
          })
          
          console.log(`Successfully connected to peer: ${peerIdStr} (${isCircuitRelay ? 'relayed' : 'direct'})`)
          
          // 如果是中继连接且启用了洞穿，尝试升级为直接连接
          if (isCircuitRelay && this.holePunchingEnabled && this.node.services.dcutr) {
            setTimeout(async () => {
              try {
                console.log(`Attempting hole punch to upgrade relay connection with: ${peerIdStr}`)
                // DCUtR会自动处理洞穿过程
              } catch (punchError) {
                console.debug('Hole punch attempt failed:', punchError.message)
              }
            }, 5000)
          }
          
        } catch (error) {
          console.error('Connection error:', error)
          this.handleConnectionError(error, isCircuitRelay)
        }
      } else {
        throw new Error('No peer ID found in multiaddr')
      }
    } catch (error) {
      console.error('Failed to connect to peer:', error)
      throw error
    }
  }

  handleConnectionError(error, isCircuitRelay) {
    if (error.message.includes('ECONNREFUSED')) {
      throw new Error(`Connection refused. The target peer is not reachable. ${isCircuitRelay ? 'Relay node may be down.' : 'Check if peer is online and listening.'}`)
    } else if (error.message.includes('timeout')) {
      throw new Error(`Connection timeout. ${isCircuitRelay ? 'Relay connection took too long.' : 'Peer may be behind NAT/firewall. Try relay connection.'}`)
    } else {
      throw new Error(`Connection failed: ${error.message}`)
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

    // 如果启用了UPnP，尝试端口映射
    if (this.upnpEnabled && this.natManager) {
      await this.natManager.createPortMappings(listenAddrs)
    }

    // 启动节点发现和NAT检测
    setTimeout(() => {
      this.discoverPeers().catch(error => {
        console.debug('Peer discovery error:', error.message)
      })
      
      // 触发NAT检测
      if (this.node.services.autoNAT) {
        this.node.services.autoNAT.checkReachability()
      }
    }, 5000)

    return this.node
  }

  async stop() {
    if (this.node && this.isStarted) {
      try {
        // 清理UPnP映射
        if (this.natManager) {
          await this.natManager.cleanup()
        }
        
        await this.node.stop()
        this.isStarted = false
        console.log('Node stopped')
      } catch (error) {
        console.warn('Error stopping node:', error.message)
      }
    }
  }

  // 主动发现节点
  async discoverPeers() {
    try {
      console.log('Starting  peer discovery...')

      // 通过DHT查找节点
      const randomKey = new Uint8Array(32)
      crypto.getRandomValues(randomKey)

      for await (const peer of this.node.services.dht.getClosestPeers(randomKey)) {
        const peerId = peer.toString()
        
        // 跳过特殊节点
        if (this.isBootstrapPeer(peerId) || this.isRelayPeer(peerId)) {
          continue
        }
        
        this.discoveredPeers.add(peerId)
        
        this.peerInfoMap.set(peerId, {
          id: peerId,
          status: 'discovered',
          discoveredAt: Date.now(),
          source: 'dht',
          type: 'regular'
        })
        
        await this.attemptConnection({ id: peer })
      }

      console.log(` Discovery completed: ${this.discoveredPeers.size} peers`)
    } catch (error) {
      console.error('Error during  peer discovery:', error)
    }
  }

  // 连接到发现的节点（支持直接连接和中继连接）
  async connectToDiscoveredPeer(peerId) {
    try {
      console.log(`Attempting to connect to discovered peer: ${peerId}`)
      
      if (this.isBootstrapPeer(peerId) || this.isRelayPeer(peerId)) {
        throw new Error(`Cannot connect to infrastructure node ${peerId}`)
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

      const peerInfo = this.peerInfoMap.get(peerId)
      let connectionSuccessful = false
      
      // 方法1: 尝试直接连接
      if (peerInfo && peerInfo.multiaddrs && peerInfo.multiaddrs.length > 0) {
        console.log(`Trying direct connection with stored multiaddrs`)
        
        for (const multiaddrStr of peerInfo.multiaddrs) {
          try {
            const ma = multiaddr(multiaddrStr)
            console.log(`Trying direct connection via: ${multiaddrStr}`)
            
            const dialPromise = this.node.dial(ma)
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Direct connection timeout')), 15000)
            })
            
            await Promise.race([dialPromise, timeoutPromise])
            
            peerInfo.status = 'connected'
            peerInfo.connectedAt = Date.now()
            peerInfo.connectionType = 'direct'
            this.connectionStats.directConnections++
            
            console.log(`Direct connection successful: ${peerId}`)
            connectionSuccessful = true
            break
            
          } catch (error) {
            console.log(`Direct connection failed via ${multiaddrStr}: ${error.message}`)
          }
        }
      }
      
      // 方法2: 如果直接连接失败，尝试中继连接
      if (!connectionSuccessful && this.autoRelayEnabled) {
        console.log('Direct connection failed, trying relay connection...')
        
        try {
          await this.attemptRelayConnection(peerId)
          
          // 检查中继连接是否成功
          const currentConnections = this.node.getConnections()
          const relayConnection = currentConnections.find(conn => 
            conn.remotePeer.toString() === peerId && 
            conn.remoteAddr.toString().includes('/p2p-circuit')
          )
          
          if (relayConnection) {
            if (peerInfo) {
              peerInfo.status = 'connected'
              peerInfo.connectedAt = Date.now()
              peerInfo.connectionType = 'relayed'
            }
            this.connectionStats.relayedConnections++
            console.log(`Relay connection successful: ${peerId}`)
            connectionSuccessful = true
            
            // 如果启用了洞穿，尝试升级为直接连接
            if (this.holePunchingEnabled && this.node.services.dcutr) {
              setTimeout(() => {
                console.log(`Attempting hole punch upgrade for: ${peerId}`)
                // DCUtR会自动处理
              }, 3000)
            }
          }
        } catch (relayError) {
          console.log(`Relay connection failed: ${relayError.message}`)
        }
      }
      
      // 方法3: 尝试通过peer ID直接连接
      if (!connectionSuccessful) {
        console.log('Trying direct peer ID connection...')
        
        try {
          const peerIdObj = peerIdFromString(peerId)
          
          const dialPromise = this.node.dial(peerIdObj)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Peer ID connection timeout')), 20000)
          })
          
          await Promise.race([dialPromise, timeoutPromise])
          
          if (peerInfo) {
            peerInfo.status = 'connected'
            peerInfo.connectedAt = Date.now()
            peerInfo.connectionType = 'direct'
          }
          this.connectionStats.directConnections++
          
          console.log(`Peer ID connection successful: ${peerId}`)
          connectionSuccessful = true
          
        } catch (error) {
          console.log(`Peer ID connection failed: ${error.message}`)
        }
      }
      
      if (!connectionSuccessful) {
        throw new Error(`All connection methods failed for peer ${peerId}. The peer may be offline, behind a restrictive NAT, or using incompatible protocols.`)
      }
      
    } catch (error) {
      console.error(`Failed to connect to discovered peer ${peerId}:`, error)
      throw error
    }
  }

  // 获取连接的节点列表（排除基础设施节点）
  getConnectedPeers() {
    if (!this.node) return []
    return this.node.getPeers().filter(peerId => 
      !this.isBootstrapPeer(peerId.toString()) && 
      !this.isRelayPeer(peerId.toString())
    )
  }

  // 获取发现的节点列表
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers).filter(peerId => 
      !this.isBootstrapPeer(peerId) && !this.isRelayPeer(peerId)
    )
  }

  // 获取节点信息（增强版）
  getNodeInfo() {
    if (!this.node) return null

    const connectedPeers = this.getConnectedPeers()
    const discoveredPeers = this.getDiscoveredPeers()
    const allConnections = this.node.getConnections()
    
    // 统计连接类型
    const directConnections = allConnections.filter(conn => 
      !conn.remoteAddr.toString().includes('/p2p-circuit')
    ).length
    
    const relayedConnections = allConnections.filter(conn => 
      conn.remoteAddr.toString().includes('/p2p-circuit')
    ).length

    return {
      peerId: this.node.peerId.toString(),
      addresses: this.node.getMultiaddrs().map(addr => addr.toString()),
      connectedPeers: connectedPeers.length,
      discoveredPeers: discoveredPeers.length,
      discoveredPeerIds: discoveredPeers,
      isStarted: this.isStarted,
      instanceId: this.nodeInstanceId,
      // 增强信息
      reachability: this.reachability,
      isPublicNode: this.isPublicNode,
      natType: this.natType,
      upnpEnabled: this.upnpEnabled,
      holePunchingEnabled: this.holePunchingEnabled,
      autoRelayEnabled: this.autoRelayEnabled,
      connectionStats: {
        ...this.connectionStats,
        directConnections,
        relayedConnections,
        totalConnections: allConnections.length
      }
    }
  }

  // 获取NAT穿透状态
  getNATTraversalStatus() {
    return {
      reachability: this.reachability,
      isPublicNode: this.isPublicNode,
      natType: this.natType,
      upnpEnabled: this.upnpEnabled,
      upnpMappings: this.connectionStats.upnpMappings,
      holePunchingEnabled: this.holePunchingEnabled,
      holePunchAttempts: this.connectionStats.holePunchAttempts,
      holePunchSuccesses: this.connectionStats.holePunchSuccesses,
      autoRelayEnabled: this.autoRelayEnabled,
      relayedConnections: this.connectionStats.relayedConnections,
      directConnections: this.connectionStats.directConnections
    }
  }

  // 强制NAT类型检测
  async forceNATDetection() {
    if (this.node && this.node.services.autoNAT) {
      console.log('Starting forced NAT detection...')
      try {
        await this.node.services.autoNAT.checkReachability()
        return this.reachability
      } catch (error) {
        console.error('NAT detection failed:', error)
        return 'unknown'
      }
    }
    return 'unknown'
  }

  // 手动刷新中继连接
  async refreshRelayConnections() {
    if (!this.autoRelayEnabled) {
      console.log('Auto relay is disabled')
      return
    }

    console.log('Refreshing relay connections...')
    
    // 重新连接到公共中继节点
    for (const relayAddr of this.publicRelayNodes) {
      try {
        const ma = multiaddr(relayAddr)
        const peerId = ma.getPeerId()
        
        // 检查是否已连接
        const isConnected = this.node.getConnections().some(conn =>
          conn.remotePeer.toString() === peerId
        )
        
        if (!isConnected) {
          console.log('Reconnecting to relay:', relayAddr)
          await this.node.dial(ma)
        }
      } catch (error) {
        console.warn('Failed to refresh relay connection:', relayAddr, error.message)
      }
    }
  }
}

// NAT管理器类 - 处理UPnP端口映射
class NATManager {
  constructor(node) {
    this.node = node
    this.portMappings = new Map()
    this.upnpClient = null
  }

  async initialize() {
    try {
      // 这里应该使用实际的UPnP库，比如 @achingbrain/nat-port-mapper
      console.log('NAT Manager initialized (UPnP support placeholder)')
      return true
    } catch (error) {
      console.error('Failed to initialize NAT manager:', error)
      return false
    }
  }

  async createPortMappings(listenAddrs) {
    try {
      console.log('Creating UPnP port mappings...')
      
      for (const addr of listenAddrs) {
        const addrStr = addr.toString()
        
        // 只为TCP地址创建映射
        if (addrStr.includes('/tcp/') && !addrStr.includes('/ws')) {
          const port = this.extractPort(addrStr)
          if (port && port > 0) {
            await this.createPortMapping(port, 'TCP')
          }
        }
      }
    } catch (error) {
      console.error('Error creating port mappings:', error)
    }
  }

  extractPort(multiaddr) {
    try {
      const match = multiaddr.match(/\/tcp\/(\d+)/)
      return match ? parseInt(match[1]) : null
    } catch {
      return null
    }
  }

  async createPortMapping(port, protocol) {
    try {
      // UPnP端口映射的占位符实现
      console.log(`Creating ${protocol} port mapping for port ${port}`)
      
      // 这里应该使用实际的UPnP库来创建端口映射
      // 例如: await this.upnpClient.map({ publicPort: port, privatePort: port, protocol })
      
      this.portMappings.set(port, { protocol, createdAt: Date.now() })
      return true
    } catch (error) {
      console.error(`Failed to create port mapping for ${port}:`, error)
      return false
    }
  }

  async cleanup() {
    try {
      console.log('Cleaning up UPnP port mappings...')
      
      for (const [port, mapping] of this.portMappings) {
        try {
          // 这里应该删除UPnP映射
          console.log(`Removing ${mapping.protocol} mapping for port ${port}`)
          // await this.upnpClient.unmap({ publicPort: port, protocol: mapping.protocol })
        } catch (error) {
          console.error(`Failed to remove mapping for port ${port}:`, error)
        }
      }
      
      this.portMappings.clear()
    } catch (error) {
      console.error('Error during NAT manager cleanup:', error)
    }
  }
}

// 增强的连接管理器
class ConnectionManager {
  constructor(node, p2pNode) {
    this.node = node
    this.p2pNode = p2pNode
    this.connectionStats = new Map()
    this.startMonitoring()
  }

  startMonitoring() {
    // 每30秒检查连接状态
    setInterval(() => {
      this.monitorConnections().catch(error => {
        console.debug('Connection monitoring error:', error.message)
      })
    }, 30000)
    
    // 每5分钟尝试优化连接
    setInterval(() => {
      this.optimizeConnections().catch(error => {
        console.debug('Connection optimization error:', error.message)
      })
    }, 5 * 60 * 1000)
  }

  async monitorConnections() {
    try {
      const connections = this.node.getConnections()
      const now = Date.now()

      // 更新连接统计
      connections.forEach(conn => {
        const peerId = conn.remotePeer.toString()
        const isRelay = conn.remoteAddr.toString().includes('/p2p-circuit')
        
        if (!this.connectionStats.has(peerId)) {
          this.connectionStats.set(peerId, {
            firstConnected: now,
            lastSeen: now,
            connectionCount: 1,
            totalRelayTime: 0,
            totalDirectTime: 0,
            currentConnectionType: isRelay ? 'relay' : 'direct',
            connectionTypeChangeTime: now
          })
        } else {
          const stats = this.connectionStats.get(peerId)
          stats.lastSeen = now
          
          // 如果连接类型改变了（比如从中继升级到直接连接）
          if (stats.currentConnectionType !== (isRelay ? 'relay' : 'direct')) {
            const timeDiff = now - stats.connectionTypeChangeTime
            
            if (stats.currentConnectionType === 'relay') {
              stats.totalRelayTime += timeDiff
            } else {
              stats.totalDirectTime += timeDiff
            }
            
            stats.currentConnectionType = isRelay ? 'relay' : 'direct'
            stats.connectionTypeChangeTime = now
            
            console.log(`Connection type changed for ${peerId}: ${stats.currentConnectionType}`)
          }
        }
      })

      // 清理断开连接的统计信息
      this.cleanupOldStats()
    } catch (error) {
      console.debug('Error monitoring connections:', error.message)
    }
  }

  async optimizeConnections() {
    try {
      console.log('Optimizing connections...')
      
      const connections = this.node.getConnections()
      const relayConnections = connections.filter(conn =>
        conn.remoteAddr.toString().includes('/p2p-circuit')
      )
      
      // 如果有太多中继连接，尝试升级一些为直接连接
      if (relayConnections.length > 5 && this.p2pNode.holePunchingEnabled) {
        console.log(`Found ${relayConnections.length} relay connections, attempting upgrades...`)
        
        for (const conn of relayConnections.slice(0, 3)) {
          try {
            const peerId = conn.remotePeer.toString()
            
            // 检查这个节点是否值得升级（基于统计信息）
            const stats = this.connectionStats.get(peerId)
            if (stats && stats.totalRelayTime > 60000) { // 1分钟以上的中继时间
              console.log(`Attempting to upgrade relay connection for ${peerId}`)
              // DCUtR会自动处理升级过程
            }
          } catch (error) {
            console.debug('Connection upgrade attempt failed:', error.message)
          }
        }
      }
      
      // 如果是私有节点且中继连接太少，尝试建立更多中继连接
      if (this.p2pNode.reachability === 'private' && relayConnections.length < 2) {
        console.log('Private node with insufficient relay connections, refreshing...')
        await this.p2pNode.refreshRelayConnections()
      }
      
    } catch (error) {
      console.debug('Error optimizing connections:', error.message)
    }
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
      ...stats,
      isCurrentlyConnected: this.node.getConnections().some(conn =>
        conn.remotePeer.toString() === peerId
      )
    }))
  }

  getNetworkHealth() {
    const connections = this.node.getConnections()
    const directConnections = connections.filter(conn =>
      !conn.remoteAddr.toString().includes('/p2p-circuit')
    ).length
    const relayConnections = connections.filter(conn =>
      conn.remoteAddr.toString().includes('/p2p-circuit')
    ).length
    
    const totalAttempts = this.p2pNode.connectionStats.holePunchAttempts
    const successRate = totalAttempts > 0 ? 
      (this.p2pNode.connectionStats.holePunchSuccesses / totalAttempts) * 100 : 0
    
    return {
      totalConnections: connections.length,
      directConnections,
      relayConnections,
      holePunchSuccessRate: Math.round(successRate),
      networkReachability: this.p2pNode.reachability,
      recommendedActions: this.getRecommendedActions(directConnections, relayConnections)
    }
  }

  getRecommendedActions(directConnections, relayConnections) {
    const actions = []
    
    if (directConnections === 0 && relayConnections === 0) {
      actions.push('No connections found. Check network connectivity and firewall settings.')
    }
    
    if (directConnections === 0 && relayConnections > 0) {
      actions.push('Only relay connections available. Consider enabling UPnP or manual port forwarding for better performance.')
    }
    
    if (this.p2pNode.reachability === 'private' && !this.p2pNode.upnpEnabled) {
      actions.push('Private node detected. Consider enabling UPnP for automatic port forwarding.')
    }
    
    if (relayConnections > directConnections * 2) {
      actions.push('High ratio of relay connections. Network performance may be impacted.')
    }
    
    return actions
  }
}