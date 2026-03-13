/**
 * Format a number as Indian Rupees using the lakh / crore system.
 *
 *   formatINR(1500000)  → "₹15,00,000"
 *   formatINR(25000.5)  → "₹25,000.50"
 *   formatINR(0)        → "₹0"
 */
export function formatINR(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (Number.isNaN(num)) return '₹0'

  // Intl with en-IN locale handles lakh/crore grouping natively
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Compact format for dashboards: "₹15L", "₹2.5Cr"
 */
export function formatINRCompact(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (Number.isNaN(num)) return '₹0'

  if (num >= 1_00_00_000) {
    const cr = num / 1_00_00_000
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)}Cr`
  }
  if (num >= 1_00_000) {
    const lakh = num / 1_00_000
    return `₹${lakh % 1 === 0 ? lakh.toFixed(0) : lakh.toFixed(1)}L`
  }
  if (num >= 1_000) {
    const k = num / 1_000
    return `₹${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
  }
  return `₹${num}`
}
