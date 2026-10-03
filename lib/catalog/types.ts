export type CatalogItem = {
  id: number
  sku: string
  name: string
  description: string | null
  category: string | null
  finish: string | null
  price: number
  compareAtPrice: number | null
  images: string[]
}

export type CatalogAdminItem = CatalogItem & {
  productId: number | null
  published: boolean
  sortOrder: number
}

export type CartLine = {
  id: number
  sku: string
  name: string
  price: number
  image: string | null
  qty: number
}

export type OrderLine = {
  id: number
  sku: string
  name: string
  qty: number
  unitPrice: number
  lineTotal: number
}

export type OrderStatus = 'novo' | 'em_atendimento' | 'fechado' | 'cancelado'

export type CatalogOrder = {
  id: number
  code: string
  customerName: string
  customerPhone: string
  customerCompany: string | null
  customerCity: string | null
  notes: string | null
  items: OrderLine[]
  total: number
  status: OrderStatus
  whatsappStatus: 'pending' | 'sent' | 'failed'
  whatsappError: string | null
  createdAt: string
}

export const MAX_QTY_PER_ITEM = 200
export const MAX_LINES = 40
