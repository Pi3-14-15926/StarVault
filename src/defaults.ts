import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  "siteName": "Software Hub",
  "logo": "https://i.postimg.cc/j5yhCmXp/dog.png",
  "admins": [
    "Pi3-14-15926"
  ],
  "footer": "© 2026 软件中心 • Powered by Software Hub",
  "storageNote": "收藏精品软件",
  "ghProxyEnabled": true,
  "ghProxyUrl": "https://gh-proxy.com/",
  "uploadTimeout": 600,
  "maxFileSizeMB": 500,
  "iconCdnMode": "jsdelivr",
  "schedule": {
    "syncEnabled": true,
    "syncIntervalHours": 24,
    "backupEnabled": true,
    "backupIntervalHours": 48
  },
  "webdav": {
    "url": "https://webdav.123pan.cn/webdav/Webdav/资源/",
    "username": "13249599730",
    "password": "MHnM+YgyUUS/HEAMiPrytE0XDt9G1cxBk4hlyLrueyieyopP",
    "baseDir": "/SoftwareHub",
    "uploadTimeout": 300,
    "maxFileSize": 500
  },
  "defaultChannel": "123webdav"
}
