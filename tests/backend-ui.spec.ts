
import {test,expect,type Page} from "@playwright/test";
const sid="00000000-0000-0000-0000-000000000001";
async function mockApi(page:Page,expire=false){
 const writes:string[]=[];let leaderboardCalls=0;
 await page.route("https://wjhbdtznydxozorfanrx.supabase.co/functions/v1/**",async route=>{
  const request=route.request();const path=new URL(request.url()).pathname.split("/functions/v1")[1];
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});
  if(path==="/access/verify")return respond({access_token:"fixture-token",token_type:"Bearer",expires_in:3600});
  expect(request.headers().authorization).toBe("Bearer fixture-token");
  if(request.method()==="POST")writes.push(path);
  if(path==="/students/login"||path==="/students/register")return respond({student:{id:sid,student_number:"00123",full_name:"مشارك فعلي للاختبار"}});
  if(path.endsWith("/progress"))return respond({student_id:sid,play_date:"2026-11-12",total_score:0,daily_slot_consumed:false,games:[1,2,3,4,5].map(id=>({id,name:"لعبة "+id,max_score:100,is_active:true,attempt:null,eligible_to_start:true}))});
  if(path==="/leaderboard"){
   if(expire&&leaderboardCalls++===0)return respond({error:{code:"invalid_platform_token"}},401);
   return respond({leaderboard:[{full_name:"اسم العرض",total_score:80,games_completed:1}]});
  }
  return respond({error:{code:"not_found"}},404);
 });
 return writes;
}
async function login(page:Page){
 await page.goto("/");await page.locator("#access-code").fill("entered-at-runtime");
 await page.getByRole("button",{name:"الدخول إلى البوث"}).click();
 await page.getByRole("button",{name:"تجهيز البوث",exact:true}).click();
}
test("live UI retrieves participant and eligibility but cannot consume attempts on QA assets",async({page})=>{
 const writes=await mockApi(page);await login(page);
 await expect(page.getByText("وضع العرض التجريبي",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"مشارك سابق",exact:true}).click();
 await page.locator("#participant-id").fill("00123");
 await page.getByRole("button",{name:"استرجاع المشارك",exact:true}).click();
 await expect(page.getByText("مشارك فعلي للاختبار",{exact:true})).toBeVisible();
 await page.getByRole("radio",{name:/لعبة 1/}).check();
 await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
 await expect(page.getByRole("button",{name:"ابدأ اللعب",exact:true})).toBeDisabled();
 expect(writes).toEqual(["/students/login"]);
 await expect(page.getByText("إعدادات العرض التجريبي",{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
 await page.screenshot({path:"tmp/qa/backend-participant.png",fullPage:true,caret:"initial"});
 await page.getByRole("button",{name:"قفل البوث"}).click();
 await expect(page.locator("#access-code")).toHaveValue("");
});
test("expired session renews in place and resumes the protected read",async({page})=>{
 await mockApi(page,true);await login(page);
 await page.getByRole("button",{name:"لوحة المتصدرين",exact:true}).click();
 await expect(page.getByRole("heading",{name:"انتهت جلسة البوث"})).toBeVisible();
 await page.locator("#renew-code").fill("operator-renewal");
 await page.getByRole("button",{name:"تجديد جلسة البوث"}).click();
 await expect(page.locator(".leaderboard-name h2")).toHaveText("اسم العرض");
 await expect(page.getByRole("dialog")).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
});
