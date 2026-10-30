import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { theme } from '../theme';

export function TitleImage({
  uri,
  style,
  iconSize = 36,
}: {
  uri?: string;
  style: StyleProp<ImageStyle>;
  iconSize?: number;
}) {
  const [failedUri, setFailedUri] = useState<string>();
  const showImage = Boolean(uri && uri !== failedUri);

  return (
    <View style={[styles.placeholder, style]}>
      {showImage ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Ionicons name="film-outline" size={iconSize} color={theme.secondaryText} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    overflow: 'hidden',
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
