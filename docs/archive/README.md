## 一、系统核心组件与职责

1. **Peer-Node（后台守护进程）**
   - **加入网络**：启动后通过已知引导节点（bootstrap peers）加入 DHT 网络，获取初始路由表。
   - **DHT 服务**：负责存储和查询 `(Key → Value)`，其中 Key 是内容哈希（CID），Value 是提供该内容的节点列表。
   - **文件存储**：管理本地文件分片（chunks），包括切片、加密、哈希和持久化。
   - **网络通信**：接收／发起 TCP/WebSocket 连接，进行 NAT 穿越（STUN/TURN）以打通私网节点。
   - **安全模块**：处理加密握手（公钥交换、TLS/Noise）、数据加解密和块完整性校验（SHA-256 或 Merkle Tree）。
2. **Web Client（前端界面）**
   - **用户交互**：提供文件选择、分享、搜索和下载界面；展示下载进度、在线节点列表。
   - **通信桥梁**：通过本地 WebSocket（或 HTTP+WebSocket 协议）与本机的 Peer-Node 交互，提交命令和接收状态更新。
3. **DHT 网络**
   - **分布式哈希表**：所有 Peer-Node 共同维护一个去中心化的 `(CID → [NodeID,...])` 索引。
   - **路由查找**：每次查询 Key 时，按照 Kademlia 算法跳转到“离目标 ID”更近的节点，复杂度约 O(log N)。
4. **存储与复制**
   - **Chunk 切分**：每个文件分为固定大小（如 1 MB）的小块。
   - **副本策略**：将文件块复制到 K 个最可靠节点（按 uptime、带宽评分）或使用纠删码（n,k）分发到若干节点。
   - **健康检测**：节点定期 ping 已知副本，若副本离线则触发自动重复制。

------

## 二、运行逻辑流程

以下以用户 A 上传并分享一个 5 MB 的文件 “report.pdf” 为例，演示背后关键流程。

### 1. 节点启动与网络加入

- A 在本机运行 Peer-Node，配置了若干 “bootstrap” 节点地址。
- Peer-Node 发起握手（TCP 或 UDP）到这些引导节点，获取初始路由表条目。
- 完成 DHT 网络的 “JOIN” 操作，开始对外提供路由和存储服务。

### 2. 文件切分、加密与发布

1. **切分与哈希**
   - 将 report.pdf 分为 5 个 1 MB 块：Chunk₁…Chunk₅。
   - 对每个块计算 SHA-256，得出 hash₁…hash₅。
   - 组合成 Merkle Tree，根哈希即为文件的 CID（例如 `CID = 0xA1B2C3…`）。
2. **加密与存储**
   - 为本次会话生成对称密钥 K，使用公钥加密将 K 共享给可信节点。
   - 对每个 Chunk 用 K 加密后存储到本地磁盘。
3. **DHT 发布**
   - 针对 CID 及每个 hashᵢ，Peer-Node 在 DHT 中调用 `STORE(CID → NodeA)` 及 `STORE(hashᵢ → NodeA)`。
   - DHT 会将这些 `(Key, Value)` 对存到距离对应 Key 最近的若干节点上。

### 3. 其他节点的查找与下载

用户 B 想下载 report.pdf：

1. **输入或粘贴 CID**

   - 前端将 CID 发给本地 Peer-Node。

2. **DHT 查询**

   - Peer-Node 发起 `FIND_VALUE(CID)`，沿着 Kademlia 路由跳转：

     ```
     NodeB → NodeX → NodeY → NodeZ（负责保存CID信息）
     ```

   - NodeZ 返回 `[NodeA, NodeC, NodeD]`，代表可以从这些节点下载。

3. **块列表与元数据获取**

   - B 的节点向 NodeZ 请求 Merkle Tree 元数据，获取 chunk 列表 hash₁…hash₅ 及加密信息。

4. **并行下载**

   - 节点 B 同时向 NodeA、NodeC、NodeD 发起连接：
     - 下载 hash₁、hash₃ 从 NodeA
     - hash₂、hash₄ 从 NodeC
     - hash₅ 从 NodeD
   - 每次下载先做 TLS/Noise 握手，再用对称密钥 K 解密，最后通过 SHA-256 校验块完整性。

5. **重组与呈现**

   - B 的节点将 5 块按照原序合并，生成完整的 report.pdf。
   - 前端收到“下载完成”事件，提供打开或保存按钮。

### 4. 高可用与复制维护

- B 下载完毕后，也会在本地 `STORE(hashᵢ → NodeB)`，成为新的副本。
- 每隔 Δt（如 1 小时），节点 A、C、D、B 相互 Ping，如果发现某副本离线，触发从剩余副本自动复制新的副本到健康节点，保证总副本数 ≥ K。

------

## 三、示例小结

| 阶段     | 参与者       | 动作描述                                           |
| -------- | ------------ | -------------------------------------------------- |
| 启动     | NodeA        | 加入 DHT 网络，构建路由表                          |
| 发布     | NodeA        | 切分 + 哈希 → 生成 CID；加密 → 本地存储；STORE→DHT |
| 查找     | NodeB        | FIND_VALUE(CID) → 返回 `[NodeA,C,D]`               |
| 下载     | NodeB, A/C/D | 并行 TLS+下载 → 解密 → 校验 → 合并                 |
| 复制维护 | A/B/C/D      | 周期 ping → 缺失时自动补副本                       |

通过以上流程，系统能够在**无中心化服务器**的前提下，实现文件的安全存储、快速发现和高可用下载。每个节点既是“客户端”也是“小型服务器”，真正体现了 P2P 的去中心化设计。



## 四、文件

### 1. 文档 (`docs/`)

| 文件名            | 类型 | 内容简介                             | 语言/格式 |
| ----------------- | ---- | ------------------------------------ | --------- |
| `architecture.md` | 文档 | 系统总体架构图（组件、流程）         | Markdown  |
| `protocol.md`     | 文档 | P2P 协议流程、消息格式、DHT 算法细节 | Markdown  |
| `security.md`     | 文档 | 加密、签名、认证方案                 | Markdown  |
| `README.md`       | 文档 | 文档索引 & 快速上手                  | Markdown  |

------

### 2. 后端 (`server/`)

- **语言**：Node.js（JavaScript/TypeScript） 或 Go
- **主要文件与目录**：

```
server/
├── src/
│   ├── dht/
│   │   └── kademlia.js            # Kademlia DHT 实现 (TS: kademlia.ts)
│   ├── storage/
│   │   ├── chunkManager.js        # 分片存储、检索逻辑
│   │   └── fileIndex.js           # 本地文件元数据管理
│   ├── network/
│   │   ├── tcpServer.js           # TCP 连接管理
│   │   ├── websocketServer.js     # WebSocket API
│   │   └── natTraversal.js        # STUN/TURN 支持
│   ├── security/
│   │   ├── crypto.js              # 对称／非对称加密、签名
│   │   └── integrity.js           # 哈希校验 (SHA-256)
│   └── index.js                   # 应用入口 (TS: index.ts)
│
├── config/
│   ├── default.json               # 默认参数
│   └── production.json            # 生产环境参数
│
├── scripts/
│   ├── start.sh                   # 启动脚本
│   └── migrate.sh                 # 初始配置/索引生成
│
└── tests/
    ├── unit/                      # Jest 单元测试
    └── integration/               # 与前端/网络模拟的集成测试
```

- **推荐技术**：
  - Node.js + TypeScript
  - WebSocket (`ws`)、`net` 模块
  - 加密：`crypto`（内置）或 `libsodium`
  - 测试：Jest + Supertest

------

### 3. 前端 (`client/`)

- **语言/框架**：React + TypeScript
- **主要文件与目录**：

```
client/
├── public/
│   └── index.html                # 单页应用模板
│
├── src/
│   ├── components/
│   │   ├── FileList.tsx          # 文件列表视图
│   │   ├── UploadForm.tsx        # 文件上传组件
│   │   ├── DownloadProgress.tsx  # 下载进度条
│   │   └── PeerStatus.tsx        # Peers 在线状态展示
│   │
│   ├── services/
│   │   ├── api.ts                # REST / WS 请求封装
│   │   └── dhtClient.ts          # DHT 查询封装
│   │
│   ├── store/
│   │   └── index.ts              # Redux Toolkit 状态管理
│   │
│   ├── styles/
│   │   └── globals.css           # 全局样式
│   │
│   └── index.tsx                 # 前端入口
│
├── config/
│   └── vite.config.ts            # Vite 打包配置
│
└── tests/
    └── component/                # React Testing Library 测试
```

- **推荐技术**：
  - React + Vite + TypeScript
  - 状态管理：Redux Toolkit 或 Zustand
  - WebSocket 客户端：`socket.io-client` 或原生 `WebSocket`
  - 测试：React Testing Library + Jest

------

### 4. 部署与容器化 (`docker-compose.yml` / `Dockerfile`)

- **`Dockerfile`（后端镜像）**
  - 基于 `node:18-alpine` 或 `golang:1.20-alpine`
  - 拷贝 `server/`，安装依赖，暴露端口 `3000`
- **`docker-compose.yml`**
  - 定义 `server` 和 `client` 服务
  - 配置网络与环境变量
  - 可选：Redis/MongoDB 服务（如做扩展索引或会话存储）

------

### 5. 环境配置

- **`.env.example`**

  ```dotenv
  SERVER_PORT=3000
  DHT_K=20
  DHT_ALPHA=3
  JWT_SECRET=your-jwt-secret
  ```

- **实际环境变量** 放在 `.env`（不提交到版本库）

------

### 6. 脚本 (`scripts/`)

| 脚本                       | 作用                           | 语言/命令 |
| -------------------------- | ------------------------------ | --------- |
| `scripts/start.sh`         | 后端启动（读取 env，启动服务） | Bash      |
| `scripts/deploy/deploy.sh` | CI/CD 自动构建 & 部署          | Bash      |

------

通过这个结构和技术选型，团队成员能够快速定位代码职责，各部分职责单一，易于协作与测试。祝项目顺利推进！