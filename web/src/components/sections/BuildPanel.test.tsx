import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import type { SectionContent } from '@/lib/content';
import BuildPanel from './BuildPanel';

// The Build panel's case switch: four tabs over one card, the official case
// first; switching changes the card, step 01 and the Start here row, writes
// ?case= while /build is on screen, and a ?case= link opens on that case. The
// case lives in the app store, where the 3D preview reads it, so the switch
// writes the store and the card follows whatever the store holds.

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

// The real one hands a GLB to drei's loader; jsdom has no WebGL, and the
// panel only needs to have asked.
const preload = vi.fn();
vi.mock('@/components/3d/preloadCaseModel', () => ({
  preloadCaseModel: (...args: unknown[]) => preload(...args),
}));

const content: SectionContent = {
  title: 'Build your own.',
  subtitle: 'Around US$100–200 and an hour of hands-on work.',
  content: 'Every case here holds the same v3 board.',
};

const GH = 'https://github.com/engmung/Patternflow';
const MAKERWORLD =
  'https://makerworld.com/en/models/3072492-patternflow-open-source-led-synthesizer-case#profileId-3459015';

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // The store outlives a render the way it outlives a panel on the page, so
  // each test starts from a fresh page's.
  useAppStore.setState({ buildStep: 0, explode: 1, buildCase: 'official', caseFinish: {} });
  window.history.replaceState(null, '', '/build');
  capture.mockClear();
  preload.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const card = () => within(screen.getByRole('tabpanel'));
const readme = () => card().queryByRole('link', { name: /Read its README on GitHub/ });
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const stepOne = () => screen.getAllByRole('button').find((el) => el.textContent?.startsWith('01'));
// The case row under Start here: step 01's title, then where it goes.
const startRow = (name: RegExp) =>
  within(screen.getByText('Start here').parentElement as HTMLElement).getByRole('link', { name });

describe('the case switch', () => {
  it('opens on the official case, with the build.md lead above it', () => {
    render(<BuildPanel content={content} isActive />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(tab(/Official/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Besoiobiy/)).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Every case here holds the same v3 board.')).toBeInTheDocument();
    expect(card().getByRole('heading', { name: 'The official printed case' })).toBeInTheDocument();
    expect(card().getByRole('link', { name: /One-click print profiles/ })).toHaveAttribute(
      'href',
      expect.stringContaining('makerworld.com/en/models/3072492'),
    );
    expect(card().queryByText(/The 3D model on this page is the official case/)).not.toBeInTheDocument();
    // The official case's guide is the build guide, not a README of its own.
    expect(readme()).not.toBeInTheDocument();
    expect(card().getByText(/printing in section 4, assembly in section 6/)).toBeInTheDocument();
    expect(useAppStore.getState().buildCase).toBe('official');
    // Start here keeps the MakerWorld shortcut while the official case is on.
    expect(startRow(/^Print the case\s*MakerWorld/)).toHaveAttribute('href', MAKERWORLD);
    // The official case has its own check: the adjustable mount is not universal.
    expect(card().getByText(/is not universal/)).toBeInTheDocument();
    expect(card().getByRole('link', { name: /How to check/ })).toHaveAttribute(
      'href',
      `${GH}/blob/main/hardware/case/README.md#for_other_panels--using-a-different-led-panel`,
    );
    expect(stepOne()).toHaveTextContent('Print the body in white PLA and the knobs in black');
  });

  it("shows Besoiobiy's author, material, fit, photos and files at once", () => {
    render(<BuildPanel content={content} isActive />);
    fireEvent.click(tab(/Besoiobiy/));
    expect(tab(/Besoiobiy/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Official/)).toHaveAttribute('tabindex', '-1');
    const panel = card();
    expect(panel.getByRole('heading', { name: 'Besoiobiy’s printed case' })).toBeInTheDocument();
    expect(panel.getByText('Community remix')).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'Besoiobiy' })).toHaveAttribute('href', 'https://discord.gg/Vr9QtsxeTk');
    expect(panel.getByText(/Bambu Lab P1S/)).toBeInTheDocument();
    expect(panel.getByText(/M3 sockets on Besoiobiy’s hole pattern, ending 14\.35 mm behind the LED face/)).toBeInTheDocument();
    expect(panel.getByRole('link', { name: /How to check/ })).toHaveAttribute(
      'href',
      `${GH}/blob/main/hardware/case/remixes/besoiobiy-printed/README.md#check-your-panel-first`,
    );
    expect(panel.getByText(/takes M4 screws on a different pattern/)).toBeInTheDocument();
    // The preview now shows the picked case, so the card no longer says it
    // is the official one; it says what the model of this one is made from.
    expect(panel.queryByText(/The 3D model on this page is the official case/)).not.toBeInTheDocument();
    expect(panel.getByText('The 3D view puts it together from its STL files.')).toBeInTheDocument();
    expect(useAppStore.getState().buildCase).toBe('besoiobiy-printed');
    // The remix's guide is its README, and the card leads with it.
    expect(readme()).toHaveAttribute(
      'href',
      `${GH}/blob/main/hardware/case/remixes/besoiobiy-printed/README.md`,
    );
    expect(panel.getByText(/It replaces sections 4 and 6 of the build guide/)).toBeInTheDocument();
    expect(panel.getAllByRole('img')).toHaveLength(2);
    expect(panel.getByRole('link', { name: /README and every file/ })).toHaveAttribute(
      'href',
      `${GH}/tree/main/hardware/case/remixes/besoiobiy-printed`,
    );
    expect(panel.getByRole('link', { name: /print_layout\.3mf/ })).toHaveAttribute(
      'href',
      `${GH}/blob/main/hardware/case/remixes/besoiobiy-printed/print_layout.3mf`,
    );
    for (const link of panel.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
    // Step 01 and the Start here row follow the switch.
    expect(stepOne()).toHaveTextContent('Print eight parts and four knob caps');
    expect(startRow(/^Print the case\s*besoiobiy-printed\//)).toHaveAttribute(
      'href',
      `${GH}/tree/main/hardware/case/remixes/besoiobiy-printed`,
    );
    expect(screen.queryByRole('link', { name: /MakerWorld/ })).not.toBeInTheDocument();
    expect(capture).toHaveBeenCalledWith('build_case_selected', {
      case_id: 'besoiobiy-printed',
      interaction: 'click',
      surface: 'build_panel',
    });
    fireEvent.click(readme() as HTMLElement);
    expect(capture).toHaveBeenCalledWith('build_case_link_opened', {
      case_id: 'besoiobiy-printed',
      target: 'README.md',
      surface: 'build_panel',
    });
  });

  it('moves along the tabs with the arrow keys, Home and End', () => {
    render(<BuildPanel content={content} isActive />);
    const official = tab(/Official/);
    official.focus();
    fireEvent.keyDown(official, { key: 'ArrowRight' });
    expect(tab(/Besoiobiy/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Besoiobiy/)).toHaveFocus();
    fireEvent.keyDown(tab(/Besoiobiy/), { key: 'ArrowRight' });
    expect(tab(/SimonePDA/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/SimonePDA/)).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/SimonePDA/);
    expect(card().getByRole('heading', { name: 'Simone Majocchi’s laser-cut case' })).toBeInTheDocument();
    expect(card().getByRole('link', { name: 'Simone Majocchi' })).toHaveAttribute('href', 'https://github.com/SimonePDA');
    expect(card().getByText(/2\.8 mm MDF, laser cut/)).toBeInTheDocument();
    expect(card().getByRole('link', { name: /lasercut_layout\.pdf/ })).toHaveAttribute(
      'href',
      `${GH}/blob/main/hardware/case/remixes/simonepda-lasercut/lasercut_layout.pdf`,
    );
    expect(readme()).toHaveAttribute('href', `${GH}/blob/main/hardware/case/remixes/simonepda-lasercut/README.md`);
    expect(card().getByText(/built to the drawing’s sizes/)).toBeInTheDocument();
    expect(useAppStore.getState().buildCase).toBe('simonepda-lasercut');
    expect(stepOne()).toHaveTextContent('Cut the case');
    expect(startRow(/^Cut the case\s*simonepda-lasercut\//)).toHaveAttribute(
      'href',
      `${GH}/tree/main/hardware/case/remixes/simonepda-lasercut`,
    );
    // false: the key was consumed, so End does not also scroll the panel.
    expect(fireEvent.keyDown(tab(/SimonePDA/), { key: 'End' })).toBe(false);
    expect(tab(/mbchars/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/mbchars/)).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/mbchars/);
    expect(card().getByRole('heading', { name: 'Mykyta Bilous’s horizontal desktop case' })).toBeInTheDocument();
    expect(card().getByRole('link', { name: 'Mykyta Bilous' })).toHaveAttribute('href', 'https://github.com/mbchars');
    expect(card().getByText(/Bambu Lab P2S/)).toBeInTheDocument();
    expect(card().getByRole('link', { name: /assembly\.md/ })).toHaveAttribute(
      'href',
      `${GH}/blob/main/hardware/case/remixes/mbchars-horizontal-desktop-printed/assembly.md`,
    );
    expect(readme()).toHaveAttribute(
      'href',
      `${GH}/blob/main/hardware/case/remixes/mbchars-horizontal-desktop-printed/README.md`,
    );
    expect(card().getByText(/puts it together from its STL files/)).toBeInTheDocument();
    expect(useAppStore.getState().buildCase).toBe('mbchars-horizontal-desktop-printed');
    expect(stepOne()).toHaveTextContent('Print the nine plates of the 3MF');
    expect(startRow(/^Print the case\s*mbchars-horizontal-desktop-printed\//)).toHaveAttribute(
      'href',
      `${GH}/tree/main/hardware/case/remixes/mbchars-horizontal-desktop-printed`,
    );
    fireEvent.keyDown(tab(/mbchars/), { key: 'ArrowRight' });
    expect(tab(/Official/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(/Official/), { key: 'ArrowLeft' });
    expect(tab(/mbchars/)).toHaveAttribute('aria-selected', 'true');
    expect(fireEvent.keyDown(tab(/mbchars/), { key: 'Home' })).toBe(false);
    expect(tab(/Official/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Official/)).toHaveFocus();
    // Home on the first tab picks nothing new, so it sends nothing: like a
    // click on the selected tab. It still keeps the page from scrolling.
    const selections = capture.mock.calls.filter(([name]) => name === 'build_case_selected').length;
    expect(fireEvent.keyDown(tab(/Official/), { key: 'Home' })).toBe(false);
    expect(tab(/Official/)).toHaveFocus();
    expect(capture.mock.calls.filter(([name]) => name === 'build_case_selected')).toHaveLength(selections);
    // Any other key is left alone.
    expect(fireEvent.keyDown(tab(/Official/), { key: 'Tab' })).toBe(true);
    expect(capture).toHaveBeenCalledWith('build_case_selected', expect.objectContaining({ interaction: 'key' }));
  });

  it('writes ?case= while /build is on screen, and drops it for the official case', () => {
    // Replaced, never pushed: Back would change the URL and not the card.
    const push = vi.spyOn(window.history, 'pushState');
    render(<BuildPanel content={content} isActive />);
    fireEvent.click(tab(/SimonePDA/));
    expect(window.location.pathname + window.location.search).toBe('/build?case=simonepda-lasercut');
    fireEvent.click(tab(/Besoiobiy/));
    expect(window.location.pathname + window.location.search).toBe('/build?case=besoiobiy-printed');
    fireEvent.click(tab(/Official/));
    expect(window.location.pathname + window.location.search).toBe('/build');
    expect(push).not.toHaveBeenCalled();
  });

  it('leaves the URL alone when the panel is mounted behind another tab', () => {
    window.history.replaceState(null, '', '/pattern');
    render(<BuildPanel content={content} isActive={false} />);
    fireEvent.click(tab(/Besoiobiy/));
    expect(window.location.pathname + window.location.search).toBe('/pattern');
    // The store still takes it: the preview on that tab shows the case too.
    expect(useAppStore.getState().buildCase).toBe('besoiobiy-printed');
  });

  it('opens on the case a /build?case= link names, and ignores one it does not know', () => {
    window.history.replaceState(null, '', '/build?case=besoiobiy-printed');
    const { unmount } = render(<BuildPanel content={content} isActive />);
    expect(tab(/Besoiobiy/)).toHaveAttribute('aria-selected', 'true');
    expect(useAppStore.getState().buildCase).toBe('besoiobiy-printed');
    unmount();
    // A link is a fresh page, and a fresh page's store is on the official
    // case: the case now outlives the panel, so reset it as a load would.
    useAppStore.setState({ buildCase: 'official' });
    window.history.replaceState(null, '', '/build?case=steel');
    render(<BuildPanel content={content} isActive />);
    expect(tab(/Official/)).toHaveAttribute('aria-selected', 'true');
    expect(useAppStore.getState().buildCase).toBe('official');
  });

  it('follows the store, so a case set anywhere else shows on the card', () => {
    render(<BuildPanel content={content} isActive />);
    act(() => useAppStore.getState().setBuildCase('simonepda-lasercut'));
    expect(tab(/SimonePDA/)).toHaveAttribute('aria-selected', 'true');
    expect(card().getByRole('heading', { name: 'Simone Majocchi’s laser-cut case' })).toBeInTheDocument();
    expect(stepOne()).toHaveTextContent('Cut the case');
  });

  it('takes the case from the URL on Back and Forward, and keeps it under a URL with none', () => {
    render(<BuildPanel content={content} isActive />);
    act(() => {
      window.history.replaceState(null, '', '/build?case=simonepda-lasercut');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(useAppStore.getState().buildCase).toBe('simonepda-lasercut');
    expect(tab(/SimonePDA/)).toHaveAttribute('aria-selected', 'true');
    // /pattern, /inside and / carry no case either; leaving for one of them
    // must not put the preview back on the official case.
    act(() => {
      window.history.replaceState(null, '', '/pattern');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(useAppStore.getState().buildCase).toBe('simonepda-lasercut');
  });

  it('puts the kept case back in the URL when the Build tab comes on screen', () => {
    // A remix picked earlier, then the reader went to Pattern: the panel was
    // remounted behind it, and the Build tab button pushes a bare /build.
    useAppStore.setState({ buildCase: 'besoiobiy-printed' });
    window.history.replaceState(null, '', '/pattern');
    const { rerender } = render(<BuildPanel content={content} isActive={false} />);
    expect(window.location.pathname + window.location.search).toBe('/pattern');
    window.history.pushState(null, '', '/build');
    rerender(<BuildPanel content={content} isActive />);
    expect(window.location.pathname + window.location.search).toBe('/build?case=besoiobiy-printed');
    expect(tab(/Besoiobiy/)).toHaveAttribute('aria-selected', 'true');
  });

  it('lets a case the URL names win when the Build tab comes back on screen', () => {
    // Back to an earlier /build?case=: the tab can come on before the panel's
    // own popstate listener has read the URL, and must not overwrite it.
    useAppStore.setState({ buildCase: 'besoiobiy-printed' });
    window.history.replaceState(null, '', '/pattern');
    const { rerender } = render(<BuildPanel content={content} isActive={false} />);
    window.history.replaceState(null, '', '/build?case=simonepda-lasercut');
    rerender(<BuildPanel content={content} isActive />);
    expect(window.location.pathname + window.location.search).toBe('/build?case=simonepda-lasercut');
    expect(useAppStore.getState().buildCase).toBe('simonepda-lasercut');
    expect(tab(/SimonePDA/)).toHaveAttribute('aria-selected', 'true');
  });

  it("starts loading a case's model when a pointer or focus reaches its tab", () => {
    render(<BuildPanel content={content} isActive />);
    fireEvent.pointerEnter(tab(/Besoiobiy/));
    expect(preload).toHaveBeenLastCalledWith('besoiobiy-printed');
    fireEvent.focus(tab(/SimonePDA/));
    expect(preload).toHaveBeenLastCalledWith('simonepda-lasercut');
    // The case on screen is loaded already.
    preload.mockClear();
    fireEvent.pointerEnter(tab(/Official/));
    fireEvent.focus(tab(/Official/));
    expect(preload).not.toHaveBeenCalled();
    // Prefetching is not picking.
    expect(useAppStore.getState().buildCase).toBe('official');
    expect(capture).not.toHaveBeenCalledWith('build_case_selected', expect.anything());
  });

  it('opens every photo of the case in the viewer', () => {
    render(<BuildPanel content={content} isActive />);
    fireEvent.click(tab(/SimonePDA/));
    fireEvent.click(card().getByRole('button', { name: 'All 4 photos' }));
    const dialog = screen.getByRole('dialog', { name: 'Build photos' });
    expect(within(dialog).getAllByRole('button', { name: /MDF|acrylic|board/ }).length).toBeGreaterThanOrEqual(4);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close gallery' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a card photo opens the viewer on that photo', () => {
    render(<BuildPanel content={content} isActive />);
    fireEvent.click(tab(/SimonePDA/));
    fireEvent.click(card().getByRole('button', { name: /cut in MDF and turned on its side/ }));
    const dialog = screen.getByRole('dialog', { name: 'Build photos' });
    expect(within(dialog).getByRole('button', { name: /cut in MDF and turned on its side/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('closes the viewer when the case changes under it, even past the new case’s last photo', () => {
    // Focus can still reach the tabs behind the viewer. Photo 4 of a remix
    // has no counterpart in the official case's three.
    window.history.replaceState(null, '', '/build?case=besoiobiy-printed');
    render(<BuildPanel content={content} isActive />);
    fireEvent.click(card().getByRole('button', { name: 'All 4 photos' }));
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    const dialog = screen.getByRole('dialog', { name: 'Build photos' });
    expect(within(dialog).getByRole('button', { name: /thirteen STL files/ })).toHaveAttribute('aria-current', 'true');
    fireEvent.keyDown(tab(/Besoiobiy/), { key: 'Home' });
    expect(tab(/Official/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the rest of the panel', () => {
  it('keeps the hover preview and points at the current routes', () => {
    render(<BuildPanel content={content} isActive />);
    fireEvent.click(screen.getByRole('button', { name: /Print the case/ }));
    expect(useAppStore.getState().buildStep).toBe(1);
    expect(screen.getByText('~10 hr')).toBeInTheDocument();
    expect(screen.queryByText(/~10–12 hr/)).not.toBeInTheDocument();
    expect(screen.getByText(/ESP32-S3 ~\$13/)).toBeInTheDocument();
    expect(screen.getByText(/Hand-solder the v3\.9 board/)).toBeInTheDocument();
    expect(screen.getByText(/power up through the screw terminal/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Before you buy the panel/ })).toHaveAttribute(
      'href',
      `${GH}/blob/main/docs/panel-compatibility.md`,
    );
    expect(screen.getByRole('link', { name: 'Breadboard guide' })).toHaveAttribute('href', '/build/breadboard');
    expect(screen.getByRole('link', { name: 'v2 board guide' })).toHaveAttribute('href', `${GH}/blob/main/BUILD_GUIDE_v2.md`);
    expect(screen.queryByText(/laser-cut, or an older/)).not.toBeInTheDocument();
  });
});
