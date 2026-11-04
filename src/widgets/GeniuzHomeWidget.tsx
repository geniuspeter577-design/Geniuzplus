'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function GeniuzHomeWidget() {
  return (
    <FlexWidget
      accessibilityLabel="Open Geniuzplus"
      clickAction="OPEN_APP"
      style={{
        alignItems: 'flex-start',
        backgroundColor: '#11151A',
        borderRadius: 18,
        height: 'match_parent',
        justifyContent: 'space-between',
        padding: 18,
        width: 'match_parent',
      }}
    >
      <TextWidget
        text="GENIUZPLUS"
        style={{ color: '#72F06A', fontSize: 12, fontWeight: '700' }}
      />
      <TextWidget
        text="Movies, series and Reels"
        style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}
      />
      <TextWidget
        text="Tap to open"
        style={{ color: '#A0A8B5', fontSize: 12 }}
      />
    </FlexWidget>
  );
}
