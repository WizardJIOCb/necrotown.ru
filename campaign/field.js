import * as T from './vendor/three.module.min.js';
import { KIT, SPEC, initFigures, rigHuman, beginParts, endParts, makeRng } from './vendor/figures.js';

const palettes = {
  ash: [0x605343,0x443b33,0xff9c54], quarry: [0x756951,0x514737,0xffb872],
  marsh: [0x465c4e,0x303f40,0x8be9c8], frost: [0x73848a,0x505d69,0x92deff],
  ruins: [0x595263,0x383247,0xc9a8ff], ember: [0x624137,0x452c29,0xff681d],
  throne: [0x51454e,0x332d37,0xf38769]
};

export function createField(canvas, units) {
  const renderer = new T.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene(), camera = new T.OrthographicCamera();
  camera.position.set(4.2,8.2,16);
  camera.lookAt(0,.32,0);
  const hemi = new T.HemisphereLight(0xfff0cb,0x77677a,1.8);
  const sun = new T.DirectionalLight(0xffdda6,2.8);
  sun.position.set(-4,9,5); sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-9,right:9,top:8,bottom:-8});
  sun.shadow.mapSize.set(1024,1024); sun.shadow.normalBias=.035;
  scene.add(hemi,sun);
  initFigures(scene);
  const land = new T.Group(); scene.add(land);
  const shapes = {
    box:new T.BoxGeometry(1,1,1), rock:new T.IcosahedronGeometry(1,0),
    spike:new T.ConeGeometry(.5,1,5), disc:new T.CylinderGeometry(.5,.58,1,8),
    ring:new T.TorusGeometry(1,.045,5,44)
  };
  const materials = new Map();
  const fires = [], fighters = [];
  const fireLight = new T.PointLight(0xff9447,24,11,1.6);
  fireLight.position.set(-3,2.1,.9); scene.add(fireLight);
  const rim = new T.DirectionalLight(0x9bcddb,1.55);
  rim.position.set(4,4,-5);scene.add(rim);
  const grit = document.createElement('canvas');grit.width=grit.height=128;
  const ink=grit.getContext('2d'), grain=makeRng(171);
  ink.fillStyle='#dfd8ca';ink.fillRect(0,0,128,128);
  for(let i=0;i<1500;i++){
    ink.fillStyle=grain()>.45?'rgba(51,44,34,.18)':'rgba(255,250,230,.38)';
    ink.fillRect(grain()*128,grain()*128,grain()*5+1,grain()*2+1);
  }
  const rockTexture=new T.CanvasTexture(grit);rockTexture.colorSpace=T.SRGBColorSpace;
  const moteGeo=new T.BufferGeometry(), dust=new Float32Array(70*3);
  for(let i=0;i<dust.length;i+=3){dust[i]=grain()*10-5;dust[i+1]=grain()*3;dust[i+2]=grain()*4-2;}
  moteGeo.setAttribute('position',new T.BufferAttribute(dust,3));
  const motes=new T.Points(moteGeo,new T.PointsMaterial({color:0xffc997,size:.035,transparent:true,opacity:.72}));
  scene.add(motes);
  let displayed = null, frame = 0, action = null, selected = 0, time = 0;
  let terrainId = '';
  function piece(shape,x,y,z,w,h,d,color,lit=false) {
    const key = color+'-'+lit;
    if (!materials.has(key)) materials.set(key,lit ? new T.MeshBasicMaterial({color}) : new T.MeshStandardMaterial({color,map:rockTexture,flatShading:true,roughness:.9}));
    const obj = new T.Mesh(shapes[shape],materials.get(key));
    obj.position.set(x,y,z); obj.scale.set(w,h,d);
    obj.castShadow=!lit; obj.receiveShadow=!lit;
    land.add(obj); return obj;
  }
  function terrain(node) {
    land.clear(); fires.length=0;
    const random = makeRng(320 + node.x), [stone,dark,fire] = palettes[node.biome];
    const tint = (base,v) => new T.Color(base).multiplyScalar(v).getHex();
    for(let x=-5;x<=5;x++) for(let z=-2;z<=2;z++) {
      const edge = Math.abs(x)===5 || Math.abs(z)===2;
      if (edge && Math.abs(x)===5 && Math.abs(z)===2) continue;
      const height = .55 + random()*.48;
      piece('box',x,-height/2-.05,z,.99,height,.99,tint(dark,.76+random()*.43));
      const floor=piece('disc',x,-.07,z,1.19,.13,1.19,tint(stone,.86+random()*.4));
      floor.rotation.y=Math.PI/8+random()*.06;
      if(edge) {
        const lump=piece('rock',x,-height-.1,z,.62,.42+random()*.38,.6,tint(dark,.7+random()*.32));
        lump.rotation.y=random()*3;
      }
    }
    // Collapsed parapet, with a gate flanked by two intact towers.
    for(let i=-4;i<=4;i++) {
      if(i===0)continue;
      const rows = Math.abs(i)===1 ? 4 : 1+Math.floor(random()*2);
      for(let j=0;j<rows;j++) {
        piece('box',i,.16+j*.32,-2.12,.94,.3,.63,tint(stone,.65+random()*.34));
        if(j===rows-1) for(const side of [-1,1])
          piece('box',i+side*.32,.42+j*.32,-2.12,.28,.26,.53,dark);
      }
    }
    piece('box',0,1.20,-2.12,1.25,.23,.61,dark);
    const beam=(ax,ay,az,bx,by,bz,width,color)=>{
      const a=new T.Vector3(ax,ay,az),b=new T.Vector3(bx,by,bz),v=b.clone().sub(a);
      const bar=piece('disc',(ax+bx)/2,(ay+by)/2,(az+bz)/2,width,v.length(),width,color);
      bar.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
    };
    function monument(x,z,tall){
      piece('box',x,.14,z,.86,.3,.8,dark);
      piece('box',x,.36,z,.66,.17,.68,stone);
      piece('box',x,.55+tall/2,z,.44,tall,.40,stone);
      piece('spike',x,tall+.79,z,.54,.65,.48,dark);
      piece('box',x,tall*.78,z+.22,.12,.4,.03,fire,true);
    }
    fireLight.color.setHex(fire);motes.material.color.setHex(fire);
    if(node.biome==='marsh'||node.biome==='frost'){
      for(let i=-2;i<=2;i++){
        piece('box',.16,-.005,i,1.52,.05,1,node.biome==='marsh'?0x314f4a:0x789fa4);
        for(let j=0;j<2;j++)piece('box',.15,.06,i+j*.4-.19,1.72,.1,.27,0x584939);
      }
      for(const x of [-3.5,3.5]){
        beam(x,0,-1.8,x+.17,1.7,-1.7,.23,0x50463a);
        beam(x+.12,.9,-1.76,x-.5,1.56,-1.6,.14,0x50463a);
        beam(x+.15,1.24,-1.73,x+.58,1.85,-1.63,.11,0x50463a);
      }
    }else if(node.biome==='ember'){
      for(const x of [-3.6,3.6]){
        piece('box',x,.73,-1.85,1.34,1.46,.9,dark);
        piece('box',x,.58,-1.38,.72,.46,.05,fire,true);
        for(const dx of [-.22,0,.22])piece('box',x+dx,.58,-1.33,.05,.47,.06,0x43352c);
        piece('disc',x,1.95,-1.85,.62,1.05,.61,dark);
      }
    }else if(node.biome==='throne'||node.biome==='ruins'){
      for(const x of [-3.6,-1.65,1.65,3.6])monument(x,-1.95,Math.abs(x)>2?1.65:2.35);
      if(node.biome==='throne'){
        piece('box',0,.32,-1.78,1.45,.62,.8,dark);
        piece('box',0,1.36,-2.14,1.15,1.94,.3,0x623d39);
        for(const x of [-.45,0,.45])piece('spike',x,2.5,-2.15,.28,.68,.28,0x927746);
      }else piece('disc',0,1.65,-2.08,.65,.62,.65,0x917552);
    }else if(node.biome==='quarry'){
      for(let i=0;i<18;i++){
        const x=(i%2?1:-1)*(3.25+random()*.75),z=-1.9+random()*.7;
        piece('rock',x,random()*.43,z,.45,.48,.42,0x746d5a);
        piece('spike',x,.43+random()*.24,z,.22,.7,.22,0xaca683);
      }
    }else{
      for(const x of [-3.65,3.65])monument(x,-1.9,1.2);
    }
    for(const x of [-4.2,4.2,-1.2,1.2]) {
      const z=Math.abs(x)>4?.65:-1.9;
      piece('disc',x,.33,z,.42,.65,.42,dark);
      piece('disc',x,.68,z,.64,.20,.64,0x473423);
      for(let k=0;k<3;k++) fires.push(piece('spike',x+(k-1)*.1,.93,z,.27,.58,.25,k===1?0xffe799:fire,true));
    }
    for(let i=0;i<30;i++) {
      const x=random()*9-4.5,z=random()>.5?-1.65-random()*.45:1.64+random()*.46;
      const size=.08+random()*.22;
      piece('rock',x,size*.25,z,size,size*.7,size*.8,tint(stone,.6+random()*.7));
    }
    for(const side of [-1,1]) {
      const x=side*3.9,z=-1.55;
      piece('disc',x,.93,z,.09,1.9,.09,0x6c573e);
      piece('box',x+.26,1.55,z,.54,.7,.055,side<0?0x466c60:0x88392d);
      piece('spike',x+.26,1.10,z,.52,.25,.07,side<0?0x466c60:0x88392d).rotation.z=Math.PI;
    }
  }
  function populate(save,node) {
    displayed=save.battle; fighters.length=0;
    if(terrainId!==node.id) { terrain(node); terrainId=node.id; }
    [save.party,displayed.foes.map(f=>f.kind)].forEach((row,side)=>{
      row.forEach((id,i)=>{
        const stagger = i===1 ? -.5 : .26;
        fighters.push({unit:units[id],id,side,index:i,x:(side?1:-1)*(2.05+stagger),z:(i-(row.length-1)/2)*1.02,
          alive:!side||displayed.foes[i].hp>0});
      });
    });
  }
  const glow = new T.Mesh(shapes.ring,new T.MeshBasicMaterial({color:0xffbc68})); glow.rotation.x=-Math.PI/2; scene.add(glow);
  const spell = new T.Mesh(shapes.rock,new T.MeshBasicMaterial({color:0x95f1d4})); scene.add(spell);
  function resize() {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    renderer.setSize(w,h,false);
    const half=Math.max(3.15,5.95*h/w);
    Object.assign(camera,{top:half,bottom:-half,left:-half*w/h,right:half*w/h,near:.1,far:70});
    camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize); observer.observe(canvas);
  function draw(ts) {
    frame=requestAnimationFrame(draw); time=ts/1000;
    if(document.hidden||!displayed)return;
    const t=action ? Math.min(1,(time-action.start)/1.12):1;
    beginParts(); glow.visible=false; spell.visible=false;
    for(const f of fighters) {
      const hit=action && (action.card==='nova'||action.target===f.index);
      if(!f.alive && !(action?.previous[f.index] && hit && t<.8))continue;
      const enemy=!!f.side, dir=enemy?-1:1, gear=f.unit.gear;
      const lunging=action && (!enemy || f.alive);
      const phase=enemy ? (t-.53)*2.3 : t*2.05;
      const swing=lunging && phase>0 && phase<1 ? Math.sin(phase*Math.PI) : 0;
      const opponent=fighters.find(other=>other.side!==f.side && other.index===(enemy?f.index%3:action?.target));
      const ranged=gear==='bow'||gear==='seer';
      const x=f.x+(opponent&&!ranged?(opponent.x-f.x-dir*.6)*swing:dir*swing*.34);
      const z=f.z+(opponent&&!ranged?(opponent.z-f.z)*swing*.86:0);
      const wounded=hit&&enemy&&t>.32&&t<.65 ? Math.sin((t-.32)*9):0;
      const model=f.unit.model, item=KIT.item;
      const body={x,y:!f.alive?-.65*Math.max(0,t-.45):0,z,yaw:dir*1.20,scale:model==='giant'?1.75:model==='ogre'?1.56:1.20,
        ph:time*(swing?8.5:2.2)+f.index,mv:swing+.07,atk:swing&&gear!=='bow'?phase:-1,flinch:wounded,
        weapon:gear==='bow'?null:gear==='club'?item.club:gear==='seer'||gear==='crown'?item.boneclub:item.sword,
        torch:gear==='seer',hood:gear==='seer',crown:gear==='crown',shield:gear==='shield'?item.shieldH:null,helm:gear==='shield',bow:gear==='bow',draw:swing,
        tint:enemy?[1,.79,.71]:[.91,1,.94],heavy:model==='ogre'};
      rigHuman(KIT[model],SPEC[model==='giant'?'skel':model],body);
      if(enemy&&f.index===selected&&f.alive){glow.visible=true;glow.position.set(f.x,.015,f.z);glow.scale.setScalar(.42+.03*Math.sin(time*4));}
      if(enemy&&f.index===action?.target&&t>.15&&t<.52) {
        const p=(t-.15)/.37;
        spell.visible=true;spell.position.set(-1.8+(f.x+1.8)*p,1.2+Math.sin(p*Math.PI)*.45,f.z*p);
        spell.scale.setScalar(action.card==='nova'?.24:.105);
      }
    }
    endParts();
    fires.forEach((f,i)=>{f.scale.y=.48+.13*Math.sin(time*7+i*2.1);f.rotation.y=time+i;});
    fireLight.intensity=23+2*Math.sin(time*5.4);
    motes.position.y=Math.sin(time*.7)*.23;motes.rotation.y=Math.sin(time*.24)*.09;
    renderer.render(scene,camera);
    if(t>=1)action=null;
  }
  return {
    show(save,node,target){populate(save,node);selected=target;resize();if(!frame)frame=requestAnimationFrame(draw);},
    select(i){selected=i;},
    play(card,target,previous){action={card,target,previous:previous.map(f=>f.hp>0),start:performance.now()/1000};},
    hide(){cancelAnimationFrame(frame);frame=0;displayed=null;action=null;}
  };
}

