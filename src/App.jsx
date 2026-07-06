import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "./supabase"

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const OFFICE_START = "09:30"
const WORK_DAYS    = [1,2,3,4,5,6]

// ─── UTILS ───────────────────────────────────────────────────────────────────
const pad      = n  => String(n).padStart(2,"0")
const toISO    = d  => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const todayISO = () => toISO(new Date())
const mk       = iso => iso.slice(0,7)

function fmtDate(iso, opts={weekday:"short",day:"numeric",month:"short"}) {
  return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",opts)
}
function fmtMonth(ym) {
  const [y,m]=ym.split("-")
  return new Date(y,m-1).toLocaleDateString("en-IN",{month:"long",year:"numeric"})
}
function calcMins(login,logout) {
  if (!login) return 0
  const [lh,lm]=login.split(":").map(Number)
  if (logout) { const [oh,om]=logout.split(":").map(Number); return Math.max(0,(oh*60+om)-(lh*60+lm)) }
  const n=new Date(); return Math.max(0,(n.getHours()*60+n.getMinutes())-(lh*60+lm))
}
function fmtDur(mins) {
  if (!mins||mins<=0) return "—"
  return `${Math.floor(mins/60)}h ${mins%60}m`
}
const isLate = t => !!t && t > OFFICE_START

function workingDaysSoFar(ym) {
  const [y,m]=ym.split("-").map(Number)
  const today=todayISO(), days=new Date(y,m,0).getDate(), res=[]
  for (let d=1;d<=days;d++) {
    const iso=`${y}-${pad(m)}-${pad(d)}`
    if (iso>today) break
    if (WORK_DAYS.includes(new Date(y,m-1,d).getDay())) res.push(iso)
  }
  return res
}

function exportCSV(reports,leaves) {
  const rows=[["Date","Employee","Status","Login","Logout","Hours","Late","Summary","Tasks","Task%"]]
  ;[...reports].sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{
    const done=((r.tasks||[]).filter(t=>t.status==="done")).length
    const tot=(r.tasks||[]).length
    rows.push([r.date,r.name,r.leave_type||"present",r.login_time||"",r.logout_time||"",
      fmtDur(calcMins(r.login_time,r.logout_time)),isLate(r.login_time)?"Yes":"No",
      `"${(r.summary||"").replace(/"/g,'""')}"`,
      `"${(r.tasks||[]).map(t=>`${t.text}[${t.status}]`).join("; ").replace(/"/g,'""')}"`,
      tot?`${Math.round((done/tot)*100)}%`:"—"
    ])
  })
  leaves.forEach(l=>rows.push([l.date,l.name,l.type,"","","","","","",""]))
  const a=document.createElement("a")
  a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"}))
  a.download=`teamtrack-${todayISO()}.csv`; a.click()
}

// ─── DESIGN ───────────────────────────────────────────────────────────────────
const C={primary:"#4F46E5",primary2:"#7C3AED",success:"#059669",warning:"#D97706",danger:"#DC2626",ink:"#0F172A",ink2:"#334155",muted:"#64748B",faint:"#94A3B8",line:"#E2E8F0",surface:"#F8FAFC",white:"#FFFFFF"}
const G={brand:`linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%)`,soft:`linear-gradient(135deg,#EEF2FF 0%,#F5F3FF 100%)`,teal:`linear-gradient(135deg,#0EA5E9 0%,#4F46E5 100%)`,canvas:`linear-gradient(160deg,#EEF2FF 0%,#F5F3FF 50%,#FAF5FF 100%)`}

// ─── AVATAR ───────────────────────────────────────────────────────────────────
const AV=[["#EDE9FE","#5B21B6"],["#FCE7F3","#9D174D"],["#DCFCE7","#15803D"],["#FEF9C3","#854D0E"],["#FFEDD5","#9A3412"],["#E0F2FE","#0369A1"],["#F0FDF4","#166534"],["#FEE2E2","#991B1B"]]
function avC(n){let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))&0xffff;return AV[h%AV.length]}
function Avatar({name,size=36}){
  const[bg,fg]=avC(name)
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:size*.38,flexShrink:0}}>{name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
const INP={width:"100%",padding:"10px 13px",border:`1.5px solid ${C.line}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.white,color:C.ink}
const LBL={display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}
const SM={done:{bg:"#DCFCE7",fg:"#15803D",dot:"#22C55E",label:"Done"},progress:{bg:"#FEF9C3",fg:"#854D0E",dot:"#EAB308",label:"In progress"},blocked:{bg:"#FEE2E2",fg:"#991B1B",dot:"#EF4444",label:"Blocked"}}
const LM={leave:{bg:"#EEF2FF",fg:C.primary,label:"On Leave"},sick:{bg:"#FEF2F2",fg:C.danger,label:"Sick"},wfh:{bg:"#ECFDF5",fg:C.success,label:"WFH"},halfday:{bg:"#FFF7ED",fg:C.warning,label:"Half Day"}}

function TaskBadge({status}){const s=SM[status]||SM.progress;return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:s.bg,color:s.fg,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,flexShrink:0}}><span style={{width:5,height:5,borderRadius:"50%",background:s.dot}}/>{s.label}</span>}
function LeavePill({type}){const s=LM[type]||{bg:"#F1F5F9",fg:C.muted,label:type};return <span style={{background:s.bg,color:s.fg,fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:99}}>{s.label}</span>}
function Toast({msg,type}){if(!msg)return null;return <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:type==="error"?"#FEF2F2":G.brand,color:type==="error"?C.danger:C.white,padding:"11px 24px",borderRadius:99,fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 8px 32px rgba(79,70,229,0.25)",pointerEvents:"none",whiteSpace:"nowrap"}}>{msg}</div>}
function Confirm({open,title,body,onYes,onNo}){
  if(!open)return null
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:24}}><div style={{background:C.white,borderRadius:16,padding:"28px 30px",maxWidth:400,width:"100%",boxShadow:"0 25px 60px rgba(0,0,0,0.18)"}}><h3 style={{margin:"0 0 8px",fontSize:17,fontWeight:700,color:C.ink}}>{title}</h3><p style={{margin:"0 0 22px",fontSize:14,color:C.muted,lineHeight:1.6}}>{body}</p><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button type="button" onClick={onNo} style={{padding:"9px 18px",border:`1.5px solid ${C.line}`,borderRadius:8,background:"none",cursor:"pointer",fontSize:14,color:C.muted,fontFamily:"inherit"}}>Cancel</button><button type="button" onClick={onYes} style={{padding:"9px 18px",border:"none",borderRadius:8,background:C.danger,color:C.white,cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>Delete</button></div></div></div>
}
function Modal({open,onClose,children,width=540}){
  useEffect(()=>{if(!open)return;const h=e=>{if(e.key==="Escape")onClose()};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)},[open,onClose])
  if(!open)return null
  return <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.4)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"36px 16px",overflowY:"auto",zIndex:100,backdropFilter:"blur(3px)"}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div style={{background:C.white,borderRadius:18,width:"100%",maxWidth:width,boxShadow:"0 30px 60px rgba(15,23,42,0.2)",overflow:"hidden"}}>{children}</div></div>
}
function Donut({pct,color,size=56,label}){
  const r=22,circ=2*Math.PI*r,dash=((pct||0)/100)*circ
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><svg width={size} height={size} viewBox="0 0 52 52"><circle cx="26" cy="26" r={r} fill="none" stroke="#F1F5F9" strokeWidth="6"/><circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 26 26)"/><text x="26" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>{pct||0}%</text></svg>{label&&<span style={{fontSize:10,color:C.faint,textAlign:"center"}}>{label}</span>}</div>
}
function BarChart({data}){
  if(!data?.length)return null
  const max=Math.max(...data.map(d=>d.value),1)
  return <div style={{display:"flex",flexDirection:"column",gap:6}}><div style={{display:"flex",alignItems:"flex-end",gap:5,height:72}}>{data.map((d,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span style={{fontSize:10,color:d.highlight?C.primary:C.faint,fontWeight:d.highlight?700:400}}>{d.value||""}</span><div style={{width:"100%",height:`${Math.max(6,(d.value/max)*56)}px`,background:d.highlight?G.brand:`${C.primary}25`,borderRadius:"5px 5px 0 0"}}/></div>)}</div><div style={{display:"flex",gap:5}}>{data.map((d,i)=><div key={i} style={{flex:1,fontSize:9,color:d.highlight?C.primary:C.faint,textAlign:"center",fontWeight:d.highlight?700:400}}>{d.label}</div>)}</div></div>
}
function PunchBar({loginTime,logoutTime}){
  if(!loginTime)return null
  const toPct=t=>{const[h,m]=t.split(":").map(Number);return Math.max(0,Math.min(100,((h*60+m-360)/960)*100))}
  const l=toPct(loginTime),now=new Date(),nowT=`${pad(now.getHours())}:${pad(now.getMinutes())}`
  const r=logoutTime?toPct(logoutTime):toPct(nowT),open=!logoutTime,lp=toPct(OFFICE_START)
  return <div style={{marginBottom:13}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.faint,marginBottom:5}}><span style={{color:isLate(loginTime)?C.danger:C.muted,fontWeight:600}}>{loginTime}{isLate(loginTime)&&" · late"}</span><span>{logoutTime||(open?"still in":"—")}</span></div><div style={{height:6,background:"#F1F5F9",borderRadius:99,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",left:`${lp}%`,top:0,bottom:0,width:1.5,background:"#FCA5A5",zIndex:2}}/><div style={{height:"100%",marginLeft:`${l}%`,width:`${Math.max(1,r-l)}%`,background:open?G.teal:G.brand,borderRadius:99}}/></div><div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#CBD5E1",marginTop:3}}><span>6:00</span><span style={{color:"#FCA5A5",fontWeight:600}}>9:30</span><span>22:00</span></div></div>
}

// ─── REPORT CARD ──────────────────────────────────────────────────────────────
function ReportCard({report,canEdit,isAdmin,onEdit,onDelete,onCheckout,compact=false}){
  const mins=calcMins(report.login_time,report.logout_time)
  const isOpen=!report.logout_time&&!report.leave_type
  const tasks=report.tasks||[]
  const done=tasks.filter(t=>t.status==="done").length
  const pct=tasks.length?Math.round((done/tasks.length)*100):null
  return(
    <div style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:13,padding:compact?"14px 16px":"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,0.05)"}}>
      <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:report.leave_type?0:13}}>
        <Avatar name={report.name} size={compact?34:40}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:compact?14:15,color:C.ink,display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
            {report.name}
            {report.leave_type&&<LeavePill type={report.leave_type}/>}
            {isLate(report.login_time)&&!report.leave_type&&<span style={{fontSize:11,background:"#FEF2F2",color:C.danger,padding:"2px 8px",borderRadius:99,fontWeight:700}}>Late</span>}
            {isOpen&&<span style={{fontSize:10,background:"#DCFCE7",color:"#15803D",padding:"2px 7px",borderRadius:99,fontWeight:700}}>● In office</span>}
          </div>
          <div style={{fontSize:11,color:C.faint,marginTop:2}}>{fmtDate(report.date)}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
          {!report.leave_type&&<div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:700,background:G.brand,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{fmtDur(mins)}</div>{pct!==null&&<div style={{fontSize:11,color:C.faint}}>{pct}% done</div>}</div>}
          {(canEdit||isAdmin)&&<div style={{display:"flex",gap:5}}><button type="button" onClick={()=>onEdit(report)} style={{background:C.surface,border:`1px solid ${C.line}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,color:C.muted,fontFamily:"inherit"}}>Edit</button>{isAdmin&&<button type="button" onClick={()=>onDelete(report)} style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,color:C.danger,fontFamily:"inherit"}}>Delete</button>}</div>}
          {canEdit&&isOpen&&<button type="button" onClick={()=>onCheckout(report)} style={{border:"none",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:11,color:C.white,fontWeight:700,background:G.brand,fontFamily:"inherit",whiteSpace:"nowrap"}}>⏱ Check out</button>}
        </div>
      </div>
      {!report.leave_type&&<>
        <PunchBar loginTime={report.login_time} logoutTime={report.logout_time}/>
        {report.summary&&<p style={{fontSize:13.5,lineHeight:1.65,color:C.ink2,margin:"0 0 11px",whiteSpace:"pre-wrap"}}>{report.summary}</p>}
        {tasks.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>{tasks.map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><TaskBadge status={t.status}/><span style={{color:t.status==="done"?C.faint:C.ink2,textDecoration:t.status==="done"?"line-through":"none"}}>{t.text}</span></div>)}</div>}
      </>}
    </div>
  )
}

// ─── REPORT FORM ──────────────────────────────────────────────────────────────
function ReportForm({open,onClose,onSave,existing,currentUser,prevTasks}){
  const blank={name:currentUser||"",date:todayISO(),login_time:"",logout_time:"",summary:"",tasks:[],leave_type:""}
  const[form,setForm]=useState(blank)
  const[saving,setSaving]=useState(false)
  const[err,setErr]=useState("")
  const[showCarry,setShowCarry]=useState(false)

  useEffect(()=>{
    if(!open)return
    setErr("")
    if(existing){
      setForm({...existing,tasks:(existing.tasks||[]).map(t=>({...t,_uid:t._uid||Math.random().toString(36).slice(2)}))})
      setShowCarry(false)
    } else {
      const carry=(prevTasks||[]).filter(t=>t.status!=="done").map(t=>({...t,_uid:Math.random().toString(36).slice(2),carriedOver:true,status:"progress"}))
      setForm({...blank,name:currentUser||"",tasks:carry})
      setShowCarry(carry.length>0)
    }
  },[open,existing,currentUser])

  const set=(k,v)=>setForm(f=>({...f,[k]:v}))
  const setT=(i,k,v)=>setForm(f=>{const t=[...f.tasks];t[i]={...t[i],[k]:v};return{...f,tasks:t}})
  const addT=()=>setForm(f=>({...f,tasks:[...f.tasks,{text:"",status:"progress",_uid:Date.now()+""}]}))
  const rmT=i=>setForm(f=>({...f,tasks:f.tasks.filter((_,j)=>j!==i)}))

  async function save(){
    if(!form.name){setErr("Please select your name.");return}
    if(!form.leave_type&&(!form.login_time||!form.summary.trim())){setErr("Fill in login time and work summary.");return}
    setSaving(true)
    await onSave({...form,tasks:form.tasks.filter(t=>t.text.trim()),id:existing?.id||`${form.name.toLowerCase().replace(/\s+/g,"_")}_${form.date}_${Date.now()}`})
    setSaving(false);onClose()
  }

  return(
    <Modal open={open} onClose={onClose}>
      <div style={{padding:"22px 26px 16px",background:G.soft,borderBottom:`1px solid ${C.line}`}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:"#1E1B4B"}}>{existing?"Edit report":"Log today's work"}</h2>
        <p style={{margin:"4px 0 0",fontSize:13,color:C.primary}}>Saved to your monthly record automatically.</p>
      </div>
      <div style={{padding:"20px 26px",maxHeight:"60vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
        {showCarry&&<div style={{background:"#EEF2FF",border:`1px solid #C7D2FE`,borderRadius:9,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:C.primary,fontWeight:500}}>↩ {form.tasks.length} unfinished task{form.tasks.length!==1?"s":""} carried from yesterday.</span><button type="button" onClick={()=>{setForm(f=>({...f,tasks:[]}));setShowCarry(false)}} style={{background:"none",border:"none",color:C.primary,cursor:"pointer",fontSize:12,fontWeight:600}}>Remove</button></div>}
        <div>
          <label style={LBL}>Status today</label>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {["present","leave","sick","wfh","halfday"].map(s=>{
              const active=(s==="present"&&!form.leave_type)||(form.leave_type===s)
              const labels={present:"Present",leave:"On Leave",sick:"Sick",wfh:"WFH",halfday:"Half Day"}
              return <button key={s} type="button" onClick={()=>set("leave_type",s==="present"?"":s)} style={{padding:"7px 14px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",border:"1.5px solid",borderColor:active?C.primary:C.line,background:active?G.brand:C.white,color:active?C.white:C.muted,fontFamily:"inherit"}}>{labels[s]}</button>
            })}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={LBL}>Name</label><input style={INP} value={form.name} readOnly placeholder="Your name"/></div>
          <div><label style={LBL}>Date</label><input type="date" style={INP} value={form.date} onChange={e=>set("date",e.target.value)}/></div>
        </div>
        {!form.leave_type&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={LBL}>Login time</label><input type="time" style={INP} value={form.login_time} onChange={e=>set("login_time",e.target.value)}/>{isLate(form.login_time)&&<p style={{margin:"4px 0 0",fontSize:11,color:C.danger,fontWeight:600}}>⚠ After 9:30 — marked late</p>}</div>
            <div><label style={LBL}>Logout time <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></label><input type="time" style={INP} value={form.logout_time} onChange={e=>set("logout_time",e.target.value)}/></div>
          </div>
          <div><label style={LBL}>Work summary</label><textarea style={{...INP,minHeight:80,resize:"vertical",lineHeight:1.55}} value={form.summary} onChange={e=>set("summary",e.target.value)} placeholder="What did you work on today?"/></div>
          <div>
            <label style={LBL}>Tasks</label>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {form.tasks.map((t,i)=><div key={t._uid||i} style={{display:"flex",gap:7,alignItems:"center"}}><input style={{...INP,flex:1}} value={t.text} onChange={e=>setT(i,"text",e.target.value)} placeholder={`Task ${i+1}`}/><select style={{...INP,width:120,flexShrink:0}} value={t.status} onChange={e=>setT(i,"status",e.target.value)}><option value="progress">In progress</option><option value="done">Done</option><option value="blocked">Blocked</option></select><button type="button" onClick={e=>{e.stopPropagation();rmT(i)}} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px",flexShrink:0}}>×</button></div>)}
              <button type="button" onClick={addT} style={{background:C.surface,border:`1.5px dashed ${C.line}`,borderRadius:8,padding:"9px 13px",cursor:"pointer",fontSize:13,color:C.primary,fontWeight:600,textAlign:"left",fontFamily:"inherit"}}>+ Add task</button>
            </div>
          </div>
        </>}
        {err&&<p style={{color:C.danger,fontSize:13,margin:0,fontWeight:500}}>{err}</p>}
      </div>
      <div style={{padding:"14px 26px",borderTop:`1px solid ${C.line}`,display:"flex",justifyContent:"flex-end",gap:10,background:C.surface}}>
        <button type="button" onClick={onClose} style={{padding:"10px 20px",border:`1.5px solid ${C.line}`,borderRadius:9,background:"none",cursor:"pointer",fontSize:14,color:C.muted,fontFamily:"inherit"}}>Cancel</button>
        <button type="button" onClick={save} disabled={saving} style={{padding:"10px 24px",border:"none",borderRadius:9,background:G.brand,color:C.white,cursor:"pointer",fontSize:14,fontWeight:700,opacity:saving?.7:1,fontFamily:"inherit"}}>{saving?"Saving…":existing?"Save changes":"Submit report"}</button>
      </div>
    </Modal>
  )
}

// ─── LEAVE FORM ───────────────────────────────────────────────────────────────
function LeaveForm({open,onClose,onSave,employees}){
  const[name,setName]=useState("");const[date,setDate]=useState(todayISO());const[type,setType]=useState("leave")
  async function save(){if(!name)return;await onSave({id:`lv_${name}_${date}_${Date.now()}`,name,date,type});setName("");onClose()}
  return(
    <Modal open={open} onClose={onClose} width={380}>
      <div style={{padding:"20px 24px 14px",background:G.soft,borderBottom:`1px solid ${C.line}`}}><h2 style={{margin:0,fontSize:18,fontWeight:800,color:"#1E1B4B"}}>Mark absence</h2></div>
      <div style={{padding:"18px 24px",display:"flex",flexDirection:"column",gap:12}}>
        <div><label style={LBL}>Employee</label><select style={INP} value={name} onChange={e=>setName(e.target.value)}><option value="">Select…</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
        <div><label style={LBL}>Date</label><input type="date" style={INP} value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div><label style={LBL}>Type</label><select style={INP} value={type} onChange={e=>setType(e.target.value)}><option value="leave">On Leave</option><option value="sick">Sick</option><option value="wfh">WFH</option><option value="halfday">Half Day</option></select></div>
      </div>
      <div style={{padding:"12px 24px",borderTop:`1px solid ${C.line}`,display:"flex",justifyContent:"flex-end",gap:10,background:C.surface}}>
        <button type="button" onClick={onClose} style={{padding:"9px 18px",border:`1.5px solid ${C.line}`,borderRadius:9,background:"none",cursor:"pointer",fontSize:14,color:C.muted,fontFamily:"inherit"}}>Cancel</button>
        <button type="button" onClick={save} style={{padding:"9px 20px",border:"none",borderRadius:9,background:G.brand,color:C.white,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit"}}>Save</button>
      </div>
    </Modal>
  )
}

// ─── EMP STATS ROW ────────────────────────────────────────────────────────────
function EmpRow({name,reps,lvs,wdCount}){
  const present=reps.filter(r=>!r.leave_type&&r.login_time).length
  const late=reps.filter(r=>isLate(r.login_time)&&!r.leave_type).length
  const totalMins=reps.reduce((s,r)=>s+calcMins(r.login_time,r.logout_time),0)
  const avgMins=present?Math.round(totalMins/present):0
  const allT=reps.flatMap(r=>r.tasks||[])
  const doneT=allT.filter(t=>t.status==="done").length
  const tPct=allT.length?Math.round((doneT/allT.length)*100):null
  const attPct=wdCount?Math.round(((present+lvs.length)/wdCount)*100):0
  return(
    <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.surface}`,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
      <Avatar name={name} size={40}/>
      <div style={{flex:1,minWidth:120}}>
        <div style={{fontWeight:700,fontSize:14,color:C.ink}}>{name}</div>
        <div style={{fontSize:12,color:C.faint,marginTop:2}}>{present}d present · {late>0&&<span style={{color:C.danger}}>{late} late · </span>}{lvs.length} leaves · avg {fmtDur(avgMins)}/day</div>
        {late>2&&<div style={{marginTop:5,background:"#FEF2F2",borderRadius:6,padding:"4px 9px",fontSize:11,color:C.danger,fontWeight:600,display:"inline-block"}}>⚠ Late {late}× this month</div>}
      </div>
      <div style={{display:"flex",gap:14,alignItems:"center"}}>
        <Donut pct={attPct} color={C.primary} size={54} label="Attendance"/>
        {tPct!==null&&<Donut pct={tPct} color={C.success} size={54} label="Tasks done"/>}
      </div>
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App(){
  const[employees,setEmployees]=useState([])
  const[reports,setReports]=useState([])
  const[leaves,setLeaves]=useState([])
  const[adminPin,setAdminPin]=useState("admin123")
  const[loading,setLoading]=useState(true)
  const[user,setUser]=useState(null)
  const[isAdmin,setAdmin]=useState(false)
  const[view,setView]=useState("today")
  const[selMonth,setSelMonth]=useState(mk(todayISO()))
  const[empFilter,setEmpFilter]=useState("")
  const[formOpen,setFormOpen]=useState(false)
  const[editRep,setEditRep]=useState(null)
  const[leaveOpen,setLeaveOpen]=useState(false)
  const[delTarget,setDelTarget]=useState(null)
  const[newEmp,setNewEmp]=useState("")
  const[pinInput,setPinInput]=useState("")
  const[pinOpen,setPinOpen]=useState(false)
  const[pinErr,setPinErr]=useState("")
  const[newPin,setNewPin]=useState("")
  const[toast,setToast]=useState({msg:"",type:"success"})

  const showToast=useCallback((msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:"success"}),2600)},[])

  // ── LOAD FROM SUPABASE ───────────────────────────────────────────────────
  useEffect(()=>{
    async function load(){
      const[{data:emps},{data:reps},{data:lvs},{data:sets}]=await Promise.all([
        supabase.from("employees").select("name").order("name"),
        supabase.from("reports").select("*").order("date",{ascending:false}),
        supabase.from("leaves").select("*").order("date",{ascending:false}),
        supabase.from("settings").select("*")
      ])
      setEmployees((emps||[]).map(e=>e.name))
      setReports(reps||[])
      setLeaves(lvs||[])
      const pinRow=(sets||[]).find(s=>s.key==="admin_pin")
      if(pinRow)setAdminPin(pinRow.value)
      setLoading(false)
    }
    load()
  },[])

  // ── REAL-TIME SUBSCRIPTIONS ──────────────────────────────────────────────
  useEffect(()=>{
    const repSub=supabase.channel("reports-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"reports"},payload=>{
        if(payload.eventType==="INSERT")setReports(r=>[payload.new,...r])
        if(payload.eventType==="UPDATE")setReports(r=>r.map(x=>x.id===payload.new.id?payload.new:x))
        if(payload.eventType==="DELETE")setReports(r=>r.filter(x=>x.id!==payload.old.id))
      }).subscribe()
    const lvSub=supabase.channel("leaves-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"leaves"},payload=>{
        if(payload.eventType==="INSERT")setLeaves(l=>[payload.new,...l])
        if(payload.eventType==="DELETE")setLeaves(l=>l.filter(x=>x.id!==payload.old.id))
      }).subscribe()
    const empSub=supabase.channel("employees-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"employees"},payload=>{
        if(payload.eventType==="INSERT")setEmployees(e=>[...e,payload.new.name].sort())
        if(payload.eventType==="DELETE")setEmployees(e=>e.filter(x=>x!==payload.old.name))
      }).subscribe()
    return()=>{repSub.unsubscribe();lvSub.unsubscribe();empSub.unsubscribe()}
  },[])

  // ── DERIVED ──────────────────────────────────────────────────────────────
  const todayISOf=todayISO()
  const todayReps=useMemo(()=>reports.filter(r=>r.date===todayISOf),[reports,todayISOf])
  const monthReps=useMemo(()=>reports.filter(r=>mk(r.date)===selMonth),[reports,selMonth])
  const monthLvs =useMemo(()=>leaves.filter(l=>mk(l.date)===selMonth),[leaves,selMonth])
  const myReps   =useMemo(()=>reports.filter(r=>r.name===user).sort((a,b)=>b.date.localeCompare(a.date)),[reports,user])
  const months   =useMemo(()=>{const s=new Set(reports.map(r=>mk(r.date)));s.add(mk(todayISOf));return Array.from(s).sort((a,b)=>b.localeCompare(a))},[reports,todayISOf])
  const todayIn  =new Set(todayReps.map(r=>r.name))
  const todayLv  =new Set(leaves.filter(l=>l.date===todayISOf).map(l=>l.name))
  const notYet   =employees.filter(e=>!todayIn.has(e)&&!todayLv.has(e))
  const myToday  =todayReps.find(r=>r.name===user)
  const wdSoFar  =useMemo(()=>workingDaysSoFar(selMonth),[selMonth])
  const chartData=useMemo(()=>wdSoFar.slice(-10).map(d=>({label:new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"}),value:reports.filter(r=>r.date===d&&!r.leave_type&&r.login_time).length,highlight:d===todayISOf})),[reports,wdSoFar,todayISOf])
  const prevTasks=useMemo(()=>{
    if(!user||isAdmin)return[]
    const yest=toISO(new Date(Date.now()-86400000))
    const r=reports.find(r=>r.name===user&&r.date===yest)
    return(r?.tasks||[]).filter(t=>t.status!=="done")
  },[reports,user,isAdmin])
  const grouped=useMemo(()=>{
    const base=(empFilter?monthReps.filter(r=>r.name===empFilter):monthReps).sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name))
    const m={};for(const r of base){if(!m[r.date])m[r.date]=[];m[r.date].push(r)}
    return Object.entries(m)
  },[monthReps,empFilter])

  // ── MUTATIONS ────────────────────────────────────────────────────────────
  async function saveReport(form){
    const payload={id:form.id,name:form.name,date:form.date,login_time:form.login_time||null,logout_time:form.logout_time||null,summary:form.summary||"",tasks:form.tasks||[],leave_type:form.leave_type||""}
    const exists=reports.some(r=>r.id===form.id)
    if(exists){await supabase.from("reports").update(payload).eq("id",form.id)}
    else{await supabase.from("reports").insert(payload)}
    // ensure employee exists
    if(!employees.includes(form.name)){await supabase.from("employees").insert({name:form.name})}
    showToast(exists?"Report updated ✓":"Report submitted! 🎉")
  }
  async function saveLeave(lv){
    await supabase.from("leaves").insert({id:lv.id,name:lv.name,date:lv.date,type:lv.type})
    showToast("Absence marked.")
  }
  async function doDelete(){
    const rep=delTarget;setDelTarget(null)
    await supabase.from("reports").delete().eq("id",rep.id)
    showToast("Report deleted.")
  }
  async function quickCheckout(rep){
    const n=new Date(),t=`${pad(n.getHours())}:${pad(n.getMinutes())}`
    await supabase.from("reports").update({logout_time:t}).eq("id",rep.id)
    showToast(`Checked out at ${t} ✓`)
  }
  async function addEmployee(){
    const name=newEmp.trim();if(!name)return
    if(employees.includes(name)){showToast("Already on the list.","error");return}
    await supabase.from("employees").insert({name})
    setNewEmp("");showToast(`${name} added.`)
  }
  async function removeEmployee(name){
    await supabase.from("employees").delete().eq("name",name)
    showToast(`${name} removed.`)
  }
  async function updatePin(){
    if(!newPin.trim())return
    await supabase.from("settings").update({value:newPin.trim()}).eq("key","admin_pin")
    setAdminPin(newPin.trim());setNewPin("");showToast("PIN updated ✓")
  }

  const NAV=[
    {id:"today",label:"Today"},
    {id:"monthly",label:"Monthly"},
    {id:"dashboard",label:"Dashboard"},
    ...(isAdmin?[{id:"manage",label:"Manage"}]:[])
  ]

  if(loading)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:G.canvas}}><div style={{textAlign:"center"}}><div style={{width:40,height:40,borderRadius:10,background:G.brand,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div style={{fontSize:14,color:C.muted}}>Loading TeamTrack…</div></div></div>

  // ── LOGIN ────────────────────────────────────────────────────────────────
  if(!user)return(
    <div style={{minHeight:"100vh",background:G.canvas,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.white,borderRadius:22,boxShadow:"0 24px 64px rgba(79,70,229,0.13)",padding:"44px 40px 36px",width:"100%",maxWidth:420}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <div style={{width:48,height:48,borderRadius:13,background:G.brand,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div><h1 style={{margin:0,fontSize:24,fontWeight:800,color:"#1E1B4B",letterSpacing:"-0.5px"}}>TeamTrack</h1><p style={{margin:0,fontSize:12,color:C.faint}}>Daily work · Attendance · Reports</p></div>
        </div>
        <label style={LBL}>Select your name to continue</label>
        {employees.length===0
          ?<div style={{padding:"18px",background:C.surface,borderRadius:10,fontSize:13,color:C.muted,textAlign:"center",marginBottom:16}}>No employees yet.<br/>Ask your admin to add names first.</div>
          :<select defaultValue="" onChange={e=>{if(e.target.value)setUser(e.target.value)}} style={{...INP,marginBottom:20,fontSize:15,appearance:"none",background:`${C.surface} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 13px center`}}>
            <option value="" disabled>— choose your name —</option>
            {employees.map(e=><option key={e} value={e}>{e}</option>)}
          </select>
        }
        <div style={{borderTop:`1px dashed ${C.line}`,paddingTop:16,textAlign:"center"}}><button type="button" onClick={()=>{setPinInput("");setPinErr("");setPinOpen(true)}} style={{background:"none",border:"none",color:C.primary,cursor:"pointer",fontSize:13,fontWeight:600}}>Admin login →</button></div>
      </div>
      <Modal open={pinOpen} onClose={()=>setPinOpen(false)} width={340}>
        <div style={{padding:"24px 26px"}}><h3 style={{margin:"0 0 4px",fontSize:17,fontWeight:700,color:C.ink}}>Admin access</h3><p style={{margin:"0 0 16px",fontSize:13,color:C.muted}}>Enter your admin PIN.</p><input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){if(pinInput===adminPin){setAdmin(true);setUser("Admin");setPinOpen(false)}else setPinErr("Incorrect PIN.")}}} placeholder="Admin PIN" style={{...INP,marginBottom:6}} autoFocus/>{pinErr&&<p style={{color:C.danger,fontSize:12,margin:"0 0 10px",fontWeight:600}}>{pinErr}</p>}<div style={{display:"flex",gap:9,marginTop:14}}><button type="button" onClick={()=>setPinOpen(false)} style={{flex:1,padding:"10px",border:`1.5px solid ${C.line}`,borderRadius:9,background:"none",cursor:"pointer",fontSize:14,fontFamily:"inherit",color:C.muted}}>Cancel</button><button type="button" onClick={()=>{if(pinInput===adminPin){setAdmin(true);setUser("Admin");setPinOpen(false)}else setPinErr("Incorrect PIN.")}} style={{flex:1,padding:"10px",border:"none",borderRadius:9,background:G.brand,color:C.white,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit"}}>Sign in</button></div></div>
      </Modal>
    </div>
  )

  // ── EMPLOYEE VIEW ────────────────────────────────────────────────────────
  if(!isAdmin)return(
    <div style={{minHeight:"100vh",background:G.canvas}}>
      <div style={{background:C.white,borderBottom:`1px solid ${C.line}`,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:720,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",gap:10,height:56}}>
          <div style={{width:28,height:28,borderRadius:7,background:G.brand,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
          <span style={{fontWeight:800,fontSize:14,color:"#1E1B4B"}}>TeamTrack</span>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:9}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",background:G.soft,borderRadius:99}}><Avatar name={user} size={22}/><span style={{fontSize:13,fontWeight:600,color:C.primary}}>{user}</span></div>
            <button type="button" onClick={()=>{setUser(null);setAdmin(false)}} style={{background:"none",border:`1.5px solid ${C.line}`,borderRadius:8,padding:"5px 11px",cursor:"pointer",fontSize:12,color:C.faint,fontFamily:"inherit"}}>Log out</button>
          </div>
        </div>
      </div>
      <div style={{maxWidth:720,margin:"0 auto",padding:"28px 20px 80px"}}>
        {/* Hero */}
        <div style={{background:G.brand,borderRadius:18,padding:"28px 28px 24px",marginBottom:20,color:C.white}}>
          <div style={{fontSize:13,opacity:.8,marginBottom:4}}>{fmtDate(todayISOf,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          <h2 style={{margin:"0 0 16px",fontSize:22,fontWeight:800,letterSpacing:"-0.4px"}}>Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}, {user.split(" ")[0]} 👋</h2>
          {myToday
            ?myToday.logout_time
              ?<div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"12px 16px",fontSize:14}}>✅ Report submitted. <strong>{fmtDur(calcMins(myToday.login_time,myToday.logout_time))}</strong> logged today.</div>
              :<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"12px 16px",fontSize:14,flex:1}}>⏱ Logged in at <strong>{myToday.login_time}</strong> — still in office.</div>
                <button type="button" onClick={()=>quickCheckout(myToday)} style={{border:"none",borderRadius:10,padding:"12px 18px",background:C.white,color:C.primary,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>Check out now</button>
              </div>
            :<button type="button" onClick={()=>{setEditRep(null);setFormOpen(true)}} style={{border:"none",borderRadius:10,padding:"13px 22px",background:C.white,color:C.primary,cursor:"pointer",fontSize:15,fontWeight:800,fontFamily:"inherit",display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>+</span>Log today's work</button>
          }
        </div>
        {/* My stats */}
        {(()=>{
          const myM=reports.filter(r=>r.name===user&&mk(r.date)===mk(todayISOf)&&!r.leave_type&&r.login_time)
          const wd=workingDaysSoFar(mk(todayISOf))
          const myL=leaves.filter(l=>l.name===user&&mk(l.date)===mk(todayISOf))
          const att=wd.length?Math.round(((myM.length+myL.length)/wd.length)*100):0
          const allT=myM.flatMap(r=>r.tasks||[])
          const tPct=allT.length?Math.round((allT.filter(t=>t.status==="done").length/allT.length)*100):null
          const avgM=myM.length?Math.round(myM.reduce((s,r)=>s+calcMins(r.login_time,r.logout_time),0)/myM.length):0
          return <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:22}}>
            {[{label:"Attendance this month",value:`${att}%`,color:C.primary},{label:"Avg hours / day",value:fmtDur(avgM)||"—",color:C.success},{label:"Tasks done",value:tPct!==null?`${tPct}%`:"—",color:C.warning}].map(s=><div key={s.label} style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div><div style={{fontSize:11,color:C.faint,marginTop:2}}>{s.label}</div></div>)}
          </div>
        })()}
        {/* Recent */}
        <div style={{marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{margin:0,fontSize:15,fontWeight:700,color:C.ink}}>Your recent reports</h3>
          {myToday&&<button type="button" onClick={()=>{setEditRep(myToday);setFormOpen(true)}} style={{background:"none",border:`1.5px solid ${C.line}`,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,color:C.muted,fontFamily:"inherit"}}>Edit today's</button>}
        </div>
        {myReps.length===0
          ?<div style={{textAlign:"center",padding:"48px 20px",background:C.white,borderRadius:13,border:`1px solid ${C.line}`,color:C.faint}}><div style={{fontSize:32,marginBottom:8}}>📋</div><div style={{fontSize:14,fontWeight:600,color:C.muted}}>No reports yet</div><div style={{fontSize:13,marginTop:4}}>Submit your first one above.</div></div>
          :<div style={{display:"flex",flexDirection:"column",gap:10}}>{myReps.slice(0,7).map(r=><ReportCard key={r.id} report={r} canEdit={true} isAdmin={false} onEdit={rep=>{setEditRep(rep);setFormOpen(true)}} onDelete={()=>{}} onCheckout={quickCheckout} compact/>)}</div>
        }
      </div>
      <ReportForm open={formOpen} onClose={()=>{setFormOpen(false);setEditRep(null)}} onSave={saveReport} existing={editRep} currentUser={user} prevTasks={prevTasks}/>
      <Toast msg={toast.msg} type={toast.type}/>
    </div>
  )

  // ── ADMIN VIEW ───────────────────────────────────────────────────────────
  const todayFiltered=empFilter?todayReps.filter(r=>r.name===empFilter):todayReps
  return(
    <div style={{minHeight:"100vh",background:C.surface}}>
      <div style={{background:C.white,borderBottom:`1px solid ${C.line}`,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:980,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",gap:8,height:56}}>
          <div style={{width:28,height:28,borderRadius:7,background:G.brand,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
          <span style={{fontWeight:800,fontSize:14,color:"#1E1B4B"}}>TeamTrack</span>
          <nav style={{display:"flex",gap:1,marginLeft:14}}>
            {NAV.map(n=><button key={n.id} type="button" onClick={()=>setView(n.id)} style={{padding:"6px 13px",border:"none",borderRadius:8,cursor:"pointer",fontSize:12.5,fontWeight:view===n.id?700:500,background:view===n.id?"#EEF2FF":"none",color:view===n.id?C.primary:C.muted,fontFamily:"inherit"}}>{n.label}</button>)}
          </nav>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <button type="button" onClick={()=>exportCSV(reports,leaves)} style={{padding:"6px 12px",border:`1.5px solid ${C.line}`,borderRadius:8,background:"none",cursor:"pointer",fontSize:12,color:C.muted,display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>
            <div style={{display:"flex",alignItems:"center",gap:7,padding:"4px 11px",background:G.soft,borderRadius:99}}><span style={{fontSize:10,background:G.brand,color:C.white,padding:"1px 7px",borderRadius:99,fontWeight:700}}>ADMIN</span></div>
            <button type="button" onClick={()=>{setUser(null);setAdmin(false);setView("today")}} style={{background:"none",border:`1.5px solid ${C.line}`,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,color:C.faint,fontFamily:"inherit"}}>Log out</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:980,margin:"0 auto",padding:"24px 20px 80px"}}>

        {view==="today"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:18}}>
            {[{label:"Checked in",value:todayReps.filter(r=>!r.leave_type).length,color:C.primary},{label:"Still in office",value:todayReps.filter(r=>!r.logout_time&&!r.leave_type).length,color:C.success},{label:"Late today",value:todayReps.filter(r=>isLate(r.login_time)&&!r.leave_type).length,color:C.danger},{label:"On leave/WFH",value:todayLv.size,color:C.warning},{label:"Not logged yet",value:notYet.length,color:C.faint}].map(s=><div key={s.label} style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:11,padding:"13px 14px"}}><div style={{fontSize:24,fontWeight:800,color:s.color}}>{s.value}</div><div style={{fontSize:11,color:C.faint,marginTop:1}}>{s.label}</div></div>)}
          </div>
          {notYet.length>0&&<div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",flexWrap:"wrap",gap:7}}><span style={{fontSize:12,fontWeight:700,color:"#92400E"}}>⏳ Pending:</span>{notYet.map(n=><span key={n} style={{fontSize:12,background:"#FEF9C3",color:"#92400E",padding:"2px 9px",borderRadius:99,fontWeight:600}}>{n}</span>)}</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.ink}}>{fmtDate(todayISOf,{weekday:"long",day:"numeric",month:"long"})}</h2>
              <select value={empFilter} onChange={e=>setEmpFilter(e.target.value)} style={{padding:"5px 10px",border:`1.5px solid ${C.line}`,borderRadius:8,fontSize:12,fontFamily:"inherit",outline:"none",color:C.muted}}><option value="">All employees</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}</select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button type="button" onClick={()=>setLeaveOpen(true)} style={{padding:"8px 15px",border:`1.5px solid ${C.line}`,borderRadius:9,background:C.white,cursor:"pointer",fontSize:13,color:C.muted,fontFamily:"inherit"}}>Mark absence</button>
              <button type="button" onClick={()=>{setEditRep(null);setFormOpen(true)}} style={{padding:"8px 18px",border:"none",borderRadius:9,background:G.brand,color:C.white,cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:15}}>+</span>Log work</button>
            </div>
          </div>
          {todayFiltered.length===0
            ?<div style={{textAlign:"center",padding:"56px 20px",color:C.faint,background:C.white,borderRadius:13,border:`1px solid ${C.line}`}}><div style={{fontSize:32,marginBottom:8}}>📋</div><div style={{fontSize:15,fontWeight:600,color:C.muted}}>No reports yet today</div></div>
            :<div style={{display:"flex",flexDirection:"column",gap:10}}>{todayFiltered.map(r=><ReportCard key={r.id} report={r} canEdit={false} isAdmin={true} onEdit={rep=>{setEditRep(rep);setFormOpen(true)}} onDelete={setDelTarget} onCheckout={quickCheckout}/>)}</div>
          }
        </>}

        {view==="monthly"&&<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            <select value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={{padding:"8px 13px",border:`1.5px solid ${C.line}`,borderRadius:9,fontSize:14,fontFamily:"inherit",outline:"none",background:C.white,color:C.ink,fontWeight:700}}>{months.map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}</select>
            <select value={empFilter} onChange={e=>setEmpFilter(e.target.value)} style={{padding:"8px 13px",border:`1.5px solid ${C.line}`,borderRadius:9,fontSize:13,fontFamily:"inherit",outline:"none",background:C.white,color:C.muted}}><option value="">All employees</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}</select>
            {empFilter&&<button type="button" onClick={()=>setEmpFilter("")} style={{background:"none",border:"none",color:C.primary,cursor:"pointer",fontSize:13,fontWeight:600}}>Clear ×</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:22}}>
            {[{label:"Total reports",value:monthReps.length,color:C.primary},{label:"Employees active",value:new Set(monthReps.map(r=>r.name)).size,color:C.success},{label:"Working days",value:new Set(monthReps.map(r=>r.date)).size,color:"#7C3AED"},{label:"Late arrivals",value:monthReps.filter(r=>isLate(r.login_time)&&!r.leave_type).length,color:C.danger},{label:"Leaves / WFH",value:monthLvs.length,color:C.warning}].map(s=><div key={s.label} style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:11,padding:"13px 14px"}}><div style={{fontSize:24,fontWeight:800,color:s.color}}>{s.value}</div><div style={{fontSize:11,color:C.faint,marginTop:1}}>{s.label}</div></div>)}
          </div>
          {grouped.length===0
            ?<div style={{textAlign:"center",padding:"56px 20px",color:C.faint,background:C.white,borderRadius:13,border:`1px solid ${C.line}`}}><div style={{fontSize:32,marginBottom:8}}>📅</div><div style={{fontSize:15,fontWeight:600,color:C.muted}}>No reports for {fmtMonth(selMonth)}</div></div>
            :grouped.map(([date,reps])=><div key={date} style={{marginBottom:22}}>
              <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,paddingBottom:7,borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:8}}>
                {fmtDate(date,{weekday:"long",day:"numeric",month:"short"})} <span style={{fontWeight:400}}>· {reps.length} report{reps.length!==1?"s":""}</span>
                {reps.filter(r=>isLate(r.login_time)&&!r.leave_type).length>0&&<span style={{fontSize:11,background:"#FEF2F2",color:C.danger,padding:"1px 8px",borderRadius:99,fontWeight:700}}>{reps.filter(r=>isLate(r.login_time)&&!r.leave_type).length} late</span>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>{reps.map(r=><ReportCard key={r.id} report={r} canEdit={false} isAdmin={true} onEdit={rep=>{setEditRep(rep);setFormOpen(true)}} onDelete={setDelTarget} onCheckout={quickCheckout}/>)}</div>
            </div>)
          }
        </>}

        {view==="dashboard"&&<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            <h2 style={{margin:0,fontSize:18,fontWeight:700,color:C.ink}}>Team Dashboard</h2>
            <select value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={{marginLeft:"auto",padding:"7px 12px",border:`1.5px solid ${C.line}`,borderRadius:9,fontSize:13,fontFamily:"inherit",outline:"none",background:C.white,color:C.ink,fontWeight:700}}>{months.map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}</select>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:14,padding:"20px 22px",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:14}}>Daily check-ins — last 10 working days</div>
            <BarChart data={chartData}/>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{padding:"15px 20px",borderBottom:`1px solid ${C.line}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:15,fontWeight:700,color:C.ink}}>Employee breakdown · {fmtMonth(selMonth)}</div><div style={{fontSize:12,color:C.faint}}>{wdSoFar.length} working days so far</div></div>
            {employees.length===0?<div style={{padding:"40px",textAlign:"center",color:C.faint,fontSize:14}}>No employees yet.</div>:employees.map(name=><EmpRow key={name} name={name} reps={monthReps.filter(r=>r.name===name)} lvs={monthLvs.filter(l=>l.name===name)} wdCount={wdSoFar.length}/>)}
          </div>
        </>}

        {view==="manage"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:18}}>
            <div style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:14,padding:"22px"}}><h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:C.ink}}>Add employee</h3><div style={{display:"flex",gap:9}}><input value={newEmp} onChange={e=>setNewEmp(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addEmployee()}} placeholder="Full name" style={{...INP,flex:1}}/><button type="button" onClick={addEmployee} style={{padding:"9px 18px",border:"none",borderRadius:9,background:G.brand,color:C.white,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>Add</button></div></div>
            <div style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:14,padding:"22px"}}><h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:C.ink}}>Change admin PIN</h3><div style={{display:"flex",gap:9}}><input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)} placeholder="New PIN" style={{...INP,flex:1}}/><button type="button" onClick={updatePin} style={{padding:"9px 18px",border:"none",borderRadius:9,background:G.brand,color:C.white,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit"}}>Update</button></div></div>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"15px 22px",borderBottom:`1px solid ${C.line}`}}><h3 style={{margin:0,fontSize:15,fontWeight:700,color:C.ink}}>Team · {employees.length} member{employees.length!==1?"s":""}</h3></div>
            {employees.length===0?<div style={{padding:"40px",textAlign:"center",color:C.faint,fontSize:14}}>No employees yet.</div>:employees.map((name,i)=>{const last=reports.filter(r=>r.name===name).sort((a,b)=>b.date.localeCompare(a.date))[0];return <div key={name} style={{display:"flex",alignItems:"center",gap:13,padding:"13px 22px",borderTop:i===0?"none":`1px solid ${C.surface}`}}><Avatar name={name} size={36}/><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14,color:C.ink}}>{name}</div><div style={{fontSize:12,color:C.faint}}>{last?`Last: ${fmtDate(last.date)}`:"No reports yet"} · {reports.filter(r=>r.name===name).length} total</div></div><button type="button" onClick={()=>removeEmployee(name)} style={{background:"none",border:"1px solid #FECACA",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,color:C.danger,fontFamily:"inherit"}}>Remove</button></div>})}
          </div>
          <div style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:14,padding:"22px"}}><h3 style={{margin:"0 0 6px",fontSize:15,fontWeight:700,color:C.ink}}>Backup &amp; Export</h3><p style={{fontSize:13,color:C.faint,margin:"0 0 16px",lineHeight:1.6}}>Download all reports and leave records as CSV. Open in Excel or Google Sheets for monthly review.</p><button type="button" onClick={()=>exportCSV(reports,leaves)} style={{padding:"11px 22px",border:"none",borderRadius:10,background:G.brand,color:C.white,cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:8,fontFamily:"inherit"}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download CSV backup</button></div>
        </>}

      </div>

      <ReportForm open={formOpen} onClose={()=>{setFormOpen(false);setEditRep(null)}} onSave={saveReport} existing={editRep} currentUser={null} prevTasks={[]}/>
      <LeaveForm open={leaveOpen} onClose={()=>setLeaveOpen(false)} onSave={saveLeave} employees={employees}/>
      <Confirm open={!!delTarget} title="Delete this report?" body={delTarget?`Permanently delete ${delTarget.name}'s report for ${fmtDate(delTarget.date)}. This cannot be undone.`:""} onYes={doDelete} onNo={()=>setDelTarget(null)}/>
      <Toast msg={toast.msg} type={toast.type}/>
    </div>
  )
}
