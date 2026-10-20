const state = {
  premiumUsers: [],
  adminJids: [],
  bannedUsers: []
};
export const getState = () => state;
export const setState = (patch) => Object.assign(state, patch);
