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
  isBoosted?: boolean;
  edits?: ReelEdits;
  audioUrl?: string;
};

export type ReelVisibility = 'public' | 'followers';

export type ReelEditItem = { id: string; kind: 'text' | 'sticker'; value: string; color?: string; x: number; y: number };
export type ReelEdits = {
  trim?: { start: number; end: number };
  filter?: string;
  items?: ReelEditItem[];
  audioPath?: string;
  location?: string;
  tags?: string;
  aiLabel?: boolean;
};