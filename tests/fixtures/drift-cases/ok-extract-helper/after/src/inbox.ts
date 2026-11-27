export interface Item {
  title: string;
  at: number;
}

function newestFirst(a: Item, b: Item): number {
  return b.at - a.at;
}

export function inboxOrder(items: Item[]): Item[] {
  const copy = items.slice();
  copy.sort(newestFirst);
  return copy;
}
