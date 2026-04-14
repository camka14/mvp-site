import { prisma } from '@/lib/prisma';
import {
  buildChatTermsRequiredPayload,
  hasAcceptedCurrentChatTerms,
} from '@/server/chatTerms';

type UserLookupClient = typeof prisma | {
  userData: {
    findUnique: (args: {
      where: { id: string };
      select: {
        chatTermsAcceptedAt: true;
        chatTermsVersion: true;
      };
    }) => Promise<{
      chatTermsAcceptedAt: Date | null;
      chatTermsVersion: string | null;
    } | null>;
  };
};

export const ensureUserHasAcceptedChatTerms = async (
  userId: string,
  client: UserLookupClient = prisma,
) => {
  const user = await client.userData.findUnique({
    where: { id: userId },
    select: {
      chatTermsAcceptedAt: true,
      chatTermsVersion: true,
    },
  });

  if (!hasAcceptedCurrentChatTerms(user)) {
    throw new Response(JSON.stringify(buildChatTermsRequiredPayload()), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
};
