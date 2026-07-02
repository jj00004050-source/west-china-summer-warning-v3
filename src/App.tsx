import { useEffect, useState } from 'react'
import { utils, writeFile } from 'xlsx'
import {
  AlertTriangle,
  CalendarDays,
  CircleHelp,
  Clock3,
  Database,
  FileClock,
  Hotel,
  Layers3,
  RefreshCw,
} from 'lucide-react'

import type {
  ComparisonRow,
  Filters,
  Hotel as HotelRecord,
  MetricRow,
  SnapshotBatch,
  StoredData,
} from './types/data'

import { EMPTY_DATA } from './utils/storage'
import { fetchData, saveServerData } from './utils/api'

import LightSidebar, { type DashboardView } from './components/LightSidebar'
import ChinaWestMap from './components/ChinaWestMap'
import ChannelPanel from './components/ChannelPanel'
import ProvinceOverview from './components/ProvinceOverview'
import StoreWarningTable from './components/StoreWarningTable'
import StoreDetailDrawer from './components/StoreDetailDrawer'
import KpiGroupCards from './components/KpiGroupCards'
import RankingChart from './components/RankingChart'
import ProvinceCityMatrix from './components/ProvinceCityMatrix'
import AreaRevenueZoneMatrix from './components/AreaRevenueZoneMatrix'
import ChannelDrilldownView from './components/ChannelDrilldownView'

const ALL = '全部'

const defaults = (batchId = ''): Filters => ({
  batchId,
  dayOffset: 'D0',
  province: ALL,
  area: ALL,
  city: ALL,
  district: ALL,
  businessZone: ALL,
  revenueZone: ALL,
  store: ALL,
  brand: ALL,
  positioning: ALL,
  operationType: ALL,
  managementType: ALL,
  directOperation: ALL,
  lifecycle: ALL,
  roomGroup: ALL,
  channel: ALL,
  channelLevel1: ALL,
  channelLevel2: ALL,
  channelLevel3: ALL,
  renovated: ALL,
  status: ALL,
})

export default function App() {
  const isAdminPath = location.pathname.startsWith('/admin')

  const [data, setData] = useState<StoredData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filters, setFilters] = useState<Filters>(defaults())
  const [view, setView] = useState<DashboardView>('overview')
  const [selectedStore, setSelectedStore] = useState<MetricRow | null>(null)

  // 🚨 已删除 authenticated（关键改动）

  const reload = async () => {
    try {
      const d = await fetchData()
      setData(d)
      setFilters(f => ({
        ...f,
        batchId: d.batches.at(-1)?.id || '',
      }))
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '数据服务不可用')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const updateData = async (next: StoredData) => {
    const saved = await saveServerData(next)
    setData(saved)
  }

  // 🚨 ADMIN 页面：彻底去登录
  if (isAdminPath) {
    return (
      <div className="admin-shell">
        <header className="admin-top">
          <div>
            <b>华西区域暑期预警 · 管理后台</b>
          </div>
          <nav>
            <a href="/dashboard">打开只读看板</a>
          </nav>
        </header>

        {/* 🚨 直接进入后台 */}
        <div style={{ padding: 20 }}>
          <p>已取消登录校验，直接进入后台</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="page-loading">加载中...</div>
  }

  if (loadError) {
    return <div className="page-loading error">{loadError}</div>
  }

  const selected = data.batches.at(-1)

  return (
    <div className="light-app">
      <LightSidebar
        filters={filters}
        hotels={data.hotels}
        batches={data.batches}
        onChange={setFilters}
        view={view}
        onView={setView}
      />

      <main className="light-main">
        <header className="light-header">
          <h1>华西区域暑期预警数据看板</h1>
        </header>

        {!selected ? (
          <div>暂无数据</div>
        ) : (
          <>
            <KpiGroupCards
              current={{} as any}
              previous={{} as any}
              hasPrevious={false}
              comparisonLabel="--"
              fullCount={0}
              zeroCount={0}
              prevFullCount={0}
              prevZeroCount={0}
            />

            <ChinaWestMap rows={[]} comparisonRows={[]} />

            <ChannelPanel rows={[]} previousRows={[]} comparisonLabel="--" />
          </>
        )}
      </main>

      <StoreDetailDrawer
        store={selectedStore}
        allRows={[]}
        comparisonRows={[]}
        channelRows={[]}
        comparisonLabel="--"
        onClose={() => setSelectedStore(null)}
      />
    </div>
  )
}
