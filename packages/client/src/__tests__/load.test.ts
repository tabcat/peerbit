
import assert from 'assert'
import mapSeries from 'p-map-series'
import rmrf from 'rimraf'
import path from 'path'
import { Address } from '@dao-xyz/peerbit-store'
import { Peerbit } from '../peer.js'
import { EventStore } from './utils/stores/event-store.js'
import { jest } from '@jest/globals';
import { Controller } from "ipfsd-ctl";
import { IPFS } from "ipfs-core-types";
// @ts-ignore
import { v4 as uuid } from 'uuid';

// Include test utilities
import {
  nodeConfig as config,
  startIpfs,
  stopIpfs
} from '@dao-xyz/peerbit-test-utils'
import { waitFor } from '@dao-xyz/peerbit-time'

const dbPath = './orbitdb/tests/persistency'

const tests = [
  {
    title: 'Persistency',
    type: undefined,
    orbitDBConfig: { directory: path.join(dbPath, '1') }
  }/* ,
  {
    title: 'Persistency with custom cache',
    type: "custom",
    orbitDBConfig: { directory: path.join(dbPath, '2') }
  } */
]
const API = 'js-ipfs';
const test = tests[0];
/* tests.forEach(test => {*/
describe(`orbit-db - load (js-ipfs)`, function () { //${test.title}
  jest.setTimeout(config.timeout)

  const entryCount = 10

  let ipfsd: Controller, ipfs: IPFS, orbitdb1: Peerbit, db: EventStore<string>, address: string

  beforeAll(async () => {
    const options: any = Object.assign({}, test.orbitDBConfig)
    rmrf.sync(dbPath)
    ipfsd = await startIpfs(API, config.daemon1)
    ipfs = ipfsd.api
    orbitdb1 = await Peerbit.create(ipfs, options)
  })

  afterAll(async () => {
    if (orbitdb1)
      await orbitdb1.stop()

    if (ipfsd)
      await stopIpfs(ipfsd)
  })

  describe('load', function () {
    beforeEach(async () => {
      const entryArr: number[] = []

      for (let i = 0; i < entryCount; i++)
        entryArr.push(i)

      db = await orbitdb1.open(new EventStore<string>({}), uuid())
      address = db.address.toString()
      await mapSeries(entryArr, (i) => db.add('hello' + i))
      await db.close()
      db = null as any
    })

    afterEach(async () => {
      await db?.drop()
    })

    it('loads database from local cache', async () => {
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
      await db.store.load()
      const items = db.iterator({ limit: -1 }).collect()
      expect(items.length).toEqual(entryCount)
      expect(items[0].payload.getValue().value).toEqual('hello0')
      expect(items[items.length - 1].payload.getValue().value).toEqual('hello' + (entryCount - 1))
    })

    it('loads database partially', async () => {
      const amount = 3
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
      await db.store.load(amount)
      const items = db.iterator({ limit: -1 }).collect()
      expect(items.length).toEqual(amount)
      expect(items[0].payload.getValue().value).toEqual('hello' + (entryCount - amount))
      expect(items[1].payload.getValue().value).toEqual('hello' + (entryCount - amount + 1))
      expect(items[items.length - 1].payload.getValue().value).toEqual('hello' + (entryCount - 1))
    })

    it('load and close several times', async () => {
      const amount = 8
      for (let i = 0; i < amount; i++) {
        db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
        await db.store.load()
        const items = db.iterator({ limit: -1 }).collect()
        expect(items.length).toEqual(entryCount)
        expect(items[0].payload.getValue().value).toEqual('hello0')
        expect(items[1].payload.getValue().value).toEqual('hello1')
        expect(items[items.length - 1].payload.getValue().value).toEqual('hello' + (entryCount - 1))
        await db.close()
      }
    })

    /* it('closes database while loading', async () => { TODO fix
      db = await orbitdb1.open(address, { type: EVENT_STORE_TYPE, replicationConcurrency: 1 })
      return new Promise(async (resolve, reject) => {
        // don't wait for load to finish
        db.store.load()
          .then(() => reject("Should not finish loading?"))
          .catch(e => {
            if (e.toString() !== 'ReadError: Database is not open') {
              reject(e)
            } else {
              expect(db._cache._store).toEqual( null)
              resolve(true)
            }
          })
        await db.close()
      })
    }) */

    it('load, add one, close - several times', async () => {
      const amount = 8
      for (let i = 0; i < amount; i++) {
        db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
        await db.store.load()
        await db.add('hello' + (entryCount + i))
        const items = db.iterator({ limit: -1 }).collect()
        expect(items.length).toEqual(entryCount + i + 1)
        expect(items[items.length - 1].payload.getValue().value).toEqual('hello' + (entryCount + i))
        await db.close()
      }
    })

    it('loading a database emits \'ready\' event', async () => {
      let done = false;
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), {
        replicationTopic: uuid(),
        onReady: (store) => {
          const items = db.iterator({ limit: -1 }).collect()
          expect(items.length).toEqual(entryCount)
          expect(items[0].payload.getValue().value).toEqual('hello0')
          expect(items[items.length - 1].payload.getValue().value).toEqual('hello' + (entryCount - 1))
          done = true;
        }
      })
      await db.store.load()
      await waitFor(() => done);
    })

    it('loading a database emits \'load.progress\' event', async () => {
      let count = 0
      let done = false;
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), {
        replicationTopic: uuid(),
        onLoadProgress: (store, entry) => {
          count++
          expect(address).toEqual(db.address.toString())

          const { progress, max } = db.store.replicationStatus
          expect(max).toEqual(BigInt(entryCount))
          expect(progress).toEqual(BigInt(count))

          assert.notEqual(entry.hash, null)
          assert.notEqual(entry, null)

          if (progress === BigInt(entryCount) && count === entryCount) {
            setTimeout(() => {
              done = true;
            }, 200)
          }
        }
      })
      await db.store.load()
      await waitFor(() => done)
    })
  })

  describe('load from empty snapshot', function () {
    it('loads database from an empty snapshot', async () => {
      db = await orbitdb1.open(new EventStore<string>({}), uuid())
      address = db.address.toString()
      await db.store.saveSnapshot()
      await db.close()

      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
      await db.store.loadFromSnapshot()
      const items = db.iterator({ limit: -1 }).collect()
      expect(items.length).toEqual(0)
    })
  })

  describe('load from snapshot', function () {
    beforeEach(async () => {
      const entryArr: number[] = []

      for (let i = 0; i < entryCount; i++)
        entryArr.push(i)

      db = await orbitdb1.open(new EventStore<string>({}), uuid())
      address = db.address.toString()
      await mapSeries(entryArr, (i) => db.add('hello' + i))
      await db.store.saveSnapshot()
      await db.close()
      db = null as any
    })

    afterEach(async () => {
      await db?.drop()
    })

    it('loads database from snapshot', async () => {
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
      await db.store.loadFromSnapshot()
      const items = db.iterator({ limit: -1 }).collect()
      expect(items.length).toEqual(entryCount)
      expect(items[0].payload.getValue().value).toEqual('hello0')
      expect(items[entryCount - 1].payload.getValue().value).toEqual('hello' + (entryCount - 1))
    })

    it('load, add one and save snapshot several times', async () => {
      const amount = 4
      for (let i = 0; i < amount; i++) {
        db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
        await db.store.loadFromSnapshot()
        await db.add('hello' + (entryCount + i))
        const items = db.iterator({ limit: -1 }).collect()
        expect(items.length).toEqual(entryCount + i + 1)
        expect(items[0].payload.getValue().value).toEqual('hello0')
        expect(items[items.length - 1].payload.getValue().value).toEqual('hello' + (entryCount + i))
        await db.store.saveSnapshot()
        await db.close()
      }
    })

    it('throws an error when trying to load a missing snapshot', async () => {
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())
      await db.drop()
      db = null as any
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), uuid())

      let err
      try {
        await db.store.loadFromSnapshot()
      } catch (e: any) {
        err = e.toString()
      }
      expect(err).toEqual(`Error: Snapshot for ${db.store.address} not found!`)
    })

    it('loading a database emits \'ready\' event', async () => {
      let done = false;
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), {
        replicationTopic: uuid(),
        onReady: (store) => {
          const items = db.iterator({ limit: -1 }).collect()
          expect(items.length).toEqual(entryCount)
          expect(items[0].payload.getValue().value).toEqual('hello0')
          expect(items[entryCount - 1].payload.getValue().value).toEqual('hello' + (entryCount - 1))
          done = true
        }
      })
      await db.store.loadFromSnapshot()
      await waitFor(() => done);
    })

    it('loading a database emits \'load.progress\' event', async () => {
      let done = false;
      let count = 0;
      db = await orbitdb1.open(await EventStore.load<EventStore<string>>(orbitdb1._ipfs, Address.parse(address)), {
        replicationTopic: uuid(),
        onLoadProgress: (store, entry) => {
          count++
          expect(address).toEqual(db.address.toString())
          const { progress, max } = db.store.replicationStatus
          expect(max).toEqual(BigInt(entryCount))
          expect(progress).toEqual(BigInt(count))

          assert.notEqual(entry.hash, null)
          assert.notEqual(entry, null)
          if (progress === BigInt(entryCount) && count === entryCount) {
            done = true;
          }
        }
      })
      await db.store.loadFromSnapshot()
      await waitFor(() => done);
    })
  })
})
/* }) */
