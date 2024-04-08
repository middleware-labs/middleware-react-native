import { RandomIdGenerator } from '@opentelemetry/sdk-trace-base';
import { AppState } from 'react-native';
import { trace, diag } from '@opentelemetry/api';
import { setNativeSessionId } from './native';

const idGenerator = new RandomIdGenerator();

interface Session {
  startTime: number;
  id: string;
}

let session: Session = {
  startTime: Date.now(),
  id: idGenerator.generateTraceId(),
};

const tracer = trace.getTracer('session');

const MAX_SESSION_AGE = 4 * 60 * 60 * 1000;
const SESSION_TIMEOUT = 5 * 60 * 1000;
const sessionLogging = false;
let lastActivityTime = Date.now();
const State = {
  FOREGROUND: 'active',
  BACKGROUND: 'background',
  TRANSITIONING_TO_FOREGROUND: 'transitioning',
};
let currentState: String = AppState.currentState;

AppState.addEventListener('change', (nextAppState) => {
  if (sessionLogging) {
    diag.debug('Session:AppStateChange: ', currentState, nextAppState);
  }
  if (nextAppState === State.FOREGROUND && currentState === State.BACKGROUND) {
    if (sessionLogging) {
      diag.debug('Session:AppStateChange:TRANSITIONING_TO_FOREGROUND');
    }
    currentState = State.TRANSITIONING_TO_FOREGROUND;
    return;
  }
  currentState = nextAppState;
});

export function getSessionId() {
  if (hasExpired() || hasTimedOut()) {
    bump();
    newSessionId();
  } else {
    bump();
  }
  return session.id;
}

function bump() {
  lastActivityTime = Date.now();
  if (sessionLogging) {
    diag.debug('Session:bump:', new Date(lastActivityTime));
  }
  if (currentState === State.TRANSITIONING_TO_FOREGROUND) {
    currentState = State.FOREGROUND;
  }
}

function hasTimedOut() {
  if (currentState === State.FOREGROUND) {
    if (sessionLogging) {
      diag.debug('Session:hasTimedOut: State.FOREGROUND');
    }
    return false;
  }
  const elapsedTime = Date.now() - lastActivityTime;
  if (sessionLogging) {
    diag.debug(
      'Session:hasTimedOut',
      elapsedTime,
      SESSION_TIMEOUT - elapsedTime
    );
  }
  return elapsedTime >= SESSION_TIMEOUT;
}

function hasExpired() {
  const timeElapsed = Date.now() - session.startTime;
  if (sessionLogging) {
    diag.debug(
      'Session:hasExpired',
      timeElapsed,
      MAX_SESSION_AGE - timeElapsed
    );
  }
  return Date.now() - session.startTime >= MAX_SESSION_AGE;
}

function newSessionId() {
  const previousId = session.id;
  session.startTime = Date.now();
  session.id = idGenerator.generateTraceId();
  setNativeSessionId(session.id);
  if (sessionLogging) {
    diag.debug('Session:newSessionId:', previousId, session.id);
  }
  const span = tracer.startSpan('sessionId.change', {
    attributes: {
      'previous.session.id': previousId,
    },
  });
  span.end();
}

export function _generatenewSessionId() {
  newSessionId();
  if (sessionLogging) {
    diag.debug('CLIENT:session:generateNewId: ', session.id);
  }
}
