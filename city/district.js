const districtHouses = [
  {
    id: "war",
    name: "Дом Войны",
    level: 2,
    status: "Кровавая стража",
    role: "Военная элита города. Ускоряет зачистку опасных точек и усиливает гарнизон."
  },
  {
    id: "science",
    name: "Дом Науки",
    level: 1,
    status: "Тайная лаборатория",
    role: "Изучает магию, древние тексты и эфирные аномалии для развития НекроТауна."
  },
  {
    id: "trade",
    name: "Дом Торговли",
    level: 1,
    status: "Ночной рынок",
    role: "Держит караваны, сделки и редкие товары под контролем вампирской знати."
  },
  {
    id: "necromancy",
    name: "Дом Некромантии",
    level: 2,
    status: "Костяной двор",
    role: "Следит за нежитью, могильными рабочими и ритуалами повиновения."
  },
  {
    id: "blood",
    name: "Дом Крови",
    level: 1,
    status: "Алые родословные",
    role: "Развивает вампирские мутации, кровные линии и власть патриархов."
  },
  {
    id: "shadow",
    name: "Дом Теней",
    level: 1,
    status: "Сеть шпионов",
    role: "Ведёт разведку, скрытые операции и поиск угроз за пределами города."
  }
];

let districtSelection = 'war';

function renderCity() {
  const houses = activeView === 'city';
  const places = houses ? districtHouses : state.buildings;
  const chosenId = houses ? districtSelection : selectedBuildingId;
  const selected = places.find(item => item.id === chosenId) || places[0];
  const title = houses ? 'Вампирские дома' : 'Постройки';
  const art = item => {
    const key = houses ? item.id : item.type;
    return houses || Object.hasOwn(buildingLetters, key) ? '/city/' + key + '.webp' : '/city/skyline.webp';
  };
  const level = item => houses
    ? (state.vampireHouses?.find(house => house.id === item.id)?.level ?? item.level)
    : item.level;
  workPanel.innerHTML = `
    <header class="district-banner"><span>Некрорайон</span><h1>Северный погост</h1></header>
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
      </div></aside>` : ''}</div>`;

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
