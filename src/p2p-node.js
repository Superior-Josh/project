// src/p2p-node.js

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

    // 默认引导节点
    this.bootstrapNodes = options.bootstrapNodes || [
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
    ]

    // 公共中继节点
    this.publicRelayNodes = options.publicRelayNodes || []

    // 提取对等节点ID
    this.bootstrapPeerIds = new Set()
    this.relayPeerIds = new Set()
    this.extractBootstrapPeerIds()

    // 节点实例ID
    this.nodeInstanceId = this.generateNodeInstanceId()

    // NAT穿透设置
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
        if (peerId) this.bootstrapPeerIds.add(peerId)
      } catch (error) {
        console.debug('Invalid bootstrap node address:', bootstrapAddr)
      }
    })

    this.publicRelayNodes.forEach(relayAddr => {
      try {
        const ma = multiaddr(relayAddr)
        const peerId = ma.getPeerId()
        if (peerId) this.relayPeerIds.add(peerId)
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
      this.node = await createLibp2p({
        addresses: {
          listen: [
            '/ip4/0.0.0.0/tcp/0'
          ]
        },
        transports: [
          tcp(),
          webSockets(),
          circuitRelayTransport({
            discoverRelays: 2,
            reservationConcurrency: 2,
            maxReservations: 5,
            reservationCompletionTimeout: 30000
          })
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        peerDiscovery: [
          mdns({
            interval: 20e3,
            broadcast: true,
            serviceTag: 'p2p-file-sharing'
          }),
          bootstrap({
            list: [...this.bootstrapNodes, ...this.publicRelayNodes],
            timeout: 15000,
            tagName: 'bootstrap',
            tagValue: 50,
            tagTTL: 120000
          }),
          pubsubPeerDiscovery({
            interval: 10000,
            topics: ['p2p-file-sharing-discovery'],
            listenOnly: false
          })
        ],
        services: {
          // AutoNAT服务
          autoNAT: autoNAT({
            protocolPrefix: 'libp2p',
            timeout: 30000,
            maxInboundStreams: 32,
            maxOutboundStreams: 32
          }),

          // DCUtR用于洞穿
          dcutr: dcutr({
            protocolPrefix: 'libp2p',
            timeout: 30000,
            maxInboundStreams: 32,
            maxOutboundStreams: 32
          }),

          // PubSub
          pubsub: gossipsub({
            enabled: true,
            emitSelf: false,
            gossipIncoming: true,
            fallbackToFloodsub: true,
            floodPublish: false,
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
          maxConnections: 200,
          minConnections: 10,
          pollInterval: 2000,
          autoDialInterval: 5000,
          inboundUpgradeTimeout: 30000,
          outboundUpgradeTimeout: 30000,
          connectionGater: {
            denyDialMultiaddr: () => false,
            denyDialPeer: () => false,
            denyInboundConnection: () => false,
            denyOutboundConnection: () => false,
            denyInboundEncryptedConnection: () => false,
            denyOutboundEncryptedConnection: () => false,
            denyInboundUpgradedConnection: () => false,
            denyOutboundUpgradedConnection: () => false,
            filterMultiaddrForPeer: () => true
          }
        },
        transportManager: {
          faultTolerance: 5
        }
      })

      // 注册DHT数据广播协议
      this.node.handle('/p2p-file-sharing/dht-broadcast/1.0.0', ({ stream, connection }) => {
        this.handleDHTBroadcast(stream, connection)
      })

      this.setupEventListeners()

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

  // 处理DHT广播消息
  async handleDHTBroadcast(stream, connection) {
    try {
      const chunks = []
      for await (const chunk of stream.source) {
        chunks.push(chunk)
      }

      const messageBuffer = Buffer.concat(chunks)
      const message = JSON.parse(messageBuffer.toString())

      if (message.type === 'DHT_DATA') {
        console.log(`Received DHT data for word: ${message.word}`)

        // 将接收到的数据存储到本地DHT
        const keyBytes = new Uint8Array(message.key)
        const dataBytes = new Uint8Array(message.data)

        if (this.node.services.dht) {
          await this.node.services.dht.put(keyBytes, dataBytes)
          console.log(`✓ Stored DHT data locally for: ${message.word}`)
        }
      }
    } catch (error) {
      console.error('Error handling DHT broadcast:', error)
    }
  }

  setupEventListeners() {
    // 连接事件
    this.node.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.toString()
      const connection = this.node.getConnections(evt.detail)[0]

      console.log('Connected to peer:', peerId)

      // 跟踪连接类型
      if (connection && connection.remoteAddr.toString().includes('/p2p-circuit')) {
        this.connectionStats.relayedConnections++
        console.log('Relayed connection established with:', peerId)
      } else {
        this.connectionStats.directConnections++
        console.log('Direct connection established with:', peerId)
      }

      // 只将非基础设施节点添加到发现列表
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

      if (!this.isBootstrapPeer(peerId) && !this.isRelayPeer(peerId)) {
        const peerInfo = this.peerInfoMap.get(peerId)
        if (peerInfo) {
          peerInfo.status = 'disconnected'
          peerInfo.disconnectedAt = Date.now()
        }
      }
    })

    // 对等节点发现事件
    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString()

      // 过滤掉基础设施节点
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

    // 开始可达性检查
    this.startReachabilityCheck()
  }

  // 定期检查可达性
  startReachabilityCheck() {
    setInterval(async () => {
      try {
        await this.checkReachability()
      } catch (error) {
        console.debug('Reachability check failed:', error.message)
      }
    }, 60000) // 每分钟检查一次
  }

  async checkReachability() {
    try {
      const connections = this.node.getConnections()
      const listenAddrs = this.node.getMultiaddrs()

      // 简单的启发式：如果我们有公共IP的监听地址，我们可能是公共的
      const hasPublicAddress = listenAddrs.some(addr => {
        const addrStr = addr.toString()
        return !addrStr.includes('127.0.0.1') &&
          !addrStr.includes('192.168.') &&
          !addrStr.includes('10.0.') &&
          !addrStr.includes('172.16.')
      })

      // 检查我们是否可以接受入站连接
      const hasInboundConnections = connections.some(conn => {
        try {
          return conn.stat?.direction === 'inbound'
        } catch {
          return false
        }
      })

      this.isPublicNode = hasPublicAddress && hasInboundConnections
      this.reachability = this.isPublicNode ? 'public' : 'private'

      console.log('Reachability status:', this.reachability)
      console.log('Is public node:', this.isPublicNode)

      // 如果是私有节点且启用了自动中继，确保中继连接
      if (this.reachability === 'private' && this.autoRelayEnabled) {
        await this.enableAutoRelay()
      }
    } catch (error) {
      console.debug('Error checking reachability:', error)
      this.reachability = 'unknown'
    }
  }

  async enableAutoRelay() {
    try {
      console.log('Enabling auto relay for private node...')

      // 连接到公共中继节点
      for (const relayAddr of this.publicRelayNodes) {
        try {
          const ma = multiaddr(relayAddr)
          const connections = this.node.getConnections()
          const peerId = ma.getPeerId()

          // 检查是否已经连接
          const isConnected = connections.some(conn =>
            conn.remotePeer.toString() === peerId
          )

          if (!isConnected) {
            await this.node.dial(ma)
            console.log('Connected to relay node:', relayAddr)
          }
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

      // 跳过基础设施节点
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

            // 尝试中继连接
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

        // 检查有效的传输协议
        const hasValidTransport = protocols.some(p =>
          p.name === 'tcp' || p.name === 'ws' || p.name === 'wss'
        )

        if (!hasValidTransport) return false

        const maStr = maObj.toString()

        // 过滤掉无效地址
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

  // 手动对等节点连接，支持中继
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

          // 更新统计
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

    // 开始对等节点发现和可达性检查
    setTimeout(() => {
      this.discoverPeers().catch(error => {
        console.debug('Peer discovery error:', error.message)
      })

      // 开始可达性检查
      this.checkReachability()
    }, 5000)

    // DHT预热和同步
    setTimeout(async () => {
      try {
        // 强制DHT随机游走以发现更多节点
        if (this.node.services.dht) {
          console.log('Starting DHT bootstrap and sync...')
          await this.node.services.dht.refreshRoutingTable()

          // 执行多次随机查询来填充路由表
          for (let i = 0; i < 3; i++) {
            const randomKey = new Uint8Array(32)
            crypto.getRandomValues(randomKey)

            try {
              const peers = this.node.services.dht.getClosestPeers(randomKey)
              let count = 0
              for await (const peer of peers) {
                count++
                if (count >= 5) break // 限制查询数量
              }
              console.log(`DHT sync round ${i + 1}: found ${count} peers`)
            } catch (error) {
              console.debug(`DHT sync round ${i + 1} failed:`, error.message)
            }

            await new Promise(resolve => setTimeout(resolve, 2000)) // 等待2秒
          }
        }
      } catch (error) {
        console.error('DHT sync failed:', error)
      }
    }, 10000) // 启动后10秒开始同步

    setTimeout(async () => {
      await this.warmUpDHT()
    }, 5000)

    return this.node
  }

  async warmUpDHT() {
    try {
      console.log('Warming up DHT...')

      if (!this.node.services.dht) {
        console.warn('DHT service not available')
        return
      }

      // 执行多次随机查询来构建路由表
      for (let i = 0; i < 5; i++) {
        const randomKey = new Uint8Array(32)
        crypto.getRandomValues(randomKey)

        try {
          console.log(`DHT warmup round ${i + 1}/5`)
          const peers = this.node.services.dht.getClosestPeers(randomKey)

          let peerCount = 0
          for await (const peer of peers) {
            peerCount++
            if (peerCount >= 3) break
          }

          console.log(`Round ${i + 1}: contacted ${peerCount} peers`)
          await new Promise(resolve => setTimeout(resolve, 2000))

        } catch (error) {
          console.debug(`DHT warmup round ${i + 1} failed:`, error.message)
        }
      }

      // 刷新路由表
      await this.node.services.dht.refreshRoutingTable()
      console.log('✓ DHT warmup completed')

    } catch (error) {
      console.error('DHT warmup failed:', error)
    }
  }

  async stop() {
    if (this.node && this.isStarted) {
      try {
        await this.node.stop()
        this.isStarted = false
        console.log('Node stopped')
      } catch (error) {
        console.warn('Error stopping node:', error.message)
      }
    }
  }

  // 主动对等节点发现
  async discoverPeers() {
    try {
      console.log('Starting peer discovery...')

      // DHT对等节点发现
      const randomKey = new Uint8Array(32)
      crypto.getRandomValues(randomKey)

      let discoveredCount = 0
      for await (const peer of this.node.services.dht.getClosestPeers(randomKey)) {
        const peerId = peer.toString()

        // 跳过基础设施节点
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

        discoveredCount++
        if (discoveredCount >= 10) break // 限制发现数量
      }

      console.log(`Discovery completed: ${this.discoveredPeers.size} peers`)
    } catch (error) {
      console.error('Error during peer discovery:', error)
    }
  }

  // 连接到发现的对等节点，支持中继回退
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

      // 方法1：尝试直接连接
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

            if (peerInfo) {
              peerInfo.status = 'connected'
              peerInfo.connectedAt = Date.now()
              peerInfo.connectionType = 'direct'
            }
            this.connectionStats.directConnections++

            console.log(`Direct connection successful: ${peerId}`)
            connectionSuccessful = true
            break

          } catch (error) {
            console.log(`Direct connection failed via ${multiaddrStr}: ${error.message}`)
          }
        }
      }

      // 方法2：尝试中继连接
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
          }
        } catch (relayError) {
          console.log(`Relay connection failed: ${relayError.message}`)
        }
      }

      // 方法3：尝试对等节点ID直接拨号
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

  // 获取连接的对等节点（排除基础设施节点）
  getConnectedPeers() {
    if (!this.node) return []
    return this.node.getPeers().filter(peerId =>
      !this.isBootstrapPeer(peerId.toString()) &&
      !this.isRelayPeer(peerId.toString())
    )
  }

  // 获取发现的对等节点
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers).filter(peerId =>
      !this.isBootstrapPeer(peerId) && !this.isRelayPeer(peerId)
    )
  }

  // 获取增强的节点信息
  getNodeInfo() {
    if (!this.node) return null

    const connectedPeers = this.getConnectedPeers()
    const discoveredPeers = this.getDiscoveredPeers()
    const allConnections = this.node.getConnections()

    // 计算连接类型
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

  // 强制NAT检测
  async forceNATDetection() {
    console.log('Starting forced NAT detection...')
    try {
      await this.checkReachability()
      return this.reachability
    } catch (error) {
      console.error('NAT detection failed:', error)
      return 'unknown'
    }
  }

  // 刷新中继连接
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

        // 检查是否已经连接
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