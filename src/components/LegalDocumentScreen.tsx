import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEGAL_DOCUMENTS } from '../constants/legalDocuments';
import { theme } from '../theme';
import { backOrReplace } from '../utils/navigation';

type LegalDocumentScreenProps = {
  kind: keyof typeof LEGAL_DOCUMENTS;
};

export function LegalDocumentScreen({ kind }: LegalDocumentScreenProps) {
  const document = LEGAL_DOCUMENTS[kind];
  const otherKind = kind === 'terms' ? 'privacy' : 'terms';
  const otherLabel = LEGAL_DOCUMENTS[otherKind].title;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOrReplace('/')}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{document.title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>Geniuzplus</Text>
        <Text accessibilityRole="header" style={styles.title}>{document.title}</Text>
        {document.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionHeading}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ))}
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/${otherKind}`)}
          style={styles.otherDocumentLink}
        >
          <Text style={styles.otherDocumentText}>Read the {otherLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={theme.accent} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: {
    alignItems: 'center',
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  backButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  headerTitle: { color: theme.text, flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  headerSpacer: { width: 40 },
  content: { alignSelf: 'center', gap: 20, maxWidth: 760, padding: 22, paddingBottom: 52, width: '100%' },
  brand: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  title: { color: theme.text, fontSize: 28, fontWeight: '800' },
  section: { gap: 9 },
  sectionHeading: { color: theme.text, fontSize: 17, fontWeight: '700' },
  paragraph: { color: theme.secondaryText, fontSize: 14, lineHeight: 22 },
  otherDocumentLink: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 8, minHeight: 40 },
  otherDocumentText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
});
