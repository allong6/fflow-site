#!/usr/bin/env node
// 发版脚本：产品仓 CHANGELOG.md + tools/release-attachments.json（Release
// 附件登记）→ manifest.json。
//
// 用法（在 fflow-site 目录下）：
//   node tools/build-manifest.mjs [CHANGELOG 路径]
//   （路径缺省 ../fflow/docs/CHANGELOG.md，即旁边的产品仓）
//
// 托管模型（2026-10-20 起）：所有安装包与引擎包统一挂 GitHub Release
// 附件，站仓不再存任何 zip（版本包每版 3+ 份、引擎包 72~135MB，仓库
// 体积随版本线性膨胀，且 Linux 引擎包 135MB 超单文件 100MB 上限）。
// 发版流程：gh release create v<x.y.z> 上传全部附件 → 按 dist 校对
// size/sha256 更新 release-attachments.json → 重跑本脚本。
// mirrors.json（网盘渠道）与 videos.json（讲解视频）照旧手工维护并入。

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath =
  process.argv[2] ?? join(root, '..', 'fflow', 'docs', 'CHANGELOG.md');
const REL_BASE = 'https://github.com/allong6/fflow-site/releases/download/';
const relUrl = (release, file) => REL_BASE + release + '/' + file;

// 下载条目 id -> 展示名（页面/下拉共用短口径）
const LABELS = {
  lite: 'Windows 10 / 11',
  full: 'Windows 完整版',
  linux: 'Linux（Ubuntu 22.04+ / Debian 12+ 等）',
  'linux-old': 'Linux（Ubuntu 20.04 / Debian 11 / 麒麟 / 统信）',
};
// 条目固定顺序：Windows 主/全 → Linux 新/旧
const DL_ORDER = ['lite', 'full', 'linux', 'linux-old'];

// ---- 解析 CHANGELOG ----

function parseChangelog(text) {
  const releases = [];
  let cur = null;
  let section = '';
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
      cur.notes.push({ text: line.trim() });
    }
  }
  for (const r of releases) r.notes = r.notes.map((n) => n.text);
  return releases;
}

// ---- Release 附件登记 ----

let cfg;
try {
  cfg = JSON.parse(readFileSync(join(root, 'tools', 'release-attachments.json'), 'utf8'));
} catch (e) {
  console.error('缺/坏 tools/release-attachments.json: ' + e.message);
  process.exit(1);
}

const releases = parseChangelog(readFileSync(changelogPath, 'utf8'));
if (releases.length === 0) {
  console.error(`未在 ${changelogPath} 解析到任何版本段（期望「## vX.Y.Z（YYYY-MM-DD）」）`);
  process.exit(1);
}

let published = null;
for (const r of releases) {
  const list = (cfg.versions && cfg.versions[r.version]) || [];
  if (!list.length) continue;
  const byId = new Map(list.map((e) => [e.id, e]));
  r.downloads = DL_ORDER.filter((id) => byId.has(id)).map((id) => {
    const e = byId.get(id);
    return {
      id,
      label: LABELS[id] || id,
      file: relUrl(e.release || ('v' + r.version), e.file),
      size: e.size,
      sha256: e.sha256,
    };
  });
  if (!published) published = r;
}
if (!published) {
  console.error('release-attachments.json 里没有与 CHANGELOG 版本对应的附件登记，未生成 manifest。');
  process.exit(1);
}
if (published !== releases[0]) {
  console.warn(
    `提醒：CHANGELOG 最新版 v${releases[0].version} 尚无附件登记（release-attachments.json 缺 versions["${releases[0].version}"]），` +
      `manifest 仍指向 v${published.version}。发版上传附件并登记后重跑本脚本即可发布。`,
  );
}

// ---- 引擎包（App 按 GOOS 取：顶层=Windows，tools.linux=Linux） ----

const engine = (e) =>
  e ? {
    ffmpeg: e.ffmpeg,
    zip: relUrl(e.release, e.file),
    size: e.size,
    sha256: e.sha256,
    urls: [relUrl(e.release, e.file)],
  } : null;

// ---- 版本讲解视频（tools/videos.json） ----
let videos = {};
try {
  videos = JSON.parse(readFileSync(join(root, 'tools', 'videos.json'), 'utf8'));
} catch { videos = {}; }

const manifest = {
  name: 'FFlow',
  channel: 'stable',
  version: published.version,
  date: published.date,
  notes: published.notes,
  releases: releases.map((r) => ({
    version: r.version,
    date: r.date,
    notes: r.notes,
    ...(videos[r.version] ? { video: videos[r.version] } : {}),
    ...(r.downloads ? { downloads: r.downloads } : {}),
  })),
  downloads: published.downloads,
};

const toolsWin = engine(cfg.engines && cfg.engines.win);
const toolsLinux = engine(cfg.engines && cfg.engines.linux);
if (toolsWin) manifest.tools = toolsWin;
if (toolsLinux) (manifest.tools = manifest.tools || {}).linux = toolsLinux;

// 引擎包人工下载渠道（网盘等）：tools/mirrors.json 手工维护，合并进
// manifest.tools.alt（页面"其他下载路径"渲染它；应用镜像 urls 与此无关）
try {
  const j = JSON.parse(readFileSync(join(root, 'tools', 'mirrors.json'), 'utf8'));
  if (Array.isArray(j.alt) && j.alt.length) {
    (manifest.tools = manifest.tools || {}).alt = j.alt;
  }
} catch { /* mirrors.json 缺失/为空：不加 alt 段 */ }

const out = join(root, 'manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');

console.log(`manifest.json 已生成：最新已发布 v${published.version}（${published.date}，Release 附件托管）`);
for (const r of releases) {
  console.log(
    `  v${r.version}（${r.date}）${r.downloads ? ' 有附件 ' + r.downloads.length + ' 项' : ' 无下载（仅更新说明）'}，${r.notes.length} 条`,
  );
}
