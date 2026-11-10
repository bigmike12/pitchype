import {
  AtSign,
  BadgeCheck,
  Camera,
  MapPin,
  Store,
  Tags,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import type { Tone } from "@/components/brand/stickers";
import type { BusinessStep, CreatorStep } from "@/lib/onboarding";

type StepCopy = {
  title: string;
  lead: string;
  icon: LucideIcon;
  tone: Tone;
  /** The "why we ask" card beside the question. Keep it true and short. */
  why: { title: string; text: string };
};

/** Each onboarding question: heading, one-line lead, clay tile and why we ask. */
export const STEP_COPY: Record<
  Exclude<BusinessStep | CreatorStep, "done">,
  StepCopy
> = {
  "business-name": {
    title: "What’s your business called?",
    lead: "Creators see it on your campaigns.",
    icon: Store,
    tone: "sun",
    why: {
      title: "Your name on every campaign",
      text: "Creators see who is behind a campaign before they apply. Use the name your customers know you by.",
    },
  },
  "contact-name": {
    title: "And your name?",
    lead: "The person creators will be talking to.",
    icon: UserRound,
    tone: "lilac",
    why: {
      title: "A real person to talk to",
      text: "Creators agree the details with you in chat, so it helps to know who they’re talking to.",
    },
  },
  "display-name": {
    title: "What should businesses call you?",
    lead: "The name your audience knows you by.",
    icon: UserRound,
    tone: "lilac",
    why: {
      title: "Make a strong first impression",
      text: "Your name appears in the creator directory and on every application you send.",
    },
  },
  location: {
    title: "Where are you based?",
    lead: "Your town and state show on your profile.",
    icon: MapPin,
    tone: "mint",
    why: {
      title: "Local reach matters",
      text: "Many businesses look for creators near their customers. Your town and state help them find you.",
    },
  },
  niches: {
    title: "What do you post about?",
    lead: "Pick up to 3. Businesses search the directory by niche.",
    icon: Tags,
    tone: "sun",
    why: {
      title: "Get found for what you post",
      text: "Businesses filter the directory by niche, so pick the ones that describe your posts best.",
    },
  },
  platforms: {
    title: "Where do you post?",
    lead: "Add each account you’d post on. Follower counts start as self-reported; you can verify them later.",
    icon: AtSign,
    tone: "peach",
    why: {
      title: "Self-reported to start",
      text: "Add your accounts now. Later you can verify a count with a one-time code in your bio and earn the Verified mark.",
    },
  },
  photo: {
    title: "Add a photo",
    lead: "Profiles with a photo stand out. You can skip this for now.",
    icon: Camera,
    tone: "coral",
    why: {
      title: "Profiles with a face feel real",
      text: "Your photo shows in the directory and next to your applications. A square picture works best.",
    },
  },
};

export const DONE_COPY: Record<
  "business" | "influencer",
  Omit<StepCopy, "title"> & { title: (firstName: string) => string }
> = {
  business: {
    title: (name) => `You’re all set, ${name}`,
    lead: "What would you like to do first?",
    icon: BadgeCheck,
    tone: "mint",
    why: {
      title: "Your money stays safe",
      text: "When you hire, you pay into escrow. The creator is paid once you approve the work, or after 7 days without a reply.",
    },
  },
  influencer: {
    title: (name) => `Here’s your profile, ${name}`,
    lead: "This is how you’ll appear in the directory.",
    icon: BadgeCheck,
    tone: "mint",
    why: {
      title: "Paid when the work is approved",
      text: "Businesses fund each job before you start. Once they approve your work, or after 7 days of silence, the money moves to your wallet.",
    },
  },
};
