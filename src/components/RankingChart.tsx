import ReactECharts from 'echarts-for-react'
import type { MetricRow } from '../types/data'
import { aggregateBy } from '../utils/metrics'

const shortCityName = (name: string) => name
  .replace(/(哈萨克|蒙古|藏族|彝族|苗族|侗族|布依族|傣族|景颇族|壮族|羌族|回族|土家族|白族|哈尼族|傈僳族|佤族|拉祜族|纳西族|瑶族|仡佬族|水族|毛南族|仫佬族|柯尔克孜族).*(自治州|自治县)$/, '')
  .replace(/自治州|地区|市|自治县|县|盟$/g, '')

const TREEMAP_COLORS = ['#7EB3F7','#8A9CF6','#78D3E6','#76CFB0','#A6A0F2','#F3B76C','#67A7EE','#6DC7C2','#94B7F1','#B39BE8']

export default function RankingChart({ rows, level, title, onSelect, variant = 'bar' }: {
  rows: MetricRow[]
  level: 'province' | 'area' | 'city' | 'revenueZone'
  title: string
  onSelect: (name: string) => void
  variant?: 'bar' | 'treemap'
}) {
  const ranked = aggregateBy(rows, level).sort((a, b) => (b.bookingRate || 0) - (a.bookingRate || 0))
  const items = ranked.slice(0, variant === 'treemap' ? 36 : 10)
  const barItems = [...items].reverse()
  const barOption = {
    grid: { left: 22, right: 36, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: Array<{ name: string; value: number }>) => `${p[0]?.name}<br/>预订率 <b>${p[0]?.value.toFixed(2)}%</b>` },
    xAxis: { type: 'value', axisLabel: { color: '#9CA3AF', fontSize: 11, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#EDF2F7' } } },
    yAxis: { type: 'category', data: barItems.map(x => x.name), axisLabel: { color: '#526277', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', data: barItems.map(x => Number(((x.bookingRate || 0) * 100).toFixed(2))), barWidth: 11, itemStyle: { color: '#3B82F6', borderRadius: [0, 6, 6, 0] }, label: { show: true, position: 'right', color: '#526277', fontSize: 10, formatter: '{c}%' } }],
  }
  const treemapOption = {
    tooltip: {
      backgroundColor: 'rgba(255,255,255,.98)',
      borderColor: '#c8d8e9',
      textStyle: { color: '#29445f', fontSize: 10 },
      formatter: (params: { data: { originalName: string; rate: number; stores: number; availableRooms: number; rank: number } }) => `<b>第${params.data.rank}名 · ${params.data.originalName}</b><br/>预订率：<b>${params.data.rate.toFixed(2)}%</b><br/>在营门店：${params.data.stores}家<br/>可售房：${params.data.availableRooms}`,
    },
    series: [{
      type: 'treemap',
      sort: 'desc',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      top: 10,
      left: 12,
      right: 12,
      bottom: 12,
      data: items.map((item, index) => ({
        name: item.name,
        originalName: item.name,
        shortName: shortCityName(item.name),
        value: 100 + (items.length - index) * .5,
        rate: (item.bookingRate || 0) * 100,
        rank: index + 1,
        stores: item.rows.length,
        availableRooms: item.availableRooms,
        itemStyle: { color: TREEMAP_COLORS[index % TREEMAP_COLORS.length] },
      })),
      label: { show: true, color: '#173b67', fontSize: 9, lineHeight: 14, overflow: 'break', formatter: (params: { data: { shortName: string; rate: number; rank: number } }) => `${params.data.rank}. ${params.data.shortName}\n${params.data.rate.toFixed(1)}%` },
      upperLabel: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 3, borderRadius: 7 },
      emphasis: { itemStyle: { borderColor: '#2563EB', borderWidth: 2, shadowBlur: 10, shadowColor: '#2F6BFF44' } },
    }],
  }
  const option = variant === 'treemap' ? treemapOption : barOption
  return <section className="light-card ranking-card">
    <div className="light-card-head"><div><h2>{title}</h2><p>{variant === 'treemap' ? '按预订率降序排列，矩形面积均衡处理，多色区分城市；点击城市联动筛选' : '按预订率排序，点击柱形联动筛选'}</p></div></div>
    <ReactECharts option={option} style={{ height: variant === 'treemap' ? 370 : 310 }} onEvents={{ click: (params: { name: string; data?: { originalName?: string } }) => onSelect(params.data?.originalName || params.name) }}/>
  </section>
}
