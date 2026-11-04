import { router } from 'expo-router';

export function openNotificationContent(contentId: string) {
  if (contentId.startsWith('profile:')) {
    const id = contentId.slice('profile:'.length);
    if (id) {
      router.push({ pathname: '/reels/profile/[id]', params: { id } });
      return;
    }
  }

  if (contentId.startsWith('reel:')) {
    const reelId = contentId.slice('reel:'.length);
    if (reelId) {
      router.push({ pathname: '/shorts', params: { reelId } } as never);
      return;
    }
  }

  router.push({ pathname: '/content/[id]', params: { id: contentId } });
}
