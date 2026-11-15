# Dev Run — مصدر النسخة المنشورة

المصدر: `incoming-games/Dev--Run.zip`، المجلد الداخلي `Dev--Run/`.
بصمة ZIP الأصلية SHA-256:

`FA3AF08F254156E342A118D4169F68A69A23702ED45E61535458CF2FA785073B`

الوجهة: `public/games/dev-run/`. فُحصت جميع مداخل ZIP ضد المسارات المطلقة والتجاوز، ونُسخت الملفات السبعة بقيمها الأصلية دون تعديل الأرشيف. طابقت بصمات النسخ جميع الأصول قبل تعديل JavaScript. README داخل مجلد اللعبة نسخة أصلية دون إضافات.

| الملف | SHA-256 من الأرشيف، وهي بصمة النسخة المنشورة قبل تعديل JavaScript | الحالة النهائية |
| --- | --- | --- |
| `index.html` | `6BA573F8EF4C62410F24657711B800202A6CCC686DF67F5788E09001561CB9BF` | مطابق |
| `script.js` | `903B7E0C039630279E3427A8B501E691FCB5571A2B35F91A37FA534400923D44` | معدّل للمنصة؛ البصمة أدناه |
| `style.css` | `BC36EF7C2711B17ED74F2CE266A55BD977E560D2C4B41C9B4F9A458E03D5BFD2` | مطابق |
| `README.md` | `964114A1A944C18839FD6A62A95387BC195327A7385ECFD3698FD7A0A4E24954` | مطابق |
| `assets/fonts/Tajawal-Regular.ttf` | `386997FCFCD22020B47265F9C02587791867E4DF5F74A36BE36AD6264A50D321` | مطابق |
| `assets/fonts/Tajawal-Bold.ttf` | `CA2C8CA040B6725B6B058C8470FE5BBF5C4C2B77356FE8C38C41716DECB206BD` | مطابق |
| `assets/fonts/Tajawal-ExtraBold.ttf` | `1FFC2AABC32F42BB20890337E932DACB897966B0DA0D46B08C9F6ADC5D268544` | مطابق |

بصمة `public/games/dev-run/script.js` بعد إضافة تكامل المنصة:

`45EF6E65E8E6240EED9D59EBD8EF46608BF12720E004C8167DADA32D77FD3E37`

تقتصر تغييرات JavaScript على مصافحة Dev Run والتحقق من رسالة الأب وربط النتيجة بالجلسة ومنع إعادة اللعب بعد الإكمال في وضع المنصة. بقيت HTML وCSS والخطوط وREADME مطابقة بايتًا للأرشيف.

قورنت 16 كتلة من المصدر الأصلي، منها CONFIG وQUIZ_QUESTIONS وcreateSession وScoreManager وRenderer وSoundManager وInputController، وبقيت مطابقة بعد توحيد نهايات الأسطر للمقارنة. لا تغيير للأسئلة أو الرسم أو الفيزياء أو البطاريات أو حساب النقاط أو مؤقت 120 ثانية.

ترويسة Access-Control-Allow-Origin الخاصة بملفات خطوط Dev Run العامة فقط مضبوطة في next.config.ts، للحفاظ على الخط الأصلي داخل iframe ذي أصل معتم؛ لا تضيف صلاحيات أصل أو تخزين أو وصول إلى المضيف.

التكامل محلي التحقق باستجابات API محاكية فقط؛ لا يُعد إثباتًا لاختبار Supabase أو نشر Staging.

التحقق النهائي للمرحلة 7B: نجح 61 اختبار Mock/QA و50 اختبار Live معترضًا، وفحص TypeScript دون إخراج ملفات، وبناءا الإنتاج المعزولان باستخدام webpack في Mock وLive بإعداد وهمي. تشمل المجموعتان 8 حالات أصل/بروتوكول خاصة بـDev Run و10 حالات رحلة Live خاصة بها. طابقت بصمات الملفات المحمية الأحد عشر لقطة ما قبل التنفيذ، بما فيها كامل incoming-games وESCAPE.EXE وnext-env.d.ts.
