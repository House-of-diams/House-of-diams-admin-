import assert from 'node:assert/strict'
import test from 'node:test'
import {parseUpstashRedisUrl,deriveRestCredentials} from './configure-admin-login-local.mjs'

test('only TLS Upstash Redis URLs are accepted',()=>{
  const input='rediss://default:synthetic-password@synthetic.upstash.io:6379'
  const parsed=parseUpstashRedisUrl(input)
  assert.equal(parsed.restUrl,'https://synthetic.upstash.io')
  assert.equal(parsed.username,'default')
  for(const bad of ['redis://default:fake@synthetic.upstash.io:6379',
    'rediss://default:fake@unrelated.example:6379',input+'?skipTls=true',input+'/1']) {
    assert.throws(()=>parseUpstashRedisUrl(bad))
  }
})
test('only PING and documented token derivation are sent; REST PING uses the derived token',async()=>{
  const parsed=parseUpstashRedisUrl('rediss://default:synthetic-password@synthetic.upstash.io:6379')
  const commands=[]
  const client={async connect(){},async ping(){commands.push(['PING']);return 'PONG'},
    async sendCommand(command){commands.push(command);return 'synthetic-rest-token'}}
  const fetcher=async(url,init)=>{
    assert.equal(url,parsed.restUrl)
    assert.deepEqual(JSON.parse(init.body),['PING'])
    assert.equal(init.redirect,'error')
    assert.equal(init.headers.Authorization,'Bearer synthetic-rest-token')
    return {ok:true,async json(){return {result:'PONG'}}}
  }
  const result=await deriveRestCredentials(parsed,client,fetcher)
  assert.equal(result.token,'synthetic-rest-token')
  assert.deepEqual(commands,[['PING'],['ACL','RESTTOKEN','default','synthetic-password']])
})
test('rejected REST access prevents reporting successful credentials',async()=>{
  const parsed=parseUpstashRedisUrl('rediss://default:synthetic-password@synthetic.upstash.io:6379')
  await assert.rejects(deriveRestCredentials(parsed,{async connect(){},async ping(){return 'PONG'},
    async sendCommand(){return 'synthetic-rest-token'}},async()=>({ok:false})))
})
