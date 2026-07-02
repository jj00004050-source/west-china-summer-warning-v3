import type {
  DashboardVersionInfo,
  PreviousFinalSnapshot,
  QualityIssue,
  RenovationRecord,
  SnapshotBatch,
  StoredData,
} from '../types/data'

export interface RemoteBatchManifest extends Omit<SnapshotBatch, 'rows'> {
  rowKeys: string[]
}

export interface RemotePreviousSnapshotManifest extends Omit<PreviousFinalSnapshot, 'rows'> {
  rowKeys: string[]
}

export interface RemoteDashboardManifest {
  schemaVersion: 1
  version: DashboardVersionInfo
  arrays: {
    hotels: string[]
    lastYear: string[]
    renovations: string[]
    qualityIssues: string[]
  }
  batches: RemoteBatchManifest[]
  previousFinalSnapshot?: RemotePreviousSnapshotManifest
  state: Pick<StoredData, 'currentBaseDate' | 'mappings' | 'channelMappings' | 'settings'>
}

export interface RemoteDataEnvelope {
  version: DashboardVersionInfo | null
  manifest: RemoteDashboardManifest | null
}

export const remoteChunkKeys = (manifest: RemoteDashboardManifest) => [
  ...manifest.arrays.hotels,
  ...manifest.arrays.lastYear,
  ...manifest.arrays.renovations,
  ...manifest.arrays.qualityIssues,
  ...manifest.batches.flatMap(batch => batch.rowKeys),
  ...(manifest.previousFinalSnapshot?.rowKeys || []),
]

async function loadArray<T>(keys: string[], loadChunk: (key: string) => Promise<T[]>): Promise<T[]> {
  if (!keys.length) return []
  const chunks = await Promise.all(keys.map(loadChunk))
  return chunks.flat()
}

export async function hydrateRemoteData(
  manifest: RemoteDashboardManifest,
  loadChunk: <T>(key: string) => Promise<T[]>,
): Promise<StoredData> {
  const [hotels, lastYear, renovations, qualityIssues, batches, previousRows] = await Promise.all([
    loadArray(manifest.arrays.hotels, loadChunk),
    loadArray(manifest.arrays.lastYear, loadChunk),
    loadArray<RenovationRecord>(manifest.arrays.renovations, loadChunk),
    loadArray<QualityIssue>(manifest.arrays.qualityIssues, loadChunk),
    Promise.all(manifest.batches.map(async batch => {
      const { rowKeys, ...meta } = batch
      return { ...meta, rows: await loadArray(rowKeys, loadChunk) } as SnapshotBatch
    })),
    manifest.previousFinalSnapshot
      ? loadArray(manifest.previousFinalSnapshot.rowKeys, loadChunk)
      : Promise.resolve([]),
  ])
  const previousFinalSnapshot = manifest.previousFinalSnapshot
    ? (() => {
        const { rowKeys: _rowKeys, ...meta } = manifest.previousFinalSnapshot!
        return { ...meta, rows: previousRows } as PreviousFinalSnapshot
      })()
    : undefined
  return {
    hotels: hotels as StoredData['hotels'],
    lastYear: lastYear as StoredData['lastYear'],
    renovations,
    batches,
    previousFinalSnapshot,
    qualityIssues,
    currentBaseDate: manifest.state.currentBaseDate,
    mappings: manifest.state.mappings,
    channelMappings: manifest.state.channelMappings,
    settings: manifest.state.settings,
    version: manifest.version,
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

export function createVersionInfo(data: StoredData, source: DashboardVersionInfo['source']): DashboardVersionInfo {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const dates = [...new Set(data.batches.flatMap(batch => batch.rows.map(row => row.targetDate)).filter(Boolean))].sort()
  const latest = data.batches.at(-1)
  return {
    id: `v${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    versionNumber: `V${stamp}`,
    updatedAt: now.toISOString(),
    currentBaseDate: data.currentBaseDate || dates[0] || '',
    coverageStart: dates[0] || '',
    coverageEnd: dates.at(-1) || '',
    batchTime: latest?.batchTime || '',
    sourceFileName: latest?.fileName || '',
    source,
  }
}
