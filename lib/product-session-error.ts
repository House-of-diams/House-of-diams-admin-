export class ProductSessionError extends Error {
  constructor(readonly status: 401 | 403 | 503) { super('Administrator session unavailable.') }
}
