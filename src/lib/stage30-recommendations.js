const GROUP_SUFFIX = '@g.us';
const truthy = value => value === true || value === 'true' || value === 1;

export function isGroupChat(chatId = '', explicitGroupFlag = false) {
  return truthy(explicitGroupFlag) || String(chatId || '').endsWith(GROUP_SUFFIX);
}

/** Filter only recommendation candidates; never changes the command registry or menu permissions. */
export function filterRecommendationCandidates(rows = [], context = {}) {
  const group = isGroupChat(context.chatId || context.chat, context.isGroup);
  const owner = truthy(context.isOwner) || truthy(context.owner);
  const premium = truthy(context.isPremium) || truthy(context.premium);
  const limit = Math.max(0, Number(context.limit ?? context.user?.limit ?? 0) || 0);
  const coins = Math.max(0, Number(context.modCoins ?? context.user?.modCoins ?? context.user?.mod_coins ?? 0) || 0);
  return rows.filter(row => {
    if (!row || !String(row.command || '').trim()) return false;
    if (truthy(row.owner) && !owner) return false;
    if (truthy(row.premium) && !premium) return false;
    if (truthy(row.groupOnly) && !group) return false;
    if (truthy(row.privateOnly) && group) return false;
    if (Number(row.limitCost || 0) > limit) return false;
    if (Number(row.coinCost || row.modCoinCost || 0) > coins) return false;
    if (row.enabled === false || row.recommendable === false) return false;
    return true;
  });
}
