// 极简 PNG 编码器 + 图标绘制（无外部依赖，仅用 zlib）
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf){
  let c, table = crc32.t || (crc32.t = (()=>{ const t=[]; for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })());
  let crc = 0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) crc = (crc>>>8) ^ table[(crc^buf[i])&0xFF];
  return (crc^0xFFFFFFFF)>>>0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t = Buffer.from(type,'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len, t, data, crc]);
}
function makePNG(size, rgb){
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; // 8bit RGB
  // raw data with filter byte per row
  const raw = Buffer.alloc(size*(size*3+1));
  for(let y=0;y<size;y++){
    raw[y*(size*3+1)] = 0;
    for(let x=0;x<size;x++){
      const o = y*(size*3+1)+1+x*3;
      const [r,g,b] = rgb(x,y);
      raw[o]=r; raw[o+1]=g; raw[o+2]=b;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
}

// 绘制：深蓝底 + 金色圆环 + 三竖旗（三国意象）
function draw(size){
  const C = size/2;
  const R = size*0.40;
  const bg=[17,20,26], gold=[232,168,85], goldD=[200,140,60];
  return makePNG(size, (x,y)=>{
    const dx=x-C, dy=y-C, d=Math.sqrt(dx*dx+dy*dy);
    // 圆环
    if(d>R && d<R+size*0.05) return gold;
    // 三竖旗
    const barW = size*0.07, gap = size*0.13;
    const topY = C - size*0.22, botY = C + size*0.26;
    const heights = [0.9, 1.0, 0.9];
    for(let i=0;i<3;i++){
      const bx = C + (i-1)*gap;
      const th = (botY-(topY - (1-heights[i])*size*0.12));
      const x0 = bx-barW/2, x1 = bx+barW/2;
      const y0 = topY - (1-heights[i])*size*0.12, y1 = botY;
      if(x>=x0 && x<=x1 && y>=y0 && y<=y1) return (i%2===0)?gold:goldD;
    }
    return bg;
  });
}

for(const s of [192,512]){
  fs.writeFileSync(`/workspace/dist/icon-${s}.png`, draw(s));
  console.log('wrote dist/icon-'+s+'.png');
}
// Android mipmap 各密度
const dens = {mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
for(const [k,v] of Object.entries(dens)){
  fs.writeFileSync(`/workspace/dist/_tmp_icon_${k}.png`, draw(v));
  console.log('wrote temp', k, v);
}
