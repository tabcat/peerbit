
const IPFS = require('ipfs')
const IPFSRepo = require('ipfs-repo')
const DatastoreLevel = require('datastore-level')
const Log = require('../src/log')
import { IdentityProvider } from '@dao-xyz/orbit-db-identity-provider'
const Keystore = require('@dao-xyz/peerbit-keystore')

// State
let ipfs
let log

// Metrics
let totalQueries = 0
let seconds = 0
let queriesPerSecond = 0
let lastTenSeconds = 0

const queryLoop = async () => {
  await log.append(totalQueries.toString(), 1, false)
  totalQueries++
  lastTenSeconds++
  queriesPerSecond++
  setImmediate(queryLoop)
}

const run = (() => {
  console.log('Starting benchmark...')

  const repoConf = {
    storageBackends: {
      blocks: DatastoreLevel
    }
  }

  ipfs = new IPFS({
    repo: new IPFSRepo('./ipfs-log-benchmarks/ipfs', repoConf),
    start: false,
    EXPERIMENTAL: {
      pubsub: false,
      sharding: false,
      dht: false
    }
  })

  ipfs.on('error', (err) => {
    console.error(err)
  })

  ipfs.on('ready', async () => {
    // Use memory store to test without disk IO
    // const memstore = new MemStore()
    // ipfs.dag.put = memstore.put.bind(memstore)
    // ipfs.dag.get = memstore.get.bind(memstore)
    const keystore = new Keystore('./ipfs-log-benchmarks/keys/')
    const identity = await IdentityProvider.createIdentity({ id: 'userA', keystore })

    log = new Log(ipfs, identity, { gid: 'A' })

    // Output metrics at 1 second interval
    setInterval(() => {
      seconds++
      if (seconds % 10 === 0) {
        console.log(`--> Average of ${lastTenSeconds / 10} q/s in the last 10 seconds`)
        if (lastTenSeconds === 0) throw new Error('Problems!')
        lastTenSeconds = 0
      }
      console.log(`${queriesPerSecond} queries per second, ${totalQueries} queries in ${seconds} seconds (Entry count: ${log.values.length})`)
      queriesPerSecond = 0
    }, 1000)

    setImmediate(queryLoop)
  })
})()

module.exports = run
