import { field, variant } from '@dao-xyz/borsh';
import { Documents, DocumentIndex } from '@dao-xyz/peerbit-document';
import { getPathGenerator, TrustedNetwork, getFromByTo, RelationContract } from '@dao-xyz/peerbit-trusted-network';
import { Access, AccessType } from './access';
import { Entry } from '@dao-xyz/ipfs-log'
import { PublicSignKey, SignKey } from '@dao-xyz/peerbit-crypto';

// @ts-ignore
import { v4 as uuid } from 'uuid';
import { AnySearch } from '@dao-xyz/peerbit-anysearch';
import { Program } from '@dao-xyz/peerbit-program';
import { DQuery } from '@dao-xyz/peerbit-query';

@variant([0, 12])
export class DynamicAccessController extends Program {

    @field({ type: Documents })
    access: Documents<Access>;

    @field({ type: RelationContract })
    identityGraphController: RelationContract;

    @field({ type: TrustedNetwork })
    trustedNetwork: TrustedNetwork

    constructor(opts?: {
        id?: string;
        rootTrust?: PublicSignKey,
        trustedNetwork?: TrustedNetwork
    }) {
        super(opts);
        if (opts) {
            if (!opts.trustedNetwork && !opts.rootTrust) {
                throw new Error("Expecting either TrustedNetwork or rootTrust")
            }
            this.access = new Documents({
                id: this.id,
                index: new DocumentIndex({
                    id: this.id,
                    indexBy: 'id',
                    search: new AnySearch({
                        id: this.id,
                        query: new DQuery({ id: this.id })
                    })
                })
            })

            this.trustedNetwork = opts.trustedNetwork ? opts.trustedNetwork : new TrustedNetwork({
                id: this.id,
                rootTrust: opts.rootTrust as PublicSignKey
            })
            this.identityGraphController = new RelationContract({ id: this.id });
        }
    }



    // allow anyone write to the ACL db, but assume entry is invalid until a verifier verifies
    // can append will be anyone who has peformed some proof of work

    // or 

    // custom can append

    async canRead(s: SignKey | undefined): Promise<boolean> {
        // TODO, improve, caching etc

        if (!s) {
            return false;
        }


        // Check whether it is trusted by trust web
        if (await this.trustedNetwork.isTrusted(s)) {
            return true;
        }

        // Else check whether its trusted by this access controller
        const canReadCheck = async (key: PublicSignKey) => {
            for (const value of this.access.index._index.values()) {
                const access = value.value;
                if (access instanceof Access) {
                    if (access.accessTypes.find((x) => x === AccessType.Any || x === AccessType.Read) !== undefined) {
                        // check condition
                        if (await access.accessCondition.allowed(key)) {
                            return true;
                        }
                        continue;
                    }
                }
            }
        }

        if (await canReadCheck(s)) {
            return true;
        }
        for await (const trustedByKey of getPathGenerator(s, this.identityGraphController.relationGraph, getFromByTo)) {
            if (await canReadCheck(trustedByKey.from)) {
                return true;
            }
        }



        return false;
    }

    async canAppend(entry: Entry<any>): Promise<boolean> {
        // TODO, improve, caching etc


        // Check whether it is trusted by trust web
        const key = await entry.getPublicKey();
        if (await this.trustedNetwork.isTrusted(key)) {
            return true;
        }
        // Else check whether its trusted by this access controller
        const canWriteCheck = async (key: PublicSignKey) => {
            for (const value of this.access.index._index.values()) {
                const access = value.value
                if (access instanceof Access) {
                    if (access.accessTypes.find((x) => x === AccessType.Any || x === AccessType.Write) !== undefined) {
                        // check condition
                        if (await access.accessCondition.allowed(key)) {
                            return true;
                        }
                        continue;
                    }
                }

            }
        }
        if (await canWriteCheck(key)) {
            return true;
        }
        for await (const trustedByKey of getPathGenerator(key, this.identityGraphController.relationGraph, getFromByTo)) {
            if (await canWriteCheck(trustedByKey.from)) {
                return true;
            }
        }

        return false;
    }

    async setup() {
        await this.identityGraphController.setup({ canRead: this.canRead.bind(this) })
        await this.access.setup({ type: Access, canAppend: this.canAppend.bind(this), canRead: this.canRead.bind(this) })
        await this.trustedNetwork.setup();
    }
}