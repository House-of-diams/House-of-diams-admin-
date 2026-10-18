// Diagnostic-only adapter: actual transaction helper, but never commit its writes.
export function createRollbackPool(pool, { onQueryError = () => {}, onRollback = () => {} } = {}) {
  return { async connect() {
    const client = await pool.connect()
    const socket = client.connection?.stream
    if (!socket?.encrypted || socket.authorized !== true || socket.authorizationError) {
      client.release(true)
      throw new Error('Verified TLS required')
    }
    return {
      async query(sql, values) {
        try {
          if (sql === 'COMMIT') {
            await client.query('ROLLBACK')
            onRollback()
            return { rows: [] }
          }
          return await client.query(sql, values)
        } catch (error) { onQueryError(error); throw error }
      },
      release(discard) { client.release(discard) },
    }
  } }
}
