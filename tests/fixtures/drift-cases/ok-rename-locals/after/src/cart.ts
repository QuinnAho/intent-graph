export interface Line {
  price: number;
  qty: number;
  discount: number;
}

export function cartTotal(lines: Line[]): number {
  let running = 0;
  for (const row of lines) {
    running += row.price * row.qty - row.discount;
  }
  return Math.max(0, running);
}
