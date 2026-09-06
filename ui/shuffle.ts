// A shuffled deck shows every image once before reshuffling, with no repeat
// at the seam between decks. Randomness can be injected for verification.
export class ShuffleDeck {
  private deck: number[] = [];
  private previous = -1;
  constructor(private count: number, private random = Math.random) {
    if (!Number.isInteger(count) || count < 1) throw new Error('Empty wallpaper deck');
  }
  next(): number {
    if (!this.deck.length) {
      this.deck = Array.from({ length: this.count }, (_, i) => i);
      for (let i = this.count - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
      const last = this.count - 1;
      if (this.count > 1 && this.deck[last] === this.previous) {
        [this.deck[0], this.deck[last]] = [this.deck[last], this.deck[0]];
      }
    }
    this.previous = this.deck.pop()!;
    return this.previous;
  }
}
