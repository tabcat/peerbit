
import assert from 'assert'
import fs from 'fs-extra'
import path from 'path'
import rmrf from 'rimraf'
// @ts-ignore
import Zip from 'adm-zip'
import { OrbitDB } from '../orbit-db'
import { KeyValueStore } from './utils/stores/key-value-store'
import io from '@dao-xyz/io-utils'

import { Address, Store } from '@dao-xyz/peerbit-dstore'
import { EventStore } from './utils/stores'

// @ts-ignore 
import { v4 as uuid } from 'uuid';
import { jest } from '@jest/globals';
import { Controller } from "ipfsd-ctl";
import { IPFS } from "ipfs-core-types";


// Include test utilities
import {
  nodeConfig as config,
  startIpfs,
  stopIpfs,
  testAPIs,
} from '@dao-xyz/orbit-db-test-utils'

const dbPath = path.join('./orbitdb', 'tests', 'create-open')
const migrationFixturePath = path.join('./packages/orbit-db/src/__tests__', 'fixtures', 'migration', 'cache-schema-test')
const ipfsFixturesDir = path.join('./packages/orbit-db/src/__tests__', 'fixtures', 'ipfs')

Object.keys(testAPIs).forEach(API => {
  describe(`orbit-db - Create & Open (${API})`, function () {
    let ipfsFixtures = path.join('./packages/orbit-db/src/__tests__', 'fixtures', `${API}.zip`)

    jest.retryTimes(1) // windows...
    jest.setTimeout(config.timeout)

    let ipfsd: Controller, ipfs: IPFS, orbitdb: OrbitDB, address
    let localDataPath: string
    let replicationTopic: string

    const filterFunc = (src: string, dest: string) => {
      // windows has problems copying these files...
      return !(src.includes('LOG') || src.includes('LOCK'))
    }

    beforeAll(async () => {
      rmrf.sync(dbPath)
      ipfsd = await startIpfs(API, config.daemon1)
      ipfs = ipfsd.api
      replicationTopic = uuid();

      const zip = new Zip(ipfsFixtures)
      await zip.extractAllToAsync(path.join('./packages/orbit-db/src/__tests__', 'fixtures'), true)
      await fs.copy(path.join(ipfsFixturesDir, 'blocks'), path.join(ipfsd.path, 'blocks'))
      await fs.copy(path.join(ipfsFixturesDir, 'datastore'), path.join(ipfsd.path, 'datastore'), { filter: filterFunc })
      orbitdb = await OrbitDB.createInstance(ipfs, { directory: dbPath })
    })

    afterAll(async () => {
      if (orbitdb)
        await orbitdb.stop()

      if (ipfsd)
        await stopIpfs(ipfsd)

      rmrf.sync(ipfsFixturesDir)
    })

    describe('Create', function () {
      describe('Errors', function () {




        it('throws an error if database already exists', async () => {
          let err, db: any
          const replicationTopic = uuid();
          try {
            db = await orbitdb.open(new EventStore({ name: 'first' }), replicationTopic
              , { replicate: false })
            await orbitdb.open(new EventStore({ name: 'first' })
              , replicationTopic, { replicate: false })
          } catch (e: any) {
            err = e.toString()
          }
          expect(err).toEqual(`Error: Database '${db.address}' already exists!`)
          await db.close()
        })

      })

      describe('Success', function () {
        let db: KeyValueStore<string>;

        beforeAll(async () => {
          db = await orbitdb.open(new KeyValueStore<string>({ name: 'second' }), uuid()
            , { replicate: false })
          localDataPath = path.join(dbPath, orbitdb.id.toString(), 'cache')
          await db.close()
        })

        it('creates a feed database', async () => {
          assert.notEqual(db, null)
        })

        it('database has the correct address', async () => {
          assert.equal(db.address.toString().indexOf('/orbitdb'), 0)
          assert.equal(db.address.toString().indexOf('zd'), 9)
          assert.equal(db.address.toString().indexOf('second'), 59)
        })

        it('saves the database locally', async () => {
          expect(fs.existsSync(localDataPath)).toEqual(true)
        })

        it('saves database manifest reference locally', async () => {
          const address = db.id
          const manifestHash = address.split('/')[2]
          await db._cache._store.open()
          const value = await db._cache.get(path.join(address, '/_manifest'))
          expect(value).toEqual(manifestHash)
        })

        it('saves database manifest file locally', async () => {
          const manifestHash = db.id.split('/')[2]
          const manifest = await io.read(ipfs, manifestHash)
          assert.notEqual(manifest, false)
          expect(manifest.name).toEqual('second')
          assert.notEqual(manifest.accessController, null)
          assert.equal(manifest.accessController.indexOf('/ipfs'), 0)
        })

        it('can pass local database directory as an option', async () => {
          const dir = './orbitdb/tests/another-feed'
          const db2 = await orbitdb.open(new EventStore({ name: 'third' }), uuid()
            , { directory: dir })
          expect(fs.existsSync(dir)).toEqual(true)
          await db2.close()
        })

      })
    })

    describe('Open', function () {

      it('opens a database - name only', async () => {
        const db = await orbitdb.open(new EventStore({ name: 'abc' }), replicationTopic, {})
        assert.equal(db.address.toString().indexOf('/orbitdb'), 0)
        assert.equal(db.address.toString().indexOf('zd'), 9)
        assert.equal(db.address.toString().indexOf('abc'), 59)
        await db.drop()
      })

      it('opens a database - with a different identity', async () => {
        const signKey = await orbitdb.keystore.createEd25519Key({ id: new Uint8Array([0]) });
        const db = await orbitdb.open(new EventStore({ name: 'abc' }), replicationTopic, { identity: { ...signKey.keypair, sign: (data) => signKey.keypair.sign(data) } })
        assert.equal(db.address.toString().indexOf('/orbitdb'), 0)
        assert.equal(db.address.toString().indexOf('zd'), 9)
        assert.equal(db.address.toString().indexOf('abc'), 59)
        expect(db.identity.publicKey.equals(signKey.keypair.publicKey));
        await db.drop()
      })

      it('opens the same database - from an address', async () => {
        const signKey = await orbitdb.keystore.createEd25519Key({ id: new Uint8Array([0]) });
        const db = await orbitdb.open(new EventStore({ name: 'abc' }), replicationTopic, { identity: { ...signKey.keypair, sign: (data) => signKey.keypair.sign(data) } })
        const db2 = await orbitdb.open(await Store.load(orbitdb._ipfs, db.address), replicationTopic,)
        assert.equal(db2.address.toString().indexOf('/orbitdb'), 0)
        assert.equal(db2.address.toString().indexOf('zd'), 9)
        assert.equal(db2.address.toString().indexOf('abc'), 59)
        await db.drop()
        await db2.drop()
      })

      it('doesn\'t open a database if we don\'t have it locally', async () => {
        const db = await orbitdb.open(new EventStore({ name: 'abcabc' }), replicationTopic, {})
        const address = new Address(db.address.root.slice(0, -1) + 'A', 'non-existent')
        await db.drop()
        return new Promise(async (resolve, reject) => {
          setTimeout(resolve, 900)
          orbitdb.open(await Store.load(orbitdb._ipfs, address), replicationTopic,)
            .then(() => reject(new Error('Shouldn\'t open the database')))
            .catch(reject)
        })
      })

      it('throws an error if trying to open a database locally and we don\'t have it', async () => {
        const db = await orbitdb.open(new EventStore({ name: 'abc' }), replicationTopic, {})
        const address = new Address(db.address.root.slice(0, -1) + 'A', 'second')
        await db.drop()
        return orbitdb.open(await Store.load(orbitdb._ipfs, address), replicationTopic, { localOnly: true })
          .then(() => new Error('Shouldn\'t open the database'))
          .catch(e => {
            expect(e.toString()).toEqual(`Error: Database '${address}' doesn't exist!`)
          })
      })

      it('open the database and it has the added entries', async () => {
        const db = await orbitdb.open(new EventStore({ name: 'ZZZ' }), replicationTopic, {})
        await db.add('hello1')
        await db.add('hello2')
        await db.close()

        const db2 = await orbitdb.open(await Store.load(orbitdb._ipfs, db.address), replicationTopic,)

        await db.load()
        const res = db.iterator({ limit: -1 }).collect()

        expect(res.length).toEqual(2)
        expect(res[0].payload.getValue().value).toEqual('hello1')
        expect(res[1].payload.getValue().value).toEqual('hello2')
        await db.drop()
        await db2.drop()
      })
    })

    describe("Close", function () {
      beforeAll(async () => {
        if (orbitdb) await orbitdb.stop()
        orbitdb = await OrbitDB.createInstance(ipfs, { directory: dbPath })
      })
      it('closes a custom store', async () => {
        const directory = path.join(dbPath, "custom-store")
        const db = await orbitdb.open(new EventStore({ name: 'xyz' }), replicationTopic, { directory })
        await db.close()
        expect(db._cache._store.status).toEqual('closed')
      })

      it("close load close sets status to 'closed'", async () => {
        const directory = path.join(dbPath, "custom-store")
        const db = await orbitdb.open(new EventStore({ name: 'xyz' }), replicationTopic, { directory })
        await db.close()
        await db.load()
        await db.close()
        expect(db._cache._store.status).toEqual('closed')
      })

      it('successfully manages multiple caches', async () => {
        // Cleaning up cruft from other tests
        const directory = path.join(dbPath, "custom-store")
        const directory2 = path.join(dbPath, "custom-store2")

        const db1 = await orbitdb.open(new EventStore({ name: 'xyz1' }), replicationTopic, {})
        const db2 = await orbitdb.open(new EventStore({ name: 'xyz2' }), replicationTopic, { directory })
        const db3 = await orbitdb.open(new EventStore({ name: 'xyz3' }), replicationTopic, { directory })
        const db4 = await orbitdb.open(new EventStore({ name: 'xyz4' }), replicationTopic, { directory: directory2 })
        const db5 = await orbitdb.open(new EventStore({ name: 'xyz5' }), replicationTopic, {})

        await db1.close()
        await db2.close()
        await db4.close()

        expect(orbitdb.cache._store.status).toEqual('open')
        expect(db2._cache._store.status).toEqual('open')
        expect(db3._cache._store.status).toEqual('open')
        expect(db4._cache._store.status).toEqual('closed')

        await db3.close()
        await db5.close()

        expect(orbitdb.cache._store.status).toEqual('closed')
        expect(db2._cache._store.status).toEqual('closed')
        expect(db3._cache._store.status).toEqual('closed')
        expect(db4._cache._store.status).toEqual('closed')
        expect(db5._cache._store.status).toEqual('closed')
      })
    })
  })
})
