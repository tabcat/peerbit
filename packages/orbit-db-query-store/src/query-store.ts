import Store from 'orbit-db-store'
import { Identity } from 'orbit-db-identity-provider';
import { deserialize, serialize } from '@dao-xyz/borsh';
import { Message } from 'ipfs-core-types/types/src/pubsub'
import { QueryRequestV0, QueryResponseV0, Result, query } from '@dao-xyz/bquery';
import { IPFS as IPFSInstance } from "ipfs-core-types";
import { IQueryStoreOptions } from '@dao-xyz/orbit-db-bstores';

export class QueryStore<T, X> extends Store<T, X> {

  _subscribed: boolean = false
  subscribeToQueries = false;
  constructor(ipfs: IPFSInstance, id: Identity, dbname: string, options: IQueryStoreOptions) {
    super(ipfs, id, dbname, options)
    this.subscribeToQueries = options.subscribeToQueries;
  }

  public async close(): Promise<void> {
    await this._ipfs.pubsub.unsubscribe(this.queryTopic);
    this._subscribed = false;
    await super.close();
  }

  public async load(amount?: number, opts?: {}): Promise<void> {
    await super.load(amount, opts);
    if (this.subscribeToQueries) {
      await this._subscribeToQueries();
    }
  }

  async queryHandler(_query: QueryRequestV0): Promise<Result[]> {
    throw new Error("Not implemented");
  }

  async _subscribeToQueries(): Promise<void> {
    if (this._subscribed) {
      return
    }

    await this._ipfs.pubsub.subscribe(this.queryTopic, async (msg: Message) => {
      try {
        let query = deserialize(Buffer.from(msg.data), QueryRequestV0);
        const results = await this.queryHandler(query);
        if (!results || results.length == 0) {
          return;
        }
        let response = new QueryResponseV0({
          results
        });

        let bytes = serialize(response);
        await this._ipfs.pubsub.publish(
          query.getResponseTopic(this.queryTopic),
          bytes
        )
      } catch (error) {
        console.error(error)
      }
    })
    this._subscribed = true;
  }

  public query(queryRequest: QueryRequestV0, responseHandler: (response: QueryResponseV0) => void, maxAggregationTime?: number): Promise<void> {
    return query(this._ipfs.pubsub, this.queryTopic, queryRequest, responseHandler, maxAggregationTime);
  }

  public get queryTopic() {
    if (!this.address) {
      throw new Error("Not initialized");
    }

    return this.address + '/query';
  }

}


