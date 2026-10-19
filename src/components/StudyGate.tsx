import React from 'react';

import { useStudyMode } from '../state/StudyModeContext';

export function StudyGate({ showInStudy, children }: React.PropsWithChildren<{ showInStudy: boolean }>) {
  const study = useStudyMode();
  return study.enabled && !showInStudy ? null : <>{children}</>;
}
