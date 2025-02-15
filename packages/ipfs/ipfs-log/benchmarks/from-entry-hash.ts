const { startIpfs, stopIpfs, config } = require('@dao-xyz/peerbit-test-utils')
import { createLog } from './utils/create-log'
const Log = require('../src/log')

const base = {
  prepare: async function () {
    const ipfsd = await startIpfs('js-ipfs', config)
    const { log, access, identity } = await createLog(ipfsd.api, 'A')
    const refCount = 64
    process.stdout.clearLine(0)
    for (let i = 1; i < this.count + 1; i++) {
      process.stdout.write(`\r${this.name} / Preparing / Writing: ${i}/${this.count}`)
      await log.append('hello' + i, refCount)
    }
    return { ipfsd, log, access, identity }
  },
  cycle: async function ({ log, ipfsd, access, identity }) {
    await Log.fromEntryHash(ipfsd.api, identity, log.heads.map(e => e.hash), {
      access,
      gid: log._id
    })
  },
  teardown: async function ({ ipfsd }) {
    await stopIpfs(ipfsd)
  }
}

const baseline = {
  while: ({ stats, startTime, baselineLimit }) => {
    return stats.count < baselineLimit
  }
}

const stress = {
  while: ({ stats, startTime, stressLimit }) => {
    return process.hrtime(startTime)[0] < stressLimit
  }
}

const counts = [1, 100, 1000]
const benchmarks: any[] = []
for (const count of counts) {
  const c = { count }
  if (count < 1000) benchmarks.push({ id: `fromEntryHash-${count}-baseline`, ...base, ...c, ...baseline })
  benchmarks.push({ id: `fromEntryHash-${count}-stress`, ...base, ...c, ...stress })
}

export default benchmarks
