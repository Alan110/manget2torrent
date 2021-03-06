'use strict'

const dgram = require('dgram')
const Emiter = require('events')
const bencode = require('bencode')
const { Table, Node } = require('./table')
const Token = require('./token')

const bootstraps = [{
    address: 'router.bittorrent.com',
    port: 6881
}, {
    address: 'dht.transmissionbt.com',
    port: 6881
}]

function isValidPort(port) {
    return port > 0 && port < (1 << 16)
}

function generateTid() {
    return parseInt(Math.random() * 99).toString()
}

class Spider extends Emiter {
    constructor() {
        super()
        const options = arguments.length ? arguments[0] : {}
        this.table = new Table(options.tableCaption || 600)
        this.bootstraps = options.bootstraps || bootstraps
        this.token = new Token()
        this.walkTimeout = null
        this.joinInterval = null
    }

    send(message, address) {
        const data = bencode.encode(message)
        this.udp.send(data, 0, data.length, address.port, address.address)
    }

    findNode(id, address) {
        const message = {
            t: generateTid(),
            y: 'q',
            q: 'find_node',
            a: {
                id: id,
                target: Node.generateID()
            }
        }
        this.send(message, address)
    }

    /**
     * 尝试加入到dht网络，从公共dht网络节点获取信息
     */
    join() {
        this.bootstraps.forEach((b) => {
            this.findNode(this.table.id, b)
        })
    }

    /**
     * 漫游自己的路由表查找node节点
     */
    walk() {
        const node = this.table.shift()
        const nodes = this.table.getnodes()
        if (node) {
            this.findNode(Node.neighbor(node.id, this.table.id), { address: node.address, port: node.port })
        }
        this.walkTimeout = setTimeout(
            () => {
                if (nodes.length < 1000) {
                    this.walk()
                }
            }, 200)
    }

    onFoundNodes(data) {
        const nodes = Node.decodeNodes(data)
        nodes.forEach((node) => {
            if (node.id != this.table.id && isValidPort(node.port)) {
                this.table.add(node)
            }
        })
        this.emit('nodes', nodes)
    }

    onFindNodeRequest(message, address) {
        const { t: tid, a: { id: nid, target: infohash } } = message

        if (tid === undefined || target.length != 20 || nid.length != 20) {
            return
        }
        this.send({
            t: tid,
            y: 'r',
            r: {
                id: Node.neighbor(nid, this.table.id),
                nodes: Node.encodeNodes(this.table.first())
            }
        }, address)
    }

    onGetPeersRequest(message, address) {
        const { t: tid, a: { id: nid, info_hash: infohash } } = message

        if (tid === undefined || infohash.length != 20 || nid.length != 20) {
            return
        }

        this.send({
            t: tid,
            y: 'r',
            r: {
                id: Node.neighbor(nid, this.table.id),
                nodes: Node.encodeNodes(this.table.first()),
                token: this.token.token
            }
        }, address)

        this.emit('unensureHash', infohash.toString('hex').toUpperCase())
    }

    onAnnouncePeerRequest(message, address) {
        let { t: tid, a: { info_hash: infohash, token: token, id: id, implied_port: implied, port: port } } = message
        if (!tid) return

        if (!this.token.isValid(token)) return

        port = (implied != undefined && implied != 0) ? address.port : (port || 0)
        if (!isValidPort(port)) return

        this.send({ t: tid, y: 'r', r: { id: Node.neighbor(id, this.table.id) } }, address)

        this.emit('ensureHash', infohash.toString('hex').toUpperCase(), {
            address: address.address,
            port: port
        })
    }

    onPingRequest(message, addr) {
        this.send({ t: message.t, y: 'r', r: { id: Node.neighbor(message.a.id, this.table.id) } })
    }

    /**
     * 解析从dht网络接收到的消息
     * @param {*} data 
     * @param {*} address 
     */
    parse(data, address) {
        try {
            const message = bencode.decode(data)
            if (message.y.toString() == 'r' && message.r.nodes) {
                this.onFoundNodes(message.r.nodes)
            } else if (message.y.toString() == 'q') {
                switch (message.q.toString()) {
                    case 'get_peers':
                        this.onGetPeersRequest(message, address)
                        break
                    case 'announce_peer':
                        this.onAnnouncePeerRequest(message, address)
                        break
                    case 'find_node':
                        this.onFindNodeRequest(message, address)
                    case 'ping':
                        this.onPingRequest(message, address)
                        break
                }
            }
        } catch (err) { }
    }
    destroy() {
        this.walkTimeout && clearTimeout(this.walkTimeout)
        this.joinInterval && clearInterval(this.joinInterval)
        this.udp.close()
    }
    RandomNum(Min, Max) {
        var Range = Max - Min;
        var Rand = Math.random();
        if (Math.round(Rand * Range) == 0) {
            return Min + 1;
        }
        var num = Min + Math.round(Rand * Range);
        return num;
    }

    /**
     * 开始监听dht网络
     */
    listen() {
        this.udp = dgram.createSocket('udp4')
        var port = this.RandomNum(4001, 4049)

        this.udp.bind(port)
        this.udp.on('listening', () => {
            console.log(`Listen on ${this.udp.address().address}:${this.udp.address().port}`)
        })
        this.udp.on('message', (data, addr) => {
            // console.log('接收到消息from:', addr)
            this.parse(data, addr)
        })
        this.udp.on('error', (err) => {
            console.log(err)
        })
        this.joinInterval = setInterval(() => this.join(), 3000)
        this.join()
        this.walk()
    }
}

module.exports = Spider