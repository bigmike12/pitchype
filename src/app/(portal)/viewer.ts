import { cache } from "react";

import { getSignedInUser } from "@/lib/auth";
import { getOwnCreatorProfile } from "@/lib/db/creators";
import { getProfile } from "@/lib/db/profiles";
import type { PortalViewer } from "@/lib/portal";

const emailName = (email: string) => email.split("@")[0] || email;

/**
 * Who the portal shell is drawn for: role, a name to show and, for creators,
 * their photo. Null when signed out (the proxy normally sends them to /login
 * first). Before onboarding there's no profile, so the email stands in.
 */
export const getPortalViewer = cache(async (): Promise<PortalViewer | null> => {
  const user = await getSignedInUser();
  if (!user) return null;

  if (user.role === "admin") {
    return {
      role: "admin",
      name: "Admin",
      email: user.email,
      photoUrl: null,
      needsOnboarding: false,
    };
  }
  if (user.role === "influencer") {
    const profile = await getOwnCreatorProfile(user.id);
    return {
      role: "influencer",
      name: profile?.displayName ?? emailName(user.email),
      email: user.email,
      photoUrl: profile?.photoUrl ?? null,
      needsOnboarding: !profile,
    };
  }
  const profile = await getProfile(user);
  return {
    role: "business",
    name:
      profile?.role === "business"
        ? profile.businessName
        : emailName(user.email),
    email: user.email,
    photoUrl: null,
    needsOnboarding: !profile,
  };
});
