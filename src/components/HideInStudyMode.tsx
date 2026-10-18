import React from 'react';

import { useStudyMode } from '../state/StudyModeContext';

export function HideInStudyMode({ children }: React.PropsWithChildren) {
  const study = useStudyMode();
  return study.enabled ? null : <>{children}</>;
}
