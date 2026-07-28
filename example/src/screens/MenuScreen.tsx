import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCart } from '../CartContext';
import { PRODUCTS, type Product } from '../data/products';

/**
 * Product list. The fetch below exists to exercise the SDK's network
 * instrumentation (the menu itself is local).
 */
export default function MenuScreen({ navigation }: any) {
  const { count } = useCart();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // network span demo: instrumented fetch on screen load
    fetch('https://jsonplaceholder.typicode.com/posts/1')
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('Cart')}
          style={styles.cartButton}
        >
          <Text style={styles.cartButtonText}>🛒 {count}</Text>
        </Pressable>
      ),
    });
  }, [navigation, count]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={PRODUCTS}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }: { item: Product }) => (
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
        >
          <Text style={styles.emoji}>{item.emoji}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
  },
  emoji: { fontSize: 32, marginRight: 12 },
  cardBody: { flex: 1 },
  name: { fontSize: 17, fontWeight: '600' },
  description: { fontSize: 13, color: '#666', marginTop: 2 },
  price: { fontSize: 16, fontWeight: '700', color: '#4f46e5' },
  cartButton: { paddingHorizontal: 8 },
  cartButtonText: { fontSize: 16 },
});
