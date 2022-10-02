

import { Constructor, deserialize, field, option, serialize, variant, vec } from "@dao-xyz/borsh";
import type { Message, PubSub } from '@libp2p/interface-pubsub'
import { delay, waitFor } from "@dao-xyz/time";
import { decryptVerifyInto, DecryptedThing, MaybeEncrypted, PublicKeyEncryption, AccessError } from "@dao-xyz/peerbit-crypto"
import { X25519PublicKey, Ed25519PublicKey } from 'sodium-plus'
import { QueryRequestV0, QueryResponseV0 } from "@dao-xyz/query-protocol";
import { MaybeSigned, PublicKey } from "@dao-xyz/peerbit-crypto";

export const query = async (pubsub: PubSub, topic: string, query: QueryRequestV0, responseHandler: (response: QueryResponseV0) => void, options: {
    signer?: (bytes: Uint8Array) => Promise<{
        signature: Uint8Array;
        publicKey: PublicKey;
    }>
    encryption?: PublicKeyEncryption,
    waitForAmount?: number,
    maxAggregationTime?: number,
    recievers?: X25519PublicKey[],
    isTrusted?: (publicKey: PublicKey) => Promise<boolean>

} = {}) => {
    if (typeof options.maxAggregationTime !== 'number') {
        options.maxAggregationTime = 30 * 1000;
    }
    if (!options.encryption) {
        options.encryption = {
            getEncryptionKey: () => Promise.resolve(undefined),
            getAnySecret: (keys) => Promise.resolve(undefined)
        }
    }

    // send query and wait for replies in a generator like behaviour
    let responseTopic = query.getResponseTopic(topic);
    let results = 0;
    const _responseHandler = async (msg: Message) => {

        try {
            const result = await decryptVerifyInto(msg.data, QueryResponseV0, options.encryption, {
                isTrusted: options?.isTrusted
            })
            responseHandler(result);
            results += 1;

        } catch (error) {

            if (error instanceof AccessError) {
                return; // Ignore things we can not open
            }

            console.error("failed ot deserialize query response", error);
            throw error;
        }
    };
    try {
        await pubsub.subscribe(responseTopic, _responseHandler, {
            timeout: options.maxAggregationTime
        });
    } catch (error) {
        // timeout
        if (error.constructor.name != "TimeoutError") {
            throw new Error("Got unexpected error when query");
        }
    }
    const serializedQuery = serialize(query);
    let maybeSignedMessage = new MaybeSigned({ data: serializedQuery });

    if (options.signer) {
        maybeSignedMessage = await maybeSignedMessage.sign(options.signer);
    }

    let decryptedMessage = new DecryptedThing<MaybeSigned<Uint8Array>>({
        data: serialize(maybeSignedMessage)
    });
    let maybeEncryptedMessage: MaybeEncrypted<MaybeSigned<Uint8Array>> = decryptedMessage;
    if (options.recievers?.length > 0) {
        maybeEncryptedMessage = await decryptedMessage.encrypt(...options.recievers)
    }

    await pubsub.publish(topic, serialize(maybeEncryptedMessage));

    if (options.waitForAmount != undefined) {
        await waitFor(() => results >= options.waitForAmount, { timeout: options.maxAggregationTime, delayInterval: 50 })
    }
    else {
        await delay(options.maxAggregationTime);

    }
    await pubsub.unsubscribe(responseTopic, _responseHandler);
}


export const respond = async (pubsub: PubSubAPI, topic: string, request: QueryRequestV0, response: QueryResponseV0, options: {
    signer?: (bytes: Uint8Array) => Promise<{
        signature: Uint8Array;
        publicKey: PublicKey;
    }>
    encryption?: PublicKeyEncryption
} = {}) => {
    if (!options.encryption) {
        options.encryption = {
            getEncryptionKey: () => Promise.resolve(undefined),
            getAnySecret: (keys) => Promise.resolve(undefined)
        }
    }

    // send query and wait for replies in a generator like behaviour
    const serializedResponse = serialize(response);
    let maybeSignedMessage = new MaybeSigned({ data: serializedResponse });

    if (options.signer) {
        maybeSignedMessage = await maybeSignedMessage.sign(options.signer);
    }

    let decryptedMessage = new DecryptedThing<MaybeSigned<Uint8Array>>({
        data: serialize(maybeSignedMessage)
    });
    let maybeEncryptedMessage: MaybeEncrypted<MaybeSigned<Uint8Array>> = decryptedMessage;
    if (request.recievers?.length > 0) {
        maybeEncryptedMessage = await decryptedMessage.encrypt(...request.recievers)
    }
    await pubsub.publish(request.getResponseTopic(topic), serialize(maybeEncryptedMessage));
}
