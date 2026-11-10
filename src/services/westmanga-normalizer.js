export function normalizeWestmangaArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === false || value === '') return [];
  if (typeof value === 'object') {
    for (const key of ['data', 'items', 'results', 'list']) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

export function normalizeWestmangaHomePayload(payload, toAbsoluteImageUrl = value => String(value || '')) {
  const raw = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const normalize = value => normalizeWestmangaArray(value).map(item => ({
    id: item?.id,
    title: String(item?.title || 'Untitled'),
    slug: String(item?.slug || ''),
    contentType: item?.content_type || 'comic',
    cover: toAbsoluteImageUrl(item?.cover) || '',
    rating: item?.rating ?? null,
    views: item?.total_views ?? null,
    status: item?.status ?? null,
    lastChapters: normalizeWestmangaArray(item?.lastChapters).map(chapter => ({
      id: chapter?.id, number: chapter?.number, slug: chapter?.slug,
      updatedAt: chapter?.updated_at?.formatted || ''
    }))
  })).filter(item => item.slug);
  return {
    success: true,
    mirrorUpdates: normalize(raw.mirror_update),
    popular: normalize(raw.popular),
    newProjects: normalize(raw.new_project),
    projectUpdates: normalize(raw.project_update),
  };
}
