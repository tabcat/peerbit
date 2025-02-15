const { startIpfs, stopIpfs, config } = require('@dao-xyz/peerbit-test-utils')
import { createLog } from './utils/create-log'
const Log = require('../src/log')

const base = {
  prepare: async function () {
    const ipfsd = await startIpfs('js-ipfs', config)
    const { log } = await createLog(ipfsd.api, 'A')

    process.stdout.clearLine(0)
    const entries: string[] = []
    for (let i = 1; i < this.count + 1; i++) {
      process.stdout.write(`\r${this.name} / Preparing / Writing: ${i}/${this.count}`)
      const entry = await log.append(`Hello World: ${i}`)
      entries.push(entry)
    }

    return { log, entries, ipfsd }
  },
  cycle: async function ({ log, entries }) {
    return Log.findHeads(entries)
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
  benchmarks.push({ id: `findHeads-${count}-baseline`, ...base, ...c, ...baseline })
  benchmarks.push({ id: `findHeads-${count}-stress`, ...base, ...c, ...stress })
}

export default benchmarks
