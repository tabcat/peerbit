import { field, serialize, serializeField, variant } from "@dao-xyz/borsh";
import { Documents, DocumentIndex, IndexedValue } from "@dao-xyz/peerbit-document";
import { Key, PlainKey, PublicSignKey } from "@dao-xyz/peerbit-crypto";
// @ts-ignore
import { SystemBinaryPayload } from "@dao-xyz/peerbit-bpayload";
import { PageQueryRequest, AnySearch, MemoryCompare, MemoryCompareQuery, Result, ResultWithSource } from "@dao-xyz/peerbit-anysearch";
import { createHash } from "crypto";
import { joinUint8Arrays, UInt8ArraySerializer } from '@dao-xyz/peerbit-borsh-utils'
import { DQuery } from "@dao-xyz/peerbit-query";

export type RelationResolver = { resolve: (key: PublicSignKey, db: Documents<Relation>) => Promise<Result[]>, next: (relation: AnyRelation) => PublicSignKey }
export const PUBLIC_KEY_WIDTH = 72 // bytes reserved

export const KEY_OFFSET = 3 + 4 + 1 + 28; // SystemBinaryPayload discriminator + Relation discriminator + AnyRelation discriminator + id length u32 + utf8 encoding + id chars
export const getFromByTo: RelationResolver = {
    resolve: async (to: PublicSignKey, db: Documents<Relation>) => {
        const ser = serialize(to);
        return await db.index.queryHandler(new PageQueryRequest({
            queries: [
                new MemoryCompareQuery({
                    compares: [
                        new MemoryCompare({
                            bytes: ser,
                            offset: BigInt(KEY_OFFSET + PUBLIC_KEY_WIDTH)
                        })
                    ]
                })
            ]
        }));
    },
    next: (relation) => relation.from
}

export const getToByFrom: RelationResolver = {
    resolve: async (from: PublicSignKey, db: Documents<Relation>) => {
        const ser = serialize(from);
        return await db.index.queryHandler(new PageQueryRequest({
            queries: [
                new MemoryCompareQuery({
                    compares: [
                        new MemoryCompare({
                            bytes: ser,
                            offset: BigInt(KEY_OFFSET)
                        })
                    ]
                })
            ]
        }));
    },
    next: (relation) => relation.to
}








export async function* getPathGenerator(from: Key, db: Documents<Relation>, resolver: RelationResolver) {
    let iter = [from];
    const visited = new Set();
    while (iter.length > 0) {
        const newIter: PublicSignKey[] = [];
        for (const value of iter) {
            const results = await resolver.resolve(value, db);
            for (const result of results) {
                if (result instanceof ResultWithSource) {
                    if (result.source instanceof AnyRelation) {
                        if (visited.has(result.source.id)) {
                            return;
                        }
                        visited.add(result.source.id);
                        yield result.source;

                        newIter.push(resolver.next(result.source));
                    }
                }
            }
        }
        iter = newIter;
    }
}


/**
 * Get path, to target.
 * @param start 
 * @param target 
 * @param db 
 * @returns 
 */
export const hasPathToTarget = async (start: Key, target: (key: Key) => boolean, db: Documents<Relation>, resolver: RelationResolver): Promise<boolean> => {

    if (!db) {
        throw new Error("Not initalized")
    }

    let current = start;
    if (target(current)) {
        return true;
    }

    const iterator = getPathGenerator(current, db, resolver);
    for await (const relation of iterator) {
        if (target(relation.from)) {
            return true;
        }
    }
    return false;
}


@variant(10)
export class Relation extends SystemBinaryPayload {

    @field({ type: 'string' })
    id: string;

}


@variant(0)
export class AnyRelation extends Relation {

    @field({ type: Key })
    from: Key

    @field(UInt8ArraySerializer)
    padding: Uint8Array;

    @field({ type: Key })
    to: Key

    constructor(properties?: {
        to: PublicSignKey | PlainKey // signed by truster
        from: PublicSignKey
    }) {
        super();
        if (properties) {
            this.from = properties.from;
            this.to = properties.to;
            const serFrom = serialize(this.from);
            this.padding = new Uint8Array(PUBLIC_KEY_WIDTH - serFrom.length - 4); // -4 comes from u32 describing length the padding array
            this.initializeId();
        }
    }

    initializeId() {
        this.id = AnyRelation.id(this.to, this.from);
    }

    static id(to: PublicSignKey, from: PublicSignKey) {
        // we do sha1 to make sure id has fix length, this is important because we want the byte offest of the `trustee` and `truster` to be fixed
        return createHash('sha1').update(joinUint8Arrays([serialize(to), serialize(from)])).digest('base64');
    }

}


export const hasPath = async (start: Key, end: Key, db: Documents<Relation>, resolver: RelationResolver): Promise<boolean> => {
    return hasPathToTarget(start, (key) => end.equals(key), db, resolver)
}

export const getRelation = (from: Key, to: Key, db: Documents<Relation>): IndexedValue<Relation> | undefined => {
    return db.index.get(new AnyRelation({ from, to }).id);
}



export const createIdentityGraphStore = (props: { id: string, queryRegion?: string }) => new Documents<Relation>({
    id: props.id,
    index: new DocumentIndex({
        id: props.id,
        indexBy: 'id',
        search: new AnySearch({
            id: props.id,
            query: new DQuery({
                id: props.id
            })
        })
    })

})