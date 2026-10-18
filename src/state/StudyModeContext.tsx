import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ENABLED_KEY = 'geniuz.study.enabled';
const PIN_KEY = 'geniuz.study.pin';

type StudyModeValue = {
  isReady: boolean;
  enabled: boolean;
  turnOn: (pin: string) => Promise<void>;
  turnOff: (pin: string) => Promise<boolean>;
};

const StudyModeContext = createContext<StudyModeValue | null>(null);

export function StudyModeProvider({ children }: React.PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(ENABLED_KEY);
        if (active) {
          setEnabled(saved === '1');
        }
      } catch {
        // keep study mode off if storage cannot be read
      } finally {
        if (active) {
          setIsReady(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const turnOn = useCallback(async (pin: string) => {
    if (!/^\d{4}$/.test(pin)) {
      throw new Error('The PIN must be exactly 4 digits.');
    }
    await SecureStore.setItemAsync(PIN_KEY, pin);
    await SecureStore.setItemAsync(ENABLED_KEY, '1');
    setEnabled(true);
  }, []);

  const turnOff = useCallback(async (pin: string) => {
    const saved = await SecureStore.getItemAsync(PIN_KEY);
    if (saved === null || saved !== pin) {
      return false;
    }
    await SecureStore.setItemAsync(ENABLED_KEY, '0');
    setEnabled(false);
    return true;
  }, []);

  const value = useMemo(() => ({ isReady, enabled, turnOn, turnOff }), [isReady, enabled, turnOn, turnOff]);
  return <StudyModeContext.Provider value={value}>{children}</StudyModeContext.Provider>;
}

export function useStudyMode() {
  const context = useContext(StudyModeContext);
  if (!context) {
    throw new Error('useStudyMode must be used within StudyModeProvider.');
  }
  return context;
}
