import React from 'react';

import { useAuth } from '../../state/AuthContext';
import { SignInToContinueModal, type SignInSheetMode } from './SignInToContinueModal';

export type { SignInSheetMode } from './SignInToContinueModal';

type Props = {
  visible: boolean;
  initialMode: SignInSheetMode;
  onClose: () => void;
};

export function SignInToContinueSheet({ visible, initialMode, onClose }: Props) {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    completeDateOfBirth,
    resetPassword,
    resendConfirmation,
  } = useAuth();

  return (
    <SignInToContinueModal
      visible={visible}
      initialMode={initialMode}
      onClose={onClose}
      signIn={signIn}
      signUp={signUp}
      signInWithGoogle={signInWithGoogle}
      completeDateOfBirth={completeDateOfBirth}
      resetPassword={resetPassword}
      resendConfirmation={resendConfirmation}
    />
  );
}
