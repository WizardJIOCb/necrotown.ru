function cityArt(key) {
  const revision = state.artVersions?.[key];
  return revision ? '/api/art.php?asset=' + encodeURIComponent(key) + '&v=' + revision : '/city/' + key + '.webp';
}

function applyCityArt() {
  const shell = document.getElementById('gameShell');
  for (const key of ['regent','skyline','bones','souls','iron','ether','plague']) {
    shell.style.setProperty('--art-' + key, 'url("' + cityArt(key) + '")');
  }
  shell.querySelector('.city-brand img').src = cityArt('crest');
}

let districtSelection = 'war';

function renderCity() {
  const houses = activeView === 'city';
  const places = houses ? Object.entries(state.cityCatalog.houses).map(([id, house]) => ({...house, id})) : state.buildings;
  const chosenId = houses ? districtSelection : selectedBuildingId;
  const selected = places.find(item => item.id === chosenId) || places[0];
  const title = houses ? 'Вампирские дома' : 'Постройки';
  const art = item => {
    const key = houses ? item.id : item.type;
    return houses || Object.hasOwn(buildingLetters, key) ? cityArt(key) : cityArt('skyline');
  };
  const level = item => item.level;
  workPanel.innerHTML = `
    <header class="district-banner"><span>Некрорайон</span><h1>${escapeHtml(state.cityCatalog.city.district.name)}</h1></header>
    <div class="district-body"><div class="district-list">
      <h2>${title}</h2>
      <div class="place-grid">${places.map(item => `
        <button type="button" class="place-card" ${houses ? 'data-vampire-house-id' : 'data-building-id'}="${escapeHtml(item.id)}" aria-pressed="${item.id === selected.id}">
          <img src="${art(item)}" alt="">
          <span class="place-copy"><strong>${escapeHtml(item.name)}</strong>
          <small>Ур. ${level(item)} · ${escapeHtml(item.status)}</small></span>
        </button>`).join('')}</div>
    </div>
    ${selected ? `<aside class="district-detail" aria-label="Сведения о выбранном месте">
      <img src="${art(selected)}" alt="">
      <div><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(houses ? selected.role : selected.description)}</p>
        <div class="stat-row"><span>Уровень</span><strong>${level(selected)}</strong></div>
        <div class="stat-row"><span>Статус</span><strong>${escapeHtml(selected.status)}</strong></div>
        ${houses ? '' : upgradeControl(selected.id)}
      </div></aside>` : ''}</div>
    ${houses ? cityDevelopment() : ''}<p data-dev-notice role="status"></p>`;
  if (houses) updateCollection();

  workPanel.querySelector('.place-grid').onclick = event => {
    const button = event.target.closest('.place-card');
    if (!button) return;
    if (houses) districtSelection = button.dataset.vampireHouseId;
    else selectedBuildingId = Number(button.dataset.buildingId);
    const index = [...button.parentNode.children].indexOf(button);
    renderCity();
    workPanel.querySelectorAll('.place-card')[index].focus({preventScroll: true});
  };
}
