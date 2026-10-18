import nodemailer from 'nodemailer'
import { formatUsd } from '@/lib/money'

type OrderEmailItem = {
  product_name: string
  quantity: number
  line_total: number
}

type OrderStatusUpdateInput = {
  customerEmail: string
  customerName: string
  orderNumber: string
  orderDate?: string | null
  totalAmount: number
  items: OrderEmailItem[]
  status: string
  courierName?: string | null
  courierAwbNumber?: string | null
  shippedAt?: string | null
}

const emailHost = process.env.EMAIL_HOST
const emailPort = Number(process.env.EMAIL_PORT || 587)
const emailUser = process.env.EMAIL_USER
const emailPass = process.env.EMAIL_PASS
const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER
const siteUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000'
const logoUrl = `${siteUrl.replace(/\/$/, '')}/logo.jpeg`

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null

function formatMoney(amount: number) {
  return formatUsd(amount)
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getTransporter() {
  if (!emailHost || !emailUser || !emailPass || !emailFrom) {
    throw new Error('Order status email is not configured. Missing EMAIL_HOST, EMAIL_USER, EMAIL_PASS, or EMAIL_FROM.')
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    })
  }

  return cachedTransporter
}

export async function sendOrderStatusUpdateEmail(input: OrderStatusUpdateInput) {
  const transporter = getTransporter()
  if (!emailFrom) {
    throw new Error('EMAIL_FROM is not configured for order status emails.')
  }
  if (!input.customerEmail) {
    throw new Error('Customer email is missing for order status update.')
  }

  const customerName = input.customerName || 'Client'
  const statusLabel = input.status.replace(/_/g, ' ')
  const orderDateLabel = input.orderDate
    ? new Date(input.orderDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
  const itemRows = input.items
    .map(
      (item) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #e5e5e5;color:#000000;font-size:14px;line-height:1.5;">
            <div style="font-weight:600;">${escapeHtml(item.product_name)}</div>
            <div style="font-size:12px;color:#666666;text-transform:uppercase;letter-spacing:.16em;margin-top:4px;">Qty ${escapeHtml(item.quantity)}</div>
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #e5e5e5;color:#000000;font-size:14px;line-height:1.5;text-align:right;font-weight:600;">
            ${formatMoney(item.line_total)}
          </td>
        </tr>
      `
    )
    .join('')
  const shippedDateLabel = input.shippedAt
    ? new Date(input.shippedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const shipmentMarkup =
    input.status === 'shipped' && (input.courierName || input.courierAwbNumber)
      ? `
            <div style="margin-top:20px;padding:18px 20px;border-radius:0;background:#f9f9f9;border:1px solid #e5e5e5;">
              <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#000000;font-weight:700;">Shipment Details</div>
              ${input.courierName ? `<div style="margin-top:12px;font-size:14px;color:#000000;"><strong>Courier:</strong> ${escapeHtml(input.courierName)}</div>` : ''}
              ${input.courierAwbNumber ? `<div style="margin-top:8px;font-size:14px;color:#000000;"><strong>AWB / Tracking Number:</strong> ${escapeHtml(input.courierAwbNumber)}</div>` : ''}
              ${shippedDateLabel ? `<div style="margin-top:8px;font-size:14px;color:#000000;"><strong>Shipped On:</strong> ${escapeHtml(shippedDateLabel)}</div>` : ''}
            </div>
        `
      : ''

  const html = `
    <div style="margin:0;padding:32px 16px;background:#f9f9f9;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#000000;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dedede;border-radius:0;overflow:hidden;">
        <tr>
          <td style="padding:30px 28px;background:#000000;color:#ffffff;text-align:center;">
            <img src="${escapeHtml(logoUrl)}" width="58" alt="House of Diams" style="display:block;width:58px;height:auto;margin:0 auto 18px;border:0;" /><div style="font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:#ffffff;">House of Diams</div>
            <div style="margin-top:14px;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-size:28px;line-height:1.18;font-weight:600;letter-spacing:.02em;">Your order is now ${escapeHtml(statusLabel)}</div>
            <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#e5e5e5;">Hello ${escapeHtml(customerName)}, your order has been updated by our team. You can review the latest details in your account.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#000000;">Order Status Update</div>
            <div style="display:inline-block;margin-top:14px;padding:8px 14px;border-radius:0;border:1px solid #dedede;background:#f9f9f9;color:#000000;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;">${escapeHtml(statusLabel)}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;border-collapse:collapse;">
              <tr>
                <td style="padding:0 0 8px;color:#000000;font-size:11px;letter-spacing:.18em;text-transform:uppercase;">Order Number</td>
                <td style="padding:0 0 8px;color:#000000;font-size:11px;letter-spacing:.18em;text-transform:uppercase;text-align:right;">Order Date</td>
              </tr>
              <tr>
                <td style="padding:0 0 18px;font-size:17px;font-weight:600;color:#000000;">${escapeHtml(input.orderNumber)}</td>
                <td style="padding:0 0 18px;font-size:14px;color:#555555;text-align:right;">${escapeHtml(orderDateLabel)}</td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              ${itemRows}
            </table>
            ${shipmentMarkup}
            <div style="margin-top:28px;">
              <a href="${escapeHtml(`${siteUrl}/profile?tab=orders`)}" style="display:inline-block;min-width:190px;padding:15px 24px;background:#000000;color:#ffffff;text-align:center;text-decoration:none;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">View My Orders</a>
            </div>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;border-top:1px solid #e5e5e5;">
              <tr>
                <td style="padding-top:18px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#000000;">Total</td>
                <td style="padding-top:18px;text-align:right;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:600;color:#000000;">${formatMoney(input.totalAmount)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px;border-top:1px solid #e5e5e5;background:#f9f9f9;color:#666666;font-size:13px;line-height:1.7;">
            Questions about your order? Reply to this email and our team will help you.
          </td>
        </tr>
      </table>
    </div>
  `

  await transporter.sendMail({
    from: emailFrom,
    to: input.customerEmail,
    subject: `Order update: ${input.orderNumber}`,
    html,
  })
}
