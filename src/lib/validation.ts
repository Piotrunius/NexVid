export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 72, // Protect against bcrypt DoS
  FEEDBACK_SUBJECT_MIN: 5,
  FEEDBACK_SUBJECT_MAX: 120,
  FEEDBACK_MESSAGE_MIN: 10,
  FEEDBACK_MESSAGE_MAX: 4000,
  FEEDBACK_REPLY_MIN: 2,
  FEEDBACK_REPLY_MAX: 4000,
  AI_ASSISTANT_MOOD_MAX: 1000,
  WATCH_PARTY_NAME_MIN: 2,
  WATCH_PARTY_NAME_MAX: 32,
};

export const VALID_USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;

export function isValidUsername(username: string): boolean {
  const trimmed = username.trim();
  return (
    trimmed.length >= LIMITS.USERNAME_MIN &&
    trimmed.length <= LIMITS.USERNAME_MAX &&
    VALID_USERNAME_REGEX.test(trimmed)
  );
}

export function isValidPassword(password: string): boolean {
  return (
    password.length >= LIMITS.PASSWORD_MIN &&
    password.length <= LIMITS.PASSWORD_MAX
  );
}
