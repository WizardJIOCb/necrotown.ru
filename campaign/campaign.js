const $ = id => document.getElementById(id);
const embedded = parent !== window && new URLSearchParams(location.search).get('embed');
function tellCity(type, data = {}) {
  if (embedded) parent.postMessage({type, ...data}, location.origin);
}
if (embedded) {
  document.documentElement.classList.add('embedded', embedded === 'guest' ? 'guest-mode' : 'city-mode');
  new ResizeObserver(() => tellCity('expedition-size', {height: document.body.getBoundingClientRect().height})).observe(document.body);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'expedition-nav' || !save) return;
    if (!save.battle && !busy) {
      view = event.data.view === 'army' ? 'army' : 'map';
      party = [...save.party];
    }
    render();
  });
}
const html = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const symbols = {gate:'⚔',quarry:'⚒',ford:'≈',bridge:'♜',belfry:'♝',forge:'⚒',throne:'♛'};
let atlas, save, nodes, account, field, fieldPromise, focus='gate', target=0, view='map', busy=false, party=[];
const available = n => !n.from.length || n.from.some(id=>save.cleared.includes(id));
const cleared = n => save.cleared.includes(n.id);
const chapterNodes = id => atlas.nodes.filter(n=>n.chapter===id);
const chapterComplete = id => chapterNodes(id).every(cleared);
const chapterOpen = chapter => !chapter.requires || chapterComplete(chapter.requires);
function chapterEntry(id) {
  const places=chapterNodes(id);
  return (places.find(n=>!cleared(n)&&available(n))||places[places.length-1]).id;
}
const apiPath='/api/campaign.php';

async function request(change) {
  if(busy)return false;
  busy=true; $('notice').textContent='';
  try {
    const res=await playerView.apiFetch(apiPath, change ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...change,version:save.version})}:{cache:'no-store'});
    const data=await res.json();
    if(!data.ok) {
      if(data.save){save=data.save;view=save.battle?'battle':'map';render();}
      throw Error(data.error);
    }
    if (account && save && data.save.cleared.length > save.cleared.length) tellCity('expedition-reward');
    save=data.save; account=data.account;
    return true;
  } catch(e) {
    $('notice').textContent=e.message || 'Ошибка связи. Попробуйте ещё раз.';
    return false;
  } finally {busy=false;}
}

function mapRoads() {
  const c=$('roads'), ctx=c.getContext('2d'), w=c.clientWidth, h=c.clientHeight;
  if(!w||!h||!nodes||!save)return;
  const scale=Math.min(devicePixelRatio,2);
  c.width=Math.round(w*scale); c.height=Math.round(h*scale); ctx.scale(scale,scale);
  ctx.lineCap='round';
  for(const node of chapterNodes(nodes[focus].chapter)) for(const id of node.from) {
    const prev=nodes[id], x=prev.x*w/100,y=prev.y*h/100,dx=node.x*w/100,dy=node.y*h/100;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+(dx-x)*.45,y,dx-(dx-x)*.48,dy,dx,dy);
    ctx.setLineDash([]);ctx.lineWidth=5;ctx.strokeStyle='#201d15b0';ctx.stroke();
    ctx.setLineDash([3,7]);ctx.lineWidth=2.5;
    ctx.strokeStyle=cleared(prev)?'#fae0a4':'#bcb194';ctx.stroke();
  }
}
function mapPage() {
  const chosen=nodes[focus];
  const chapter=atlas.chapters.find(c=>c.id===chosen.chapter);
  const asset=chapter.art.replace(/\.webp$/, '');
  const revision=atlas.artVersions?.[asset];
  const art=revision?'/api/art.php?asset='+encodeURIComponent(asset)+'&v='+revision:chapter.art;
  $('chart').style.setProperty('--atlas-art','url("'+art+'")');
  $('chapters').innerHTML=atlas.chapters.map((c,i)=>{
    const open=chapterOpen(c), selected=c.id===chapter.id;
    const progress=chapterNodes(c.requires||c.id);
    const hint=open?'':' · '+progress.filter(cleared).length+'/'+progress.length+' на первой карте';
    return '<button type="button" data-chapter="'+c.id+'" aria-pressed="'+selected+'" '+(open?'':'disabled')+'>'+['I','II'][i]+'. '+html(c.name)+hint+'</button>';
  }).join('');
  $('pins').innerHTML=chapterNodes(chosen.chapter).map(n=>{
    const status=cleared(n)?'cleared':available(n)?'available':'locked';
    const label=cleared(n)?'Пройдено':available(n)?'Доступно':'Закрыто';
    return '<button data-node="'+n.id+'" aria-label="'+html(n.name)+' · '+label+'" aria-pressed="'+(focus===n.id)+'" class="pin '+status+(focus===n.id?' selected':'')+'" style="left:'+n.x+'%;top:'+n.y+'%">'+(cleared(n)?'✓':html(n.symbol||symbols[n.id]))+'<span>'+html(n.name)+'</span></button>';
  }).join('');
  const info=cleared(chosen)?'Точка пройдена':available(chosen)?'Доступен штурм':'Откроется после: '+chosen.from.map(id=>html(nodes[id].name)).join(' или ');
  const replay=cleared(chosen);
  $('brief').innerHTML='<div><div class="tag">'+html(chosen.region)+' · '+info+'</div><h2>'+html(chosen.name)+'</h2><p>'+html((replay&&chosen.ending)||chosen.story)+'</p><small>Противники · '+chosen.enemies.map(id=>html(atlas.units[id].name)).join(', ')+'　/　'+(replay?'Награда уже получена':chosen.reward+' душ')+'</small></div>'+
    (available(chosen)?'<button class="action" data-start>'+(replay?'Сыграть ещё раз':'Начать бой →')+'</button>':'');
  mapRoads();
}
function armyPage() {
  const unlock={breaker:'quarry',ranger:'ford'};
  $('army').innerHTML='<div class="army-panel"><div class="tag">Военный совет</div><h2>Ваш легион</h2><p>Выберите трёх бойцов. Их сила складывается при каждом приказе.</p><div class="roster">'+['blade','shield','seer','breaker','ranger'].map(id=>{
    const u=atlas.units[id], locked=unlock[id]&&!save.cleared.includes(unlock[id]);
    const asset='ally-'+id, revision=atlas.artVersions?.[asset];
    const portrait=revision?'/api/art.php?asset='+asset+'&v='+revision:'/campaign/'+asset+'.webp';
    return '<button data-ally="'+id+'" aria-pressed="'+party.includes(id)+'" class="'+(party.includes(id)?'chosen':'')+'" '+(locked?'disabled':'')+'><img class="ally-portrait" src="'+portrait+'" alt=""><span class="ally-copy"><strong>'+html(u.name)+'</strong><small>Урон '+u.attack+' · Защита '+u.stat+'</small><small>'+html(u.description)+'</small><small>'+(locked?'Откроется: '+html(nodes[unlock[id]].name):party.includes(id)?'✓ В строю':'В резерве')+'</small></span></button>';
  }).join('')+'</div><button class="action" data-party '+(party.length!==3?'disabled':'')+'>Утвердить состав · '+party.length+'/3</button></div>';
}
async function fieldForBattle() {
  if(!fieldPromise)fieldPromise=import('./field.js?v=far-focus2').then(m=>m.createField($('field'),atlas.units)).catch(()=>{
    $('fallback').hidden=false;return null;
  });
  field=await fieldPromise;
  if(view==='battle'&&save.battle&&field)showField();
}
function showField() {
  try {field.show(save,nodes[save.battle.node],target);}
  catch(error){console.error(error);field?.hide();field=null;$('fallback').hidden=false;}
}
function battlePage() {
  const b=save.battle, n=nodes[b.node];
  if(!b.foes[target]?.hp)target=Math.max(0,b.foes.findIndex(f=>f.hp));
  const end=b.status!=='play';
  // A saved battle's counter points to the next command, including after the last one.
  $('round').textContent='Ход '+(end?Math.max(1,b.turn-1):b.turn);
  $('biome').textContent=n.region;
  if(field)showField();else void fieldForBattle();
  const partyPower=(b.powerBonus||0)+save.party.reduce((t,id)=>t+atlas.units[id].attack,0);
  const squadGuard=(b.guardBonus||0)+save.party.reduce((t,id)=>t+atlas.units[id].stat,0);
  const sideDamage=save.party.includes('ranger')?atlas.balance.rangerSplash:0;
  let body='<div class="hud"><strong>Здоровье легиона · '+b.hp+' / '+b.max+'</strong><span>Заряды эфира　'+b.charge+' / 3</span></div><div class="hp"><i style="width:'+(100*b.hp/b.max)+'%"></i></div>';
  if(end) {
    const victory=b.status==='won', newUnit=b.node==='quarry'?'Костолом':b.node==='ford'?'Лучница брода':'';
    const nextChapter=victory&&!b.replay&&atlas.chapters.find(c=>c.requires===n.chapter&&chapterOpen(c));
    let outcome='Ответный удар врагов снял последнее здоровье легиона.';
    if(victory)outcome=b.replay?'Награда за эту точку уже получена.':'Добыча · '+n.reward+' душ.'+(newUnit?' В отряде новый союзник: '+newUnit+'.':'');
    body+='<div class="result"><div><div class="tag">'+(victory?'Победа':'Поражение')+'</div><h2>'+(victory?html(n.victory||(b.replay?'Бой выигран':'Путь открыт')):'Легион разбит')+'</h2><p>'+outcome+'</p>'+(!victory?'<p data-order-log></p>':'')+'</div><button class="action" data-leave>'+(nextChapter?html(nextChapter.name)+' →':'К карте похода →')+'</button></div>';
  } else {
    body+='<div class="tag">Цель · следующий удар врага</div><div class="target-row">'+b.foes.map((f,i)=>'<button class="target" data-target="'+i+'" aria-pressed="'+(i===target)+'" '+(!f.hp?'disabled':'')+'><strong>'+html(atlas.units[f.kind].name)+'</strong><small>'+f.hp+'/'+f.max+' здоровья · '+(f.hp?'удар '+f.intent:'повержен')+'</small></button>').join('')+'</div>';
    body+='<div class="card-row">'+[
      ['strike','Натиск',partyPower+' урона · +1 эфир'],
      ['guard','Стена щитов',Math.floor(partyPower/2)+' урона · щит '+(squadGuard+atlas.balance.guardBonus)+' · +1 эфир'],
      ['nova','Пепельный круг',(partyPower+atlas.balance.novaBonus)+' цели, '+(atlas.balance.novaSplash+sideDamage)+' остальным · 2 эфира']
    ].map(([id,name,desc])=>'<button class="card" data-card="'+id+'" '+(id==='nova'&&b.charge<2?'disabled':'')+'><strong>'+name+'</strong><small>'+desc+'</small></button>').join('')+'</div>';
    body+='<p role="status" data-order-log></p><button class="secondary" data-retreat>Отступить</button>';
  }
  $('orders').innerHTML='<div class="battlepanel">'+body+'</div>';
  const log=$('orders').querySelector('[data-order-log]');
  if(log)log.textContent=b.log;
}
function render() {
  const combat=!!save.battle;
  if(combat)view='battle';
  for(const name of ['map','army','battle'])$(name).hidden=name!==view;
  $('map-tab').disabled=combat;$('army-tab').disabled=combat;
  $('map-tab').classList.toggle('active',view==='map');$('army-tab').classList.toggle('active',view==='army');
  const chapter=atlas.chapters.find(c=>c.id===nodes[combat?save.battle.node:focus].chapter);
  const places=chapterNodes(chapter.id), count=places.filter(cleared).length;
  $('title').textContent=combat?nodes[save.battle.node].name:view==='army'?'Состав отряда':chapter.name;
  $('eyebrow').textContent=combat?'Битва за Некротаун':view==='army'?'Лагерь похода':count===places.length?'Карта пройдена':'Военная кампания';
  $('progress').innerHTML='<span class="ticks" aria-hidden="true">'+places.map(n=>'<i class="'+(cleared(n)?'on':'')+'"></i>').join('')+'</span><span>'+count+' / '+places.length+' точек</span>';
  $('account').textContent=account?'Поход сохранён у героя':'Гостевой поход · сохранение в этой сессии';
  if(!combat)field?.hide();
  if(view==='map')mapPage();else if(view==='army')armyPage();else battlePage();
  tellCity('expedition-view', {view});
}
function selectMap(id,scroll=false) {
  focus=id;mapPage();
  if(scroll) {
    const wrap=$('chart').parentElement;
    wrap.scrollLeft=$('chart').offsetWidth*nodes[id].x/100-wrap.clientWidth/2;
  }
}
let animating=false;
let audio;
function setSoundEnabled(enabled) {
  const button = $('audio');
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? 'Звук вкл.' : 'Звук выкл.';
}
function playSound(card) {
  if(!audio||$('audio').getAttribute('aria-pressed')!=='true')return;
  const osc=audio.createOscillator(), gain=audio.createGain(), now=audio.currentTime;
  const pitch={strike:145, guard:250, nova:510}[card];
  osc.type=card==='nova'?'sine':'triangle';
  osc.frequency.setValueAtTime(pitch,now);osc.frequency.exponentialRampToValueAtTime(pitch*.24,now+.32);
  gain.gain.setValueAtTime(.13,now);gain.gain.exponentialRampToValueAtTime(.001,now+.38);
  osc.connect(gain).connect(audio.destination);osc.start();osc.stop(now+.40);
}
document.addEventListener('click',async event=>{
  const btn=event.target.closest('button');
  if(!btn||busy||animating||!save)return;
  const d=btn.dataset;
  if(btn.id==='audio'){
    const on=btn.getAttribute('aria-pressed')!=='true';
    if(on){try{audio??=new AudioContext();await audio.resume();}catch{return;}}
    setSoundEnabled(on);
    if(on)playSound('guard');
  }else if(btn.id==='map-tab'){view='map';render();}
  else if(btn.id==='army-tab'){view='army';party=[...save.party];render();}
  else if(d.chapter){focus=chapterEntry(d.chapter);render();selectMap(focus,true);}
  else if(d.node)selectMap(d.node);
  else if(d.start!==undefined){
    if(await request({action:'start',node:focus})){setSoundEnabled(false);target=0;render();}
  }else if(d.ally){
    if(party.includes(d.ally))party=party.filter(id=>id!==d.ally);
    else if(party.length<3)party.push(d.ally);
    else {$('notice').textContent='Сначала снимите одного бойца из строя.';return;}
    $('notice').textContent='';armyPage();
  }else if(d.party!==undefined){
    if(await request({action:'party',party})){view='map';render();}
  }else if(d.target!==undefined||d.pick!==undefined){
    target=Number(d.target??d.pick);battlePage();
  }else if(d.card){
    const old=save.battle.foes,index=target;
    if(await request({action:'order',card:d.card,target:index})){
      animating=true;playSound(d.card);field?.play(d.card,index,old);render();
      setTimeout(()=>{animating=false;},field?1080:180);
    }
  }else if(d.retreat!==undefined){
    btn.outerHTML='<button class="secondary" data-leave>Подтвердить отступление</button> <button class="secondary" data-stay>Остаться</button>';
  }else if(d.stay!==undefined)battlePage();
  else if(d.leave!==undefined){
    const last=save.battle, prev=last.node;
    if(await request({action:'leave'})){
      const nextChapter=last.status==='won'&&!last.replay&&atlas.chapters.find(c=>c.requires===nodes[prev].chapter&&chapterOpen(c));
      const next=last.status==='won'&&!last.replay&&chapterNodes(nodes[prev].chapter).find(n=>n.from.includes(prev)&&!cleared(n)&&available(n));
      focus=nextChapter?chapterEntry(nextChapter.id):next?next.id:prev;
      view='map';render();selectMap(focus,true);
    }
  }
});
async function init() {
  try {
    const res=await fetch('/api/atlas.php', {cache:'no-store'});if(!res.ok)throw Error('Карта недоступна.');
    atlas=await res.json();nodes=Object.fromEntries(atlas.nodes.map(n=>[n.id,n]));
    if(await request()){
      focus=save.battle?.node||chapterEntry(atlas.chapters.filter(chapterOpen).at(-1).id);
      view=!save.battle&&location.hash==='#army'?'army':'map';party=[...save.party];
      render();if(view==='map')selectMap(focus,true);
      tellCity('expedition-ready');
      if (!embedded && account) {
        playerView.showBanner(document.querySelector('main'));
        const heartbeat = () => playerView.apiFetch('/api/chat.php?presence=heartbeat', {cache:'no-store'}).catch(() => {});
        heartbeat();
        setInterval(heartbeat, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });
      }
    }
  }catch(e){$('notice').textContent=e.message;}
}
new ResizeObserver(mapRoads).observe($('chart'));
init();

