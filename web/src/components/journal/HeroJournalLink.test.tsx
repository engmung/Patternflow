import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import HeroJournalLink from './HeroJournalLink';

// The site's nav, top right of the hero on a desktop and on a phone. The shop
// is on its own host and opens in a new tab, as Get One does.

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const capture = vi.fn();
vi.mock('@/lib/posthogEvents', () => ({
  captureEvent: (...args: unknown[]) => capture(...args),
}));

beforeEach(() => capture.mockClear());

const nav = () => screen.getByRole('navigation', { name: 'Patternflow pages' });

describe('HeroJournalLink', () => {
  it('links the shop in a new tab', () => {
    render(<HeroJournalLink />);
    const shop = within(nav()).getByRole('link', { name: 'Shop' });
    expect(shop.getAttribute('href')).toBe('https://shop.patternflow.work');
    expect(shop.getAttribute('target')).toBe('_blank');
    expect(shop.getAttribute('rel')).toBe('noopener');
    expect(shop.className).toBe('shop-link');
  });

  it('puts the shop after the pages and before Instagram', () => {
    render(<HeroJournalLink />);
    const names = within(nav()).getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? a.textContent);
    expect(names).toEqual(['Guide', 'Journal', 'Community', 'Shop', 'Patternflow Instagram']);
  });

  it('counts a click on the shop', () => {
    render(<HeroJournalLink />);
    fireEvent.click(within(nav()).getByRole('link', { name: 'Shop' }));
    expect(capture).toHaveBeenCalledWith('shop_clicked', { surface: 'site_nav', destination: 'shop' });
  });

  it('sends the shop link from the server', () => {
    const html = renderToString(<HeroJournalLink />);
    expect(html).toContain('<a href="https://shop.patternflow.work" target="_blank" rel="noopener" class="shop-link">Shop</a>');
  });
});
