import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { GeniuzHomeWidget } from './GeniuzHomeWidget';

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetInfo.widgetName !== 'GeniuzHomeWidget') {
    return;
  }
  if (widgetAction === 'WIDGET_ADDED' || widgetAction === 'WIDGET_UPDATE' || widgetAction === 'WIDGET_RESIZED') {
    renderWidget(<GeniuzHomeWidget />);
  }
}
