import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

jest.mock('../native', () => ({ setNativeScreenName: jest.fn() }));
jest.mock('../globalAttributes', () => ({ setGlobalAttributes: jest.fn() }));

import { startNavigationTracking } from '../trackNavigation';

/** Minimal stand-in for React Navigation's container ref. */
function fakeNavigationRef(initial: string) {
  let route = { name: initial };
  let onState: () => void = () => {};
  return {
    getCurrentRoute: () => route,
    addListener: (_event: string, cb: () => void) => {
      onState = cb;
    },
    navigate(name: string) {
      route = { name };
      onState();
    },
  };
}

describe('startNavigationTracking', () => {
  const exporter = new InMemorySpanExporter();

  beforeAll(() => {
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    trace.setGlobalTracerProvider(provider);
  });

  it('emits one screen_view per screen change', () => {
    const ref = fakeNavigationRef('Home');
    startNavigationTracking(ref);
    ref.navigate('Cart');
    // A param-only update re-fires 'state' with the same route name.
    ref.navigate('Cart');
    ref.navigate('Home');

    const views = exporter.getFinishedSpans();
    expect(views.map((s) => s.name)).toEqual(['Home', 'Cart', 'Home']);
    for (const span of views) {
      expect(span.attributes['event.type']).toBe('screen_view');
      expect(span.attributes['screen.name']).toBe(span.name);
    }
    expect(views[0]?.attributes['last.screen.name']).toBeUndefined();
    expect(views[1]?.attributes['last.screen.name']).toBe('Home');
  });
});
