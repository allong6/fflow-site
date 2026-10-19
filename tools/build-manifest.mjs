#!/usr/bin/env node
// 发版脚本：从产品仓 CHANGELOG.md + downloads/ 安装包生成 manifest.json。
//
// 用法（在 fflow-site 目录下）：
//   node tools/build-manifest.mjs [CHANGELOG 路径]
//   （路径缺省 ../fflow/docs/CHANGELOG.md，即旁边的产品仓）
//
// 规则：
//   - 版本段取 CHANGELOG 顶部「## vX.Y.Z（YYYY-MM-DD）」序列，新 → 旧；
//   - 安装包按「包名日期 = 版本日期」匹配 downloads/FFlow-win64-<yyyymmdd>-{full,lite}.zip；
//     历史上日期不一致的版本在下方 OVERRIDES 里登记；
//   - 最新版本若还没有对应安装包，manifest 仍指向最近一个有包的版本，
//     并打印提醒（把新包丢进 downloads/ 后重跑即可发布）；
//   - manifest.releases 携带全部版本的更新说明（官网“更新说明”区完整渲染），
//     downloads 只附最新已发布版本的双包。

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath =
  process.argv[2] ?? join(root, '..', 'fflow', 'docs', 'CHANGELOG.md');

// CHANGELOG 版本日期 ≠ 实际包名日期的历史修正（版本号不带 v 前缀）。
// 例：'1.0.0': '20261015'（CHANGELOG 写 2026-10-17，实际发包为 10-15）
const OVERRIDES = {
  '1.0.0': '20261015',
};

// ---- 解析 CHANGELOG ----

function parseChangelog(text) {
  const releases = [];
  let cur = null;
  let section = ''; // ### 子标题（新增/改进/修复），作为条目前缀
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = line.match(/^##\s+v([\d.]+)（([^）]+)）\s*$/);
    if (h) {
      cur = { version: h[1], date: h[2], notes: [] };
      releases.push(cur);
      section = '';
      continue;
    }
    if (!cur) continue;
    const sub = line.match(/^###\s+(.+)$/);
    if (sub) {
      section = sub[1].trim();
      continue;
    }
    if (/^\s+-\s+/.test(line)) {
      // 缩进子弹并进上一条（如动态水印的三种方式）
      const last = cur.notes[cur.notes.length - 1];
      if (last) {
        const tail = line.replace(/^\s+-\s+/, '').replace(/[；;]\s*$/, '');
        last.text = last.text.replace(/[；;]\s*$/, '') + '；' + tail;
      }
      continue;
    }
    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      cur.notes.push({
        text: (section ? `【${section}】` : '') + bullet[1].trim(),
      });
      continue;
    }
    if (line.trim() && !line.startsWith('#') && !line.startsWith('<!--')) {
      // 段落文字（如 v1.0.0 首段简介）作为独立条目
      cur.notes.push({ text: line.trim() });
    }
  }
  for (const r of releases) r.notes = r.notes.map((n) => n.text);
  return releases;
}

// ---- 扫描 downloads/ 与 tools/ ----

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function scanDownloads() {
  const dir = join(root, 'downloads');
  const byDate = new Map(); // yyyymmdd -> { full: {…}, lite: {…} }
  for (const name of readdirSync(dir)) {
    const m = name.match(/^FFlow-win64-(\d{8})-(full|lite)\.zip$/);
    if (!m) continue;
    const [, d8, kind] = m;
    const file = `downloads/${name}`;
    const abs = join(root, 'downloads', name);
    if (!byDate.has(d8)) byDate.set(d8, {});
    byDate.get(d8)[kind] = {
      id: kind,
      label: kind === 'full' ? '完整版（内嵌处理引擎，解压即用）' : '主程序（处理引擎首次使用时一键获取）',
      file,
      size: readFileSync(abs).length,
      sha256: sha256(abs),
    };
  }
  return byDate;
}

// scanTools 扫描独立引擎包 tools/ff-<ver>-win64.zip（双工具置于 zip 根，
// 应用端网络获取即下载它）。urls 生成相对地址——应用按 manifest 基地址
// 拼绝对 URL，加镜像 = 在数组里补一条（绝对/相对均可）。
function scanTools() {
  const dir = join(root, 'tools');
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const best = entries
    .map((n) => {
      const m = n.match(/^ff-([\d.]+)-win64\.zip$/);
      return m ? { name: n, ver: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => cmpVer(a.ver, b.ver))
    .at(-1);
  if (!best) return null;
  const abs = join(dir, best.name);
  return {
    ffmpeg: best.ver,
    zip: `tools/${best.name}`,
    size: readFileSync(abs).length,
    sha256: sha256(abs),
    urls: [`tools/${best.name}`],
  };
}

function cmpVer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

// ---- 组装 manifest ----

const releases = parseChangelog(readFileSync(changelogPath, 'utf8'));
if (releases.length === 0) {
  console.error(`未在 ${changelogPath} 解析到任何版本段（期望「## vX.Y.Z（YYYY-MM-DD）」）`);
  process.exit(1);
}
const zips = scanDownloads();

let published = null;
for (const r of releases) {
  const d8 = OVERRIDES[r.version] ?? r.date.replace(/-/g, '');
  const pair = zips.get(d8);
  r.zipDate = d8;
  // 站仓 git 只进 lite（full 不入库；如需提供完整包走 GitHub Releases
  // 附件，downloads/ 偶有 full 时仅追加在 lite 之后供过渡）
  if (pair && pair.lite) {
    r.downloads = pair.full ? [pair.lite, pair.full] : [pair.lite];
    if (!published) published = r;
  }
}

if (!published) {
  console.error('downloads/ 里没有任何与 CHANGELOG 版本日期匹配的安装包，未生成 manifest。');
  process.exit(1);
}
if (published !== releases[0]) {
  console.warn(
    `提醒：CHANGELOG 最新版 v${releases[0].version} 尚无安装包（缺 FFlow-win64-${releases[0].zipDate}-*.zip），` +
      `manifest 仍指向 v${published.version}。新包放入 downloads/ 后重跑本脚本即可发布。`,
  );
}

const manifest = {
  name: 'FFlow',
  platform: 'windows-x64',
  channel: 'stable',
  version: published.version,
  date: published.date,
  notes: published.notes,
  releases: releases.map((r) => ({
    version: r.version,
    date: r.date,
    notes: r.notes,
    ...(r.downloads ? { downloads: r.downloads } : {}),
  })),
  downloads: published.downloads,
};
const tools = scanTools();
if (tools) manifest.tools = tools;

// 引擎包人工下载渠道（网盘等）：tools/mirrors.json 手工维护，合并进
// manifest.tools.alt（页面“其他下载路径”渲染它；应用镜像 urls 与此无关）
try {
  const j = JSON.parse(readFileSync(join(root, 'tools', 'mirrors.json'), 'utf8'));
  if (Array.isArray(j.alt) && j.alt.length) {
    (manifest.tools = manifest.tools || {}).alt = j.alt;
  }
} catch { /* mirrors.json 缺失/为空：不加 alt 段 */ }

const out = join(root, 'manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');

console.log(`manifest.json 已生成：最新已发布 v${published.version}（${published.date}，包日期 ${published.zipDate}）`);
for (const r of releases) {
  console.log(
    `  v${r.version}（${r.date}）${r.downloads ? ' 有安装包' : ' 无安装包（仅更新说明）'}，${r.notes.length} 条`,
  );
}
