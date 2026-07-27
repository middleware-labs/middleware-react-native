import { MiddlewareRum } from '@middleware.io/middleware-react-native';
import * as React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCart } from '../CartContext';

export default function CartScreen({ navigation }: any) {
  const { items, removeFromCart, total, count } = useCart();

  React.useEffect(() => {
    // demo: cart size as a global attribute on all subsequent telemetry
    MiddlewareRum.setGlobalAttributes({ 'cart.size': count });
  }, [count]);

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Your cart is empty ☕</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.product.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.emoji}>{item.product.emoji}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{item.product.name}</Text>
              <Text style={styles.quantity}>x{item.quantity}</Text>
            </View>
            <Text style={styles.price}>
              ${(item.product.price * item.quantity).toFixed(2)}
            </Text>
            <Pressable onPress={() => removeFromCart(item.product.id)}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        )}
      />
      <View style={styles.footer}>
        <Text style={styles.total}>Total: ${total.toFixed(2)}</Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('Checkout')}
        >
          <Text style={styles.buttonText}>Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 17, color: '#666' },
  container: { flex: 1 },
  list: { padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  emoji: { fontSize: 24, marginRight: 10 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  quantity: { fontSize: 14, color: '#666', marginLeft: 8 },
  price: { fontSize: 15, fontWeight: '600', marginRight: 12 },
  remove: { fontSize: 16, color: '#dc2626', padding: 4 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  total: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
