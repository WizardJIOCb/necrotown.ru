const currencyDescriptions = {
  bones: 'Строительный материал для роста города и улучшения построек.',
  souls: 'Энергия павших. Её расходуют на развитие города и исследования.',
  iron: 'Металл для строительства, укреплений и военных исследований.',
  ether: 'Магический кристалл. Нужен для изучения защитных ритуалов.',
  plague: 'Алхимическая эссенция мора. Используется в некромантических исследованиях.'
};

function enableResourceHints(bar) {
  let active = null;
  function open(slot) {
    active?.classList.remove('hint-open');
    active = slot;
    active?.classList.add('hint-open');
  }
  for (const slot of bar.children) {
    const trigger = slot.querySelector('button');
    let touchWasOpen = false;
    trigger.addEventListener('pointerdown', event => {
      touchWasOpen = event.pointerType !== 'mouse' && active === slot;
    });
    slot.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') open(slot);
    });
    slot.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse' && active === slot && !trigger.matches(':focus-visible')) open(null);
    });
    trigger.addEventListener('focus', () => {
      if (trigger.matches(':focus-visible')) open(slot);
    });
    trigger.addEventListener('blur', () => { if (active === slot) open(null); });
    trigger.addEventListener('click', () => {
      open(touchWasOpen ? null : slot);
      touchWasOpen = false;
    });
  }
  document.addEventListener('pointerdown', event => { if (!bar.contains(event.target)) open(null); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') open(null); });
}

function renderResourceHints(bar, resources, state) {
  if (!bar.childElementCount) {
    bar.innerHTML = resources.map(([key, label, icon]) => `
      <div class="resource-slot">
        <button class="resource" type="button" aria-describedby="hint-${key}">
          <span class="resource-icon ${icon}" aria-hidden="true"></span>
          <span><span class="resource-name">${label}</span><strong class="resource-value"></strong></span>
        </button>
        <div class="resource-hint" role="tooltip" id="hint-${key}"><div class="resource-hint-card">
          <strong>${label}</strong><p>${currencyDescriptions[key]}</p>
          <small>Где добывается</small><span class="resource-source"></span>
          ${key === 'souls' ? '<span>Также за первую победу в каждой точке кампании.</span>' : ''}
          <span class="resource-rate"></span>
        </div></div>
      </div>`).join('');
    enableResourceHints(bar);
  }
  const {offers, rates, cycle} = state.development;
  resources.forEach(([key], index) => {
    const slot = bar.children[index];
    const buildings = state.buildings.filter(b => offers[b.id]?.production?.[key] > 0).map(b => b.name);
    if (offers.city?.production?.[key] > 0) buildings.unshift('Город');
    slot.querySelector('.resource-value').textContent = state.resources[key] ?? 0;
    slot.querySelector('.resource-source').textContent = buildings.length
      ? [...new Set(buildings)].join(' · ') : 'Пока не производится в городе.';
    slot.querySelector('.resource-rate').textContent = rates[key] > 0
      ? `+${rates[key]} за ${cycle / 60} мин · Сбор в разделе «Город»` : '';
  });
}
