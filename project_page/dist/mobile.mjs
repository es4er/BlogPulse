const local = document.documentElement.dataset.mode === 'local';
export const mode = local ? 'local' : new URLSearchParams(location.search).has('demo') ? 'demo' : 'edition';
export const appPath = file => './' + file + (mode === 'demo' ? '?demo=1' : '');

const rail = document.createElement('nav');
rail.className = 'mobile-rail';
rail.setAttribute('aria-label', '移动端导航');
const icons = {
  reader: 'M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3z M12 7v14',
  library: 'M4 4h4v16H4z M11 4h3v16h-3z M16 6l3-1 3 14-3 1z',
  install: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5'
};
function railItem(label, icon, file) {
  const item = document.createElement(file ? 'a' : 'button');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', icons[icon]);
  svg.append(path);
  item.append(svg, label);
  if (file) {
    item.href = appPath(file);
    if (location.pathname.endsWith('/' + file)) item.setAttribute('aria-current', 'page');
  }
  rail.append(item);
  return item;
}
railItem('阅读', 'reader', 'reader.html');
railItem('知识库', 'library', 'library.html');
const install = railItem('安装与离线', 'install');
document.body.append(rail);

const guide = document.createElement('dialog');
guide.className = 'install-guide';
guide.setAttribute('aria-labelledby', 'install-heading');
guide.innerHTML = '<form method="dialog"><span class="eyebrow">POCKET EDITION</span><h2 id="install-heading">把阅读台装进口袋</h2><p><b>iPhone：</b>用 Safari 打开本站，点「分享」→「添加到主屏幕」。如有「作为网页 App 打开」选项，请开启。</p><p><b>Android：</b>用 Chrome 打开本站，在浏览器菜单中选择安装应用或添加到主屏幕。</p><p>如果是在微信等应用内打开，请先切换到系统浏览器。首次联网打开并完成缓存后，可以离线整理知识卡片；访问文章原文仍需网络。</p><p class="offline-state" role="status"></p><button type="button" class="button primary native-install" hidden>安装 BlogPulse</button> <button class="button">关闭</button></form>';
document.body.append(guide);
const state = guide.querySelector('.offline-state');
const trigger = guide.querySelector('.native-install');
let promptEvent;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
install.onclick = () => {
  trigger.hidden = !promptEvent || standalone();
  guide.showModal();
};
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  promptEvent = event;
  trigger.hidden = standalone();
});
trigger.onclick = async () => {
  const current = promptEvent;
  promptEvent = null;
  trigger.hidden = true;
  if (current) { try { await current.prompt(); } catch {} }
};
window.addEventListener('appinstalled', () => { promptEvent = null; trigger.hidden = true; });
state.textContent = '当前环境不支持离线缓存；可以在线使用。';
if (window.isSecureContext && 'serviceWorker' in navigator) {
  state.textContent = '正在准备离线资源…';
  navigator.serviceWorker.register('./sw.js').then(registration => {
    const worker = registration.installing;
    if (worker) worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant' && !registration.active) state.textContent = '离线资源未准备好，请联网重新打开。';
    });
    return navigator.serviceWorker.ready;
  }).then(() => { state.textContent = '本设备的离线阅读界面已准备好。'; })
    .catch(() => { state.textContent = '未能启用离线缓存，仍可在线使用。'; });
}
