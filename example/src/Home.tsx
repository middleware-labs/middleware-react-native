import React from 'react';
import { StyleSheet, View, Button, Text } from 'react-native';
import { trace, context } from '@opentelemetry/api';
import Config from 'react-native-config';
import { MiddlewareRum } from '../../src/middlewareRum';

export default function Home({ navigation }: { navigation: any }) {
  const tracer = trace.getTracer('home');

  const createSpan = () => {
    const parent = tracer.startSpan('clickToFetch');
    parent.setAttributes({
      'component': 'user-interaction',
      'event.type': 'click',
      'label': 'Make custom span',
    });
    const ctx = trace.setSpan(context.active(), parent);

    context.with(ctx, async () => {
      await rnFetch();
    });

    parent.end();
  };

  const rnFetch = async () => {
    try {
      const url =
        'https://raw.githubusercontent.com/middleware-labs/middleware-android/main/README.md';
      await fetch(url);
      MiddlewareRum.info('RN fetch completed');
    } catch (error) {
      console.error(error);
    }
  };

  const rnFetchPost = async () => {
    try {
      const url = 'https://dog-api.kinduff.com/api/facts';
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dog: 'dog' }),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const fetchJSON = async () => {
    try {
      const url = 'https://dog-api.kinduff.com/api/facts';
      const res = await fetch(url);
      const json = res.json();
      console.log('json: ', json);
    } catch (error) {
      console.error(error);
    }
  };

  const throwError = () => {
    console.log('CLIENT:throwError');
    throw new Error('my nice custom error');
  };

  const workflowSpan = () => {
    const now = Date.now();
    const span = tracer.startSpan('click', { startTime: now });
    span.setAttributes({
      'component': 'user-interaction',
      'event.type': 'click',
      'workflow.name': 'CUSTOM_SPAN_1',
    });
    span.end(now + 5000);
  };

  return (
    <View style={styles.container}>
      <Text>{Config.BEACON_ENDPOINT}</Text>
      <Button
        title="Go to Details Screen"
        accessibilityLabel="goToDetailScreen"
        testID="goToDetailScreen"
        onPress={() => navigation.navigate('Details')}
      />
      <Button title="Nested fetch custom span" onPress={createSpan} />
      <Button
        title="RN fetch GET"
        onPress={rnFetch}
        accessibilityLabel="fetch"
        testID="fetch"
      />
      <Button title="RN fetch POST" onPress={rnFetchPost} />
      <Button
        title="fetch JSON"
        onPress={fetchJSON}
        accessibilityLabel="fetchJSON"
        testID="fetchJSON"
      />
      <Button title="Workflow span" onPress={workflowSpan} />
      <Button
        title="New session"
        onPress={MiddlewareRum._generatenewSessionId}
        accessibilityLabel="newSession"
        testID="newSession"
      />
      <Button
        accessibilityLabel="crash"
        testID="crash"
        title="Crash"
        onPress={MiddlewareRum._testNativeCrash}
      />
      <Button
        title="JS error"
        onPress={throwError}
        testID="jsError"
        accessibilityLabel="jsError"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
});
