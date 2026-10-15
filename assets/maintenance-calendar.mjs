// Pure calendar helper: matches SQL anchor-date month addition, including
// last-day-of-month clamping. No network calls or production data.
export const INTERVAL_MONTHS=Object.freeze([1,2,3,4,6,12])
const parseDate=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value??'')))return null
 const [y,m,d]=value.split('-').map(Number)
 const stamp=new Date(Date.UTC(y,m-1,d))
 if(stamp.getUTCFullYear()!==y||stamp.getUTCMonth()!==m-1||stamp.getUTCDate()!==d)return null
 return {y,m,d}
}
const dateKey=date=>[date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-')
export function addCalendarMonths(anchor,months){
 const p=parseDate(anchor)
 if(!p||!Number.isInteger(months)||months<0)throw Error('Invalid maintenance calendar anchor')
 const start=new Date(Date.UTC(p.y,p.m-1+months,1))
 const y=start.getUTCFullYear(),m=start.getUTCMonth()
 const maxDay=new Date(Date.UTC(y,m+1,0)).getUTCDate()
 return dateKey(new Date(Date.UTC(y,m,Math.min(maxDay,p.d))))
}
export function maintenancePreview({firstVisitOn,startsOn,endsOn,intervalMonths,activeOn=null,asOf=null,horizonDays=45}){
 if(!INTERVAL_MONTHS.includes(Number(intervalMonths)))return []
 if(!parseDate(firstVisitOn)||!parseDate(startsOn)||!parseDate(endsOn))return []
 const start=parseDate(activeOn)?activeOn:startsOn
 const floor=[startsOn,start,asOf].filter(x=>parseDate(x)).sort().at(-1)
 const date=new Date(Date.UTC(...[...asOf?Object.values(parseDate(asOf)):Object.values(parseDate(startsOn))].map((v,i)=>i===1?v-1:v)))
 const ceiling=dateKey(new Date(date.getTime()+horizonDays*86400000))
 const upper=endsOn<ceiling?endsOn:ceiling
 const dates=[]
 for(let n=0;n<=120;n++){
  const due=addCalendarMonths(firstVisitOn,n*Number(intervalMonths))
  if(due>upper)break
  if(due>=floor)dates.push(due)
 }
 return dates
}
