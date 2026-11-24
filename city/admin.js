const labels = {
  username:'Логин',email:'Почта',name:'Название',level:'Уровень',experience:'Опыт',health:'Здоровье',attack:'Атака',defense:'Защита',energy:'Энергия',
  avatar_seed:'Код внешности',bones:'Кости',souls:'Души',iron:'Железо',ether:'Эфир',plague:'Мор',type:'Тип',status:'Статус',description:'Описание',sort_order:'Порядок',
  message:'Текст сообщения',created_at:'Дата сообщения',region:'Регион',story:'Описание точки',ending:'Финальный текст',victory:'Заголовок победы',symbol:'Знак на карте',
  x:'Положение по X, %',y:'Положение по Y, %',chapter:'Карта',from:'Предыдущие точки',enemies:'Противники',reward:'Награда в душах',scene:'Поле боя',biome:'Биом',
  gear:'Оружие',model:'Модель',stat:'Защита союзника / здоровье врага',art:'Фон карты',requires:'Предыдущая карта',role:'Описание дома',
  cleared:'Пройденные точки',party:'Отряд',battle:'Текущий бой (JSON, null завершает бой)',baseHealth:'Базовое здоровье легиона',healthPerVictory:'Здоровье за пройденную точку',
  guardBonus:'Дополнительный щит',novaBonus:'Урон круга по цели, бонус',novaSplash:'Урон круга по остальным',rangerSplash:'Дополнительный урон лучницы',seerHeal:'Лечение провидца',
  kingBonus:'Сильный удар короля',keeperBonus:'Сильный удар смотрителя',cantorBonus:'Сильный удар певчего',bruteBonus:'Сильный удар палача',bruteLight:'Слабый удар палача',
  legacy_wins:'Победы из прежних сохранений',wins:'Новые победы',losses:'Поражения',retreats:'Отступления',orders:'Приказы',replay_wins:'Победы в повторах',souls_won:'Души за победы',best_turns:'Лучшая победа, ходов',yieldAmount:'Добыча за цикл и уровень',resource:'Добываемый ресурс',image:'Иллюстрация', city_level:'Уровень города', technology:'Технология', technologies:'Изученные технологии', cost:'Базовая стоимость',
  effect:'Эффект',amount:'Величина эффекта',maxLevel:'Предел уровня',cityLevel:'Нужен уровень города'
};
const element = (tag,text) => {
  const el=document.createElement(tag);
  if (text !== undefined) el.textContent=text;
  return el;
};
function options(select, values, current) {
  for (const value of values) select.add(new Option(value || 'Нет', value, false, value===current));
}
async function request(params, change, token) {
  const config=change?{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':token},body:JSON.stringify(change)}:{cache:'no-store'};
  const response=await playerView.apiFetch('/api/admin.php?'+new URLSearchParams(params),config);
  const result=await response.json();
  if (!response.ok || !result.ok) throw Error(result.error || 'Не удалось выполнить запрос.');
  return result;
}
async function imageData(file) {
  if (!file) throw Error('Выберите изображение.');
  const image=await createImageBitmap(file);
  try {
    const ratio=Math.min(1,2048/Math.max(image.width,image.height));
    const canvas=element('canvas');
    canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/webp',.88);
    if (!data.startsWith('data:image/webp;')) throw Error('Браузер не поддерживает сохранение WebP.');
    return data.split(',')[1];
  } finally {image.close();}
}
function field(container, key, value, choices) {
  const label=element('label',labels[key] || key);
  container.append(label);
  if (key==='image') {
    label.className='wide';
    const img=element('img');img.alt='Текущая иллюстрация';img.src=value;
    const input=element('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.required=true;
    label.append(img,input);
    return () => imageData(input.files[0]);
  }
  if (choices && !Array.isArray(value)) {
    const select=element('select');options(select,choices,value??'');label.append(select);
    return () => select.value;
  }
  const structured=Array.isArray(value) || key==='battle' || (value!==null && typeof value==='object');
  const list=Array.isArray(value) && !!choices;
  const long=structured || ['description','role','message','story','ending'].includes(key);
  const input=element(long?'textarea':'input');
  if (long) label.className='wide';
  if (typeof value==='number') {input.type='number';input.required=true;input.step='1';}
  input.value=list?value.join(', '):structured?JSON.stringify(value,null,2):value??'';
  if (structured && !list) input.rows=key==='battle'&&value?12:3;
  label.append(input);
  if (list) label.append(element('small','Через запятую · '+choices.join(', ')));
  if (key==='scene') label.append(element('small','[число, местность] · ashen, frost, fen, ember, dunes'));
  return () => {
    if (list) return input.value.split(',').map(v=>v.trim()).filter(Boolean);
    if (structured) {
      try {return JSON.parse(input.value);} catch {throw Error('Проверьте JSON в поле «'+(labels[key]||key)+'».');}
    }
    return typeof value==='number'?input.valueAsNumber:input.value;
  };
}

export async function openAdmin(host, refreshCity) {
  host.innerHTML='<h1>Админка</h1><form class="admin-toolbar"><select aria-label="Раздел"></select><input type="search" aria-label="Поиск записей" placeholder="Имя, название или ID"><button>Найти</button></form><div class="admin-grid"><div><div class="admin-records"></div><div class="admin-pages"><button type="button">Назад</button><button type="button">Далее</button></div></div><form class="admin-editor"></form></div><p role="status"></p>';
  const toolbar=host.querySelector('.admin-toolbar'), sections=toolbar.querySelector('select'), search=toolbar.querySelector('input');
  const records=host.querySelector('.admin-records'), editor=host.querySelector('.admin-editor'), status=host.querySelector('[role=status]');
  const [prev,next]=host.querySelectorAll('.admin-pages button');
  let page=0, generation=0;
  const session=await request({});
  for (const [value,label] of Object.entries(session.sections)) sections.add(new Option(label,value));
  async function edit(item) {
    const stamp=++generation, section=sections.value;
    const active=()=>host.isConnected && stamp===generation;
    editor.replaceChildren();status.textContent='';
    for (const btn of records.children) btn.setAttribute('aria-pressed',String(btn.dataset.id===String(item.id)));
    try {
      const record=await request({section,id:item.id});
      if (!active()) return;
      editor.append(element('h2',item.label));
      const fields=element('div');fields.className='admin-fields';editor.append(fields);
      const getters=Object.entries(record.values).map(([key,value])=>[key,field(fields,key,value,record.choices[key])]);
      const controls=element('div');controls.className='admin-controls';editor.append(controls);
      const save=element('button','Сохранить');save.type='submit';controls.append(save);
      const reload=element('button','Загрузить заново');reload.type='button';reload.onclick=()=>edit(item);controls.append(reload);
      if (['heroes','accounts'].includes(section) && Number(item.id)!==session.ownerId) {
        const enter=element('button','Войти за персонажа');enter.type='button';controls.append(enter);
        enter.onclick=async()=>{
          enter.disabled=true;
          try {await playerView.enter(item.id,session.token);}
          catch(e) {if(active()) status.textContent=e.message;enter.disabled=false;}
        };
      }
      async function submit(action) {
        if (save.disabled || !active()) return;
        save.disabled=true;status.textContent='Сохранение…';
        try {
          const values={};
          if(action==='save') for (const [key,get] of getters) values[key]=await get();
          await request({}, {section,id:item.id,action,values,revision:record.revision},session.token);
          if (!active()) return;
          await refreshCity();
          if (!active()) return;
          await list(action==='save'?item.id:null);
          if (host.isConnected) status.textContent=action==='save'?'Сохранено.':'Сообщение удалено.';
        } catch(e) {if(active()) status.textContent=e.message;} finally {save.disabled=false;}
      }
      editor.onsubmit=e=>{e.preventDefault();void submit('save');};
      if (section==='chat') {
        const del=element('button','Удалить сообщение');del.type='button';del.className='delete';controls.append(del);
        del.onclick=()=>{if(confirm('Удалить выбранное сообщение из городского чата?')) void submit('delete');};
      }
    } catch(e) {if(active()) status.textContent=e.message;}
  }
  async function list(selected) {
    const stamp=++generation;
    records.replaceChildren();editor.replaceChildren();status.textContent='Загрузка…';prev.disabled=next.disabled=true;
    try {
      const data=await request({section:sections.value,search:search.value,page});
      if (!host.isConnected || stamp!==generation) return;
      status.textContent=data.items.length?'':'Записей нет.';
      prev.disabled=page===0;next.disabled=!data.more;
      for (const item of data.items) {
        const btn=element('button',item.label);btn.type='button';btn.dataset.id=item.id;
        btn.onclick=()=>edit(item);records.append(btn);
      }
      if(data.items.length) await edit(data.items.find(item=>String(item.id)===String(selected)) || data.items[0]);
    } catch(e) {if(host.isConnected && stamp===generation) status.textContent=e.message;}
  }
  sections.onchange=()=>{page=0;search.value='';void list();};
  toolbar.onsubmit=e=>{e.preventDefault();page=0;void list();};
  prev.onclick=()=>{page--;void list();};next.onclick=()=>{page++;void list();};
  await list();
}
