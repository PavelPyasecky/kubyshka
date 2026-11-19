export const shouldApplyRemote = (input: {
  pending: boolean;
  localUpdatedAt?: number;
  remoteUpdatedAt: number;
}): boolean => {
  if (!input.pending || input.localUpdatedAt === undefined) return true;
  return input.remoteUpdatedAt >= input.localUpdatedAt;
};
