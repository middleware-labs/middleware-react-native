import { LAST_SCREEN_NAME, SCREEN_NAME } from './constants';
import { setGlobalAttributes } from './globalAttributes';
import { trace, diag, type Tracer } from '@opentelemetry/api';

let currentRouteName: string = 'none';
let tracer: Tracer;

export function getCurrentView() {
  return currentRouteName;
}

export function startNavigationTracking(navigationRef: any) {
  if (navigationRef) {
    tracer = trace.getTracer('uiChanges');
    const startingRoute = navigationRef.getCurrentRoute();
    if (startingRoute) {
      currentRouteName = startingRoute.name;
      createUiSpan(currentRouteName);
    }

    navigationRef.addListener('state', () => {
      const previous = currentRouteName;
      const route = navigationRef.getCurrentRoute();
      if (route) {
        currentRouteName = route.name;
        createUiSpan(currentRouteName, previous);
      }
    });
  } else {
    diag.debug('Navigation: navigationRef missing');
  }
}

function createUiSpan(current: string, previous?: string) {
  setGlobalAttributes({ [SCREEN_NAME]: current });
  const span = tracer.startSpan('Created');
  span.setAttribute('component', 'ui');
  span.setAttribute('event.type', 'app_activity');
  if (previous) {
    span.setAttribute(LAST_SCREEN_NAME, previous);
  }
  span.end();
}
