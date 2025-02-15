
import { StringResultSource, DString, STRING_STORE_TYPE } from '../string-store.js';
import { ResultWithSource, StringQueryRequest, StringMatchQuery, RangeCoordinate, RangeCoordinates, StoreAddressMatchQuery, AnySearch, Results } from '@dao-xyz/peerbit-anysearch';
import { Range } from '../range.js';
import { createStore, Session } from '@dao-xyz/peerbit-test-utils';
import { IPFS } from 'ipfs-core-types';
import { Level } from 'level';;
import Cache from '@dao-xyz/peerbit-cache';
import { fileURLToPath } from 'url';
import path from 'path';
import { Identity } from '@dao-xyz/ipfs-log';
import { Ed25519Keypair, X25519PublicKey } from '@dao-xyz/peerbit-crypto';
import { DefaultOptions } from '@dao-xyz/peerbit-store';
import { deserialize, serialize } from '@dao-xyz/borsh';
import { QueryRequestV0, DQuery, QueryOptions, query } from '@dao-xyz/peerbit-query';
import { delay, waitFor } from '@dao-xyz/peerbit-time';
import { v4 as uuid } from 'uuid';
const __filename = fileURLToPath(import.meta.url);

const mquery = (ipfs: IPFS, topic: string, request: StringQueryRequest, responseHandler: (results: Results) => void, options: QueryOptions | undefined) => (
    query(ipfs, topic, new QueryRequestV0({
        query: serialize(request)
    }), (response) => {
        const results = deserialize(response.response, Results);
        responseHandler(results);
    }, options)
)

const createIdentity = async () => {
    const ed = await Ed25519Keypair.create();
    return {
        publicKey: ed.publicKey,
        sign: (data) => ed.sign(data)
    } as Identity
}

describe('query', () => {


    let session: Session, observer: IPFS, writer: IPFS, writeStore: DString, observerStore: DString, cacheStore1: Level, cacheStore2: Level

    beforeAll(async () => {
        session = await Session.connected(2)
        observer = session.peers[0].ipfs;
        writer = session.peers[1].ipfs;
        cacheStore1 = await createStore(path.join(__filename, 'cache1'));
        cacheStore2 = await createStore(path.join(__filename, 'cache2'));
    })

    beforeEach(async () => {

        // Create store
        writeStore = new DString({});
        const replicationTopic = uuid();
        await writeStore.init(writer, await createIdentity(), { replicationTopic, store: { ...DefaultOptions, encryption: { getAnyKeypair: (_) => Promise.resolve(undefined), getEncryptionKeypair: () => Ed25519Keypair.create() }, replicate: true, resolveCache: () => new Cache(cacheStore1) } });

        observerStore = await DString.load(session.peers[1].ipfs, writeStore.address) as DString;
        observerStore.search._query.subscribeToQueries = false;
        await observerStore.init(observer, await createIdentity(), { replicationTopic, store: { ...DefaultOptions, resolveCache: () => new Cache(cacheStore2) } })

    })

    afterAll(async () => {
        await cacheStore1.close();
        await cacheStore2.close();
        await session.stop();
    })

    it('only context', async () => {
        await writeStore.add('hello', new Range({ offset: 0n, length: 'hello'.length }));
        await writeStore.add('world', new Range({ offset: BigInt('hello '.length), length: 'world'.length }));

        let response: Results = undefined as any;

        await mquery(observer, writeStore.search._query.queryTopic, new StringQueryRequest({
            queries: [
                new StoreAddressMatchQuery({
                    address: writeStore.address.toString()
                })
            ]
        }), (r: Results) => {
            response = r;
        }, { waitForAmount: 1 })

        expect(response.results).toHaveLength(1);
        expect(((response.results[0]) as ResultWithSource)).toMatchObject(new ResultWithSource({
            source: new StringResultSource({
                string: 'hello world'
            }),
            coordinates: undefined //  because we are matching without any specific query
        }));


    });

    it('match all', async () => {



        await writeStore.add('hello', new Range({ offset: 0n, length: 'hello'.length }));
        await writeStore.add('world', new Range({ offset: BigInt('hello '.length), length: 'world'.length }));

        let response: Results = undefined as any;

        await mquery(observer, writeStore.search._query.queryTopic, new StringQueryRequest({
            queries: []
        }), (r: Results) => {
            response = r;
        }, { waitForAmount: 1 })
        expect(response.results).toHaveLength(1);
        expect(((response.results[0]) as ResultWithSource)).toMatchObject(new ResultWithSource({
            source: new StringResultSource({
                string: 'hello world'
            }),
            coordinates: undefined //  because we are matching without any specific query
        }));


    });

    it('match part', async () => {

        await writeStore.add('hello', new Range({ offset: 0n, length: 'hello'.length }));
        await writeStore.add('world', new Range({ offset: BigInt('hello '.length), length: 'world'.length }));

        let response: Results = undefined as any;

        await mquery(observer, writeStore.search._query.queryTopic, new StringQueryRequest({
            queries: [new StringMatchQuery({
                exactMatch: true,
                value: 'o w'
            }),
            new StringMatchQuery({
                exactMatch: true,
                value: 'orld'
            }),
            ]
        }), (r: Results) => {
            response = r;
        }, { waitForAmount: 1 })
        expect(response.results).toHaveLength(1);
        let result = ((response.results[0]) as ResultWithSource);
        expect(result.source).toMatchObject(new StringResultSource({
            string: 'hello world'
        }));
        expect((result.coordinates as RangeCoordinates).coordinates).toHaveLength(2);
        expect((result.coordinates as RangeCoordinates).coordinates[0].offset).toEqual(BigInt('hell'.length));
        expect((result.coordinates as RangeCoordinates).coordinates[0].length).toEqual(BigInt('w o'.length));
        expect((result.coordinates as RangeCoordinates).coordinates[1].offset).toEqual(BigInt('hello w'.length));
        expect((result.coordinates as RangeCoordinates).coordinates[1].length).toEqual(BigInt('orld'.length));


    });


    it('toString remote', async () => {
        await writeStore.add('hello', new Range({ offset: 0n, length: 'hello'.length }));
        await writeStore.add('world', new Range({ offset: BigInt('hello '.length), length: 'world'.length }));

        let callbackValues: string[] = [];
        const string = await observerStore.toString({ remote: { callback: (s) => callbackValues.push(s), queryOptions: { waitForAmount: 1 } } })
        expect(string).toEqual('hello world');
        expect(callbackValues).toEqual(['hello world']);
    })

    it('handles AccessError gracefully', async () => {
        const store = new DString({});
        await store.init(writer, await createIdentity(), { replicationTopic: uuid(), store: { ...DefaultOptions, encryption: { getAnyKeypair: (_) => Promise.resolve(undefined), getEncryptionKeypair: () => Ed25519Keypair.create() }, replicate: true, resolveCache: () => new Cache(cacheStore1) } });

        await store.add('hello', new Range({ offset: 0n, length: 'hello'.length }), { reciever: { clock: undefined, signature: undefined, payload: [await X25519PublicKey.create()] } });
        await store.store.close();
        await store.store.load();
        await waitFor(() => store.store.oplog.values.length === 1)
    })

}) 