import { variant, field, vec, serialize } from '@dao-xyz/borsh';
import { Entry } from '@dao-xyz/ipfs-log-entry'
import { Message } from './message';
import { HeadsCache, Store } from '@dao-xyz/orbit-db-store';
import Logger from 'logplease'
const logger = Logger.create('exchange-heads', { color: Logger.Colors.Yellow })
Logger.setLogLevel('ERROR')

@variant([0, 0])
export class ExchangeHeadsMessage<T> extends Message {

  @field({ type: 'String' })
  replicationTopic: string;

  @field({ type: 'String' })
  address: string;

  @field({ type: vec(Entry) })
  heads: Entry<T>[];

  constructor(props?: {
    replicationTopic: string,
    address: string,
    heads: Entry<T>[]
  }) {
    super();
    if (props) {
      this.replicationTopic = props.replicationTopic;
      this.address = props.address;
      this.heads = props.heads;
    }
  }
}

@variant([0, 1])
export class RequestHeadsMessage extends Message {

  @field({ type: 'String' })
  replicationTopic: string;

  @field({ type: 'String' })
  address: string;

  constructor(props?: {
    replicationTopic: string,
    address: string
  }) {
    super();
    if (props) {
      this.replicationTopic = props.replicationTopic;
      this.address = props.address;
    }
  }
}



const getHeadsForDatabase = async (store: Store<any, any, any, any>) => {
  if (!(store && store._cache)) return []
  const localHeads = (await store._cache.getBinary(store.localHeadsPath, HeadsCache))?.heads || []
  const remoteHeads = (await store._cache.getBinary(store.remoteHeadsPath, HeadsCache))?.heads || []
  return [...localHeads, ...remoteHeads]
}

export const exchangeHeads = async (channel: any, topic: string, getStore: (address: string) => { [key: string]: Store<any, any, any, any> }) => {

  // Send the heads if we have any
  const stores = getStore(topic);
  for (const [storeAddress, store] of Object.entries(stores)) {
    const heads = await getHeadsForDatabase(store)
    logger.debug(`Send latest heads of '${topic}':\n`, JSON.stringify(heads.map(e => e.hash), null, 2))
    if (heads) {
      const message = serialize(new ExchangeHeadsMessage({ replicationTopic: topic, address: storeAddress, heads: heads }));
      await channel.send(message)
    }
  }
}

