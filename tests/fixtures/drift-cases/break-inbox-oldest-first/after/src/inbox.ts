export interface Item {
  title: string;
  at: number;
}

export function inboxOrder(items: Item[]): Item[] {
  return [...items].sort((a, b) => a.at - b.at);
}
