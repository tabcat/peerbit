import { Keystore } from '@dao-xyz/peerbit-keystore'
const leveldown = require('leveldown')
const storage = require('orbit-db-storage-adapter')(leveldown)

const Log = require('../../src/log')
const AccessController = Log.AccessController

let store

export const createLog = async (ipfs, logId) => {
  if (!store) {
    const keysPath = (await ipfs.repo.stat()).repoPath + '/keys'
    store = await storage.createStore(keysPath)
  }

  const access = new AccessController()
  const keystore = new Keystore(store)
  const identity = await Identities.createIdentity({ id: new Uint8Array([0]), keystore })
  const log = new Log(ipfs, identity, { gid: 'A', access })
  return { log, access, identity }
}

