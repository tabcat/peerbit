import { Constructor, deserialize, field, option, variant, vec } from "@dao-xyz/borsh";
import bs58 from "bs58";
import BN from "bn.js";
import Store from "orbit-db-store";
import DocumentStore from "orbit-db-docstore";
import { BinaryDocumentStore } from "./document-store";
import FeedStore from "orbit-db-feedstore";
import { v4 as uuid } from 'uuid';

export enum SortDirection {
    Ascending = 0,
    Descending = 1
}

export class Sort {

    @field({ type: vec('String') })
    fieldPath: string[]

    @field({ type: 'u8' })
    direction: SortDirection

    constructor(opts: {
        fieldPath: string[],
        direction: SortDirection
    }) {
        if (opts) {
            Object.assign(this, opts);
        }
    }
}



export class Query {

    public apply(doc: any): boolean {
        throw new Error("Not implemented")
    }
}

@variant(0)
export class FilterQuery extends Query {


    @field({ type: 'String' })
    key: string

    @field({ type: vec('u8') })
    value: Uint8Array

    constructor(opts?: FilterQuery) {
        super();
        if (opts) {
            Object.assign(this, opts)
        }
    }

    public apply(doc: any): boolean {
        return doc[this.key] === this.value
    }
}

@variant(1)
export class StringMatchQuery extends Query {


    @field({ type: 'String' })
    key: string

    @field({ type: 'String' })
    value: string

    constructor(opts?: {
        key: string
        value: string
    }) {
        super();
        if (opts) {
            Object.assign(this, opts)
        }
    }

    public apply(doc: any): boolean {
        return (doc[this.key] as string).toLowerCase().indexOf(this.value.toLowerCase()) != -1;
    }
}
export enum Compare {
    Equal = 0,
    Greater = 1,
    GreaterOrEqual = 2,
    Less = 3,
    LessOrEqual = 4
}

@variant(2)
export class CompareQuery extends Query {

    @field({ type: 'u8' })
    compare: Compare

    @field({ type: 'String' })
    key: string

    @field({ type: 'u64' })
    value: BN


    constructor(opts?: {
        key: string
        value: BN,
        compare: Compare
    }) {
        super();
        if (opts) {
            Object.assign(this, opts)
        }
    }

    apply(doc: any): boolean {
        let value = doc[this.key];
        if (value instanceof BN == false) {
            value = new BN(value);
        }
        switch (this.compare) {
            case Compare.Equal:
                return value.eq(this.value);
            case Compare.Greater:
                return value.gt(this.value);
            case Compare.GreaterOrEqual:
                return value.gte(this.value);
            case Compare.Less:
                return value.lt(this.value);
            case Compare.LessOrEqual:
                return value.lte(this.value);
            default:
                console.warn("Unexpected compare");
                return false;
        }
    }
}





@variant(0)
export class QueryRequestV0 {

    @field({ type: 'String' })
    id: string

    @field({ type: option('u64') })
    offset: BN | undefined;

    @field({ type: option('u64') })
    size: BN | undefined;

    @field({ type: vec(Query) })
    queries: Query[]

    @field({ type: option(Sort) })
    sort: Sort | undefined;


    constructor(obj?: {
        id?: string
        offset?: BN
        size?: BN
        queries: Query[]
        sort?: Sort

    }) {
        if (obj) {
            Object.assign(this, obj);
            if (!this.id) {
                this.id = uuid();
            }
        }
    }

    getResponseTopic(topic: string): string {
        return topic + '/' + this.id
    }

}


@variant(1)
export class EncodedQueryResponse {

    @field({ type: vec('String') })
    results: string[] // base58 encoded

    constructor(obj?: {
        results: string[]

    }) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}

export class QueryResponse<T> {

    results: T[] // base58 encoded
    constructor(obj?: {
        results: T[]

    }) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
    static from<T>(encoded: EncodedQueryResponse, clazz: Constructor<T>): QueryResponse<T> {
        let results = encoded.results.map(x => deserialize(bs58.decode(x), clazz))
        return new QueryResponse({
            results
        })
    }
}

export const query = async<T>(query: QueryRequestV0, db: Store<T, any>): Promise<T[]> => {
    // query

    if (db instanceof DocumentStore || db instanceof BinaryDocumentStore) {


        let filters: (Query | ((v: any) => boolean))[] = query.queries;
        if (filters.length == 0) {
            filters = [(v?) => true];
        }
        let result = db.query(
            doc =>
                filters.map(f => {
                    if (f instanceof Query) {
                        return f.apply(doc)
                    }
                    else {
                        return (f as ((v: any) => boolean))(doc)
                    }
                }).reduce((prev, current) => prev && current)
        )

        // publish response
        return result

    }
    else if (db instanceof FeedStore) {
        let result = db.iterator().collect().map(x => x.payload.value).filter(
            doc =>
                query.queries.map(f => {
                    if (f instanceof FilterQuery) {
                        let docValue = doc[f.key];
                        return docValue == f.value
                    }
                }).reduce((prev, current) => prev && current)
        )

        // publish response
        return result
    }

    else {
        throw new Error("Querying not supported")
    }
}