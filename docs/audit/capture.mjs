import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.AUDIT_OUT ?? new URL('./', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
for (const [lang, width, height, theme] of [['ru',320,844,'light'],['en',320,844,'dark'],['ru',390,844,'light'],['en',390,844,'dark'],['ru',768,1000,'dark'],['en',768,1000,'light'],['ru',1440,1000,'light'],['en',1440,1000,'dark']]) {
 if (process.env.AUDIT_COMPACT === '1' && !((lang === 'ru' && width === 390) || (lang === 'en' && width === 1440))) continue;
 const context = await browser.newContext({ viewport: {width,height}, locale: lang === 'ru' ? 'ru-RU':'en-US', colorScheme: theme });
 const page = await context.newPage();
 const errors = []; const overflow = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('http://127.0.0.1:5174');
 const ru = lang === 'ru';
 await page.getByPlaceholder(ru?'Имя профиля':'Profile name').fill('Audit');
 await page.getByRole('button',{name:ru?'Новый профиль':'New profile',exact:true}).click();
 for(let i=0;i<4;i++) {
   if(i===1) await page.getByRole('checkbox',{name:ru?'Я проверил имя, пол, дату рождения и рост':'I checked my name, sex, birth date and height'}).check();
   await page.getByRole('button',{name:ru?'Далее':'Next',exact:true}).click();
 }
 await page.getByLabel(ru?'Стартовый вес':'Starting weight').fill('80');
 for(let i=0;i<2;i++) await page.getByRole('button',{name:ru?'Далее':'Next',exact:true}).click();
 await page.getByRole('button',{name:ru?'Готово':'Done',exact:true}).click();
 await page.getByRole('navigation').waitFor();
 if (process.env.AUDIT_PROFILE_TINT === 'b') {
   await page.evaluate(async () => {
     const profiles = JSON.parse(localStorage.getItem('lenta.profiles.v1'));
     profiles[0].tint = 'b';
     localStorage.setItem('lenta.profiles.v1', JSON.stringify(profiles));
     const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_')).name;
     await new Promise((resolve, reject) => {
       const request = indexedDB.open(name);
       request.onsuccess = () => {
         const db = request.result;
         const tx = db.transaction('body', 'readwrite');
         for (const [index, date] of ['2026-10-20', '2026-10-22', '2026-10-25'].entries()) {
           const at = new Date().toISOString();
           tx.objectStore('body').put({ id: `chart-fixture-${index}`, date, weightKg: 83 - index, createdAt: at, updatedAt: at });
         }
         tx.oncomplete = () => { db.close(); resolve(); };
         tx.onerror = () => reject(tx.error);
       };
       request.onerror = () => reject(request.error);
     });
   });
   await page.reload();
   await page.getByRole('navigation').waitFor();
 }
 await page.screenshot({path:`${out}/${lang}-${width}-today.png`,fullPage:false});
 for(const route of ['food','gym','body','progress','settings']) {
  await page.goto(`http://127.0.0.1:5174/#/${route}`);
  await page.waitForTimeout(700); await page.getByRole('navigation').waitFor({timeout:5000}).catch(async () => { console.log(JSON.stringify({route,lang,width,errors})); });
  await page.screenshot({path:`${out}/${lang}-${width}-${route}.png`,fullPage:false});
  if(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) overflow.push(route);
 }
 await page.goto('http://127.0.0.1:5174/#/');
 await page.getByRole('button',{name:ru?'Добавить еду':'Add food',exact:true}).click();
 await page.getByRole('button',{name:ru?'Быстро':'Quick',exact:true}).click();
 await page.getByLabel(ru?'Калории':'Calories',{exact:true}).fill('321');
 await page.getByRole('button',{name:ru?'Сохранить':'Save',exact:true}).click();
 await page.goto('http://127.0.0.1:5174/#/food');
 await page.getByRole('navigation').waitFor();
 await page.screenshot({path:`${out}/${lang}-${width}-food-populated.png`,fullPage:false});
 await page.goto('http://127.0.0.1:5174/#/gym');
 await page.getByRole('button',{name:ru?'Свободная тренировка':'Free workout',exact:true}).click();
 await page.getByRole('button',{name:ru?'Добавить упражнение':'Add exercise',exact:true}).click();
 await page.getByPlaceholder(ru?'Название упражнения':'Exercise name').fill('Barbell Squat');
 await page.getByRole('dialog').getByRole('button',{name:/Приседания со штангой|Barbell Squat/}).first().click();
 await page.getByLabel(ru?'Вес':'Weight',{exact:true}).first().fill('60.5');
 await page.getByLabel(ru?'Повторы':'Reps',{exact:true}).first().fill('8');
 await page.screenshot({path:`${out}/${lang}-${width}-active.png`,fullPage:false});
 if(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) overflow.push('active');
 results.push({lang,width,theme,errors,overflow});
 await context.close();
}
await browser.close();
await writeFile(`${out}/capture-results.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
