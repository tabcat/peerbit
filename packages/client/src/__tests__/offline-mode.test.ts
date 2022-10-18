import assert from 'assert'
import rmrf from 'rimraf'
import { OrbitDB } from "../orbit-db"

// Include test utilities
import {
  nodeConfig as config,
  startIpfs,
  stopIpfs,
  testAPIs,
} from '@dao-xyz/orbit-db-test-utils'
const dbPath1 = './orbitdb/tests/offline/db1'
const dbPath2 = './orbitdb/tests/offline/db2'

Object.keys(testAPIs).forEach(API => {
  describe(`orbit-db - Offline mode (${API})`, function () {
    /*  TODO add support for offlien mode
    
    jest.setTimeout(config.timeout)
 
     let ipfsd1: Controller, ipfsd2: Controller, ipfs1: IPFS, ipfs2: IPFS, orbitdb: OrbitDB
 
     beforeAll(async () => {
       rmrf.sync(dbPath1)
       rmrf.sync(dbPath2)
       ipfsd1 = await startIpfs(API, config.daemon1)
       ipfsd2 = await startIpfs(API, config.daemon2)
       ipfs1 = ipfsd1.api
       ipfs2 = ipfsd2.api
     })
 
     afterAll(async () => {
       if (orbitdb)
         await orbitdb.stop()
 
       if (ipfsd1)
         await stopIpfs(ipfsd1)
       if (ipfsd2)
         await stopIpfs(ipfsd2)
     })
 
     beforeEach(() => {
       rmrf.sync(dbPath1)
       rmrf.sync(dbPath2)
     })
 
     it('starts in offline mode', async () => {
       orbitdb = await OrbitDB.createInstance(ipfs1, { id: 'A', offline: true, directory: dbPath1 })
       expect(orbitdb._pubsub).toEqual(null)
       await orbitdb.stop()
     })
 
     it('does not start in offline mode', async () => { TODO add offline mode
         orbitdb = await OrbitDB.createInstance(ipfs1, { offline: false, directory: dbPath1 })
         assert.notEqual(orbitdb._pubsub, null)
         await orbitdb.stop()
       })
    
 
     it('does not start in offline mode - default', async () => {
       orbitdb = await OrbitDB.createInstance(ipfs1, { directory: dbPath1 })
       assert.notEqual(orbitdb._pubsub, null)
       await orbitdb.stop()
     })
 
     it('throws error if no `id` passed in offline mode', async () => {
       let err
       try {
         orbitdb = await OrbitDB.createInstance(ipfs1, { offline: true, directory: dbPath1 })
       } catch (e: any) {
         err = e.message
       }
       expect(err).toEqual('Offline mode requires passing an `id` in the options')
       await orbitdb.stop()
     }) */
  })
})
