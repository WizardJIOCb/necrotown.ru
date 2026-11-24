const $ = id => document.getElementById(id);
const symbols = {gate:'⚔',quarry:'⚒',ford:'≈',bridge:'♜',belfry:'♝',forge:'⚒',throne:'♛'};
let atlas, save, nodes, account, field, fieldPromise, focus='gate', target=0, view='map', busy=false, party=[];
const available = n => !n.from.length || n.from.some(id=>save.cleared.includes(id));
const cleared = n => save.cleared.includes(n.id);
const apiPath='/api/campaign.php';

async function request(change) {
  if(busy)return false;
  busy=true; $('notice').textContent='';
  try {
    const res=await fetch(apiPath, change ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...change,version:save.version})}:{cache:'no-store'});
    const data=await res.json();
    if(!data.ok) {
      if(data.save){save=data.save;view=save.battle?'battle':'map';render();}
      throw Error(data.error);
    }
    save=data.save; account=data.account;
    return true;
  } catch(e) {
    $('notice').textContent=e.message || 'Ошибка связи. Попробуйте ещё раз.';
    return false;
  } finally {busy=false;}
}

function mapRoads() {
  const c=$('roads'), ctx=c.getContext('2d'), w=c.clientWidth, h=c.clientHeight;
  if(!w||!h||!atlas)return;
  const scale=Math.min(devicePixelRatio,2);
  c.width=Math.round(w*scale); c.height=Math.round(h*scale); ctx.scale(scale,scale);
  ctx.lineCap='round';
  for(const node of atlas.nodes) for(const id of node.from) {
    const prev=nodes[id], x=prev.x*w/100,y=prev.y*h/100,dx=node.x*w/100,dy=node.y*h/100;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+(dx-x)*.45,y,dx-(dx-x)*.48,dy,dx,dy);
    ctx.setLineDash([]);ctx.lineWidth=5;ctx.strokeStyle='#201d15b0';ctx.stroke();
    ctx.setLineDash([3,7]);ctx.lineWidth=2.5;
    ctx.strokeStyle=cleared(prev)?'#fae0a4':'#bcb194';ctx.stroke();
  }
}
function mapPage() {
  const chosen=nodes[focus];
  $('pins').innerHTML=atlas.nodes.map(n=>{
    const status=cleared(n)?'cleared':available(n)?'available':'locked';
    const label=cleared(n)?'Пройдено':available(n)?'Доступно':'Закрыто';
    return '<button data-node="'+n.id+'" aria-label="'+n.name+' · '+label+'" aria-pressed="'+(focus===n.id)+'" class="pin '+status+(focus===n.id?' selected':'')+'" style="left:'+n.x+'%;top:'+n.y+'%">'+(cleared(n)?'✓':symbols[n.id])+'<span>'+n.name+'</span></button>';
  }).join('');
  const info=cleared(chosen)?'Точка пройдена':available(chosen)?'Доступен штурм':'Откроется после: '+chosen.from.map(id=>nodes[id].name).join(' или ');
  const final=cleared(chosen)&&chosen.id==='throne';
  $('brief').innerHTML='<div><div class="tag">'+chosen.region+' · '+info+'</div><h2>'+chosen.name+'</h2><p>'+(final?'Корона возвращена в Некротаун. Уцелевшие отряды открыли дорогу в город.':chosen.story)+'</p><small>Противники · '+chosen.enemies.map(id=>atlas.units[id].name).join(', ')+'　/　'+chosen.reward+' душ</small></div>'+
    (!cleared(chosen)&&available(chosen)?'<button class="action" data-start>Начать бой →</button>':'');
  mapRoads();
}
function armyPage() {
  const unlock={breaker:'quarry',ranger:'ford'};
  $('army').innerHTML='<div class="army-panel"><div class="tag">Военный совет</div><h2>Ваш легион</h2><p>Выберите трёх бойцов. Их сила складывается при каждом приказе.</p><div class="roster">'+['blade','shield','seer','breaker','ranger'].map(id=>{
    const u=atlas.units[id], locked=unlock[id]&&!save.cleared.includes(unlock[id]);
    return '<button data-ally="'+id+'" aria-pressed="'+party.includes(id)+'" class="'+(party.includes(id)?'chosen':'')+'" '+(locked?'disabled':'')+'><strong>'+u.name+'</strong><small>Урон '+u.attack+' · Защита '+u.stat+'</small><small>'+u.description+'</small><small>'+(locked?'Откроется: '+nodes[unlock[id]].name:party.includes(id)?'✓ В строю':'В резерве')+'</small></button>';
  }).join('')+'</div><button class="action" data-party '+(party.length!==3?'disabled':'')+'>Утвердить состав · '+party.length+'/3</button></div>';
}
async function fieldForBattle() {
  if(!fieldPromise)fieldPromise=import('./field.js').then(m=>m.createField($('field'),atlas.units)).catch(()=>{
    $('fallback').hidden=false;return null;
  });
  field=await fieldPromise;
  if(view==='battle'&&save.battle)field?.show(save,nodes[save.battle.node],target);
}
function battlePage() {
  const b=save.battle, n=nodes[b.node];
  if(!b.foes[target]?.hp)target=Math.max(0,b.foes.findIndex(f=>f.hp));
  $('round').textContent='Ход '+b.turn;
  $('biome').textContent=n.region;
  if(field)field.show(save,n,target);else void fieldForBattle();
  const end=b.status!=='play';
  const partyPower=save.party.reduce((t,id)=>t+atlas.units[id].attack,0);
  const squadGuard=save.party.reduce((t,id)=>t+atlas.units[id].stat,0);
  const sideDamage=save.party.includes('ranger')?2:0;
  let body='<div class="hud"><strong>Легион · '+b.hp+' / '+b.max+'</strong><span>Заряды эфира　'+b.charge+' / 3</span></div><div class="hp"><i style="width:'+(100*b.hp/b.max)+'%"></i></div>';
  if(end) {
    const victory=b.status==='won', newUnit=b.node==='quarry'?'Костолом':b.node==='ford'?'Лучница брода':'';
    body+='<div class="result"><div><div class="tag">'+(victory?'Победа':'Отступление')+'</div><h2>'+(victory?(b.node==='throne'?'Престол ваш':'Путь открыт'):'Легион разбит')+'</h2><p>'+(victory?'Добыча · '+n.reward+' душ.'+(newUnit?' В отряде новый союзник: '+newUnit+'.':''):'Соберите отряд и вернитесь с другим приказом.')+'</p></div><button class="action" data-leave>К карте похода →</button></div>';
  } else {
    body+='<div class="tag">Цель · следующий удар врага</div><div class="target-row">'+b.foes.map((f,i)=>'<button class="target" data-target="'+i+'" aria-pressed="'+(i===target)+'" '+(!f.hp?'disabled':'')+'><strong>'+atlas.units[f.kind].name+'</strong><small>'+f.hp+'/'+f.max+' здоровья · '+(f.hp?'удар '+f.intent:'повержен')+'</small></button>').join('')+'</div>';
    body+='<div class="card-row">'+[
      ['strike','Натиск',partyPower+' урона · +1 эфир'],
      ['guard','Стена щитов',Math.floor(partyPower/2)+' урона · щит '+(squadGuard+13)+' · +1 эфир'],
      ['nova','Пепельный круг',(partyPower+4)+' цели, '+(13+sideDamage)+' остальным · 2 эфира']
    ].map(([id,name,desc])=>'<button class="card" data-card="'+id+'" '+(id==='nova'&&b.charge<2?'disabled':'')+'><strong>'+name+'</strong><small>'+desc+'</small></button>').join('')+'</div>';
    body+='<p role="status">'+b.log+'</p><button class="secondary" data-retreat>Отступить</button>';
  }
  $('orders').innerHTML='<div class="battlepanel">'+body+'</div>';
}
function render() {
  const combat=!!save.battle;
  if(combat)view='battle';
  for(const name of ['map','army','battle'])$(name).hidden=name!==view;
  $('map-tab').disabled=combat;$('army-tab').disabled=combat;
  $('map-tab').classList.toggle('active',view==='map');$('army-tab').classList.toggle('active',view==='army');
  $('title').textContent=combat?nodes[save.battle.node].name:view==='army'?'Состав отряда':'Престол праха';
  $('eyebrow').textContent=combat?'Битва за Некротаун':view==='army'?'Лагерь похода':save.cleared.includes('throne')?'Кампания пройдена':'Военная кампания';
  $('progress').innerHTML='<span class="ticks" aria-hidden="true">'+atlas.nodes.map((_,i)=>'<i class="'+(i<save.cleared.length?'on':'')+'"></i>').join('')+'</span><span>'+save.cleared.length+' / '+atlas.nodes.length+' точек</span>';
  $('account').textContent=account?'Поход сохранён у героя':'Гостевой поход · сохранение в этой сессии';
  if(!combat)field?.hide();
  if(view==='map')mapPage();else if(view==='army')armyPage();else battlePage();
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
    btn.setAttribute('aria-pressed',String(on));btn.textContent=on?'Звук вкл.':'Звук выкл.';if(on)playSound('guard');
  }else if(btn.id==='map-tab'){view='map';render();}
  else if(btn.id==='army-tab'){view='army';party=[...save.party];render();}
  else if(d.node)selectMap(d.node);
  else if(d.start!==undefined){
    if(await request({action:'start',node:focus})){target=0;render();}
  }else if(d.ally){
    if(party.includes(d.ally))party=party.filter(id=>id!==d.ally);
    else if(party.length<3)party.push(d.ally);
    else {$('notice').textContent='Сначала снимите одного бойца из строя.';return;}
    $('notice').textContent='';armyPage();
  }else if(d.party!==undefined){
    if(await request({action:'party',party})){view='map';render();}
  }else if(d.target!==undefined){
    target=Number(d.target);battlePage();
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
    const prev=save.battle.node;
    if(await request({action:'leave'})){
      focus=prev;view='map';render();
      const next=atlas.nodes.find(n=>n.from.includes(prev)&&!cleared(n)&&available(n));
      selectMap(prev!=='throne'&&next?next.id:prev,true);
    }
  }
});
async function init() {
  try {
    const res=await fetch('atlas.json');if(!res.ok)throw Error('Карта недоступна.');
    atlas=await res.json();nodes=Object.fromEntries(atlas.nodes.map(n=>[n.id,n]));
    if(await request()){
      focus=atlas.nodes.find(n=>available(n)&&!cleared(n))?.id||'throne';
      view=!save.battle&&location.hash==='#army'?'army':'map';party=[...save.party];
      render();if(view==='map')selectMap(focus,true);
    }
  }catch(e){$('notice').textContent=e.message;}
}
new ResizeObserver(mapRoads).observe($('chart'));
init();

