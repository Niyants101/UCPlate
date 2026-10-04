import {mkdir,rm,copyFile,writeFile} from 'node:fs/promises';
import {getDashboard} from '../menus.mjs';
import {getDaySchedule} from '../dining-hours.mjs';

const out=new URL('../dist/',import.meta.url);
const pages=new URL('../pages/',import.meta.url);
const today=new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/Los_Angeles',
  year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());

await rm(out,{recursive:true,force:true});
await mkdir(new URL('./data/',out),{recursive:true});

const first=await getDashboard(today);
const dates=[...new Set([today,...first.availableDates.filter(date=>date>=today)])].sort();
const data={
  generatedAt:new Date().toISOString(),
  timezone:'America/Los_Angeles',
  dates:{}
};

for(const date of dates){
  const dashboard=date===today?first:await getDashboard(date);
  data.dates[date]={
    fetchedAt:dashboard.fetchedAt,
    locations:dashboard.locations.map(location=>({
      id:location.id,
      name:location.name,
      sourceName:location.sourceName,
      status:location.status,
      message:location.message,
      source:location.source,
      meals:location.meals,
      schedule:getDaySchedule(date,location.id)
    }))
  };
}

const json=JSON.stringify(data);
await writeFile(new URL('./data/menus.json',out),json);
await mkdir(new URL('../data/',import.meta.url),{recursive:true});
await writeFile(new URL('../data/menus.json',import.meta.url),json);
await copyFile(new URL('index.html',pages),new URL('index.html',out));
await copyFile(new URL('app.js',pages),new URL('app.js',out));
await copyFile(new URL('style.css',pages),new URL('style.css',out));
await copyFile(new URL('../dining-hours.mjs',pages),new URL('dining-hours.mjs',out));
await writeFile(new URL('.nojekyll',out),'');
console.log(`Built GitHub Pages snapshot for ${dates.length} posted date(s) and ${first.locations.length} UCSC menu location(s).`);
