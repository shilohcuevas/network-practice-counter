import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const SIZE = 256;
const SEED = 847291;
const dataDir = process.env.PRISMA_DATA_DIR || path.join(root, 'data', 'prisma');
const file = path.join(dataDir, 'world.json');
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function hash(x,y,seed=SEED) {let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,1442695041); n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967295;}
function smooth(t){return t*t*(3-2*t)}
function noise(x,y,scale){const a=Math.floor(x/scale),b=Math.floor(y/scale),u=smooth(x/scale-a),v=smooth(y/scale-b);const m=(i,j)=>hash(i,j);return (m(a,b)*(1-u)+m(a+1,b)*u)*(1-v)+(m(a,b+1)*(1-u)+m(a+1,b+1)*u)*v;}
function generate(){const tiles=[];for(let y=0;y<SIZE;y++){const row=[];for(let x=0;x<SIZE;x++){const elevation=noise(x,y,48)*0.65+noise(x,y,15)*0.25+noise(x,y,5)*0.1;const trees=noise(x+900,y-300,25);let t=elevation<0.36?2:elevation>0.71?3:trees>0.57&&hash(x,y,4)>0.83?4:hash(x,y,9)>0.9?1:0;const dx=x-SIZE/2,dy=y-SIZE/2;if(dx*dx+dy*dy<100)t=0;row.push(t);}tiles.push(row);}return {size:SIZE,seed:SEED,tiles};}
let world;
if(fs.existsSync(file)){world=JSON.parse(fs.readFileSync(file,'utf8'));console.log('Loaded persistent world');}
else{world=generate();fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(world));console.log('Generated world once and saved it');}
app.use(express.static(path.join(root,'public')));
app.get('/api/world',(req,res)=>res.json(world));
app.get('/healthz', (_req,res)=>res.json({status:'ok',game:'prisma',version:'0.1.7'}));
const players = new Map();
const charactersFile=path.join(dataDir,'characters.json');
let characters={};
try { characters=JSON.parse(fs.readFileSync(charactersFile,'utf8')); } catch(e) { if(e.code!=='ENOENT') console.warn('Character save unreadable:',e.message); }
const defaultCharacter=()=>({gold:0,damageLevel:0,healthLevel:0,speedLevel:0});
const stats=c=>({damage:10+c.damageLevel,maxHp:100+10*c.healthLevel,cooldownMs:Math.max(600,1500-50*c.speedLevel)});
const costs=c=>({damage:50*(c.damageLevel+1),health:50*(c.healthLevel+1),speed:50*(c.speedLevel+1)});
function saveCharacters(){fs.mkdirSync(path.dirname(charactersFile),{recursive:true});const temp=charactersFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(characters,null,2));fs.renameSync(temp,charactersFile);}
function publicCharacter(p){return {gold:p.character.gold,damageLevel:p.character.damageLevel,healthLevel:p.character.healthLevel,speedLevel:p.character.speedLevel,...stats(p.character),costs:costs(p.character)};}
const SPAWN_X=(SIZE/2+0.5)*32,SPAWN_Y=(SIZE/2+0.5)*32;
const SHOP_RADIUS=310;
const DUMMY_GOLD=15;
function nearShop(p){return Math.hypot(p.x-SPAWN_X,p.y-SPAWN_Y)<=SHOP_RADIUS;}

const projectiles=[];
const combatEvents=[];
let nextCombatEvent=1;
function combatEvent(type,x,y,amount=0,target=''){combatEvents.push({id:nextCombatEvent++,type,x,y,amount,target});if(combatEvents.length>80)combatEvents.shift();}
const dummies=[{id:'dummy-1',x:(SIZE/2+5.5)*32,y:(SIZE/2+0.5)*32,hp:100},{id:'dummy-2',x:(SIZE/2+3.5)*32,y:(SIZE/2+4.5)*32,hp:100}];
let nextProjectile=1;
const Q_SPEED=650;
const Q_RANGE=510;

const SPEED = 185;
const TILE=32;
function blocked(x,y){const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);return tx<0||ty<0||tx>=SIZE||ty>=SIZE||[3,4].includes(world.tiles[ty][tx]);}
function validPosition(x,y){const r=10;return !blocked(x-r,y-r)&&!blocked(x+r,y-r)&&!blocked(x-r,y+r)&&!blocked(x+r,y+r);}
function moveAxis(p,axis,delta){const next=clamp(p[axis]+delta,12,SIZE*TILE-12);const x=axis==='x'?next:p.x,y=axis==='y'?next:p.y;if(validPosition(x,y))p[axis]=next;}
io.on('connection',socket=>{
 let p=null;
 socket.on('join',v=>{
  if(p)return;
  const token=typeof v?.token==='string'&&/^[a-f0-9]{32,128}$/i.test(v.token)?v.token:null;
  if(!token){socket.emit('notice','Invalid character ID. Refresh the page.');return;}
  // Only one active connection per character, avoiding concurrent edits to one save.
  for(const other of players.values())if(other.token===token){socket.emit('notice','Character already online in another tab.');return;}
  const saved=characters[token]||defaultCharacter();
  const character={...defaultCharacter(),...saved};
  for(const k of ['gold','damageLevel','healthLevel','speedLevel']){
   if(!Number.isSafeInteger(character[k])||character[k]<0)character[k]=0;
  }
  const st=stats(character);
  p={id:socket.id,token,character,x:SPAWN_X,y:SPAWN_Y,angle:0,color:`hsl(${Math.floor(Math.random()*360)} 75% 58%)`,hp:st.maxHp,lastShot:0,input:{x:0,y:0}};
  players.set(socket.id,p);
  characters[token]=character;
  saveCharacters();
  socket.emit('welcome',{id:socket.id,character:publicCharacter(p)});
 });
 socket.on('input',v=>{if(!p||!v||typeof v!=='object')return;const x=Number(v.x),y=Number(v.y),a=Number(v.angle);if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(a))return;p.input={x:clamp(x,-1,1),y:clamp(y,-1,1)};p.angle=a;});
 socket.on('castQ',v=>{
  if(!p||!v||typeof v!=='object')return;
  const angle=Number(v.angle);
  if(!Number.isFinite(angle)||Math.abs(angle)>100000)return;
  const now=Date.now(),st=stats(p.character);
  if(now-p.lastShot<st.cooldownMs||p.hp<=0)return;
  p.lastShot=now;
  const vx=Math.cos(angle),vy=Math.sin(angle);
  projectiles.push({id:nextProjectile++,owner:p.id,x:p.x+vx*20,y:p.y+vy*20,vx:vx*Q_SPEED,vy:vy*Q_SPEED,distance:0,damage:st.damage});
  p.angle=angle;
  socket.emit('qCast',{cooldownMs:st.cooldownMs});
 });
 socket.on('upgrade',v=>{
  if(!p||!['damage','health','speed'].includes(v?.stat))return;
  if(!nearShop(p)){socket.emit('notice','Return to the starting town to buy upgrades.');return;}
  const c=p.character,price=costs(c)[v.stat];
  const key={damage:'damageLevel',health:'healthLevel',speed:'speedLevel'}[v.stat];
  if(c.gold<price||c[key]>=18){socket.emit('notice',c[key]>=18?'Upgrade cap reached.':'Not enough gold.');return;}
  c.gold-=price;c[key]++;
  if(v.stat==='health')p.hp+=10;
  saveCharacters();socket.emit('character',publicCharacter(p));
 });
 socket.on('disconnect',()=>{if(p)players.delete(socket.id);});
});
let previous=Date.now();setInterval(()=>{const now=Date.now(),dt=Math.min((now-previous)/1000,0.05);previous=now;for(const p of players.values()){let {x,y}=p.input;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}const tile=world.tiles[Math.floor(p.y/TILE)]?.[Math.floor(p.x/TILE)];const speed=SPEED*(tile===2?0.45:1);moveAxis(p,'x',x*speed*dt);moveAxis(p,'y',y*speed*dt);}for(let i=projectiles.length-1;i>=0;i--){
 const a=projectiles[i];
 let hit=false;
 const steps=Math.max(1,Math.ceil(Math.hypot(a.vx,a.vy)*dt/8));
 for(let j=0;j<steps&&!hit;j++){
  a.x+=a.vx*dt/steps;a.y+=a.vy*dt/steps;a.distance+=Math.hypot(a.vx,a.vy)*dt/steps;
  if(blocked(a.x,a.y)){hit=true;break;}
  for(const d of dummies){if(d.hp>0&&Math.hypot(a.x-d.x,a.y-d.y)<18){d.hp=Math.max(0,d.hp-a.damage);combatEvent('hit',d.x,d.y,a.damage,d.id);hit=true;if(d.hp===0){combatEvent('death',d.x,d.y,0,d.id);const owner=players.get(a.owner);if(owner){owner.character.gold+=DUMMY_GOLD;saveCharacters();io.to(owner.id).emit('character',publicCharacter(owner));io.to(owner.id).emit('notice',`NPC defeated! +${DUMMY_GOLD} gold`);}setTimeout(()=>{d.hp=100;},2500);}break;}}
  if(hit)break;
  for(const other of players.values()){if(other.id!==a.owner&&Math.hypot(a.x-other.x,a.y-other.y)<16){other.hp=Math.max(0,other.hp-a.damage);combatEvent('hit',other.x,other.y,a.damage,other.id);hit=true;if(other.hp===0){combatEvent('death',other.x,other.y,0,other.id);other.hp=stats(other.character).maxHp;other.x=SPAWN_X;other.y=SPAWN_Y;io.to(other.id).emit('notice','Defeated! Respawned in town.');}break;}}
 }
 if(hit||a.distance>=Q_RANGE)projectiles.splice(i,1);
}
io.emit('state',{players:Array.from(players.values(),({id,x,y,angle,color,hp,character})=>({id,x,y,angle,color,hp,maxHp:stats(character).maxHp})),projectiles,dummies,combatEvents:combatEvents.splice(0)});},1000/30);
const PORT=Number(process.env.PORT)||3000;server.listen(PORT,'0.0.0.0',()=>console.log(`Prisma 0.1.7 listening on port ${PORT}; save directory: ${dataDir}`));
