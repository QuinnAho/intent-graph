// rules behind the edit panel: when it can write, what it says when a write is refused,
// and which node it edits.
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { isDirty, pickEditNode, selectOnly, titleProblem } from '../src/app/edit-model.js';
import { NO_SERVER_REASON, NO_WRITE_REASON, editErrorMessage, readEditConfig } from '../src/transport/edit-api.js';

describe('readEditConfig', () => {
  it('is read only with no live server', () => {
    expect(readEditConfig(undefined)).toEqual({ api: null, write: false, token: null, readOnlyReason: NO_SERVER_REASON });
  });

  it('is read only when the server did not turn writes on', () => {
    const c = readEditConfig({ graph: '/graph.json', events: '/events', api: '/api', write: false });
    expect(c.write).toBe(false);
    expect(c.api).toBe('/api');
    expect(c.readOnlyReason).toBe(NO_WRITE_REASON);
  });

  it('writes only with a token', () => {
    expect(readEditConfig({ graph: '/graph.json', events: '/events', api: '/api', write: true }).write).toBe(false);
    const c = readEditConfig({ graph: '/graph.json', events: '/events', api: '/api', write: true, token: 'abc' });
    expect(c).toEqual({ api: '/api', write: true, token: 'abc', readOnlyReason: null });
  });
});

describe('editErrorMessage', () => {
  it('says plainly that nothing was saved', () => {
    expect(editErrorMessage(409, { error: 'duplicate', message: 'spec/intents/a.md already exists, pick another title' }).message).toBe(
      'Spec/intents/a.md already exists, pick another title. Nothing was saved.',
    );
    expect(editErrorMessage(403, { error: 'read-only', message: 'x' }).message).toMatch(/read only.*--write.*Nothing was saved/);
    expect(editErrorMessage(500, null)).toEqual({ error: 'http-500', message: 'The server refused the request (HTTP 500). Nothing was saved.' });
  });

  it('keeps the conflict message from the server as it is', () => {
    expect(editErrorMessage(409, { error: 'conflict', message: 'The file changed on disk.' })).toEqual({ error: 'conflict', message: 'The file changed on disk.' });
  });
});

describe('edit model', () => {
  const node = (id: string, type: string, selected?: boolean): Node => ({ id, type, position: { x: 0, y: 0 }, data: {}, ...(selected !== undefined ? { selected } : {}) });

  it('edits the one selected spec node and ignores code nodes', () => {
    expect(pickEditNode([node('a', 'intent', true), node('b', 'concept')])?.id).toBe('a');
    expect(pickEditNode([node('m', 'code_module', true)])).toBeNull();
    expect(pickEditNode([node('a', 'intent', true), node('b', 'intent', true)])).toBeNull();
    expect(pickEditNode([])).toBeNull();
  });

  it('marks text as unsaved only when it differs from what was loaded', () => {
    expect(isDirty(null, { title: 'x', body: '' })).toBe(false);
    expect(isDirty({ title: 'a', body: 'b\r\nc' }, { title: 'a', body: 'b\nc' })).toBe(false);
    expect(isDirty({ title: 'a', body: 'b' }, { title: 'a2', body: 'b' })).toBe(true);
    expect(isDirty({ title: 'a', body: 'b' }, { title: 'a', body: 'b!' })).toBe(true);
  });

  it('refuses an empty title before sending anything', () => {
    expect(titleProblem('   ')).toMatch(/empty/);
    expect(titleProblem('!!')).toMatch(/letter or number/);
    expect(titleProblem('Fine')).toBeNull();
  });

  it('selects a new node alone once it exists', () => {
    expect(selectOnly([node('a', 'intent', true)], 'b')).toBeNull();
    const next = selectOnly([node('a', 'intent', true), node('b', 'intent')], 'b')!;
    expect(next.map((n) => [n.id, n.selected === true])).toEqual([['a', false], ['b', true]]);
  });
});
