const el=(tag,text)=>{
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  return node;
};
function group(title, rows) {
  const section=el('section');section.className='profile-section';
  section.append(el('h3',title));
  const list=el('dl');
  for(const [label,value] of rows) {
    const line=el('div');line.append(el('dt',label),el('dd',value));list.append(line);
  }
  section.append(list);return section;
}
async function request(url,config={}) {
  const fetchProfile=typeof playerView==='undefined'?fetch:playerView.apiFetch;
  const r=await fetchProfile(url,{cache:'no-store',...config});const d=await r.json();
  if(!r.ok || !d.ok) throw Error(d.error||'Не удалось загрузить профиль.');
  return d;
}
function passwordForm(token) {
  const section=el('section');section.className='profile-section';section.append(el('h3','Смена пароля'));
  const form=el('form');form.className='password-form';section.append(form);
  const fields=[];
  for(const [name,caption] of [['current','Текущий пароль'],['password','Новый пароль'],['confirm','Повторите новый пароль']]) {
    const label=el('label',caption),input=el('input');input.type='password';input.name=name;input.required=true;
    input.autocomplete=name==='current'?'current-password':'new-password';if(name!=='current')input.minLength=6;
    label.append(input);form.append(label);fields.push(input);
  }
  const submit=el('button','Сменить пароль'),notice=el('span');notice.setAttribute('role','status');form.append(submit,notice);
  form.onsubmit=async e=>{
    e.preventDefault();if(submit.disabled)return;
    if(fields[1].value!==fields[2].value){notice.textContent='Новые пароли не совпадают.';fields[2].focus();return;}
    submit.disabled=true;notice.textContent='';
    try {
      const d=await request('/api/profile.php',{method:'POST',headers:{'Content-Type':'application/json','X-Profile-Token':token},body:JSON.stringify({current:fields[0].value,password:fields[1].value})});
      token=d.token;form.reset();notice.textContent='Пароль изменён.';
    } catch(error){notice.textContent=error.message;}finally{submit.disabled=false;}
  };
  return section;
}
export async function showProfile(host,id=null) {
  host.classList.add('hero-profile');host.textContent='Загрузка профиля…';
  try {
    const own=id===null;
    const d=await request('/api/profile.php'+(own?'':'?id='+encodeURIComponent(id)));const p=d.profile;
    const title=el(own?'h2':'h1',p.name),head=el('header'),portrait=el('img');
    portrait.src=d.portrait?'/api/art.php?asset=regent&v='+d.portrait:'/city/regent.webp';portrait.alt='';
    head.className='profile-head';const text=el('div');text.append(el('small','Некромант · Ур. '+p.level),title,el('span',p.username+' · В игре с '+p.joined));
    head.append(portrait,text);host.replaceChildren(head);
    const url=new URL('/profile/',location.origin);url.searchParams.set('id',p.id);
    if(!own) document.title=p.name+' · NecroTown';
    const actions=el('div');actions.className='profile-actions';
    const copy=el('button','Скопировать ссылку на профиль');copy.type='button';
    const link=el('a',own?'Открыть публичный профиль':'В город');link.href=own?url.href:'/';
    const notice=el('span');notice.setAttribute('role','status');
    copy.onclick=async()=>{
      try {await navigator.clipboard.writeText(url.href);notice.textContent='Ссылка скопирована.';}
      catch {const field=el('input');field.readOnly=true;field.value=url.href;field.setAttribute('aria-label','Ссылка на профиль');notice.replaceChildren(field);field.select();}
    };
    actions.append(copy,link,notice);host.append(actions);
    const grid=el('div');grid.className='profile-grid';host.append(grid);
    grid.append(group('Характеристики',[['Уровень',p.level],['Опыт',p.experience],['Здоровье',p.health],['Атака',p.attack],['Защита',p.defense],['Энергия',p.energy]]));
    const wins=Number(p.wins)+Number(p.legacy_wins);
    grid.append(group('Бои легиона',[['Завершено боёв',wins+Number(p.losses)+Number(p.retreats)],['Сейчас в бою',Number(p.active_battle)?'Да':'Нет'],['Победы',wins],['Поражения',p.losses],['Отступления',p.retreats],['Победы в повторах',p.replay_wins],['Приказы',p.orders],['Лучшая победа, ходов',Number(p.best_turns)||'Нет данных']]));
    grid.append(group('Город и поход',[['Уровень города',p.city_level],['Технологии',p.studies],['Пройдено точек',p.cleared],['Души за бои с начала учёта',p.souls_won]]));
    if(Number(p.legacy_wins)>0) {
      const note=el('p','Из прежнего сохранения учтены победы по пройденным точкам: '+p.legacy_wins+'. Подробная статистика боёв ведётся с 24.11.2026.');
      note.className='profile-note';host.append(note);
    }
    if(own && d.token)host.append(passwordForm(d.token));
  } catch(e){host.textContent=e.message;}
}
