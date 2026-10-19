// FFlow 官网脚本：从 manifest.json 读取版本信息渲染页面。
// 页面 HTML 内已有同内容的静态兜底（file:// 直开也能看），此处仅做覆盖更新；
// manifest.json 由 tools/build-manifest.mjs 从产品仓 CHANGELOG.md 生成，
// 同时是将来应用内“检查更新”的数据源（GET manifest.json）。
(async () => {
  // 需求反馈直达公开站仓 issues（产品仓私有，用户不可见）。
  const FEEDBACK_REPO = 'https://github.com/allong6/fflow-site';
  document.getElementById('fbNewBtn')?.setAttribute(
    'href', FEEDBACK_REPO + '/issues/new?template=feature.md');
  document.getElementById('fbListBtn')?.setAttribute(
    'href', FEEDBACK_REPO + '/issues');

  // 其他下载路径面板开合（manifest 加载失败也可用）
  document.getElementById('altDlToggle')?.addEventListener('click', () => {
    const p = document.getElementById('altDlPanel');
    const shown = p.classList.toggle('hidden') === false;
    document.getElementById('altDlToggle').setAttribute('aria-expanded', String(shown));
  });

  let m;
  try {
    const res = await fetch('manifest.json');
    if (!res.ok) return;
    m = await res.json();
  } catch { return; } // file:// 或离线时保持静态内容

  const ver = 'v' + m.version;
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('ver-badge', ver + ' · ' + m.date);
  setText('ver-inline', ver);
  setText('date-inline', m.date);

  const mb = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';
  const esc = (t) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 发布亮点横幅（release note）：最新版本段的新增条目；包未就绪时如实标注
  if (Array.isArray(m.releases) && m.releases.length && document.getElementById('rbList')) {
    const r = m.releases[0];
    setText('rbVer', 'v' + r.version);
    setText('rbDate', r.date);
    const items = (r.notes || []).filter((n) => n.startsWith('【新增】'))
      .map((n) => n.replace(/^【新增】/, ''));
    const shown = items.length ? items : (r.notes || []).slice(0, 2);
    document.getElementById('rbList').replaceChildren(...shown.map((t) => {
      const li = document.createElement('li');
      li.innerHTML = esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return li;
    }));
    const note = document.getElementById('rbNote');
    if (note) {
      if (r.version === m.version) {
        note.classList.add('hidden');
      } else {
        note.textContent = '新版整理中，当前提供 v' + m.version + ' 下载。';
      }
    }
  }

  for (const d of m.downloads || []) {
    if (d.id !== 'lite') continue;
    const sizeText = mb(d.size);
    const btns = [document.getElementById('dl-hero'), document.getElementById('dl-lite')];
    for (const b of btns) if (b) { b.href = d.file; b.setAttribute('download', ''); }
    setText('size-hero', sizeText);
    setText('size-card', sizeText);
    setText('sha-lite', d.sha256 || '');
  }

  // 处理引擎包入口（manifest.tools 驱动）：主路径是应用内一键获取，
  // 此入口供离线机器/手动配置场景
  if (m.tools) {
    const t = m.tools;
    const dl = document.getElementById('tool-dl');
    if (dl) { dl.href = t.zip; dl.setAttribute('download', ''); }
    setText('tool-file', (t.zip || '').split('/').pop());
    setText('tool-size', mb(t.size));
    setText('tool-sha', t.sha256 || '');
    // 其他下载路径（网盘等人工渠道，tools/mirrors.json 维护）：列表渲染，
    // 为空显示整理中提示
    const panel = document.getElementById('altDlPanel');
    if (panel) {
      const alts = t.alt || [];
      if (alts.length) {
        panel.replaceChildren(...alts.map((a) => {
          const row = document.createElement('div');
          row.className = 'alt-row';
          const b = document.createElement('b');
          b.textContent = a.label || a.url;
          const nt = document.createElement('span');
          nt.className = 'muted';
          nt.textContent = a.note || '';
          const link = document.createElement('a');
          link.className = 'btn';
          link.href = a.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = '前往下载';
          row.append(b, nt, link);
          return row;
        }));
      } else {
        const empty = document.createElement('p');
        empty.className = 'alt-empty';
        empty.textContent = '更多下载渠道整理中，近期开放。';
        panel.replaceChildren(empty);
      }
    }
  }

  // 更新说明：渲染 manifest.releases 全量版本历史（新 → 旧）。
  // CHANGELOG 里的 **加粗** 标记转 <strong>，其余按纯文本转义。
  const list = document.getElementById('cl-list');
  if (list && Array.isArray(m.releases) && m.releases.length) {
    const TAGCLS = { '新增': 't-add', '改进': 't-imp', '修复': 't-fix' };
    list.replaceChildren(
      ...m.releases.map((r, i) => {
        const art = document.createElement('details');
        art.className = 'release';
        if (i === 0) art.open = true; // 默认只展开最新版
        const head = document.createElement('summary');
        head.className = 'rel-head';
        const wrap = document.createElement('span');
        wrap.className = 'rel-in';
        const ver = document.createElement('span');
        ver.className = 'rel-ver';
        ver.textContent = 'v' + r.version;
        const date = document.createElement('span');
        date.className = 'rel-date';
        date.textContent = r.date;
        wrap.append(ver, date);
        if (Array.isArray(r.downloads) && r.downloads.length) {
          const d = r.downloads[0];
          const a = document.createElement('a');
          a.className = 'rel-dl';
          a.href = d.file;
          a.setAttribute('download', '');
          a.textContent = '下载本版 · ' + mb(d.size);
          a.addEventListener('click', (e) => e.stopPropagation()); // 下载不触发折叠
          wrap.appendChild(a);
        }
        head.appendChild(wrap);
        const ul = document.createElement('ul');
        for (const n of r.notes || []) {
          const li = document.createElement('li');
          let text = n;
          let tag = '';
          const tm = n.match(/^【(新增|改进|修复)】/);
          if (tm) { tag = tm[1]; text = n.slice(tm[0].length); }
          const html = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
          li.innerHTML = (tag ? '<span class="rel-tag ' + (TAGCLS[tag] || '') + '">' + tag + '</span>' : '') + html;
          ul.appendChild(li);
        }
        art.append(head, ul);
        return art;
      }),
    );
  }
})();
