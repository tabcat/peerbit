import { StringOperation, StringIndex, encoding } from './string-index.js'
import { AnySearch, QueryType, StoreAddressMatchQuery } from '@dao-xyz/peerbit-anysearch';
import { RangeCoordinate, RangeCoordinates, Result, ResultWithSource, StringMatchQuery } from '@dao-xyz/peerbit-anysearch';
import { StringQueryRequest } from '@dao-xyz/peerbit-anysearch';
import { Range } from './range.js';
import { field, variant } from '@dao-xyz/borsh';
import { CustomBinaryPayload } from '@dao-xyz/peerbit-bpayload';
import { AddOperationOptions, Store } from '@dao-xyz/peerbit-store';
import { CanAppend, EncryptionTemplateMaybeEncrypted, Entry } from '@dao-xyz/ipfs-log';
import { SignatureWithKey } from '@dao-xyz/peerbit-crypto';
import { Program } from '@dao-xyz/peerbit-program';
import { QueryOptions, CanRead, DQuery } from '@dao-xyz/peerbit-query';

export const STRING_STORE_TYPE = 'string_store';
const findAllOccurrences = (str: string, substr: string): number[] => {
  str = str.toLowerCase();

  let result: number[] = [];

  let idx = str.indexOf(substr)

  while (idx !== -1) {
    result.push(idx);
    idx = str.indexOf(substr, idx + 1);
  }
  return result;
}

export type StringStoreOptions = { canRead?: (key: SignatureWithKey) => Promise<boolean> };

@variant([0, 5])
export class DString extends Program {

  @field({ type: Store })
  store: Store<StringOperation>

  @field({ type: AnySearch })
  search: AnySearch<StringOperation>;

  @field({ type: StringIndex })
  _index: StringIndex;

  _optionCanAppend?: CanAppend<StringOperation>

  constructor(properties: { id?: string, search?: AnySearch<StringOperation> }) {
    super(properties)
    if (properties) {
      this.search = properties.search || new AnySearch({ id: this.id, query: new DQuery({ id: this.id }) })
      this.store = new Store(properties);
      this._index = new StringIndex(properties);
    }
  }


  async setup(options?: { canRead?: CanRead, canAppend?: CanAppend<StringOperation> }) {

    this._optionCanAppend = options?.canAppend;
    this.store.setup({ encoding, canAppend: this.canAppend.bind(this), onUpdate: this._index.updateIndex.bind(this._index) });
    if (options?.canAppend) {
      this.store.canAppend = options.canAppend;
    }

    await this.search.setup({ ...options, context: { address: () => this.address }, canRead: options?.canRead, queryHandler: this.queryHandler.bind(this) })
    await this._index.setup();

  }

  async canAppend(entry: Entry<StringOperation>): Promise<boolean> {

    if (!await this._canAppend(entry)) {
      return false;
    }
    if (this._optionCanAppend && !await this._optionCanAppend(entry)) {
      return false;
    }
    return true;
  }

  async _canAppend(entry: Entry<StringOperation>): Promise<boolean> {

    if (this.store.oplog.length === 0) {
      return true;
    }
    else {
      for (const next of entry.next) {
        if (this.store.oplog.has(next)) {
          return true;
        }
      }
    }
    return false;
  }

  add(value: string, index: Range, options?: AddOperationOptions<StringOperation>) {
    return this.store._addOperation(new StringOperation({
      index,
      value,
    }), { nexts: this.store.oplog.heads, ...options })
  }

  del(index: Range, options?: AddOperationOptions<StringOperation>) {
    const operation = {
      index
    } as StringOperation
    return this.store._addOperation(operation, { nexts: this.store.oplog.heads, ...options })
  }

  async queryHandler(query: QueryType): Promise<Result[]> {
    if (query instanceof StringQueryRequest == false) {
      return [];
    }
    const stringQuery = query as StringQueryRequest;

    const content = this._index.string;
    const relaventQueries = stringQuery.queries.filter(x => x instanceof StringMatchQuery) as StringMatchQuery[]
    if (relaventQueries.length == 0) {
      return [new ResultWithSource({
        source: new StringResultSource({
          string: content
        })
      })]
    }
    let ranges = relaventQueries.map(query => {
      const occurances = findAllOccurrences(query.preprocess(content), query.preprocess(query.value));
      return occurances.map(ix => {
        return new RangeCoordinate({
          offset: BigInt(ix),
          length: BigInt(query.value.length)
        })
      })

    }).flat(1);

    if (ranges.length == 0) {
      return [];
    }

    return [new ResultWithSource({
      source: new StringResultSource({
        string: content,
      }),
      coordinates: new RangeCoordinates({
        coordinates: ranges
      })
    })];
  }

  async toString(options?: { remote: { callback: (string: string) => any, queryOptions: QueryOptions } }): Promise<string | undefined> {
    if (options?.remote) {
      const counter: Map<string, number> = new Map();
      await this.search.query(new StringQueryRequest({
        queries: [new StoreAddressMatchQuery({
          address: this.address.toString()
        })]
      }), (response) => {
        const result = ((response.results[0] as ResultWithSource).source as StringResultSource).string;
        options?.remote.callback && options?.remote.callback(result)
        counter.set(result, (counter.get(result) || 0) + 1)
      }, options.remote.queryOptions);
      let max = -1;
      let ret: string | undefined = undefined;
      counter.forEach((v, k) => {
        if (max < v) {
          max = v
          ret = k;
        }
      })
      return ret;
    }
    else {
      return this._index.string;
    }
  }
}


@variant("string")
export class StringResultSource extends CustomBinaryPayload {

  @field({ type: 'string' })
  string: string

  constructor(prop?: {
    string: string;
  }) {
    super();
    if (prop) {
      Object.assign(this, prop);
    }
  }
}


