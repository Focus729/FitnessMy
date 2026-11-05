// Shared bounds keep related workout/set writes atomic without unbounded request bodies.
export const MAX_BATCH_MUTATIONS = 200;
export const MAX_BATCH_BYTES = 256 * 1024;
