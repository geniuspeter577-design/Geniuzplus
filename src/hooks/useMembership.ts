import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../state/AuthContext';
import { useNetwork } from '../state/NetworkContext';
import { loadMemberPlans, loadMembershipStatus, type MemberPlan, type MembershipStatus } from '../services/MembershipClient';

export function useMembership() {
  const auth = useAuth();
  const network = useNetwork();
  const [plans, setPlans] = useState<MemberPlan[]>([]);
  const plan = plans.find(({ id }) => id === 'monthly') ?? null;
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (auth.isLoading) {
      return null;
    }
    if (!network.isOnline) {
      setError('You’re offline. Connect to check your Member status or start checkout.');
      setIsLoading(false);
      return null;
    }
    setIsLoading(true);
    setError(undefined);
    try {
      const [nextPlan, nextStatus] = await Promise.all([
        loadMemberPlans(),
        auth.session ? loadMembershipStatus() : Promise.resolve<MembershipStatus>({ status: 'visitor' }),
      ]);
      setPlans(nextPlan);
      setStatus(nextStatus);
      return nextStatus;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Membership details could not be loaded.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [auth.isLoading, auth.session, network.isOnline]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { plan, plans, status, isLoading, error, refresh, isOnline: network.isOnline };
}
