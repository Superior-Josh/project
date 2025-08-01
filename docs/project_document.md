以下是你提供的中文项目文档的**英文翻译版本**，格式与原文一致，适合用于 GitHub / GitLab README 或提交英文报告。

---

# Web-Based Peer-to-Peer File Sharing System Based on Distributed Kademlia DHT - Initial Project Documentation

## 1. Project Overview

This project aims to implement a web-based peer-to-peer file sharing system using the distributed Kademlia DHT protocol. It provides decentralized file storage and retrieval services. Users can upload, search, and download files through a web interface. File metadata (such as hash values) are distributed across nodes using the Kademlia routing algorithm, enabling reliable and efficient file sharing.

---

## 2. Background & Objectives

Traditional centralized file sharing systems suffer from single points of failure, privacy risks, and high maintenance costs. The Kademlia protocol, a highly efficient implementation of distributed hash tables (DHT), is widely used in decentralized networks such as BitTorrent and IPFS.

Project objectives include:

* Provide a UI in the browser for file upload/search/download
* Implement node lookup and file location functionality based on Kademlia
* Simulate multiple nodes to construct a decentralized file-sharing architecture

---

## 3. Technology Stack

| Module        | Technology                        | Description                                     |
| ------------- | --------------------------------- | ----------------------------------------------- |
| Frontend      | React.js + CSS                    | Simple and user-friendly interface              |
| Core Backend  | JavaScript                        | Implements DHT node behavior and routing logic  |
| Networking    | WebSocket / TCP                   | Node communication (browser environment limits) |
| Storage       | IndexedDB / simulated local files | Simplifies deployment, no DB required           |
| File Handling | Browser File API / Blob           | Enables file upload, chunking, and download     |

Optionally, for CLI-based multi-node simulation, Python + asyncio may be used as a supplemental backend.

---

## 4. System Design Draft

* The system consists of multiple DHT nodes, each running locally (in development) or in browser/containers
* Each node maintains its own K-bucket routing table and supports node discovery, ping, store, find\_node, and find\_value messages
* The frontend connects to the local node and allows users to upload/query files via a web interface

Simplified module layout:

```
[Web UI Frontend] ──▶ [Local DHT Node Service] ◀──▶ [Other DHT Nodes]
                                ▲
                                │
                          File Metadata Routing
```

---

## 5. Initial Requirements

### Must-Have (MVP):

* Launch multiple independent nodes
* Implement basic operations: ping / store / find\_node / find\_value
* File upload: generate file hash and invoke `store` to save metadata
* File search: input hash to locate the corresponding node and download

### Optional:

* File chunking and replication across multiple nodes
* File transfer via WebRTC / WebSocket direct channels
* Node status visualization interface (for debugging)

---

## 6. Development Plan

| Week     | Tasks                                                                                 |
| -------- | ------------------------------------------------------------------------------------- |
| Week 1   | Requirement analysis, tech research, environment setup, initial docs                  |
| Week 2   | Implement basic frontend UI, connect to local node service, enable file upload/search |
| Week 3–4 | Implement core DHT protocol logic (ping/store/find) and node modules                  |
| Week 5   | Develop file transfer mechanism, support full upload/download                         |
| Week 6   | Multi-node testing, simulate node joining/leaving                                     |
| Week 7   | System optimization, error handling, visualization tools                              |
| Week 8   | Finalize documentation, prepare presentation materials, package and deploy code       |

---

## 7. References & Appendix

* *Kademlia: A Peer-to-Peer Information System Based on the XOR Metric*
* [https://github.com/libp2p/js-libp2p-kad-dht](https://github.com/libp2p/js-libp2p-kad-dht)
* WebRTC / WebSocket implementation documentation
* React + Vite development documentation

---
