import { MiddlewareRum } from '@middleware.io/middleware-react-native';
import { trace } from '@opentelemetry/api';
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function OrderConfirmationScreen({ route, navigation }: any) {
  const total: number = route.params?.total ?? 0;

  React.useEffect(() => {
    // demo: custom event span for the placed order
    const span = trace.getTracer('order').startSpan('order.placed', {
      attributes: {
        'event.type': 'order.placed',
        'order.total': total,
        'component': 'business',
      },
    });
    span.end();
    MiddlewareRum.info('Order confirmed');
  }, [total]);

  return (
    <View style={styles.center}>
      <Text style={styles.emoji}>✅</Text>
      <Text style={styles.title}>Order confirmed!</Text>
      <Text style={styles.subtitle}>
        Your ${total.toFixed(2)} order is being brewed.
      </Text>
      <Pressable style={styles.button} onPress={() => navigation.popToTop()}>
        <Text style={styles.buttonText}>Back to menu</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '700', marginTop: 16 },
  subtitle: { fontSize: 15, color: '#666', marginTop: 8, textAlign: 'center' },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 28,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
