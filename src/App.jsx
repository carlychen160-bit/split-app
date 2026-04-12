import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc as fsDoc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";

const T = {
  bg:"#FFFDF5", bgCard:"#FFFFFF", yellow:"#FFE566", yellowDk:"#D4A017",
  yellowLt:"#FFF3B0", yellowMd:"#FFD54F", accent:"#FF6B4A", green:"#3DAA6F",
  text:"#3D2E1E", textSub:"#8C7A6B", textMute:"#C4B09A",
  border:"#F0E4C0", shadow:"0 2px 10px rgba(180,130,40,0.10)", shadowMd:"0 4px 18px rgba(180,130,40,0.15)",
};

const DEFAULT_CATS = [
  {id:"food",icon:"Ã°ÂÂÂ",label:"Ã©Â¤ÂÃ©Â£Â²"},{id:"snack",icon:"Ã°ÂÂ§Â",label:"Ã©Â£Â²Ã¦ÂÂÃ¥Â°ÂÃ©Â£Â"},
  {id:"transport",icon:"Ã°ÂÂÂ",label:"Ã¤ÂºÂ¤Ã©ÂÂ"},{id:"hotel",icon:"Ã°ÂÂÂ¨",label:"Ã¤Â½ÂÃ¥Â®Â¿"},
  {id:"spot",icon:"Ã°ÂÂÂ¡",label:"Ã¦ÂÂ¯Ã©Â»Â"},{id:"shop",icon:"Ã°ÂÂÂÃ¯Â¸Â",label:"Ã¨Â³Â¼Ã§ÂÂ©"},
  {id:"grocery",icon:"Ã°ÂÂÂ",label:"Ã¨Â¶ÂÃ¥Â¸Â"},{id:"fuel",icon:"Ã¢ÂÂ½",label:"Ã¦Â²Â¹Ã©ÂÂ¢"},
  {id:"parking",icon:"Ã°ÂÂÂ¿Ã¯Â¸Â",label:"Ã¥ÂÂÃ¨Â»Â"},{id:"ticket",icon:"Ã°ÂÂÂÃ¯Â¸Â",label:"Ã§Â¥Â¨Ã¥ÂÂ¸"},
  {id:"medical",icon:"Ã°ÂÂÂ",label:"Ã©ÂÂ«Ã¨ÂÂ¥"},{id:"misc",icon:"Ã°ÂÂÂ¦",label:"Ã©ÂÂÃ¦ÂÂ¯"},
];

const getCat = (id, cats) => {
  const list = cats || DEFAULT_CATS;
  return list.find(c=>c.id===id) || list[list.length-1];
};

const MEMBER_COLORS = ["#E57373","#64B5F6","#81C784","#FFB74D","#BA68C8","#4DB6AC","#F06292","#A1887F","#90A4AE","#DCE775"];

function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function now() { return new Date().toISOString(); }
function fmtDate(d) { const dt=new Date(d+"T00:00:00"); return `${dt.getMonth()+1}Ã¦ÂÂ${dt.getDate()}Ã¦ÂÂ¥`; }
function fmtTs(ts) {
  const d=new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function makeEqual(members, total) {
  const share = total / members.length;
  const r = {}; members.forEach(m => r[m] = share); return r;
}

function calcSplits(mode, data, members, total) {
  if (mode === "equal") return makeEqual(data, total);
  if (mode === "amount") {
    const fixed = {}, equalM = [];
    let fixedSum = 0;
    members.forEach(m => {
      const v = parseFloat(data[m]);
      if (v > 0) { fixed[m] = v; fixedSum += v; } else equalM.push(m);
    });
    const share = equalM.length > 0 ? (total - fixedSum) / equalM.length : 0;
    const r = {...fixed};
    equalM.forEach(m => r[m] = Math.max(0, share));
    return r;
  }
  if (mode === "ratio") {
    let ratioSum = 0;
    const ratios = {};
    members.forEach(m => { const v = parseFloat(data[m])||1; ratios[m]=v; ratioSum+=v; });
    const r = {};
    members.forEach(m => r[m] = (ratios[m]/ratioSum)*total);
    return r;
  }
  return makeEqual(members, total);
}

function minimizeTransfers(balances) {
  const nets = Object.entries(balances).map(([name,{paid,owes}]) => ({name, net: Math.round((paid-owes)*100)/100}));
  const c = nets.filter(x=>x.net>0.01).sort((a,b)=>b.net-a.net).map(x=>({...x}));
  const d = nets.filter(x=>x.net<-0.01).sort((a,b)=>a.net-b.net).map(x=>({...x}));
  const transfers = []; let i=0, j=0;
  while (i<c.length && j<d.length) {
    const amt = Math.min(c[i].net, -d[j].net);
    if (amt > 0.01) transfers.push({from:d[j].name, to:c[i].name, amount:Math.round(amt*100)/100});
    c[i].net -= amt; d[j].net += amt;
    if (Math.abs(c[i].net)<0.01) i++;
    if (Math.abs(d[j].net)<0.01) j++;
  }
  return transfers;
}

function buildInitialGroup() {
  const ALL = ["Ã¥Â®ÂÃ¥Â®Â","Carly","Michael","Chien","Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â","Ã©ÂÂ±Ã¤ÂºÂÃ§ÂÂ"];
  const SG = ["Carly","Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â","Michael","Ã©ÂÂ±Ã¤ÂºÂÃ§ÂÂ"];
  const colors = {"Ã¥Â®ÂÃ¥Â®Â":MEMBER_COLORS[0],"Carly":MEMBER_COLORS[1],"Michael":MEMBER_COLORS[2],"Chien":MEMBER_COLORS[3],"Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â":MEMBER_COLORS[4],"Ã©ÂÂ±Ã¤ÂºÂÃ§ÂÂ":MEMBER_COLORS[5]};
  const yu = (()=>{ const f=180,rem=1716-f,oth=ALL.filter(m=>m!=="Michael"),sh=rem/oth.length,s={}; oth.forEach(m=>s[m]=sh); s["Michael"]=f; return s; })();
  const am = {"Carly":95/6,"Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â":95/6,"Chien":95/3,"Michael":95/3};
  return {
    id:"clearing2026", name:"2026Ã¦Â¸ÂÃ¦ÂÂÃ§Â¯ÂÃ©ÂÂ1/4Ã¥Â³Â¶", code:"CLEAR1",
    adminUser:"Carly", adminPin:"1234", members:ALL, colors, claimedBy:{},
    categories:[...DEFAULT_CATS], payments:[],
    expenses:[
      {id:"e1",name:"Ã¥ÂÂ¨Ã¨ÂÂ¯",category:"grocery",payers:[{name:"Ã¥Â®ÂÃ¥Â®Â",amount:3476}],total:3476,date:"2026-04-02",splits:makeEqual(ALL,3476)},
      {id:"e2",name:"Ã¦Â£ÂºÃ¦ÂÂÃ¦ÂÂ¿",category:"food",payers:[{name:"Carly",amount:155}],total:155,date:"2026-04-02",splits:makeEqual(ALL,155)},
      {id:"e3",name:"Ã¥Â¼Â·Ã¨ÂÂÃ©Â¤Â",category:"food",payers:[{name:"Carly",amount:320}],total:320,date:"2026-04-02",splits:makeEqual(ALL,320)},
      {id:"e4",name:"Ã¦ÂÂAÃ¦Â¼Â«Ã§ÂÂÃ¥ÂÂÃ¥ÂÂ¡Ã¥ÂºÂ",category:"snack",payers:[{name:"Michael",amount:750}],total:750,date:"2026-04-02",splits:makeEqual(SG,750)},
      {id:"e5",name:"Ã¤Â¸ÂÃ§Â¢ÂÃ¥Â°Â",category:"food",payers:[{name:"Michael",amount:1255}],total:1255,date:"2026-04-02",splits:makeEqual(ALL,1255)},
      {id:"e6",name:"Ã¦ÂªÂ¸Ã¦ÂªÂ¬Ã¦Â±Â",category:"snack",payers:[{name:"Michael",amount:60}],total:60,date:"2026-04-02",splits:makeEqual(SG,60)},
      {id:"e7",name:"Ã¤Â½Â³Ã¨ÂÂÃ¥ÂÂ°Ã¦ÂÂÃ¥Â®Â¤",category:"snack",payers:[{name:"Michael",amount:1350}],total:1350,date:"2026-04-02",splits:makeEqual(SG,1350)},
      {id:"e8",name:"Ã¤Â½ÂÃ¥Â®Â¿",category:"hotel",payers:[{name:"Carly",amount:9585}],total:9585,date:"2026-04-02",splits:makeEqual(ALL,9585)},
      {id:"e9",name:"Ã§Â·Â¬Ã§ÂÂ¸Ã¦ÂÂÃ§ÂÂ",category:"food",payers:[{name:"Chien",amount:2320}],total:2320,date:"2026-04-03",splits:makeEqual(ALL,2320)},
      {id:"e10",name:"Ã¦Â²Â¹Ã©ÂÂ¢",category:"fuel",payers:[{name:"Michael",amount:3416}],total:3416,date:"2026-04-03",splits:makeEqual(SG,3416)},
      {id:"e11",name:"Ã¥ÂÂ¨Ã¥Â®Â¶Ã¥ÂÂ°Ã¥Â¡Â",category:"grocery",payers:[{name:"Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â",amount:118}],total:118,date:"2026-04-03",splits:makeEqual(ALL,118)},
      {id:"e12",name:"Ã¨ÂÂ±Ã§ÂÂÃ§Â³Â",category:"snack",payers:[{name:"Carly",amount:310}],total:310,date:"2026-04-04",splits:makeEqual(["Carly","Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â"],310)},
      {id:"e13",name:"Ã¨Â¶ÂÃ¥Â¸Â",category:"grocery",payers:[{name:"Ã¥Â®ÂÃ¥Â®Â",amount:485}],total:485,date:"2026-04-04",splits:makeEqual(ALL,485)},
      {id:"e14",name:"Ã¦Â»Â·Ã¥ÂÂ³",category:"food",payers:[{name:"Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â",amount:645}],total:645,date:"2026-04-04",splits:makeEqual(ALL,645)},
      {id:"e15",name:"Ã¨ÂÂ±Ã¨ÂÂ®Ã¦ÂÂÃ©Â£Â",category:"food",payers:[{name:"Carly",amount:890}],total:890,date:"2026-04-04",splits:makeEqual(ALL,890)},
      {id:"e16",name:"Ã¥ÂÂÃ©ÂÂÃ§ÂÂ§Ã¥Â Â´",category:"spot",payers:[{name:"Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â",amount:1716}],total:1716,date:"2026-04-04",splits:yu,isCustom:true},
      {id:"e17",name:"Ã¥ÂÂÃ©Â¤ÂÃ¨ÂÂ",category:"food",payers:[{name:"Michael",amount:3009}],total:3009,date:"2026-04-04",splits:makeEqual(ALL,3009)},
      {id:"e18",name:"Ã¥ÂÂÃ¥ÂÂ©Ã©ÂºÂµÃ¥ÂÂ",category:"snack",payers:[{name:"Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â",amount:135}],total:135,date:"2026-04-05",splits:makeEqual(ALL,135)},
      {id:"e19",name:"Ã¦ÂµÂ·Ã©Â®Â®Ã©Â¤ÂÃ¥Â»Â³",category:"food",payers:[{name:"Chien",amount:2150}],total:2150,date:"2026-04-05",splits:makeEqual(ALL,2150)},
      {id:"e20",name:"Ã¦ÂÂ¾Ã¨Â¨ÂÃ©ÂºÂ»Ã§Â³Â¬",category:"shop",payers:[{name:"Chien",amount:243}],total:243,date:"2026-04-05",splits:makeEqual(ALL,243)},
      {id:"e21",name:"711Ã§Â¾ÂÃ¥Â¼Â",category:"snack",payers:[{name:"Carly",amount:95}],total:95,date:"2026-04-05",splits:am,isCustom:true},
      {id:"e22",name:"Ã¥ÂÂÃ¨Â»ÂÃ¨Â²Â»",category:"parking",payers:[{name:"Michael",amount:120}],total:120,date:"2026-04-06",splits:makeEqual(SG,120)},
      {id:"e23",name:"7-11Ã©Â£Â¯Ã§Â³Â°",category:"snack",payers:[{name:"Ã©ÂÂ±Ã¤ÂºÂÃ§ÂÂ",amount:55}],total:55,date:"2026-04-06",splits:makeEqual(["Ã©ÂÂ³Ã©ÂÂÃ¥Â®Â","Ã©ÂÂ±Ã¤ÂºÂÃ§ÂÂ"],55)},
      {id:"e24",name:"Ã¦Â¢ÂÃ¥Â­ÂÃ¥ÂÂÃ§ÂÂ¢",category:"shop",payers:[{name:"Chien",amount:400}],total:400,date:"2026-04-04",splits:makeEqual(["Chien","Ã©ÂÂ±Ã¤ÂºÂÃ§ÂÂ"],400)},
    ],
    logs:[{id:"l0",ts:new Date("2026-04-02").toISOString(),user:"Carly",action:"Ã¥Â»ÂºÃ§Â«ÂÃ§Â¾Â¤Ã§ÂµÂ",detail:"Ã¥Â»ÂºÃ§Â«ÂÃ¤ÂºÂÃ§Â¾Â¤Ã§ÂµÂÃ£ÂÂ2026Ã¦Â¸ÂÃ¦ÂÂÃ§Â¯ÂÃ©ÂÂ1/4Ã¥Â³Â¶Ã£ÂÂ"}]
  };
}
// Ã¢ÂÂÃ¢ÂÂ Primitives Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function Avatar({name,color,size=26}) {
  return <div style={{width:size,height:size,borderRadius:"50%",background:color||"#ddd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.12)"}}>{name[0]}</div>;
}

function Card({children,style={},onClick}) {
  return <div onClick={onClick} style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:16,padding:"12px 14px",marginBottom:10,boxShadow:T.shadow,cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}

const iStyle = {width:"100%",padding:"9px 12px",background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,marginBottom:8,boxSizing:"border-box",outline:"none",fontFamily:"inherit"};

function Btn({children,onClick,variant="primary",style={},disabled=false}) {
  const v = {
    primary:{background:T.yellowMd,color:T.text,boxShadow:"0 3px 0 "+T.yellowDk},
    secondary:{background:"#fff",color:T.text,border:`1.5px solid ${T.border}`},
    danger:{background:"#FFF0EE",color:T.accent,border:`1.5px solid ${T.accent}55`},
    ghost:{background:"transparent",color:T.textSub,border:"none",padding:"6px 10px"},
    green:{background:"#43A047",color:"#fff",boxShadow:"0 3px 0 #2E7D32"},
  };
  return <button onClick={disabled?undefined:onClick} style={{padding:"10px 16px",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,...v[variant],...style}}>{children}</button>;
}

// Ã¢ÂÂÃ¢ÂÂ MultiSelect Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function MultiSelect({value,onChange,members,colors}) {
  const [open,setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return () => document.removeEventListener("mousedown",h);
  },[]);
  const toggle = m => { if(value.includes(m)){if(value.length>1)onChange(value.filter(x=>x!==m));}else onChange([...value,m]); };
  const allSel = value.length===members.length;
  const label = allSel ? "Ã¥ÂÂ¨Ã©ÂÂ¨Ã¦ÂÂÃ¥ÂÂ¡" : value.length===0 ? "Ã¨Â«ÂÃ©ÂÂ¸Ã¦ÂÂ" : value.join("Ã£ÂÂ");
  return (
    <div ref={ref} style={{position:"relative",marginBottom:8}}>
      <div onClick={()=>setOpen(!open)} style={{...iStyle,marginBottom:0,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{label}</span>
        <span style={{marginLeft:8,fontSize:10,color:T.textMute}}>{open?"Ã¢ÂÂ²":"Ã¢ÂÂ¼"}</span>
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:300,background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:12,overflow:"hidden",boxShadow:T.shadowMd}}>
          <div onClick={()=>onChange(allSel?[members[0]]:[...members])} style={{padding:"9px 12px",fontSize:12,color:T.textSub,cursor:"pointer",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",background:allSel?T.yellowLt:"#fff"}}>
            <span>Ã¥ÂÂ¨Ã©ÂÂ¨Ã¦ÂÂÃ¥ÂÂ¡</span><span style={{color:T.yellowDk}}>{allSel?"Ã¢ÂÂ":""}</span>
          </div>
          {members.map(m => {
            const sel = value.includes(m); const col = colors[m]||"#aaa";
            return (
              <div key={m} onClick={()=>toggle(m)} style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:sel?T.yellowLt+"88":"#fff",borderBottom:`1px solid ${T.border}44`}}>
                <div style={{width:16,height:16,borderRadius:5,border:`2px solid ${sel?T.yellowDk:T.border}`,background:sel?T.yellowMd:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {sel && <span style={{fontSize:9,color:T.text,fontWeight:900}}>Ã¢ÂÂ</span>}
                </div>
                <Avatar name={m} color={col} size={22}/>
                <span style={{fontSize:13,color:T.text,fontWeight:sel?700:400}}>{m}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Ã¢ÂÂÃ¢ÂÂ Category Picker Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function CategoryPicker({value,onChange,cats}) {
  const [open,setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return () => document.removeEventListener("mousedown",h);
  },[]);
  const cur = getCat(value, cats);
  return (
    <div ref={ref} style={{position:"relative",marginBottom:0}}>
      <div onClick={()=>setOpen(!open)} style={{...iStyle,marginBottom:0,height:42,display:"flex",alignItems:"center",gap:8,cursor:"pointer",boxSizing:"border-box"}}>
        <span style={{fontSize:18}}>{cur.icon}</span>
        <span style={{flex:1,color:T.text}}>{cur.label}</span>
        <span style={{fontSize:10,color:T.textMute}}>{open?"Ã¢ÂÂ²":"Ã¢ÂÂ¼"}</span>
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:300,background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:12,padding:8,boxShadow:T.shadowMd,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
          {cats.map(c => (
            <div key={c.id} onClick={()=>{onChange(c.id);setOpen(false);}} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 4px",borderRadius:10,cursor:"pointer",background:value===c.id?T.yellowLt:"transparent",border:`1.5px solid ${value===c.id?T.yellowMd:"transparent"}`}}>
              <span style={{fontSize:20}}>{c.icon}</span>
              <span style={{fontSize:10,color:T.textSub,marginTop:2,textAlign:"center"}}>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// Ã¢ÂÂÃ¢ÂÂ Split Editor Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function SplitEditor({mode,setMode,data,setData,members,colors,total}) {
  const pt = parseFloat(total)||0;
  const fixedSum = Object.values(data).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const equalCount = members.filter(m=>!(parseFloat(data[m])>0)).length;
  const remainder = pt - fixedSum;
  const sharePerEqual = equalCount>0 ? remainder/equalCount : 0;
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["equal","Ã¥ÂÂÃ¥ÂÂ"],["amount","Ã©ÂÂÃ©Â¡Â"],["ratio","Ã¦Â¯ÂÃ¤Â¾Â"]].map(([k,l]) => (
          <button key={k} onClick={()=>{setMode(k);setData({});}} style={{flex:1,padding:"7px 0",borderRadius:10,border:`1.5px solid ${mode===k?T.yellowDk:T.border}`,background:mode===k?T.yellowLt:"#fff",color:mode===k?T.text:T.textSub,fontSize:12,fontWeight:mode===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>
      {mode==="equal" && (
        <MultiSelect value={Object.keys(data).length?Object.keys(data):members} onChange={sel=>{const d={};sel.forEach(m=>d[m]=1);setData(d);}} members={members} colors={colors}/>
      )}
      {mode==="amount" && (
        <div>
          <div style={{fontSize:11,color:T.textSub,marginBottom:6}}>Ã¨Â¼Â¸Ã¥ÂÂ¥Ã¥ÂÂºÃ¥Â®ÂÃ©ÂÂÃ©Â¡ÂÃ¯Â¼ÂÃ§ÂÂÃ§Â©ÂºÃ¥ÂÂÃ¥ÂÂÃ¥ÂÂÃ¥ÂÂ©Ã©Â¤Â</div>
          {members.map(m => (
            <div key={m} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <Avatar name={m} color={colors[m]||"#aaa"} size={24}/>
              <span style={{fontSize:13,color:T.text,flex:1}}>{m}</span>
              <input type="number" placeholder={sharePerEqual>0&&!(data[m])?`Ã¢ÂÂ${sharePerEqual.toFixed(0)}`:"0"} value={data[m]||""} onChange={e=>setData({...data,[m]:e.target.value})} style={{...iStyle,width:90,marginBottom:0,textAlign:"right"}}/>
            </div>
          ))}
          {pt>0 && <div style={{fontSize:11,color:remainder<-0.01?T.accent:T.green,marginTop:4}}>{remainder<-0.01?`Ã¢ÂÂ Ã¯Â¸Â Ã¨Â¶ÂÃ¥ÂÂº NT$${Math.abs(remainder).toFixed(0)}`:`Ã¥ÂÂ©Ã©Â¤Â NT$${remainder.toFixed(0)} Ã§ÂÂ± ${equalCount} Ã¤ÂºÂºÃ¥ÂÂÃ¥ÂÂ`}</div>}
        </div>
      )}
      {mode==="ratio" && (
        <div>
          <div style={{fontSize:11,color:T.textSub,marginBottom:6}}>Ã¨Â¼Â¸Ã¥ÂÂ¥Ã¦Â¯ÂÃ¤Â¾ÂÃ¯Â¼ÂÃ§ÂÂÃ§Â©ÂºÃ©Â ÂÃ¨Â¨Â­1Ã¯Â¼Â</div>
          {members.map(m => {
            const ratio = parseFloat(data[m])||1;
            const ratioTotal = members.reduce((s,x)=>s+(parseFloat(data[x])||1),0);
            const share = pt>0 ? (ratio/ratioTotal*pt) : 0;
            return (
              <div key={m} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <Avatar name={m} color={colors[m]||"#aaa"} size={24}/>
                <span style={{fontSize:13,color:T.text,flex:1}}>{m}</span>
                <input type="number" placeholder="1" value={data[m]||""} onChange={e=>setData({...data,[m]:e.target.value})} style={{...iStyle,width:60,marginBottom:0,textAlign:"right"}}/>
                <span style={{fontSize:11,color:T.textSub,width:60,textAlign:"right"}}>NT${share.toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Ã¢ÂÂÃ¢ÂÂ Payers Editor Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function PayersEditor({payers,setPayers,members,total}) {
  const paidSum = payers.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const pt = parseFloat(total)||0;
  const diff = pt - paidSum;
  const updatePayer = (i,field,val) => { const n=[...payers]; n[i]={...n[i],[field]:val}; setPayers(n); };
  const addPayer = () => { const used=payers.map(p=>p.name); const next=members.find(m=>!used.includes(m)); if(next) setPayers([...payers,{name:next,amount:""}]); };
  const removePayer = i => { if(payers.length>1) setPayers(payers.filter((_,idx)=>idx!==i)); };
  return (
    <div style={{marginBottom:8}}>
      {payers.map((p,i) => (
        <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
          <select value={p.name} onChange={e=>updatePayer(i,"name",e.target.value)} style={{...iStyle,flex:1,marginBottom:0,padding:"7px 8px"}}>
            {members.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" placeholder="Ã©ÂÂÃ©Â¡Â" value={p.amount} onChange={e=>updatePayer(i,"amount",e.target.value)} style={{...iStyle,width:90,marginBottom:0,textAlign:"right"}}/>
          {payers.length>1 && <button onClick={()=>removePayer(i)} style={{background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:16,padding:"0 2px"}}>Ã¢ÂÂ</button>}
        </div>
      ))}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
        <button onClick={addPayer} style={{background:"none",border:`1.5px dashed ${T.border}`,borderRadius:8,padding:"5px 10px",fontSize:12,color:T.textSub,cursor:"pointer"}}>Ã¯Â¼Â Ã¥ÂÂ Ã¤Â»ÂÃ¦Â¬Â¾Ã¤ÂºÂº</button>
        <span style={{fontSize:11,color:Math.abs(diff)>0.01?T.accent:T.green}}>{pt>0&&(Math.abs(diff)>0.01?`Ã¢ÂÂ Ã¯Â¸Â Ã¥Â·Â® NT$${Math.abs(diff).toFixed(0)}`:"Ã¢ÂÂ Ã©ÂÂÃ©Â¡ÂÃ¦Â­Â£Ã§Â¢Âº")}</span>
      </div>
    </div>
  );
}
// Ã¢ÂÂÃ¢ÂÂ Expense Form Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function ExpenseForm({initial,members,colors,cats,onSave,onCancel,onDelete}) {
  const [name,setName] = useState(initial.name||"");
  const [total,setTotal] = useState(initial.total||"");
  const [date,setDate] = useState(initial.date||new Date().toISOString().slice(0,10));
  const [category,setCategory] = useState(initial.category||"food");
  const [payers,setPayers] = useState(initial.payers||[{name:members[0],amount:""}]);
  const [splitMode,setSplitMode] = useState(initial.splitMode||"equal");
  const [splitData,setSplitData] = useState(initial.splitData||{});
  function handleSave() {
    if(!name||!total) return;
    const pt = parseFloat(total);
    const splitMembers = splitMode==="equal" ? (Object.keys(splitData).length?Object.keys(splitData):members) : members;
    const splits = calcSplits(splitMode, splitMode==="equal"?splitMembers:splitData, splitMembers, pt);
    const paidSum = payers.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
    if(Math.abs(paidSum-pt)>0.1){alert(`Ã¤Â»ÂÃ¦Â¬Â¾Ã©ÂÂÃ©Â¡ÂÃ¥ÂÂ Ã§Â¸Â½ NT$${paidSum} Ã¨ÂÂÃ§Â¸Â½Ã©ÂÂÃ©Â¡Â NT$${pt} Ã¤Â¸ÂÃ§Â¬Â¦`);return;}
    onSave({name,total:pt,date,category,payers:payers.map(p=>({name:p.name,amount:parseFloat(p.amount)||0})),splits,splitMode,splitData});
  }
  const handleTotalChange = (val) => {
    setTotal(val);
    if(payers.length===1) setPayers([{...payers[0], amount:val}]);
  };
  return (
    <div style={{background:"#fff",borderRadius:20,padding:"16px 14px 12px",marginBottom:12,boxShadow:"0 4px 20px rgba(180,130,40,0.13)"}}>
      <div style={{fontSize:11,color:T.yellowDk,fontWeight:700,marginBottom:10}}>{onDelete?"Ã¢ÂÂÃ¯Â¸Â Ã§Â·Â¨Ã¨Â¼Â¯Ã¦Â¶ÂÃ¨Â²Â»":"Ã°ÂÂ§Â¾ Ã¦ÂÂ°Ã¥Â¢ÂÃ¦Â¶ÂÃ¨Â²Â»"}</div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input placeholder="Ã©Â ÂÃ§ÂÂ®Ã¥ÂÂÃ§Â¨Â±" value={name} onChange={e=>setName(e.target.value)}
          style={{...iStyle,flex:1,marginBottom:0,fontSize:15,fontWeight:700,textAlign:"center",height:42}}/>
        <input type="number" placeholder="Ã§Â¸Â½Ã©ÂÂÃ©Â¡Â" value={total} onChange={e=>handleTotalChange(e.target.value)}
          style={{...iStyle,flex:1,marginBottom:0,fontSize:15,fontWeight:800,textAlign:"center",color:T.text,height:42}}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <div style={{flex:1}}><CategoryPicker value={category} onChange={setCategory} cats={cats}/></div>
        <div style={{flex:1,display:"flex"}}><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...iStyle,marginBottom:0,flex:1,minHeight:40}}/></div>
      </div>
      <div style={{background:"#FFF8E1",border:`1.5px solid ${T.yellowLt}`,borderRadius:12,padding:"10px 12px",marginBottom:6}}>
        <div style={{fontSize:10,color:T.yellowDk,fontWeight:700,marginBottom:6}}>Ã¤Â»ÂÃ¦Â¬Â¾Ã¤ÂºÂº</div>
        <PayersEditor payers={payers} setPayers={setPayers} members={members} total={total}/>
      </div>
      <div style={{background:"#F3F8FF",border:"1.5px solid #BBDEFB",borderRadius:12,padding:"10px 12px",marginBottom:10}}>
        <div style={{fontSize:10,color:"#1565C0",fontWeight:700,marginBottom:6}}>Ã¥ÂÂÃ¥Â¸Â³Ã¦ÂÂ¹Ã¥Â¼Â</div>
        <SplitEditor mode={splitMode} setMode={setSplitMode} data={splitData} setData={setSplitData} members={members} colors={colors} total={total}/>
      </div>
      <div style={{display:"flex",gap:6,justifyContent:"flex-end",alignItems:"center"}}>
        {onDelete && <button onClick={onDelete} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",padding:"4px 6px",opacity:0.5}}>Ã°ÂÂÂÃ¯Â¸Â</button>}
        <button onClick={onCancel} style={{padding:"6px 14px",background:"none",border:`1.5px solid ${T.border}`,borderRadius:20,color:T.textSub,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Ã¥ÂÂÃ¦Â¶Â</button>
        <button onClick={handleSave} style={{padding:"6px 18px",background:T.yellowMd,border:"none",borderRadius:20,color:T.text,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 0 "+T.yellowDk}}>{onDelete?"Ã°ÂÂÂ¾":"Ã¢ÂÂ"}</button>
      </div>
    </div>
  );
}

// Ã¢ÂÂÃ¢ÂÂ Payment Form Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function PaymentForm({members,me,onSave,onCancel,onDelete,initial,isEdit}) {
  const [form,setForm] = useState(initial||{from:me,to:members.find(m=>m!==me)||members[0],amount:"",date:new Date().toISOString().slice(0,10),note:""});
  function handleSave() {
    if(!form.amount||parseFloat(form.amount)<=0){alert("Ã¨Â«ÂÃ¨Â¼Â¸Ã¥ÂÂ¥Ã¨Â½ÂÃ¥Â¸Â³Ã©ÂÂÃ©Â¡Â");return;}
    if(form.from===form.to){alert("Ã¨Â½ÂÃ¥ÂÂºÃ¥ÂÂÃ¦ÂÂ¶Ã¦Â¬Â¾Ã¤Â¸ÂÃ¨ÂÂ½Ã¦ÂÂ¯Ã¥ÂÂÃ¤Â¸ÂÃ¤ÂºÂº");return;}
    onSave({...form,amount:parseFloat(form.amount)});
  }
  return (
    <div style={{background:"#F1FBF4",border:"1.5px solid #A5D6A7",borderRadius:16,padding:14,marginBottom:12,boxShadow:T.shadow}}>
      <div style={{fontSize:12,color:"#2E7D32",fontWeight:700,marginBottom:10}}>{isEdit?"Ã¢ÂÂÃ¯Â¸Â Ã§Â·Â¨Ã¨Â¼Â¯Ã¨Â½ÂÃ¥Â¸Â³":"Ã°ÂÂÂ¸ Ã¨Â¨ÂÃ©ÂÂÃ¨Â½ÂÃ¥Â¸Â³"}</div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>Ã¨Â½ÂÃ¥ÂÂº</div>
          <select value={form.from} onChange={e=>setForm({...form,from:e.target.value})} style={iStyle}>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
        </div>
        <div style={{fontSize:20,color:T.textMute,paddingTop:16}}>Ã¢ÂÂ</div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>Ã¦ÂÂ¶Ã¦Â¬Â¾</div>
          <select value={form.to} onChange={e=>setForm({...form,to:e.target.value})} style={iStyle}>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
        </div>
      </div>
      <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>Ã©ÂÂÃ©Â¡Â</div>
      <input type="number" placeholder="NT$" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={iStyle}/>
      <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>Ã¦ÂÂ¥Ã¦ÂÂ</div>
      <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={iStyle}/>
      <input placeholder="Ã¥ÂÂÃ¨Â¨Â»Ã¯Â¼ÂÃ©ÂÂ¸Ã¥Â¡Â«Ã¯Â¼Â" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} style={iStyle}/>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <Btn onClick={handleSave} variant="green" style={{flex:1}}>{isEdit?"Ã°ÂÂÂ¾ Ã¥ÂÂ²Ã¥Â­Â":"Ã¢ÂÂ Ã§Â¢ÂºÃ¨ÂªÂ"}</Btn>
        <Btn onClick={onCancel} variant="secondary" style={{flex:1}}>Ã¥ÂÂÃ¦Â¶Â</Btn>
        {onDelete && <Btn onClick={onDelete} variant="danger">Ã°ÂÂÂÃ¯Â¸Â</Btn>}
      </div>
    </div>
  );
}
// Ã¢ÂÂÃ¢ÂÂ Analytics Tab Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function AnalyticsTab({expenses,members,colors,cats,me}) {
  const [viewMode,setViewMode] = useState("personal");
  const [viewMember,setViewMember] = useState(me);
  const [selectedCat,setSelectedCat] = useState(null);
  const catSpend = {};
  cats.forEach(c=>catSpend[c.id]=0);
  if(viewMode==="personal") {
    expenses.forEach(e => { catSpend[e.category||"misc"]=(catSpend[e.category||"misc"]||0)+(e.splits[viewMember]||0); });
  } else {
    expenses.forEach(e => { catSpend[e.category||"misc"]=(catSpend[e.category||"misc"]||0)+Object.values(e.splits).reduce((s,v)=>s+v,0); });
  }
  const total = Object.values(catSpend).reduce((s,v)=>s+v,0);
  const active = cats.filter(c=>catSpend[c.id]>0.01).sort((a,b)=>catSpend[b.id]-catSpend[a.id]);
  const PIE = ["#FFD54F","#FF8A65","#64B5F6","#81C784","#BA68C8","#4DB6AC","#F06292","#A1887F","#90A4AE","#DCE775","#FFB74D","#E57373"];
  const cx=110,cy=110,r=82,ir=46;
  let sa=-Math.PI/2;
  const slices = active.map((c,i) => {
    const pct=catSpend[c.id]/total, angle=pct*2*Math.PI;
    const x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa),x2=cx+r*Math.cos(sa+angle),y2=cy+r*Math.sin(sa+angle);
    const ix1=cx+ir*Math.cos(sa),iy1=cy+ir*Math.sin(sa),ix2=cx+ir*Math.cos(sa+angle),iy2=cy+ir*Math.sin(sa+angle);
    const lg=angle>Math.PI?1:0;
    const path=`M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${lg},1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${lg},0 ${ix1},${iy1} Z`;
    sa+=angle;
    return {path,color:PIE[i%PIE.length],pct,cat:c};
  });
  const selCat = selectedCat ? cats.find(c=>c.id===selectedCat) : null;
  const dispTotal = selCat ? catSpend[selCat.id] : total;
  const col = colors[viewMember]||"#aaa";
  return (
    <div>
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {[["personal","Ã°ÂÂÂ¤ Ã¥ÂÂÃ¤ÂºÂº"],["group","Ã°ÂÂÂ¥ Ã§Â¾Â¤Ã§ÂµÂ"]].map(([k,l]) => (
            <button key={k} onClick={()=>{setViewMode(k);setSelectedCat(null);}} style={{flex:1,padding:"8px 0",borderRadius:10,border:`1.5px solid ${viewMode===k?T.yellowDk:T.border}`,background:viewMode===k?T.yellowLt:"#fff",color:viewMode===k?T.text:T.textSub,fontSize:13,fontWeight:viewMode===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        {viewMode==="personal" && (
          <select value={viewMember} onChange={e=>{setViewMember(e.target.value);setSelectedCat(null);}} style={{width:"100%",background:col+"18",border:`1.5px solid ${col}44`,color:col,borderRadius:10,padding:"7px 12px",fontSize:13,fontWeight:700,cursor:"pointer",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}>
            {members.map(m=><option key={m} value={m} style={{background:"#fff",color:T.text}}>{m}{m===me?" Ã¯Â¼ÂÃ¦ÂÂÃ¯Â¼Â":""}</option>)}
          </select>
        )}
      </div>
      {total===0 && <div style={{textAlign:"center",color:T.textMute,padding:40}}>Ã¥Â°ÂÃ§ÂÂ¡Ã¦Â¶ÂÃ¨Â²Â»Ã¨Â³ÂÃ¦ÂÂ</div>}
      {total>0 && (
        <>
          <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
            <svg width={220} height={220} style={{overflow:"visible"}}>
              {slices.map((s,i) => (
                <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2} style={{cursor:"pointer",opacity:selectedCat&&selectedCat!==s.cat.id?0.35:1,transition:"opacity 0.2s"}} onClick={()=>setSelectedCat(selectedCat===s.cat.id?null:s.cat.id)}/>
              ))}
              <circle cx={cx} cy={cy} r={ir-2} fill={viewMode==="group"?T.yellowMd:col} opacity={0.15}/>
              <text x={cx} y={cy-10} textAnchor="middle" fontSize={20}>{viewMode==="group"?"Ã°ÂÂÂ¥":viewMember[0]}</text>
              <text x={cx} y={cy+6} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.text}>NT${dispTotal.toFixed(0)}</text>
              <text x={cx} y={cy+18} textAnchor="middle" fontSize={9} fill={T.textMute}>{selCat?selCat.label:viewMode==="group"?"Ã§Â¾Â¤Ã§ÂµÂÃ§Â¸Â½Ã¦Â¶ÂÃ¨Â²Â»":"Ã§Â¸Â½Ã¦Â¶ÂÃ¨Â²Â»"}</text>
            </svg>
          </div>
          <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:600}}>
            {selCat?`${selCat.icon} ${selCat.label}`:"Ã¥ÂÂÃ¥ÂÂÃ©Â¡ÂÃ¦ÂÂÃ§Â´Â°"}
            {selCat && <button onClick={()=>setSelectedCat(null)} style={{marginLeft:8,background:"none",border:"none",color:T.textMute,fontSize:11,cursor:"pointer"}}>Ã¢ÂÂ Ã¦Â¸ÂÃ©ÂÂ¤</button>}
          </div>
          {(selCat?[selCat]:active).map((c,i) => {
            const amt=catSpend[c.id], pct=total>0?amt/total:0;
            const sc=slices.find(s=>s.cat.id===c.id)?.color||PIE[i%PIE.length];
            return (
              <div key={c.id} onClick={()=>setSelectedCat(selectedCat===c.id?null:c.id)} style={{marginBottom:8,cursor:"pointer",padding:"8px 10px",borderRadius:12,background:selectedCat===c.id?T.yellowLt:"transparent",border:`1.5px solid ${selectedCat===c.id?T.yellowMd:"transparent"}`,transition:"all 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{width:28,height:28,borderRadius:8,background:sc+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{c.icon}</div>
                  <span style={{fontSize:13,fontWeight:600,flex:1,color:T.text}}>{c.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:T.text}}>NT${amt.toFixed(0)}</span>
                  <span style={{fontSize:11,color:T.textMute,width:32,textAlign:"right"}}>{(pct*100).toFixed(0)}%</span>
                </div>
                <div style={{height:5,background:T.border,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct*100}%`,background:sc,borderRadius:3,transition:"width 0.4s ease"}}/>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
// Ã¢ÂÂÃ¢ÂÂ Config Tab Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function ConfigTab({group,setGroups,bal,me,setExportModal}) {
  const cats = group.categories||DEFAULT_CATS;
  const [section,setSection] = useState("members");
  const [editing,setEditing] = useState(null);
  const [newCat,setNewCat] = useState({icon:"",label:""});
  const [showAddCat,setShowAddCat] = useState(false);
  const [newMemberName,setNewMemberName] = useState("");
  function saveGroup(updater,detail) {
    setGroups(prev=>prev.map(g=>{
      if(g.id!==group.id) return g;
      const updated=updater(g);
      return {...updated,logs:[{id:uid(),ts:now(),user:group.adminUser,action:"Ã¨Â¨Â­Ã¥Â®ÂÃ¨Â®ÂÃ¦ÂÂ´",detail},...(updated.logs||[])]};
    }));
  }
  function handleEditCat(cat) {
    saveGroup(g=>({...g,categories:g.categories.map(c=>c.id===cat.id?{...c,icon:editing.icon,label:editing.label}:c)}),`Ã¥ÂÂÃ©Â¡ÂÃ£ÂÂ${cat.label}Ã£ÂÂÃ¦ÂÂ¹Ã§ÂÂºÃ£ÂÂ${editing.icon} ${editing.label}Ã£ÂÂ`);
    setEditing(null);
  }
  function handleDeleteCat(cat) {
    if(cats.length<=3){alert("Ã¨ÂÂ³Ã¥Â°ÂÃ¤Â¿ÂÃ§ÂÂ 3 Ã¥ÂÂÃ¥ÂÂÃ©Â¡Â");return;}
    saveGroup(g=>({...g,categories:g.categories.filter(c=>c.id!==cat.id)}),`Ã¥ÂÂªÃ©ÂÂ¤Ã¥ÂÂÃ©Â¡ÂÃ£ÂÂ${cat.label}Ã£ÂÂ`);
  }
  function handleAddCat() {
    if(!newCat.icon||!newCat.label) return;
    saveGroup(g=>({...g,categories:[...(g.categories||DEFAULT_CATS),{id:uid(),...newCat}]}),`Ã¦ÂÂ°Ã¥Â¢ÂÃ¥ÂÂÃ©Â¡ÂÃ£ÂÂ${newCat.icon} ${newCat.label}Ã£ÂÂ`);
    setNewCat({icon:"",label:""}); setShowAddCat(false);
  }
  function handleAddMember() {
    const name=newMemberName.trim();
    if(!name||group.members.includes(name)) return;
    const used=Object.values(group.colors||{});
    const color=MEMBER_COLORS.find(c=>!used.includes(c))||MEMBER_COLORS[0];
    saveGroup(g=>({...g,members:[...g.members,name],colors:{...g.colors,[name]:color}}),`Ã¦ÂÂ°Ã¥Â¢ÂÃ¦ÂÂÃ¥ÂÂ¡Ã£ÂÂ${name}Ã£ÂÂ`);
    setNewMemberName("");
  }
  function handleRemoveMember(name) {
    const net=(bal[name]?.paid||0)-(bal[name]?.owes||0);
    if(Math.abs(net)>0.01){alert(`${name} Ã©ÂÂÃ¦ÂÂÃ¦ÂÂªÃ§ÂµÂÃ¦Â¸ÂÃ¥Â¸Â³Ã¦Â¬Â¾Ã¯Â¼ÂÃ§ÂÂ¡Ã¦Â³ÂÃ§Â§Â»Ã©ÂÂ¤`);return;}
    if(group.members.length<=2){alert("Ã§Â¾Â¤Ã§ÂµÂÃ¨ÂÂ³Ã¥Â°ÂÃ©ÂÂÃ¨Â¦Â 2 Ã¤Â½ÂÃ¦ÂÂÃ¥ÂÂ¡");return;}
    saveGroup(g=>({...g,members:g.members.filter(m=>m!==name)}),`Ã§Â§Â»Ã©ÂÂ¤Ã¦ÂÂÃ¥ÂÂ¡Ã£ÂÂ${name}Ã£ÂÂ`);
  }
  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["members","Ã°ÂÂÂ¥ Ã¦ÂÂÃ¥ÂÂ¡"],["categories","Ã°ÂÂÂ·Ã¯Â¸Â Ã¥ÂÂÃ©Â¡Â"]].map(([k,l]) => (
          <button key={k} onClick={()=>setSection(k)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${section===k?T.yellowDk:T.border}`,background:section===k?T.yellowLt:"#fff",color:section===k?T.text:T.textSub,fontSize:13,fontWeight:section===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={()=>{const r=exportGroupCSV(group,me);if(r)setExportModal({title:`${group.name} Ã¦ÂÂÃ§Â´Â°`,content:r});}} style={{flex:1,padding:"9px 0",background:"#E3F2FD",border:"1.5px solid #90CAF9",borderRadius:10,color:"#1565C0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ã°ÂÂÂ¥ Ã¥ÂÂ¯Ã¥ÂÂºÃ¦ÂÂÃ§Â´Â° CSV</button>
      </div>
      {section==="members" && (
        <div>
          {group.members.map(m => {
            const col=group.colors[m]||"#aaa", net=(bal[m]?.paid||0)-(bal[m]?.owes||0);
            const canRemove=m!==group.adminUser&&Math.abs(net)<0.01&&group.members.length>2;
            return (
              <Card key={m}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <Avatar name={m} color={col} size={38}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:14,fontWeight:700}}>{m}</span>
                      {m===group.adminUser && <span>Ã°ÂÂÂ</span>}
                      {m===me && <span style={{background:T.yellowLt,color:T.yellowDk,border:`1px solid ${T.yellowMd}`,borderRadius:20,padding:"1px 6px",fontSize:11,fontWeight:700}}>Ã¦ÂÂ</span>}
                    </div>
                    <div style={{fontSize:11,color:T.textMute}}>Ã¦Â¶ÂÃ¨Â²Â» NT${(bal[m]?.owes||0).toFixed(0)} ÃÂ· Ã¥Â¢ÂÃ¤Â»Â NT${(bal[m]?.paid||0).toLocaleString()}</div>
                    {m!==group.adminUser&&group.members.length>2&&Math.abs(net)>0.01 && <div style={{fontSize:10,color:T.accent,marginTop:2}}>Ã°ÂÂÂ¸ Ã¦ÂÂÃ¦ÂÂªÃ§ÂµÂÃ¦Â¸ÂÃ¥Â¸Â³Ã¦Â¬Â¾Ã¯Â¼ÂÃ§ÂÂ¡Ã¦Â³ÂÃ§Â§Â»Ã©ÂÂ¤</div>}
                  </div>
                  {canRemove && <Btn onClick={()=>handleRemoveMember(m)} variant="danger" style={{padding:"5px 10px",fontSize:12}}>Ã§Â§Â»Ã©ÂÂ¤</Btn>}
                </div>
              </Card>
            );
          })}
          <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:14,marginTop:6}}>
            <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:600}}>Ã¢ÂÂ Ã¦ÂÂ°Ã¥Â¢ÂÃ¦ÂÂÃ¤Â¼Â´</div>
            <div style={{display:"flex",gap:8}}>
              <input placeholder="Ã¨Â¼Â¸Ã¥ÂÂ¥Ã¥ÂÂÃ¥Â­Â" value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddMember()} style={{...iStyle,flex:1,marginBottom:0}}/>
              <Btn onClick={handleAddMember} style={{flexShrink:0,padding:"9px 14px"}}>Ã¦ÂÂ°Ã¥Â¢Â</Btn>
            </div>
          </div>
        </div>
      )}
      {section==="categories" && (
        <div>
          {cats.map(cat => (
            <div key={cat.id} style={{marginBottom:8}}>
              {editing?.id===cat.id ? (
                <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:12}}>
                  <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>Ã¥ÂÂÃ§Â¤ÂºÃ¯Â¼ÂÃ¨Â¼Â¸Ã¥ÂÂ¥Ã¤Â»Â»Ã¦ÂÂ emojiÃ¯Â¼Â</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{width:44,height:44,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{editing.icon||"?"}</div>
                    <input value={editing.icon} onChange={e=>setEditing({...editing,icon:e.target.value.slice(-2)||e.target.value.slice(-1)||""})} placeholder="Ã¨Â¼Â¸Ã¥ÂÂ¥ emoji" style={{...iStyle,marginBottom:0,flex:1,fontSize:18}}/>
                  </div>
                  <input value={editing.label} onChange={e=>setEditing({...editing,label:e.target.value})} placeholder="Ã¥ÂÂÃ©Â¡ÂÃ¥ÂÂÃ§Â¨Â±" style={{...iStyle,marginBottom:8}}/>
                  <div style={{display:"flex",gap:6}}>
                    <Btn onClick={()=>handleEditCat(cat)} style={{flex:1,padding:"8px 0"}}>Ã¥ÂÂ²Ã¥Â­Â</Btn>
                    <Btn onClick={()=>setEditing(null)} variant="secondary" style={{flex:1,padding:"8px 0"}}>Ã¥ÂÂÃ¦Â¶Â</Btn>
                  </div>
                </div>
              ) : (
                <div style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.icon}</div>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:T.text}}>{cat.label}</span>
                  <Btn onClick={()=>setEditing({id:cat.id,icon:cat.icon,label:cat.label})} variant="ghost" style={{padding:"4px 8px",fontSize:12}}>Ã¢ÂÂÃ¯Â¸Â</Btn>
                  <Btn onClick={()=>handleDeleteCat(cat)} variant="danger" style={{padding:"4px 8px",fontSize:12}}>Ã°ÂÂÂÃ¯Â¸Â</Btn>
                </div>
              )}
            </div>
          ))}
          {showAddCat ? (
            <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:12,marginTop:8}}>
              <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>Ã¥ÂÂÃ§Â¤ÂºÃ¯Â¼ÂÃ¨Â¼Â¸Ã¥ÂÂ¥Ã¤Â»Â»Ã¦ÂÂ emojiÃ¯Â¼Â</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:44,height:44,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{newCat.icon||"?"}</div>
                <input value={newCat.icon} onChange={e=>setNewCat({...newCat,icon:e.target.value.slice(-2)||e.target.value.slice(-1)||""})} placeholder="Ã¨Â¼Â¸Ã¥ÂÂ¥ emoji" style={{...iStyle,marginBottom:0,flex:1,fontSize:18}}/>
              </div>
              <input value={newCat.label} onChange={e=>setNewCat({...newCat,label:e.target.value})} placeholder="Ã¥ÂÂÃ©Â¡ÂÃ¥ÂÂÃ§Â¨Â±" style={{...iStyle,marginBottom:8}}/>
              <div style={{display:"flex",gap:6}}>
                <Btn onClick={handleAddCat} style={{flex:1,padding:"8px 0"}}>Ã¦ÂÂ°Ã¥Â¢Â</Btn>
                <Btn onClick={()=>setShowAddCat(false)} variant="secondary" style={{flex:1,padding:"8px 0"}}>Ã¥ÂÂÃ¦Â¶Â</Btn>
              </div>
            </div>
          ) : (
            <button onClick={()=>setShowAddCat(true)} style={{width:"100%",marginTop:8,padding:"10px 0",background:"none",border:`2px dashed ${T.border}`,borderRadius:12,color:T.textSub,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Ã¯Â¼Â Ã¦ÂÂ°Ã¥Â¢ÂÃ¥ÂÂÃ©Â¡Â</button>
          )}
        </div>
      )}
    </div>
  );
}
// Ã¢ÂÂÃ¢ÂÂ Export helpers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function downloadFile(filename, content, type) {
  try {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 100);
    return true;
  } catch {}
  try {
    const encoded = type.includes("json")
      ? "data:application/json;charset=utf-8,"+encodeURIComponent(content)
      : "data:text/csv;charset=utf-8,"+encodeURIComponent(content);
    const a = document.createElement("a");
    a.href = encoded; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    return true;
  } catch {}
  return false;
}

function exportGroupCSV(group, me) {
  const cats = group.categories || DEFAULT_CATS;
  const getCatLabel = id => (cats.find(c=>c.id===id)||cats[cats.length-1]).label;
  const rows = [["Ã¦ÂÂ¥Ã¦ÂÂ","Ã©Â ÂÃ§ÂÂ®","Ã¥ÂÂÃ©Â¡Â","Ã§Â¸Â½Ã©ÂÂÃ©Â¡Â","Ã¤Â»ÂÃ¦Â¬Â¾Ã¤ÂºÂº","Ã¥ÂÂÃ¥Â¸Â³Ã¦ÂÂÃ¥ÂÂ¡","Ã¦ÂÂÃ§ÂÂÃ¥ÂÂÃ¦ÂÂ¤"]];
  [...group.expenses].sort((a,b)=>a.date.localeCompare(b.date)).forEach(e => {
    const payers = e.payers.map(p=>`${p.name}(NT$${p.amount})`).join("+");
    const splitMembers = Object.keys(e.splits).join("Ã£ÂÂ");
    const myShare = me ? (e.splits[me]||0).toFixed(2) : "";
    rows.push([e.date, e.name, getCatLabel(e.category), e.total, payers, splitMembers, myShare]);
  });
  const payments = group.payments || [];
  [...payments].sort((a,b)=>a.date.localeCompare(b.date)).forEach(p => {
    rows.push([p.date, `[Ã¨Â½ÂÃ¥Â¸Â³] ${p.from}Ã¢ÂÂ${p.to}`, "Ã¨Â½ÂÃ¥Â¸Â³", p.amount, p.from, p.to, ""]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const ok = downloadFile(`${group.name}_${new Date().toISOString().slice(0,10)}.csv`, "\uFEFF"+csv, "text/csv;charset=utf-8");
  if(!ok) return csv;
  return null;
}

function exportBackupJSON(groups) {
  const json = JSON.stringify({version:1, exportedAt:new Date().toISOString(), groups}, null, 2);
  const ok = downloadFile(`Ã¦ÂÂÃ©ÂÂÃ¥ÂÂÃ¥Â¸Â³Ã¥ÂÂÃ¤Â»Â½_${new Date().toISOString().slice(0,10)}.json`, json, "application/json");
  if(!ok) return json;
  return null;
}
// Ã¢ÂÂÃ¢ÂÂ Main App Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
export default function App() {
  const [screen,setScreen] = useState("loading");
  const [groups,setGroups] = useState([]);
  const [currentUser,setCurrentUser] = useState("");
  const [usernameInput,setUsernameInput] = useState("");
  const [currentGroupId,setCurrentGroupId] = useState(null);
  const [newGroupName,setNewGroupName] = useState("");
  const [newGroupPin,setNewGroupPin] = useState("");
  const [adminPinInput,setAdminPinInput] = useState("");
  const [joinCode,setJoinCode] = useState("");
  const [activeTab,setActiveTab] = useState("expenses");
  const [showAdd,setShowAdd] = useState(false);
  const [showPayment,setShowPayment] = useState(false);
  const [editingId,setEditingId] = useState(null);
  const [editingPaymentId,setEditingPaymentId] = useState(null);
  const [verifiedAdminGroups,setVerifiedAdminGroups] = useState(new Set());
  const [exportModal,setExportModal] = useState(null);
  const [error,setError] = useState("");
  const [claimScreen,setClaimScreen] = useState(null);
  const importFileRef = useRef(null);

  function handleImportBackup(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if(!data.groups) { alert("Ã¥ÂÂÃ¤Â»Â½Ã¦Â Â¼Ã¥Â¼ÂÃ¤Â¸ÂÃ¦Â­Â£Ã§Â¢Âº"); return; }
        if(window.confirm(`Ã§Â¢ÂºÃ¥Â®ÂÃ¨Â¦ÂÃ¥ÂÂ¯Ã¥ÂÂ¥ ${data.groups.length} Ã¥ÂÂÃ§Â¾Â¤Ã§ÂµÂÃ¥ÂÂÃ¯Â¼Â\nÃ§ÂÂ¾Ã¦ÂÂÃ¨Â³ÂÃ¦ÂÂÃ¦ÂÂÃ¨Â¢Â«Ã¥ÂÂÃ¤Â½ÂµÃ¯Â¼ÂÃ¤Â¸ÂÃ¦ÂÂÃ¥ÂÂªÃ©ÂÂ¤Ã¯Â¼Â`)) {
          setGroups(prev => {
            const existingIds = new Set(prev.map(g=>g.id));
            const toAdd = data.groups.filter(g=>!existingIds.has(g.id));
            const toUpdate = data.groups.filter(g=>existingIds.has(g.id));
            const merged = prev.map(g => { const u=toUpdate.find(x=>x.id===g.id); return u||g; });
            return [...merged, ...toAdd];
          });
          alert("Ã¥ÂÂ¯Ã¥ÂÂ¥Ã¦ÂÂÃ¥ÂÂÃ¯Â¼Â");
        }
      } catch { alert("Ã¥ÂÂÃ¤Â»Â½Ã¦ÂªÂÃ¦Â¡ÂÃ§ÂÂ¡Ã¦Â³ÂÃ¨Â®ÂÃ¥ÂÂ"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  useEffect(() => {
    (async () => {
      // Load groups from Firestore
      try {
        const q = query(collection(db, "groups"));
        const snapshot = await getDocs(q);
        const firestoreGroups = snapshot.docs.map(d => d.data());
        if(firestoreGroups.length > 0) setGroups(firestoreGroups);
        else setGroups([buildInitialGroup()]);
      } catch(e) { console.error("Firestore load error:", e); setGroups([buildInitialGroup()]); }
      try {
        const hash = window.location.hash.slice(1);
        if(hash) {
          const username = decodeURIComponent(hash);
          if(username) { setCurrentUser(username); setUsernameInput(username); setScreen("home"); return; }
        }
        const _u = localStorage.getItem("splitapp:user");
        if(_u){const {username}=JSON.parse(_u); if(username){setCurrentUser(username);setUsernameInput(username);setScreen("home");return;}}
      } catch {}
      setScreen("login");
    })();
  },[]);

  useEffect(() => {
    if(screen==="loading") return;
    if(groups.length === 0) return; // Avoid saving empty state
    // Save each group to Firestore as its own document (by group ID)
    groups.forEach(g => {
      setDoc(fsDoc(db, "groups", g.id), g).catch(console.error);
    });
  },[groups, screen]);

  useEffect(() => {
    if(currentUser) {
      try { localStorage.setItem("splitapp:user",JSON.stringify({username:currentUser})); } catch {}
      try { window.location.hash = encodeURIComponent(currentUser); } catch {}
    }
  },[currentUser]);

  const currentGroup = groups.find(g=>g.id===currentGroupId);

  function getNextColor(existingColors) {
    const used = Object.values(existingColors||{});
    return MEMBER_COLORS.find(c=>!used.includes(c))||MEMBER_COLORS[0];
  }

  async function handleLogin() {
    const name=usernameInput.trim();
    if(!name){setError("è«è¼¸å¥åå­ ð");return;}
    // Reload groups from Firestore to get cross-device data
    try {
      const q = query(collection(db, "groups"));
      const snapshot = await getDocs(q);
      const firestoreGroups = snapshot.docs.map(d => d.data());
      if(firestoreGroups.length > 0) setGroups(firestoreGroups);
    } catch(e) { console.error("Firestore reload error:", e); }
    setCurrentUser(name); setScreen("home"); setError("");
  }

  function handleCreateGroup() {
    const name=newGroupName.trim();
    const pin=newGroupPin.trim();
    if(!name){setError("Ã¨Â«ÂÃ¨Â¼Â¸Ã¥ÂÂ¥Ã§Â¾Â¤Ã§ÂµÂÃ¥ÂÂÃ§Â¨Â±");return;}
    if(!pin||pin.length<4){setError("Ã¨Â«ÂÃ¨Â¨Â­Ã¥Â®ÂÃ¨ÂÂ³Ã¥Â°Â 4 Ã¤Â½ÂÃ¦ÂÂ¸Ã§ÂÂÃ§Â®Â¡Ã§ÂÂÃ¥ÂÂ¡ PIN Ã§Â¢Â¼");return;}
    const g={id:uid(),name,code:Math.random().toString(36).slice(2,8).toUpperCase(),adminUser:currentUser,adminPin:pin,members:[currentUser],colors:{[currentUser]:getNextColor({})},claimedBy:{},categories:[...DEFAULT_CATS],payments:[],expenses:[],logs:[{id:uid(),ts:now(),user:currentUser,action:"Ã¥Â»ÂºÃ§Â«ÂÃ§Â¾Â¤Ã§ÂµÂ",detail:`Ã¥Â»ÂºÃ§Â«ÂÃ¤ÂºÂÃ§Â¾Â¤Ã§ÂµÂÃ£ÂÂ${name}Ã£ÂÂ`}]};
    // Save to Firestore (cross-device sync)
    setDoc(fsDoc(db, "groups", g.id), g).catch(console.error);
    setGroups(prev=>[...prev,g]);
    setNewGroupName(""); setNewGroupPin(""); setCurrentGroupId(g.id); setActiveTab("expenses"); setScreen("group"); setError("");
  }

  async function handleJoinGroup() {
    const code=joinCode.trim().toUpperCase();
    if(!code){setError("Ã¨Â«ÂÃ¨Â¼Â¸Ã¥ÂÂ¥Ã§Â¾Â¤Ã§ÂµÂÃ¤Â»Â£Ã§Â¢Â¼");return;}
    // First check locally
    let g=groups.find(x=>x.code===code);
    if(!g){
      // Query Firestore by group code
      try {
        const q = query(collection(db, "groups"), where("code", "==", code));
        const snapshot = await getDocs(q);
        if(!snapshot.empty) {
          const remoteGroup = snapshot.docs[0].data();
          g = remoteGroup;
          // Add to local state if not already present
          setGroups(prev=>{
            const ids=new Set(prev.map(x=>x.id));
            return ids.has(remoteGroup.id) ? prev : [...prev, remoteGroup];
          });
        }
      } catch(e) { console.error(e); }
    }
    if(!g){setError("Ã¦ÂÂ¾Ã¤Â¸ÂÃ¥ÂÂ°Ã¦Â­Â¤Ã§Â¾Â¤Ã§ÂµÂ Ã°ÂÂÂ");return;}
    const alreadyClaimed=Object.values(g.claimedBy||{}).includes(currentUser);
    if(g.members.includes(currentUser)||alreadyClaimed){setCurrentGroupId(g.id);setActiveTab("expenses");setScreen("group");setJoinCode("");setError("");return;}
    setClaimScreen({groupId:g.id,code});
    setJoinCode(""); setError("");
  }

  function handleClaimIdentity(memberName) {
    const g=groups.find(x=>x.id===claimScreen.groupId);
    if(!g) return;
    if(memberName==="__new__") {
      const color=getNextColor(g.colors);
      setGroups(prev=>prev.map(x=>x.id!==g.id?x:{...x,members:[...x.members,currentUser],colors:{...x.colors,[currentUser]:color},logs:[{id:uid(),ts:now(),user:currentUser,action:"Ã¥ÂÂ Ã¥ÂÂ¥Ã§Â¾Â¤Ã§ÂµÂ",detail:`${currentUser} Ã¤Â»Â¥Ã¦ÂÂ°Ã¦ÂÂÃ¥ÂÂ¡Ã¨ÂºÂ«Ã¥ÂÂÃ¥ÂÂ Ã¥ÂÂ¥`},...(x.logs||[])]}));
    } else {
      const oldName=memberName;
      setGroups(prev=>prev.map(x=>{
        if(x.id!==g.id) return x;
        const members=x.members.map(m=>m===oldName?currentUser:m);
        const colors={}; Object.entries(x.colors).forEach(([k,v])=>{colors[k===oldName?currentUser:k]=v;});
        const expenses=x.expenses.map(e=>{
          const splits={}; Object.entries(e.splits).forEach(([k,v])=>{splits[k===oldName?currentUser:k]=v;});
          const payers=e.payers.map(p=>p.name===oldName?{...p,name:currentUser}:p);
          return {...e,splits,payers};
        });
        const payments=(x.payments||[]).map(p=>({...p,from:p.from===oldName?currentUser:p.from,to:p.to===oldName?currentUser:p.to}));
        const adminUser=x.adminUser===oldName?currentUser:x.adminUser;
        const logs=[{id:uid(),ts:now(),user:currentUser,action:"Ã¨ÂªÂÃ©Â ÂÃ¨ÂºÂ«Ã¥ÂÂ",detail:`${currentUser} Ã¨ÂªÂÃ©Â ÂÃ¤ÂºÂÃ£ÂÂ${oldName}Ã£ÂÂÃ§ÂÂÃ¨ÂºÂ«Ã¥ÂÂ`},...(x.logs||[])];
        return {...x,members,colors,claimedBy:{...x.claimedBy,[oldName]:currentUser},expenses,payments,adminUser,logs};
      }));
    }
    setCurrentGroupId(claimScreen.groupId); setActiveTab("expenses"); setScreen("group"); setClaimScreen(null);
  }
  // Ã¢ÂÂÃ¢ÂÂ Claim Screen Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  if(claimScreen) {
    const g=groups.find(x=>x.id===claimScreen.groupId);
    if(!g) return null;
    const claimed=Object.keys(g.claimedBy||{});
    const unclaimed=g.members.filter(m=>!claimed.includes(m)&&m!==currentUser);
    return (
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,padding:24,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>Ã°ÂÂÂ¤</div>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Ã©ÂÂ¸Ã¦ÂÂÃ¤Â½Â Ã§ÂÂÃ¨ÂºÂ«Ã¥ÂÂ</div>
        <div style={{fontSize:13,color:T.textMute,marginBottom:4,textAlign:"center"}}>Ã§Â¾Â¤Ã§ÂµÂÃ¯Â¼Â{g.name}</div>
        <div style={{fontSize:12,color:T.textSub,marginBottom:24,textAlign:"center"}}>Ã©ÂÂ¸Ã¦ÂÂÃ¤Â½Â Ã¥ÂÂ¨Ã§Â¾Â¤Ã§ÂµÂÃ¤Â¸Â­Ã§ÂÂÃ¨ÂºÂ«Ã¥ÂÂÃ¯Â¼ÂÃ¦ÂÂÃ¤Â»Â¥Ã¦ÂÂ°Ã¦ÂÂÃ¥ÂÂ¡Ã¥ÂÂ Ã¥ÂÂ¥</div>
        <div style={{width:"100%",maxWidth:360}}>
          {unclaimed.map(m => (
            <Card key={m} onClick={()=>handleClaimIdentity(m)} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",marginBottom:8}}>
              <Avatar name={m} color={g.colors[m]||"#aaa"} size={38}/>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>{m}</div><div style={{fontSize:11,color:T.textMute}}>Ã©Â»ÂÃ©ÂÂ¸Ã¨ÂªÂÃ©Â ÂÃ¦Â­Â¤Ã¨ÂºÂ«Ã¥ÂÂ</div></div>
              <span style={{fontSize:18,color:T.textMute}}>Ã¢ÂÂº</span>
            </Card>
          ))}
          <Card onClick={()=>handleClaimIdentity("__new__")} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",borderStyle:"dashed"}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>Ã¯Â¼Â</div>
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>Ã¤Â»Â¥Ã¦ÂÂ°Ã¦ÂÂÃ¥ÂÂ¡Ã¥ÂÂ Ã¥ÂÂ¥</div><div style={{fontSize:11,color:T.textMute}}>Ã¤Â»Â¥Ã£ÂÂ{currentUser}Ã£ÂÂÃ¦ÂÂ°Ã¥Â¢ÂÃ¥ÂÂ°Ã§Â¾Â¤Ã§ÂµÂ</div></div>
          </Card>
          <Btn onClick={()=>setClaimScreen(null)} variant="ghost" style={{width:"100%",marginTop:8,textAlign:"center"}}>Ã¢ÂÂ Ã¥ÂÂÃ¦Â¶Â</Btn>
        </div>
      </div>
    );
  }

  // Ã¢ÂÂÃ¢ÂÂ Group Screen Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  if(screen==="group"&&currentGroup) {
    const g=currentGroup;
    const isAdmin=g.adminUser===currentUser && (g.adminPin==null || verifiedAdminGroups.has(g.id));
    const me=currentUser;
    const {members,colors,expenses,logs}=g;
    const payments=g.payments||[];
    const cats=g.categories||DEFAULT_CATS;
    const bal={};
    members.forEach(m=>bal[m]={paid:0,owes:0});
    expenses.forEach(e=>{
      e.payers.forEach(p=>{if(bal[p.name])bal[p.name].paid+=parseFloat(p.amount)||0;});
      Object.entries(e.splits).forEach(([m,amt])=>{if(bal[m])bal[m].owes+=amt;});
    });
    payments.forEach(p=>{
      if(bal[p.from]) bal[p.from].paid+=p.amount;
      if(bal[p.to])   bal[p.to].paid-=p.amount;
    });
    const myNet=(bal[me]?.paid||0)-(bal[me]?.owes||0);
    const mySpend=bal[me]?.owes||0;
    const myPaid=bal[me]?.paid||0;
    const totalAll=expenses.reduce((s,e)=>s+e.total,0);
    const transfers=minimizeTransfers(bal);
    const grouped={};
    expenses.forEach(e=>{if(!grouped[e.date])grouped[e.date]=[];grouped[e.date].push({...e,_type:"expense"});});
    payments.forEach(p=>{if(!grouped[p.date])grouped[p.date]=[];grouped[p.date].push({...p,_type:"payment"});});
    Object.keys(grouped).forEach(d=>grouped[d].sort((a,b)=>(a.ts||a.id).localeCompare(b.ts||b.id)));
    const sortedDates=Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
    function updateGroup(updater,logEntry) {
      setGroups(prev=>prev.map(x=>{
        if(x.id!==g.id) return x;
        const updated=updater(x);
        return {...updated,logs:[logEntry,...(updated.logs||[])]};
      }));
    }
    function handleAddExpense(form) {
      const e={id:uid(),...form};
      updateGroup(x=>({...x,expenses:[...x.expenses,e]}),{id:uid(),ts:now(),user:me,action:"Ã¦ÂÂ°Ã¥Â¢ÂÃ¦Â¶ÂÃ¨Â²Â»",detail:`Ã¦ÂÂ°Ã¥Â¢ÂÃ£ÂÂ${form.name}Ã£ÂÂNT$${form.total}Ã¯Â¼Â${form.payers.map(p=>`${p.name}Ã¤Â»ÂNT$${p.amount}`).join("Ã£ÂÂ")}`});
      setShowAdd(false);
    }
    function handleEditExpense(form) {
      const old=expenses.find(e=>e.id===editingId);
      const diffs=[];
      if(old?.name!==form.name) diffs.push(`Ã¥ÂÂÃ§Â¨Â±Ã¯Â¼Â${old?.name} Ã¢ÂÂ ${form.name}`);
      if(old?.total!==form.total) diffs.push(`Ã©ÂÂÃ©Â¡ÂÃ¯Â¼ÂNT$${old?.total} Ã¢ÂÂ NT$${form.total}`);
      if(old?.date!==form.date) diffs.push(`Ã¦ÂÂ¥Ã¦ÂÂÃ¯Â¼Â${old?.date} Ã¢ÂÂ ${form.date}`);
      if(old?.category!==form.category) diffs.push(`Ã¥ÂÂÃ©Â¡ÂÃ¯Â¼Â${getCat(old?.category,cats)?.label} Ã¢ÂÂ ${getCat(form.category,cats)?.label}`);
      const oldP=(old?.payers||[]).map(p=>`${p.name}NT$${p.amount}`).join("+");
      const newP=form.payers.map(p=>`${p.name}NT$${p.amount}`).join("+");
      if(oldP!==newP) diffs.push(`Ã¤Â»ÂÃ¦Â¬Â¾Ã¯Â¼Â${oldP} Ã¢ÂÂ ${newP}`);
      if(Object.keys(old?.splits||{}).sort().join(",")!==Object.keys(form.splits||{}).sort().join(",")) diffs.push("Ã¥ÂÂÃ¥Â¸Â³Ã¦ÂÂÃ¥ÂÂ¡Ã¨Â®ÂÃ¦ÂÂ´");
      const detail=diffs.length?`Ã§Â·Â¨Ã¨Â¼Â¯Ã£ÂÂ${old?.name}Ã£ÂÂÃ¯Â¼Â${diffs.join("Ã¯Â¼Â")}`:`Ã§Â·Â¨Ã¨Â¼Â¯Ã£ÂÂ${old?.name}Ã£ÂÂÃ¯Â¼ÂÃ§ÂÂ¡Ã¨Â®ÂÃ¥ÂÂÃ¯Â¼Â`;
      updateGroup(x=>({...x,expenses:x.expenses.map(e=>e.id!==editingId?e:{...e,...form})}),{id:uid(),ts:now(),user:me,action:"Ã§Â·Â¨Ã¨Â¼Â¯Ã¦Â¶ÂÃ¨Â²Â»",detail});
      setEditingId(null);
    }
    function handleDeleteExpense(id) {
      const e=expenses.find(x=>x.id===id);
      updateGroup(x=>({...x,expenses:x.expenses.filter(ex=>ex.id!==id)}),{id:uid(),ts:now(),user:me,action:"Ã¥ÂÂªÃ©ÂÂ¤Ã¦Â¶ÂÃ¨Â²Â»",detail:`Ã¥ÂÂªÃ©ÂÂ¤Ã£ÂÂ${e?.name}Ã£ÂÂNT$${e?.total}`});
      setEditingId(null);
    }
    function handleAddPayment(form) {
      const p={id:uid(),ts:now(),...form};
      updateGroup(x=>({...x,payments:[...(x.payments||[]),p]}),{id:uid(),ts:now(),user:me,action:"Ã¨Â¨ÂÃ©ÂÂÃ¨Â½ÂÃ¥Â¸Â³",detail:`${form.from} Ã¢ÂÂ ${form.to} NT$${form.amount}${form.note?" ("+form.note+")":""}`});
    }
    function handleEditPayment(form) {
      const old=payments.find(p=>p.id===editingPaymentId);
      const diffs=[];
      if(old?.from!==form.from) diffs.push(`Ã¨Â½ÂÃ¥ÂÂºÃ¯Â¼Â${old?.from} Ã¢ÂÂ ${form.from}`);
      if(old?.to!==form.to) diffs.push(`Ã¦ÂÂ¶Ã¦Â¬Â¾Ã¯Â¼Â${old?.to} Ã¢ÂÂ ${form.to}`);
      if(old?.amount!==form.amount) diffs.push(`Ã©ÂÂÃ©Â¡ÂÃ¯Â¼ÂNT$${old?.amount} Ã¢ÂÂ NT$${form.amount}`);
      if(old?.date!==form.date) diffs.push(`Ã¦ÂÂ¥Ã¦ÂÂÃ¯Â¼Â${old?.date} Ã¢ÂÂ ${form.date}`);
      const detail=diffs.length?`Ã§Â·Â¨Ã¨Â¼Â¯Ã¨Â½ÂÃ¥Â¸Â³Ã¯Â¼Â${diffs.join("Ã¯Â¼Â")}`:"Ã§Â·Â¨Ã¨Â¼Â¯Ã¨Â½ÂÃ¥Â¸Â³Ã¯Â¼ÂÃ§ÂÂ¡Ã¨Â®ÂÃ¥ÂÂÃ¯Â¼Â";
      updateGroup(x=>({...x,payments:(x.payments||[]).map(p=>p.id!==editingPaymentId?p:{...p,...form,amount:parseFloat(form.amount)})}),{id:uid(),ts:now(),user:me,action:"Ã§Â·Â¨Ã¨Â¼Â¯Ã¨Â½ÂÃ¥Â¸Â³",detail});
      setEditingPaymentId(null);
    }
    function handleDeletePayment(id) {
      const p=payments.find(x=>x.id===id);
      updateGroup(x=>({...x,payments:(x.payments||[]).filter(pm=>pm.id!==id)}),{id:uid(),ts:now(),user:me,action:"Ã¥ÂÂªÃ©ÂÂ¤Ã¨Â½ÂÃ¥Â¸Â³",detail:`Ã¥ÂÂªÃ©ÂÂ¤ ${p?.from} Ã¢ÂÂ ${p?.to} NT$${p?.amount}`});
      setEditingPaymentId(null);
    }
    const emptyForm=()=>({name:"",total:"",date:new Date().toISOString().slice(0,10),category:"food",payers:[{name:me,amount:""}],splitMode:"equal",splitData:{},splits:{}});
    const TABS=[["expenses","Ã¦ÂÂÃ§Â´Â°"],["settle","Ã§ÂµÂÃ§Â®Â"],["analytics","Ã¥ÂÂÃ¦ÂÂ"],["logs","Ã§Â´ÂÃ©ÂÂ"],["config","Ã¨Â¨Â­Ã¥Â®Â"]];
    return (
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,paddingBottom:50}}>
        <div style={{background:T.yellowLt,padding:"14px 16px 0",boxShadow:"0 2px 8px rgba(200,150,0,0.12)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <button onClick={()=>{setScreen("home");setCurrentGroupId(null);}} style={{background:"rgba(255,255,255,0.7)",border:"none",borderRadius:10,width:32,height:32,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>Ã¢ÂÂ</button>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>{g.name}</div>
              <div style={{fontSize:10,color:T.yellowDk,fontWeight:600}}>Ã¤Â»Â£Ã§Â¢Â¼ {g.code} ÃÂ· {members.length}Ã¤ÂºÂº{isAdmin?" ÃÂ· Ã°ÂÂÂ":""}</div>
            </div>
            <Avatar name={me} color={colors[me]||"#aaa"} size={30}/>
          </div>
          <div style={{background:"rgba(255,255,255,0.75)",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:10,color:T.yellowDk,fontWeight:700,marginBottom:8}}>Ã¦ÂÂÃ§ÂÂÃ¥Â¸Â³Ã¯Â¼Â{me}Ã¯Â¼Â</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0}}>
              <div style={{paddingRight:10,borderRight:`1.5px solid ${T.border}`}}>
                <div style={{fontSize:10,color:T.textMute,marginBottom:2}}>Ã¦ÂÂÃ¥Â¢ÂÃ¤Â»Â</div>
                <div style={{fontSize:16,fontWeight:800,color:T.yellowDk,lineHeight:1.2}}>NT${myPaid.toLocaleString()}</div>
              </div>
              <div style={{paddingLeft:10,paddingRight:10,borderRight:`1.5px solid ${T.border}`}}>
                <div style={{fontSize:10,color:T.textMute,marginBottom:2}}>Ã¦ÂÂÃ§ÂÂÃ¦Â¶ÂÃ¨Â²Â»</div>
                <div style={{fontSize:16,fontWeight:800,color:T.text,lineHeight:1.2}}>NT${mySpend.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</div>
              </div>
              <div style={{paddingLeft:10}}>
                <div style={{fontSize:10,color:T.textMute,marginBottom:2}}>{myNet>=0?"Ã¥ÂÂ¥Ã¤ÂºÂºÃ¦Â¬Â Ã¦ÂÂ":"Ã¦ÂÂÃ¦Â¬Â Ã¥ÂÂ¥Ã¤ÂºÂº"}</div>
                <div style={{fontSize:16,fontWeight:800,color:myNet>=0?T.green:T.accent,lineHeight:1.2}}>NT${Math.abs(myNet).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</div>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:0}}>
            {TABS.map(([k,l],i) => {
              const isActive=activeTab===k;
              return (
                <button key={k} onClick={()=>setActiveTab(k)} style={{flex:1,padding:"9px 4px",background:isActive?"rgba(255,255,255,0.95)":"transparent",border:"none",borderRadius:"10px 10px 0 0",color:isActive?T.text:T.yellowDk,fontSize:12,fontWeight:isActive?800:600,cursor:"pointer",whiteSpace:"nowrap",borderBottom:isActive?`2.5px solid ${T.yellowDk}`:"2.5px solid transparent",transition:"all 0.15s"}}>{l}</button>
              );
            })}
          </div>
        </div>
        <div style={{padding:"14px 14px 0"}}>
          {error && <div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:10,fontSize:12,color:T.accent,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{error}</span><button onClick={()=>setError("")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:14}}>Ã¢ÂÂ</button></div>}
          {activeTab==="expenses" && (
            <div>
              {showAdd && <ExpenseForm initial={emptyForm()} members={members} colors={colors} cats={cats} onSave={handleAddExpense} onCancel={()=>setShowAdd(false)}/>}
              {showPayment && <PaymentForm members={members} me={me} onSave={f=>{handleAddPayment(f);setShowPayment(false);}} onCancel={()=>setShowPayment(false)}/>}
              {sortedDates.length===0&&!showAdd&&!showPayment && <div style={{textAlign:"center",color:T.textMute,padding:40,fontSize:13}}>Ã©ÂÂÃ¦Â²ÂÃ¦ÂÂÃ¤Â»Â»Ã¤Â½ÂÃ¦Â¶ÂÃ¨Â²Â» Ã°ÂÂÂ´</div>}
              {sortedDates.map(date => (
                <div key={date}>
                  <div style={{fontSize:11,color:T.textMute,marginBottom:6,marginTop:12,fontWeight:700,letterSpacing:0.5}}>{fmtDate(date)}</div>
                  {grouped[date].map(item => {
                    if(item._type==="payment") {
                      const p=item, isMine=p.from===me||p.to===me;
                      if(editingPaymentId===p.id) return (
                        <div key={p.id} style={{marginBottom:10}}>
                          <PaymentForm members={members} me={me} initial={{from:p.from,to:p.to,amount:String(p.amount),date:p.date,note:p.note||""}} onSave={f=>{handleEditPayment(f);}} onCancel={()=>setEditingPaymentId(null)} onDelete={()=>handleDeletePayment(p.id)} isEdit/>
                        </div>
                      );
                      return (
                        <Card key={p.id} onClick={()=>{setEditingPaymentId(p.id);setShowAdd(false);setShowPayment(false);setEditingId(null);}} style={{borderColor:isMine?"#A5D6A7":T.border,background:isMine?"#F1FBF4":T.bgCard,padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:36,height:36,borderRadius:10,background:"#E8F5E9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>Ã°ÂÂÂ¸</div>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                                <Avatar name={p.from} color={colors[p.from]||"#aaa"} size={18}/>
                                <span style={{fontSize:12,fontWeight:600,color:T.text}}>{p.from}</span>
                                <span style={{fontSize:11,color:T.textMute}}>Ã¢ÂÂ</span>
                                <Avatar name={p.to} color={colors[p.to]||"#aaa"} size={18}/>
                                <span style={{fontSize:12,fontWeight:600,color:T.text}}>{p.to}</span>
                              </div>
                              {p.note && <div style={{fontSize:10,color:T.textMute}}>{p.note}</div>}
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:16,fontWeight:800,color:"#2E7D32"}}>NT${p.amount.toLocaleString()}</div>
                              <div style={{fontSize:10,color:T.textMute}}>Ã¨Â½ÂÃ¥Â¸Â³</div>
                            </div>
                          </div>
                        </Card>
                      );
                    }
                    const e=item, myShare=e.splits[me]||0, participants=Object.keys(e.splits);
                    const cat=getCat(e.category,cats), iAmPayer=e.payers.some(p=>p.name===me);
                    if(editingId===e.id) return (
                      <ExpenseForm key={e.id} initial={{name:e.name,total:String(e.total),date:e.date,category:e.category||"food",payers:e.payers||[{name:members[0],amount:String(e.total)}],splitMode:e.splitMode||"equal",splitData:e.splitData||{},splits:e.splits}} members={members} colors={colors} cats={cats} onSave={handleEditExpense} onCancel={()=>setEditingId(null)} onDelete={()=>handleDeleteExpense(e.id)}/>
                    );
                    return (
                      <Card key={e.id} onClick={()=>{setEditingId(e.id);setShowAdd(false);setShowPayment(false);setEditingPaymentId(null);}} style={{borderColor:iAmPayer?T.yellowMd:T.border,background:iAmPayer?"#FFFDE7":T.bgCard}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                            <div style={{width:36,height:36,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.icon}</div>
                            <div><div style={{fontSize:14,fontWeight:700,color:T.text}}>{e.name}</div><div style={{fontSize:10,color:T.textMute}}>{cat.label}</div></div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                            {myShare>0 ? <div style={{fontSize:19,fontWeight:800,color:iAmPayer?T.yellowDk:T.text,lineHeight:1}}>NT${myShare%1===0?myShare.toFixed(0):myShare.toFixed(2)}</div> : <div style={{fontSize:12,color:T.textMute}}>Ã¤Â¸ÂÃ¥ÂÂÃ¨ÂÂ</div>}
                          </div>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${T.border}`,paddingTop:6}}>
                          <div style={{display:"flex",gap:3,flexWrap:"wrap",flex:1}}>
                            {participants.map(m => (
                              <div key={m} title={m} style={{width:22,height:22,borderRadius:"50%",background:colors[m]||"#aaa",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}>
                                {m[0]}
                              </div>
                            ))}
                          </div>
                          <div style={{fontSize:11,color:T.textSub,flexShrink:0,marginLeft:6}}>
                            {e.payers.length===1?`${e.payers[0].name} Ã¤Â»Â NT$${e.total.toLocaleString()}`:e.payers.map(p=>`${p.name}NT$${p.amount}`).join("+")}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {activeTab==="settle" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                {[me,...members.filter(m=>m!==me)].map(m => {
                  const {paid,owes}=bal[m]||{paid:0,owes:0}, net=paid-owes, col=colors[m]||"#aaa", isMe=m===me;
                  const cleared=Math.abs(net)<0.5;
                  return (
                    <div key={m} style={{background:isMe?T.yellowLt:T.bgCard,border:`1.5px solid ${isMe?T.yellowMd:T.border}`,borderRadius:12,padding:"10px 12px",boxShadow:T.shadow}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                        <Avatar name={m} color={col} size={22}/>
                        <span style={{fontWeight:700,fontSize:12,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m}</span>
                        {m===g.adminUser && <span style={{fontSize:9}}>Ã°ÂÂÂ</span>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
                          <span style={{color:T.textMute}}>Ã¤Â»Â£Ã¥Â¢Â</span>
                          <span style={{fontWeight:600,color:T.text}}>NT${paid.toLocaleString()}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
                          <span style={{color:T.textMute}}>Ã¦Â¶ÂÃ¨Â²Â»</span>
                          <span style={{fontWeight:600,color:T.text}}>NT${owes.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</span>
                        </div>
                        <div style={{height:1,background:T.border,margin:"2px 0"}}/>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:10,color:T.textMute}}>{cleared?"":"Ã¦ÂÂ¶Ã¦ÂÂ¯"}</span>
                          {cleared
                            ? <span style={{fontSize:11,fontWeight:800,color:T.green}}>Ã¢ÂÂ Ã§ÂµÂÃ¦Â¸Â</span>
                            : <span style={{fontSize:13,fontWeight:800,color:net>=0?T.green:T.accent}}>{net>=0?"Ã°ÂÂÂ°":"Ã°ÂÂÂ¸"}NT${Math.abs(net).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</span>
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:10,color:T.textMute,textAlign:"center",marginBottom:12}}>Ã§Â¸Â½Ã¦Â¶ÂÃ¨Â²Â» NT${totalAll.toLocaleString()}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,color:T.textSub,fontWeight:700}}>Ã¦ÂÂÃ¥Â°ÂÃ¨Â½ÂÃ¥Â¸Â³Ã¦ÂÂ¹Ã¦Â¡Â</div>
                <div style={{fontSize:11,color:T.textMute}}>{transfers.length} Ã§Â­ÂÃ¥ÂÂ³Ã¥ÂÂ¯Ã§ÂµÂÃ¦Â¸Â</div>
              </div>
              {transfers.length===0 && <div style={{textAlign:"center",color:T.textMute,padding:24,fontSize:16}}>Ã¥Â·Â²Ã¥ÂÂ¨Ã©ÂÂ¨Ã§ÂµÂÃ¦Â¸Â Ã°ÂÂ¥Â³</div>}
              {transfers.map((t,i) => {
                const isMyAction=t.from===me||t.to===me;
                const alreadyDone=payments.some(p=>p.from===t.from&&p.to===t.to&&Math.abs(p.amount-t.amount)<0.5);
                const markDone=()=>{handleAddPayment({from:t.from,to:t.to,amount:t.amount,date:new Date().toISOString().slice(0,10),note:"Ã¨Â½ÂÃ¥Â¸Â³Ã¥Â®ÂÃ¦ÂÂ"});};
                return (
                  <Card key={i} style={{borderColor:alreadyDone?"#A5D6A7":isMyAction?T.yellowDk:T.border,background:alreadyDone?"#F1FBF4":isMyAction?"#FFFDE7":T.bgCard}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,minWidth:48}}>
                        <Avatar name={t.from} color={colors[t.from]||"#aaa"} size={32}/>
                        <span style={{fontSize:10,color:T.text,fontWeight:700,textAlign:"center"}}>{t.from}</span>
                      </div>
                      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <div style={{fontSize:15,fontWeight:800,color:T.text}}>NT${t.amount.toLocaleString()}</div>
                        <div style={{width:"100%",display:"flex",alignItems:"center",gap:4}}>
                          <div style={{flex:1,height:1.5,background:T.border,borderRadius:2}}/>
                          <span style={{fontSize:14}}>Ã¢ÂÂ</span>
                          <div style={{flex:1,height:1.5,background:T.border,borderRadius:2}}/>
                        </div>
                        {isMyAction&&!alreadyDone && <span style={{fontSize:10,color:T.yellowDk,fontWeight:700}}>{t.from===me?"Ã¦ÂÂÃ¨Â¦ÂÃ¤Â»Â":"Ã¦ÂÂÃ¨Â¦ÂÃ¦ÂÂ¶"}</span>}
                        {alreadyDone && <span style={{fontSize:10,color:"#2E7D32",fontWeight:700}}>Ã¢ÂÂ Ã¥Â·Â²Ã¥Â®ÂÃ¦ÂÂ</span>}
                        {!alreadyDone && <button onClick={markDone} style={{marginTop:2,padding:"3px 12px",background:"#E8F5E9",border:"1.5px solid #A5D6A7",borderRadius:20,color:"#2E7D32",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ã¨Â½ÂÃ¥Â¸Â³Ã¥Â®ÂÃ¦ÂÂ</button>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,minWidth:48}}>
                        <Avatar name={t.to} color={colors[t.to]||"#aaa"} size={32}/>
                        <span style={{fontSize:10,color:T.text,fontWeight:700,textAlign:"center"}}>{t.to}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {activeTab==="analytics" && <AnalyticsTab expenses={expenses} members={members} colors={colors} cats={cats} me={me}/>}
          {activeTab==="logs" && (
            <div>
              <div style={{fontSize:13,color:T.textSub,marginBottom:14,fontWeight:600}}>Ã¦ÂÂÃ¤Â½ÂÃ§Â´ÂÃ©ÂÂ</div>
              {(logs||[]).length===0 && <div style={{textAlign:"center",color:T.textMute,padding:40}}>Ã¦ÂÂ«Ã§ÂÂ¡Ã§Â´ÂÃ©ÂÂ</div>}
              {(logs||[]).map(l => (
                <Card key={l.id} style={{padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <Avatar name={l.user} color={colors[l.user]||"#aaa"} size={24}/>
                    <span style={{fontSize:12,fontWeight:700,color:colors[l.user]||T.textSub}}>{l.user}</span>
                    <span style={{marginLeft:"auto",fontSize:10,color:T.textMute}}>{fmtTs(l.ts)}</span>
                  </div>
                  <div style={{fontSize:11,color:T.yellowDk,marginBottom:2,fontWeight:700}}>{l.action}</div>
                  <div style={{fontSize:12,color:T.textSub}}>{l.detail}</div>
                </Card>
              ))}
            </div>
          )}
          {activeTab==="config" && (
            g.adminUser===currentUser && !verifiedAdminGroups.has(g.id) && g.adminPin
              ? (
                <div style={{textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:32,marginBottom:12}}>Ã°ÂÂÂ</div>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Ã©ÂÂÃ¨Â¦ÂÃ§Â®Â¡Ã§ÂÂÃ¥ÂÂ¡ PIN Ã§Â¢Â¼</div>
                  <div style={{fontSize:12,color:T.textSub,marginBottom:16}}>Ã¨Â¼Â¸Ã¥ÂÂ¥Ã¥Â»ÂºÃ§Â«ÂÃ§Â¾Â¤Ã§ÂµÂÃ¦ÂÂÃ¨Â¨Â­Ã¥Â®ÂÃ§ÂÂ PIN Ã§Â¢Â¼</div>
                  <input type="password" inputMode="numeric" placeholder="PIN Ã§Â¢Â¼" value={adminPinInput} onChange={e=>setAdminPinInput(e.target.value)} style={{...iStyle,maxWidth:200,textAlign:"center",fontSize:18,letterSpacing:4,marginBottom:12}}/>
                  <Btn onClick={()=>{
                    if(adminPinInput===g.adminPin){
                      setVerifiedAdminGroups(prev=>new Set([...prev,g.id]));
                      setAdminPinInput("");
                    } else {
                      setError("PIN Ã§Â¢Â¼Ã©ÂÂ¯Ã¨ÂªÂ¤");
                      setAdminPinInput("");
                    }
                  }} style={{width:"100%",maxWidth:200,padding:10}}>Ã§Â¢ÂºÃ¨ÂªÂ</Btn>
                </div>
              )
              : <ConfigTab group={g} setGroups={setGroups} bal={bal} me={me} setExportModal={setExportModal}/>
          )}
        </div>
      {activeTab==="expenses" && (
        <div style={{position:"fixed",bottom:24,right:20,zIndex:500,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
          {(showAdd||showPayment) && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,marginBottom:4}}>
              <button onClick={()=>{setShowPayment(true);setShowAdd(false);setEditingId(null);setEditingPaymentId(null);}}
                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px 8px 12px",background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:24,color:T.text,fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"0 3px 12px rgba(0,0,0,0.15)",whiteSpace:"nowrap",fontFamily:"inherit"}}>
                <span>Ã°ÂÂÂ¸</span> Ã¨Â¨ÂÃ©ÂÂÃ¨Â½ÂÃ¥Â¸Â³
              </button>
              <button onClick={()=>{setShowAdd(true);setShowPayment(false);setEditingId(null);setEditingPaymentId(null);}}
                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px 8px 12px",background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:24,color:T.text,fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"0 3px 12px rgba(0,0,0,0.15)",whiteSpace:"nowrap",fontFamily:"inherit"}}>
                <span>Ã°ÂÂ§Â¾</span> Ã¦ÂÂ°Ã¥Â¢ÂÃ¦Â¶ÂÃ¨Â²Â»
              </button>
            </div>
          )}
          <button
            onClick={()=>{
              const isOpen=showAdd||showPayment;
              if(isOpen){setShowAdd(false);setShowPayment(false);}
              else{setShowAdd(true);setShowPayment(false);setEditingId(null);setEditingPaymentId(null);}
            }}
            style={{width:54,height:54,borderRadius:"50%",background:(showAdd||showPayment)?T.text:T.yellowMd,border:"none",color:(showAdd||showPayment)?"#fff":T.text,fontSize:(showAdd||showPayment)?18:28,cursor:"pointer",boxShadow:`0 4px 16px ${(showAdd||showPayment)?"rgba(0,0,0,0.25)":"rgba(200,150,0,0.35)"}`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",fontFamily:"inherit"}}>
            {(showAdd||showPayment) ? "Ã¢ÂÂ" : "Ã¯Â¼Â"}
          </button>
        </div>
      )}
      </div>
    );
  }
  // Ã¢ÂÂÃ¢ÂÂ Export Modal Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  if(exportModal) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:500,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:15}}>{exportModal.title}</div>
          <button onClick={()=>setExportModal(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:T.textSub}}>Ã¢ÂÂ</button>
        </div>
        <div style={{fontSize:11,color:T.textSub,marginBottom:8}}>Ã§ÂÂ¡Ã¦Â³ÂÃ§ÂÂ´Ã¦ÂÂ¥Ã¤Â¸ÂÃ¨Â¼ÂÃ¯Â¼ÂÃ¨Â«ÂÃ©ÂÂ·Ã¦ÂÂÃ¥ÂÂ¨Ã©ÂÂ¸Ã¥Â¾ÂÃ¨Â¤ÂÃ¨Â£Â½Ã¯Â¼ÂÃ¨Â²Â¼Ã¥ÂÂ° Excel Ã¦ÂÂÃ¨Â¨ÂÃ¤ÂºÂÃ¦ÂÂ¬Ã¥ÂÂ²Ã¥Â­Â</div>
        <textarea readOnly value={exportModal.content} style={{flex:1,border:`1px solid ${T.border}`,borderRadius:8,padding:8,fontSize:10,fontFamily:"monospace",resize:"none",outline:"none",minHeight:200}} onClick={e=>e.target.select()}/>
        <Btn onClick={()=>{try{navigator.clipboard.writeText(exportModal.content).then(()=>alert("Ã¥Â·Â²Ã¨Â¤ÂÃ¨Â£Â½Ã¯Â¼Â"));}catch{alert("Ã¨Â«ÂÃ¦ÂÂÃ¥ÂÂÃ©ÂÂ¸Ã¥ÂÂÃ¨Â¤ÂÃ¨Â£Â½");}}} style={{marginTop:10,width:"100%"}}>Ã¨Â¤ÂÃ¨Â£Â½Ã¥ÂÂ§Ã¥Â®Â¹</Btn>
      </div>
    </div>
  );

  // Ã¢ÂÂÃ¢ÂÂ Home Screen Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  if(screen==="home") return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,padding:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <div style={{width:40,height:40,borderRadius:14,background:T.yellowMd,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:T.shadow}}>Ã°ÂÂÂÃ¯Â¸Â</div>
        <div><div style={{fontSize:17,fontWeight:800}}>Ã¦ÂÂÃ©ÂÂÃ¥ÂÂÃ¥Â¸Â³</div><div style={{fontSize:11,color:T.yellowDk,fontWeight:600}}>Ã¦Â­Â¡Ã¨Â¿ÂÃ¯Â¼Â{currentUser} Ã°ÂÂÂ</div></div>
        <button onClick={()=>{setCurrentUser("");setUsernameInput("");try{localStorage.removeItem("splitapp:user");}catch{}try{window.location.hash="";}catch{}setScreen("login");}} style={{marginLeft:"auto",background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:20,padding:"5px 12px",color:T.textSub,fontSize:11,cursor:"pointer",fontWeight:600}}>Ã§ÂÂ»Ã¥ÂÂº</button>
      </div>
      {error && <div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.accent,display:"flex",justifyContent:"space-between"}}><span>{error}</span><button onClick={()=>setError("")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer"}}>Ã¢ÂÂ</button></div>}
      {groups.filter(g=>g.members.includes(currentUser)).length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,color:T.textMute,marginBottom:10,fontWeight:700}}>Ã¦ÂÂÃ§ÂÂÃ§Â¾Â¤Ã§ÂµÂ</div>
          {groups.filter(g=>g.members.includes(currentUser)).map(g => (
            <Card key={g.id} onClick={()=>{setCurrentGroupId(g.id);setActiveTab("expenses");setScreen("group");}} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
              <div style={{width:44,height:44,borderRadius:12,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>Ã°ÂÂÂÃ¯Â¸Â</div>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>{g.name}</div><div style={{fontSize:11,color:T.textMute}}>{g.members.length} Ã¤Â½ÂÃ¦ÂÂÃ¥ÂÂ¡ ÃÂ· {g.code}{g.adminUser===currentUser?" ÃÂ· Ã°ÂÂÂ":""}</div></div>
              <span style={{fontSize:18,color:T.textMute}}>Ã¢ÂÂº</span>
            </Card>
          ))}
        </div>
      )}
      <Card style={{borderColor:T.yellowMd,marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:T.yellowDk}}>Ã¯Â¼Â Ã¥Â»ÂºÃ§Â«ÂÃ¦ÂÂ°Ã§Â¾Â¤Ã§ÂµÂ</div>
        <input placeholder="Ã§Â¾Â¤Ã§ÂµÂÃ¥ÂÂÃ§Â¨Â±Ã¯Â¼ÂÃ¤Â¾ÂÃ¯Â¼ÂÃ¦Â²ÂÃ§Â¹Â©Ã¤ÂºÂÃ¦ÂÂ¥Ã©ÂÂ Ã°ÂÂÂºÃ¯Â¼Â" value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} style={iStyle}/>
        <input type="password" inputMode="numeric" placeholder="Ã§Â®Â¡Ã§ÂÂÃ¥ÂÂ¡ PIN Ã§Â¢Â¼Ã¯Â¼ÂÃ¨ÂÂ³Ã¥Â°Â 4 Ã¤Â½ÂÃ¯Â¼Â" value={newGroupPin} onChange={e=>setNewGroupPin(e.target.value)} style={{...iStyle,letterSpacing:4}}/>
        <div style={{fontSize:10,color:T.textMute,marginBottom:8,marginTop:-4}}>PIN Ã§Â¢Â¼Ã§ÂÂ¨Ã¦ÂÂ¼Ã¤Â¿ÂÃ¨Â­Â·Ã§Â®Â¡Ã§ÂÂÃ¥ÂÂ¡Ã¥ÂÂÃ¨ÂÂ½Ã¯Â¼ÂÃ¨Â«ÂÃ¨Â¨ÂÃ¥Â¥Â½</div>
        <Btn onClick={handleCreateGroup} style={{width:"100%",padding:11,fontSize:14}}>Ã¥Â»ÂºÃ§Â«Â</Btn>
      </Card>
      <Card>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Ã¥ÂÂ Ã¥ÂÂ¥Ã§Â¾Â¤Ã§ÂµÂ</div>
        <input placeholder="Ã¨Â¼Â¸Ã¥ÂÂ¥Ã§Â¾Â¤Ã§ÂµÂÃ¤Â»Â£Ã§Â¢Â¼" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&handleJoinGroup()} style={{...iStyle,fontFamily:"monospace",letterSpacing:3,textTransform:"uppercase"}}/>
        <Btn onClick={handleJoinGroup} variant="secondary" style={{width:"100%",padding:11,fontSize:14}}>Ã¥ÂÂ Ã¥ÂÂ¥</Btn>
      </Card>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={()=>{const r=exportBackupJSON(groups);if(r)setExportModal({title:"Ã¥ÂÂÃ¤Â»Â½Ã¨Â³ÂÃ¦ÂÂ",content:r});}} style={{flex:1,padding:"10px 0",background:"#E8F5E9",border:"1.5px solid #A5D6A7",borderRadius:12,color:"#2E7D32",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ã°ÂÂÂ¦ Ã¥ÂÂÃ¤Â»Â½Ã¨Â³ÂÃ¦ÂÂ</button>
        <button onClick={()=>importFileRef.current?.click()} style={{flex:1,padding:"10px 0",background:"#FFF8E1",border:`1.5px solid ${T.yellowMd}`,borderRadius:12,color:T.yellowDk,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ã°ÂÂÂ Ã¥ÂÂ¯Ã¥ÂÂ¥Ã¥ÂÂÃ¤Â»Â½</button>
        <input ref={importFileRef} type="file" accept=".json" onChange={handleImportBackup} style={{display:"none"}}/>
      </div>
    </div>
  );

  // Ã¢ÂÂÃ¢ÂÂ Login Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:60,marginBottom:8}}>Ã°ÂÂÂÃ¯Â¸Â</div>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Ã¦ÂÂÃ©ÂÂÃ¥ÂÂÃ¥Â¸Â³</div>
      <div style={{fontSize:13,color:T.textMute,marginBottom:32}}>Ã¨Â¼Â¸Ã¥ÂÂ¥Ã¤Â½Â Ã§ÂÂÃ¥ÂÂÃ¥Â­ÂÃ©ÂÂÃ¥Â§ÂÃ¤Â½Â¿Ã§ÂÂ¨</div>
      {error && <div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.accent,width:"100%",maxWidth:320,boxSizing:"border-box"}}>{error}</div>}
      <input placeholder="Ã¤Â½Â Ã¥ÂÂ«Ã¤Â»ÂÃ©ÂºÂ¼Ã¥ÂÂÃ¥Â­ÂÃ¯Â¼Â" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{...iStyle,maxWidth:320,textAlign:"center",fontSize:16,marginBottom:12}}/>
      <Btn onClick={handleLogin} style={{width:"100%",maxWidth:320,padding:13,fontSize:15}}>Ã¥ÂÂºÃ§ÂÂ¼Ã¯Â¼ÂÃ°ÂÂÂ</Btn>
    </div>
  );
}
