/** Keep the same request ID only while the exact reviewed save envelope is unchanged. */
export function createCmsPendingSave() {
  let pending: {fingerprint:string;body:string}|null=null
  return {
    prepare(body:string) {
      const parsed=JSON.parse(body) as Record<string,unknown>
      const payload={...parsed}
      delete payload.request_id
      const fingerprint=JSON.stringify(payload)
      if(pending?.fingerprint!==fingerprint)pending={fingerprint,body}
      return pending.body
    },
    clear(){pending=null},
  }
}
