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

  // ---- 下载：下拉按钮模式（点击展开当前版本各平台下载项） ----
  // 平台条目短名（菜单用；与 build-manifest 的 LABELS 对应但更短）
  const PLAT_SHORT = {
    lite: 'Windows 10 / 11',
    full: 'Windows 完整版',
    linux: 'Linux（Ubuntu 22.04+ / Debian 12+ 等）',
    'linux-old': 'Linux（Ubuntu 20.04 / Debian 11 / 麒麟 / 统信）',
  };

  const closeAllDdl = () =>
    document.querySelectorAll('.ddl.open').forEach((w) => {
      w.classList.remove('open');
      const m = w.querySelector('.ddl-menu');
      if (m) m.hidden = true;
    });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ddl')) closeAllDdl();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDdl();
  });

  // buildDdl 装配一个下拉按钮：items = manifest 下载条目数组。
  // toggle 保持首项直链兜底（无 JS/菜单外点击直下首平台）。
  function buildDdl(wrapId, items, toggleText) {
    const wrap = document.getElementById(wrapId);
    if (!wrap || !items.length) return;
    const toggle = wrap.querySelector('.ddl-toggle');
    const menu = wrap.querySelector('.ddl-menu');
    toggle.href = items[0].file;
    toggle.setAttribute('download', '');
    if (toggleText) {
      const caret = toggle.querySelector('.caret');
      toggle.textContent = '';
      toggle.append(toggleText);
      if (caret) toggle.append(caret);
    }
    menu.replaceChildren(...items.map((d) => {
      const a = document.createElement('a');
      a.className = 'ddl-item';
      a.href = d.file;
      a.setAttribute('download', '');
      const name = document.createElement('span');
      name.textContent = PLAT_SHORT[d.id] || d.label;
      const size = document.createElement('span');
      size.className = 'muted';
      size.textContent = mb(d.size);
      a.append(name, size);
      a.addEventListener('click', () => closeAllDdl());
      return a;
    }));
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const willOpen = !wrap.classList.contains('open');
      closeAllDdl();
      if (willOpen) {
        wrap.classList.add('open');
        menu.hidden = false;
      }
    });
  }

  // 最新版本的下载条目：hero 与下载卡共用
  const latest = (m.releases || [])[0];
  const latestDl = (latest && latest.downloads) || m.downloads || [];
  buildDdl('hero-ddl', latestDl, '下载 FFlow');

  // ---- 下载卡（页面中部）：平台下拉切换，文件名/大小/校验/说明随选择更新 ----
  const entries = { win: null, linux: null, 'linux-old': null };
  for (const d of latestDl) {
    if (d.id === 'lite') entries.win = d;
    else if (d.id === 'linux') entries.linux = d;
    else if (d.id === 'linux-old') entries['linux-old'] = d;
  }
  const sel = document.getElementById('dl-platform');
  if (entries['linux-old'] && sel) {
    const opt = document.createElement('option');
    opt.value = 'linux-old';
    opt.textContent = 'Linux · 较旧系统（Ubuntu 20.04 / Debian 11 / 麒麟 / 统信等）';
    sel.appendChild(opt);
  }
  const NOTE = {
    win: '解压即用。处理引擎首次启动时在 设置 → 版本信息 一键安装（约 70 MB，仅一次）；已装有 ffmpeg 的自动识别。',
    linux: '单文件免安装：双击运行即自动安家、注册到应用菜单；升级解压新版再跑一次，引擎在应用内一键获取。',
    'linux-old': '较旧系统（Ubuntu 20.04 / Debian 11 / 麒麟 / 统信等）选此版；用法与较新版相同。',
  };
  function renderCard() {
    if (!sel) return;
    const plat = sel.value;
    const d = entries[plat] || entries.win;
    if (d) {
      const btn = document.getElementById('dl-main');
      if (btn) { btn.href = d.file; btn.setAttribute('download', ''); }
      setText('dl-filename', (d.file || '').split('/').pop() + ' · ' + mb(d.size));
      setText('sha-main', d.sha256 || '');
    }
    const note = document.getElementById('dl-note');
    if (note && NOTE[plat]) note.textContent = NOTE[plat];
    // Linux 判定依据只在选了 Linux 时展示
    const hint = document.getElementById('dl-hint');
    if (hint) hint.hidden = plat === 'win';
    const btnMain = document.getElementById('dl-main');
    if (btnMain) btnMain.textContent = plat === 'win' ? '下载 Windows 版' : '下载 Linux 版';

    // 处理引擎包随同一平台切换：win=站仓包（附网盘渠道行）；linux=
    // Release 附件直链（应用内在线安装同源）
    const t = m.tools || {};
    const e = plat === 'win' ? t : (t.linux || t);
    const dl = document.getElementById('tool-dl');
    if (dl && e.zip) { dl.href = e.zip; dl.setAttribute('download', ''); }
    if (e.zip) setText('tool-file', (e.zip || '').split('/').pop() + ' · ' + mb(e.size));
    setText('tool-sha', (e.sha256 || ''));
    const alt = document.getElementById('alt-ddl');
    if (alt) alt.hidden = plat !== 'win' || !((m.tools || {}).alt || []).length;
  }
  if (sel) sel.addEventListener('change', renderCard);
  renderCard();

  // 网盘渠道（tools/mirrors.json，仅 Windows 引擎包）：渲染一次成下拉菜单
  // （与下载下拉同组件）；Linux 平台下由 renderCard 整体隐藏，无渠道隐藏。
  // 点渠道：开新页 + 密码自动复制（提示挂在按钮旁，菜单随即收起）
  const altWrap = document.getElementById('alt-ddl');
  if (altWrap) {
    const alts = (m.tools || {}).alt || [];
    const altMenu = document.getElementById('alt-ddl-menu');
    const altToggle = document.getElementById('alt-toggle');
    if (alts.length && altMenu && altToggle) {
      altToggle.href = alts[0].url;
      altMenu.replaceChildren(...alts.map((a) => {
        const item = document.createElement('a');
        item.className = 'ddl-item';
        item.href = a.url;
        item.target = '_blank';
        item.rel = 'noopener';
        const name = document.createElement('span');
        name.textContent = a.label || a.url;
        item.append(name);
        if (a.password) {
          const pw = document.createElement('span');
          pw.className = 'muted';
          pw.textContent = '密码 ' + a.password;
          item.append(pw);
        } else if (a.note) {
          const note = document.createElement('span');
          note.className = 'muted';
          note.textContent = a.note;
          item.append(note);
        }
        item.addEventListener('click', () => {
          closeAllDdl();
          if (a.password) {
            navigator.clipboard?.writeText(String(a.password)).then(() => {
              const tip = document.createElement('span');
              tip.className = 'copy-ok';
              tip.textContent = '（密码已复制）';
              altToggle.after(tip);
              setTimeout(() => tip.remove(), 2500);
            }).catch(() => {});
          }
        });
        return item;
      }));
      altToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const willOpen = !altWrap.classList.contains('open');
        closeAllDdl();
        if (willOpen) { altWrap.classList.add('open'); altMenu.hidden = false; }
      });
    } else {
      altWrap.hidden = true;
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
        const ver = document.createElement('span');
        ver.className = 'rel-ver';
        ver.textContent = 'v' + r.version;
        const date = document.createElement('span');
        date.className = 'rel-date';
        date.textContent = r.date;
        head.append(ver, date);
        if (Array.isArray(r.downloads) && r.downloads.length) {
          // 所有版本统一下拉按钮（单包版本菜单只有一项，交互与样式一致；
          // 菜单右对齐防溢出）
          const wrap = document.createElement('span');
          wrap.className = 'ddl rel-ddl';
          const d0 = r.downloads[0];
          const toggle = document.createElement('a');
          toggle.className = 'rel-dl ddl-toggle';
          toggle.href = d0.file;
          toggle.setAttribute('download', '');
          toggle.textContent = '下载本版 ▾';
          const menu = document.createElement('div');
          menu.className = 'ddl-menu ddl-menu-right';
          menu.hidden = true;
          for (const d of r.downloads) {
            const item = document.createElement('a');
            item.className = 'ddl-item';
            item.href = d.file;
            item.setAttribute('download', '');
            const name = document.createElement('span');
            name.textContent = PLAT_SHORT[d.id] || d.label;
            const size = document.createElement('span');
            size.className = 'muted';
            size.textContent = mb(d.size);
            item.append(name, size);
            item.addEventListener('click', (e) => { e.stopPropagation(); closeAllDdl(); });
            menu.appendChild(item);
          }
          toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const willOpen = !wrap.classList.contains('open');
            closeAllDdl();
            if (willOpen) { wrap.classList.add('open'); menu.hidden = false; }
          });
          wrap.append(toggle, menu);
          head.appendChild(wrap);
        }
        if (r.video) {
          const v = document.createElement('a');
          v.className = 'rel-video';
          v.href = r.video;
          v.target = '_blank';
          v.rel = 'noopener';
          v.textContent = '视频讲解 ↗';
          v.addEventListener('click', (e) => e.stopPropagation()); // 跳转不触发折叠
          head.appendChild(v);
        }
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

// ---- QQ 交流群弹层：触屏点按切换（桌面 hover 由 CSS 承担）+ 复制群号 ----
const qqBtn = document.getElementById('qqBtn');
if (qqBtn) {
  const wrap = qqBtn.closest('.qq-wrap');
  qqBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
}
const qqCopy = document.getElementById('qqCopy');
if (qqCopy) {
  qqCopy.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText('1131263319').then(() => {
      const tip = document.createElement('span');
      tip.className = 'copy-ok';
      tip.textContent = '（已复制）';
      qqCopy.after(tip);
      setTimeout(() => tip.remove(), 2500);
    }).catch(() => {});
  });
}
