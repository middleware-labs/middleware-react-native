import { MiddlewareRum } from '@middleware.io/middleware-react-native';
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';

export default function Details() {
  const [customUrl, setCustomUrl] = useState(
    'https://demo.mw.dev/product/2ZYFJ3GM2N'
  );

  const rnFetch = async () => {
    try {
      const url = 'https://www.middleware.io/';
      await fetch(url);
    } catch (error) {
      console.error(error);
    }
  };
  const customFetch = async () => {
    try {
      console.log('custom fetch with: ', customUrl);
      if (customUrl) {
        await fetch(customUrl);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const throwError = () => {
    throw new TypeError('custom typeError');
  };

  return (
    // eslint-disable-next-line react-native/no-inline-styles
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Details Screen</Text>
      <Button
        title="RN fetch GET"
        onPress={rnFetch}
        accessibilityLabel="fetch"
        testID="fetch"
      />
      <Button
        title="JS error"
        onPress={throwError}
        accessibilityLabel="jsError"
        testID="jsError"
      />
      <TextInput
        style={styles.input}
        onChangeText={setCustomUrl}
        value={customUrl}
      />
      <Button
        title="Fetch custom"
        onPress={customFetch}
        accessibilityLabel="fetchCustom"
        testID="fetchCustom"
      />
      <Button
        title="Application Not Responding"
        onPress={MiddlewareRum._testNativeAnr}
        accessibilityLabel="applicationNotResponding"
        testID="applicationNotResponding"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
  },
});
