const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const W=canvas.width,H=canvas.height,GRAVITY=1450,JUMP=-560,R=13,TILE=30,ROW_GAP=104;
const el={menu:document.querySelector('#menu'),over:document.querySelector('#game-over'),start:document.querySelector('#start'),restart:document.querySelector('#restart'),height:document.querySelector('#height'),best:document.querySelector('#best'),jumps:document.querySelector('#jumps'),final:document.querySelector('#final-height'),newBest:document.querySelector('#new-best'),seed:document.querySelector('#seed')};
const state={running:false,time:0,cameraY:0,score:0,best:Number(localStorage.getItem('dlicom-best')||0),seed:0,rng:null,charge:0,flash:0,currentPlatformId:0,jumps:0,launchTimer:0,launched:false};
const input={left:false,right:false},platforms=[];
const player={x:W/2,y:520,vx:0,vy:0,lastY:520};
el.best.textContent=String(state.best);

function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function rand(a,b){return a+(b-a)*state.rng()}
function axis(){return(input.right?1:0)-(input.left?1:0)}
function difficulty(){return Math.min(1,state.score/4500)}
function nextTileCount(row){
  const d=difficulty();

  // Keep the opening deliberately generous so the first opposite-wall
  // platform is reachable on the very first bounce. Later rows tighten.
  if(row<=2)return 7;
  if(row<=6)return 6;

  const maxTiles=Math.max(3,7-Math.floor(d*3));
  const minTiles=Math.max(2,maxTiles-2);
  return Math.floor(rand(minTiles,maxTiles+1));
}
function addAbove(prev,n){
  const row=n+1;
  const tiles=nextTileCount(row);
  const w=tiles*TILE;
  // Starter is on the left; the first generated target goes right,
  // then the route alternates left/right from there.
  const side=row%2===0?'right':'left';
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
  state.launchTimer=.16;
  state.launched=false;

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
  player.vy=0;
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
  const padding=TILE*1.35;

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
    minX,
    maxX,
    y:platform.y-23,
    direction:rand(0,1)<.5?-1:1,
    state:'moving',
    pauseUntil:state.time,
    lastUpdate:state.time,
    speed:rand(46,58),
    radius:10
  };
  return true;
}
function rollObstacle(platform){
  if(state.jumps<50||!canHostObstacle(platform))return;
  if(rand(0,1)<obstacleChance())addObstacle(platform);
}
function seedUpcomingObstacles(){
  const future=platforms
    .filter(p=>canHostObstacle(p))
    .sort((a,b)=>a.id-b.id);

  let placed=0;
  let lastPlacedId=-99;

  for(const candidate of future){
    if(placed>=3)break;
    if(candidate.id-lastPlacedId<2)continue;
    if(rand(0,1)<.72&&addObstacle(candidate)){
      placed+=1;
      lastPlacedId=candidate.id;
    }
  }
}
function updateObstacles(){
  for(const p of platforms){
    const o=p.obstacle;
    if(!o)continue;

    if(o.type==='ghost'){
      const dt=Math.max(0,state.time-(o.lastUpdate??state.time));
      const minX=p.x+TILE*1.35;
      const maxX=Math.max(minX,p.x+p.w-TILE*1.35);

      o.minX=minX;
      o.maxX=maxX;

      // Patrol from one safe edge of the tile to the other.
      // At each edge the ghost pauses for exactly two seconds.
      if(o.state==='paused'){
        if(state.time>=o.pauseUntil){
          o.state='moving';
          o.direction*=-1;
        }
      }else{
        o.x+=o.direction*o.speed*dt;
        if(o.x<=o.minX){
          o.x=o.minX;
          o.state='paused';
          o.pauseUntil=state.time+2;
        }else if(o.x>=o.maxX){
          o.x=o.maxX;
          o.state='paused';
          o.pauseUntil=state.time+2;
        }
      }

      o.y=p.y-23;
      o.lastUpdate=state.time;
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

  // Give the player a clean visual start: the mascot is visibly planted on
  // the first tile for a brief moment, then the automatic bounce begins.
  if(!state.launched){
    const starter=platforms.find(p=>p.id===0);
    if(starter){
      state.launchTimer=Math.max(0,state.launchTimer-dt);
      player.x=starter.x+starter.w*.5;
      player.y=starter.y-R;
      player.vx=0;
      player.vy=0;
      player.lastY=player.y;
    }
    if(state.launchTimer>0)return;
    state.launched=true;
    player.vy=JUMP;
  }

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

  // Social graph / messaging motifs drift with the camera.
  const shift=(state.cameraY*.055)%H;
  for(let i=0;i<22;i++){
    const x=(i*83+17)%W;
    const y=(i*127-shift+H*2)%H;
    const connectedX=(x+30+(i%3)*30)%W;

    ctx.globalAlpha=.15;
    ctx.strokeStyle='#53c8f3';
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(connectedX,(y+42)%H);
    ctx.stroke();

    ctx.globalAlpha=.52;
    ctx.fillStyle=i%4===0?'#8fe9ff':'#276b96';
    ctx.fillRect(x-2,y-2,4,4);

    // Tiny chat bubbles / profile markers keep the world feeling social
    // without occupying the jump lane.
    if(i%5===0){
      ctx.globalAlpha=.2;
      ctx.strokeStyle='#72d9ff';
      ctx.strokeRect(x+8,y-8,10,7);
      ctx.fillRect(x+10,y-1,3,2);
    }else if(i%5===2){
      ctx.globalAlpha=.22;
      ctx.fillStyle='#6fb8ff';
      ctx.fillRect(x-9,y-1,7,7);
      ctx.fillRect(x-7,y-4,3,3);
    }
  }

  // Horizontal data rails sell the feeling of climbing through a live network.
  const railOffset=Math.floor(state.cameraY*.18)%48;
  ctx.globalAlpha=.11;
  ctx.fillStyle='#1d6389';
  for(let i=-1;i<15;i++){
    const y=i*48-railOffset;
    ctx.fillRect(18,y,W-36,1);
    if(i%3===0)ctx.fillRect(18,y,48,3);
    if(i%4===0)ctx.fillRect(W-66,y,48,3);
  }
  ctx.globalAlpha=1;

  // Deep architectural columns add depth while staying behind the platforms.
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

  // 12 chunky spikes with a dark core so it reads as a ball, not a triangle.
  ctx.fillStyle='#ff6580';
  ctx.fillRect(px-2,py-15,4,6);
  ctx.fillRect(px-2,py+9,4,6);
  ctx.fillRect(px-15,py-2,6,4);
  ctx.fillRect(px+9,py-2,6,4);
  ctx.fillRect(px-11,py-11,4,4);
  ctx.fillRect(px+7,py-11,4,4);
  ctx.fillRect(px-11,py+7,4,4);
  ctx.fillRect(px+7,py+7,4,4);

  ctx.fillStyle='#a72f50';
  ctx.fillRect(px-8,py-8,16,16);
  ctx.fillRect(px-10,py-4,20,8);
  ctx.fillRect(px-4,py-10,8,20);

  ctx.fillStyle='#5e1930';
  ctx.fillRect(px-6,py-6,12,12);
  ctx.fillRect(px-8,py-2,16,4);

  ctx.fillStyle='#ffd0da';
  ctx.fillRect(px-5,py-5,4,4);
  ctx.fillRect(px-3,py-1,2,2);
}
function drawGhostBody(x,y,alpha){
  const px=Math.round(x),py=Math.round(y);

  ctx.globalAlpha=alpha;
  ctx.fillStyle='#8fe9ff';

  ctx.fillRect(px-8,py-10,16,15);
  ctx.fillRect(px-10,py-6,20,11);
  ctx.fillRect(px-7,py+5,4,6);
  ctx.fillRect(px-2,py+5,4,9);
  ctx.fillRect(px+4,py+5,4,6);

  // Visor-like face cutout.
  ctx.fillStyle='#dff9ff';
  ctx.fillRect(px-5,py-6,3,4);
  ctx.fillRect(px+2,py-6,3,4);
  ctx.fillStyle='#12334b';
  ctx.fillRect(px-4,py-5,2,2);
  ctx.fillRect(px+2,py-5,2,2);

  // Small signal streak.
  ctx.fillStyle='#6fb8ff';
  ctx.fillRect(px+8,py-8,4,2);

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

  ctx.save();
  // The collider is centered on player.y; the art is anchored by its
  // bottom edge so the mascot visibly sits on top of the tile.
  ctx.translate(sx,Math.round(sy-15+bounce*.8));
  ctx.scale(rising?.97:1.04,rising?1.04:.96);

  // Dlicom's canonical mascot cues: a glossy spherical glass helmet,
  // rounded blue chat-bubble face, light-blue suit/collar, and D emblem.
  const helmet=[
    '00000001111110000000',
    '00000011111111000000',
    '00000111111111100000',
    '00001111111111110000',
    '00011111111111111000',
    '00111111111111111100',
    '01111111111111111110',
    '01111111111111111110',
    '11111111111111111111',
    '11111111111111111111',
    '01111111111111111110',
    '01111111111111111110',
    '00111111111111111100',
    '00011111111111111000',
    '00001111111111110000',
    '00000111111111100000',
    '00000011111111000000',
    '00000001111110000000'
  ];
  drawSprite(helmet,-20,-18,2,'#0b3f83');

  // Bright cyan glass edge gives the head the translucent globe feel seen in Dlicom art.
  const rim=[
    '00000000111100000000',
    '00000011111111000000',
    '00000111111111100000',
    '00001111111111110000',
    '00011111111111111000',
    '00111111111111111100',
    '00111111111111111100',
    '01111111111111111110',
    '01111111111111111110',
    '00111111111111111100',
    '00111111111111111100',
    '00011111111111111000',
    '00001111111111110000',
    '00000111111111100000',
    '00000011111111000000'
  ];
  drawSprite(rim,-20,-16,2,'#48c9ff');

  // Glass reflections.
  ctx.fillStyle='#d4f9ff';
  ctx.globalAlpha=.9;
  ctx.fillRect(-10,-29,11,2);
  ctx.fillRect(-15,-26,4,2);
  ctx.fillRect(11,-19,3,2);
  ctx.globalAlpha=1;

  // The signature Dlicom chat-bubble face.
  const face=[
    '0000111111110000',
    '0011111111111100',
    '0111111111111110',
    '1111111111111111',
    '1111111111111111',
    '1111111111111111',
    '1111111111111111',
    '0111111111111110',
    '0011111111111100',
    '0000111111000000',
    '0000011100000000'
  ];
  drawSprite(face,-16,-10,2,'#729ff5');

  // Friendly white eyes with dark blue pupils.
  ctx.fillStyle='#f7fbff';
  ctx.fillRect(-10,-4,5,5);
  ctx.fillRect(5,-4,5,5);
  ctx.fillStyle='#14284f';
  ctx.fillRect(-9,-3,3,3);
  ctx.fillRect(6,-3,3,3);

  // Small curved smile.
  ctx.fillRect(-3,3,6,2);
  ctx.fillRect(-1,5,2,1);

  // Tiny D emblem above the face + collar cue from the canonical body design.
  ctx.fillStyle='#d5f9ff';
  ctx.fillRect(-3,-24,6,2);
  ctx.fillRect(-3,-22,2,4);
  ctx.fillRect(1,-22,2,3);
  ctx.fillRect(-1,-19,3,2);

  ctx.fillStyle='#86dcff';
  ctx.fillRect(-8,18,16,4);
  ctx.fillStyle='#d5f9ff';
  ctx.fillRect(-3,18,6,2);

  if(!movingHorizontal()){
    ctx.fillStyle='#5ff0ff';
    ctx.fillRect(-8,25,3,3);
    ctx.fillRect(5,26,2,2);
  }

  ctx.restore();

  if(state.flash){
    ctx.globalAlpha=Math.min(.45,state.flash);
    ctx.fillStyle='#dff9ff';
    ctx.fillRect(sx-20,sy-20,40,40);
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
