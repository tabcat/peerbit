
import assert, { rejects } from 'assert'
import { Store, DefaultOptions, HeadsCache } from '../store.js'
import { default as Cache } from '@dao-xyz/peerbit-cache'
import { Keystore, KeyWithMeta } from "@dao-xyz/peerbit-keystore"
import { Entry, JSON_ENCODING } from '@dao-xyz/ipfs-log'
import { SimpleIndex } from './utils.js'
import { Controller } from 'ipfsd-ctl'
import { IPFS } from 'ipfs-core-types'
import { Ed25519Keypair } from '@dao-xyz/peerbit-crypto'
import { delay, waitFor } from '@dao-xyz/peerbit-time';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __filenameBase = path.parse(__filename).base;

// Test utils
import {
  nodeConfig as config,
  testAPIs,
  startIpfs,
  stopIpfs,
  createStore
} from '@dao-xyz/peerbit-test-utils'
import { Level } from 'level'
import { Address } from '../io.js'
Object.keys(testAPIs).forEach((IPFS) => {
  describe(`addOperation ${IPFS}`, function () {
    let ipfsd: Controller, ipfs: IPFS, signKey: KeyWithMeta<Ed25519Keypair>, identityStore: Level, store: Store<any>, cacheStore: Level
    let index: SimpleIndex<string>

    jest.setTimeout(config.timeout);

    const ipfsConfig = Object.assign({}, config, {
      repo: 'repo-add' + __filenameBase + new Date().getTime()
    })

    beforeAll(async () => {
      identityStore = await createStore(path.join(__filename, 'identity'))

      const keystore = new Keystore(identityStore)

      signKey = await keystore.createEd25519Key()
      ipfsd = await startIpfs(IPFS, ipfsConfig.daemon1)
      ipfs = ipfsd.api

      cacheStore = await createStore(path.join(__filename, 'cache'))

    })

    afterAll(async () => {
      await store?.close()
      ipfsd && await stopIpfs(ipfsd)
      await identityStore?.close()
      await cacheStore?.close()
    })

    beforeEach(async () => {
      await cacheStore.clear();
    })

    it('adds an operation and triggers the write event', async () => {
      index = new SimpleIndex();
      const cache = new Cache(cacheStore)
      let done = false;
      const onWrite = async (store: Store<any>, entry: Entry<any>) => {
        const heads = await store.oplog.heads;
        expect(heads.length).toEqual(1)
        assert(Address.isValid(store.address))
        assert.deepStrictEqual(entry.payload.getValue(), data)
        expect(store.replicationStatus.progress).toEqual(1n)
        expect(store.replicationStatus.max).toEqual(1n)
        assert.deepStrictEqual(index._index, heads)
        await delay(5000); // seems because write is async?
        store._cache.getBinary(store.localHeadsPath, HeadsCache).then((localHeads) => {
          if (!localHeads) {
            fail();
          }
          assert.deepStrictEqual(localHeads.heads[0].payload.getValue(), data)
          assert(localHeads.heads[0].equals(heads[0]))
          expect(heads.length).toEqual(1)
          expect(localHeads.heads.length).toEqual(1)
          done = true;
        })
      }

      store = new Store({ id: 'name' })
      await store.init(ipfs, {
        ...signKey.keypair,
        sign: async (data: Uint8Array) => (await signKey.keypair.sign(data))
      }, { ...DefaultOptions, resolveCache: () => Promise.resolve(cache), onUpdate: index.updateIndex.bind(index), onWrite: onWrite });
      assert(Address.isValid(store.address));

      const data = { data: 12345 }


      await store._addOperation(data).then((entry) => {
        expect(entry).toBeInstanceOf(Entry)
      }).catch(error => {
        rejects(error);
      })

      await waitFor(() => done);
    })

    it('adds multiple operations and triggers multiple write events', async () => {
      const writes = 3
      let eventsFired = 0


      index = new SimpleIndex();
      const cache = new Cache(cacheStore)
      let done = false;
      const onWrite = async (store: Store<any>, entry: Entry<any>) => {
        eventsFired++
        if (eventsFired === writes) {
          const heads = store.oplog.heads;
          expect(heads.length).toEqual(1)
          expect(store.replicationStatus.progress).toEqual(BigInt(writes))
          expect(store.replicationStatus.max).toEqual(BigInt(writes))
          expect(index._index.length).toEqual(writes)
          store._cache.getBinary(store.localHeadsPath, HeadsCache).then((localHeads) => {
            if (!localHeads) {
              fail();
            }
            assert.deepStrictEqual(localHeads.heads[0].payload.getValue(), index._index[2].payload.getValue())
            done = true;
          })
        }
      }

      store = new Store({ id: 'name' })
      await store.init(ipfs, {
        ...signKey.keypair,
        sign: async (data: Uint8Array) => (await signKey.keypair.sign(data))
      }, { ...DefaultOptions, resolveCache: () => Promise.resolve(cache), onUpdate: index.updateIndex.bind(index), onWrite: onWrite });
      assert(Address.isValid(store.address));

      for (let i = 0; i < writes; i++) {
        await store._addOperation({ step: i })
      }

      await waitFor(() => done);
    })
  })
})
