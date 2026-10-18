// Required by offline validation: no external connections or listening sockets.
import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'
import dgram from 'node:dgram'
import { syncBuiltinESMExports } from 'node:module'
const deny = () => { throw new Error('OFFLINE_VALIDATION_BLOCKED_NETWORK_OR_LISTENER') }
net.Socket.prototype.connect = deny
net.Server.prototype.listen = deny
net.connect = deny
net.createConnection = deny
tls.connect = deny
http.request = deny
http.get = deny
https.request = deny
https.get = deny
dgram.Socket.prototype.bind = deny
dgram.Socket.prototype.connect = deny
globalThis.fetch = async () => deny()
syncBuiltinESMExports()
