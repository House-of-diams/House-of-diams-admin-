import { redirect } from 'next/navigation'

// Stock is retired: every piece is made to order. Old links land on Products.
export default function InventoryPage() {
  redirect('/dashboard/products')
}
