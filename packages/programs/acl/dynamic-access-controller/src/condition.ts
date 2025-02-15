import { field, variant } from "@dao-xyz/borsh";
import { PublicSignKey } from "@dao-xyz/peerbit-crypto";

@variant(0)
export class Network {

    @field({ type: 'string' })
    type: string;

    @field({ type: 'string' })
    rpc: string;
}

export class AccessCondition<T> {

    async allowed(_key: PublicSignKey): Promise<boolean> {
        throw new Error("Not implemented")
    }
}

@variant([0, 0])
export class AnyAccessCondition<T> extends AccessCondition<T> {
    constructor() {
        super();
    }
    async allowed(_key: PublicSignKey): Promise<boolean> {
        return true;
    }
}

@variant([0, 1])
export class PublicKeyAccessCondition<T> extends AccessCondition<T> {

    @field({ type: PublicSignKey })
    key: PublicSignKey

    constructor(options?: {
        key: PublicSignKey
    }) {
        super();
        if (options) {
            this.key = options.key
        }
    }

    async allowed(identity: PublicSignKey): Promise<boolean> {
        return this.key.equals(identity);
    }
}

/*  Not yet :)

@variant([0, 2])
export class TokenAccessCondition extends AccessCondition {

    @field({ type: Network })
    network: Network

    @field({ type: 'string' })
    token: string

    @field({ type: 'u64' })
    amount: bigint

    constructor() {
        super();
    }
}


@variant(0)
export class NFTPropertyCondition {
    @field({ type: 'string' })
    field: string

    @field({ type: 'string' })
    value: string;
}

 @variant([0, 3])  // distinguish between ERC-721, ERC-1155, Solana Metaplex? 
export class NFTAccessCondition extends AccessCondition {

    @field({ type: Network })
    network: Network

    @field({ type: 'string' })
    id: string

    @field({ type: option(vec(NFTPropertyCondition)) })
    properties: NFTPropertyCondition

    constructor() {
        super();
    }
}
 */
