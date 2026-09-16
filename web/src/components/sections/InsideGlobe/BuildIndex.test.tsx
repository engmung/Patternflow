import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import BuildFilters from './BuildFilters';
import BuildIndex from './BuildIndex';
import BuildRouteSync from './BuildRouteSync';
import { builds } from './builds';

beforeEach(() => {
  useAppStore.setState({ selectedBuildId: null, insideFilter: 'all' });
  window.history.replaceState(null, '', '/inside');
});

function mount(buildId: string | null = null) {
  render(<><BuildRouteSync buildId={buildId} /><BuildFilters /><BuildIndex /></>);
  return within(screen.getByRole('list', { name: 'Patternflow around the world' }));
}

describe('Inside browsing', () => {
  it('shows every entry as a text link and filters to projects', () => {
    const list = mount();
    expect(list.getAllByRole('link')).toHaveLength(builds.length);
    expect(list.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    expect(list.getAllByRole('link')).toHaveLength(2);
    expect(list.getByRole('link', { name: /MOTIFLOW/ })).toHaveAttribute('href', '/inside/azmano-iran');
    expect(list.getByRole('link', { name: /Raspberry Pi port/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projects' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('preserves a matching selection and clears a hidden pin and its URL', () => {
    const list = mount();
    fireEvent.click(list.getByRole('link', { name: /MOTIFLOW/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    expect(useAppStore.getState().selectedBuildId).toBe('iran-azmano');
    expect(window.location.pathname).toBe('/inside/azmano-iran');
    fireEvent.click(screen.getByRole('button', { name: 'In use' }));
    expect(useAppStore.getState().selectedBuildId).toBeNull();
    expect(window.location.pathname).toBe('/inside');
    expect(list.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('No entries in this category yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Builds' }));
    expect(list.getByRole('link', { name: /In the DJ booth/ })).toBeInTheDocument();
  });

  it('reveals a directly linked entry even after browsing another category', () => {
    useAppStore.setState({ insideFilter: 'builds' });
    const list = mount('iran-azmano');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(list.getByRole('link', { name: /MOTIFLOW/ })).toHaveAttribute('aria-current', 'true');
  });

  it('reveals a pin restored by browser history without pushing another URL', () => {
    const list = mount();
    fireEvent.click(screen.getByRole('button', { name: 'In use' }));
    act(() => {
      window.history.replaceState(null, '', '/inside/day-france');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(window.location.pathname).toBe('/inside/day-france');
    expect(list.getByRole('link', { name: /Raspberry Pi port/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });
});
