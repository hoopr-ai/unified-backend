// Password generator for INTERNAL admin CMS first-login / reset-password flows.
// Spec: 16-char password = 2 uppercase + 2 lowercase + 2 digits + 10 alphanumeric, Fisher-Yates shuffled.
// No special characters (admins DM these passwords as a fallback if email bounces — keeping the
// charset URL/Slack-paste safe).
//
// Deliberately separate from the existing generateRandomPassword() in business-service/user/user.service.ts.
// That one is 12 chars, includes specials, and is used by the ENTERPRISE invite flow — must not change.
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGIT = "0123456789";
const ALNUM = UPPER + LOWER + DIGIT;

const pickN = (alphabet: string, n: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return out;
};

// Fisher-Yates in-place shuffle. Avoids the .sort(() => Math.random() - 0.5) bias.
const fisherYatesShuffle = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const generateInternalUserPassword = (): string => {
  const chars = [
    ...pickN(UPPER, 2),
    ...pickN(LOWER, 2),
    ...pickN(DIGIT, 2),
    ...pickN(ALNUM, 10),
  ];
  return fisherYatesShuffle(chars).join("");
};
