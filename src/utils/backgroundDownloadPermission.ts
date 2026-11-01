export type NotificationPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
};

export type BackgroundDownloadPermissionDependencies = {
  getPermission: () => Promise<NotificationPermissionState>;
  requestPermission: () => Promise<NotificationPermissionState>;
  showPermissionPrompt: () => Promise<boolean>;
  showSettingsPrompt: () => Promise<void>;
};

export async function ensureBackgroundDownloadPermission(
  dependencies: BackgroundDownloadPermissionDependencies,
) {
  const current = await dependencies.getPermission();
  if (current.granted) {
    return true;
  }
  if (!current.canAskAgain) {
    await dependencies.showSettingsPrompt();
    return false;
  }
  if (!(await dependencies.showPermissionPrompt())) {
    return false;
  }

  const requested = await dependencies.requestPermission();
  if (requested.granted) {
    return true;
  }
  if (!requested.canAskAgain) {
    await dependencies.showSettingsPrompt();
  }
  return false;
}