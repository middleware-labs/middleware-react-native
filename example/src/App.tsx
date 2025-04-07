import {
  MiddlewareWrapper,
  type ReactNativeConfiguration,
} from '@middleware.io/middleware-react-native';
import * as React from 'react';

import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Details from './Details';
import Home from './Home';
import { startNavigationTracking } from '../../src/trackNavigation';

const MiddlewareConfig: ReactNativeConfiguration = {
  serviceName: 'middleware-react-native',
  projectName: 'middleware-react-native',
  accountKey: 'rxglcfozmhcvgsgvbcrqxivfeogczvdrxkey',
  target: 'https://p2i13hg.middleware.io',
  sessionRecording: true,
  debug: true,
  deploymentEnvironment: 'PROD',
  globalAttributes: {
    name: 'Archish',
  },
};

const Stack = createNativeStackNavigator();

export default function App() {
  React.useEffect(() => {}, []);
  console.log('Developing');
  console.log('Developing');
  console.log('Developing');
  console.log('eveloping');
  console.log('Developing');
  const navigationRef = useNavigationContainerRef();
  return (
    <MiddlewareWrapper configuration={MiddlewareConfig}>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          startNavigationTracking(navigationRef);
        }}
      >
        <Stack.Navigator>
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Details" component={Details} />
        </Stack.Navigator>
      </NavigationContainer>
    </MiddlewareWrapper>
  );
}
