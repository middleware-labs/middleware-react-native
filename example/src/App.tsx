import {
  MiddlewareWrapper,
  startNavigationTracking,
  type ReactNativeConfiguration,
} from '@middleware.io/middleware-react-native';
import * as React from 'react';
import { Pressable, Text } from 'react-native';

import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CartProvider } from './CartContext';
import CartScreen from './screens/CartScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import MenuScreen from './screens/MenuScreen';
import OrderConfirmationScreen from './screens/OrderConfirmationScreen';
import ProductDetailScreen from './screens/ProductDetailScreen';
import RumLabScreen from './screens/RumLabScreen';

const MiddlewareConfig: ReactNativeConfiguration = {
  serviceName: 'CoffeeCart-ReactNative',
  projectName: 'CoffeeCart-ReactNative',
  accountKey: '<target>',
  target: '<accountKey>',
  sessionRecording: true,
  sessionSamplingRatio: 1.0,
  recordingOptions: {
    frequency: 'standard',
    quality: 'standard',
    maskAllTextInputs: false,
    maskAllImages: false,
  },
  debug: true,
  deploymentEnvironment: 'PROD',
  globalAttributes: {
    'app.flavor': 'coffee-cart',
  },
};

const Stack = createNativeStackNavigator();

export default function App() {
  const navigationRef = useNavigationContainerRef();
  return (
    <MiddlewareWrapper configuration={MiddlewareConfig}>
      <CartProvider>
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            startNavigationTracking(navigationRef);
          }}
        >
          <Stack.Navigator>
            <Stack.Screen
              name="Menu"
              component={MenuScreen}
              options={({ navigation }) => ({
                title: 'Coffee Cart ☕',
                headerLeft: () => (
                  <Pressable onPress={() => navigation.navigate('RumLab')}>
                    <Text>🧪</Text>
                  </Pressable>
                ),
              })}
            />
            <Stack.Screen
              name="ProductDetail"
              component={ProductDetailScreen}
              options={{ title: 'Product' }}
            />
            <Stack.Screen name="Cart" component={CartScreen} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen
              name="OrderConfirmation"
              component={OrderConfirmationScreen}
              options={{ title: 'Confirmation', headerBackVisible: false }}
            />
            <Stack.Screen
              name="RumLab"
              component={RumLabScreen}
              options={{ title: 'RUM Lab' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </CartProvider>
    </MiddlewareWrapper>
  );
}
