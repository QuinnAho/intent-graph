import { describe, expect, it } from 'vitest';

import { buildPanelHtml, pageUrl } from '../src/panel-html.js';

const address = { url: 'http://127.0.0.1:53493/', origin: 'http://127.0.0.1:53493', port: 53493 };
const nonce = 'Abc123Def456Ghi789Jkl012Mno345Pq';

function policyOf(html: string): string {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  if (!m?.[1]) throw new Error('no policy');
  return m[1];
}

describe('buildPanelHtml', () => {
  const html = buildPanelHtml({ address, src: pageUrl(address, null), nonce });

  it('frames only the one server address', () => {
    const policy = policyOf(html);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain('frame-src http://127.0.0.1:53493;');
    expect(policy).not.toMatch(/frame-src[^;]*\*/);
    expect(policy.match(/127\.0\.0\.1:\d+/g)).toEqual(['127.0.0.1:53493']);
  });

  it('runs scripts only with the nonce', () => {
    const policy = policyOf(html);
    expect(policy).toContain(`script-src 'nonce-${nonce}'`);
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBe(1);
    for (const s of scripts) expect(s).toContain(`nonce="${nonce}"`);
  });

  it('holds no inline handler', () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toContain('javascript:');
  });

  it('has one iframe to the page', () => {
    expect(html.match(/<iframe\b/g)?.length).toBe(1);
    expect(html).toContain('src="http://127.0.0.1:53493/"');
  });

  it('relays only intentgraph messages from its own iframe', () => {
    expect(html).toContain('e.source !== frame.contentWindow');
    expect(html).toContain("startsWith('intentgraph.')");
    expect(html).toContain('const origin = "http://127.0.0.1:53493";');
    expect(html).toContain('e.origin !== origin');
  });

  it('refuses a nonce that could break out of the attribute', () => {
    expect(() => buildPanelHtml({ address, src: address.url, nonce: 'a" onload="x' })).toThrow();
  });

  it('refuses a page address on another origin', () => {
    expect(() => buildPanelHtml({ address, src: 'http://127.0.0.1:1/', nonce })).toThrow();
  });
});

describe('pageUrl', () => {
  it('adds the node to focus, escaped', () => {
    expect(pageUrl(address, null)).toBe('http://127.0.0.1:53493/');
    expect(pageUrl(address, 'intent-adds-numbers')).toBe('http://127.0.0.1:53493/?focus=intent-adds-numbers');
    expect(pageUrl(address, 'a"b&c<d')).toBe('http://127.0.0.1:53493/?focus=a%22b%26c%3Cd');
  });
});
