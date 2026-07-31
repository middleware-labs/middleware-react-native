import { MiddlewareRum } from '@middleware.io/middleware-react-native';
import { context, trace } from '@opentelemetry/api';
import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

/**
 * Interactive SDK feature lab, mirroring the native samples' RumLab screens.
 */
export default function RumLabScreen() {
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  const customSpan = () => {
    const tracer = trace.getTracer('rum-lab');
    const workflow = tracer.startSpan('order.workflow', {
      attributes: { 'workflow.name': 'order.workflow', 'component': 'lab' },
    });
    context.with(trace.setSpan(context.active(), workflow), () => {
      tracer.startSpan('order.workflow.step').end();
    });
    workflow.end();
  };

  const jsError = () => {
    try {
      throw new Error('CoffeeCart lab: handled JS error');
    } catch (error) {
      MiddlewareRum.reportError(error);
    }
  };

  const jsCrash = () => {
    // uncaught — reaches the SDK's global error handler
    setTimeout(() => {
      throw new Error('CoffeeCart lab: uncaught JS error');
    }, 0);
  };

  const rows: Array<[string, () => void]> = [
    ['Custom workflow span', customSpan],
    [
      'Instrumented fetch',
      () => {
        fetch('https://jsonplaceholder.typicode.com/todos/1').catch(() => {});
      },
    ],
    ['Handled JS error', jsError],
    ['Uncaught JS error', jsCrash],
    ['Native crash', () => MiddlewareRum._testNativeCrash()],
    ['Native ANR (android)', () => MiddlewareRum._testNativeAnr()],
    ['Log info', () => MiddlewareRum.info('CoffeeCart lab: info log')],
    ['Log warn', () => MiddlewareRum.warn('CoffeeCart lab: warn log')],
    ['Log error', () => MiddlewareRum.error('CoffeeCart lab: error log')],
    ['Log debug', () => MiddlewareRum.debug('CoffeeCart lab: debug log')],
    ['New session', () => MiddlewareRum._generatenewSessionId()],
    [
      'Show session id',
      () => {
        const id = MiddlewareRum.getSessionId();
        setSessionId(id);
        Alert.alert('Session ID', id);
      },
    ],
    ['Update location', () => MiddlewareRum.updateLocation(23.03, 72.58)],
    [
      'Start recording',
      () => {
        MiddlewareRum.startRecording().then((started) =>
          Alert.alert('Session recording', started ? 'started' : 'not started')
        );
      },
    ],
    [
      'Stop recording',
      () => {
        MiddlewareRum.stopRecording().then((stopped) =>
          Alert.alert('Session recording', stopped ? 'stopped' : 'not stopped')
        );
      },
    ],
    [
      'Is recording?',
      () => {
        MiddlewareRum.isRecording().then((recording) =>
          Alert.alert('Session recording', recording ? 'running' : 'stopped')
        );
      },
    ],
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {rows.map(([label, onPress]) => (
        <Pressable key={label} style={styles.button} onPress={onPress}>
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
      ))}
      {sessionId ? (
        <Text style={styles.session}>session: {sessionId}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  button: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  buttonText: { fontSize: 15, fontWeight: '500' },
  session: { marginTop: 12, fontSize: 12, color: '#666' },
});
