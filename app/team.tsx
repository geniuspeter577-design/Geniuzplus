import React from 'react';
import { Stack, useRouter } from 'expo-router';
import TeamPage from '../src/components/TeamPage';

export default function TeamScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TeamPage onBack={() => router.back()} />
    </>
  );
}
