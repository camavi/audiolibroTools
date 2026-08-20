import '../../../css/activity.css';
const data=_.rod(null), loading=_.rod(true), status=_.rod(null), period=_.rod('28'), book=_.rod('');
const unwrap=p=>p?.data?.data||p?.data||p||{}; const num=n=>new Intl.NumberFormat().format(Number(n||0));
async function load(){loading.value=true;try{const q=new URLSearchParams({period:period.value});if(book.value)q.set('book',book.value);data.value=unwrap(await _.http.getJSON(`/dashboard/api/activity?${q}`));}catch(e){status.value={type:'danger',message:e.message||'Unable to load book activity.'};}finally{loading.value=false;}}
function stat(icon,value,label,note){return _.div({class:'at-activityStat'},_.Icon({name:icon}),_.div(_.strong(()=>num(value())),_.span(label),_.small(note)));}
function chart(){const rows=data.value?.trend||[],max=Math.max(1,...rows.map(r=>r.plays));return _.div({class:'at-activityChart'},rows.map(row=>_.div({class:'at-activityBar',title:`${row.date}: ${row.plays} plays`},_.i({style:{height:`${Math.max(2,row.plays/max*100)}%`}}))),_.div({class:'at-activityChartLabels'},_.span('Start'),_.span('Today')));}
export default function activityPage(){
    load();
    return _.main({class:'at-activityPage'},
        _.section({class:'at-activityHero'},_.div(_.span('Book analytics'),_.h2('Activity overview'),_.p('Monitor audience reach, listening behavior and engagement across every connected publication channel.')),_.Btn({color:'secondary',icon:'refresh',onClick:load},'Refresh')),
        ()=>status.value?_.Alert(status.value):null,
        ()=>{
            if(loading.value)return _.div({class:'at-activityLoading'},'Loading activity…');
            if(!data.value)return null;
            return _.div({class:'at-activityWorkspace'},
                _.section({class:'at-activityFilters'},_.Select({label:'Book',model:book,options:()=>[{value:'',label:'All books'},...(data.value.books||[]).map(b=>({value:b.key,label:b.name}))],onChange:load}),_.Select({label:'Period',model:period,options:[{value:'7',label:'Last 7 days'},{value:'28',label:'Last 28 days'},{value:'90',label:'Last 90 days'}],onChange:load})),
                _.section({class:'at-activityStats'},stat('headphones',()=>data.value.summary.plays,'Plays','Across selected period'),stat('people',()=>data.value.summary.listeners,'Listeners','Provider-reported audience'),stat('task_alt',()=>`${data.value.summary.completion_rate}%`,'Completion','Plays completed'),stat('share',()=>data.value.summary.shares,'Shares','Audience sharing'),stat('schedule',()=>data.value.summary.listening_hours,'Listening hours','Time spent listening'),stat('payments',()=>`€${(data.value.summary.revenue_cents/100).toFixed(2)}`,'Revenue','Reported channel revenue')),
                _.section({class:'at-activityTrend'},_.div({class:'at-activityCardHead'},_.div(_.span('Audience trend'),_.h3('Plays over time')),_.small('Daily totals')),()=>chart()),
                _.section({class:'at-activityBooks'},_.div({class:'at-activityCardHead'},_.div(_.span('Published catalogue'),_.h3('Performance by book')),_.small('Metrics arrive from connected providers')),()=>data.value.books_activity?.length?_.div({class:'at-activityTable'},...data.value.books_activity.map(item=>_.div({class:'at-activityRow'},_.div({class:'at-activityBook'},item.cover_img?_.img({src:item.cover_img,alt:''}):_.span({class:'at-activityCover'},_.Icon({name:'menu_book'})),_.strong(item.name)),_.span(`${num(item.plays)} plays`),_.span(`${num(item.listeners)} listeners`),_.span(`${item.completion_rate}% complete`),_.span(`${num(item.shares)} shares`),_.strong(`€${(item.revenue_cents/100).toFixed(2)}`)))):_.div({class:'at-activityEmpty'},_.Icon({name:'insights'}),_.div(_.strong('No activity data yet'),_.span('Publish a book and connect a reporting provider to start receiving verified metrics.'))))
            );
        }
    );
}
