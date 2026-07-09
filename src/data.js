/* ============================================================
 *  data.js —— 数据层（UMD）
 *  内置默认配表（与 data/*.csv 同步）+ CSV 解析 / 热加载。
 *  热加载采用「可变 state 对象」：reload() 重赋值 state.*，
 *  其余模块在「调用时」读取 state.*，因此热加载对全局即时生效。
 * ============================================================ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.RULES_DATA = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- 默认配表（与 CSV 配表一致）---------- */
  const DEFAULTS = {
    TERRAIN: {
      plain:{name:'平原',move:1.0,atk:1.0,def:1.0,cav:1.15,inf:1.0,arch:1.0,eng:0.9,scout:1.0,ambush:0,flood:0,choke:0,marchDmg:0,color:'#cfe8a9'},
      hill:{name:'丘陵',move:0.8,atk:1.0,def:1.15,cav:0.9,inf:1.1,arch:1.1,eng:1.0,scout:0.9,ambush:0.1,flood:0,choke:0,marchDmg:0,color:'#bcd99a'},
      mountain:{name:'山地',move:0.6,atk:0.9,def:1.3,cav:0.7,inf:1.15,arch:1.0,eng:0.8,scout:0.8,ambush:0.2,flood:0,choke:1,marchDmg:0,color:'#9fae7a'},
      forest:{name:'森林',move:0.8,atk:1.0,def:1.1,cav:0.85,inf:1.0,arch:1.15,eng:0.9,scout:0.7,ambush:0.3,flood:0,choke:0,marchDmg:0,color:'#7fae6b'},
      swamp:{name:'沼泽',move:0.5,atk:0.95,def:0.95,cav:0.6,inf:0.9,arch:0.9,eng:0.7,scout:0.9,ambush:0.1,flood:0.2,choke:0,marchDmg:0.06,color:'#a8b18c'},
      river:{name:'河流',move:0.1,atk:1.0,def:1.0,cav:0.5,inf:0.8,arch:1.0,eng:1.2,scout:0.6,ambush:0,flood:1,choke:0,marchDmg:0,color:'#7fb6d6'},
      lowland:{name:'低洼盆地',move:0.9,atk:0.95,def:0.85,cav:1.0,inf:0.95,arch:1.0,eng:0.9,scout:1.0,ambush:0,flood:0.6,choke:0,marchDmg:0,color:'#c9d8a0'},
      defile:{name:'峡谷隘口',move:0.6,atk:0.9,def:1.18,cav:0.7,inf:1.1,arch:1.0,eng:0.8,scout:0.8,ambush:0.35,flood:0,choke:1,marchDmg:0,color:'#8c9a6e'},
      city:{name:'城池关隘',move:1.0,atk:1.0,def:1.12,cav:0.9,inf:1.1,arch:1.0,eng:1.3,scout:0.9,ambush:0.05,flood:0,choke:1,marchDmg:0,color:'#d8c98c'},
      desert:{name:'荒漠戈壁',move:0.7,atk:1.0,def:1.0,cav:1.0,inf:0.9,arch:1.0,eng:0.8,scout:1.1,ambush:0,flood:0,choke:0,marchDmg:0.04,color:'#e3d6a0'},
      tundra:{name:'雪原冰原',move:0.6,atk:1.0,def:1.05,cav:0.8,inf:1.0,arch:0.95,eng:0.8,scout:0.9,ambush:0.1,flood:0,choke:0,marchDmg:0.03,color:'#dfe7ee'},
      bridge:{name:'桥梁栈道',move:1.0,atk:1.0,def:1.0,cav:0.9,inf:1.0,arch:1.0,eng:1.0,scout:1.0,ambush:0,flood:0,choke:0.7,marchDmg:0,color:'#c2b08a'}
    },
    WEATHER: {
      sun:{name:'晴',move:1.0,atk:1.0,def:1.0,fire:1.0,cav:1.0,scout:1.0,flood:0.0,morale:0},
      rain:{name:'雨',move:0.8,atk:1.0,def:1.0,fire:0.2,cav:0.8,scout:0.9,flood:1.5,morale:-5},
      snow:{name:'雪严寒',move:0.7,atk:1.0,def:1.0,fire:1.4,cav:0.8,scout:0.9,flood:0.5,morale:-8},
      wind:{name:'大风',move:1.0,atk:1.0,def:1.0,fire:1.5,cav:1.0,scout:1.0,flood:0.6,morale:0},
      fog:{name:'大雾',move:0.9,atk:1.0,def:1.0,fire:1.0,cav:1.0,scout:0.4,flood:1.0,morale:0},
      drought:{name:'酷暑旱',move:0.9,atk:1.0,def:1.0,fire:1.8,cav:1.0,scout:1.1,flood:0.2,morale:-6}
    },
    SEASON: {
      spring:{name:'春',grain:1.1,w:{rain:3,sun:3,fog:1,snow:1,wind:1,drought:0}},
      summer:{name:'夏',grain:1.2,w:{rain:2,sun:4,fog:1,snow:0,wind:1,drought:2}},
      autumn:{name:'秋',grain:1.0,w:{rain:2,sun:3,fog:1,snow:0,wind:2,drought:1}},
      winter:{name:'冬',grain:0.7,w:{rain:1,sun:2,fog:1,snow:4,wind:1,drought:0}}
    },
    FORMATIONS: {
      fengshi:{name:'锋矢',atk:1.2,def:0.85,morale:1.0,flank:0.9,reqInt:0},
      heyi:{name:'鹤翼',atk:1.0,def:1.0,morale:1.0,flank:1.3,reqInt:0},
      fangyuan:{name:'方圆',atk:0.9,def:1.3,morale:1.1,flank:0.9,reqInt:0},
      bazhen:{name:'八阵',atk:1.05,def:1.1,morale:1.0,flank:1.0,reqInt:90},
      yanxing:{name:'雁行',atk:1.1,def:0.95,morale:1.0,flank:1.1,reqInt:0},
      yulin:{name:'鱼鳞',atk:0.95,def:1.2,morale:1.05,flank:0.95,reqInt:0}
    },
    GENERALS: [
      {id:'cao1',name:'曹操',star:5,force:92,intellect:89,leadership:96,speed:78,style:'鹰扬',trait:'多疑',troop:'骑',suit:'S',skill:'奸雄',skillDesc:'每回合概率提升全军攻击并降低敌方防御',faction:'魏',skills:['jianxiong'],level:5},
      {id:'liu1',name:'刘备',star:5,force:82,intellect:96,leadership:93,speed:72,style:'持重',trait:'仁德',troop:'步',suit:'S',skill:'仁德',skillDesc:'提升全军士气与伤兵恢复速度',faction:'蜀',skills:['rende'],level:5},
      {id:'sun1',name:'孙权',star:4,force:84,intellect:92,leadership:92,speed:76,style:'奇变',trait:'沉稳',troop:'弓',suit:'S',skill:'制衡',skillDesc:'概率使敌方主动战法失效并反弹',faction:'吴',skills:['zhizhi'],level:4},
      {id:'guan1',name:'关羽',star:5,force:97,intellect:75,leadership:95,speed:80,style:'鹰扬',trait:'刚烈',troop:'步',suit:'S',skill:'威震华夏',skillDesc:'对兵力最高敌军造成巨额兵刃伤害并震慑',faction:'蜀',skills:['weizhen'],level:5},
      {id:'zhang1',name:'张飞',star:5,force:98,intellect:52,leadership:92,speed:85,style:'鹰扬',trait:'短虑',troop:'步',suit:'A',skill:'咆哮',skillDesc:'高概率混乱敌军前排，自身易中控',faction:'蜀',skills:['paoxiao'],level:5},
      {id:'zhao1',name:'赵云',star:5,force:96,intellect:76,leadership:93,speed:95,style:'鹰扬',trait:'沉稳',troop:'骑',suit:'S',skill:'龙胆',skillDesc:'突击多次且免疫首次控制',faction:'蜀',skills:['longdan'],level:5},
      {id:'zhu1',name:'诸葛亮',star:5,force:55,intellect:100,leadership:85,speed:72,style:'奇变',trait:'多疑',troop:'步',suit:'S',skill:'空城',skillDesc:'残血时大幅提升防御并使敌方命中下降（空城计）',faction:'蜀',skills:['kongcheng'],level:5},
      {id:'zhou1',name:'周瑜',star:5,force:72,intellect:93,leadership:90,speed:83,style:'奇变',trait:'傲岸',troop:'弓',suit:'S',skill:'火攻',skillDesc:'火系伤害翻倍并点燃地形',faction:'吴',skills:['huogong'],level:5},
      {id:'sima1',name:'司马懿',star:5,force:68,intellect:97,leadership:91,speed:74,style:'持重',trait:'隐忍',troop:'步',suit:'S',skill:'鹰视',skillDesc:'持续偷取敌军属性并削弱',faction:'魏',skills:['yingshi'],level:5},
      {id:'lv1',name:'吕布',star:5,force:100,intellect:35,leadership:85,speed:98,style:'鹰扬',trait:'短虑',troop:'骑',suit:'S',skill:'无双',skillDesc:'极高兵刃爆发，但自身易被混乱',faction:'群',skills:['wushuang'],level:5},
      {id:'huang1',name:'黄忠',star:4,force:94,intellect:62,leadership:88,speed:79,style:'持重',trait:'老当益壮',troop:'弓',suit:'S',skill:'百步',skillDesc:'远程暴击并破防',faction:'蜀',skills:['baibu'],level:4},
      {id:'lu1',name:'陆逊',star:5,force:70,intellect:95,leadership:89,speed:80,style:'奇变',trait:'沉稳',troop:'弓',suit:'S',skill:'火烧连营',skillDesc:'火攻蔓延且施加灼烧',faction:'吴',skills:['shaolian'],level:5}
    ],
    /* —— 战法（主动/被动/指挥/追击） —— */
    SKILLS: {
      jianxiong:{id:'jianxiong',name:'奸雄',type:'指挥',school:'谋略',target:'ally_all',prep:0,cd:0,rate:100,dmgPct:0,healPct:0,buffAtkPct:0.10,buffDefPct:0.05,buffMorale:0,debuffAtkPct:0,debuffDefPct:0,ctrl:'',ctrlChance:0,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:0,duration:10,desc:'每回合提升全军攻击并降低敌方防御'},
      rende:{id:'rende',name:'仁德',type:'被动',school:'谋略',target:'ally_all',prep:0,cd:0,rate:100,dmgPct:0,healPct:0.06,buffAtkPct:0,buffDefPct:0,buffMorale:0.05,debuffAtkPct:0,debuffDefPct:0,ctrl:'',ctrlChance:0,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:0,duration:10,desc:'提升全军士气与伤兵恢复速度'},
      zhizhi:{id:'zhizhi',name:'制衡',type:'主动',school:'谋略',target:'foe_all',prep:0,cd:2,rate:45,dmgPct:0,healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:-0.10,debuffDefPct:0,ctrl:'silence',ctrlChance:0.50,dotPct:0,dotSchool:'',stealPct:0,reflect:1,immuneCtrl:0,duration:1,desc:'概率使敌方主动战法失效并反弹'},
      weizhen:{id:'weizhen',name:'威震华夏',type:'主动',school:'兵刃',target:'foe_top',prep:0,cd:2,rate:40,dmgPct:1.20,dmgSchool:'兵刃',healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.15,ctrl:'shock',ctrlChance:0.60,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:0,duration:2,desc:'对兵力最高敌军造成巨额兵刃伤害并震慑'},
      paoxiao:{id:'paoxiao',name:'咆哮',type:'主动',school:'兵刃',target:'foe_front',prep:0,cd:2,rate:50,dmgPct:0.45,dmgSchool:'兵刃',healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.10,ctrl:'confuse',ctrlChance:0.55,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:0,duration:1,desc:'高概率混乱敌军前排，自身易中控'},
      longdan:{id:'longdan',name:'龙胆',type:'主动',school:'兵刃',target:'foe_top',prep:0,cd:2,rate:55,dmgPct:1.00,dmgSchool:'兵刃',healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.10,ctrl:'',ctrlChance:0,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:1,duration:2,desc:'突击多次且免疫首次控制'},
      kongcheng:{id:'kongcheng',name:'空城',type:'被动',school:'谋略',target:'self',prep:0,cd:0,rate:100,dmgPct:0,healPct:0,buffAtkPct:0,buffDefPct:0.25,buffMorale:0,debuffAtkPct:0.10,debuffDefPct:0,ctrl:'',ctrlChance:0,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:1,duration:10,desc:'残血时大幅提升防御并使敌方命中下降'},
      huogong:{id:'huogong',name:'火攻',type:'主动',school:'谋略',target:'foe_all',prep:0,cd:2,rate:45,dmgPct:0.80,dmgSchool:'谋略',healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.08,ctrl:'',ctrlChance:0,dotPct:0.12,dotSchool:'fire',stealPct:0,reflect:0,immuneCtrl:0,duration:2,desc:'火系伤害翻倍并点燃地形施加灼烧'},
      yingshi:{id:'yingshi',name:'鹰视',type:'主动',school:'谋略',target:'foe_all',prep:0,cd:2,rate:45,dmgPct:0,healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.12,ctrl:'shock',ctrlChance:0.40,dotPct:0,dotSchool:'',stealPct:0.12,reflect:0,immuneCtrl:0,duration:2,desc:'持续偷取敌军属性并削弱'},
      wushuang:{id:'wushuang',name:'无双',type:'主动',school:'兵刃',target:'foe_top',prep:0,cd:2,rate:50,dmgPct:1.50,dmgSchool:'兵刃',healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.12,ctrl:'',ctrlChance:0,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:0,duration:0,desc:'极高兵刃爆发，但自身易被混乱'},
      baibu:{id:'baibu',name:'百步',type:'主动',school:'兵刃',target:'foe_top',prep:0,cd:2,rate:50,dmgPct:1.10,dmgSchool:'兵刃',healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.20,ctrl:'',ctrlChance:0,dotPct:0,dotSchool:'',stealPct:0,reflect:0,immuneCtrl:0,duration:2,desc:'远程暴击并破防'},
      shaolian:{id:'shaolian',name:'火烧连营',type:'主动',school:'谋略',target:'foe_all',prep:0,cd:2,rate:45,dmgPct:0.70,dmgSchool:'谋略',healPct:0,buffAtkPct:0,buffDefPct:0,buffMorale:0,debuffAtkPct:0,debuffDefPct:-0.06,ctrl:'',ctrlChance:0,dotPct:0.15,dotSchool:'fire',stealPct:0,reflect:0,immuneCtrl:0,duration:3,desc:'火攻蔓延且施加灼烧'}
    },
    /* —— 兵种克制 + 地形适性 —— */
    TROOPS: {
      步:{name:'步兵',beat:'弓',fieldCol:'inf',siegeBonus:1.0},
      骑:{name:'骑兵',beat:'步',fieldCol:'cav',siegeBonus:1.0},
      弓:{name:'弓兵',beat:'骑',fieldCol:'arch',siegeBonus:1.0},
      车:{name:'车兵',beat:'',fieldCol:'eng',siegeBonus:1.3},
      械:{name:'器械',beat:'',fieldCol:'eng',siegeBonus:1.6}
    },
    /* —— 阵营羁绊 —— */
    FACTIONS: {
      魏:{name:'魏',bondAtkPct:0.08,bondDefPct:0.05,bondRate:0.05},
      蜀:{name:'蜀',bondAtkPct:0.08,bondDefPct:0.05,bondRate:0.05},
      吴:{name:'吴',bondAtkPct:0.08,bondDefPct:0.05,bondRate:0.05},
      群:{name:'群',bondAtkPct:0.06,bondDefPct:0.04,bondRate:0.04}
    },
    /* —— 武将缘分 —— */
    BONDS: {
      taoyuan:{name:'桃园结义',members:['liu1','guan1','zhang1'],atkPct:0.10,rate:0.08},
      wuhu:{name:'五虎上将',members:['guan1','zhang1','zhao1','huang1'],atkPct:0.06,rate:0.05},
      dongwu:{name:'东吴都督',members:['zhou1','lu1'],atkPct:0.08,rate:0.06},
      weiwu:{name:'魏武雄略',members:['cao1','sima1'],atkPct:0.07,rate:0.05}
    },
    /* —— 宝物（武/谋/防/速/辅；force/intellect/leadership/speed/def） —— */
    TREASURES: {},
    /* —— 战法书「残卷」标记：generalId -> { skillId: true }（4★ 拆解产出，装配效果 ×0.9） —— */
    WEAK: {},
    /* —— M2 州郡元表（13 州定义 + 州府坐标 + 资源旗），reload 时由 regions.csv 覆盖 —— */
    REGIONS: {
      ji:{id:'ji',name:'冀州',color:'#c0504d',cx:60,cy:8,resource:false},
      you:{id:'you',name:'幽州',color:'#6a5acd',cx:64,cy:2,resource:false},
      bing:{id:'bing',name:'并州',color:'#4a8f8f',cx:52,cy:4,resource:false},
      qing:{id:'qing',name:'青州',color:'#3cb371',cx:66,cy:16,resource:false},
      yan:{id:'yan',name:'兖州',color:'#d98841',cx:54,cy:18,resource:false},
      xu:{id:'xu',name:'徐州',color:'#c0508d',cx:64,cy:26,resource:false},
      sili:{id:'sili',name:'司隶',color:'#b0b0b0',cx:46,cy:20,resource:false},
      yu:{id:'yu',name:'豫州',color:'#8fbc4a',cx:54,cy:30,resource:false},
      jing:{id:'jing',name:'荆州',color:'#4f9bd6',cx:48,cy:38,resource:false},
      yang:{id:'yang',name:'扬州',color:'#e0b050',cx:62,cy:42,resource:true},
      yi:{id:'yi',name:'益州',color:'#5fae6a',cx:34,cy:40,resource:true},
      liang:{id:'liang',name:'凉州',color:'#a0522d',cx:20,cy:20,resource:false},
      jiao:{id:'jiao',name:'交州',color:'#9b6db0',cx:56,cy:52,resource:false}
    }
  };

  // 可变 state：热加载时只重赋值属性，不换对象 → 所有引用保持有效
  const state = {
    TERRAIN:   DEFAULTS.TERRAIN,
    WEATHER:   DEFAULTS.WEATHER,
    SEASON:    DEFAULTS.SEASON,
    FORMATIONS:DEFAULTS.FORMATIONS,
    GENERALS:  DEFAULTS.GENERALS,
    SKILLS:    DEFAULTS.SKILLS,
    TROOPS:    DEFAULTS.TROOPS,
    FACTIONS:  DEFAULTS.FACTIONS,
    BONDS:     DEFAULTS.BONDS,
    TREASURES: DEFAULTS.TREASURES,
    WEAK:      DEFAULTS.WEAK,
    REGIONS:   DEFAULTS.REGIONS
  };

  /* ---------- CSV 解析 / 转换 ---------- */
  function num(v, d) { const n = parseFloat(v); return isNaN(n) ? (d || 0) : n; }
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/); if (!lines.length) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const out = [];
    for (let i = 1; i < lines.length; i++) { const line = lines[i]; if (!line.trim()) continue;
      const vals = line.split(','); const o = {}; headers.forEach((h, j) => o[h] = (vals[j] !== undefined ? vals[j].trim() : '')); out.push(o); }
    return out;
  }
  function toTerrain(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,color:r.color,move:num(r.move,1),atk:num(r.atk,1),def:num(r.def,1),cav:num(r.cav,1),inf:num(r.inf,1),arch:num(r.arch,1),eng:num(r.eng,1),scout:num(r.scout,1),ambush:num(r.ambush,0),flood:num(r.flood,0),choke:num(r.choke,0),marchDmg:num(r.marchDmg,0)}; }); return o; }
  function toWeather(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,move:num(r.move,1),atk:num(r.atk,1),def:num(r.def,1),fire:num(r.fire,1),cav:num(r.cav,1),scout:num(r.scout,1),flood:num(r.flood,0),morale:num(r.morale,0)}; }); return o; }
  function toSeason(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,grain:num(r.grain,1),w:{rain:num(r.rain,1),sun:num(r.sun,1),fog:num(r.fog,1),snow:num(r.snow,1),wind:num(r.wind,1),drought:num(r.drought,1)}}; }); return o; }
  function toFormations(rows){ const o={}; rows.forEach(r=>{ o[r.key]={name:r.name,atk:num(r.atk,1),def:num(r.def,1),morale:num(r.morale,1),flank:num(r.flank,1),reqInt:num(r.reqInt,0)}; }); return o; }
  function toGenerals(rows){ return rows.map(r=>({id:r.id,name:r.name,star:num(r.star,4),force:num(r.force,80),intellect:num(r.intellect,80),leadership:num(r.leadership,80),speed:num(r.speed,70),style:r.style,trait:r.trait,troop:r.troop,suit:r.suit,skill:r.skill,skillDesc:r.skillDesc,
    faction:r.faction||'群', skills:(r.skills? r.skills.split(/[;,]/).map(s=>s.trim()).filter(Boolean):[]), level:num(r.level,1)})); }
  function toSkills(rows){ const o={}; rows.forEach(r=>{ o[r.id]={id:r.id,name:r.name,type:r.type,school:r.school,target:r.target,prep:num(r.prep,0),cd:num(r.cd,0),rate:num(r.rate,0),
    dmgPct:num(r.dmgPct,0),dmgSchool:r.dmgSchool||'兵刃',healPct:num(r.healPct,0),buffAtkPct:num(r.buffAtkPct,0),buffDefPct:num(r.buffDefPct,0),buffMorale:num(r.buffMorale,0),
    debuffAtkPct:num(r.debuffAtkPct,0),debuffDefPct:num(r.debuffDefPct,0),ctrl:r.ctrl||'',ctrlChance:num(r.ctrlChance,0),dotPct:num(r.dotPct,0),dotSchool:r.dotSchool||'',
    stealPct:num(r.stealPct,0),reflect:num(r.reflect,0),immuneCtrl:num(r.immuneCtrl,0),duration:num(r.duration,0),desc:r.desc}; }); return o; }
  function toTroops(rows){ const o={}; rows.forEach(r=>{ o[r.id]={name:r.name,beat:r.beat||'',fieldCol:r.fieldCol||'inf',siegeBonus:num(r.siegeBonus,1)}; }); return o; }
  function toFactions(rows){ const o={}; rows.forEach(r=>{ o[r.id]={name:r.name,bondAtkPct:num(r.bondAtkPct,0),bondDefPct:num(r.bondDefPct,0),bondRate:num(r.bondRate,0)}; }); return o; }
  function toBonds(rows){ const o={}; rows.forEach(r=>{ o[r.id]={name:r.name,members:(r.members? r.members.split(/[;]/).map(s=>s.trim()).filter(Boolean):[]),atkPct:num(r.atkPct,0),rate:num(r.rate,0),desc:r.desc}; }); return o; }
  function toTreasures(rows){ return rows.reduce((o, r) => { o[r.id] = { id:r.id, name:r.name, slot:r.slot, stat:r.stat, bonusPct:num(r.bonusPct,0), desc:r.desc }; return o; }, {}); }
  function toRegions(rows){ const o={}; rows.forEach(r=>{ o[r.id]={id:r.id,name:r.name,color:r.color,cx:num(r.cx,0),cy:num(r.cy,0),resource:r.resource==='true'||r.resource===true}; }); return o; }

  // 用解析后的 CSV 覆盖内置数据（热加载）
  function reload(cfg) {
    if (cfg.terrain)   state.TERRAIN    = toTerrain(cfg.terrain);
    if (cfg.weather)   state.WEATHER    = toWeather(cfg.weather);
    if (cfg.season)    state.SEASON     = toSeason(cfg.season);
    if (cfg.formations)state.FORMATIONS = toFormations(cfg.formations);
    if (cfg.generals)  state.GENERALS   = toGenerals(cfg.generals);
    if (cfg.skills)    state.SKILLS     = toSkills(cfg.skills);
    if (cfg.troops)    state.TROOPS     = toTroops(cfg.troops);
    if (cfg.factions)  state.FACTIONS   = toFactions(cfg.factions);
    if (cfg.bonds)     state.BONDS      = toBonds(cfg.bonds);
    if (cfg.treasures) state.TREASURES  = toTreasures(cfg.treasures);
    if (cfg.regions)   state.REGIONS    = toRegions(cfg.regions);
    return true;
  }
  // 浏览器：从 data/ 拉取 CSV 并热加载（file:// 下 fetch 失败则 Demo 回退内置默认）
  async function loadConfigFromServer(base) {
    base = base || 'data/';
    const files = {terrain:'terrain.csv',weather:'weather.csv',season:'season.csv',formations:'formations.csv',generals:'generals.csv',
                   skills:'skills.csv',troops:'troops.csv',factions:'factions.csv',bonds:'bonds.csv',treasures:'treasures.csv',regions:'regions.csv'};
    const cfg = {};
    for (const k in files) { const res = await fetch(base + files[k]); if (!res.ok) throw new Error('缺少 ' + files[k]); cfg[k] = parseCSV(await res.text()); }
    reload(cfg); return cfg;
  }
  // Node：从目录同步读取全部 CSV 并热加载（调平衡/校验用，等价于浏览器版 loadConfigFromServer）
  function loadCSVFromDir(dir) {
    const fs = (typeof require !== 'undefined') ? require('fs') : null;
    if (!fs) throw new Error('loadCSVFromDir 仅 Node 环境可用');
    const files = {terrain:'terrain.csv',weather:'weather.csv',season:'season.csv',formations:'formations.csv',generals:'generals.csv',
                   skills:'skills.csv',troops:'troops.csv',factions:'factions.csv',bonds:'bonds.csv',treasures:'treasures.csv',regions:'regions.csv'};
    const cfg = {};
    for (const k in files) { cfg[k] = parseCSV(fs.readFileSync(dir + '/' + files[k], 'utf8')); }
    return reload(cfg);
  }

  return { state, DEFAULTS, num, parseCSV, reload, loadConfigFromServer, loadCSVFromDir };
});
