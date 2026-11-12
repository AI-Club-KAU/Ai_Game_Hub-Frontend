# نشر Frontend على Dokploy

الصورة تحتوي Next.js والملفات العامة فقط. Backend يبقى على Supabase؛ لا نحتاج Docker Compose أو قاعدة بيانات داخل الحاوية.

## إعداد Application

1. أنشئ Application واربط مستودع الواجهة والفرع المطلوب.
2. اختر Build Type: Dockerfile.
3. إذا Dockerfile وpackage.json في جذر المستودع: Dockerfile Path = Dockerfile وBuild Context = . والمرحلة النهائية runner (أو Target فارغ).
4. إذا المشروع داخل مجلد فرعي في المستودع، استخدم مجلد الواجهة كسياق بناء وعدّل مسار Dockerfile بحسب موقعه.
5. في Environment → Build Time Arguments أدخل:

~~~dotenv
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_BASE_URL=https://wjhbdtznydxozorfanrx.supabase.co/functions/v1
~~~

القيم نفسها موجودة افتراضيًا في Dockerfile. متغيرات NEXT_PUBLIC عامة وتُثبت أثناء build. تغيير Runtime Environment وحده لا يغيّر عنوان API في المتصفح؛ أعد البناء والنشر عند تغييرها.

لا تحتاج متغيرات Runtime إضافية؛ الصورة تضبط NODE_ENV=production وPORT=3000 وHOSTNAME=0.0.0.0. لا تضع SUPABASE_SERVICE_ROLE_KEY أو PLATFORM_ACCESS_CODE أو signing secret في التطبيق أو build arguments. رمز البوث يُدخل في شاشة الدخول.

6. في Domains اختر Container Port = 3000 ومسار /. وجّه DNS إلى خادم Dokploy وفعّل HTTPS. لا حاجة لكشف منفذ 3000 مباشرة للإنترنت مع توجيه الدومين.
7. انشر، وراجع Build Logs ثم تحميل الصفحة وملفات CSS/JS، وجرّب الدخول برمز البوث الحقيقي.

## الاختبار عند توفر Docker

~~~sh
docker build -t ai-club-games-hub .
docker run --rm -p 3000:3000 --name ai-club-games-hub ai-club-games-hub
~~~

افتح http://localhost:3000. يمكن تمرير القيم العامة باستخدام --build-arg أثناء docker build.

Dockerfile متعدد المراحل: Node 24 وpnpm 11.25.0 وتثبيت frozen-lockfile. التشغيل بمستخدم node غير root عبر server.js مستقل. تُنسخ public و.next/static مع خادم standalone. تستبعد .dockerignore ملفات البيئة والمخرجات المحلية.

BUILD_STANDALONE=true إعداد داخلي في Dockerfile؛ لا تحتاج إضافته في Dokploy. فحص صحة الحاوية يتحقق من الصفحة فقط، وليس نجاح المصادقة أو Supabase.

## حدود النسخة

ملفات الألعاب الحقيقية وجدول الأقسام لم تكتمل؛ النشر لا يفعّل الألعاب التجريبية على بيانات حقيقية. جلسة البوث في ذاكرة المتصفح وتحتاج تحققًا عند تحديث الصفحة.

## مراجع

- https://docs.dokploy.com/docs/core/applications/build-type
- https://docs.dokploy.com/docs/core/applications
- دليل output المرفق مع نسخة Next.js المثبتة.

## نتيجة التحقق المحلي

نجح بناء standalone وفحص TypeScript، وتشغيل server.js على منفذ اختبار 3100؛ الصفحة وملف CSS وأصل public أعادت HTTP 200. أُوقف خادم الاختبار بعد التحقق. Docker غير مثبت على هذا الجهاز، لذلك لم تُبنَ صورة Docker أو تُختبر الحاوية محليًا؛ أول تحقق للصورة سيكون في Dokploy أو جهاز عليه Docker.
