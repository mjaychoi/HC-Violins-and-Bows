/**
 * F6: regression tests against the *real* useURLState hook (not a
 * synchronously-populated mock). These exercise the actual
 * next/navigation integration - including a fake in-memory router that
 * mimics browser back/forward - so a regression in the hydration timing
 * or the self-triggered-update loop guard would be caught here instead of
 * only in a page-level test built on an already-correct mock.
 */
import { renderHook, act } from '@/test-utils/render';
import { useURLState } from '../useURLState';

// Minimal in-memory router that actually updates the URL `useSearchParams`
// reads from, so re-renders reflect real navigation - both from calling
// `router.replace()` (as the hook does) and from a simulated browser
// back/forward via `__setUrl`.
jest.mock('next/navigation', () => {
  const React: typeof import('react') = require('react');

  let currentUrl = 'http://localhost/connections';
  const listeners = new Set<() => void>();

  const setUrl = (url: string) => {
    currentUrl = url.startsWith('http')
      ? url
      : `http://localhost${url.startsWith('/') ? url : `/${url}`}`;
    listeners.forEach(listener => listener());
  };

  const router = {
    replace: jest.fn((url: string) => setUrl(url)),
    push: jest.fn((url: string) => setUrl(url)),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  };

  return {
    __esModule: true,
    useRouter: () => router,
    usePathname: () => new URL(currentUrl).pathname,
    useSearchParams: () => {
      const [, forceRender] = React.useState(0);
      React.useEffect(() => {
        const listener = () => forceRender(c => c + 1);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      return new URL(currentUrl).searchParams;
    },
    __setUrl: setUrl,
    __getUrl: () => currentUrl,
    __getRouter: () => router,
  };
});

// Access the test-only helpers exposed by the mock above.
const nav = jest.requireMock('next/navigation') as {
  __setUrl: (url: string) => void;
  __getUrl: () => string;
  __getRouter: () => { replace: jest.Mock };
};

describe('useURLState (real hook)', () => {
  beforeEach(() => {
    nav.__setUrl('http://localhost/connections');
    nav.__getRouter().replace.mockClear();
  });

  const config = {
    enabled: true,
    keys: ['search', 'filter', 'page'],
    paramMapping: { search: 'search', filter: 'filter', page: 'page' },
  };

  it('hydrates search/filter/page synchronously on initial mount - no lag', () => {
    nav.__setUrl(
      'http://localhost/connections?search=foo&filter=Booked&page=2'
    );

    const { result } = renderHook(() => useURLState(config));

    // No effect/act needed: the very first render must already reflect the URL.
    expect(result.current.urlState.search).toBe('foo');
    expect(result.current.urlState.filter).toBe('Booked');
    expect(result.current.urlState.page).toBe('2');
  });

  it('reflects a refresh (fresh mount) with the same URL', () => {
    nav.__setUrl('http://localhost/connections?search=bar&page=3');

    const { result, unmount } = renderHook(() => useURLState(config));
    expect(result.current.urlState.search).toBe('bar');
    expect(result.current.urlState.page).toBe('3');
    unmount();

    // Simulate a full page refresh: a brand new hook instance against the
    // same URL must produce the same initial state.
    const { result: afterRefresh } = renderHook(() => useURLState(config));
    expect(afterRefresh.current.urlState.search).toBe('bar');
    expect(afterRefresh.current.urlState.page).toBe('3');
  });

  it('updates urlState when the browser navigates back/forward externally', async () => {
    nav.__setUrl('http://localhost/connections?search=first');
    const { result } = renderHook(() => useURLState(config));
    expect(result.current.urlState.search).toBe('first');

    // Simulate the browser applying a back/forward navigation - this does
    // NOT go through the hook's own updateURLState/replace call.
    await act(async () => {
      nav.__setUrl('http://localhost/connections?search=second');
    });

    expect(result.current.urlState.search).toBe('second');
  });

  it('supports a direct bookmark URL on mount', () => {
    nav.__setUrl(
      'http://localhost/connections?search=bookmarked&filter=Owned&page=5'
    );

    const { result } = renderHook(() => useURLState(config));

    expect(result.current.urlState).toEqual({
      search: 'bookmarked',
      filter: 'Owned',
      page: '5',
    });
  });

  it('reports missing params as null rather than throwing on invalid state', () => {
    nav.__setUrl('http://localhost/connections?page=not-a-number');

    const { result } = renderHook(() => useURLState(config));

    // useURLState itself is filter/page-value agnostic - it just reflects
    // whatever string is present. Validating "not-a-number" as an invalid
    // page is the *consumer's* job (see the /connections page), so this
    // only asserts the hook faithfully passes the raw value through and
    // does not itself crash or silently drop it.
    expect(result.current.urlState.page).toBe('not-a-number');
    expect(result.current.urlState.search).toBeNull();
    expect(result.current.urlState.filter).toBeNull();
  });

  it('updateURLState writes params and does not create a self-triggering loop', async () => {
    nav.__setUrl('http://localhost/connections');
    const { result } = renderHook(() => useURLState(config));

    await act(async () => {
      result.current.updateURLState({ search: 'typed', page: null });
    });

    expect(nav.__getRouter().replace).toHaveBeenCalledTimes(1);
    expect(nav.__getUrl()).toContain('search=typed');
    expect(nav.__getUrl()).not.toContain('page=');

    // Calling updateURLState again with the exact same values must not
    // trigger another navigation (no-op guard against loops).
    await act(async () => {
      result.current.updateURLState({ search: 'typed' });
    });
    expect(nav.__getRouter().replace).toHaveBeenCalledTimes(1);
  });

  it('filter update through updateURLState clears the page param as requested by the caller', async () => {
    nav.__setUrl('http://localhost/connections?filter=Interested&page=3');
    const { result } = renderHook(() => useURLState(config));
    expect(result.current.urlState.filter).toBe('Interested');
    expect(result.current.urlState.page).toBe('3');

    await act(async () => {
      result.current.updateURLState({ filter: 'Booked', page: null });
    });

    expect(nav.__getUrl()).toContain('filter=Booked');
    expect(nav.__getUrl()).not.toContain('page=');
  });

  it('page update through updateURLState writes the new page', async () => {
    nav.__setUrl('http://localhost/connections');
    const { result } = renderHook(() => useURLState(config));

    await act(async () => {
      result.current.updateURLState({ page: '2' });
    });

    expect(nav.__getUrl()).toContain('page=2');
  });

  it('clearURLState removes all tracked keys', async () => {
    nav.__setUrl('http://localhost/connections?search=x&filter=Sold&page=4');
    const { result } = renderHook(() => useURLState(config));

    await act(async () => {
      result.current.clearURLState();
    });

    expect(nav.__getUrl()).not.toContain('search=');
    expect(nav.__getUrl()).not.toContain('filter=');
    expect(nav.__getUrl()).not.toContain('page=');
  });

  it('does not read from the URL when disabled', () => {
    nav.__setUrl('http://localhost/connections?search=hidden');

    const { result } = renderHook(() =>
      useURLState({ ...config, enabled: false })
    );

    expect(result.current.urlState).toEqual({});
  });
});
