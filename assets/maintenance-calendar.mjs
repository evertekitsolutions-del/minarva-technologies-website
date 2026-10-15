export const INTERVAL_MONTHS=Object.freeze([1,2,3,4,6,12])
function parse(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value??'')))return null
 const [y,m,d]=value.split('-').map(Number)
 const dt=new Date(Date.UTC(y,m-1,d))
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?{y,m,d}:null
}
function format(d){return [d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')].join('-')}
export function addCalendarMonths(anchor,months){
 const p=parse(anchor)
 if(!p||!Number.isInteger(months)||months<0)throw Error('Invalid calendar anchor')
 const first=new Date(Date.UTC(p.y,p.m-1+months,1))
 const year=first.getUTCFullYear(),month=first.getUTCMonth()
 const max=new Date(Date.UTC(year,month+1,0)).getUTCDate()
 return format(new Date(Date.UTC(year,month,Math.min(max,p.d))))
}
export function maintenancePreview({firstVisitOn,startsOn,endsOn,intervalMonths,activeOn=null,asOf=null,horizonDays=45}){
 if(!INTERVAL_MONTHS.includes(Number(intervalMonths)))return []
 if(!parse(firstVisitOn)||!parse(startsOn)||!parse(endsOn))return []
 const anchor=parse(asOf)||parse(startsOn)
 const upperCandidate=format(new Date(Date.UTC(anchor.y,anchor.m-1,anchor.d)+horizonDays*86400000))
 const upper=endsOn<upperCandidate?endsOn:upperCandidate
 const floor=[startsOn,activeOn,asOf].filter(x=>parse(x)).sort().at(-1)
 const dates=[]
 for(let n=0;n<=120;n++){
  const due=addCalendarMonths(firstVisitOn,n*Number(intervalMonths))
  if(due>upper)break
  if(due>=floor)dates.push(due)
 }
 return dates
}
