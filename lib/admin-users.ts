import { operationsPage } from './operations-page-data'
import { createCustomersRepository } from './db/admin-repositories/customers'

export type AdminCustomerUser = {
  id: string
  email: string | null
  name: string
  createdAt: string
  confirmed: boolean
}

export function getCustomerIdentities(page = 1) { return operationsPage(db=>createCustomersRepository(db).list(page)) }
export function getCustomerMetrics() { return operationsPage(db=>createCustomersRepository(db).metrics()) }
