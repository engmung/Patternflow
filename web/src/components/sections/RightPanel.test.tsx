import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { SectionContent } from '@/lib/content';
import RightPanel from './RightPanel';

// The section tabs on /, /build, /pattern and /inside. The desktop column and
// the phone's bar are two navs with one label, and CSS shows one at a time;
// either way the open tab reads as pressed, its ✕ stays out of its name, and
// the panel under them is the page's main landmark.

vi.mock('./Hero', () => ({ default: () => <section>hero</section> }));
vi.mock('./Sponsor', () => ({ default: () => null }));
vi.mock('../layout/Footer', () => ({ default: () => null }));
vi.mock('./BuildPanel', () => ({ default: () => <section>build panel</section> }));
vi.mock('./PatternPanel', () => ({
  default: ({ isActive }: { isActive: boolean }) => (
    <section data-testid="pattern-panel" data-active={String(isActive)}>
      pattern panel
    </section>
  ),
}));
vi.mock('./InsidePanel', () => ({ default: () => <section>inside panel</section> }));
vi.mock('@/lib/posthogEvents', () => ({ captureEvent: () => {} }));

const content: SectionContent = { title: '', subtitle: '', content: '' };

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal('scrollTo', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string, tab: 'hero' | 'build' | 'pattern' | 'inside') {
  window.history.replaceState(null, '', path);
  return render(
    <RightPanel initialTab={tab} buildContent={content} patternContent={content} insideContent={content} />,
  );
}

const pressed = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent?.replace('✕', ''));

describe('RightPanel', () => {
  it('names both tab rows Sections and marks the open tab pressed in each', () => {
    renderAt('/build', 'build');
    const navs = screen.getAllByRole('navigation', { name: 'Sections' });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      expect(pressed(nav)).toEqual(['Build']);
      for (const name of ['Pattern', 'Inside']) {
        expect(within(nav).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
      }
    }
  });

  it('keeps the ✕ on the open desktop tab out of its name', () => {
    renderAt('/build', 'build');
    const [desktop] = screen.getAllByRole('navigation', { name: 'Sections' });
    const build = within(desktop).getByRole('button', { name: 'Build' });
    expect(build).toHaveTextContent('✕');
    expect(build).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves pressed with a click, and a second click on the open tab closes it', () => {
    renderAt('/', 'hero');
    const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Sections' });
    expect(pressed(desktop)).toEqual([]);

    fireEvent.click(within(desktop).getByRole('button', { name: 'Pattern' }));
    expect(pressed(desktop)).toEqual(['Pattern']);
    expect(pressed(phone)).toEqual(['Pattern']);
    expect(window.location.pathname).toBe('/pattern');

    fireEvent.click(within(desktop).getByRole('button', { name: 'Pattern' }));
    expect(pressed(desktop)).toEqual([]);
    expect(window.location.pathname).toBe('/');
  });

  it('puts the panels in one main, outside the tabs', () => {
    renderAt('/inside', 'inside');
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('inside panel');
    for (const nav of screen.getAllByRole('navigation', { name: 'Sections' })) {
      expect(main.contains(nav)).toBe(false);
    }
  });

  it('tells the Pattern panel when its tab is open, so the editor waits for it', () => {
    renderAt('/', 'hero');
    const panel = screen.getByTestId('pattern-panel');
    expect(panel).toHaveAttribute('data-active', 'false');

    const [desktop] = screen.getAllByRole('navigation', { name: 'Sections' });
    fireEvent.click(within(desktop).getByRole('button', { name: 'Pattern' }));
    expect(panel).toHaveAttribute('data-active', 'true');

    fireEvent.click(within(desktop).getByRole('button', { name: 'Build' }));
    expect(panel).toHaveAttribute('data-active', 'false');
  });
});
