import Constants from 'expo-constants';
import * as Device from 'expo-device';

import { supabase } from './supabase';

type PushTokenTableClient = {
  from: (table: 'device_push_tokens') => {
    upsert: (
      values: { user_id: string; expo_push_token: string; updated_at: string },
      options: { onConflict: string },
    ) => Promise<{ error: unknown | null }>;
    delete: () => {
      eq: (column: 'user_id', value: string) => Promise<{ error: unknown | null }>;
    };
  };
};

async function getNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

export async function registerPushNotifications(userId: string) {
  if (!supabase || !Device.isDevice || Constants.executionEnvironment === 'storeClient') {
    return;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Device.osName === 'Android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Geniuzplus updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    return;
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error('Expo push notifications need an EAS project ID.');
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const client = supabase as unknown as PushTokenTableClient;
  const { error } = await client.from('device_push_tokens').upsert(
    { user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,expo_push_token' },
  );
  if (error) {
    throw new Error('The device push token could not be registered.', { cause: error });
  }
}

export async function removePushNotifications(userId: string) {
  if (!supabase || Constants.executionEnvironment === 'storeClient') {
    return;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return;
  }

  const client = supabase as unknown as PushTokenTableClient;
  const { error } = await client.from('device_push_tokens').delete().eq('user_id', userId);
  if (error) {
    throw new Error('The device push token could not be removed.', { cause: error });
  }
}