import type { ComparisonRow, MetricRow, PriceAdviceSettings, SnapshotRecord } from '../types/data'
import { aggregate } from '../utils/metrics'
import { analyzeStore, buildStoreChannelMix, EMPTY_STORE_MIX } from '../utils/storeAnomalies'
import { matchesRenovationFilter, matchesStoreType, storeTypeProfile, type RenovationFilter, type StoreTypeFilter } from '../utils/storeTypes'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import { buildPriceAdvice } from '../utils/priceAdvice'

const FILTERS: StoreTypeFilter[] = ['全部门店','直营店','新开店','非新开存量店']

export default function StoreSpecialtyPanel({ rows, comparisonRows, channelRows, value, renovationFilter, openingAgeOptions, openingAgeFilter, priceSettings, onChange, onRenovationChange, onOpeningAgeChange }: {
  rows: MetricRow[]
  comparisonRows: ComparisonRow[]
  channelRows: SnapshotRecord[]
  value: StoreTypeFilter
  renovationFilter: RenovationFilter
  openingAgeOptions: string[]
  openingAgeFilter: string[]
  priceSettings?: Partial<PriceAdviceSettings>
  onChange: (value: StoreTypeFilter) => void
  onRenovationChange: (value: RenovationFilter) => void
  onOpeningAgeChange: (value: string[]) => void
}) {
  const selected = rows.filter(row => matchesStoreType(row, value) && matchesRenovationFilter(row, renovationFilter))
  const metric = aggregate(selected)
  const mixByHotel = buildStoreChannelMix(channelRows)
  const selectedMix = selected.reduce((result, row) => {
    const mix = mixByHotel[row.whCode]
    if (!mix) return result
    result.ota += mix.ota * mix.total; result.online += mix.online * mix.total; result.offline += mix.offline * mix.total; result.total += mix.total
    return result
  }, { ota: 0, online: 0, offline: 0, total: 0 })
  const zoneGroups = rows.reduce<Record<string, MetricRow[]>>((result, row) => {
    if (row.revenueZone) (result[row.revenueZone] ||= []).push(row)
    return result
  }, {})
  const zoneMetrics = Object.entries(zoneGroups).reduce<Record<string, ReturnType<typeof aggregate>>>((result, [name, zoneRows]) => {
    result[name] = aggregate(zoneRows, comparisonRows.filter(row => row.revenueZone === name))
    return result
  }, {})
  const belowZone = selected.filter(row => {
    const zone = row.revenueZone ? aggregate(zoneGroups[row.revenueZone] || []).bookingRate : null
    return row.bookingRate != null && zone != null && row.bookingRate < zone
  }).length
  const zero = selected.filter(row => row.bookedRooms === 0 && !row.tags.includes('缺失预订数据')).length
  const profiles = selected.map(storeTypeProfile)
  const specialtyLabel = renovationFilter !== '全部' ? renovationFilter : value
  const selectedAdvice = selected.map(row => {
    const zone = row.revenueZone ? zoneMetrics[row.revenueZone] : undefined
    const advice = buildPriceAdvice(row, {
      zoneBookingRate: zone?.bookingRate ?? null, zoneAdr: zone?.adr ?? null, zoneLastOcc: zone?.lastOcc ?? null,
      zoneLastAdr: zone?.lastAdr ?? null, zoneStoreCount: row.revenueZone ? zoneGroups[row.revenueZone]?.length || 0 : 0,
      zoneBookingRateChange: zone?.bookingRateChange ?? null,
      zoneBookedChange: zone?.previousAvailableRooms ? zone.bookedRooms - zone.previousBookedRooms : null,
    }, priceSettings)
    return { row, zone, advice }
  })
  const priceLabels = selectedAdvice.map(item => item.advice.label)
  const highRisk = selectedAdvice.filter(({ row, zone, advice }) => analyzeStore(
    row,
    zone?.bookingRate ?? null,
    mixByHotel[row.whCode] || EMPTY_STORE_MIX,
    false,
    { zoneAdr: zone?.adr ?? null, zoneBookingRateChange: zone?.bookingRateChange ?? null, priceAdviceLabel: advice.label },
  ).grade === 'S').length
  const renovationTypes = [...new Set(rows.filter(row => row.isRenovated).map(row => row.renovationType || '改造类型未标记'))].sort((a,b) => a.localeCompare(b, 'zh-CN'))
  const renovationPerspective = renovationFilter === '改造店' || renovationTypes.includes(renovationFilter)
  const averageOpenMonths = profiles.map(item => item.openMonths).filter((value): value is number => value != null)
  const cards = value === '全部门店' && renovationFilter === '全部'
    ? [
        ['直营店数量', rows.filter(row => storeTypeProfile(row).direct).length, '家'],
        ['新开店数量', rows.filter(row => storeTypeProfile(row).isNew).length, '家'],
        ['改造店数量', rows.filter(row => storeTypeProfile(row).isRenovated).length, '家'],
        ['新开0预定', rows.filter(row => storeTypeProfile(row).isNew && row.bookedRooms === 0).length, '家'],
        ['改造0预定', rows.filter(row => storeTypeProfile(row).isRenovated && row.bookedRooms === 0).length, '家'],
        ['直营风险门店', rows.filter(row => storeTypeProfile(row).direct && (row.risk === 'high' || row.risk === 'watch')).length, '家'],
      ]
    : [
        [`${specialtyLabel}数量`, selected.length, '家'],
        ...(value === '新开店' ? [['平均开业月龄', averageOpenMonths.length ? Math.round(averageOpenMonths.reduce((a,b) => a + b, 0) / averageOpenMonths.length) : '--', '个月']] : []),
        ...(renovationFilter === '改造店' ? renovationTypes.map(type => [`${type}门店`, rows.filter(row => matchesStoreType(row, value) && row.isRenovated && (row.renovationType || '改造类型未标记') === type).length, '家']) : []),
        ['预订率', fmtPct(metric.bookingRate), ''],
        ['在手ADR', fmtMoney(metric.adr), ''],
        ['理论RP', fmtMoney(metric.rp), ''],
        ['同期RP', fmtMoney(metric.lastRp), ''],
        ['RP缺口', metric.rp != null && metric.lastRp != null ? fmtMoney(metric.rp - metric.lastRp) : '--', ''],
        ['较上版预订率', fmtPp(metric.bookingRateChange), ''],
        ['0预定门店', zero, '家'],
        ['低于商圈', belowZone, '家'],
        ['高风险门店', highRisk, '家'],
        ...(renovationPerspective ? [
          ['建议提价门店', priceLabels.filter(label => ['强烈建议提价','建议提价','建议小幅提价','阶梯式提价','提前提价机会'].includes(label)).length, '家'],
          ['价格偏高风险', priceLabels.filter(label => label === '价格偏高风险').length, '家'],
        ] : []),
      ]
  const toggleOpeningAge = (option: string) => onOpeningAgeChange(
    openingAgeFilter.includes(option) ? openingAgeFilter.filter(value => value !== option) : [...openingAgeFilter, option],
  )
  return <section className="store-specialty-panel">
    <div className="store-specialty-head"><div><b>门店类型专项视角</b><span>类型标签不等于经营异常；仅作用于当前在营门店</span></div>
      <div className="store-type-actions"><div className="store-type-filter">{FILTERS.map(filter => <button className={value === filter ? 'active' : ''} key={filter} onClick={() => onChange(filter)}>{filter}</button>)}</div>
        <label><span>改造店筛选</span><select value={renovationFilter} onChange={event => onRenovationChange(event.target.value)}><option>全部</option><option>改造店</option><option>非改造店</option>{renovationTypes.map(type => <option key={type}>{type}</option>)}</select></label></div>
    </div>
    <div className="opening-age-filter">
      <div className="opening-age-head"><span><b>开业年限</b><small>{openingAgeFilter.length ? `已选 ${openingAgeFilter.length} 项` : '默认不筛选，展示全部当前在营门店'}</small></span><div><button onClick={() => onOpeningAgeChange(openingAgeOptions)}>全选</button><button className="clear" onClick={() => onOpeningAgeChange([])}>清空</button></div></div>
      <div className="opening-age-grid">{openingAgeOptions.map(option => <button className={openingAgeFilter.includes(option) ? 'active' : ''} onClick={() => toggleOpeningAge(option)} key={option}>{option}</button>)}</div>
    </div>
    <div className="store-specialty-cards">{cards.map(([label, number, unit]) => <article key={String(label)}><small>{label}</small><b>{number}<em>{unit}</em></b></article>)}</div>
    {(value !== '全部门店' || renovationFilter !== '全部') && <div className="store-specialty-channel"><span>渠道结构</span><b>各OTA {fmtPct(selectedMix.total ? selectedMix.ota / selectedMix.total : 0)}</b><b>线上直销 {fmtPct(selectedMix.total ? selectedMix.online / selectedMix.total : 0)}</b><b>线下直销 {fmtPct(selectedMix.total ? selectedMix.offline / selectedMix.total : 0)}</b></div>}
    {renovationPerspective && <div className="renovation-type-compare"><div><b>改造类型对比</b><span>均按当前在营门店加权汇总</span></div>{renovationTypes.map(type => {
      const typeRows = rows.filter(row => matchesStoreType(row, value) && row.isRenovated && (row.renovationType || '改造类型未标记') === type)
      const typeMetric = aggregate(typeRows)
      return <article key={type}><strong>{type}</strong><span>{typeRows.length} 家</span><span>预订率 {fmtPct(typeMetric.bookingRate)}</span><span>ADR {fmtMoney(typeMetric.adr)}</span><span>理论RP {fmtMoney(typeMetric.rp)}</span><span>0预定 {typeRows.filter(row => row.bookedRooms === 0).length} 家</span></article>
    })}</div>}
  </section>
}
