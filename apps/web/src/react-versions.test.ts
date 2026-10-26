import reactDom from 'react-dom/package.json' with { type: 'json' };
import react from 'react/package.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';

// react-dom refuses to run against any other react version (React error
// #527), which only shows up in a browser. CI doesn't run the browser render
// checks, so this is what stops a bump of one without the other.
describe('react and react-dom', () => {
  it('are the same version', () => {
    expect(reactDom.version).toBe(react.version);
  });
});
