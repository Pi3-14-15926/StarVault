import { onMounted, onUnmounted, watch } from 'vue'
import { useSettingStore } from '../store/settings'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import { syncAllGitHub } from '../utils/api'
import type { ScheduleConfig } from '../types'

export function useScheduler() {
  const settings = useSettingStore()
  const projects = useProjectStore()
  const categories = useCategoryStore()

  let timers: ReturnType<typeof setInterval>[] = []

  function clearTimers() {
    timers.forEach(t => clearInterval(t))
    timers = []
  }

  async function runBackup() {
    const ghProjects = projects.projects.filter(
      p => p.sourceType === 'github' && p.versions.length > 0,
    )
    if (ghProjects.length === 0) return

    const backupData = ghProjects.map(p => ({
      categoryName: categories.categories.find(c => c.id === p.categoryId)?.name || '未分类',
      projectName: p.name,
      projectId: p.id,
      versions: p.versions.map(v => ({
        version: v.version,
        publishedAt: v.publishedAt,
        downloads: v.downloads.map(d => ({
          filename: d.filename,
          url: d.url,
        })),
      })),
    }))

    const requestBody: any = { projects: backupData }
    const proxyUrl = settings.settings.ghProxyUrl
    const proxyEnabled = settings.settings.ghProxyEnabled ?? false
    if (proxyEnabled && proxyUrl) {
      requestBody.ghProxy = proxyUrl
    }

    try {
      const res = await fetch('/__backup-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        decoder.decode(value, { stream: true })
      }
    } catch {
      // silent fail for scheduled backup
    }
  }

  function applySchedule(cfg?: ScheduleConfig) {
    clearTimers()
    if (!cfg) return

    if (cfg.syncEnabled && cfg.syncIntervalHours > 0) {
      const ms = cfg.syncIntervalHours * 60 * 60 * 1000
      timers.push(setInterval(() => syncAllGitHub(), ms))
    }

    if (cfg.backupEnabled && cfg.backupIntervalHours > 0) {
      const ms = cfg.backupIntervalHours * 60 * 60 * 1000
      timers.push(setInterval(() => runBackup(), ms))
    }
  }

  onMounted(() => {
    applySchedule(settings.settings.schedule)
  })

  onUnmounted(clearTimers)

  watch(() => settings.settings.schedule, (cfg) => {
    applySchedule(cfg)
  }, { deep: true })
}
