export interface Line {
  price: number;
  qty: number;
  discount: number;
}

export function cartTotal(lines: Line[]): number {
  const sum = lines.reduce((acc, line) => acc + line.price * line.qty - line.discount, 0);
  return Math.max(0, sum);
}
