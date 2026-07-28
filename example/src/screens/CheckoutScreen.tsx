import {
  MiddlewareSanitizedView,
  MiddlewareRum,
} from '@middleware.io/middleware-react-native';
import * as React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCart } from '../CartContext';

/**
 * Checkout with payment fields wrapped in MiddlewareSanitizedView — these are
 * masked (blacked out) in the v3 session recording.
 */
export default function CheckoutScreen({ navigation }: any) {
  const { total, clearCart } = useCart();
  const [name, setName] = React.useState('');
  const [card, setCard] = React.useState('');
  const [expiry, setExpiry] = React.useState('');
  const [cvv, setCvv] = React.useState('');

  const placeOrder = () => {
    // demo: instrumented POST — exercised by network instrumentation
    fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total }),
    }).catch(() => {});
    MiddlewareRum.info(`Order placed: $${total.toFixed(2)}`);
    clearCart();
    navigation.replace('OrderConfirmation', { total });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Name on card</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Jane Appleseed"
      />

      <Text style={styles.label}>Card number</Text>
      <MiddlewareSanitizedView>
        <TextInput
          style={styles.input}
          value={card}
          onChangeText={setCard}
          placeholder="4242 4242 4242 4242"
          keyboardType="number-pad"
        />
      </MiddlewareSanitizedView>

      <View style={styles.rowFields}>
        <View style={styles.rowField}>
          <Text style={styles.label}>Expiry</Text>
          <MiddlewareSanitizedView>
            <TextInput
              style={styles.input}
              value={expiry}
              onChangeText={setExpiry}
              placeholder="12/29"
            />
          </MiddlewareSanitizedView>
        </View>
        <View style={styles.rowField}>
          <Text style={styles.label}>CVV</Text>
          <MiddlewareSanitizedView>
            <TextInput
              style={styles.input}
              value={cvv}
              onChangeText={setCvv}
              placeholder="123"
              keyboardType="number-pad"
              secureTextEntry
            />
          </MiddlewareSanitizedView>
        </View>
      </View>

      <Pressable style={styles.button} onPress={placeOrder}>
        <Text style={styles.buttonText}>Pay ${total.toFixed(2)}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },
  rowFields: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1 },
  button: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
