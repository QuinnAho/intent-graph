export interface Line {
  price: number;
  qty: number;
  discount: number;
}

export function cartTotal(lines: Line[]): number {
  let sum = 0;
  for (const line of lines) {
    sum += line.price * line.qty - line.discount;
  }
  return Math.max(0, sum);
}
