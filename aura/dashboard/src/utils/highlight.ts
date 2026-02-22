export function findNewIds(
  previousIds: readonly string[],
  nextIds: readonly string[],
): string[] {
  if (previousIds.length === 0 || nextIds.length === 0) {
    return [];
  }

  const previousSet = new Set(previousIds);
  return nextIds.filter((id) => !previousSet.has(id));
}

export function mergeUniqueIds(
  currentIds: readonly string[],
  incomingIds: readonly string[],
): string[] {
  if (incomingIds.length === 0) {
    return [...currentIds];
  }

  const unique = new Set(currentIds);
  incomingIds.forEach((id) => unique.add(id));
  return Array.from(unique);
}

export function removeIds(
  currentIds: readonly string[],
  idsToRemove: readonly string[],
): string[] {
  if (idsToRemove.length === 0) {
    return [...currentIds];
  }

  const removeSet = new Set(idsToRemove);
  return currentIds.filter((id) => !removeSet.has(id));
}
