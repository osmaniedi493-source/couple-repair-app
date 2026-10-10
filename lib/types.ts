export type AvatarKey = "girl" | "boy";

export type UserProfile = {
  id: string;
  phone: string;
  name: string;
  avatarKey: AvatarKey;
  coupleId?: string;
  createdAt: string;
};

export type Couple = {
  id: string;
  memberIds: string[];
  createdAt: string;
};

export type TimelineEntry = {
  id: string;
  coupleId: string;
  authorUserId: string;
  title: string;
  scene: string;
  emotions: string[];
  time: string;
  createdAt: string;
  whatHappened?: string;
  whyItMatters?: string;
};

export type ForgiveKind = "letter" | "todo" | "deal";

export type ForgiveItem = {
  id: string;
  coupleId: string;
  authorUserId: string;
  kind: ForgiveKind;
  timelineEntryId?: string;
  createdAt: string;
  message?: string;
  title?: string;
  targetDate?: string;
  done?: boolean;
  commitment?: string;
  deal?: string;
  totalCells?: number;
  progress?: number;
  cells?: boolean[];
};

export type PatternRadarAxis = { axis: string; value: number };

export type PatternProfile = {
  typeName: string;
  englishTag: string;
  tags: string[];
  description: string;
  radar: PatternRadarAxis[];
  sessionCount: number;
  generatedAt: string;
};

export const avatarProfiles: Record<AvatarKey, { label: string; defaultName: string; src: string }> = {
  girl: { label: "女生头像", defaultName: "小猫蘑菇", src: "/assets/avatar-girl.png" },
  boy: { label: "男生头像", defaultName: "小狗蘑菇", src: "/assets/avatar-boy.png" }
};

export function otherAvatarKey(key: AvatarKey): AvatarKey {
  return key === "girl" ? "boy" : "girl";
}
