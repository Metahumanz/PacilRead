export async function hasReadingStatsHistory(): Promise<boolean> {
  const rows = await window.electronAPI.data.readEntity('readingStats')
  return Array.isArray(rows) && rows.length > 0
}
