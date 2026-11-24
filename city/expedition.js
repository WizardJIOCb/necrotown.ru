function openExpedition(host, section) {
  const view = section === 'army' ? 'army' : 'map';
  let frame = host.querySelector('.expedition-frame');
  if (frame) {
    frame.dataset.view = view;
    frame.contentWindow.postMessage({type: 'expedition-nav', view}, location.origin);
    return;
  }
  frame = document.createElement('iframe');
  frame.className = 'expedition-frame';
  frame.title = 'Р’РѕРµРЅРЅР°СЏ РєР°РјРїР°РЅРёСЏ';
  frame.dataset.view = view;
  frame.src = '/campaign/?embed=city#' + view;
  host.replaceChildren(frame);
}

window.addEventListener('message', async event => {
  const frame = document.querySelector('.expedition-frame');
  if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
  const data = event.data;
  if (data?.type === 'expedition-size' && Number.isFinite(data.height)) {
    frame.style.height = Math.ceil(data.height) + 'px';
  } else if (data?.type === 'expedition-ready') {
    frame.contentWindow.postMessage({type: 'expedition-nav', view: frame.dataset.view}, location.origin);
  } else if (data?.type === 'expedition-view' && frame.parentElement === workPanel) {
    activeView = data.view === 'army' ? 'army' : 'campaign';
    workPanel.dataset.view = activeView;
    menuButtons.forEach(button => button.classList.toggle('is-active', button.dataset.view === activeView));
  } else if (data?.type === 'expedition-reward' && state) {
    const result = await api('/api/game.php').catch(() => null);
    if (result && state) {
      state.resources.souls = result.state.resources.souls;
      renderResources();
    }
  }
});
