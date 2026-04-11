import { useState, useEffect, useRef } from "react";

// ── Theme ─────────────────────────────────────────────────────────────
const T = {
  bg:       "#FFFDF5",
  bgCard:   "#FFFFFF",
  yellow:   "#FFE566",
  yellowDk: "#D4A017",
  yellowLt: "#FFF3B0",
  yellowMd: "#FFD54F",
  accent:   "#FF6B4A",
  green:    "#3DAA6F",
  text:     "#3D2E1E",
  textSub:  "#8C7A6B",
  textMute: "#C4B09A",
  border:   "#F0E4C0",
  shadow:   "0 2px 10px rgba(180,130,40,0.10)",
  shadowMd: "0 4px 18px rgba(180,130,40,0.15)",
};

// ── Categories ────────────────────────────────────────────────────────
const CATEGORIES = [
  { id:"food",     icon:"🍜", label:"餐飲" },
  { id:"snack",    icon:"🧋", label:"飲料小食" },
  { id:"transport",icon:"🚗", label:"交通" },
  { id:"hotel",    icon:"🏨", label:"住宿" },
  { id:"spot",     icon:"🎡", label:"景點" },
  { id:"shop",     icon:"🛍️", label:"購物" },
  { id:"grocery",  icon:"🛒", label:"超市" },
  { id:"fuel",     icon:"⛽", label:"油錢" },
  { id:"parking",  icon:"🅿️", label:"停車" },
  { id:"ticket",   icon:"🎟️", label:"票券" },
  { id:"medical",  icon:"💊", label:"醫藥" },
  { id:"misc",     icon:"📦", label:"雜支" },
];
const getCat = id => CATEGORIES.find(c=>c.id===id) || CATEGORIES[CATEGORIES.length-1];

const MEMBER_COLORS = ["#E57373","#64B5F6","#81C784","#FFB74D","#BA68C8","#4DB6AC","#F06292","#A1887F","#90A4AE","#DCE775"];

function makeEqual(members, total) {
  const share = total / members.length;
  const r = {}; members.forEach(m => r[m] = share); return r;
}

// splits: { memberName: amount }
// payers: [{ name, amount }]
function calcSplits(splitMode, splitData, members, total) {
  // splitMode: "equal" | "amount" | "ratio"
  // splitData: { [name]: value }  (amount or ratio)
  // For "equal": splitData is list of members
  if (splitMode === "equal") {
    return makeEqual(splitData, total);
  }
  if (splitMode === "amount") {
    // fixed amounts for some, rest equal among others
    const fixed = {};
    const equalMembers = [];
    let fixedTotal = 0;
    members.forEach(m => {
      const v = parseFloat(splitData[m]);
      if (v > 0) { fixed[m] = v; fixedTotal += v; }
      else equalMembers.push(m);
    });
    const remaining = total - fixedTotal;
    const share = equalMembers.length > 0 ? remaining / equalMembers.length : 0;
    const result = { ...fixed };
    equalMembers.forEach(m => result[m] = Math.max(0, share));
    return result;
  }
  if (splitMode === "ratio") {
    const ratios = {};
    let ratioTotal = 0;
    members.forEach(m => {
      const v = parseFloat(splitData[m]) || 1;
      ratios[m] = v; ratioTotal += v;
    });
    const result = {};
    members.forEach(m => result[m] = (ratios[m] / ratioTotal) * total);
    return result;
  }
  return makeEqual(members, total);
}

function minimizeTransfers(balances) {
  const nets = Object.entries(balances).map(([name,{paid,owes}]) => ({ name, net: Math.round((paid-owes)*100)/100 }));
  const c = nets.filter(x=>x.net>0.01).sort((a,b)=>b.net-a.net).map(x=>({...x}));
  const d = nets.filter(x=>x.net<-0.01).sort((a,b)=>a.net-b.net).map(x=>({...x}));
  const transfers=[]; let i=0,j=0;
  while(i<c.length&&j<d.length){
    const amount=Math.min(c[i].net,-d[j].net);
    if(amount>0.01) transfers.push({from:d[j].name,to:c[i].name,amount:Math.round(amount*100)/100});
    c[i].net-=amount; d[j].net+=amount;
    if(Math.abs(c[i].net)<0.01)i++; if(Math.abs(d[j].net)<0.01)j++;
  }
  return transfers;
}

function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function fmtDate(d) { const dt=new Date(d+"T00:00:00"); return `${dt.getMonth()+1}月${dt.getDate()}日`; }
function now() { return new Date().toISOString(); }
function fmtTs(ts) {
  const d=new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function loadData(key) {
  try { const v=localStorage.getItem(key); return v?JSON.parse(v):null; } catch{ return null; }
}
function saveData(key,val) {
  try { localStorage.setItem(key,JSON.stringify(val)); } catch(e){ console.error(e); }
}

// ── Pre-loaded group ──────────────────────────────────────────────────
function buildClearingGroup(){
  const ALL=["安安","Carly","Michael","Chien","陳霆宇","邱于瑄"];
  const SG=["Carly","陳霆宇","Michael","邱于瑄"];
  const colors={"安安":MEMBER_COLORS[0],"Carly":MEMBER_COLORS[1],"Michael":MEMBER_COLORS[2],"Chien":MEMBER_COLORS[3],"陳霆宇":MEMBER_COLORS[4],"邱于瑄":MEMBER_COLORS[5]};
  const yu=(()=>{const f=180,r=1716-f,o=ALL.filter(m=>m!=="Michael"),s=r/o.length,res={};o.forEach(m=>res[m]=s);res["Michael"]=f;return res;})();
  const am={"Carly":95/6,"陳霆宇":95/6,"Chien":95/3,"Michael":95/3};
  const mk=(m,t)=>makeEqual(m,t);
  const expenses=[
    {id:"e1", name:"全聯",          category:"grocery", payers:[{name:"安安",amount:3476}],  total:3476, date:"2026-04-02", splits:mk(ALL,3476)},
    {id:"e2", name:"棺材板",        category:"food",    payers:[{name:"Carly",amount:155}],  total:155,  date:"2026-04-02", splits:mk(ALL,155)},
    {id:"e3", name:"強蛋餅",        category:"food",    payers:[{name:"Carly",amount:320}],  total:320,  date:"2026-04-02", splits:mk(ALL,320)},
    {id:"e4", name:"有A漫的咖啡店", category:"snack",   payers:[{name:"Michael",amount:750}], total:750,  date:"2026-04-02", splits:mk(SG,750)},
    {id:"e5", name:"一碗小",        category:"food",    payers:[{name:"Michael",amount:1255}],total:1255, date:"2026-04-02", splits:mk(ALL,1255)},
    {id:"e6", name:"檸檬汁",        category:"snack",   payers:[{name:"Michael",amount:60}],  total:60,   date:"2026-04-02", splits:mk(SG,60)},
    {id:"e7", name:"佳興冰果室",    category:"snack",   payers:[{name:"Michael",amount:1350}],total:1350, date:"2026-04-02", splits:mk(SG,1350)},
    {id:"e8", name:"住宿",          category:"hotel",   payers:[{name:"Carly",amount:9585}], total:9585, date:"2026-04-02", splits:mk(ALL,9585)},
    {id:"e9", name:"緬甸料理",      category:"food",    payers:[{name:"Chien",amount:2320}], total:2320, date:"2026-04-03", splits:mk(ALL,2320)},
    {id:"e10",name:"油錢",          category:"fuel",    payers:[{name:"Michael",amount:3416}],total:3416, date:"2026-04-03", splits:mk(SG,3416)},
    {id:"e11",name:"全家冰塊",      category:"grocery", payers:[{name:"陳霆宇",amount:118}], total:118,  date:"2026-04-03", splits:mk(ALL,118)},
    {id:"e12",name:"花生糖",        category:"snack",   payers:[{name:"Carly",amount:310}],  total:310,  date:"2026-04-04", splits:mk(["Carly","陳霆宇"],310)},
    {id:"e13",name:"超市",          category:"grocery", payers:[{name:"安安",amount:485}],   total:485,  date:"2026-04-04", splits:mk(ALL,485)},
    {id:"e14",name:"滷味",          category:"food",    payers:[{name:"陳霆宇",amount:645}], total:645,  date:"2026-04-04", splits:mk(ALL,645)},
    {id:"e15",name:"花蓮扁食",      category:"food",    payers:[{name:"Carly",amount:890}],  total:890,  date:"2026-04-04", splits:mk(ALL,890)},
    {id:"e16",name:"原野牧場",      category:"spot",    payers:[{name:"陳霆宇",amount:1716}],total:1716, date:"2026-04-04", splits:yu, isCustom:true},
    {id:"e17",name:"午餐蜆",        category:"food",    payers:[{name:"Michael",amount:3009}],total:3009, date:"2026-04-04", splits:mk(ALL,3009)},
    {id:"e18",name:"咖哩麵包",      category:"snack",   payers:[{name:"陳霆宇",amount:135}], total:135,  date:"2026-04-05", splits:mk(ALL,135)},
    {id:"e19",name:"海鮮餐廳",      category:"food",    payers:[{name:"Chien",amount:2150}], total:2150, date:"2026-04-05", splits:mk(ALL,2150)},
    {id:"e20",name:"曾記麻糬",      category:"shop",    payers:[{name:"Chien",amount:243}],  total:243,  date:"2026-04-05", splits:mk(ALL,243)},
    {id:"e21",name:"711美式",       category:"snack",   payers:[{name:"Carly",amount:95}],   total:95,   date:"2026-04-05", splits:am, isCustom:true},
    {id:"e22",name:"停車費",        category:"parking", payers:[{name:"Michael",amount:120}], total:120,  date:"2026-04-06", splits:mk(SG,120)},
    {id:"e23",name:"7-11飯糰",      category:"snack",   payers:[{name:"邱于瑄",amount:55}],  total:55,   date:"2026-04-06", splits:mk(["陳霆宇","邱于瑄"],55)},
    {id:"e24",name:"梅子名產",      category:"shop",    payers:[{name:"Chien",amount:400}],  total:400,  date:"2026-04-04", splits:mk(["Chien","邱于瑄"],400)},
  ];
  return {
    id:"clearing2026", name:"2026清明節還1/4島", code:"CLEAR1",
    adminUser:"Carly", members:ALL, colors,
    // claimedBy: { memberName: username }
    claimedBy: {},
    expenses,
    categories:[...CATEGORIES],
    logs:[{id:"l0",ts:new Date("2026-04-02").toISOString(),user:"Carly",action:"建立群組",detail:"Carly 建立了群組「2026清明節還1/4島」"}]
  };
}

// ── UI Primitives ─────────────────────────────────────────────────────
function Avatar({name,color,size=28}){
  return <div style={{width:size,height:size,borderRadius:"50%",background:color||"#ddd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.12)"}}>{name[0]}</div>;
}

function Card({children,style={},onClick}){
  return <div onClick={onClick} style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:16,padding:"12px 14px",marginBottom:10,boxShadow:T.shadow,cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}

const iStyle={width:"100%",padding:"9px 12px",background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,marginBottom:8,boxSizing:"border-box",outline:"none",fontFamily:"inherit"};

function Btn({children,onClick,variant="primary",style={},disabled=false}){
  const base={padding:"10px 16px",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,...style};
  const v={
    primary:{background:T.yellowMd,color:T.text,boxShadow:"0 3px 0 "+T.yellowDk},
    secondary:{background:"#fff",color:T.text,border:`1.5px solid ${T.border}`},
    danger:{background:"#FFF0EE",color:T.accent,border:`1.5px solid ${T.accent}55`},
    ghost:{background:"transparent",color:T.textSub,border:"none",padding:"6px 10px"},
  };
  return <button onClick={disabled?undefined:onClick} style={{...base,...v[variant],...style}}>{children}</button>;
}

// ── MultiSelect ───────────────────────────────────────────────────────
function MultiSelect({value,onChange,members,colors}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  const toggle=m=>{ if(value.includes(m)){if(value.length>1)onChange(value.filter(x=>x!==m));}else onChange([...value,m]); };
  const allSel=value.length===members.length;
  const label=allSel?"全部成員":value.length===0?"請選擇":value.join("、");
  return(
    <div ref={ref} style={{position:"relative",marginBottom:8}}>
      <div onClick={()=>setOpen(!open)} style={{...iStyle,marginBottom:0,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{label}</span>
        <span style={{marginLeft:8,fontSize:10,color:T.textMute}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:300,background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:12,overflow:"hidden",boxShadow:T.shadowMd}}>
          <div onClick={()=>onChange(allSel?[members[0]]:[...members])} style={{padding:"9px 12px",fontSize:12,color:T.textSub,cursor:"pointer",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",background:allSel?T.yellowLt:"#fff"}}>
            <span>全部成員</span><span style={{color:T.yellowDk}}>{allSel?"✓":""}</span>
          </div>
          {members.map(m=>{
            const sel=value.includes(m); const col=colors[m]||"#aaa";
            return(
              <div key={m} onClick={()=>toggle(m)} style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:sel?T.yellowLt+"88":"#fff",borderBottom:`1px solid ${T.border}44`}}>
                <div style={{width:16,height:16,borderRadius:5,border:`2px solid ${sel?T.yellowDk:T.border}`,background:sel?T.yellowMd:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {sel&&<span style={{fontSize:9,color:T.text,fontWeight:900}}>✓</span>}
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
function CategoryPicker({value,onChange,categories}){
  const cats=categories||CATEGORIES;
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  const cur=cats.find(c=>c.id===value)||cats[cats.length-1];
  return(
    <div ref={ref} style={{position:"relative",marginBottom:8}}>
      <div onClick={()=>setOpen(!open)} style={{...iStyle,marginBottom:0,display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
        <span style={{fontSize:18}}>{cur.icon}</span>
        <span style={{flex:1,color:T.text}}>{cur.label}</span>
        <span style={{fontSize:10,color:T.textMute}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:300,background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:12,padding:8,boxShadow:T.shadowMd,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
          {cats.map(c=>(
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
function SplitEditor({splitMode,setSplitMode,splitData,setSplitData,members,colors,total}){
  const parsedTotal=parseFloat(total)||0;
  const fixedSum=Object.values(splitData).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const equalCount=members.filter(m=>!(parseFloat(splitData[m])>0)).length;
  const remainder=parsedTotal-fixedSum;
  const sharePerEqual=equalCount>0?remainder/equalCount:0;

  return(
    <div style={{marginBottom:8}}>
      {/* Mode selector */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["equal","均分"],["amount","金額"],["ratio","比例"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setSplitMode(k);setSplitData({});}} style={{flex:1,padding:"7px 0",borderRadius:10,border:`1.5px solid ${splitMode===k?T.yellowDk:T.border}`,background:splitMode===k?T.yellowLt:"#fff",color:splitMode===k?T.text:T.textSub,fontSize:12,fontWeight:splitMode===k?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      {splitMode==="equal"&&(
        <MultiSelect value={Object.keys(splitData).length?Object.keys(splitData):members} onChange={sel=>{const d={};sel.forEach(m=>d[m]=1);setSplitData(d);}} members={members} colors={colors}/>
      )}

      {splitMode==="amount"&&(
        <div>
          <div style={{fontSize:11,color:T.textSub,marginBottom:6}}>輸入固定金額，留空則均分剩餘</div>
          {members.map(m=>{
            const v=splitData[m]||"";
            return(
              <div key={m} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <Avatar name={m} color={colors[m]||"#aaa"} size={24}/>
                <span style={{fontSize:13,color:T.text,flex:1}}>{m}</span>
                <input type="number" placeholder={sharePerEqual>0&&!v?`≈${sharePerEqual.toFixed(0)}`:"0"} value={v} onChange={e=>setSplitData({...splitData,[m]:e.target.value})} style={{...iStyle,width:90,marginBottom:0,textAlign:"right"}}/>
              </div>
            );
          })}
          {parsedTotal>0&&<div style={{fontSize:11,color:remainder<-0.01?T.accent:T.green,marginTop:4}}>
            {remainder<-0.01?`⚠️ 超出 NT$${Math.abs(remainder).toFixed(0)}`:`剩餘 NT$${remainder.toFixed(0)} 由 ${equalCount} 人均分`}
          </div>}
        </div>
      )}

      {splitMode==="ratio"&&(
        <div>
          <div style={{fontSize:11,color:T.textSub,marginBottom:6}}>輸入比例（留空預設1）</div>
          {members.map(m=>{
            const v=splitData[m]||"";
            const ratio=parseFloat(v)||1;
            const ratioTotal=members.reduce((s,x)=>s+(parseFloat(splitData[x])||1),0);
            const share=parsedTotal>0?(ratio/ratioTotal*parsedTotal):0;
            return(
              <div key={m} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <Avatar name={m} color={colors[m]||"#aaa"} size={24}/>
                <span style={{fontSize:13,color:T.text,flex:1}}>{m}</span>
                <input type="number" placeholder="1" value={v} onChange={e=>setSplitData({...splitData,[m]:e.target.value})} style={{...iStyle,width:60,marginBottom:0,textAlign:"right"}}/>
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
function PayersEditor({payers,setPayers,members,colors,total}){
  const paidSum=payers.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const parsedTotal=parseFloat(total)||0;
  const diff=parsedTotal-paidSum;

  function updatePayer(i,field,val){
    const next=[...payers]; next[i]={...next[i],[field]:val}; setPayers(next);
  }
  function addPayer(){
    const used=payers.map(p=>p.name);
    const next=members.find(m=>!used.includes(m));
    if(next) setPayers([...payers,{name:next,amount:""}]);
  }
  function removePayer(i){ if(payers.length>1) setPayers(payers.filter((_,idx)=>idx!==i)); }

  return(
    <div style={{marginBottom:8}}>
      {payers.map((p,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
          <select value={p.name} onChange={e=>updatePayer(i,"name",e.target.value)} style={{...iStyle,flex:1,marginBottom:0,padding:"7px 8px"}}>
            {members.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" placeholder="金額" value={p.amount} onChange={e=>updatePayer(i,"amount",e.target.value)} style={{...iStyle,width:90,marginBottom:0,textAlign:"right"}}/>
          {payers.length>1&&<button onClick={()=>removePayer(i)} style={{background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:16,padding:"0 2px"}}>✕</button>}
        </div>
      ))}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
        <button onClick={addPayer} style={{background:"none",border:`1.5px dashed ${T.border}`,borderRadius:8,padding:"5px 10px",fontSize:12,color:T.textSub,cursor:"pointer"}}>＋ 加付款人</button>
        <span style={{fontSize:11,color:Math.abs(diff)>0.01?T.accent:T.green}}>
          {parsedTotal>0&&(Math.abs(diff)>0.01?`⚠️ 差 NT$${Math.abs(diff).toFixed(0)}`:"✓ 金額正確")}
        </span>
      </div>
    </div>
  );
}

// ── Expense Form ──────────────────────────────────────────────────────
function ExpenseForm({initial,members,colors,categories,onSave,onCancel,onDelete}){
  const [name,setName]=useState(initial.name||"");
  const [total,setTotal]=useState(initial.total||"");
  const [date,setDate]=useState(initial.date||new Date().toISOString().slice(0,10));
  const [category,setCategory]=useState(initial.category||"food");
  const [payers,setPayers]=useState(initial.payers||[{name:members[0],amount:""}]);
  const [splitMode,setSplitMode]=useState(initial.splitMode||"equal");
  const [splitData,setSplitData]=useState(initial.splitData||{});

  function handleSave(){
    if(!name||!total) return;
    const parsedTotal=parseFloat(total);
    // Build splits
    let splitMembers = splitMode==="equal"
      ? (Object.keys(splitData).length?Object.keys(splitData):members)
      : members;
    const splits=calcSplits(splitMode, splitMode==="equal"?splitMembers:splitData, splitMembers, parsedTotal);
    // Validate payers sum
    const paidSum=payers.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
    if(Math.abs(paidSum-parsedTotal)>0.1){ alert(`付款金額加總 NT$${paidSum} 與總金額 NT$${parsedTotal} 不符`); return; }
    onSave({name,total:parsedTotal,date,category,payers:payers.map(p=>({name:p.name,amount:parseFloat(p.amount)||0})),splits,splitMode,splitData});
  }

  return(
    <div style={{background:T.bg,border:`1.5px solid ${T.yellowLt}`,borderRadius:16,padding:14,marginBottom:12,boxShadow:T.shadow}}>
      <div style={{display:"flex",gap:8}}>
        <input placeholder="項目名稱" value={name} onChange={e=>setName(e.target.value)} style={{...iStyle,flex:1}}/>
        <input type="number" placeholder="總金額" value={total} onChange={e=>setTotal(e.target.value)} style={{...iStyle,width:100}}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}><div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>分類</div><CategoryPicker value={category} onChange={setCategory} categories={categories}/></div>
        <div style={{flex:1}}><div style={{fontSize:11,color:T.textSub,marginBottom:3,fontWeight:600}}>日期</div><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...iStyle,marginBottom:0}}/></div>
      </div>
      <div style={{fontSize:11,color:T.textSub,marginBottom:4,fontWeight:600,marginTop:4}}>付款人</div>
      <PayersEditor payers={payers} setPayers={setPayers} members={members} colors={colors} total={total}/>
      <div style={{fontSize:11,color:T.textSub,marginBottom:4,fontWeight:600,marginTop:6}}>分帳方式</div>
      <SplitEditor splitMode={splitMode} setSplitMode={setSplitMode} splitData={splitData} setSplitData={setSplitData} members={members} colors={colors} total={total}/>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <Btn onClick={handleSave} style={{flex:1}}>{onDelete?"💾 儲存":"✅ 新增"}</Btn>
        <Btn onClick={onCancel} variant="secondary" style={{flex:1}}>取消</Btn>
        {onDelete&&<Btn onClick={onDelete} variant="danger">🗑️</Btn>}
      </div>
    </div>
  );
}


// ── Analytics Tab ─────────────────────────────────────────────────────
function AnalyticsTab({expenses, members, colors, categories}){
  const cats = categories || CATEGORIES;
  const getCatById = (id) => cats.find(c=>c.id===id)||cats[cats.length-1];

  // Per-category spend (sum of splits across all members)
  const catTotals = {};
  cats.forEach(c => catTotals[c.id] = 0);
  expenses.forEach(e => {
    const catId = e.category || "misc";
    const total = Object.values(e.splits).reduce((s,v)=>s+v,0);
    catTotals[catId] = (catTotals[catId]||0) + total;
  });
  const grandTotal = Object.values(catTotals).reduce((s,v)=>s+v,0);

  // Filter to categories that have spend
  const active = cats.filter(c => catTotals[c.id] > 0.01)
    .sort((a,b) => catTotals[b.id] - catTotals[a.id]);

  // Pie chart using SVG
  const PIE_COLORS = ["#FFD54F","#FF8A65","#64B5F6","#81C784","#BA68C8","#4DB6AC","#F06292","#A1887F","#90A4AE","#DCE775","#FFB74D","#E57373"];
  const cx=110, cy=110, r=80, innerR=44;
  let startAngle = -Math.PI/2;
  const slices = active.map((c,i)=>{
    const pct = catTotals[c.id]/grandTotal;
    const angle = pct * 2 * Math.PI;
    const x1=cx+r*Math.cos(startAngle), y1=cy+r*Math.sin(startAngle);
    const x2=cx+r*Math.cos(startAngle+angle), y2=cy+r*Math.sin(startAngle+angle);
    const ix1=cx+innerR*Math.cos(startAngle), iy1=cy+innerR*Math.sin(startAngle);
    const ix2=cx+innerR*Math.cos(startAngle+angle), iy2=cy+innerR*Math.sin(startAngle+angle);
    const large=angle>Math.PI?1:0;
    const path=`M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${innerR},${innerR} 0 ${large},0 ${ix1},${iy1} Z`;
    const midAngle=startAngle+angle/2;
    const lx=cx+(r+18)*Math.cos(midAngle), ly=cy+(r+18)*Math.sin(midAngle);
    startAngle+=angle;
    return {path, color:PIE_COLORS[i%PIE_COLORS.length], pct, cat:c, lx, ly, angle};
  });

  // Per-member spend per category
  const memberCatSpend = {};
  members.forEach(m=>{
    memberCatSpend[m]={};
    cats.forEach(c=>memberCatSpend[m][c.id]=0);
  });
  expenses.forEach(e=>{
    const catId=e.category||"misc";
    Object.entries(e.splits).forEach(([m,amt])=>{
      if(memberCatSpend[m]) memberCatSpend[m][catId]=(memberCatSpend[m][catId]||0)+amt;
    });
  });

  const [selectedCat, setSelectedCat] = useState(null);
  const selCat = selectedCat ? cats.find(c=>c.id===selectedCat) : null;
  const selSlice = selectedCat ? slices.find(s=>s.cat.id===selectedCat) : null;

  return(
    <div>
      <div style={{fontSize:13,color:T.textSub,marginBottom:14,fontWeight:600}}>分類消費分析（各人實際分攤）</div>

      {grandTotal===0&&<div style={{textAlign:"center",color:T.textMute,padding:40}}>尚無消費資料</div>}

      {grandTotal>0&&(
        <>
          {/* Pie chart */}
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
            <svg width={220} height={220} style={{overflow:"visible"}}>
              {slices.map((s,i)=>(
                <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2}
                  style={{cursor:"pointer",opacity:selectedCat&&selectedCat!==s.cat.id?0.4:1,transition:"opacity 0.2s"}}
                  onClick={()=>setSelectedCat(selectedCat===s.cat.id?null:s.cat.id)}/>
              ))}
              {/* Center label */}
              <text x={cx} y={cy-8} textAnchor="middle" fontSize={11} fill={T.textSub}>{selCat?selCat.icon:"總計"}</text>
              <text x={cx} y={cy+8} textAnchor="middle" fontSize={13} fontWeight={700} fill={T.text}>
                {selCat?`NT$${catTotals[selCat.id].toFixed(0)}`:`NT$${grandTotal.toFixed(0)}`}
              </text>
              {selCat&&<text x={cx} y={cy+22} textAnchor="middle" fontSize={10} fill={T.textMute}>{selCat.label}</text>}
            </svg>
          </div>

          {/* Legend */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16,justifyContent:"center"}}>
            {slices.map((s,i)=>(
              <div key={i} onClick={()=>setSelectedCat(selectedCat===s.cat.id?null:s.cat.id)}
                style={{display:"flex",alignItems:"center",gap:4,background:selectedCat===s.cat.id?T.yellowLt:T.bgCard,border:`1.5px solid ${selectedCat===s.cat.id?T.yellowMd:T.border}`,borderRadius:20,padding:"4px 10px",cursor:"pointer",fontSize:12}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:s.color,display:"inline-block",flexShrink:0}}/>
                <span>{s.cat.icon} {s.cat.label}</span>
                <span style={{color:T.textMute,fontSize:11}}>{(s.pct*100).toFixed(0)}%</span>
              </div>
            ))}
          </div>

          {/* Member breakdown for selected cat or all */}
          <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:600}}>
            {selCat?`${selCat.icon} ${selCat.label} — 各人分攤`:"各人總消費"}
          </div>
          {members.map(m=>{
            const spend = selCat
              ? (memberCatSpend[m]?.[selCat.id]||0)
              : cats.reduce((s,c)=>s+(memberCatSpend[m]?.[c.id]||0),0);
            const total = selCat ? catTotals[selCat.id] : grandTotal;
            const pct = total>0 ? spend/total : 0;
            const col = colors[m]||"#aaa";
            return(
              <div key={m} style={{marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                  <Avatar name={m} color={col} size={22}/>
                  <span style={{fontSize:12,fontWeight:600,flex:1,color:T.text}}>{m}</span>
                  <span style={{fontSize:12,fontWeight:700,color:T.text}}>NT${spend.toFixed(0)}</span>
                  <span style={{fontSize:11,color:T.textMute,width:36,textAlign:"right"}}>{(pct*100).toFixed(0)}%</span>
                </div>
                <div style={{height:6,background:T.border,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct*100}%`,background:col,borderRadius:3,transition:"width 0.4s ease"}}/>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Config Tab (Admin only) ───────────────────────────────────────────
function ConfigTab({group, setGroups}){
  const cats = group.categories || CATEGORIES;
  const [editing, setEditing] = useState(null); // { id, icon, label }
  const [newCat, setNewCat] = useState({icon:"", label:""});
  const [showAdd, setShowAdd] = useState(false);

  function saveGroup(updater, logDetail){
    setGroups(prev=>prev.map(g=>{
      if(g.id!==group.id) return g;
      const updated=updater(g);
      return {...updated,logs:[{id:uid(),ts:now(),user:group.adminUser,action:"設定變更",detail:logDetail},...(updated.logs||[])]};
    }));
  }

  function handleEdit(cat){
    saveGroup(g=>({...g,categories:g.categories.map(c=>c.id===cat.id?{...c,icon:editing.icon,label:editing.label}:c)}),
      `分類「${cat.label}」改為「${editing.icon} ${editing.label}」`);
    setEditing(null);
  }

  function handleDelete(cat){
    if(cats.length<=3){alert("至少保留 3 個分類");return;}
    saveGroup(g=>({...g,categories:g.categories.filter(c=>c.id!==cat.id)}),`刪除分類「${cat.label}」`);
  }

  function handleAdd(){
    if(!newCat.icon||!newCat.label) return;
    const newId=uid();
    saveGroup(g=>({...g,categories:[...(g.categories||CATEGORIES),{id:newId,...newCat}]}),`新增分類「${newCat.icon} ${newCat.label}」`);
    setNewCat({icon:"",label:""}); setShowAdd(false);
  }

  return(
    <div>
      <div style={{fontSize:13,color:T.textSub,marginBottom:14,fontWeight:600}}>分類管理</div>

      {cats.map(cat=>(
        <div key={cat.id} style={{marginBottom:8}}>
          {editing?.id===cat.id?(
            <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:12}}>
              <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>圖示（輸入任意 emoji 或符號）</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:44,height:44,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{editing.icon||"?"}</div>
                <input value={editing.icon} onChange={e=>setEditing({...editing,icon:e.target.value.slice(-2)||e.target.value.slice(-1)||""})} placeholder="輸入 emoji，例如 🍜" style={{...iStyle,marginBottom:0,flex:1,fontSize:18}}/>
              </div>
              <input value={editing.label} onChange={e=>setEditing({...editing,label:e.target.value})} placeholder="分類名稱" style={{...iStyle,marginBottom:8}}/>
              <div style={{display:"flex",gap:6}}>
                <Btn onClick={()=>handleEdit(cat)} style={{flex:1,padding:"8px 0"}}>儲存</Btn>
                <Btn onClick={()=>setEditing(null)} variant="secondary" style={{flex:1,padding:"8px 0"}}>取消</Btn>
              </div>
            </div>
          ):(
            <div style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.icon}</div>
              <span style={{flex:1,fontSize:14,fontWeight:600,color:T.text}}>{cat.label}</span>
              <Btn onClick={()=>setEditing({id:cat.id,icon:cat.icon,label:cat.label})} variant="ghost" style={{padding:"4px 8px",fontSize:12}}>✏️</Btn>
              <Btn onClick={()=>handleDelete(cat)} variant="danger" style={{padding:"4px 8px",fontSize:12}}>🗑️</Btn>
            </div>
          )}
        </div>
      ))}

      {showAdd?(
        <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:12,marginTop:8}}>
          <div style={{fontSize:11,color:T.textSub,marginBottom:6,fontWeight:600}}>圖示（輸入任意 emoji 或符號）</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:44,height:44,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{newCat.icon||"?"}</div>
            <input value={newCat.icon} onChange={e=>setNewCat({...newCat,icon:e.target.value.slice(-2)||e.target.value.slice(-1)||""})} placeholder="輸入 emoji，例如 🎯" style={{...iStyle,marginBottom:0,flex:1,fontSize:18}}/>
          </div>
          <input value={newCat.label} onChange={e=>setNewCat({...newCat,label:e.target.value})} placeholder="分類名稱" style={{...iStyle,marginBottom:8}}/>
          <div style={{display:"flex",gap:6}}>
            <Btn onClick={handleAdd} style={{flex:1,padding:"8px 0"}}>新增</Btn>
            <Btn onClick={()=>setShowAdd(false)} variant="secondary" style={{flex:1,padding:"8px 0"}}>取消</Btn>
          </div>
        </div>
      ):(
        <button onClick={()=>setShowAdd(true)} style={{width:"100%",marginTop:8,padding:"10px 0",background:"none",border:`2px dashed ${T.border}`,borderRadius:12,color:T.textSub,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>＋ 新增分類</button>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function App(){
  const [screen,setScreen]=useState("loading");
  const [groups,setGroups]=useState([]);
  const [currentUser,setCurrentUser]=useState("");
  const [usernameInput,setUsernameInput]=useState("");
  const [currentGroupId,setCurrentGroupId]=useState(null);
  const [newGroupName,setNewGroupName]=useState("");
  const [joinCode,setJoinCode]=useState("");
  const [activeTab,setActiveTab]=useState("expenses");
  const [showAdd,setShowAdd]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [newMemberName,setNewMemberName]=useState("");
  const [error,setError]=useState("");
  // identity claim: when joining a group, pick an existing member slot
  const [claimScreen,setClaimScreen]=useState(null); // { groupId, code }

  useEffect(()=>{
    const saved=loadData("splitapp:data");
    if(saved&&saved.groups&&saved.groups.length>0){ setGroups(saved.groups); }
    else { setGroups([buildClearingGroup()]); }
    try {
      const userSaved=localStorage.getItem("splitapp:user");
      if(userSaved){
        const {username}=JSON.parse(userSaved);
        if(username){ setCurrentUser(username); setUsernameInput(username); setScreen("home"); return; }
      }
    } catch{}
    setScreen("login");
  },[]);

  useEffect(()=>{
    if(screen==="loading") return;
    saveData("splitapp:data",{groups});
  },[groups,screen]);

  // Persist current user (personal, not shared)
  useEffect(()=>{
    if(!currentUser) return;
    try{ localStorage.setItem("splitapp:user",JSON.stringify({username:currentUser})); } catch{}
  },[currentUser]);

  const currentGroup=groups.find(g=>g.id===currentGroupId);

  function getColor(existingColors){
    const used=Object.values(existingColors||{});
    return MEMBER_COLORS.find(c=>!used.includes(c))||MEMBER_COLORS[0];
  }

  function handleLogin(){
    const name=usernameInput.trim();
    if(!name){setError("請輸入名字 😊");return;}
    setCurrentUser(name); setScreen("home"); setError("");
  }

  function handleCreateGroup(){
    const name=newGroupName.trim();
    if(!name){setError("請輸入群組名稱");return;}
    const g={
      id:uid(),name,code:Math.random().toString(36).slice(2,8).toUpperCase(),
      adminUser:currentUser,members:[currentUser],
      colors:{[currentUser]:getColor({})},claimedBy:{},categories:[...CATEGORIES],expenses:[],
      logs:[{id:uid(),ts:now(),user:currentUser,action:"建立群組",detail:`${currentUser} 建立了群組「${name}」`}]
    };
    setGroups(prev=>[...prev,g]);
    setNewGroupName(""); setCurrentGroupId(g.id); setActiveTab("expenses"); setScreen("group"); setError("");
  }

  function handleJoinGroup(){
    const code=joinCode.trim().toUpperCase();
    let g=groups.find(x=>x.code===code);
    if(!g){
    if(!g){setError("找不到此群組代碼 🔍");return;}
    // Already a member or already claimed
    const alreadyClaimed=Object.values(g.claimedBy||{}).includes(currentUser);
    if(g.members.includes(currentUser)||alreadyClaimed){
      setCurrentGroupId(g.id); setActiveTab("expenses"); setScreen("group"); setJoinCode(""); setError(""); return;
    }
    // Show claim screen
    setClaimScreen({groupId:g.id,code});
    setJoinCode(""); setError("");
  }

  function handleClaimIdentity(memberName){
    const g=groups.find(x=>x.id===claimScreen.groupId);
    if(!g) return;
    if(memberName==="__new__"){
      // Join as a new member
      const color=getColor(g.colors);
      setGroups(prev=>prev.map(x=>x.id!==g.id?x:{
        ...x,members:[...x.members,currentUser],colors:{...x.colors,[currentUser]:color},
        logs:[{id:uid(),ts:now(),user:currentUser,action:"加入群組",detail:`${currentUser} 以新成員身分加入`},...(x.logs||[])]
      }));
    } else {
      // Claim an existing member slot — rename that member to currentUser
      const oldName=memberName;
      setGroups(prev=>prev.map(x=>{
        if(x.id!==g.id) return x;
        // rename member
        const members=x.members.map(m=>m===oldName?currentUser:m);
        const colors={};
        Object.entries(x.colors).forEach(([k,v])=>{ colors[k===oldName?currentUser:k]=v; });
        const claimedBy={...x.claimedBy};
        // update expenses
        const expenses=x.expenses.map(e=>{
          const splits={};
          Object.entries(e.splits).forEach(([k,v])=>{ splits[k===oldName?currentUser:k]=v; });
          const payers=e.payers.map(p=>p.name===oldName?{...p,name:currentUser}:p);
          return {...e,splits,payers,paidBy:e.paidBy===oldName?currentUser:e.paidBy};
        });
        const adminUser=x.adminUser===oldName?currentUser:x.adminUser;
        const logs=[{id:uid(),ts:now(),user:currentUser,action:"認領身分",detail:`${currentUser} 認領了「${oldName}」的身分`},...(x.logs||[])];
        return {...x,members,colors,claimedBy,expenses,adminUser,logs};
      }));
    }
    setCurrentGroupId(claimScreen.groupId);
    setActiveTab("expenses"); setScreen("group"); setClaimScreen(null);
  }

  // ── Claim Screen ──────────────────────────────────────────────────
  if(claimScreen){
    const g=groups.find(x=>x.id===claimScreen.groupId);
    if(!g) return null;
    // unclaimed members = members not yet claimed
    const claimed=Object.values(g.claimedBy||{});
    const unclaimed=g.members.filter(m=>!claimed.includes(m)&&m!==currentUser);
    return(
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,padding:24,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>👤</div>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>選擇你的身分</div>
        <div style={{fontSize:13,color:T.textMute,marginBottom:4,textAlign:"center"}}>群組：{g.name}</div>
        <div style={{fontSize:12,color:T.textSub,marginBottom:24,textAlign:"center"}}>選擇你在這個群組的身分，或以新成員加入</div>
        <div style={{width:"100%",maxWidth:360}}>
          {unclaimed.map(m=>(
            <Card key={m} onClick={()=>handleClaimIdentity(m)} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",marginBottom:8}}>
              <Avatar name={m} color={g.colors[m]||"#aaa"} size={38}/>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700}}>{m}</div>
                <div style={{fontSize:11,color:T.textMute}}>點選認領此身分</div>
              </div>
              <span style={{fontSize:18,color:T.textMute}}>›</span>
            </Card>
          ))}
          <Card onClick={()=>handleClaimIdentity("__new__")} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",borderStyle:"dashed"}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>＋</div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700}}>以新成員加入</div>
              <div style={{fontSize:11,color:T.textMute}}>以「{currentUser}」新增到群組</div>
            </div>
          </Card>
          <Btn onClick={()=>setClaimScreen(null)} variant="ghost" style={{width:"100%",marginTop:8,textAlign:"center"}}>← 取消</Btn>
        </div>
      </div>
    );
  }

  // ── Group Screen ──────────────────────────────────────────────────
  if(screen==="group"&&currentGroup){
    const g=currentGroup;
    const isAdmin=g.adminUser===currentUser;
    const me=currentUser;
    const {members,colors,expenses,logs}=g;

    const bal={};
    members.forEach(m=>bal[m]={paid:0,owes:0});
    expenses.forEach(e=>{
      e.payers.forEach(p=>{ if(bal[p.name]) bal[p.name].paid+=parseFloat(p.amount)||0; });
      Object.entries(e.splits).forEach(([m,amt])=>{if(bal[m])bal[m].owes+=amt;});
    });
    const myNet=(bal[me]?.paid||0)-(bal[me]?.owes||0);
    const mySpend=bal[me]?.owes||0;
    const myPaid=bal[me]?.paid||0;
    const totalAll=expenses.reduce((s,e)=>s+e.total,0);
    const transfers=minimizeTransfers(bal);

    const grouped={};
    [...expenses].sort((a,b)=>b.date.localeCompare(a.date)).forEach(e=>{
      if(!grouped[e.date])grouped[e.date]=[];
      grouped[e.date].push(e);
    });

    function updateGroup(updater,logEntry){
      setGroups(prev=>prev.map(x=>{
        if(x.id!==g.id)return x;
        const updated=updater(x);
        return {...updated,logs:[logEntry,...(updated.logs||[])]};
      }));
    }

    function handleAddExpense(form){
      const e={id:uid(),...form};
      updateGroup(x=>({...x,expenses:[...x.expenses,e]}),
        {id:uid(),ts:now(),user:me,action:"新增消費",detail:`新增「${form.name}」NT$${form.total}，${form.payers.map(p=>`${p.name}付NT$${p.amount}`).join("、")}`});
      setShowAdd(false);
    }
    function handleEditExpense(form){
      const old=expenses.find(e=>e.id===editingId);
      const diffs=[];
      if(old?.name!==form.name) diffs.push(`名稱：${old?.name} → ${form.name}`);
      if(old?.total!==form.total) diffs.push(`金額：NT$${old?.total} → NT$${form.total}`);
      if(old?.date!==form.date) diffs.push(`日期：${old?.date} → ${form.date}`);
      if(old?.category!==form.category){
        const oc=getCatById(old?.category,g.categories);
        const nc=getCatById(form.category,g.categories);
        diffs.push(`分類：${oc?.label||old?.category} → ${nc?.label||form.category}`);
      }
      const oldPayers=(old?.payers||[]).map(p=>`${p.name}NT$${p.amount}`).join("+");
      const newPayers=form.payers.map(p=>`${p.name}NT$${p.amount}`).join("+");
      if(oldPayers!==newPayers) diffs.push(`付款：${oldPayers} → ${newPayers}`);
      const oldSplitMembers=Object.keys(old?.splits||{}).sort().join(",");
      const newSplitMembers=Object.keys(form.splits||{}).sort().join(",");
      if(oldSplitMembers!==newSplitMembers) diffs.push(`分帳成員變更`);
      const detail=diffs.length?`編輯「${old?.name}」：${diffs.join("；")}`:`編輯「${old?.name}」（無變動）`;
      updateGroup(x=>({...x,expenses:x.expenses.map(e=>e.id!==editingId?e:{...e,...form})}),
        {id:uid(),ts:now(),user:me,action:"編輯消費",detail});
      setEditingId(null);
    }
    function handleDeleteExpense(id){
      const e=expenses.find(x=>x.id===id);
      updateGroup(x=>({...x,expenses:x.expenses.filter(ex=>ex.id!==id)}),
        {id:uid(),ts:now(),user:me,action:"刪除消費",detail:`刪除「${e?.name}」NT$${e?.total}`});
      setEditingId(null);
    }
    function handleAddMember(){
      if(!isAdmin){setError("只有管理員可以新增成員 👑");return;}
      const name=newMemberName.trim();
      if(!name||members.includes(name)){setError("名字重複或無效");return;}
      const color=getColor(colors);
      updateGroup(x=>({...x,members:[...x.members,name],colors:{...x.colors,[name]:color}}),
        {id:uid(),ts:now(),user:me,action:"新增成員",detail:`新增成員「${name}」`});
      setNewMemberName(""); setError("");
    }
    function handleRemoveMember(name){
      if(!isAdmin){setError("只有管理員可以移除成員 👑");return;}
      const net=(bal[name]?.paid||0)-(bal[name]?.owes||0);
      if(Math.abs(net)>0.01){setError(`${name} 還有未結清的帳款，無法移除 💸`);return;}
      if(members.length<=2){setError("群組至少需要 2 位成員");return;}
      updateGroup(x=>({...x,members:x.members.filter(m=>m!==name)}),
        {id:uid(),ts:now(),user:me,action:"移除成員",detail:`移除成員「${name}」`});
      setError("");
    }

    const emptyForm=()=>({
      name:"",total:"",date:new Date().toISOString().slice(0,10),category:"food",
      payers:[{name:me,amount:""}],splitMode:"equal",splitData:{},splits:{}
    });

    const TABS=[["expenses","📋 明細"],["balances","💰 結算"],["transfers","↔️ 轉帳"],["analytics","📊 分析"],["members","👥 成員"],["logs","📝 紀錄"],...(isAdmin?[["config","⚙️ 設定"]]:[])];
    const getCatById=(id,cats)=>(cats||CATEGORIES).find(c=>c.id===id)||(cats||CATEGORIES)[(cats||CATEGORIES).length-1];

    return(
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,paddingBottom:50}}>
        {/* Header */}
        <div style={{background:T.yellowLt,padding:"14px 16px 0",boxShadow:"0 2px 8px rgba(200,150,0,0.12)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <button onClick={()=>{setScreen("home");setCurrentGroupId(null);}} style={{background:"rgba(255,255,255,0.7)",border:"none",borderRadius:10,width:32,height:32,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>{g.name}</div>
              <div style={{fontSize:10,color:T.yellowDk,fontWeight:600}}>代碼 {g.code} · {members.length}人{isAdmin?" · 👑":""}</div>
            </div>
            <Avatar name={me} color={colors[me]||"#aaa"} size={30}/>
          </div>

          {/* My card */}
          <div style={{background:"rgba(255,255,255,0.75)",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:10,color:T.yellowDk,fontWeight:700,marginBottom:8}}>我的帳（{me}）</div>
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

          <div style={{display:"flex",overflowX:"auto",gap:2}}>
            {TABS.map(([k,l])=>(
              <button key={k} onClick={()=>setActiveTab(k)} style={{flexShrink:0,padding:"8px 10px",background:activeTab===k?"rgba(255,255,255,0.95)":"transparent",border:"none",borderRadius:"10px 10px 0 0",color:activeTab===k?T.text:T.yellowDk,fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{padding:"14px 14px 0"}}>
          {error&&<div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:10,fontSize:12,color:T.accent,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{error}</span><button onClick={()=>setError("")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:14}}>✕</button></div>}

          {/* 明細 */}
          {activeTab==="expenses"&&(
            <div>
              <Btn onClick={()=>{setShowAdd(true);setEditingId(null);}} style={{width:"100%",marginBottom:12,padding:12,fontSize:14}}>＋ 新增消費</Btn>
              {showAdd&&<ExpenseForm initial={emptyForm()} members={members} colors={colors} categories={g.categories} onSave={handleAddExpense} onCancel={()=>setShowAdd(false)}/>}
              {Object.keys(grouped).length===0&&!showAdd&&<div style={{textAlign:"center",color:T.textMute,padding:40,fontSize:13}}>還沒有任何消費 🌴</div>}
              {Object.entries(grouped).map(([date,items])=>(
                <div key={date}>
                  <div style={{fontSize:11,color:T.textMute,marginBottom:6,marginTop:12,fontWeight:700,letterSpacing:0.5}}>{fmtDate(date)}</div>
                  {items.map(e=>{
                    const myShare=e.splits[me]||0;
                    const participants=Object.keys(e.splits);
                    const cat=getCatById(e.category,g.categories);
                    const iAmPayer=e.payers.some(p=>p.name===me);
                    if(editingId===e.id) return(
                      <ExpenseForm key={e.id}
                        initial={{name:e.name,total:String(e.total),date:e.date,category:e.category||"food",payers:e.payers||[{name:e.payers?.[0]?.name||members[0],amount:String(e.total)}],splitMode:e.splitMode||"equal",splitData:e.splitData||{},splits:e.splits}}
                        members={members} colors={colors} categories={g.categories} onSave={handleEditExpense} onCancel={()=>setEditingId(null)} onDelete={()=>handleDeleteExpense(e.id)}/>
                    );
                    return(
                      <Card key={e.id} onClick={()=>{setEditingId(e.id);setShowAdd(false);}} style={{borderColor:iAmPayer?T.yellowMd:T.border,background:iAmPayer?"#FFFDE7":T.bgCard}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                            <div style={{width:36,height:36,borderRadius:10,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.icon}</div>
                            <div>
                              <div style={{fontSize:14,fontWeight:700,color:T.text}}>{e.name}</div>
                              <div style={{fontSize:10,color:T.textMute}}>{cat.label}</div>
                            </div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                            {myShare>0
                              ? <div style={{fontSize:19,fontWeight:800,color:iAmPayer?T.yellowDk:T.text,lineHeight:1}}>NT${myShare%1===0?myShare.toFixed(0):myShare.toFixed(2)}</div>
                              : <div style={{fontSize:12,color:T.textMute}}>不參與</div>
                            }
                          </div>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${T.border}`,paddingTop:6}}>
                          <div style={{display:"flex",gap:3,flexWrap:"wrap",flex:1}}>
                            {participants.map(m=>(
                              <span key={m} style={{display:"inline-flex",alignItems:"center",gap:3,background:T.bg,border:`1px solid ${T.border}`,borderRadius:20,padding:"2px 7px 2px 4px",fontSize:10}}>
                                <span style={{width:10,height:10,borderRadius:"50%",background:colors[m]||"#aaa",display:"inline-block",flexShrink:0}}/>
                                {m}
                              </span>
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

          {/* 結算 */}
          {activeTab==="balances"&&(
            <div>
              {members.map(m=>{
                const {paid,owes}=bal[m]||{paid:0,owes:0};
                const net=paid-owes; const col=colors[m]||"#aaa"; const isMe=m===me;
                return(
                  <Card key={m} style={{borderColor:isMe?T.yellowDk:T.border,background:isMe?"#FFFDE7":T.bgCard}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <Avatar name={m} color={col} size={32}/>
                      <span style={{fontWeight:800,fontSize:15}}>{m}</span>
                      {isMe&&<span style={{background:T.yellowLt,color:T.yellowDk,border:`1px solid ${T.yellowMd}`,borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>我</span>}
                      {m===g.adminUser&&<span>👑</span>}
                      <div style={{marginLeft:"auto",textAlign:"right"}}>
                        <div style={{fontSize:10,color:T.textMute}}>{net>=0?"應收 ✅":"應付 ❗"}</div>
                        <div style={{fontSize:20,fontWeight:800,color:net>=0?T.green:T.accent}}>NT${Math.abs(net).toFixed(0)}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:16,borderTop:`1px solid ${T.border}`,paddingTop:8}}>
                      <div><div style={{fontSize:10,color:T.textMute}}>墊付</div><div style={{fontSize:13,fontWeight:700}}>NT${paid.toLocaleString()}</div></div>
                      <div><div style={{fontSize:10,color:T.textMute}}>實際消費</div><div style={{fontSize:13,fontWeight:700}}>NT${owes.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}</div></div>
                    </div>
                  </Card>
                );
              })}
              <div style={{fontSize:11,color:T.textMute,textAlign:"center",marginTop:4}}>總消費 NT${totalAll.toLocaleString()}</div>
            </div>
          )}

          {/* 轉帳 */}
          {activeTab==="transfers"&&(
            <div>
              <div style={{fontSize:13,color:T.textSub,marginBottom:4,fontWeight:600}}>最少轉帳次數方案</div>
              <div style={{fontSize:11,color:T.textMute,marginBottom:14}}>共 {transfers.length} 筆即可結清</div>
              {transfers.length===0&&<div style={{textAlign:"center",color:T.textMute,padding:40,fontSize:20}}>已全部結清 🥳</div>}
              {transfers.map((t,i)=>{
                const isMyAction=t.from===me||t.to===me;
                return(
                  <Card key={i} style={{borderColor:isMyAction?T.yellowDk:T.border,background:isMyAction?"#FFFDE7":T.bgCard}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:52}}>
                        <Avatar name={t.from} color={colors[t.from]||"#aaa"} size={36}/>
                        <span style={{fontSize:11,color:T.text,fontWeight:700,textAlign:"center"}}>{t.from}</span>
                      </div>
                      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <div style={{fontSize:17,fontWeight:800,color:T.text}}>NT${t.amount.toLocaleString()}</div>
                        <div style={{width:"100%",display:"flex",alignItems:"center",gap:4}}>
                          <div style={{flex:1,height:2,background:T.border,borderRadius:2}}/>
                          <span style={{fontSize:16}}>→</span>
                          <div style={{flex:1,height:2,background:T.border,borderRadius:2}}/>
                        </div>
                        {isMyAction&&<span style={{fontSize:10,color:T.yellowDk,fontWeight:700}}>{t.from===me?"我要付 💸":"我要收 🤑"}</span>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:52}}>
                        <Avatar name={t.to} color={colors[t.to]||"#aaa"} size={36}/>
                        <span style={{fontSize:11,color:T.text,fontWeight:700,textAlign:"center"}}>{t.to}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 成員 */}
          {activeTab==="members"&&(
            <div>
              {!isAdmin&&<div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:12,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.yellowDk,fontWeight:600}}>👑 只有管理員可以新增或移除成員</div>}
              {members.map(m=>{
                const col=colors[m]||"#aaa";
                const net=(bal[m]?.paid||0)-(bal[m]?.owes||0);
                const canRemove=isAdmin&&m!==me&&Math.abs(net)<0.01&&members.length>2;
                return(
                  <Card key={m}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <Avatar name={m} color={col} size={38}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          <span style={{fontSize:14,fontWeight:700}}>{m}</span>
                          {m===g.adminUser&&<span>👑</span>}
                          {m===me&&<span style={{background:T.yellowLt,color:T.yellowDk,border:`1px solid ${T.yellowMd}`,borderRadius:20,padding:"1px 6px",fontSize:11,fontWeight:700}}>我</span>}
                        </div>
                        <div style={{fontSize:11,color:T.textMute}}>消費 NT${(bal[m]?.owes||0).toFixed(0)} · 墊付 NT${(bal[m]?.paid||0).toLocaleString()}</div>
                        {isAdmin&&m!==me&&members.length>2&&Math.abs(net)>0.01&&<div style={{fontSize:10,color:T.accent,marginTop:2}}>💸 有未結清帳款，無法移除</div>}
                      </div>
                      {canRemove&&<Btn onClick={()=>handleRemoveMember(m)} variant="danger" style={{padding:"5px 10px",fontSize:12}}>移除</Btn>}
                    </div>
                  </Card>
                );
              })}
              {isAdmin&&(
                <div style={{background:T.yellowLt,border:`1.5px solid ${T.yellowMd}`,borderRadius:14,padding:14,marginTop:6}}>
                  <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:600}}>➕ 新增旅伴</div>
                  <div style={{display:"flex",gap:8}}>
                    <input placeholder="輸入名字" value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddMember()} style={{...iStyle,flex:1,marginBottom:0}}/>
                    <Btn onClick={handleAddMember} style={{flexShrink:0,padding:"9px 14px"}}>新增</Btn>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 紀錄 */}
          {activeTab==="logs"&&(
            <div>
              <div style={{fontSize:13,color:T.textSub,marginBottom:14,fontWeight:600}}>操作紀錄</div>
              {(logs||[]).length===0&&<div style={{textAlign:"center",color:T.textMute,padding:40}}>暫無紀錄</div>}
              {(logs||[]).map(l=>(
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

          {/* 分析 */}
          {activeTab==="analytics"&&(
            <AnalyticsTab expenses={expenses} members={members} colors={colors} categories={g.categories}/>
          )}

          {/* 設定 (Admin only) */}
          {activeTab==="config"&&isAdmin&&(
            <ConfigTab group={g} setGroups={setGroups}/>
          )}
        </div>
      </div>
    );
  }

  // ── Home Screen ───────────────────────────────────────────────────
  if(screen==="home") return(
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,padding:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <div style={{width:40,height:40,borderRadius:14,background:T.yellowMd,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:T.shadow}}>🏝️</div>
        <div>
          <div style={{fontSize:17,fontWeight:800}}>旅遊分帳</div>
          <div style={{fontSize:11,color:T.yellowDk,fontWeight:600}}>歡迎，{currentUser} 👋</div>
        </div>
        <button onClick={()=>{setCurrentUser("");setUsernameInput("");try{localStorage.removeItem("splitapp:user");}catch{}setScreen("login");}} style={{marginLeft:"auto",background:"#fff",border:`1.5px solid ${T.border}`,borderRadius:20,padding:"5px 12px",color:T.textSub,fontSize:11,cursor:"pointer",fontWeight:600}}>登出</button>
      </div>
      {error&&<div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.accent,display:"flex",justifyContent:"space-between"}}><span>{error}</span><button onClick={()=>setError("")} style={{background:"none",border:"none",color:T.accent,cursor:"pointer"}}>✕</button></div>}
      {groups.filter(g=>g.members.includes(currentUser)).length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,color:T.textMute,marginBottom:10,fontWeight:700}}>我的群組</div>
          {groups.filter(g=>g.members.includes(currentUser)).map(g=>(
            <Card key={g.id} onClick={()=>{setCurrentGroupId(g.id);setActiveTab("expenses");setScreen("group");}} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
              <div style={{width:44,height:44,borderRadius:12,background:T.yellowLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🏝️</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700}}>{g.name}</div>
                <div style={{fontSize:11,color:T.textMute}}>{g.members.length} 位成員 · {g.code}{g.adminUser===currentUser?" · 👑":""}</div>
              </div>
              <span style={{fontSize:18,color:T.textMute}}>›</span>
            </Card>
          ))}
        </div>
      )}
      <Card style={{borderColor:T.yellowMd,marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:T.yellowDk}}>＋ 建立新群組</div>
        <input placeholder="群組名稱（例：沖繩五日遊 🌺）" value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleCreateGroup()} style={iStyle}/>
        <Btn onClick={handleCreateGroup} style={{width:"100%",padding:11,fontSize:14}}>建立</Btn>
      </Card>
      <Card>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>加入群組</div>
        <input placeholder="輸入群組代碼" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&handleJoinGroup()} style={{...iStyle,fontFamily:"monospace",letterSpacing:3,textTransform:"uppercase"}}/>
        <Btn onClick={handleJoinGroup} variant="secondary" style={{width:"100%",padding:11,fontSize:14}}>加入</Btn>
      </Card>
    </div>
  );

  // ── Login ─────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Noto Sans TC','Segoe UI',sans-serif",color:T.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:60,marginBottom:8}}>🏝️</div>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>旅遊分帳</div>
      <div style={{fontSize:13,color:T.textMute,marginBottom:32}}>輸入你的名字開始使用</div>
      {error&&<div style={{background:"#FFF0EE",border:`1.5px solid ${T.accent}44`,borderRadius:12,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.accent,width:"100%",maxWidth:320,boxSizing:"border-box"}}>{error}</div>}
      <input placeholder="你叫什麼名字？" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{...iStyle,maxWidth:320,textAlign:"center",fontSize:16,marginBottom:12}}/>
      <Btn onClick={handleLogin} style={{width:"100%",maxWidth:320,padding:13,fontSize:15}}>出發！🌟</Btn>
    </div>
  );
}
}
