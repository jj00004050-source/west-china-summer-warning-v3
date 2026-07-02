import 'dotenv/config'
import express from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDefaultBaseData } from './default-base-data.mjs'
import { DEFAULT_BROADCAST_CONFIG, generateBroadcastPackage } from './broadcast-generator.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const dataDir = process.env.DATA_DIR || join(root, 'server', 'data')
const dataFile = join(dataDir, 'store.json')
const broadcastFile = join(dataDir, 'broadcast.json')
const port = Number(process.env.PORT || 8787)

const empty = {
  hotels: [],
  lastYear: [],
  renovations: [],
  batches: [],
  currentBaseDate: '',
  previousFinalSnapshot: undefined,
  mappings: {},
  channelMappings: {},
  qualityIssues: [],
  settings: { countMissingBookingAsZero: true }
}

const emptyBroadcast = {
  config: DEFAULT_BROADCAST_CONFIG,
  history: []
}

await mkdir(dataDir, { recursive: true })

if (!existsSync(dataFile)) {
  await writeFile(dataFile, JSON.stringify(empty, null, 2))
}

if (!existsSync(broadcastFile)) {
  await writeFile(broadcastFile, JSON.stringify(emptyBroadcast, null, 2))
}

const readStore = async () => {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'))
  } catch {
    return empty
  }
}

const writeStore = data =>
  writeFile(dataFile, JSON.stringify({ ...empty, ...data }, null, 2))

const readBroadcast = async () => {
  try {
    const stored = JSON.parse(await readFile(broadcastFile, 'utf8'))
    return {
      ...emptyBroadcast,
      ...stored,
      config: {
        ...DEFAULT_BROADCAST_CONFIG,
        ...(stored.config || {})
      },
      history: Array.isArray(stored.history) ? stored.history : []
    }
  } catch {
    return emptyBroadcast
  }
}

const writeBroadcast = data => {
  const next = {
    config: {
      ...DEFAULT_BROADCAST_CONFIG,
      ...(data.config || {})
    },
    history: Array.isArray(data.history)
      ? data.history.slice(0, 100)
      : []
  }

  return writeFile(broadcastFile, JSON.stringify(next, null, 2))
}

/**
 * =========================
 * 数据初始化
 * =========================
 */
const existing = await readStore()

const needsHotelEnrichment = existing.hotels.some(
  hotel =>
    hotel.operationType == null ||
    hotel.managementType == null
)

if (
  !existing.hotels.length ||
  !existing.lastYear.length ||
  !existing.renovations?.length ||
  needsHotelEnrichment
) {
  console.log('初始化基础数据...')

  const defaults = loadDefaultBaseData(root)

  const enrichedHotels = existing.hotels.length
    ? existing.hotels
    : defaults.hotels

  await writeStore({
    ...existing,
    hotels: enrichedHotels,
    lastYear: existing.lastYear.length
      ? existing.lastYear
      : defaults.lastYear,
    renovations: existing.renovations?.length
      ? existing.renovations
      : defaults.renovations
  })

  console.log(`初始化完成：${defaults.hotels.length} 家门店`)
}

/**
 * =========================
 * Express
 * =========================
 */
const app = express()

app.use((req, res, next) => {
  const origin = req.headers.origin

  if (
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173'
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS'
    )
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '300mb' }))

/**
 * =========================
 * API（全部开放，无登录）
 * =========================
 */

app.get('/api/data', async (_req, res) => {
  res.json(await readStore())
})

app.put('/api/admin/data', async (req, res) => {
  const next = req.body

  if (
    !next ||
    !Array.isArray(next.hotels) ||
    !Array.isArray(next.lastYear) ||
    !Array.isArray(next.batches)
  ) {
    return res.status(400).json({ error: '数据结构不正确' })
  }

  await writeStore(next)

  res.json({ ok: true })
})

app.get('/api/admin/broadcast', async (_req, res) => {
  res.json(await readBroadcast())
})

app.put('/api/admin/broadcast', async (req, res) => {
  const next = req.body

  if (
    !next ||
    typeof next.config !== 'object' ||
    !Array.isArray(next.history)
  ) {
    return res.status(400).json({ error: '播报结构不正确' })
  }

  await writeBroadcast(next)

  res.json({ ok: true })
})

app.post('/api/admin/broadcast/generate', async (req, res) => {
  try {
    const data = await readStore()
    res.json(generateBroadcastPackage(data, req.body || {}))
  } catch (e) {
    res.status(400).json({
      error: e?.message || '生成失败'
    })
  }
})

/**
 * =========================
 * 静态前端
 * =========================
 */
const dist = join(root, 'dist')

if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) =>
    res.sendFile(join(dist, 'index.html'))
  )
}

app.listen(port, () => {
  console.log(`服务已启动：http://localhost:${port}`)
})
