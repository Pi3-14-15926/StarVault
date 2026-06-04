import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  siteName: 'Software Hub',
  logo: 'https://i.postimg.cc/j5yhCmXp/dog.png',
  admins: ['Pi3-14-15926'],
  footer: 'Powered by Software Hub',
  storageNote: '收藏精品软件',
  ghProxyEnabled: false,
  ghProxyUrl: 'https://gh.api.99988866.xyz/',
  schedule: {
    syncEnabled: false,
    syncIntervalHours: 6,
    backupEnabled: false,
    backupIntervalHours: 24,
  },
}
