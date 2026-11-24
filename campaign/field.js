import * as W from './vendor/cinderwatch-scene.js';

const {THREE, R, CAM, FX, LT, KIT} = W;
const cameraZoom = {min:75, max:350, initial:200, step:25};
const zoomKey = 'necrotown.battle.zoom';

function dressBoard(board) {
  const beacon=board.beacon;
  W.addFlame({...beacon,y:beacon.y-.12,size:2.3,layers:3,embers:2.6,glow:1.1,smoke:5});
  for(const fire of board.fires) W.addFlame({...fire,embers:.5,glow:.8,...fire.fx});
  LT.beaconPos=beacon; LT.envSrc=board.env.slice(0,LT.env.length); LT.envK=1;
  LT.beaconMul=board.bio.beacon||1;
  FX.groundAt=board.heightAt;
  W.setBiomeLook(board,true);
  const kinds=['archer','guard','archer','spire','archer','guard'];
  board.pads.filter((_,i)=>i!==1).slice(0,kinds.length).forEach((pad,i)=>{
    const kind=kinds[i], {pieces,mounts}=W.blueprint(kind,i%3===0?2:1);
    const soup=new W.Soup();
    for(const piece of pieces)soup.merge(piece.soup,{p:[0,piece.y,0]});
    const mesh=new THREE.Mesh(soup.build(),W.MAT.world);
    mesh.castShadow=mesh.receiveShadow=true;
    mesh.rotation.y=pad.face;mesh.position.set(pad.x,pad.y,pad.z);board.group.add(mesh);
    const at=mesh.localToWorld(new THREE.Vector3(...(mounts.flame||mounts.crystal)));
    const crystal=kind==='spire';
    if(crystal){
      const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.46),new THREE.MeshBasicMaterial({color:0xa3cfff}));
      gem.position.copy(at);gem.scale.y=1.7;board.group.add(gem);board.gem=gem;
    }else W.addFlame({...at,size:mounts.flameSize||.55,layers:2,glow:1.2,embers:1.4,smoke:1.2});
    LT.emitters.push({x:at.x,y:at.y+.18,z:at.z,r:crystal?.31:1,g:crystal?.65:.52,b:crystal?1:.19,
      I:crystal?36:125,range:15,on:1,alive:true,seed:i+17,spot:!crystal,dx:Math.sin(pad.face),dz:Math.cos(pad.face),_spot:0});
  });
}

function actorPose(unit,x,y,z,yaw,scale,time,swing,flash) {
  const gear=unit.gear, item=KIT.item, heavy=unit.model==='giant'||unit.model==='ogre';
  return {x,y,z,yaw,scale,ph:time,mv:swing>0?.82:.11,atk:swing,flash,flinch:flash*.52,
    weapon:gear==='bow'?null:gear==='crown'?item.khopesh:gear==='seer'?item.staff:gear==='club'?item.club:item.blade,
    heavy,staff:gear==='seer',hood:gear==='seer',robe:gear==='seer',crown:gear==='crown',helm:gear==='shield',
    shield:gear==='shield'?item.shieldH:null,plate:gear==='shield',bow:gear==='bow',draw:swing>0?Math.sin(swing*Math.PI):0};
}
function drawActor(unit,pose) {
  W.rigHuman(KIT[unit.model],W.SPEC[unit.model==='giant'?'skel':unit.model],pose);
}

export function createField(canvas,units) {
  W.initRenderer(canvas);W.initMaterials();W.resizeRenderer();W.initLights();W.initFX();W.initWeather();W.initKits();
  R.fade=1;
  const labels=canvas.parentElement.querySelector('.field-labels')||document.createElement('div');
  if(!labels.isConnected){labels.className='field-labels';canvas.after(labels);}
  const pointer=new THREE.Vector3();
  const frameElement=canvas.parentElement;
  const controls=frameElement.querySelector('.camera-controls');
  const zoomOut=controls?.querySelector('[data-zoom=out]');
  const zoomIn=controls?.querySelector('[data-zoom=in]');
  const zoomReset=controls?.querySelector('[data-zoom=reset]');
  let zoom=cameraZoom.initial;
  try {
    const saved=Number(localStorage.getItem(zoomKey));
    if(saved>=cameraZoom.min&&saved<=cameraZoom.max)zoom=saved;
  } catch {}
  const formationSize=new THREE.Vector2();
  const formationFocus=new THREE.Vector3();
  let drag=null, suppressDragClick=false, panLimit=0;
  let board, stage, center, squads=[],markers=[],selected=0,battle,action,last=0,frame=0,time=1.8;
  let measuredSeconds=0, measuredFrames=0;
  const ring=new THREE.Mesh(new THREE.RingGeometry(.75,.82,40),new THREE.MeshBasicMaterial({color:0xffcf73,transparent:true,opacity:.77,depthWrite:false,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;R.scene.add(ring);

  function setStage(node) {
    W.clearFX();W.clearDebris();FX.flames.length=0;LT.emitters.length=0;
    for(const spot of LT.spots){spot.owner=null;spot.want=null;spot.fade=0;}
    if(board){board.gem?.material.dispose();W.disposeBoard(board);}
    const [seed,biome]=node.scene;
    W.BIOME.start=W.BIOMES.findIndex(item=>item.key===biome);
    board=W.buildBoard(seed,0);R.scene.add(board.group);dressBoard(board);stage=node.id;
    panLimit=Math.max(...board.chunks.map(chunk=>chunk.cx));
    // Form ranks on a central stretch of the actual generated road. Sampling the
    // path also keeps their feet on the bridge deck when it crosses water.
    let best=Infinity;
    for(let s=11;s<board.L-11;s+=.5){
      const p=W.pathAt(board,s,{}), left=W.pathAt(board,s-5,{}), right=W.pathAt(board,s+5,{});
      // A road facing across the camera keeps the two armies readable.
      const span=Math.abs((right.x-left.x)-(right.z-left.z));
      const score=Math.hypot(p.x,p.z)-span*.95;
      if(score<best){best=score;center=s;}
    }
    for(let i=0;i<28;i++){W.updateFX(.045,time);time+=.045;}
    action=null;
  }
  function place(s,offset) {
    const p=W.pathAt(board,s,{});
    return new THREE.Vector3(p.x-p.tz*offset,p.y,p.z+p.tx*offset);
  }
  function muster(save) {
    labels.replaceChildren();markers=[];squads=[];
    for(const [side,line] of [save.party,save.battle.foes.map(f=>f.kind)].entries()){
      line.forEach((id,i)=>{
        const unit=units[id], boss=unit.model==='giant', count=boss?1:unit.model==='ogre'?2:3;
        const dir=side?-1:1, row=center-dir*(2+i*2.15);
        const squad={id,i,side,unit,members:[],anchor:place(row,0)};
        if(unit.gear==='seer'||unit.gear==='crown'){
          squad.light={alive:true,lx:squad.anchor.x,ly:squad.anchor.y+1.8,lz:squad.anchor.z,
            lI:side?42:54,lCol:side?0xff9a60:0xa9d8e6,lseed:7+i};
        }
        for(let j=0;j<count;j++){
          const pos=place(row-dir*(j===1?.65:0),(j-(count-1)/2)*.85);
          squad.members.push({pos,seed:i*2.8+j*1.7+side,scale:boss?2.35:unit.model==='ogre'?1.65:1.18});
        }
        squads.push(squad);
        if(side){
          const bar=document.createElement('button');bar.type='button';bar.className='foe-marker';
          bar.dataset.pick=String(i);bar.title=unit.name;bar.setAttribute('aria-label','Выбрать цель: '+unit.name);
          const fill=document.createElement('i');bar.append(fill);labels.append(bar);markers[i]=bar;
        }
      });
    }
    // Fit the projected feet and heads of both formations, including tall bosses.
    W.applyCamera();
    const right=new THREE.Vector3().setFromMatrixColumn(R.cam.matrixWorld,0);
    const up=new THREE.Vector3().setFromMatrixColumn(R.cam.matrixWorld,1);
    const bounds=new THREE.Box2();
    const point=new THREE.Vector2();
    for(const squad of squads) for(const member of squad.members){
      point.set(member.pos.dot(right),member.pos.dot(up));
      bounds.expandByPoint(point);
      point.y+=(member.scale*1.55+.5)*up.y;
      bounds.expandByPoint(point);
    }
    bounds.getSize(formationSize);
    const focus=place(center,0);
    const mid=bounds.getCenter(new THREE.Vector2());
    const shiftX=mid.x-focus.dot(right), shiftY=mid.y-focus.dot(up);
    focus.addScaledVector(right,shiftX).addScaledVector(up,shiftY);
    formationFocus.copy(focus);
    CAM.x=focus.x; CAM.y=focus.y; CAM.z=focus.z;
  }
  function layout(){
    if(!battle||canvas.clientWidth<1)return;
    W.resizeRenderer();const narrow=canvas.clientWidth<650;
    R.viewH=narrow?21:23;R.fitW=narrow?23:37;
    const aspect=R.dw/R.dh;
    const baseHeight=Math.max(R.viewH,R.fitW/aspect);
    const formationHeight=Math.max(formationSize.y/.70,formationSize.x/(aspect*.83));
    const defaultHeight=Math.max(baseHeight/(narrow?2.24:2.16),formationHeight);
    CAM.zoom=(baseHeight/defaultHeight)*(zoom/cameraZoom.initial);
    W.applyCamera();
  }
  function showZoom(){
    if(!controls)return;
    controls.hidden=false;
    zoomReset.textContent=Math.round(zoom)+'%';
    zoomOut.disabled=zoom<=cameraZoom.min;
    zoomIn.disabled=zoom>=cameraZoom.max;
  }
  function setZoom(value){
    const next=Math.max(cameraZoom.min,Math.min(cameraZoom.max,value));
    if(next===zoom)return;
    zoom=next;layout();showZoom();
    try {localStorage.setItem(zoomKey,String(zoom));} catch {}
  }
  zoomOut?.addEventListener('click',()=>setZoom(Math.round(zoom)-cameraZoom.step));
  zoomIn?.addEventListener('click',()=>setZoom(Math.round(zoom)+cameraZoom.step));
  zoomReset?.addEventListener('click',()=>{
    CAM.x=formationFocus.x; CAM.z=formationFocus.z;
    setZoom(cameraZoom.initial);
  });
  function finishDrag(){
    if(!drag)return;
    const {surface,id,moved}=drag;
    drag=null;
    suppressDragClick=moved;
    frameElement.classList.remove('is-panning');
    if(surface.hasPointerCapture(id))surface.releasePointerCapture(id);
  }
  frameElement.addEventListener('pointerdown',event=>{
    suppressDragClick=false;
    if(!battle||event.pointerType!=='mouse'||event.button!==0)return;
    const surface=event.target.closest('canvas,.foe-marker');
    if(!surface)return;
    drag={surface,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
    surface.setPointerCapture(event.pointerId);
  });
  frameElement.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    if(!(event.buttons&1)){finishDrag();return;}
    const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<4)return;
    drag.moved=true;
    frameElement.classList.add('is-panning');
    drag.x=event.clientX;drag.y=event.clientY;
    const scale=(R.cam.top-R.cam.bottom)/canvas.clientHeight;
    const depth=dy/Math.sin(CAM.elev);
    const sin=Math.sin(CAM.yaw), cos=Math.cos(CAM.yaw);
    CAM.x=THREE.MathUtils.clamp(CAM.x-scale*(dx*cos+depth*sin),-panLimit,panLimit);
    CAM.z=THREE.MathUtils.clamp(CAM.z+scale*(dx*sin-depth*cos),-panLimit,panLimit);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    frameElement.addEventListener(type,event=>{if(drag?.id===event.pointerId)finishDrag();});
  }
  window.addEventListener('blur',finishDrag);
  frameElement.addEventListener('click',event=>{
    if(!suppressDragClick||!event.detail)return;
    suppressDragClick=false;
    event.preventDefault();
    event.stopPropagation();
  },true);
  frameElement.addEventListener('wheel',event=>{
    if(!battle||event.ctrlKey||event.metaKey||!event.deltaY)return;
    event.preventDefault();
    const unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
    const delta=Math.max(-120,Math.min(120,event.deltaY*unit));
    setZoom(zoom*Math.exp(-delta*.0018));
  },{passive:false});
  new ResizeObserver(layout).observe(canvas);
  function impact(event){
    const foe=squads.find(s=>s.side===1&&s.i===event.target);
    const from=squads.find(s=>!s.side&&s.unit.gear==='seer')||squads[0];
    const at=foe.anchor, start=from.anchor;
    if(event.card==='nova'){
      for(const other of squads.filter(s=>s.side&&event.before[s.i].hp>0)){
        const p=other.anchor;
        W.fxBolt([start.x,start.y+1.8,start.z],[p.x,p.y+1.2,p.z],.38,[.62,.87,1.72],.1);
        W.fxExplosion(p.x,p.y+.2,p.z,.60);
      }
    }else{
      W.lightFlash(at.x,at.y+1,at.z,0xff9a54,95,.26,10);
      W.fxSparks(at.x,at.y+1,at.z,18,4,3,1.6,.42);
      W.fxDust(at.x,at.y+.1,at.z,5,.5);
    }
  }
  function tick(now) {
    if(!battle)return;
    frame=requestAnimationFrame(tick);
    const elapsed=(now-last)/1000;last=now;
    if(document.hidden)return;
    if(elapsed>0&&elapsed<.3){
      measuredSeconds+=elapsed;measuredFrames++;
      if(measuredSeconds>=4){
        const fps=measuredFrames/measuredSeconds;
        const quality=fps<28?Math.max(.62,R.quality-.12):fps>54?Math.min(1,R.quality+.04):R.quality;
        if(quality!==R.quality){R.quality=quality;layout();}
        measuredSeconds=0;measuredFrames=0;
      }
    }
    const dt=Math.min(.08,Math.max(.001,elapsed));time+=dt;
    const t=action?Math.min(1,(now-action.at)/1050):1;
    W.SH.uTime.value=time;R.frameDt=dt;W.beginParts();
    if(action&&t>=.34&&!action.hit){action.hit=true;impact(action);}
    W.updateFX(dt,time);
    const target=squads.find(s=>s.side&&s.i===(action?.target??selected));
    ring.visible=false;
    W.applyCamera();
    const torches=[];
    for(const squad of squads){
      const enemy=!!squad.side, foe=battle.foes[squad.i], alive=!enemy||foe.hp>0;
      const leader=squad.anchor, other=enemy?squads[squad.i%3]:target;
      const focus=other.anchor, gear=squad.unit.gear, isRanged=gear==='bow'||gear==='seer';
      const lost=enemy&&!alive&&action?.before[squad.i]?.hp>0;
      if(squad.light){squad.light.alive=alive;if(alive)torches.push(squad.light);}
      const hit=enemy&&action&&(action.card==='nova'||squad.i===action.target);
      const phase=enemy?(t-.55)*2.25:t*2.15;
      const swing=action&&phase>0&&phase<1?phase:-1;
      for(const member of squad.members){
        const p=member.pos;
        const yaw=Math.atan2(focus.x-p.x,focus.z-p.z);
        const pose=actorPose(squad.unit,p.x,p.y,p.z,yaw,member.scale,time*(swing>0?9:3)+member.seed,swing,hit&&t>.34&&t<.56?1:0);
        if(lost&&action.hit&&!action.broken.has(member)){
          W.shatter(e=>drawActor(squad.unit,e),pose,[Math.sin(yaw)*-1.8,2,-Math.cos(yaw)*1.8]);
          action.broken.add(member);
        }
        if(!alive&&!(lost&&!action.hit))continue;
        if(swing>0){
          const delta=Math.sin(swing*Math.PI), travel=isRanged?.22:Math.min(4.2,Math.max(0,p.distanceTo(focus)-1));
          pose.x+=Math.sin(yaw)*travel*delta;pose.z+=Math.cos(yaw)*travel*delta;
        }
        drawActor(squad.unit,pose);
      }
      if(!enemy)continue;
      const bar=markers[squad.i];
      bar.hidden=!alive;
      if(!alive)continue;
      const height=squad.members[0].scale*1.48+.35;
      pointer.set(leader.x,leader.y+height,leader.z).project(R.cam);
      bar.style.left=(pointer.x*50+50)+'%';bar.style.top=(50-pointer.y*50)+'%';
      if(squad.i===selected){ring.position.set(leader.x,leader.y+.12,leader.z);ring.visible=true;}
    }
    if(board.gem)board.gem.rotation.y=time;
    W.updateDebris(dt,board.heightAt,()=>{});
    W.endParts();W.endFX();W.updateLights(dt,time,CAM.x,CAM.z);W.updateTorchLights(dt,torches,CAM.x,CAM.z);W.collectMistLights();
    W.renderFrame();
    if(canvas.dataset.ready!=='true')canvas.dataset.ready='true';
    if(t>=1)action=null;
  }
  return {
    show(save,node,targetIndex){
      const newStage=stage!==node.id;
      if(newStage)setStage(node);
      if(newStage||!battle)muster(save);
      selected=targetIndex;battle=save.battle;
      battle.foes.forEach((f,i)=>{
        markers[i].firstChild.style.width=(100*f.hp/f.max)+'%';
        markers[i].classList.toggle('chosen',i===selected);
      });
      layout();
      showZoom();
      if(!frame){last=performance.now();tick(last);}
    },
    play(card,target,before){action={card,target,before,at:performance.now(),hit:false,broken:new Set()};},
    hide(){finishDrag();cancelAnimationFrame(frame);frame=0;action=null;battle=null;if(controls)controls.hidden=true;W.clearDebris();labels.replaceChildren();}
  };
}

