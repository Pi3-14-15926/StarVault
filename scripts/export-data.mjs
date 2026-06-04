/**
 * 导出 localStorage 数据到 JSON 文件
 *
 * 用法:
 *   1. 在本地启动 dev server: npm run dev
 *   2. 浏览器打开后确保数据已加载
 *   3. 在浏览器控制台执行:
 *      copy(JSON.stringify(localStorage))
 *   4. 粘贴到临时文件，或用下面的 Puppeteer 方式
 *
 * 或用 Puppeteer 自动导出:
 *   node scripts/export-data.mjs
 *
 * 环境变量:
 *   DEV_URL — 本地开发地址 (默认 http://localhost:5173)
 */

import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve('public/data')

const keys = {
  sh_projects: 'projects.json',
  sh_categories: 'categories.json',
  sh_settings: 'settings.json',
}

// 检查是否从管道/stdin 读取
async function readStdin() {
  if (process.stdin.isTTY) return null
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

function parseAndWrite(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    console.error('无法解析 JSON，确保输入是完整的 localStorage JSON')
    process.exit(1)
  }

  for (const [key, filename] of Object.entries(keys)) {
    if (data[key]) {
      const filePath = path.join(DATA_DIR, filename)
      let value
      try {
        value = JSON.parse(data[key])
      } catch {
        value = data[key]
      }
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
      console.log(`已导出 ${key} → ${filename}`)
    } else {
      console.warn(`localStorage 中未找到 ${key}，跳过`)
    }
  }
  console.log('\n导出完成！请检查 public/data/ 下的文件并提交到仓库。')
}

async function main() {
  const stdin = await readStdin()
  if (stdin) {
    parseAndWrite(stdin)
    return
  }

  console.log(`
使用方法:

1. 启动开发服务器: npm run dev
2. 在浏览器打开 http://localhost:5173
3. 确保所有数据已加载
4. 在控制台执行以下命令:

   copy(JSON.stringify(localStorage))

5. 然后运行:

   node scripts/export-data.mjs < 粘贴到文件.txt

或者手动创建 public/data/ 下的三个 JSON 文件:
  - projects.json  — 项目列表（数组）
  - categories.json — 分类列表（数组）
  - settings.json   — 站点设置（对象）
`)
}

main()
