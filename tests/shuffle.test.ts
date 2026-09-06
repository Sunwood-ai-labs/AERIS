import test from 'node:test';
import assert from 'node:assert/strict';
import { ShuffleDeck } from '../ui/shuffle';

test('random loop visits all images each cycle without consecutive repeats at seams', () => {
  for (const random of [() => 0, () => .999999, Math.random]) {
    const deck = new ShuffleDeck(3, random);
    let previous = -1;
    for (let cycle = 0; cycle < 200; cycle++) {
      const seen = new Set<number>();
      for (let i = 0; i < 3; i++) {
        const next = deck.next();
        assert.notEqual(next, previous);
        assert.ok(next >= 0 && next < 3);
        seen.add(next); previous = next;
      }
      assert.equal(seen.size, 3);
    }
  }
});
