// runs with vitest --globals inside the fixture, so no vitest import
import { add } from '../src/math';

describe('math', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
