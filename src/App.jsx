import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc as fsDoc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";

const T = {
  bg:"#FFFDF5", bgCard:"#FFFFFF", yellow:"#FFE566", yellowDk:"#D4A017",
  yellowLt:"#FFF3B0", yellowMd:"#FFD54F", accent:"#FF6B4A", green:"#3DAA6F",
  text:"#3D2E1E", textSub:"#8C7A6B", textMute:"#C4B09A",
  border:"#F0E4C0", shadow:"0 2px 10px rgba(180,130,40,0.10)", shadowMd:"0 4px 18px rgba(180,130,40,0.15)",
};

const DEFAULT_CATS = [
  {id:"food",icon:"🍜",label:"食物"},{id:"snack",icon:"🧋",label:"飲料"},
  {id:"transport",icon:"🚗",label:"交通"},{id:"hotel",icon:"🏠",label:"住宿"},
  {id:"spot",icon:"🎡",label:"景點"},{id:"shop",icon:"🛍️",label:"購物"},
  {id:"grocery",icon:"🛒",label:"超市"},{id:"fuel",icon:"⛽",label:"油錢"},
  {id:"parking",icon:"🅿️",label:"停車"},{id:"ticket",icon:"🎟️",label:"票券"},
  {id:"medical",icon:"💊",label:"醫藥"},{id:"misc",icon:"📦",label:"雜支"},
];

const getCat = (id, cats) => {
  const list = cats || DEFAULT_CATS;
  return list.find(c=>c.id===id) || list[list.length-1];
};

const MEMBER_COLORS = ["#E57373","#64B5F6","#81C784","#FFB74D","#BA68C8","#4DB6AC","#F06292","#A1887F","#90A4AE","#DCE775"];

function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function now() { return new Date().toISOString(); }
function fmtDate(d) { const dt=new Date(d+"T00:00:00"); return `${dt.getMonth()+1}月${dt.getDate()}日`; }
function fmtTs(ts) {
  const d=new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtTsFull(ts) {
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
  const ALL = ["安安","Carly","Michael","Chien","陳霆宇","邱于瑄"];
  const SG = ["Carly","陳霆宇","Michael","邱于瑄"];
  const colors = {"安安":MEMBER_COLORS[0],"Carly":MEMBER_COLORS[1],"Michael":MEMBER_COLORS[2],"Chien":MEMBER_COLORS[3],"陳霆宇":MEMBER_COLORS[4],"邱于瑄":MEMBER_COLORS[5]};
  const yu = (()=>{ const f=180,rem=1716-f,oth=ALL.filter(m=>m!=="Michael"),sh=rem/oth.length,s={}; oth.forEach(m=>s[m]=sh); s["Michael"]=f; return s; })();
  const am = {"Carly":95/6,"陳霆宇":95/6,"Chien":95/3,"Michael":95/3};
  return {
    id:"clearing2026", name:"2026清明節還1/4島", code:"CLEAR1",
    adminUser:"Carly", adminPin:"1234", members:ALL, colors, claimedBy:{Carly:"Carly"},
    claimedUsers:["Carly"],
    categories:[...DEFAULT_CATS], payments:[],
    expenses:[
      {id:"e1",name:"全聯",category:"grocery",payers:[{name:"安安",amount:3476}],total:3476,date:"2026-04-02",splits:makeEqual(ALL,3476)},
      {id:"e2",name:"棺材板",category:"food",payers:[{name:"Carly",amount:155}],total:155,date:"2026-04-02",splits:makeEqual(ALL,155)},
      {id:"e3",name:"強蛋餅",category:"food",payers:[{name:"Carly",amount:320}],total:320,date:"2026-04-02",splits:makeEqual(ALL,320)},
      {id:"e4",name:"有A漫的咖啡店",category:"snack",payers:[{name:"Michael",amount:750}],total:750,date:"2026-04-02",splits:makeEqual(SG,750)},
      {id:"e5",name:"一碗小",category:"food",payers:[{name:"Michael",amount:1255}],total:1255,date:"2026-04-02",splits:makeEqual(ALL,1255)},
      {id:"e6",name:"檸檬汁",category:"snack",payers:[{name:"Michael",amount:60}],total:60,date:"2026-04-02",splits:makeEqual(SG,60)},
      {id:"e7",name:"佳興冰果室",category:"snack",payers:[{name:"Michael",amount:1350}],total:1350,date:"2026-04-02",splits:makeEqual(SG,1350)},
      {id:"e8",name:"住宿",category:"hotel",payers:[{name:"Carly",amount:9585}],total:9585,date:"2026-04-02",splits:makeEqual(ALL,9585)},
      {id:"e9",name:"緬甸料理",category:"food",payers:[{name:"Chien",amount:2320}],total:2320,date:"2026-04-03",splits:makeEqual(ALL,2320)},
      {id:"e10",name:"油錢",category:"fuel",payers:[{name:"Michael",amount:3416}],total:3416,date:"2026-04-03",splits:makeEqual(SG,3416)},
      {id:"e11",name:"全家冰塊",category:"grocery",payers:[{name:"陳霆宇",amount:118}],total:118,date:"2026-04-03",splits:makeEqual(ALL,118)},
      {id:"e12",name:"花生糖",category:"snack",payers:[{name:"Carly",amount:310}],total:310,date:"2026-04-04",splits:makeEqual(["Carly","陳霆宇"],310)},
      {id:"e13",name:"超市",category:"grocery",payers:[{name:"安安",amount:485}],total:485,date:"2026-04-04",splits:makeEqual(ALL,485)},
      {id:"e14",name:"滷味",category:"food",payers:[{name:"陳霆宇",amount:645}],total:645,date:"2026-04-04",splits:makeEqual(ALL,645)},
      {id:"e15",name:"花蓮扁食",category:"food",payers:[{name:"Carly",amount:890}],total:890,date:"2026-04-04",splits:makeEqual(ALL,890)},
      {id:"e16",name:"原野牧場",category:"spot",payers:[{name:"陳霆宇",amount:1716}],total:1716,date:"2026-04-04",splits:yu,isCustom:true},
      {id:"e17",name:"午餐蜆",category:"food",payers:[{name:"Michael",amount:3009}],total:3009,date:"2026-04-04",splits:makeEqual(ALL,3009)},
      {id:"e18",name:"咖哩麵包",category:"snack",payers:[{name:"陳霆宇",amount:135}],total:135,date:"2026-04-05",splits:makeEqual(ALL,135)},
      {id:"e19",name:"海鮮餐廳",category:"food",payers:[{name:"Chien",amount:2150}],total:2150,date:"2026-04-05",splits:makeEqual(ALL,2150)},
      {id:"e20",name:"曾記麻糬",category:"shop",payers:[{name:"Chien",amount:243}],total:243,date:"2026-04-05",splits:makeEqual(ALL,243)},
      {id:"e21",name:"711美式",category:"snack",payers:[{name:"Carly",amount:95}],total:95,date:"2026-04-05",splits:am,isCustom:true},
      {id:"e22",name:"停車費",category:"parking",payers:[{name:"Michael",amount:120}],total:120,date:"2026-04-06",splits:makeEqual(SG,120)},
      {id:"e23",name:"7-11飯糰",category:"snack",payers:[{name:"邱于瑄",amount:55}],total:55,date:"2026-04-06",splits:makeEqual(["陳霆宇","邱于瑄"],55)},
      {id:"e24",name:"梅子名產",category:"shop",payers:[{name:"Chien",amount:400}],total:400,date:"2026-04-04",splits:makeEqual(["Chien","邱于瑄"],400)},
    ],
    logs:[{id:"l0",ts:new Date("2026-04-02").toISOString(),user:"Carly",action:"建立群組",detail:"建立了群組「2026清明節還1/4島」"}]
  };
}

// ── Primitives ────────────────────────────────────────────────────────
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

// ── MultiSelect ───────────────────────────────────────────────────────
function MultiSelect({value,onChange,members,colors}) {
  const [open,setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return () => document.removeEventListener("mousedown",h);
  },[]);
  const toggle = m => { if(value.includes(m)){if(value.length>1)onChange(value.filter(x=>x!==m));}else onChange([...value,m]); };
  const allSel = value.length===members.length;
  const label = allSel ? "全部成員" : value.length===0 ? "請選擇" : value.join("、");
  return (
    <div ref={ref} style={{position:"relative",marginBottom:8}}>
      <div onClick={()=>setOpen(!open)} style={{...iStyle,marginBottom:0,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{label}</span>
        <span style={{marginLeft:8,fontSize:10,color:T.textMute}}>{open?"▲":"▼"}</span>
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:300,background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:12,overflow:"hidden",boxShadow:T.shadowMd}}>
          <div onClick={()=>onChange(allSel?[members[0]]:[...members])} style={{padding:"9px 12px",fontSize:12,color:T.textSub,cursor:"pointer",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",background:allSel?T.yellowLt:"#fff"}}>
            <span>全部成員</span><span style={{color:T.yellowDk}}>{allSel?"✓":""}</span>
          </div>
          {members.map(m => {
            const sel = value.includes(m); const col = colors[m]||"#aaa";
            return (
              <div key={m} onClick={()=>toggle(m)} style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:sel?T.yellowLt+"88":"#fff",borderBottom:`1px solid ${T.border}44`}}>
                <div style={{width:16,height:16,borderRadius:5,border:`2px solid ${sel?T.yellowDk:T.border}`,background:sel?T.yellowMd:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {sel && <span style={{fontSize:9,color:T.text,fontWeight:900}}>✓</span>}
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

// ── Category Picker ───────────────────────────────────────────────────
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
        <span style={{fontSize:10,color:T.textMute}}>{open?"▲":"▼"}</span>
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

// ── Split Editor ──────────────────────────────────────────────────────
function SplitEditor({mode,setMode,data,setData,members,colors,total}) {
  const pt = parseFloat(total)||0;
  const fixedSum = Object.values(data).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const equalCount = members.filter(m=>!(parseFloat(data[m])>0)).length;
  const remainder = pt - fixedSum;
  const sharePerEqual = equalCount>0 ? remainder/equalCount : 0;
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["equal","均分"],["amount","金額"],["ratio","比例"]].map(([k,l]) => (
          <button key={k} onClick={()=>{setMode(k);setData({});}} style={{flex:1,padding:"7px 0",borderRadius:10,border:`1.5px solid ${mode===k?T.yellowDk:T.border}`,background:mode===k?T.yellowLt:"#fff",color:mode===k?T.text:T.textSub,fontSize:12,fontWeight:mode===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>
      {mode==="equal" && (
        <MultiSelect value={Object.keys(data).length?Object.keys(data):members} onChange={sel=>{const d={};sel.forEach(m=>d[m]=1);setData(d);}} members={members} colors={colors}/>
      )}
      {mode==="amount" && (
        <div>
          <div style={{fontSize:11,color:T.textSub,marginBottom:6}}>輸入固定金額，留空則均分剩餘</div>
          {members.map(m => (
            <div key={m} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <Avatar name={m} color={colors[m]||"#aaa"} size={24}/>
              <span style={{fontSize:13,color:T.text,flex:1}}>{m}</span>
              <input type="number" placeholder={sharePerEqual>0&&!(data[m])?`≈${sharePerEqual.toFixed(0)}`:"0"} value={data[m]||""} onChange={e=>setData({...data,[m]:e.target.value})} style={{...iStyle,width:90,marginBottom:0,textAlign:"right"}}/>
            </div>
          ))}
          {pt>0 && <div style={{fontSize:11,color:remainder<-0.01?T.accent:T.green,marginTop:4}}>{remainder<-0.01?`⚠️ 超出 NT$${Math.abs(remainder).toFixed(0)}`:`剩餘 NT$${remainder.toFixed(0)} 由 ${equalCount} 人均分`}</div>}
        </div>
      )}
      {mode==="ratio" && (
        <div>
          <div style={{fontSize:11,color:T.textSub,marginBottom:6}}>輸入比例（留空預設1）</div>
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

// ── Payers Editor ─────────────────────────────────────────────────────
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
          <input type="number" placeholder="金額" value={p.amount} onChange={e=>updatePayer(i,"amount",e.target.value)} style={{...iStyle,width:90,marginBottom:0,textAlign:"right"}}/>
          {payers.length>1 && <button onClick={()=>removePayer(i)} style={{background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:16,padding:"0 2px"}}>✕</button>}
        </div>
      ))}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
        <button onClick={addPayer} style={{background:"none",border:`1.5px dashed ${T.border}`,borderRadius:8,padding:"5px 10px",fontSize:12,color:T.textSub,cursor:"pointer"}}>＋ 加付款人</button>
        <span style={{fontSize:11,color:Math.abs(diff)>0.01?T.accent:T.green}}>{pt>0&&(Math.abs(diff)>0.01?`⚠️ 差 NT$${Math.abs(diff).toFixed(0)}`:"✓ 金額正確")}</span>
      </div>
    </div>
  );
}

// ── Expense Form ──────────────────────────────────────────────────────
// Generate time options every 5 minutes
const TIME_OPTIONS = [];
for(let h=0;h<24;h++) for(let m=0;m<60;m+=5)
  TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);

function ExpenseForm({initial,members,colors,cats,onSave,onCancel,onDelete}) {
  const [name,setName] = useState(initial.name||"");
  const [total,setTotal] = useState(initial.total||"");
  const [date,setDate] = useState(initial.date||new Date().toISOString().slice(0,10));
  // Parse initial time from ts if available, else round down to nearest 5-min
  const initTime = () => {
    if(initial.ts) {
      const d=new Date(initial.ts);
      const h=String(d.getHours()).padStart(2,"0");
      const m=String(Math.floor(d.getMinutes()/5)*5).padStart(2,"0");
      return `${h}:${m}`;
    }
    const now=new Date();
    const h=String(now.getHours()).padStart(2,"0");
    const m=String(Math.floor(now.getMinutes()/5)*5).padStart(2,"0");
    return `${h}:${m}`;
  };
  const [time,setTime] = useState(initTime);
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
    if(Math.abs(paidSum-pt)>0.1){alert(`付款金額加總 NT$${paidSum} 與總金額 NT$${pt} 不符`);return;}
    // Build ts from date + selected time
    const ts = new Date(`${date}T${time}:00`).toISOString();
    onSave({name,total:pt,date,ts,category,payers:payers.map(p=>({name:p.name,amount:parseFloat(p.amount)||0})),splits,splitMode,splitData});
  }
  const handleTotalChange = (val) => {
    setTotal(val);
    if(payers.length===1) setPayers([{...payers[0], amount:val}]);
  };
  return (
    <div style={{background:"#fff",borderRadius:20,padding:"16px 14px 12px",marginBottom:12,boxShadow:"0 4px 20px rgba(180,130,40,0.13)"}}>
      <div style={{fontSize:11,color:T.yellowDk,fontWeight:700,marginBottom:10}}>{onDelete?"✏️ 編輯消費":"🧾 新增消費"}</div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input placeholder="項目名稱" value={name} onChange={e=>setName(e.target.value)}
          style={{...iStyle,flex:1,marginBottom:0,fontSize:15,fontWeight:700,textAlign:"center",height:42}}/>
        <input type="number" placeholder="總金額" value={total} onChange={e=>handleTotalChange(e.target.value)}
          style={{...iStyle,flex:1,marginBottom:0,fontSize:15,fontWeight:800,textAlign:"center",color:T.text,height:42}}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <div style={{flex:1}}><CategoryPicker value={category} onChange={setCategory} cats={cats}/></div>
        <div style={{flex:1,display:"flex",gap:4}}>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...iStyle,marginBottom:0,flex:1,minHeight:40}}/>
          <select value={time} onChange={e=>setTime(e.target.value)} style={{...iStyle,marginBottom:0,width:80,minHeight:40,padding:"0 6px",flexShrink:0}}>
            {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{background:"#FFF8E1",border:`1.5px solid ${T.yellowLt}`,borderRadius:12,padding:"10px 12px",marginBottom:6}}>
        <div style={{fontSize:10,color:T.yellowDk,fontWeight:700,marginBottom:6}}>付款人</div>
        <PayersEditor payers={payers} setPayers={setPayers} members={members} total={total}/>
      </div>
      <div style={{background:"#F3F8FF",border:"1.5px solid #BBDEFB",borderRadius:12,padding:"10px 12px",marginBottom:10}}>
        <div style={{fontSize:10,color:"#1565C0",fontWeight:700,marginBottom:6}}>分帳方式</div>
        <SplitEditor mode={splitMode} setMode={setSplitMode} data={splitData} setData={setSplitData} members={members} colors={colors} total={total}/>
      </div>
      <div style={{display:"flex",gap:6,justifyContent:"flex-end",alignItems:"center"}}>
        {onDelete && <button onClick={onDelete} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",padding:"4px 6px",opacity:0.5}}>🗑️</button>}
        <button onClick={onCancel} style={{padding:"6px 14px",background:"none",border:`1.5px solid ${T.border}`,borderRadius:20,color:T.textSub,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>取消</button>
        <button onClick={handleSave} style={{padding:"6px 18px",background:T.yellowMd,border:"none",borderRadius:20,color:T.text,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 0 "+T.yellowDk}}>{onDelete?"💾":"✅"}</button>
      </div>
    </div>
  );
}

// ── Payment Form ──────────────────────────────────────────────────────
function PaymentForm({members,me,onSave,onCancel,onDelete,initial,isEdit}) {
  const [form,setForm] = useState(initial||{from:me,to:members.find(m=>m!==me)||members[0],amount:"",date:new Date().toISOString().slice(0,10),note:""});
  function handleSave() {
    if(!form.amount||parseFloat(form.amount)<=0){alert("請輸入轉帳金額");return;}
    if(form.from===form.to){alert("轉出和收款不能是同一人");return;}
    onSave({...form,amount:parseFloat(form.amount)});
  }
  return (
    <div style={{background:"#F1FBF4",border:"1.5px solid #A5D6A7",borderRadius:16,padding:14,marginBottom:12,boxShadow:T.shadow}}>
      <div style={{fontSize:12,color:"#2E7D32",fontWeight:700,marginBottom:10}}>{isEdit?"✏️ 編輯轉帳":"💸 記錄轉帳"}</div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>轉出</div>
          <select value={form.from} onChange={e=>setForm({...form,from:e.target.value})} style={iStyle}>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
        </div>
        <div style={{fontSize:20,color:T.textMute,paddingTop:16}}>→</div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>收款</div>
          <select value={form.to} onChange={e=>setForm({...form,to:e.target.value})} style={iStyle}>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
        </div>
      </div>
      <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>金額</div>
      <input type="number" placeholder="NT$" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={iStyle}/>
      <div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>日期</div>
      <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={iStyle}/>
      <input placeholder="備註（選填）" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} style={iStyle}/>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <Btn onClick={handleSave} variant="green" style={{flex:1}}>{isEdit?"💾 儲存":"✅ 確認"}</Btn>
        <Btn onClick={onCancel} variant="secondary" style={{flex:1}}>取消</Btn>
        {onDelete && <Btn onClick={onDelete} variant="danger">🗑️</Btn>}
      </div>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────
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
          {[["personal","👤 個人"],["group","👥 群組"]].map(([k,l]) => (
            <button key={k} onClick={()=>{setViewMode(k);setSelectedCat(null);}} style={{flex:1,padding:"8px 0",borderRadius:10,border:`1.5px solid ${viewMode===k?T.yellowDk:T.border}`,background:viewMode===k?T.yellowLt:"#fff",color:viewMode===k?T.text:T.textSub,fontSize:13,fontWeight:viewMode===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        {viewMode==="personal" && (
          <select value={viewMember} onChange={e=>{setViewMember(e.target.value);setSelectedCat(null);}} style={{width:"100%",background:col+"18",border:`1.5px solid ${col}44`,color:col,borderRadius:10,padding:"7px 12px",fontSize:13,fontWeight:700,cursor:"pointer",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}>
            {members.map(m=><option key={m} value={m} style={{background:"#fff",color:T.text}}>{m}{m===me?" （我）":""}</option>)}
          </select>
        )}
      </div>
      {total===0 && <div style={{textAlign:"center",color:T.textMute,padding:40}}>尚無消費資料</div>}
      {total>0 && (
        <>
          <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
            <svg width={220} height={220} style={{overflow:"visible"}}>
              {slices.map((s,i) => (
                <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2} style={{cursor:"pointer",opacity:selectedCat&&selectedCat!==s.cat.id?0.35:1,transition:"opacity 0.2s"}} onClick={()=>setSelectedCat(selectedCat===s.cat.id?null:s.cat.id)}/>
              ))}
              <circle cx={cx} cy={cy} r={ir-2} fill={viewMode==="group"?T.yellowMd:col} opacity={0.15}/>
              <text x={cx} y={cy-10} textAnchor="middle" fontSize={20}>{viewMode==="group"?"👥":viewMember[0]}</text>
              <text x={cx} y={cy+6} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.text}>NT${dispTotal.toFixed(0)}</text>
              <text x={cx} y={cy+18} textAnchor="middle" fontSize={9} fill={T.textMute}>{selCat?selCat.label:viewMode==="group"?"群組總消費":"總消費"}</text>
            </svg>
          </div>
          <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:600}}>
            {selCat?`${selCat.icon} ${selCat.label}`:"各分類明細"}
            {selCat && <button onClick={()=>setSelectedCat(null)} style={{marginLeft:8,background:"none",border:"none",color:T.textMute,fontSize:11,cursor:"pointer"}}>✕ 清除</button>}
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

// ── Config Tab ────────────────────────────────────────────────────────
function ConfigTab({group,setGroups,bal,me,setExportModal,onGroupDeleted,isAdmin=false}) {
  const cats = group.categories||DEFAULT_CATS;
  const [section,setSection] = useState("members");
  const [editing,setEditing] = useState(null);
  const [newCat,setNewCat] = useState({icon:"",label:""});
  const [showAddCat,setShowAddCat] = useState(false);
  const [newMemberName,setNewMemberName] = useState("");
  const [editingGroupName,setEditingGroupName] = useState(false);
  const [groupNameInput,setGroupNameInput] = useState(group.name);

  function saveGroup(updater,detail) {
    setGroups(prev=>prev.map(g=>{
      if(g.id!==group.id) return g;
      const updated=updater(g);
      const finalGroup={...updated,logs:[{id:uid(),ts:now(),user:me,action:"設定變更",detail},...(updated.logs||[])]};
      setDoc(fsDoc(db,"groups",finalGroup.id),finalGroup).catch(console.error);
      return finalGroup;
    }));
  }

  function handleSaveGroupName() {
    const name=groupNameInput.trim();
    if(!name) return;
    saveGroup(g=>({...g,name}),`群組名稱改為「${name}」`);
    setEditingGroupName(false);
  }

  async function handleDeleteGroup() {
    if(!window.confirm(`確定要刪除「${group.name}」嗎？\n此操作無法復原，所有消費紀錄將永久刪除。`)) return;
    if(!window.confirm(`再次確認：永久刪除「${group.name}」？`)) return;
    try {
      await deleteDoc(fsDoc(db,"groups",group.id));
      setGroups(prev=>prev.filter(g=>g.id!==group.id));
      onGroupDeleted();
    } catch(e) { console.error(e); alert("刪除失敗，請稍後再試"); }
  }

  // Admin: disconnect a member's claim so they need to re-identify and lose group access
  function handleDisconnect(originalName) {
    const loginName = (group.claimedBy||{})[originalName];
    if(!window.confirm(`確定要斷開「${originalName}」的身分連結嗎？\n對方（${loginName||originalName}）將立即失去群組存取權，需重新認領身分才能進入。`)) return;
    saveGroup(g=>{
      const newClaimedBy={...g.claimedBy};
      delete newClaimedBy[originalName];
      const newClaimedUsers=(g.claimedUsers||[]).filter(u=>u!==loginName);
      return {...g,claimedBy:newClaimedBy,claimedUsers:newClaimedUsers};
    },`管理員斷開了「${originalName}」（${loginName||""}）的身分連結`);
  }

  function handleEditCat(cat) {
    saveGroup(g=>({...g,categories:g.categories.map(c=>c.id===cat.id?{...c,icon:editing.icon,label:editing.label}:c)}),`分類「${cat.label}」改為「${editing.icon} ${editing.label}」`);
    setEditing(null);
  }
  function handleDeleteCat(cat) {
    if(cats.length<=3){alert("至少保留 3 個分類");return;}
    saveGroup(g=>({...g,categories:g.categories.filter(c=>c.id!==cat.id)}),`刪除分類「${cat.label}」`);
  }
  function handleAddCat() {
    if(!newCat.icon||!newCat.label) return;
    saveGroup(g=>({...g,categories:[...(g.categories||DEFAULT_CATS),{id:uid(),...newCat}]}),`新增分類「${newCat.icon} ${newCat.label}」`);
    setNewCat({icon:"",label:""}); setShowAddCat(false);
  }
  function handleAddMember() {
    const name=newMemberName.trim();
    if(!name||group.members.includes(name)) return;
    const used=Object.values(group.colors||{});
    const color=MEMBER_COLORS.find(c=>!used.includes(c))||MEMBER_COLORS[0];
    saveGroup(g=>({...g,members:[...g.members,name],colors:{...g.colors,[name]:color}}),`新增成員「${name}」`);
    setNewMemberName("");
  }
  function handleRemoveMember(name) {
    const net=(bal[name]?.paid||0)-(bal[name]?.owes||0);
    if(Math.abs(net)>0.01){alert(`${name} 還有未結清帳款，無法移除`);return;}
    if(group.members.length<=2){alert("群組至少需要 2 位成員");return;}
    saveGroup(g=>({...g,members:g.members.filter(m=>m!==name)}),`移除成員「${name}」`);
  }

  const claimedBy = group.claimedBy||{};
  // reverse map: claimedUsername → originalName
  const claimedByReverse = {};
  Object.entries(claimedBy).forEach(([orig,user])=>{ claimedByReverse[user]=orig; });

  const TABS_CFG=[["members","👥 成員"],["categories","🏷️ 分類"],["settings","⚙️ 群組設定"]];

  return (
    <div>
      {/* ── 三個標籤 ── */}
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {TABS_CFG.map(([k,l])=>(
          <button key={k} onClick={()=>setSection(k)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${section===k?T.yellowDk:T.border}`,background:section===k?T.yellowLt:"#fff",color:section===k?T.text:T.textSub,fontSize:12,fontWeight:section===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      {/* ── 成員 ── */}
      {section==="members" && (
        <div>
          {group.members.map(m=>{
            const col=group.colors[m]||"#aaa";
            const net=(bal[m]?.paid||0)-(bal[m]?.owes||0);
            const canRemove=m!==group.adminUser&&Math.abs(net)<0.01&&group.members.length>2;
            const isClaimed = claimedBy.hasOwnProperty(m);
            const claimedByUser = claimedBy[m]; // login name of who claimed this
            const isMe = m===me;
            // Unclaimed: black avatar; Claimed: use member color
            const avatarColor = isClaimed ? col : "#333";
            return (
              <Card key={m} style={{padding:"10px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <Avatar name={m} color={avatarColor} size={40}/>
                    <div style={{position:"absolute",bottom:-2,right:-2,width:16,height:16,borderRadius:"50%",background:isClaimed?"#43A047":"#999",border:"2px solid #fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:8,color:"#fff"}}>{isClaimed?"✓":"?"}</span>
                    </div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                      {/* Show claimed login name if different from original name, else just the name */}
                      <span style={{fontSize:14,fontWeight:700,color:isClaimed?T.text:"#999"}}>
                        {isClaimed && claimedByUser!==m ? `${claimedByUser}` : m}
                      </span>
                      {isClaimed && claimedByUser!==m && (
                        <span style={{fontSize:11,color:T.textMute}}>({m})</span>
                      )}
                      {m===group.adminUser && <span>👑</span>}
                      {isMe && <span style={{background:T.yellowLt,color:T.yellowDk,border:`1px solid ${T.yellowMd}`,borderRadius:20,padding:"1px 6px",fontSize:11,fontWeight:700}}>我</span>}
                    </div>
                    {!isClaimed && (
                      <div style={{fontSize:11,color:"#999"}}>尚未有人認領</div>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                    {isAdmin && isClaimed && m!==me && (
                      <Btn onClick={()=>handleDisconnect(m)} variant="danger" style={{padding:"4px 8px",fontSize:11}}>斷開</Btn>
                    )}
                    {canRemove && (
                      <Btn onClick={()=>handleRemoveMember(m)} variant="danger" style={{padding:"4px 8px",fontSize:11}}>移除</Btn>
                    )}
                  </div>
                </div>
                {m!==group.adminUser&&group.members.length>2&&Math.abs(net)>0.01&&(
                  <div style={{fontSize:10,color:T.accent,marginTop:6,paddingTop:6,borderTop:`1px solid ${T.border}`}}>💸 有未結清帳款，無法移除</div>
                )}
              </Card>
            );
          })}
          <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:14,marginTop:6}}>
            <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:600}}>➕ 新增旅伴</div>
            <div style={{display:"flex",gap:8}}>
              <input placeholder="輸入名字" value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddMember()} style={{...iStyle,flex:1,marginBottom:0}}/>
              <Btn onClick={handleAddMember} style={{flexShrink:0,padding:"9px 14px"}}>新增</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── 分類 ── */}
      {section==="categories" && (
        <div>
          {cats.map(cat=>(
            <div key={cat.id} style={{marginBottom:8}}>
              {editing?.id===cat.id?(
                <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:12}}>
                  <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>圖示（輸入任意 emoji）</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{width:44,height:44,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{editing.icon||"?"}</div>
                    <input value={editing.icon} onChange={e=>setEditing({...editing,icon:e.target.value.slice(-2)||e.target.value.slice(-1)||""})} placeholder="輸入 emoji" style={{...iStyle,marginBottom:0,flex:1,fontSize:18}}/>
                  </div>
                  <input value={editing.label} onChange={e=>setEditing({...editing,label:e.target.value})} placeholder="分類名稱" style={{...iStyle,marginBottom:8}}/>
                  <div style={{display:"flex",gap:6}}>
                    <Btn onClick={()=>handleEditCat(cat)} style={{flex:1,padding:"8px 0"}}>儲存</Btn>
                    <Btn onClick={()=>setEditing(null)} variant="secondary" style={{flex:1,padding:"8px 0"}}>取消</Btn>
                  </div>
                </div>
              ):(
                <div style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.icon}</div>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:T.text}}>{cat.label}</span>
                  <Btn onClick={()=>setEditing({id:cat.id,icon:cat.icon,label:cat.label})} variant="ghost" style={{padding:"4px 8px",fontSize:12}}>✏️</Btn>
                  <Btn onClick={()=>handleDeleteCat(cat)} variant="danger" style={{padding:"4px 8px",fontSize:12}}>🗑️</Btn>
                </div>
              )}
            </div>
          ))}
          {showAddCat?(
            <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:12,marginTop:8}}>
              <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>圖示（輸入任意 emoji）</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:44,height:44,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{newCat.icon||"?"}</div>
                <input value={newCat.icon} onChange={e=>setNewCat({...newCat,icon:e.target.value.slice(-2)||e.target.value.slice(-1)||""})} placeholder="輸入 emoji" style={{...iStyle,marginBottom:0,flex:1,fontSize:18}}/>
              </div>
              <input value={newCat.label} onChange={e=>setNewCat({...newCat,label:e.target.value})} placeholder="分類名稱" style={{...iStyle,marginBottom:8}}/>
              <div style={{display:"flex",gap:6}}>
                <Btn onClick={handleAddCat} style={{flex:1,padding:"8px 0"}}>新增</Btn>
                <Btn onClick={()=>setShowAddCat(false)} variant="secondary" style={{flex:1,padding:"8px 0"}}>取消</Btn>
              </div>
            </div>
          ):(
            <button onClick={()=>setShowAddCat(true)} style={{width:"100%",marginTop:8,padding:"10px 0",background:"none",border:`2px dashed ${T.border}`,borderRadius:12,color:T.textSub,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>＋ 新增分類</button>
          )}
        </div>
      )}

      {/* ── 群組設定 ── */}
      {section==="settings" && (
        <div>
          {/* 匯出 CSV - 所有人都能用 */}
          <Card style={{padding:"12px 14px",marginBottom:8}}>
            <div style={{fontSize:12,color:T.textSub,fontWeight:700,marginBottom:8}}>📊 資料匯出</div>
            <button onClick={()=>{const r=exportGroupCSV(group,me);if(r)setExportModal({title:`${group.name} 明細`,content:r});}} style={{width:"100%",padding:"9px 0",background:"#E3F2FD",border:"1.5px solid #90CAF9",borderRadius:10,color:"#1565C0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📥 匯出明細 CSV</button>
          </Card>

          {/* 群組資訊 - 只有 admin 能改名/刪除 */}
          {isAdmin && (
            <Card style={{padding:"12px 14px",borderColor:T.yellowMd,background:T.yellowLt}}>
              <div style={{fontSize:12,color:T.yellowDk,fontWeight:700,marginBottom:12}}>👑 管理員設定</div>

              {/* 群組名稱 */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>群組名稱</div>
                {editingGroupName?(
                  <div style={{display:"flex",gap:8}}>
                    <input value={groupNameInput} onChange={e=>setGroupNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSaveGroupName()} style={{...iStyle,flex:1,marginBottom:0}}/>
                    <Btn onClick={handleSaveGroupName} style={{flexShrink:0,padding:"9px 12px",fontSize:12}}>儲存</Btn>
                    <Btn onClick={()=>{setEditingGroupName(false);setGroupNameInput(group.name);}} variant="secondary" style={{flexShrink:0,padding:"9px 12px",fontSize:12}}>取消</Btn>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:10,padding:"8px 12px"}}>
                    <span style={{flex:1,fontSize:14,fontWeight:700,color:T.text}}>{group.name}</span>
                    <Btn onClick={()=>setEditingGroupName(true)} variant="ghost" style={{padding:"2px 8px",fontSize:12}}>✏️</Btn>
                  </div>
                )}
              </div>

              {/* 群組代碼（唯讀） */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>群組代碼</div>
                <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:10,padding:"8px 12px"}}>
                  <span style={{fontFamily:"monospace",fontSize:16,fontWeight:800,letterSpacing:3,color:T.yellowDk,flex:1}}>{group.code}</span>
                  <span style={{fontSize:10,color:T.textMute}}>唯讀</span>
                </div>
              </div>

              {/* 刪除群組 */}
              <div style={{paddingTop:12,borderTop:`1px solid ${T.yellowMd}`}}>
                <Btn onClick={handleDeleteGroup} variant="danger" style={{width:"100%",padding:"10px 0",fontSize:13}}>🗑️ 刪除群組</Btn>
                <div style={{fontSize:10,color:T.textMute,textAlign:"center",marginTop:6}}>刪除後所有資料將永久消失，無法復原</div>
              </div>
            </Card>
          )}

          {!isAdmin && (
            <div style={{textAlign:"center",color:T.textMute,padding:"32px 20px",fontSize:13}}>
              <div style={{fontSize:28,marginBottom:8}}>🔒</div>
              <div>管理員設定僅限群組建立者操作</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────
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
  const rows = [["日期","項目","分類","總金額","付款人","分帳成員","我的分攤"]];
  [...group.expenses].sort((a,b)=>a.date.localeCompare(b.date)).forEach(e => {
    const payers = e.payers.map(p=>`${p.name}(NT$${p.amount})`).join("+");
    const splitMembers = Object.keys(e.splits).join("、");
    const myShare = me ? (e.splits[me]||0).toFixed(2) : "";
    rows.push([e.date, e.name, getCatLabel(e.category), e.total, payers, splitMembers, myShare]);
  });
  const payments = group.payments || [];
  [...payments].sort((a,b)=>a.date.localeCompare(b.date)).forEach(p => {
    rows.push([p.date, `[轉帳] ${p.from}→${p.to}`, "轉帳", p.amount, p.from, p.to, ""]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const ok = downloadFile(`${group.name}_${new Date().toISOString().slice(0,10)}.csv`, "\uFEFF"+csv, "text/csv;charset=utf-8");
  if(!ok) return csv;
  return null;
}

function exportBackupJSON(groups) {
  const json = JSON.stringify({version:1, exportedAt:new Date().toISOString(), groups}, null, 2);
  const ok = downloadFile(`旅遊分帳備份_${new Date().toISOString().slice(0,10)}.json`, json, "application/json");
  if(!ok) return json;
  return null;
}

// ── Main App ──────────────────────────────────────────────────────────
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
  const [homePanel,setHomePanel] = useState(null);
  const [pendingGroupCode,setPendingGroupCode] = useState(null);
  // ── Owner dashboard state ──
  const [ownerGroups,setOwnerGroups] = useState([]);
  const [ownerLoading,setOwnerLoading] = useState(false);
  const [expandedGroup,setExpandedGroup] = useState(null);
  const [ownerTab,setOwnerTab] = useState("groups");
  const importFileRef = useRef(null);

  function handleImportBackup(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if(!data.groups) { alert("備份格式不正確"); return; }
        if(window.confirm(`確定要匯入 ${data.groups.length} 個群組嗎？\n現有資料會被合併（不會刪除）`)) {
          setGroups(prev => {
            const existingIds = new Set(prev.map(g=>g.id));
            const toAdd = data.groups.filter(g=>!existingIds.has(g.id));
            const toUpdate = data.groups.filter(g=>existingIds.has(g.id));
            const merged = prev.map(g => { const u=toUpdate.find(x=>x.id===g.id); return u||g; });
            return [...merged, ...toAdd];
          });
          alert("匯入成功！");
        }
      } catch { alert("備份檔案無法讀取"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── 修改一：解析登入狀態，支援群組 URL ────────────────────────────
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    // 群組 URL 格式：#group/CODEXXX
    if(hash.startsWith("group/")) {
      const code = hash.replace("group/","").toUpperCase();
      setPendingGroupCode(code);
      // 還需要確認使用者身分
      try {
        const _u = localStorage.getItem("splitapp:user");
        if(_u){const {username}=JSON.parse(_u); if(username){setCurrentUser(username);setScreen("home");return;}}
      } catch {}
      setScreen("login");
      return;
    }
    try {
      if(hash) {
        const username = decodeURIComponent(hash);
        if(username && !username.includes("/")) { setCurrentUser(username); setScreen("home"); return; }
      }
      const _u = localStorage.getItem("splitapp:user");
      if(_u){const {username}=JSON.parse(_u); if(username){setCurrentUser(username);setScreen("home");return;}}
    } catch {}
    setScreen("login");
  }, []);

  // ── 修改二：登入後監聽 Firestore + 處理 pendingGroupCode ─────────
  useEffect(() => {
    if(!currentUser) return;

    const ensureInitialGroup = async () => {
      try {
        const docRef = fsDoc(db, "groups", "clearing2026");
        const docSnap = await getDoc(docRef);
        if(!docSnap.exists()) {
          await setDoc(docRef, buildInitialGroup());
        } else {
          // Patch: if existing doc is missing claimedUsers, add it
          const data = docSnap.data();
          if(!data.claimedUsers) {
            const claimedUsers = Object.values(data.claimedBy||{});
            await setDoc(docRef, {...data, claimedUsers}, {merge:true});
          }
        }
      } catch(e) { console.error("初始群組寫入失敗:", e); }
    };
    ensureInitialGroup();

    const q = query(collection(db, "groups"), where("claimedUsers", "array-contains", currentUser));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreGroups = snapshot.docs.map(d => d.data());
      setGroups(firestoreGroups);
      // Patch any group missing claimedUsers (migration for old data)
      snapshot.docs.forEach(d => {
        const data = d.data();
        if(!data.claimedUsers) {
          const claimedUsers = Object.values(data.claimedBy||{});
          setDoc(d.ref, {...data, claimedUsers}, {merge:true}).catch(console.error);
        }
      });
    }, (error) => {
      console.error("Firestore sync error:", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ── 修改三：登入後若有 pendingGroupCode，自動觸發加入流程 ─────────
  useEffect(() => {
    if(!currentUser || !pendingGroupCode || screen !== "home") return;
    // 等群組資料載入後再處理
    const timer = setTimeout(async () => {
      const code = pendingGroupCode;
      setPendingGroupCode(null);
      // 清除 hash，避免重複觸發
      try { window.location.hash = encodeURIComponent(currentUser); } catch {}
      await triggerJoinByCode(code);
    }, 800);
    return () => clearTimeout(timer);
  }, [currentUser, pendingGroupCode, screen]);

  // ── 共用：用代碼加入群組的核心邏輯 ──────────────────────────────
  async function triggerJoinByCode(code) {
    let g = groups.find(x=>x.code===code);
    if(!g) {
      try {
        const q = query(collection(db, "groups"), where("code", "==", code));
        const snapshot = await getDocs(q);
        if(!snapshot.empty) {
          g = snapshot.docs[0].data();
          setGroups(prev=>{
            const ids=new Set(prev.map(x=>x.id));
            return ids.has(g.id) ? prev : [...prev, g];
          });
        }
      } catch(e) { console.error(e); }
    }
    if(!g){ setError("找不到此群組 🔍"); return; }
    // 只有 claimedUsers 裡有這個登入名稱，才直接進入
    const alreadyClaimed = (g.claimedUsers||[]).includes(currentUser);
    if(alreadyClaimed) {
      setCurrentGroupId(g.id); setActiveTab("expenses"); setScreen("group"); return;
    }
    // 否則一律顯示認領畫面
    setClaimScreen({groupId:g.id, code});
  }

  useEffect(() => {
    if(currentUser) {
      try { localStorage.setItem("splitapp:user",JSON.stringify({username:currentUser})); } catch {}
      // 只有非群組 URL 時才寫入 hash
      if(!pendingGroupCode) {
        try { window.location.hash = encodeURIComponent(currentUser); } catch {}
      }
    }
  },[currentUser]);

  const currentGroup = groups.find(g=>g.id===currentGroupId);

  function getNextColor(existingColors) {
    const used = Object.values(existingColors||{});
    return MEMBER_COLORS.find(c=>!used.includes(c))||MEMBER_COLORS[0];
  }

  // ── 後台密碼（隱藏入口）──────────────────────────────────────────
  const OWNER_SECRET = "carly-admin-2026";

  async function handleLogin() {
    const name = usernameInput.trim();
    if (!name) { setError("請輸入使用者名稱"); return; }
    // Secret owner backdoor
    if (name === OWNER_SECRET) {
      setScreen("ownerDashboard");
      setUsernameInput("");
      setError("");
      return;
    }
    setCurrentUser(name);
    setScreen("home");
    setError("");
  }

  function handleCreateGroup() {
    const name=newGroupName.trim();
    const pin=newGroupPin.trim();
    if(!name){setError("請輸入群組名稱");return;}
    if(!pin||pin.length<4){setError("請設定至少 4 位數的管理員 PIN 碼");return;}
    const g={id:uid(),name,code:Math.random().toString(36).slice(2,8).toUpperCase(),adminUser:currentUser,adminPin:pin,members:[currentUser],colors:{[currentUser]:getNextColor({})},claimedBy:{[currentUser]:currentUser},claimedUsers:[currentUser],categories:[...DEFAULT_CATS],payments:[],expenses:[],logs:[{id:uid(),ts:now(),user:currentUser,action:"建立群組",detail:`建立了群組「${name}」`}]};
    setDoc(fsDoc(db, "groups", g.id), g).catch(console.error);
    setGroups(prev=>[...prev,g]);
    // 建立後直接進入設定→成員頁，讓 admin 馬上新增旅伴
    // 也同時把 PIN 驗證標記為已通過，這樣不用再輸入一次
    setVerifiedAdminGroups(prev=>new Set([...prev,g.id]));
    setNewGroupName(""); setNewGroupPin(""); setCurrentGroupId(g.id); setActiveTab("config"); setScreen("group"); setError("");
    setHomePanel(null);
  }

  async function handleJoinGroup() {
    const code=joinCode.trim().toUpperCase();
    if(!code){setError("請輸入群組代碼");return;}
    await triggerJoinByCode(code);
    setJoinCode("");
  }

  function handleClaimIdentity(memberName) {
    const g=groups.find(x=>x.id===claimScreen.groupId);
    if(!g) return;
    if(memberName==="__new__") {
      // Add as a brand new member
      const color=getNextColor(g.colors);
      setGroups(prev=>prev.map(x=>{
        if(x.id!==g.id) return x;
        const updated={
          ...x,
          members:[...x.members,currentUser],
          colors:{...x.colors,[currentUser]:color},
          claimedBy:{...x.claimedBy,[currentUser]:currentUser},
          claimedUsers:[...(x.claimedUsers||[]),currentUser],
          logs:[{id:uid(),ts:now(),user:currentUser,action:"加入群組",detail:`${currentUser} 以新成員身分加入`},...(x.logs||[])]
        };
        setDoc(fsDoc(db,"groups",updated.id),updated).catch(console.error);
        return updated;
      }));
    } else {
      // Claim an existing member slot — do NOT rename members array
      // Just record the mapping: originalName → loginName
      const originalName=memberName;
      setGroups(prev=>prev.map(x=>{
        if(x.id!==g.id) return x;
        const newClaimedBy={...x.claimedBy,[originalName]:currentUser};
        const newClaimedUsers=[...(x.claimedUsers||[]).filter(u=>u!==currentUser),currentUser];
        const logs=[{id:uid(),ts:now(),user:currentUser,action:"認領身分",detail:`${currentUser} 認領了「${originalName}」的身分`},...(x.logs||[])];
        const updated={...x,claimedBy:newClaimedBy,claimedUsers:newClaimedUsers,logs};
        setDoc(fsDoc(db,"groups",updated.id),updated).catch(console.error);
        return updated;
      }));
    }
    setCurrentGroupId(claimScreen.groupId); setActiveTab("expenses"); setScreen("group"); setClaimScreen(null);
  }

  // ── Security: redirect if user lost group access (must be before any early returns) ──
  useEffect(()=>{
    if(screen==="group" && currentGroup && !(currentGroup.claimedUsers||[]).includes(currentUser)) {
      setScreen("home"); setCurrentGroupId(null);
    }
  },[screen, currentGroup, currentUser]);

  // ── Owner Dashboard data loader (must be before any early returns) ──
  useEffect(()=>{
    if(screen!=="ownerDashboard") return;
    setOwnerLoading(true);
    const q2 = collection(db,"groups");
    const unsub = onSnapshot(q2,(snap)=>{
      setOwnerGroups(snap.docs.map(d=>d.data()));
      setOwnerLoading(false);
    });
    return ()=>unsub();
  },[screen]);

  // ── Claim Screen ──────────────────────────────────────────────────
  if(claimScreen) {
    const g=groups.find(x=>x.id===claimScreen.groupId);
    if(!g) return null;
    // claimedBy maps originalName → currentUsername
    // Show all members who haven't been claimed by anyone yet
    const claimedOriginalNames = Object.keys(g.claimedBy||{});
    const unclaimed = g.members.filter(m => !claimedOriginalNames.includes(m));
    return (
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,padding:24,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>👤</div>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>選擇你的身分</div>
        <div style={{fontSize:13,color:T.textMute,marginBottom:4,textAlign:"center"}}>群組：{g.name}</div>
        <div style={{fontSize:12,color:T.textSub,marginBottom:24,textAlign:"center"}}>選擇你在群組中的身分，或以新成員加入</div>
        <div style={{width:"100%",maxWidth:360}}>
          {unclaimed.map(m => (
            <Card key={m} onClick={()=>handleClaimIdentity(m)} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",marginBottom:8}}>
              <Avatar name={m} color={g.colors[m]||"#aaa"} size={38}/>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>{m}</div><div style={{fontSize:11,color:T.textMute}}>點選認領此身分</div></div>
              <span style={{fontSize:18,color:T.textMute}}>›</span>
            </Card>
          ))}
          <Card onClick={()=>handleClaimIdentity("__new__")} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",borderStyle:"dashed"}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>＋</div>
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>以新成員加入</div><div style={{fontSize:11,color:T.textMute}}>以「{currentUser}」新增到群組</div></div>
          </Card>
          <Btn onClick={()=>setClaimScreen(null)} variant="ghost" style={{width:"100%",marginTop:8,textAlign:"center"}}>← 取消</Btn>
        </div>
      </div>
    );
  }

  // ── Group Screen ──────────────────────────────────────────────────
  if(screen==="group"&&currentGroup) {
    const g=currentGroup;
    // Guard: still rendering but access check above will redirect
    if(!(g.claimedUsers||[]).includes(currentUser)) return null;
    const isAdmin=g.adminUser===currentUser && (g.adminPin==null || verifiedAdminGroups.has(g.id));
    const me=currentUser;
    const claimedBy=g.claimedBy||{};
    // Build reverse map: loginName → originalName
    const loginToOriginal={};
    Object.entries(claimedBy).forEach(([orig,login])=>{ loginToOriginal[login]=orig; });
    // Find this user's original member name
    const myOriginalName=loginToOriginal[currentUser]
      || (g.members.includes(currentUser) ? currentUser : currentUser);
    // Normalize a name: if it's a login name in the map, convert to original
    const toOrig = n => loginToOriginal[n] || n;
    const {colors,logs}=g;
    const members=g.members;
    const expenses=g.expenses.map(e=>({
      ...e,
      payers: e.payers.map(p=>({...p, name: toOrig(p.name)})),
      splits: Object.fromEntries(Object.entries(e.splits).map(([k,v])=>[toOrig(k),v])),
    }));
    const payments=(g.payments||[]).map(p=>({
      ...p,
      from: toOrig(p.from),
      to: toOrig(p.to),
    }));
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
    const myBal=bal[myOriginalName]||{paid:0,owes:0};
    const myNet=myBal.paid-myBal.owes;
    const mySpend=myBal.owes;
    const myPaid=myBal.paid;
    const totalAll=expenses.reduce((s,e)=>s+e.total,0);
    const transfers=minimizeTransfers(bal);
    const grouped={};
    expenses.forEach(e=>{if(!grouped[e.date])grouped[e.date]=[];grouped[e.date].push({...e,_type:"expense"});});
    payments.forEach(p=>{if(!grouped[p.date])grouped[p.date]=[];grouped[p.date].push({...p,_type:"payment"});});
    Object.keys(grouped).forEach(d=>grouped[d].sort((a,b)=>(b.ts||b.id).localeCompare(a.ts||a.id)));
    const sortedDates=Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
    function updateGroup(updater,logEntry) {
      setGroups(prev=>prev.map(x=>{
        if(x.id!==g.id) return x;
        const updated=updater(x);
        const finalGroup = {...updated,logs:[logEntry,...(updated.logs||[])]};
        setDoc(fsDoc(db, "groups", finalGroup.id), finalGroup).catch(console.error);
        return finalGroup;
      }));
    }
    function handleAddExpense(form) {
      const e={id:uid(),...form};
      updateGroup(x=>({...x,expenses:[...x.expenses,e]}),{id:uid(),ts:now(),user:me,action:"新增消費",detail:`新增「${form.name}」NT$${form.total}，${form.payers.map(p=>`${p.name}付NT$${p.amount}`).join("、")}`});
      setShowAdd(false);
    }
    function handleEditExpense(form) {
      const old=expenses.find(e=>e.id===editingId);
      const diffs=[];
      if(old?.name!==form.name) diffs.push(`名稱：${old?.name} → ${form.name}`);
      if(old?.total!==form.total) diffs.push(`金額：NT$${old?.total} → NT$${form.total}`);
      if(old?.date!==form.date) diffs.push(`日期：${old?.date} → ${form.date}`);
      if(old?.category!==form.category) diffs.push(`分類：${getCat(old?.category,cats)?.label} → ${getCat(form.category,cats)?.label}`);
      const oldP=(old?.payers||[]).map(p=>`${p.name}NT$${p.amount}`).join("+");
      const newP=form.payers.map(p=>`${p.name}NT$${p.amount}`).join("+");
      if(oldP!==newP) diffs.push(`付款：${oldP} → ${newP}`);
      if(Object.keys(old?.splits||{}).sort().join(",")!==Object.keys(form.splits||{}).sort().join(",")) diffs.push("分帳成員變更");
      const detail=diffs.length?`編輯「${old?.name}」：${diffs.join("；")}`:`編輯「${old?.name}」（無變動）`;
      updateGroup(x=>({...x,expenses:x.expenses.map(e=>e.id!==editingId?e:{...e,...form})}),{id:uid(),ts:now(),user:me,action:"編輯消費",detail});
      setEditingId(null);
    }
    function handleDeleteExpense(id) {
      const e=expenses.find(x=>x.id===id);
      updateGroup(x=>({...x,expenses:x.expenses.filter(ex=>ex.id!==id)}),{id:uid(),ts:now(),user:me,action:"刪除消費",detail:`刪除「${e?.name}」NT$${e?.total}`});
      setEditingId(null);
    }
    function handleAddPayment(form) {
      const p={id:uid(),ts:now(),...form};
      updateGroup(x=>({...x,payments:[...(x.payments||[]),p]}),{id:uid(),ts:now(),user:me,action:"記錄轉帳",detail:`${form.from} → ${form.to} NT$${form.amount}${form.note?" ("+form.note+")":""}`});
    }
    function handleEditPayment(form) {
      const old=payments.find(p=>p.id===editingPaymentId);
      const diffs=[];
      if(old?.from!==form.from) diffs.push(`轉出：${old?.from} → ${form.from}`);
      if(old?.to!==form.to) diffs.push(`收款：${old?.to} → ${form.to}`);
      if(old?.amount!==form.amount) diffs.push(`金額：NT$${old?.amount} → NT$${form.amount}`);
      if(old?.date!==form.date) diffs.push(`日期：${old?.date} → ${form.date}`);
      const detail=diffs.length?`編輯轉帳：${diffs.join("；")}`:"編輯轉帳（無變動）";
      updateGroup(x=>({...x,payments:(x.payments||[]).map(p=>p.id!==editingPaymentId?p:{...p,...form,amount:parseFloat(form.amount)})}),{id:uid(),ts:now(),user:me,action:"編輯轉帳",detail});
      setEditingPaymentId(null);
    }
    function handleDeletePayment(id) {
      const p=payments.find(x=>x.id===id);
      updateGroup(x=>({...x,payments:(x.payments||[]).filter(pm=>pm.id!==id)}),{id:uid(),ts:now(),user:me,action:"刪除轉帳",detail:`刪除 ${p?.from} → ${p?.to} NT$${p?.amount}`});
      setEditingPaymentId(null);
    }
    const emptyForm=()=>({name:"",total:"",date:new Date().toISOString().slice(0,10),category:"food",payers:[{name:myOriginalName,amount:""}],splitMode:"equal",splitData:{},splits:{}});
    const TABS=[["expenses","明細"],["settle","結算"],["analytics","分析"],["logs","紀錄"],
      ...(isAdmin ? [["config","設定"]] : [])
    ];
    return (
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,paddingBottom:50}}>
        <div style={{background:T.yellowLt,padding:"14px 16px 0",boxShadow:"0 2px 8px rgba(200,150,0,0.12)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <button onClick={()=>{setScreen("home");setCurrentGroupId(null);}} style={{background:"rgba(255,255,255,0.7)",border:"none",borderRadius:10,width:32,height:32,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>{g.name}</div>
              <div style={{fontSize:10,color:T.yellowDk,fontWeight:600}}>代碼 {g.code} · {members.length}人{isAdmin?" · 👑":""}</div>
            </div>
            <button onClick={()=>{const url=`${window.location.origin}${window.location.pathname}#group/${g.code}`;navigator.clipboard.writeText(url).then(()=>alert("連結已複製！分享給朋友就能直接進入群組 🎉")).catch(()=>alert(`請複製此連結：\n${url}`));}} style={{background:"rgba(255,255,255,0.7)",border:"none",borderRadius:10,width:32,height:32,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="複製群組連結">🔗</button>
            <Avatar name={me} color={colors[me]||"#aaa"} size={30}/>
          </div>
          <div style={{background:"rgba(255,255,255,0.75)",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:10,color:T.yellowDk,fontWeight:700,marginBottom:8}}>
              我的帳（{me}{myOriginalName!==me?` → ${myOriginalName}`:""}）
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0}}>
              <div style={{paddingRight:10,borderRight:`1.5px solid ${T.border}`}}>
                <div style={{fontSize:10,color:T.textMute,marginBottom:2}}>我墊付</div>
                <div style={{fontSize:16,fontWeight:800,color:T.yellowDk,lineHeight:1.2}}>NT${myPaid.toLocaleString()}</div>
              </div>
              <div style={{paddingLeft:10,paddingRight:10,borderRight:`1.5px solid ${T.border}`}}>
                <div style={{fontSize:10,color:T.textMute,marginBottom:2}}>我的消費</div>
                <div style={{fontSize:16,fontWeight:800,color:T.text,lineHeight:1.2}}>NT${mySpend.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</div>
              </div>
              <div style={{paddingLeft:10}}>
                <div style={{fontSize:10,color:T.textMute,marginBottom:2}}>{myNet>=0?"別人欠我":"我欠別人"}</div>
                <div style={{fontSize:16,fontWeight:800,color:myNet>=0?T.green:T.accent,lineHeight:1.2}}>NT${Math.abs(myNet).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</div>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:0}}>
            {TABS.map(([k,l]) => {
              const isActive=activeTab===k;
              return (
                <button key={k} onClick={()=>setActiveTab(k)} style={{flex:1,padding:"9px 4px",background:isActive?"rgba(255,255,255,0.95)":"transparent",border:"none",borderRadius:"10px 10px 0 0",color:isActive?T.text:T.yellowDk,fontSize:12,fontWeight:isActive?800:600,cursor:"pointer",whiteSpace:"nowrap",borderBottom:isActive?`2.5px solid ${T.yellowDk}`:"2.5px solid transparent",transition:"all 0.15s"}}>{l}</button>
              );
            })}
          </div>
        </div>
        <div style={{padding:"14px 14px 0"}}>
          {error && <div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:10,fontSize:12,color:T.accent,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{error}</span><button onClick={()=>setError("")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:14}}>✕</button></div>}
          {activeTab==="expenses" && (
            <div>
              {/* ── 新增區：tab 切換 + 表單 ── */}
              {(showAdd||showPayment) && (
                <div style={{marginBottom:4}}>
                  {/* Tab switcher */}
                  <div style={{display:"flex",gap:0,marginBottom:12,background:"#f5f0e8",borderRadius:12,padding:3}}>
                    <button onClick={()=>{setShowAdd(true);setShowPayment(false);setEditingId(null);setEditingPaymentId(null);}}
                      style={{flex:1,padding:"8px 0",borderRadius:10,border:"none",background:showAdd?T.yellowMd:"transparent",color:T.text,fontSize:13,fontWeight:showAdd?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                      🧾 新增消費
                    </button>
                    <button onClick={()=>{setShowPayment(true);setShowAdd(false);setEditingId(null);setEditingPaymentId(null);}}
                      style={{flex:1,padding:"8px 0",borderRadius:10,border:"none",background:showPayment?T.yellowMd:"transparent",color:T.text,fontSize:13,fontWeight:showPayment?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                      💸 記錄轉帳
                    </button>
                  </div>
                  {showAdd && <ExpenseForm initial={emptyForm()} members={members} colors={colors} cats={cats} onSave={handleAddExpense} onCancel={()=>{setShowAdd(false);setShowPayment(false);}}/>}
                  {showPayment && <PaymentForm members={members} me={myOriginalName} onSave={f=>{handleAddPayment(f);setShowPayment(false);setShowAdd(false);}} onCancel={()=>{setShowPayment(false);setShowAdd(false);}}/>}
                </div>
              )}
              {sortedDates.length===0&&!showAdd&&!showPayment && <div style={{textAlign:"center",color:T.textMute,padding:40,fontSize:13}}>還沒有任何消費 🌴</div>}
              {sortedDates.map(date => (
                <div key={date}>
                  <div style={{fontSize:11,color:T.textMute,marginBottom:6,marginTop:12,fontWeight:700,letterSpacing:0.5}}>{fmtDate(date)}</div>
                  {grouped[date].map(item => {
                    if(item._type==="payment") {
                      const p=item, isMine=p.from===myOriginalName||p.to===myOriginalName;
                      if(editingPaymentId===p.id) return (
                        <div key={p.id} style={{marginBottom:10}}>
                          <PaymentForm members={members} me={myOriginalName} initial={{from:p.from,to:p.to,amount:String(p.amount),date:p.date,note:p.note||""}} onSave={f=>{handleEditPayment(f);}} onCancel={()=>setEditingPaymentId(null)} onDelete={()=>handleDeletePayment(p.id)} isEdit/>
                        </div>
                      );
                      return (
                        <Card key={p.id} onClick={()=>{setEditingPaymentId(p.id);setShowAdd(false);setShowPayment(false);setEditingId(null);}} style={{borderColor:isMine?"#A5D6A7":T.border,background:isMine?"#F1FBF4":T.bgCard,padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:36,height:36,borderRadius:10,background:"#E8F5E9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>💸</div>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                                <Avatar name={p.from} color={colors[p.from]||"#aaa"} size={18}/>
                                <span style={{fontSize:12,fontWeight:600,color:T.text}}>{p.from}</span>
                                <span style={{fontSize:11,color:T.textMute}}>→</span>
                                <Avatar name={p.to} color={colors[p.to]||"#aaa"} size={18}/>
                                <span style={{fontSize:12,fontWeight:600,color:T.text}}>{p.to}</span>
                              </div>
                              {p.note && <div style={{fontSize:10,color:T.textMute}}>{p.note}</div>}
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:16,fontWeight:800,color:"#2E7D32"}}>NT${p.amount.toLocaleString()}</div>
                              <div style={{fontSize:10,color:T.textMute}}>轉帳{p.ts?` · ${fmtTs(p.ts)}`:"" }</div>
                            </div>
                          </div>
                        </Card>
                      );
                    }
                    const e=item, myShare=e.splits[myOriginalName]||0, participants=Object.keys(e.splits);
                    const cat=getCat(e.category,cats), iAmPayer=e.payers.some(p=>p.name===myOriginalName);
                    if(editingId===e.id) return (
                      <ExpenseForm key={e.id} initial={{name:e.name,total:String(e.total),date:e.date,category:e.category||"food",payers:e.payers||[{name:members[0],amount:String(e.total)}],splitMode:e.splitMode||"equal",splitData:e.splitData||{},splits:e.splits}} members={members} colors={colors} cats={cats} onSave={handleEditExpense} onCancel={()=>setEditingId(null)} onDelete={()=>handleDeleteExpense(e.id)}/>
                    );
                    return (
                      <Card key={e.id} onClick={()=>{setEditingId(e.id);setShowAdd(false);setShowPayment(false);setEditingPaymentId(null);}} style={{borderColor:iAmPayer?T.yellowMd:T.border,background:iAmPayer?"#FFFDE7":T.bgCard}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                            <div style={{width:36,height:36,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.icon}</div>
                            <div><div style={{fontSize:14,fontWeight:700,color:T.text}}>{e.name}</div><div style={{fontSize:10,color:T.textMute}}>{cat.label}{e.ts?` · ${fmtTs(e.ts)}`:""}</div></div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                            {myShare>0 ? <div style={{fontSize:19,fontWeight:800,color:iAmPayer?T.yellowDk:T.text,lineHeight:1}}>NT${myShare%1===0?myShare.toFixed(0):myShare.toFixed(2)}</div> : <div style={{fontSize:12,color:T.textMute}}>不參與</div>}
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
                            {e.payers.length===1?`${e.payers[0].name} 付 NT$${e.total.toLocaleString()}`:e.payers.map(p=>`${p.name}NT$${p.amount}`).join("+")}
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
                {[myOriginalName,...members.filter(m=>m!==myOriginalName)].map(m => {
                  const {paid,owes}=bal[m]||{paid:0,owes:0}, net=paid-owes, col=colors[m]||"#aaa", isMe=m===myOriginalName;
                  const cleared=Math.abs(net)<0.5;
                  // Show login name if claimed
                  const displayName = (g.claimedBy||{})[m] || m;
                  return (
                    <div key={m} style={{background:isMe?T.yellowLt:T.bgCard,border:`1.5px solid ${isMe?T.yellowMd:T.border}`,borderRadius:12,padding:"10px 12px",boxShadow:T.shadow}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                        <Avatar name={m} color={col} size={22}/>
                        <span style={{fontWeight:700,fontSize:12,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayName}</span>
                        {m===g.adminUser && <span style={{fontSize:9}}>👑</span>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
                          <span style={{color:T.textMute}}>代墊</span>
                          <span style={{fontWeight:600,color:T.text}}>NT${paid.toLocaleString()}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
                          <span style={{color:T.textMute}}>消費</span>
                          <span style={{fontWeight:600,color:T.text}}>NT${owes.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</span>
                        </div>
                        <div style={{height:1,background:T.border,margin:"2px 0"}}/>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:10,color:T.textMute}}>{cleared?"":"收支"}</span>
                          {cleared
                            ? <span style={{fontSize:11,fontWeight:800,color:T.green}}>✅ 結清</span>
                            : <span style={{fontSize:13,fontWeight:800,color:net>=0?T.green:T.accent}}>{net>=0?"💰":"💸"}NT${Math.abs(net).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</span>
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:10,color:T.textMute,textAlign:"center",marginBottom:12}}>總消費 NT${totalAll.toLocaleString()}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,color:T.textSub,fontWeight:700}}>最少轉帳方案</div>
                <div style={{fontSize:11,color:T.textMute}}>{transfers.length} 筆即可結清</div>
              </div>
              {transfers.length===0 && <div style={{textAlign:"center",color:T.textMute,padding:24,fontSize:16}}>已全部結清 🥳</div>}
              {transfers.map((t,i) => {
                const isMyAction=t.from===myOriginalName||t.to===myOriginalName;
                const alreadyDone=payments.some(p=>p.from===t.from&&p.to===t.to&&Math.abs(p.amount-t.amount)<0.5);
                const markDone=()=>{handleAddPayment({from:t.from,to:t.to,amount:t.amount,date:new Date().toISOString().slice(0,10),note:"轉帳完成"});};
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
                          <span style={{fontSize:14}}>→</span>
                          <div style={{flex:1,height:1.5,background:T.border,borderRadius:2}}/>
                        </div>
                        {isMyAction&&!alreadyDone && <span style={{fontSize:10,color:T.yellowDk,fontWeight:700}}>{t.from===myOriginalName?"我要付":"我要收"}</span>}
                        {alreadyDone && <span style={{fontSize:10,color:"#2E7D32",fontWeight:700}}>✅ 已完成</span>}
                        {!alreadyDone && <button onClick={markDone} style={{marginTop:2,padding:"3px 12px",background:"#E8F5E9",border:"1.5px solid #A5D6A7",borderRadius:20,color:"#2E7D32",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>轉帳完成</button>}
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
          {activeTab==="analytics" && <AnalyticsTab expenses={expenses} members={members} colors={colors} cats={cats} me={myOriginalName}/>}
          {activeTab==="logs" && (
            <div>
              <div style={{fontSize:13,color:T.textSub,marginBottom:14,fontWeight:600}}>操作紀錄</div>
              {(logs||[]).length===0 && <div style={{textAlign:"center",color:T.textMute,padding:40}}>暫無紀錄</div>}
              {(logs||[]).map(l => (
                <Card key={l.id} style={{padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <Avatar name={l.user} color={colors[l.user]||"#aaa"} size={24}/>
                    <span style={{fontSize:12,fontWeight:700,color:colors[l.user]||T.textSub}}>{l.user}</span>
                    <span style={{marginLeft:"auto",fontSize:10,color:T.textMute}}>{fmtTsFull(l.ts)}</span>
                  </div>
                  <div style={{fontSize:11,color:T.yellowDk,marginBottom:2,fontWeight:700}}>{l.action}</div>
                  <div style={{fontSize:12,color:T.textSub}}>{l.detail}</div>
                </Card>
              ))}
            </div>
          )}
          {activeTab==="config" && (
            // 所有人進設定都需要 PIN（admin 驗證後才能看管理員功能，非 admin 驗證後只能看一般功能）
            !verifiedAdminGroups.has(g.id) && g.adminPin
              ? (
                <div style={{textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:32,marginBottom:12}}>🔐</div>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>需要 PIN 碼</div>
                  <div style={{fontSize:12,color:T.textSub,marginBottom:16}}>{g.adminUser===currentUser?"輸入你建立群組時設定的 PIN 碼":"輸入群組 PIN 碼以進入設定"}</div>
                  <input type="password" inputMode="numeric" placeholder="PIN 碼" value={adminPinInput} onChange={e=>setAdminPinInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(()=>{if(adminPinInput===g.adminPin){setVerifiedAdminGroups(prev=>new Set([...prev,g.id]));setAdminPinInput("");}else{setError("PIN 碼錯誤");setAdminPinInput("");}})() } style={{...iStyle,maxWidth:200,textAlign:"center",fontSize:18,letterSpacing:4,marginBottom:12}}/>
                  <Btn onClick={()=>{
                    if(adminPinInput===g.adminPin){
                      setVerifiedAdminGroups(prev=>new Set([...prev,g.id]));
                      setAdminPinInput("");
                    } else {
                      setError("PIN 碼錯誤");
                      setAdminPinInput("");
                    }
                  }} style={{width:"100%",maxWidth:200,padding:10}}>確認</Btn>
                </div>
              )
              : <ConfigTab
                  group={g}
                  setGroups={setGroups}
                  bal={bal}
                  me={myOriginalName}
                  isAdmin={isAdmin}
                  setExportModal={setExportModal}
                  onGroupDeleted={()=>{ setScreen("home"); setCurrentGroupId(null); }}
                />
          )}
        </div>
        {activeTab==="expenses" && (
          <div style={{position:"fixed",bottom:24,right:20,zIndex:500}}>
            <button
              onClick={()=>{
                const isOpen=showAdd||showPayment;
                if(isOpen){setShowAdd(false);setShowPayment(false);}
                else{setShowAdd(true);setShowPayment(false);setEditingId(null);setEditingPaymentId(null);}
              }}
              style={{width:54,height:54,borderRadius:"50%",background:(showAdd||showPayment)?T.text:T.yellowMd,border:"none",color:(showAdd||showPayment)?"#fff":T.text,fontSize:(showAdd||showPayment)?18:28,cursor:"pointer",boxShadow:`0 4px 16px ${(showAdd||showPayment)?"rgba(0,0,0,0.25)":"rgba(200,150,0,0.35)"}`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",fontFamily:"inherit"}}>
              {(showAdd||showPayment) ? "✕" : "＋"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Owner Dashboard ───────────────────────────────────────────────
  if(screen==="ownerDashboard") {
    const allUsers = {};
    ownerGroups.forEach(g=>{
      Object.entries(g.claimedBy||{}).forEach(([orig,login])=>{
        if(!allUsers[login]) allUsers[login]=[];
        allUsers[login].push({group:g.name, code:g.code, as:orig});
      });
    });
    return (
      <div style={{minHeight:"100vh",background:"#1a1a2e",fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:"#e0e0e0",padding:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div style={{fontSize:24}}>🛠️</div>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>Owner Dashboard</div>
            <div style={{fontSize:11,color:"#888"}}>旅遊分帳 · 系統管理視角</div>
          </div>
          <button onClick={()=>setScreen("login")} style={{marginLeft:"auto",background:"#333",border:"none",borderRadius:10,padding:"6px 14px",color:"#aaa",fontSize:12,cursor:"pointer"}}>← 離開</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
          {[["群組總數",ownerGroups.length,"📁"],["總使用者",Object.keys(allUsers).length,"👤"],["總消費筆數",ownerGroups.reduce((s,g)=>s+(g.expenses||[]).length,0),"🧾"]].map(([label,val,icon])=>(
            <div key={label} style={{background:"#16213e",borderRadius:12,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
              <div style={{fontSize:22,fontWeight:800,color:"#FFD54F"}}>{val}</div>
              <div style={{fontSize:11,color:"#888"}}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[["groups","📁 群組"],["users","👤 使用者"]].map(([k,l])=>(
            <button key={k} onClick={()=>setOwnerTab(k)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${ownerTab===k?"#FFD54F":"#333"}`,background:ownerTab===k?"#FFD54F22":"#16213e",color:ownerTab===k?"#FFD54F":"#aaa",fontSize:13,fontWeight:ownerTab===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        {ownerLoading && <div style={{textAlign:"center",color:"#888",padding:40}}>載入中...</div>}
        {!ownerLoading && ownerTab==="groups" && [...ownerGroups].sort((a,b)=>(b.logs?.[0]?.ts||"").localeCompare(a.logs?.[0]?.ts||"")).map(g=>(
          <div key={g.id} style={{background:"#16213e",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
            <div onClick={()=>setExpandedGroup(expandedGroup===g.id?null:g.id)} style={{padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{g.name}</div>
                <div style={{fontSize:11,color:"#888",marginTop:2}}>代碼 {g.code} · {(g.members||[]).length} 成員 · {(g.expenses||[]).length} 筆消費 · admin: {g.adminUser}</div>
              </div>
              <div style={{fontSize:12,color:"#FFD54F",fontWeight:700}}>NT${(g.expenses||[]).reduce((s,e)=>s+e.total,0).toLocaleString()}</div>
              <span style={{color:"#555",fontSize:12}}>{expandedGroup===g.id?"▲":"▼"}</span>
            </div>
            {expandedGroup===g.id && (
              <div style={{borderTop:"1px solid #2a2a3e",padding:"12px 16px"}}>
                <div style={{fontSize:11,color:"#FFD54F",fontWeight:700,marginBottom:8}}>成員連結狀態</div>
                {(g.members||[]).map(m=>{
                  const login=(g.claimedBy||{})[m];
                  return (
                    <div key={m} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,fontSize:12}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:login?"#43A047":"#555",flexShrink:0}}/>
                      <span style={{color:"#ddd",minWidth:100}}>{m}</span>
                      <span style={{color:login?"#81C784":"#666"}}>{login?`→ ${login}`:"尚未認領"}</span>
                    </div>
                  );
                })}
                <div style={{fontSize:11,color:"#FFD54F",fontWeight:700,marginBottom:8,marginTop:12}}>最近 5 筆消費</div>
                {[...(g.expenses||[])].sort((a,b)=>(b.ts||b.id).localeCompare(a.ts||a.id)).slice(0,5).map(e=>(
                  <div key={e.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4,color:"#bbb"}}>
                    <span>{e.date} · {e.name}</span>
                    <span style={{color:"#FFD54F"}}>NT${e.total.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{fontSize:11,color:"#FFD54F",fontWeight:700,marginBottom:8,marginTop:12}}>最近操作紀錄</div>
                {(g.logs||[]).slice(0,5).map(l=>(
                  <div key={l.id} style={{fontSize:11,color:"#888",marginBottom:3}}>
                    <span style={{color:"#aaa"}}>{fmtTsFull(l.ts)}</span> · <span style={{color:"#ddd"}}>{l.user}</span> · {l.detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!ownerLoading && ownerTab==="users" && (
          <div>
            {Object.entries(allUsers).sort((a,b)=>a[0].localeCompare(b[0])).map(([login,grps])=>(
              <div key={login} style={{background:"#16213e",borderRadius:12,padding:"12px 16px",marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:6}}>👤 {login}</div>
                {grps.map((g,i)=>(
                  <div key={i} style={{fontSize:12,color:"#888",marginBottom:3}}>
                    📁 {g.group} <span style={{color:"#555"}}>({g.code})</span> · 身分：<span style={{color:"#81C784"}}>{g.as}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


  // ── Export Modal ─────────────────────────────────────────────────
  if(exportModal) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:500,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:15}}>{exportModal.title}</div>
          <button onClick={()=>setExportModal(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:T.textSub}}>✕</button>
        </div>
        <div style={{fontSize:11,color:T.textSub,marginBottom:8}}>無法直接下載，請長按全選後複製，貼到 Excel 或記事本儲存</div>
        <textarea readOnly value={exportModal.content} style={{flex:1,border:`1px solid ${T.border}`,borderRadius:8,padding:8,fontSize:10,fontFamily:"monospace",resize:"none",outline:"none",minHeight:200}} onClick={e=>e.target.select()}/>
        <Btn onClick={()=>{try{navigator.clipboard.writeText(exportModal.content).then(()=>alert("已複製！"));}catch{alert("請手動選取複製");}}} style={{marginTop:10,width:"100%"}}>複製內容</Btn>
      </div>
    </div>
  );

  // ── Home Screen ───────────────────────────────────────────────────
  if(screen==="home") return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,padding:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <div style={{width:40,height:40,borderRadius:14,background:T.yellowMd,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:T.shadow}}>🏝️</div>
        <div><div style={{fontSize:17,fontWeight:800}}>旅遊分帳</div><div style={{fontSize:11,color:T.yellowDk,fontWeight:600}}>歡迎，{currentUser} 👋</div></div>
        <button onClick={()=>{setCurrentUser("");setUsernameInput("");try{localStorage.removeItem("splitapp:user");}catch{}try{window.location.hash="";}catch{}setScreen("login");}} style={{marginLeft:"auto",background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:20,padding:"5px 12px",color:T.textSub,fontSize:11,cursor:"pointer",fontWeight:600}}>登出</button>
      </div>
      {error && <div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.accent,display:"flex",justifyContent:"space-between"}}><span>{error}</span><button onClick={()=>setError("")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer"}}>✕</button></div>}

      {/* 我的群組 */}
      {groups.filter(g=>(g.claimedUsers||[]).includes(currentUser)).length>0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,color:T.textMute,marginBottom:10,fontWeight:700}}>我的群組</div>
          {groups.filter(g=>(g.claimedUsers||[]).includes(currentUser)).map(g => (
            <Card key={g.id} onClick={()=>{setCurrentGroupId(g.id);setActiveTab("expenses");setScreen("group");}} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
              <div style={{width:44,height:44,borderRadius:12,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🏝️</div>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>{g.name}</div><div style={{fontSize:11,color:T.textMute}}>{g.members.length} 位成員 · {g.code}{g.adminUser===currentUser?" · 👑":""}</div></div>
              <span style={{fontSize:18,color:T.textMute}}>›</span>
            </Card>
          ))}
        </div>
      )}

      {/* ── Accordion：建立 / 加入 ── */}
      <div style={{marginBottom:12}}>
        {/* 建立新群組 */}
        <div style={{border:`1.5px solid ${homePanel==="create"?T.yellowDk:T.border}`,borderRadius:16,marginBottom:8,overflow:"hidden",background:T.bgCard,boxShadow:T.shadow}}>
          <button onClick={()=>setHomePanel(homePanel==="create"?null:"create")} style={{width:"100%",padding:"13px 16px",background:"transparent",border:"none",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{fontSize:14,fontWeight:700,color:homePanel==="create"?T.yellowDk:T.text}}>＋ 建立新群組</span>
            <span style={{fontSize:12,color:T.textMute,transition:"transform 0.2s",display:"inline-block",transform:homePanel==="create"?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
          </button>
          {homePanel==="create" && (
            <div style={{padding:"0 16px 16px"}}>
              <input placeholder="群組名稱（例：沖繩五日遊 🌺）" value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} style={iStyle}/>
              <input type="password" inputMode="numeric" placeholder="管理員 PIN 碼（至少 4 位）" value={newGroupPin} onChange={e=>setNewGroupPin(e.target.value)} style={{...iStyle,letterSpacing:4}}/>
              <div style={{fontSize:10,color:T.textMute,marginBottom:10,marginTop:-4}}>PIN 碼用於保護管理員功能，請記好</div>
              <Btn onClick={handleCreateGroup} style={{width:"100%",padding:11,fontSize:14}}>建立</Btn>
            </div>
          )}
        </div>

        {/* 加入群組 */}
        <div style={{border:`1.5px solid ${homePanel==="join"?T.yellowDk:T.border}`,borderRadius:16,overflow:"hidden",background:T.bgCard,boxShadow:T.shadow}}>
          <button onClick={()=>setHomePanel(homePanel==="join"?null:"join")} style={{width:"100%",padding:"13px 16px",background:"transparent",border:"none",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{fontSize:14,fontWeight:700,color:homePanel==="join"?T.yellowDk:T.text}}>🔗 加入群組</span>
            <span style={{fontSize:12,color:T.textMute,transition:"transform 0.2s",display:"inline-block",transform:homePanel==="join"?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
          </button>
          {homePanel==="join" && (
            <div style={{padding:"0 16px 16px"}}>
              <input placeholder="輸入群組代碼" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&handleJoinGroup()} style={{...iStyle,fontFamily:"monospace",letterSpacing:3,textTransform:"uppercase"}}/>
              <Btn onClick={handleJoinGroup} variant="secondary" style={{width:"100%",padding:11,fontSize:14}}>加入</Btn>
            </div>
          )}
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={()=>{const r=exportBackupJSON(groups);if(r)setExportModal({title:"備份資料",content:r});}} style={{flex:1,padding:"10px 0",background:"#E8F5E9",border:"1.5px solid #A5D6A7",borderRadius:12,color:"#2E7D32",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📦 備份資料</button>
        <button onClick={()=>importFileRef.current?.click()} style={{flex:1,padding:"10px 0",background:"#FFF8E1",border:`1.5px solid ${T.yellowMd}`,borderRadius:12,color:T.yellowDk,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📂 匯入備份</button>
        <input ref={importFileRef} type="file" accept=".json" onChange={handleImportBackup} style={{display:"none"}}/>
      </div>
    </div>
  );

  // ── Login ─────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:60,marginBottom:8}}>🏝️</div>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>旅遊分帳</div>
      <div style={{fontSize:13,color:T.textMute,marginBottom:32}}>輸入你的名字開始使用</div>
      {error && <div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.accent,width:"100%",maxWidth:320,boxSizing:"border-box"}}>{error}</div>}
      <input placeholder="你叫什麼名字？" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{...iStyle,maxWidth:320,textAlign:"center",fontSize:16,marginBottom:12}}/>
      <Btn onClick={handleLogin} style={{width:"100%",maxWidth:320,padding:13,fontSize:15}}>出發！🌟</Btn>
    </div>
  );
}
