
import { Peerbit } from "../peer"

import { EventStore } from "./utils/stores/event-store"
import { KeyValueStore } from "./utils/stores/key-value-store"
import assert from 'assert'
import mapSeries from 'p-each-series'
import rmrf from 'rimraf'
import { jest } from '@jest/globals';
// @ts-ignore
import { v4 as uuid } from 'uuid';
// Include test utilities
import {
  nodeConfig as config,
  testAPIs,
  Session
} from '@dao-xyz/peerbit-test-utils'
import { waitFor } from "@dao-xyz/peerbit-time"

const dbPath1 = './orbitdb/tests/replicate-automatically/1'
const dbPath2 = './orbitdb/tests/replicate-automatically/2'
const dbPath3 = './orbitdb/tests/replicate-automatically/3'
const dbPath4 = './orbitdb/tests/replicate-automatically/4'

Object.keys(testAPIs).forEach(API => {
  describe(`orbit-db - Automatic Replication (${API})`, function () {
    jest.setTimeout(config.timeout * 14)

    /*  let ipfsd1: Controller, ipfsd2: Controller, ipfsd3: Controller, ipfsd4: Controller, ipfs1: IPFS, ipfs2: IPFS, ipfs3: IPFS, ipfs4: IPFS */
    let orbitdb1: Peerbit, orbitdb2: Peerbit, orbitdb3: Peerbit, orbitdb4: Peerbit
    let session: Session;
    beforeAll(async () => {
      rmrf.sync('./orbitdb')
      rmrf.sync(dbPath1)
      rmrf.sync(dbPath2)
      rmrf.sync(dbPath3)
      rmrf.sync(dbPath4)
      session = await Session.connected(2, API);
      orbitdb1 = await Peerbit.create(session.peers[0].ipfs, { directory: dbPath1 })
      orbitdb2 = await Peerbit.create(session.peers[1].ipfs, { directory: dbPath2 })
      /*    ipfsd1 = await startIpfs(API, config.daemon1)
         ipfsd2 = await startIpfs(API, config.daemon2)
         ipfsd3 = await startIpfs(API, config.daemon2)
         ipfsd4 = await startIpfs(API, config.daemon2)
   
         ipfs1 = ipfsd1.api
         ipfs2 = ipfsd2.api
         ipfs3 = ipfsd3.api
         ipfs4 = ipfsd4.api */


    })

    afterAll(async () => {

      if (orbitdb1) {
        await orbitdb1.stop()
      }
      if (orbitdb2) {
        await orbitdb2.stop()
      }
      if (orbitdb3) {
        await orbitdb3.stop()
      }
      if (orbitdb4) {
        await orbitdb4.stop()
      }

      await session.stop();
      rmrf.sync(dbPath1)
      rmrf.sync(dbPath2)
      rmrf.sync(dbPath3)
      rmrf.sync(dbPath4)

    })

    it('starts replicating the database when peers connect', async () => {

      const entryCount = 33
      const entryArr: number[] = []

      const replicationTopic = uuid();

      const db1 = await orbitdb1.open(new EventStore<string>({ id: 'replicate-automatically-tests' }), { replicationTopic })

      const db3 = await orbitdb1.open(new KeyValueStore<string>({ id: 'replicate-automatically-tests-kv' }), {
        replicationTopic,
        onReplicationComplete: (_) => {
          fail();
        }
      })

      // Create the entries in the first database
      for (let i = 0; i < entryCount; i++) {
        entryArr.push(i)
      }

      await mapSeries(entryArr, (i) => db1.add('hello' + i))

      // Open the second database
      let done = false
      const db2 = await orbitdb2.open<EventStore<string>>(await EventStore.load<EventStore<string>>(orbitdb2._ipfs, db1.address), {
        replicationTopic,
        onReplicationComplete: (_) => {
          // Listen for the 'replicated' events and check that all the entries
          // were replicated to the second database
          expect(db2.iterator({ limit: -1 }).collect().length).toEqual(entryCount)
          const result1 = db1.iterator({ limit: -1 }).collect()
          const result2 = db2.iterator({ limit: -1 }).collect()
          expect(result1.length).toEqual(result2.length)
          for (let i = 0; i < result1.length; i++) {
            assert(result1[i].equals(result2[i]))
          }
          done = true;
        }
      })

      const _db4 = await orbitdb2.open<KeyValueStore<string>>(await KeyValueStore.load<KeyValueStore<string>>(orbitdb2._ipfs, db3.address), {
        replicationTopic,
        onReplicationComplete: (_) => {
          fail();
        }
      })

      await waitFor(() => done);
    })

    it('starts replicating the database when peers connect in write mode', async () => {

      const entryCount = 1
      const entryArr: number[] = []

      const replicationTopic = uuid();

      const db1 = await orbitdb1.open(new EventStore<string>({ id: 'replicate-automatically-tests' }), { replicationTopic, replicate: false })

      // Create the entries in the first database
      for (let i = 0; i < entryCount; i++) {
        entryArr.push(i)
      }

      await mapSeries(entryArr, (i) => db1.add('hello' + i))

      // Open the second database
      let done = false
      const db2 = await orbitdb2.open<EventStore<string>>(await EventStore.load<EventStore<string>>(orbitdb2._ipfs, db1.address), {
        replicationTopic,
        onReplicationComplete: (_) => {
          // Listen for the 'replicated' events and check that all the entries
          // were replicated to the second database
          expect(db2.iterator({ limit: -1 }).collect().length).toEqual(entryCount)
          const result1 = db1.iterator({ limit: -1 }).collect()
          const result2 = db2.iterator({ limit: -1 }).collect()
          expect(result1.length).toEqual(result2.length)
          for (let i = 0; i < result1.length; i++) {
            assert(result1[i].equals(result2[i]))
          }
          done = true;
        }
      })

      await waitFor(() => done);
    })
  })
})