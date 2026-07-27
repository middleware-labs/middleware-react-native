import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCart } from '../CartContext';
import { PRODUCTS } from '../data/products';

export default function ProductDetailScreen({ route, navigation }: any) {
  const { addToCart } = useCart();
  const product = PRODUCTS.find((item) => item.id === route.params?.id);

  if (!product) {
    return (
      <View style={styles.center}>
        <Text>Product not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{product.emoji}</Text>
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.description}>{product.description}</Text>
      <Text style={styles.price}>${product.price.toFixed(2)}</Text>
      <Pressable
        style={styles.button}
        onPress={() => {
          addToCart(product);
          navigation.goBack();
        }}
      >
        <Text style={styles.buttonText}>Add to cart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, alignItems: 'center', padding: 24 },
  emoji: { fontSize: 72, marginTop: 24 },
  name: { fontSize: 26, fontWeight: '700', marginTop: 12 },
  description: {
    fontSize: 15,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  price: { fontSize: 22, fontWeight: '700', color: '#4f46e5', marginTop: 16 },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 28,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
