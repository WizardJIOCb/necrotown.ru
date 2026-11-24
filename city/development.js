const resourceLabels = {bones:'кости', souls:'души', iron:'железо', ether:'эфир', plague:'мор'};
const effectLabels = {discount:'% скидки на улучшения',production:'% к добыче',power:' к урону легиона',guard:' к защите легиона',vitality:' к здоровью легиона'};
const stockText = stock => Object.entries(stock).map(([key,n]) => n+' '+resourceLabels[key]).join(' · ');
const canAfford = cost => Object.entries(cost).every(([k,n])=>state.resources[k]>=n);
let cityRequest = false;
let cityClockOffset = 0;

function syncCityClock() {
  cityClockOffset = state.development.serverTime - Date.now()/1000;
}
function updateCollection() {
  const button = workPanel.querySelector('[data-development=collect]');
  if (!button) return;
  const d=state.development;
  const elapsed=Math.max(0,Math.floor(Date.now()/1000+cityClockOffset-d.lastCollection));
  const cycles=Math.min(d.capacity,Math.floor(elapsed/d.cycle));
  const left=d.cycle-elapsed%d.cycle;
  button.disabled=cityRequest||cycles===0;
  button.textContent=cycles?'Собрать добычу':'Добыча через '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
  workPanel.querySelector('[data-stock]').textContent=cycles ? stockText(Object.fromEntries(Object.entries(d.rates).map(([k,v])=>[k,v*cycles]))) : stockText(d.rates)+' за 5 мин';
}
function upgradeControl(key) {
  const offer=state.development.offers[key];
  if (!offer) return '';
  if(offer.level>=offer.cap) return '<p class="dev-meta">Достигнут предел уровня · '+offer.cap+'</p>';
  const effect=offer.production?'<p class="dev-meta">Прирост базовой добычи за цикл · '+stockText(offer.production)+'</p>':'';
  return effect+'<p class="dev-meta">Стоимость · '+stockText(offer.cost)+'</p><button type="button" data-development="upgrade" data-key="'+escapeHtml(key)+'" '+(canAfford(offer.cost)?'':'disabled')+'>Улучшить до ур. '+(offer.level+1)+'</button>';
}
function cityDevelopment() {
  const d=state.development;
  return '<section class="city-development"><div><h3>Город · ур. '+d.level+'</h3><p>Уровень города открывает исследования и повышает предел уровня построек.</p>'+upgradeControl('city')+'</div><div><h3>Городская добыча</h3><p data-stock></p><button type="button" data-development="collect">Собрать добычу</button></div></section>';
}
function renderResearch() {
  const d=state.development;
  workPanel.innerHTML='<div class="work-head"><h2 class="work-title">Изучение</h2><span class="work-meta">Город · ур. '+d.level+'</span></div><div class="tech-list">'+Object.entries(d.research).map(([id,t])=>{
    const done=d.known.includes(id), locked=t.cityLevel>d.level;
    return '<article><img class="study-art" src="'+cityArt('study-'+id)+'" alt=""><div class="study-copy"><h3>'+escapeHtml(t.name)+'</h3><p>'+escapeHtml(t.description)+'</p><p>+'+t.amount+effectLabels[t.effect]+'</p><small>'+stockText(t.cost)+'</small><button type="button" data-development="research" data-key="'+escapeHtml(id)+'" '+(done||locked||!canAfford(t.cost)?'disabled':'')+'>'+(done?'Изучено':locked?'Нужен город ур. '+t.cityLevel:'Изучить')+'</button></div></article>';
  }).join('')+'</div><p data-dev-notice role="status"></p>';
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-development]');
  if (!button || !workPanel.contains(button) || button.disabled || cityRequest) return;
  const action=button.dataset.development,key=button.dataset.key||'';
  const view=activeView;
  const offer=action==='upgrade'?state.development.offers[key]:state.development.research[key];
  button.disabled=true;cityRequest=true;
  try {
    const result=await api('/api/development.php',{method:'POST',body:JSON.stringify({action,key,level:offer?.level,cost:offer?.cost})});
    Object.assign(state,result.state);syncCityClock();renderResources();renderHero();
    if(activeView===view) {
      renderWork();
      const notice=workPanel.querySelector('[data-dev-notice]');
      if(notice) notice.textContent=action==='collect'?'Добыча добавлена в ресурсы.':action==='upgrade'?'Уровень повышен.':'Технология изучена.';
    }
  } catch(e) {
    const notice=workPanel.querySelector('[data-dev-notice]');if(notice) notice.textContent=e.message;
    button.disabled=false;
  } finally {cityRequest=false;if(activeView==='city')updateCollection();}
});
setInterval(()=>{if(document.querySelector('[data-stock]')) updateCollection();},1000);
