const playerView = (() => {
  const storageKey = 'necrotown.playerView';
  let current = null;
  try { current = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
  function openCity(profile) {
    const page = window.top;
    if (page.location.pathname === '/') {
      page.history.replaceState(null, '', profile ? '/#profile' : '/');
      page.location.reload();
    } else page.location.replace(profile ? '/#profile' : '/');
  }
  async function apiFetch(url, config = {}) {
    if (!current) return fetch(url, config);
    if (new URL(url,location.href).origin !== location.origin) throw Error('Неверный адрес запроса.');
    const headers = new Headers(config.headers);
    headers.set('X-Player-View', current.key);
    const response = await fetch(url, {...config,headers,redirect:'error'});
    if (response.headers.get('X-Player-View-Expired') === '1') {
      if (JSON.parse(sessionStorage.getItem(storageKey))?.key === current.key) {
        sessionStorage.removeItem(storageKey);
        openCity(true);
      }
      throw Error('Вход за персонажа завершён.');
    }
    return response;
  }
  async function change(action, extra, headers = {}) {
    const response = await apiFetch('/api/player_view.php',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action,...extra})});
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error(data.error || 'Не удалось переключить персонажа.');
    return data;
  }
  async function enter(id, token) {
    const data = await change('enter',{id},{'X-Admin-Token':token});
    sessionStorage.setItem(storageKey,JSON.stringify({key:data.key,username:data.username}));
    openCity(false);
  }
  function showBanner(before, username) {
    if (!current || !before || document.querySelector('.player-view-banner')) return;
    const bar = document.createElement('aside'), label = document.createElement('strong'), button = document.createElement('button'), notice = document.createElement('span');
    bar.className='player-view-banner';label.textContent='Вы играете за '+(username||current.username);
    button.type='button';button.textContent='Вернуться в свой профиль';notice.setAttribute('role','status');
    button.onclick=async()=>{
      button.disabled=true;
      try {
        await change('leave',{});
        sessionStorage.removeItem(storageKey);
        openCity(true);
      } catch(e) {notice.textContent=e.message;button.disabled=false;}
    };
    bar.append(label,button,notice);before.before(bar);
  }
  return {apiFetch, enter, showBanner, active:!!current};
})();
