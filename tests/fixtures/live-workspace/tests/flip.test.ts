// the end-to-end script flips this to failing by editing the expected text
import { greet } from '../src/greet';

it('greets by name', () => {
  expect(greet('quinn')).toBe('hello quinn');
});
