import { expect, test } from 'vitest'
import { assertIsComponent } from '~/message_parsing.mjs';

test('empty object is not a component', () => {
    expect(() => assertIsComponent({})).toThrow();
});
