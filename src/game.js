const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const W=canvas.width,H=canvas.height,GRAVITY=1450,JUMP=-560,R=13,TILE=30,ROW_GAP=104;
const el={menu:document.querySelector('#menu'),over:document.querySelector('#game-over'),start:document.querySelector('#start'),restart:document.querySelector('#restart'),height:document.querySelector('#height'),best:document.querySelector('#best'),jumps:document.querySelector('#jumps'),final:document.querySelector('#final-height'),newBest:document.querySelector('#new-best'),seed:document.querySelector('#seed')};
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
  el.jumps.textContent='0';
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
  el.jumps.textContent=String(state.jumps);

  if(player.y>state.cameraY+H+70)endRun();
}
function drawBackground(){
  ctx.fillStyle='#05070c';
  ctx.fillRect(0,0,W,H);

  // Pixel-perfect social/data grid.
  ctx.globalAlpha=.22;
  ctx.strokeStyle='#1b78a8';
  ctx.lineWidth=1;

  const grid=30;
  const offsetY=Math.floor(state.cameraY)%grid;

  for(let x=0;x<=W;x+=grid){
    ctx.beginPath();
    ctx.moveTo(x+.5,0);
    ctx.lineTo(x+.5,H);
    ctx.stroke();
  }

  for(let y=-grid;y<=H+grid;y+=grid){
    const sy=y-offsetY;
    ctx.beginPath();
    ctx.moveTo(0,sy+.5);
    ctx.lineTo(W,sy+.5);
    ctx.stroke();
  }

  ctx.globalAlpha=1;

  // Network nodes drift slowly against the scrolling world.
  const shift=(state.cameraY*.055)%H;
  for(let i=0;i<24;i++){
    const x=(i*83+17)%W;
    const y=(i*127-shift+H*2)%H;
    const connectedX=(x+30+(i%3)*30)%W;

    ctx.globalAlpha=.18;
    ctx.strokeStyle='#53c8f3';
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(connectedX,(y+42)%H);
    ctx.stroke();

    ctx.globalAlpha=.65;
    ctx.fillStyle=i%4===0?'#8fe9ff':'#276b96';
    ctx.fillRect(x-2,y-2,4,4);
  }

  ctx.globalAlpha=1;

  // Deeper blue architectural bands as the run climbs.
  const phase=Math.floor(state.score/250)%4;
  for(let i=0;i<5;i++){
    const x=((i*91)+phase*23)%W;
    ctx.fillStyle='#09131f';
    ctx.fillRect(x,H-150-(i%2)*40,18,150+(i%2)*40);
    ctx.fillStyle='#10263a';
    ctx.fillRect(x+5,H-132-(i%2)*40,3,72);
  }
}
function drawPlatform(p){
  const y=Math.round(p.y-state.cameraY);
  if(!p.active||y<-36||y>H+36)return;

  let alpha=1;
  if(p.departedAt!==null&&p.fadeDuration!==null){
    alpha=Math.max(0,1-(state.time-p.departedAt)/p.fadeDuration);
  }

  ctx.globalAlpha=alpha;

  // Main tile body.
  ctx.fillStyle='#12334b';
  ctx.fillRect(Math.round(p.x),y,Math.round(p.w),12);

  // Bright upper lip for instant collision readability.
  ctx.fillStyle=p.id===state.currentPlatformId?'#b9f2ff':'#74d7ff';
  ctx.fillRect(Math.round(p.x),y,Math.round(p.w),3);

  // Tile cells and connection motifs.
  for(let i=0;i<p.tiles;i++){
    const tx=Math.round(p.x+i*TILE);

    ctx.fillStyle=i%2===0?'#1c4764':'#173b55';
    ctx.fillRect(tx+1,y+3,TILE-2,8);

    ctx.fillStyle='#061018';
    ctx.fillRect(tx+6,y+6,5,2);
    ctx.fillRect(tx+16,y+5,3,3);

    if(i<p.tiles-1){
      ctx.fillStyle='#2b688b';
      ctx.fillRect(tx+TILE-1,y+2,1,9);
    }
  }

  ctx.fillStyle='#07131d';
  ctx.fillRect(Math.round(p.x),y+10,Math.round(p.w),2);

  ctx.globalAlpha=1;
}
function drawSpikyBall(x,y){
  const px=Math.round(x),py=Math.round(y);

  ctx.fillStyle='#ff6580';

  // Eight chunky pixel spikes.
  ctx.fillRect(px-2,py-14,4,5);
  ctx.fillRect(px-2,py+9,4,5);
  ctx.fillRect(px-14,py-2,5,4);
  ctx.fillRect(px+9,py-2,5,4);
  ctx.fillRect(px-10,py-10,4,4);
  ctx.fillRect(px+6,py-10,4,4);
  ctx.fillRect(px-10,py+6,4,4);
  ctx.fillRect(px+6,py+6,4,4);

  ctx.fillStyle='#8f2948';
  ctx.fillRect(px-8,py-8,16,16);
  ctx.fillRect(px-10,py-4,20,8);

  ctx.fillStyle='#ffd0da';
  ctx.fillRect(px-4,py-5,4,4);
}
function drawGhostBody(x,y,alpha){
  const px=Math.round(x),py=Math.round(y);

  ctx.globalAlpha=alpha;
  ctx.fillStyle='#8fe9ff';

  ctx.fillRect(px-7,py-10,14,16);
  ctx.fillRect(px-10,py-6,20,10);
  ctx.fillRect(px-7,py+6,4,6);
  ctx.fillRect(px-2,py+6,4,8);
  ctx.fillRect(px+3,py+6,4,6);

  ctx.fillStyle='#dff9ff';
  ctx.fillRect(px-5,py-7,3,4);
  ctx.fillRect(px+2,py-7,3,4);

  ctx.fillStyle='#12334b';
  ctx.fillRect(px-3,py-6,2,3);
  ctx.fillRect(px+2,py-6,2,3);

  ctx.globalAlpha=1;
}
function drawObstacle(p){
  const o=p.obstacle;
  if(!o)return;

  if(o.type==='spike'){
    drawSpikyBall(o.x,o.y-state.cameraY);
    return;
  }

  const x=o.x;
  const y=o.y-state.cameraY;

  // Digital after-image.
  drawGhostBody(x-7,y+3,.16);
  drawGhostBody(x+5,y-2,.11);
  drawGhostBody(x,y,.92);
}
function drawSprite(mask,x,y,scale,color){
  ctx.fillStyle=color;
  for(let row=0;row<mask.length;row++){
    for(let col=0;col<mask[row].length;col++){
      if(mask[row][col]==='1')ctx.fillRect(x+col*scale,y+row*scale,scale,scale);
    }
  }
}
function mascot(){
  const sx=Math.round(player.x);
  const sy=Math.round(player.y-state.cameraY);
  const bounce=Math.sin(state.time*12);
  const rising=player.vy<0;
  const scale=rising?2:2;
  const spriteW=16*scale;
  const spriteH=16*scale;

  ctx.save();
  ctx.translate(
    sx,
    Math.round(sy+bounce*.8)
  );
  ctx.scale(rising?.96:1.04,rising?1.04:.96);

  // Outer helmet: stepped 16x16 silhouette inspired by Dlicom's
  // transparent spherical helmet.
  const helmet=[
    '0000111111000000',
    '0001111111110000',
    '0011111111111100',
    '0111111111111110',
    '0111111111111110',
    '1111111111111111',
    '1111111111111111',
    '1111111111111111',
    '1111111111111111',
    '0111111111111110',
    '0111111111111110',
    '0011111111111100',
    '0001111111110000',
    '0000111111000000',
    '0000000000000000',
    '0000000000000000'
  ];

  drawSprite(helmet,-spriteW/2,-spriteH/2,scale,'#173d72');

  const rim=[
    '0000001111000000',
    '0000111111110000',
    '0001111111111100',
    '0011111111111110',
    '0011111111111110',
    '0111111111111111',
    '0111111111111111',
    '0111111111111111',
    '0011111111111110',
    '0011111111111110',
    '0001111111111100',
    '0000111111110000'
  ];
  drawSprite(rim,-spriteW/2,-spriteH/2+scale,scale,'#3da9f5');

  // Chat-bubble face.
  const face=[
    '00011111111000',
    '01111111111110',
    '11111111111111',
    '11111111111111',
    '11111111111111',
    '11111111111111',
    '01111111111110',
    '00111111111100',
    '00001111000000'
  ];
  drawSprite(face,-14,-10,2,'#6fb8ff');

  // Eyes + smile.
  ctx.fillStyle='#f2fbff';
  ctx.fillRect(-8,-4,4,4);
  ctx.fillRect(4,-4,4,4);

  ctx.fillStyle='#07111b';
  ctx.fillRect(-7,-3,3,3);
  ctx.fillRect(4,-3,3,3);
  ctx.fillRect(-2,3,4,2);
  ctx.fillRect(-1,5,2,1);

  // Small cyan pixels under the helmet sell the bounce.
  if(!movingHorizontal()){
    ctx.fillStyle='#5ff0ff';
    ctx.fillRect(-7,19,3,3);
    ctx.fillRect(5,20,2,2);
  }

  ctx.restore();

  if(state.flash){
    ctx.globalAlpha=Math.min(.5,state.flash);
    ctx.fillStyle='#dff9ff';
    ctx.fillRect(sx-18,sy-18,36,36);
    ctx.globalAlpha=1;
  }
}
function movingHorizontal(){
  return Math.abs(player.vx)>18;
}
function draw(){
  ctx.globalAlpha=1;
  drawBackground();

  for(const p of platforms){
    drawPlatform(p);
    drawObstacle(p);
  }

  ctx.globalAlpha=1;
  mascot();
}
function key(k,on){if(k==='ArrowLeft'||k.toLowerCase()==='a')input.left=on;if(k==='ArrowRight'||k.toLowerCase()==='d')input.right=on}
addEventListener('keydown',e=>{key(e.key,true);if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='Enter'&&!state.running&&el.over.classList.contains('hidden')===false)reset()});
addEventListener('keyup',e=>key(e.key,false));
function touch(id,dir){const z=document.querySelector(id);const on=e=>{e.preventDefault();input[dir]=true},off=e=>{e.preventDefault();input[dir]=false};['pointerdown','pointerenter'].forEach(v=>z.addEventListener(v,on));['pointerup','pointercancel','pointerleave'].forEach(v=>z.addEventListener(v,off))}
touch('#touch-left','left');touch('#touch-right','right');
el.start.onclick=()=>reset();el.restart.onclick=()=>reset();
let last=performance.now();function frame(now){const dt=Math.min(.032,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);
