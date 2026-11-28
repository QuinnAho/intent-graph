export const MAX_TRIES = 3;

export class Retrier {
  tries = 0;
  again(): boolean {
    this.tries += 1;
    return this.tries < MAX_TRIES;
  }
}
