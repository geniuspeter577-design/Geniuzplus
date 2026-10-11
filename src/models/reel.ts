export type ReelFeedItem = {
  id: string;
  userId: string;
  creatorName: string;
  creatorUsername: string;
  avatarUrl?: string;
  isMember: boolean;
  videoUrl: string;
  caption: string;
  hashtags: string[];
  createdAt: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  allowComments: boolean;
  isOwner: boolean;
};

export type ReelVisibility = 'public' | 'followers';