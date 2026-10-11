import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardAwareTextInput } from '../KeyboardAwareScrollView';

import { theme } from '../../theme';
import { isValidDateOfBirth } from '../../utils/accountProfile';

export type SignInSheetMode = 'sign-in' | 'create-account' | 'reset-password';

type SignInToContinueModalProps = {
  visible: boolean;
  initialMode: SignInSheetMode;
  onClose: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, dateOfBirth: string) => Promise<{ hasSession: boolean }>;
  signInWithGoogle: () => Promise<{ cancelled: boolean; needsDateOfBirth: boolean }>;
  completeDateOfBirth: (dateOfBirth: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
};

export function SignInToContinueModal({
  visible,
  initialMode,
  onClose,
  signIn,
  signUp,
  signInWithGoogle,
  completeDateOfBirth,
  resetPassword,
  resendConfirmation,
}: SignInToContinueModalProps) {
  const [mode, setMode] = useState<SignInSheetMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [googleNeedsDateOfBirth, setGoogleNeedsDateOfBirth] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const switchMode = (next: SignInSheetMode) => {
    setMode(next);
    setError(undefined);
    setMessage(undefined);
  };

  const resendEmailConfirmation = async () => {
    if (!email.trim()) {
      setError('Enter your email address to resend the confirmation link.');
      return;
    }
    setError(undefined);
    setMessage(undefined);
    setIsSubmitting(true);
    try {
      await resendConfirmation(email);
      setMessage('A new confirmation email has been sent.');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not resend the confirmation email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueWithGoogle = async () => {
    setError(undefined);
    setMessage(undefined);
    setIsSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.cancelled) {
        setMessage('Google sign-in was cancelled.');
        return;
      }
      if (result.needsDateOfBirth) {
        if (isValidDateOfBirth(dateOfBirth)) {
          await completeDateOfBirth(dateOfBirth);
          onClose();
          return;
        }
        setGoogleNeedsDateOfBirth(true);
        setMessage('Enter your date of birth to finish setting up your account.');
        return;
      }
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Google sign-in could not be completed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveGoogleDateOfBirth = async () => {
    setError(undefined);
    setMessage(undefined);
    setIsSubmitting(true);
    try {
      await completeDateOfBirth(dateOfBirth);
      onClose();
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Your date of birth could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async () => {
    setError(undefined);
    setMessage(undefined);
    setIsSubmitting(true);
    try {
      if (mode === 'create-account') {
        if (displayName.trim().length < 1 || displayName.trim().length > 80) {
          throw new Error('Display name must be between 1 and 80 characters.');
        }
        const result = await signUp(email, password, displayName, dateOfBirth);
        if (result.hasSession) {
          onClose();
        } else {
          setMode('sign-in');
          setError(undefined);
          setMessage('Check your email to confirm your account, then sign in.');
        }
      } else if (mode === 'reset-password') {
        await resetPassword(email);
        setMessage('If an account uses this email, a password reset link is on its way.');
      } else {
        await signIn(email, password);
        onClose();
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Account request failed. Retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close sign in" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.sheet}
            keyboardAvoidingViewStyle={styles.sheetKeyboardContainer}
            style={styles.sheetScrollView}
          >
            <View style={styles.header}>
              <View style={styles.titleWrap}>
                <Text style={styles.title}>Sign in to continue</Text>
                <Text style={styles.subtitle}>Your watchlist and profile stay with your account.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            {mode === 'create-account' ? (
              <KeyboardAwareTextInput
                accessibilityLabel="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                maxLength={80}
                placeholder="Display name"
                placeholderTextColor={theme.secondaryText}
                style={styles.input}
              />
            ) : null}
            {mode === 'create-account' || googleNeedsDateOfBirth ? (
              <KeyboardAwareTextInput
                accessibilityLabel="Date of birth"
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                placeholder="Date of birth (YYYY-MM-DD)"
                placeholderTextColor={theme.secondaryText}
                style={styles.input}
              />
            ) : null}
            <KeyboardAwareTextInput
              accessibilityLabel="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="Email address"
              placeholderTextColor={theme.secondaryText}
              style={styles.input}
            />
            {mode !== 'reset-password' ? (
              <>
                <KeyboardAwareTextInput
                  accessibilityLabel="Password"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoComplete={mode === 'create-account' ? 'new-password' : 'password'}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor={theme.secondaryText}
                  style={styles.input}
                />
                {mode === 'create-account' ? (
                  <Text style={styles.passwordHint}>Use at least 8 characters.</Text>
                ) : null}
              </>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
            {googleNeedsDateOfBirth ? (
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={() => void saveGoogleDateOfBirth()}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>{isSubmitting ? 'Saving…' : 'Complete account'}</Text>
              </Pressable>
            ) : null}
            {error?.toLowerCase().includes('confirm your email') ? (
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting || !email.trim()}
                onPress={() => void resendEmailConfirmation()}
                style={styles.linkButton}
              >
                <Text style={styles.linkText}>{isSubmitting ? 'Sending…' : 'Resend confirmation'}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || !email.trim() || (mode !== 'reset-password' && !password)}
              onPress={() => void submit()}
              style={[styles.primaryButton, (isSubmitting || !email.trim() || (mode !== 'reset-password' && !password)) && styles.disabledButton]}
            >
              <Text style={styles.primaryText}>
                {isSubmitting ? 'Please wait…' : mode === 'create-account' ? 'Create account' : mode === 'reset-password' ? 'Send reset link' : 'Sign in'}
              </Text>
            </Pressable>
            {!googleNeedsDateOfBirth && mode !== 'reset-password' ? (
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={() => void continueWithGoogle()}
                style={[
                  styles.secondaryButton,
                  {
                    alignItems: 'center',
                    backgroundColor: '#1F6FEB',
                    borderColor: '#1F6FEB',
                    borderRadius: 999,
                    flexDirection: 'row',
                    gap: 12,
                    justifyContent: 'center',
                    opacity: isSubmitting ? 0.7 : 1,
                  },
                ]}
              >
                <View style={{ alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 17, height: 34, justifyContent: 'center', overflow: 'hidden', width: 34 }}>
                  <Image source={require('../../../assets/google.jpeg')} style={{ height: 24, width: 24 }} resizeMode="contain" />
                </View>
                <Text style={[styles.secondaryButtonText, { color: '#FFFFFF', fontWeight: '700' }]}>{isSubmitting ? 'Connecting…' : 'Continue with Google'}</Text>
              </Pressable>
            ) : null}
            {mode === 'sign-in' ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => switchMode('create-account')} style={styles.linkButton}>
                  <Text style={styles.linkText}>Create account</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => switchMode('reset-password')} style={styles.linkButton}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </Pressable>
              </>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => switchMode('sign-in')} style={styles.linkButton}>
                <Text style={styles.linkText}>Back to sign in</Text>
              </Pressable>
            )}
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  safeArea: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheet: {
    paddingHorizontal: 20,
    paddingBottom: 26,
    paddingTop: 8,
  },
  sheetKeyboardContainer: {
    flexGrow: 1,
  },
  sheetScrollView: {
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: theme.secondaryText,
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    color: theme.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  passwordHint: {
    color: theme.secondaryText,
    fontSize: 12,
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
    marginTop: 16,
  },
  secondaryButton: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
    marginTop: 12,
  },
  linkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginTop: 12,
  },
  primaryText: {
    color: '#0b1020',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  linkText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: '#ffb4b4',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  message: {
    color: '#cbe7ff',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.7,
  },
});
