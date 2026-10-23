
export type InventoryDataItem = {
  id: string
  name: string
  slug: string
  sku: string
  stockQuantity: number
  status: 'in-stock' | 'low-stock' | 'out-of-stock'
  categoryPath: string
  updatedAt: string
}

