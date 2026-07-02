import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { AlertTriangle, ChevronLeft, ChevronRight, Store } from 'lucide-react'
import type { ChannelAnomalySettings, MetricRow, SnapshotRecord } from '../types/data'
import {
  aggregateChannelAnomalies,
  analyzeStoreChannelAnomalies,
  channelNameAt,
  type ChannelAnomalyMetric,
  type ChannelLevel,
  type ChannelRisk,
} from '../utils/channelAnomalies'
import { channelColor } from '../utils/channels'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'

const LEVEL_LABEL: Record<ChannelLevel, string> = { channelLevel1: '一级渠道', channelLevel2: '二级渠道', channelLevel3: '三级渠道' }
const RISK_LABEL: Record<ChannelRisk, string> = { high: '高风险', watch: '关注', positive: '改善', normal: '正常', sample: '样本量低' }
const RISK_ORDER: Record<ChannelRisk, number> = { high: 0, watch: 1, sample: 2, positive: 3, normal: 4 }

function ChangeQuadrant({ items, onSelect }: { items: ChannelAnomalyMetric[]; onSelect: (item: ChannelAnomalyMetric) => void }) {
  const points = items.filter(item => item.shareDelta != null && item.adrDelta != null)
  const colors: Record<string, string> = { '量价双升': '#16A34A', '量升价降': '#F59E0B', '量降价升': '#36BFFA', '量价双降': '#E5484D' }
  const category = (item: ChannelAnomalyMetric) => item.tags.find(tag => colors[tag]) || '其他'
  const option = {
    grid: { left: 58, right: 30, top: 28, bottom: 46 },
    tooltip: { formatter: (p: { data: { raw: ChannelAnomalyMetric } }) => {
      const item = p.data.raw
      return `<b>${item.name}</b><br/>${category(item)}<br/>预订间夜 ${item.rooms.toLocaleString()}<br/>占比 ${fmtPct(item.share)}（${fmtPp(item.shareDelta)}）<br/>在手ADR ${fmtMoney(item.adr)}（${fmtMoney(item.adrDelta)}）`
    } },
    xAxis: { name: '占比较上一版变化（pp）', nameLocation: 'middle', nameGap: 30, axisLabel: { formatter: '{value}pp', color: '#7A869A' }, splitLine: { lineStyle: { color: '#E9EFF6' } } },
    yAxis: { name: 'ADR较上一版变化（元）', nameGap: 38, axisLabel: { color: '#7A869A' }, splitLine: { lineStyle: { color: '#E9EFF6' } } },
    series: [{
      type: 'scatter',
      data: points.map(item => ({
        name: item.name, value: [(item.shareDelta || 0) * 100, item.adrDelta || 0],
        raw: item, symbolSize: Math.max(12, Math.min(38, 10 + Math.sqrt(item.rooms) * 1.5)),
        itemStyle: { color: colors[category(item)] || '#8B5CF6', opacity: .83, borderColor: '#fff', borderWidth: 2 },
      })),
      label: { show: points.length <= 14, formatter: '{b}', position: 'top', color: '#526277', fontSize: 9 },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: '#91A8C1', type: 'dashed' }, data: [{ xAxis: 0 }, { yAxis: 0 }] },
    }],
  }
  return <section className="light-card channel-quadrant">
    <div className="light-card-head"><div><h2>渠道量价变化四象限</h2><p>横轴看占比变化，纵轴看ADR变化；点击渠道联动异常明细与门店</p></div></div>
    {points.length ? <ReactECharts option={option} style={{ height: 420 }} onEvents={{ click: (event: { data: { raw: ChannelAnomalyMetric } }) => onSelect(event.data.raw) }}/> : <div className="channel-level-empty">暂无可比较的上一版渠道数据</div>}
    <div className="channel-quadrant-legend"><span className="rise">右上 量价双升</span><span className="volume">右下 量升价降</span><span className="price">左上 量降价升</span><span className="fall">左下 量价双降</span></div>
  </section>
}

function AnomalyTable({ items, activeFilter, onSelect }: { items: ChannelAnomalyMetric[]; activeFilter: string; onSelect: (item: ChannelAnomalyMetric) => void }) {
  const filtered = items.filter(item => activeFilter === '全部' || item.tags.includes(activeFilter) || item.risk === activeFilter)
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || Math.abs(b.shareDelta || 0) - Math.abs(a.shareDelta || 0))
  return <section className="light-card channel-anomaly-table">
    <div className="light-card-head"><div><h2>渠道变化矩阵 / 异常明细</h2><p>同一真实目标入住日期、同一渠道层级与筛选范围对比上一版</p></div><span>{filtered.length} 个渠道</span></div>
    <div className="province-table"><table><thead><tr><th>层级</th><th>渠道路径</th><th>预订间夜</th><th>间夜占比</th><th>占比较上版</th><th>在手ADR</th><th>ADR较上版</th><th>理论RP贡献</th><th>贡献较上版</th><th>主要影响范围</th><th>影响门店</th><th>异常标签</th><th>风险</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.key} onClick={() => onSelect(item)}>
        <td>{item.levelLabel}</td><td><b>{[item.level1, item.level !== 'channelLevel1' && item.level2, item.level === 'channelLevel3' && item.level3].filter(Boolean).join(' / ')}</b></td>
        <td>{item.rooms.toLocaleString()}</td><td>{fmtPct(item.share)}</td><td className={(item.shareDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(item.shareDelta)}</td>
        <td>{fmtMoney(item.adr)}</td><td className={(item.adrDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(item.adrDelta)}</td>
        <td>{fmtMoney(item.rpContribution)}</td><td className={(item.rpContributionDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(item.rpContributionDelta)}</td>
        <td>{item.impactProvince}<small>{item.impactArea}</small></td><td>{item.affectedStores}</td>
        <td><div className="channel-anomaly-tags">{(item.tags.length ? item.tags : ['正常']).map(tag => <em key={tag}>{tag}</em>)}</div></td>
        <td><span className={`channel-risk risk-${item.risk}`}>{RISK_LABEL[item.risk]}</span></td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

export function ChannelAnomalyTab({ rows, previousRows, stores, settings, onChannel, onStoreFilter }: {
  rows: SnapshotRecord[]
  previousRows: SnapshotRecord[]
  stores: MetricRow[]
  settings?: Partial<ChannelAnomalySettings>
  onChannel: (item: ChannelAnomalyMetric) => void
  onStoreFilter?: (filter: string) => void
}) {
  const [level, setLevel] = useState<ChannelLevel>('channelLevel1')
  const [filter, setFilter] = useState('全部')
  const metrics = useMemo(() => aggregateChannelAnomalies(rows, previousRows, level, stores, settings), [rows, previousRows, level, stores, settings])
  const l1 = useMemo(() => aggregateChannelAnomalies(rows, previousRows, 'channelLevel1', stores, settings), [rows, previousRows, stores, settings])
  const l3 = useMemo(() => aggregateChannelAnomalies(rows, previousRows, 'channelLevel3', stores, settings), [rows, previousRows, stores, settings])
  const storeAnomalies = useMemo(() => analyzeStoreChannelAnomalies(stores, rows, previousRows, settings), [stores, rows, previousRows, settings])
  const cards: Array<[string, number, string]> = [
    ['OTA依赖门店', storeAnomalies.filter(item => item.tags.includes('OTA占比过高')).length, 'OTA占比过高'],
    ['直销偏低门店', storeAnomalies.filter(item => item.tags.includes('线上直销偏低')).length, '线上直销偏低'],
    ['单一渠道依赖', storeAnomalies.filter(item => item.tags.includes('单一渠道依赖')).length, 'store-high'],
    ['量升价降渠道', l1.filter(item => item.tags.includes('量升价降')).length, '量升价降'],
    ['量价双降渠道', l1.filter(item => item.tags.includes('量价双降')).length, '量价双降'],
    ['ADR异常低渠道', l1.filter(item => item.tags.includes('ADR异常低')).length, 'ADR异常低'],
    ['三级渠道突变', l3.filter(item => item.tags.includes('占比突增') || item.tags.includes('占比突降')).length, 'channelLevel3'],
  ]
  return <div className="channel-anomaly-stack">
    <section className="channel-anomaly-overview"><div className="store-anomaly-title"><div><b>渠道异常概览</b><span>点击卡片筛选异常矩阵；样本量低渠道只提示、不判高风险</span></div></div>
      <div className="channel-anomaly-cards">{cards.map(([label, count, value]) => <button key={label} className={filter === value ? 'active' : ''} onClick={() => {
        if (value === 'store-high') return onStoreFilter?.('单一渠道依赖')
        if (['OTA占比过高','线上直销偏低'].includes(value)) return onStoreFilter?.(value)
        if (value === 'channelLevel3') { setLevel('channelLevel3'); setFilter('全部'); return }
        setFilter(current => current === value ? '全部' : value)
      }}><span>{label}</span><b>{count}</b><small>点击联动筛选</small></button>)}</div>
    </section>
    <div className="channel-anomaly-toolbar"><div className="diagnostic-tabs">{(Object.keys(LEVEL_LABEL) as ChannelLevel[]).map(key => <button key={key} className={level === key ? 'active' : ''} onClick={() => { setLevel(key); setFilter('全部') }}>{LEVEL_LABEL[key]}</button>)}</div>
      {filter !== '全部' && <button onClick={() => setFilter('全部')}>清除异常筛选：{filter}</button>}</div>
    <ChangeQuadrant items={metrics} onSelect={onChannel}/>
    <AnomalyTable items={metrics} activeFilter={filter} onSelect={onChannel}/>
  </div>
}

export function StoreChannelAnomalyTab({ rows, previousRows, stores, settings, onStore, initialFilter = '全部' }: {
  rows: SnapshotRecord[]
  previousRows: SnapshotRecord[]
  stores: MetricRow[]
  settings?: Partial<ChannelAnomalySettings>
  onStore: (store: MetricRow) => void
  initialFilter?: string
}) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState(initialFilter)
  const items = useMemo(() => analyzeStoreChannelAnomalies(stores, rows, previousRows, settings)
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.maxShare - a.maxShare), [stores, rows, previousRows, settings])
  const options = ['全部','OTA占比过高','线上直销偏低','单一渠道依赖','渠道ADR偏低','直营店直销偏低','直营店OTA偏高']
  const filtered = filter === '全部' ? items : items.filter(item => item.tags.includes(filter))
  const pageSize = 20
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize)
  return <section className="light-card channel-store-anomaly">
    <div className="light-card-head"><div><h2>门店渠道异常TOP</h2><p>只展示有预订来源的门店；0预定门店不误判为渠道异常</p></div><div className="channel-store-tools"><select value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }}>{options.map(option => <option key={option}>{option}</option>)}</select><span><Store/> {filtered.length} 家</span></div></div>
    <div className="province-table"><table><thead><tr><th>门店</th><th>省区 / 片区</th><th>城市 / 收益管理商圈</th><th>预订率</th><th>在手ADR</th><th>最大渠道</th><th>各OTA</th><th>线上直销</th><th>线下直销</th><th>携程</th><th>美团</th><th>飞猪</th><th>渠道ADR异常</th><th>异常标签</th><th>风险</th></tr></thead>
      <tbody>{pageRows.map(item => <tr key={item.row.whCode} onClick={() => onStore(item.row)}>
        <td><b>{item.row.name}</b><small>{item.row.whCode}</small></td><td>{item.row.province}<small>{item.row.area}</small></td><td>{item.row.city}<small>{item.row.revenueZone || '--'}</small></td>
        <td>{fmtPct(item.row.bookingRate)}</td><td>{fmtMoney(item.row.adr)}</td><td><b>{item.maxChannel}</b><small>{fmtPct(item.maxShare)}</small></td>
        <td>{fmtPct(item.mix.ota)}</td><td>{fmtPct(item.mix.online)}</td><td>{fmtPct(item.mix.offline)}</td><td>{fmtPct(item.mix.ctrip)}</td><td>{fmtPct(item.mix.meituan)}</td><td>{fmtPct(item.mix.fliggy)}</td>
        <td className={item.channelAdrIssue === '--' ? '' : 'negative'}>{item.channelAdrIssue}</td><td><div className="channel-anomaly-tags">{item.tags.map(tag => <em key={tag}>{tag}</em>)}</div></td>
        <td><span className={`channel-risk risk-${item.risk}`}>{RISK_LABEL[item.risk]}</span></td>
      </tr>)}</tbody>
    </table></div>
    <div className="channel-store-pagination"><span>第 {Math.min(page, pages)} / {pages} 页 · 共 {filtered.length} 家</span><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft/>上一页</button><button disabled={page >= pages} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight/></button></div>
    {!filtered.length && <div className="channel-store-empty"><AlertTriangle/>当前筛选下未识别到门店渠道异常</div>}
  </section>
}
