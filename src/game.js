const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const W=canvas.width,H=canvas.height,GRAVITY=1450,JUMP=-560,R=13,TILE=30,ROW_GAP=104;
const el={menu:document.querySelector('#menu'),over:document.querySelector('#game-over'),start:document.querySelector('#start'),restart:document.querySelector('#restart'),height:document.querySelector('#height'),best:document.querySelector('#best'),speed:document.querySelector('#speed'),final:document.querySelector('#final-height'),newBest:document.querySelector('#new-best'),seed:document.querySelector('#seed')};
const state={running:false,time:0,cameraY:0,score:0,best:Number(localStorage.getItem('dlicom-best')||0),seed:0,rng:null,charge:0,flash:0,currentPlatformId:0,jumps:0};
const input={left:false,right:false},platforms=[];
const player={x:W/2,y:520,vx:0,vy:0,lastY:520};
el.best.textContent=String(state.best);

function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function rand(a,b){return a+(b-a)*state.rng()}
function axis(){return(input.right?1:0)-(input.left?1:0)}
function difficulty(){return Math.min(1,state.score/4500)}
function nextTileCount(row){
  const d=difficulty();
  if(row===0)return 4;
  if(row===1)return 4;
  const maxTiles=Math.max(3,7-Math.floor(d*3));
  const minTiles=Math.max(2,maxTiles-2);
  return Math.floor(rand(minTiles,maxTiles+1));
}
function addAbove(prev,n){
  const row=n+1;
  const tiles=nextTileCount(row);
  const w=tiles*TILE;
  const side=row%2===1?'right':'left';
  const x=side==='left'?0:W-w;
  const moving=state.score>900&&row%5===0;
  const p={
    id:prev.id+1,x,y:prev.y-ROW_GAP,w,h:12,type:moving?'moving':'static',
    baseX:x,phase:rand(0,Math.PI*2),
    amplitude:moving?Math.min(TILE*1.5,8+difficulty()*8):0,
    speed:moving?rand(.7,1.05):0,tiles,side,
    active:true,departedAt:null,fadeDuration:null,obstacle:null
  };
  platforms.push(p);
  rollObstacle(p);
  return p;
}
function reset(seed=Math.floor(Math.random()*2**31)){
  state.running=true;
  state.time=0;
  state.cameraY=0;
  state.score=0;
  state.charge=0;
  state.flash=0;
  state.seed=seed;
  state.rng=rng(seed);
  state.currentPlatformId=0;
  state.jumps=0;

  platforms.length=0;

  const tiles=6;
  const width=tiles*TILE;
  const starter={
    id:0,x:0,y:580,w:width,h:12,type:'static',tiles,side:'left',
    active:true,starter:true,baseX:0,phase:0,amplitude:0,speed:0,
    departedAt:null
  };
  platforms.push(starter);

  player.x=starter.x+starter.w*.5;
  player.y=starter.y-R;
  player.vx=0;
  player.vy=JUMP;
  player.lastY=player.y;

  let p=starter;
  for(let i=1;i<=16;i++)p=addAbove(p,i);

  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.height.textContent='0';
  el.speed.textContent='1.00x';
}
function ensure(){
  while(Math.min(...platforms.map(p=>p.y))>state.cameraY-900){
    const top=platforms.reduce((a,b)=>a.y<b.y?a:b);
    addAbove(top,top.id);
    if(platforms.length>90)break;
  }
}
function cleanup(){
  const cut=state.cameraY+H+120;
  for(let i=platforms.length-1;i>=0;i--){
    const p=platforms[i];
    if(p.id===state.currentPlatformId)continue;
    if(p.y>cut)platforms.splice(i,1);
  }
}
function graceDuration(){
  return state.jumps>=50?5:3;
}
function startDeparture(platform){
  if(!platform||platform.departedAt!==null)return;
  platform.departedAt=state.time;
  platform.fadeDuration=graceDuration();
}
function obstacleChance(){
  if(state.jumps<50)return 0;
  return Math.min(.38,.18+(state.jumps-50)*.002);
}
function canHostObstacle(platform){
  return Boolean(
    platform &&
    platform.active &&
    !platform.starter &&
    !platform.obstacle &&
    platform.w>=TILE*4 &&
    platform.id>=state.currentPlatformId+2
  );
}
function addObstacle(platform){
  if(!canHostObstacle(platform))return false;

  const type=rand(0,1)<.55?'spike':'ghost';
  const padding=TILE;

  if(type==='spike'){
    const minX=platform.x+padding;
    const maxX=platform.x+platform.w-padding;
    platform.obstacle={
      type:'spike',
      x:rand(minX,maxX),
      y:platform.y-13,
      w:18,
      h:16
    };
    return true;
  }

  const minX=platform.x+padding;
  const maxX=platform.x+platform.w-padding;
  const center=rand(minX,maxX);

  platform.obstacle={
    type:'ghost',
    x:center,
    baseX:center,
    y:platform.y-23,
    amplitude:Math.max(12,Math.min(28,(maxX-minX)*.42)),
    speed:rand(.9,1.35),
    phase:rand(0,Math.PI*2),
    radius:10
  };
  return true;
}
function rollObstacle(platform){
  if(state.jumps<50||!canHostObstacle(platform))return;
  if(rand(0,1)<obstacleChance())addObstacle(platform);
}
function seedUpcomingObstacles(){
  const future=platforms.filter(p=>canHostObstacle(p));
  const picks=[];
  const attempts=Math.min(4,future.length);

  for(let i=0;i<attempts;i++){
    if(rand(0,1)<.55){
      const candidate=future[Math.floor(rand(0,future.length))];
      if(candidate&&!picks.includes(candidate)&&addObstacle(candidate)){
        picks.push(candidate);
      }
    }
  }
}
function updateObstacles(){
  for(const p of platforms){
    const o=p.obstacle;
    if(!o)continue;

    if(o.type==='ghost'){
      const minX=p.x+TILE;
      const maxX=p.x+p.w-TILE;
      o.x=Math.max(
        minX,
        Math.min(maxX,o.baseX+Math.sin(state.time*o.speed+o.phase)*o.amplitude)
      );
      o.y=p.y-23;
    }
  }
}
function obstacleHit(){
  for(const p of platforms){
    const o=p.obstacle;
    if(!o)continue;

    if(o.type==='spike'){
      const hitX=player.x+R>o.x-o.w*.5&&player.x-R<o.x+o.w*.5;
      const hitY=player.y+R>o.y-o.h&&player.y-R<o.y+o.h;
      if(hitX&&hitY)return true;
    }else{
      const dx=player.x-o.x;
      const dy=player.y-o.y;
      const radius=R+o.radius;
      if(dx*dx+dy*dy<radius*radius)return true;
    }
  }
  return false;
}
function endRun(){
  state.running=false;const nb=state.score>state.best;
  if(nb){state.best=state.score;localStorage.setItem('dlicom-best',String(state.best))}
  el.final.textContent=String(state.score)+'m';el.newBest.classList.toggle('hidden',!nb);el.seed.textContent='RUN SEED · '+state.seed;el.best.textContent=String(state.best);el.over.classList.remove('hidden');
}
function update(dt){
  if(!state.running)return;

  state.time+=dt;
  state.flash=Math.max(0,state.flash-dt*3.5);

  const a=axis();
  const moving=a!==0;
  const same=a===0||Math.sign(player.vx||a)===a;

  if(moving&&same)state.charge=Math.min(4,state.charge+dt);
  else state.charge=Math.max(0,state.charge-dt*1.8);

  const mult=1+Math.min(.55,state.charge/7.25);
  const maxSpeed=190*mult;

  if(a)player.vx+=a*930*dt;
  else{
    const drag=Math.min(Math.abs(player.vx),1350*dt);
    player.vx-=Math.sign(player.vx)*drag;
  }

  player.vx=Math.max(-maxSpeed,Math.min(maxSpeed,player.vx));
  player.lastY=player.y;
  player.vy+=GRAVITY*dt;
  player.x+=player.vx*dt;
  player.y+=player.vy*dt;

  if(player.x<-R)player.x=W+R;
  if(player.x>W+R)player.x=-R;

  for(const p of platforms){
    if(p.type==='moving'&&p.active){
      p.x=p.baseX+Math.sin(state.time*p.speed+p.phase)*p.amplitude;
      p.x=Math.max(0,Math.min(W-p.w,p.x));
    }
  }

  updateObstacles();

  // A tile's fade clock starts once the player actually leaves it
  // horizontally. Merely bouncing vertically in place does not start it.
  const current=platforms.find(p=>p.id===state.currentPlatformId);
  if(current){
    const leftHorizontally=
      player.x+R<current.x||
      player.x-R>current.x+current.w;
    if(leftHorizontally)startDeparture(current);
  }

  for(const p of platforms){
    if(
      p.departedAt!==null&&
      p.fadeDuration!==null&&
      state.time-p.departedAt>=p.fadeDuration
    ){
      p.active=false;
    }
  }

  if(obstacleHit()){
    endRun();
    return;
  }

  if(player.vy>0){
    for(const p of platforms){
      if(!p.active)continue;

      const above=player.lastY+R<=p.y+2;
      const cross=player.y+R>=p.y;
      const inside=player.x+R*.72>=p.x&&player.x-R*.72<=p.x+p.w;

      if(!above||!cross||!inside)continue;

      const different=p.id!==state.currentPlatformId;

      player.y=p.y-R;
      player.vy=JUMP;

      if(different){
        const previous=platforms.find(platform=>platform.id===state.currentPlatformId);
        if(previous)startDeparture(previous);

        state.currentPlatformId=p.id;
        state.jumps+=1;

        if(state.jumps===50)seedUpcomingObstacles();
      }

      state.flash=.32;
      break;
    }
  }

  const target=player.y-H*.34;
  if(target<state.cameraY){
    state.cameraY+=(target-state.cameraY)*Math.min(1,dt*5.5);
  }

  state.score=Math.max(
    state.score,
    Math.floor((520-player.y+state.cameraY)*.75)
  );

  ensure();
  cleanup();

  el.height.textContent=String(Math.max(0,state.score));
  el.speed.textContent=mult.toFixed(2)+'x';

  if(player.y>state.cameraY+H+70)endRun();
}
function bg(){
  const progress=Math.min(1,state.score/3500),band=Math.floor(state.cameraY*-.12/180)%4;
  ctx.fillStyle='#080808';ctx.fillRect(0,0,W,H);
  for(let i=0;i<16;i++){const x=i*24+(band*9%18),h=55+(i*31+band*23)%120;ctx.fillStyle=i%3===0?'#111':'#0d0d0d';ctx.fillRect(x,H-h,14,h);if(progress>.35&&i%4===0){ctx.fillStyle='#1f1f1f';ctx.fillRect(x+4,H-h+14,4,4);ctx.fillRect(x+4,H-h+28,4,4)}}
  const shift=state.cameraY*.08%640;for(let i=0;i<28;i++){const x=i*137%W,y=(i*53-shift+H*2)%H;ctx.fillStyle=i%5===0?'#333':'#1b1b1b';ctx.fillRect(x,y,i%4===0?3:2,i%4===0?3:2)}
}
function drawPlatform(p){
  const y=p.y-state.cameraY;
  if(!p.active||y<-30||y>H+30)return;

  let alpha=1;
  if(p.departedAt!==null&&p.fadeDuration!==null){
    alpha=Math.max(
      0,
      1-(state.time-p.departedAt)/p.fadeDuration
    );
  }

  ctx.globalAlpha=alpha;

  const platformColor=p.type==='moving'?'#b8ff36':'#f0f0f0';
  ctx.fillStyle=platformColor;
  ctx.fillRect(Math.round(p.x),Math.round(y),Math.round(p.w),10);

  ctx.fillStyle='#4a4a4a';
  ctx.fillRect(Math.round(p.x),Math.round(y+10),Math.round(p.w),3);

  ctx.fillStyle='#171717';
  for(let i=0;i<p.tiles;i++){
    const tx=p.x+i*TILE;
    ctx.fillRect(Math.round(tx+5),Math.round(y+3),4,2);
    if(TILE>=24)ctx.fillRect(Math.round(tx+TILE-5),Math.round(y+3),2,2);
  }

  ctx.globalAlpha=1;
}
function drawObstacle(p){
  const o=p.obstacle;
  if(!o)return;

  if(o.type==='spike'){
    const x=Math.round(o.x);
    const y=Math.round(o.y-state.cameraY);

    ctx.fillStyle='#f0f0f0';
    ctx.beginPath();
    ctx.moveTo(x-9,y+13);
    ctx.lineTo(x,y-3);
    ctx.lineTo(x+9,y+13);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle='#171717';
    ctx.fillRect(x-2,y+6,4,5);
    return;
  }

  const x=Math.round(o.x);
  const y=Math.round(o.y-state.cameraY);

  ctx.fillStyle='#777';
  ctx.fillRect(x-10,y-8,20,18);
  ctx.fillRect(x-8,y+8,5,5);
  ctx.fillRect(x+3,y+8,5,5);

  ctx.fillStyle='#080808';
  ctx.fillRect(x-6,y-2,4,4);
  ctx.fillRect(x+2,y-2,4,4);
}
function mascot(){
  const sx=Math.round(player.x),sy=Math.round(player.y-state.cameraY),sq=player.vy<0?.96:1.06,w=Math.round(30*sq),h=Math.round(30/sq),x=sx-Math.floor(w/2),y=Math.round(sy-h/2+Math.sin(state.time*14)*1.5);
  ctx.fillStyle='#fff';
  ctx.fillRect(x+4,y,w-8,h);
  ctx.fillRect(x,y+5,w,h-10);
  ctx.fillStyle='#080808';
  ctx.fillRect(x+7,y+9,5,5);
  ctx.fillRect(x+w-12,y+9,5,5);
  ctx.fillRect(x+9,y+h-10,w-18,3);
  ctx.fillStyle='#888';
  ctx.fillRect(x+5,y+4,3,3);
  ctx.fillRect(x+w-8,y+4,3,3);

  if(state.flash){
    ctx.globalAlpha=state.flash;
    ctx.fillStyle='#fff';
    ctx.fillRect(x-5,y-5,w+10,h+10);
    ctx.globalAlpha=1;
  }
}
function draw(){
  bg();
  for(const p of platforms){
    drawPlatform(p);
    drawObstacle(p);
  }
  mascot();
}
function key(k,on){if(k==='ArrowLeft'||k.toLowerCase()==='a')input.left=on;if(k==='ArrowRight'||k.toLowerCase()==='d')input.right=on}
addEventListener('keydown',e=>{key(e.key,true);if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='Enter'&&!state.running&&el.over.classList.contains('hidden')===false)reset()});
addEventListener('keyup',e=>key(e.key,false));
function touch(id,dir){const z=document.querySelector(id);const on=e=>{e.preventDefault();input[dir]=true},off=e=>{e.preventDefault();input[dir]=false};['pointerdown','pointerenter'].forEach(v=>z.addEventListener(v,on));['pointerup','pointercancel','pointerleave'].forEach(v=>z.addEventListener(v,off))}
touch('#touch-left','left');touch('#touch-right','right');
el.start.onclick=()=>reset();el.restart.onclick=()=>reset();
let last=performance.now();function frame(now){const dt=Math.min(.032,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);
