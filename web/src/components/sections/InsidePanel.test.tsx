import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { SectionContent } from '@/lib/content';
import { useAppStore } from '@/store/useAppStore';
import InsidePanel from './InsidePanel';

// The Inside tab. On /inside the hero's h1 is inert (RightPanel.tsx), so the
// panel's title is the page's h1.

const content: SectionContent = { title: 'Inside the work.', subtitle: '', content: '' };

beforeEach(() => {
  useAppStore.setState({ selectedBuildId: null, insideFilter: 'all' });
  window.history.replaceState(null, '', '/inside');
});

describe('InsidePanel', () => {
  it('titles the page with its one h1', () => {
    render(<InsidePanel content={content} />);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Inside the work.']);
  });

  it('falls back to its own title when the content has none', () => {
    render(<InsidePanel content={{ ...content, title: '' }} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inside the work.');
  });

  it('ends with the shop among the links to more of Patternflow', () => {
    render(<InsidePanel content={content} />);
    const more = screen.getByRole('navigation', { name: 'More from Patternflow' });
    const links = within(more).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Journal ↗', 'Project map ↗', 'Shop ↗']);
    const shop = links[2];
    expect(shop.getAttribute('href')).toBe('https://shop.patternflow.work');
    expect(shop.getAttribute('target')).toBe('_blank');
    expect(shop.getAttribute('rel')).toBe('noopener');
  });
});
