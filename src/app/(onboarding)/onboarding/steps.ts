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

type StepCopy = { title: string; lead: string; icon: LucideIcon; tone: Tone };

/** Each onboarding question: heading, one-line lead and its clay tile. */
export const STEP_COPY: Record<
  Exclude<BusinessStep | CreatorStep, "done">,
  StepCopy
> = {
  "business-name": {
    title: "What’s your business called?",
    lead: "Creators see it on your campaigns.",
    icon: Store,
    tone: "sun",
  },
  "contact-name": {
    title: "And your name?",
    lead: "The person creators will be talking to.",
    icon: UserRound,
    tone: "lilac",
  },
  "display-name": {
    title: "What should businesses call you?",
    lead: "The name your audience knows you by.",
    icon: UserRound,
    tone: "lilac",
  },
  location: {
    title: "Where are you based?",
    lead: "Your town and state show on your profile.",
    icon: MapPin,
    tone: "mint",
  },
  niches: {
    title: "What do you post about?",
    lead: "Pick up to 3. Businesses search the directory by niche.",
    icon: Tags,
    tone: "sun",
  },
  platforms: {
    title: "Where do you post?",
    lead: "Add each account you’d post on. Follower counts start as self-reported; you can verify them later.",
    icon: AtSign,
    tone: "peach",
  },
  photo: {
    title: "Add a photo",
    lead: "Profiles with a photo stand out. You can skip this for now.",
    icon: Camera,
    tone: "coral",
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
  },
  influencer: {
    title: (name) => `Here’s your profile, ${name}`,
    lead: "This is how you’ll appear in the directory.",
    icon: BadgeCheck,
    tone: "mint",
  },
};
